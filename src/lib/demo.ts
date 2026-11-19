import type { LocalMatch, LocalTrack, LyricWord, Song } from "../types";
import { songKey } from "../types";
import { parseLrc } from "./lyrics";

function cover(index: number): string {
  return `/assets/demo_cover_${index}.png`;
}

export const DEMO_SONGS: Song[] = [
  {
    source: "qq",
    id: "004DemoStar01",
    numericId: "900001",
    title: "夜航星图",
    artists: ["月见八千代"],
    album: "月面电台",
    durationMs: 222000,
    coverUrl: cover(1),
  },
  {
    source: "netease",
    id: "1900000001",
    title: "潮汐来信",
    artists: ["星见汐"],
    album: "低温海岸",
    durationMs: 245000,
    coverUrl: cover(2),
  },
  {
    source: "qq",
    id: "004DemoRain02",
    numericId: "900002",
    title: "雨停之前",
    artists: ["MiSide"],
    album: "夏末回声",
    durationMs: 198000,
    coverUrl: cover(3),
  },
  {
    source: "netease",
    id: "1900000002",
    title: "把名字写进 TAG",
    artists: ["Sora"],
    album: "便携播放器",
    durationMs: 216000,
    coverUrl: cover(4),
  },
  {
    source: "qq",
    id: "004DemoNight03",
    numericId: "900003",
    title: "零点公交",
    artists: ["月见八千代"],
    album: "夜行线路",
    durationMs: 254000,
    coverUrl: cover(5),
  },
];

function demoLrc(song: Song, rows: string[], translations: string[] = []) {
  const content = [
    `[ti:${song.title}]`,
    `[ar:${song.artists.join(" / ")}]`,
    `[al:${song.album}]`,
    "[by:MiSideTag]",
    "[offset:0]",
    "",
    ...rows.flatMap((row, index) =>
      translations[index]
        ? [row, row.replace(/^(\[[^\]]+\])/, "$1" + translations[index])]
        : [row],
    ),
  ].join("\n");
  return parseLrc(content, { song });
}

const starLyrics = demoLrc(DEMO_SONGS[0], [
  "[00:05.20]把夜色折成一张星图",
  "[00:12.60]沿着耳机里的光走",
  "[00:19.80]城市在身后慢慢安静",
  "[00:26.90]只剩下节拍推着我",
  "[00:34.20]如果月亮也有回信",
  "[00:41.50]请写上我没说出口的名字",
  "[00:49.10]让每一次心跳都找到位置",
  "[00:56.40]在星图的背面",
  "[01:04.00]我会把所有未完成的梦",
  "[01:11.30]唱给夜航的你听",
  "[01:20.00]穿过云层和沉默",
  "[01:27.50]我们终于在同一个频率",
  "[01:35.20]点亮彼此的坐标",
  "[01:44.00]夜航星图 不会熄灭",
]);
starLyrics.wordLevel = true;
starLyrics.providerNote = "增强 LRC · 逐字演示";
for (const line of starLyrics.lines) {
  const chars = Array.from(line.text);
  const step = Math.max(120, Math.min(260, Math.floor(2600 / Math.max(1, chars.length))));
  line.words = chars.map((text, index): LyricWord => {
    const startMs = line.startMs + index * step;
    return { startMs, endMs: startMs + step, text };
  });
  line.endMs = Math.max(
    line.startMs + step * chars.length,
    line.endMs,
  );
}

const tideLyrics = demoLrc(
  DEMO_SONGS[1],
  [
    "[00:04.00]海风把昨天翻到下一页",
    "[00:12.30]我在低温海岸等一封回信",
    "[00:21.80]潮汐把脚印一遍遍擦去",
    "[00:30.50]却没带走你的声音",
    "[00:39.20]如果思念有形状",
    "[00:47.90]大概是一整片安静的海",
    "[00:57.10]我把想说的话折成纸船",
    "[01:06.40]让潮汐替我寄给你",
    "[01:16.00]海岸线很长 夜色很慢",
    "[01:25.30]而我会一直在这里",
  ],
  [
    "The sea breeze turns the page of yesterday",
    "I wait for a letter on the cold coast",
    "The tide erases my footprints again and again",
    "But it never takes your voice away",
    "If missing someone had a shape",
    "It would be a whole quiet sea",
    "I fold the words I want to say into a paper boat",
    "Let the tide deliver it for me",
    "The coastline is long, the night is slow",
    "And I will always be here",
  ],
);
tideLyrics.hasTranslation = true;
tideLyrics.providerNote = "LRC · 含译文";

