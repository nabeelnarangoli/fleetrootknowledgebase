/* =====================================================================
   Fleetroot Knowledge Base — customer app (/help)
   Sign up → confirm email → sign in → browse and watch guides.
   ===================================================================== */
(function () {
  const app = document.getElementById('app');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = window.FRmd;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
  };
  const LOGO = '<img class="logo-img on-light" src="/img/fleetroot-logo.png" alt="Fleetroot"><img class="logo-img on-dark" src="/img/fleetroot-logo-light.png" alt="Fleetroot">';
  const I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    menu: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  };
  const API = {
    token: () => store.get('fr-kb-token'),
    async call(path, { method = 'GET', body } = {}) {
      const h = { 'content-type': 'application/json' }; const t = API.token(); if (t) h.authorization = 'Bearer ' + t;
      let r; try { r = await fetch('/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); } catch (e) { throw new Error('Can\'t reach the server. Check your internet connection.'); }
      let d = {}; try { d = await r.json(); } catch (e) {}
      if (!r.ok) { const er = new Error(d.error || 'Something went wrong. Please try again.'); er.data = d; er.status = r.status; throw er; }
      return d;
    },
  };
  function toast(msg, bad) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }

  let ME = null, VIEWED = {}, VOTES = {}, CONFIG = { allowSignup: true, modules: { fleet: true } }, MODULE = 'fleet', player = null;
  const AR = () => store.get('fr-kb-ar') !== '0';
  const topicsOf = (m) => KB.topics.filter((t) => t.module === m);
  const L = (o) => o.en;

  /* ---------------- auth screens ---------------- */
  function authShell(inner) {
    app.innerHTML = `<main class="auth wrap"><div class="authcard"><a href="/" aria-label="Fleetroot home">${LOGO}</a>${inner}</div></main>`;
  }
  const pwField = (id, label, ar, auto) => `<div class="field"><label for="${id}">${label}<span class="ar">${ar}</span></label><div class="pwwrap"><input id="${id}" type="password" autocomplete="${auto}" required minlength="8"><button type="button" class="pwshow" data-for="${id}">Show</button></div></div>`;
  function wirePw() { $$('.pwshow').forEach((b) => (b.onclick = () => { const i = $('#' + b.dataset.for); const on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.textContent = on ? 'Hide' : 'Show'; })); }

  function authView(mode = 'signin', banner = '', email = '') {
    const signup = mode === 'signup';
    authShell(`<div><h1>${signup ? 'Create your account' : 'Welcome back'}</h1><p class="ar sub">${signup ? 'أنشئ حسابك' : 'مرحبًا بعودتك'}</p></div>
      ${banner}
      <div class="tabs" role="tablist"><button type="button" class="${signup ? '' : 'on'}" data-m="signin">Sign in</button><button type="button" class="${signup ? 'on' : ''}" data-m="signup">Create account</button></div>
      ${signup && !CONFIG.allowSignup ? '<p class="banner warn">Sign-up is closed at the moment. Contact Fleetroot support at <b>support@fleetroot.com</b> for access.</p>' : `
      <form class="authform" novalidate>
        ${signup ? `<div class="field"><label for="f-name">Full name<span class="ar">الاسم الكامل</span></label><input id="f-name" autocomplete="name" required maxlength="60"></div>
        <div class="row2"><div class="field"><label for="f-company">Company<span class="ar">الشركة</span></label><input id="f-company" autocomplete="organization" maxlength="80"></div>
        <div class="field"><label for="f-phone">Mobile<span class="ar">الجوال</span></label><input id="f-phone" type="tel" autocomplete="tel" maxlength="24" placeholder="+971 …"></div></div>` : ''}
        <div class="field"><label for="f-email">Email<span class="ar">البريد الإلكتروني</span></label><input id="f-email" type="email" autocomplete="email" required maxlength="100" value="${esc(email)}"></div>
        ${pwField('f-pw', 'Password', 'كلمة المرور', signup ? 'new-password' : 'current-password')}
        ${signup ? '<p class="hint muted" style="font-size:13px;margin-top:-6px">At least 8 characters. We\'ll email you a link to confirm your address.</p>' : ''}
        <p class="formerr" role="alert"></p>
        <button class="btn" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
      </form>`}
      <div class="authfoot">${signup ? '<span>Already have an account? <button type="button" class="linkbtn" data-m="signin">Sign in</button></span>' : '<button type="button" class="linkbtn" id="forgot">Forgot your password?</button><a href="/">Back to home</a>'}</div>`);
    $$('[data-m]').forEach((b) => (b.onclick = () => authView(b.dataset.m, '', $('#f-email')?.value || email)));
    const fg = $('#forgot'); if (fg) fg.onclick = () => forgotView($('#f-email')?.value || '');
    wirePw();
    const form = $('.authform'); if (!form) return;
    (signup ? $('#f-name') : (email ? $('#f-pw') : $('#f-email'))).focus();
    form.onsubmit = async (e) => {
      e.preventDefault(); const b = $('button[type=submit]', form); const err = $('.formerr'); err.textContent = ''; $$('.field.err').forEach((f) => f.classList.remove('err'));
      const em = $('#f-email').value.trim(), pw = $('#f-pw').value;
      b.disabled = true;
      try {
        if (signup) {
          const d = await API.call('/signup', { method: 'POST', body: { name: $('#f-name').value, company: $('#f-company').value, phone: $('#f-phone').value, email: em, password: pw } });
          checkEmailView(d.email, d.note);
        } else {
          const d = await API.call('/login', { method: 'POST', body: { email: em, password: pw } });
          store.set('fr-kb-token', d.token); ME = d.user; start();
        }
      } catch (x) {
        err.textContent = x.message; b.disabled = false;
        if (x.data?.field) $('#f-' + ({ password: 'pw' }[x.data.field] || x.data.field))?.closest('.field')?.classList.add('err');
        if (x.data?.unverified) err.innerHTML = esc(x.message) + ' <button type="button" class="linkbtn" id="rs">Send it again</button>', $('#rs').onclick = () => resend(em);
      }
    };
  }
  async function resend(email) {
    try { await API.call('/resend', { method: 'POST', body: { email } }); toast('Confirmation email sent again'); } catch (x) { toast(x.message, true); }
  }
  function checkEmailView(email, note) {
    authShell(`<span class="mailicon">${I.mail}</span><div><h1>Check your email</h1><p class="ar sub">تحقق من بريدك الإلكتروني</p></div>
      <p>We sent a confirmation link to <b>${esc(email)}</b>. Open it to switch on your account, then sign in.</p>
      <p class="ar" style="color:var(--muted);text-align:right">أرسلنا رابط تأكيد إلى بريدك. افتحه لتفعيل حسابك ثم سجّل الدخول.</p>
      ${note ? `<p class="banner warn">${esc(note)}</p>` : ''}
      <p class="muted" style="font-size:14px">Can't find it? Look in your spam or junk folder. The link works for 48 hours.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn ghost" id="again">Send the email again</button><button type="button" class="btn" id="tosignin">Go to sign in</button></div>`);
    $('#again').onclick = () => resend(email);
    $('#tosignin').onclick = () => authView('signin', '', email);
  }
  function forgotView(email = '') {
    authShell(`<div><h1>Reset your password</h1><p class="ar sub">إعادة تعيين كلمة المرور</p></div>
      <p class="muted">Enter your email and we'll send you a link to choose a new password.</p>
      <form class="authform"><div class="field"><label for="f-email">Email<span class="ar">البريد الإلكتروني</span></label><input id="f-email" type="email" required value="${esc(email)}"></div>
      <p class="formerr" role="alert"></p><button class="btn" type="submit">Send reset link</button></form>
      <div class="authfoot"><button type="button" class="linkbtn" id="back">Back to sign in</button></div>`);
    $('#back').onclick = () => authView('signin', '', $('#f-email').value);
    $('#f-email').focus();
    $('.authform').onsubmit = async (e) => {
      e.preventDefault(); const em = $('#f-email').value.trim();
      try { await API.call('/forgot', { method: 'POST', body: { email: em } }); authView('signin', `<p class="banner ok">If an account exists for <b>${esc(em)}</b>, a reset link is on its way. It works for 2 hours.</p>`, em); }
      catch (x) { $('.formerr').textContent = x.message; }
    };
  }
  function resetView(token) {
    authShell(`<div><h1>Choose a new password</h1><p class="ar sub">اختر كلمة مرور جديدة</p></div>
      <form class="authform">${pwField('f-pw', 'New password', 'كلمة المرور الجديدة', 'new-password')}${pwField('f-pw2', 'Type it again', 'أعد كتابتها', 'new-password')}
      <p class="formerr" role="alert"></p><button class="btn" type="submit">Save password</button></form>`);
    wirePw(); $('#f-pw').focus();
    $('.authform').onsubmit = async (e) => {
      e.preventDefault(); const p1 = $('#f-pw').value, p2 = $('#f-pw2').value;
      if (p1 !== p2) { $('.formerr').textContent = 'The two passwords are different. Type them again.'; return; }
      try { const d = await API.call('/reset', { method: 'POST', body: { token, password: p1 } }); history.replaceState(null, '', '/help'); authView('signin', '<p class="banner ok">Password saved. Sign in with your new password.</p>', d.email); }
      catch (x) { $('.formerr').textContent = x.message; }
    };
  }

  /* ---------------- signed-in app ---------------- */
  async function start() {
    try { const d = await API.call('/me'); ME = d.user; VIEWED = d.viewed || {}; VOTES = d.votes || {}; }
    catch (x) { store.set('fr-kb-token', null); return authView('signin', x.status === 401 ? '' : `<p class="banner bad">${esc(x.message)}</p>`); }
    if (!CONFIG.modules[MODULE]) MODULE = Object.keys(CONFIG.modules).find((k) => CONFIG.modules[k]) || 'fleet';
    shell(); route();
  }
  function shell() {
    const initials = (ME.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    app.innerHTML = `<header class="bar"><div class="in">
        <button type="button" class="icobtn navbtn" id="navbtn" aria-label="Show guides">${I.menu}</button>
        <a href="#" aria-label="Knowledge Base home">${LOGO}</a><span class="kb-tag">Knowledge Base</span>
        <div class="search" role="search">${I.search}<input id="q" type="search" placeholder="Search guides, e.g. fuel, report, driver" autocomplete="off" aria-label="Search guides"><div class="results" hidden></div></div>
        <div class="right">
          <label class="toggle" title="Show Arabic under each step"><input type="checkbox" id="artog" ${AR() ? 'checked' : ''}><span class="lbl">العربية</span></label>
          <div class="menuwrap"><button type="button" class="avatar" id="me" aria-label="Your account">${esc(initials)}</button>
          <div class="menu" hidden><div class="who"><b>${esc(ME.name)}</b><small>${esc(ME.email)}</small></div>
          <button type="button" data-a="profile">Profile and password</button><a href="https://track.fleetroot.com/" target="_blank" rel="noopener">Open Fleetroot ↗</a><button type="button" data-a="out">Sign out</button></div></div>
        </div></div></header>
      <div class="shell"><aside class="rail" id="rail"></aside><main class="main" id="main"></main></div>`;
    $('#artog').onchange = (e) => { store.set('fr-kb-ar', e.target.checked ? '1' : '0'); document.body.classList.toggle('noar', !e.target.checked); player && player.refresh(); };
    document.body.classList.toggle('noar', !AR());
    const menu = $('.menu');
    $('#me').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    document.addEventListener('click', (e) => { if (!e.target.closest('.menuwrap')) menu.hidden = true; if (!e.target.closest('.search')) $('.results').hidden = true; });
    $$('.menu [data-a]').forEach((b) => (b.onclick = () => { menu.hidden = true; b.dataset.a === 'out' ? signOut() : profile(); }));
    $('#navbtn').onclick = () => $('#rail').classList.toggle('open');
    wireSearch();
    rail();
  }
  function rail() {
    const r = $('#rail');
    const groups = Object.keys(KB.groups).filter((g) => topicsOf(MODULE).some((t) => t.group === g));
    const cur = location.hash.slice(1);
    r.innerHTML = `<div class="modsel">${KB.modules.map((m) => `<button type="button" data-mod="${m.id}" class="${m.id === MODULE ? 'on' : ''}" ${CONFIG.modules[m.id] ? '' : 'disabled'}>${esc(m.name.en)}${CONFIG.modules[m.id] ? `<small>${topicsOf(m.id).length}</small>` : '<small>Soon</small>'}</button>`).join('')}</div>
      ${groups.map((g) => `<div class="grp"><h4>${esc(KB.groups[g].en)}</h4>${topicsOf(MODULE).filter((t) => t.group === g).map((t) => `<a href="#${t.id}" class="${t.id === cur ? 'on' : ''}"><span class="tick ${VIEWED[t.id] ? 'done' : ''}"></span><span>${esc(t.t.en)}</span>${t.demo ? '<span class="vid">Watch</span>' : ''}</a>`).join('')}</div>`).join('')}`;
    $$('[data-mod]', r).forEach((b) => (b.onclick = () => { MODULE = b.dataset.mod; location.hash = ''; rail(); route(); }));
    $$('.grp a', r).forEach((a) => (a.onclick = () => r.classList.remove('open')));
  }
  function wireSearch() {
    const q = $('#q'), box = $('.results');
    const hay = (t) => [t.t.en, t.t.ar, t.sum.en, t.sum.ar, ...(t.steps || []).flatMap((s) => [s.en, s.ar]), ...(t.faq || []).flatMap((f) => [f.q.en, f.a.en])].join(' ').toLowerCase().replace(/\*\*/g, '');
    q.oninput = () => {
      const v = q.value.trim().toLowerCase();
      if (!v) { box.hidden = true; return; }
      const words = v.split(/\s+/);
      const hits = KB.topics.filter((t) => CONFIG.modules[t.module] && words.every((w) => hay(t).includes(w))).slice(0, 8);
      box.innerHTML = hits.length ? hits.map((t) => `<a href="#${t.id}"><b>${esc(t.t.en)}</b><small>${esc(KB.groups[t.group].en)} · ${esc(t.sum.en)}</small></a>`).join('') : '<p class="muted" style="padding:12px">No guides match. Try another word.</p>';
      box.hidden = false;
      $$('a', box).forEach((a) => (a.onclick = () => { box.hidden = true; q.value = ''; }));
    };
    q.onkeydown = (e) => { if (e.key === 'Enter') { const a = $('a', box); if (a) { location.hash = a.getAttribute('href'); box.hidden = true; q.value = ''; } } if (e.key === 'Escape') box.hidden = true; };
  }
  window.addEventListener('hashchange', () => ME && route());
  function route() {
    player && player.stop(); player = null;
    const id = location.hash.slice(1);
    const t = KB.topics.find((x) => x.id === id && CONFIG.modules[x.module]);
    if (t && t.module !== MODULE) MODULE = t.module;
    rail();
    t ? topic(t) : home();
    window.scrollTo(0, 0);
  }
  function home() {
    const list = topicsOf(MODULE), seen = list.filter((t) => VIEWED[t.id]).length;
    const mod = KB.modules.find((m) => m.id === MODULE);
    const first = (ME.name || '').split(/\s+/)[0];
    $('#main').innerHTML = `<div class="page">
      <div class="hello"><span class="eyebrow">${esc(mod.name.en)}</span><h1>Hi ${esc(first)}, what would you like to learn?</h1><p class="ar h1ar" style="color:var(--muted);font-size:19px;margin-top:8px;text-align:start">ماذا تريد أن تتعلّم اليوم؟</p></div>
      <div class="progress"><span><b>${seen} of ${list.length}</b> guides opened</span><span class="pbar"><i style="width:${list.length ? Math.round((seen / list.length) * 100) : 0}%"></i></span>${seen < list.length ? `<a class="btn sm" href="#${(list.find((t) => !VIEWED[t.id]) || list[0]).id}">Next guide</a>` : ''}</div>
      <div class="search mobsearch" style="margin:0;max-width:none">${I.search}<input id="q2" type="search" placeholder="Search guides" aria-label="Search guides"></div>
      ${Object.keys(KB.groups).filter((g) => list.some((t) => t.group === g)).map((g) => `<section class="sect"><h2>${esc(KB.groups[g].en)} <span class="ar" style="font-size:16px;color:var(--muted);font-weight:400">${esc(KB.groups[g].ar)}</span></h2>
        <div class="cards">${list.filter((t) => t.group === g).map((t) => `<a class="card" href="#${t.id}">${t.demo ? '<span class="vid">Watch how</span>' : ''}<h3>${esc(t.t.en)}</h3><p>${esc(t.sum.en)}</p><p class="ar">${esc(t.t.ar)}</p></a>`).join('')}</div></section>`).join('')}
    </div>`;
    const q2 = $('#q2'); if (q2) q2.oninput = () => { const q = $('#q'); q.value = q2.value; $('.search').style.display = 'block'; q.dispatchEvent(new Event('input')); q.focus(); };
  }
  function topic(t) {
    const list = topicsOf(t.module); const k = list.indexOf(t); const prev = list[k - 1], next = list[k + 1];
    const mod = KB.modules.find((m) => m.id === t.module);
    $('#main').innerHTML = `<article class="page">
      <nav class="crumbs"><a href="#">${esc(mod.name.en)}</a><span>/</span><span>${esc(KB.groups[t.group].en)}</span></nav>
      <header><h1>${esc(t.t.en)}</h1><p class="ar h1ar">${esc(t.t.ar)}</p></header>
      <div><p class="sum">${md(t.sum.en)}</p><p class="ar ar-line">${md(t.sum.ar)}</p></div>
      ${t.demo ? '<div id="demo"></div>' : ''}
      ${t.steps ? `<section><h2 style="font-size:20px;margin-bottom:12px">Steps</h2><ol class="steps">${t.steps.map((s) => `<li><div><p class="en">${md(s.en)}</p><p class="ar ar-line">${md(s.ar)}</p></div></li>`).join('')}</ol></section>` : ''}
      ${t.note ? `<div class="note"><p>${md(t.note.en)}</p><p class="ar ar-line">${md(t.note.ar)}</p></div>` : ''}
      ${t.faq ? `<div class="faq">${t.faq.map((f) => `<details><summary>${esc(f.q.en)}<span class="ar ar-line">${esc(f.q.ar)}</span></summary><p>${esc(f.a.en)}</p><p class="ar ar-line">${esc(f.a.ar)}</p></details>`).join('')}</div>` : ''}
      <div class="helpful"><span class="q">Was this guide helpful?<span class="ar ar-line">هل كان هذا الدليل مفيدًا؟</span></span>
        <button type="button" class="btn ghost sm ${VOTES[t.id] === 'yes' ? 'on' : ''}" data-v="yes">Yes</button><button type="button" class="btn ghost sm ${VOTES[t.id] === 'no' ? 'on' : ''}" data-v="no">No</button>
        <span class="muted" id="vthanks" style="font-size:14px">${VOTES[t.id] ? 'Thanks for your feedback.' : ''}</span></div>
      <div class="pn">${prev ? `<a href="#${prev.id}"><small>Previous</small><b>${esc(prev.t.en)}</b></a>` : '<span></span>'}${next ? `<a class="nx" href="#${next.id}"><small>Next</small><b>${esc(next.t.en)}</b></a>` : ''}</div>
    </article>`;
    if (t.demo) player = FRPlayer($('#demo'), t.demo, { arabic: AR });
    $$('[data-v]').forEach((b) => (b.onclick = async () => {
      VOTES[t.id] = b.dataset.v; $$('[data-v]').forEach((x) => x.classList.toggle('on', x === b)); $('#vthanks').textContent = 'Thanks for your feedback.';
      API.call('/track', { method: 'POST', body: { topic: t.id, event: b.dataset.v } }).catch(() => {});
    }));
    if (!VIEWED[t.id]) { VIEWED[t.id] = Date.now(); API.call('/track', { method: 'POST', body: { topic: t.id, event: 'view' } }).then(rail).catch(() => {}); }
  }
  function modal(html, ready) {
    const m = document.createElement('div'); m.className = 'modalbg'; m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(m);
    const close = () => m.remove();
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    ready && ready(m, close);
  }
  function profile() {
    modal(`<h2>Profile and password</h2><form class="authform" id="pf">
      <div class="field"><label for="p-name">Full name</label><input id="p-name" value="${esc(ME.name)}" required maxlength="60"></div>
      <div class="field"><label for="p-company">Company</label><input id="p-company" value="${esc(ME.company)}" maxlength="80"></div>
      <div class="field"><label for="p-phone">Mobile</label><input id="p-phone" type="tel" value="${esc(ME.phone)}" maxlength="24"></div>
      <div class="field"><label>Email</label><input value="${esc(ME.email)}" disabled></div>
      <details><summary style="cursor:pointer;font-weight:600">Change password</summary><div class="authform" style="margin-top:12px">${pwField('p-cur', 'Current password', '', 'current-password').replace(' required minlength="8"', '')}${pwField('p-new', 'New password', '', 'new-password').replace(' required', '')}</div></details>
      <p class="formerr" role="alert"></p><div class="mrow"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Save</button></div></form>`, (m, close) => {
      wirePw();
      $('#pf', m).onsubmit = async (e) => {
        e.preventDefault(); const body = { name: $('#p-name', m).value, company: $('#p-company', m).value, phone: $('#p-phone', m).value };
        if ($('#p-new', m).value) { body.password = $('#p-cur', m).value; body.newPassword = $('#p-new', m).value; }
        try { const d = await API.call('/profile', { method: 'PATCH', body }); ME = d.user; close(); shell(); route(); toast('Saved'); }
        catch (x) { $('.formerr', m).textContent = x.message; }
      };
    });
  }
  function signOut() { store.set('fr-kb-token', null); ME = null; location.hash = ''; authView('signin', '<p class="banner">You are signed out.</p>'); }

  /* ---------------- boot ---------------- */
  (async function boot() {
    const qs = new URLSearchParams(location.search);
    try { CONFIG = await API.call('/config'); } catch (e) {}
    const clear = () => history.replaceState(null, '', '/help' + location.hash);
    if (qs.get('reset')) return resetView(qs.get('reset'));
    const v = qs.get('verified');
    if (v) {
      clear();
      if (v === '1') return authView('signin', '<p class="banner ok"><b>Email confirmed.</b> Your account is ready. Sign in to start.<br><span class="ar">تم تأكيد بريدك. سجّل الدخول للبدء.</span></p>', qs.get('email') || '');
      return authView('signin', `<p class="banner bad">${v === 'expired' ? 'That confirmation link has expired.' : 'That confirmation link is not valid or was already used.'} Sign in to get a new one, or create your account again.</p>`);
    }
    if (qs.get('signup')) { clear(); if (!API.token()) return authView('signup'); }
    if (API.token()) return start();
    authView('signin');
  })();
})();
