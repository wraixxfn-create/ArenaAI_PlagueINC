// Localization runtime. Strings live in strings.*.js as { key: { en, it } }.
// Adding a language: add its code to LANGUAGES, then add that code to every entry
// (missing entries transparently fall back to FALLBACK).
import core from './strings.core.js';
import content from './strings.content.js';
import countries from './strings.countries.js';

export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-GB' },
  { code: 'it', label: 'Italiano', locale: 'it-IT' },
];
export const FALLBACK = 'en';

const TABLE = { ...core, ...content, ...countries };
const listeners = new Set();
let current = FALLBACK;

export function availableLanguages() { return LANGUAGES; }
export function getLang() { return current; }
export function localeOf(code = current) {
  return (LANGUAGES.find((l) => l.code === code) || LANGUAGES[0]).locale;
}

export function setLang(code) {
  if (!LANGUAGES.some((l) => l.code === code)) code = FALLBACK;
  if (code === current) return;
  current = code;
  document.documentElement.lang = code;
  listeners.forEach((fn) => fn(code));
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Translate a key. `params` values are substituted into {placeholders}.
 * A param value that is itself a known key is translated recursively, so
 * log entries can carry raw ids like country codes.
 */
export function t(key, params) {
  const entry = TABLE[key];
  let str = entry ? (entry[current] ?? entry[FALLBACK]) : null;
  if (str == null) str = key;
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (m, p) => {
      const v = params[p];
      if (v == null) return m;
      return typeof v === 'string' && TABLE[v] ? t(v) : String(v);
    });
  }
  return str;
}

export function has(key) { return Object.prototype.hasOwnProperty.call(TABLE, key); }

/** Translate a country id ("usa" → "United States"). */
export const tc = (id) => t(`country.${id}`);

/** Missing-translation audit helper (used by tests). */
export function auditMissing() {
  const missing = [];
  for (const [k, v] of Object.entries(TABLE)) {
    for (const l of LANGUAGES) if (!v[l.code]) missing.push(`${k}:${l.code}`);
  }
  return missing;
}

export const KEY_COUNT = Object.keys(TABLE).length;
