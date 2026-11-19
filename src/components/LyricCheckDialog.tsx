import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import type { LyricCheckReport } from "../lib/quality";
import { reportStatus } from "../lib/quality";
import { fmtDuration } from "../lib/utils";

export function LyricCheckDialog({
  report,
  onClose,
}: {
  report: LyricCheckReport;
  onClose: () => void;
}) {
  const status = reportStatus(report);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal check-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <span className="eyebrow accent">LYRIC SELF-CHECK</span>
            <h2>歌词自检</h2>
            <p>
              {report.title} — {report.artist}
            </p>
          </div>
          <button type="button" className="icon-only" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="check-summary">
          <span className={`status-chip ${status === "通过" ? "auto" : "review"}`}>
            {status}
          </span>
          <span>{report.lines} 行歌词</span>
          <span>{report.wordLines} 行逐字</span>
          {report.expectedDurationMs ? (
            <span>{fmtDuration(report.expectedDurationMs)}</span>
          ) : null}
        </div>
        <div className="check-list">
          {report.issues.map((issue, index) => (
            <div key={`${issue.level}-${index}`} className={`check-item ${issue.level}`}>
              {issue.level === "error" ? (
                <CircleAlert size={17} />
              ) : issue.level === "warning" ? (
                <CircleAlert size={17} />
              ) : issue.message.includes("未发现") ? (
                <CircleCheck size={17} />
              ) : (
                <Info size={17} />
              )}
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
        <footer className="modal-footer">
          <button type="button" className="primary-button" onClick={onClose}>
            知道了
          </button>
        </footer>
      </div>
    </div>
  );
}
