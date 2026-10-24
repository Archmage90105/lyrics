/* Общий код отображения текста: одно и то же рисует и превью в главном окне, и окно текста.
   o = { kind, S(), onSeek(t), getTime(), status(msg) } */

export function findLine(L, t) {
  let lo = 0, hi = L.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].time <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

export function Display(root, o) {
  const S = () => o.S();
  const on = () => S()[o.kind] !== false;
  root.className = 'view';
  root.innerHTML = '<div class="bg"></div><div class="panel"><canvas class="pc"></canvas><div class="pt"></div><div class="list"></div></div><div class="empty"></div>'
    + '<div class="tm"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="45"/><circle class="arc" cx="50" cy="50" r="45" pathLength="100"/></svg><span class="tt">00:00</span></div>';
  const bg = root.querySelector('.bg'), list = root.querySelector('.list'), empty = root.querySelector('.empty');
  const panel = root.querySelector('.panel'), pc = root.querySelector('.pc'), cx = pc.getContext('2d');
  const tmEl = root.querySelector('.tm'), arc = root.querySelector('.arc'), tt = root.querySelector('.tt');
  const vids = () => bg.querySelectorAll('video');
  let cur = -2, last = 0, srcEl = null, geo = '';

  const d = {
    lines(a) {
      list.innerHTML = '';
      a.forEach(l => {
        const e = document.createElement('div');
        e.className = 'l'; e.textContent = l.text || '♪';
        e.onclick = () => o.onSeek(l.time);
        list.appendChild(e);
      });
      empty.textContent = a.length ? '' : 'Выбери песню: текст подтянется сам';
      cur = -2;
    },
    style() {
      const s = S();
      pc.style.display = s.blur > 0 ? 'block' : 'none';
      root.style.setProperty('--tint', s.tint / 100);
      root.style.setProperty('--pw', s.pw);
      root.style.setProperty('--ph', s.ph / 100);
      root.classList.toggle('hastm', !!s.tsh);
      root.classList.toggle('nobg', !on());
      const tp = s.tpos || 'tc';
      root.classList.toggle('pos-b', tp[0] === 'b');
      root.classList.toggle('pos-l', tp[1] === 'l');
      root.classList.toggle('pos-r', tp[1] === 'r');
    },
    bg(url, vid) {
      bg.innerHTML = ''; bg.style.backgroundImage = ''; srcEl = null;
      if (!url) return;
      if (vid) {
        const v = document.createElement('video');
        v.muted = true; v.defaultMuted = true; v.setAttribute('muted', ''); v.loop = true; v.playsInline = true; v.preload = 'auto';
        v.onloadedmetadata = () => { if (isFinite(v.duration) && v.duration > 0) v.currentTime = o.getTime() % v.duration; };
        v.oncanplay = () => o.onVideoReady && o.onVideoReady();
        v.onerror = () => o.status('Видео не открылось: формат или кодек не поддерживается. Лучше всего подходят MP4 (H.264) и WebM.');
        v.src = url; bg.appendChild(v); srcEl = v;
      } else {
        bg.style.backgroundImage = `url("${url}")`;
        const im = document.createElement('img'); im.src = url; srcEl = im;
      }
    },
    keep(want) {
      const w = want && on();
      vids().forEach(v => {
        if (w && v.paused && !v.error) v.play().catch(e => { if (e.name !== 'AbortError') o.status('Видео не запускается: ' + e.name); });
        else if (!w && !v.paused) v.pause();
      });
    },
    stat() {
      const v = vids()[0]; if (!v) return null;
      const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
      return { w: v.videoWidth, h: v.videoHeight, p: v.paused, rs: v.readyState, t: v.currentTime, d: q.droppedVideoFrames || 0, n: q.totalVideoFrames || 0, e: v.error && v.error.code };
    },
    seek(t) { vids().forEach(v => { if (isFinite(v.duration) && v.duration > 0) v.currentTime = t % v.duration; }); },
    timer(r, total) {
      const s = Math.ceil(r / 1000), txt = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      if (tt.textContent !== txt) tt.textContent = txt;
      arc.style.strokeDashoffset = total ? 100 * (1 - r / total) : 100;
      tmEl.classList.toggle('done', total > 0 && r <= 0);
    },
    fit() { /* размер шрифта подстраивается под размер окна */
      const s = S();
      const fs = Math.round(Math.min(root.clientWidth * .06, root.clientHeight * (s.tsh ? .15 : .17)) * s.scale / 100);
      if (fs > 0 && fs !== last) { last = fs; root.style.setProperty('--fs', fs + 'px'); cur = -2; }
      const rr = root.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      const x = Math.round(rr.left - pr.left - 1), y = Math.round(rr.top - pr.top - 1), w = root.clientWidth, h = root.clientHeight, g = x + '|' + y + '|' + w + '|' + h;
      if (g !== geo) { geo = g; pc.style.left = x + 'px'; pc.style.top = y + 'px'; pc.style.width = w + 'px'; pc.style.height = h + 'px'; }
    },
    show(i) {
      if (i === cur) return; cur = i;
      [...list.children].forEach((e, k) => { const x = Math.abs(k - i); e.className = 'l' + (x == 0 ? ' cur' : x == 1 ? ' near' : ''); });
      const c = list.children[Math.max(i, 0)];
      if (c) list.style.transform = `translateY(${-(c.offsetTop + c.offsetHeight / 2)}px)`;
    },
  };

  /* размытие без тяжёлого backdrop-filter: фон рисуется в маленьком размере и растягивается */
  function draw() {
    const s = S();
    if (!s.blur || !srcEl || !on()) return;
    const W = root.clientWidth, H = root.clientHeight;
    const sw = srcEl.videoWidth || srcEl.naturalWidth, sh = srcEl.videoHeight || srcEl.naturalHeight;
    if (!W || !H || !sw || !sh || (srcEl.readyState !== undefined && srcEl.readyState < 2)) return;
    const cw = Math.max(16, Math.round(W / (s.blur * .8 + 1))), ch = Math.max(9, Math.round(cw * H / W));
    if (pc.width !== cw || pc.height !== ch) { pc.width = cw; pc.height = ch; cx.imageSmoothingQuality = 'medium'; if ('filter' in cx) cx.filter = 'blur(1px)'; }
    const k = Math.max(W / sw, H / sh), vw = W / k, vh = H / k;
    cx.drawImage(srcEl, (sw - vw) / 2, (sh - vh) / 2, vw, vh, 0, 0, cw, ch);
  }
  (function loop() { draw(); requestAnimationFrame(loop); })();
  d.style();
  return d;
}
