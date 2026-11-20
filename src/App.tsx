import { startTransition, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  FolderPlus,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { CandidateDialog } from "./components/CandidateDialog";
import { ExitConfirmDialog } from "./components/ExitConfirmDialog";
import { LocalPage } from "./components/LocalPage";
import { LyricCheckDialog } from "./components/LyricCheckDialog";
import { SearchPage } from "./components/SearchPage";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar, type Page } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import {
  loadAppPaths,
  exitApp,
  openPath,
  openExternalUrl,
  scanAudio,
  selectAudioFiles,
  selectAudioFolder,
  selectDirectory,
  selectSaveFile,
  setPerformanceMode,
  writeLyricsFile,
} from "./lib/bridge";
import { setCoverPerformanceMode } from "./components/SongCover";
import {
  DEFAULT_CONFIG,
  loadConfig as readConfig,
  persistConfig,
  onlineSaveDirectory,
} from "./lib/config";
import {
  DEMO_LYRICS,
  DEMO_SONGS,
  demoMatches,
} from "./lib/demo";
import { formatLrc } from "./lib/lyrics";
import {
  buildQueries,
  finalizeMatch,
  preferredTopCandidate,
  rankVariants,
} from "./lib/matching";
import {
  normalizeMatchingConcurrency,
  runConcurrent,
} from "./lib/concurrency";
import { configureHighPerformance } from "./lib/performance";
import {
  fetchLyricsWithFallback,
  resolveSongLink,
  searchAll,
  searchProvider,
} from "./lib/providers";
import {
  checkLyrics,
  type LyricCheckReport,
} from "./lib/quality";
import { extractHttpUrl } from "./lib/links";
import {
  saveLocalLyrics,
  saveOnlineLyrics,
} from "./lib/services";
import type {
  AppConfig,
  AppPaths,
  LocalMatch,
  Lyrics,
  MatchCandidate,
  ProviderSource,
  Song,
} from "./types";
import { SOURCE_SHORT, songKey } from "./types";

type Filter = "all" | ProviderSource;

interface ToastState {
  tone: "info" | "success" | "error";
  message: string;
}

const EMPTY_PATHS: AppPaths = {
  appDir: "",
  dataDir: "",
  configPath: "",
  cacheDir: "",
  downloadsDir: "",
  logDir: "",
  fallback: false,
};

