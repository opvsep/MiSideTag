import type {
  AppConfig,
  AppPaths,
  LocalTrack,
  Lyrics,
  Song,
} from "../types";
import { embedLyrics, writeLyricsFile } from "./bridge";
import {
  localLyricsPath,
  onlineLyricsPath,
} from "./config";
import { formatLrc } from "./lyrics";

interface SaveResult {
  lrcPath: string;
  embedded: boolean;
  errors: string[];
}

function lyricText(lyrics: Lyrics, config: AppConfig): string {
  return formatLrc(lyrics, {
    includeTranslation: config.saving.includeTranslation,
    enhanced: config.saving.enhancedLrc,
    metadata: true,
  });
}

export async function saveLocalLyrics(
  match: { track: LocalTrack; lyrics: Lyrics | null },
  config: AppConfig,
): Promise<SaveResult> {
  const result: SaveResult = {
    lrcPath: "",
    embedded: false,
    errors: [],
  };
  if (!match.lyrics) throw new Error("这首歌还没有获取歌词");
  if (!config.saving.writeLrc && !config.saving.embedTags) {
    throw new Error("请先在设置中开启“保存 LRC 文件”或“写入音频标签”");
  }
  const text = lyricText(match.lyrics, config);
  if (config.saving.writeLrc) {
    try {
      const path = localLyricsPath(match.track, config);
      await writeLyricsFile(path, text, config.saving.bom, config.saving.overwrite);
      result.lrcPath = path;
    } catch (error) {
      result.errors.push(
        `LRC 保存失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (config.saving.embedTags) {
    try {
      await embedLyrics(match.track.path, text);
      result.embedded = true;
    } catch (error) {
      result.errors.push(
        `音频标签写入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return result;
}

export async function saveOnlineLyrics(
  song: Song,
  lyrics: Lyrics,
  config: AppConfig,
  paths: AppPaths,
): Promise<string> {
  if (!config.saving.writeLrc) {
    throw new Error("设置中未开启“保存 LRC 文件”");
  }
  const path = onlineLyricsPath(song, config, paths);
  await writeLyricsFile(
    path,
    lyricText(lyrics, config),
    config.saving.bom,
    config.saving.overwrite,
  );
  return path;
}
