import type { LyricLine, LyricWord, Lyrics, Song } from "../types";
import { artistText, emptyLyrics, emptySong } from "../types";
import { fmtLrcTime, fmtSplTime } from "./utils";

const META_RE =
  /^\[(ti|ar|al|by|offset|re|ve|length|kana|language):([^\]]*)\]\s*$/i;
const TIMESTAMP_SOURCE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG_SOURCE = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const YRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
const YRC_WORD_RE = /\((\d+),(\d+),\d+\)(.*?)(?=\(\d+,\d+,\d+\)|$)/gs;
const QRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
const QRC_WORD_RE = /(.*?)\((\d+),(\d+)\)/gs;
const QRC_XML_RE = /<Lyric_1[^>]*?LyricContent="(.*?)"\s*\/>/s;

function toMs(minutes: string, seconds: string, fraction?: string): number {
  let millis = 0;
  if (fraction) {
    if (fraction.length === 1) millis = Number(fraction) * 100;
    else if (fraction.length === 2) millis = Number(fraction) * 10;
    else millis = Number(fraction.slice(0, 3));
  }
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + millis;
}

function cleanText(value: string): string {
  return value.replace(/\r/g, "").replace(/\u200b/g, "").trim();
}

function dedupeLines(lines: LyricLine[]): LyricLine[] {
  const seen = new Set<string>();
  const result: LyricLine[] = [];
  for (const line of [...lines].sort(
    (left, right) => left.startMs - right.startMs || left.endMs - right.endMs,
  )) {
    const key = `${line.startMs}\0${line.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}

function applyOffset(lines: LyricLine[], offsetMs: number): LyricLine[] {
  if (!offsetMs) return lines;
  for (const line of lines) {
    line.startMs = Math.max(0, line.startMs - offsetMs);
    line.endMs = Math.max(line.startMs, line.endMs - offsetMs);
    for (const word of line.words) {
      word.startMs = Math.max(0, word.startMs - offsetMs);
      word.endMs = Math.max(word.startMs, word.endMs - offsetMs);
    }
  }
  return dedupeLines(lines);
}

function newLine(startMs: number, endMs = 0, text = ""): LyricLine {
  return {
    startMs,
    endMs,
    text,
    words: [],
    translation: "",
    romanization: "",
  };
}

function fillLineEnds(lines: LyricLine[]): void {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startMs <= 0 && line.endMs <= 0) continue;
    if (line.endMs <= line.startMs) {
      const next = lines[index + 1];
      line.endMs = next
        ? Math.max(line.startMs + 500, next.startMs)
        : line.startMs + Math.max(2000, Array.from(line.text).length * 120);
    }
  }
}

function sanitizeWordTimes(lines: LyricLine[]): void {
  for (const line of lines) {
    if (!line.words.length) continue;
    const words = [...line.words].sort(
      (left, right) => left.startMs - right.startMs,
    );
    let cursor = Math.max(0, line.startMs);
    for (const word of words) {
      word.startMs = Math.max(cursor, Math.trunc(word.startMs), line.startMs);
      word.endMs = Math.max(word.endMs, word.startMs + 40);
      cursor = word.endMs;
    }
    line.words = words;
    line.endMs = Math.max(line.endMs, words[words.length - 1].endMs);
  }
}

export function parseLrc(
  text: string,
  options: { song?: Song; applyOffset?: boolean } = {},
): Lyrics {
  const song = options.song ?? emptySong();
  if (!text) return emptyLyrics(song);
  const raw = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\uFEFF/, "");
  let offset = 0;
  let lines: LyricLine[] = [];
  let wordLevel = false;

  for (const rawLine of raw.split("\n")) {
    const stripped = rawLine.trim();
    if (!stripped) continue;
    const meta = stripped.match(META_RE);
    if (meta) {
      if (meta[1].toLowerCase() === "offset") {
        offset = Number.parseInt(meta[2].trim(), 10) || 0;
      }
      continue;
    }

    const timestampRegex = new RegExp(TIMESTAMP_SOURCE.source, "g");
    const matches = Array.from(stripped.matchAll(timestampRegex));
    if (!matches.length) continue;

    let contentStart = 0;
    const starts: number[] = [];
    for (const match of matches) {
      if (match.index !== contentStart) break;
      starts.push(toMs(match[1], match[2], match[3]));
      contentStart = (match.index ?? 0) + match[0].length;
      while (stripped[contentStart] === " ") contentStart += 1;
    }
    if (!starts.length) continue;

    const content = stripped.slice(contentStart);
    const wordMatches = Array.from(
      content.matchAll(new RegExp(WORD_TAG_SOURCE.source, "g")),
    );
    let words: LyricWord[] = [];
    let textOnly = "";
    if (wordMatches.length) {
      let lastEnd = 0;
      for (const match of wordMatches) {
        const index = match.index ?? 0;
        if (words.length) {
          words[words.length - 1].text = content.slice(lastEnd, index);
        }
        const start = toMs(match[1], match[2], match[3]);
        words.push({ startMs: start, endMs: start, text: "" });
        lastEnd = index + match[0].length;
      }
      words[words.length - 1].text = content.slice(lastEnd);
      words = words.filter((word) => word.text || word.startMs);
      for (let index = 0; index < words.length; index += 1) {
        words[index].endMs =
          words[index + 1]?.startMs ?? words[index].startMs;
      }
      textOnly = words.map((word) => word.text).join("").trim();
      wordLevel =
        wordLevel ||
        words.filter((word) => word.text.trim()).length >= 2;
    } else {
      textOnly = cleanText(content);
    }

    for (const start of starts) {
      const line = newLine(start, words.length ? words.at(-1)!.endMs : 0, textOnly);
      if (words.length) {
        line.words = words.map((word) => ({ ...word }));
      }
      lines.push(line);
    }
  }

  lines = dedupeLines(lines);
  if (options.applyOffset !== false && offset) {
    lines = applyOffset(lines, offset);
  }
  fillLineEnds(lines);
  if (wordLevel) sanitizeWordTimes(lines);
  return {
    ...emptyLyrics(song),
    lines,
    wordLevel,
    rawLrc: raw,
  };
}

export function parseYrc(text: string, song: Song = emptySong()): Lyrics {
  if (!text) return emptyLyrics(song);
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let wordLevel = false;
  let lines: LyricLine[] = [];
  for (const rawLine of raw.split("\n")) {
    const match = rawLine.trim().match(YRC_LINE_RE);
    if (!match) continue;
    const start = Number(match[1]);
    const duration = Number(match[2]);
    const words: LyricWord[] = [];
    for (const wordMatch of match[3].matchAll(YRC_WORD_RE)) {
      const wordStart = Number(wordMatch[1]);
      const wordDuration = Number(wordMatch[2]);
      const wordText = wordMatch[3].replace(/\r/g, "");
      if (!wordText && !wordDuration) continue;
      words.push({
        startMs: wordStart,
        endMs: wordStart + wordDuration,
        text: wordText,
      });
    }
    const textOnly = words.length
      ? words.map((word) => word.text).join("").trim()
      : cleanText(match[3]);
    if (words.filter((word) => word.text.trim()).length >= 2) {
      wordLevel = true;
    }
    lines.push({
      ...newLine(start, start + duration, textOnly),
      words,
    });
  }
  lines = dedupeLines(lines);
  fillLineEnds(lines);
  if (wordLevel) sanitizeWordTimes(lines);
  return { ...emptyLyrics(song), lines, wordLevel };
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseQrc(text: string, song: Song = emptySong()): Lyrics {
  if (!text) return emptyLyrics(song);
  const xmlMatch = text.match(QRC_XML_RE);
  if (!xmlMatch) return parseLrc(text, { song });
  const content = unescapeHtml(xmlMatch[1])
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  let wordLevel = false;
  let lines: LyricLine[] = [];
  for (const rawLine of content.split("\n")) {
    const match = rawLine.trim().match(QRC_LINE_RE);
    if (!match) continue;
    const start = Number(match[1]);
    const duration = Number(match[2]);
    const words: LyricWord[] = [];
    for (const wordMatch of match[3].matchAll(QRC_WORD_RE)) {
      const wordText = wordMatch[1].replace(/\r/g, "");
      const wordStart = Number(wordMatch[2]);
      const wordDuration = Number(wordMatch[3]);
      if (!wordText && !wordDuration) continue;
      words.push({
        startMs: wordStart,
        endMs: wordStart + wordDuration,
        text: wordText,
      });
    }
    const textOnly = words.length
      ? words.map((word) => word.text).join("").trim()
      : cleanText(match[3]);
    if (words.filter((word) => word.text.trim()).length >= 2) {
      wordLevel = true;
    }
    lines.push({
      ...newLine(start, start + duration, textOnly),
      words,
    });
  }
  lines = dedupeLines(lines);
  fillLineEnds(lines);
  if (wordLevel) sanitizeWordTimes(lines);
  return {
    ...emptyLyrics(song),
    lines,
    wordLevel,
    rawExtra: content,
  };
}

export function translationTimes(text: string): Map<number, string> {
  const result = new Map<number, string>();
  if (!text) return result;
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const stripped = rawLine.trim();
    if (!stripped || META_RE.test(stripped)) continue;
    const matches = Array.from(
      stripped.matchAll(new RegExp(TIMESTAMP_SOURCE.source, "g")),
    );
    if (!matches.length) continue;
    const first = matches[0];
    const start = toMs(first[1], first[2], first[3]);
    const content = stripped
      .slice((first.index ?? 0) + first[0].length)
      .trim();
    if (content) result.set(start, content);
  }
  return result;
}

function nearest(mapping: Map<number, string>, when: number): string {
  let nearestTime = -1;
  let value = "";
  for (const [time, text] of mapping) {
    if (nearestTime < 0 || Math.abs(time - when) < Math.abs(nearestTime - when)) {
      nearestTime = time;
      value = text;
    }
  }
  return nearestTime >= 0 && Math.abs(nearestTime - when) <= 800 ? value : "";
}

export function mergeTranslation(
  lyrics: Lyrics,
  transText = "",
  romanText = "",
): Lyrics {
  const trans = translationTimes(transText);
  const roman = translationTimes(romanText);
  if (!trans.size && !roman.size) return lyrics;
  for (const line of lyrics.lines) {
    line.translation = nearest(trans, line.startMs);
    line.romanization = nearest(roman, line.startMs);
  }
  lyrics.hasTranslation = lyrics.lines.some((line) => line.translation);
  lyrics.hasRomanization = lyrics.lines.some((line) => line.romanization);
  return lyrics;
}

export function mergeFieldByTime(
  lyrics: Lyrics,
  other: Lyrics,
  field: "translation" | "romanization" = "translation",
): Lyrics {
  for (const sourceLine of other.lines) {
    const text = sourceLine.text.trim();
    if (!text || text === "//" || !lyrics.lines.length) continue;
    const target = lyrics.lines.reduce((best, line) =>
      Math.abs(line.startMs - sourceLine.startMs) <
      Math.abs(best.startMs - sourceLine.startMs)
        ? line
        : best,
    );
    if (Math.abs(target.startMs - sourceLine.startMs) <= 800) {
      target[field] = text;
    }
  }
  lyrics.hasTranslation = lyrics.lines.some((line) => line.translation);
  lyrics.hasRomanization = lyrics.lines.some((line) => line.romanization);
  return lyrics;
}

export function formatLrc(
  lyrics: Lyrics,
  options: {
    includeTranslation?: boolean;
    enhanced?: boolean;
    metadata?: boolean;
  } = {},
): string {
  const includeTranslation = options.includeTranslation ?? true;
  const enhanced = options.enhanced ?? false;
  const metadata = options.metadata ?? true;
  const output: string[] = [];
  const song = lyrics.song;
  if (metadata && song.title) {
    const tag = (key: string, value: string) => {
      if (value) output.push(`[${key}:${value.replace(/]/g, "").trim()}]`);
    };
    tag("ti", song.title);
    tag("ar", artistText(song) === "未知歌手" ? "" : artistText(song));
    tag("al", song.album);
    tag("by", "MiSideTag");
    tag("offset", "0");
  }

  for (const line of [...lyrics.lines].sort(
    (left, right) => left.startMs - right.startMs,
  )) {
    const stamp = enhanced ? fmtSplTime(line.startMs) : fmtLrcTime(line.startMs);
    const text = line.text.trim();
    const wordCount = line.words.filter((word) => word.text.trim()).length;
    if (enhanced && wordCount >= 2) {
      const words = [...line.words].sort(
        (left, right) => left.startMs - right.startMs,
      );
      const segments: string[] = [];
      let lastStart = line.startMs;
      let firstWritten = false;
      for (const word of words) {
        const wordText = word.text.replace(/[\r\n]/g, " ");
        if (!wordText) continue;
        let wordStart = Math.max(Math.trunc(word.startMs), lastStart);
        if (!firstWritten) {
          segments.push(wordText);
          firstWritten = true;
        } else {
          if (wordStart <= lastStart) wordStart = lastStart + 1;
          segments.push(`<${fmtSplTime(wordStart)}>${wordText}`);
        }
        lastStart = Math.max(lastStart, wordStart);
      }
      const endMs = Math.max(line.endMs, lastStart + 120);
      const body = segments.join("").trim();
      if (body) output.push(`[${stamp}]${body}<${fmtSplTime(endMs)}>`);
    } else if (text) {
      output.push(`[${stamp}]${text}`);
    } else if (line.words.length && !enhanced) {
      output.push(`[${stamp}]`);
    }
    if (includeTranslation && line.translation.trim()) {
      output.push(`[${stamp}]${line.translation.trim()}`);
    }
  }
  return `${output.join("\n").replace(/\n+$/, "")}\n`;
}

export function lyricStats(lyrics: Lyrics): {
  lines: number;
  wordLines: number;
} {
  return {
    lines: lyrics.lines.filter((line) => line.text.trim()).length,
    wordLines: lyrics.lines.filter((line) => line.words.length >= 2).length,
  };
}
