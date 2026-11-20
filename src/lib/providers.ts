import type {
  HttpResponse,
  Lyrics,
  ProviderSource,
  Song,
} from "../types";
import { decryptQrc } from "qrc-decoder";
import { artistText } from "../types";
import { httpRequest } from "./bridge";
import {
  mergeFieldByTime,
  mergeTranslation,
  parseLrc,
  parseQrc,
  parseYrc,
} from "./lyrics";
import {
  normalizeCookie,
  normalizeLoose,
  normalizeText,
  parseCookie,
  queryVariants,
  sequenceRatio,
  splitArtists,
} from "./utils";
import {
  isHighPerformanceMode,
  withProviderConcurrency,
} from "./performance";
import {
  extractHttpUrl,
  extractSongLinkIdentifiers,
} from "./links";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const QQ_COVER =
  "https://y.gtimg.cn/music/photo_new/T002R300x300M000{albummid}.jpg?max_age=2592000";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stripJsonp(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const match = trimmed.match(/^[\w$.]+\s*\(([\s\S]*)\)\s*;?$/);
  return match ? match[1].trim() : trimmed;
}

function parseJson<T = unknown>(text: string): T {
  return JSON.parse(stripJsonp(text)) as T;
}

async function requestJson(
  url: string,
  headers: Record<string, string> = {},
  method = "GET",
  body?: string,
): Promise<unknown> {
  const mergedHeaders: Record<string, string> = {
    "User-Agent": USER_AGENT,
    ...headers,
  };
  for (const [key, value] of Object.entries(mergedHeaders)) {
    if (!value) delete mergedHeaders[key];
  }
  const response: HttpResponse = await httpRequest({
    url,
    method,
    headers: mergedHeaders,
    body,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`平台返回 HTTP ${response.status}`);
  }
  try {
    return parseJson(response.text);
  } catch {
    throw new Error(
      `平台返回了非 JSON 数据：${response.text.replace(/\s+/g, " ").slice(0, 100)}`,
    );
  }
}

function cookieHeader(cookie: string): string {
  return normalizeCookie(cookie);
}

