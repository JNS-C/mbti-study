/* ============================================================
   make-icons.mjs — 앱 아이콘 래스터 생성기 (개발용)

   실행: node tools/make-icons.mjs
   사이트는 이 스크립트를 절대 실행하지 않는다. 결과물인 png/ico만 배포된다.

   css/tokens.css의 그룹 색이 바뀌면 아래 GROUPS를 맞춰 고치고 다시 돌린다.
   외부 라이브러리 없이 Node 내장 zlib만으로 PNG를 인코딩한다.
   ============================================================ */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* --- 디자인 토큰 (css/tokens.css와 동일해야 한다) ------------ */
const CANVAS = [0, 0, 0];
const GROUPS = [
  [0x22, 0xc8, 0xe8],   // --nt  NT 분석가
  [0x3d, 0x82, 0xe8],   // --sj  SJ 관리자
  [0xe2, 0x27, 0x18],   // --nf  NF 이상주의자
  [0xf4, 0xb4, 0x00],   // --sp  SP 탐험가
];

/* 띠 비율. 16/32/192/512에서 4로 나누어떨어져 서브픽셀이 생기지 않는다.
   maskable은 안드로이드 안전 영역(중앙 80% 원) 안에 들어가도록 더 좁게 잡는다. */
const BAND        = { w: 0.75, h: 0.5   };   /* 16px에서도 네 색이 읽히도록 37.5%→50% */
const BAND_MASK   = { w: 0.5,  h: 0.25  };

/* --- PNG 인코더 ---------------------------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let r = 0xFFFFFFFF;
  for (const b of buf) r = CRC_TABLE[(r ^ b) & 0xFF] ^ (r >>> 8);
  return (r ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, band) {
  const stride = size * 4 + 1;                 // 행마다 필터 바이트 1개
  const raw = Buffer.alloc(size * stride);

  const bw = Math.round(size * band.w);
  const bh = Math.round(size * band.h);
  const x0 = Math.round((size - bw) / 2);
  const y0 = Math.round((size - bh) / 2);
  const col = bw / GROUPS.length;

  for (let y = 0; y < size; y++) {
    const off = y * stride;
    raw[off] = 0;                              // filter: None
    for (let x = 0; x < size; x++) {
      const inBand = y >= y0 && y < y0 + bh && x >= x0 && x < x0 + bw;
      const [r, g, b] = inBand
        ? GROUPS[Math.min(Math.floor((x - x0) / col), GROUPS.length - 1)]
        : CANVAS;
      const i = off + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- ICO (PNG를 그대로 품는 Vista+ 형식) ---------------------- */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);                  // reserved
  header.writeUInt16LE(1, 2);                  // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dir = [], blobs = [];
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;             // 0 == 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;                                  // 팔레트 없음
    e[3] = 0;                                  // reserved
    e.writeUInt16LE(1, 4);                     // color planes
    e.writeUInt16LE(32, 6);                    // bits per pixel
    e.writeUInt32LE(data.length, 8);           // 이미지 데이터 크기
    e.writeUInt32LE(offset, 12);               // 파일 내 위치
    dir.push(e); blobs.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...dir, ...blobs]);
}

/* --- SVG ------------------------------------------------------ */
function svg() {
  const hex = ([r, g, b]) =>
    '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  const W = 64, bw = W * BAND.w, bh = W * BAND.h;
  const x0 = (W - bw) / 2, y0 = (W - bh) / 2, col = bw / GROUPS.length;
  const bars = GROUPS.map((c, i) =>
    `  <rect x="${x0 + col * i}" y="${y0}" width="${col}" height="${bh}" fill="${hex(c)}"/>`
  ).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" role="img" aria-label="MBTI 공부법 연구소">
  <rect width="${W}" height="${W}" fill="${hex(CANVAS)}"/>
${bars}
</svg>
`;
}

/* --- 출력 ----------------------------------------------------- */
mkdirSync(ROOT, { recursive: true });

const out = [
  ['favicon.svg',            Buffer.from(svg(), 'utf8')],
  ['apple-touch-icon.png',   png(180, BAND)],
  ['icon-192.png',           png(192, BAND)],
  ['icon-512.png',           png(512, BAND)],
  ['icon-maskable-512.png',  png(512, BAND_MASK)],
  ['favicon.ico',            ico([
    { size: 16, data: png(16, BAND) },
    { size: 32, data: png(32, BAND) },
    { size: 48, data: png(48, BAND) },
  ])],
];

for (const [name, data] of out) {
  writeFileSync(join(ROOT, name), data);
  console.log(`${name.padEnd(24)} ${String(data.length).padStart(6)} bytes`);
}
