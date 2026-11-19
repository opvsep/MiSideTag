import type {
  AppConfig,
  AppPaths,
  HttpRequest,
  HttpResponse,
  LocalTrack,
} from "../types";

export function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

async function invokeCommand<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauri()) {
    throw new Error("当前运行在浏览器预览模式，桌面能力不可用");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

const CONFIG_KEY = "misidetag-tauri-config";

export async function loadConfigRaw(): Promise<unknown | null> {
  if (!isTauri()) {
    const text = localStorage.getItem(CONFIG_KEY);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return invokeCommand<unknown | null>("load_config");
}

export async function saveConfigRaw(config: AppConfig): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return;
  }
  await invokeCommand<void>("save_config", { config });
}

export async function loadAppPaths(): Promise<AppPaths> {
  if (!isTauri()) {
    return {
      appDir: "browser-preview",
      dataDir: "browser-preview/data",
      configPath: "browser-preview/data/config.json",
      cacheDir: "browser-preview/data/cache",
      downloadsDir: "browser-preview/data/downloads",
      logDir: "browser-preview/data/logs",
      fallback: false,
    };
  }
  return invokeCommand<AppPaths>("app_paths");
}

export async function httpRequest(request: HttpRequest): Promise<HttpResponse> {
  if (!isTauri()) {
    const response = await fetch(request.url, {
      method: request.method || "GET",
      headers: request.headers,
      body: request.body,
    });
    return {
      status: response.status,
      finalUrl: response.url,
      text: await response.text(),
    };
  }
  return invokeCommand<HttpResponse>("http_request", { request });
}

export async function fetchImageAsDataUrl(
  url: string,
  referer?: string,
): Promise<string> {
  if (!isTauri()) return url;
  return invokeCommand<string>("fetch_image_data_url", { url, referer });
}

export async function setPerformanceMode(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await invokeCommand<void>("set_performance_mode", { enabled });
}

export async function selectAudioFiles(): Promise<string[]> {
  if (!isTauri()) return [];
  return invokeCommand<string[]>("select_audio_files");
}

export async function selectAudioFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  return invokeCommand<string | null>("select_audio_folder");
}

export async function selectDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  return invokeCommand<string | null>("select_directory");
}

export async function selectSaveFile(
  defaultName: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  return invokeCommand<string | null>("select_save_file", { defaultName });
}

export async function scanAudio(
  paths: string[],
  recursive = true,
): Promise<LocalTrack[]> {
  if (!isTauri()) return [];
  return invokeCommand<LocalTrack[]>("scan_audio", { paths, recursive });
}

export async function embedLyrics(path: string, text: string): Promise<void> {
  await invokeCommand<void>("embed_lyrics", { path, text });
}

export async function writeLyricsFile(
  path: string,
  text: string,
  bom = false,
  overwrite = true,
): Promise<void> {
  await invokeCommand<void>("write_lyrics_file", {
    path,
    text,
    bom,
    overwrite,
  });
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri()) return;
  await invokeCommand<void>("open_path", { path });
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invokeCommand<void>("open_external", { url });
}

export async function exitApp(): Promise<void> {
  await invokeCommand<void>("exit_app");
}