function neteaseCookieHeader(cookie: string): string {
  const parsed = parseCookie(cookie);
  if (!parsed.os) parsed.os = "pc";
  if (!parsed.appver) parsed.appver = "8.9.70";
  return Object.entries(parsed)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function thumb(url: string): string {
  if (!url) return "";
  const https = url.replace(/^http:/, "https:");
  try {
    const parsed = new URL(https);
    parsed.searchParams.set("param", "300y300");
    return parsed.toString();
  } catch {
    return https;
  }
}

function neteaseCover(raw: Record<string, unknown>): string {
  const album = object(raw.album ?? raw.al) ?? {};
  return thumb(
    stringValue(
      album.picUrl ??
        album.blurPicUrl ??
        album.picUrl_str ??
        raw.picUrl,
    ),
  );
}

function namesFrom(value: unknown): string[] {
  return array(value)
    .map((item) => object(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => stringValue(item.name))
    .filter(Boolean);
}

function getPath(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    const currentObject = object(current);
    if (!currentObject) return undefined;
    current = currentObject[key];
  }
  return current;
}

function dedupeSongs(songs: Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const key = `${song.source}:${song.id}`;
    if (!song.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function interleaveSongs(
  netease: Song[],
  qq: Song[],
  limit = 60,
): Song[] {
  const result: Song[] = [];
  const max = Math.max(netease.length, qq.length);
  for (let index = 0; index < max && result.length < limit; index += 1) {
    if (netease[index]) result.push(netease[index]);
    if (qq[index] && result.length < limit) result.push(qq[index]);
  }
  return result;
}

export async function searchNetease(
  keyword: string,
  cookie = "",
  limit = 30,
  page = 1,
): Promise<Song[]> {
  const offset = Math.max(0, page - 1) * limit;
  const safeLimit = Math.max(1, Math.min(50, limit));
  const params = new URLSearchParams({
    s: keyword,
    type: "1",
    offset: String(offset),
    limit: String(safeLimit),
    total: "true",
  });
  const headers = {
    Referer: "https://music.163.com/",
    Cookie: neteaseCookieHeader(cookie),
  };
  const attempts: Array<{
    url: string;
    method: "GET" | "POST";
    body?: string;
    headers?: Record<string, string>;
  }> = [
    {
      url: "https://music.163.com/api/cloudsearch/pc",
      method: "POST",
      body: params.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
    {
      url: "https://interface.music.163.com/api/cloudsearch/pc",
      method: "POST",
      body: params.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
    {
      url: `https://music.163.com/api/search/get?${params}`,
      method: "GET",
    },
    {
      url: `https://interface.music.163.com/api/search/get?${params}`,
      method: "GET",
    },
  ];
  let hadSuccessfulResponse = false;
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const data = await requestJson(
        attempt.url,
        { ...headers, ...attempt.headers },
        attempt.method,
        attempt.body,
      );
      const apiError = neteasePayloadError(data);
      if (apiError) throw apiError;
      hadSuccessfulResponse = true;
      const parsed = parseNeteaseSearchPayload(data);
      if (parsed.length) return enrichNeteaseCovers(parsed, cookie);
    } catch (error) {
      lastError = error;
    }
  }
  if (hadSuccessfulResponse) return [];
  throw lastError ?? new Error("网易云搜索接口没有返回有效数据");
}

export function parseNeteaseSearchPayload(data: unknown): Song[] {
  const songs = array(getPath(data, "result", "songs"));
  return dedupeSongs(
    songs
      .map((item) => {
        const raw = object(item) ?? {};
        const album = object(raw.album) ?? object(raw.al) ?? {};
        return {
          source: "netease" as const,
          id: stringValue(raw.id),
          title: stringValue(raw.name).trim(),
          artists:
            namesFrom(raw.artists).length > 0
              ? namesFrom(raw.artists)
              : namesFrom(raw.ar),
          album: stringValue(album.name),
          durationMs: numberValue(raw.duration ?? raw.dt),
          coverUrl: neteaseCover(raw),
          raw,
        };
      })
      .filter((song) => song.title && song.id),
  );
}

function neteasePayloadError(data: unknown): Error | null {
  const response = object(data);
  const code = numberValue(response?.code);
  if (!code || code === 200) return null;
  const message =
    stringValue(response?.message) ||
    stringValue(response?.msg) ||
    `网易云接口返回错误码 ${code}`;
  return new Error(message);
}

async function enrichNeteaseCovers(
  songs: Song[],
  cookie: string,
): Promise<Song[]> {
  const missing = songs.filter((song) => !song.coverUrl);
  if (!missing.length) return songs;
  try {
    const ids = `[${missing.map((song) => song.id).join(",")}]`;
    const detail = await requestJson(
      `https://music.163.com/api/song/detail?ids=${encodeURIComponent(ids)}`,
      {
        Referer: "https://music.163.com/",
        Cookie: cookieHeader(cookie),
      },
    );
    const covers = new Map<string, string>();
    for (const item of array(getPath(detail, "songs"))) {
      const raw = object(item);
      if (!raw) continue;
      const url = neteaseCover(raw);
      if (url) covers.set(stringValue(raw.id), url);
    }
    let resolved = songs.map((song) => ({
      ...song,
      coverUrl: song.coverUrl || covers.get(song.id) || "",
    }));
    const missingSongs = resolved.filter((song) => !song.coverUrl);
    if (missingSongs.length) {
      const individual = await Promise.all(
        missingSongs.map(async (song) => {
          try {
            const data = await requestJson(
              `https://music.163.com/api/song/detail?ids=${encodeURIComponent(`[${song.id}]`)}`,
              {
                Referer: "https://music.163.com/",
                Cookie: cookieHeader(cookie),
              },
            );
            const raw = object(array(getPath(data, "songs"))[0]);
            return [song.id, raw ? neteaseCover(raw) : ""] as const;
          } catch {
            return [song.id, ""] as const;
          }
        }),
      );
      const fallbackCovers = new Map(individual.filter(([, url]) => url));
      resolved = resolved.map((song) => ({
        ...song,
        coverUrl: song.coverUrl || fallbackCovers.get(song.id) || "",
      }));
    }
    return resolved;
  } catch {
    // Search still remains usable if the optional cover enrichment fails.
    return songs;
  }
}

async function searchQqLegacy(
  keyword: string,
  cookie: string,
  limit: number,
  page: number,
): Promise<Song[]> {
  const params = new URLSearchParams({
    p: String(page),
    n: String(Math.max(1, Math.min(50, limit))),
    w: keyword,
    format: "json",
    inCharset: "utf-8",
    outCharset: "utf-8",
    notice: "0",
    platform: "yqq",
    needNewCode: "0",
  });
  const data = await requestJson(
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${params}`,
    {
      Referer: "https://y.qq.com/",
      Cookie: cookieHeader(cookie),
    },
  );
  const songs = array(getPath(data, "data", "song", "list"));
  const parsed = dedupeSongs(
    songs.map((item) => {
      const raw = object(item) ?? {};
      const mid = stringValue(raw.songmid ?? raw.mid);
      const albumMid = stringValue(raw.albummid);
      return {
        source: "qq" as const,
        id: mid,
        mid,
        numericId: stringValue(raw.songid ?? raw.id),
        title: stringValue(raw.songname ?? raw.name).trim(),
        artists: namesFrom(raw.singer),
        album: stringValue(raw.albumname),
        albumMid,
        durationMs: numberValue(raw.interval) * 1000,
        coverUrl: albumMid
          ? QQ_COVER.replace("{albummid}", albumMid)
          : "",
        raw,
      };
    }).filter((song) => song.title && song.id),
  );
  return enrichQqCovers(parsed, cookie);
}

async function searchQqMusicu(
  keyword: string,
  cookie: string,
  limit: number,
  page: number,
): Promise<Song[]> {
  const body = JSON.stringify({
    comm: {
      ct: 20,
      cv: 1859,
      uin: "0",
      format: "json",
      platform: "yqq",
    },
    req_1: {
      method: "DoSearchForQQMusicDesktop",
      module: "music.search.SearchCgiService",
      param: {
        num_per_page: Math.max(1, Math.min(50, limit)),
        page_num: Math.max(1, page),
        query: keyword.trim(),
        search_type: 0,
      },
    },
  });
  const data = await requestJson(
    "https://u.y.qq.com/cgi-bin/musicu.fcg",
    {
      Referer: "https://y.qq.com/",
      "Content-Type": "application/json",
      Cookie: cookieHeader(cookie),
    },
    "POST",
    body,
  );
  const songs = array(getPath(data, "req_1", "data", "body", "song", "list"));
  const parsed = dedupeSongs(
    songs.map((item) => {
      const raw = object(item) ?? {};
      const album = object(raw.album) ?? {};
      const mid = stringValue(raw.mid);
      const albumMid = stringValue(album.mid);
      return {
        source: "qq" as const,
        id: mid,
        mid,
        numericId: stringValue(raw.id),
        title: stringValue(raw.name ?? raw.title).trim(),
        artists: namesFrom(raw.singer),
        album: stringValue(album.title ?? album.name),
        albumMid,
        durationMs: numberValue(raw.interval) * 1000,
        coverUrl: albumMid
          ? QQ_COVER.replace("{albummid}", albumMid)
          : "",
        raw,
      };
    }).filter((song) => song.title && song.id),
  );
  return enrichQqCovers(parsed, cookie);
}

async function enrichQqCovers(
  songs: Song[],
  cookie: string,
): Promise<Song[]> {
  const missing = songs.filter(
    (song) => !song.coverUrl || !song.albumMid,
  );
  if (!missing.length) return songs;
  const resolved = await Promise.all(
    missing.map(async (song) => {
      if (song.coverUrl && song.albumMid) return song;
      const mid = song.mid || song.id;
      try {
        const params = new URLSearchParams({
          songmid: mid,
          format: "json",
          platform: "yqq",
          needNewCode: "0",
          outCharset: "utf-8",
        });
        const data = await requestJson(
          `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${params}`,
          {
            Referer: "https://y.qq.com/",
            Cookie: cookieHeader(cookie),
          },
        );
        const raw = object(array(getPath(data, "data"))[0]);
        const album = object(raw?.album) ?? {};
        const albumMid = stringValue(album.mid) || song.albumMid || "";
        const pageCover = albumMid
          ? ""
          : await fetchQqShareCover(mid);
        return {
          ...song,
          albumMid,
          coverUrl: albumMid
            ? QQ_COVER.replace("{albummid}", albumMid)
            : pageCover || song.coverUrl,
        };
      } catch {
        return song;
      }
    }),
  );
  const byId = new Map(resolved.map((song) => [song.id, song]));
  return songs.map((song) => byId.get(song.id) || song);
}

async function fetchQqShareCover(mid: string): Promise<string> {
  if (!mid) return "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await httpRequest({
        url: `https://y.qq.com/n/ryqq_v2/songDetail/${mid}`,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          Referer: "https://y.qq.com/",
        },
      });
      if (response.status >= 200 && response.status < 300) {
        const cover = extractQqPageCover(response.text);
        if (cover) return cover;
      }
    } catch {
      // The share page can intermittently time out; retry once below.
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  return "";
}

export function extractQqPageCover(html: string): string {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /["'](?:coverUrl|picurl)["']\s*:\s*["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const cover = normalizeQqCover(match?.[1] || "");
    if (cover) return cover;
  }
  return "";
}

function normalizeQqCover(value: string): string {
  if (!value) return "";
  const decoded = value
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
  if (decoded.startsWith("//")) return `https:${decoded}`;
  if (decoded.startsWith("http://")) return decoded.replace(/^http:/, "https:");
  return /^https:\/\//i.test(decoded) ? decoded : "";
}

export async function searchQq(
  keyword: string,
  cookie = "",
  limit = 30,
  page = 1,
): Promise<Song[]> {
  try {
    const songs = await searchQqLegacy(keyword, cookie, limit, page);
    if (songs.length) return songs;
  } catch {
    // Fall through to the desktop endpoint.
  }
  return searchQqMusicu(keyword, cookie, limit, page);
}

export async function searchSource(
  source: ProviderSource,
  keyword: string,
  cookie: string,
  limit = 30,
  page = 1,
): Promise<Song[]> {
  const variants = queryVariants(keyword);
  const collected: Song[] = [];
  let lastError: unknown = null;
  const runVariant = async (variant: string) => {
    try {
      const songs = await withProviderConcurrency(source, () =>
        source === "netease"
          ? searchNetease(variant, cookie, limit, page)
          : searchQq(variant, cookie, limit, page),
      );
      collected.push(...songs);
    } catch (error) {
      lastError = error;
    }
  };
  if (isHighPerformanceMode() && variants.length > 1) {
    await Promise.all(variants.map(runVariant));
  } else {
    for (const variant of variants) await runVariant(variant);
  }
  const merged = dedupeSongs(collected).slice(0, limit);
  if (merged.length) return merged;
  if (lastError) {
    throw lastError;
  }
  return [];
}

export async function searchAll(
  keyword: string,
  options: {
    cookies?: Partial<Record<ProviderSource, string>>;
    source?: "all" | ProviderSource;
    limit?: number;
    page?: number;
  } = {},
): Promise<{
  songs: Song[];
  bySource: Partial<Record<ProviderSource, Song[]>>;
  warnings: string[];
}> {
  const query = keyword.trim();
  const limit = options.limit ?? 20;
  const page = options.page ?? 1;
  const sources: ProviderSource[] =
    options.source && options.source !== "all"
      ? [options.source]
      : ["netease", "qq"];
  const warnings: string[] = [];
  const bySource: Partial<Record<ProviderSource, Song[]>> = {};
  await Promise.all(
    sources.map(async (source) => {
      try {
        bySource[source] = await searchSource(
          source,
          query,
          options.cookies?.[source] || "",
          limit,
          page,
        );
      } catch (error) {
        bySource[source] = [];
        warnings.push(
          `${source === "netease" ? "网易云" : "QQ 音乐"}搜索失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
  const songs =
    sources.length === 1
      ? bySource[sources[0]] || []
      : interleaveSongs(
          bySource.netease || [],
          bySource.qq || [],
          limit * 2,
        );
  return { songs, bySource, warnings };
}

export async function fetchNeteaseLyrics(
  song: Song,
  cookie = "",
): Promise<Lyrics> {
  if (!/^\d+$/.test(song.id)) throw new Error("无效的网易云歌曲 ID");
  const params = new URLSearchParams({
    id: song.id,
    lv: "-1",
    kv: "-1",
    tv: "-1",
    rv: "-1",
    yv: "-1",
    ytv: "-1",
    yrv: "-1",
  });
  let data: unknown = null;
  let lastError: unknown = null;
  for (const endpoint of [
    `https://music.163.com/api/song/lyric/v1?${params}`,
    `https://music.163.com/api/song/lyric?${params}`,
    `https://interface3.music.163.com/api/song/lyric?${params}`,
  ]) {
    try {
      const candidate = await requestJson(endpoint, {
        Referer: "https://music.163.com/",
        Cookie: cookieHeader(cookie),
      });
      const candidateLrc =
        stringValue(getPath(candidate, "lrc", "lyric")) ||
        stringValue(getPath(candidate, "yrc", "lyric"));
      if (candidateLrc.trim()) {
        data = candidate;
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (!data) {
    throw (
      lastError ??
      new Error("没有找到这首歌的歌词")
    );
  }
  const yrc = stringValue(getPath(data, "yrc", "lyric"));
  const lrc = stringValue(getPath(data, "lrc", "lyric"));
  const translation = stringValue(getPath(data, "tlyric", "lyric"));
  const romanization = stringValue(getPath(data, "romalrc", "lyric"));
  let lyrics: Lyrics;
  if (yrc.trim()) {
    lyrics = parseYrc(yrc, song);
    mergeTranslation(lyrics, translation, romanization);
    lyrics.rawLrc = lrc;
    lyrics.providerNote = "YRC 逐字歌词";
    if (lyrics.lines.every((line) => !line.text.trim()) && lrc) {
      lyrics = parseLrc(lrc, { song });
      mergeTranslation(lyrics, translation, romanization);
      lyrics.providerNote = "LRC 歌词";
    }
    return lyrics;
  }
  if (!lrc.trim()) throw new Error("没有找到这首歌的歌词");
  lyrics = parseLrc(lrc, { song });
  mergeTranslation(lyrics, translation, romanization);
  lyrics.rawLrc = lrc;
  lyrics.providerNote = "LRC 歌词";
  return lyrics;
}

function decodeBase64Text(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^\[|\{|\</.test(trimmed)) return trimmed;
  try {
    const binary = atob(trimmed);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return trimmed;
  }
}

export async function fetchQqLrc(
  song: Song,
  cookie = "",
): Promise<Lyrics> {
  const mid = song.mid || song.id;
  if (!mid) throw new Error("缺少 QQ 歌曲 mid");
  const baseParams = {
    songmid: mid,
    format: "json",
    nobase64: "1",
    g_tk: "5381",
    pcachetime: String(Date.now()),
    inCharset: "utf8",
    outCharset: "utf8",
    notice: "0",
    platform: "yqq",
    needNewCode: "0",
  } satisfies Record<string, string>;
  const attempts: string[] = [];
  const params = new URLSearchParams(baseParams);
  attempts.push(
    `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${params}`,
    `https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${params}`,
  );
  if (song.numericId) {
    const numericParams = new URLSearchParams(baseParams);
    numericParams.delete("songmid");
    numericParams.set("musicid", song.numericId);
    attempts.push(
      `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${numericParams}`,
    );
  }

  let lyricText = "";
  let transText = "";
  let lastError: unknown = null;
  for (const url of attempts) {
    try {
      const response = await httpRequest({
        url,
        headers: {
          "User-Agent": USER_AGENT,
          Referer: "https://y.qq.com/",
          Cookie: cookieHeader(cookie),
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`QQ 歌词接口返回 HTTP ${response.status}`);
      }
      const data = object(parseJson(response.text)) ?? {};
      lyricText = decodeBase64Text(stringValue(data.lyric));
      transText = decodeBase64Text(stringValue(data.trans));
      if (lyricText.trim()) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!lyricText.trim()) {
    throw lastError ?? new Error("没有找到这首歌的歌词");
  }
  const lyrics = parseLrc(lyricText, { song });
  if (transText.trim()) {
    mergeFieldByTime(lyrics, parseLrc(transText, { song }), "translation");
    mergeTranslation(lyrics, transText, "");
  }
  lyrics.rawLrc = lyricText;
  lyrics.providerNote = "LRC 歌词";
  return lyrics;
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function fetchQqQrc(
  song: Song,
  cookie = "",
): Promise<Lyrics> {
  const numericId = song.numericId || "";
  if (!numericId) throw new Error("缺少 QQ 数字歌曲 ID");
  const artist = artistText(song);
  const songIdValue = Number(numericId);
  const body = JSON.stringify({
    comm: { ct: 19, cv: 2111, v: 2111, os_ver: "15" },
    request: {
      method: "GetPlayLyricInfo",
      module: "music.musichallSong.PlayLyricInfo",
      param: {
        albumName: utf8Base64(song.album),
        crypt: 1,
        ct: 19,
        cv: 2111,
        interval: Math.max(0, Math.floor(song.durationMs / 1000)),
        lrc_t: 0,
        qrc: 1,
        qrc_t: 0,
        roma: 1,
        roma_t: 0,
        singerName: utf8Base64(artist === "未知歌手" ? "" : artist),
        songID: Number.isSafeInteger(songIdValue) ? songIdValue : numericId,
        songName: utf8Base64(song.title),
        trans: 1,
        trans_t: 0,
        type: 0,
      },
    },
  });
  const data = await requestJson(
    "https://u.y.qq.com/cgi-bin/musicu.fcg",
    {
      Referer: "https://y.qq.com/",
      "Content-Type": "application/json",
      Cookie: cookieHeader(cookie),
    },
    "POST",
    body,
  );
  const payload = object(getPath(data, "request", "data")) ?? {};
  const encrypted = stringValue(payload.lyric).trim();
  if (!encrypted) throw new Error("QQ 没有返回逐字歌词");
  const decoded = /^\[|\{|\</.test(encrypted)
    ? encrypted
    : decryptQrc(encrypted);
  const lyrics = parseQrc(decoded, song);
  lyrics.providerNote = "QRC 逐字歌词";
  for (const [field, key] of [
    ["translation", "trans"],
    ["romanization", "roma"],
  ] as const) {
    const auxiliaryEncrypted = stringValue(payload[key]).trim();
    if (!auxiliaryEncrypted) continue;
    let auxiliaryText = auxiliaryEncrypted;
    if (!/^\[|\{|\</.test(auxiliaryEncrypted)) {
      try {
        auxiliaryText = decryptQrc(auxiliaryEncrypted);
      } catch {
        auxiliaryText = "";
      }
    }
    if (!auxiliaryText.trim()) continue;
    const auxiliary = auxiliaryText.includes("<Lyric_1")
      ? parseQrc(auxiliaryText, song)
      : parseLrc(auxiliaryText, { song });
    mergeFieldByTime(lyrics, auxiliary, field);
  }
  return lyrics;
}

export async function fetchQqLyrics(
  song: Song,
  cookie = "",
): Promise<Lyrics> {
  try {
    const qrc = await fetchQqQrc(song, cookie);
    if (qrc.lines.length) return qrc;
  } catch {
    // Older songs often only expose standard LRC.
  }
  return fetchQqLrc(song, cookie);
}

export async function fetchLyrics(
  song: Song,
  cookie = "",
): Promise<Lyrics> {
  if (song.source === "netease") return fetchNeteaseLyrics(song, cookie);
  return fetchQqLyrics(song, cookie);
}

export async function fetchLyricsWithFallback(
  song: Song,
  cookies: Partial<Record<ProviderSource, string>> = {},
): Promise<Lyrics> {
  let primaryError: unknown = null;
  try {
    const primary = await withProviderConcurrency(song.source, () =>
      fetchLyrics(song, cookies[song.source] || ""),
    );
    if (primary.lines.some((line) => line.text.trim())) {
      return primary;
    }
    primaryError = new Error("平台返回的歌词为空");
  } catch (error) {
    primaryError = error;
  }

  const cleanedTitle =
    normalizeLoose(song.title).replace(/[\s/\\|._-]+$/g, "").trim() ||
    song.title.trim();
  const firstArtist = splitArtists(artistText(song))[0] || "";
  const queries = [
    cleanedTitle,
    firstArtist && firstArtist !== "未知歌手"
      ? `${cleanedTitle} ${firstArtist}`
      : "",
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const candidates = new Map<string, Song>();
  await Promise.all(
    queries.slice(0, 2).flatMap((query) =>
      (["netease", "qq"] as const).map(async (source) => {
        try {
          const songs = await searchProvider(
            source,
            query,
            cookies[source] || "",
            10,
          );
          for (const candidate of songs) {
            candidates.set(`${candidate.source}:${candidate.id}`, candidate);
          }
        } catch {
          // A fallback query can fail on one provider without blocking the other.
        }
      }),
    ),
  );

  const targetTitle = normalizeText(cleanedTitle);
  const targetArtists = new Set(
    splitArtists(artistText(song)).map(normalizeText).filter(Boolean),
  );
  const ranked = [...candidates.values()]
    .map((candidate) => {
      const candidateTitle = normalizeText(normalizeLoose(candidate.title));
      const candidateArtists = new Set(
        candidate.artists.map(normalizeText).filter(Boolean),
      );
      const exactTitle = Boolean(
        targetTitle && candidateTitle && targetTitle === candidateTitle,
      );
      const containsTitle = Boolean(
        targetTitle &&
          candidateTitle &&
          Math.min(targetTitle.length, candidateTitle.length) >= 5 &&
          (targetTitle.includes(candidateTitle) ||
            candidateTitle.includes(targetTitle)),
      );
      const artistOverlap = [...targetArtists].some((name) =>
        candidateArtists.has(name),
      );
      const durationDiff =
        song.durationMs > 0 && candidate.durationMs > 0
          ? Math.abs(song.durationMs - candidate.durationMs)
          : null;
      let score = exactTitle
        ? 60
        : containsTitle
          ? 42
          : Math.round(
              35 * sequenceRatio(targetTitle, candidateTitle),
            );
      if (artistOverlap) score += 25;
      if (candidate.source === song.source) score += 3;
      if (durationDiff !== null) {
        if (durationDiff <= 3000) score += 15;
        else if (durationDiff <= 6000) score += 8;
        else if (durationDiff > 20_000) score -= 18;
      }
      return { candidate, score, exactTitle, containsTitle };
    })
    .filter(
      (item) =>
        item.candidate.id !== song.id &&
        (item.exactTitle || item.containsTitle || item.score >= 45),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  try {
    return await Promise.any(
      ranked.map(async (item) => {
        const lyrics = await withProviderConcurrency(
          item.candidate.source,
          () =>
            fetchLyrics(
              item.candidate,
              cookies[item.candidate.source] || "",
            ),
        );
        if (!lyrics.lines.some((line) => line.text.trim())) {
          throw new Error("备用候选歌词为空");
        }
        lyrics.providerNote = `${lyrics.providerNote} · 备用匹配《${item.candidate.title}》`;
        return lyrics;
      }),
    );
  } catch {
    // Fall through to the original platform error.
  }
  throw (
    primaryError ||
    new Error("没有找到这首歌的歌词")
  );
}

export async function searchProvider(
  source: ProviderSource,
  keyword: string,
  cookie = "",
  limit = 25,
  page = 1,
): Promise<Song[]> {
  return searchSource(source, keyword, cookie, limit, page);
}

export async function resolveSongLink(
  text: string,
  cookies: Partial<Record<ProviderSource, string>> = {},
): Promise<Song | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let identifiers = extractSongLinkIdentifiers(trimmed);
  if (
    !identifiers.neteaseId &&
    !identifiers.qqMid &&
    !identifiers.qqNumericId &&
    /^\d{5,}$/.test(trimmed)
  ) {
    identifiers = { neteaseId: trimmed, qqMid: "", qqNumericId: "" };
  }

  const sharedUrl = extractHttpUrl(trimmed);
  if (
    !identifiers.neteaseId &&
    !identifiers.qqMid &&
    !identifiers.qqNumericId &&
    sharedUrl
  ) {
    try {
      const response = await httpRequest({ url: sharedUrl });
      identifiers = extractSongLinkIdentifiers(
        `${response.finalUrl}\n${response.text}`,
      );
    } catch {
      return null;
    }
  }
  if (identifiers.neteaseId) {
    const data = await requestJson(
      `https://music.163.com/api/song/detail?ids=${encodeURIComponent(`[${identifiers.neteaseId}]`)}`,
      {
        Referer: "https://music.163.com/",
        Cookie: cookieHeader(cookies.netease || ""),
      },
    );
    const raw = object(array(getPath(data, "songs"))[0]);
    if (!raw) return null;
    const album = object(raw.album ?? raw.al) ?? {};
    return {
      source: "netease",
      id: stringValue(raw.id) || identifiers.neteaseId,
      title: stringValue(raw.name),
      artists: namesFrom(raw.artists ?? raw.ar),
      album: stringValue(album.name),
      durationMs: numberValue(raw.duration ?? raw.dt),
      coverUrl: thumb(stringValue(album.picUrl)),
      raw,
    };
  }
  if (identifiers.qqMid || identifiers.qqNumericId) {
    const params = new URLSearchParams({
      format: "json",
      platform: "yqq",
      needNewCode: "0",
      outCharset: "utf-8",
    });
    if (identifiers.qqMid) params.set("songmid", identifiers.qqMid);
    else params.set("songid", identifiers.qqNumericId);
    const data = await requestJson(
      `https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${params}`,
      {
        Referer: "https://y.qq.com/",
        Cookie: cookieHeader(cookies.qq || ""),
      },
    );
    const raw = object(array(getPath(data, "data"))[0]);
    if (!raw) return null;
    const album = object(raw.album) ?? {};
    const albumMid = stringValue(album.mid);
    const resolvedMid = stringValue(raw.mid ?? raw.songmid);
    return {
      source: "qq",
      id: resolvedMid || identifiers.qqMid || identifiers.qqNumericId,
      mid: resolvedMid || identifiers.qqMid || undefined,
      numericId: stringValue(raw.id),
      title: stringValue(raw.title ?? raw.name),
      artists: namesFrom(raw.singer),
      album: stringValue(album.name),
      albumMid,
      durationMs: numberValue(raw.interval) * 1000,
      coverUrl: albumMid ? QQ_COVER.replace("{albummid}", albumMid) : "",
      raw,
    };
  }
  return null;
}
