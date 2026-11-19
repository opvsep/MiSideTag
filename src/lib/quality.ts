import type { Lyrics } from "../types";
import { artistText } from "../types";
import { lyricStats } from "./lyrics";
import { fmtDuration } from "./utils";

export interface LyricIssue {
  level: "error" | "warning" | "info";
  message: string;
}

export interface LyricCheckReport {
  title: string;
  artist: string;
  source: string;
  lines: number;
  timedLines: number;
  wordLines: number;
  wordLevel: boolean;
  hasTranslation: boolean;
  expectedDurationMs: number;
  issues: LyricIssue[];
}

export function reportStatus(report: LyricCheckReport): string {
  if (report.issues.some((issue) => issue.level === "error")) return "缺失";
  if (report.issues.some((issue) => issue.level === "warning")) return "需检查";
  return "通过";
}

export function checkLyrics(
  lyrics: Lyrics | null,
  options: {
    expectedDurationMs?: number;
    title?: string;
    artist?: string;
    source?: string;
  } = {},
): LyricCheckReport {
  const report: LyricCheckReport = {
    title: options.title || lyrics?.song.title || "未获取歌词",
    artist: options.artist || (lyrics ? artistText(lyrics.song) : ""),
    source: options.source || lyrics?.song.source || "",
    lines: 0,
    timedLines: 0,
    wordLines: 0,
    wordLevel: false,
    hasTranslation: false,
    expectedDurationMs: options.expectedDurationMs || 0,
    issues: [],
  };
  if (!lyrics) {
    report.issues.push({
      level: "error",
      message: "还没有获取到歌词，无法检查。",
    });
    return report;
  }

  const visible = lyrics.lines.filter((line) => line.text.trim());
  const stats = lyricStats(lyrics);
  report.lines = stats.lines;
  report.wordLines = stats.wordLines;
  report.timedLines = visible.filter((line) => line.startMs > 0).length;
  report.wordLevel = lyrics.wordLevel;
  report.hasTranslation = lyrics.hasTranslation;
  if (!visible.length) {
    report.issues.push({ level: "error", message: "歌词内容为空。" });
    return report;
  }

  const allText = visible.map((line) => line.text).join(" ");
  if (
    visible.length <= 2 &&
    /(纯音乐|请欣赏|instrumental|伴奏)/i.test(allText)
  ) {
    report.issues.push({
      level: "info",
      message: "这看起来是一首纯音乐 / 伴奏，没有可匹配的人声歌词。",
    });
    return report;
  }
  if (visible.length < 3) {
    report.issues.push({
      level: "warning",
      message: "有效歌词行数很少，可能只抓到了制作信息或缺失正文。",
    });
  }
  if (report.timedLines < visible.length * 0.8) {
    report.issues.push({
      level: "warning",
      message: "部分歌词行没有时间戳，播放器可能无法同步。",
    });
  }

  const starts = visible.map((line) => line.startMs).sort((a, b) => a - b);
  for (let index = 0; index < starts.length - 1; index += 1) {
    const gap = starts[index + 1] - starts[index];
    if (
      gap > 30_000 &&
      (!report.expectedDurationMs ||
        starts[index] < report.expectedDurationMs - 30_000)
    ) {
      report.issues.push({
        level: "warning",
        message: `第 ${fmtDuration(starts[index])} 到 ${fmtDuration(starts[index + 1])} 之间有 ${Math.floor(gap / 1000)} 秒空白，可能缺词。`,
      });
      break;
    }
  }
  if (starts[0] > 60_000) {
    report.issues.push({
      level: "info",
      message: `第一行歌词在 ${fmtDuration(starts[0])}，前奏较长或开头可能缺词。`,
    });
  }
  if (report.expectedDurationMs > 0) {
    const lastEnd = Math.max(
      ...visible.map((line) => line.endMs || line.startMs),
    );
    if (report.expectedDurationMs - lastEnd > 45_000) {
      report.issues.push({
        level: "warning",
        message: `歌词在 ${fmtDuration(lastEnd)} 结束，歌曲结尾可能缺词。`,
      });
    }
    const expectedMinLines = Math.max(
      3,
      Math.floor(report.expectedDurationMs / 24_000),
    );
    if (report.lines < expectedMinLines) {
      report.issues.push({
        level: "info",
        message: `按歌曲时长估算，有效歌词行数偏少（${report.lines}/${expectedMinLines}）。`,
      });
    }
  }
  if (lyrics.wordLevel) {
    if (report.wordLines < Math.max(3, Math.trunc(visible.length * 0.85))) {
      report.issues.push({
        level: "warning",
        message: `逐字歌词只覆盖 ${report.wordLines}/${visible.length} 行，部分行会退回逐行显示。`,
      });
    }
    for (const line of visible) {
      let last = line.startMs - 1;
      for (const word of line.words) {
        if (
          word.startMs < line.startMs - 500 ||
          word.startMs < last - 1
        ) {
          report.issues.push({
            level: "warning",
            message: "检测到逐字时间戳倒序或越界，高亮可能不同步。",
          });
          break;
        }
        last = word.startMs;
      }
      if (report.issues.at(-1)?.message.startsWith("检测到逐字时间戳")) break;
    }
  }
  if (lyrics.hasTranslation) {
    const translated = visible.filter((line) => line.translation.trim()).length;
    if (translated < visible.length * 0.5) {
      report.issues.push({
        level: "info",
        message: `只有 ${translated}/${visible.length} 行带译文。`,
      });
    }
  }
  if (!report.issues.length) {
    report.issues.push({
      level: "info",
      message: "未发现明显的缺词或时间轴问题。",
    });
  }
  const order = { error: 0, warning: 1, info: 2 };
  report.issues.sort((left, right) => order[left.level] - order[right.level]);
  return report;
}
