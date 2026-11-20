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
import { object } from "./json";
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

function mergeAccount(target: AccountState, raw: unknown): void {
  const account = object(raw);
  if (!account) return;
  if (typeof account.nickname === "string") target.nickname = account.nickname;
  if (typeof account.avatar === "string") target.avatar = account.avatar;
  if (typeof account.detail === "string") target.detail = account.detail;
  if (typeof account.vip === "boolean") target.vip = account.vip;
  if (typeof account.valid === "boolean" || account.valid === null) {
    target.valid = account.valid;
  }
}

export function mergeConfig(raw: unknown): AppConfig {
  const base = structuredClone(DEFAULT_CONFIG);
  const config = object(raw);
  if (!config) return base;
  const saving = object(config.saving);
  if (saving) {
    if (saving.mode === "same" || saving.mode === "custom") {
      base.saving.mode = saving.mode;
    }
    if (typeof saving.customDir === "string") {
      base.saving.customDir = saving.customDir;
    }
    if (typeof saving.template === "string") {
      base.saving.template = saving.template;
    }
    for (const key of [
      "includeTranslation",
      "writeLrc",
      "embedTags",
      "overwrite",
      "enhancedLrc",
      "bom",
    ] as const) {
      if (typeof saving[key] === "boolean") {
        base.saving[key] = saving[key];
      }
    }
  }
  const matching = object(config.matching);
  if (matching) {
    if (
      matching.prefer === "auto" ||
      matching.prefer === "netease" ||
      matching.prefer === "qq"
    ) {
      base.matching.prefer = matching.prefer;
    }
    if (
      matching.sensitivity === "strict" ||
      matching.sensitivity === "balanced" ||
      matching.sensitivity === "loose"
    ) {
      base.matching.sensitivity = matching.sensitivity;
    }
    if (typeof matching.autoFetchLyrics === "boolean") {
      base.matching.autoFetchLyrics = matching.autoFetchLyrics;
    }
    base.matching.concurrency = normalizeMatchingConcurrency(
      matching.concurrency,
      DEFAULT_MATCH_CONCURRENCY,
    );
  }
  const performance = object(config.performance);
  if (performance) {
    if (typeof performance.highPerformance === "boolean") {
      base.performance.highPerformance = performance.highPerformance;
    }
  }
  const cookies = object(config.cookies);
  if (cookies) {
    if (typeof cookies.netease === "string") {
      base.cookies.netease = cookies.netease;
    }
    if (typeof cookies.qq === "string") {
      base.cookies.qq = cookies.qq;
    }
  }
  const accounts = object(config.accounts);
  if (accounts) {
    for (const source of ["netease", "qq"] as const) {
      mergeAccount(base.accounts[source], accounts[source]);
    }
  }
  const ui = object(config.ui);
  if (ui && typeof ui.scale === "string") {
    if (["system", "100", "125", "150"].includes(ui.scale)) {
      base.ui.scale = ui.scale as AppConfig["ui"]["scale"];
    }
  }
  const search = object(config.search);
  if (search) {
    if (typeof search.lastQuery === "string") {
      base.search.lastQuery = search.lastQuery;
    }
    if (
      typeof search.defaultSource === "string" &&
      ["all", "netease", "qq"].includes(search.defaultSource)
    ) {
      base.search.defaultSource =
        search.defaultSource as AppConfig["search"]["defaultSource"];
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
