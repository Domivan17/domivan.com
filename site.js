/* domivan.com in the browser: one page that never reloads.
 *
 * Router: clicks on links to the site's own pages (home, /join and the legal pages, in
 * every language) fetch the next page and swap only <main id="page">: the old page slides
 * out to the left and the new one in from the right (the other way on Back). The header
 * and the night map behind everything (.backdrop) are never redrawn, so the map keeps
 * moving. Any problem falls back to a normal page load.
 *
 * Account: "Log In / Create Account" opens the account card in place (URL #login). On the
 * home page it takes the Book your trip card's spot; elsewhere it slides in as its own
 * screen. Google and Apple go through Supabase's PKCE redirect, email through a one-time
 * code. The session is stored where supabase-js keeps it, so /book is signed in too.
 *
 * Phones (the one-column layout) open like the app: a signed-out visitor sees the account
 * card in the home page's spot first, and Book your trip once signed in. Transporters goes
 * to the Domivan Driver app in the App Store or Google Play there (DRIVER_APP).
 *
 * Booking (home): Book your trip prices the trip, takes the payment (Stripe's Payment Element)
 * and confirms it inside the card; each step slides in and the page never changes. The account
 * card slides over it when a signed-out visitor goes to pay.
 *
 * Page modules: the booking card (home) and the Join Transporters form, started once for
 * each page as it is shown.
 *
 * Background: hero-net.js draws the live network over the night map and keeps its lights off
 * the copy and the cards. It is told (dvNet.relayout) whenever a page or card slides in or out.
 *
 * Hand-written, no build step. Strings come from each page (#dv-t, built by
 * scripts/build-site.py from scripts/account_strings.py).
 */
