/* domivan.com background, "Connected Europe": the night map behind every page (.backdrop) lies on
   a holographic table that runs off to a horizon, and a live network of van trips works across
   it, from the home countries in the east to the cities in the west and back. One 3D matrix
   drives the map (a CSS matrix3d on the svg), the scan band and the canvas drawing, so every
   light stays pinned to its city.
   It starts once per visit and keeps running while site.js slides pages over it. The lights stay
   off the page's copy and glass cards: they are measured again whenever a page or the account
   card moves in (site.js calls dvNet.relayout()), when something on the page changes size, and
   they follow the page as it scrolls over the fixed map.
   Vanilla JS, one requestAnimationFrame loop, nothing to download. */
(function () {
  'use strict';
  var map = document.querySelector('.backdrop'), svg = map && map.querySelector('svg');
  if (!svg || typeof DOMMatrix != 'function' || window.dvNet) return;   // one network for the whole visit
  var cv = document.createElement('canvas'), ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  var mq = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  var still = mq('(prefers-reduced-motion: reduce)');
  var fine = !still && mq('(hover: hover) and (pointer: fine)');
  var calm = !fine;   // touch screens: no pointer tilt and no drift, so the camera rests after the opening

  // ---- Network ----------------------------------------------------------------------------
  // Cities in map pixels of europe-night.webp (1800 x 1381). KIND: 0 relay, 1 home country, 2 destination.
  var XY = [575,468,522,347,390,328,644,628,722,812,733,953,338,1063,591,1047,470,1140,93,1103,145,977,212,1209,754,439,727,523,821,525,880,574,931,381,1047,438,987,687,1015,261,870,729,893,838,1028,1039,1105,1096,1167,676,1089,575,1195,677,1161,813,1343,854,1271,707,1310,433,1289,560,1217,324,1179,511,1569,838,1449,725,1595,674,1367,796,1474,954,1653,890,1474,1071];
  var KIND = '22022022000022222220222000000111111111110';
  var NAME = 'London|Manchester|Dublin|Paris|Lyon|Marseille|Madrid|Barcelona|Valencia|Lisbon|Porto|Seville|Amsterdam|Brussels|Cologne|Frankfurt|Hamburg|Berlin|Munich|Copenhagen|Zurich|Milan|Rome|Naples|Vienna|Prague|Bratislava|Zagreb|Belgrade|Budapest|Warsaw|Kraków|Gdańsk|Wrocław|Bucharest|Cluj-Napoca|Iași|Timișoara|Sofia|Varna|Thessaloniki'.split('|');
  var LINKS = '0-1 0-2 0-3 0-12 0-13 1-2 3-4 3-13 3-20 4-5 4-20 4-21 5-7 5-21 6-8 6-9 6-10 6-11 9-10 9-11 12-13 12-14 12-16 13-14 14-15 14-16 15-17 15-18 15-20 15-25 16-17 16-19 17-19 17-25 17-30 17-32 17-33 18-20 18-24 18-25 18-27 20-21 21-22 21-27 22-23 24-25 24-26 24-27 24-29 24-33 25-33 26-29 26-31 26-33 27-28 27-29 28-29 28-37 28-38 29-31 29-35 29-37 30-31 30-32 30-33 31-33 31-35 32-33 34-35 34-36 34-38 34-39 35-36 35-37 38-39 38-40 6-7';
  // The map's other bright towns (numbered on from 41), joined by a faint local mesh over land only.
  var MXY = [830,858,895,649,1654,467,920,447,1717,999,1002,837,810,933,782,599,1528,1211,466,444,559,268,501,838,1135,743,572,918,968,931,965,607,1023,537,393,909,1087,678,485,700,672,929,1213,1077,1668,1158,814,397,654,804,1402,1003,573,704,546,596,1426,273,1275,1123,601,1149,1096,1008,1068,1252,1435,551,1262,914,935,235,1170,439,736,725,881,1186,418,261,1417,646,390,612,462,1014,1334,664,1085,384,1521,625,1001,350,439,1211,1717,683,580,792,1190,940,707,611,1101,842,1193,1177,498,926,632,411,1331,1046,284,880,310,1242,1536,770,860,1103,155,912,1481,861,1510,300,306,987,1372,477,1249,787,1632,765,384,508,300,390,1276,298,1601,548,1508,495,1744,557,1539,974,1374,370,898,995,1441,1209,1412,928,1638,352,1391,1137,1731,277,1624,1068,1615,988,126,1206,317,1141,1450,442,1110,226,1594,278,1639,629,300,308,1354,215,210,1121,247,1057,1523,206,401,1090];
  var MLINKS = '0-50 0-96 1-50 1-51 1-96 2-80 2-110 2-131 3-67 3-68 3-78 3-92 4-41 4-61 4-65 4-78 5-47 5-61 6-105 6-126 6-134 6-136 7-54 7-61 7-83 8-83 8-88 8-136 9-125 9-133 10-102 10-134 11-99 11-125 11-126 11-133 12-64 13-48 13-92 14-44 14-48 14-64 15-42 15-44 15-48 15-56 16-44 16-64 16-76 16-87 17-44 17-57 17-85 17-87 18-42 18-46 18-56 18-59 19-128 20-42 20-78 21-41 21-46 21-55 22-55 22-72 23-62 23-72 23-94 24-53 24-59 25-57 25-59 27-53 27-75 27-91 27-93 27-107 28-75 28-103 28-107 28-119 29-84 29-107 30-77 30-106 30-111 30-116 31-74 31-84 31-106 32-77 32-85 33-77 34-100 34-103 34-108 34-115 35-81 35-86 35-100 35-103 36-86 36-100 36-108 36-130 37-84 37-103 37-107 38-66 38-103 38-115 38-119 39-108 39-124 40-66 40-115 40-121 41-47 42-48 42-56 43-112 43-114 43-120 44-57 44-64 45-124 46-55 46-59 48-78 48-92 50-109 52-54 52-60 52-90 52-95 53-59 54-61 54-65 54-90 54-95 56-57 58-83 58-95 58-98 58-105 60-67 60-68 60-82 61-65 62-70 62-72 62-94 63-123 65-90 66-75 66-97 66-119 66-121 67-68 67-78 67-90 69-104 69-116 69-132 69-135 74-81 74-86 74-106 74-113 74-127 75-91 75-97 75-107 77-85 78-92 79-101 81-84 81-86 83-95 83-105 83-136 85-87 86-112 86-113 88-99 88-126 89-108 89-114 89-130 91-93 97-121 98-102 98-105 99-126 100-103 100-108 102-105 103-119 104-127 104-129 104-135 105-134 106-116 106-127 110-131 111-116 111-132 112-113 112-114 112-130 113-127 114-130 115-124 116-127 118-121 120-122 120-129 122-129 123-124 125-133 126-133 126-134 126-136 129-135 133-134';
  var GOLD = '255,184,48', AMBER = '255,214,150', BLUE = '140,194,255', PALE = '140,189,245', ICE = '205,228,255', CREAM = '255,236,196';

  var N = [], E = [], ME = [], adj = [], all = [], HOME = [], DEST = [], i;
  function addNode(x, y, k) {
    N.push({ x: x, y: y, k: k, sx: 0, sy: 0, sz: 1, heat: 0, hc: GOLD, beam: 0, rev: 0, t: 0, open: 0, ring: 0, tag: 0, doors: [] });
    adj.push([]); all.push([]);
  }
  for (i = 0; i < KIND.length; i++) {
    addNode(XY[2 * i], XY[2 * i + 1], +KIND[i]);
    if (KIND[i] == '1') HOME.push(i); else if (KIND[i] == '2') DEST.push(i);
  }
  for (i = 0; i < MXY.length; i += 2) addNode(MXY[i], MXY[i + 1], 3);
  function addLinks(str, list, main) {
    str.split(' ').forEach(function (s) {
      var p = s.split('-'), a = +p[0], b = +p[1];
      var e = { a: a, b: b, len: Math.hypot(N[a].x - N[b].x, N[a].y - N[b].y), heat: 0, hc: GOLD, rev: 0,
        mx: (N[a].x + N[b].x) / 2, my: (N[a].y + N[b].y) / 2 };
      if (main) { adj[a].push([b, e]); adj[b].push([a, e]); }
      else { if (N[b].k == 3 && N[a].k != 3) N[a].doors.push(b); if (N[a].k == 3 && N[b].k != 3) N[b].doors.push(a); }
      all[a].push([b, e]); all[b].push([a, e]); list.push(e);
    });
  }
  addLinks(LINKS, E, 1); addLinks(MLINKS, ME, 0);

  function dijkstra(src, g) {   // the graph is tiny, so the plain O(n^2) version is plenty
    var d = N.map(function () { return Infinity; }), prev = d.map(function () { return -1; }), done = [];
    src.forEach(function (s) { d[s[0]] = s[1]; });
    for (;;) {
      var u = -1;
      for (var v = 0; v < N.length; v++) if (!done[v] && d[v] < Infinity && (u < 0 || d[v] < d[u])) u = v;
      if (u < 0) break;
      done[u] = 1;
      g[u].forEach(function (n) { var nd = d[u] + n[1].len; if (nd < d[n[0]]) { d[n[0]] = nd; prev[n[0]] = u; } });
    }
    return { d: d, prev: prev };
  }
  var routes = {};
  function route(a, b) {   // shortest path from city a to city b over the main links
    var key = a + '>' + b;
    if (!routes[key]) {
      var prev = dijkstra([[a, 0]], adj).prev, p = [b], cum = [0];
      while (p[0] != a) p.unshift(prev[p[0]]);
      for (var k = 1; k < p.length; k++) cum.push(cum[k - 1] + Math.hypot(N[p[k]].x - N[p[k - 1]].x, N[p[k]].y - N[p[k - 1]].y));
      routes[key] = { p: p, cum: cum, L: cum[cum.length - 1] };
    }
    return routes[key];
  }
  function edgeOf(a, b) { for (var k = 0; k < all[a].length; k++) if (all[a][k][0] == b) return all[a][k][1]; }

  // Power-on: the routes draw themselves outwards from the home countries, westwards across Europe.
  var SPEED_IN = 520, wave = dijkstra(HOME.map(function (h, k) { return [h, (k * 37) % 110]; }), all).d;
  N.forEach(function (n, k) { n.t = .8 + (wave[k] < Infinity ? wave[k] : 1500) / SPEED_IN; });
  E.concat(ME).forEach(function (e) {
    if (N[e.a].t > N[e.b].t) { var s = e.a; e.a = e.b; e.b = s; }
    e.t0 = N[e.a].t; e.dur = e.len / SPEED_IN;
  });
  var BUILT = 0; N.forEach(function (n) { BUILT = Math.max(BUILT, n.t); });

  // Soft round light sprites and the pillar beam, drawn once.
  function sprite(rgb, core) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(' + rgb + ',1)');
    r.addColorStop(core ? .22 : .1, 'rgba(' + rgb + ',' + (core ? .85 : .5) + ')');
    r.addColorStop(core ? .5 : .35, 'rgba(' + rgb + ',' + (core ? .1 : .14) + ')');
    r.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return c;
  }
  var SPR = {}; [GOLD, BLUE, ICE, PALE].forEach(function (c) { SPR[c] = sprite(c); });
  var CORE = sprite('255,255,255', 1), CORE_GOLD = sprite(CREAM, 1);
  // The pillar: a 2 px gold core and a soft 6 px bloom, both fading upwards.
  var BEAM = document.createElement('canvas'), BLOOM = document.createElement('canvas');
  BEAM.width = 4; BLOOM.width = 16; BEAM.height = BLOOM.height = 64;
  [BEAM, BLOOM].forEach(function (c) {
    var g = c.getContext('2d'), l = g.createLinearGradient(0, 64, 0, 0);
    l.addColorStop(0, 'rgba(' + AMBER + ',1)'); l.addColorStop(.3, 'rgba(' + GOLD + ',.55)'); l.addColorStop(1, 'rgba(' + GOLD + ',0)');
    g.fillStyle = l; g.fillRect(0, 0, c.width, 64);
    if (c == BLOOM) {
      var h = g.createLinearGradient(0, 0, 16, 0);
      h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = h; g.fillRect(0, 0, 16, 64);
    }
  });

  var scan = document.createElement('div');
  scan.className = 'scan'; cv.className = 'net';
  map.appendChild(scan); map.appendChild(cv);
  svg.setAttribute('preserveAspectRatio', 'none');
  map.classList.add('net-on');
  var FONT = '600 11px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');

  // ---- Camera -----------------------------------------------------------------------------
  // build() is the CSS chain translate(s) perspective(P) rotateX(th) rotateY(ry) rotateZ(yaw)
  // scale(U) translate(-anchor), taking map pixels to hero pixels. The anchor city sits at s.
  var W = 0, H = 0, Hc = 0, dpr = 1, B = { U: 0 }, R = {}, q = 1, M, px = 0, py = 0, tx = 0, ty = 0, size = 1;
  function build(th, ry, yaw, U, panx, pany) {
    var m = new DOMMatrix(), p = new DOMMatrix();
    p.m34 = -1 / B.P;
    m.translateSelf(B.sx, B.sy).multiplySelf(p).rotateAxisAngleSelf(1, 0, 0, th);
    if (ry) m.rotateAxisAngleSelf(0, 1, 0, ry);
    if (yaw) m.rotateAxisAngleSelf(0, 0, 1, yaw);
    return m.scaleSelf(U, U, 1).translateSelf(-(B.ax + panx), -(B.ay + pany));
  }
  function unproject(m) {   // hero pixels -> map pixels, the inverse of the plane's homography
    var a = m.m11, b = m.m21, c = m.m41, d = m.m12, e = m.m22, f = m.m42, g = m.m14, h = m.m24, k = m.m44;
    var A = e * k - f * h, Bb = c * h - b * k, C = b * f - c * e, D = f * g - d * k, Ee = a * k - c * g, F = c * d - a * f, G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
    return function (X, Y) { var w = G * X + Hh * Y + I; return [(A * X + Bb * Y + C) / w, (D * X + Ee * Y + F) / w]; };
  }
  // Pointer tilt and slow drift. Very wide screens show the map's edges, so they move less.
  var TILT = 2, TURN = 2.2, YAW = .8, ZOOM = .02, PANX = 12, PANY = 8, IN_TH = -22, IN_ZOOM = .08, IN_FOR = 3.6;
  function poses(intro) {   // every pose the map can take, plus the opening one
    var out = [], n = calm ? 1 : 32;
    for (var c = 0; c < n; c++) {
      var f = calm ? 0 : 1;
      out.push(build(B.th + f * (c & 1 ? TILT : -TILT), f * (c & 2 ? TURN : -TURN), B.yaw + f * (c & 4 ? YAW : -YAW),
        B.U * (1 + f * (c & 8 ? ZOOM : -ZOOM)), f * (c & 8 ? PANX : -PANX), f * (c & 16 ? PANY : -PANY)));
    }
    if (intro && !still) out.push(build(B.th + IN_TH, 0, B.yaw, B.U * (1 + IN_ZOOM), 0, 0));
    return out;
  }
  function camera() {
    Hc = Math.min(H, Math.max(560, window.innerHeight || H));   // frame the first screen of a tall hero
    // The camera is pinned by two cities: a destination in the west and a home city in the east,
    // each placed where the page leaves the map open (between the headline and the card, and
    // right of the card; on one-column layouts above and below the card).
    if (W < 861) {
      B = { th: 44, P: 600, sx: W / 2, sy: Hc * .6, fog: [36, 80],
        pin: [[1310, 433, W * .892, 120], [1474, 954, W * .885, Hc - 115]] };   // Warsaw, Sofia: Poland across the top band
    } else {
      B = { th: 42, P: 760, sx: W / 2 + 60, sy: 600, fog: [150, 262],
        pin: [[575, 468, W / 2 - 60, 290], [1569, 838, Math.min(W - 80, W / 2 + 640), Math.min(690, Hc - 110)]] };   // London, Bucharest
    }
    if (B.pin) pin(B.pin[0], B.pin[1]);
    // The table's true horizon: where the fog closes in, just above the copy and the card.
    var hz = B.sy - B.P / Math.tan(B.th * Math.PI / 180);
    if (!B.fog) B.fog = hz > 40 ? [hz - 25, hz + 75] : [40, 112];
    var wide = W >= 1600 ? .45 : 1;
    TURN = 2.2 * (wide < 1 ? .55 : 1); PANX = 12 * wide; PANY = 8 * wide; YAW = .8 * wide;
    TILT = fine ? 2 : 0; if (!fine) TURN = 0;
    var m = build(B.th, 0, B.yaw, B.U, 0, 0), un = unproject(m), y2 = Math.min(H, Hc);
    B.near = Math.max(un(0, y2)[1], un(W, y2)[1]) + 60;   // the scan starts just off the bottom of the first screen
    B.far = Math.min(un(0, B.fog[0])[1], un(W, B.fog[0])[1]);
    size = Math.max(.8, Math.min(1.2, B.U * 1.3));
    map.style.setProperty('--fog0', B.fog[0] + 'px'); map.style.setProperty('--fog1', B.fog[1] + 'px');
  }
  // Solve scale, turn and anchor so that two map points land on two chosen screen points.
  function pin(a, b) {
    var t = B.th * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    function inv(X, Y) { X -= B.sx; Y -= B.sy; var y = Y * B.P / (c * B.P + Y * s); return [X * (B.P - y * s) / B.P, y]; }
    var p1 = inv(a[2], a[3]), p2 = inv(b[2], b[3]), dpx = p1[0] - p2[0], dpy = p1[1] - p2[1], dmx = a[0] - b[0], dmy = a[1] - b[1];
    B.U = Math.hypot(dpx, dpy) / Math.hypot(dmx, dmy);
    var yaw = Math.atan2(dpy, dpx) - Math.atan2(dmy, dmx), co = Math.cos(yaw), si = Math.sin(yaw);
    B.yaw = yaw * 180 / Math.PI;
    B.ax = a[0] - (p1[0] * co + p1[1] * si) / B.U; B.ay = a[1] - (-p1[0] * si + p1[1] * co) / B.U;
  }
  var lastW = 0;
  function layout() {
    var w = map.clientWidth, h = map.clientHeight;
    if (!w || !h) return false;
    // A height-only change (a mobile address bar folding away under 100dvh) keeps the camera, so the map does not jump.
    var keep = w == lastW && B.U && Math.abs(h - H) < .25 * H;
    W = w; H = h; lastW = w;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (W * H * dpr * dpr > 4.4e6) dpr = Math.max(1, Math.sqrt(4.4e6 / (W * H)));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (!keep) camera();
    // The part of the map any pose can show below the horizon; the svg is cut to it so its layer stays small.
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, kmax = 0;
    poses(1).forEach(function (m) {
      var un = unproject(m);
      [[0, B.fog[0]], [W, B.fog[0]], [0, H], [W, H], [W / 2, B.fog[0]]].forEach(function (s) {
        var p = un(s[0], s[1]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      });
      var a = un(W / 2, H), b = un(W / 2 + 10, H);
      kmax = Math.max(kmax, 10 / Math.hypot(b[0] - a[0], b[1] - a[1]));
    });
    R.x = Math.max(0, Math.floor(x0 - 30)); R.y = Math.max(0, Math.floor(y0 - 30));
    R.w = Math.min(1800, Math.ceil(x1 + 30)) - R.x; R.h = Math.min(1381, Math.ceil(y1 + 30)) - R.y;
    q = Math.max(.5, Math.min(kmax, 1.25, 2 / (window.devicePixelRatio || 1)));   // raster scale of the map layer
    svg.setAttribute('viewBox', R.x + ' ' + R.y + ' ' + R.w + ' ' + R.h);
    svg.style.width = R.w * q + 'px'; svg.style.height = R.h * q + 'px';
    scan.style.width = R.w * q + 'px'; scan.style.height = SCAN_H * q + 'px';
    statKey = '';
    return true;
  }

  // ---- Motion -----------------------------------------------------------------------------
  var SCAN_H = 440, SCAN_EVERY = 9, SCAN_FOR = 5.6, SCAN_AT = BUILT - .4;
  var pulses = [], sparks = [], rings = [], tags = [], clock = 0, nextPulse = 1.1, raf = 0, last = 0;
  var ease = function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var clamp = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function seen(list, avoid) {   // mostly cities in open sky, clear of the page's copy and cards, so trips can be followed
    var o = list.filter(function (k) { return N[k].open && k != avoid; }), v = list.filter(function (k) { return N[k].vis && k != avoid; });
    var g = o.filter(function (k) { return N[k].ring || N[k].tag; });   // best of all: room for a ring or a name
    var r = Math.random();
    return pick(g.length && r < .6 ? g : o.length && r < .85 ? o : v.length ? v : list);
  }
  // The page's copy and its glass or solid panels. Pages scroll over the fixed map, so measure()
  // keeps them in page coordinates (the header, which stays put, in screen coordinates) and
  // place() turns them into screen rectangles for the current scroll position. Lights dim under them.
  var TXT = [], CRD = [], PTXT = [], PCRD = [], HEAD = [];
  var COPY = 'h1, h2, h3, p, li, summary, .store, .btn', LINES = /^(H1|H2|H3|P|LI)$/;
  function alpha(c) { var v = /rgba?\(([^)]*)\)/.exec(c); if (!v) return 0; v = v[1].split(/[\s,\/]+/); return v.length > 3 ? parseFloat(v[3]) : 1; }
  function solid(cs) {   // how opaque an element's own background is (its colour, or the faintest stop of a gradient)
    var a = alpha(cs.backgroundColor), g = cs.backgroundImage, re = /rgba?\([^)]*\)/g, m, lo = 2;
    if (g && g != 'none') while ((m = re.exec(g))) lo = Math.min(lo, alpha(m[0]));
    return Math.max(a, lo < 2 ? lo : 0);
  }
  function shiftOf(cs) {   // the translation a slide animation gives an element right now
    var t = cs.transform; if (!t || t == 'none') return [0, 0];
    var m = new DOMMatrix(t); return [m.m41, m.m42];
  }
  function measure() {
    var r = map.getBoundingClientRect(), sy = window.scrollY || 0, rng = document.createRange(), tp = W < 861 ? 12 : 24;   // copy keeps a clear margin around it
    var mains = [].filter.call(document.querySelectorAll('#stage > main'), function (m) { return !m.classList.contains('leaving'); });
    var dx = 0, dy = 0, keep = mains.slice();
    PTXT = []; PCRD = []; HEAD = [];
    function add(list, b, pad, ox, oy) {
      if (b.width > 1 && b.height > 1) list.push([b.left - r.left - ox - pad, b.top - r.top + sy - oy - pad, b.right - r.left - ox + pad, b.bottom - r.top + sy - oy + pad]);
    }
    var head = document.querySelector('header');
    if (head) add(HEAD, head.getBoundingClientRect(), 0, 0, sy);   // sticky: it stays where it is on screen
    mains.forEach(function (m) {
      // A page that is still sliding in is measured where it is going to rest.
      var s = shiftOf(getComputedStyle(m)); dx = s[0]; dy = s[1];
      var inCard = function (b) {
        var cx = (b.left + b.right) / 2 - r.left - dx, cy = (b.top + b.bottom) / 2 - r.top + sy - dy;
        return PCRD.some(function (c) { return cx > c[0] && cx < c[2] && cy > c[1] && cy < c[3]; });
      };
      var els = m.querySelectorAll('*'), k, el, cs, b;
      for (k = 0; k < els.length; k++) {
        el = els[k]; cs = getComputedStyle(el);
        if (cs.visibility == 'hidden' || cs.display == 'none') continue;
        // Glass, a solid panel, or a rounded see-through one (the tiles): lights dim under them.
        var bf = cs.backdropFilter || cs.webkitBackdropFilter, a = solid(cs);
        if (!(bf && bf != 'none') && a < .5 && !(a >= .04 && parseFloat(cs.borderTopLeftRadius) >= 8)) continue;
        b = el.getBoundingClientRect();
        if (b.width * b.height <= 3e4 || inCard(b)) continue;   // panels inside a panel add nothing
        var o = shiftOf(cs);   // a card sliding in or out of the booking card's spot
        add(PCRD, b, 10, dx + o[0], dy + o[1]); keep.push(el);
      }
      m.querySelectorAll(COPY).forEach(function (el) {
        var b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2 || inCard(b) || getComputedStyle(el).visibility == 'hidden') return;   // (phones keep the headline for screen readers only, 1 px)
        if (LINES.test(el.tagName)) { rng.selectNodeContents(el); [].forEach.call(rng.getClientRects(), function (lb) { add(PTXT, lb, tp, dx, dy); }); }
        else add(PTXT, b, tp, dx, dy);
      });
    });
    watch(keep);
  }
  // Pages and panels that change size (a Join step, an FAQ answer) are measured again.
  var ro = window.ResizeObserver && new ResizeObserver(function (en) {
    var moved = 0;
    en.forEach(function (e) { var s = Math.round(e.contentRect.width) + 'x' + Math.round(e.contentRect.height); if (e.target.__dvSize && e.target.__dvSize != s) moved = 1; e.target.__dvSize = s; });
    if (moved) soon(1);
  }), watched = [];
  function watch(list) {
    if (!ro || (list.length == watched.length && list.every(function (el, k) { return el === watched[k]; }))) return;
    ro.disconnect(); watched = list;
    list.forEach(function (el) { el.__dvSize = ''; ro.observe(el); });
  }
  function hit(list, x0, y0, x1, y1) { for (var k = 0; k < list.length; k++) { var c = list[k]; if (x1 > c[0] && x0 < c[2] && y1 > c[1] && y0 < c[3]) return true; } return false; }
  function cover(x, y) { return hit(TXT, x, y, x, y) ? .25 : hit(CRD, x, y, x, y) ? CARD_VIS : 1; }
  // The stretches of a line that pass over the copy, as fractions [t0, t1] along it (in order,
  // merged), or null: a link between two cities in open sky can still cross a line of text or
  // the store badges on its way.
  function cut(x0, y0, x1, y1) {
    var out = null, dx = x1 - x0, dy = y1 - y0, lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1);
    for (var k = 0; k < TXT.length; k++) {
      var c = TXT[k];
      if (hx <= c[0] || lx >= c[2] || hy <= c[1] || ly >= c[3]) continue;
      var t0 = 0, t1 = 1, p = [-dx, dx, -dy, dy], q = [x0 - c[0], c[2] - x0, y0 - c[1], c[3] - y0], j;
      for (j = 0; j < 4 && t0 < t1; j++) {   // Liang-Barsky clipping against the rectangle
        if (!p[j]) { if (q[j] < 0) t1 = -1; continue; }
        var r = q[j] / p[j];
        if (p[j] < 0) { if (r > t0) t0 = r; } else if (r < t1) t1 = r;
      }
      if (t0 < t1) (out = out || []).push([t0, t1]);
    }
    if (!out || out.length < 2) return out;
    out.sort(function (a, b) { return a[0] - b[0]; });
    var m = [out[0]];
    for (k = 1; k < out.length; k++) { var l = m[m.length - 1]; if (out[k][0] <= l[1]) l[1] = Math.max(l[1], out[k][1]); else m.push(out[k]); }
    return m;
  }
  var CARD_VIS = .6, lastMask = '', wantMask = '';
  // Which cities sit in open sky at this scroll position: only these get rings, pillars, labels and big glows.
  function place() {
    var sy = window.scrollY || 0;
    TXT = []; CRD = HEAD.slice();
    [[PTXT, TXT], [PCRD, CRD]].forEach(function (l) {
      for (var k = 0; k < l[0].length; k++) { var c = l[0][k], y0 = c[1] - sy, y1 = c[3] - sy; if (y1 > -80 && y0 < H + 80) l[1].push([c[0], y0, c[2], y1]); }
    });
    var mask = '', low = TXT.filter(function (c) { return c[3] > B.fog[0] && c[1] < H; });
    if (W >= 861 && low.length) {   // the scan's light is held to 45% where it crosses the copy
      var cx0 = 1e9, cx1 = -1e9, cy0 = 1e9, cy1 = -1e9;
      low.forEach(function (c) { cx0 = Math.min(cx0, c[0]); cx1 = Math.max(cx1, c[2]); cy0 = Math.min(cy0, c[1]); cy1 = Math.max(cy1, c[3]); });
      var un = unproject(build(B.th, 0, B.yaw, B.U, 0, 0)), ym = (Math.max(cy0, B.fog[1]) + Math.min(cy1, H)) / 2;
      var pc = function (x) { return Math.max(0, Math.min(100, (un(x, ym)[0] - R.x) / R.w * 100)).toFixed(1) + '%'; };
      mask = 'linear-gradient(90deg, transparent, #000 14%, #000 ' + pc(cx0 - 60) + ', rgba(0,0,0,.45) ' + pc(cx0) +
        ', rgba(0,0,0,.45) ' + pc(cx1) + ', #000 ' + pc(cx1 + 60) + ', #000 86%, transparent)';
    }
    wantMask = mask;   // set on the scan band when it next shows (render)
    setM(build(B.th, 0, B.yaw, B.U, 0, 0));
    ctx.font = FONT;
    N.forEach(function (n, j) {
      P(n.x, n.y, T0);
      var x = T0[0], y = T0[1], s = T0[2] * size, zr = Math.min(1.2, T0[2]);
      n.vis = x > 12 && x < W - 12 && y > B.fog[1] - 40 && y < Math.min(H, Hc) - 16;
      n.open = n.vis && !hit(TXT, x - 6, y - 6, x + 6, y + 6) && !hit(CRD, x - 6, y - 6, x + 6, y + 6);
      n.ring = 0;   // the widest ring (45 px at most) that stays off the copy; it may slip under the glass card's edge
      for (var rr = 45; n.open && rr >= 20 && !n.ring; rr -= 5) {
        var rx = rr * zr, ry = rx * .62;
        if (!hit(TXT, x - rx, y - ry, x + rx, y + ry) && !hit(CRD, x - rx * .45, y - ry * .45, x + rx * .45, y + ry * .45)) n.ring = rx;
      }
      if (n.k == 1 || n.k == 2) {
        // The name goes right of the city, else left of it, else centred below it: wherever it is clear.
        var tw = ctx.measureText(NAME[j].toUpperCase()).width * 1.18 + 4, sides = [[12, -9], [-12 - tw, -9], [-tw / 2, 21]];
        if (x + 12 + tw > W - 8) sides.unshift(sides.splice(1, 1)[0]);
        n.tag = 0;
        for (var si = 0; si < 3 && n.open && !n.tag; si++) {
          var lx = x + sides[si][0], ly = y + sides[si][1];
          if (lx > 6 && lx + tw < W - 6 && ly < Math.min(H, Hc) - 8 && !hit(TXT, lx - 2, ly - 13, lx + tw + 2, ly + 5) && !hit(CRD, lx, ly - 13, lx + tw, ly + 5)) { n.tag = 1; n.tx = sides[si][0]; n.ty = sides[si][1]; }
        }
      }
      n.pill = 0;   // home cities: the tallest pillar (56 px at most) that stays off the copy; its faint tip may pass under glass
      for (var ph = 56; n.k == 1 && n.open && ph >= 26 && !n.pill; ph -= 6)
        if (y - ph > B.fog[0] + 4 && !hit(TXT, x - 4, y - ph, x + 4, y) && !hit(CRD, x - 4, y - ph * .55, x + 4, y)) n.pill = ph;
    });
  }
  function spawn(ahead) {
    var west = clock < BUILT + 2 || Math.random() < .7, a = seen(HOME), b = seen(DEST);   // the first trips all leave home
    if (!west) { var s = a; a = b; b = s; }
    var r = route(a, b), s0 = 0, h0 = 0;
    if (ahead) {   // an opening trip already under way: it set off from a home city hidden under the card
      a = HOME.filter(function (k) { return !N[k].open && N[k].vis; }); if (!a.length) return;
      a = pick(a); r = route(a, b);
      s0 = Math.min(r.L * .62, SPEED_IN * (clock - .8) - 160); if (s0 < 0) return;
      while (h0 < r.p.length - 2 && r.cum[h0 + 1] <= s0) h0++;
    }
    pulses.push({ r: r, s: s0, v: 200 + Math.random() * 80, c: west ? GOLD : BLUE, hop: h0, done: 0, vis: cover(N[a].sx, N[a].sy), age: ahead ? 1 : 0, wait: ahead ? 0 : .55 });
    if (ahead) return;
    N[a].heat = Math.max(N[a].heat, .9); N[a].hc = west ? GOLD : BLUE;
    if (west) N[a].beam = 1;
    doors(a, 1, west ? GOLD : BLUE);
    label(a);
  }
  function doors(k, inward, c) {   // door to door: little sparks between the hub and the towns around it
    var n = N[k]; if (!n.open) return;
    var d = n.doors.slice().sort(function () { return Math.random() - .5; }).slice(0, 3);
    d.forEach(function (tn, j) { var e = edgeOf(k, tn); if (e) sparks.push({ e: e, a: inward ? tn : k, b: inward ? k : tn, t: -j * .18, dur: .55 + e.len / 300, c: c }); });
  }
  function label(k) {
    var n = N[k]; if (!n.tag || n.lab > 0) return;
    n.lab = 1; tags.push({ n: n, t: 0, s: NAME[k].toUpperCase() });
  }
  function scanAt(t) {   // map y of the scan front (it runs from the near edge to the horizon)
    if (still || t < SCAN_AT) return null;
    var p = ((t - SCAN_AT) % SCAN_EVERY) / SCAN_FOR;
    if (p > 1) return null;
    return { y: B.near - (B.near - B.far + 40) * ease(p), o: Math.min(1, p * 6, (1 - p) * 3) };
  }
  function pose(t) {
    var k = still ? 1 : clamp((t - .05) / IN_FOR), intro = 1 - Math.pow(1 - k, 3), d = calm ? 0 : 1;
    return build(B.th + (1 - intro) * IN_TH + py * TILT, px * TURN, B.yaw + d * YAW * Math.sin(t * .11),
      B.U * (1 + (1 - intro) * IN_ZOOM) * (1 + d * ZOOM * Math.sin(t * .15 - 1.2)),
      d * PANX * Math.sin(t * .093), d * PANY * Math.sin(t * .131 + 1));
  }

  // ---- Drawing ----------------------------------------------------------------------------
  var a_, b_, c_, d_, e_, f_, g_, h_, i_;
  function setM(m) { a_ = m.m11; b_ = m.m12; c_ = m.m21; d_ = m.m22; e_ = m.m41; f_ = m.m42; g_ = m.m14; h_ = m.m24; i_ = m.m44; }
  function P(x, y, o) { var w = g_ * x + h_ * y + i_; o[0] = (a_ * x + c_ * y + e_) / w; o[1] = (b_ * x + d_ * y + f_) / w; o[2] = 1 / w; return o; }
  function glow(img, x, y, r, a) { if (a <= .004 || r < .4) return; ctx.globalAlpha = a > 1 ? 1 : a; ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r); }
  function rgba(rgb, a) { return 'rgba(' + rgb + ',' + (a > 1 ? 1 : a < 0 ? 0 : a.toFixed(3)) + ')'; }
  function line(x0, y0, x1, y1, rgb, a, w) {
    if (a <= .004) return;
    ctx.globalAlpha = 1; ctx.strokeStyle = rgba(rgb, a); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // A lit line (alpha a) that stays off the copy: where it crosses text it is held to LINE_TXT of
  // its full strength (less than a light under the copy gets, as several trips can share a link),
  // the rest keeps a. Lights add up ('lighter'), so it is the whole line at the low strength plus
  // the open stretches on top.
  var LINE_TXT = .15;
  function lineC(x0, y0, x1, y1, rgb, a, w, full) {
    var sp = a > .004 && cut(x0, y0, x1, y1);
    if (!sp) return line(x0, y0, x1, y1, rgb, a, w);
    var lo = Math.min(a, (full == null ? a : full) * LINE_TXT), dx = x1 - x0, dy = y1 - y0, t = 0, e;
    line(x0, y0, x1, y1, rgb, lo, w);
    if (a - lo <= .004) return;
    for (var k = 0; k <= sp.length; k++) {
      e = k < sp.length ? sp[k][0] : 1;
      if (e > t) line(x0 + dx * t, y0 + dy * t, x0 + dx * e, y0 + dy * e, rgb, a - lo, w);
      if (k < sp.length) t = sp[k][1];
    }
  }
  function mix(a, b, f) { a = a.split(','); b = b.split(','); return a.map(function (v, k) { return Math.round(+v + (b[k] - v) * f); }).join(','); }
  var TAILC = []; for (i = 0; i <= 16; i++) TAILC.push(mix(GOLD, AMBER, i / 16));
  function at(r, s, o) {   // map point s pixels along a route; returns the leg index
    var k = 1, cum = r.cum, p = r.p;
    if (s <= 0) { o[0] = N[p[0]].x; o[1] = N[p[0]].y; return 0; }
    if (s >= r.L) { o[0] = N[p[p.length - 1]].x; o[1] = N[p[p.length - 1]].y; return p.length - 2; }
    while (cum[k] < s) k++;
    var f = (s - cum[k - 1]) / (cum[k] - cum[k - 1]), A = N[p[k - 1]], Bn = N[p[k]];
    o[0] = A.x + (Bn.x - A.x) * f; o[1] = A.y + (Bn.y - A.y) * f;
    return k - 1;
  }
  var T0 = [0, 0, 1], T1 = [0, 0, 1], S0 = [0, 0, 1], S1 = [0, 0, 1], Q = [0, 0];
  var depth = function (z) { return clamp((z - .45) / .55); };   // 0 far away, 1 near the viewer
  var GRID_A = .42;

  // A set of links as faint strokes, bucketed by depth, partly drawn while the web powers on.
  function web(list, t, rgb, alpha, width) {
    ctx.globalAlpha = 1; ctx.lineWidth = width;
    for (var lv = 0; lv < 4; lv++) {
      ctx.strokeStyle = rgba(rgb, alpha * (.35 + .65 * lv / 3)); ctx.beginPath();
      for (var k = 0; k < list.length; k++) {
        var e = list[k], A = N[e.a], Bn = N[e.b];
        if (Math.min(3, Math.floor(depth((A.sz + Bn.sz) / 2) * 3.99)) != lv) continue;
        var pr = still ? 1 : clamp((t - e.t0) / e.dur); if (pr <= 0) continue;
        ctx.moveTo(A.sx, A.sy); ctx.lineTo(A.sx + (Bn.sx - A.sx) * pr, A.sy + (Bn.sy - A.sy) * pr);
      }
      ctx.stroke();
    }
  }
  function tips(list, t) {   // the power-on wave: bright drawing heads and a fading afterglow
    for (var k = 0; k < list.length; k++) {
      var e = list[k], pr = (t - e.t0) / e.dur, after = (t - e.t0 - e.dur) / 1.2;
      if (pr <= 0 || after >= 1) continue;
      var A = N[e.a], Bn = N[e.b], f = Math.min(pr, 1), z = A.sz * size, lv = .4 + .6 * depth(A.sz);
      var x = A.sx + (Bn.sx - A.sx) * f, y = A.sy + (Bn.sy - A.sy) * f, cf = cover(x, y);
      var fa = .45 * lv * (after > 0 ? 1 - after : 1);
      lineC(A.sx, A.sy, x, y, AMBER, fa * cf, 1.1, fa);
      if (pr < 1.15) {
        var a = (pr > 1 ? (1.15 - pr) / .15 : 1) * cf;
        glow(SPR[GOLD], x, y, 9 * z, .7 * a * lv);
        glow(CORE_GOLD, x, y, 2.6 * z, a);
      }
    }
  }
  function heated(list, w) {   // links lit by traffic
    for (var k = 0; k < list.length; k++) {
      var e = list[k]; if (e.heat < .01) continue;
      var A = N[e.a], Bn = N[e.b], cf = Math.min(1, .3 + .7 * ((A.open ? .5 : 0) + (Bn.open ? .5 : 0)));
      lineC(A.sx, A.sy, Bn.sx, Bn.sy, e.hc == GOLD ? AMBER : e.hc, .62 * e.heat * cf, 1.4 * w, .62 * e.heat);
      lineC(A.sx, A.sy, Bn.sx, Bn.sy, e.hc, .1 * e.heat * cf, 6 * w * size, .1 * e.heat);
    }
  }

  // What does not change between frames: the horizon haze, the grid, the resting web and the
  // cities' own light. Once the web is built it is painted into a cache for one camera pose; a
  // slowly drifting camera reuses it through a small affine correction and repaints it only when
  // that correction stops being exact to a fraction of a pixel.
  function paintStatic(t) {
    var k, n, x, y, on = still ? 1 : clamp((t - .2) / 1.6), y2 = Math.min(H, Hc * 1.05);
    // A faint band of light where the table meets the sky.
    var hz = ctx.createLinearGradient(0, B.fog[0] - 30, 0, B.fog[1] + 40);
    hz.addColorStop(0, 'rgba(0,100,210,0)'); hz.addColorStop(.45, rgba('60,151,255', .07 * on)); hz.addColorStop(1, 'rgba(0,100,210,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = hz; ctx.fillRect(0, B.fog[0] - 30, W, B.fog[1] - B.fog[0] + 70);

    // The table's grid, square to the viewer (Europe lies turned on it): its long lines run off
    // to one vanishing point on the horizon and fade into the distance.
    var GS = 60, rad = B.yaw * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad), un = unproject(M);
    var tm = function (u, v, o) { return P(B.ax + u * co + v * si, B.ay - u * si + v * co, o); };
    var u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    [[0, B.fog[0]], [W, B.fog[0]], [0, y2], [W, y2], [W / 2, B.fog[0]]].forEach(function (c) {
      var m = un(c[0], c[1]), dx = m[0] - B.ax, dy = m[1] - B.ay, u = dx * co - dy * si, v = dx * si + dy * co;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    });
    var vn = (function () { var m = un(B.sx, y2), dx = m[0] - B.ax, dy = m[1] - B.ay; return dx * si + dy * co; })();
    var vf = (function () { var m = un(B.sx, B.fog[0]), dx = m[0] - B.ax, dy = m[1] - B.ay; return dx * si + dy * co; })();
    u0 = Math.floor(u0 / GS) * GS - GS; u1 += GS; v0 = Math.max(v0, -4000); v1 += GS * 2;
    ctx.lineWidth = 1;
    for (x = u0; x <= u1; x += GS) {
      tm(x, vn, T0); tm(x, vf, T1);
      var gr = ctx.createLinearGradient(T0[0], T0[1], T1[0], T1[1]);
      gr.addColorStop(0, rgba(BLUE, GRID_A * on)); gr.addColorStop(.6, rgba(BLUE, GRID_A * .55 * on)); gr.addColorStop(1, rgba(BLUE, GRID_A * .3 * on));
      ctx.globalAlpha = 1; ctx.strokeStyle = gr; ctx.beginPath(); tm(x, v1, T0); tm(x, v0, T1); ctx.moveTo(T0[0], T0[1]); ctx.lineTo(T1[0], T1[1]); ctx.stroke();
    }
    var hg = ctx.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, 'rgba(' + BLUE + ',0)'); hg.addColorStop(.15, rgba(BLUE, 1)); hg.addColorStop(.85, rgba(BLUE, 1)); hg.addColorStop(1, 'rgba(' + BLUE + ',0)');
    ctx.strokeStyle = hg;
    for (y = Math.ceil(v0 / GS) * GS; y <= v1; y += GS) {
      tm(0, y, S0); var a = .1 * on * (.25 + .75 * depth(S0[2])) * clamp((S0[2] - .3) * 3);
      if (a < .004) continue;
      tm(u0, y, T0); tm(u1, y, T1);
      ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(T0[0], T0[1]); ctx.lineTo(T1[0], T1[1]); ctx.stroke();
    }
    ctx.fillStyle = rgba('170,210,255', 1);
    for (y = Math.ceil(v0 / GS) * GS; y <= v1; y += GS) {
      tm(0, y, S0); if (depth(S0[2]) < .3) continue;
      for (x = u0; x <= u1; x += GS) {
        tm(x, y, T0); var dz = depth(T0[2]); if (dz < .3 || T0[0] < -5 || T0[0] > W + 5 || T0[1] > y2 + 5) continue;
        var sz = 1.5 * T0[2]; ctx.globalAlpha = .3 * dz * on; ctx.fillRect(T0[0] - sz / 2, T0[1] - sz / 2, sz, sz);
      }
    }

    // The web: the fine mesh (only just there until traffic wakes it), then the main routes.
    web(ME, t, PALE, .05, .8);
    web(E, t, PALE, .24, 1.15);

    // The towns as fine points (the named cities are drawn on every frame, see stars()).
    for (k = 0; k < N.length; k++) {
      n = N[k];
      var bo = still ? 1 : clamp((t - n.t) / .45);
      if (n.k != 3 || bo <= 0 || n.sy < B.fog[0]) continue;
      var pop = bo < 1 ? 1 + 1.4 * Math.sin(bo * Math.PI) * (1 - bo) : 1, z = (.4 + .6 * n.sz) * size * pop, dim = (.4 + .6 * depth(n.sz)) * bo;
      glow(CORE, n.sx, n.sy, 1.5 * z, .4 * dim);
    }
  }
  // The named cities as small stars. Under the copy and the cards only their cores are drawn, so
  // no colour smears through the glass. They depend on the page's layout, so they stay out of the
  // cached layer, which then never has to be repainted when a page slides in or scrolls.
  function stars(t) {
    for (var k = 0; k < N.length; k++) {
      var n = N[k], bo = still ? 1 : clamp((t - n.t) / .45);
      if (n.k == 3 || bo <= 0 || n.sy < B.fog[0]) continue;
      var pop = bo < 1 ? 1 + 1.4 * Math.sin(bo * Math.PI) * (1 - bo) : 1, z = (.4 + .6 * n.sz) * size * pop, dim = (.4 + .6 * depth(n.sz)) * bo;
      var c = n.k == 1 ? GOLD : n.k == 2 ? PALE : ICE;
      if (n.open) glow(SPR[c], n.sx, n.sy, (n.k == 0 ? 8 : 13) * z, (n.k == 0 ? .35 : .7) * dim);
      glow(n.k == 1 ? CORE_GOLD : CORE, n.sx, n.sy, (n.k == 0 ? 2.2 : 3.2) * z, (n.open ? .9 : .5) * dim);
    }
  }

  // Cache handling: 3 reference points fix an affine map from the cached pose to the current one.
  var main = ctx, stat = document.createElement('canvas'), statKey = '', REF = [], AF = [1, 0, 0, 1, 0, 0];
  function refPoints() {
    var un = unproject(M), yt = B.fog[0] + 20, yb = Math.min(H, Hc);
    REF = [[.04 * W, yt], [.96 * W, yt], [.5 * W, yb], [.04 * W, yb], [.96 * W, yb], [.5 * W, (yt + yb) / 2]].map(function (s) {
      var p = un(s[0], s[1]); return [p[0], p[1], s[0], s[1]];
    });
  }
  function affine() {   // the affine map taking the cached screen points to where they are now; null when it is not exact
    var s = REF.map(function (r) { P(r[0], r[1], T0); return [T0[0], T0[1]]; });
    var x1 = REF[0][2], y1 = REF[0][3], x2 = REF[1][2], y2 = REF[1][3], x3 = REF[2][2], y3 = REF[2][3];
    var det = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1); if (!det) return null;
    function solve(v1, v2, v3) {
      var a = ((v2 - v1) * (y3 - y1) - (v3 - v1) * (y2 - y1)) / det, b = ((x2 - x1) * (v3 - v1) - (x3 - x1) * (v2 - v1)) / det;
      return [a, b, v1 - a * x1 - b * y1];
    }
    var X = solve(s[0][0], s[1][0], s[2][0]), Y = solve(s[0][1], s[1][1], s[2][1]);
    for (var k = 3; k < 6; k++) {
      var ex = X[0] * REF[k][2] + X[1] * REF[k][3] + X[2] - s[k][0], ey = Y[0] * REF[k][2] + Y[1] * REF[k][3] + Y[2] - s[k][1];
      if (ex * ex + ey * ey > .36) return null;
    }
    AF[0] = X[0]; AF[1] = Y[0]; AF[2] = X[1]; AF[3] = Y[1]; AF[4] = X[2]; AF[5] = Y[2];
    return AF;
  }

  // A booked trip first draws its whole route as a thin gold line, end to end, so the east-west
  // link reads even where the card hides the middle; the pulse then runs along it.
  function routeLine(pl) {
    var r = pl.r, p = r.p, g = clamp(pl.age / .9), drawn = r.L * (1 - Math.pow(1 - g, 3));
    var fade = pl.s >= r.L ? Math.max(0, 1 - (pl.s - r.L) / 160) : 1, a = .3 * fade * Math.min(1, pl.age * 4);
    if (a < .01) return;
    for (var j = 1; j < p.length && r.cum[j - 1] < drawn; j++) {
      var A = N[p[j - 1]], Bn = N[p[j]], f = Math.min(1, (drawn - r.cum[j - 1]) / (r.cum[j] - r.cum[j - 1]));
      var x = A.sx + (Bn.sx - A.sx) * f, y = A.sy + (Bn.sy - A.sy) * f;
      lineC(A.sx, A.sy, x, y, pl.c == GOLD ? AMBER : PALE, a * cover((A.sx + x) / 2, (A.sy + y) / 2), 1.1, a);
      if (f < 1) { glow(pl.c == GOLD ? CORE_GOLD : CORE, x, y, 2.2 * size, .8 * fade * cover(x, y)); break; }
    }
  }

  function draw(t, dt) {
    var k, n, e, sc = scanAt(t), sy = sc ? sc.y : -1e9, so = sc ? sc.o : 0;
    for (k = 0; k < N.length; k++) { n = N[k]; P(n.x, n.y, T0); n.sx = T0[0]; n.sy = T0[1]; n.sz = T0[2]; }   // cities on screen
    var cacheable = still || t > BUILT + 1.2;
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalCompositeOperation = 'source-over'; main.globalAlpha = 1;
    main.clearRect(0, 0, cv.width, cv.height);
    if (cacheable) {
      var af = statKey && affine();
      if (!af) {
        stat.width = cv.width; stat.height = cv.height; ctx = stat.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        paintStatic(t); ctx = main; statKey = 'on'; refPoints(); af = [1, 0, 0, 1, 0, 0];
      }
      main.setTransform(dpr * af[0], dpr * af[1], dpr * af[2], dpr * af[3], dpr * af[4], dpr * af[5]);
      main.drawImage(stat, 0, 0, stat.width / dpr, stat.height / dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    if (!cacheable) paintStatic(t);

    stars(t);
    // Traffic: lit links, the mesh woken around each trip and, while the web powers on, its drawing heads.
    heated(ME, .8); heated(E, 1);
    if (!still && t < BUILT + 1.4) tips(E, t);
    for (k = 0; k < pulses.length; k++) {
      var pl0 = pulses[k]; at(pl0.r, Math.min(pl0.s, pl0.r.L), Q);
      for (var j = 0; j < ME.length; j++) {
        e = ME[j]; var dd = Math.hypot(e.mx - Q[0], e.my - Q[1]);
        if (dd < 190) e.rev = Math.max(e.rev, 1 - dd / 190);
      }
    }
    for (k = 0; k < ME.length; k++) {
      e = ME[k]; if (e.rev < .02) continue;
      var A = N[e.a], Bn = N[e.b], cf = Math.min(cover(A.sx, A.sy), cover(Bn.sx, Bn.sy));
      lineC(A.sx, A.sy, Bn.sx, Bn.sy, PALE, .3 * e.rev * cf, .9, .3 * e.rev);
      if (A.k == 3) A.rev = Math.max(A.rev, e.rev); if (Bn.k == 3) Bn.rev = Math.max(Bn.rev, e.rev);
      if (dt) e.rev *= Math.exp(-dt * 1.9);
    }

    // The scan band: a faint sheen sweeping over the glass table, lifting the links it crosses.
    if (so) {
      var bx0 = R.x - 200, bx1 = R.x + R.w + 200, by0 = sy - 30, by1 = sy + SCAN_H * .8, bm = (bx0 + bx1) / 2;
      P(bm, by0, S0); P(bm, by1, S1);
      var sh = ctx.createLinearGradient(S0[0], S0[1], S1[0], S1[1]);
      sh.addColorStop(0, 'rgba(' + CREAM + ',0)'); sh.addColorStop(.3, rgba(CREAM, .055 * so)); sh.addColorStop(.6, rgba(CREAM, .025 * so)); sh.addColorStop(1, 'rgba(' + CREAM + ',0)');
      ctx.globalAlpha = 1; ctx.fillStyle = sh; ctx.beginPath();
      P(bx0, by0, T0); ctx.moveTo(T0[0], T0[1]); P(bx1, by0, T0); ctx.lineTo(T0[0], T0[1]);
      P(bx1, by1, T0); ctx.lineTo(T0[0], T0[1]); P(bx0, by1, T0); ctx.lineTo(T0[0], T0[1]); ctx.closePath(); ctx.fill();
      [E, ME].forEach(function (list, li) {
        for (var k2 = 0; k2 < list.length; k2++) {
          var e2 = list[k2], A = N[e2.a], Bn = N[e2.b], dy = Bn.y - A.y, band = 220;
          var lo = dy ? (sy - A.y) / dy : (A.y >= sy && A.y <= sy + band ? 0 : 2), hi = dy ? (sy + band - A.y) / dy : 1;
          if (lo > hi) { var sw = lo; lo = hi; hi = sw; }
          lo = clamp(lo); hi = clamp(hi);
          if (hi <= lo) continue;
          P(A.x + (Bn.x - A.x) * lo, A.y + (Bn.y - A.y) * lo, S0); P(A.x + (Bn.x - A.x) * hi, A.y + (Bn.y - A.y) * hi, S1);
          var sa = (li ? .1 : .26) * so;
          lineC(S0[0], S0[1], S1[0], S1[1], li ? PALE : AMBER, sa * cover((S0[0] + S1[0]) / 2, (S0[1] + S1[1]) / 2), li ? .9 : 1.1, sa);
        }
      });
    }

    // Door to door: short sparks between a hub and the towns around it.
    for (k = sparks.length - 1; k >= 0; k--) {
      var sp = sparks[k]; if (dt) sp.t += dt;
      if (sp.t < 0) continue;
      var f = sp.t / sp.dur; if (f >= 1) { N[sp.b].heat = Math.max(N[sp.b].heat, .5); N[sp.b].hc = sp.c; sparks.splice(k, 1); continue; }
      var A0 = N[sp.a], B0 = N[sp.b], fe = ease(f), fb = Math.max(0, fe - .3);
      sp.e.heat = Math.max(sp.e.heat, .55); sp.e.hc = sp.c;
      var hx = A0.sx + (B0.sx - A0.sx) * fe, hy = A0.sy + (B0.sy - A0.sy) * fe;
      var ht = hit(TXT, hx, hy, hx, hy) ? .25 : 1;   // a town under the copy: the spark dims there like any light
      lineC(A0.sx + (B0.sx - A0.sx) * fb, A0.sy + (B0.sy - A0.sy) * fb, hx, hy, sp.c == GOLD ? AMBER : ICE, .75, 1.2 * size * A0.sz);
      glow(SPR[sp.c], hx, hy, 7 * size * A0.sz, .7 * ht * ht); glow(sp.c == GOLD ? CORE_GOLD : CORE, hx, hy, 2 * size * A0.sz, .95 * ht);
    }

    // Trips: golden pulses with comet tails, home countries to destinations (blue on the way back).
    // Each hop eases out of a city and into the next one.
    for (k = pulses.length - 1; k >= 0; k--) {
      var pl = pulses[k], r = pl.r;
      if (dt) pl.age += dt;
      routeLine(pl);
      if (dt && pl.age > pl.wait) {
        var hp = at(r, pl.s, Q), u = pl.s < r.L ? (pl.s - r.cum[hp]) / (r.cum[hp + 1] - r.cum[hp]) : .5;
        pl.s += pl.v * dt * (1 - .55 * Math.cos(6.2832 * u));
      }
      var hop = at(r, pl.s, Q);
      while (pl.hop < hop + 1 && pl.hop < r.p.length - 1) {   // reached the next city
        pl.hop++;
        var nn = N[r.p[pl.hop]]; nn.heat = Math.max(nn.heat, pl.hop == r.p.length - 1 ? 1.2 : .7); nn.hc = pl.c;
      }
      if (pl.s < r.L) { var ed = edgeOf(r.p[hop], r.p[hop + 1]); if (ed) { ed.heat = Math.max(ed.heat, .9); ed.hc = pl.c; } }
      else if (!pl.done) {
        pl.done = 1; var dk = r.p[r.p.length - 1], dn = N[dk];
        if (dn.ring) rings.push({ n: dn, t: 0, c: pl.c });
        doors(dk, 0, pl.c); label(dk);
      }
      var TAIL = 16, STEP = 12, born = clamp(pl.s / 50), gone = clamp((pl.s - r.L) / (TAIL * STEP));
      if (gone >= 1) { pulses.splice(k, 1); continue; }
      at(r, Math.min(pl.s, r.L), Q); P(Q[0], Q[1], S0);
      var px0 = S0[0], py0 = S0[1], pz = .45 + .55 * S0[2];   // lights keep some size in the distance
      if (dt) pl.vis += (cover(px0, py0) - pl.vis) * (1 - Math.exp(-dt * 7));
      var va = born * pl.vis, gold = pl.c == GOLD;
      for (var jj = 1; jj <= TAIL; jj++) {
        var sb = pl.s - jj * STEP, f2 = 1 - jj / TAIL;
        if (sb >= r.L) continue;
        at(r, Math.max(0, sb), Q); P(Q[0], Q[1], S1);
        lineC(S0[0], S0[1], S1[0], S1[1], gold ? TAILC[jj] : BLUE, .9 * f2 * f2 * va, (3.4 * f2 + .7) * size * (.4 + .6 * S1[2]), .9 * f2 * f2 * born);
        S0[0] = S1[0]; S0[1] = S1[1];
        if (sb <= 0) break;
      }
      var ha = va * (1 - gone);
      var open = clamp((pl.vis - .6) / .4);   // under glass or copy only the core shows, so nothing smears
      glow(SPR[pl.c], px0, py0, 44 * size * pz, .62 * ha * open);
      glow(SPR[pl.c], px0, py0, 15 * size * pz, .95 * ha);
      glow(gold ? CORE_GOLD : CORE, px0, py0, 5.5 * size * pz, ha);
    }

    // Arrival rings, spreading flat on the table (the table's matrix turns them into ellipses).
    for (k = rings.length - 1; k >= 0; k--) {
      var rg = rings[k]; if (dt) rg.t += dt;
      var rp = rg.t / 1.5; if (rp >= 1) { rings.splice(k, 1); continue; }
      var rad = (6 + (rg.n.ring - 6) * (1 - Math.pow(1 - rp, 3))) / (B.U * rg.n.sz);
      P(rg.n.x, rg.n.y, T0); P(rg.n.x + rad, rg.n.y, S0); P(rg.n.x, rg.n.y + rad, S1);
      ctx.save(); ctx.transform(S0[0] - T0[0], S0[1] - T0[1], S1[0] - T0[0], S1[1] - T0[1], T0[0], T0[1]);
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.2832); ctx.restore();
      ctx.globalAlpha = 1; ctx.strokeStyle = rgba(rg.c == GOLD ? AMBER : rg.c, .75 * (1 - rp)); ctx.lineWidth = 1.1; ctx.stroke();
    }

    // Cities flaring as traffic or the scan passes, and light pillars over the home cities.
    for (k = 0; k < N.length; k++) {
      n = N[k];
      var bo = still ? 1 : clamp((t - n.t) / .45);
      if (bo <= 0 || n.sy < B.fog[0]) continue;
      var z = (.4 + .6 * n.sz) * size, dim = .4 + .6 * depth(n.sz), big = n.open ? 1 : 0;
      var lift = so ? Math.exp(-Math.pow((n.y - sy - 110) / 120, 2)) * so : 0;
      if (lift > .01 && n.open) {
        if (n.k == 3) glow(CORE, n.sx, n.sy, 1.6 * z, .5 * lift * dim);
        else { glow(SPR[n.k == 1 ? GOLD : PALE], n.sx, n.sy, 11 * z, .45 * lift); glow(CORE, n.sx, n.sy, 2.6 * z, .8 * lift); }
      }
      if (n.k == 1 && n.open && !still) glow(SPR[GOLD], n.sx, n.sy, (10 + 3 * Math.sin(t * 1.7 + k)) * z, .2 + .1 * Math.sin(t * 1.7 + k));   // home cities breathe
      if (n.k == 3 && n.rev > .02) { glow(CORE, n.sx, n.sy, 1.7 * z, .7 * n.rev * dim * cover(n.sx, n.sy)); if (dt) n.rev *= Math.exp(-dt * 1.9); }
      if (n.heat > .01) {
        var hh = Math.min(1, n.heat);
        if (big) glow(SPR[n.hc], n.sx, n.sy, (n.k == 3 ? 8 : 12 + 16 * hh) * z, .85 * hh);
        if (n.k != 3) glow(n.hc == GOLD ? CORE_GOLD : CORE, n.sx, n.sy, (3.2 + 2.4 * hh) * z, hh * (big ? 1 : .45));
      }
      if (n.pill) {   // home cities: a short gold beam standing on the table, brighter as a trip leaves
        var zp = Math.max(1, z), bh = n.pill * (.55 + .45 * n.beam) * bo, ba = (.5 + .5 * n.beam) * bo * (.7 + .3 * dim);
        ctx.globalAlpha = Math.min(1, ba * .5); ctx.drawImage(BLOOM, n.sx - 3 * zp, n.sy - bh, 6 * zp, bh);
        ctx.globalAlpha = Math.min(1, ba); ctx.drawImage(BEAM, n.sx - 1, n.sy - bh, 2, bh);
        glow(SPR[GOLD], n.sx, n.sy, 7 * zp, .55 * ba);
      }
      if (dt) { n.heat *= Math.exp(-dt * 1.5); n.beam *= Math.exp(-dt * .9); }
    }
    if (dt) { for (k = 0; k < E.length; k++) E[k].heat *= Math.exp(-dt * .5); for (k = 0; k < ME.length; k++) ME[k].heat *= Math.exp(-dt * 2.2); }

    // City names, shown for a moment as a trip leaves or arrives.
    ctx.globalCompositeOperation = 'source-over';
    if (tags.length) {
      ctx.font = FONT; ctx.textBaseline = 'alphabetic';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '1.6px';
      for (k = tags.length - 1; k >= 0; k--) {
        var tg = tags[k]; if (dt) tg.t += dt;
        var ta = Math.min(1, tg.t / .5, (3.2 - tg.t) / .9); if (ta <= 0) { tg.n.lab = 0; tags.splice(k, 1); continue; }
        var home = tg.n.k == 1;
        ctx.globalAlpha = ta * .95; ctx.fillStyle = home ? '#FFE2A8' : '#C9E2FF';
        ctx.fillText(tg.s, tg.n.sx + tg.n.tx, tg.n.sy + tg.n.ty);
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    ctx.globalAlpha = 1;
  }

  var lastSvg = '';
  function render(t, dt) {
    M = pose(t); setM(M);
    var tr = M.translate(R.x, R.y).scale(1 / q).toString();
    if (tr != lastSvg) { svg.style.transform = tr; lastSvg = tr; }   // a resting camera leaves the map layer alone
    var sc = scanAt(t);
    if (sc) {
      if (wantMask != lastMask) { scan.style.webkitMaskImage = scan.style.maskImage = wantMask; lastMask = wantMask; }
      scan.style.transform = M.translate(R.x, sc.y).scale(1 / q).toString();
      scan.style.opacity = sc.o.toFixed(3);
    } else if (scan.style.opacity != '0') scan.style.opacity = '0';
    draw(t, dt);
  }

  function frame(now) {
    raf = 0;
    var dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;   // true speed down to 10 fps
    clock += dt;
    var f = 1 - Math.exp(-dt * 3); px += (tx - px) * f; py += (ty - py) * f;
    if (clock - dt < IN_FOR + .5 && clock >= IN_FOR + .5) want |= 1;   // again once fonts and layout have settled
    if (want) refresh();   // the page moved, changed or scrolled since the last frame
    if (clock >= nextPulse && pulses.length < (W < 861 ? 5 : 7)) {
      spawn(); nextPulse = clock + .7 + Math.random() * .9;
      if (clock < 3) nextPulse = clock + .45;
    }
    if (clock - dt < 2 && clock >= 2) { spawn(1); spawn(1); }   // two trips arrive in the west as the web finishes drawing
    if (clock - dt < 2.6 && clock >= 2.6) spawn(1);
    render(clock, dt);
    if (live()) raf = requestAnimationFrame(frame);
  }

  // Reduced motion: one calm, finished picture, the whole web lit and a few trips under way.
  function drawStill() {
    pulses = []; rings = []; sparks = []; tags = [];
    N.forEach(function (n) { n.lab = 0; });
    setM(build(B.th, 0, B.yaw, B.U, 0, 0));
    var seed = 11, rnd = function (n) { seed = seed * 16807 % 2147483647; return Math.floor(seed / 2147483647 * n); };
    var homes = HOME.filter(function (k) { return N[k].open; }), dests = DEST.filter(function (k) { return N[k].ring || N[k].tag; }), used = {}, trips = [];
    if (!homes.length) homes = HOME.filter(function (k) { return N[k].vis; });
    if (!dests.length) dests = DEST.filter(function (k) { return N[k].vis; });
    for (var j = 0; j < 40 && trips.length < 6 && homes.length && dests.length; j++) {
      var a = homes[rnd(homes.length)], b = dests[rnd(dests.length)], west = trips.length % 3 != 2;
      if (!west) { var sw = a; a = b; b = sw; }
      if (used[a + '>' + b]) continue; used[a + '>' + b] = 1;
      var rt = route(a, b), at0 = -1;
      for (var f = west ? .93 : .3; west ? f > .25 : f < .8; f += west ? -.04 : .04) {   // the head in open sky: near the end going west, near the start coming back
        at(rt, rt.L * f, Q); P(Q[0], Q[1], T0);
        if (cover(T0[0], T0[1]) == 1 && T0[1] > B.fog[1]) { at0 = f; break; }
      }
      if (at0 > 0) trips.push([a, b, at0, west]);
    }
    trips.forEach(function (d, j) {
      var r = route(d[0], d[1]), s = r.L * d[2], c = d[3] ? GOLD : BLUE;
      if (j < 2 && N[d[1]].ring) rings.push({ n: N[d[1]], t: .5 + .25 * j, c: c });
      pulses.push({ r: r, s: s, v: 0, c: c, hop: 99, done: 1, vis: 1, age: 9, wait: 0 });
      for (var k = 0; k < r.p.length - 1; k++) {
        var e = edgeOf(r.p[k], r.p[k + 1]);
        if (r.cum[k] < s && e) { e.heat = Math.max(e.heat, .8 * Math.exp(-Math.max(0, s - r.cum[k + 1]) / 600)); e.hc = c; }
        if (r.cum[k] < s) { N[r.p[k]].heat = Math.max(N[r.p[k]].heat, .45); N[r.p[k]].hc = c; }
      }
    });
    render(30, 0);
    pulses.forEach(function (p) { at(p.r, p.s, Q); setM(M); P(Q[0], Q[1], T0); p.vis = cover(T0[0], T0[1]); });
    var named = 0;   // a few names: the home cities in view, then where the trips are heading
    homes.concat(trips.map(function (d) { return d[1]; })).forEach(function (k) { if (named < 4 && N[k].tag && !N[k].lab) { label(k); named++; } });
    tags.forEach(function (tg) { tg.t = 1.2; });
    render(30, 0);
  }

  var visible = !document.hidden, onscreen = true, queued = 0;
  function live() { return !still && visible && onscreen && W > 0; }
  function kick() { if (live() && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function relayout() {
    queued = 0;
    if (!layout()) return;
    want = 0; measure(); place();
    if (still) drawStill(); else if (!raf) render(clock, 0);
    kick();
  }
  // Page changes (1) and scrolling (2) are picked up by the next frame, once per frame however
  // often they are reported. The reduced-motion picture is redrawn once things come to rest.
  var want = 0, stillT = 0;
  function refresh() { var w = want; want = 0; if (w & 1) measure(); place(); }
  function soon(k) {
    want |= k;
    if (still && W) { clearTimeout(stillT); stillT = setTimeout(function () { if (want) { refresh(); drawStill(); } }, want & 1 ? 60 : 250); }
  }
  window.dvNet = { relayout: function () { soon(1); }, time: function () { return clock; } };
  relayout();
  window.addEventListener('scroll', function () { soon(2); }, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(function () { if (!queued) { queued = 1; requestAnimationFrame(relayout); } }).observe(map);
  else window.addEventListener('resize', relayout);
  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
    kick();
  });
  if (window.IntersectionObserver) new IntersectionObserver(function (en) {
    onscreen = en[en.length - 1].isIntersecting;
    if (!onscreen && raf) { cancelAnimationFrame(raf); raf = 0; }
    kick();
  }).observe(map);
  if (fine) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType != 'mouse') return;
      tx = e.clientX / window.innerWidth * 2 - 1; ty = e.clientY / window.innerHeight * 2 - 1;
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { tx = ty = 0; });
  }
})();
