/* =====================================================================
   "Watch how" player: plays a guide on real Fleetroot screenshots.
   A cursor glides to each control, the area is spotlighted and zoomed,
   a click ripples, and the caption shows the step in English + Arabic.
   ===================================================================== */
(function () {
  const ICON = {
    play: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#FFD84D"/><path d="M19.5 15.5l14 8.5-14 8.5z" fill="#15151C"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.5l14.5 10.8-6.3.9 3.9 7.4-3 1.6-3.9-7.5L4 20.4z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    resume: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>',
    replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IMG = (n) => `/img/kb/${n}.jpg`;

  function Player(host, demo, opts = {}) {
    const showAr = () => (opts.arabic ? opts.arabic() : true);
    host.innerHTML = `<div class="player">
      <div class="frame"><div class="frame-bar"><i></i><i></i><i></i><span class="url">track.fleetroot.com</span></div>
        <div class="screen idle" role="img" aria-label="Animated walkthrough on the Fleetroot screen">
          <div class="zoomer"><img class="shot a" alt="" src="${IMG(demo[0].img)}"><img class="shot b off" alt="">
            <div class="spot"></div><div class="ripple"></div><div class="cursor" hidden>${ICON.cursor}</div></div>
          <button type="button" class="watch">${ICON.play}<span><b>Watch how</b><span class="ar">شاهد الطريقة</span></span></button>
        </div></div>
      <div class="cap"><span class="num">${demo.length} steps</span>
        <div class="txt"><p class="en">Press <b>Watch how</b> to see each step on the real screen.</p><p class="ar">اضغط <b>شاهد الطريقة</b> لمشاهدة كل خطوة على الشاشة الفعلية.</p></div>
        <div class="ctl"><button type="button" class="icobtn prev" aria-label="Previous step" disabled>${ICON.prev}</button><button type="button" class="icobtn pp" aria-label="Play">${ICON.resume}</button><button type="button" class="icobtn next" aria-label="Next step">${ICON.next}</button></div></div>
      <div class="dots">${demo.map(() => '<i></i>').join('')}</div></div>`;
    const $ = (s) => host.querySelector(s);
    const screen = $('.screen'), zoomer = $('.zoomer'), spot = $('.spot'), cur = $('.cursor'), rip = $('.ripple');
    let front = $('.shot.a'), back = $('.shot.b');
    let i = -1, playing = false, run = 0, curImg = demo[0].img;
    // preload
    [...new Set(demo.map((s) => s.img))].forEach((n) => { const im = new Image(); im.src = IMG(n); });
    const wait = (ms, id) => new Promise((res, rej) => setTimeout(() => (id === run ? res() : rej('stop')), reduce() ? Math.min(ms, 400) : ms));

    function setImg(name) {
      if (name === curImg) return;
      curImg = name; back.src = IMG(name);
      back.classList.remove('off'); front.classList.add('off');
      [front, back] = [back, front];
    }
    function zoomTo(s, z) {
      if (reduce() || !z) { zoomer.style.transform = 'none'; return; }
      const [x, y] = s.at;
      zoomer.style.transformOrigin = `${x}% ${y}%`;
      zoomer.style.transform = `scale(${z})`;
    }
    function caption(k) {
      const s = demo[k];
      $('.num').textContent = `Step ${k + 1} of ${demo.length}`;
      $('.en').innerHTML = md(s.en);
      const ar = $('.cap .ar'); ar.innerHTML = md(s.ar); ar.hidden = !showAr();
      host.querySelectorAll('.dots i').forEach((d, n) => d.classList.toggle('on', n <= k));
      $('.prev').disabled = k <= 0; $('.next').disabled = k >= demo.length - 1;
    }
    function place(s, z) {
      const [x, y, w, h] = s.at, padX = 0.8, padY = 1.2;
      Object.assign(spot.style, { left: `${x - w / 2 - padX}%`, top: `${y - h / 2 - padY}%`, width: `${w + 2 * padX}%`, height: `${h + 2 * padY}%` });
      cur.style.left = `${x}%`; cur.style.top = `${y + h * 0.15}%`;
      cur.style.transform = `scale(${1 / (z || 1)})`; cur.dataset.z = z || 1;
      rip.style.left = `${x}%`; rip.style.top = `${y}%`;
    }
    const zoomFor = () => (screen.clientWidth < 560 ? 2.1 : 1.55);

    async function showStep(k, id, animate) {
      const s = demo[k]; i = k;
      cur.hidden = false; screen.classList.remove('idle');
      if (s.img !== curImg) { spot.classList.remove('on'); zoomTo(s, 0); if (animate) await wait(500, id); setImg(s.img); if (animate) await wait(550, id); }
      caption(k);
      const z = zoomFor();
      place(s, z); zoomTo(s, z);
      if (animate) await wait(1150, id);
      spot.classList.add('on');
      if (s.act === 'look') return;
      if (animate) {
        await wait(500, id);
        cur.style.transform = `scale(${0.82 / z})`; rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go');
        await wait(170, id); cur.style.transform = `scale(${1 / z})`;
      }
    }
    async function play(from = 0) {
      const id = ++run; playing = true; ppIcon();
      $('.watch').hidden = true;
      try {
        for (let k = from; k < demo.length; k++) {
          await showStep(k, id, true);
          const len = (demo[k].en.length + (showAr() ? demo[k].ar.length * 0.6 : 0));
          await wait(1500 + Math.min(2600, len * 32), id);
        }
        playing = false; ppIcon(true);
        opts.onDone && opts.onDone();
      } catch (e) { /* stopped */ }
    }
    function stop() { run++; playing = false; ppIcon(); }
    function ppIcon(done) {
      const b = $('.pp');
      b.innerHTML = playing ? ICON.pause : done ? ICON.replay : ICON.resume;
      b.setAttribute('aria-label', playing ? 'Pause' : done ? 'Watch again' : 'Play');
      b.dataset.done = done ? '1' : '';
    }
    async function jump(k) { stop(); $('.watch').hidden = true; try { await showStep(k, run, false); } catch (e) {} spot.classList.add('on'); }

    $('.watch').onclick = () => play(0);
    $('.pp').onclick = () => { if (playing) stop(); else if ($('.pp').dataset.done || i < 0) play(0); else play(i); };
    $('.prev').onclick = () => i > 0 && jump(i - 1);
    $('.next').onclick = () => jump(Math.min(demo.length - 1, i + 1));
    return { play, stop, refresh: () => { if (i >= 0) caption(i); else $('.cap .ar').hidden = !showAr(); } };
  }
  window.FRPlayer = Player;
  window.FRmd = md;
})();
