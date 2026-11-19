import type {
  LocalMatch,
  LocalTrack,
  MatchCandidate,
  Song,
} from "../types";
import { artistText, songKey } from "../types";
import {
  basenameWithoutExtension,
  normalizeLoose,
  normalizeText,
  sequenceRatio,
  splitArtists,
} from "./utils";

export interface MatchThreshold {
  score: number;
  margin: number;
  review: number;
}

export const THRESHOLDS: Record<string, MatchThreshold> = {
  strict: { score: 90, margin: 15, review: 55 },
  balanced: { score: 80, margin: 10, review: 45 },
  loose: { score: 68, margin: 6, review: 35 },
};

function artists(value: string): Set<string> {
  return new Set(
    splitArtists(value)
      .map(normalizeText)
      .filter(Boolean),
  );
}

export function buildQueries(track: LocalTrack): string[] {
  const title = track.title.trim();
  const artist = track.artist.trim();
  const cleanedTitle = normalizeLoose(title) || title;
  const cleanedArtist = normalizeLoose(artist);
  const artistHint = splitArtists(cleanedArtist || artist)[0] || "";
  const queries: string[] = [];
  if (cleanedTitle && artistHint) queries.push(`${cleanedTitle} ${artistHint}`);
  if (title && artistHint) queries.push(`${title} ${artistHint}`);
  if (cleanedTitle) queries.push(cleanedTitle);
  if (title) queries.push(title);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const query of queries) {
    const cleaned = query.replace(/\s+/g, " ").trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(Array.from(cleaned).slice(0, 120).join(""));
  }
  return result.slice(0, 3);
}

export function scoreCandidate(
  track: LocalTrack,
  song: Song,
): MatchCandidate {
  const titleNorm = normalizeText(track.title);
  const songTitle = normalizeText(song.title);
  const artistNorm = artists(track.artist);
  const songArtists = artists(artistText(song));
  const albumNorm = normalizeText(track.album);
  const songAlbum = normalizeText(song.album);
  const reasons: string[] = [];

  let combinedFilenameMatch = false;
  if (!artistNorm.size && titleNorm) {
    const filenameNorm = normalizeText(
      basenameWithoutExtension(track.path),
    );
    combinedFilenameMatch =
      Boolean(songTitle) &&
      songArtists.size > 0 &&
      [titleNorm, filenameNorm].some(
        (haystack) =>
          Boolean(haystack) &&
          haystack.includes(songTitle) &&
          [...songArtists].some((name) => haystack.includes(name)),
      );
  }

  const exactTitle =
    Boolean(titleNorm) && (titleNorm === songTitle || combinedFilenameMatch);
  const titleRatio =
    titleNorm && songTitle ? sequenceRatio(titleNorm, songTitle) : 0;
  let score: number;
  if (exactTitle) {
    score = 55;
    reasons.push(
      combinedFilenameMatch ? "文件名匹配歌名+歌手" : "歌名一致",
    );
  } else if (titleNorm && songTitle && songTitle.includes(titleNorm)) {
    score = 24;
    reasons.push("歌名包含");
  } else if (titleRatio >= 0.72) {
    score = Math.trunc(18 * titleRatio);
    reasons.push("歌名相近");
  } else {
    score = 0;
  }

  const unknownArtist =
    artistNorm.size === 0 ||
    ["未知歌手", "unknown", "unknownartist", "variousartists"].includes(
      normalizeText(track.artist),
    );
  const exactArtists =
    (artistNorm.size > 0 &&
      artistNorm.size === songArtists.size &&
      [...artistNorm].every((name) => songArtists.has(name))) ||
    combinedFilenameMatch;
  const overlap = [...artistNorm].some((name) => songArtists.has(name));
  if (exactArtists) {
    score += 30;
    if (!combinedFilenameMatch) reasons.push("歌手一致");
  } else if (overlap) {
    score += 14;
    reasons.push("歌手重叠");
  } else if (unknownArtist && artistNorm.size === 0) {
    score += 8;
    reasons.push("本地无歌手信息");
  }

  const sameAlbum = Boolean(albumNorm) && albumNorm === songAlbum;
  if (sameAlbum) {
    score += 5;
    reasons.push("专辑一致");
  }

  let durationDiff: number | null = null;
  if (track.durationMs > 0 && song.durationMs > 0) {
    durationDiff = Math.abs(track.durationMs - song.durationMs);
    if (durationDiff <= 2000) {
      score += 10;
      reasons.push("时长接近");
    } else if (durationDiff <= 5000) {
      score += 5;
    } else if (durationDiff > 12_000) {
      score -= 12;
      reasons.push("时长差异较大");
    }
  }
  if (!exactTitle && titleRatio >= 0.85) score += 6;

  let reliable =
    exactTitle && (exactArtists || overlap || combinedFilenameMatch);
  if (durationDiff !== null && durationDiff > 8000) reliable = false;
  if (titleRatio < 0.6) reliable = false;
  return {
    song,
    score: Math.max(0, Math.min(100, score)),
    reliable,
    reasons: reasons.slice(0, 3),
  };
}

export function rankCandidates(
  track: LocalTrack,
  songs: Song[],
  limit = 8,
): MatchCandidate[] {
  const best = new Map<string, MatchCandidate>();
  for (const song of songs) {
    const candidate = scoreCandidate(track, song);
    const previous = best.get(songKey(song));
    if (!previous || candidate.score > previous.score) {
      best.set(songKey(song), candidate);
    }
  }
  return [...best.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.reliable) - Number(left.reliable),
    )
    .slice(0, limit);
}

