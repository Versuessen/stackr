// Original pixel art for Stackr: scenes, item icons, UI glyphs. Generated from character maps,
// so there are no Minecraft textures anywhere. Rendered as SVG path runs (one path per colour).
/* eslint-disable */
// @ts-nocheck — ported 1:1 from the v1.0 design canvas kit; typed at the exports below.

export type Run = { fill: string; d: string };
export type Art = Run[];
export type Scene = { vb: string; art: Art; night?: Art };

/* ---------- pixel runs ---------- */
export function mirror(half) { return half.map(function (r) { return r + r.split('').reverse().join(''); }); }
export function layers(rows, pal) {
  var by = {}, order = [];
  rows.forEach(function (row, y) {
    var x = 0;
    while (x < row.length) {
      var ch = row[x], n = 1;
      while (row[x + n] === ch) n++;
      if (ch !== '.' && pal[ch]) { if (!by[ch]) { by[ch] = []; order.push(ch); } by[ch].push('M' + x + ' ' + y + 'h' + n + 'v1h-' + n + 'z'); }
      x += n;
    }
  });
  return order.map(function (ch) { return { fill: pal[ch], d: by[ch].join('') }; });
}
export function glyph(rows) { return { vb: '0 0 ' + rows[0].length + ' ' + rows.length, d: layers(rows, { o: 1 })[0].d }; }
export const G = {
  search: glyph(['..oooo....', '.oo..oo...', 'oo....oo..', 'o......o..', 'o......o..', 'oo....oo..', '.oo..oo...', '..oooooo..', '.......oo.', '........oo']),
  cart: glyph(['...oooo...', '..o....o..', 'oooooooooo', 'o........o', 'o..oooo..o', 'o..o..o..o', 'o........o', 'o........o', 'oooooooooo']),
  check: glyph(['........oo', '.......oo.', '......oo..', 'oo...oo...', '.oo.oo....', '..ooo.....', '...o......']),
  plus: glyph(['...oo...', '...oo...', '...oo...', 'oooooooo', 'oooooooo', '...oo...', '...oo...', '...oo...']),
  minus: glyph(['........', '........', '........', 'oooooooo', 'oooooooo', '........', '........', '........']),
  x: glyph(['oo....oo', '.oo..oo.', '..oooo..', '...oo...', '..oooo..', '.oo..oo.', 'oo....oo']),
  arrow: glyph(['.....o....', '.....oo...', '.....ooo..', 'oooooooooo', 'oooooooooo', '.....ooo..', '.....oo...', '.....o....']),
  chat: glyph(['oooooooooo', 'o........o', 'o.oo.oo..o', 'o........o', 'oooooooooo', '.oo.......', '.o........']),
  list: glyph(['oo.ooooooo', '..........', 'oo.ooooooo', '..........', 'oo.ooooooo', '..........', 'oo.ooooooo']),
  lock: glyph(['..oooo..', '.o....o.', '.o....o.', 'oooooooo', 'oooooooo', 'ooo..ooo', 'ooo..ooo', 'oooooooo']),
  star: glyph(['....o....', '...ooo...', '...ooo...', 'ooooooooo', '.ooooooo.', '..ooooo..', '..oo.oo..', '.oo...oo.', '.o.....o.']),
  undo: glyph(['..o.......', '.oo.......', 'oooooooo..', '.oo.....o.', '..o......o', '.........o', '........o.', '..ooooooo.']),
  sun: glyph(['....o....', '.o.....o.', '...ooo...', '..ooooo..', 'o.ooooo.o', '..ooooo..', '...ooo...', '.o.....o.', '....o....']),
  moon: glyph(['...ooo..', '..oo....', '.oo.....', '.oo.....', '.oo.....', '.ooo...o', '..oooooo', '...oooo.']),
  bell: glyph(['...oo...', '..oooo..', '.oooooo.', '.oooooo.', '.oooooo.', 'oooooooo', '........', '...oo...']),
  user: glyph(['..oooo..', '.oo..oo.', '.oo..oo.', '..oooo..', '........', '.oooooo.', 'oo....oo', 'oo....oo']),
  info: glyph(['...oo...', '...oo...', '........', '..ooo...', '...oo...', '...oo...', '...oo...', '..oooo..'])
};

