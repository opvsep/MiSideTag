use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use lofty::{
    config::WriteOptions,
    file::{AudioFile, TaggedFileExt},
    probe::Probe,
    tag::{Accessor, ItemKey, Tag, TagExt, TagType},
};
use reqwest::{
    Client,
    header::{HeaderMap, HeaderName, HeaderValue, USER_AGENT},
    redirect::Policy,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use walkdir::WalkDir;

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "m4a", "mp4", "ogg", "opus", "oga", "wav", "aiff", "aif", "ape", "wv",
];
const DEFAULT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

struct HttpState {
    standard_client: Client,
    performance_client: Client,
    high_performance: AtomicBool,
}

impl HttpState {
    fn client(&self) -> &Client {
        if self.high_performance.load(Ordering::Relaxed) {
            &self.performance_client
        } else {
            &self.standard_client
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppPaths {
    app_dir: String,
    data_dir: String,
    config_path: String,
    cache_dir: String,
    downloads_dir: String,
    log_dir: String,
    fallback: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalTrack {
    path: String,
    title: String,
    artist: String,
    album: String,
    duration_ms: i64,
    codec: String,
    tag_type: String,
    has_embedded_lyric: bool,
    lyric_path: Option<String>,
    parse_source: String,
    error: String,
}

#[derive(Debug, Deserialize)]
struct HttpRequest {
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResponse {
    status: u16,
    final_url: String,
    text: String,
}

fn app_base_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn can_write(directory: &Path) -> bool {
    if fs::create_dir_all(directory).is_err() {
        return false;
    }
    let probe = directory.join(".misidetag-ts-write-test");
    let writable = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(probe);
    writable
}

fn data_directory() -> (PathBuf, bool) {
    let portable = app_base_dir().join("data");
    if can_write(&portable) {
        return (portable, false);
    }
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(app_base_dir)
        .join("MiSideTag-TS")
        .join("data");
    let _ = fs::create_dir_all(&base);
    (base, true)
}

fn paths() -> AppPaths {
    let app_dir = app_base_dir();
    let (data_dir, fallback) = data_directory();
    AppPaths {
        app_dir: app_dir.display().to_string(),
        data_dir: data_dir.display().to_string(),
        config_path: data_dir.join("config.json").display().to_string(),
        cache_dir: data_dir.join("cache").display().to_string(),
        downloads_dir: data_dir.join("downloads").display().to_string(),
        log_dir: data_dir.join("logs").display().to_string(),
        fallback,
    }
}

#[tauri::command]
fn app_paths() -> AppPaths {
    paths()
}

#[tauri::command]
fn load_config() -> Result<Option<Value>, String> {
    let path = PathBuf::from(paths().config_path);
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path).map_err(|error| format!("读取配置失败：{error}"))?;
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|error| format!("配置格式错误：{error}"))
}

#[tauri::command]
fn save_config(config: Value) -> Result<(), String> {
    let app_paths = paths();
    for directory in [
        app_paths.data_dir,
        app_paths.cache_dir,
        app_paths.downloads_dir,
        app_paths.log_dir,
    ] {
        fs::create_dir_all(directory).map_err(|error| format!("创建数据目录失败：{error}"))?;
    }
    let path = PathBuf::from(app_paths.config_path);
    let text = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("序列化配置失败：{error}"))?;
    fs::write(path, text).map_err(|error| format!("保存配置失败：{error}"))
}

#[tauri::command]
fn select_audio_files() -> Vec<String> {
    let extensions = [
        "mp3", "flac", "m4a", "mp4", "ogg", "opus", "oga", "wav", "aiff", "aif", "ape", "wv",
    ];
    rfd::FileDialog::new()
        .set_title("添加音乐文件")
        .add_filter("音频文件", &extensions)
        .pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.display().to_string())
        .collect()
}

#[tauri::command]
fn select_audio_folder() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("添加音乐文件夹")
        .pick_folder()
        .map(|path| path.display().to_string())
}

#[tauri::command]
fn select_directory() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择歌词保存目录")
        .pick_folder()
        .map(|path| path.display().to_string())
}

#[tauri::command]
fn select_save_file(default_name: String) -> Option<String> {
    rfd::FileDialog::new()
        .set_title("另存歌词")
        .set_file_name(default_name)
        .add_filter("歌词文件", &["lrc", "spl"])
        .save_file()
        .map(|path| path.display().to_string())
}

