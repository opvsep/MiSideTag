import type {
  AccountState,
  AppConfig,
  AppPaths,
  LocalTrack,
  Song,
} from "../types";
import { loadConfigRaw, saveConfigRaw } from "./bridge";
import {
  DEFAULT_MATCH_CONCURRENCY,
  normalizeMatchingConcurrency,
} from "./concurrency";
import { formatTemplate, basenameWithoutExtension } from "./utils";

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  saving: {
    mode: "same",
    customDir: "",
    template: "{title} - {artist}",
    includeTranslation: true,
    writeLrc: true,
    embedTags: true,
    overwrite: true,
    enhancedLrc: false,
    bom: false,
  },
  matching: {
    prefer: "auto",
    sensitivity: "balanced",
    autoFetchLyrics: true,
    concurrency: DEFAULT_MATCH_CONCURRENCY,
  },
  performance: {
    highPerformance: false,
  },
  cookies: {
    netease: "",
    qq: "",
  },
  accounts: {
    netease: emptyAccount(),
    qq: emptyAccount(),
  },
  ui: {
    scale: "system",
  },
  search: {
    lastQuery: "",
    defaultSource: "all",
  },
};

function emptyAccount(): AccountState {
  return {
    nickname: "",
    avatar: "",
    vip: false,
    valid: null,
    detail: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeConfig(raw: unknown): AppConfig {
  const base = structuredClone(DEFAULT_CONFIG);
  if (!isRecord(raw)) return base;
  const config = raw;
  if (isRecord(config.saving)) {
    Object.assign(base.saving, config.saving);
  }
  if (isRecord(config.matching)) {
    Object.assign(base.matching, config.matching);
    base.matching.concurrency = normalizeMatchingConcurrency(
      config.matching.concurrency,
      DEFAULT_MATCH_CONCURRENCY,
    );
  }
  if (isRecord(config.performance)) {
    if (typeof config.performance.highPerformance === "boolean") {
      base.performance.highPerformance = config.performance.highPerformance;
    }
  }
  if (isRecord(config.cookies)) {
    if (typeof config.cookies.netease === "string") {
      base.cookies.netease = config.cookies.netease;
    }
    if (typeof config.cookies.qq === "string") {
      base.cookies.qq = config.cookies.qq;
    }
  }
  if (isRecord(config.accounts)) {
    for (const source of ["netease", "qq"] as const) {
      if (isRecord(config.accounts[source])) {
        Object.assign(base.accounts[source], config.accounts[source]);
      }
    }
  }
  if (isRecord(config.ui) && typeof config.ui.scale === "string") {
    if (["system", "100", "125", "150"].includes(config.ui.scale)) {
      base.ui.scale = config.ui.scale as AppConfig["ui"]["scale"];
    }
  }
  if (isRecord(config.search)) {
    if (typeof config.search.lastQuery === "string") {
      base.search.lastQuery = config.search.lastQuery;
    }
    if (
      typeof config.search.defaultSource === "string" &&
      ["all", "netease", "qq"].includes(config.search.defaultSource)
    ) {
      base.search.defaultSource =
        config.search.defaultSource as AppConfig["search"]["defaultSource"];
    }
  }
  return base;
}

export async function loadConfig(): Promise<AppConfig> {
  return mergeConfig(await loadConfigRaw());
}

export async function persistConfig(config: AppConfig): Promise<void> {
  await saveConfigRaw(config);
}

export function onlineSaveDirectory(
  config: AppConfig,
  paths: AppPaths,
): string {
  if (config.saving.mode === "custom" && config.saving.customDir.trim()) {
    return config.saving.customDir.trim();
  }
  return paths.downloadsDir;
}

export function localLyricsPath(
  track: LocalTrack,
  config: AppConfig,
): string {
  const saving = config.saving;
  if (saving.mode === "custom" && saving.customDir.trim()) {
    const directory = saving.customDir.trim().replace(/[\\/]+$/g, "");
    return `${directory}\\${formatTemplate(saving.template, {
      title: track.title,
      artist: track.artist,
      album: track.album,
      filename: basenameWithoutExtension(track.path),
    })}.lrc`;
  }
  const directory = track.path.replace(/[\\/][^\\/]+$/, "");
  return `${directory}\\${basenameWithoutExtension(track.path)}.lrc`;
}

export function onlineLyricsPath(
  song: Song,
  config: AppConfig,
  paths: AppPaths,
): string {
  const directory = onlineSaveDirectory(config, paths).replace(/[\\/]+$/g, "");
  return `${directory}\\${formatTemplate(config.saving.template, {
    title: song.title,
    artist: song.artists.join(" / "),
    album: song.album,
    source: song.source,
    songId: song.id,
  })}.lrc`;
}