export default function App() {
  const [config, setConfig] = useState<AppConfig>(
    structuredClone(DEFAULT_CONFIG),
  );
  const [paths, setPaths] = useState<AppPaths>(EMPTY_PATHS);
  const [page, setPage] = useState<Page>("search");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsError, setLyricsError] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchPageNumber, setSearchPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [karaokeRunning, setKaraokeRunning] = useState(false);
  const [karaokeLine, setKaraokeLine] = useState(0);
  const [localMatches, setLocalMatches] = useState<LocalMatch[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [localBusy, setLocalBusy] = useState(false);
  const [candidateRow, setCandidateRow] = useState<number | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [checkReport, setCheckReport] = useState<LyricCheckReport | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const searchGeneration = useRef(0);
  const lyricsGeneration = useRef(0);
  const localCancel = useRef(false);
  const lyricsCache = useRef(new Map<string, Lyrics>());
  const karaokeStartedAt = useRef(0);
  const karaokeBaseMs = useRef(0);
  const demoBootstrapped = useRef(false);
  const exitAllowed = useRef(false);

  useEffect(() => {
    let disposed = false;
    void Promise.all([readConfig(), loadAppPaths()])
      .then(([loadedConfig, loadedPaths]) => {
        if (disposed) return;
        setConfig(loadedConfig);
        setPaths(loadedPaths);
        if (!demoBootstrapped.current) {
          setQuery(loadedConfig.search.lastQuery);
        }
        setFilter(loadedConfig.search.defaultSource);
      })
      .catch((error) => {
        if (disposed) return;
        setToast({
          tone: "error",
          message: `初始化失败：${error instanceof Error ? error.message : String(error)}`,
        });
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const highPerformance = config.performance.highPerformance;
    configureHighPerformance(highPerformance);
    setCoverPerformanceMode(highPerformance);
    void setPerformanceMode(highPerformance).catch(() => {
      // Browser preview and older runtimes keep the frontend-side profile.
    });
  }, [config.performance.highPerformance]);

  useEffect(() => {
    if (demoBootstrapped.current) return;
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    demoBootstrapped.current = true;
    setDemoMode(true);
    setQuery("夜曲 周杰伦");
    setSongs(DEMO_SONGS);
    setSelectedSong(DEMO_SONGS[0]);
    setLyrics(DEMO_LYRICS.get(songKey(DEMO_SONGS[0])) || null);
    setLocalMatches(demoMatches());
    setSelectedRows(new Set([0, 1, 2, 3]));
  }, []);

  useEffect(() => {
    const requestedPage = new URLSearchParams(window.location.search).get("page");
    if (requestedPage === "local" || requestedPage === "settings") {
      setPage(requestedPage);
    }
  }, []);

  useEffect(() => {
    if (!karaokeRunning || !lyrics?.lines.length) return;
    const lines = lyrics.lines;
    const timer = window.setInterval(() => {
      const target =
        karaokeBaseMs.current +
        (performance.now() - karaokeStartedAt.current);
      let active = 0;
      for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].startMs <= target) active = index;
        else break;
      }
      setKaraokeLine(active);
      const last = lines.at(-1);
      if (last && target > Math.max(last.endMs, last.startMs + 2000)) {
        setKaraokeRunning(false);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [karaokeRunning, lyrics]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (event.key === "Escape") {
        setShowExitConfirm(false);
        setCheckReport(null);
        setCandidateRow(null);
        return;
      }
      if (!event.ctrlKey) return;
      if (typing && ["f", "o"].includes(event.key.toLowerCase())) return;
      switch (event.key.toLowerCase()) {
        case "1":
          event.preventDefault();
          setPage("search");
          break;
        case "2":
          event.preventDefault();
          setPage("local");
          break;
        case "3":
          event.preventDefault();
          setPage("settings");
          break;
        case "f":
          event.preventDefault();
          setPage("search");
          window.setTimeout(() => {
            document.getElementById("search-input")?.focus();
          }, 0);
          break;
        case "o":
          event.preventDefault();
          setPage("local");
          if (event.shiftKey) void addFolder();
          else void addFiles();
          break;
        case "q":
          event.preventDefault();
          setShowExitConfirm(true);
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const current = getCurrentWindow();
        const stop = await current.onCloseRequested((event) => {
          if (exitAllowed.current) return;
          event.preventDefault();
          setShowExitConfirm(true);
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch {
        // Browser preview has no native close request.
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const notify = (tone: ToastState["tone"], message: string) => {
    setToast({ tone, message });
  };

  const loadDemo = () => {
    setDemoMode(true);
    setQuery("夜曲 周杰伦");
    setFilter("all");
    setSongs(DEMO_SONGS);
    setSelectedSong(DEMO_SONGS[0]);
    setLyrics(DEMO_LYRICS.get(songKey(DEMO_SONGS[0])) || null);
    setLyricsError("");
    setLyricsLoading(false);
    setLocalMatches(demoMatches());
    setSelectedRows(new Set([0, 1, 2, 3]));
    setKaraokeRunning(false);
    setKaraokeLine(0);
    setPage("search");
    notify("info", "已加载演示内容");
  };

  const loadSongLyrics = async (song: Song) => {
    const key = songKey(song);
    const generation = ++lyricsGeneration.current;
    setSelectedSong(song);
    setLyricsError("");
    setKaraokeRunning(false);
    setKaraokeLine(0);
    const cached = DEMO_LYRICS.get(key) || lyricsCache.current.get(key);
    if (cached) {
      setLyrics(cached);
      setLyricsLoading(false);
      return;
    }
    setLyrics(null);
    setLyricsLoading(true);
    try {
      const result = await fetchLyricsWithFallback(song, config.cookies);
      if (generation !== lyricsGeneration.current) return;
      lyricsCache.current.set(key, result);
      setLyrics(result);
    } catch (error) {
      if (generation !== lyricsGeneration.current) return;
      setLyricsError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === lyricsGeneration.current) setLyricsLoading(false);
    }
  };

  const runSearch = async (append = false, queryOverride?: string) => {
    const effectiveQuery = (queryOverride ?? query).trim();
    if (!effectiveQuery || searching || loadingMore) return;
    const generation = ++searchGeneration.current;
    const nextPage = append ? searchPageNumber + 1 : 1;
    if (append) setLoadingMore(true);
    else setSearching(true);
    try {
      if (!append && extractHttpUrl(effectiveQuery)) {
        const song = await resolveSongLink(effectiveQuery, config.cookies);
        if (generation !== searchGeneration.current) return;
        if (!song) {
          notify("error", "无法识别这个音乐分享链接");
          return;
        }
        setSongs([song]);
        setHasMore(false);
        setSelectedSong(song);
        await loadSongLyrics(song);
        notify("success", "已通过分享链接定位歌曲");
        return;
      }
      const searchSourceFilter = append ? filter : "all";
      const result = await searchAll(effectiveQuery, {
        cookies: config.cookies,
        source: searchSourceFilter,
        limit: 30,
        page: nextPage,
      });
      if (generation !== searchGeneration.current) return;
      setSearchPageNumber(nextPage);
      setHasMore(
        Object.values(result.bySource).some(
          (sourceSongs) => (sourceSongs?.length || 0) >= 30,
        ),
      );
      startTransition(() => {
        setSongs((current) => {
          if (!append) return result.songs;
          const seen = new Set(current.map(songKey));
          return [
            ...current,
            ...result.songs.filter((song) => {
              const key = songKey(song);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }),
          ];
        });
      });
      if (result.warnings.length) {
        notify("error", result.warnings.join("；"));
      } else if (result.songs.length) {
        notify("success", `已找到 ${result.songs.length} 首歌曲`);
      } else {
        notify("info", "没有找到匹配结果");
      }
      if (result.songs[0]) {
        await loadSongLyrics(result.songs[0]);
      }
    } catch (error) {
      if (generation !== searchGeneration.current) return;
      notify("error", error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === searchGeneration.current) {
        setSearching(false);
        setLoadingMore(false);
      }
    }
  };

  const toggleKaraoke = () => {
    if (!lyrics?.wordLevel) return;
    if (karaokeRunning) {
      setKaraokeRunning(false);
      return;
    }
    const line = lyrics.lines[karaokeLine] || lyrics.lines[0];
    karaokeBaseMs.current = line?.startMs || 0;
    karaokeStartedAt.current = performance.now();
    setKaraokeRunning(true);
  };

  const seekKaraoke = (lineIndex: number) => {
    if (!lyrics) return;
    const line = lyrics.lines[lineIndex];
    if (!line) return;
    setKaraokeLine(lineIndex);
    karaokeBaseMs.current = line.startMs;
    karaokeStartedAt.current = performance.now();
    setKaraokeRunning(Boolean(lyrics.wordLevel));
  };

  const copyLyrics = async () => {
    if (!lyrics) return;
    const text = formatLrc(lyrics, {
      includeTranslation: showTranslation,
      enhanced: config.saving.enhancedLrc,
    });
    try {
      await navigator.clipboard.writeText(text);
      notify("success", "歌词已复制");
    } catch (error) {
      notify("error", `复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const saveOnline = async () => {
    if (!selectedSong || !lyrics) return;
    try {
      const path = await saveOnlineLyrics(
        selectedSong,
        lyrics,
        config,
        paths,
      );
      notify("success", `歌词已保存：${path}`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : String(error));
    }
  };

  const saveOnlineAs = async () => {
    if (!selectedSong || !lyrics) return;
    try {
      const extension = config.saving.enhancedLrc ? "spl" : "lrc";
      const path = await selectSaveFile(
        `${selectedSong.title} - ${selectedSong.artists.join(" / ")}.${extension}`,
      );
      if (!path) return;
      await writeLyricsFile(
        path,
        formatLrc(lyrics, {
          includeTranslation: config.saving.includeTranslation,
          enhanced: config.saving.enhancedLrc,
        }),
        config.saving.bom,
        true,
      );
      notify("success", `歌词已另存为：${path}`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : String(error));
    }
  };

  const openSaveDirectory = () => {
    const directory = onlineSaveDirectory(config, paths);
    void openPath(directory).catch((error) =>
      notify("error", error instanceof Error ? error.message : String(error)),
    );
  };

  const showCurrentCheck = () => {
    if (!lyrics) {
      notify("info", "还没有可检查的歌词");
      return;
    }
    setCheckReport(
      checkLyrics(lyrics, {
        expectedDurationMs: selectedSong?.durationMs,
      }),
    );
  };

  const addTracks = async (targets: string[], recursive: boolean) => {
    if (!targets.length) return;
    setLocalBusy(true);
    try {
      const tracks = await scanAudio(targets, recursive);
      setLocalMatches((current) => {
        const existing = new Set(current.map((item) => item.track.path));
        const fresh = tracks
          .filter((track) => !existing.has(track.path))
          .map<LocalMatch>((track) => ({
            track,
            candidates: [],
            selected: null,
            lyrics: null,
            status: "pending",
            detail: track.error || "等待匹配",
            savedLrc: "",
            embedded: false,
          }));
        setSelectedRows((selected) => {
          const next = new Set(selected);
          for (let index = current.length; index < current.length + fresh.length; index += 1) {
            next.add(index);
          }
          return next;
        });
        return [...current, ...fresh];
      });
      if (tracks.length) {
        notify("success", `已载入 ${tracks.length} 首本地歌曲`);
      } else {
        notify("info", "没有找到支持的音频文件");
      }
    } catch (error) {
      notify("error", error instanceof Error ? error.message : String(error));
    } finally {
      setLocalBusy(false);
    }
  };

  const addFiles = async () => {
    const files = await selectAudioFiles();
    await addTracks(files, false);
  };

  const addFolder = async () => {
    const folder = await selectAudioFolder();
    if (folder) await addTracks([folder], true);
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const stop = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setDragActive(true);
            return;
          }
          if (event.payload.type === "leave") {
            setDragActive(false);
            return;
          }
          if (event.payload.type === "drop") {
            setDragActive(false);
            setPage("local");
            void addTracks(event.payload.paths, true);
          }
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch {
        // Browser preview receives HTML5 drag events instead.
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const matchAll = async () => {
    if (!localMatches.length || localBusy) return;
    if (demoMode) {
      notify("info", "演示数据已经完成匹配");
      return;
    }
    const matchingSources: ProviderSource[] = ["netease", "qq"];
    const concurrency = normalizeMatchingConcurrency(
      config.matching.concurrency,
    );
    localCancel.current = false;
    setLocalBusy(true);
    try {
      await runConcurrent(
        localMatches,
        concurrency,
        async (current, index) => {
          setLocalMatches((matches) =>
            matches.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    status: "matching",
                    detail: `并发 ${concurrency} · 正在搜索平台候选`,
                  }
                : item,
            ),
          );
          try {
            const queries = buildQueries(current.track);
            const collected: Song[] = [];
            const warnings: string[] = [];
            for (const query of queries.slice(0, 3)) {
              if (localCancel.current) break;
              await Promise.all(
                matchingSources.map(async (source) => {
                  try {
                    const result = await searchProvider(
                      source,
                      query,
                      config.cookies[source],
                      25,
                    );
                    collected.push(...result);
                  } catch (error) {
                    warnings.push(
                      `${source === "netease" ? "网易云" : "QQ 音乐"}：${error instanceof Error ? error.message : String(error)}`,
                    );
                  }
                }),
              );
              const ranked = rankVariants(current.track, collected, 24);
              if (ranked[0]?.score >= 45) break;
            }
            const candidates = rankVariants(current.track, collected, 24);
            const match = finalizeMatch(
              current.track,
              candidates,
              config.matching.sensitivity,
              warnings,
              config.matching.prefer,
            );
            if (
              match.selected &&
              config.matching.autoFetchLyrics &&
              !localCancel.current
            ) {
              try {
                match.lyrics = await fetchLyricsWithFallback(
                  match.selected.song,
                  config.cookies,
                );
                match.detail = `${match.detail} · 歌词已载入`;
              } catch (error) {
                match.detail = `${match.detail} · 歌词获取失败：${error instanceof Error ? error.message : String(error)}`;
              }
            }
            setLocalMatches((matches) =>
              matches.map((item, itemIndex) =>
                itemIndex === index ? match : item,
              ),
            );
          } catch (error) {
            setLocalMatches((matches) =>
              matches.map((item, itemIndex) =>
                itemIndex === index
                  ? {
                      ...item,
                      status: "error",
                      detail:
                        error instanceof Error
                          ? error.message
                          : String(error),
                    }
                  : item,
              ),
            );
          }
        },
        () => localCancel.current,
      );
    } finally {
      setLocalBusy(false);
      notify(
        localCancel.current ? "info" : "success",
        localCancel.current ? "匹配已停止" : "本地匹配完成",
      );
    }
  };

  const stopMatch = () => {
    localCancel.current = true;
    setLocalBusy(false);
  };

  const fetchCandidateLyrics = async (
    row: number,
    candidate: MatchCandidate,
  ) => {
    setCandidateLoading(true);
    setLocalMatches((matches) =>
      matches.map((item, index) =>
        index === row
          ? {
              ...item,
              selected: candidate,
              status: "ready",
              detail: `手动选择 · ${candidate.score} 分`,
              lyrics: null,
            }
          : item,
      ),
    );
    setCandidateRow(null);
    try {
      const result = await fetchLyricsWithFallback(
        candidate.song,
        config.cookies,
      );
      lyricsCache.current.set(songKey(candidate.song), result);
      setLocalMatches((matches) =>
        matches.map((item, index) =>
          index === row
            ? {
                ...item,
                lyrics: result,
                detail: `手动选择 · ${candidate.score} 分 · 歌词已载入`,
              }
            : item,
        ),
      );
      notify("success", "候选歌词已载入");
    } catch (error) {
      setLocalMatches((matches) =>
        matches.map((item, index) =>
          index === row
            ? {
                ...item,
                detail: `候选已选择，但歌词获取失败：${error instanceof Error ? error.message : String(error)}`,
              }
            : item,
        ),
      );
    } finally {
      setCandidateLoading(false);
    }
  };

  const searchLocalCandidates = async (
    row: number,
    customQuery: string,
    sourceFilter: Filter,
    page = 1,
    appendExisting = false,
  ): Promise<{
    candidates: MatchCandidate[];
    warnings: string[];
    hasMore: boolean;
  }> => {
    const item = localMatches[row];
    if (!item) {
      return { candidates: [], warnings: [], hasMore: false };
    }
    if (extractHttpUrl(customQuery)) {
      try {
        const song = await resolveSongLink(customQuery, config.cookies);
        const candidates = song
          ? rankVariants(item.track, [song], 1)
          : [];
        const warning = song ? "" : "无法识别这个音乐分享链接";
        setLocalMatches((matches) =>
          matches.map((entry, index) =>
            index === row
              ? {
                  ...entry,
                  candidates,
                  selected: candidates[0] || null,
                  status: candidates.length ? "review" : "none",
                  detail: candidates.length
                    ? `分享链接 · ${SOURCE_SHORT[candidates[0].song.source]}`
                    : warning,
                }
              : entry,
          ),
        );
        if (warning) notify("error", warning);
        return {
          candidates,
          warnings: warning ? [warning] : [],
          hasMore: false,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        notify("error", `分享链接解析失败：${message}`);
        return {
          candidates: [],
          warnings: [`分享链接解析失败：${message}`],
          hasMore: false,
        };
      }
    }
    const sources: ProviderSource[] =
      sourceFilter === "all" ? ["netease", "qq"] : [sourceFilter];
    const collected: Song[] = [];
    const warnings: string[] = [];
    const pageCounts: Record<ProviderSource, number> = {
      netease: 0,
      qq: 0,
    };
    await Promise.all(
      sources.map(async (source) => {
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const songs = await searchProvider(
              source,
              customQuery,
              config.cookies[source],
              30,
              page,
            );
            if (songs.length) {
              collected.push(...songs);
              pageCounts[source] = songs.length;
              return;
            }
          } catch (error) {
            lastError = error;
          }
          await new Promise((resolve) =>
            window.setTimeout(resolve, 220 * (attempt + 1)),
          );
        }
        warnings.push(
          `${source === "netease" ? "网易云" : "QQ 音乐"}未返回结果${lastError ? `：${lastError instanceof Error ? lastError.message : String(lastError)}` : ""}`,
        );
      }),
    );
    const pageCandidates = rankVariants(
      item.track,
      collected,
      sourceFilter === "all" ? 60 : 30,
    );
    const base = appendExisting ? item.candidates : [];
    const merged = new Map<string, MatchCandidate>();
    for (const candidate of [...base, ...pageCandidates]) {
      const key = `${candidate.song.source}:${candidate.song.id}`;
      const previous = merged.get(key);
      if (!previous || candidate.score > previous.score) {
        merged.set(key, candidate);
      }
    }
    const candidates = [...merged.values()].sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.reliable) - Number(left.reliable),
    );
    const hasMore =
      sources.some((source) => pageCounts[source] >= 30);
    setLocalMatches((matches) =>
      matches.map((entry, index) =>
        index === row
          ? {
              ...entry,
              candidates,
              selected: preferredTopCandidate(
                candidates,
                config.matching.prefer,
              ),
              status: candidates.length ? "review" : "none",
              detail: candidates.length
                ? `自定义搜索 · ${candidates.length} 个候选`
                : warnings[0] || "没有找到候选",
            }
          : entry,
      ),
    );
    if (warnings.length) notify("error", warnings.join("；"));
    return { candidates, warnings, hasMore };
  };

  const ensureLocalLyrics = async (index: number): Promise<LocalMatch | null> => {
    const item = localMatches[index];
    if (!item) return null;
    if (item.lyrics) return item;
    if (!item.selected) {
      notify("info", "请先选择一个歌词候选");
      return null;
    }
    const result = await fetchLyricsWithFallback(
      item.selected.song,
      config.cookies,
    );
    const updated = { ...item, lyrics: result };
    setLocalMatches((matches) =>
      matches.map((entry, entryIndex) =>
        entryIndex === index ? updated : entry,
      ),
    );
    return updated;
  };

  const saveLocalOne = async (index: number) => {
    try {
      const item = await ensureLocalLyrics(index);
      if (!item) return;
      const result = await saveLocalLyrics(item, config);
      setLocalMatches((matches) =>
        matches.map((entry, entryIndex) =>
          entryIndex === index
            ? {
                ...entry,
                savedLrc: result.lrcPath,
                embedded: result.embedded,
                status: result.errors.length ? "ready" : "done",
                detail: result.errors.length
                  ? result.errors.join("；")
                  : entry.detail,
              }
            : entry,
        ),
      );
      notify(
        result.errors.length ? "error" : "success",
        result.errors.length ? result.errors.join("；") : "歌词已保存",
      );
    } catch (error) {
      notify("error", error instanceof Error ? error.message : String(error));
    }
  };

  const saveSelected = async () => {
    let success = 0;
    let failed = 0;
    for (const index of selectedRows) {
      try {
        const item = await ensureLocalLyrics(index);
        if (!item) continue;
        const result = await saveLocalLyrics(item, config);
        if (result.errors.length) failed += 1;
        else success += 1;
        setLocalMatches((matches) =>
          matches.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  savedLrc: result.lrcPath,
                  embedded: result.embedded,
                  status: result.errors.length ? "ready" : "done",
                  detail: result.errors.length
                    ? result.errors.join("；")
                    : entry.detail,
                }
              : entry,
          ),
        );
      } catch {
        failed += 1;
      }
    }
    notify(
      failed ? "error" : "success",
      failed
        ? `保存完成：成功 ${success}，失败 ${failed}`
        : `已保存 ${success} 首本地歌词`,
    );
  };

  const checkSelectedLocal = async () => {
    const index = [...selectedRows][0];
    if (index === undefined) {
      notify("info", "请先选择一首歌曲");
      return;
    }
    try {
      const item = await ensureLocalLyrics(index);
      if (!item?.lyrics) return;
      setCheckReport(
        checkLyrics(item.lyrics, {
          expectedDurationMs: item.track.durationMs,
        }),
      );
    } catch (error) {
      notify("error", error instanceof Error ? error.message : String(error));
    }
  };

  const saveSettings = async (next: AppConfig) => {
    await persistConfig(next);
    setConfig(next);
  };

  const chooseDirectory = async (): Promise<string | null> => {
    const directory = await selectDirectory();
    return directory;
  };

  const openDataDirectory = () => {
    void openPath(paths.dataDir).catch((error) =>
      notify("error", error instanceof Error ? error.message : String(error)),
    );
  };

  const confirmExit = async () => {
    exitAllowed.current = true;
    setShowExitConfirm(false);
    try {
      await exitApp();
    } catch {
      window.close();
    }
  };

  return (
    <div className="app-shell">
      <TitleBar onRequestExit={() => setShowExitConfirm(true)} />
      <div className="workspace">
        <Sidebar
          page={page}
          onNavigate={setPage}
          accounts={config.accounts}
          cookies={config.cookies}
          fallbackDataDir={paths.fallback}
        />
        <main className="content">
          {page === "search" ? (
            <SearchPage
              query={query}
              onQueryChange={setQuery}
              onSearch={() => void runSearch(false)}
              onQuickSearch={(value) => {
                setQuery(value);
                void runSearch(false, value);
              }}
              searching={searching}
              songs={songs}
              filter={filter}
              onFilterChange={setFilter}
              selectedSong={selectedSong}
              onSelectSong={(song) => void loadSongLyrics(song)}
              lyrics={lyrics}
              lyricsLoading={lyricsLoading}
              lyricsError={lyricsError}
              showTranslation={showTranslation}
              onToggleTranslation={() => setShowTranslation((value) => !value)}
              karaokeRunning={karaokeRunning}
              karaokeLine={karaokeLine}
              onToggleKaraoke={toggleKaraoke}
              onSeek={seekKaraoke}
              saveDirectory={onlineSaveDirectory(config, paths)}
              onSave={() => void saveOnline()}
              onSaveAs={() => void saveOnlineAs()}
              onCopy={() => void copyLyrics()}
              onOpenSaveDirectory={openSaveDirectory}
              onCheckLyrics={showCurrentCheck}
              onLoadDemo={loadDemo}
              onLoadMore={() => void runSearch(true)}
              hasMore={hasMore}
              loadingMore={loadingMore}
            />
          ) : null}
          {page === "local" ? (
            <LocalPage
              matches={localMatches}
              selected={selectedRows}
              busy={localBusy}
              onToggle={(index) =>
                setSelectedRows((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                })
              }
              onAddFiles={() => void addFiles()}
              onAddFolder={() => void addFolder()}
              onMatchAll={() => void matchAll()}
              onStop={stopMatch}
              onSaveSelected={() => void saveSelected()}
              onSaveOne={(index) => void saveLocalOne(index)}
              onCandidates={setCandidateRow}
              onClear={() => {
                setLocalMatches([]);
                setSelectedRows(new Set());
                setDemoMode(false);
              }}
              onCheckSelected={() => void checkSelectedLocal()}
              onLoadDemo={loadDemo}
            />
          ) : null}
          {page === "settings" ? (
            <SettingsPage
              config={config}
              paths={paths}
              onSave={saveSettings}
              onChooseDirectory={chooseDirectory}
              onOpenDataDirectory={openDataDirectory}
              onOpenWebsite={(source) => {
                void openExternalUrl(
                  source === "netease"
                    ? "https://music.163.com/"
                    : "https://y.qq.com/",
                ).catch((error) =>
                  notify(
                    "error",
                    error instanceof Error ? error.message : String(error),
                  ),
                );
              }}
            />
          ) : null}
        </main>
      </div>

      {dragActive ? (
        <div className="drop-overlay">
          <div>
            <FolderPlus size={34} />
            <strong>松开即可添加音乐</strong>
            <span>支持文件与文件夹，重复歌曲会自动去重</span>
          </div>
        </div>
      ) : null}

      {candidateRow !== null && localMatches[candidateRow] ? (
        <CandidateDialog
          match={localMatches[candidateRow]}
          defaultSource={config.search.defaultSource}
          loading={candidateLoading}
          onClose={() => setCandidateRow(null)}
          onSearch={(query, source, page, appendExisting) =>
            searchLocalCandidates(
              candidateRow,
              query,
              source,
              page,
              appendExisting,
            )
          }
          onSelect={(candidate) =>
            void fetchCandidateLyrics(candidateRow, candidate)
          }
        />
      ) : null}

      {checkReport ? (
        <LyricCheckDialog
          report={checkReport}
          onClose={() => setCheckReport(null)}
        />
      ) : null}

      {showExitConfirm ? (
        <ExitConfirmDialog
          onCancel={() => setShowExitConfirm(false)}
          onConfirm={() => void confirmExit()}
        />
      ) : null}

      {toast ? (
        <div className={`toast ${toast.tone}`}>
          {toast.tone === "success" ? (
            <CheckCircle2 size={16} />
          ) : toast.tone === "error" ? (
            <CircleAlert size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          <span>{toast.message}</span>
          {toast.tone === "info" && toast.message.includes("加载") ? (
            <LoaderCircle size={14} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
