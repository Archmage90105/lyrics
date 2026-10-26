/* Главное окно: управление, плеер, поиск текста. */
import './view.css';
import './app.css';
import { emit, listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Display, findLine } from './display.js';
import { EV } from './bus.js';

const $ = s => document.querySelector(s), au = $('#au');
const st = t => $('#st').textContent = t;
let L = [], off = 0, M = null, meta = null, bgPath = null, bgVid = false, playing = false;
let S = { scale: 100, blur: 18, tint: 45, pw: 94, ph: 100, tsh: false, tt: '05:00', tpos: 'tc', bgshow: true, bmode: 'css', perf: 'auto', autoLevel: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem('lyr') || '{}')); } catch (e) {}
const saveS = () => { try { localStorage.setItem('lyr', JSON.stringify(S)); } catch (x) {} };
const VIDEO_RE = /\.(mp4|m4v|webm|mov|mkv|ogv|avi)$/i;

/* ---------- таймер обратного отсчёта ---------- */
const tm = {
  total: 0, rem: 0, t0: 0, on: false,
  set(ms) { this.total = ms; if (!this.on) this.rem = ms; },
  value() {
    let v = this.on ? this.rem - (performance.now() - this.t0) : this.rem;
    if (v <= 0) { v = 0; this.on = false; this.rem = 0; }
    return v;
  },
  run() { if (this.on || this.rem <= 0) return; this.t0 = performance.now(); this.on = true; },
  pause() { if (!this.on) return; this.rem = Math.max(0, this.rem - (performance.now() - this.t0)); this.on = false; },
  reset() { this.on = false; this.rem = this.total; },
};
const pt = s => { const p = s.trim().split(':').map(Number); return (!p.length || p.some(x => isNaN(x))) ? null : p.reduce((a, b) => a * 60 + b, 0) * 1000; };

/* ---------- превью и связь с окном текста ---------- */
const pv = Display($('#pv'), {
  kind: 'bgprev',
  S: () => S,
  onSeek: t => { au.currentTime = t; },
  getTime: () => au.currentTime,
  status: st,
});

let lastHb = -1e9, popStat = null;
const popOpen = () => performance.now() - lastHb < 3500;

const pushLines = () => emit(EV.lines, { lines: L });
const pushBg = () => emit(EV.bg, bgPath ? { path: bgPath, vid: bgVid } : null);
const pushSet = () => emit(EV.set, { S, off });
const pushTick = () => emit(EV.tick, { t: au.currentTime, playing, v: tm.value(), total: tm.total, on: tm.on });
const pushAll = () => { pushSet(); pushLines(); pushBg(); pushTick(); };

listen(EV.ready, () => { lastHb = performance.now(); pushAll(); });
listen(EV.hb, e => { lastHb = performance.now(); popStat = e.payload && e.payload.s; });
listen(EV.seekreq, e => { au.currentTime = e.payload.t; });
listen(EV.status, e => st(e.payload.msg));
listen(EV.perf, e => { S.autoLevel = e.payload.level; saveS(); });

async function openPop() {
  try {
    const ex = await WebviewWindow.getByLabel('lyrics');
    if (ex) { await ex.setFocus(); return; }
    const w = new WebviewWindow('lyrics', { url: 'lyrics-view.html', title: 'Текст песни', width: 1100, height: 620, center: true });
    w.once('tauri://error', e => st('Не удалось открыть окно текста: ' + (e.payload || '')));
    w.once('tauri://destroyed', () => { lastHb = -1e9; popStat = null; });
    st('Окно текста открыто. Его можно перетащить на другой монитор или развернуть на весь экран (F11).');
  } catch (e) { st('Не удалось открыть окно текста: ' + e); }
}
$('#win').onclick = openPop;

/* ---------- общий запуск: музыка + видео + таймер ---------- */
function go() {
  playing = true; $('#pp').textContent = 'Пауза';
  tm.run();
  if (au.src && au.paused) au.play().catch(() => {});
  pushTick();
}
function halt() {
  playing = false; $('#pp').textContent = 'Старт';
  tm.pause();
  if (!au.paused) au.pause();
  pushTick();
}
$('#pp').onclick = () => playing ? halt() : go();
$('#rs').onclick = () => { halt(); au.currentTime = 0; tm.reset(); emit(EV.seek, { t: 0 }); pushTick(); };
au.onplay = () => { if (!playing) go(); };
au.onpause = () => { if (playing && !au.ended) halt(); };
au.onseeked = () => { emit(EV.seek, { t: au.currentTime }); pushTick(); };

