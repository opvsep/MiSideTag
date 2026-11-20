# MiSideTag TS 2.0.0

MiSideTag 的正式 TypeScript 桌面版：**Tauri 2 + React + TypeScript**。

原 Python 工程和现有 Rust + Slint 工程都保持只读；本目录是独立实现，使用独立的
`MiSideTag-TS` 数据目录和 `dev.misidetag.ts` 应用标识，不会读取或修改原版的
`data/config.json`、Cookie、缓存和歌词。

## 已实现

- 网易云音乐与 QQ 音乐搜索
- 网易云搜索支持 `cloudsearch`、旧版与备用域名自动回退，限流错误不再显示为空结果
- 网易云批量歌曲详情补全，搜索结果和小尺寸封面不再缺失
- 网易云歌词增加多域名与 `lyric/v1` 备用端点
- 网易云 LRC / YRC 歌词与译文合并
- QQ LRC 歌词和纯 TypeScript QRC 逐字歌词解码
- QQ 音乐增加 songmid / musicid 歌词回退，以及单曲页解析重试
- 网易云、QQ 单曲封面支持 Tauri 原生取图回退，修复偶发缺失
- 搜索结果按两个平台的原生顺序交错展示
- 歌词预览、译文、自检和逐字时间轴演示
- 译文显示默认开启，可在预览区按需关闭
- LRC / Salt Player SPL 序列化
- 退出按钮、Alt+F4 和 Ctrl+Q 二次确认
- 在线搜索与本地候选搜索均可从网易云 / QQ 音乐分享文案中识别长链接、短链接和歌曲 ID
- 本地音频扫描，支持 MP3、FLAC、M4A、OGG、OPUS、WAV、AIFF、APE、WV
- 原生文件选择、文件/文件夹拖放和重复歌曲去重
- 基于 `lofty` 的 ID3 `USLT`、Vorbis `LYRICS`、MP4 `©lyr`、APE `LYRICS` 写回
- 本地多平台候选评分、自动匹配、待确认和手动换歌
- 本地匹配选择候选项后立即应用并关闭候选窗口
- 本地批量匹配支持 1～10 首歌曲并发处理，并限制各平台网络请求上限
- 高性能模式提高连接池、搜索变体、封面加载与平台请求并发
- 设置草稿、保存/取消、Cookie 本地存储和独立便携目录
- Tauri 原生文件选择、LRC 原子写入、打开目录和自绘标题栏
- 已移除显式快捷键提示和筛选/开关上的勾选符号
- 搜索空状态、本地导入、设置分组和退出确认按照参考图重新整理

## 技术边界

- 界面和业务逻辑位于 `src/`，是 TypeScript。
- `src-tauri/` 只负责 HTTP 传输、文件选择、配置落盘和音频标签流读写。
- 原 Python 工程没有作为运行时依赖，也没有捆绑 Python。
- QRC 解码使用 MIT 许可的 `qrc-decoder`。

## 开发

```powershell
pnpm install
pnpm check
pnpm test
pnpm build:web
pnpm dev:desktop
```

联网集成测试：

```powershell
$env:RUN_NETWORK = "1"
pnpm vitest run tests/providers.integration.test.ts tests/cover-diagnostic.integration.test.ts
```

浏览器预览：

```powershell
pnpm dev
```

打开 `http://127.0.0.1:1420/?demo=1` 可查看演示数据。

## 构建便携版

```powershell
.\build.ps1
```

当前机器使用 GNU Rust 工具链和 WinLibs MinGW。脚本会自动设置工具链、构建静态
Web 资源、生成 Windows 可执行文件并复制 `WebView2Loader.dll`。

输出：

```text
release/MiSideTag-TS-2.0.0-win64/
release/MiSideTag-TS-2.0.0-win64.zip
release/SHA256SUMS.txt
```

Windows 11 默认带 WebView2；部分旧版 Windows 10 需要安装 Microsoft Edge
WebView2 Runtime。

## 数据目录

新版优先写入可执行文件旁的 `data/`；如果目录不可写，回退到：

```text
%APPDATA%\MiSideTag-TS\data
```

不会自动导入原版 Cookie。用户需要在设置页重新粘贴 Cookie，或明确迁移旧配置。

## GitHub 发布

`tauri-ts/` 是独立项目根目录，可直接作为 GitHub 仓库上传：

```powershell
git init
git add .
git commit -m "release: MiSideTag TS 2.0.0"
git branch -M main
git remote add origin https://github.com/<your-name>/<repo>.git
git push -u origin main
git tag v2.0.0
git push origin v2.0.0
```

推送 `v2.0.0` 标签后，`.github/workflows/release.yml` 会在 Windows
环境运行测试、构建便携包、生成 SHA-256，并创建 GitHub Release。

## 已知边界

- 网易云与 QQ 音乐使用公开或网页接口，平台限流时可能临时失败
- Cookie 可保存并参与请求，但账号昵称自动验证尚未实现
- 不包含自动更新器，正式包需要从 Release 手动下载更新
- 未签名可执行文件可能触发 Windows SmartScreen 提示

## 许可

本项目延续 GPL-3.0-only。第三方说明见 `NOTICE`。
