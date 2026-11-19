import {
  BadgeCheck,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FolderOpen,
  Languages,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { Lyrics, ProviderSource, Song } from "../types";
import {
  SOURCE_COLOR,
  SOURCE_SHORT,
  artistText,
  songKey,
} from "../types";
import { fmtDuration } from "../lib/utils";
import { lyricStats } from "../lib/lyrics";
import { SongCover } from "./SongCover";

type Filter = "all" | ProviderSource;

interface SearchPageProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onQuickSearch: (query: string) => void;
  searching: boolean;
  songs: Song[];
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  selectedSong: Song | null;
  onSelectSong: (song: Song) => void;
  lyrics: Lyrics | null;
  lyricsLoading: boolean;
  lyricsError: string;
  showTranslation: boolean;
  onToggleTranslation: () => void;
  karaokeRunning: boolean;
  karaokeLine: number;
  onToggleKaraoke: () => void;
  onSeek: (lineIndex: number) => void;
  saveDirectory: string;
  onSave: () => void;
  onSaveAs: () => void;
  onCopy: () => void;
  onOpenSaveDirectory: () => void;
  onCheckLyrics: () => void;
  onLoadDemo: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}

export function SearchPage({
  query,
  onQueryChange,
  onSearch,
  onQuickSearch,
  searching,
  songs,
  filter,
  onFilterChange,
  selectedSong,
  onSelectSong,
  lyrics,
  lyricsLoading,
  lyricsError,
  showTranslation,
  onToggleTranslation,
  karaokeRunning,
  karaokeLine,
  onToggleKaraoke,
  onSeek,
  saveDirectory,
  onSave,
  onSaveAs,
  onCopy,
  onOpenSaveDirectory,
  onCheckLyrics,
  onLoadDemo,
  onLoadMore,
  hasMore,
  loadingMore,
}: SearchPageProps) {
  const filtered = useMemo(
    () =>
      filter === "all"
        ? songs
        : songs.filter((song) => song.source === filter),
    [filter, songs],
  );
  const counts = useMemo(
    () => ({
      all: songs.length,
      netease: songs.filter((song) => song.source === "netease").length,
      qq: songs.filter((song) => song.source === "qq").length,
    }),
    [songs],
  );
  const stats = lyrics ? lyricStats(lyrics) : null;
  const lyricScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!karaokeRunning || !lyricScrollRef.current) return;
    const node = lyricScrollRef.current.querySelector(
      `[data-line-index="${karaokeLine}"]`,
    );
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [karaokeLine, karaokeRunning]);

  return (
    <div className="page search-page">
      <section className="search-workspace">
        <div className="page-heading">
          <div>
            <span className="eyebrow accent">DISCOVER · 在线歌词</span>
            <h1>把每段旋律，配回它的文字</h1>
            <p>在网易云音乐与 QQ 音乐中搜索，预览后保存为 LRC。</p>
          </div>
          <button type="button" className="feature-pill" onClick={onLoadDemo}>
            <Sparkles size={14} />
            加载演示内容
          </button>
        </div>

        <div className="search-box">
          <Search size={20} />
          <input
            id="search-input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
            }}
            placeholder="歌名、歌手，或粘贴网易云 / QQ 音乐歌曲链接"
          />
          {query ? (
            <button
              type="button"
              className="input-clear"
              onClick={() => onQueryChange("")}
              aria-label="清空"
            >
              <X size={15} />
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button search-button"
            onClick={onSearch}
            disabled={searching || !query.trim()}
          >
            {searching ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Search size={16} />
            )}
            {searching ? "搜索中" : "搜索"}
          </button>
        </div>
        <div className="results-toolbar">
          <div className="results-title">
            搜索结果
            <span>· {filtered.length}</span>
          </div>
          <div className="segmented">
            {(
              [
                ["all", "全部"],
                ["netease", "网易云"],
                ["qq", "QQ 音乐"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => onFilterChange(value)}
              >
                {label} {counts[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="result-list">
          {!searching && !filtered.length ? (
            <div className="search-empty-hero">
              <div className="search-empty-glow">
                <img src="/assets/logo_128.png" alt="" />
              </div>
              <h2>让歌词回到歌里</h2>
              <p>
                搜索网易云音乐与 QQ 音乐，找到逐字歌词，
                <br />
                保存到歌曲旁边或直接写进音频标签。
              </p>
              <div className="suggestion-chips">
                {["夜曲 周杰伦", "我记得 赵雷", "晴天", "Lemon 米津玄師"].map(
                  (suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => onQuickSearch(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ),
                )}
              </div>
              <div className="search-feature-pills">
                <span>
                  <Search size={13} /> 双平台搜索
                </span>
                <span>
                  <Music2 size={13} /> QRC / YRC 逐字
                </span>
                <span>
                  <ShieldCheck size={13} /> 写入歌词标签
                </span>
              </div>
            </div>
          ) : null}
          {filtered.map((song) => {
            const selected = selectedSong && songKey(selectedSong) === songKey(song);
            return (
              <button
                type="button"
                key={songKey(song)}
                className={`song-row ${selected ? "active" : ""}`}
                onClick={() => onSelectSong(song)}
              >
                <SongCover src={song.coverUrl} title={song.title} size="small" />
                <span className="song-main">
                  <strong>{song.title}</strong>
                  <small>
                    {artistText(song)} · {song.album || "未知专辑"}
                  </small>
                </span>
                <span className="song-meta">
                  <span
                    className="source-label"
                    style={{ color: SOURCE_COLOR[song.source] }}
                  >
                    {SOURCE_SHORT[song.source]}
                  </span>
                  <span>{fmtDuration(song.durationMs)}</span>
                </span>
              </button>
            );
          })}
          {hasMore && filtered.length ? (
            <button
              type="button"
              className="load-more"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {loadingMore ? "正在加载" : "加载更多结果"}
            </button>
          ) : null}
        </div>
      </section>

      <aside className="preview-panel">
        {selectedSong ? (
          <>
            <div className="preview-head">
              <SongCover
                src={selectedSong.coverUrl}
                title={selectedSong.title}
                size="large"
              />
              <div>
                <div className="preview-badges">
                  <span
                    className="source-badge"
                    style={{
                      color: SOURCE_COLOR[selectedSong.source],
                      borderColor: `${SOURCE_COLOR[selectedSong.source]}55`,
                    }}
                  >
                    {SOURCE_SHORT[selectedSong.source]}
                  </span>
                  {lyrics?.wordLevel ? (
                    <span className="word-badge">逐字</span>
                  ) : null}
                  {lyrics?.hasTranslation ? (
                    <span className="translation-badge">
                      <Languages size={10} /> 译文
                    </span>
                  ) : null}
                </div>
                <h2>{selectedSong.title}</h2>
                <p>{artistText(selectedSong)}</p>
                <small>{selectedSong.album || "未知专辑"}</small>
              </div>
            </div>

            <div className="preview-actions">
              <button
                type="button"
                className="primary-button save-main"
                onClick={onSave}
                disabled={!lyrics}
              >
                <Download size={15} />
                保存 LRC
              </button>
              <button type="button" onClick={onCopy} aria-label="复制歌词" title="复制完整歌词">
                <Copy size={16} />
              </button>
              <button type="button" aria-label="另存为" title="另存为 LRC / SPL" onClick={onSaveAs}>
                <FileDown size={16} />
              </button>
              <button type="button" onClick={onCheckLyrics} aria-label="歌词自检" title="检查缺词和时间轴">
                <ShieldCheck size={16} />
              </button>
              <button
                type="button"
                onClick={() => onSelectSong(selectedSong)}
                aria-label="重新获取歌词"
                title="重新获取歌词"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            <div className="lyric-toolbar">
              <span className="local-badge">
                <WandSparkles size={12} />
                {lyrics?.providerNote || "等待获取歌词"}
              </span>
              <button
                type="button"
                onClick={onToggleKaraoke}
                disabled={!lyrics?.wordLevel}
              >
                {karaokeRunning ? <Pause size={13} /> : <Play size={13} />}
                {karaokeRunning ? "暂停演示" : "逐字演示"}
              </button>
              {lyrics?.hasTranslation ? (
                <button
                  type="button"
                  className={showTranslation ? "active" : ""}
                  onClick={onToggleTranslation}
                >
                  译文
                </button>
              ) : null}
              <button type="button" onClick={onCheckLyrics}>
                自检
              </button>
            </div>

            <div className="lyric-scroll" ref={lyricScrollRef}>
              {lyricsLoading ? (
                <div className="lyric-loading">
                  <LoaderCircle className="spin" size={20} />
                  正在获取歌词
                </div>
              ) : null}
              {lyricsError ? (
                <div className="inline-error">
                  <strong>歌词获取失败</strong>
                  <p>{lyricsError}</p>
                </div>
              ) : null}
              {!lyricsLoading && lyrics?.lines.length
                ? lyrics.lines.map((line, index) => {
                    const active = karaokeRunning && index === karaokeLine;
                    return (
                      <button
                        type="button"
                        key={`${line.startMs}-${index}`}
                        data-line-index={index}
                        className={`lyric-line ${active ? "active" : ""}`}
                        onClick={() => onSeek(index)}
                      >
                        <span className="line-time">
                          {formatLyricTime(line.startMs)}
                        </span>
                        <span>
                          {line.text}
                          {showTranslation && line.translation ? (
                            <small>{line.translation}</small>
                          ) : null}
                        </span>
                      </button>
                    );
                  })
                : null}
              {!lyricsLoading && lyrics && !lyrics.lines.length ? (
                <div className="empty-state compact">
                  <strong>这首歌没有可用歌词</strong>
                  <p>可以尝试选择其他搜索结果。</p>
                </div>
              ) : null}
            </div>

            <div className="preview-footer">
              <span>
                {stats ? `${stats.lines} 行 · ${stats.wordLines} 行逐字` : "尚未载入"}
              </span>
              <span className="save-location" title={saveDirectory}>
                保存到 {saveDirectory || "默认下载目录"}
              </span>
              <button type="button" onClick={onOpenSaveDirectory}>
                <FolderOpen size={13} />
                打开目录
              </button>
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <div className="empty-orbit large">
              <BadgeCheck size={30} />
            </div>
            <h2>选择一首歌曲</h2>
            <p>右侧会显示歌词、逐字时间轴与保存操作。</p>
            <button type="button" className="subtle-button" onClick={onLoadDemo}>
              <Sparkles size={14} />
              查看演示内容
            </button>
          </div>
        )}
        <button type="button" className="external-link" aria-label="平台页面">
          <ExternalLink size={14} />
        </button>
      </aside>
    </div>
  );
}

function formatLyricTime(ms: number): string {
  const total = Math.max(0, Math.trunc(ms / 10));
  const minutes = Math.floor(total / 6000);
  const seconds = Math.floor((total % 6000) / 100);
  const hundredths = total % 100;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}
