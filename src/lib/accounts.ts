import type { AccountState, ProviderSource } from "../types";
import { httpRequest } from "./bridge";
import { normalizeCookie, parseCookie } from "./utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function emptyAccount(
  valid: boolean | null,
  detail: string,
): AccountState {
  return {
    nickname: "",
    avatar: "",
    vip: false,
    valid,
    detail,
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const match = trimmed.match(/^[\w$.]+\s*\(([\s\S]*)\)\s*;?$/);
  return JSON.parse(match ? match[1] : trimmed) as unknown;
}

async function requestJson(
  url: string,
  cookie: string,
  referer: string,
): Promise<unknown> {
  const response = await httpRequest({
    url,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Referer: referer,
      Cookie: cookie,
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`平台返回 HTTP ${response.status}`);
  }
  return parseJson(response.text);
}

function cookieValue(
  cookies: Record<string, string>,
  keys: readonly string[],
): string {
  for (const [key, value] of Object.entries(cookies)) {
    if (keys.some((expected) => key.toLowerCase() === expected.toLowerCase())) {
      return value;
    }
  }
  return "";
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeAvatar(value: string): string {
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://y.qq.com${value}`;
  return value.replace(/^http:/, "https:");
}

export async function verifyAccount(
  source: ProviderSource,
  rawCookie: string,
): Promise<AccountState> {
  const cookie = normalizeCookie(rawCookie);
  if (!cookie) return emptyAccount(false, "未填写 Cookie");
  if (source === "netease") return verifyNetease(cookie);
  return verifyQq(cookie);
}

async function verifyNetease(cookie: string): Promise<AccountState> {
  const values = parseCookie(cookie);
  if (!cookieValue(values, ["MUSIC_U"])) {
    return emptyAccount(
      false,
      "Cookie 中缺少 MUSIC_U，请从已登录的网易云网页复制",
    );
  }
  let lastError = "";
  for (const endpoint of [
    "https://music.163.com/api/nuser/account/get",
    "https://music.163.com/api/w/nuser/account/get",
  ]) {
    try {
      const data = object(
        await requestJson(endpoint, cookie, "https://music.163.com/"),
      );
      if (!data) continue;
      const code = numberValue(data.code);
      const profile = object(data.profile);
      const account = object(data.account);
      if (code === 200 && (profile || account)) {
        const user = profile ?? account ?? {};
        return {
          nickname:
            stringValue(user.nickname) ||
            stringValue(user.userName) ||
            stringValue(user.username) ||
            "网易云用户",
          avatar: normalizeAvatar(stringValue(user.avatarUrl)),
          vip:
            numberValue(user.vipType) > 0 ||
            Boolean(user.vipRights),
          valid: true,
          detail: "登录状态有效",
        };
      }
      if (code === 200 || [301, 401, 403].includes(code)) {
        return emptyAccount(false, "Cookie 已失效或未登录");
      }
      lastError = stringValue(data.message) || `网易云接口返回 code ${code}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return emptyAccount(null, lastError || "无法确认网易云登录状态");
}

async function verifyQq(cookie: string): Promise<AccountState> {
  const values = parseCookie(cookie);
  const loginType =
    cookieValue(values, ["login_type", "login_type2"]) || "";
  const uinKeys =
    loginType === "2"
      ? ["wxuin", "uin", "qqmusic_uin", "p_uin"]
      : ["uin", "wxuin", "qqmusic_uin", "p_uin"];
  const uin = decodeCookieValue(cookieValue(values, uinKeys))
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  const loginKey = decodeCookieValue(
    cookieValue(values, [
      "qm_keyst",
      "qqmusic_key",
      "music_key",
      "p_skey",
      "skey",
      "psrf_qqaccess_token",
      "wxskey",
    ]),
  ).trim();
  if (!uin || !loginKey) {
    return emptyAccount(
      false,
      "Cookie 中缺少 uin 或 qm_keyst/qqmusic_key，请从已登录的 QQ 音乐网页复制",
    );
  }

  let profileError = "";
  try {
    const params = new URLSearchParams({
      format: "json",
      cid: "205360838",
      userid: uin,
      loginUin: uin,
      hostUin: "0",
      reqfrom: "1",
      g_tk: "5381",
      inCharset: "utf8",
      outCharset: "utf-8",
      notice: "0",
      platform: "yqq.json",
      needNewCode: "0",
    });
    const data = object(
      await requestJson(
        `https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?${params}`,
        cookie,
        "https://y.qq.com/",
      ),
    );
    const code = numberValue(data?.code);
    if (code === 0) {
      const creator = object(object(data?.data)?.creator) ?? {};
      return {
        nickname:
          stringValue(creator.nick) ||
          stringValue(creator.name) ||
          "QQ 音乐用户",
        avatar: normalizeAvatar(
          stringValue(creator.headpic) || stringValue(creator.avatar),
        ),
        vip: Boolean(creator.vip) || Boolean(creator.green),
        valid: true,
        detail: "登录状态有效",
      };
    }
    if (code === 1306) {
      return emptyAccount(
        null,
        "平台要求人机验证，请稍后重试或仅保存 Cookie",
      );
    }
    if (code === 2001) {
      return emptyAccount(null, "QQ 音乐繁忙，请稍后重试");
    }
    if ([1000, 301].includes(code)) {
      profileError = "Cookie 已失效或没有登录";
    } else {
      profileError = `QQ 资料接口返回 code ${code}`;
    }
  } catch (error) {
    profileError = error instanceof Error ? error.message : String(error);
  }

  try {
    const payload = {
      comm: {
        ct: 19,
        cv: 0,
        uin,
        authst: loginKey,
        format: "json",
        platform: "yqq.json",
      },
      req: {
        module: "music.UserInfo.userInfoServer",
        method: "GetLoginUserInfo",
        param: {},
      },
    };
    const params = new URLSearchParams({
      format: "json",
      data: JSON.stringify(payload),
    });
    const data = object(
      await requestJson(
        `https://u.y.qq.com/cgi-bin/musicu.fcg?${params}`,
        cookie,
        "https://y.qq.com/",
      ),
    );
    const request = object(data?.req);
    const code = numberValue(request?.code);
    if (code === 0) {
      const user = object(request?.data) ?? {};
      return {
        nickname:
          stringValue(user.nick) ||
          stringValue(user.nickname) ||
          stringValue(user.name) ||
          stringValue(object(user.creator)?.nick) ||
          "QQ 音乐用户",
        avatar: "",
        vip: false,
        valid: true,
        detail: "登录状态有效（musicu 校验）",
      };
    }
    if (code === 104003) {
      return {
        nickname: "QQ 音乐用户",
        avatar: "",
        vip: false,
        valid: true,
        detail: "登录有效，但 Cookie 缺少播放票据",
      };
    }
    if ([1000, 301, 500003, 860100001].includes(code)) {
      return emptyAccount(false, "Cookie 已失效或没有登录");
    }
    profileError =
      profileError || `QQ 登录接口返回 code ${code}`;
  } catch (error) {
    profileError =
      profileError || (error instanceof Error ? error.message : String(error));
  }
  return emptyAccount(null, profileError || "无法确认 QQ 登录状态");
}