export const DEMO_LYRICS = new Map([
  [songKey(DEMO_SONGS[0]), starLyrics],
  [songKey(DEMO_SONGS[1]), tideLyrics],
]);

const DEMO_TRACKS: LocalTrack[] = [
  {
    path: "D:\\Music\\夜航\\01 夜航星图.flac",
    title: "夜航星图",
    artist: "月见八千代",
    album: "月面电台",
    durationMs: 222000,
    codec: "FLAC",
    tagType: "VorbisComment",
    hasEmbeddedLyric: false,
    lyricPath: null,
    parseSource: "tags",
    error: "",
  },
  {
    path: "D:\\Music\\夜航\\02 潮汐来信.mp3",
    title: "潮汐来信",
    artist: "星见汐",
    album: "低温海岸",
    durationMs: 245000,
    codec: "MP3",
    tagType: "ID3v2",
    hasEmbeddedLyric: false,
    lyricPath: null,
    parseSource: "tags",
    error: "",
  },
  {
    path: "D:\\Music\\夜航\\03 雨停之前.m4a",
    title: "雨停之前",
    artist: "MiSide",
    album: "夏末回声",
    durationMs: 198000,
    codec: "MP4",
    tagType: "MP4",
    hasEmbeddedLyric: false,
    lyricPath: null,
    parseSource: "tags",
    error: "",
  },
  {
    path: "D:\\Music\\夜航\\04 把名字写进 TAG.mp3",
    title: "把名字写进 TAG",
    artist: "Sora",
    album: "便携播放器",
    durationMs: 216000,
    codec: "MP3",
    tagType: "ID3v2",
    hasEmbeddedLyric: false,
    lyricPath: null,
    parseSource: "tags",
    error: "",
  },
  {
    path: "D:\\Music\\夜航\\05 零点公交.ogg",
    title: "零点公交",
    artist: "月见八千代",
    album: "夜行线路",
    durationMs: 254000,
    codec: "OggVorbis",
    tagType: "VorbisComment",
    hasEmbeddedLyric: false,
    lyricPath: null,
    parseSource: "tags",
    error: "",
  },
];

export function demoMatches(): LocalMatch[] {
  return [
    {
      track: DEMO_TRACKS[0],
      candidates: [
        {
          song: DEMO_SONGS[0],
          score: 97,
          reliable: true,
          reasons: ["歌名一致", "歌手一致", "时长接近"],
        },
      ],
      selected: {
        song: DEMO_SONGS[0],
        score: 97,
        reliable: true,
        reasons: ["歌名一致", "歌手一致", "时长接近"],
      },
      lyrics: starLyrics,
      status: "auto",
      detail: "QQ 音乐 · 置信度 97",
      savedLrc: "",
      embedded: false,
    },
    {
      track: DEMO_TRACKS[1],
      candidates: [
        {
          song: DEMO_SONGS[1],
          score: 94,
          reliable: true,
          reasons: ["歌名一致", "歌手一致", "时长接近"],
        },
      ],
      selected: {
        song: DEMO_SONGS[1],
        score: 94,
        reliable: true,
        reasons: ["歌名一致", "歌手一致", "时长接近"],
      },
      lyrics: tideLyrics,
      status: "auto",
      detail: "网易云 · 置信度 94",
      savedLrc: "",
      embedded: false,
    },
    {
      track: DEMO_TRACKS[2],
      candidates: [
        {
          song: DEMO_SONGS[2],
          score: 82,
          reliable: true,
          reasons: ["歌名一致", "时长接近"],
        },
      ],
      selected: null,
      lyrics: null,
      status: "review",
      detail: "最佳候选 82 分，请确认",
      savedLrc: "",
      embedded: false,
    },
    {
      track: DEMO_TRACKS[3],
      candidates: [
        {
          song: DEMO_SONGS[3],
          score: 88,
          reliable: true,
          reasons: ["歌名一致", "歌手一致"],
        },
      ],
      selected: {
        song: DEMO_SONGS[3],
        score: 88,
        reliable: true,
        reasons: ["歌名一致", "歌手一致"],
      },
      lyrics: null,
      status: "auto",
      detail: "网易云 · 置信度 88",
      savedLrc: "",
      embedded: false,
    },
    {
      track: DEMO_TRACKS[4],
      candidates: [],
      selected: null,
      lyrics: null,
      status: "none",
      detail: "没有找到可信的歌词来源",
      savedLrc: "",
      embedded: false,
    },
  ];
}
