/* Окно текста (отдельное окно Tauri). Всё состояние приходит событиями из главного окна. */
import './view.css';
import { emit, listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Display, findLine } from './display.js';
import { EV } from './bus.js';

let S = { scale: 100, blur: 18, tint: 45, pw: 94, ph: 100, tsh: false, tt: '05:00', tpos: 'tc', bgshow: true, bmode: 'css', perf: 'auto', autoLevel: 0 };
let L = [], off = 0, wasPlaying = false;
let base = { t: 0, playing: false, at: performance.now() };      // время аудио, пришедшее из главного окна
let tmr = { v: 0, total: 0, on: false, at: performance.now() };  // таймер обратного отсчёта
let autoLevel = 0;                                                // уровень облегчения, выбранный авто-режимом

const audioTime = () => base.t + (base.playing ? (performance.now() - base.at) / 1000 : 0);
const timerLeft = () => Math.max(0, tmr.on ? tmr.v - (performance.now() - tmr.at) : tmr.v);

const d = Display(document.getElementById('root'), {
  kind: 'bgpop',
  S: () => S,
  onSeek: t => emit(EV.seekreq, { t }),
  getTime: audioTime,
  status: m => emit(EV.status, { msg: m }),
});

/* какой уровень облегчения сейчас нужен: «Максимум» всегда 0, «Лёгкий» всегда 2, «Авто» по результатам наблюдения */
const levelNow = () => S.perf === 'lite' ? 2 : S.perf === 'auto' ? autoLevel : 0;
const applyLevel = () => { d.level(levelNow(), S.perf === 'vid'); d.keep(base.playing); };

(async () => {
  await listen(EV.lines, e => { L = e.payload.lines || []; d.lines(L); });
  await listen(EV.bg, e => {
    const b = e.payload;
    d.bg(b ? convertFileSrc(b.path) : null, b ? !!b.vid : false);
    d.keep(base.playing);
  });
  await listen(EV.set, e => {
    S = Object.assign({}, S, e.payload.S); off = e.payload.off || 0;
    autoLevel = S.autoLevel || 0; resetWatch(); applyLevel();
  });
  await listen(EV.tick, e => {
    const p = e.payload, now = performance.now();
    base = { t: p.t, playing: p.playing, at: now };
    tmr = { v: p.v, total: p.total, on: p.on, at: now };
    if (p.playing !== wasPlaying) { wasPlaying = p.playing; d.keep(p.playing); }
  });
  await listen(EV.seek, e => d.seek(e.payload.t));
  await emit(EV.ready, {}); // главное окно в ответ пришлёт текст, фон, настройки и время
})();

let n = 0;
setInterval(() => {
  d.show(findLine(L, audioTime() + off)); d.timer(timerLeft(), tmr.total);
  if (++n % 6 === 0) d.keep(base.playing); /* раз в ~0,5 с: если видео остановилось само, запускаем снова */
}, 80);
setInterval(() => emit(EV.hb, { s: d.stat() }), 1000);

/* ---------- авто-режим: если видео стало пропускать кадры, упрощаем оформление ----------
   Каждые 2 с смотрим долю пропущенных кадров. Три плохих интервала подряд — уровень +1
   (1: без размытия, 2: ещё без тени текста и скруглений). Выбор запоминается на этом компьютере. */
let prev = null, bad = 0, advised = false;
function resetWatch() { prev = null; bad = 0; }
setInterval(() => {
  if (S.perf !== 'auto' || !base.playing || document.visibilityState !== 'visible') { resetWatch(); return; }
  const s = d.stat();
  if (!s || s.p) { resetWatch(); return; }
  if (prev && s.n >= prev.n) {
    const dn = s.n - prev.n, dd = s.d - prev.d;
    if (dn >= 20) bad = (dd / dn > 0.12) ? bad + 1 : Math.max(0, bad - 1);
    if (bad >= 3) {
      bad = 0;
      if (autoLevel < 2) {
        autoLevel++; applyLevel();
        emit(EV.perf, { level: autoLevel });
        emit(EV.status, { msg: autoLevel === 1
          ? 'Окно текста: видео пропускает кадры, размытие отключено автоматически (режим «Авто»). Вернуть: выбери режим «Максимум» или снова «Авто».'
          : 'Окно текста: пропуски кадров остались, упростил оформление ещё сильнее (без тени текста и скруглений).' });
      } else if (!advised) {
        advised = true;
        emit(EV.status, { msg: 'Окно текста: видео всё равно пропускает кадры. Пересохрани его в MP4 (H.264, 8 бит, 1080p, 30 fps) или выбери видео полегче.' });
      }
    }
  }
  prev = s;
}, 2000);

/* F11 — на весь экран, Esc — выйти из полного экрана */
const win = getCurrentWindow();
addEventListener('keydown', async e => {
  if (e.key === 'F11') { e.preventDefault(); win.setFullscreen(!(await win.isFullscreen())); }
  else if (e.key === 'Escape') win.setFullscreen(false);
});