/* ---------- текст и время ---------- */
function parse(t) {
  const r = [];
  for (const row of t.split(/\r?\n/)) {
    const ts = [...row.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!ts.length) continue;
    const tx = row.replace(/\[[^\]]*\]/g, '').trim();
    ts.forEach(m => r.push({ time: +m[1] * 60 + +m[2], text: tx }));
  }
  return r.sort((a, b) => a.time - b.time);
}
function setLyrics(a) { L = a; pv.lines(a); pushLines(); $('#dlrc').disabled = !a.length; }

let n = 0;
setInterval(() => {
  const i = findLine(L, au.currentTime + off), r = tm.value();
  pv.show(i); pv.timer(r, tm.total);
  n++;
  if (n % 12 === 0) {
    const s = popOpen() ? popStat : null;
    $('#vs').textContent = s ? `Видео: ${s.w}×${s.h}, ${s.e ? 'ошибка ' + s.e : s.p ? 'пауза' : s.rs < 3 ? 'буферизация' : 'играет'}, ${s.t.toFixed(1)} с, пропущено кадров ${s.d} из ${s.n}. ${perfText()}` : '';
  }
}, 80);
setInterval(() => { if (popOpen()) pushTick(); }, 250);

/* ---------- поиск (с локальным кэшем на случай, когда интернета нет) ---------- */
const ck = q => 'lyr:c:' + q.toLowerCase().replace(/\s+/g, ' ').trim();
const cacheGet = q => { try { return JSON.parse(localStorage.getItem(ck(q))); } catch (e) { return null; } };
const cachePut = (q, h) => { try { localStorage.setItem(ck(q), JSON.stringify({ artistName: h.artistName, trackName: h.trackName, duration: h.duration, syncedLyrics: h.syncedLyrics })); } catch (e) {} };

async function search() {
  const q = $('#q').value.trim(); if (!q) return;
  st('Ищу текст…');
  let h = null, fromCache = false;
  try {
    const resp = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const r = await resp.json();
    const dur = au.duration || 0;
    h = r.filter(x => x.syncedLyrics).sort((a, b) => Math.abs(a.duration - dur) - Math.abs(b.duration - dur))[0];
    if (!h) { st('Текста с таймкодами не нашлось. Открой .lrc или разметь вручную.'); return; }
    cachePut(q, h);
  } catch (e) {
    h = cacheGet(q); fromCache = !!h;
    if (!h) { st('Не удалось связаться с LRCLIB, сохранённого текста тоже нет. Проверь интернет или открой .lrc.'); return; }
  }
  meta = h; setLyrics(parse(h.syncedLyrics));
  st(`${fromCache ? 'Интернета нет, взят сохранённый текст: ' : 'Найдено: '}${h.artistName} — ${h.trackName}. Нажми «Старт».`);
}
$('#sr').onclick = search;
$('#q').onkeydown = e => { if (e.key === 'Enter') search(); };

