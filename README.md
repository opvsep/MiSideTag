# MiSideTag TS

MiSideTag TS 是一款面向 Windows 的歌词搜索、匹配与本地整理工具。应用基于
**Tauri 2、React 和 TypeScript** 构建，支持网易云音乐与 QQ 音乐双平台搜索，
可将歌词保存为 LRC / SPL 文件，或直接写入本地音频标签。

当前版本：**2.1.0**

## 主要能力

### 双平台在线搜索

- 同时搜索网易云音乐与 QQ 音乐
- 每个平台默认加载 30 条结果
- 支持按平台筛选，不切换显示时自动发起新搜索
- 支持关键词、歌曲 ID 和音乐平台分享链接
- 可识别网易云与 QQ 音乐的完整链接、分享文案、短链接及数字歌曲 ID
- 搜索失败、平台限流和接口回退均有明确状态

### 歌词与封面

- 支持网易云 LRC、YRC 逐字歌词与译文
- 支持 QQ 音乐 LRC 和 QRC 逐字歌词
- 译文默认显示，可在预览区按需关闭
- 支持逐字时间轴演示、歌词自检和时间匹配检查
- 网易云与 QQ 音乐封面支持详情补全和原生取图回退
- 单曲大封面按完整比例显示

### 本地歌曲匹配

- 扫描单个文件或整个音乐文件夹
- 支持拖放导入并自动去重
- 支持 MP3、FLAC、M4A、MP4、OGG、OPUS、OGA、WAV、AIFF、APE、WV
- 根据歌名、歌手、专辑和时长进行多平台候选评分
- 自动匹配采用“默认配对平台”的最高分结果
- 搜索后显示“待确认”，手动选择后显示“准备就绪”，保存成功显示“完毕”
- 点击候选项立即应用并关闭候选窗口
- 本地候选搜索与歌词搜索统一为每平台 30 条
- 支持 1～10 首歌曲并发匹配

### 歌词保存

- 保存标准 LRC 或 Salt Player SPL
- 可保存到歌曲同目录或自定义目录
- 支持文件名模板
- 可选择是否包含译文
- 支持 UTF-8 BOM
- 支持覆盖同名文件或保留已有文件
- 支持写入 ID3、Vorbis、MP4 和 APE 等音频歌词标签

### 账号与平台

- 网易云与 QQ 音乐 Cookie 独立保存
- 保存前通过平台接口验证登录状态
- 自动获取并显示昵称、头像和 VIP 状态
- 登录失效、待验证和接口繁忙具有不同状态
- 网页登录按钮直接打开对应音乐平台官网

### 性能与稳定性

- 默认平台与默认配对平台分别配置
- 高性能模式可提高连接池、平台请求和封面加载并发
- 网易云、QQ 音乐分别限流，避免并发过高触发平台限制
- 封面原生加载带有缓存上限和并发队列
- 退出按钮、`Alt+F4` 和 `Ctrl+Q` 均会请求二次确认
- 普通搜索输入框不会保留 WebView2 表单历史建议

## 技术架构

```text
src/
  components/   React 界面组件
  lib/          搜索、账号验证、歌词解析、匹配与性能控制
  types.ts      公共数据类型

src-tauri/
  src/lib.rs    HTTP 传输、文件选择、配置写入和音频标签处理
  tauri.conf.json
```

- **前端**：React 19 + TypeScript
- **桌面容器**：Tauri 2
- **原生后端**：Rust
- **音频标签**：lofty
- **QRC 解码**：qrc-decoder
- **网络请求**：统一通过 Tauri 原生 HTTP 桥接
- **运行环境**：Windows 10/11 + WebView2

## 运行便携版

解压发布包后运行：

```text
MiSideTag.exe
```

Windows 11 通常已包含 WebView2。部分旧版 Windows 10 需要安装
Microsoft Edge WebView2 Runtime。

## 开发

环境要求：

- Node.js 20 或更高版本
- pnpm 11
- Rust stable
- Windows WebView2

常用命令：

```powershell
pnpm install
pnpm check
pnpm test
pnpm build:web
pnpm dev:desktop
```

浏览器预览：

```powershell
pnpm dev
```

打开 `http://127.0.0.1:1420/?demo=1` 可查看内置演示数据。

联网集成测试：

```powershell
$env:RUN_NETWORK = "1"
pnpm vitest run tests/providers.integration.test.ts tests/cover-diagnostic.integration.test.ts tests/link-resolution.integration.test.ts
```

## 构建 Windows 便携版

```powershell
.\build.ps1
```

输出：

```text
release/MiSideTag-TS-2.1.0-win64/
release/MiSideTag-TS-2.1.0-win64.zip
release/SHA256SUMS.txt
```

构建脚本会自动校验版本号、构建前端、编译桌面程序、整理便携目录并生成 SHA-256。

## 数据目录

应用优先使用可执行文件旁的 `data/`：

```text
data/
  config.json
  cache/
  downloads/
  logs/
```

如果该目录不可写，则回退到：

```text
%APPDATA%\MiSideTag-TS\data
```

设置、Cookie 和保存选项仅保存在本机。音频文件只有在用户主动使用“保存”或
“写入标签”功能时才会被修改。

## 已知边界

- 平台使用公开或网页接口，可能因限流、区域策略或人机验证暂时不可用
- 网易云和 QQ 音乐接口可能随时调整，应用会优先使用备用端点
- 部分歌曲在平台侧本身没有封面、歌词或对应版本
- 未签名可执行文件可能触发 Windows SmartScreen 提示
- 应用不包含自动更新器，需要手动下载新版本

## 许可

本项目使用 **GPL-3.0-only**。第三方组件和来源说明见 `NOTICE`。
