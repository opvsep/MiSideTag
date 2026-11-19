import { LogOut, X } from "lucide-react";

export function ExitConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="exit-title">
            <img src="/assets/logo_64.png" alt="" />
            <h2>退出确认</h2>
          </div>
          <button type="button" className="icon-only" onClick={onCancel} aria-label="关闭">
            <X size={17} />
          </button>
        </header>
        <div className="exit-body">
          <h2 id="exit-title">要退出 MiSideTag 吗？</h2>
          <p>设置、账号 Cookie 和已保存的歌词都会保留。</p>
          <p>未保存的匹配结果只存在于本次会话中，退出后需要重新扫描。</p>
        </div>
        <footer className="modal-footer">
          <button type="button" className="primary-button" onClick={onCancel}>
            继续使用
          </button>
          <button type="button" className="subtle-button danger-outline" onClick={onConfirm}>
            <LogOut size={15} />
            退出
          </button>
        </footer>
      </div>
    </div>
  );
}