#[tauri::command]
async fn http_request(
    state: State<'_, HttpState>,
    request: HttpRequest,
) -> Result<HttpResponse, String> {
    let method = request
        .method
        .as_deref()
        .unwrap_or("GET")
        .parse::<reqwest::Method>()
        .map_err(|error| format!("无效的 HTTP 方法：{error}"))?;
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_USER_AGENT));
    for (key, value) in request.headers.unwrap_or_default() {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|error| format!("无效请求头：{error}"))?;
        let value =
            HeaderValue::from_str(&value).map_err(|error| format!("无效请求头值：{error}"))?;
        headers.insert(name, value);
    }
    let mut builder = state
        .client()
        .request(method.clone(), &request.url)
        .headers(headers);
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let response = builder
        .send()
        .await
        .map_err(|error| format!("网络请求失败：{error}"))?;
    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取网络响应失败：{error}"))?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    Ok(HttpResponse {
        status,
        final_url,
        text,
    })
}

#[tauri::command]
async fn fetch_image_data_url(
    state: State<'_, HttpState>,
    url: String,
    referer: Option<String>,
) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("无效的图片地址".to_owned());
    }
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_USER_AGENT));
    headers.insert(
        reqwest::header::ACCEPT,
        HeaderValue::from_static("image/avif,image/webp,image/apng,image/*,*/*;q=0.8"),
    );
    if let Some(referer) = referer {
        headers.insert(
            "referer",
            HeaderValue::from_str(&referer).map_err(|error| format!("无效的 Referer：{error}"))?,
        );
    }
    let mut response = None;
    let mut last_error = String::new();
    for _ in 0..2 {
        match state
            .client()
            .get(&url)
            .headers(headers.clone())
            .send()
            .await
        {
            Ok(candidate) if candidate.status().is_success() => {
                response = Some(candidate);
                break;
            }
            Ok(candidate) => {
                last_error = format!("HTTP {}", candidate.status());
            }
            Err(error) => {
                last_error = error.to_string();
            }
        }
    }
    let response = response.ok_or_else(|| format!("封面下载失败：{last_error}"))?;
    let header_content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取封面失败：{error}"))?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("封面文件过大".to_owned());
    }
    let content_type = detect_image_content_type(header_content_type.as_deref(), &bytes)
        .ok_or_else(|| "远程资源不是图片".to_owned())?;
    Ok(format!(
        "data:{content_type};base64,{}",
        STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn set_performance_mode(state: State<'_, HttpState>, enabled: bool) {
    state.high_performance.store(enabled, Ordering::Relaxed);
}

fn detect_image_content_type(header: Option<&str>, bytes: &[u8]) -> Option<String> {
    if let Some(header) = header {
        let normalized = header.split(';').next().unwrap_or_default().trim();
        if normalized.starts_with("image/") {
            return Some(normalized.to_owned());
        }
    }
    let sniffed = if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        "image/png"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        "image/avif"
    } else {
        return None;
    };
    Some(sniffed.to_owned())
}

#[tauri::command]
async fn scan_audio(paths: Vec<String>, recursive: bool) -> Result<Vec<LocalTrack>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut seen = HashSet::new();
        let mut files = Vec::new();
        for target in paths {
            let target = PathBuf::from(target);
            if target.is_file() {
                if supported(&target) {
                    files.push(target);
                }
                continue;
            }
            if !target.is_dir() {
                continue;
            }
            let walker = if recursive {
                WalkDir::new(&target)
            } else {
                WalkDir::new(&target).max_depth(1)
            };
            for entry in walker.into_iter().filter_map(Result::ok) {
                let path = entry.into_path();
                if path.is_file() && supported(&path) {
                    files.push(path);
                }
            }
        }
        files.sort_by_key(|path| {
            (
                path.parent()
                    .map(|value| value.to_string_lossy().to_lowercase())
                    .unwrap_or_default(),
                path.file_name()
                    .map(|value| value.to_string_lossy().to_lowercase())
                    .unwrap_or_default(),
            )
        });
        files.retain(|path| {
            let key = path
                .canonicalize()
                .unwrap_or_else(|_| path.clone())
                .to_string_lossy()
                .to_lowercase();
            seen.insert(key)
        });
        files.into_iter().map(read_track).collect::<Vec<_>>()
    })
    .await
    .map_err(|error| format!("扫描任务失败：{error}"))
}