function identityGroup(candidate: MatchCandidate): string {
  const names = [...artists(artistText(candidate.song))].sort().join("|");
  return `${normalizeText(candidate.song.title)}\0${names}`;
}

function sameRecording(
  first: MatchCandidate,
  second: MatchCandidate,
): boolean {
  if (identityGroup(first) !== identityGroup(second)) return false;
  if (first.song.durationMs > 0 && second.song.durationMs > 0) {
    return Math.abs(first.song.durationMs - second.song.durationMs) <= 3000;
  }
  return true;
}

export function chooseAutomatic(
  candidates: MatchCandidate[],
  sensitivity: keyof typeof THRESHOLDS | string = "balanced",
): MatchCandidate | null {
  const top = candidates[0];
  if (!top) return null;
  const threshold = THRESHOLDS[sensitivity] ?? THRESHOLDS.balanced;
  if (!top.reliable || top.score < threshold.score) return null;
  for (const other of candidates.slice(1)) {
    if (sameRecording(top, other)) continue;
    if (top.score - other.score < threshold.margin) return null;
  }
  return top;
}

export function preferredTopCandidate(
  candidates: MatchCandidate[],
  pairingPlatform: "auto" | "netease" | "qq" = "auto",
): MatchCandidate | null {
  return (
    (pairingPlatform === "auto"
      ? candidates[0]
      : candidates.find(
          (candidate) => candidate.song.source === pairingPlatform,
        )) || null
  );
}

function variants(track: LocalTrack): LocalTrack[] {
  const result = [track];
  if (
    track.parseSource === "filename" &&
    track.title &&
    track.artist &&
    normalizeText(track.title) !== normalizeText(track.artist)
  ) {
    result.push({ ...track, title: track.artist, artist: track.title });
  }
  return result;
}

export function rankVariants(
  track: LocalTrack,
  songs: Song[],
  limit = 8,
): MatchCandidate[] {
  const best = new Map<string, MatchCandidate>();
  for (const variant of variants(track)) {
    for (const candidate of rankCandidates(variant, songs, songs.length)) {
      const previous = best.get(songKey(candidate.song));
      if (
        !previous ||
        candidate.score > previous.score ||
        (candidate.score === previous.score &&
          candidate.reliable &&
          !previous.reliable)
      ) {
        best.set(songKey(candidate.song), candidate);
      }
    }
  }
  const sorted = [...best.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.reliable) - Number(left.reliable),
    );
  const selected = sorted.slice(0, limit);
  for (const source of ["netease", "qq"] as const) {
    if (selected.some((candidate) => candidate.song.source === source)) {
      continue;
    }
    const sourceBest = sorted.find(
      (candidate) => candidate.song.source === source,
    );
    if (sourceBest) {
      if (limit >= 2 && selected.length >= limit) {
        selected[selected.length - 1] = sourceBest;
      } else {
        selected.push(sourceBest);
      }
    }
  }
  return selected.sort(
    (left, right) =>
      right.score - left.score ||
      Number(right.reliable) - Number(left.reliable),
  );
}

export function finalizeMatch(
  track: LocalTrack,
  candidates: MatchCandidate[],
  sensitivity: string,
  warnings: string[] = [],
  pairingPlatform: "auto" | "netease" | "qq" = "auto",
): LocalMatch {
  const pairingCandidates =
    pairingPlatform === "auto"
      ? candidates
      : candidates.filter(
          (candidate) => candidate.song.source === pairingPlatform,
        );
  const selected = chooseAutomatic(pairingCandidates, sensitivity);
  const preferredTop = preferredTopCandidate(candidates, pairingPlatform);
  const orderedCandidates =
    pairingPlatform === "auto" || !preferredTop
      ? candidates
      : [
          preferredTop,
          ...candidates.filter(
            (candidate) =>
              candidate.song.source !== preferredTop.song.source ||
              candidate.song.id !== preferredTop.song.id,
          ),
        ];
  const threshold = THRESHOLDS[sensitivity] ?? THRESHOLDS.balanced;
  const result: LocalMatch = {
    track,
    candidates: orderedCandidates,
    selected,
    lyrics: null,
    status: "none",
    detail: "",
    savedLrc: "",
    embedded: false,
  };
  if (selected) {
    result.status = "auto";
    result.detail = `${selected.song.source === "netease" ? "网易云" : "QQ 音乐"} · 置信度 ${selected.score}`;
  } else if (
    pairingCandidates[0] &&
    pairingCandidates[0].score >= threshold.review
  ) {
    result.status = "review";
    result.detail = `默认配对平台最佳候选 ${pairingCandidates[0].score} 分，请确认`;
  } else {
    result.status = "none";
    result.detail = warnings.slice(0, 2).join("；") || "没有找到可信的歌词来源";
  }
  return result;
}

export function statusText(status: LocalMatch["status"]): string {
  return (
    {
      pending: "等待匹配",
      matching: "匹配中",
      auto: "待确认",
      review: "待确认",
      ready: "准备就绪",
      done: "完毕",
      none: "未找到",
      error: "匹配失败",
    } as const
  )[status];
}
