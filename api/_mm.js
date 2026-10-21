'use strict';
/**
 * ММ — общая часть адресов данных сайта: ключ сайта (MM_SITE_KEY), чтение готового файла ММ из приватного
 * репозитория MAYAK-monitoring (ветка site-data) токеном только для чтения (MM_GITHUB_READ_TOKEN), проверка на адреса.
 * Тёплый экземпляр функции держит файл до 5 минут и перечитывает его условным запросом (ETag: 304 не расходует лимит).
 */
const crypto = require('node:crypto');
const OWNER = 'MAYAK-monitoring', REPO = 'MAYAK-monitoring', BRANCH = 'site-data', MAX_BYTES = 5_000_000, CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

async function readMM(file, token) {
  const prev = cache.get(file);
  if (prev && Date.now() - prev.at < CACHE_MS) return prev.data;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MM-site-readonly' };
  if (prev && prev.etag) headers['If-None-Match'] = prev.etag;
  const r = await fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + file + '?ref=' + BRANCH, { headers, signal: AbortSignal.timeout(12000) });
  if (r.status === 304 && prev) { prev.at = Date.now(); return prev.data; }
  if (!r.ok) throw Error('чтение данных ММ: HTTP ' + r.status);
  const obj = await r.json();
  const buf = Buffer.from(String(obj.content || '').replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw Error('файл ММ пустой или слишком большой');
  const text = buf.toString('utf8');
  if (/0x[0-9a-fA-F]{40}|"[1-9A-HJ-NP-Za-km-z]{43,44}"/.test(text)) throw Error('в данных адрес — не показываю');
  const data = JSON.parse(text);
  cache.set(file, { at: Date.now(), etag: r.headers.get('etag'), data });
  return data;
}

/** Обработчик: ключ сайта → файл ММ → transform → JSON. Без ключа в окружении данные закрыты всем. */
function serve(file, transform) {
  return async function (req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (req.method !== 'GET') return res.status(405).send('{"error":"METHOD_NOT_ALLOWED"}');
    const key = process.env.MM_SITE_KEY;
    if (!key) return res.status(503).send(JSON.stringify({ error: 'не задан MM_SITE_KEY — данные закрыты' }));
    const given = Buffer.from(String(req.headers['x-mm-key'] || '')), want = Buffer.from(key);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).send(JSON.stringify({ error: 'нужен ключ' }));
    const token = process.env.MM_GITHUB_READ_TOKEN;
    if (!token) return res.status(500).send(JSON.stringify({ error: 'не задан MM_GITHUB_READ_TOKEN' }));
    try { return res.status(200).send(JSON.stringify(transform(await readMM(file, token)))); }
    catch (e) { return res.status(502).send(JSON.stringify({ error: String(e && e.message || e).slice(0, 200) })); }
  };
}

module.exports = { serve, readMM };
