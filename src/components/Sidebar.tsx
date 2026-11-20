import {
  FolderOpen,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import type { AccountState } from "../types";
import { cookiePreview } from "../lib/utils";

export type Page = "search" | "local" | "settings";

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  accounts: Record<"netease" | "qq", AccountState>;
  cookies: Record<"netease" | "qq", string>;
  fallbackDataDir: boolean;
}

const navItems = [
  { id: "search" as const, label: "歌词搜索", icon: Search },
  { id: "local" as const, label: "本地匹配", icon: FolderOpen },
  { id: "settings" as const, label: "设置", icon: Settings },
];

export function Sidebar({
  page,
  onNavigate,
  accounts,
  cookies,
  fallbackDataDir,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src="/assets/logo_128.png" alt="" />
        </div>
        <div>
          <strong>MiSideTag</strong>
          <span>歌词匹配器</span>
        </div>
      </div>

      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />
      <div className="account-summary">
        <span className="eyebrow">账号状态</span>
        {(["netease", "qq"] as const).map((source) => {
          const account = accounts[source];
          const label =
            account.valid === true
              ? account.nickname || "已登录"
              : account.valid === false
                ? "登录已失效"
                : cookies[source]
                  ? `待验证 · ${cookiePreview(cookies[source])}`
                  : "游客模式";
          return (
            <button
              type="button"
              key={source}
              className="account-line"
              onClick={() => onNavigate("settings")}
            >
              <i className={`account-dot ${source}`} />
              <span>
                <strong>
                  {source === "netease" ? "网易云音乐" : "QQ 音乐"}
                </strong>
                <small>{label}</small>
              </span>
              <span className="account-arrow">›</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <Sparkles size={12} />
        <span>世界因你而美丽</span>
      </div>
      <div className="sidebar-meta">
        <span>v{__APP_VERSION__}</span>
        <span>{fallbackDataDir ? "APPDATA 数据目录" : "GPL-3.0-only"}</span>
      </div>
    </aside>
  );
}