(function () {
  'use strict';

  var SB = 'https://htegjzxfspdaclcvfjfl.supabase.co';
  var KEY = 'sb_publishable_2spxK11Ldq3pj2EjJeoPbw_TVsZuKnL'; // public key, same as the apps
  var STORE = 'sb-htegjzxfspdaclcvfjfl-auth-token';             // where supabase-js v2 keeps the session
  var PKCE = 'domivan-pkce', NAME = 'domivan-name', DRAFT = 'domivan-join-draft';
  // name@domain.tld, with no empty parts (no '..', no dot at either end).
  var EMAIL_RE = /^[^@\s.]+(?:\.[^@\s.]+)*@[^@\s.]+(?:\.[^@\s.]+)+$/;
  var EASE = 'cubic-bezier(.22, .8, .24, 1)';
  // Phones: the one-column layout (landing.css). The home page opens on Log in / Create account
  // there. The Transporters buttons go to the driver app's store page instead of /join on phones
  // and on touch screens too short for the one-column layout (a big phone turned sideways).
  var PHONE = window.matchMedia('(max-width: 860px)');
  var HANDHELD = window.matchMedia('(max-width: 860px), (pointer: coarse) and (max-height: 500px)');
  var DRIVER_APP = {
    live: true,                                                            // false: every button keeps /join
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
  // A copy of supabase/functions/_shared/pricing.ts (its rates are placeholders too). create-order
  // prices the trip again on the server and that is what the client pays; this is the preview.
  // Change both together.

  var HOME_CC = ['PL', 'RO', 'BG', 'HU'], ABROAD_CC = ['DE', 'FR', 'BE', 'NL', 'GB', 'ES', 'IT', 'CH'];
  var RATES = { base: 30, perKm: 0.062, road: 1.28, surcharge: { GB: 30, CH: 10 }, bag: 10, round: 5 };
  var VANS = ['standard', 'large', 'luxury'];
  var VAN = { standard: { max: 8, x: 1 }, large: { max: 20, x: 1.1 }, luxury: { max: 16, x: 1.6 } };

  function inList(list, c) { return list.indexOf(String(c).toUpperCase()) >= 0; }
  // Trips run between a home country and one abroad, in either direction.
  function routeOk(a, b) {
    return (inList(HOME_CC, a.country) && inList(ABROAD_CC, b.country)) || (inList(ABROAD_CC, a.country) && inList(HOME_CC, b.country));
  }
  function toRad(x) { return (x * Math.PI) / 180; }
  function quote(a, b, pax, bags, van) {
    var dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var sLat = Math.sin(dLat / 2), sLng = Math.sin(dLng / 2); // not **: older Safari can't parse it
    var h = sLat * sLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sLng * sLng;
    var km = Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * RATES.road);
    var abroad = inList(ABROAD_CC, b.country) ? b.country : a.country; // UK and Switzerland cost extra at either end
    var per = RATES.base + RATES.perKm * km + (RATES.surcharge[String(abroad).toUpperCase()] || 0);
    var raw = (per * pax + RATES.bag * bags) * VAN[van].x;
    return { km: km, cents: Math.max(RATES.round, Math.round(raw / RATES.round) * RATES.round) * 100 };
  }

  // Euros, dates and countries the way the page's language writes them.
  function locale(lang) { return lang === 'en' ? 'en-GB' : lang; }
  function money(cents, lang) {
    var f = cents % 100 ? 2 : 0;
    try {
      return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'EUR', currencyDisplay: 'narrowSymbol', minimumFractionDigits: f, maximumFractionDigits: f }).format(cents / 100);
    } catch (e) { return '€' + (cents / 100).toFixed(f); }
  }
  function dateText(t, lang) {
    try {
      return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
    } catch (e) { return t.toLocaleString(); }
  }
  function countryName(cc, lang) {
    try { return new Intl.DisplayNames([lang], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; }
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  // The value of a datetime-local field, and back. Both in the visitor's own time.
  function localDT(t) { return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()) + 'T' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()); }
  function parseDT(v) {
    var m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/.exec(v || '');
    if (!m) return null;
    var t = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    return isNaN(t.getTime()) ? null : t;
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

  // Suggestions under an address field while the visitor types (a combobox: arrows, Enter, Escape).
  // Picking one keeps that exact place on the field (input._place); typing again drops it.
  var sgN = 0;
  function Suggest(input) {
    var label = input.closest('label'), box = d.createElement('div'), list = d.createElement('ul'), id = 'sg' + (++sgN);
    var items = [], active = -1, timer = 0, ctl = null, seq = 0;
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
      list.innerHTML = items.map(function (s, i) {
        var parts = s.label.split(', ');
        return '<li role="option" id="' + id + '-' + i + '" aria-selected="false" data-i="' + i + '"><b>' + esc(parts[0]) + '</b>'
          + (parts.length > 1 ? '<span>' + esc(parts.slice(1).join(', ')) + '</span>' : '') + '</li>';
      }).join('');
      active = -1;
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    }
    function mark(i) {
      active = i;
      $$('li', list).forEach(function (li, j) { li.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', id + '-' + i);
    }
    function choose(i) {
      var s = items[i];
      if (!s) return;
      input.value = s.label;
      input._place = s;
      close();
      input.dispatchEvent(new CustomEvent('dv-pick', { bubbles: true }));
    }
    input.addEventListener('input', function () {
      input._place = null;
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 3) { seq++; items = []; return close(); }
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
      var n = items.length;
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
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); }); // the field keeps the focus (and a phone its keyboard)
    list.addEventListener('click', function (e) { var li = e.target.closest('li'); if (li) choose(+li.dataset.i); });
    return { close: close };
  }

  // ---------------------------------------------------------------- payments (Stripe)

  var STRIPE_PK = 'pk_test_51UR6TkFGe72W5Sn03sZiyUxy2RrnSKKlK570gs7cXFLr0qkjfHJTSiKBUJNKft1VlOMPLOh7NpOJWa2RQgaHSrL900EXEru4Se'; // public key, same as the apps (test mode, the "Domivan" sandbox)
  // Stripe's Payment Element in the card's colours: dark fields, the site's blue.
  var APPEARANCE = {
    theme: 'night',
    variables: {
      colorPrimary: '#2E5BFF', colorBackground: '#18213A', colorText: '#FFFFFF', colorTextSecondary: '#C3CEDF',
      colorTextPlaceholder: '#8996AC', colorIcon: '#C3CEDF', colorDanger: '#FFB4A8',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      fontSizeBase: '16px', borderRadius: '12px', spacingUnit: '4px'
    },
    rules: {
      '.Input': { border: '1.5px solid #34405A', boxShadow: 'none' },
      '.Input:focus': { border: '1.5px solid #9DB5FF', boxShadow: 'none' },
      '.Input--invalid': { border: '1.5px solid #FF9B8A' },
      '.Label': { fontSize: '12.5px', fontWeight: '700', color: '#C3CEDF' },
      '.Tab': { border: '1.5px solid #34405A', backgroundColor: '#18213A', boxShadow: 'none' },
      '.Tab--selected': { border: '1.5px solid #9DB5FF', backgroundColor: '#1E2A4A' }
    }
  };
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
        var e = new Error(j.error || 'HTTP ' + r.status);
        e.status = r.status;
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
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  // Set by start() before the home page's card starts: back from the bank (?booked=...), or from
  // Google or Apple.
  var stripeBack = null, oauthBack = false;

  function Book(card, main) {
    var L = T, f = $('form.bk-trip', card), el = f.elements, panes = $('.panes', card), h2 = $('h2', card);
    var title0 = h2.textContent, P = { trip: f }, cur = f, step = 'trip';
    var trip = null, van = 'standard', prefer = null, order = null, dirty = false, ed = 0;
    var stripe = null, els = null, pe = null, busy = false, paying = false, wantPay = false, afterLogin = null;
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
      + '<div class="pay-sum"><p class="ps-route"></p><b class="ps-price"></b></div>'
      + '<div class="pe-box"><div class="pe"></div><span class="spin" aria-hidden="true"></span></div>'
      + '<div class="msg" role="alert"></div>'
      + '</div><div class="book-foot"><button class="btn big go" type="button"></button><p class="secure">' + IC.lock + '<span>' + esc(L.secure) + '</span></p></div>');
    pane('done', '<div class="book-body">'
      + '<div class="done-top"><span class="tick" aria-hidden="true">' + IC.ok + '</span><h3>' + esc(L.done_h) + '</h3><p class="done-p"></p></div>'
      + '<dl class="done-sum"></dl>'
      + '</div><div class="book-foot"><a class="btn big" href="/book/">' + esc(L.my_trips) + '</a><button type="button" class="btn ghost another">' + esc(L.another) + '</button></div>');
    var notes = $('[name=notes]', P.price), priceBtn = $('.go', P.price), payBtn = $('.go', P.pay);

    function msg(p, text, input) {
      $('.msg', p).textContent = text || '';
      $$('[aria-invalid]', p).forEach(function (i) { i.removeAttribute('aria-invalid'); });
      if (input) { input.setAttribute('aria-invalid', 'true'); input.focus({ preventScroll: true }); }
    }

    // ---- step 1: the trip
    var when = el.when, t0 = new Date(Date.now() + 864e5);
    t0.setHours(8, 0, 0, 0);
    when.value = localDT(t0);
    when.min = localDT(new Date());
    var sync = function () { card.classList.toggle('is-live', el.kind.value === 'live'); };
    f.addEventListener('change', sync);
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
    // Picked the pickup: on to the destination if it is still empty.
    f.addEventListener('dv-pick', function (e) { if (e.target === el.from && !el.to.value.trim()) el.to.focus({ preventScroll: true }); });
    f.addEventListener('submit', function (e) { e.preventDefault(); getPrice(); });

    function getPrice() {
      if (busy) return;
      var a = el.from.value.trim(), b = el.to.value.trim(), kind = el.kind.value === 'live' ? 'live' : 'booking', at = null;
      if (!a) return msg(f, L.err_from, el.from);
      if (!b) return msg(f, L.err_to, el.to);
      if (kind === 'booking') {
        at = parseDT(when.value);
        if (!at || at.getTime() < Date.now() + 2 * 3600e3) return msg(f, L.err_when, when);
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
      $('.facts', p).innerHTML = fact(IC.cal, trip.kind === 'live' ? L.asap : dateText(trip.at, L.lang))
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
      $('.fine', P.price).textContent = (trip.kind === 'live' ? L.fine_print_live : L.fine_print) + (van === 'luxury' ? ' ' + L.lux_note : '');
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
        passengers: trip.pax, extraBags: trip.bags, vanClass: van, notes: notes.value.trim() || undefined
      };
    }
    // Creates the order (the server prices it and starts a Stripe payment for it), then slides
    // on to Stripe's form. Signed out: the account card first.
    function startPay() {
      if (busy || !trip) return;
      if (!getSession()) {
        wantPay = true;
        save(true);
        openLogin();
        return;
      }
      var c = cents();
      busy = true;
      lock(true);
      busyBtn(priceBtn, true, L.preparing);
      msg(P.price, '');
      refresh().then(function (s) {
        if (!s) { var e = new Error('Signed out'); e.status = 401; throw e; }
        return callFn('create-order', orderBody(), s.access_token);
      }).then(function (r) {
        if (!r || !r.orderId || !r.clientSecret) throw new Error('No payment in the reply');
        order = { id: r.orderId, secret: r.clientSecret, cents: r.fareCents || c };
        save(false);
        return loadStripe().then(function (st) { stripe = st; }, function () { var e = new Error('Stripe.js'); e.stripe = true; throw e; });
      }).then(function () {
        if (step !== 'price' || !card.isConnected) return; // went back meanwhile: Pay starts it again
        mountPayment();
        go('pay');
      }).catch(function (e) {
        if (e.status === 401) { msg(P.price, L.err_login_again); clearSession(); }
        else if (e.status === 409) msg(P.price, L.err_paid);
        else msg(P.price, e.stripe ? L.err_pay_load : errText(e));
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
    function mountPayment() {
      var p = P.pay, price = money(order.cents, L.lang);
      dropPayment();
      $('.ps-route', p).textContent = trip.from.city + ' → ' + trip.to.city;
      $('.ps-price', p).textContent = price;
      payBtn.textContent = fill(L.pay, { price: price });
      payBtn.disabled = true;
      msg(p, '');
      p.classList.add('loading');
      // Didn't load: the button tries again.
      var failed = function () { p.classList.remove('loading'); dropPayment(); msg(p, L.err_pay_load); payBtn.textContent = L.retry; payBtn.disabled = false; };
      try {
        els = stripe.elements({ clientSecret: order.secret, locale: L.lang, appearance: APPEARANCE });
        pe = els.create('payment', { layout: 'tabs' });
        pe.on('ready', function () { p.classList.remove('loading'); payBtn.disabled = false; });
        pe.on('loaderror', failed);
        pe.mount($('.pe', p));
      } catch (e) { failed(); }
    }
    function dropPayment() {
      if (pe) { try { pe.destroy(); } catch (e) {} }
      pe = els = null;
    }
    function confirmPay() {
      if (paying) return;
      if (!pe) {
        return loadStripe().then(function (st) { stripe = st; mountPayment(); }, function () { msg(P.pay, L.err_pay_load); });
      }
      var p = P.pay;
      paying = true;
      busyBtn(payBtn, true, L.paying);
      msg(p, '');
      save(false);
      // Cards finish here (3-D Secure opens over the page); bank redirects come back to this page.
      stripe.confirmPayment({
        elements: els, redirect: 'if_required',
        confirmParams: { return_url: location.origin + location.pathname + '?booked=' + encodeURIComponent(order.id) }
      }).then(function (r) {
        if (r && r.error) {
          if (r.error.type !== 'validation_error') msg(p, r.error.message || L.err_pay); // Stripe marks the field itself
          return;
        }
        var s = r && r.paymentIntent && r.paymentIntent.status;
        booked(s === 'processing' ? 'wait' : 'ok');
      }, function () { msg(p, L.err_pay); }).then(function () {
        paying = false;
        busyBtn(payBtn, false);
      });
    }
    payBtn.addEventListener('click', confirmPay);

    // ---- step 4: booked
    function booked(how, o) {
      var p = P.done, t = trip, rows = [];
      $('.done-p', p).textContent = how === 'wait' ? L.done_wait : t && t.kind === 'live' ? L.done_p_live : L.done_p;
      if (t) {
        rows.push([L.s_route, t.from.city + ' → ' + t.to.city], [L.s_pickup, t.kind === 'live' ? L.asap : dateText(t.at, L.lang)], [L.s_van, L['v_' + van]]);
      }
      if (order && order.cents) rows.push([L.s_paid, money(order.cents, L.lang)]);
      $('.done-sum', p).innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
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
      msg(f, '');
      tripStore.del();
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
        pay: !!pay, order: order ? { id: order.id, cents: order.cents } : null
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
      el.pax.value = s.pax;
      el.bags.value = s.bags;
      notes.value = s.notes || '';
      trip = { kind: s.kind === 'live' ? 'live' : 'booking', from: s.from, to: s.to, at: s.at ? new Date(s.at) : null, pax: +s.pax || 1, bags: +s.bags || 0 };
      if (trip.kind === 'booking' && !trip.at) { trip = null; return false; }
      prefer = s.van;
      fillPrice();
      if (s.order) order = { id: s.order.id, cents: s.order.cents };
      return true;
    }

    // Back from the bank: booked, or the payment step again with what went wrong.
    var s = tripStore.get(), sb = stripeBack;
    if (sb) {
      stripeBack = null;
      var had = restore(s) && !!order && order.id === sb.id;
      if (sb.status === 'succeeded' || sb.status === 'processing') {
        if (!had) { trip = null; order = null; }
        booked(sb.status === 'processing' ? 'wait' : 'ok', { instant: true });
      } else if (had) {
        go('price', { instant: true, history: false });
        history.replaceState(Object.assign({}, history.state, { bk: 'price', bkr: 1 }), '');
        msg(P.price, L.err_pay);
      } else {
        msg(f, L.err_pay);
      }
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
      }
    };
  }

  function curBook() { var b = page && $('.deck > .book', page); return b && b._bk; }

  // ---------------------------------------------------------------- Join Transporters

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
      HU: function (n) { return n.length === 8 || n.length === 10 || n.length === 11; } // adószám or cégjegyzékszám
    };
    var yesNo = [{ v: 'yes', t: J.yes }, { v: 'no', t: J.no }];
    var STEPS = [
      { id: 'country', q: J.q_country, type: 'one', opts: ['PL', 'RO', 'BG', 'HU'].map(function (c) { return { v: c, t: J.countries[c], flag: c }; }) },
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
      { id: 'destinations', q: J.q_routes, sub: J.pick_all, type: 'many', grid: true, opts: ['DE', 'NL', 'BE', 'FR', 'UK', 'ES', 'IT', 'CH'].map(function (c) { return { v: c, t: J.countries[c], flag: c }; }) },
      { id: 'passenger_insurance', q: J.q_insurance, type: 'one', opts: yesNo },
      { id: 'name', q: J.q_name, type: 'fields', fields: function () { return [{ k: 'full_name', label: J.f_name, ac: 'name' }]; } },
      { id: 'contact', q: J.q_contact, type: 'fields', fields: function () {
          return [{ k: 'phone', label: J.f_phone, type: 'tel', ac: 'tel' }, { k: 'email', label: J.f_email, type: 'email', ac: 'email' }];
        }, check: function () {
          if (digits(a.phone).length < 6 || digits(a.phone).length > 15) return { k: 'phone', e: J.err_phone };
          if (!EMAIL_RE.test(a.email || '')) return { k: 'email', e: J.err_email };
          return '';
        } },
      { id: 'confirm', q: J.q_confirm, sub: J.confirm_sub, type: 'confirm' }
    ];
    var i = 0, busy = false;

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
        full_name: a.full_name, phone: a.phone, email: a.email
      };
      fetch(API, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); done(); })
        .catch(function () { busy = false; btn.disabled = false; btn.textContent = J.submit; err('_', J.err_send); });
    }

    function done() {
      store.del(DRAFT);
      bar.style.width = '100%'; back.hidden = true; count.textContent = '';
      box.className = 'q to-left';
      setTimeout(function () {
        box.innerHTML = '<div class="done-mark" aria-hidden="true">✓</div><h1>' + esc(J.done_h.replace('{name}', (a.full_name || '').split(' ')[0])) + '</h1>'
          + '<p class="qsub">' + esc(J.done_p) + '</p><a class="btn big next" href="' + esc(J.home) + '">' + esc(J.done_cta) + '</a>';
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
    if (s.provider_token) keep.provider_token = s.provider_token;
    if (s.provider_refresh_token) keep.provider_refresh_token = s.provider_refresh_token;
    store.set(STORE, JSON.stringify(keep));
    authChanged();
    return keep;
  }
  function clearSession(instant) { store.del(STORE); store.del(NAME); authChanged(false, instant); }
  // Renews an expired (or nearly expired) session when a page opens.
  function refresh() {
    var s = getSession();
    if (!s || !s.refresh_token || (s.expires_at && s.expires_at - Date.now() / 1000 > 60)) return Promise.resolve(s);
    return api('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }).then(setSession, function (e) {
      // Signed out elsewhere. The page opened on Book your trip; a phone swaps to Log in at once.
      if (e.status === 400 || e.status === 401 || e.status === 403) clearSession(true);
      return getSession();
    });
  }
  // Signs out here at once, then ends the session at Supabase too. An expired access token
  // would be refused there, so it is renewed first (the new one is used only for this call).
  function logout() {
    var s = getSession();
    clearSession();
    if (!s) return;
    var stale = s.refresh_token && (!s.expires_at || s.expires_at - Date.now() / 1000 < 60);
    (stale ? api('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }).then(function (n) { return n.access_token; })
      : Promise.resolve(s.access_token))
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
  // adds payment_intent and its client secret too). Cleans the URL; the booking card shows how
  // it went (stripeBack).
  function takeBooked() {
    if (!window.URLSearchParams) return;
    var q = new URLSearchParams(location.search), id = q.get('booked'), status = q.get('redirect_status');
    if (!id || !status) return;
    stripeBack = { id: id, status: status };
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
    if (acct) acct.sync();
    syncDeck(instant);
    var bk = curBook();
    if (bk) bk.auth();
  }

  // ---------------------------------------------------------------- account card

  var CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Google's multicolour G and the Apple logo, as their sign-in guidelines ask.
  var GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true">'
    + '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
    + '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
    + '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
    + '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>'
    + '</svg>';
  var APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1ZM13.9 5c.7-.8 1.2-2 1-3.2-1 0-2.3.7-3 1.5-.7.8-1.2 1.9-1.1 3.1 1.2.1 2.3-.6 3.1-1.4Z"/></svg>';
  var MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="m4.5 8 7.5 5.5L19.5 8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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

  function Account() {
    var n = ++cards, el = d.createElement('section');
    el.className = 'card acct';
    el.tabIndex = -1;
    el.dataset.tab = 'login';
    el.setAttribute('aria-labelledby', 'acct-h' + n);
    el.innerHTML = '<div class="card-head">'
      + '<button type="button" class="back-btn" aria-label="' + esc(T.back) + '" title="' + esc(T.back) + '">' + CHEV + '</button>'
      + '<span class="logo"><svg><use href="#mark"/></svg></span><h2 id="acct-h' + n + '">' + esc(T.acct_h) + '</h2></div>'
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
      + '<div class="pane" data-pane="me"><div class="me">'
      + '<div class="me-ava"><span class="ava big"></span><i class="ok" aria-hidden="true"></i></div>'
      + '<p class="me-hi">' + esc(T.welcome) + '</p>'
      + '<p class="me-who"><small>' + esc(T.signed_in_as) + '</small><b class="me-name"></b><span class="me-mail"></span></p>'
      + '<a class="btn big" href="/book/">' + esc(T.my_trips) + '</a>'
      + '<button type="button" class="btn ghost out">' + esc(T.logout) + '</button>'
      + '</div></div>'
      + '</div></div>'
      + '<p class="acct-legal">' + T.legal + '</p>';

    var P = {}, panes = $('.panes', el), cur = null, tab = 'login';
    var email = '', fullName = '', codeTab = 'login', timer = 0, until = 0;
    $$('.pane', el).forEach(function (p) { P[p.dataset.pane] = p; setOn(p, false); });
    var codeIn = $('[name=code]', P.code);

    function show(name, dir, instant) {
      var to = P[name];
      if (to === cur) return;
      el.classList.toggle('is-me', name === 'me');
      var solo = el.parentNode && el.parentNode.classList.contains('solo'); // the card is as tall as its step
      swap(panes, cur, to, dir, instant || !el.isConnected || el.classList.contains('off'), null, solo ? panes.offsetHeight : null);
      cur = to;
      if (name !== 'code') stopTimer();
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
    $('.back-btn', el).addEventListener('click', function () { closeLogin({ ui: true }); });

    function sync(instant) {
      var s = getSession();
      if (s) {
        var nm = nameOf(s), u = s.user || {};
        $('.ava', P.me).textContent = (nm || u.email || '?').charAt(0).toUpperCase();
        $('.me-name', P.me).textContent = nm || u.email || T.my_account;
        $('.me-mail', P.me).textContent = nm ? u.email || '' : '';
        show('me', 1, instant);
      } else {
        el.classList.remove('fresh');
        if (!cur || cur === P.me) show(tab, -1, instant);
      }
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
      reset: function () { $$('.sso-btn', el).forEach(function (b) { busy(b, false); }); }
    };
  }

  var acct = null;
  function account() {
    if (!acct || acct.lang !== T.lang) { acct = Account(); loadSettings(); }
    return acct;
  }

  // ---------------------------------------------------------------- login in place (#login)

  var loginOpen = false, loginPushed = false, underY = 0;
  function deckOf(p) { return p && $('.deck', p); }
  function loginButton(on) { var b = $('.top .login'); if (b) b.classList.toggle('on', on); }
  function closeLangMenus() { $$('details.lang[open]').forEach(function (x) { x.open = false; }); }
  function focusCard() { if (acct) acct.el.focus({ preventScroll: true }); }

  function mountInDeck(deck, instant) {
    var a = account();
    if (deck._end) deck._end();
    if (a.el.parentNode !== deck) { leaveCopy(a.el); setOn(a.el, false); deck.appendChild(a.el); }
    a.sync(true);
    a.el.classList.toggle('gate', gated());
    if (deck._front === a.el) return;
    swap(deck, $('.book', deck), a.el, 1, instant, function () {
      if (deck._front === a.el && gated()) setSolo(deck, true, instant);
    });
  }
  // The card is moving to the home page while the screen it was on slides away: that screen
  // keeps a still copy of it until it has gone.
  function leaveCopy(el) {
    if (!el.isConnected) return;
    var c = el.cloneNode(true);
    $$('[id], [name]', c).forEach(function (x) { x.removeAttribute('id'); x.removeAttribute('name'); });
    setOn(c, false);
    c.classList.remove('off');
    el.parentNode.replaceChild(c, el);
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
  // Puts the right card in the home page's spot: the account card while it is open or while a
  // phone visitor hasn't signed in, else Book your trip. Run when the page is shown, when the
  // session changes and when the window crosses the phone width.
  function syncDeck(instant) {
    var deck = deckOf(page);
    if (!deck) return;
    var g = gated();
    if (g && !(acct && deck._front === acct.el)) mountInDeck(deck, instant);
    var a = acct;
    if (!a || deck._front !== a.el) return;
    var fresh = a.el.classList.contains('fresh') && !!getSession(), solo = deck.classList.contains('solo');
    if (!g && !loginOpen) {
      if (fresh) loginOpen = true; // just signed in on it: the welcome shows, then signedIn() moves on to Book your trip
      else if (getSession() || !a.used()) { loginButton(false); return toBook(deck, instant); }
      else { // the layout widened (a phone turned sideways) mid sign-in: it stays, as the account card opened from the header
        loginOpen = true;
        history.replaceState(history.state, '', location.pathname + location.search + '#login');
      }
    }
    a.el.classList.toggle('gate', g || (fresh && solo)); // no back arrow during the welcome either: it moves on by itself
    if (!deck._end) setSolo(deck, g || (fresh && solo), instant);
    loginButton(true);
  }
  function accountScreen() {
    var s = d.createElement('main'), box = d.createElement('div'), a = account();
    s.className = 'page page-account';
    box.className = 'acct-stage';
    s.appendChild(box);
    setOn(a.el, true);
    a.el.classList.remove('gate');
    box.appendChild(a.el);
    a.sync(true);
    return s;
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

  function openLogin(o) {
    o = o || {};
    var deck = deckOf(page);
    if (deck && !loginOpen && !o.fromUrl && gated()) { // phones: the card is already there, Log in first
      syncDeck(true);
      reveal(deck, o.instant);
      return focusCard();
    }
    if (!o.fromUrl && location.hash !== '#login') {
      var url = location.pathname + location.search + '#login';
      if (o.replace) history.replaceState(history.state, '', url);
      else {
        history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), '');
        history.pushState({ dv: stamp(), y: 0, bk: (history.state || {}).bk }, '', url); // the booking card stays on its step
        loginPushed = true;
      }
    }
    if (loginOpen) { if (deck) reveal(deck); return focusCard(); }
    loginOpen = true;
    loginButton(true);
    closeLangMenus();
    if (deck) {
      mountInDeck(deck, o.instant);
      reveal(deck, o.instant);
    } else {
      underY = window.scrollY;
      slideScreen(screen, accountScreen(), o.instant ? 0 : 1, 0);
    }
    focusCard();
  }

  function closeLogin(o) {
    o = o || {};
    if (!loginOpen) return;
    cancelAutoClose();
    // Escape or the back arrow: keyboard focus goes back to the header button.
    if (o.ui && o.focus !== false) { var b = $('.top .login'); if (b) b.focus({ preventScroll: true }); }
    if (o.ui && location.hash === '#login') {
      if (loginPushed) { history.back(); return; } // popstate closes it, so Back doesn't reopen it
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    loginOpen = false;
    loginPushed = false;
    loginButton(false);
    var a = acct, deck = a && a.el.parentNode && a.el.parentNode.classList.contains('deck') ? a.el.parentNode : null;
    if (deck) { if (gated()) syncDeck(o.instant); else toBook(deck, o.instant); } // phones stay on the card until signed in
    else if (screen !== page) slideScreen(screen, page, o.instant ? 0 : -1, underY);
    if (a) setTimeout(function () { if (!loginOpen) a.el.classList.remove('fresh'); }, 600);
    var bk = curBook();
    if (bk) bk.loginClosed();
  }

  function syncLogin() {
    var want = location.hash === '#login';
    if (want && !loginOpen) openLogin({ fromUrl: true });
    else if (!want && loginOpen) closeLogin();
  }

  // Signed in from the account card: on the home page, slide back to Book your trip after a
  // moment. Tapping anything in the card, or leaving the page, cancels that.
  var autoClose = 0;
  function cancelAutoClose() { clearTimeout(autoClose); autoClose = 0; }
  function signedIn() {
    var s = getSession();
    if (s) fetchName(s);
    cancelAutoClose();
    if (loginOpen && deckOf(page)) {
      autoClose = setTimeout(function () {
        autoClose = 0;
        if (loginOpen && getSession() && deckOf(page)) closeLogin({ ui: true, focus: false });
      }, 1600);
    }
  }

  // ---------------------------------------------------------------- router

  // Home, /join and the legal pages, in every language (/ro/, /ro/join, /ro/terms, ...).
  var SITE = /^\/(?:(?:ro|pl|bg|hu|es)\/)?(?:index\.html|(?:join|terms|privacy|transporter-terms|delete-account)(?:\.html)?)?$/;
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
    ys[hIdx] = screen !== page ? underY : window.scrollY;
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
      arrive(next, o.dir, u.hash, o.y || 0);
    }).catch(function () {
      if (seq !== navSeq) return;
      if (o.push) location.assign(href); else location.reload();
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
    var from = screen, prev = page;
    loginOpen = false;
    loginPushed = false;
    loginButton(false);
    applyChrome(next.meta);
    page = next.page;
    curKey = next.key;
    var to = page;
    if (hash === '#login') { // Back or Forward onto an open account card
      loginOpen = true;
      loginButton(true);
      if (deckOf(page)) mountInDeck(deckOf(page), true);
      else { underY = y; y = 0; to = accountScreen(); }
    } else if (hash && !y) {
      y = function () { var el = anchor(page, hash); return el ? yOf(el) : 0; };
    }
    syncDeck(true);
    slideScreen(from, to, dir, y, function () { if (prev !== page) resetDeck(prev); });
    initPage(page, true);
    if (to !== page) focusCard();
    else focusPage(page, from);
    announce(d.title);
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
      a.setAttribute('href', app);
      setTimeout(function () { a.setAttribute('href', href); });
      return;
    }
    if (a.hasAttribute('data-login')) { e.preventDefault(); openLogin(); return; }
    var u = sitePage(a);
    if (!u) { cancelAutoClose(); return; } // leaving for /book or another site: nothing may pull us back
    if (samePage(u)) { // this page
      if (u.hash === '#login') { e.preventDefault(); openLogin(); return; }
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

  // The Domivan Driver app's page in the store this phone uses, or '' (computers, tablets in the
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
    curKey = location.pathname + location.search;
    var st = history.state || {};
    hIdx = st.dv != null ? st.dv : stamp();
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    history.replaceState(Object.assign({}, st, { dv: hIdx }), '');

    initPage(page, false);
    authChanged(true);
    syncDeck(true);
    refresh().then(function (s) { if (s) fetchName(s); });

    if (cb) { openLogin({ replace: true, instant: true }); acct.callback(cb); }
    else if (location.hash === '#login') openLogin({ fromUrl: true, instant: true });
    else if (st.y && !location.hash) jump(st.y);

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
      try { history.replaceState(Object.assign({}, history.state, { y: screen === page ? window.scrollY : underY }), ''); } catch (e) {}
    });
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
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
