export interface SongLinkIdentifiers {
  neteaseId: string;
  qqMid: string;
  qqNumericId: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'“”]+/i;
const TRAILING_PUNCTUATION = /[)\]}>.,;:!?，。；：！？、）】》]+$/u;

export function extractHttpUrl(text: string): string | null {
  const direct = text.match(URL_PATTERN)?.[0];
  if (direct) return direct.replace(TRAILING_PUNCTUATION, "");
  try {
    const decoded = decodeURIComponent(text);
    return decoded.match(URL_PATTERN)?.[0]?.replace(TRAILING_PUNCTUATION, "") || null;
  } catch {
    return null;
  }
}

export function extractSongLinkIdentifiers(text: string): SongLinkIdentifiers {
  const normalized = normalizeShareText(text);
  const neteaseContext =
    /(?:music\.163\.com|163cn\.tv|music\.126\.net)/i.test(normalized);
  const qqContext = /(?:y\.qq\.com|qq\.com)/i.test(normalized);

  const neteaseId = neteaseContext
    ? normalized.match(
        /(?:[?&#](?:id|songid)=|\/song\/)(\d{5,})/i,
      )?.[1] || ""
    : "";
  let qqMid = "";
  let qqNumericId = "";
  if (qqContext) {
    const qqRouteId =
      normalized.match(
        /(?:songDetail|song)\/([A-Za-z0-9]{8,})/i,
      )?.[1] || "";
    if (qqRouteId) {
      if (/^\d+$/.test(qqRouteId)) qqNumericId = qqRouteId;
      else qqMid = qqRouteId;
    } else {
      qqNumericId =
        normalized.match(/[?&#](?:songid|songId)=(\d+)/i)?.[1] ||
        normalized.match(
          /["'](?:songid|songId)["']\s*:\s*(\d+)/i,
        )?.[1] ||
        "";
      qqMid =
        normalized.match(
          /[?&#](?:songmid|songMid|mid)=([A-Za-z0-9]{8,})/i,
        )?.[1] ||
        normalized.match(
          /["'](?:songmid|songMid|mid)["']\s*:\s*["']([A-Za-z0-9]{8,})["']/i,
        )?.[1] ||
        "";
    }
  }

  return { neteaseId, qqMid, qqNumericId };
}

function normalizeShareText(text: string): string {
  let normalized = text
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the original share text when it contains malformed escapes.
  }
  return normalized;
}
