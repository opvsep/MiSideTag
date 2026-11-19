import {
  FilePlus2,
  FolderPlus,
  LoaderCircle,
  Music2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import type { LocalMatch } from "../types";
import { SOURCE_COLOR, SOURCE_SHORT } from "../types";
import { statusText } from "../lib/matching";
import {
  basename,
  fmtDuration,
  songText,
  trackDisplayArtist,
  trackDisplayTitle,
} from "../lib/utils";
import { SongCover } from "./SongCover";

interface LocalPageProps {
  matches: LocalMatch[];
  selected: Set<number>;
  busy: boolean;
  onToggle: (index: number) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onMatchAll: () => void;
  onStop: () => void;
  onSaveSelected: () => void;
  onSaveOne: (index: number) => void;
  onCandidates: (index: number) => void;
  onClear: () => void;
  onCheckSelected: () => void;
  onLoadDemo: () => void;
}

export function LocalPage({
  matches,
  selected,
  busy,
  onToggle,
  onAddFiles,
  onAddFolder,
  onMatchAll,
  onStop,
  onSaveSelected,
  onSaveOne,
  onCandidates,
  onClear,
  onCheckSelected,
  onLoadDemo,
}: LocalPageProps) {
  const waiting = matches.filter(
    (item) => item.status === "auto" || item.status === "review",
  ).length;
  const ready = matches.filter((item) => item.status === "ready").length;
  const done = matches.filter(
    (item) =>
      item.status === "done" || item.embedded || Boolean(item.savedLrc),
  ).length;

  return (
    <div className="page local-page">
      <div className="page-heading local-heading">
        <div>
          <span className="eyebrow accent">LIBRARY · 本地歌词</span>
          <h1>把歌词，贴回每一首歌</h1>
          <p>扫描本地音乐，自动匹配网易云与 QQ 音乐歌词。</p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="subtle-button"
            onClick={onAddFiles}
            title="添加文件（Ctrl+O）"
          >
            <FilePlus2 size={16} />
            添加文件
          </button>
          <button
            type="button"
            className="subtle-button"
            onClick={onAddFolder}
            title="添加文件夹（Ctrl+Shift+O）"
          >
            <FolderPlus size={16} />
            添加文件夹
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={busy ? onStop : onMatchAll}
            disabled={!matches.length}
          >
            {busy ? <Square size={13} /> : <RefreshCw size={15} />}
            {busy ? "停止匹配" : "开始匹配"}
          </button>
          <button
            type="button"
            className="icon-only"
            aria-label="歌词自检"
            title="检查已选歌曲的歌词"
            onClick={onCheckSelected}
          >
            <ShieldCheck size={16} />
          </button>
          <button
            type="button"
            className="icon-only"
            aria-label="清空列表"
            title="清空当前列表"
            onClick={onClear}
            disabled={!matches.length}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {matches.length ? (
        <div className="local-summary">
          <span>
            <i className="status-dot muted" /> 已载入 {matches.length}
          </span>
          <span>
            <i className="status-dot warning" /> 待确认 {waiting}
          </span>
          <span>
            <i className="status-dot saved" /> 准备就绪 {ready}
          </span>
          <span>
            <i className="status-dot success" /> 完毕 {done}
          </span>
          <span className="summary-spacer" />
          <small>保存选项由设置页统一控制</small>
          <button
            type="button"
            className="subtle-button"
            onClick={onSaveSelected}
            disabled={!selected.size}
          >
            <Save size={14} />
            保存已选
          </button>
        </div>
      ) : null}

      <div className={`local-table card-shell ${!matches.length ? "is-empty" : ""}`}>
        <div className="local-table-head">
          <span />
          <span>本地歌曲</span>
          <span>状态</span>
          <span>匹配结果</span>
          <span>操作</span>
        </div>
        {!matches.length ? (
          <div className="local-empty-content">
            <div className="empty-orbit large">
              <Music2 size={28} />
            </div>
            <h2>把歌曲拖进来，让歌词归位</h2>
            <p>
              支持 MP3 / FLAC / M4A / OGG / OPUS / WAV 等格式
              <br />
              读取歌曲标签与文件名，自动匹配网易云音乐和 QQ 音乐。
            </p>
            <div className="actions">
              <button type="button" className="primary-button" onClick={onAddFolder}>
                <FolderPlus size={15} />
                选择文件夹
              </button>
              <button type="button" className="subtle-button" onClick={onAddFiles}>
                <FilePlus2 size={14} />
                选择歌曲文件
              </button>
              <button type="button" className="text-button" onClick={onLoadDemo}>
                加载演示内容
              </button>
            </div>
          </div>
        ) : null}
        {matches.map((match, index) => {
          const candidate = match.selected || match.candidates[0];
          const cover = candidate?.song.coverUrl;
          return (
            <div
              className="local-row"
              key={`${match.track.path}-${index}`}
              onDoubleClick={() => onCandidates(index)}
            >
              <button
                type="button"
                className={`row-select-box ${selected.has(index) ? "checked" : ""}`}
                onClick={() => onToggle(index)}
                aria-label="选择歌曲"
              />
              <div className="track-cell">
                <SongCover
                  src={cover}
                  title={trackDisplayTitle(match.track)}
                  size="small"
                />
                <div>
                  <strong>{trackDisplayTitle(match.track)}</strong>
                  <small>
                    {trackDisplayArtist(match.track)} ·{" "}
                    {basename(match.track.path)}
                  </small>
                  <small className="track-technical">
                    {match.track.codec || "未知格式"} ·{" "}
                    {fmtDuration(match.track.durationMs)} ·{" "}
                    {match.track.tagType || "无标签"}
                  </small>
                </div>
              </div>
              <div className="status-cell">
                <span className={`status-chip ${match.status}`}>
                  {match.status === "matching" ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : null}
                  {statusText(match.status)}
                </span>
                <small>{match.detail}</small>
              </div>
              <div className="match-cell">
                {candidate ? (
                  <div className="local-selected-candidate">
                    <span style={{ color: SOURCE_COLOR[candidate.song.source] }}>
                      {SOURCE_SHORT[candidate.song.source]}
                    </span>
                    <div>
                      <strong>{songText(candidate.song)}</strong>
                      <small>
                        {candidate.song.album || "未知专辑"} ·{" "}
                        {fmtDuration(candidate.song.durationMs)} ·{" "}
                        {candidate.score} 分
                      </small>
                      <em>
                        {candidate.reasons.join(" · ") ||
                          "候选信息较少，请确认"}
                      </em>
                    </div>
                  </div>
                ) : (
                  <span className="muted-text">
                    {match.status === "matching"
                      ? "正在搜索候选"
                      : "尚未匹配"}
                  </span>
                )}
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => onCandidates(index)}
                  aria-label="自定义搜索或更换匹配"
                  title="自定义搜索 / 更换匹配"
                >
                  <Search size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onSaveOne(index)}
                  disabled={!match.lyrics && !match.selected}
                  aria-label="保存歌词"
                  title="保存歌词"
                >
                  <Save size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
