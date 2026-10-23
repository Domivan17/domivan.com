/* domivan.com in the browser: one page that never reloads.
 *
 * Router: links to the site's own pages in another language (and New trip from a page that
 * isn't home) fetch the next page and swap only <main id="page">: the old page slides out to
 * the left and the new one in from the right (the other way on Back). The header and the
 * night map behind everything (.backdrop) are never redrawn, so the map keeps moving. Any
 * problem falls back to a normal page load. Links to /join and the legal pages open them as
 * panels instead (below); opened directly, they are pages as before.
 *
 * Panels, like the client app: the app's menu (New trip, My trips, Profile) floats at the
 * bottom, and My trips, Profile, Join Transporters, the legal pages and Help slide in as a
 * panel over the page (on computers a frame on the right, on phones the whole screen under the
 * header); their steps slide sideways inside it. The panel is the account card: Log in /
 * Create account, or Profile once signed in (#login), its steps (#login/details, ...), My trips
 * (#trips) and one trip (#trips/<id>), Join Transporters (#join) and the legal pages (#terms,
 * ...). Google and Apple go through Supabase's PKCE redirect, email through a one-time code.
 * The session is stored where supabase-js keeps it, so /book is signed in too. The header
 * button (Log in, or the first name) opens Profile, and closes it again.
 *
 * Phones (the one-column layout) open like the app: a signed-out visitor sees the account
 * card in the home page's spot first, and Book your trip and the menu once signed in.
 *
 * Booking (home): Book your trip prices the trip, takes the payment (Stripe's Payment Element)
 * and confirms it inside the card; each step slides in and the page never changes. The account
 * card slides over it when a signed-out visitor goes to pay.
 *
 * Page modules: the booking card (home) and the Join Transporters form, started once for
 * each page as it is shown.
 *
 * Invite links: a VIT partner's QR code (domivan.com/r/CODE, sent home as ?r=CODE by 404.html)
 * shows an invite panel on the home page and keeps the code until the visitor signs in, applies
 * to drive or downloads the DomiVan Driver app (see "invite links" below).
 *
 * Background: hero-net.js draws the live network over the night map and keeps its lights off
 * the copy and the cards. It is told (dvNet.relayout) whenever a page or card slides in or out.
 *
 * Hand-written, no build step. Strings come from each page (#dv-t, built by
 * scripts/build-site.py from scripts/account_strings.py, book_strings.py and trips_strings.py).
 */
