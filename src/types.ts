export type ProviderSource = "netease" | "qq";

export interface Song {
  source: ProviderSource;
  id: string;
  title: string;
  artists: string[];
  album: string;
  durationMs: number;
  coverUrl: string;
  numericId?: string;
  mid?: string;
  albumMid?: string;
  raw?: unknown;
}

export interface LyricWord {
  startMs: number;
  endMs: number;
  text: string;
}

export interface LyricLine {
  startMs: number;
  endMs: number;
  text: string;
  words: LyricWord[];
  translation: string;
  romanization: string;
}

export interface Lyrics {
  song: Song;
  lines: LyricLine[];
  wordLevel: boolean;
  hasTranslation: boolean;
  hasRomanization: boolean;
  rawLrc: string;
  rawExtra: string;
  providerNote: string;
  isInstrumental: boolean;
}

export interface LocalTrack {
  path: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  codec: string;
  tagType: string;
  hasEmbeddedLyric: boolean;
  lyricPath?: string | null;
  parseSource: "tags" | "filename";
  error: string;
}

export interface MatchCandidate {
  song: Song;
  score: number;
  reliable: boolean;
  reasons: string[];
}

export type MatchStatus =
  | "pending"
  | "matching"
  | "auto"
  | "review"
  | "ready"
  | "done"
  | "none"
  | "error";

export interface LocalMatch {
  track: LocalTrack;
  candidates: MatchCandidate[];
  selected: MatchCandidate | null;
  lyrics: Lyrics | null;
  status: MatchStatus;
  detail: string;
  savedLrc: string;
  embedded: boolean;
}

export interface SavingSettings {
  mode: "same" | "custom";
  customDir: string;
  template: string;
  includeTranslation: boolean;
  writeLrc: boolean;
  embedTags: boolean;
  overwrite: boolean;
  enhancedLrc: boolean;
  bom: boolean;
}

export interface MatchingSettings {
  prefer: "auto" | ProviderSource;
  sensitivity: "strict" | "balanced" | "loose";
  autoFetchLyrics: boolean;
  concurrency: number;
}

export interface AccountState {
  nickname: string;
  avatar: string;
  vip: boolean;
  valid: boolean | null;
  detail: string;
}

export interface AppConfig {
  version: number;
  saving: SavingSettings;
  matching: MatchingSettings;
  performance: {
    highPerformance: boolean;
  };
  cookies: Record<ProviderSource, string>;
  accounts: Record<ProviderSource, AccountState>;
  ui: {
    scale: "system" | "100" | "125" | "150";
  };
  search: {
    lastQuery: string;
    defaultSource: "all" | ProviderSource;
  };
}

export interface AppPaths {
  appDir: string;
  dataDir: string;
  configPath: string;
  cacheDir: string;
  downloadsDir: string;
  logDir: string;
  fallback: boolean;
}

export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  finalUrl: string;
  text: string;
}

export const SOURCE_SHORT: Record<ProviderSource, string> = {
  netease: "网易云",
  qq: "QQ 音乐",
};

export const SOURCE_COLOR: Record<ProviderSource, string> = {
  netease: "#ff6473",
  qq: "#2fd08a",
};

export function emptySong(source: ProviderSource = "netease"): Song {
  return {
    source,
    id: "",
    title: "",
    artists: [],
    album: "",
    durationMs: 0,
    coverUrl: "",
  };
}

export function artistText(song: Song): string {
  return song.artists.filter(Boolean).join(" / ") || "未知歌手";
}

export function songKey(song: Song): string {
  return `${song.source}:${song.id}`;
}

export function emptyLyrics(song: Song): Lyrics {
  return {
    song,
    lines: [],
    wordLevel: false,
    hasTranslation: false,
    hasRomanization: false,
    rawLrc: "",
    rawExtra: "",
    providerNote: "",
    isInstrumental: false,
  };
}
