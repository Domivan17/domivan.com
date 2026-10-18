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

  // ---------------------------------------------------------------- booking card (home)

  // Fills sensible defaults, then hands the trip to the web app at /book.
  function initBook(f) {
    var when = f.elements.when, pad = function (n) { return String(n).padStart(2, '0'); };
    var local = function (t) {
      return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + 'T' + pad(t.getHours()) + ':' + pad(t.getMinutes());
    };
    var t = new Date(Date.now() + 864e5); t.setHours(8, 0, 0, 0);
    when.value = local(t); when.min = local(new Date());
    var sync = function () { f.classList.toggle('is-live', f.elements.kind.value === 'live'); };
    f.addEventListener('change', sync); sync();
    $('.swap', f).addEventListener('click', function () {
      var a = f.elements.from, b = f.elements.to, v = a.value; a.value = b.value; b.value = v;
    });
    $$('[data-step]', f).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = b.parentNode.querySelector('input');
        i.value = Math.min(+i.max, Math.max(+i.min, (+i.value || 0) + +b.dataset.step));
      });
    });
    f.addEventListener('submit', function () { if (f.elements.kind.value === 'live') when.disabled = true; });
  }

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
      if (kind === 'home' && $('#book', main)) initBook($('#book', main));
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
        history.pushState({ dv: stamp(), y: 0 }, '', url);
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
      history.pushState({ dv: stamp(), y: y }, '', u.hash);
      window.scrollTo({ top: y, behavior: calm() ? 'auto' : 'smooth' });
      return;
    }
    if (!routing) { cancelAutoClose(); return; }
    e.preventDefault();
    navigate(u.href, { push: true, dir: 1 });
  }

  function onPop(e) {
    var st = e.state || {}, to = st.dv;
    if (location.pathname + location.search === curKey) { // only the #hash changed
      var was = loginOpen;
      if (to != null) hIdx = to;
      syncLogin();
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
      $$('form.book [name=when]').forEach(function (w) { w.disabled = false; });
      if (e.persisted && acct) acct.reset();
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