fn read_track(path: PathBuf) -> LocalTrack {
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    let (filename_title, filename_artist) = guess_title_artist(&stem);
    let mut track = LocalTrack {
        path: path.display().to_string(),
        title: filename_title,
        artist: filename_artist,
        album: String::new(),
        duration_ms: 0,
        codec: String::new(),
        tag_type: String::new(),
        has_embedded_lyric: false,
        lyric_path: sidecar_lrc(&path).map(|value| value.display().to_string()),
        parse_source: "filename".to_owned(),
        error: String::new(),
    };
    let tagged = match Probe::open(&path).and_then(|probe| probe.read()) {
        Ok(value) => value,
        Err(error) => {
            track.error = format!("无法读取音频标签：{error}");
            return track;
        }
    };
    track.duration_ms = tagged.properties().duration().as_millis() as i64;
    track.codec = format!("{:?}", tagged.file_type());
    if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
        let title = tag
            .title()
            .map(|value| value.to_string())
            .unwrap_or_default();
        let artist = tag
            .artist()
            .map(|value| value.to_string())
            .unwrap_or_default();
        let album = tag
            .album()
            .map(|value| value.to_string())
            .unwrap_or_default();
        if !title.is_empty() {
            track.title = title;
            track.parse_source = "tags".to_owned();
        }
        if !artist.is_empty() {
            track.artist = artist;
        }
        if !album.is_empty() {
            track.album = album;
        }
        track.has_embedded_lyric = tag
            .get_string(ItemKey::Lyrics)
            .or_else(|| tag.get_string(ItemKey::UnsyncLyrics))
            .is_some_and(|value| !value.trim().is_empty());
        track.tag_type = format!("{:?}", tag.tag_type());
    } else {
        track.tag_type = "无标签".to_owned();
    }
    track
}

fn guess_title_artist(stem: &str) -> (String, String) {
    let trimmed = regex_lite_track_prefix(stem).trim();
    for separator in [" - ", " – ", " — "] {
        if let Some((artist, title)) = trimmed.split_once(separator)
            && !artist.trim().is_empty()
            && !title.trim().is_empty()
        {
            return (title.trim().to_owned(), artist.trim().to_owned());
        }
    }
    (trimmed.to_owned(), String::new())
}

fn regex_lite_track_prefix(stem: &str) -> &str {
    let trimmed = stem.trim_start();
    let digit_count = trimmed.chars().take_while(char::is_ascii_digit).count();
    if digit_count == 0 || digit_count > 3 {
        return trimmed;
    }
    let rest = &trimmed[digit_count..];
    let separators = rest
        .chars()
        .take_while(|character| matches!(character, ' ' | '.' | '_' | '-'))
        .count();
    if separators > 0 {
        rest[separators..].trim_start()
    } else {
        trimmed
    }
}

fn supported(path: &Path) -> bool {
    path.extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .is_some_and(|extension| AUDIO_EXTENSIONS.contains(&extension.as_str()))
}

fn sidecar_lrc(path: &Path) -> Option<PathBuf> {
    let candidate = path.with_extension("lrc");
    if candidate.exists() {
        return Some(candidate);
    }
    let stem = path.file_stem()?.to_string_lossy().to_lowercase();
    path.parent()?.read_dir().ok()?.flatten().find_map(|entry| {
        let item = entry.path();
        let lrc = item
            .extension()
            .map(|value| value.to_string_lossy().eq_ignore_ascii_case("lrc"))
            .unwrap_or(false);
        let item_stem = item.file_stem()?.to_string_lossy().to_lowercase();
        (lrc && item_stem == stem).then_some(item)
    })
}

#[tauri::command]
fn embed_lyrics(path: String, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("歌词内容为空，无法写入标签".to_owned());
    }
    let path = PathBuf::from(path);
    let tagged = Probe::open(&path)
        .and_then(|probe| probe.read())
        .map_err(|error| format!("读取音频失败：{error}"))?;
    let tag_type = tagged.primary_tag_type();
    let mut tag = tagged
        .primary_tag()
        .cloned()
        .unwrap_or_else(|| Tag::new(tag_type));
    let key = if matches!(tag_type, TagType::Id3v2) {
        ItemKey::UnsyncLyrics
    } else {
        ItemKey::Lyrics
    };
    tag.remove_key(key);
    tag.insert_text(key, text);
    let mut tagged = tagged;
    if tagged.primary_tag().is_some() {
        *tagged.primary_tag_mut().expect("primary tag checked") = tag;
    } else {
        tagged.insert_tag(tag);
    }
    tagged
        .primary_tag()
        .ok_or_else(|| "该格式没有可写入的标签".to_owned())?
        .save_to_path(&path, WriteOptions::default())
        .map_err(|error| format!("写入标签失败：{error}"))
}

#[cfg(test)]
fn read_embedded_lyrics(path: &Path) -> String {
    Probe::open(path)
        .and_then(|probe| probe.read())
        .ok()
        .and_then(|tagged| {
            tagged
                .primary_tag()
                .or_else(|| tagged.first_tag())
                .and_then(|tag| {
                    tag.get_string(ItemKey::Lyrics)
                        .or_else(|| tag.get_string(ItemKey::UnsyncLyrics))
                        .map(str::to_owned)
                })
        })
        .unwrap_or_default()
}

