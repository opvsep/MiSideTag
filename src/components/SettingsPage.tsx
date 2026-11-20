import {
  ChevronRight,
  ExternalLink,
  FolderOpen,
  Info,
  LogIn,
  Minus,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AppConfig, AppPaths, ProviderSource } from "../types";
import { DEFAULT_CONFIG } from "../lib/config";
import {
  MAX_MATCH_CONCURRENCY,
  MIN_MATCH_CONCURRENCY,
  normalizeMatchingConcurrency,
} from "../lib/concurrency";
import { cookiePreview, normalizeCookie } from "../lib/utils";
import type { AccountState } from "../types";

interface SettingsPageProps {
  config: AppConfig;
  paths: AppPaths;
  onSave: (config: AppConfig) => Promise<void>;
  onVerifyAccount: (
    source: ProviderSource,
    cookie: string,
  ) => Promise<AccountState>;
  onChooseDirectory: () => Promise<string | null>;
  onOpenDataDirectory: () => void;
  onOpenWebsite: (source: ProviderSource) => void;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "checked" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span />
    </button>
  );
}

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented settings-segment">
      {options.map(([option, label]) => (
        <button
          type="button"
          key={option}
          className={value === option ? "active" : ""}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ConcurrencyControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const update = (next: number) =>
    onChange(normalizeMatchingConcurrency(next));
  return (
    <div
      className="settings-number-control"
      role="group"
      aria-label="并发匹配数量"
    >
      <button
        type="button"
        aria-label="减少并发数量"
        disabled={value <= MIN_MATCH_CONCURRENCY}
        onClick={() => update(value - 1)}
      >
        <Minus size={14} />
      </button>
      <label>
        <input
          type="number"
          min={MIN_MATCH_CONCURRENCY}
          max={MAX_MATCH_CONCURRENCY}
          value={value}
          aria-label="并发匹配歌曲数量"
          onChange={(event) => update(Number(event.target.value))}
        />
        <span>首</span>
      </label>
      <button
        type="button"
        aria-label="增加并发数量"
        disabled={value >= MAX_MATCH_CONCURRENCY}
        onClick={() => update(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function SettingToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-v2-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export function SettingsPage({
  config,
  paths,
  onSave,
  onVerifyAccount,
  onChooseDirectory,
  onOpenDataDirectory,
  onOpenWebsite,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<AppConfig>(structuredClone(config));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ProviderSource | null>(
    null,
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  useEffect(() => {
    setDraft(structuredClone(config));
  }, [config]);

  const patchSaving = (patch: Partial<AppConfig["saving"]>) =>
    setDraft((current) => ({
      ...current,
      saving: { ...current.saving, ...patch },
    }));

  const patchMatching = (patch: Partial<AppConfig["matching"]>) =>
    setDraft((current) => ({
      ...current,
      matching: { ...current.matching, ...patch },
    }));

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      await onSave(draft);
      setStatus("设置已保存");
    } catch (error) {
      setStatus(
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const saveCookie = async (source: ProviderSource) => {
    const cookie = normalizeCookie(draft.cookies[source]);
    if (!cookie) {
      setStatus("请先填写 Cookie");
      return;
    }
    setSaving(true);
    setStatus("正在验证账号…");
    try {
      const account = await onVerifyAccount(source, cookie);
      const next: AppConfig = {
        ...draft,
        cookies: { ...draft.cookies, [source]: cookie },
        accounts: { ...draft.accounts, [source]: account },
      };
      setDraft(next);
      if (account.valid === false) {
        setStatus(`验证失败：${account.detail}`);
        return;
      }
      await onSave(next);
      setStatus(
        account.valid
          ? `登录成功：${account.nickname}`
          : `Cookie 已保存，${account.detail}`,
      );
      setEditingAccount(null);
    } catch (error) {
      setStatus(
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page settings-page settings-page-v2">
      <div className="settings-v2-heading">
        <div>
          <span className="eyebrow accent">SETTINGS · 偏好设置</span>
          <h1>让 MiSideTag 按你的方式工作</h1>
          <p>修改保存规则、账号或匹配偏好后，点击底部「保存设置」才会生效。</p>
        </div>
        <span className="manual-save-pill">手动保存</span>
      </div>

      <div className="settings-v2-sections">
        <section className="settings-v2-section">
          <header className="settings-v2-section-head">
            <span className="settings-v2-kicker">ACCOUNT</span>
            <h2>账号与登录</h2>
            <p>使用 Cookie 登录，只会保存在本机。</p>
          </header>
          <div className="settings-v2-accounts">
            {(["netease", "qq"] as const).map((source) => {
              const isNetease = source === "netease";
              const hasCookie = Boolean(draft.cookies[source].trim());
              const account = draft.accounts[source];
              const accountLabel =
                account.valid === true
                  ? account.nickname || "已登录"
                  : account.valid === false
                    ? "登录已失效"
                    : hasCookie
                      ? "待验证"
                      : "游客模式";
              return (
                <article className="settings-account-v2" key={source}>
                  <div className="settings-account-main">
                    <span className={`platform-orb ${source}`}>
                      {isNetease ? "网" : "Q"}
                    </span>
                    <div>
                      <strong>{isNetease ? "网易云音乐" : "QQ 音乐"}</strong>
                      <span>{accountLabel}</span>
                    </div>
                    <i
                      className={
                        account.valid === true
                          ? "connected"
                          : hasCookie
                            ? "warning"
                            : ""
                      }
                    />
                  </div>
                  <p>
                    {account.valid === true
                      ? `${account.vip ? "VIP 账号 · " : ""}${account.detail}`
                      : hasCookie
                        ? account.detail ||
                          `已保存 ${cookiePreview(draft.cookies[source])}，等待验证`
                        : "公共搜索与歌词大多可直接使用；登录后可使用账号权限。"}
                  </p>
                  <div className="settings-account-actions">
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() =>
                        setEditingAccount((current) =>
                          current === source ? null : source,
                        )
                      }
                    >
                      <LogIn size={14} />
                      登录 / 更新
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onOpenWebsite(source)}
                    >
                      <ExternalLink size={13} />
                      网页登录
                    </button>
                  </div>
                  {editingAccount === source ? (
                    <div className="settings-cookie-editor">
                      <textarea
                        value={draft.cookies[source]}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            cookies: {
                              ...current.cookies,
                              [source]: event.target.value,
                            },
                          }))
                        }
                        placeholder="粘贴浏览器请求头中的完整 Cookie"
                        spellCheck={false}
                      />
                      <div>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={
                            saving ||
                            !normalizeCookie(draft.cookies[source])
                          }
                          onClick={() => void saveCookie(source)}
                        >
                          <ShieldCheck size={13} />
                          {saving ? "验证中" : "验证并保存"}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              cookies: { ...current.cookies, [source]: "" },
                              accounts: {
                                ...current.accounts,
                                [source]: {
                                  nickname: "",
                                  avatar: "",
                                  vip: false,
                                  valid: null,
                                  detail: "",
                                },
                              },
                            }))
                          }
                        >
                          清除此账号
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="settings-v2-section">
          <header className="settings-v2-section-head">
            <span className="settings-v2-kicker">SAVING</span>
            <h2>歌词保存</h2>
            <p>决定歌词写到哪里、写成什么样。</p>
          </header>
          <div className="settings-v2-row">
            <div>
              <strong>保存位置</strong>
              <span>本地歌曲可保存到歌曲旁，在线歌词默认保存到下载目录。</span>
            </div>
            <Segment
              value={draft.saving.mode}
              options={[
                ["same", "歌曲同目录"],
                ["custom", "指定文件夹"],
              ] as const}
              onChange={(mode) => patchSaving({ mode })}
            />
          </div>
          {draft.saving.mode === "custom" ? (
            <div className="settings-v2-row path-row">
              <div>
                <strong>自定义目录</strong>
                <span>自定义文件名模板会应用到在线歌词和本地歌词。</span>
              </div>
              <div className="path-row-control">
                <input
                  value={draft.saving.customDir}
                  onChange={(event) =>
                    patchSaving({ customDir: event.target.value })
                  }
                  placeholder="选择自定义歌词文件夹"
                />
                <button
                  type="button"
                  className="subtle-button"
                  onClick={async () => {
                    const directory = await onChooseDirectory();
                    if (directory) patchSaving({ customDir: directory });
                  }}
                >
                  <FolderOpen size={14} />
                  浏览
                </button>
              </div>
            </div>
          ) : null}
          <div className="settings-v2-row">
            <div>
              <strong>文件名模板</strong>
              <span>支持 {"{title}、{artist}、{album}、{source}、{id}"}。</span>
            </div>
            <input
              className="settings-inline-input"
              value={draft.saving.template}
              onChange={(event) => patchSaving({ template: event.target.value })}
            />
          </div>
          <div className="settings-v2-toggle-grid">
            <SettingToggleRow
              title="保存 LRC 文件"
              description="在歌曲旁或指定目录生成 .lrc"
              checked={draft.saving.writeLrc}
              onChange={(writeLrc) => patchSaving({ writeLrc })}
            />
            <SettingToggleRow
              title="写入音频标签"
              description="写入 MP3 / FLAC / M4A 等标签"
              checked={draft.saving.embedTags}
              onChange={(embedTags) => patchSaving({ embedTags })}
            />
            <SettingToggleRow
              title="包含翻译"
              description="保存时同时写入译文行"
              checked={draft.saving.includeTranslation}
              onChange={(includeTranslation) =>
                patchSaving({ includeTranslation })
              }
            />
            <SettingToggleRow
              title="逐字增强 LRC"
              description="兼容 Salt Player / SPL"
              checked={draft.saving.enhancedLrc}
              onChange={(enhancedLrc) => patchSaving({ enhancedLrc })}
            />
            <SettingToggleRow
              title="UTF-8 BOM"
              description="兼容部分旧播放器"
              checked={draft.saving.bom}
              onChange={(bom) => patchSaving({ bom })}
            />
            <SettingToggleRow
              title="覆盖同名文件"
              description="关闭后保留已有歌词"
              checked={draft.saving.overwrite}
              onChange={(overwrite) => patchSaving({ overwrite })}
            />
          </div>
        </section>

        <section className="settings-v2-section">
          <header className="settings-v2-section-head">
            <span className="settings-v2-kicker">MATCHING</span>
            <h2>匹配偏好</h2>
            <p>决定本地歌曲如何选择在线歌词。</p>
          </header>
          <div className="settings-v2-row">
            <div>
              <strong>默认平台</strong>
              <span>
                软件打开后，歌词搜索与本地匹配的平台选择框默认选中该平台。
              </span>
            </div>
            <Segment
              value={draft.search.defaultSource}
              options={[
                ["all", "全部"],
                ["netease", "网易云"],
                ["qq", "QQ 音乐"],
              ] as const}
              onChange={(defaultSource) =>
                setDraft((current) => ({
                  ...current,
                  search: { ...current.search, defaultSource },
                }))
              }
            />
          </div>
          <div className="settings-v2-row">
            <div>
              <strong>默认配置平台</strong>
              <span>
                匹配完成后自动采用该平台的最优结果；最高分值会比较两个平台。
              </span>
            </div>
            <Segment
              value={draft.matching.prefer}
              options={[
                ["auto", "最高分值"],
                ["netease", "网易云"],
                ["qq", "QQ 音乐"],
              ] as const}
              onChange={(prefer) => patchMatching({ prefer })}
            />
          </div>
          <div className="settings-v2-row">
            <div>
              <strong>自动匹配阈值</strong>
              <span>严格模式只接受高度一致的候选。</span>
            </div>
            <Segment
              value={draft.matching.sensitivity}
              options={[
                ["strict", "严格"],
                ["balanced", "均衡"],
                ["loose", "宽松"],
              ] as const}
              onChange={(sensitivity) => patchMatching({ sensitivity })}
            />
          </div>
          <div className="settings-v2-row">
            <div>
              <strong>并发匹配数量</strong>
              <span>
                本地批量匹配时同时处理 1～10 首歌曲；平台请求另有安全上限。
              </span>
            </div>
            <ConcurrencyControl
              value={draft.matching.concurrency}
              onChange={(concurrency) => patchMatching({ concurrency })}
            />
          </div>
          <SettingToggleRow
            title="匹配后自动获取歌词"
            description="自动匹配成功的歌曲会立即拉取歌词。"
            checked={draft.matching.autoFetchLyrics}
            onChange={(autoFetchLyrics) =>
              patchMatching({ autoFetchLyrics })
            }
          />
        </section>

        <section className="settings-v2-section">
          <header className="settings-v2-section-head">
            <span className="settings-v2-kicker">PERFORMANCE</span>
            <h2>性能</h2>
            <p>网络和内存充足的设备可以启用更高吞吐配置。</p>
          </header>
          <SettingToggleRow
            title="高性能模式"
            description="提高平台搜索、封面加载和本地匹配的网络并发，并扩大 HTTP 连接池。"
            checked={draft.performance.highPerformance}
            onChange={(highPerformance) =>
              setDraft((current) => ({
                ...current,
                performance: { ...current.performance, highPerformance },
              }))
            }
          />
          <div className="settings-performance-note">
            <Zap size={15} />
            <div>
              <strong>启用后的资源策略</strong>
              <span>
                原生连接池 8 → 32；封面原生加载 6 → 14；网易云请求上限 2 → 5，QQ 音乐 8 → 16。
              </span>
            </div>
          </div>
        </section>

        <section className="settings-v2-section">
          <header className="settings-v2-section-head">
            <span className="settings-v2-kicker">DISPLAY</span>
            <h2>界面显示</h2>
            <p>新版已提高基础字号，并自动跟随 Windows 显示缩放。</p>
          </header>
          <div className="settings-v2-row">
            <div>
              <strong>界面缩放</strong>
              <span>高 DPI 下由 Windows 与 WebView2 自动适配。</span>
            </div>
            <span className="settings-static-value">跟随系统缩放</span>
          </div>
          <div className="settings-v2-row">
            <div>
              <strong>字体大小</strong>
              <span>搜索、歌词、设置和元数据均已增大一级。</span>
            </div>
            <span className="settings-static-value">舒适</span>
          </div>
        </section>

        <section className="settings-v2-section">
          <header className="settings-v2-section-head">
            <span className="settings-v2-kicker">DATA & ABOUT</span>
            <h2>数据与关于</h2>
            <p>便携、本地优先。<span>{paths.fallback ? "当前使用 APPDATA 回退目录" : "当前使用便携目录"}</span></p>
          </header>
          <div className="settings-v2-row">
            <div>
              <strong>便携数据目录</strong>
              <span className="settings-data-path">{paths.dataDir}</span>
            </div>
            <button
              type="button"
              className="subtle-button"
              onClick={onOpenDataDirectory}
            >
              <FolderOpen size={14} />
              打开数据目录
            </button>
          </div>
          <div className="settings-v2-row">
            <div>
              <strong>MiSideTag {__APP_VERSION__}</strong>
              <span>Tauri 2 · React · TypeScript · GPL-3.0-only</span>
            </div>
            <span className="settings-about-links">
              <a href="https://github.com/chenmozhijin/LDDC" target="_blank">LDDC</a>
              <a href="https://github.com/jitwxs/163MusicLyrics" target="_blank">163MusicLyrics</a>
            </span>
          </div>
          <div className="settings-about-note">
            <Info size={14} />
            本工具仅用于个人整理本地音乐歌词，歌词版权归原权利方所有。
          </div>
        </section>
      </div>

      <div className="settings-v2-savebar">
        <span className="settings-savebar-status">
          <ChevronRight size={14} />
          {status || (dirty ? "有未保存的修改" : "设置已保存")}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const restored = structuredClone(DEFAULT_CONFIG);
            restored.cookies = structuredClone(config.cookies);
            restored.accounts = structuredClone(config.accounts);
            setDraft(restored);
            setStatus("已恢复默认选项；账号 Cookie 未清除");
          }}
        >
          <RotateCcw size={14} />
          恢复默认设置
        </button>
        <button
          type="button"
          className="text-button"
          disabled={!dirty}
          onClick={() => {
            setDraft(structuredClone(config));
            setStatus("未保存的修改已撤销");
          }}
        >
          取消修改
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          <Save size={15} />
          {saving ? "保存中" : "保存设置"}
        </button>
      </div>
    </div>
  );
}