/* ---------- original pixel scenes ---------- */
export function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function grid(W, H, ch) { var g = []; for (var y = 0; y < H; y++) { var r = []; for (var x = 0; x < W; x++) r.push(ch); g.push(r); } return g; }
function put(g, x, y, ch) { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch; }
function rect(g, x, y, w, h, ch) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) put(g, x + i, y + j, ch); }
function done(g, pal, W, H) { return { vb: '0 0 ' + W + ' ' + H, art: layers(g.map(function (r) { return r.join(''); }), pal) }; }
function tree(g, x, base, big) {
  var h = big ? 8 : 5;
  rect(g, x, base - h, big ? 2 : 1, h, 't');
  var w = big ? 9 : 5, cy = base - h - (big ? 6 : 4);
  rect(g, x - Math.floor(w / 2) + (big ? 1 : 0), cy, w, big ? 6 : 4, 'l'); rect(g, x - Math.floor(w / 2) + 1 + (big ? 1 : 0), cy - 1, w - 2, 1, 'l');
  put(g, x - 1, cy + 1, 'L'); put(g, x + 1, cy + 2, 'L'); put(g, x, cy, 'L'); if (big) { put(g, x + 3, cy + 1, 'L'); put(g, x - 2, cy + 3, 'L'); }
}
export const DAY = { 1: '#5fb8ee', 2: '#7cc6f0', 3: '#9dd5f3', 4: '#c4e6f6', s: '#ffe27a', S: '#fff6c8', w: '#ffffff', W: '#e3f1f8', f: '#8fbf7f', F: '#7aae6c', g: '#5d9c3a', G: '#4b8a2e', d: '#8a5a35', D: '#74492a', r: '#80838b', o: '#a9adb5', a: '#3a7fd5', A: '#2f6bb8', t: '#6b4a2e', l: '#3f8f3a', L: '#6cc04a', k: '#5a5d65', K: '#44464d', q: '#d5ecf4', m: '#c9ced4', v: '#e0a14a', c: '#a8732e', C: '#6b4a1e', u: '#f4f1ea', U: '#d6d0c4', M: '#6aaa42', N: '#62a03c', P: '#e98bc4', b: '#2b2f38', y: '#f6d33a', e: '#c4462e', h: '#d9b48a' };
export const NIGHT = { 1: '#0c1128', 2: '#111938', 3: '#172248', 4: '#1f2d5a', s: '#e8ecf6', S: '#ffffff', w: '#2b3560', W: '#232c52', f: '#2c5338', F: '#264a31', g: '#2c5a24', G: '#244c1e', d: '#4a3220', D: '#3e2a1a', r: '#3e4048', o: '#6a6e78', a: '#1d3f78', A: '#16325f', t: '#3a2818', l: '#1f4a24', L: '#2f6a32', k: '#3a3c42', K: '#2a2c31', q: '#ffcf6a', m: '#8a909a', v: '#ffb24a', c: '#7a5220', C: '#4a3010', u: '#cfcabe', U: '#a9a396', M: '#2a5824', N: '#264f20', P: '#b06a96', b: '#14161c', y: '#c9a82e', e: '#9a3424', h: '#a98a66', '*': '#dfe6ff', '+': '#7b86b8' };
function nightOf(g, seed) {
  var r = rng(seed * 7 + 3), n = g.map(function (row) { return row.slice(); });
  for (var y = 0; y < n.length; y++) for (var x = 0; x < n[0].length; x++) if ('123'.indexOf(n[y][x]) !== -1 && r() > .985) n[y][x] = r() > .6 ? '*' : '+';
  return layers(n.map(function (row) { return row.join(''); }), NIGHT);
}
export function dayScene(W, H, seed, build) {
  var r = rng(seed), g = grid(W, H, '1');
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) g[y][x] = y < H * .14 ? '1' : y < H * .28 ? '2' : y < H * .42 ? '3' : '4';
  var sx = Math.floor(W * (.08 + r() * .1)); rect(g, sx, Math.floor(H * .1), 7, 7, 's'); rect(g, sx + 2, Math.floor(H * .1) + 2, 3, 3, 'S');
  for (var c = 0; c < 5; c++) { var cx = Math.floor(W * (.2 + r() * .75)), cy = Math.floor(H * (.07 + r() * .22)), cw = 8 + Math.floor(r() * 8); rect(g, cx, cy, cw, 2, 'w'); rect(g, cx + 2, cy - 1, cw - 5, 1, 'w'); rect(g, cx + 1, cy + 2, cw - 2, 1, 'W'); }
  var ph = r() * 6;
  for (var x2 = 0; x2 < W; x2++) {
    var hf = Math.floor(H * .56 + Math.sin(x2 / 10 + ph) * 2 + Math.sin(x2 / 27 + ph * 2) * 3);
    for (var y2 = hf; y2 < H; y2++) put(g, x2, y2, y2 === hf ? 'F' : 'f');
  }
  var ground = [];
  for (var x3 = 0; x3 < W; x3++) {
    var hn = Math.floor(H * .7 + Math.sin(x3 / 15 + ph) * 1.5 + Math.sin(x3 / 33 + 1 + ph) * 2);
    ground.push(hn);
    put(g, x3, hn, 'g'); put(g, x3, hn + 1, r() > .35 ? 'g' : 'G');
    for (var y3 = hn + 2; y3 < H; y3++) { var band = Math.floor((y3 - hn) / 3 + Math.sin(x3 / 7 + y3) * .6) % 2; put(g, x3, y3, band ? 'M' : 'N'); if (r() > .985) put(g, x3, y3, ['y', 'e', 'u', 'P'][Math.floor(r() * 4)]); }
  }
  var focus = Math.floor(W * .64), pond = Math.floor(W * .2);
  if (!build || build === 'tree' || build === 'wool') for (var k = -6; k <= 6; k++) { var gx = pond + k, gy = ground[gx]; if (gx >= 0 && gx < W) { put(g, gx, gy, 'a'); if (Math.abs(k) < 5) put(g, gx, gy + 1, 'A'); } }
  for (var t = 5; t < W - 4; t += 12 + Math.floor(r() * 10)) { if (build && Math.abs(t - focus) < 16) continue; if (Math.abs(t - pond) < 9) continue; tree(g, t, ground[t], false); }
  var base = ground[focus];
  if (build === 'iron') {
    var fx = focus - 9, top = base - 34;
    rect(g, fx, top, 19, base - top, 'k'); rect(g, fx - 1, top - 1, 21, 2, 'K');
    rect(g, fx + 2, top + 2, 15, 9, 'q'); rect(g, fx + 2, top + 13, 15, 9, 'q'); rect(g, fx + 4, top + 24, 11, 7, 'q');
    rect(g, fx + 8, top + 14, 3, 6, 'm'); rect(g, fx + 7, top + 15, 5, 2, 'm'); rect(g, fx + 4, top + 4, 2, 4, 'v'); rect(g, fx + 13, top + 4, 2, 4, 'v'); rect(g, fx + 9, top + 4, 2, 4, 'h');
    rect(g, fx + 7, base - 3, 5, 3, 'c'); rect(g, fx + 8, base - 2, 3, 1, 'C');
  } else if (build === 'wool') {
    var wx = focus - 16;
    rect(g, wx, base - 7, 33, 7, 'c'); rect(g, wx + 1, base - 6, 31, 5, 'q');
    for (var sh = 0; sh < 5; sh++) { var sxp = wx + 2 + sh * 6, col = ['u', 'y', 'u', 'e', 'a'][sh]; rect(g, sxp, base - 5, 4, 3, col); put(g, sxp + 4, base - 5, 'b'); put(g, sxp, base - 2, 'b'); put(g, sxp + 3, base - 2, 'b'); }
    rect(g, wx, base - 8, 33, 1, 'C');
  } else if (build === 'tree') {
    for (var tt = -2; tt <= 2; tt++) tree(g, focus + tt * 9, ground[focus + tt * 9], true);
  } else if (build === 'stone') {
    var gx2 = focus - 8;
    rect(g, gx2, base - 12, 17, 12, 'k'); rect(g, gx2 + 2, base - 10, 5, 8, 'a'); rect(g, gx2 + 10, base - 10, 5, 8, 'v'); rect(g, gx2 + 7, base - 8, 3, 6, 'o'); rect(g, gx2 + 6, base - 13, 5, 1, 'K');
  } else if (build === 'cane' || build === 'bamboo' || build === 'kelp') {
    var cx2 = focus - 14, tall = build === 'bamboo' ? 16 : 7;
    rect(g, cx2, base - 1, 29, 1, 'a');
    for (var cc = 0; cc < 9; cc++) { var hh = tall - (cc % 3); rect(g, cx2 + 1 + cc * 3, base - 1 - hh, 1, hh, build === 'kelp' ? 'G' : 'L'); put(g, cx2 + 1 + cc * 3, base - 2 - hh, 'l'); }
    rect(g, cx2 - 1, base - 3, 1, 3, 'k'); rect(g, cx2 + 29, base - 3, 1, 3, 'k');
  } else if (build === 'crops' || build === 'flower' || build === 'bonemeal' || build === 'pumpkin') {
    var fx2 = focus - 16;
    rect(g, fx2, base - 1, 33, 2, 'D');
    for (var row = 0; row < 11; row++) { var col2 = build === 'flower' ? ['P', 'y', 'e', 'u'][row % 4] : build === 'pumpkin' ? (row % 2 ? 'v' : 'M') : build === 'bonemeal' ? 'u' : 'y'; rect(g, fx2 + 1 + row * 3, base - 3, 2, 2, col2); put(g, fx2 + 1 + row * 3, base - 4, 'L'); }
    rect(g, fx2 + 13, base - 12, 7, 9, 'c'); rect(g, fx2 + 12, base - 13, 9, 1, 'C'); rect(g, fx2 + 15, base - 6, 3, 3, 'C');
  } else if (build === 'generic') {
    var gx3 = focus - 10, tp = base - 22;
    rect(g, gx3, tp, 21, base - tp, 'k'); rect(g, gx3 - 1, tp - 1, 23, 2, 'K');
    rect(g, gx3 + 3, tp + 3, 15, 6, 'q'); rect(g, gx3 + 3, tp + 11, 15, 6, 'q');
    rect(g, gx3 + 8, base - 3, 5, 3, 'c'); rect(g, gx3 + 9, base - 2, 3, 1, 'C');
  } else if (build === 'raid') {
    var rx = focus - 10, rt = base - 30;
    rect(g, rx + 8, rt, 4, base - rt, 'k'); rect(g, rx, rt - 3, 21, 3, 'K'); rect(g, rx + 2, rt - 2, 17, 1, 'b');
    rect(g, rx + 16, rt - 12, 1, 9, 't'); rect(g, rx + 17, rt - 12, 5, 6, 'u'); rect(g, rx + 18, rt - 10, 3, 2, 'b'); put(g, rx + 19, rt - 8, 'e');
  }
  var out = done(g, DAY, W, H); out.night = nightOf(g, seed); return out;
}
const NETHER = { 1: '#2a0c10', 2: '#3d1216', 3: '#521a1c', N: '#64202a', y: '#f6d878', b: '#3a3a42', B: '#55555e', r: '#7a2626', R: '#943434', v: '#f07f1c', V: '#ffd25a', k: '#2a2a30', q: '#d9a73a', Q: '#f2c94c', p: '#e8a0a0' };
export function netherScene(W, H, seed, build) {
  var r = rng(seed), g = grid(W, H, '1');
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) g[y][x] = y < H * .3 ? '1' : y < H * .55 ? '2' : '3';
  for (var x1 = 0; x1 < W; x1++) { var hc = Math.floor(2 + Math.abs(Math.sin(x1 / 6)) * 5 + r() * 2); for (var y1 = 0; y1 < hc; y1++) put(g, x1, y1, y1 > hc - 2 && r() > .75 ? 'y' : 'N'); }
  for (var b = 0; b < 3; b++) { var bx = Math.floor(W * (.05 + r() * .25) + b * W * .3), bw = 3 + Math.floor(r() * 3); rect(g, bx, Math.floor(H * .24), bw, Math.floor(H * .5), 'b'); rect(g, bx, Math.floor(H * .24), 1, Math.floor(H * .5), 'B'); }
  var lake = Math.floor(H * .82), ground = [];
  for (var x2 = 0; x2 < W; x2++) {
    var h2 = Math.floor(H * .7 + Math.sin(x2 / 9) * 2 + Math.sin(x2 / 21) * 3); ground.push(h2);
    for (var y2 = h2; y2 < H; y2++) put(g, x2, y2, (y2 + x2) % 9 === 0 ? 'R' : 'r');
    if (x2 > W * .12 && x2 < W * .42) for (var y3 = lake; y3 < H; y3++) put(g, x2, y3, r() > .9 ? 'V' : 'v');
  }
  for (var k = 0; k < 8; k++) put(g, Math.floor(W * .12 + r() * W * .3), lake, 'V');
  if (build === 'gold') {
    var fx = Math.floor(W * .6), top = Math.floor(H * .22);
    rect(g, fx - 14, top, 28, 3, 'k'); rect(g, fx - 12, top + 3, 24, 2, 'q'); rect(g, fx - 2, top + 5, 4, ground[fx] - top - 5, 'k');
    for (var pg = 0; pg < 4; pg++) { rect(g, fx - 10 + pg * 6, top - 4, 3, 4, 'p'); put(g, fx - 9 + pg * 6, top - 3, 'Q'); }
    rect(g, fx - 3, ground[fx] - 4, 6, 4, 'Q');
  }
  return done(g, NETHER, W, H);
}
const ENDP = { k: '#140f24', '*': '#efe6ff', '+': '#7a6aa6', E: '#e8e3a8', e: '#c9c38a', p: '#9a6fb0', P: '#b48ac4', w: '#2a1f3d', o: '#24182f', s: '#8f86a8', S: '#b9b2d4' };
export function endScene(W, H, seed, wings) {
  var r = rng(seed), g = grid(W, H, 'k');
  for (var s = 0; s < W * H * .018; s++) put(g, Math.floor(r() * W), Math.floor(r() * H * .66), r() > .7 ? '*' : '+');
  var cx = W * .45, cy = H * .86;
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var dx = (x - cx) / (W * .46), dy = (y - cy) / (H * .2); if (dx * dx + dy * dy < 1) g[y][x] = y > cy ? 'e' : (r() > .94 ? 'e' : 'E'); }
  var tx = Math.floor(W * .64), tb = Math.floor(cy - H * .12), th = Math.floor(H * .52);
  rect(g, tx, tb - th, 9, th, 'p'); rect(g, tx - 2, tb - th - 3, 13, 3, 'P'); rect(g, tx - 1, tb - Math.floor(th * .5), 11, 2, 'P');
  for (var wy = tb - th + 4; wy < tb - 2; wy += 5) rect(g, tx + 3, wy, 3, 2, 'w');
  rect(g, Math.floor(W * .2), Math.floor(cy - H * .38), 4, Math.floor(H * .26), 'o');
  if (wings) { var wx = Math.floor(W * .3), wy2 = Math.floor(H * .26); rect(g, wx, wy2, 6, 2, 's'); rect(g, wx + 7, wy2, 6, 2, 's'); rect(g, wx + 1, wy2 + 2, 4, 2, 'S'); rect(g, wx + 8, wy2 + 2, 4, 2, 'S'); rect(g, wx + 6, wy2, 1, 3, 'S'); }
  return done(g, ENDP, W, H);
}

