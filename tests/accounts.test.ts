import { beforeEach, describe, expect, it, vi } from "vitest";

const httpRequest = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/bridge", () => ({
  httpRequest,
}));

import { verifyAccount } from "../src/lib/accounts";

describe("account verification", () => {
  beforeEach(() => httpRequest.mockReset());

  it("returns the Netease nickname and avatar", async () => {
    httpRequest.mockResolvedValue({
      status: 200,
      finalUrl: "https://music.163.com/api/nuser/account/get",
      text: JSON.stringify({
        code: 200,
        profile: {
          nickname: "测试用户",
          avatarUrl: "http://p1.music.126.net/avatar.jpg",
          vipType: 11,
        },
      }),
    });
    const account = await verifyAccount("netease", "MUSIC_U=token");
    expect(account).toMatchObject({
      nickname: "测试用户",
      avatar: "https://p1.music.126.net/avatar.jpg",
      vip: true,
      valid: true,
    });
  });

  it("rejects a Netease cookie without MUSIC_U", async () => {
    const account = await verifyAccount("netease", "os=pc");
    expect(account.valid).toBe(false);
    expect(account.detail).toContain("MUSIC_U");
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it("treats an empty Netease account payload as invalid", async () => {
    httpRequest.mockResolvedValue({
      status: 200,
      finalUrl: "https://music.163.com/api/nuser/account/get",
      text: JSON.stringify({ code: 200, account: null, profile: null }),
    });
    const account = await verifyAccount("netease", "MUSIC_U=fake");
    expect(account.valid).toBe(false);
    expect(account.detail).toContain("失效");
  });

  it("returns the QQ nickname from the profile endpoint", async () => {
    httpRequest.mockResolvedValue({
      status: 200,
      finalUrl: "https://c.y.qq.com/profile",
      text: JSON.stringify({
        code: 0,
        data: {
          creator: {
            nick: "QQ 测试用户",
            headpic: "/avatar.jpg",
            vip: true,
          },
        },
      }),
    });
    const account = await verifyAccount(
      "qq",
      "uin=123456; qm_keyst=token",
    );
    expect(account).toMatchObject({
      nickname: "QQ 测试用户",
      avatar: "https://y.qq.com/avatar.jpg",
      vip: true,
      valid: true,
    });
  });

  it("uses musicu as the QQ profile fallback", async () => {
    httpRequest
      .mockResolvedValueOnce({
        status: 200,
        finalUrl: "https://c.y.qq.com/profile",
        text: JSON.stringify({ code: 1000 }),
      })
      .mockResolvedValueOnce({
        status: 200,
        finalUrl: "https://u.y.qq.com/musicu.fcg",
        text: JSON.stringify({
          req: {
            code: 0,
            data: { nick: "备用昵称" },
          },
        }),
      });
    const account = await verifyAccount("qq", "uin=123; qm_keyst=token");
    expect(account.valid).toBe(true);
    expect(account.nickname).toBe("备用昵称");
  });

  it("rejects an incomplete QQ cookie", async () => {
    const account = await verifyAccount("qq", "uin=123");
    expect(account.valid).toBe(false);
    expect(account.detail).toContain("qm_keyst");
  });
});