#[tauri::command]
fn write_lyrics_file(path: String, text: String, bom: bool, overwrite: bool) -> Result<(), String> {
    let path = PathBuf::from(path);
    if path.exists() && !overwrite {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建歌词目录失败：{error}"))?;
    }
    let temp = path.with_extension(format!("misidetag-ts-{}.tmp", std::process::id()));
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp)
        .map_err(|error| format!("创建临时歌词文件失败：{error}"))?;
    if bom {
        file.write_all(&[0xef, 0xbb, 0xbf])
            .map_err(|error| format!("写入 BOM 失败：{error}"))?;
    }
    file.write_all(text.as_bytes())
        .map_err(|error| format!("写入歌词失败：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("同步歌词文件失败：{error}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("替换旧歌词失败：{error}"))?;
    }
    fs::rename(&temp, &path).map_err(|error| format!("保存歌词失败：{error}"))
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    Command::new("explorer")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法打开目录：{error}"))
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("只允许打开 HTTP 或 HTTPS 地址".to_owned());
    }
    Command::new("explorer")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法打开网页：{error}"))
}

#[tauri::command]
fn exit_app() {
    std::process::exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let standard_client = Client::builder()
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(7))
        .redirect(Policy::limited(10))
        .pool_max_idle_per_host(8)
        .tcp_nodelay(true)
        .build()
        .expect("failed to initialize standard HTTP client");
    let performance_client = Client::builder()
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(5))
        .redirect(Policy::limited(10))
        .pool_max_idle_per_host(32)
        .tcp_nodelay(true)
        .gzip(true)
        .deflate(true)
        .build()
        .expect("failed to initialize high-performance HTTP client");
    tauri::Builder::default()
        .manage(HttpState {
            standard_client,
            performance_client,
            high_performance: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            app_paths,
            load_config,
            save_config,
            select_audio_files,
            select_audio_folder,
            select_directory,
            select_save_file,
            set_performance_mode,
            http_request,
            fetch_image_data_url,
            scan_audio,
            embed_lyrics,
            write_lyrics_file,
            open_path,
            open_external,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MiSideTag");
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Write};

    use tempfile::tempdir;

    use super::{detect_image_content_type, embed_lyrics, read_embedded_lyrics, scan_audio};

    fn write_test_wav(path: &std::path::Path) {
        let sample_rate = 44_100_u32;
        let data_size = 882_u32;
        let file = fs::File::create(path).unwrap();
        let mut writer = std::io::BufWriter::new(file);
        writer.write_all(b"RIFF").unwrap();
        writer.write_all(&(36 + data_size).to_le_bytes()).unwrap();
        writer.write_all(b"WAVEfmt ").unwrap();
        writer.write_all(&16_u32.to_le_bytes()).unwrap();
        writer.write_all(&1_u16.to_le_bytes()).unwrap();
        writer.write_all(&1_u16.to_le_bytes()).unwrap();
        writer.write_all(&sample_rate.to_le_bytes()).unwrap();
        writer.write_all(&(sample_rate * 2).to_le_bytes()).unwrap();
        writer.write_all(&2_u16.to_le_bytes()).unwrap();
        writer.write_all(&16_u16.to_le_bytes()).unwrap();
        writer.write_all(b"data").unwrap();
        writer.write_all(&data_size.to_le_bytes()).unwrap();
        writer.write_all(&vec![0_u8; data_size as usize]).unwrap();
        writer.flush().unwrap();
    }

    #[test]
    fn writes_and_reads_wav_lyrics() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("tag-check.wav");
        write_test_wav(&path);

        let text = "[ti:MiSideTag]\n[00:01.00]tag check\n";
        embed_lyrics(path.display().to_string(), text.to_owned()).unwrap();
        assert!(read_embedded_lyrics(&path).contains("tag check"));
    }

    #[test]
    fn scans_a_selected_audio_file() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("Artist - Title.wav");
        write_test_wav(&path);
        let result =
            tauri::async_runtime::block_on(scan_audio(vec![path.display().to_string()], false))
                .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "Title");
        assert_eq!(result[0].artist, "Artist");
    }

    #[test]
    fn detects_images_when_the_server_mislabels_the_content_type() {
        let jpeg = [0xff, 0xd8, 0xff, 0xe0];
        assert_eq!(
            detect_image_content_type(Some("application/octet-stream"), &jpeg).as_deref(),
            Some("image/jpeg")
        );
    }
}