/* ---------- item icons ---------- */
export const ART = {
  cube: layers(['............', '.oooooooooo.', '.occcccccco.', '.obbbbbbbbo.', '.obbabbbbbo.', '.obbbbbabbo.', '.obabbbbbbo.', '.obbbbbbbbo.', '.obbbabbbbo.', '.oaaaaaaaao.', '.oooooooooo.', '............'], { o: '#3a3c42', a: '#6f727a', b: '#8b8f97', c: '#aeb2b9' }),
  ingot: layers(['............', '............', '............', '...oooooo...', '..ocddddco..', '.ocbbbbbbco.', 'oaaaaaaaaaao', 'oaaaaaaaaaao', 'oaaaaaaaaaao', '.oooooooooo.', '............', '............'], { o: '#17151c', a: '#2f2a35', b: '#4a4452', c: '#6d6577', d: '#9a92a6' }),
  pick: layers(['............', '.oooooooooo.', 'occcccccccco', 'oco.ohho.oco', 'oo..ohho..oo', '....ohho....', '....ohho....', '....ohho....', '....ohho....', '....ohho....', '....oooo....', '............'], { o: '#17151c', c: '#4fd8d0', h: '#7a5232' }),
  kit: layers(mirror(['......', '.ooo..', 'obbbo.', 'obbbbo', 'obcbbb', '.obbbb', '.obbcb', '.obbbb', '.obcbb', '.obbbb', '.ooooo', '......']), { o: '#17151c', b: '#4a4452', c: '#7a7285' }),
  food: layers(mirror(['.....o', '....oh', '...ooo', '..obcc', '.obddc', '.obbcc', '.obbbc', '.oabbb', '..oaab', '...ooo', '......', '......']), { o: '#3a0f12', h: '#5a3a1a', a: '#7a1a1e', b: '#b02e26', c: '#d8473c', d: '#ff9a8a' }),
  dust: layers(['............', '............', '............', '............', '............', '....oooo....', '..oobbbboo..', '.obbcbbbbbo.', 'obbbbbbcbbbo', 'obcbbbbbbbbo', 'oooooooooooo', '............'], { o: '#4a0a08', b: '#b0241a', c: '#ff5a3c' }),
  iron: layers(['...oooooo...', '..occddcco..', '.obbbbbbbbo.', '.oaaaaaaaao.', '.oooooooooo.', '...oooooo...', '..occddcco..', '.obbbbbbbbo.', '.oaaaaaaaao.', '.oaaaaaaaao.', '.oooooooooo.', '............'], { o: '#3b3f46', a: '#a7adb5', b: '#c9ced4', c: '#e3e6ea', d: '#ffffff' }),
  gold: layers(mirror(['......', '...ooo', '..obcc', '.obddc', '.obcdc', '.obccc', '.oabcc', '.oaabb', '..oaab', '...ooo', '......', '......']), { o: '#5a3a0a', a: '#a8741a', b: '#d89b22', c: '#f2c94c', d: '#fff2a8' }),
  raid: layers(['.oooooooooo.', '.oaaaaaaaao.', '..obbbbbbo..', '..obccccbo..', '..obcbbcbo..', '..obccccbo..', '..obbccbbo..', '..obbbbbbo..', '..obbbbbbo..', '...obbbbo...', '....obbo....', '.....oo.....'], { o: '#1d1b22', a: '#7a5232', b: '#ece7dc', c: '#2a2a30' }),
  wool: layers(['............', '..oooooooo..', '.obbcbbcbbo.', '.obbbbbbbbo.', '.ocbbcbbbco.', '.obbbbcbbbo.', '.obcbbbbcbo.', '.obbbcbbbbo.', '.ocbbbbcbbo.', '.obbcbbbbco.', '..oooooooo..', '............'], { o: '#8a8478', b: '#f6f3ec', c: '#dcd6ca' }),
  tree: layers(mirror(['...ooo', '..obbb', '.obcbb', 'obbbbc', 'obcbbb', '.obbbb', '..oooa', '....oa', '....oa', '....oa', '..oooa', '......']), { o: '#1e2b1a', b: '#3f8f3a', c: '#6cc04a', a: '#7a5230' }),
  stone: layers(['............', '.oooooooooo.', '.occcccccco.', '.obbabbbabo.', '.obbbbbbbbo.', '.oabbbabbbo.', '.obbbbbbbao.', '.obabbbbbbo.', '.obbbbabbbo.', '.oaaaaaaaao.', '.oooooooooo.', '............'], { o: '#3a3c42', a: '#5f6268', b: '#8b8f97', c: '#a9adb4' }),
  scroll: layers(['............', '..oooooooo..', '..obbbbbbo..', '..obccccbo..', '..obbbbbbo..', '..obcccbbo..', '..obbbbbbo..', '..obccccbo..', '..obbbbbbo..', '..obccbbbo..', '..oooooooo..', '............'], { o: '#17151c', b: '#ffffff', c: '#8a8170' }),
  wings: layers(mirror(['......', '.ooooo', 'obcccc', 'obbcbb', 'obbbcb', 'obbbbo', '.obbbo', '.obbo.', '.obo..', '..oo..', '......', '......']), { o: '#2e2a3a', b: '#8f86a8', c: '#b9b2d4' }),
  pearl: layers(mirror(['......', '......', '...ooo', '..obcc', '.obddc', '.obbcc', '.oabbc', '.oaabb', '..oaab', '...ooo', '......', '......']), { o: '#0a2a28', a: '#0b4f4a', b: '#147a6e', c: '#2bb39b', d: '#b9f5e6' }),
  box: layers(['............', '.oooooooooo.', '.occcccccco.', '.obbbbbbbbo.', '.oaaaaaaaao.', '.oooddddooo.', '.obbbddbbbo.', '.obbbbbbbbo.', '.obbbbbbbbo.', '.oaaaaaaaao.', '.oooooooooo.', '............'], { o: '#2a1f3d', a: '#6b4a8a', b: '#9a6fb0', c: '#b48ac4', d: '#f2e8f6' }),
  diamond: layers(['............', '.oooooooooo.', '.occcccccco.', '.obbcbbbcbo.', '.obbbbcbbbo.', '.ocbbbbbbbo.', '.obbbcbbbco.', '.obcbbbbbbo.', '.obbbbcbbbo.', '.oaaaaaaaao.', '.oooooooooo.', '............'], { o: '#0c4a48', a: '#2bb3ad', b: '#4fd8d0', c: '#b9f5f0' }),
  totem: layers(mirror(['...ooo', '..occc', '..ocdc', '..occc', '.oobbb', 'obbbbb', '.oobbb', '...obb', '...obb', '..oobb', '..oooo', '......']), { o: '#5a3a0a', b: '#e0b040', c: '#f2c94c', d: '#2f9a5a' }),
  cane: layers(['............', '...o....o...', '..obo..obo..', '..oco..oco..', '..obo..obo..', '..obo.oobo..', '..oco.obco..', '..obooobbo..', '..obo..obo..', '..oco..oco..', '..obo..obo..', '............'], { o: '#1f4a1a', b: '#6cc04a', c: '#a8e07a' }),
  bamboo: layers(['............', '....o.......', '...obo..o...', '...oco.obo..', '...obo.obo..', '...obooobo..', '...obo.oco..', '...oco.obo..', '...obo.obo..', '...obo.oco..', '...obo.obo..', '............'], { o: '#2c4a12', b: '#8fbf3a', c: '#c9e27a' }),
  rocket: layers(['.....oo.....', '....obbo....', '....obbo....', '...occcco...', '...occcco...', '...obbbbo...', '...occcco...', '...obbbbo...', '...oooooo...', '....oddo....', '.....dd.....', '....d..d....'], { o: '#17151c', b: '#e04a3a', c: '#f6f3ec', d: '#f2b84a' }),
  bone: layers(['............', '.oo.........', 'obbo........', 'obbbo.......', '.obbbo......', '..obbbo.....', '...obbbo....', '....obbbo...', '.....obbbo..', '......obbbo.', '.......obbo.', '........oo..'], { o: '#6b6455', b: '#f2eee2' }),
  flower: layers(['............', '....oooo....', '...obccbo...', '...occcco...', '...obccbo...', '....oooo....', '.....od.....', '..oo.od.oo..', '..odoodood..', '...oodddo...', '.....od.....', '............'], { o: '#1d2b18', b: '#e04a6a', c: '#f6d33a', d: '#4f9a3a' }),
  wheat: layers(['............', '...o..o..o..', '..oco.oco.o.', '..oco.ococo.', '...occocco..', '....occco...', '.....oco....', '.....obo....', '.....obo....', '....oobbo...', '.....obo....', '............'], { o: '#5a4210', b: '#8a6a20', c: '#e8c45a' }),
  rod: layers(['............', '........oo..', '.......oco..', '......oco...', '.....oco....', '....oco.....', '...oco......', '..oco.......', '.oco........', '.oo.........', '............', '............'], { o: '#6a3a06', c: '#f2c94c' }),
  skull: layers(['............', '..oooooooo..', '.obbbbbbbbo.', '.obbbbbbbbo.', '.ooobbbbooo.', '.ooobbbbooo.', '.obbbobbbbo.', '.obbbbbbbbo.', '..obobobbo..', '..oooooooo..', '............', '............'], { o: '#0c0c10', b: '#3a3b40' }),
  emerald: layers(['............', '....oooo....', '...obbbbo...', '..obccbbbo..', '..obcbbbbo..', '..obbbbbao..', '..obbbbbao..', '..obbbbaao..', '...obbaao...', '....oooo....', '............', '............'], { o: '#0a3a20', a: '#178a4a', b: '#2fc46e', c: '#b9f5cf' }),
  slime: layers(['............', '.oooooooooo.', '.obbbbbbbbo.', '.obcbbbbcbo.', '.obddbbddbo.', '.obddbbddbo.', '.obbbbbbbbo.', '.obbbddbbbo.', '.obbbbbbbbo.', '.oaaaaaaaao.', '.oooooooooo.', '............'], { o: '#1f5a1a', a: '#4f9a3a', b: '#7ac85a', c: '#b8ec98', d: '#2d6e24' }),
  kelp: layers(['............', '.....oo.....', '....obo.....', '....oboo....', '.....obbo...', '....oobo....', '...obbo.....', '....oboo....', '.....obbo...', '....oobo....', '....obo.....', '............'], { o: '#0f2a16', b: '#3e7a3a' }),
  pumpkin: layers(['............', '.....oo.....', '....odo.....', '.oooooooooo.', 'obbcbbcbbcbo', 'obbcbbcbbcbo', 'obbcbbcbbcbo', 'obbcbbcbbcbo', 'obbcbbcbbcbo', '.oooooooooo.', '............', '............'], { o: '#6a3008', b: '#e8902a', c: '#c06a14', d: '#4f9a3a' }),
  heart: layers(mirror(['......', '.ooo..', 'obbbo.', 'obcbbo', 'obbbbb', '.obbbb', '..obbb', '...obb', '....ob', '.....o', '......', '......']), { o: '#17151c', b: 'var(--slime)', c: '#ffffff' })
};
export const FACE = layers(['hhhhhhhh', 'hggggggh', 'hhsshhss', 'ssssssss', 'sewsswes', 'ssssssss', 'sssmmsss', 'ssssssss'], { h: '#2a1f2e', g: 'var(--slime)', s: '#e8b996', w: '#ffffff', e: '#17151c', m: '#a4553f' });
const T = {
  cube: ['............', '.oooooooooo.', '.occcccccco.', '.obbbbbbbbo.', '.obbabbbbbo.', '.obbbbbabbo.', '.obabbbbbbo.', '.obbbbbbbbo.', '.obbbabbbbo.', '.oaaaaaaaao.', '.oooooooooo.', '............'],
  ingot: ['............', '............', '............', '...oooooo...', '..ocddddco..', '.ocbbbbbbco.', 'oaaaaaaaaaao', 'oaaaaaaaaaao', 'oaaaaaaaaaao', '.oooooooooo.', '............', '............'],
  pick: ['............', '.oooooooooo.', 'occccccccbbo', 'oco.ohho.obo', 'oo..ohho..oo', '....ohho....', '....ohho....', '....ohho....', '....ohho....', '....ohho....', '....oooo....', '............'],
  armor: mirror(['......', '.ooo..', 'obbbo.', 'obbbbo', 'obcbbb', '.obbbb', '.obbcb', '.obbbb', '.obcbb', '.obbbb', '.ooooo', '......']),
  food: mirror(['.....o', '....oh', '...ooo', '..obcc', '.obddc', '.obbcc', '.obbbc', '.oabbb', '..oaab', '...ooo', '......', '......']),
  dust: ['............', '............', '............', '............', '............', '....oooo....', '..oobbbboo..', '.obbcbbbbbo.', 'obbbbbbcbbbo', 'obcbbbbbbbbo', 'oooooooooooo', '............'],
  bottle: ['............', '....oooo....', '.....oo.....', '....oaao....', '...occcco...', '..occdccco..', '..obccccbo..', '..obbbbbbo..', '...obbbbo...', '....oooo....', '............', '............'],
  orb: mirror(['......', '......', '...ooo', '..obcc', '.obddc', '.obbcc', '.oabbc', '.oaabb', '..oaab', '...ooo', '......', '......']),
  wings: mirror(['......', '.ooooo', 'obcccc', 'obbcbb', 'obbbcb', 'obbbbo', '.obbbo', '.obbo.', '.obo..', '..oo..', '......', '......']),
  box: ['............', '.oooooooooo.', '.occcccccco.', '.obbbbbbbbo.', '.oaaaaaaaao.', '.oooddddooo.', '.obbbddbbbo.', '.obbbbbbbbo.', '.obbbbbbbbo.', '.oaaaaaaaao.', '.oooooooooo.', '............'],
  totem: mirror(['...ooo', '..occc', '..ocdc', '..occc', '.oobbb', 'obbbbb', '.oobbb', '...obb', '...obb', '..oobb', '..oooo', '......'])
};
const KC = [['light_blue', '#5ab4e6'], ['light_gray', '#a0a0a0'], ['white', '#f2f2ee'], ['orange', '#f0802a'], ['magenta', '#c24fc0'], ['yellow', '#f6d33a'], ['lime', '#80cc2a'], ['pink', '#f0a0bc'], ['cyan', '#1f9aa0'], ['purple', '#7a32b4'], ['blue', '#3446b0'], ['brown', '#7a5232'], ['green', '#5a7a1e'], ['black', '#2a2930'], ['gray', '#5f6166'], ['red', '#b02e26'],
  ['netherite', '#4a4452'], ['diamond', '#4fd8d0'], ['emerald', '#2fbf62'], ['gold', '#f2c94c'], ['iron', '#c9ced4'], ['copper', '#d07a4a'], ['amethyst', '#9a6ad6'], ['quartz', '#ece6dc'], ['lapis', '#2f55c8'], ['redstone', '#d8341f'], ['coal', '#3a3a40'], ['obsidian', '#2a1f3d'], ['prismarine', '#5fae9e'], ['purpur', '#b07ec4'], ['end_stone', '#e8e3a8'], ['ender', '#1f6e66'], ['shulker', '#9a6fb0'], ['elytra', '#8f86a8'], ['blaze', '#f0a020'], ['slime', '#7ccf5a'], ['honey', '#f0a830'], ['glow', '#f6d878'], ['bone', '#ece7d6'], ['red_sand', '#c76a2c'], ['sand', '#e2d29a'], ['terracotta', '#b8664a'], ['deepslate', '#4d4d55'], ['blackstone', '#2f2a30'], ['basalt', '#55545a'], ['tuff', '#6b6d64'], ['andesite', '#8a8c8c'], ['diorite', '#d6d4d0'], ['granite', '#a26a55'], ['calcite', '#e8e8e2'], ['dripstone', '#8b6e5a'], ['mud', '#4b3f3a'], ['clay', '#a2a8b6'], ['snow', '#f4f8fa'], ['ice', '#9ec4f0'], ['glass', '#cfe8f0'], ['nether', '#6e2424'], ['crimson', '#8c2a3c'], ['warped', '#2a8c80'], ['mangrove', '#7a2f2c'], ['cherry', '#e8b4c0'], ['pale_oak', '#e6dcd2'], ['dark_oak', '#4a3220'], ['spruce', '#6b4a2e'], ['birch', '#d8c98a'], ['jungle', '#a87448'], ['acacia', '#b4602e'], ['bamboo', '#c9c25a'], ['oak', '#b08a52'], ['brick', '#a5543e'], ['cobble', '#7c7f86'], ['stone', '#8b8f97'], ['dirt', '#8a5a35'], ['grass', '#5d9c3a'], ['moss', '#5f8a32'], ['leaves', '#3f8f3a'], ['wool', '#f2efe8'], ['beef', '#a8442e'], ['pork', '#e88a8a'], ['chicken', '#e8c49a'], ['cod', '#b8a07a'], ['salmon', '#e07a5a'], ['apple', '#d8341f'], ['bread', '#c9934a'], ['carrot', '#f0802a'], ['potato', '#d8b45a'], ['melon', '#c84a3a'], ['pumpkin', '#e08a2a'], ['wheat', '#d8c060'], ['pearl', '#2bb39b'], ['eye', '#2bb39b'], ['totem', '#e0b040'], ['torch', '#f0a020'], ['string', '#ece7dc'], ['gunpowder', '#5f6166'], ['book', '#8a4a2e']];