/* ---------- файлы ---------- */
$('#fa').onclick = async () => {
  try {
    const p = await open({ multiple: false, filters: [{ name: 'Аудио', extensions: ['mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'wma'] }] });
    if (!p) return;
    halt(); au.src = convertFileSrc(p);
    $('#q').value = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/_+/g, ' ');
    meta = null; setLyrics([]); au.onloadedmetadata = () => { search(); };
  } catch (e) { st('Не удалось открыть файл: ' + e); }
};
$('#fl').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const a = parse(await f.text()); meta = null; setLyrics(a);
  st(a.length ? `Загружено строк: ${a.length}` : 'В файле нет таймкодов');
  e.target.value = '';
};
const fmt = s => { const m = Math.floor(s / 60); return `[${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(2).padStart(5, '0')}]`; };
$('#dlrc').onclick = async () => {
  const head = meta ? `[ar:${meta.artistName}]\n[ti:${meta.trackName}]\n` : '';
  const name = (meta ? `${meta.artistName} - ${meta.trackName}` : ($('#q').value || 'lyrics')).replace(/[\\/:*?"<>|]/g, '');
  const body = head + L.map(l => fmt(l.time) + ' ' + l.text).join('\n');
  try {
    const p = await save({ defaultPath: name + '.lrc', filters: [{ name: 'LRC', extensions: ['lrc'] }] });
    if (!p) return;
    await writeTextFile(p, body);
    st('Сохранено: ' + p);
  } catch (e) { st('Не удалось сохранить .lrc: ' + e); }
};
$('#m').onclick = () => { off -= .5; st('Сдвиг текста: ' + off.toFixed(1) + ' с'); pushSet(); };
$('#p').onclick = () => { off += .5; st('Сдвиг текста: ' + off.toFixed(1) + ' с'); pushSet(); };

/* ---------- режим производительности ---------- */
const PERF_NAMES = ['полный вид', 'без размытия', 'без размытия, тени и скруглений'];
const perfText = () => S.perf === 'auto' ? `Режим: авто, сейчас «${PERF_NAMES[S.autoLevel || 0]}».`
  : S.perf === 'lite' ? 'Режим: лёгкий.' : S.perf === 'vid' ? 'Режим: только видео (диагностика).' : 'Режим: максимум.';
$('#perf').value = S.perf;
$('#perf').onchange = e => {
  S.perf = e.target.value;
  if (S.perf === 'auto') S.autoLevel = 0; // заново присмотреться к этому видео и компьютеру
  saveS(); pushSet(); st(perfText());
};
$('#bmode').value = S.bmode;
$('#bmode').onchange = e => { S.bmode = e.target.value; saveS(); pushSet(); };

/* ---------- настройки, фон, таймер ---------- */
[['sc', 'scale', '%'], ['pw', 'pw', '%'], ['ph', 'ph', '%'], ['bl', 'blur', ' px'], ['tn', 'tint', '%']].forEach(([id, k, u]) => {
  const e = $('#' + id), o = $('#' + id + 'o');
  e.value = S[k]; o.textContent = S[k] + u;
  e.oninput = () => { S[k] = +e.value; o.textContent = S[k] + u; saveS(); pv.style(); pushSet(); };
});
$('#fb').onclick = async () => {
  try {
    const p = await open({ multiple: false, filters: [{ name: 'Фон окна текста: картинка или видео', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'm4v', 'webm', 'mov', 'mkv', 'ogv'] }] });
    if (!p) return;
    bgPath = p; bgVid = VIDEO_RE.test(p);
    pushBg(); st('Фон выбран. Он виден только в окне текста.');
  } catch (e) { st('Не удалось открыть фон: ' + e); }
};
$('#fx').onclick = () => { bgPath = null; pushBg(); };
$('#tsh').checked = !!S.tsh;
$('#tsh').onchange = e => { S.tsh = e.target.checked; saveS(); pv.style(); pushSet(); };
$('#tt').value = S.tt;
$('#tpos').value = S.tpos || 'tc';
$('#tpos').onchange = e => { S.tpos = e.target.value; saveS(); pv.style(); pushSet(); };
tm.set(pt(S.tt) || 300000); tm.reset();
$('#tt').onchange = e => {
  const ms = pt(e.target.value);
  if (ms === null || ms <= 0) { e.target.value = S.tt; st('Время таймера в формате мм:сс, например 05:00'); return; }
  S.tt = e.target.value.trim(); saveS(); tm.set(ms); pushSet(); pushTick();
};

/* ---------- ручная разметка ---------- */
const hint = () => $('#hint').textContent = M && M.r.length < M.t.length ? `Следующая строка: «${M.t[M.r.length]}»` : '';
$('#mk').onclick = () => { $('#pan').hidden = !$('#pan').hidden; };
$('#go').onclick = e => {
  const t = $('#txt').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!t.length) return;
  M = { t, r: [] }; au.currentTime = 0; go(); e.target.blur(); hint();
};
function stamp() {
  if (!M) return;
  M.r.push({ time: au.currentTime, text: M.t[M.r.length] });
  if (M.r.length === M.t.length) { meta = null; setLyrics(M.r); M = null; $('#hint').textContent = 'Готово. Нажми «Скачать .lrc», чтобы не размечать заново.'; }
  else hint();
}
$('#tap').onclick = stamp;
addEventListener('keydown', e => { if (M && e.code === 'Space' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); stamp(); } });
