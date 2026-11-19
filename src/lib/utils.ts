import type { LocalTrack, Song } from "../types";
import { artistText } from "../types";

const INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001f]/g;
const SPACES = /\s+/g;
const BRACKETS = /[\(\（\[【].*?[\)\）\]】]/g;
const QUALITY_WORDS =
  /\b(?:hires|hi-res|lossless|flac|320k|320kbps|128k|mp3|aac|ogg|opus|instrumental|inst\.?|off\s*vocal|remaster(?:ed)?|live|demo|cover)\b/gi;
const FEAT = /\b(feat|ft)\.?\s+/gi;
const ARTIST_SPLIT =
  /\s*(?:\/|&|、|,|，|;|；|\bfeat\.?\b|\bft\.?\b)\s*/gi;
const TRACK_PREFIX = /^\s*\d{1,3}[\s._-]+(?=\S)/;
const TITLE_ARTIST = /\s+[-–—]\s+/;

export function normalizeText(value: string): string {
  if (!value) return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function asciiFoldText(value: string): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .replace(SPACES, " ")
    .trim();
}

export function queryVariants(value: string): string[] {
  const raw = (value || "").trim().replace(SPACES, " ");
  if (!raw) return [];
  const variants = [raw];
  const folded = asciiFoldText(raw);
  if (folded && folded.toLocaleLowerCase() !== raw.toLocaleLowerCase()) {
    variants.push(folded);
  }
  return variants;
}

export function normalizeLoose(value: string): string {
  if (!value) return "";
  return value
    .normalize("NFKC")
    .replace(BRACKETS, " ")
    .replace(QUALITY_WORDS, " ")
    .replace(FEAT, " ")
    .replace(SPACES, " ")
    .trim()
    .replace(/^[\s\-–—·_]+|[\s\-–—·_]+$/g, "");
}

export function splitArtists(value: string): string[] {
  if (!value) return [];
  return value
    .split(ARTIST_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function sanitizeFilename(
  value: string,
  fallback = "lyrics",
  maxLength = 120,
): string {
  let result = (value || "")
    .replace(INVALID_FILENAME, "_")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .replace(SPACES, " ");
  if (!result) result = fallback;
  if (Array.from(result).length > maxLength) {
    result = Array.from(result)
      .slice(0, maxLength)
      .join("")
      .replace(/[ .]+$/g, "");
  }
  return result || fallback;
}

export function formatTemplate(
  template: string,
  values: {
    title?: string;
    artist?: string;
    album?: string;
    source?: string;
    songId?: string;
    filename?: string;
  },
): string {
  const replacements: Record<string, string> = {
    title: values.title || "未知歌曲",
    artist: values.artist || "未知歌手",
    album: values.album || "未知专辑",
    source: values.source || "",
    id: values.songId || "",
    filename: values.filename || values.title || "lyrics",
  };
  const rendered = (template || "{title} - {artist}").replace(
    /\{([a-z_]+)\}/g,
    (placeholder, key: string) => replacements[key] ?? placeholder,
  );
  return sanitizeFilename(
    /\{[^}]+\}/.test(rendered)
      ? `${replacements.title} - ${replacements.artist}`
      : rendered,
  );
}

export function normalizeCookie(raw: string): string {
  let value = (raw || "").trim();
  if (!value) return "";

  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      const data: unknown = JSON.parse(value);
      const pairs: string[] = [];
      if (data && typeof data === "object" && !Array.isArray(data)) {
        for (const [key, item] of Object.entries(data)) {
          if (typeof item === "string" && item) pairs.push(`${key}=${item}`);
        }
      } else if (Array.isArray(data)) {
        for (const item of data) {
          if (
            item &&
            typeof item === "object" &&
            "name" in item &&
            typeof item.name === "string"
          ) {
            const cookieValue =
              "value" in item && typeof item.value === "string"
                ? item.value
                : "";
            pairs.push(`${item.name}=${cookieValue}`);
          }
        }
      }
      if (pairs.length) value = pairs.join("; ");
    } catch {
      // Keep malformed JSON as text so the user can correct it.
    }
  }

  if (/[\r\n]/.test(value)) {
    const lines = value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.some((line) => line.includes(";"))) {
      const pairs: string[] = [];
      for (let line of lines) {
        line = line.replace(/^cookie:\s*/i, "").trim();
        if (line.includes("\t")) {
          const columns = line
            .split("\t")
            .map((column) => column.trim())
            .filter(Boolean);
          if (columns.length >= 2 && !columns[0].includes("=")) {
            pairs.push(`${columns[0]}=${columns[1]}`);
          }
        } else if (line.includes("=")) {
          pairs.push(line);
        }
      }
      if (pairs.length) value = pairs.join("; ");
    }
  }

  value = value.trim().replace(/^["']+|["']+$/g, "");
  value = value.replace(/^cookie:\s*/i, "");
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("; ");
}

export function parseCookie(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of normalizeCookie(raw).split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

export function cookiePreview(raw: string): string {
  const count = Object.keys(parseCookie(raw)).length;
  return count ? `${count} 项 Cookie` : "游客模式";
}

export function stripExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").pop() || normalized;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || normalized;
}

export function basenameWithoutExtension(path: string): string {
  return stripExtension(basename(path));
}

export function guessTitleArtist(path: string): [title: string, artist: string] {
  const stem = stripExtension(path).replace(TRACK_PREFIX, "").trim();
  const parts = stem.split(TITLE_ARTIST, 2);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return [parts[1].trim(), parts[0].trim()];
  }
  return [stem, ""];
}

export function sequenceRatio(left: string, right: string): number {
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const a = Array.from(left);
  const b = Array.from(right);
  const lengths = Array.from({ length: b.length + 1 }, () =>
    Array<number>(a.length + 1).fill(0),
  );
  let longest = 0;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        lengths[j][i] = lengths[j - 1][i - 1] + 1;
        longest = Math.max(longest, lengths[j][i]);
      }
    }
  }
  return (2 * longest) / (a.length + b.length);
}

export function fmtDuration(ms: number): string {
  if (!ms || ms <= 0) return "--:--";
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function fmtLrcTime(ms: number): string {
  const safe = Math.max(0, Math.trunc(ms));
  const minutes = Math.floor(safe / 60_000);
  const seconds = (safe % 60_000) / 1000;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export function fmtSplTime(ms: number): string {
  const safe = Math.max(0, Math.trunc(ms));
  const minutes = Math.floor(safe / 60_000);
  const seconds = (safe % 60_000) / 1000;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
}

export function songText(song: Song): string {
  return `${song.title} — ${artistText(song)}`;
}

export function trackDisplayTitle(track: LocalTrack): string {
  return track.title || basenameWithoutExtension(track.path);
}

export function trackDisplayArtist(track: LocalTrack): string {
  return track.artist || "未知歌手";
}