function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function mix(h, to, t) { var a = hexToRgb(h), b = hexToRgb(to); return '#' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0'); }).join(''); }
function baseColor(id) {
  for (var i = 0; i < KC.length; i++) if (id.indexOf(KC[i][0]) !== -1) return KC[i][1];
  var h = 0; for (var j = 0; j < id.length; j++) h = (h * 31 + id.charCodeAt(j)) >>> 0;
  var hue = h % 360, s = .45, l = .55, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = l - c / 2;
  var rgb = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + rgb.map(function (v) { return Math.round((v + m) * 255).toString(16).padStart(2, '0'); }).join('');
}
const iconCache: Record<string, Art> = {};
export function iconFor(it) {
  if (!it) return [];
  if (iconCache[it.id]) return iconCache[it.id];
  var t = it.cat === 'blocks' ? 'cube' : it.cat === 'tools' ? 'pick' : it.cat === 'armor' ? 'armor' : it.cat === 'food' ? 'food' : it.cat === 'redstone' && it.id.indexOf('dust') !== -1 ? 'dust' : it.cat === 'brewing' ? 'bottle' : it.cat === 'redstone' ? 'cube' : 'ingot';
  if (/pearl|eye|orb|ball|egg/.test(it.id)) t = 'orb';
  if (/shulker_box/.test(it.id)) t = 'box';
  if (it.id === 'totem_of_undying') t = 'totem';
  if (it.id === 'elytra') t = 'wings';
  if (it.id === 'redstone') t = 'dust';
  var b = baseColor(it.id);
  var pal = { o: mix(b, '#000000', .7), a: mix(b, '#000000', .28), b: b, c: mix(b, '#ffffff', .32), d: mix(b, '#ffffff', .68), h: '#7a5232' };
  iconCache[it.id] = layers(T[t], pal);
  return iconCache[it.id];
}