// Never inside another site's frame (clickjacking): GitHub Pages can't send frame-ancestors.
if (top !== self) top.location = location;
(function () {
  'use strict';

  var SB = 'https://htegjzxfspdaclcvfjfl.supabase.co';
  var KEY = 'sb_publishable_2spxK11Ldq3pj2EjJeoPbw_TVsZuKnL'; // public key, same as the apps
  var STORE = 'sb-htegjzxfspdaclcvfjfl-auth-token';             // where supabase-js v2 keeps the session
  var PKCE = 'domivan-pkce', NAME = 'domivan-name', DRAFT = 'domivan-join-draft';
  var REF = 'domivan-referral'; // a VIT invite code, same key as the apps (src/lib/referral.ts)
  // name@domain.tld, with no empty parts (no '..', no dot at either end).
  var EMAIL_RE = /^[^@\s.]+(?:\.[^@\s.]+)*@[^@\s.]+(?:\.[^@\s.]+)+$/;
  var EASE = 'cubic-bezier(.22, .8, .24, 1)';
  // Phones: the one-column layout (landing.css). The home page opens on Log in / Create account
  // there. The Transporters buttons go to the driver app's store page instead of /join on phones
  // and on touch screens too short for the one-column layout (a big phone turned sideways).
  var PHONE = window.matchMedia('(max-width: 860px)');
  var HANDHELD = window.matchMedia('(max-width: 860px), (pointer: coarse) and (max-height: 500px)');
  var DRIVER_APP = {
    live: false,  // false: every button keeps /join (Join Transporters). True once both store pages are public (404 on 2026-10-21)
    ios: 'https://apps.apple.com/app/id6823771794',                        // iPhone and iPad
    android: 'https://play.google.com/store/apps/details?id=eu.domivan.driver'
  };
  var d = document, root = d.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------------------------------------------------------------- helpers

  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function noop() {}
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fill(s, v) { return String(s || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    json: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  };
  function moves() { return !!Element.prototype.animate; }
  function calm() { return reduced.matches; }
  // Scroll without the smooth scrolling the stylesheet asks for. 'instant' overrides the
  // stylesheet; the style flush covers browsers that don't know it (Chromium skips the
  // style update for scrollTo(0, 0), so the inline style alone isn't enough).
  function jump(y) {
    var b = root.style.scrollBehavior, top = Math.max(0, y || 0);
    root.style.scrollBehavior = 'auto';
    void getComputedStyle(root).scrollBehavior;
    try { window.scrollTo({ top: top, left: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, top); }
    root.style.scrollBehavior = b;
  }
  function headerH() { var h = $('.top'); return h ? h.offsetHeight : 64; }
  function readT(doc) { try { return JSON.parse(doc.getElementById('dv-t').textContent); } catch (e) { return {}; } }
  var T = readT(d);

  // ---------------------------------------------------------------- slides

  // The network over the night map (hero-net.js) measures the copy and cards again on its next
  // frame. Called as a slide starts (it measures pages where they will come to rest) and ends.
  function relayoutMap() { if (window.dvNet) window.dvNet.relayout(); }

  function setOn(el, on) {
    el.classList.toggle('off', !on);
    if (on) { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
    else { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
  }

  // The box eases from height h0 to its new one (the home page's spot on phones, where the
  // account card stands alone before signing in and is shorter than Book your trip).
  function fit(box, h0, o) {
    var h1 = box.offsetHeight;
    if (h0 == null || Math.abs(h1 - h0) < 2 || !moves() || calm()) return null;
    return box.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], o || { duration: 460, easing: EASE });
  }

  // Two children of one grid cell (the Book and Account cards, the account card's steps):
  // the old one slides out to the left while the new one comes in from the right (dir 1),
  // or the other way (dir -1). Both keep the cell's size, so nothing around them jumps.
  // With h0 (a cell that takes the height of what it shows: the account card standing alone on
  // a phone), the old one is lifted out of the flow and the cell eases from h0 to the new height.
  function swap(box, from, to, dir, instant, done, h0) {
    if (box._end) box._end();
    setOn(to, true);
    box._front = to;
    relayoutMap();
    if (!from || from === to) return;
    if (instant || !moves()) { setOn(from, false); if (done) done(); return; }
    var c = calm(), o = { duration: c ? 200 : 460, easing: EASE }, x = dir * 100, lift = h0 != null && !c, fs = from.style;
    if (lift) { fs.position = 'absolute'; fs.top = fs.left = fs.right = '0'; box.classList.add('fitting'); }
    var h = lift ? fit(box, h0, o) : null;
    var a = from.animate(c ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: 'none', opacity: 1 }, { transform: 'translateX(' + -x + '%)', opacity: 0 }], o);
    var b = to.animate(c ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: 'translateX(' + x + '%)', opacity: 0 }, { transform: 'none', opacity: 1 }], o);
    box.classList.add('sliding');
    var end = function () {
      if (box._end !== end) return;
      box._end = null; a.cancel(); b.cancel();
      if (h) h.cancel();
      if (lift) { fs.position = fs.top = fs.left = fs.right = ''; box.classList.remove('fitting'); }
      box.classList.remove('sliding');
      setOn(from, false);
      if (done) done();
      relayoutMap();
    };
    box._end = end;
    b.onfinish = end;
  }

  // Whole screens in #stage: the page that is leaving is pinned where it is and slides
  // away while the next one slides in. y is where to scroll to (a number, or a function
  // run once the next screen is in place).
  var stage, screen, page, slideEnd = null;
  function slideScreen(from, to, dir, y, after) {
    if (slideEnd) slideEnd();
    if (from === to) return;
    var top = from.getBoundingClientRect().top, a = null, b = null;
    stage.appendChild(to);
    screen = to;
    var end = function () {
      if (slideEnd !== end) return;
      slideEnd = null;
      if (a) a.cancel();
      if (b) b.cancel();
      from.classList.remove('leaving');
      from.style.top = '';
      if (from !== screen && from.parentNode) from.parentNode.removeChild(from);
      if (after) after();
      relayoutMap();
    };
    slideEnd = end;
    var instant = !dir || !moves();
    if (!instant) { from.classList.add('leaving'); from.style.top = top + 'px'; }
    jump(typeof y === 'function' ? y() : y);
    relayoutMap();
    if (instant) return end();
    var c = calm(), w = window.innerWidth, o = { duration: c ? 220 : 520, easing: EASE };
    a = from.animate(c ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: 'none', opacity: 1 }, { transform: 'translateX(' + -dir * w + 'px)', opacity: 0.15 }], o);
    b = to.animate(c ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: 'translateX(' + dir * w + 'px)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], o);
    b.onfinish = end;
  }

  // ---------------------------------------------------------------- prices
  //
  // A copy of supabase/functions/_shared/pricing.ts. create-order prices the trip again on the
  // server and that is what the client pays; this is the preview. Change both together.

  // The 27 EU members, the UK and Switzerland, either end, the same country included (except NO_DOMESTIC_CC).
  var SERVED_CC = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH'];
  // No trip may start and end inside these (NO_DOMESTIC_TRIPS): the Netherlands needs a taxi licence for it.
  var NO_DOMESTIC_CC = ['NL'];
  var MIN_KM = 100;
  var RATES = { road: 1.28, surcharge: { GB: 30, CH: 10 }, bag: 10, round: 5, fee: 359 };
  var VANS = ['standard', 'large', 'luxury'];
  var VAN = { standard: { max: 8, km: 0.08 }, large: { max: 20, km: 0.11 }, luxury: { max: 16, km: 0.17 } };

  function inList(list, c) { return list.indexOf(String(c).toUpperCase()) >= 0; }
  function routeOk(a, b) { return inList(SERVED_CC, a.country) && inList(SERVED_CC, b.country); }
  function domesticClosed(a, b) {
    var x = String(a.country).toUpperCase();
    return x === String(b.country).toUpperCase() && inList(NO_DOMESTIC_CC, x);
  }
  function toRad(x) { return (x * Math.PI) / 180; }
  function roadKm(a, b) {
    var dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var sLat = Math.sin(dLat / 2), sLng = Math.sin(dLng / 2); // not **: older Safari can't parse it
    var h = sLat * sLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sLng * sLng;
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * RATES.road);
  }
  // UK and Switzerland cost extra at either end, but not for a trip inside one of them.
  function surcharge(a, b) {
    var x = String(a.country).toUpperCase(), y = String(b.country).toUpperCase();
    return x === y ? 0 : Math.max(RATES.surcharge[x] || 0, RATES.surcharge[y] || 0);
  }
  function quote(a, b, pax, bags, van) {
    var km = roadKm(a, b);
    var per = VAN[van].km * km + surcharge(a, b);
    var raw = per * pax + RATES.bag * bags;
    return { km: km, cents: Math.max(RATES.round, Math.round(raw / RATES.round) * RATES.round) * 100 + RATES.fee };
  }

  // Euros, dates and countries the way the page's language writes them.
  function locale(lang) { return lang === 'en' ? 'en-GB' : lang === 'pt' ? 'pt-PT' : lang; }
  function money(cents, lang) {
    var f = cents % 100 ? 2 : 0;
    try {
      return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'EUR', currencyDisplay: 'narrowSymbol', minimumFractionDigits: f, maximumFractionDigits: f }).format(cents / 100);
    } catch (e) { return '€' + (cents / 100).toFixed(f); }
  }

  // Times. A pickup is entered and shown on the pickup's own clock, as in the apps
  // (src/lib/format.ts): 08:00 in Bucharest is 08:00 in Bucharest, also for a visitor in Berlin,
  // with " (GMT+3)" after it when the visitor's clock differs then. The zones and their clocks
  // are the apps' own: site/zones.js (window.DvZones), built from
  // supabase/functions/_shared/zones.ts by scripts/make-site-zones.mjs and loaded before this
  // script. Other moments (until when a problem can be reported, when a cancellation gets
  // dearer) are on the visitor's own clock. Only clockText writes a moment down
  // (scripts/check-time-zones.mjs).
  var Z = window.DvZones || null; // missing only if zones.js didn't load: pickups then go by the visitor's clock
  var DATE_TIME = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  var TIME = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  // A moment in the page's language, on a zone's clock or (zone null) on the visitor's own.
  function clockText(t, zone, parts, lang) {
    if (zone && Z) return Z.wallText(Z.wallAt(zone, t), parts, locale(lang));
    try {
      return new Intl.DateTimeFormat(locale(lang), Object.assign({}, parts, { timeZone: undefined })).format(t);
    } catch (e) { return t.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }
  }
  function dateText(t, lang) { return clockText(t, null, DATE_TIME, lang); }
  // A pickup's zone: a place's (from the address search), or the one a trip keeps (my_trips()).
  function placeZone(p) { return Z && p ? Z.tripZone(p.country, p.lat, p.lng) : null; }
  function tripZoneOf(o) { return Z ? o.pickup_tz || Z.tripZone(o.pickup_country) : null; }
  // A pickup on its own clock, "Mon 2 Nov, 07:30", and a Book-ahead pickup's 2-hour window from
  // the time chosen (as in the apps: PICKUP_WINDOW_HOURS in src/lib/format.ts),
  // "Mon 2 Nov, 07:30–09:30"; " (GMT+3)" after it when the visitor's clock differs.
  var WINDOW_MS = 2 * 3600e3;
  function pickupText(from, until, zone, lang) {
    return clockText(from, zone, DATE_TIME, lang) + (until ? '–' + clockText(until, zone, TIME, lang) : '')
      + (zone && Z ? Z.zoneNote(from, zone) : '');
  }
  function countryName(cc, lang) {
    try { return new Intl.DisplayNames([locale(lang)], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; }
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  // The value of a datetime-local field: a clock reading, on no clock in particular
  // ({ year, month, day, hour, minute }, as zones.js), and back.
  function wallDT(x) { return x.year + '-' + pad2(x.month) + '-' + pad2(x.day) + 'T' + pad2(x.hour) + ':' + pad2(x.minute); }
  function parseDT(v) {
    var m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/.exec(v || '');
    if (!m) return null;
    var x = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
    var t = new Date(Date.UTC(x.year, x.month - 1, x.day, x.hour, x.minute));
    return t.getUTCMonth() === x.month - 1 && t.getUTCDate() === x.day && t.getUTCHours() === x.hour ? x : null;
  }
  // The moment a reading stands for on the pickup's clock (the visitor's without a zone).
  function wallMoment(x, zone) {
    return zone && Z ? Z.wallToDate(zone, x) : new Date(x.year, x.month - 1, x.day, x.hour, x.minute);
  }
  // What a zone's clocks (the visitor's without one) show at a moment.
  function wallOf(t, zone) {
    return zone && Z ? Z.wallAt(zone, t)
      : { year: t.getFullYear(), month: t.getMonth() + 1, day: t.getDate(), hour: t.getHours(), minute: t.getMinutes() };
  }

  // ---------------------------------------------------------------- address search
  //
  // The same search as the apps (src/lib/place-search.ts): Photon while the visitor types (towns,
  // streets with numbers, postcodes, typos forgiven), Nominatim when Photon finds nothing. Both
  // are OpenStreetMap based and need no key.

  var EUROPE = { west: -25, south: 27, east: 45, north: 72 };
  var PLACE_TYPES = ['city', 'town', 'village', 'locality', 'district'];
  // The first of its arguments that is set (?? in the apps' code).
  function pick() { for (var i = 0; i < arguments.length; i++) if (arguments[i] != null) return arguments[i]; }

  function fromPhoton(f) {
    var p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
    if (!p.countrycode || !c) return null;
    var isPlace = PLACE_TYPES.indexOf(p.type) >= 0;
    var city = pick(isPlace ? p.name : pick(p.city, p.locality, p.district), p.county, p.state, p.name, '');
    var street = p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : '';
    var parts = [
      p.name && [p.street, p.postcode, city].indexOf(p.name) < 0 ? p.name : '',
      street,
      [p.postcode, city].filter(Boolean).join(' '),
      isPlace || !city ? pick(p.county, p.state) : '',
      p.country
    ];
    var label = parts.filter(function (s, i) { return s && parts.indexOf(s) === i; }).join(', ');
    return { label: label, address: label, city: city, country: p.countrycode.toUpperCase(), lat: c[1], lng: c[0] };
  }
  function searchPlaces(q, signal) {
    var E = EUROPE, url = 'https://photon.komoot.io/api/?limit=6&lang=en&bbox=' + [E.west, E.south, E.east, E.north].join(',') + '&q=' + encodeURIComponent(q);
    return fetch(url, { headers: { Accept: 'application/json' }, signal: signal }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var seen = {};
      return (j.features || []).map(fromPhoton).filter(function (s) {
        if (!s || seen[s.label]) return false;
        seen[s.label] = 1;
        return true;
      });
    });
  }
  function searchNominatim(q) {
    var E = EUROPE;
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&accept-language=en&viewbox='
      + [E.west, E.north, E.east, E.south].join(',') + '&bounded=1&q=' + encodeURIComponent(q);
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (rows) {
      var hit = rows && rows[0], a = (hit && hit.address) || {};
      if (!hit || !a.country_code) return null;
      return {
        address: q, city: pick(a.city, a.town, a.village, a.municipality, a.county, a.state, q),
        country: a.country_code.toUpperCase(), lat: parseFloat(hit.lat), lng: parseFloat(hit.lon)
      };
    });
  }
  // Best match for typed text the visitor didn't pick from the suggestions: null when neither
  // service knows it, an error when neither answered.
  function findPlace(q) {
    var down = 0;
    return searchPlaces(q).then(function (r) { return r[0] ? Object.assign({}, r[0], { address: q }) : null; }, function () { down++; return null; })
      .then(function (p) { return p || searchNominatim(q).catch(function () { down++; return null; }); })
      .then(function (p) { if (!p && down === 2) throw new Error('Address search is down'); return p; });
  }

  // My location, as in the apps (src/lib/my-location.ts): the browser's position, read once when
  // the visitor picks the row, becomes the address Photon finds there. A vague position (over
  // 200 m: try again, or type) or one outside Europe goes nowhere; Photon gets the point rounded
  // to about 10 m. The place fills the field like a picked suggestion, and the price checks it
  // like any other (routeOk, domesticClosed). Nothing keeps the position, except that a booked
  // trip keeps that point as its pickup or destination. Browsers give it only on https (and
  // localhost). Answers { place } or { problem }, never fails.
  var HERE_OK = !!(window.isSecureContext && navigator.geolocation);
  var HERE_TEXT = {
    denied: 'here_denied', blocked: 'here_blocked', vague: 'here_vague', timeout: 'here_timeout',
    unavailable: 'here_unavailable', busy: 'err_search', not_found: 'here_not_found', not_served: 'here_not_served'
  };
  function hereRound(v) { return Math.round(v * 1e4) / 1e4; }
  // What the browser says about location for the site: 'granted', 'prompt', 'denied', or '' when it doesn't tell.
  function geoState() {
    try {
      return navigator.permissions.query({ name: 'geolocation' }).then(function (p) { return p.state; }, function () { return ''; });
    } catch (e) { return Promise.resolve(''); }
  }
  // What Photon names at a point: the nearest house or street, else the nearest named place (a
  // village), as addressAt in the apps (src/lib/place-search.ts).
  function reverseAt(lat, lng, layers) {
    return fetch('https://photon.komoot.io/reverse?lat=' + lat + '&lon=' + lng + '&lang=en&limit=1' + layers, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        var s = j.features && j.features[0] ? fromPhoton(j.features[0]) : null;
        return s && { address: s.label, city: s.city, country: s.country, lat: lat, lng: lng };
      });
  }
  function addressAt(lat, lng) {
    return reverseAt(lat, lng, '&layer=house&layer=street').then(function (p) { return p || reverseAt(lat, lng, ''); });
  }
  function placeHere() {
    return geoState().then(function (state) {
      if (state === 'denied') return { problem: 'blocked' };
      return new Promise(function (done) {
        navigator.geolocation.getCurrentPosition(function (p) { done(p.coords); }, function (e) {
          if (e.code !== 1) return done({ problem: e.code === 3 ? 'timeout' : 'unavailable' });
          // A closed prompt can come again; Block only through the site settings.
          geoState().then(function (s) { done({ problem: s === 'denied' ? 'blocked' : 'denied' }); });
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
      });
    }).then(function (c) {
      if (c.problem) return c;
      if (c.accuracy > 200) return { problem: 'vague' };
      var lat = hereRound(c.latitude), lng = hereRound(c.longitude), E = EUROPE;
      if (lng < E.west || lng > E.east || lat < E.south || lat > E.north) return { problem: 'not_served' };
      return addressAt(lat, lng).then(function (p) {
        return !p ? { problem: 'not_found' } : inList(SERVED_CC, p.country) ? { place: p } : { problem: 'not_served' };
      }, function () { return { problem: 'busy' }; });
    }).catch(function () { return { problem: 'unavailable' }; });
  }
  var HERE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.9"/>'
    + '<circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';

  // Suggestions under an address field while the visitor types (a combobox: arrows, Enter, Escape).
  // Picking one keeps that exact place on the field (input._place); typing again drops it.
  // With HERE_OK, the first row while the field has the focus is My location; what stops it
  // goes to the form as a dv-here event (its detail the text, '' to clear it).
  var sgN = 0;
  function Suggest(input) {
    var label = input.closest('label'), box = d.createElement('div'), list = d.createElement('ul'), id = 'sg' + (++sgN);
    var items = [], shown = [], active = -1, timer = 0, ctl = null, seq = 0;
    // My location's row, and its answer only while nothing was typed since it was asked for.
    var here = HERE_OK ? { here: true } : null, locating = false, hereN = 0;
    box.className = 'af';
    label.parentNode.insertBefore(box, label);
    box.appendChild(label);
    box.appendChild(list);
    list.className = 'sugg';
    list.id = id;
    list.hidden = true;
    list.setAttribute('role', 'listbox');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id);
    input.setAttribute('autocomplete', 'off'); // the browser's own list would cover ours

    function close() {
      list.hidden = true;
      active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function render() {
      shown = (here && (locating || d.activeElement === input) ? [here] : []).concat(items);
      list.innerHTML = shown.map(function (s, i) {
        var a = '<li role="option" id="' + id + '-' + i + '" aria-selected="false" data-i="' + i + '"';
        if (s.here) return a + ' class="here' + (locating ? ' busy' : '') + '"><b>' + HERE_ICON + esc(locating ? T.here_finding : T.here_row) + '</b></li>';
        var parts = s.label.split(', ');
        return a + '><b>' + esc(parts[0]) + '</b>'
          + (parts.length > 1 ? '<span>' + esc(parts.slice(1).join(', ')) + '</span>' : '') + '</li>';
      }).join('');
      active = -1;
      list.hidden = !shown.length;
      input.setAttribute('aria-expanded', shown.length ? 'true' : 'false');
    }
    function mark(i) {
      active = i;
      $$('li', list).forEach(function (li, j) { li.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', id + '-' + i);
    }
    function choose(i) {
      var s = shown[i];
      if (!s) return;
      if (s.here) return locate();
      input.value = s.label;
      input._place = s;
      close();
      input.dispatchEvent(new CustomEvent('dv-pick', { bubbles: true }));
    }
    function tell(text) { input.dispatchEvent(new CustomEvent('dv-here', { bubbles: true, detail: text })); }
    function locate() {
      if (locating) return;
      var n = ++hereN;
      locating = true;
      render();
      tell('');
      placeHere().then(function (r) {
        if (n !== hereN) return;
        locating = false;
        if (!r.place) {
          render();
          return tell(T[HERE_TEXT[r.problem]] || T.here_unavailable);
        }
        input.value = r.place.address;
        input._place = r.place;
        items = [];
        close();
        // A new trip for the form (edited) and its clock (the pickup's zone).
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new CustomEvent('dv-pick', { bubbles: true }));
      });
    }
    input.addEventListener('focus', function () {
      if (input._place) items = [];
      if (here) render();
    });
    input.addEventListener('input', function () {
      input._place = null;
      hereN++;
      locating = false;
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 3) { seq++; items = []; return here ? render() : close(); }
      timer = setTimeout(function () {
        var n = ++seq;
        if (ctl) ctl.abort();
        ctl = window.AbortController ? new AbortController() : null;
        searchPlaces(q, ctl ? ctl.signal : undefined).then(function (r) {
          if (n !== seq || d.activeElement !== input) return;
          items = r.slice(0, 5);
          render();
        }, noop);
      }, 220);
    });
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      var n = shown.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        mark(e.key === 'ArrowDown' ? (active + 1) % n : active <= 0 ? n - 1 : active - 1);
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        choose(active);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // only the list closes
        close();
      }
    });
    input.addEventListener('blur', function () { setTimeout(function () { if (!locating) close(); }, 120); });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); }); // the field keeps the focus (and a phone its keyboard)
    list.addEventListener('click', function (e) { var li = e.target.closest('li'); if (li) choose(+li.dataset.i); });
    return { close: close };
  }

  // ---------------------------------------------------------------- payments (Stripe)

  // Stripe's public key, the apps' one: scripts/build-site.py writes it here from src/lib/stripe-key.json.
  var STRIPE_PK = 'pk_test_51USkYXBQ58pih65E3U9JgtzJPXb0VOpqTMhlb4Ui5ajjJ2pDU8pntJlb97HAkHWuK2CFEeDrvK5rUZoWll2Dam1G00RNAqvZsm';
  // Stripe's Payment Element in the card's colours: dark fields, the site's blue.
  var APPEARANCE = {
    theme: 'night',
    variables: {
      colorPrimary: '#0064D2', colorBackground: '#18213A', colorText: '#FFFFFF', colorTextSecondary: '#C3CEDF',
      colorTextPlaceholder: '#8996AC', colorIcon: '#C3CEDF', colorDanger: '#FFB4A8',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      fontSizeBase: '16px', borderRadius: '12px', spacingUnit: '4px'
    },
    rules: {
      '.Input': { border: '1.5px solid #34405A', boxShadow: 'none' },
      '.Input:focus': { border: '1.5px solid #8CBDF5', boxShadow: 'none' },
      '.Input--invalid': { border: '1.5px solid #FF9B8A' },
      '.Label': { fontSize: '12.5px', fontWeight: '700', color: '#C3CEDF' },
      '.Tab': { border: '1.5px solid #34405A', backgroundColor: '#18213A', boxShadow: 'none' },
      '.Tab--selected': { border: '1.5px solid #8CBDF5', backgroundColor: '#1E2A4A' }
    }
  };
  // The browser's country (pl-PL: PL), or undefined. create-order adds the local payment methods
  // of that country (Bancontact in Belgium, Bizum in Spain...) to those of the trip's countries.
  function browserCountry() {
    var langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    for (var i = 0; i < langs.length; i++) {
      var m = /^[a-z]{2,3}-([a-z]{2})/i.exec(langs[i] || '');
      if (m) return m[1].toUpperCase();
    }
    return undefined;
  }
  // Stripe.js has to come from js.stripe.com. Fetched once, when a price is first shown.
  var stripeReq = null;
  function loadStripe() {
    if (!stripeReq) {
      stripeReq = new Promise(function (ok, no) {
        var ready = function () { if (window.Stripe) ok(window.Stripe(STRIPE_PK)); else no(new Error('No Stripe.js')); };
        if (window.Stripe) return ready();
        var s = d.createElement('script');
        s.src = 'https://js.stripe.com/v3/';
        s.onload = ready;
        s.onerror = function () { s.remove(); no(new Error('Stripe.js did not load')); };
        d.head.appendChild(s);
      });
      stripeReq.catch(function () { stripeReq = null; }); // the next try fetches it again
    }
    return stripeReq;
  }

  // A booking or cancellation function that did not run at all (not deployed: 404; did not
  // start: a 5xx without the function's own { error }) can't report itself: the page tells
  // the Admin app, once per kind, with nothing about the visitor (report_function_failure).
  var fnFailures = {};
  function reportFnFailure(name, status, j) {
    if (name !== 'create-order' && name !== 'cancel-order') return;
    if (j.error || !(status === 404 || status >= 500)) return;
    var code = typeof j.code === 'string' ? j.code : null, key = name + status + code;
    if (fnFailures[key]) return;
    fnFailures[key] = 1;
    fetch(SB + '/rest/v1/rpc/report_function_failure', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_app: 'website', p_platform: 'web', p_version: null, p_function: name, p_status: status, p_code: code })
    }).catch(function () {});
  }

  // POST to one of the project's edge functions as the signed-in visitor.
  function callFn(name, body, token) {
    return fetch(SB + '/functions/v1/' + name, {
      method: 'POST', body: JSON.stringify(body),
      headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch (e) {}
        if (r.ok) return j;
        reportFnFailure(name, r.status, j);
        var e = new Error(j.error || 'HTTP ' + r.status);
        e.status = r.status;
        e.code = j.code;
        e.params = j.params;
        // create-order's booking_exists names the trip already booked (in params, or on its own).
        e.orderId = (j.params && j.params.orderId) || j.orderId || null;
        throw e;
      });
    });
  }
  function busyBtn(btn, on, label) {
    if (on) {
      if (btn._label == null) btn._label = btn.textContent;
      btn.disabled = true; btn.classList.add('busy');
      if (label) btn.textContent = label;
    } else if (btn._label != null) {
      btn.disabled = false; btn.classList.remove('busy');
      btn.textContent = btn._label; btn._label = null;
    }
  }

  // ---------------------------------------------------------------- booking card (home)
  //
  // Book your trip books the whole trip in place: its steps slide inside the card (trip, price,
  // payment, booked) and the page never changes. Paying needs an account: signed out, "Log in to
  // pay" slides the account card over it, and the payment step is ready behind it by the time it
  // slides back. Each step is a history entry, so Back goes one step back. While the visitor is
  // away at Google, Apple or their bank, the trip waits in sessionStorage (TRIP).

  var TRIP = 'domivan-trip';
  var tripStore = {
    get: function () { try { return JSON.parse(sessionStorage.getItem(TRIP)); } catch (e) { return null; } },
    set: function (v) { try { sessionStorage.setItem(TRIP, JSON.stringify(v)); } catch (e) {} },
    del: function () { try { sessionStorage.removeItem(TRIP); } catch (e) {} }
  };
  var STEPS = { trip: 0, price: 1, pay: 2, done: 3 };
  var IC = {
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    pax: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="14" height="12.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M9.5 7V4.6h5V7M9 19.5v1.6M15 19.5v1.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    km: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c3-1 3-6 7-7s4-6 7-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-dasharray="2.2 3"/><circle cx="5" cy="19" r="2" fill="currentColor"/><circle cx="19" cy="5" r="2" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h7.5l4.5 4.5v12.5h-12z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M14 3.5V8h4.5M9.5 12.5h5.5M9.5 16h5.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
  };
  // Set by start() before the home page's card starts: back from the bank (?booked=...), or from
  // Google or Apple.
  var stripeBack = null, oauthBack = false;

  function Book(card, main) {
    var L = T, f = $('form.bk-trip', card), el = f.elements, panes = $('.panes', card), h2 = $('h2', card);
    var title0 = h2.textContent, P = { trip: f }, cur = f, step = 'trip';
    var trip = null, van = 'standard', prefer = null, order = null, dirty = false, ed = 0;
    var stripe = null, els = null, pe = null, busy = false, paying = false, wantPay = false, afterLogin = null, forgetting = false;
    f.noValidate = true; // our own messages, in the page's language

    // The back arrow in the card's header row, shown after the first step.
    var back = d.createElement('button');
    back.type = 'button';
    back.className = 'back-btn';
    back.title = L.back;
    back.setAttribute('aria-label', L.back);
    back.innerHTML = CHEV;
    h2.parentNode.insertBefore(back, h2.parentNode.firstChild);
    h2.setAttribute('tabindex', '-1');

    function pane(name, html) {
      var p = d.createElement('div');
      p.className = 'pane bk-' + name;
      p.dataset.pane = name;
      p.innerHTML = html;
      setOn(p, false);
      panes.appendChild(p);
      return (P[name] = p);
    }
    function leg(k, cls) {
      return '<div class="leg"><span class="' + cls + '" aria-hidden="true"></span><p><b class="' + k + '-city"></b><span class="' + k + '-addr"></span></p></div>';
    }
    pane('price', '<div class="book-body">'
      + '<div class="trip-sum"><div class="legs">' + leg('a', 'start') + leg('b', 'ring') + '</div><p class="facts"></p></div>'
      + '<fieldset class="vpick"><legend><small>' + esc(L.van_h) + '</small></legend><div class="vopts">' + VANS.map(function (v) {
        return '<label class="vopt ' + v + '"><input type="radio" name="van" value="' + v + '"><b>' + esc(L['v_' + v]) + '</b><span class="vprice"></span></label>';
      }).join('') + '</div><p class="vcap"></p></fieldset>'
      + '<label class="notes"><small>' + esc(L.note_label) + '</small><input name="notes" maxlength="500" autocomplete="off" placeholder="' + esc(L.ph_note) + '"></label>'
      + '<div class="msg" role="alert"></div>'
      + '</div><div class="book-foot"><p class="total"><span>' + esc(L.total) + '</span><b></b></p>'
      + '<button class="btn big go" type="button"></button><p class="fine"></p></div>');
    pane('pay', '<div class="book-body">'
      + '<div class="pay-sum"><p class="ps-route"></p><b class="ps-price"></b></div><p class="ps-off" hidden></p>'
      + '<div class="pe-box"><div class="pe"></div><span class="spin" aria-hidden="true"></span></div>'
      + '<div class="msg" role="alert"></div>'
      + '</div><div class="book-foot"><button class="btn big go" type="button"></button><p class="secure">' + IC.lock + '<span>' + esc(L.secure) + '</span></p></div>');
    pane('done', '<div class="book-body">'
      + '<div class="done-top"><span class="tick" aria-hidden="true">' + IC.ok + '</span><h3>' + esc(L.done_h) + '</h3><p class="done-p"></p></div>'
      + '<dl class="done-sum"></dl>'
      + '</div><div class="book-foot"><a class="btn big" href="#trips">' + esc(L.my_trips) + '</a><button type="button" class="btn ghost another">' + esc(L.another) + '</button></div>');
    var notes = $('[name=notes]', P.price), priceBtn = $('.go', P.price), payBtn = $('.go', P.pay);

    function msg(p, text, input) {
      $('.msg', p).textContent = text || '';
      $$('[aria-invalid]', p).forEach(function (i) { i.removeAttribute('aria-invalid'); });
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus({ preventScroll: true }); }
    }

    // ---- step 1: the trip
    // The pickup time is a reading on the pickup's clock (08:00 tomorrow to start with).
    var when = el.when;
    function morning() {
      var t0 = wallOf(new Date(Date.now() + 864e5), null);
      when.value = wallDT({ year: t0.year, month: t0.month, day: t0.day, hour: 8, minute: 0 });
      when.min = wallDT(wallOf(new Date(), null));
    }
    morning();
    // Under it, once the pickup is known and the visitor's clock differs then: whose clock it
    // is ("Local time in Romania (GMT+3)."), as in the app.
    var zoneNote = d.createElement('p');
    zoneNote.className = 'bags-note zone-note';
    zoneNote.hidden = true;
    when.parentNode.parentNode.insertBefore(zoneNote, when.parentNode.nextSibling);
    function clockNote() {
      var p = el.from._place, zone = placeZone(p), x = parseDT(when.value), at = zone && x ? wallMoment(x, zone) : null;
      var gmt = at ? Z.zoneOffset(zone, at) : 0, show = !!at && el.kind.value !== 'live' && gmt !== -at.getTimezoneOffset();
      zoneNote.hidden = !show;
      zoneNote.textContent = show ? fill(L.zone_note, { country: countryName(p.country, L.lang), gmt: Z.gmtLabel(gmt) }) : '';
      if (zone) when.min = wallDT(wallOf(new Date(), zone)); // the pickup's today
    }
    var sync = function () { card.classList.toggle('is-live', el.kind.value === 'live'); clockNote(); };
    f.addEventListener('change', sync);
    f.addEventListener('input', clockNote);
    f.addEventListener('dv-pick', clockNote);
    sync();
    // Every change to the trip: the price shown is no longer for this form.
    function edited() { dirty = true; ed++; }
    f.addEventListener('input', edited);
    f.addEventListener('change', edited);
    $('.swap', f).addEventListener('click', function () {
      var a = el.from, b = el.to, v = a.value, p = a._place;
      a.value = b.value; b.value = v;
      a._place = b._place; b._place = p;
      edited();
      clockNote();
      msg(f, '');
    });
    $$('[data-step]', f).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = b.parentNode.querySelector('input');
        i.value = Math.min(+i.max, Math.max(+i.min, (+i.value || 0) + +b.dataset.step));
        edited();
      });
    });
    Suggest(el.from);
    Suggest(el.to);
    // My location could not fill a field: why, where the form's messages go.
    f.addEventListener('dv-here', function (e) { msg(f, e.detail); });
    // Picked the pickup: on to the destination if it is still empty.
    f.addEventListener('dv-pick', function (e) { if (e.target === el.from && !el.to.value.trim()) el.to.focus({ preventScroll: true }); });
    f.addEventListener('submit', function (e) { e.preventDefault(); getPrice(); });

    function getPrice() {
      if (busy || paying) return;
      var a = el.from.value.trim(), b = el.to.value.trim(), kind = el.kind.value === 'live' ? 'live' : 'booking', wall = null;
      if (!a) return msg(f, L.err_from, el.from);
      if (!b) return msg(f, L.err_to, el.to);
      if (kind === 'booking') {
        wall = parseDT(when.value);
        if (!wall) return msg(f, L.err_when, when);
      }
      var pax = +el.pax.value, bags = +(el.bags.value || 0);
      if (!(pax >= 1 && pax <= 20 && pax % 1 === 0)) return msg(f, L.err_pax, el.pax);
      if (!(bags >= 0 && bags <= 40 && bags % 1 === 0)) return msg(f, L.err_bags, el.bags);
      var btn = $('.go', f), e0 = ed;
      // Edited, or gone, while the addresses were looked up: that answer is for an older trip.
      var stale = function () { return ed !== e0 || step !== 'trip' || !card.isConnected; };
      msg(f, '');
      busy = true;
      busyBtn(btn, true, L.checking);
      Promise.all([el.from._place || findPlace(a), el.to._place || findPlace(b)]).then(function (r) {
        if (stale()) return;
        if (!r[0]) return msg(f, fill(L.err_not_found, { q: a }), el.from);
        if (!r[1]) return msg(f, fill(L.err_not_found, { q: b }), el.to);
        if (!routeOk(r[0], r[1])) return msg(f, L.err_route);
        if (domesticClosed(r[0], r[1])) return msg(f, L.err_domestic);
        if (roadKm(r[0], r[1]) < MIN_KM) return msg(f, fill(L.err_short, { n: MIN_KM }));
        // The time is on the pickup's clock: at least 2 hours from now there, as create-order checks.
        var at = wall ? wallMoment(wall, placeZone(r[0])) : null;
        if (at && at.getTime() < Date.now() + 2 * 3600e3) return msg(f, L.err_when, when);
        trip = { kind: kind, from: r[0], to: r[1], at: at, pax: pax, bags: bags };
        order = null;
        fillPrice();
        go('price');
        dirty = false; // after go: a field that loses focus there can still send its change
        loadStripe().catch(noop); // ready for the payment step
      }, function () { if (!stale()) msg(f, L.err_search); }).then(function () { busy = false; busyBtn(btn, false); });
    }

    // ---- step 2: the price, with a choice of van
    function fits(v) { return trip.pax <= VAN[v].max; }
    function cents() { return quote(trip.from, trip.to, trip.pax, trip.bags, van).cents; }
    function fillPrice() {
      var p = P.price, A = trip.from, B = trip.to;
      [['a', A], ['b', B]].forEach(function (x) {
        $('.' + x[0] + '-city', p).textContent = x[1].city + ', ' + countryName(x[1].country, L.lang);
        $('.' + x[0] + '-addr', p).textContent = x[1].address !== x[1].city ? x[1].address : '';
      });
      var fact = function (icon, text, label) {
        return '<span class="fact"' + (label ? ' title="' + esc(label) + '"' : '') + '>' + icon
          + (label ? '<span class="sr-only">' + esc(label) + ': </span>' : '') + esc(text) + '</span>';
      };
      $('.facts', p).innerHTML = fact(IC.cal, trip.kind === 'live' ? L.asap
        : pickupText(trip.at, new Date(trip.at.getTime() + WINDOW_MS), placeZone(trip.from), L.lang))
        + fact(IC.pax, trip.pax, L.f_pax) + (trip.bags ? fact(IC.bag, trip.bags, L.f_bags) : '')
        + fact(IC.km, fill(L.km, { n: quote(A, B, 1, 0, 'standard').km }));
      VANS.forEach(function (v) {
        var ok = fits(v), o = $('.vopt.' + v, p);
        o.classList.toggle('no', !ok);
        $('input', o).disabled = !ok;
        $('.vprice', o).textContent = ok ? money(quote(A, B, trip.pax, trip.bags, v).cents, L.lang) : fill(L.too_many, { n: VAN[v].max });
      });
      setVan(prefer && fits(prefer) ? prefer : fits(van) ? van : trip.pax <= VAN.standard.max ? 'standard' : 'large');
    }
    function setVan(v) {
      van = v;
      $$('[name=van]', P.price).forEach(function (r) { r.checked = r.value === v; r.parentNode.classList.toggle('on', r.checked); });
      $('.vcap', P.price).textContent = L['c_' + v];
      syncPrice();
    }
    function syncPrice() {
      if (!trip) return;
      var price = money(cents(), L.lang), label = fill(getSession() ? L.pay : L.login_pay, { price: price });
      $('.total b', P.price).textContent = price;
      if (priceBtn._label != null) priceBtn._label = label; // busy: shown once it is done
      else priceBtn.textContent = label;
      $('.fine', P.price).textContent = (trip.kind === 'live' ? L.fine_print_live : L.fine_print + ' ' + L.shared)
        + (van === 'luxury' ? ' ' + L.lux_note : '');
    }
    P.price.addEventListener('change', function (e) {
      if (e.target.name !== 'van') return;
      prefer = e.target.value;
      setVan(prefer);
      if (order) order = null; // another van is another order
    });
    priceBtn.addEventListener('click', startPay);

    // ---- step 3: payment
    function orderBody() {
      var place = function (x) { return { address: x.address, city: x.city, country: x.country, lat: x.lat, lng: x.lng }; };
      return {
        kind: trip.kind, pickup: place(trip.from), dropoff: place(trip.to),
        pickupAt: (trip.kind === 'live' ? new Date() : trip.at).toISOString(),
        passengers: trip.pax, extraBags: trip.bags, vanClass: van, notes: notes.value.trim() || undefined,
        payCountry: browserCountry(), // which local payment methods to show
        voucher: true // the payment step shows an invite voucher's line (create-order puts the next one on)
      };
    }
    // Creates the order (the server prices it and starts a Stripe payment for it), then slides
    // on to Stripe's form. Signed out: the account card first. The order, its payment and Stripe's
    // form belong to the person signed in when it was made (order.uid): signing out, or another
    // account signing in, drops them (auth below), so nobody pays someone else's trip.
    function startPay() {
      if (busy || paying || !trip) return;
      if (!getSession()) {
        wantPay = true;
        save(true);
        openLogin();
        return;
      }
      var c = cents(), payer = null;
      busy = true;
      lock(true);
      busyBtn(priceBtn, true, L.preparing);
      msg(P.price, '');
      refresh().then(function (s) {
        if (!s) { var e = new Error('Signed out'); e.status = 401; throw e; }
        payer = uidOf(s);
        return callFn('create-order', orderBody(), s.access_token);
      }).then(function (r) {
        if (!r || !r.orderId || !r.clientSecret) throw new Error('No payment in the reply');
        if (signedInAs() !== payer) return false; // signed out or another account meanwhile: not theirs to pay
        // cents: the payment; off: an invite voucher's discount on the price (20261024100000_client_vouchers).
        order = { id: r.orderId, secret: r.clientSecret, cents: r.fareCents || c, off: r.discountCents || 0, uid: payer };
        save(false);
        return loadStripe().then(function (st) { stripe = st; return true; }, function () { var e = new Error('Stripe.js'); e.stripe = true; throw e; });
      }).then(function (ok) {
        if (!ok || !order || step !== 'price' || !card.isConnected) return; // went back meanwhile: Pay starts it again
        mountPayment();
        go('pay');
      }).catch(function (e) {
        if (e.status === 401) { msg(P.price, L.err_login_again); clearSession(); }
        else if (e.code === 'booking_exists' && UUID.test(e.orderId || '')) { msg(P.price, L.err_paid); openBooked(e.orderId); }
        else if (e.status === 409) msg(P.price, L.err_paid);
        else msg(P.price, e.stripe ? L.err_pay_load : refusalText(e) || errText(e));
      }).then(function () {
        busy = false;
        lock(false);
        busyBtn(priceBtn, false);
        syncPrice();
      });
    }
    // The order is made for the van and the note shown, so they stay put until it is.
    function lock(on) {
      $('.vpick', P.price).disabled = on;
      notes.readOnly = on;
    }
    function signedInAs() { var s = getSession(); return s ? uidOf(s) : null; }
    // This trip is booked already (create-order's booking_exists: its payment went through or is
    // still being confirmed): that trip opens in My trips instead of a second payment.
    function openBooked(id) {
      justBooked = id;
      openLogin({ view: '#trips/' + id });
    }
    // The person the order was made for signed out, or another one signed in: the order, its
    // payment and Stripe's form go, and the card goes back to the price (the trip stays, typed on
    // this page). A booked trip's summary goes too.
    function dropCheckout() {
      if (step === 'done') { reset(); go('trip', { history: false }); }
      order = null;
      wantPay = false;
      dropPayment();
      if (step === 'pay') go('price', { history: false });
      if (routing && step !== 'trip') history.replaceState(Object.assign({}, history.state, { bk: step, bkp: null, bkr: null }), '');
      save(false);
    }
    function mountPayment() {
      var p = P.pay, price = money(order.cents, L.lang);
      dropPayment();
      $('.ps-route', p).textContent = trip.from.city + ' → ' + trip.to.city;
      $('.ps-price', p).textContent = price;
      // An invite voucher: the price and the voucher under the total to pay.
      var off = $('.ps-off', p);
      off.hidden = !(order.off > 0);
      off.textContent = order.off > 0 ? L.s_price + ' ' + money(order.cents + order.off, L.lang) + ' · ' + L.s_voucher + ' −' + money(order.off, L.lang) : '';
      payBtn.textContent = fill(L.pay, { price: price });
      payBtn.disabled = true;
      msg(p, '');
      p.classList.add('loading');
      // Didn't load: the button tries again. The element goes after Stripe's own
      // loaderror handling is done (destroying it inside that throws).
      var failed = function () {
        p.classList.remove('loading');
        var dead = pe;
        pe = els = null;
        setTimeout(function () { try { dead && dead.destroy(); } catch (e) {} });
        msg(p, L.err_pay_load); payBtn.textContent = L.retry; payBtn.disabled = false;
      };
      try {
        els = stripe.elements({ clientSecret: order.secret, locale: L.lang, appearance: APPEARANCE });
        // The account's email is filled in where a method asks for one (Klarna, Link).
        var who = getSession(), opts = { layout: 'tabs', business: { name: 'DomiVan' } };
        if (who && who.user && who.user.email) opts.defaultValues = { billingDetails: { email: who.user.email } };
        pe = els.create('payment', opts);
        pe.on('ready', function () { p.classList.remove('loading'); payBtn.disabled = false; });
        pe.on('loaderror', failed);
        pe.mount($('.pe', p));
      } catch (e) { failed(); }
    }
    function dropPayment() {
      if (pe) { try { pe.destroy(); } catch (e) {} }
      pe = els = null;
    }
    // Pays the order on the payment step, as the person it was made for. What it confirms (the
    // order, the trip and the van) is kept for its answer: the success screen shows that trip.
    function confirmPay() {
      if (paying || !order) return;
      if (order.uid !== signedInAs()) return dropCheckout();
      if (!pe) {
        return loadStripe().then(function (st) { stripe = st; mountPayment(); }, function () { msg(P.pay, L.err_pay_load); });
      }
      var p = P.pay, paid = { order: order, trip: trip, van: van };
      paying = true;
      busyBtn(payBtn, true, L.paying);
      msg(p, '');
      save(false);
      // Cards finish here (3-D Secure opens over the page); bank redirects come back to this page.
      stripe.confirmPayment({
        elements: els, redirect: 'if_required',
        confirmParams: { return_url: location.origin + location.pathname + '?booked=' + encodeURIComponent(paid.order.id) }
      }).then(function (r) {
        if (r && r.error) {
          if (r.error.type !== 'validation_error') msg(p, r.error.message || L.err_pay); // Stripe marks the field itself
          return;
        }
        if (paid.order.uid !== signedInAs()) return; // signed out meanwhile: it shows in their My trips
        var s = r && r.paymentIntent && r.paymentIntent.status;
        booked(s === 'processing' ? 'wait' : 'ok', null, paid);
      }, function () { msg(p, L.err_pay); }).then(function () {
        paying = false;
        busyBtn(payBtn, false);
        if (forgetting) forget();
        else if (order && order.uid !== signedInAs()) dropCheckout();
      });
    }
    payBtn.addEventListener('click', confirmPay);

    // ---- step 4: booked. paid: what a payment on this page confirmed (else the trip shown).
    function booked(how, o, paid) {
      if (paid) { trip = paid.trip; van = paid.van; order = paid.order; }
      var p = P.done, t = trip, rows = [];
      $('.done-p', p).textContent = how === 'wait' ? L.done_wait : t && t.kind === 'live' ? L.done_p_live : L.done_p;
      if (t) {
        rows.push([L.s_route, t.from.city + ' → ' + t.to.city],
          [L.s_pickup, t.kind === 'live' ? L.asap : pickupText(t.at, new Date(t.at.getTime() + WINDOW_MS), placeZone(t.from), L.lang)],
          [L.s_van, L['v_' + van]]);
      }
      if (order && order.cents) rows.push([L.s_paid, money(order.cents, L.lang)]);
      $('.done-sum', p).innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
      if (order) justBooked = order.id; // My trips lists it even before the payment is confirmed
      tripStore.del();
      wantPay = false;
      go('done', o);
    }
    $('.another', P.done).addEventListener('click', function () {
      reset();
      go('trip', { history: false });
      history.replaceState(Object.assign({}, history.state, { bk: null, bkp: null, bkr: null }), '');
      setTimeout(function () { el.from.focus({ preventScroll: true }); }, 480);
    });
    function reset() {
      trip = order = prefer = null;
      dirty = false;
      el.from.value = el.to.value = notes.value = '';
      el.from._place = el.to._place = null;
      clockNote();
      msg(f, '');
      tripStore.del();
    }
    // Log out: the trip typed here goes too (addresses, time, passengers, note: a shared
    // computer), and the card starts over as the page came. A payment on its way gets Stripe's
    // answer first (confirmPay).
    function forget() {
      ed++; // an address lookup still on its way is for the trip that went
      wantPay = false;
      afterLogin = null;
      if (paying) { forgetting = true; return; }
      forgetting = false;
      dropPayment();
      reset();
      f.reset();
      morning();
      sync();
      msg(P.price, '');
      msg(P.pay, '');
      if (step !== 'trip') go('trip', { history: false });
      if (routing && history.state && history.state.bk) history.replaceState(Object.assign({}, history.state, { bk: null, bkp: null, bkr: null }), '');
    }

    // ---- moving between steps
    function push(name) {
      if (!routing) return;
      history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), '');
      history.pushState({ dv: stamp(), y: window.scrollY, bk: name, bkp: 1 }, ''); // bkp: the entry before is the step before
    }
    function go(name, o) {
      o = o || {};
      var to = P[name];
      if (to === cur) return;
      var fwd = STEPS[name] > STEPS[step], was = step, hidden = !card.isConnected || card.classList.contains('off');
      step = name;
      card.dataset.stage = name;
      h2.textContent = name === 'trip' ? title0 : L['h_' + name];
      swap(panes, cur, to, fwd ? 1 : -1, o.instant || hidden, function () { if (was === 'pay' && step !== 'pay') dropPayment(); });
      cur = to;
      if (o.history !== false) {
        if (name === 'done') history.replaceState(Object.assign({}, history.state, { bk: 'done', bkr: null }), '');
        else if (fwd && loginOpen) afterLogin = name; // pushed once the account card has gone (loginClosed)
        else if (fwd) push(name);
      }
      if (!hidden && !o.instant) {
        if (fwd) reveal(card);
        h2.focus({ preventScroll: true });
      }
    }
    back.addEventListener('click', function () {
      if (paying) return; // the payment's answer shows on this step
      var prev = step === 'pay' ? 'price' : 'trip', st = history.state || {};
      if (routing && st.bk === step && st.bkp && !st.bkr) return history.back(); // popstate takes it back a step
      go(prev, { history: false });
      if (routing) history.replaceState(Object.assign({}, st, { bk: prev === 'trip' ? null : prev, bkp: null }), '');
    });

    // Keeps the trip while the visitor is away at Google, Apple or their bank.
    function save(pay) {
      if (!trip) return;
      tripStore.set({
        t: Date.now(), lang: L.lang, kind: trip.kind, from: trip.from, to: trip.to, fromText: el.from.value, toText: el.to.value,
        when: when.value, at: trip.at ? trip.at.getTime() : null, pax: trip.pax, bags: trip.bags, van: van, notes: notes.value,
        pay: !!pay, order: order ? { id: order.id, cents: order.cents, off: order.off, uid: order.uid } : null
      });
    }
    function placeOk(x) { return !!x && typeof x.city === 'string' && typeof x.country === 'string' && isFinite(x.lat) && isFinite(x.lng); }
    function restore(s) {
      if (!s || s.lang !== L.lang || Date.now() - s.t > 3 * 3600e3 || !placeOk(s.from) || !placeOk(s.to)) return false;
      $$('[name=kind]', f).forEach(function (r) { r.checked = r.value === s.kind; });
      sync();
      el.from.value = s.fromText || s.from.address;
      el.to.value = s.toText || s.to.address;
      el.from._place = s.from;
      el.to._place = s.to;
      if (s.when) when.value = s.when;
      clockNote();
      el.pax.value = s.pax;
      el.bags.value = s.bags;
      notes.value = s.notes || '';
      trip = { kind: s.kind === 'live' ? 'live' : 'booking', from: s.from, to: s.to, at: s.at ? new Date(s.at) : null, pax: +s.pax || 1, bags: +s.bags || 0 };
      if (trip.kind === 'booking' && !trip.at) { trip = null; return false; }
      prefer = s.van;
      fillPrice();
      // Only the order of the person signed in now (its payment is not kept: Pay makes it again).
      if (s.order && s.order.uid && s.order.uid === signedInAs()) order = { id: s.order.id, cents: s.order.cents, off: +s.order.off || 0, uid: s.order.uid };
      return true;
    }

    // Back from the bank (?booked=...): booked, or the price again with what went wrong. The URL
    // only says to look (anyone can type it): Stripe says how the payment really went
    // (retrievePaymentIntent with the client secret the bank's return brings), and the trip shown
    // is the one kept for this visitor's own order.
    function bankReturn(sb, had) {
      var where = had ? P.price : f;
      if (had) {
        go('price', { instant: true, history: false });
        history.replaceState(Object.assign({}, history.state, { bk: 'price', bkr: 1 }), '');
      }
      busy = true;
      busyBtn(had ? priceBtn : $('.go', f), true, L.pay_checking);
      var pi = /^(pi_[A-Za-z0-9]+)_secret_[A-Za-z0-9]+$/.exec(sb.secret || '');
      (pi && (!sb.pi || sb.pi === pi[1]) ? loadStripe().then(function (st) { return st.retrievePaymentIntent(sb.secret); })
        : Promise.reject(new Error('No payment in the return'))).then(function (r) {
        var intent = r && r.paymentIntent;
        if (!intent || intent.id !== pi[1]) throw new Error('No payment');
        return intent.status;
      }).then(function (status) {
        if (status === 'succeeded' || status === 'processing') {
          if (!had) { trip = null; order = null; }
          booked(status === 'processing' ? 'wait' : 'ok', { instant: true });
        } else {
          msg(where, L.err_pay);
        }
      }, function () { msg(where, L.err_pay_check); }).then(function () {
        busy = false;
        busyBtn(priceBtn, false);
        busyBtn($('.go', f), false);
        syncPrice();
      });
    }
    var s = tripStore.get(), sb = stripeBack;
    if (sb) {
      stripeBack = null;
      bankReturn(sb, restore(s) && !!order && order.id === sb.id);
    } else if (oauthBack && s && s.pay && restore(s)) {
      // Back from Google or Apple after "Log in to pay": the price again, and the payment step
      // as soon as the session is in (auth).
      go('price', { instant: true, history: false });
      history.replaceState(Object.assign({}, history.state, { bk: 'price', bkr: 1 }), '');
      wantPay = true;
    } else if (routing && history.state && history.state.bk) {
      history.replaceState(Object.assign({}, history.state, { bk: null, bkp: null, bkr: null }), ''); // reloaded on a later step
    }
    oauthBack = false;

    // The vans' "Book a seat" buttons scroll here with that van chosen.
    main.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-van]');
      if (!a || !VAN[a.dataset.van]) return;
      prefer = a.dataset.van;
      if (trip && step === 'price' && !busy && fits(prefer)) setVan(prefer);
    });

    return {
      // The session changed: the button's wording, and on to payment after "Log in to pay".
      auth: function () {
        // While Stripe confirms, the form stays until its answer (confirmPay drops it then).
        if (order && !paying && order.uid !== signedInAs()) dropCheckout();
        syncPrice();
        if (getSession() && $('.msg', P.price).textContent === L.err_login_again) msg(P.price, '');
        if (getSession() && wantPay && step === 'price' && !busy) { wantPay = false; startPay(); }
      },
      // The account card has gone.
      loginClosed: function () {
        if (!getSession() && wantPay) { wantPay = false; save(false); } // no payment later from another sign-in
        var n = afterLogin;
        afterLogin = null;
        if (n && n === step) push(n);
      },
      // Back or Forward between this page's entries: true when the card took it.
      pop: function (target) {
        if (!P[target] || target === step) return false;
        if (paying) { // Back while the payment is on its way: the card stays on it
          history.replaceState(Object.assign({}, history.state, { bk: step, bkp: null, bkr: null }), '');
          return true;
        }
        if (STEPS[target] < STEPS[step] && step !== 'done') { go(target, { history: false }); return true; }
        if (step === 'done') { reset(); go('trip', { history: false }); }
        else if (target === 'price' && trip && !dirty) { go('price', { history: false }); return true; } // Forward again, nothing changed
        // The card stays (or starts over): this entry now says so, so its back arrow goes the right way.
        history.replaceState(Object.assign({}, history.state, { bk: step === 'trip' ? null : step, bkp: null, bkr: null }), '');
        return true;
      },
      // Back to the page from the browser's cache (bfcache), e.g. Back from a bank's page.
      revive: function () {
        if (paying) { paying = false; busyBtn(payBtn, false); }
        if (forgetting) forget(); // logged out while that payment was on its way
      },
      forget: forget
    };
  }

  function curBook() { var b = page && $('.deck > .book', page); return b && b._bk; }

  // ---------------------------------------------------------------- Join Transporters

  // Phone numbers with their country code (batch 17): the country first, then the number, saved as
  // "+40 712345678" so the other side can call it as it is. A copy of src/lib/phone.ts, from
  // DIAL_CODES to phoneValue(); scripts/app-tests/phone.test.mjs compares the two.
  var DIAL_CODES = [
    { cc: 'AD', dial: '376', min: 6, max: 9 },
    { cc: 'AL', dial: '355', min: 8, max: 9 },
    { cc: 'AT', dial: '43', min: 7, max: 13 },
    { cc: 'BA', dial: '387', min: 8, max: 9 },
    { cc: 'BE', dial: '32', min: 8, max: 9 },
    { cc: 'BG', dial: '359', min: 7, max: 9 },
    { cc: 'CH', dial: '41', min: 9, max: 9 },
    { cc: 'CY', dial: '357', min: 8, max: 8 },
    { cc: 'CZ', dial: '420', min: 9, max: 9 },
    { cc: 'DE', dial: '49', min: 6, max: 13 },
    { cc: 'DK', dial: '45', min: 8, max: 8 },
    { cc: 'EE', dial: '372', min: 7, max: 8 },
    { cc: 'ES', dial: '34', min: 9, max: 9 },
    { cc: 'FI', dial: '358', min: 6, max: 12 },
    { cc: 'FR', dial: '33', min: 9, max: 9 },
    { cc: 'GB', dial: '44', min: 9, max: 10 },
    { cc: 'GI', dial: '350', min: 8, max: 8 },
    { cc: 'GR', dial: '30', min: 10, max: 10 },
    { cc: 'HR', dial: '385', min: 8, max: 9 },
    { cc: 'HU', dial: '36', min: 8, max: 9, trunk: '06' },
    { cc: 'IE', dial: '353', min: 7, max: 9 },
    { cc: 'IS', dial: '354', min: 7, max: 9 },
    { cc: 'IT', dial: '39', min: 6, max: 11, trunk: '' },
    { cc: 'LI', dial: '423', min: 7, max: 9 },
    { cc: 'LT', dial: '370', min: 8, max: 8 },
    { cc: 'LU', dial: '352', min: 6, max: 11 },
    { cc: 'LV', dial: '371', min: 8, max: 8 },
    { cc: 'MC', dial: '377', min: 8, max: 9 },
    { cc: 'MD', dial: '373', min: 8, max: 8 },
    { cc: 'ME', dial: '382', min: 8, max: 8 },
    { cc: 'MK', dial: '389', min: 8, max: 8 },
    { cc: 'MT', dial: '356', min: 8, max: 8 },
    { cc: 'NL', dial: '31', min: 9, max: 9 },
    { cc: 'NO', dial: '47', min: 8, max: 8 },
    { cc: 'PL', dial: '48', min: 9, max: 9 },
    { cc: 'PT', dial: '351', min: 9, max: 9 },
    { cc: 'RO', dial: '40', min: 9, max: 9 },
    { cc: 'RS', dial: '381', min: 7, max: 10 },
    { cc: 'SE', dial: '46', min: 7, max: 10 },
    { cc: 'SI', dial: '386', min: 8, max: 8 },
    { cc: 'SK', dial: '421', min: 9, max: 9 },
    { cc: 'SM', dial: '378', min: 6, max: 10, trunk: '' },
    { cc: 'TR', dial: '90', min: 10, max: 10 },
    { cc: 'UA', dial: '380', min: 9, max: 9 },
    { cc: 'XK', dial: '383', min: 8, max: 9 }
  ];
  var LANGUAGE_COUNTRY = { ro: 'RO', pl: 'PL', bg: 'BG', hu: 'HU', es: 'ES', fr: 'FR', de: 'DE', nl: 'NL', pt: 'PT' };
  function dialCode(cc) {
    for (var i = 0; i < DIAL_CODES.length; i++) if (DIAL_CODES[i].cc === cc) return DIAL_CODES[i];
    return undefined;
  }
  function guessCountry(region, lang) { var c = dialCode(region); return c ? c.cc : LANGUAGE_COUNTRY[lang] || null; }
  // A number that starts with its country code (+40 …, 0040 …): that country and the rest.
  function withCode(text) {
    var m = /^\s*(?:\+|00)\s*([\d\s().-]+)$/.exec(text), digits, i;
    if (!m) return null;
    digits = m[1].replace(/\D/g, '');
    for (i = 0; i < DIAL_CODES.length; i++) {
      if (digits.indexOf(DIAL_CODES[i].dial) === 0) return { cc: DIAL_CODES[i].cc, rest: digits.slice(DIAL_CODES[i].dial.length) };
    }
    return null;
  }
  function phoneParts(saved, guess) {
    var coded = saved ? withCode(saved) : null;
    return coded ? { cc: coded.cc, number: coded.rest } : { cc: guess, number: saved || '' };
  }
  function typedParts(parts, text) {
    var coded = withCode(text);
    return coded ? { cc: coded.cc, number: coded.rest } : { cc: parts.cc, number: text };
  }
  function nationalDigits(c, typed) {
    var n = typed.replace(/\D/g, ''), trunk = c.trunk === undefined ? '0' : c.trunk;
    if (n.length > c.max && n.indexOf(c.dial) === 0) n = n.slice(c.dial.length);
    if (trunk && n.indexOf(trunk) === 0) n = n.slice(trunk.length);
    return n;
  }
  function phoneValue(parts) {
    var c = dialCode(parts.cc), n;
    if (!c) return null;
    n = nationalDigits(c, parts.number);
    return n.length >= c.min && n.length <= c.max ? '+' + c.dial + ' ' + n : null;
  }
  // The visitor's country from the browser's languages ("ro-RO"), else from the page's language.
  function phoneGuess(lang) {
    var langs = navigator.languages || [navigator.language || ''], i, m;
    for (i = 0; i < langs.length; i++) {
      m = /-([a-z]{2})\b/i.exec(langs[i] || '');
      if (m && dialCode(m[1].toUpperCase())) return m[1].toUpperCase();
    }
    return guessCountry(null, lang);
  }
  // The country code button and the number (the Join form, Profile › Personal details): "RO +40 ▾"
  // with the browser's own list over it, the countries by name in the page's language.
  function phoneNow(c) { return c ? '<b>' + c.cc + '</b> +' + c.dial : esc(T.ph_pick); }
  function phoneHtml(id, parts, lang) {
    var c = dialCode(parts.cc), opts = DIAL_CODES.map(function (x) { return { cc: x.cc, dial: x.dial, name: countryName(x.cc, lang) }; })
      .sort(function (x, y) { return x.name.localeCompare(y.name, locale(lang)); });
    return '<div class="ph"><div class="ph-code"><span class="ph-now">' + phoneNow(c) + '</span><i aria-hidden="true">▾</i>'
      + '<select name="phone_cc" aria-label="' + esc(T.ph_code) + '"><option value=""' + (c ? '' : ' selected') + '>' + esc(T.ph_pick) + '</option>'
      + opts.map(function (o) {
        return '<option value="' + o.cc + '"' + (c && o.cc === c.cc ? ' selected' : '') + '>' + esc(o.name + ' +' + o.dial) + '</option>';
      }).join('')
      + '</select></div><input id="' + id + '" name="phone" type="tel" autocomplete="tel-national" value="' + esc(parts.number) + '"></div>';
  }
  function setPhone(form, parts) {
    form.elements.phone_cc.value = dialCode(parts.cc) ? parts.cc : '';
    form.elements.phone.value = parts.number;
    $('.ph-now', form).innerHTML = phoneNow(dialCode(parts.cc));
  }
  // The two fields of a form as typed: a number typed with its code moves the code to the button.
  function readPhone(form) {
    var parts = typedParts({ cc: form.elements.phone_cc.value || null, number: '' }, form.elements.phone.value.trim());
    if (parts.cc !== (form.elements.phone_cc.value || null)) setPhone(form, parts);
    return parts;
  }
  // Why a typed number can't be saved yet, or '' when it can.
  function phoneProblem(parts, lang) {
    if (!dialCode(parts.cc)) return T.ph_first;
    return phoneValue(parts) ? '' : fill(T.ph_invalid, { country: countryName(parts.cc, lang) });
  }
  d.addEventListener('change', function (e) {
    var sel = e.target;
    if (sel.name === 'phone_cc' && sel.parentNode.classList.contains('ph-code')) $('.ph-now', sel.parentNode).innerHTML = phoneNow(dialCode(sel.value));
  });

  // One question per frame, saved to Supabase (table transporter_applications, insert only).
  function initJoin(form, D) {
    var J = D.t, FLAGS = D.flags, API = SB + '/rest/v1/transporter_applications';
    var box = $('.q', form), bar = $('.progress span', form), count = $('.count', form), back = $('.back', form);
    var a = store.json(DRAFT) || {};
    var save = function () { store.set(DRAFT, JSON.stringify(a)); };
    var digits = function (v) { return String(v || '').replace(/\D/g, ''); };
    // Light format checks for each country's company number; staff verify the real thing.
    var REG = {
      PL: function (n) { return n.length === 10; },                  // NIP or KRS
      RO: function (n) { return n.length >= 2 && n.length <= 10; },  // CUI
      BG: function (n) { return n.length === 9 || n.length === 13; }, // EIK / UIC
      HU: function (n) { return n.length === 8 || n.length === 10 || n.length === 11; }, // adószám or cégjegyzékszám
      LT: function (n) { return n.length === 9; },                   // įmonės kodas
      LV: function (n) { return n.length === 11; }                   // reģistrācijas numurs
    };
    var yesNo = [{ v: 'yes', t: J.yes }, { v: 'no', t: J.no }];
    var STEPS = [
      { id: 'country', q: J.q_country, type: 'one', opts: ['PL', 'RO', 'BG', 'HU', 'LT', 'LV'].map(function (c) { return { v: c, t: J.countries[c], flag: c }; }) },
      { id: 'business_type', q: J.q_kind, type: 'one', opts: [{ v: 'company', t: J.kind_company }, { v: 'self_employed', t: J.kind_self }] },
      { id: 'company', q: J.q_company, type: 'fields', fields: function () {
          return [
            { k: 'company_name', label: J.f_company, ac: 'organization' },
            { k: 'reg_number', label: J.f_reg, hint: J.reg_hint[a.country] || '', mode: 'numeric' },
            { k: 'vat_number', label: J.f_vat, optional: true }
          ];
        }, check: function () {
          if (!REG[a.country] || REG[a.country](digits(a.reg_number))) return '';
          return { k: 'reg_number', e: J.err_reg.replace('{country}', J.countries[a.country]) };
        } },
      { id: 'licence', q: J.q_licence, sub: J.licence_sub, type: 'one', opts: [{ v: 'yes', t: J.yes }, { v: 'applying', t: J.licence_applying }, { v: 'no', t: J.no }] },
      { id: 'fleet_size', q: J.q_fleet, type: 'one', grid: true, opts: ['1', '2-5', '6-10', '11+'].map(function (v) { return { v: v, t: v.replace('-', '–') }; }) },
      { id: 'van_classes', q: J.q_vans, sub: J.pick_all, type: 'many', opts: [
          { v: 'standard', t: J.van_std, s: J.van_std_cap }, { v: 'large', t: J.van_lg, s: J.van_lg_cap }, { v: 'luxury', t: J.van_lux, s: J.van_lux_cap }] },
      // The countries come with the page (JOIN_DESTINATIONS in scripts/build-site.py); the database takes the same list.
      { id: 'destinations', q: J.q_routes, sub: J.pick_all, type: 'many', grid: true, opts: D.dest.map(function (c) { return { v: c, t: J.countries[c], flag: c }; }) },
      { id: 'passenger_insurance', q: J.q_insurance, type: 'one', opts: yesNo },
      { id: 'name', q: J.q_name, type: 'fields', fields: function () { return [{ k: 'full_name', label: J.f_name, ac: 'name' }]; } },
      { id: 'contact', q: J.q_contact, type: 'fields', fields: function () {
          return [{ k: 'phone', label: J.f_phone, type: 'phone' }, { k: 'email', label: J.f_email, type: 'email', ac: 'email' }];
        }, check: function () {
          var problem = phoneProblem({ cc: a.phone_cc || null, number: a.phone }, J.lang);
          if (problem) return { k: 'phone', e: problem };
          // Only a plain address, as the database takes it (20261028130000_mail_addresses): none of the characters
          // a mailto link reads as a Bcc, a body or another address, no control characters, at most 200 characters.
          if (!EMAIL_RE.test(a.email || '') || /[\x00-\x1f\x7f-\x9f?&=%,\/#:;<>()[\]\\"`]/.test(a.email) || a.email.length > 200) {
            return { k: 'email', e: J.err_email };
          }
          return '';
        } },
      { id: 'confirm', q: J.q_confirm, sub: J.confirm_sub, type: 'confirm' }
    ];
    var i = 0, busy = false, ref = keptRef();
    // Came through a VIT partner's invite link: the code goes with the application.
    if (ref) {
      var chip = d.createElement('p');
      chip.className = 'inv-chip';
      chip.innerHTML = GIFT + '<span>' + esc(ref.by ? fill(T.inv_saved, { name: ref.by }) : fill(T.inv_code, { code: ref.code })) + '</span>';
      form.parentNode.insertBefore(chip, form);
    }

    function optHtml(s, o) {
      var on = s.type === 'many' ? (a[s.id] || []).indexOf(o.v) >= 0 : a[s.id] === o.v;
      return '<button type="button" class="opt' + (on ? ' on' : '') + '" data-v="' + esc(o.v) + '" aria-pressed="' + on + '">'
        + (o.flag ? FLAGS[o.flag] : '') + '<span><b>' + esc(o.t) + '</b>' + (o.s ? '<small>' + esc(o.s) + '</small>' : '') + '</span>'
        + (s.type === 'many' ? '<i class="tick" aria-hidden="true"></i>' : '') + '</button>';
    }

    function render(dir) {
      var s = STEPS[i], h = '<h1>' + esc(s.q) + '</h1>' + (s.sub ? '<p class="qsub">' + esc(s.sub) + '</p>' : '');
      if (s.type === 'one' || s.type === 'many') {
        h += '<div class="opts' + (s.grid ? ' grid' : '') + '">' + s.opts.map(function (o) { return optHtml(s, o); }).join('') + '</div>';
      } else if (s.type === 'fields') {
        h += '<div class="fields">' + s.fields().map(function (f) {
          // The code starts on the company's country (the first step); a draft from before batch 17
          // has the number without its code.
          if (f.type === 'phone') {
            return '<div><label for="j-phone"><span>' + esc(f.label) + '</span></label>'
              + phoneHtml('j-phone', a.phone_cc ? { cc: a.phone_cc, number: a.phone || '' }
                : phoneParts(a.phone, dialCode(a.country) ? a.country : phoneGuess(J.lang)), J.lang)
              + '<em class="err" data-for="phone"></em></div>';
          }
          return '<label><span>' + esc(f.label) + '</span><input name="' + f.k + '" type="' + (f.type || 'text') + '"'
            + (f.ac ? ' autocomplete="' + f.ac + '"' : '') + (f.mode ? ' inputmode="' + f.mode + '"' : '')
            + ' value="' + esc(a[f.k] || '') + '">' + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '<em class="err" data-for="' + f.k + '"></em></label>';
        }).join('') + '</div>';
      } else if (s.type === 'confirm') {
        h += '<dl class="sum">' + [
          [J.f_company, a.company_name], [J.f_reg, a.reg_number + ' · ' + (J.countries[a.country] || '')],
          [J.f_name, a.full_name], [J.f_email, a.email]
        ].map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1] || '') + '</dd></div>'; }).join('') + '</dl>'
          + '<label class="consent"><input type="checkbox" name="consent"' + (a.consent ? ' checked' : '') + '><span>' + J.consent + '</span></label>';
      }
      if (s.type !== 'one') h += '<em class="err" data-for="_"></em><button type="submit" class="btn big next">' + esc(s.type === 'confirm' ? J.submit : J.next) + '</button>';
      else h += '<em class="err" data-for="_"></em>';
      var show = function () {
        box.innerHTML = h;
        box.className = 'q from-' + (dir < 0 ? 'left' : 'right');
        void box.offsetWidth; box.className = 'q';
        bar.style.width = Math.round((i + 1) / (STEPS.length + 1) * 100) + '%';
        count.textContent = J.step.replace('{n}', i + 1).replace('{total}', STEPS.length);
        back.hidden = i === 0;
        var first = box.querySelector('input:not([type=checkbox])');
        if (first && window.matchMedia('(min-width: 700px)').matches) first.focus({ preventScroll: true });
      };
      if (dir === 0) return show();
      box.className = 'q to-' + (dir < 0 ? 'right' : 'left');
      setTimeout(show, 180);
    }

    function err(k, msg) {
      box.querySelectorAll('.err').forEach(function (e) { e.textContent = ''; });
      var e = box.querySelector('.err[data-for="' + k + '"]') || box.querySelector('.err[data-for="_"]');
      e.textContent = msg;
      var input = box.querySelector('[name="' + k + '"]'); if (input) input.focus();
    }

    function next() {
      var s = STEPS[i];
      if (s.type === 'fields') {
        var fs = s.fields();
        for (var n = 0; n < fs.length; n++) {
          a[fs[n].k] = box.querySelector('[name="' + fs[n].k + '"]').value.trim();
          if (fs[n].type === 'phone') {
            var parts = readPhone(form);
            a.phone_cc = parts.cc || ''; a.phone = parts.number;
          }
          if (!fs[n].optional && a[fs[n].k].length < 2) return err(fs[n].k, J.err_required);
        }
        var c = s.check && s.check(); save();
        if (c) return err(c.k, c.e);
      } else if (s.type === 'many' && !(a[s.id] || []).length) return err('_', J.err_pick);
      else if (s.type === 'one' && !a[s.id]) return;
      else if (s.type === 'confirm') return submit();
      save(); i++; render(1);
    }

    function submit() {
      a.consent = box.querySelector('[name=consent]').checked;
      if (!a.consent) return err('_', J.err_consent);
      if (busy) return;
      if (form.elements.website.value) return done(); // bots fill the hidden field
      busy = true;
      var btn = box.querySelector('.next'); btn.disabled = true; btn.textContent = J.sending;
      var row = {
        lang: J.lang, country: a.country, business_type: a.business_type,
        company_name: a.company_name, reg_number: a.reg_number, vat_number: a.vat_number || null,
        licence: a.licence, fleet_size: a.fleet_size, van_classes: a.van_classes, destinations: a.destinations,
        passenger_insurance: a.passenger_insurance === 'yes',
        full_name: a.full_name, phone: phoneValue({ cc: a.phone_cc || null, number: a.phone }), email: a.email
      };
      ref = keptRef();
      if (ref) row.referral_code = ref.code;
      var post = function () {
        return fetch(API, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) })
          .then(function (r) { return r.ok ? 0 : r.status; });
      };
      post().then(function (status) {
        if (status !== 400 || !row.referral_code) return status;
        delete row.referral_code; // an invite code the database refuses never costs the application itself
        return post();
      }).then(function (status) { if (status) throw new Error(status); done(); })
        .catch(function () { busy = false; btn.disabled = false; btn.textContent = J.submit; err('_', J.err_send); });
    }

    function done() {
      store.del(DRAFT);
      bar.style.width = '100%'; back.hidden = true; count.textContent = '';
      box.className = 'q to-left';
      setTimeout(function () {
        box.innerHTML = '<div class="done-mark" aria-hidden="true">✓</div><h1>' + esc(J.done_h.replace('{name}', (a.full_name || '').split(' ')[0])) + '</h1>'
          + '<p class="qsub">' + esc(J.done_p) + '</p>'
          + (ref ? '<p class="qsub inv-done">' + GIFT + esc(fill(T.inv_join_done, { email: a.email })) + '</p>' : '')
          + driverBadges(J.ios_small, J.play_small)
          + '<a class="btn big next" href="' + esc(J.home) + '">' + esc(J.done_cta) + '</a>';
        box.className = 'q';
      }, 180);
    }

    box.addEventListener('click', function (e) {
      var b = e.target.closest('.opt'); if (!b) return;
      var s = STEPS[i];
      if (s.type === 'many') {
        var list = a[s.id] || [], at = list.indexOf(b.dataset.v);
        if (at >= 0) list.splice(at, 1); else list.push(b.dataset.v);
        a[s.id] = list; b.classList.toggle('on'); b.setAttribute('aria-pressed', at < 0); save();
      } else {
        a[s.id] = b.dataset.v; save();
        box.querySelectorAll('.opt').forEach(function (o) { o.classList.toggle('on', o === b); });
        setTimeout(next, 220);
      }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); next(); });
    back.addEventListener('click', function () { if (i > 0) { i--; render(-1); } });
    render(0);
  }

  // Starts a page's module once, the first time it is shown. Scripts inside pages that
  // arrive through the router are run once too (pages here keep theirs in this file).
  function initPage(main, arrived) {
    if (!main || main._dv) return;
    main._dv = true;
    try {
      var kind = main.getAttribute('data-page');
      if (kind === 'home' && $('#book', main)) $('#book', main)._bk = Book($('#book', main), main);
      if (kind === 'join' && $('#join', main) && $('#join-data', main)) initJoin($('#join', main), JSON.parse($('#join-data', main).textContent));
    } catch (err) { setTimeout(function () { throw err; }); }
    if (arrived) $$('script', main).forEach(function (old) {
      if (old.type && !/javascript|module/i.test(old.type)) return;
      var s = d.createElement('script');
      Array.prototype.forEach.call(old.attributes, function (at) { s.setAttribute(at.name, at.value); });
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  // ---------------------------------------------------------------- live counters

  // The home page's live counters (batch 16, migration 20261028110000_live_counts): DomiVan's
  // transporters, how many are online and how many people are travelling right now, from
  // read_live_counts() (three counts from one row a database job fills every minute; null while
  // Admin › Switches › Live counters is off or the count is stale). The page stays plain HTML
  // without them: the box is empty and hidden until an answer comes, and hides again on null or a
  // failed try. Asked when the home page shows and once a minute while the tab is in front, like
  // the app's New trip (src/lib/live-count-rules.ts: the same rule as liveCountsOf, change both).
  // The words are the app's own (lc_* in APP_TEXTS, scripts/panel_strings.py).
  var LIVE_MS = 60e3, liveTimer = 0, liveSeq = 0;
  function isCount(v) { return typeof v === 'number' && v % 1 === 0 && v >= 0 && v < 1e7; }
  function liveCountsOf(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
    if (!isCount(a.transporters) || !isCount(a.online) || !isCount(a.travelling)) return null;
    return { transporters: a.transporters, online: a.online, travelling: a.travelling };
  }
  function countText(n) {
    try { return new Intl.NumberFormat(locale(T.lang || 'en')).format(n); } catch (e) { return String(n); }
  }
  function renderLive(box, n) {
    if (!n) {
      box.hidden = true;
      box.textContent = '';
      box._lc = '';
      return;
    }
    var html = '<p class="lc-h"><i aria-hidden="true"></i>' + esc(T.lc_title) + '</p><dl>'
      + [[n.transporters, T.lc_transporters], [n.online, T.lc_online], [n.travelling, T.lc_travelling]].map(function (x) {
        return '<div><dt>' + esc(x[1]) + '</dt><dd>' + esc(countText(x[0])) + '</dd></div>';
      }).join('') + '</dl>';
    if (box._lc !== html) { box.innerHTML = html; box._lc = html; }
    box.hidden = false;
  }
  // Asks now and again in a minute, while the page that shows has the box and the tab is in front;
  // otherwise it stops until the next arrival or the tab's return.
  function askLive() {
    clearTimeout(liveTimer);
    liveTimer = 0;
    var box = page && $('.livecounts', page), seq = ++liveSeq;
    if (!box || d.visibilityState === 'hidden') return;
    api('/rest/v1/rpc/read_live_counts', {}).then(liveCountsOf, nothing).then(function (n) {
      if (seq === liveSeq && box.isConnected) renderLive(box, n);
    });
    liveTimer = setTimeout(askLive, LIVE_MS);
  }

  // ---------------------------------------------------------------- invite links (VIT partners)

  // A VIT partner's QR code opens domivan.com/r/CODE. Pages has no such page, so 404.html sends
  // it to the home page in the visitor's language as ?r=CODE. The code then waits in this browser
  // for 30 days (REF). Signed out, the home page asks "I want to travel" or "I'm a transporter".
  // Travellers book here, and the code goes on their account as soon as they are signed in
  // (apply_referral_code checks every rule: new accounts only, in their first 7 days, before the
  // first booking, not their own code). Transporters get the DomiVan Driver app with the code
  // (Google Play hands it to the app; on iPhone it is copied, and the app's sign-up page has
  // Apple's Paste button) or the Join Transporters form, which sends it with the application.
  var REF_DAYS = 30, REF_CODE = /^[A-Z0-9]{4,12}$/;
  var GIFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11.5h15V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19v-7.5ZM3.5 7.5h17v4h-17zM12 7.5v13M12 7.5c-1-2.6-2.3-4-3.8-4-1.3 0-2 .8-2 1.8 0 1.4 1.8 2.2 5.8 2.2Zm0 0c1-2.6 2.3-4 3.8-4 1.3 0 2 .8 2 1.8 0 1.4-1.8 2.2-5.8 2.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var VAN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 16.5H3.2a.7.7 0 0 1-.7-.7V7.5A1.5 1.5 0 0 1 4 6h10.6c.5 0 .9.2 1.2.6l3.9 4.9c.2.3.3.6.3.9v3.4a.7.7 0 0 1-.7.7h-.4M8.6 16.5h6.3M14.5 6.5v5h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  var inv = null, applying = false, invN = 0; // inv: what the invite panel shows ({ step, ... })

  function keptRef() {
    var r = store.json(REF);
    return r && REF_CODE.test(r.code) && Date.now() - r.t < REF_DAYS * 864e5 ? r : null;
  }
  function keepRef(code, by) { store.set(REF, JSON.stringify({ code: code, by: by || null, t: Date.now() })); }
  function refBy(r) { return (r && r.by) || T.inv_partner; }

  // Back from an invite link (?r=CODE): keep the code and clean the address. Run before the
  // page starts, so the address it remembers has no ?r= either.
  function takeRef() {
    if (!window.URLSearchParams) return;
    var q = new URLSearchParams(location.search);
    if (!q.has('r')) return;
    var code = String(q.get('r')).toUpperCase(), had = keptRef();
    q.delete('r');
    var rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    if (!REF_CODE.test(code)) return;
    keepRef(code, had && had.code === code ? had.by : null);
    inv = { step: 'check' };
  }

  // Once the session is renewed: whose code it is (a new link), then the panel, or straight
  // onto the account when signed in. A code kept from an earlier visit shows who invited them.
  function startRef() {
    var r = keptRef();
    if (!r) return;
    if (!inv) { inv = { step: 'saved' }; return refNext(); }
    api('/rest/v1/rpc/referral_code_info', { p_code: r.code }).then(function (rows) {
      var row = rows && rows[0];
      if (!row || !row.valid) { store.del(REF); inv = { step: 'note', msg: T.inv_bad }; return renderInvite(); }
      keepRef(r.code, row.invited_by);
      inv = { step: 'choose' };
      refNext();
    }, function () { inv = { step: 'choose' }; refNext(); }); // offline: the server checks it when it is added
  }
  function refNext() { if (getSession()) applyRef(); else renderInvite(); }

  // Signed in: the code goes on the account. Any answer from the server settles it; without
  // one (offline, an expired login) it is tried again on the next visit.
  function applyRef() {
    var r = keptRef(), s = getSession();
    if (!r || !s || applying || (inv && inv.step === 'check')) return;
    applying = true;
    api('/rest/v1/rpc/apply_referral_code', { p_code: r.code }, s.access_token).then(function (res) {
      store.del(REF);
      inv = res === 'ok' ? { step: 'ok', by: refBy(r) } : { step: 'note', msg: refWhy(res) };
      renderInvite();
    }, noop).then(function () { applying = false; });
  }

  // Why apply_referral_code didn't add a code, in the visitor's words.
  function refWhy(res) {
    return { invalid_code: T.inv_bad, already_referred: T.inv_already, too_late: T.inv_too_late,
      already_booked: T.inv_booked, own_code: T.inv_own }[res] || T.err_generic;
  }

  // A store link that carries the kept code: Google Play hands &referrer= to the app after the
  // install. The App Store can't, so there the tap copies the invite link (onClick, onInvite).
  function toStore(url) {
    var r = keptRef();
    if (!r || !/^https:\/\/play\.google\.com\//.test(url)) return url;
    return url + (url.indexOf('?') < 0 ? '?' : '&') + 'referrer=' + encodeURIComponent('vit=' + r.code);
  }
  function copyRef() {
    var r = keptRef();
    if (r && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('https://domivan.com/r/' + r.code).catch(noop);
  }

  // The invite panel on the home page: under the lead on wide screens, between the pill and the
  // card spot on phones. Drawn again whenever the home page is shown.
  function renderInvite() {
    var host = page && $('.hero-copy', page), old = host && $('.invite', host);
    if (!host) return;
    var html = inv && !inv.hidden ? inviteHtml(inv, keptRef()) : '';
    if (!html) {
      if (old) { host.removeChild(old); relayoutMap(); }
      return;
    }
    var el = old || d.createElement('section');
    el.className = 'invite' + (inv.step === 'choose' || inv.step === 'driver' ? '' : ' small') + (inv.step === 'ok' ? ' ok' : '');
    el.innerHTML = html;
    el.setAttribute('aria-labelledby', $('h2', el).id);
    if (!old) {
      var lead = $('.lead', host);
      host.insertBefore(el, lead ? lead.nextSibling : host.firstChild);
      el.addEventListener('click', onInvite);
    }
    relayoutMap();
  }
  function inviteHtml(v, r) {
    var id = 'inv-h' + ++invN;
    var head = function (icon, h, p, close, back) {
      return '<div class="inv-head">'
        + (back ? '<button type="button" class="back-btn" data-inv="back" aria-label="' + esc(T.back) + '" title="' + esc(T.back) + '">' + CHEV + '</button>' : '')
        + '<span class="inv-ic">' + icon + '</span><div class="inv-txt"><h2 id="' + id + '">' + esc(h) + '</h2>'
        + (p ? '<p>' + esc(p) + '</p>' : '') + '</div>'
        + (close ? '<button type="button" class="inv-x" data-inv="close" aria-label="' + esc(T.inv_close) + '" title="' + esc(T.inv_close) + '">×</button>' : '')
        + '</div>';
    };
    if (v.step === 'note') return head(GIFT, T.inv_h, v.msg, true);
    if (v.step === 'ok') return head(IC.ok, fill(T.inv_saved, { name: v.by }), T.inv_ok, true);
    if (!r || v.step === 'check') return '';
    var app = v.step === 'driver' && driverStore();
    if (app) {
      return head(VAN_ICON, T.inv_drv_h, fill(/apple\.com/.test(app) ? T.inv_drv_ios : T.inv_drv_android, { code: r.code }), false, true)
        + '<a class="btn big inv-store" href="' + esc(toStore(app)) + '" data-inv="store">' + esc(T.inv_drv_btn) + '</a>'
        + '<a class="link inv-web" href="' + esc(T.home + 'join') + '">' + esc(T.inv_drv_web) + '</a>';
    }
    if (v.step === 'choose') {
      return head(GIFT, fill(T.inv_by, { name: refBy(r) }), T.inv_choose)
        + '<div class="inv-opts">'
        + '<button type="button" class="inv-opt" data-inv="travel">' + IC.bag + '<span><b>' + esc(T.inv_travel) + '</b><small>' + esc(T.inv_travel_s) + '</small></span></button>'
        + '<a class="inv-opt" href="' + esc(T.home + 'join') + '" data-inv="driver">' + VAN_ICON + '<span><b>' + esc(T.inv_driver) + '</b><small>' + esc(T.inv_driver_s) + '</small></span></a>'
        + '</div>';
    }
    return head(GIFT, fill(T.inv_saved, { name: refBy(r) }), T.inv_saved_p, true);
  }
  function onInvite(e) {
    var b = e.target.closest && e.target.closest('[data-inv]');
    if (!b) return;
    var what = b.getAttribute('data-inv');
    if (what === 'close') { inv.hidden = true; return renderInvite(); }
    if (what === 'back') { inv = { step: 'choose' }; return renderInvite(); }
    if (what === 'store') { if (/apple\.com/.test(b.href)) copyRef(); return; } // on to the store
    if (what === 'driver') {
      if (driverStore()) { e.preventDefault(); inv = { step: 'driver' }; renderInvite(); }
      else inv = { step: 'saved' }; // on to Join Transporters (the link); the panel waits here
      return;
    }
    // A traveller: Book your trip is right here. On phones the card is Log in / Create account
    // until they sign in; someone new needs Create account.
    inv = { step: 'saved' };
    renderInvite();
    var deck = deckOf(page), tab = deck && acct && acct.el.parentNode === deck && $('.tabs input[value=create]', acct.el);
    if (tab && !tab.checked && !acct.used()) tab.click();
    if (deck) reveal(deck);
  }

  // ---------------------------------------------------------------- Supabase Auth (REST)

  function api(path, body, token) {
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return fetch(SB + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) }).then(function (r) {
      return r.text().then(function (txt) {
        var j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch (e) {}
        if (r.ok) return j;
        var e = new Error(j.msg || j.message || j.error_description || 'HTTP ' + r.status);
        e.status = r.status;
        e.code = String(j.error_code || j.error || '');
        throw e;
      });
    });
  }
  function rateLimited(e) { return !!e && (e.status === 429 || /rate_limit/.test(e.code)); }
  // Supabase says how long to wait: "...you can only request this after 37 seconds."
  function waitFor(e) { var m = /(\d+)\s*seconds?/i.exec((e && e.message) || ''); return m ? Math.min(3600, +m[1]) : 60; }
  // An address Supabase won't take, although it looks fine here.
  function badEmail(e) {
    return !!e && (e.status === 400 || e.status === 422)
      && (/email_address_invalid|validation_failed/.test(e.code) || /email/i.test(e.message) && /invalid|validate/i.test(e.message));
  }
  function errText(e) {
    if (!e || !e.status) return T.err_network;
    if (rateLimited(e)) return T.err_rate;
    return T.err_generic;
  }
  // A booking refused for a reason the function names (create-order's { code, params }): the
  // apps' own words for it (T.refusals, from their language files, see build-site.py), the
  // numbers filled in and a van class by its name. Null for any other failure.
  function refusalText(e) {
    var text = e && e.code && T.refusals && T.refusals[e.code];
    if (!text) return null;
    var p = {}, k;
    for (k in e.params || {}) p[k] = e.params[k];
    var van = T['v_' + p.vanClass];
    if (van) p.vanClass = T.lang === 'de' ? van : van.toLocaleLowerCase(T.lang);
    text = fill(text, p);
    return /\{\w+\}/.test(text) ? null : text;
  }

  var settings = null, settingsReq = null; // which sign-in providers are switched on
  function loadSettings() {
    if (!settingsReq) settingsReq = fetch(SB + '/auth/v1/settings', { headers: { apikey: KEY } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { settings = j; }, function () { settingsReq = null; });
    return settingsReq;
  }

  function getSession() { var s = store.json(STORE); return s && s.access_token ? s : null; }
  // Same shape as supabase-js v2, so the booking app at /book picks it up.
  function setSession(s) {
    if (!s || !s.access_token || !s.refresh_token) throw new Error('No session in the response');
    var expiresIn = s.expires_in || 3600;
    var keep = {
      access_token: s.access_token, token_type: s.token_type || 'bearer', expires_in: expiresIn,
      expires_at: s.expires_at || Math.round(Date.now() / 1000) + expiresIn, refresh_token: s.refresh_token, user: s.user || null
    };
    // Google's and Apple's own tokens (provider_token) are not kept: the site never uses them.
    store.set(STORE, JSON.stringify(keep));
    authChanged();
    return keep;
  }
  function clearSession(instant) { store.del(STORE); store.del(NAME); authChanged(false, instant); }
  // One renewal per refresh token at a time: callers asking while one is on its way share it
  // (Supabase would refuse the token used twice).
  var renewing = null;
  function renew(s) {
    var rt = s.refresh_token;
    if (renewing && renewing.rt === rt) return renewing.p;
    var p = api('/auth/v1/token?grant_type=refresh_token', { refresh_token: rt });
    renewing = { rt: rt, p: p };
    var done = function () { if (renewing && renewing.p === p) renewing = null; };
    p.then(done, done);
    return p;
  }
  // Renews an expired (or nearly expired) session when a page opens. Its answer counts only for
  // the session it started from: after Log out, or another sign-in, while it was on its way (a
  // slow network), it neither brings the old account back nor signs the new one out.
  function refresh() {
    var s = getSession();
    if (!s || !s.refresh_token || (s.expires_at && s.expires_at - Date.now() / 1000 > 60)) return Promise.resolve(s);
    var rt = s.refresh_token;
    var same = function () { var c = getSession(); return !!c && c.refresh_token === rt; };
    return renew(s).then(function (n) { return same() ? setSession(n) : getSession(); }, function (e) {
      // Signed out elsewhere. The page opened on Book your trip; a phone swaps to Log in at once.
      if (same() && (e.status === 400 || e.status === 401 || e.status === 403)) clearSession(true);
      return getSession();
    });
  }
  // Signs out here at once, then ends the session at Supabase too. An expired access token
  // would be refused there, so it is renewed first (the new one is used only for this call).
  function logout() {
    var s = getSession();
    clearSession();
    store.del(DRAFT); // a Join form started on this computer goes with the person
    // So does a trip typed on the booking card, on this page and on a home page kept for Back
    // (after clearSession, whose auth() saves the trip again for whoever signs in next).
    tripStore.del();
    [page].concat(Object.keys(screens).map(function (k) { return screens[k].page; })).forEach(function (p) {
      var b = p && $('.deck > .book', p);
      if (b && b._bk) b._bk.forget();
    });
    if (!s) return;
    var stale = s.refresh_token && (!s.expires_at || s.expires_at - Date.now() / 1000 < 60);
    (stale ? renew(s).then(function (n) { return n.access_token; }) : Promise.resolve(s.access_token))
      .then(function (t) { if (t) return api('/auth/v1/logout', {}, t); }).catch(noop);
  }

  function nameOf(s) {
    var u = (s && s.user) || {}, m = u.user_metadata || {}, c = store.json(NAME);
    return (c && c.id === u.id && c.n) || m.full_name || m.name || '';
  }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0]; }
  // People who signed up in the app keep their name in their profile, not in the login.
  function fetchName(s) {
    var u = s && s.user, c = store.json(NAME);
    if (!u || !u.id || nameOf(s) || (c && c.id === u.id)) return;
    fetch(SB + '/rest/v1/profiles?select=full_name&id=eq.' + encodeURIComponent(u.id), {
      headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token }
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) {
      if (!rows) return;
      store.set(NAME, JSON.stringify({ id: u.id, n: (rows[0] && rows[0].full_name) || '' }));
      authChanged();
    }).catch(noop);
  }

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function pkce() {
    return Promise.resolve().then(function () {
      var v = b64url(crypto.getRandomValues(new Uint8Array(64))); // 86 characters
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)).then(function (h) {
        return { verifier: v, challenge: b64url(new Uint8Array(h)) };
      });
    });
  }

  // Back from Google or Apple: ?auth=callback&code=... (or ?error=...). Cleans the URL
  // and starts exchanging the code for a session.
  function takeCallback() {
    var q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
    var saved = store.json(PKCE), fresh = !!(saved && saved.v && Date.now() - saved.t < 15 * 60 * 1000);
    var code = q.get('code'), err = q.get('error_description') || q.get('error') || h.get('error_description') || h.get('error');
    if (q.get('auth') !== 'callback' && !(fresh && (code || err))) return null;
    store.del(PKCE);
    ['auth', 'code', 'error', 'error_code', 'error_description', 'state'].forEach(function (k) { q.delete(k); });
    var rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : ''));
    var p = saved && saved.p === 'apple' ? 'apple' : 'google';
    var cb = { p: p, name: p === 'apple' ? 'Apple' : 'Google', tab: (saved && saved.tab) || 'login' };
    if (code && fresh && !err) cb.pending = api('/auth/v1/token?grant_type=pkce', { auth_code: code, code_verifier: saved.v });
    return cb;
  }

  // Back from a bank's page after paying for a trip: ?booked=<order>&redirect_status=... (Stripe
  // adds payment_intent and its client secret too). Cleans the URL; the booking card asks Stripe
  // how it went (stripeBack, bankReturn).
  function takeBooked() {
    if (!window.URLSearchParams) return;
    var q = new URLSearchParams(location.search), id = q.get('booked'), status = q.get('redirect_status');
    if (!id || !status) return;
    stripeBack = { id: id, pi: q.get('payment_intent'), secret: q.get('payment_intent_client_secret') };
    ['booked', 'payment_intent', 'payment_intent_client_secret', 'redirect_status'].forEach(function (k) { q.delete(k); });
    var rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  }

  // Header button: "Log In / Create Account", or the first name once signed in. Then the
  // account card, and which card the home page's spot shows (phones: Log in first).
  function authChanged(chromeOnly, instant) {
    var s = getSession(), b = $('.top .login');
    if (b) {
      if (b._orig == null) b._orig = b.innerHTML;
      b.classList.toggle('signed', !!s);
      if (s) {
        var n = firstName(nameOf(s)), u = s.user || {};
        b.innerHTML = '<span class="ava" aria-hidden="true">' + esc((n || u.email || '?').charAt(0).toUpperCase()) + '</span>'
          + '<span class="nm">' + esc(n || T.my_account) + '</span>';
        b.title = T.my_account;
      } else {
        b.innerHTML = b._orig;
        b.removeAttribute('title');
      }
    }
    if (chromeOnly) return;
    if (s) applyRef();
    if (acct) acct.sync();
    syncDeck(instant);
    var bk = curBook();
    if (bk) bk.auth();
  }

  // ---------------------------------------------------------------- My trips (account card)
  //
  // The trips this visitor booked, and one trip in full, as views of the account card: its status,
  // the route, what was paid, what happens next, the transporter and their phone (from 24 hours
  // before pickup, as in the app), the pickup code, Report a problem, the invoices, and Cancel
  // until pickup (free until a transporter accepts; after that, what comes back depends on how long
  // before pickup). Only trips they booked as a client, and only what a client sees in the app:
  // my_trips() gives each side only its own amounts, never what the transporter is paid. Trips
  // never paid for don't show; the one just booked here does, while its payment is still being
  // confirmed.

  // my_trips() can only be filtered and sorted on columns it is asked for, so client_id and
  // bid_started_at are in here. refund_state and refunded_cents: the client's refund as the
  // database knows it (20261021220000_app_fixes). discount_cents: an invite voucher on it
  // (20261024100000_client_vouchers).
  var ORDER_COLS = 'id,client_id,kind,status,van_class,pickup_address,pickup_city,pickup_country,dropoff_address,dropoff_city,dropoff_country,'
    + 'pickup_at,pickup_until,pickup_tz,passengers,extra_bags,notes,fare_cents,bid_started_at,cancel_reason,cancel_fee_cents,payout_on_hold,payout_release_at,payout_sent,'
    + 'refund_state,refunded_cents,discount_cents';
  var DONE = ['completed', 'cancelled'], ASSIGNED = ['accepted', 'en_route', 'picked_up'];
  var TONE = { pending_payment: 'gray', bidding: 'amber', accepted: 'blue', en_route: 'blue', picked_up: 'blue', completed: 'green', cancelled: 'gray' };
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var justBooked = null; // the trip booked on this page (the booked step)

  // The project's database as the signed-in visitor (PostgREST): a read, with a body a function
  // call (or with method PATCH, a change to rows). Row security decides what comes back.
  function rest(path, token, body, method) {
    var h = { apikey: KEY, Authorization: 'Bearer ' + token };
    if (body) h['Content-Type'] = 'application/json';
    return fetch(SB + '/rest/v1/' + path, { method: method || (body ? 'POST' : 'GET'), headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (r.ok) return j;
        var e = new Error((j && j.message) || 'HTTP ' + r.status);
        e.status = r.status;
        throw e;
      });
    });
  }
  // The signed-in user's id: the session keeps the user (one saved by an older page only the token).
  function uidOf(s) {
    if (s && s.user && s.user.id) return s.user.id;
    try { return JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch (e) { return null; }
  }
  function nothing() { return null; }

  function Trips(listPane, tripPane) {
    var L = T, uid = null, rows = null, byId = {}, listN = 0, listAt = 0;
    // The trip shown: its id, what was loaded for it (order, transporter, pickup code, invoices, what
    // cancelling now gives back),
    // and what the visitor has open in it (Cancel's question, the report form and its text).
    var id = null, dt = null, tripN = 0, tripAt = 0, ask = false, rep = false, repText = '', note = null, busy = false, tick = 0;

    function token() {
      return refresh().then(function (s) {
        if (!s) { var e = new Error('Signed out'); e.status = 401; throw e; }
        return s.access_token;
      });
    }
    // Refused as signed out: Log in again (the card then comes back to this view).
    function out(e) { if (e && e.status === 401) { clearSession(); return true; } return false; }
    function spinner() { return '<div class="tload"><span class="spin" aria-hidden="true"></span></div>'; }
    function oops(text, retry) {
      return '<div class="tempty"><p>' + esc(text) + '</p>' + (retry ? '<button type="button" class="btn ghost t-retry">' + esc(L.retry) + '</button>'
        : '<a class="btn ghost" href="#trips">' + esc(L.my_trips) + '</a>') + '</div>';
    }
    function badges(o) {
      return '<span class="badge ' + (TONE[o.status] || 'gray') + '">' + esc(L['st_' + o.status] || o.status) + '</span>'
        + (o.kind === 'live' ? '<span class="badge live">' + esc(L.tag_live) + '</span>' : '');
    }

    // ---- the list: upcoming trips first (soonest at the top), then past ones (latest first)
    function list() {
      if (rows) drawList();
      else listPane.innerHTML = spinner();
      if (Date.now() - listAt < 1000) return; // just asked
      listAt = Date.now();
      var n = ++listN, b = UUID.test(justBooked || '') ? justBooked : null;
      (uid ? token() : Promise.reject(new Error('No user'))).then(function (t) {
        return rest('rpc/my_trips?select=' + ORDER_COLS + '&client_id=eq.' + uid
          + (b ? '&or=(bid_started_at.not.is.null,id.eq.' + b + ')' : '&bid_started_at=not.is.null')
          + '&order=pickup_at.desc&limit=100', t);
      }).then(function (r) {
        if (n !== listN) return;
        rows = r || [];
        byId = {};
        rows.forEach(function (o) { byId[o.id] = o; });
        drawList();
      }, function (e) {
        if (n !== listN) return;
        listAt = 0;
        if (!out(e) && !rows) listPane.innerHTML = oops(L.err_trips, true);
      });
    }
    function drawList() {
      var y = listPane.scrollTop;
      if (!rows.length) {
        listPane.innerHTML = '<div class="tempty"><span class="tempty-ic" aria-hidden="true">' + IC.cal + '</span><h3>' + esc(L.none_h) + '</h3>'
          + '<p>' + esc(L.none_p) + '</p><a class="btn big" href="' + esc(L.home) + '">' + esc(L.book_trip) + '</a></div>';
        return;
      }
      var up = rows.filter(function (o) { return DONE.indexOf(o.status) < 0; }).reverse();
      var past = rows.filter(function (o) { return DONE.indexOf(o.status) >= 0; });
      listPane.innerHTML = (up.length ? '<h3 class="tsec">' + esc(L.up_h) + '</h3>' + up.map(row).join('') : '')
        + (past.length ? '<h3 class="tsec">' + esc(L.past_h) + '</h3>' + past.map(row).join('') : '');
      listPane.scrollTop = y;
    }
    function row(o) {
      return '<a class="trow" href="#trips/' + esc(o.id) + '"><span class="trow-top">' + badges(o) + '</span>'
        + '<b class="trow-route">' + esc(o.pickup_city) + ' → ' + esc(o.dropoff_city) + '</b>'
        + '<span class="trow-foot"><span>' + esc(pickupText(new Date(o.pickup_at), null, tripZoneOf(o), L.lang)) + '</span><b>' + esc(money(o.fare_cents, L.lang)) + '</b></span>'
        + '<span class="go-ic" aria-hidden="true">' + CHEV + '</span></a>';
    }
    listPane.addEventListener('click', function (e) { if (e.target.closest('.t-retry')) list(); });

    // ---- one trip. Opened from the list it shows at once and fills in as the rest arrives; while
    // it is shown it is read again every minute (the transporter's phone appears on a clock).
    function open(tid) {
      if (tid !== id) {
        id = tid; dt = null; ask = rep = false; repText = ''; note = null; tripAt = 0;
        tripPane.scrollTop = 0;
        if (byId[tid]) { dt = { o: byId[tid] }; drawTrip(); } else tripPane.innerHTML = spinner();
      }
      if (Date.now() - tripAt > 1000) load();
      stop();
      tick = setInterval(function () {
        if (!busy && !ask && !rep && !d.hidden && tripPane.isConnected && !tripPane.closest('.off')) load();
      }, 60000);
    }
    function stop() { clearInterval(tick); tick = 0; }
    function load() {
      var tid = id, n = ++tripN;
      tripAt = Date.now();
      return (uid ? token() : Promise.reject(new Error('No user'))).then(function (t) {
        return rest('rpc/my_trips?select=' + ORDER_COLS + '&id=eq.' + tid + '&client_id=eq.' + uid, t).then(function (r) {
          var o = r && r[0];
          if (!o) return null;
          return Promise.all([
            ASSIGNED.indexOf(o.status) >= 0 ? rest('rpc/trip_contact', t, { p_order: tid }).catch(nothing) : null,
            o.status === 'accepted' || o.status === 'en_route' ? rest('order_pickup_codes?select=code&order_id=eq.' + tid, t).catch(nothing) : null,
            rest('invoices?select=id,kind,number,total_cents,file_path&order_id=eq.' + tid + '&kind=in.(trip,credit_note)&file_path=not.is.null&order=created_at.asc', t).catch(nothing),
            o.status === 'accepted' || o.status === 'en_route' ? rest('rpc/my_cancellation_terms', t, { p_order: tid }).catch(nothing) : null
          ]).then(function (x) {
            return { o: o, who: x[0] && x[0][0], code: x[1] && x[1][0] && x[1][0].code, inv: x[2] || [], cx: x[3] && x[3][0] };
          });
        });
      }).then(function (r) {
        if (n !== tripN || tid !== id) return;
        if (!r) { dt = null; tripPane.innerHTML = oops(L.gone); return; }
        dt = r;
        byId[tid] = r.o;
        if (rows) rows = rows.map(function (o) { return o.id === tid ? r.o : o; }); // the list shows it like this too
        drawTrip();
      }, function (e) {
        if (n !== tripN || tid !== id) return;
        tripAt = 0;
        if (!out(e) && !dt) tripPane.innerHTML = oops(L.err_trips, true);
      });
    }

    function leg(cls, city, cc, addr) {
      return '<div class="leg"><span class="' + cls + '" aria-hidden="true"></span><p><b>' + esc(city + ', ' + countryName(cc, L.lang)) + '</b>'
        + '<span>' + (addr && addr !== city ? esc(addr) : '') + '</span></p></div>';
    }
    function msgHtml(where) { return '<div class="msg" role="alert">' + (note && note.where === where ? esc(note.text) : '') + '</div>'; }
    function drawTrip() {
      var o = dt.o, who = dt.who, at = new Date(o.pickup_at), opens = new Date(at.getTime() - 864e5), now = Date.now(), say = '', tone = '';
      var facts = [[L.s_pickup, pickupText(at, o.pickup_until ? new Date(o.pickup_until) : null, tripZoneOf(o), L.lang)],
        [L.f_pax, o.passengers]];
      if (o.extra_bags) facts.push([L.f_bags, o.extra_bags]);
      facts.push([L.s_van, L['v_' + o.van_class] || o.van_class]);
      // An invite voucher: the price and the voucher above what they paid.
      if (+o.discount_cents > 0) facts.push([L.s_price, money(o.fare_cents + o.discount_cents, L.lang)], [L.s_voucher, '−' + money(o.discount_cents, L.lang)]);
      facts.push([L.s_paid, money(o.fare_cents, L.lang)]);
      var h = '<div class="t-top">' + badges(o) + '</div>'
        + '<div class="legs">' + leg('start', o.pickup_city, o.pickup_country, o.pickup_address) + leg('ring', o.dropoff_city, o.dropoff_country, o.dropoff_address) + '</div>'
        + '<dl class="done-sum">' + facts.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('')
        + (o.notes ? '<div class="wide"><dt>' + esc(L.t_note) + '</dt><dd>' + esc(o.notes) + '</dd></div>' : '') + '</dl>';
      // What happens next.
      if (o.status === 'bidding') { say = L.n_bidding; tone = ' amber'; }
      else if (o.status === 'pending_payment') say = L.done_wait;
      else if (o.status === 'cancelled') say = cancelled(o);
      else if (ASSIGNED.indexOf(o.status) >= 0 && !who && o.kind !== 'live' && opens > now) say = fill(L.n_locked, { date: dateText(opens, L.lang) });
      else say = refundNote(o); // a trip that went ahead with part of it refunded (or a refund under way)
      if (say) h += '<p class="t-note' + tone + '">' + esc(say) + '</p>';
      if (who) {
        var van = [who.van_plate, who.van_seats ? fill(L.seats, { n: who.van_seats }) : '', who.van_class ? L['v_' + who.van_class] : ''].filter(Boolean).join(' · ');
        h += '<section class="t-sec"><h3>' + esc(L.tr_h) + '</h3>'
          + '<div class="t-person"><span class="ava" aria-hidden="true">' + esc((who.full_name || '?').charAt(0).toUpperCase()) + '</span><p><b>' + esc(who.full_name || '') + '</b>'
          + (who.company_name ? '<span>' + esc(who.company_name) + '</span>' : '') + '</p></div>'
          + (van ? '<p class="t-van">' + esc(van) + '</p>' : '')
          + (who.phone ? '<a class="btn big" href="tel:' + esc(who.phone.replace(/[^\d+]/g, '')) + '">' + esc(fill(L.call, { phone: who.phone })) + '</a>' : '')
          + '</section>';
      }
      // Who carries a paid trip (art. 8:1166 BW): DomiVan's company, and the transporter's once contact opens.
      if (o.bid_started_at) {
        h += '<p class="t-note t-carrier">' + esc(L.t_carrier + (who && who.company_name ? ' ' + fill(L.t_carried_by, { company: who.company_name }) : ''))
          + '</p>';
      }
      if (dt.code && (o.status === 'accepted' || o.status === 'en_route')) {
        h += '<section class="t-sec"><h3>' + esc(L.pc_h) + '</h3><b class="t-digits">' + esc(dt.code) + '</b><p>' + esc(L.pc_p) + '</p></section>';
      }
      tripPane.innerHTML = h + report(o, now) + invoices() + cancel(o);
      if (rep) $('textarea', tripPane).value = repText;
    }
    // Report a problem: while on the road, and after the trip until the transporter is paid (as in the app).
    function report(o, now) {
      if (o.payout_on_hold) return '<p class="t-note t-done">' + esc(L.report_done) + '</p>';
      var until = o.payout_release_at ? new Date(o.payout_release_at) : null;
      if (!(o.status === 'picked_up' || (o.status === 'completed' && !o.payout_sent && until && until > now))) return note && note.where === 'rep' ? msgHtml('rep') : '';
      return '<section class="t-sec">'
        + (o.status === 'completed' ? '<p>' + esc(fill(L.report_until, { date: dateText(until, L.lang) })) + '</p>' : '')
        + (rep ? '<label><small>' + esc(L.report_ph) + '</small><textarea maxlength="3800" rows="4"></textarea></label>' + msgHtml('rep')
          + '<button type="button" class="btn big t-send">' + esc(L.report_send) + '</button>'
          : '<button type="button" class="btn ghost t-report">' + esc(L.report) + '</button>')
        + '</section>';
    }
    function invoices() {
      if (!dt.inv || !dt.inv.length) return '';
      return '<section class="t-sec"><h3>' + esc(L.invoices_h) + '</h3>' + dt.inv.map(function (v) {
        return '<button type="button" class="t-file" data-path="' + esc(v.file_path) + '">' + IC.doc
          + '<span>' + esc(fill(v.kind === 'credit_note' ? L.invoice_credit : L.invoice_trip, { n: v.number })) + '</span><b>' + esc(money(v.total_cents, L.lang)) + '</b></button>';
      }).join('') + msgHtml('inv') + '</section>';
    }
    // Cancel: free while no transporter has accepted. After that, until pickup, what comes back
    // depends on how long before pickup: dt.cx says how much now and until when (the database
    // decides). One question first, with the amount.
    function cancel(o) {
      var open = o.status === 'bidding' || o.status === 'pending_payment', cx = dt.cx;
      if (!open && !cx) return note && note.where === 'cancel' ? msgHtml('cancel') : '';
      if (!ask) return '<div class="t-cancel"><button type="button" class="btn ghost danger t-ask">' + esc(L.cancel) + '</button>'
        + (cx ? '<small class="t-cx">' + esc(cxNow(cx)) + '</small>' : '') + msgHtml('cancel') + '</div>';
      return '<div class="t-cancel"><p>' + esc(cx ? cxQuestion(cx) : L.cancel_q) + '</p>'
        + (cx && cx.fee_cents ? '<small class="t-cx">' + esc(L.cx_late) + '</small>' : '')
        + '<div class="t-two"><button type="button" class="btn ghost t-keep">' + esc(L.cancel_no) + '</button>'
        + '<button type="button" class="btn danger t-yes">' + esc(L.cancel_yes) + '</button></div>' + msgHtml('cancel') + '</div>';
    }
    function pct(x) {
      try { return new Intl.NumberFormat(locale(L.lang), { style: 'percent', maximumFractionDigits: 0 }).format(+x); } catch (e) { return Math.round(x * 100) + '%'; }
    }
    function cxNow(cx) {
      var at = cx.changes_at ? dateText(new Date(cx.changes_at), L.lang) : '';
      if (!cx.fee_cents) return at ? fill(L.cx_free, { date: at }) : L.cx_free_any;
      var now = cx.refund_cents > 0 ? fill(L.cx_part, { pct: pct(cx.refund_pct), amount: money(cx.refund_cents, L.lang) }) : L.cx_none;
      if (!at || cx.next_refund_pct == null) return now;
      return now + ' ' + (+cx.next_refund_pct > 0 ? fill(L.cx_then_part, { pct: pct(cx.next_refund_pct), date: at }) : fill(L.cx_then_none, { date: at }));
    }
    function cxQuestion(cx) {
      if (!cx.fee_cents) return L.cancel_q;
      return cx.refund_cents > 0 ? fill(L.cx_q_part, { amount: money(cx.refund_cents, L.lang), pct: pct(cx.refund_pct) }) : L.cx_q_none;
    }
    // A cancelled trip: why, and where the refund stands as the database knows it, as in the app
    // (src/lib/refund-notes.ts): "refunded" only once Stripe made the refund, never for a trip that
    // was not paid, a refund still being made or retried, or a payment the bank disputed.
    function cancelled(o) {
      var fee = o.cancel_fee_cents, why;
      switch (o.cancel_reason) {
        case 'no_transporter': why = L.n_why_none; break;
        case 'not_paid': why = L.n_why_unpaid; break;
        case 'complaint_refund': why = L.n_why_checked; break;
        case 'fraud_warning': why = L.n_why_fraud; break;
        case 'disputed': why = L.n_why_disputed; break;
        // Set by DomiVan's staff (20261026140000_staff_cancel): a no-show keeps the fare, the others refund all of it.
        case 'client_no_show': why = L.n_why_no_show; break;
        case 'carrier_no_show': why = L.n_why_carrier_no_show; break;
        case 'staff_cancelled': why = L.n_why_staff; break;
        case 'client_cancelled':
          why = fee == null ? L.n_why_you : !fee ? L.n_why_in_time
            : fee < o.fare_cents ? fill(L.n_why_fee, { fee: money(fee, L.lang) }) : L.n_cx_none;
          break;
        default: why = L.n_why_other;
      }
      return [why, refundNote(o)].filter(Boolean).join(' ');
    }
    function refundNote(o) {
      var got = +o.refunded_cents || 0;
      switch (o.refund_state) {
        case 'pending': return L.n_ref_pending;
        case 'retrying': return L.n_ref_retrying;
        case 'failed': return L.n_ref_failed;
        case 'refunded': return got > 0 ? fill(got >= o.fare_cents ? L.n_ref_full : L.n_ref_part, { amount: money(got, L.lang) }) : '';
        default: return '';
      }
    }

    function redraw(focus) {
      drawTrip();
      var f = focus && $(focus, tripPane);
      if (!f) return;
      into(f.closest('.t-sec, .t-cancel') || f);
      f.focus({ preventScroll: true });
    }
    // Brings a part of the trip (the cancel question, the report form, a message) fully into view.
    function into(x) {
      x = typeof x === 'string' ? $(x, tripPane) : x;
      if (!x) return;
      var p = tripPane.getBoundingClientRect(), r = x.getBoundingClientRect(), y = tripPane.scrollTop;
      if (r.top - 16 < p.top || r.height + 32 > p.height) y += r.top - 16 - p.top;
      else if (r.bottom + 16 > p.bottom) y += r.bottom + 16 - p.bottom;
      else return;
      tripPane.scrollTo({ top: y, behavior: calm() ? 'auto' : 'smooth' });
    }
    tripPane.addEventListener('input', function (e) { if (e.target.tagName === 'TEXTAREA') repText = e.target.value; });
    tripPane.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || busy || !dt && !b.classList.contains('t-retry')) return;
      var c = b.classList;
      if (c.contains('t-retry')) load();
      else if (c.contains('t-ask')) { ask = true; note = null; redraw('.t-keep'); }
      else if (c.contains('t-keep')) { ask = false; note = null; redraw('.t-ask'); }
      else if (c.contains('t-yes')) cancelTrip(b);
      else if (c.contains('t-report')) { rep = true; note = null; redraw('textarea'); }
      else if (c.contains('t-send')) sendReport(b);
      else if (c.contains('t-file')) openFile(b.dataset.path);
    });
    // Sends the refund the visitor was shown: if it changed meanwhile (a transporter accepted, or
    // the refund stepped down), nothing is cancelled and the trip shows the new one.
    function cancelTrip(b) {
      var tid = id, refund = dt.cx ? dt.cx.refund_cents : dt.o.fare_cents;
      busy = true;
      note = null;
      busyBtn(b, true, L.cancelling);
      token().then(function (t) { return callFn('cancel-order', { orderId: tid, refundCents: refund }, t); }).then(function () { ask = false; }, function (e) {
        if (out(e)) return;
        if (e.status === 409) ask = false;
        note = { where: 'cancel', text: e.status !== 409 ? errText(e) : e.code === 'refund_changed' ? L.err_cx_changed
          : e.code === 'not_cancellable' ? L.err_cx_started : L.err_cancel };
      }).then(function () { return tid === id ? load() : null; }).then(function () {
        busy = false; // the button says Cancelling… until the trip shows how it is now
        listAt = 0;   // the list reads it again too
        if (tid === id && dt) { drawTrip(); into(note ? '.msg:not(:empty)' : '.t-note'); }
      });
    }
    function sendReport(b) {
      var text = repText.trim(), tid = id;
      if (!text) { note = { where: 'rep', text: L.err_report_empty }; return redraw('textarea'); }
      busy = true;
      note = null;
      busyBtn(b, true, L.sending);
      token().then(function (t) { return rest('rpc/report_trip_problem', t, { p_order: tid, p_body: text }); }).then(function () {
        rep = false;
        repText = '';
      }, function (e) {
        if (out(e)) return;
        note = { where: 'rep', text: /report_window_closed/.test(e.message) ? L.err_report_closed : /empty_report/.test(e.message) ? L.err_report_empty : errText(e) };
      }).then(function () { return !note && tid === id ? load() : null; }).then(function () {
        busy = false;
        if (tid === id && dt) { drawTrip(); into(note ? '.msg:not(:empty)' : '.t-done'); } // keeps the text when it didn't go
      });
    }
    // An invoice opens in a new tab (openInvoice); if it can't, the trip says so.
    function openFile(path) {
      note = null;
      openInvoice(path, function () {
        note = { where: 'inv', text: L.err_generic };
        if (dt) { drawTrip(); into('.msg:not(:empty)'); }
      });
    }

    return {
      list: list, open: open, stop: stop,
      // Who is signed in. Another account (or none): what was loaded for the last one goes.
      user: function (u) {
        u = UUID.test(u || '') ? u : null;
        if (u === uid) return;
        uid = u;
        rows = dt = id = null;
        byId = {};
        ask = rep = busy = false;
        repText = '';
        note = null;
        listN++; tripN++;
        listAt = tripAt = 0;
        stop();
        listPane.innerHTML = tripPane.innerHTML = '';
      }
    };
  }

  // ---------------------------------------------------------------- account card

  var CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  // Google's multicolour G and the Apple logo, as their sign-in guidelines ask.
  var GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true">'
    + '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
    + '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
    + '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
    + '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>'
    + '</svg>';
  var APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1ZM13.9 5c.7-.8 1.2-2 1-3.2-1 0-2.3.7-3 1.5-.7.8-1.2 1.9-1.1 3.1 1.2.1 2.3-.6 3.1-1.4Z"/></svg>';
  var MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="m4.5 8 7.5 5.5L19.5 8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // The Profile panel's icons, drawn like the app's (Ionicons outlines).
  function ico(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  var PI = {
    receipt: ico('M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4zM9 8h6M9 11.5h6M9 15h3.5'),
    help: ico('M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5zM10 9a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.4M12 14.3h.01'),
    user: ico('M12 4.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6zM4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4'),
    globe: ico('M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z'),
    out: ico('M14 4.5H7.5A2.5 2.5 0 0 0 5 7v10a2.5 2.5 0 0 0 2.5 2.5H14M11 12h9.5M17 8.5l3.5 3.5-3.5 3.5'),
    trash: ico('M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6'),
    go: ico('M9.5 5.5 16 12l-6.5 6.5')
  };
  var cards = 0;

  function field(name, label, type, ac, ph) {
    return '<label><small>' + esc(label) + '</small><input name="' + name + '" type="' + type + '" autocomplete="' + ac + '"'
      + (type === 'email' ? ' inputmode="email" autocapitalize="off" spellcheck="false"' : ' autocapitalize="words"')
      + ' placeholder="' + esc(ph) + '"></label>';
  }
  function authPane(tab) {
    return '<div class="pane" data-pane="' + tab + '">'
      + '<div class="sso">'
      + '<button type="button" class="sso-btn google" data-provider="google">' + GOOGLE + '<span>' + esc(T.google) + '</span></button>'
      + '<button type="button" class="sso-btn apple" data-provider="apple">' + APPLE + '<span>' + esc(T.apple) + '</span></button>'
      + '</div>'
      + '<div class="or" role="separator"><span>' + esc(T.or) + '</span></div>'
      + '<form class="em" novalidate>'
      + (tab === 'create' ? field('full_name', T.f_name, 'text', 'name', T.ph_name) : '')
      + field('email', T.f_email, 'email', 'email', T.ph_email)
      + '<div class="msg" role="alert"></div>'
      + '<button class="btn big go" type="submit">' + esc(T.send) + '</button>'
      + '<p class="hint">' + esc(T.hint) + '</p>'
      + '</form></div>';
  }
  // A row of the Profile panel's menus, as in the app: icon, label, value, chevron.
  function menuItem(href, icon, label, value, cls) {
    return '<a class="mi' + (cls ? ' ' + cls : '') + '" href="' + href + '"><span class="mi-ic">' + icon + '</span><span class="mi-t">' + esc(label) + '</span>'
      + '<span class="mi-v">' + (value || '') + '</span><span class="mi-go">' + PI.go + '</span></a>';
  }
  function profileHtml() {
    var cur = $('.top .lang .menu a[aria-current]'), lang = cur ? ($('.flag', cur) ? $('.flag', cur).outerHTML : '') + '<span>' + esc($('span', cur).textContent) + '</span>' : '';
    var tile = function (href, icon, label) { return '<a class="pf-tile" href="' + href + '">' + icon + '<span>' + esc(label) + '</span></a>'; };
    return '<div class="pf-head"><div class="me-ava"><span class="ava big" aria-hidden="true"></span><i class="ok" aria-hidden="true"></i></div>'
      + '<div class="pf-who"><p class="me-hi">' + esc(T.welcome) + '</p><b class="me-name"></b><span class="me-mail"></span></div></div>'
      + '<div class="pf-more">'
      + '<div class="pf-tiles">' + tile('#trips', IC.cal, T.my_trips) + tile('#login/invoices', PI.receipt, T.pn_invoices) + tile('#login/help', PI.help, T.pn_help) + '</div>'
      + '<h3 class="pf-sec">' + esc(T.pn_account) + '</h3><div class="mlist">'
      + menuItem('#login/details', PI.user, T.pn_details, '<span class="pf-phone"></span>')
      + menuItem('#login/invite', GIFT, T.pn_invite, '<span class="pf-until"></span>', 'pf-inv') + '</div>'
      + '<h3 class="pf-sec">' + esc(T.pn_site) + '</h3><div class="mlist">'
      + menuItem('#login/language', PI.globe, T.pn_language, lang)
      + menuItem('#login/terms', IC.doc, T.pn_terms) + menuItem('#login/privacy', IC.lock, T.pn_privacy) + '</div>'
      + '<div class="mlist"><button type="button" class="mi red out"><span class="mi-ic">' + PI.out + '</span><span class="mi-t">' + esc(T.logout) + '</span></button>'
      + '<a class="mi red" href="#login/delete"><span class="mi-ic">' + PI.trash + '</span><span class="mi-t">' + esc(T.pn_delete) + '</span></a></div>'
      + '</div>';
  }

  // The panel's views by address, each a pane of the account card. #login is Log in / Create
  // account, or Profile once signed in; Profile's steps are #login/<step>. A legal page or Help
  // stands on its own (#terms) or under Profile or Join Transporters (#login/terms, #join/terms),
  // so the back arrow returns there. auth: signed out, Log in shows first.
  var DOCS = ['terms', 'transporter-terms', 'privacy', 'delete-account'];
  var PSTEPS = { details: 1, invoices: 1, invite: 1, delete: 1, language: 0, help: 0 }; // 1: needs an account
  var AUTH = { login: 1, create: 1, code: 1 };
  function viewOf(h) {
    h = String(h || '');
    var p = h.slice(1).split('/'), a = p[0], b = p[1], x = b == null ? a : b;
    if (h.charAt(0) !== '#' || p.length > 2) return null;
    if (a === 'trips') return b == null ? { pane: 'trips', auth: 1 } : UUID.test(b) ? { pane: 'trip', id: b, auth: 1 } : null;
    if (b != null && a !== 'login' && a !== 'join') return null;
    if (b == null && a === 'login') return { pane: 'me', auth: 1 };
    if (b == null && a === 'join') return { pane: 'join', auth: 0 };
    if (DOCS.indexOf(x) >= 0) return { pane: 'doc', doc: x, auth: 0 };
    if (x === 'help') return { pane: 'help', auth: 0 };
    if (x === 'report') return { pane: 'report', auth: 0 };
    if (x === 'feedback') return { pane: 'feedback', auth: 0 };
    if (a === 'login' && PSTEPS[x] != null) return { pane: x, auth: PSTEPS[x] };
    return null;
  }
  function depth(h) { return h ? h.split('/').length : 0; }
  function parentOf(h) { var i = h.lastIndexOf('/'); return i > 0 ? h.slice(0, i) : ''; }
  function under(h, top) { return h === top || h.indexOf(top + '/') === 0; }
  var DOC_T = { terms: 'pn_doc_terms', 'transporter-terms': 'pn_doc_tterms', privacy: 'pn_doc_privacy', 'delete-account': 'pn_doc_delete' };

  // A site page for a panel (Join Transporters, a legal page, the home page's questions), in this
  // language. The router's cache shares them.
  function sitePart(name) { return load(T.home + name).then(parse).then(function (x) { return x.page; }); }

  function Account() {
    var n = ++cards, el = d.createElement('section');
    el.className = 'card acct';
    el.tabIndex = -1;
    el.dataset.tab = 'login';
    el.setAttribute('aria-labelledby', 'acct-h' + n);
    el.innerHTML = '<div class="card-head">'
      + '<button type="button" class="back-btn" aria-label="' + esc(T.back) + '" title="' + esc(T.back) + '">' + CHEV + '</button>'
      + '<span class="logo"><svg><use href="#mark"/></svg></span><h2 id="acct-h' + n + '">' + esc(T.acct_h) + '</h2>'
      + '<button type="button" class="x-btn" aria-label="' + esc(T.pn_close) + '" title="' + esc(T.pn_close) + '">' + CROSS + '</button></div>'
      + '<div class="acct-body">'
      + '<div class="kinds tabs" role="radiogroup" aria-label="' + esc(T.acct_h) + '">'
      + '<label><input type="radio" name="acct-tab' + n + '" value="login" checked><span>' + esc(T.tab_login) + '</span></label>'
      + '<label><input type="radio" name="acct-tab' + n + '" value="create"><span>' + esc(T.tab_create) + '</span></label>'
      + '</div>'
      + '<div class="panes">' + authPane('login') + authPane('create')
      + '<div class="pane" data-pane="code"><form class="cd" novalidate>'
      + '<div class="code-head"><span class="mail">' + MAIL + '</span><div><h3>' + esc(T.code_h) + '</h3><p class="sent"></p></div></div>'
      + '<label><small>' + esc(T.f_code) + '</small><input name="code" class="code-in" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••"></label>'
      + '<div class="msg" role="alert"></div>'
      + '<button class="btn big go" type="submit">' + esc(T.verify) + '</button>'
      + '<div class="code-links"><button type="button" class="link chg">' + esc(T.change_email) + '</button><button type="button" class="link rs"></button></div>'
      + '</form></div>'
      + '<div class="pane tv" data-pane="me">' + profileHtml() + '</div>'
      + ['details', 'invoices', 'invite', 'delete', 'language', 'help', 'report', 'feedback', 'doc', 'join', 'trips', 'trip'].map(function (p) {
        return '<div class="pane tv" data-pane="' + p + '"></div>';
      }).join('')
      + '</div></div>'
      + '<p class="acct-legal">' + T.legal + '</p>';

    var P = {}, panes = $('.panes', el), cur = null, tab = 'login', h2 = $('h2', el);
    var email = '', fullName = '', codeTab = 'login', timer = 0, until = 0;
    $$('.pane', el).forEach(function (p) { P[p.dataset.pane] = p; setOn(p, false); });
    var codeIn = $('[name=code]', P.code);
    h2.tabIndex = -1;
    // The view shown: Profile (#login), one of its steps, My trips (#trips), one trip
    // (#trips/<id>), Join Transporters or a legal page. Deeper views come in from the right,
    // shallower ones from the left.
    var view = '#login', shown = '', trips = Trips(P.trips, P.trip);

    function show(name, dir, instant) {
      var to = P[name];
      if (to === cur) return;
      el.classList.toggle('is-me', !AUTH[name]);
      var solo = el.parentNode && el.parentNode.classList.contains('solo'); // the card is as tall as its step
      swap(panes, cur, to, dir, instant || !el.isConnected || el.classList.contains('off'), null, solo ? panes.offsetHeight : null);
      cur = to;
      if (name !== 'code') stopTimer();
      if (name !== 'trip') trips.stop();
    }
    function msg(pane, text, name, action) {
      var m = $('.msg', pane);
      m.className = 'msg' + (action === 'ok' ? ' ok' : '');
      m.textContent = text || '';
      if (action && action.label) {
        var b = d.createElement('button');
        b.type = 'button'; b.className = 'link'; b.textContent = action.label; b.onclick = action.fn;
        m.appendChild(d.createTextNode(' '));
        m.appendChild(b);
      }
      $$('[aria-invalid]', pane).forEach(function (i) { i.removeAttribute('aria-invalid'); });
      var input = name && $('[name="' + name + '"]', pane);
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus({ preventScroll: true }); }
    }
    function busy(btn, on, label) {
      var target = $('span', btn) || btn;
      if (on) {
        if (btn._label == null) btn._label = target.textContent;
        btn.disabled = true; btn.classList.add('busy');
        if (label) target.textContent = label;
      } else if (btn._label != null) {
        btn.disabled = false; btn.classList.remove('busy');
        target.textContent = btn._label; btn._label = null;
      }
    }

    function setTab(t, instant) {
      var dir = cur === P.code ? -1 : t === 'create' ? 1 : -1;
      tab = t; el.dataset.tab = t;
      $$('.tabs input', el).forEach(function (r) { r.checked = r.value === t; });
      msg(P[t], '');
      show(t, dir, instant);
    }
    $('.tabs', el).addEventListener('change', function (e) { if (e.target.name) setTab(e.target.value); });
    // One email for both tabs.
    el.addEventListener('input', function (e) {
      if (e.target.name === 'email') $$('.em [name=email]', el).forEach(function (i) { if (i !== e.target) i.value = e.target.value; });
    });

    function otp(em, t, nm) {
      var body = { email: em, create_user: t === 'create' };
      if (t === 'create') body.data = { full_name: nm };
      return api('/auth/v1/otp', body);
    }
    // Log in with an email that has no account yet.
    function noUser(e) {
      return e && e.status >= 400 && e.status < 500 && e.status !== 429
        && (/otp_disabled|user_not_found|signup_disabled/.test(e.code) || /signups? not allowed|not found/i.test(e.message));
    }
    function sendCode(f) {
      var pane = f.closest('.pane'), t = pane.dataset.pane, btn = $('.go', f);
      var em = $('[name=email]', f).value.trim();
      var nm = t === 'create' ? $('[name=full_name]', f).value.trim().replace(/\s+/g, ' ') : '';
      if (t === 'create' && nm.length < 2) return msg(pane, T.err_name, 'full_name');
      if (!EMAIL_RE.test(em)) return msg(pane, T.err_email, 'email');
      if (btn.disabled) return;
      msg(pane, '');
      busy(btn, true, T.sending);
      otp(em, t, nm).then(function () {
        email = em; fullName = nm; codeTab = t;
        // A narrow phone breaks a long address before the @, not inside the domain.
        $('.sent', P.code).innerHTML = esc(T.code_sent).replace('{email}', '<b>' + esc(em).replace('@', '<wbr>@') + '</b>');
        codeIn.value = ''; codeIn._len = 0;
        msg(P.code, '');
        show('code', 1);
        startTimer();
        setTimeout(function () { if (cur === P.code) codeIn.focus({ preventScroll: true }); }, 480);
      }, function (e) {
        if (t === 'login' && noUser(e)) {
          return msg(pane, T.no_account, 'email', { label: T.create_instead, fn: function () {
            setTab('create');
            setTimeout(function () { $('[name=full_name]', P.create).focus({ preventScroll: true }); }, 480);
          } });
        }
        if (badEmail(e)) return msg(pane, T.err_email, 'email');
        // Back from Change email to the same address too soon: the code we sent still works.
        if (rateLimited(e) && em === email && t === codeTab) {
          show('code', 1);
          startTimer(waitFor(e));
          return msg(P.code, T.err_wait);
        }
        msg(pane, errText(e));
      }).catch(noop).then(function () { busy(btn, false); });
    }
    $$('form.em', el).forEach(function (f) { f.addEventListener('submit', function (e) { e.preventDefault(); sendCode(f); }); });

    function verify() {
      var btn = $('.go', P.code), c = codeIn.value.replace(/\D/g, '');
      if (c.length < 6) return msg(P.code, T.err_code, 'code');
      if (btn.disabled) return;
      msg(P.code, '');
      busy(btn, true, T.verifying);
      api('/auth/v1/verify', { type: 'email', email: email, token: c }).then(function (s) {
        el.classList.add('fresh');
        setSession(s);
        signedIn();
      }, function (e) {
        msg(P.code, e.status && e.status < 500 && e.status !== 429 ? T.err_bad_code : errText(e), 'code');
      }).catch(noop).then(function () { busy(btn, false); });
    }
    $('form.cd', el).addEventListener('submit', function (e) { e.preventDefault(); verify(); });
    codeIn.addEventListener('input', function () {
      var before = codeIn._len || 0, v = codeIn.value.replace(/\D/g, '').slice(0, 8);
      if (v !== codeIn.value) codeIn.value = v;
      codeIn._len = v.length;
      if (v.length >= 6 && v.length - before >= 4) verify(); // pasted, or filled in from the email
    });
    $('.chg', P.code).addEventListener('click', function () {
      setTab(codeTab);
      setTimeout(function () { $('[name=email]', P[codeTab]).focus({ preventScroll: true }); }, 480);
    });
    $('.rs', P.code).addEventListener('click', function () {
      var b = this;
      if (b.disabled) return;
      b.disabled = true;
      otp(email, codeTab, fullName).then(function () { msg(P.code, T.resent, null, 'ok'); startTimer(); }, function (e) {
        if (rateLimited(e)) { startTimer(waitFor(e)); return msg(P.code, T.err_wait); } // count down to when Supabase allows it
        msg(P.code, errText(e)); b.disabled = false;
      });
    });
    function startTimer(s) { stopTimer(); until = Date.now() + (s || 30) * 1000; tick(); timer = setInterval(tick, 1000); }
    function stopTimer() { clearInterval(timer); timer = 0; }
    function tick() {
      var b = $('.rs', P.code), left = Math.ceil((until - Date.now()) / 1000);
      b.disabled = left > 0;
      b.textContent = left > 0 ? fill(T.resend_in, { s: left }) : T.resend;
      if (left <= 0) stopTimer();
    }

    function oauth(b) {
      var p = b.dataset.provider, name = p === 'apple' ? 'Apple' : 'Google', pane = b.closest('.pane');
      msg(pane, '');
      if (settings && settings.external && settings.external[p] === false) return msg(pane, fill(T.err_oauth_off, { provider: name }));
      busy(b, true, fill(T.redirecting, { provider: name }));
      pkce().then(function (k) {
        store.set(PKCE, JSON.stringify({ v: k.verifier, p: p, tab: tab, t: Date.now() }));
        var back = location.origin + location.pathname + '?auth=callback';
        location.assign(SB + '/auth/v1/authorize?provider=' + p + '&redirect_to=' + encodeURIComponent(back)
          + '&code_challenge=' + k.challenge + '&code_challenge_method=s256');
      }).catch(function () { busy(b, false); msg(pane, fill(T.err_oauth, { provider: name })); });
    }
    $$('.sso-btn', el).forEach(function (b) { b.addEventListener('click', function () { oauth(b); }); });

    // Tapping My trips or anything else in the card stops the automatic slide back, so the card
    // stays: its back arrow shows again (it is hidden during the welcome on a phone).
    el.addEventListener('click', function (e) {
      if (!(e.target.closest && e.target.closest('a, button'))) return;
      cancelAutoClose();
      if (loginOpen && !gated()) el.classList.remove('gate');
    }, true);
    $('.out', P.me).addEventListener('click', function () { el.classList.remove('fresh'); logout(); });
    $('.back-btn', el).addEventListener('click', accountBack);
    $('.x-btn', el).addEventListener('click', function () { closeLogin({ ui: true }); });

    // ---- Profile and its steps. me: the profile row (name, phone, invoice details) and until
    // when an invite code can still be added (referral_window(), null once it can't).
    var me = null, meFor = null, meAt = 0, inviteUntil = null;
    function uid() { var s = getSession(); return s ? uidOf(s) : null; }
    function token() {
      return refresh().then(function (s) {
        if (!s) { var e = new Error('Signed out'); e.status = 401; throw e; }
        return s.access_token;
      });
    }
    // Refused as signed out: Log in again (the panel then comes back to this view).
    function out(e) { if (e && e.status === 401) { clearSession(); return true; } return false; }
    function spinner() { return '<div class="tload"><span class="spin" aria-hidden="true"></span></div>'; }
    function oops(pane, again) {
      pane.innerHTML = '<div class="tempty"><p>' + esc(T.err_generic) + '</p><button type="button" class="btn ghost pn-retry">' + esc(T.retry) + '</button></div>';
      $('.pn-retry', pane).onclick = again;
    }
    function loadMe(force) {
      var u = uid();
      if (!u || (!force && meFor === u && Date.now() - meAt < 30000)) return drawMe();
      meAt = Date.now();
      token().then(function (t) {
        return Promise.all([
          rest('profiles?select=full_name,phone,billing_name,billing_vat_number,billing_address&id=eq.' + u, t),
          rest('rpc/referral_window', t, {}).catch(nothing)
        ]);
      }).then(function (r) {
        if (uid() !== u) return;
        me = (r[0] && r[0][0]) || {}; meFor = u;
        inviteUntil = r[1] && Date.parse(r[1]) > Date.now() ? new Date(r[1]) : null;
        drawMe();
        if (cur === P.details) details(); // a step that was waiting for it
        if (cur === P.invite) invite();
      }, function (e) {
        meAt = 0;
        if (!out(e) && cur === P.details && meFor !== u) oops(P.details, details);
      });
    }
    function drawMe() {
      var s = getSession(), u = (s && s.user) || {}, nm = (meFor === uid() && me && me.full_name) || nameOf(s);
      $('.ava', P.me).textContent = (nm || u.email || '?').charAt(0).toUpperCase();
      $('.me-name', P.me).textContent = nm || u.email || T.my_account;
      $('.me-mail', P.me).textContent = nm ? u.email || '' : '';
      $('.pf-phone', P.me).textContent = (meFor === uid() && me && me.phone) || '';
      var inv = $('.pf-inv', P.me);
      inv.hidden = !(meFor === uid() && inviteUntil);
      $('.pf-until', P.me).textContent = inviteUntil ? fill(T.pn_invite_by, { date: clockText(inviteUntil, null, SOON, T.lang) }) : '';
    }

    function detailsHtml() {
      var f = function (k, label, type, ac, ph) {
        return '<label><small>' + esc(label) + '</small><input name="' + k + '" type="' + (type || 'text') + '"' + (ac ? ' autocomplete="' + ac + '"' : '')
          + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (k === 'email' ? ' disabled' : '') + '></label>';
      };
      return '<form class="pn-form" novalidate>' + f('full_name', T.pn_name, 'text', 'name')
        + '<div><label for="pf-phone"><small>' + esc(T.pn_phone) + '</small></label>' + phoneHtml('pf-phone', { cc: null, number: '' }, T.lang) + '</div>'
        + f('email', T.f_email, 'email', 'email')
        + '<h3 class="pf-sec">' + esc(T.pn_bill_h) + '</h3><p class="pn-note">' + esc(T.pn_bill_p) + '</p>'
        + f('billing_name', T.pn_bill_name, 'text', 'organization') + f('billing_vat_number', T.pn_bill_vat, 'text', 'off')
        + f('billing_address', T.pn_bill_addr, 'text', 'street-address', T.pn_bill_addr_ph)
        + '<div class="msg" role="alert"></div><button class="btn big go" type="submit">' + esc(T.pn_save) + '</button></form>';
    }
    function details() {
      var u = uid();
      if (!$('form', P.details)) {
        P.details.innerHTML = detailsHtml();
        $('form', P.details).addEventListener('submit', function (e) { e.preventDefault(); saveDetails(this); });
      }
      var f = $('form', P.details), wait = $('.tload', P.details);
      if (meFor !== u) { // its fields come with the profile
        f.hidden = true;
        if (!wait) P.details.insertAdjacentHTML('afterbegin', spinner());
        return loadMe(true);
      }
      if (wait) P.details.removeChild(wait);
      f.hidden = false;
      if (f._for === u && f._at > meAt) return;
      f._for = u; f._at = Date.now();
      ['full_name', 'billing_name', 'billing_vat_number', 'billing_address'].forEach(function (k) { f.elements[k].value = me[k] || ''; });
      setPhone(f, phoneParts(me.phone, phoneGuess(T.lang))); // a number saved without its code gets one here
      f.elements.email.value = (getSession().user || {}).email || '';
      msg(f, '');
    }
    function saveDetails(f) {
      var btn = $('.go', f), v = function (k) { return f.elements[k].value.trim().replace(/\s+/g, ' '); };
      var phone = readPhone(f), typed = /\d/.test(phone.number);
      var row = { full_name: v('full_name'), phone: typed ? phoneValue(phone) : '', billing_name: v('billing_name') || null,
        billing_vat_number: v('billing_vat_number').toUpperCase() || null, billing_address: v('billing_address') || null };
      if (row.full_name.length < 2) return msg(f, T.err_name, 'full_name');
      if (typed && !row.phone) return msg(f, phoneProblem(phone, T.lang), 'phone');
      if (btn.disabled) return;
      var u = uid();
      msg(f, '');
      busy(btn, true);
      token().then(function (t) { return rest('profiles?id=eq.' + u, t, row, 'PATCH'); }).then(function () {
        if (uid() !== u) return;
        me = Object.assign({}, me, row); meFor = u;
        store.set(NAME, JSON.stringify({ id: u, n: row.full_name })); // the header's first name
        authChanged(true);
        drawMe();
        msg(f, T.pn_saved, null, 'ok');
      }, function (e) { if (!out(e)) msg(f, errText(e)); }).catch(noop).then(function () { busy(btn, false); });
    }

    // Every invoice and credit note of this account, newest first (row security picks them).
    var invRows = null, invFor = null, invAt = 0;
    function invoices() {
      var u = uid();
      if (invFor === u && invRows) drawInvoices(); else P.invoices.innerHTML = spinner();
      if (invFor === u && Date.now() - invAt < 5000) return;
      invAt = Date.now();
      token().then(function (t) {
        return rest('invoices?select=id,kind,number,total_cents,file_path,created_at&kind=in.(trip,credit_note)&file_path=not.is.null&order=created_at.desc&limit=100', t);
      }).then(function (r) {
        if (uid() !== u) return;
        invRows = r || []; invFor = u;
        drawInvoices();
      }, function (e) { invAt = 0; if (!out(e) && !(invFor === u && invRows)) oops(P.invoices, invoices); });
    }
    function drawInvoices() {
      if (!invRows.length) {
        P.invoices.innerHTML = '<div class="tempty"><span class="tempty-ic" aria-hidden="true">' + PI.receipt + '</span><p>' + esc(T.pn_inv_none) + '</p></div>';
        return;
      }
      P.invoices.innerHTML = invRows.map(function (v) {
        return '<button type="button" class="t-file" data-path="' + esc(v.file_path) + '">' + IC.doc
          + '<span>' + esc(fill(v.kind === 'credit_note' ? T.invoice_credit : T.invoice_trip, { n: v.number }))
          + '<small>' + esc(clockText(new Date(v.created_at), null, DAY, T.lang)) + '</small></span><b>' + esc(money(v.total_cents, T.lang)) + '</b></button>';
      }).join('') + '<div class="msg" role="alert"></div>';
    }
    P.invoices.addEventListener('click', function (e) {
      var b = e.target.closest('.t-file');
      if (b) openInvoice(b.dataset.path, function () { msg(P.invoices, T.err_generic); });
    });

    // Invite code: in the first 7 days after signing up, before the first booking (as in the app).
    function invite() {
      if (!$('form', P.invite)) {
        P.invite.innerHTML = '<form class="pn-form" novalidate><p class="pn-note"></p>'
          + '<label><small>' + esc(T.inv_h) + '</small><input name="code" class="pn-code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="ABC123"></label>'
          + '<div class="msg" role="alert"></div><button class="btn big go" type="submit">' + esc(T.pn_code_add) + '</button></form>';
        $('form', P.invite).addEventListener('submit', function (e) { e.preventDefault(); addCode(this); });
      }
      var f = $('form', P.invite);
      $('.pn-note', f).textContent = inviteUntil ? fill(T.pn_code_until, { date: clockText(inviteUntil, null, SOON, T.lang) }) : '';
      if (meFor !== uid()) loadMe(true);
    }
    function addCode(f) {
      var btn = $('.go', f), code = f.elements.code.value.replace(/\s+/g, '').toUpperCase();
      if (!REF_CODE.test(code)) return msg(f, T.pn_code_short, 'code');
      if (btn.disabled) return;
      msg(f, '');
      busy(btn, true);
      token().then(function (t) { return rest('rpc/apply_referral_code', t, { p_code: code }); }).then(function (res) {
        if (res !== 'ok') return msg(f, refWhy(res), 'code');
        store.del(REF);
        inviteUntil = null;
        drawMe();
        msg(f, T.inv_ok, null, 'ok');
      }, function (e) { if (!out(e)) msg(f, errText(e)); }).catch(noop).then(function () { busy(btn, false); });
    }

    // Delete account: the app's question, then delete-account (it waits while a trip, payout,
    // refund or invoice is still to come, and says which). The login is gone then, so only this
    // browser forgets it.
    function deletePane() {
      if ($('.pn-del', P.delete)) return msg(P.delete, '');
      P.delete.innerHTML = '<div class="pn-del"><span class="tempty-ic" aria-hidden="true">' + PI.trash + '</span>'
        + '<h3>' + esc(T.pn_delete_q) + '</h3><p>' + esc(T.pn_delete_p) + '</p></div>'
        + '<div class="msg" role="alert"></div>'
        + '<div class="t-two"><a class="btn ghost" href="#login">' + esc(T.pn_cancel) + '</a>'
        + '<button type="button" class="btn danger pn-del-yes">' + esc(T.pn_delete_yes) + '</button></div>';
      $('.pn-del-yes', P.delete).addEventListener('click', function () {
        var btn = this;
        if (btn.disabled) return;
        msg(P.delete, '');
        busy(btn, true, T.pn_deleting);
        token().then(function (t) { return callFn('delete-account', {}, t); }).then(function () {
          clearSession();
          store.del(DRAFT);
        }, function (e) { if (!out(e)) msg(P.delete, refusalText(e) || errText(e)); }).catch(noop).then(function () { busy(btn, false); });
      });
    }

    // Language: the header's language links, each opening this page in that language on Profile.
    function language() {
      P.language.innerHTML = '<div class="mlist pn-langs">' + $$('.top .lang .menu a').map(function (a) {
        var on = a.hasAttribute('aria-current');
        return '<a class="mi' + (on ? ' on' : '') + '" href="' + esc(a.getAttribute('href')) + '#login" hreflang="' + esc(a.getAttribute('hreflang') || '') + '"'
          + (on ? ' aria-current="true"' : '') + '><span class="mi-ic flagbox">' + ($('.flag', a) ? $('.flag', a).outerHTML : '') + '</span>'
          + '<span class="mi-t">' + esc($('span', a).textContent) + '</span><span class="mi-v">' + (on ? IC.ok : '') + '</span></a>';
      }).join('') + '</div>';
    }

    // Help: the home page's questions and answers, then where to write.
    function help() {
      if (P.help._lang === T.lang) return;
      P.help._lang = T.lang;
      P.help.innerHTML = spinner();
      var fromPage = function (pg) { return $$('#faq details', pg); };
      var have = page && $('#faq', page) ? Promise.resolve(fromPage(page).map(function (x) { return x.cloneNode(true); }))
        : sitePart('').then(fromPage);
      have.then(function (qs) {
        if (!qs.length) throw new Error('No questions');
        P.help.innerHTML = '<div class="pn-faq"></div><p class="pn-note">' + esc(T.pn_help_more).replace('{email}',
          '<a href="mailto:support@domivan.com">support@domivan.com</a>').replace('{report}', '<a href="#report">' + esc(T.pn_report) + '</a>')
          .replace('{legal}', '<a href="mailto:legal@domivan.com">legal@domivan.com</a>') + '</p>';
        qs.forEach(function (q) { q.open = false; $('.pn-faq', P.help).appendChild(q); });
      }).catch(function () { P.help._lang = null; oops(P.help, help); });
    }

    // Report content (#report): the DSA notice form (Art. 16(2)), open to everyone, signed in or not.
    // It posts to the content-report function: { where, reason, details, law, name, email, good_faith,
    // lang }, answered by { ok: true } or a refusal { error, code, params }. A sent report shows a thank
    // you until the visitor reports something else.
    function reportPane() {
      if (P.report._lang === T.lang) return;
      P.report._lang = T.lang;
      var field = function (k, label, max, type, ac) {
        return '<label><small>' + esc(label) + '</small><input name="' + k + '" type="' + (type || 'text') + '" maxlength="' + max + '"'
          + (ac ? ' autocomplete="' + ac + '"' : '') + '></label>';
      };
      var pick = function (v, label, on) {
        return '<label class="consent"><input type="radio" name="reason" value="' + v + '"' + (on ? ' checked' : '') + '><span>'
          + esc(label) + '</span></label>';
      };
      P.report.innerHTML = '<form class="pn-form rep" novalidate><p class="pn-note">' + esc(T.pn_rep_p) + '</p>'
        + '<fieldset class="rep-why"><legend><small>' + esc(T.pn_rep_reason) + '</small></legend>'
        + pick('illegal', T.pn_rep_illegal, true) + pick('terms', T.pn_rep_terms) + '</fieldset>'
        + '<label><small>' + esc(T.pn_rep_where) + '</small><textarea name="where" rows="2" maxlength="1000" placeholder="'
        + esc(T.pn_rep_where_ph) + '"></textarea></label>'
        + '<label><small>' + esc(T.pn_rep_details) + '</small><textarea name="details" rows="4" maxlength="3000"></textarea></label>'
        + '<div class="rep-law">' + field('law', T.pn_rep_law, 300) + '</div>'
        + field('name', T.pn_rep_name, 200, 'text', 'name') + field('email', T.pn_rep_email, 254, 'email', 'email')
        + '<label class="consent"><input type="checkbox" name="good_faith"><span>' + esc(T.pn_rep_faith) + '</span></label>'
        + '<div class="msg" role="alert"></div><button class="btn big go" type="submit">' + esc(T.pn_rep_send) + '</button>'
        + '<p class="pn-note">' + esc(T.pn_rep_112) + '</p></form>'
        + '<div class="rep-done" hidden><p class="pn-note">' + esc(T.pn_rep_done) + '</p>'
        + '<button type="button" class="btn ghost rep-again">' + esc(T.pn_rep_again) + '</button></div>';
      var form = $('form', P.report);
      // The law concerned is asked only for illegal content.
      form.addEventListener('change', function () { $('.rep-law', form).hidden = form.elements.reason.value !== 'illegal'; });
      form.addEventListener('submit', function (e) { e.preventDefault(); sendContentReport(form); });
      $('.rep-again', P.report).addEventListener('click', function () {
        form.reset();
        $('.rep-law', form).hidden = false;
        msg(form, '');
        $('.rep-done', P.report).hidden = true;
        form.hidden = false;
      });
    }
    // The fields the function would refuse are checked here first, in the visitor's language.
    var REP_FIELD = { report_where_missing: 'where', report_details_missing: 'details', report_good_faith_missing: 'good_faith',
      report_email_invalid: 'email' };
    var REP_ERR = { where: 'pn_rep_err_where', details: 'pn_rep_err_details', good_faith: 'pn_rep_err_faith', email: 'pn_rep_err_email' };
    function sendContentReport(form) {
      var btn = $('.go', form), v = function (k) { return form.elements[k].value.trim(); }, illegal = form.elements.reason.value !== 'terms';
      var body = { where: v('where'), reason: illegal ? 'illegal' : 'terms', details: v('details'), law: (illegal && v('law')) || null,
        name: v('name') || null, email: v('email') || null, good_faith: form.elements.good_faith.checked, lang: T.lang };
      var bad = !body.where ? 'where' : !body.details ? 'details'
        : body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ? 'email' : !body.good_faith ? 'good_faith' : null;
      if (bad) return msg(form, T[REP_ERR[bad]], bad);
      if (btn.disabled) return;
      msg(form, '');
      busy(btn, true, T.pn_rep_sending);
      callFn('content-report', body, KEY).then(function () {
        form.hidden = true;
        $('.rep-done', P.report).hidden = false;
      }, function (e) {
        var f = REP_FIELD[e.code];
        msg(form, f ? T[REP_ERR[f]] : e.code === 'report_too_long' ? fill(T.pn_rep_err_long, { max: (e.params && e.params.max) || '' })
          : !e.status ? T.err_network : rateLimited(e) ? T.err_rate : T.pn_rep_err, f);
      }).then(function () { busy(btn, false); });
    }

    // Feedback (#feedback): a suggestion, a problem, praise or anything else, from anyone, signed in
    // or not. It posts to the feedback function: { kind, message, name, email, lang }, answered by
    // { ok: true } or a refusal { error, code, params }. A suggestion is the first choice. A thank-you
    // shows until the visitor sends more.
    function feedbackPane() {
      if (P.feedback._lang === T.lang) return;
      P.feedback._lang = T.lang;
      var pick = function (v) {
        return '<label class="consent"><input type="radio" name="kind" value="' + v + '"' + (v === 'suggestion' ? ' checked' : '') + '><span>'
          + esc(T['pn_fb_' + v]) + '</span></label>';
      };
      P.feedback.innerHTML = '<form class="pn-form rep fb" novalidate><p class="pn-note">' + esc(T.pn_fb_p) + '</p>'
        + '<fieldset class="rep-why"><legend><small>' + esc(T.pn_fb_kind) + '</small></legend>'
        + ['suggestion', 'problem', 'praise', 'other'].map(pick).join('') + '</fieldset>'
        + '<label><small>' + esc(T.pn_fb_message) + '</small><textarea name="message" rows="5" maxlength="2000" placeholder="'
        + esc(T.pn_fb_message_ph) + '"></textarea></label>'
        + '<label><small>' + esc(T.pn_rep_name) + '</small><input name="name" type="text" maxlength="200" autocomplete="name"></label>'
        + '<label><small>' + esc(T.pn_fb_email) + '</small><input name="email" type="email" maxlength="254" autocomplete="email"></label>'
        + '<div class="msg" role="alert"></div><button class="btn big go" type="submit">' + esc(T.pn_fb_send) + '</button></form>'
        + '<div class="rep-done" hidden><p class="pn-note">' + esc(T.pn_fb_done) + '</p>'
        + '<button type="button" class="btn ghost fb-again">' + esc(T.pn_fb_again) + '</button></div>';
      var form = $('form', P.feedback);
      form.addEventListener('submit', function (e) { e.preventDefault(); sendFeedback(form); });
      $('.fb-again', P.feedback).addEventListener('click', function () {
        form.reset();
        msg(form, '');
        $('.rep-done', P.feedback).hidden = true;
        form.hidden = false;
      });
    }
    // What the function would refuse is checked here first, in the visitor's language.
    var FB_FIELD = { feedback_message_missing: 'message', feedback_email_invalid: 'email' };
    var FB_ERR = { kind: 'pn_fb_kind', message: 'pn_fb_err_message', email: 'pn_fb_err_email' };
    var FB_EMAIL = /^[^\s@?&=%,\/#:;<>()[\]\\"`\x7f]+@[^\s@?&=%,\/#:;<>()[\]\\"`\x7f]+\.[^\s@?&=%,\/#:;<>()[\]\\"`\x7f]+$/;
    function sendFeedback(form) {
      var btn = $('.go', form), v = function (k) { return form.elements[k].value.trim(); };
      var body = { kind: form.elements.kind.value || null, message: v('message'), name: v('name') || null, email: v('email') || null,
        lang: T.lang };
      // A plain address only, as the function and the database take it (no ? & = % , / # : ; brackets or quotes).
      var bad = !body.kind ? 'kind' : !body.message ? 'message'
        : body.email && !FB_EMAIL.test(body.email) ? 'email' : null;
      if (bad) return msg(form, T[FB_ERR[bad]], bad);
      if (btn.disabled) return;
      msg(form, '');
      busy(btn, true, T.pn_rep_sending);
      callFn('feedback', body, KEY).then(function () {
        form.hidden = true;
        $('.rep-done', P.feedback).hidden = false;
      }, function (e) {
        var f = FB_FIELD[e.code];
        msg(form, f ? T[FB_ERR[f]] : e.code === 'feedback_too_long' ? fill(T.pn_fb_err_long, { max: (e.params && e.params.max) || '' })
          : !e.status ? T.err_network : rateLimited(e) ? T.err_rate : T.pn_fb_err, f);
      }).then(function () { busy(btn, false); });
    }

    // A legal page, or Join Transporters: its own page's content, fetched once per language.
    function doc(name) {
      var key = T.home + name;
      if (P.doc._key === key) return docTitle();
      P.doc._key = key;
      P.doc.innerHTML = spinner();
      P.doc.scrollTop = 0;
      sitePart(name).then(function (pg) {
        var a = $('article.legal', pg);
        if (!a) throw new Error('Not a legal page');
        if (P.doc._key !== key) return;
        P.doc.innerHTML = '';
        P.doc.appendChild(a);
        docTitle();
      }).catch(function () { P.doc._key = null; oops(P.doc, function () { doc(name); }); });
    }
    function docTitle() {
      var h = $('article.legal h1', P.doc), v = viewOf(view);
      if (h && v && v.pane === 'doc') h2.textContent = h.textContent;
    }
    function join() {
      var key = T.home + 'join';
      if (P.join._key === key) return;
      P.join._key = key;
      P.join.innerHTML = spinner();
      sitePart('join').then(function (pg) {
        var box = $('.join-inner', pg), data = $('#join-data', pg), form = box && $('form.frame', box);
        if (!form || !data || P.join._key !== key) throw new Error('Not the Join page');
        form.removeAttribute('id'); // the page /join has its own
        P.join.innerHTML = '';
        P.join.appendChild(box);
        initJoin(form, JSON.parse(data.textContent));
      }).catch(function () { P.join._key = null; oops(P.join, join); });
    }

    function showView(instant) {
      var v = viewOf(view), signed = !!getSession(), was = shown, name = v.pane;
      if (v.auth && !signed) return;
      if (name === 'me') loadMe();
      else if (name === 'details') details();
      else if (name === 'invoices') invoices();
      else if (name === 'invite') invite();
      else if (name === 'delete') deletePane();
      else if (name === 'language') language();
      else if (name === 'help') help();
      else if (name === 'report') reportPane();
      else if (name === 'feedback') feedbackPane();
      else if (name === 'doc') doc(v.doc);
      else if (name === 'join') join();
      else if (name === 'trips') trips.list();
      else if (name === 'trip') trips.open(v.id);
      h2.textContent = name === 'me' ? T.pn_profile : name === 'trips' ? T.my_trips : name === 'trip' ? T.trip_h : name === 'join' ? T.pn_join
        : name === 'doc' ? T[DOC_T[v.doc]] : T['pn_' + name];
      if (name === 'doc') docTitle();
      var dir = !was ? 1 : depth(view) !== depth(was) ? (depth(view) > depth(was) ? 1 : -1) : TAB_ORDER(view) < TAB_ORDER(was) ? -1 : 1;
      shown = view;
      show(name, dir, instant);
    }
    function upArrow() {
      var v = viewOf(view);
      el.classList.toggle('has-up', !!parentOf(view) && !(v.auth && !getSession()));
    }

    function sync(instant) {
      var s = getSession(), v = viewOf(view);
      if (s) trips.user(uidOf(s));
      else {
        el.classList.remove('fresh');
        trips.user(null);
        me = meFor = inviteUntil = null; invRows = invFor = null;
        var df = $('form', P.details);
        if (df) { df.reset(); df._for = null; }
      }
      if (s) drawMe();
      if (s || !v.auth) showView(instant);
      else { shown = ''; h2.textContent = T.acct_h; if (!cur || !AUTH[cur.dataset.pane]) show(tab, -1, instant); }
      upArrow();
    }

    // Back from Google or Apple.
    function callback(cb) {
      var t = cb.tab === 'create' ? 'create' : 'login', b = $('.sso-btn.' + cb.p, P[t]);
      setTab(t, true);
      var fail = function () { busy(b, false); msg(P[t], fill(T.err_oauth, { provider: cb.name })); };
      if (!cb.pending) return fail();
      busy(b, true, T.signing_in);
      cb.pending.then(function (s) {
        busy(b, false);
        el.classList.add('fresh');
        setSession(s);
        signedIn();
      }).catch(fail);
    }

    // Started on: another tab or step than Log in, or a field in use (the keyboard is up).
    function used() {
      var f = d.activeElement;
      return cur !== P.login || (!!f && f !== el && el.contains(f) && /^(INPUT|TEXTAREA)$/.test(f.tagName) && f.type !== 'radio');
    }

    return {
      el: el, lang: T.lang, sync: sync, callback: callback, used: used,
      reset: function () { $$('.sso-btn', el).forEach(function (b) { busy(b, false); }); },
      // Shows the view for a panel address (see viewOf). Signed out, Log in shows first where the
      // view needs an account, and the view comes once signed in. The heading takes the focus when
      // the card slides to another view.
      route: function (h, instant) {
        var was = cur;
        view = h;
        sync(instant);
        if (cur !== was && was && !AUTH[was.dataset.pane] && !instant && el.isConnected && !el.classList.contains('off')) h2.focus({ preventScroll: true });
      }
    };
  }

  var acct = null;
  function account() {
    if (!acct || acct.lang !== T.lang) { acct = Account(); loadSettings(); }
    return acct;
  }
  // Dates without a time: when an invoice was made, and until when an invite code can still be
  // added (within the next 7 days, so no year).
  var DAY = { day: 'numeric', month: 'short', year: 'numeric' }, SOON = { day: 'numeric', month: 'short' };
  // Which of the app's tabs a view belongs to: My trips, then Profile, then the rest.
  function TAB_ORDER(h) { return h.indexOf('#trips') === 0 ? 1 : h.indexOf('#login') === 0 ? 2 : 3; }

  // An invoice (a PDF in the private invoices bucket) opens in a new tab through a link that
  // works for five minutes. The tab opens at the tap, so the browser doesn't block it.
  function openInvoice(path, failed) {
    var w = window.open('', '_blank');
    if (w) w.opener = null;
    refresh().then(function (s) {
      if (!s) throw new Error('Signed out');
      return fetch(SB + '/storage/v1/object/sign/invoices/' + path.split('/').map(encodeURIComponent).join('/'), {
        method: 'POST', body: JSON.stringify({ expiresIn: 300 }),
        headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }
      });
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); }).then(function (j) {
      if (!j || !j.signedURL) throw new Error('No link');
      var url = SB + '/storage/v1' + j.signedURL;
      if (w) w.location.href = url; else location.assign(url);
    }).catch(function () {
      if (w) w.close();
      failed();
    });
  }

  // The DomiVan Driver app's store buttons (Join Transporters once sent; the home page's own are in
  // scripts/site-template.html): "coming soon" until both store pages are public (DRIVER_APP.live).
  function driverBadges(ios, play) {
    var mark = '<span class="dmark" aria-hidden="true"><svg><use href="#mark"/></svg></span>';
    var one = function (small, store, url) {
      var inner = mark + '<span><small>' + esc(small) + '</small>' + store + '</span>';
      return DRIVER_APP.live ? '<a class="dstore" href="' + esc(url) + '" rel="noopener">' + inner + '</a>' : '<span class="dstore">' + inner + '</span>';
    };
    return '<div class="dstores">' + one(ios, 'App Store', DRIVER_APP.ios) + one(play, 'Google Play', DRIVER_APP.android) + '</div>';
  }

  // ---------------------------------------------------------------- the panel
  //
  // Its addresses are the views above. They form a stack, and so do their history entries: a
  // deeper view pushes the views between, its parent is the entry before it (au), and another
  // view of the same level (a tab, a sibling step) takes the entry's place, so Back and the back
  // arrow always go up one view. Entries pushed for the panel also carry ac: how many entries
  // back it was closed, when that is known, so closing it takes them all away.
  //
  // The panel is the account card in a frame over the page (.sheet): on computers on the right,
  // on phones the whole screen under the header. On a phone before signing in, Log in stands in
  // the home page's spot instead (like the app's first screen) until another view is opened.

  var loginOpen = false, sheet = null, scrim = null, tabbar = null;
  function acctHash(h) {
    h = h == null ? location.hash : h;
    return viewOf(h) ? h : '';
  }
  function here(h) { return location.pathname + location.search + (h || ''); }
  function deckOf(p) { return p && $('.deck', p); }
  function loginButton(on) { var b = $('.top .login'); if (b) b.classList.toggle('on', on); syncTabs(); }
  function closeLangMenus() { $$('details.lang[open]').forEach(function (x) { x.open = false; }); }
  function focusCard() { if (acct) acct.el.focus({ preventScroll: true }); }
  function inSheet() { return !!(acct && sheet && acct.el.parentNode === sheet); }
  // Where the card is: the home page's spot, or the card itself in the panel.
  function spot() { var p = acct.el.parentNode; return p && p.classList.contains('deck') ? p : acct.el; }

  function sheetBox() {
    if (!sheet) {
      scrim = d.createElement('div');
      scrim.className = 'scrim';
      scrim.hidden = true;
      scrim.addEventListener('click', function () { closeLogin({ ui: true }); });
      sheet = d.createElement('div');
      sheet.className = 'sheet';
      sheet.hidden = true;
      d.body.appendChild(scrim);
      d.body.appendChild(sheet);
    }
    return sheet;
  }
  // Once the panel is in, a phone shows the night map behind it instead of the page (like the
  // app's screens); the page comes back as the panel starts to leave (panel-over, landing.css).
  function openSheet(instant) {
    var sh = sheetBox();
    if (sh._end) sh._end();
    if (!sh.hidden) return root.classList.add('panel-over');
    sh.hidden = scrim.hidden = false;
    if (instant || !moves()) return root.classList.add('panel-over');
    var c = calm(), o = { duration: c ? 200 : 440, easing: EASE };
    sh.animate(c ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'translateX(105%)' }, { transform: 'none' }], o)
      .onfinish = function () { if (!sh.hidden && !sh._end) root.classList.add('panel-over'); };
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], o);
  }
  function closeSheet(instant) {
    var sh = sheet;
    if (!sh || (sh.hidden && !sh._end)) return;
    root.classList.remove('panel-over');
    var a = null, b = null;
    var end = function () {
      if (sh._end !== end) return;
      sh._end = null;
      if (a) a.cancel();
      if (b) b.cancel();
      sh.hidden = scrim.hidden = true;
      $$('.acct-copy', sh).forEach(function (x) { sh.removeChild(x); });
    };
    sh._end = end;
    if (instant || !moves()) return end();
    var c = calm(), o = { duration: c ? 200 : 380, easing: EASE, fill: 'forwards' };
    a = sh.animate(c ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none' }, { transform: 'translateX(105%)' }], o);
    b = scrim.animate([{ opacity: 1 }, { opacity: 0 }], o);
    a.onfinish = end;
  }
  // The card goes into the panel. Coming from the home page's spot (a phone before signing in),
  // it leaves a still copy there, so nothing under the panel moves.
  function mountInSheet(instant) {
    var a = account(), sh = sheetBox(), from = a.el.parentNode;
    if (from !== sh) {
      // A copy left by the last panel (still sliding away), or the card of the language before.
      $$('.acct', sh).forEach(function (x) { sh.removeChild(x); });
      if (from && from.classList.contains('deck')) leaveCopy(a.el);
      else if (from) from.removeChild(a.el);
      setOn(a.el, true);
      a.el.classList.remove('gate');
      sh.appendChild(a.el);
    }
    a.route(acctHash() || '#login', true);
    openSheet(instant);
    syncTabs();
  }

  function mountInDeck(deck, instant) {
    var a = account(), copy = $('.acct-copy', deck);
    if (deck._end) deck._end();
    var from = a.el.parentNode;
    if (from && from !== deck) { if (from === sheet) leaveCopy(a.el); else from.removeChild(a.el); } // the panel slides away with a copy
    if (copy) { // back from the panel: in place of its still copy
      setOn(a.el, true);
      deck.replaceChild(a.el, copy);
    } else if (from !== deck) {
      setOn(a.el, false);
      deck.appendChild(a.el);
    }
    a.route(acctHash() || '#login', true);
    a.el.classList.toggle('gate', gated());
    if (deck._front === a.el) return;
    swap(deck, $('.book', deck), a.el, 1, instant, function () {
      if (deck._front === a.el && gated()) setSolo(deck, true, instant);
    });
  }
  // A still copy of the card where it was (the home page's spot while the card is in the panel,
  // or the panel while it slides away after the card went back to the spot).
  function leaveCopy(el) {
    if (!el.isConnected) return;
    var c = el.cloneNode(true);
    $$('[id], [name]', c).forEach(function (x) { x.removeAttribute('id'); x.removeAttribute('name'); });
    c.classList.add('acct-copy');
    c.setAttribute('inert', '');
    c.setAttribute('aria-hidden', 'true');
    el.parentNode.replaceChild(c, el);
  }
  // Signed in while the card was in the panel: the home page's spot gets Book your trip back.
  function restoreBook(deck) {
    var copy = $('.acct-copy', deck), book = $('.book', deck);
    if (deck._end) deck._end();
    if (copy) deck.removeChild(copy);
    deck.classList.remove('solo');
    setOn(book, true);
    deck._front = book;
    relayoutMap();
  }
  // Book your trip comes back into the home page's spot. Once the account card has slid away it
  // leaves the spot, so the booking card keeps its own height. On phones, after signing in on
  // the card that stood alone there, Book your trip comes next (from the right) and the spot
  // grows to it.
  function toBook(deck, instant) {
    var a = acct;
    if (deck._end) deck._end();
    var solo = deck.classList.contains('solo');
    a.el.classList.remove('gate');
    swap(deck, a.el, $('.book', deck), solo ? 1 : -1, instant, function () {
      deck.classList.remove('solo');
      if (!loginOpen && a.el.parentNode === deck) deck.removeChild(a.el);
    }, solo ? deck.offsetHeight : null);
  }
  // Phones before signing in: the account card alone in the spot, at its own height.
  function setSolo(deck, on, instant) {
    if (deck.classList.contains('solo') === on) return;
    var h0 = deck.offsetHeight;
    deck.classList.toggle('solo', on);
    if (!instant) fit(deck, h0);
    relayoutMap();
  }
  // Signed out on a phone: the home page shows Log in / Create account first, like the app.
  function gated() { return PHONE.matches && !getSession(); }
  // Puts the right card in the home page's spot: the account card while a phone visitor hasn't
  // signed in (or is being welcomed there), else Book your trip. Run when the page is shown,
  // when the session changes and when the window crosses the phone width. While the card is in
  // the panel the spot waits (closeLogin puts it right).
  function syncDeck(instant) {
    var deck = deckOf(page);
    syncTabs();
    if (!deck || inSheet()) return;
    var g = gated();
    if (g && !(acct && deck._front === acct.el)) mountInDeck(deck, instant);
    var a = acct;
    if (!a || deck._front !== a.el) return;
    var fresh = a.el.classList.contains('fresh') && !!getSession(), solo = deck.classList.contains('solo'), h = acctHash();
    if (!g && !loginOpen) {
      if (fresh) loginOpen = true; // just signed in on it: the welcome shows, then signedIn() moves on to Book your trip
      else if (getSession() || !a.used()) { loginButton(false); return toBook(deck, instant); }
      else { // the layout widened (a phone turned sideways) mid sign-in: it moves into the panel
        loginOpen = true;
        history.replaceState(history.state, '', here('#login'));
        mountInSheet(true);
        return restoreBook(deck);
      }
    }
    // No back arrow during the welcome either: it moves on by itself. Signed in on the way to My
    // trips, the card takes the spot's full height at once (the list scrolls inside it).
    var alone = g || (fresh && solo && (!h || h === '#login'));
    a.el.classList.toggle('gate', alone);
    if (!deck._end) setSolo(deck, alone, instant);
    loginButton(true);
  }
  // The home page's booking card comes back when the page is shown again.
  function resetDeck(p) {
    var deck = deckOf(p);
    if (!deck) return;
    if (deck._end) deck._end();
    $$('.acct', deck).forEach(function (x) { x.classList.remove('gate'); deck.removeChild(x); });
    deck.classList.remove('solo');
    setOn($('.book', deck), true);
    deck._front = null;
  }
  // Scrolls the home page's card spot into view (phones show it below the headline).
  // instant: when the page opens on the card (a #login link, back from Google or Apple).
  function reveal(el, instant) {
    var r = el.getBoundingClientRect(), top = headerH(), y = window.scrollY + r.top - top - 12;
    if (r.top < top || r.top > window.innerHeight * 0.45) {
      if (instant) jump(y);
      else window.scrollTo({ top: y, behavior: calm() ? 'auto' : 'smooth' });
    }
  }

  // The panel on a view (Profile, or Log in, unless o.view says otherwise). On a phone before
  // signing in, a view that needs an account shows Log in in the home page's spot.
  function openLogin(o) {
    o = o || {};
    var deck = deckOf(page), h = o.view || '#login', v = viewOf(h);
    if (loginOpen) return o.fromUrl ? routeView(h) : goAccount(h);
    var inDeck = !!deck && gated() && v.auth && !inSheet();
    if (inDeck && !o.fromUrl && h === '#login') { // phones: the card is already there, Log in first
      syncDeck(true);
      reveal(deck, o.instant);
      return focusCard();
    }
    if (!o.fromUrl && acctHash() !== h) {
      if (o.replace) history.replaceState(Object.assign({}, history.state, { au: null, ac: null }), '', here(h));
      else pushViews('', h);
    }
    loginOpen = true;
    loginButton(true);
    closeLangMenus();
    if (inDeck) {
      mountInDeck(deck, o.instant);
      reveal(deck, o.instant);
    } else mountInSheet(o.instant);
    focusCard();
  }
  // Pushes the history entries for the views from `from` (a view above h, or none) down to h.
  // The booking card stays on its step in all of them.
  function pushViews(from, h) {
    var st = history.state || {}, ac = from ? st.ac : 0, segs = h.split('/');
    history.replaceState(Object.assign({}, st, { y: window.scrollY }), '');
    for (var i = depth(from); i < segs.length; i++) {
      if (ac != null) ac++;
      history.pushState({ dv: stamp(), y: 0, bk: st.bk, au: i > 0, ac: ac }, '', here(segs.slice(0, i + 1).join('/')));
    }
  }
  // Shows a view in the panel; a view opened from the card in the home page's spot moves it
  // into the panel (a phone before signing in keeps Log in there).
  function routeView(h) {
    var deck = deckOf(page);
    if (!inSheet() && !(deck && acct && acct.el.parentNode === deck && gated() && viewOf(h).auth)) return mountInSheet();
    acct.route(h);
    syncTabs();
  }
  // Another view (a link to #login, #trips, a trip, a Profile step, a legal page...). Opens the
  // panel if it is closed.
  function goAccount(h) {
    if (!loginOpen) return openLogin({ view: h });
    var now = acctHash(), st = history.state || {};
    if (h !== now && routing) {
      if (!now || under(h, now)) pushViews(now, h);
      else if (parentOf(now) === h && st.au) return history.back(); // popstate shows it
      else history.replaceState(Object.assign({}, st, { au: parentOf(h) && parentOf(h) === parentOf(now) ? st.au : null }), '', here(h));
    }
    routeView(h);
    if (!inSheet()) reveal(spot());
  }
  // The back arrow: up one view (a trip to My trips, a Profile step to Profile); from a view at
  // the top, or from Log in, the panel closes.
  function accountBack() {
    var now = acctHash(), up = parentOf(now), st = history.state || {};
    if (!up || (viewOf(now).auth && !getSession())) return closeLogin({ ui: true });
    if (routing && st.au) return history.back(); // popstate shows the view above
    goAccount(up);
  }
  // The header button (Log In / Create Account, or the first name once signed in) opens Profile.
  // From any other view it goes to Profile, and when the panel already shows that, it closes
  // it. A double click opens it once; a card scrolled out of sight is brought back instead.
  var tapAt = 0;
  function accountButton() {
    var quick = Date.now() - tapAt < 600;
    tapAt = Date.now();
    if (!loginOpen) return openLogin();
    if (quick) return;
    if (acctHash() && acctHash() !== '#login') return goAccount('#login');
    if (!inSheet()) {
      var r = acct.el.getBoundingClientRect();
      if (r.bottom < headerH() + 80 || r.top > window.innerHeight - 80) { reveal(spot()); return focusCard(); }
    }
    closeLogin({ ui: true });
  }

  function closeLogin(o) {
    o = o || {};
    if (!loginOpen) return;
    cancelAutoClose();
    // Escape, the back arrow or the header button: keyboard focus goes back to the header button.
    if (o.ui && o.focus !== false) { var b = $('.top .login'); if (b) b.focus({ preventScroll: true }); }
    if (o.ui && acctHash()) {
      var st = history.state || {};
      if (routing && st.ac > 0) { history.go(-st.ac); return; } // popstate closes it, so Back doesn't reopen it
      history.replaceState(Object.assign({}, st, { au: null, ac: null }), '', here());
    }
    loginOpen = false;
    loginButton(false);
    var a = acct, deck = deckOf(page);
    if (a && inSheet()) {
      closeSheet(o.instant);
      if (deck && gated()) mountInDeck(deck, true); // a phone before signing in: Log in in the spot again
      else if (deck && $('.acct-copy', deck)) restoreBook(deck);
    } else if (a && deck && a.el.parentNode === deck) {
      if (gated()) syncDeck(o.instant); else toBook(deck, o.instant); // phones stay on the card until signed in
    }
    if (a) setTimeout(function () { if (!loginOpen) a.el.classList.remove('fresh'); }, 600);
    var bk = curBook();
    if (bk) bk.loginClosed();
  }

  // The URL changed (Back, Forward, a typed #hash): the panel follows it.
  function syncLogin() {
    var h = acctHash();
    if (h && !loginOpen) openLogin({ fromUrl: true, view: h });
    else if (!h && loginOpen) closeLogin();
    else if (h) routeView(h);
  }

  // Signed in from the account card: on the home page, slide back to Book your trip after a
  // moment (not on the way to another view). Tapping anything in the card, or leaving the page,
  // cancels that.
  var autoClose = 0;
  function cancelAutoClose() { clearTimeout(autoClose); autoClose = 0; }
  function signedIn() {
    var s = getSession();
    if (s) fetchName(s);
    cancelAutoClose();
    if (loginOpen && deckOf(page) && (acctHash() || '#login') === '#login') {
      autoClose = setTimeout(function () {
        autoClose = 0;
        if (loginOpen && getSession() && deckOf(page)) closeLogin({ ui: true, focus: false });
      }, 1600);
    }
  }

  // ---------------------------------------------------------------- the app's menu
  //
  // New trip, My trips and Profile, as in the client app (a floating bar, the open one in gold).
  // New trip is Book your trip on the home page; the others open the panel. Phones show it once
  // signed in, like the app (before, Log in is the first screen).
  var TABS = [
    ['new', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 7.5v9M7.5 12h9" stroke="#0A1122" stroke-width="2.2" stroke-linecap="round"/></svg>'],
    ['trips', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 5h11a3 3 0 0 1 3 3v1.5h-17V8a3 3 0 0 1 3-3zM3.5 11h17v6.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3z" fill="currentColor"/><path d="M8 3v3.5M16 3v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.3h.01M12 17.3h.01" stroke="#0A1122" stroke-width="2.4" stroke-linecap="round"/></svg>'],
    ['me', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.3 18.6c1.3-2.2 3.3-3.3 5.7-3.3s4.4 1.1 5.7 3.3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><circle cx="12" cy="10" r="3.4" fill="#0A1122"/><path d="M6 18.8c1.4-2.4 3.5-3.6 6-3.6s4.6 1.2 6 3.6" fill="#0A1122"/></svg>']
  ];
  function syncTabs() {
    if (!tabbar) return;
    if (tabbar._lang !== T.lang) {
      tabbar._lang = T.lang;
      tabbar.setAttribute('aria-label', T.pn_profile);
      var href = { new: T.home, trips: '#trips', me: '#login' }, label = { new: T.pn_new, trips: T.pn_trips, me: T.pn_profile };
      tabbar.innerHTML = TABS.map(function (t) {
        return '<a href="' + esc(href[t[0]]) + '" data-tab="' + t[0] + '"><span class="chip"><i class="o">' + t[1] + '</i><i class="f">' + t[2] + '</i></span>'
          + '<span>' + esc(label[t[0]]) + '</span></a>';
      }).join('');
    }
    var h = loginOpen && inSheet() ? acctHash() || '#login' : '', on = !h ? 'new' : h.indexOf('#trips') === 0 ? 'trips' : h.indexOf('#login') === 0 ? 'me' : '';
    $$('a', tabbar).forEach(function (a) {
      var x = a.dataset.tab === on;
      a.classList.toggle('on', x);
      if (x) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    tabbar.hidden = gated();
    root.classList.toggle('has-tabs', !tabbar.hidden);
  }
  // New trip: Book your trip on the home page (the panel closes); from another page, home.
  function newTrip() {
    var deck = deckOf(page);
    if (!deck) {
      if (routing) navigate(T.home, { push: true, dir: -1 }); else location.assign(T.home);
      return;
    }
    if (loginOpen && inSheet()) closeLogin({ ui: true, focus: false });
    reveal(deck);
  }
  // A link to Join Transporters or a legal page opens its panel; under Profile or Join
  // Transporters a legal page is one of their steps, so the back arrow returns there.
  function panelOf(u) {
    var m = /^\/(?:(ro|pl|bg|hu|es|fr|de|nl|pt)\/)?(join|terms|privacy|transporter-terms|delete-account)(?:\.html)?$/.exec(u.pathname);
    if (!m || (m[1] ? '/' + m[1] + '/' : '/') !== T.home) return '';
    if (m[2] === 'join') return '#join';
    var top = loginOpen && inSheet() ? (acctHash() || '').split('/')[0] : '';
    return (top === '#login' || top === '#join' ? top + '/' : '#') + m[2];
  }

  // ---------------------------------------------------------------- router

  // Home, /join and the legal pages, in every language (/ro/, /ro/join, /ro/terms, ...).
  var SITE = /^\/(?:(?:ro|pl|bg|hu|es|fr|de|nl|pt)\/)?(?:index\.html|(?:join|terms|privacy|transporter-terms|delete-account)(?:\.html)?)?$/;
  var routing = !!(window.fetch && window.DOMParser && history.pushState && window.URLSearchParams);
  var htmlCache = {}, screens = {}, ys = {}, meta = null, curKey = '', hIdx = 0, navSeq = 0;

  function anchor(p, hash) { try { return p.querySelector(hash); } catch (e) { return null; } }
  function yOf(el) {
    while (el.parentElement && !el.getClientRects().length) el = el.parentElement; // #book while the account card stands in for it
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerH() - 8);
  }

  // A link to one of the site's own pages, or null.
  function sitePage(a) {
    if (!a || !a.href || a.hasAttribute('download') || (a.target && a.target !== '_self')) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    return u.origin === location.origin && SITE.test(u.pathname) ? u : null;
  }
  function stamp() { hIdx = Math.max(hIdx + 1, Date.now()); return hIdx; }
  // A link to the page we are on. Visitors from ads and social links arrive with ?fbclid=,
  // ?gclid= or ?utm_..., while the header links have no query: same page all the same.
  function samePage(u) { return u.pathname === location.pathname && (!u.search || u.search === location.search); }

  function load(key) {
    if (!htmlCache[key]) {
      htmlCache[key] = fetch(key, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok || !/text\/html/.test(r.headers.get('content-type') || '')) throw new Error('HTTP ' + r.status);
        return r.text().then(function (text) { return { text: text, url: r.url }; });
      });
      htmlCache[key].catch(function () { delete htmlCache[key]; });
    }
    return htmlCache[key];
  }
  function metaOf(doc) {
    var bar = doc.querySelector('.top .bar'), desc = doc.querySelector('meta[name=description]');
    var can = doc.querySelector('link[rel=canonical]');
    return {
      lang: doc.documentElement.lang, title: doc.title, desc: desc ? desc.content : '',
      canon: can ? can.getAttribute('href') : '', bar: bar.innerHTML, menu: $('.lang .menu', bar).innerHTML,
      cur: $$('nav > a', bar).map(function (a) { return a.hasAttribute('aria-current'); }), t: readT(doc)
    };
  }
  function parse(res) {
    var doc = new DOMParser().parseFromString(res.text, 'text/html'), main = doc.getElementById('page');
    if (!main || !doc.querySelector('.top .bar .lang .menu')) throw new Error('Not a site page');
    var u = new URL(res.url, location.href);
    return { key: u.pathname + u.search, meta: metaOf(doc), page: d.adoptNode(main) };
  }

  // Title, language, description and the header's language links for the next page.
  function applyChrome(m) {
    d.title = m.title;
    root.lang = m.lang;
    var desc = $('meta[name=description]'), can = $('link[rel=canonical]'), bar = $('.top .bar');
    if (desc) desc.content = m.desc;
    if (can && m.canon) can.setAttribute('href', m.canon);
    if (m.lang !== meta.lang) {
      bar.innerHTML = m.bar; // another language: new labels, same place
      T = m.t;
      authChanged(true);
    } else {
      $('.lang .menu', bar).innerHTML = m.menu;
      $$('nav > a', bar).forEach(function (a, i) {
        if (m.cur[i]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
    }
    closeLangMenus();
    meta = m;
  }

  // Keeps the page we are leaving (and where it was scrolled to) for Back and Forward.
  function leave() {
    ys[hIdx] = window.scrollY;
    screens[hIdx] = { key: curKey, meta: meta, page: page };
    var keys = Object.keys(screens).map(Number).sort(function (x, y) { return y - x; });
    keys.slice(12).forEach(function (k) { delete screens[k]; });
  }

  function navigate(href, o) {
    var u = new URL(href, location.href), key = u.pathname + u.search, seq = ++navSeq;
    if (o.push) { leave(); history.replaceState(Object.assign({}, history.state, { y: ys[hIdx] }), ''); }
    var kept = o.pop && screens[hIdx];
    var ready = kept && kept.key === key ? Promise.resolve(kept) : load(key).then(parse);
    ready.then(function (next) {
      if (seq !== navSeq) return;
      if (o.push) history.pushState({ dv: stamp(), y: 0 }, '', next.key + u.hash);
      if (o.replace) history.replaceState(Object.assign({}, history.state, { y: 0 }), '', next.key + u.hash);
      arrive(next, o.dir, u.hash, o.y || 0);
    }).catch(function () {
      if (seq !== navSeq) return;
      if (o.push) location.assign(href); else if (o.replace) location.replace(href); else location.reload();
    });
  }

  // Screen readers hear the new page's title. Keyboard focus moves to the new page's heading
  // when it was on the page that left (a footer or legal link) or nowhere.
  var live = null;
  function announce(text) {
    if (!live) {
      live = d.createElement('div');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      d.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 80);
  }
  function focusPage(p, old) {
    var a = d.activeElement;
    if (a && a !== d.body && a.isConnected && !(old && old.contains(a))) return;
    var h = $('h1', p) || p;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }

  function arrive(next, dir, hash, y) {
    var from = screen, prev = page, open = acctHash(hash);
    loginOpen = false;
    closeSheet(true); // a panel over the page that leaves goes with it
    loginButton(false);
    applyChrome(next.meta);
    page = next.page;
    curKey = next.key;
    if (!open && hash && !y) y = function () { var el = anchor(page, hash); return el ? yOf(el) : 0; };
    syncDeck(true);
    slideScreen(from, page, dir, y, function () { if (prev !== page) resetDeck(prev); });
    initPage(page, true);
    renderInvite();
    if (open) openLogin({ fromUrl: true, instant: true, view: open }); // Back or Forward onto an open panel, or a language picked in Profile
    else focusPage(page, from);
    announce(d.title);
    askLive();
  }

  function onClick(e) {
    $$('details.lang[open]').forEach(function (x) { if (!x.contains(e.target)) x.open = false; });
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var app = a.hasAttribute('data-driver-app') && driverStore();
    if (app) { // phones: the browser follows the link to the store (and it is /join again right after)
      cancelAutoClose();
      var href = a.getAttribute('href');
      if (/apple\.com/.test(app)) copyRef(); // an invite code goes along (toStore)
      a.setAttribute('href', toStore(app));
      setTimeout(function () { a.setAttribute('href', href); });
      return;
    }
    if (a.hasAttribute('data-login')) { e.preventDefault(); accountButton(); return; }
    if (a.dataset.tab === 'new') { e.preventDefault(); newTrip(); return; }
    var u = sitePage(a);
    if (!u) { cancelAutoClose(); return; } // leaving for /book or another site: nothing may pull us back
    var pv = !samePage(u) && routing && panelOf(u);
    if (pv) { e.preventDefault(); goAccount(pv); return; } // Join Transporters or a legal page: its panel
    if (samePage(u)) { // this page
      if (acctHash(u.hash)) { e.preventDefault(); goAccount(acctHash(u.hash)); return; } // a view of the account card
      if (!u.hash) {
        e.preventDefault();
        if (loginOpen) closeLogin({ ui: true, focus: false });
        else window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
        return;
      }
      // An #anchor on this page: scroll to it (no page change), keeping our state in history.
      var target = anchor(page, u.hash);
      if (!target || screen !== page || !routing) return;
      e.preventDefault();
      if (loginOpen) closeLogin();
      var y = yOf(target);
      history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), '');
      history.pushState({ dv: stamp(), y: y, bk: (history.state || {}).bk }, '', u.hash);
      window.scrollTo({ top: y, behavior: calm() ? 'auto' : 'smooth' });
      return;
    }
    if (!routing) { cancelAutoClose(); return; }
    e.preventDefault();
    navigate(u.href, { push: true, dir: 1 });
  }

  function onPop(e) {
    var st = e.state || {}, to = st.dv;
    if (location.pathname + location.search === curKey) { // only the #hash changed, or a booking step
      var was = loginOpen, bk = curBook();
      if (to != null) hIdx = to;
      syncLogin();
      if (bk && bk.pop((history.state || {}).bk || 'trip')) return;
      if (!was && !loginOpen && st.y != null) window.scrollTo({ top: st.y, behavior: calm() ? 'auto' : 'smooth' });
      return;
    }
    var dir = to != null && to < hIdx ? -1 : 1;
    leave();
    if (to != null) hIdx = to;
    navigate(location.href, { pop: true, dir: dir, y: ys[hIdx] != null ? ys[hIdx] : st.y || 0 });
  }

  // The DomiVan Driver app's page in the store this phone uses, or '' (computers, tablets in the
  // two-column layout and other phones keep the Join Transporters form). iPads asking for the
  // desktop site say Macintosh, but have a touch screen.
  function driverStore() {
    if (!DRIVER_APP.live || !HANDHELD.matches) return '';
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return DRIVER_APP.ios;
    if (/Android/.test(ua)) return DRIVER_APP.android;
    return '';
  }

  // Fetches a page as soon as a pointer or finger lands on its link.
  function warm(e) {
    var a = e.target.closest && e.target.closest('a'), u = a && sitePage(a);
    if (u && !samePage(u)) load(u.pathname + u.search);
  }

  // ---------------------------------------------------------------- language card

  // Every visit: before anything else a visitor who is not signed in picks a language, like the
  // apps at each start (src/components/language-sheet.tsx). A card in the middle of the page,
  // under it a white veil that softens the page; the ten languages in their own words (the
  // header's language menu: same order, flags and links), the kept choice first and highlighted
  // (else the browser's own), and the question in that language (T.gate_q). Nothing behind it
  // can be clicked, scrolled or reached with the keyboard, and Escape doesn't close it. The pick
  // is kept where the apps keep theirs on the web (domivan.language, which /book reads too: one
  // choice for the whole site) and marked for this visit (domivan.language-asked in
  // sessionStorage, which /book reads too), then the site goes to this page in that language,
  // with its #panel. A visit is a tab that came from outside the site (typed in, a link from
  // elsewhere, an invite link); its reloads, and tabs opened from the site's own pages, are the
  // same visit. The language menu and Profile › Language keep the choice up to date. The page
  // stays plain HTML under the card, for search engines and visitors without JavaScript. Not
  // asked, this page's language kept: a page the apps opened (?app=1, already in the app's
  // language), a visitor signed in (paying needs it too) or back from a Google or Apple sign-in
  // or a payment (they have been here before), and a browser that keeps nothing (the card would
  // come back on every page). A visitor with a choice who isn't asked (signed in, or later in the
  // visit) and comes to an English page from outside the site (typed domivan.com, an unprefixed
  // link) gets that page in their language; a /xx/ address stays as it is.
  var LANG_KEY = 'domivan.language';
  var LANG_ASKED = 'domivan.language-asked';
  var LANG_CODES = ['en', 'ro', 'pl', 'bg', 'hu', 'es', 'fr', 'de', 'nl', 'pt'];
  var LANG_PATH = new RegExp('^/(' + LANG_CODES.slice(1).join('|') + ')/');
  var gate = null;
  function keptLang() { var v = store.get(LANG_KEY); return LANG_CODES.indexOf(v) >= 0 ? v : null; }
  function keepLang(code) { if (LANG_CODES.indexOf(code) >= 0) store.set(LANG_KEY, code); }
  function askedThisVisit() { try { return sessionStorage.getItem(LANG_ASKED) === '1'; } catch (e) { return false; } }
  function markAsked() { try { sessionStorage.setItem(LANG_ASKED, '1'); } catch (e) {} }
  // Whether this browser keeps what the site stores, for good and for the visit (some private
  // modes refuse it).
  function storageKeeps() {
    try {
      localStorage.setItem('domivan-check', '1');
      sessionStorage.setItem('domivan-check', '1');
      var ok = localStorage.getItem('domivan-check') === '1' && sessionStorage.getItem('domivan-check') === '1';
      localStorage.removeItem('domivan-check');
      sessionStorage.removeItem('domivan-check');
      return ok;
    } catch (e) { return false; }
  }
  // A page the apps opened (openLegal, src/lib/legal-url.ts fromApp) says so with ?app=1. Read and
  // taken off the address before the page starts, like ?r=.
  function takeApp() {
    if (!window.URLSearchParams) return false;
    var q = new URLSearchParams(location.search);
    if (!q.has('app')) return false;
    q.delete('app');
    var rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    return true;
  }
  function fromSite() {
    try { return !!d.referrer && new URL(d.referrer).origin === location.origin; } catch (e) { return false; }
  }
  // The first of the browser's languages (de, de-AT) the site has, or null.
  function browserLang() {
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < langs.length; i++) {
      var c = String(langs[i] || '').split(/[-_]/)[0].toLowerCase();
      if (LANG_CODES.indexOf(c) >= 0) return c;
    }
    return null;
  }

  // o: { app, back (a sign-in or payment coming back), signedIn, invite (an invite link, which
  // comes through 404.html: a new visit, though the address it came from is the site's) }.
  function langGate(o) {
    var here = root.lang, kept = keptLang(), hrefs = {}, outside = o.invite || !fromSite();
    var links = $$('.top .lang .menu a[hreflang]').filter(function (a) { return LANG_CODES.indexOf(a.getAttribute('hreflang')) >= 0; });
    links.forEach(function (a) { hrefs[a.getAttribute('hreflang')] = a.href; });
    if (o.app || o.back || (o.signedIn && !kept)) { if (!kept) keepLang(here); return; }
    if (kept && (o.signedIn || askedThisVisit() || !outside)) {
      if (kept !== here && hrefs[kept] && !LANG_PATH.test(location.pathname) && outside) goLang(kept, hrefs);
      return;
    }
    if (links.length < 2 || !storageKeeps()) return;
    var first = kept || browserLang(), q = T.gate_q || {}, ask = q[first] ? first : q[here] ? here : 'en';
    links.sort(function (a, b) { return (b.getAttribute('hreflang') === first) - (a.getAttribute('hreflang') === first); });

    var el = d.createElement('div');
    el.className = 'lgate';
    el.innerHTML = '<div class="lgate-card" role="dialog" aria-modal="true" aria-labelledby="lgate-h">'
      + '<span class="logo"><svg aria-hidden="true"><use href="#mark"/></svg></span>'
      + '<h2 id="lgate-h" lang="' + esc(ask) + '">' + esc(q[ask] || '') + '</h2>'
      + '<div class="lgate-list">' + links.map(function (a) {
        var c = a.getAttribute('hreflang'), flag = $('.flag', a);
        return '<button type="button" data-lang="' + esc(c) + '" lang="' + esc(c) + '"' + (c === first ? ' class="on"' : '') + '>'
          + (flag ? flag.outerHTML : '') + '<span>' + esc($('span', a).textContent) + '</span></button>';
      }).join('') + '</div></div>';

    // Everything else on the page is out of reach while the card is up, also what opens later
    // (the browser's Back can still change the #panel under it).
    var shut = [];
    var shutOut = function (x) {
      if (x === el || x.nodeType !== 1 || x.tagName === 'SCRIPT' || x.hasAttribute('inert')) return;
      x.setAttribute('inert', '');
      shut.push(x);
    };
    $$('body > *').forEach(shutOut);
    root.classList.add('lgated');
    d.body.appendChild(el);
    var watch = window.MutationObserver && new MutationObserver(function (list) {
      list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, shutOut); });
      if (gate && !el.contains(d.activeElement)) $('button', el).focus({ preventScroll: true });
    });
    if (watch) watch.observe(d.body, { childList: true });
    gate = { el: el, shut: shut, watch: watch };
    var buttons = $$('button', el);
    buttons[0].focus({ preventScroll: true });

    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-lang]');
      if (b) pickLang(b.getAttribute('data-lang'), hrefs);
    });
    // Arrows move between the languages (up and down by a row), Tab goes round inside the card.
    el.addEventListener('keydown', function (e) {
      var i = buttons.indexOf(d.activeElement), cols = 1;
      if (buttons[1] && buttons[1].offsetTop === buttons[0].offsetTop) cols = 2;
      var to = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (to && i >= 0) {
        e.preventDefault();
        buttons[Math.min(buttons.length - 1, Math.max(0, i + to))].focus();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
    });
  }
  // While the card is up: Escape does nothing (not even close a panel under it), and focus that
  // lands outside it goes back in.
  function gateKeys(e) {
    if (!gate || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function gateFocus(e) {
    if (gate && !gate.el.contains(e.target)) $('button', gate.el).focus({ preventScroll: true });
  }

  function pickLang(code, hrefs) {
    if (!gate) return;
    keepLang(code);
    markAsked();
    var el = gate.el;
    if (gate.watch) gate.watch.disconnect();
    gate.shut.forEach(function (x) { x.removeAttribute('inert'); });
    root.classList.remove('lgated');
    gate = null;
    var gone = function () { if (el.parentNode) el.parentNode.removeChild(el); };
    var a = d.activeElement;
    if (a && el.contains(a)) a.blur(); // the page (or its panel) takes the focus next
    el.classList.add('out');
    if (moves() && !calm()) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).onfinish = gone;
      setTimeout(gone, 400); // a tab in the background runs no animations
    } else gone();
    if (code === root.lang || !hrefs[code]) {
      if (loginOpen) focusCard(); else focusPage(page);
      return;
    }
    goLang(code, hrefs);
  }
  // This page in another language, with its #panel, in place of this one (no Back to it).
  function goLang(code, hrefs) {
    var href = hrefs[code].split(/[?#]/)[0] + location.search + location.hash;
    if (routing) navigate(href, { replace: true, dir: 1 });
    else location.replace(href);
  }

  // The header's language menu and Profile › Language: the visitor's new choice, for the site and /book.
  function langLinkClick(e) {
    var a = e.target.closest && e.target.closest('.lang .menu a[hreflang], .pn-langs a[hreflang]');
    if (a) keepLang(a.getAttribute('hreflang'));
  }

  // ---------------------------------------------------------------- start

  function start() {
    stage = $('#stage');
    page = $('#page');
    screen = page;
    if (!stage || !page) return;
    meta = metaOf(d);
    var cb = takeCallback();
    oauthBack = !!cb;
    takeBooked();
    var invited = /[?&]r=/.test(location.search); // for the language card (below), before takeRef takes it off
    takeRef();
    var fromApp = takeApp(), back = !!(cb || stripeBack);
    curKey = location.pathname + location.search;
    var st = history.state || {};
    hIdx = st.dv != null ? st.dv : stamp();
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    history.replaceState(Object.assign({}, st, { dv: hIdx }), '');

    initPage(page, false);
    askLive();
    d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'visible') askLive(); });
    tabbar = d.createElement('nav');
    tabbar.className = 'tabbar';
    d.body.appendChild(tabbar);
    authChanged(true);
    syncDeck(true);
    refresh().then(function (s) { if (s) fetchName(s); startRef(); });

    if (cb) { openLogin({ replace: true, instant: true }); acct.callback(cb); }
    else if (acctHash()) openLogin({ fromUrl: true, instant: true, view: acctHash() });
    else if (st.y && !location.hash) jump(st.y);
    // The visit's language card, over whatever the address opened.
    langGate({ app: fromApp, back: back, signedIn: !!getSession(), invite: invited });
    window.addEventListener('keydown', gateKeys, true);
    d.addEventListener('focusin', gateFocus);
    d.addEventListener('click', langLinkClick, true);

    d.addEventListener('click', onClick);
    d.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = $('details.lang[open]');
      if (open) { open.open = false; return; }
      if (loginOpen) closeLogin({ ui: true });
    });
    if (routing) {
      window.addEventListener('popstate', onPop);
      var lite = navigator.connection && navigator.connection.saveData;
      if (!lite) {
        d.addEventListener('pointerover', warm, { passive: true });
        d.addEventListener('touchstart', warm, { passive: true });
        d.addEventListener('focusin', warm);
      }
    }
    window.addEventListener('hashchange', syncLogin);
    d.addEventListener('submit', function (e) { if (!e.defaultPrevented) cancelAutoClose(); });
    window.addEventListener('pagehide', function () {
      cancelAutoClose();
      try { history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), ''); } catch (e) {}
    });
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      askLive();
      if (acct) acct.reset();
      var bk = curBook();
      if (bk) bk.revive();
    });
    window.addEventListener('storage', function (e) { if (e.key === STORE || e.key === NAME || e.key === null) authChanged(); });
    // Turning a tablet or resizing the window across the phone width: the right card again.
    var crossed = function () { syncDeck(true); };
    if (PHONE.addEventListener) PHONE.addEventListener('change', crossed); else if (PHONE.addListener) PHONE.addListener(crossed);

    // The map dims a little as the page scrolls, so text over it stays easy to read.
    var bd = $('.backdrop'), raf = 0;
    var dim = function () {
      raf = 0;
      if (bd) bd.style.setProperty('--scrim', Math.min(1, window.scrollY / (window.innerHeight * 0.9)).toFixed(3));
    };
    window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(dim); }, { passive: true });
    dim();
  }

  start();
})();
