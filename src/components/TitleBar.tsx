import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

async function withWindow(action: (window: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) {
  try {
    await action(getCurrentWindow());
  } catch {
    // Browser preview has no native window.
  }
}

export function TitleBar({
  onRequestExit,
}: {
  onRequestExit: () => void;
}) {
  return (
    <div
      className="titlebar"
      data-tauri-drag-region
      onDoubleClick={() => withWindow((window) => window.toggleMaximize())}
    >
      <div className="titlebar-brand" data-tauri-drag-region>
        M I S I D E T A G
      </div>
      <div className="titlebar-controls">
        <button
          type="button"
          aria-label="最小化"
          onClick={() => withWindow((window) => window.minimize())}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label="最大化"
          onClick={() => withWindow((window) => window.toggleMaximize())}
        >
          <Square size={12} />
        </button>
        <button
          type="button"
          className="titlebar-close"
          aria-label="关闭"
          title="退出应用"
          onClick={onRequestExit}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
