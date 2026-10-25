/* Общий код отображения текста: одно и то же рисует и превью в главном окне, и окно текста.
   o = { kind, S(), onSeek(t), getTime(), status(msg) }
   Фон показывается только в окне текста (kind === 'bgpop'): в превью его нет. */

export function findLine(L, t) {
  let lo = 0, hi = L.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].time <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

export function Display(root, o) {
  const S = () => o.S();
  const on = () => o.kind === 'bgpop';
  root.className = 'view';
  root.innerHTML = '<div class="bg"></div><div class="panel"><canvas class="pc"></canvas><div class="pt"></div><div class="list"></div></div><div class="empty"></div>'
    + '<div class="tm"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="45"/><circle class="arc" cx="50" cy="50" r="45" pathLength="100"/></svg><span class="tt">00:00</span></div>';
  const bg = root.querySelector('.bg'), list = root.querySelector('.list'), empty = root.querySelector('.empty');
  const panel = root.querySelector('.panel'), pc = root.querySelector('.pc'), cx = pc.getContext('2d');
  const tmEl = root.querySelector('.tm'), arc = root.querySelector('.arc'), tt = root.querySelector('.tt');
  let cur = -2, last = 0, geo = '';
  let srcEl = null, srcUrl = null, blobUrl = null, wantPlay = false, retry = 0, lastFail = 0, mvT = 0;
  let dirty = true, lt = -1, lw = 0, lh = 0;

  /* единственное фоновое видео: обычный <video>, а размытие под текстом считается на маленьком холсте из его кадров */
  function makeVideo(url, t) {
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', ''); v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.disablePictureInPicture = true; v.disableRemotePlayback = true;
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none';
    v.onloadedmetadata = () => {
      if (isFinite(v.duration) && v.duration > 0) {
        const tt = ((t == null) ? o.getTime() : t) % v.duration;
        if (Math.abs(tt - v.currentTime) > .5) v.currentTime = tt;
      }
    };
    v.oncanplay = () => { d.keep(wantPlay); dirty = true; };
    v.onseeked = () => { dirty = true; };
    v.onloadeddata = () => { dirty = true; };
    v.onerror = () => videoFailed(v);
    v.src = url; bg.appendChild(v);
    return v;
  }
  const dropBlob = () => { if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; } };

  /* ошибка видео: код 2 = не удалось дочитать файл, пробуем загрузить его целиком заново */
  async function videoFailed(v) {
    if (v !== srcEl || Date.now() - lastFail < 800) return; lastFail = Date.now();
    const code = v.error && v.error.code;
    if (code === 2 && srcUrl && retry < 3) {
      retry++; const t = v.currentTime || mvT || 0;
      o.status(`Видео прервалось (ошибка чтения файла), загружаю заново (${retry}/3)…`);
      let url;
      try {
        const r = await fetch(srcUrl);
        url = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: r.headers.get('content-type') || 'video/mp4' }));
      } catch (e) { o.status('Не удалось прочитать видеофайл.'); return; }
      if (v !== srcEl) { URL.revokeObjectURL(url); return; } // пока грузили, фон сменили
      dropBlob(); blobUrl = url;
      bg.innerHTML = ''; srcEl = makeVideo(url, t); dirty = true; d.keep(wantPlay);
      return;
    }
    o.status(code === 2 ? 'Не удалось прочитать видеофайл с диска. Если он на сетевом или облачном диске, скопируй его на локальный диск и выбери заново.'
      : code === 3 ? 'Видео не удалось раскодировать. Попробуй пересохранить его в MP4 (H.264, 8 бит, 1080p).'
      : 'Браузер не поддерживает формат или кодек этого видео. Лучше всего подходят MP4 (H.264) и WebM.');
  }

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
      dirty = true;
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
      bg.innerHTML = ''; bg.style.backgroundImage = ''; srcEl = null; srcUrl = null; dropBlob(); retry = 0; dirty = true;
      if (!url || !on()) return;
      srcUrl = url;
      if (vid) srcEl = makeVideo(url, null);
      else {
        bg.style.backgroundImage = `url("${url}")`;
        const im = document.createElement('img'); im.onload = () => { dirty = true; }; im.src = url; srcEl = im;
      }
    },
    touch() { dirty = true; },
    keep(want) {
      wantPlay = want;
      const v = srcEl && srcEl.tagName === 'VIDEO' ? srcEl : null;
      if (!v || !v.isConnected) return;
      const w = want && on(), now = Date.now();
      if (w && v.paused && !v.error) { v.play().catch(e => { if (e.name !== 'AbortError') o.status('Видео не запускается: ' + e.name); }); v._ls = now; }
      else if (!w && !v.paused) v.pause();
      else if (w && !v.paused) {
        if (v.currentTime !== v._lt) { v._lt = v.currentTime; v._ls = now; }
        else if (now - (v._ls || now) > 2500) { v._ls = now; try { v.currentTime = v.currentTime; } catch (e) {} } /* видео стоит на месте: перемотка на то же место обычно его оживляет */
      }
    },
    stat() {
      const v = srcEl && srcEl.tagName === 'VIDEO' ? srcEl : null; if (!v) return null;
      const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
      return { w: v.videoWidth, h: v.videoHeight, p: v.paused, rs: v.readyState, t: v.currentTime, d: q.droppedVideoFrames || 0, n: q.totalVideoFrames || 0, e: v.error && v.error.code };
    },
    seek(t) {
      const v = srcEl && srcEl.tagName === 'VIDEO' ? srcEl : null;
      if (v && isFinite(v.duration) && v.duration > 0) { try { v.currentTime = t % v.duration; } catch (e) {} }
    },
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

  /* размытие под текстом перерисовывается только когда что-то изменилось: новый кадр видео, размер окна, настройки */
  (function frame() {
    requestAnimationFrame(frame);
    const s = srcEl; if (!s || !on()) return;
    const W = root.clientWidth, H = root.clientHeight; if (!W || !H) return;
    const sw = s.videoWidth || s.naturalWidth, sh = s.videoHeight || s.naturalHeight;
    if (!sw || !sh || (s.readyState !== undefined && s.readyState < 2)) return;
    const t = s.currentTime || 0;
    if (!dirty && t === lt && W === lw && H === lh) return;
    dirty = false; lt = t; lw = W; lh = H;
    if (s.tagName === 'VIDEO') mvT = t;
    const blur = S().blur;
    if (blur > 0) {
      const k = Math.max(W / sw, H / sh), vw = W / k, vh = H / k;
      const cw = Math.max(16, Math.round(W / (blur * .8 + 1))), ch = Math.max(9, Math.round(cw * H / W));
      if (pc.width !== cw || pc.height !== ch) { pc.width = cw; pc.height = ch; cx.imageSmoothingQuality = 'medium'; if ('filter' in cx) cx.filter = 'blur(1px)'; }
      cx.drawImage(s, (sw - vw) / 2, (sh - vh) / 2, vw, vh, 0, 0, cw, ch);
    }
  })();
  d.style();
  return d;
}
