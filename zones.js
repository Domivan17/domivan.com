// GENERATED from supabase/functions/_shared/zones.ts by scripts/make-site-zones.mjs. Do not edit.
"use strict";
var DvZones = (() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // supabase/functions/_shared/zones.ts
  var zones_exports = {};
  __export(zones_exports, {
    COUNTRY_ZONES: () => COUNTRY_ZONES,
    ZONES: () => ZONES,
    addMinutes: () => addMinutes,
    gmtLabel: () => gmtLabel,
    isSummerTime: () => isSummerTime,
    parseWall: () => parseWall,
    pickupZone: () => pickupZone,
    tripZone: () => tripZone,
    wallAt: () => wallAt,
    wallText: () => wallText,
    wallToDate: () => wallToDate,
    zoneNote: () => zoneNote,
    zoneOffset: () => zoneOffset
  });
  var COUNTRY_ZONES = {
    AT: "Europe/Vienna",
    BE: "Europe/Brussels",
    BG: "Europe/Sofia",
    HR: "Europe/Zagreb",
    CY: "Asia/Nicosia",
    CZ: "Europe/Prague",
    DK: "Europe/Copenhagen",
    EE: "Europe/Tallinn",
    FI: "Europe/Helsinki",
    FR: "Europe/Paris",
    DE: "Europe/Berlin",
    GR: "Europe/Athens",
    HU: "Europe/Budapest",
    IE: "Europe/Dublin",
    IT: "Europe/Rome",
    LV: "Europe/Riga",
    LT: "Europe/Vilnius",
    LU: "Europe/Luxembourg",
    MT: "Europe/Malta",
    NL: "Europe/Amsterdam",
    PL: "Europe/Warsaw",
    PT: "Europe/Lisbon",
    RO: "Europe/Bucharest",
    SK: "Europe/Bratislava",
    SI: "Europe/Ljubljana",
    ES: "Europe/Madrid",
    SE: "Europe/Stockholm",
    GB: "Europe/London",
    CH: "Europe/Zurich"
  };
  var WINTER = {
    "Atlantic/Azores": -60,
    "Europe/London": 0,
    "Europe/Dublin": 0,
    "Europe/Lisbon": 0,
    "Atlantic/Canary": 0,
    "Atlantic/Madeira": 0,
    "Europe/Sofia": 120,
    "Asia/Nicosia": 120,
    "Europe/Tallinn": 120,
    "Europe/Helsinki": 120,
    "Europe/Athens": 120,
    "Europe/Riga": 120,
    "Europe/Vilnius": 120,
    "Europe/Bucharest": 120
  };
  var CET = 60;
  var ZONES = [.../* @__PURE__ */ new Set([...Object.values(COUNTRY_ZONES), ...Object.keys(WINTER)])];
  function tripZone(country, lat, lng) {
    var _a;
    const c = (country != null ? country : "").toUpperCase();
    if (c === "ES" && lng != null && lat != null && lng < -12 && lat < 30) return "Atlantic/Canary";
    if (c === "PT" && lng != null && lng < -22) return "Atlantic/Azores";
    return (_a = COUNTRY_ZONES[c]) != null ? _a : null;
  }
  function pickupZone(o) {
    var _a;
    return (_a = o.pickup_tz) != null ? _a : tripZone(o.pickup_country, o.pickup_lat, o.pickup_lng);
  }
  function lastSunday(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0, 1));
    return last.getTime() - last.getUTCDay() * 864e5;
  }
  function isSummerTime(at) {
    const year = new Date(at).getUTCFullYear();
    return at >= lastSunday(year, 2) && at < lastSunday(year, 9);
  }
  function zoneOffset(zone, at) {
    var _a;
    const ms = typeof at === "number" ? at : at.getTime();
    return ((_a = WINTER[zone]) != null ? _a : CET) + (isSummerTime(ms) ? 60 : 0);
  }
  function wallAt(zone, at) {
    const ms = typeof at === "number" ? at : at.getTime();
    const d = new Date(ms + zoneOffset(zone, ms) * 6e4);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes()
    };
  }
  function wallToDate(zone, wall) {
    var _a;
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    const winter = (_a = WINTER[zone]) != null ? _a : CET;
    const summer = asUtc - (winter + 60) * 6e4;
    if (isSummerTime(summer)) return new Date(summer);
    return new Date(asUtc - winter * 6e4);
  }
  function gmtLabel(minutes) {
    if (!minutes) return "GMT";
    const sign = minutes > 0 ? "+" : "-";
    const m = Math.abs(minutes);
    return `GMT${sign}${Math.floor(m / 60)}${m % 60 ? `:${String(m % 60).padStart(2, "0")}` : ""}`;
  }
  function wallText(wall, parts, lang) {
    try {
      return new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)).toLocaleString(lang, __spreadProps(__spreadValues({}, parts), { timeZone: "UTC" }));
    } catch (e) {
      return new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute).toLocaleString(lang, parts);
    }
  }
  function zoneNote(at, zone) {
    if (!zone) return "";
    const moment = new Date(at);
    const offset = zoneOffset(zone, moment);
    return offset === -moment.getTimezoneOffset() ? "" : ` (${gmtLabel(offset)})`;
  }
  function parseWall(text) {
    const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const wall = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
    const back = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute));
    const same = back.getUTCMonth() === wall.month - 1 && back.getUTCDate() === wall.day && back.getUTCHours() === wall.hour;
    return same ? wall : null;
  }
  function addMinutes(wall, minutes) {
    const d = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) + minutes * 6e4);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
  return __toCommonJS(zones_exports);
})();
