import {
  Check,
  LoaderCircle,
  Music2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  LocalMatch,
  MatchCandidate,
  ProviderFilter,
} from "../types";
import { SOURCE_COLOR, SOURCE_SHORT, artistText } from "../types";
import { fmtDuration } from "../lib/utils";
import { extractHttpUrl } from "../lib/links";
import { RESULTS_PER_PLATFORM } from "../lib/searchLimits";
import { SongCover } from "./SongCover";

interface SearchResponse {
  candidates: MatchCandidate[];
  warnings: string[];
  hasMore: boolean;
}

interface CandidateDialogProps {
  match: LocalMatch;
  defaultSource: ProviderFilter;
  loading: boolean;
  onClose: () => void;
  onSelect: (candidate: MatchCandidate) => void;
  onSearch: (
    query: string,
    source: ProviderFilter,
    page: number,
    appendExisting: boolean,
  ) => Promise<SearchResponse>;
}

function candidateKey(candidate: MatchCandidate): string {
  return `${candidate.song.source}:${candidate.song.id}`;
}

export function CandidateDialog({
  match,
  defaultSource,
  loading,
  onClose,
  onSelect,
  onSearch,
}: CandidateDialogProps) {
  const initialQuery = [match.track.title, match.track.artist]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<ProviderFilter>(defaultSource);
  const [results, setResults] = useState(match.candidates);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(
    match.candidates.length >= RESULTS_PER_PLATFORM,
  );
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState(
    match.selected ? candidateKey(match.selected) : "",
  );
  const isShareLink = useMemo(
    () => Boolean(extractHttpUrl(query)),
    [query],
  );

  const visible = useMemo(
    () =>
      filter === "all"
        ? results
        : results.filter((candidate) => candidate.song.source === filter),
    [filter, results],
  );

  const counts = useMemo(
    () => ({
      all: results.length,
      netease: results.filter((candidate) => candidate.song.source === "netease")
        .length,
      qq: results.filter((candidate) => candidate.song.source === "qq").length,
    }),
    [results],
  );

  const selectedCandidate = results.find(
    (candidate) => candidateKey(candidate) === selected,
  );
  const footerSelection = selectedCandidate
    ? `已选择：${selectedCandidate.song.title} — ${artistText(selectedCandidate.song)} · ${SOURCE_SHORT[selectedCandidate.song.source]}`
    : "点击候选项立即应用并关闭窗口";

  const runSearch = async (reset: boolean) => {
    if (!query.trim() || searching || loadingMore) return;
    if (reset) setSearching(true);
    else setLoadingMore(true);
    setError("");
    setNote("");
    try {
      if (reset && isShareLink) setFilter("all");
      const nextPage = reset ? 1 : page + 1;
      const response = await onSearch(
        query.trim(),
        reset ? "all" : filter,
        nextPage,
        !reset,
      );
      setResults(response.candidates);
      setHasMore(response.hasMore);
      setPage(nextPage);
      setNote(response.warnings.join("；"));
      if (
        reset ||
        !selected ||
        !response.candidates.some(
          (candidate) => candidateKey(candidate) === selected,
        )
      ) {
        setSelected(
          response.candidates[0]
            ? candidateKey(response.candidates[0])
            : "",
        );
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : String(searchError),
      );
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  };

  return (
    <div className="modal-backdrop candidate-backdrop" onMouseDown={onClose}>
      <div
        className="modal candidate-dialog candidate-match-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="candidate-window-title">
          <img src="/assets/logo_32.png" alt="" />
          <span id="candidate-dialog-title">选择匹配的歌词</span>
          <button type="button" className="icon-only" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="candidate-match-body">
          <div className="candidate-track-summary">
            <div className="candidate-track-icon">
              <Music2 size={21} />
            </div>
            <div>
              <strong>{match.track.title || match.track.path}</strong>
              <span>{match.track.path}</span>
            </div>
          </div>

          <div className="candidate-main-search">
            <input
              name="misidetag-local-search"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch(true);
              }}
              placeholder="输入歌名、歌手，或粘贴音乐分享链接"
            />
            <button
              type="button"
              className="subtle-button"
              onClick={() => void runSearch(true)}
              disabled={searching || !query.trim()}
            >
              {searching ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Search size={15} />
              )}
              {searching ? "处理中" : isShareLink ? "定位" : "搜索"}
            </button>
          </div>

          <div className="candidate-found">
            找到 网易云 <b>{counts.netease}</b> · QQ 音乐{" "}
            <b>{counts.qq}</b> 个候选
          </div>

          <div className="candidate-match-toolbar">
            <div className="candidate-match-tabs">
              {(
                [
                  ["all", "全部"],
                  ["netease", "网易云音乐"],
                  ["qq", "QQ 音乐"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={filter === value ? "active" : ""}
                  onClick={() => setFilter(value)}
                >
                  {label} {counts[value]}
                </button>
              ))}
            </div>
          </div>

          {note ? <div className="candidate-note">{note}</div> : null}

          <div className="candidate-match-list">
            {visible.map((candidate) => {
              const key = candidateKey(candidate);
              const scoreTone =
                candidate.score >= 90
                  ? "high"
                  : candidate.score >= 60
                    ? "medium"
                    : "low";
              return (
                <button
                  type="button"
                  key={key}
                  className={selected === key ? "active" : ""}
                  disabled={loading}
                  onClick={() => {
                    setSelected(key);
                    onSelect(candidate);
                  }}
                >
                  <SongCover
                    src={candidate.song.coverUrl}
                    title={candidate.song.title}
                    size="small"
                  />
                  <div className="candidate-match-copy">
                    <span
                      className="candidate-source-tag"
                      style={{
                        color: SOURCE_COLOR[candidate.song.source],
                        borderColor: `${SOURCE_COLOR[candidate.song.source]}55`,
                      }}
                    >
                      {SOURCE_SHORT[candidate.song.source]}
                    </span>
                    <strong>{candidate.song.title}</strong>
                    <small>
                      {artistText(candidate.song)} ·{" "}
                      {candidate.song.album || "未知专辑"} ·{" "}
                      {fmtDuration(candidate.song.durationMs)}
                    </small>
                    <em>
                      {candidate.reasons.join(" · ") || "请试听后确认"}
                    </em>
                  </div>
                  <span className={`candidate-score-pill ${scoreTone}`}>
                    {candidate.score} 分
                  </span>
                </button>
              );
            })}
            {!visible.length && !searching ? (
              <div className="empty-state compact">
                <strong>{error || "没有找到候选"}</strong>
                <p>修改搜索词后重新搜索两个平台。</p>
              </div>
            ) : null}
            {error && visible.length ? (
              <div className="inline-error compact">{error}</div>
            ) : null}
            {hasMore && visible.length ? (
              <button
                type="button"
                className="candidate-load-more"
                onClick={() => void runSearch(false)}
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
        </div>

        <footer className="candidate-match-footer">
          <span title={footerSelection}>{footerSelection}</span>
          <button type="button" className="text-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!selected || loading}
            onClick={() => selectedCandidate && onSelect(selectedCandidate)}
          >
            {loading ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Check size={15} />
            )}
            使用此歌词
          </button>
        </footer>
      </div>
    </div>
  );
}
