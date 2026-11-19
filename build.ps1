param(
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$NoZip
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = "x86_64-pc-windows-gnu"
$package = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw |
    ConvertFrom-Json
$version = [string]$package.version
if ($version -notmatch '^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$') {
    throw "package.json 中的版本号无效：$version"
}
$stageName = "MiSideTag-TS-$version-win64"
$archiveName = "$stageName.zip"

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    throw "找不到 pnpm。"
}

$mingwCandidates = @(
    $env:MISIDETAG_MINGW_BIN,
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin")
) | Where-Object {
    $_ -and (Test-Path -LiteralPath (Join-Path $_ "x86_64-w64-mingw32-gcc.exe"))
}

if ($mingwCandidates.Count -eq 0) {
    throw "找不到 WinLibs MinGW。请设置 MISIDETAG_MINGW_BIN 指向 mingw64\bin。"
}

$mingw = $mingwCandidates | Select-Object -First 1
$env:PATH = "$mingw;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-gnu"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = "x86_64-w64-mingw32-gcc.exe"
$env:CC_x86_64_pc_windows_gnu = "x86_64-w64-mingw32-gcc.exe"
$env:CXX_x86_64_pc_windows_gnu = "x86_64-w64-mingw32-g++.exe"
$env:PNPM_HOME = Join-Path $root ".tools\pnpm-home"
$env:NPM_CONFIG_CACHE = Join-Path $root ".tools\npm-cache"
$env:NPM_CONFIG_STORE_DIR = Join-Path $root ".tools\pnpm-store"
$env:XDG_CACHE_HOME = Join-Path $root ".tools\cache"
$env:TEMP = Join-Path $root ".tools\temp"
$env:TMP = $env:TEMP
$env:CI = "true"

New-Item -ItemType Directory -Force -Path `
    $env:PNPM_HOME, $env:NPM_CONFIG_CACHE, $env:NPM_CONFIG_STORE_DIR, `
    $env:XDG_CACHE_HOME, $env:TEMP | Out-Null

Push-Location $root
try {
    & pnpm check:version
    if ($LASTEXITCODE -ne 0) {
        throw "版本配置校验失败。"
    }

    if (-not $SkipInstall) {
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            throw "依赖安装失败。"
        }
    }

    if (-not $SkipBuild) {
        & pnpm tauri build --no-bundle --target $target
        if ($LASTEXITCODE -ne 0) {
            throw "Tauri 构建失败。"
        }
    }

    $releaseRoot = [IO.Path]::GetFullPath((Join-Path $root "release"))
    $stage = [IO.Path]::GetFullPath((Join-Path $releaseRoot $stageName))
    if (-not $stage.StartsWith($releaseRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "拒绝清理 project/release 之外的目录：$stage"
    }
    if (Test-Path -LiteralPath $stage) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null

    $targetDir = Join-Path $root "src-tauri\target\$target\release"
    Copy-Item -LiteralPath (Join-Path $targetDir "misidetag-tauri-ts.exe") `
        -Destination (Join-Path $stage "MiSideTag.exe")
    Copy-Item -LiteralPath (Join-Path $targetDir "WebView2Loader.dll") `
        -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root "README.md") -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root "LICENSE") -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root "NOTICE") -Destination $stage

    $dataDir = Join-Path $stage "data"
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    Copy-Item -LiteralPath (Join-Path $root ".github\release-data-readme.txt") `
        -Destination (Join-Path $dataDir "README.txt")

    if (-not $NoZip) {
        $archive = [IO.Path]::GetFullPath((Join-Path $releaseRoot $archiveName))
        if (-not $archive.StartsWith($releaseRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw "拒绝写入 project/release 之外的压缩包：$archive"
        }
        if (Test-Path -LiteralPath $archive) {
            Remove-Item -LiteralPath $archive -Force
        }
        Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $archive -CompressionLevel Optimal
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
        $checksumPath = Join-Path $releaseRoot "SHA256SUMS.txt"
        "$hash *$archiveName" | Set-Content -LiteralPath $checksumPath -Encoding ASCII
        Write-Output "压缩包：$archive"
        Write-Output "SHA-256：$hash"
    }

    $size = (Get-ChildItem -LiteralPath $stage -Recurse -File | Measure-Object Length -Sum).Sum
    Write-Output ("便携目录：{0} ({1:N1} MB)" -f $stage, ($size / 1MB))
}
finally {
    Pop-Location
}
