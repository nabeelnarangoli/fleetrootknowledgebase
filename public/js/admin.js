/* =====================================================================
   Fleetroot Knowledge Base — admin panel (/admin)
   Customers, guide insights and settings.
   ===================================================================== */
(function () {
  const root = document.getElementById('admin');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOGO = '<img class="logo-img on-light" src="/img/fleetroot-logo.png" alt="Fleetroot"><img class="logo-img on-dark" src="/img/fleetroot-logo-light.png" alt="Fleetroot">';
  const st = { get: (k) => { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v, keep) => { try { sessionStorage.removeItem(k); localStorage.removeItem(k); if (v) (keep ? localStorage : sessionStorage).setItem(k, v); } catch (e) {} } };
  const API = {
    async call(path, { method = 'GET', body } = {}) {
      const h = { 'content-type': 'application/json' }; const t = st.get('fr-kb-admin'); if (t) h.authorization = 'Bearer ' + t;
      let r; try { r = await fetch('/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); } catch (e) { throw new Error('Can\'t reach the server.'); }
      let d = {}; try { d = await r.json(); } catch (e) {}
      if (r.status === 401 && path !== '/admin/login') { st.set('fr-kb-admin', null); login('Please log in again.'); throw new Error('Admin login needed.'); }
      if (!r.ok) throw new Error(d.error || 'Something went wrong.');
      return d;
    },
  };
  function toast(msg, bad) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
  const fmt = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
  const ago = (s) => { if (!s) return 'Never'; const d = (Date.now() - new Date(s)) / 864e5; return d < 1 ? 'Today' : d < 2 ? 'Yesterday' : d < 7 ? Math.floor(d) + ' days ago' : fmt(s); };
  function modal(html, ready) {
    const m = document.createElement('div'); m.className = 'modalbg'; m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(m);
    const close = () => m.remove(); m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    ready && ready(m, close); return close;
  }
  const confirmBox = (title, text, ok, danger) => new Promise((res) => modal(`<h2>${title}</h2><p>${text}</p><div class="mrow"><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn ${danger ? 'danger' : ''}" id="okb">${ok}</button></div>`,
    (m, close) => { $('#okb', m).onclick = () => { close(); res(true); }; $('[data-close]', m).addEventListener('click', () => res(false)); }));

  let USERS = [], SETTINGS = null, STATS = {}, TAB = 'customers', FILTER = '', SHOW = 'all';

  function login(msg = '') {
    root.innerHTML = `<main class="auth wrap"><div class="authcard">${LOGO}<div><h1 style="font-size:26px">Admin panel</h1><p class="muted">Fleetroot Knowledge Base</p></div>
      <form id="lf" style="display:grid;gap:14px"><div class="field"><label for="ap">Admin password</label><input id="ap" type="password" autocomplete="current-password" required></div>
      <label class="ck"><input type="checkbox" id="keep" checked><span>Keep me signed in on this device for 2 weeks</span></label>
      <p class="formerr" role="alert">${esc(msg)}</p><button class="btn" type="submit">Log in</button></form>
      <p style="font-size:14px"><a href="/">Go to the website</a></p></div></main>`;
    $('#ap').focus();
    $('#lf').onsubmit = async (e) => {
      e.preventDefault(); const b = $('button', e.target); b.disabled = true;
      try { const keep = $('#keep').checked; const d = await API.call('/admin/login', { method: 'POST', body: { password: $('#ap').value, remember: keep } }); st.set('fr-kb-admin', d.token, keep); dash(); }
      catch (x) { $('.formerr').textContent = x.message; b.disabled = false; }
    };
  }
  async function dash() {
    root.innerHTML = `<header class="bar"><div class="wrap">${LOGO}<span class="tag">Admin</span>
      <nav class="tabsnav"><button type="button" data-t="customers">Customers</button><button type="button" data-t="guides">Guides</button><button type="button" data-t="settings">Settings</button></nav>
      <div class="right"><a class="mini" href="/help" target="_blank" rel="noopener">Customer site ↗</a><button type="button" class="mini" id="lo">Log out</button></div></div></header>
      <main class="wrap adm"><p class="muted">Loading…</p></main>`;
    $('#lo').onclick = () => { st.set('fr-kb-admin', null); login(); };
    $$('[data-t]').forEach((b) => (b.onclick = () => { TAB = b.dataset.t; render(); }));
    try { await load(); render(); } catch (x) { $('.adm').innerHTML = `<p class="banner bad">${esc(x.message)}</p>`; }
  }
  async function load() {
    const [u, s, k] = await Promise.all([API.call('/admin/users'), API.call('/admin/settings'), API.call('/admin/stats')]);
    USERS = u.users; SETTINGS = s; STATS = k.stats || {};
  }
  function render() {
    $$('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === TAB));
    ({ customers, guides, settings })[TAB]();
  }

  /* ---------- customers ---------- */
  function customers() {
    const now = Date.now();
    const confirmed = USERS.filter((u) => u.verified).length, waiting = USERS.filter((u) => !u.verified).length;
    const active = USERS.filter((u) => u.lastSeen && now - new Date(u.lastSeen) < 7 * 864e5).length;
    const list = USERS.filter((u) => (SHOW === 'all' || (SHOW === 'confirmed' && u.verified && u.active) || (SHOW === 'waiting' && !u.verified) || (SHOW === 'off' && !u.active))
      && (!FILTER || `${u.name} ${u.email} ${u.company} ${u.phone}`.toLowerCase().includes(FILTER)));
    $('.adm').innerHTML = `<div class="head"><div><h1>Customers</h1><p class="muted">People who signed up to the knowledge base.</p></div><button type="button" class="btn" id="add">＋ Add a customer</button></div>
      ${!SETTINGS.mail.connected ? '<p class="banner warn"><b>Email sending is not connected.</b> New customers can\'t receive their confirmation link yet. Confirm them by hand below, or connect email in <button type="button" class="linkbtn" id="gos">Settings</button>.</p>' : ''}
      <div class="statgrid"><div><b>${USERS.length}</b><span>customers</span></div><div><b>${confirmed}</b><span>email confirmed</span></div><div><b>${waiting}</b><span>waiting for confirmation</span></div><div><b>${active}</b><span>active in the last 7 days</span></div></div>
      <div class="filters"><div class="field"><label for="flt">Search</label><input id="flt" placeholder="Name, email, company or phone" value="${esc(FILTER)}"></div>
        <div class="chips">${[['all', 'All'], ['confirmed', 'Confirmed'], ['waiting', 'Waiting'], ['off', 'Switched off']].map(([k, t]) => `<button type="button" data-s="${k}" class="${SHOW === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      ${USERS.length ? `<div class="tblwrap"><table><thead><tr><th>Customer</th><th>Company · mobile</th><th>Status</th><th>Signed up</th><th>Last active</th><th class="num">Guides opened</th><th></th></tr></thead><tbody>
        ${list.map(row).join('') || '<tr><td colspan="7" class="empty">No customers match.</td></tr>'}</tbody></table></div>` : '<div class="panel empty"><h2>No customers yet</h2><p>Share the website link. People who sign up and confirm their email appear here.</p></div>'}`;
    $('#add').onclick = addCustomer;
    const g = $('#gos'); if (g) g.onclick = () => { TAB = 'settings'; render(); };
    const f = $('#flt'); f.oninput = () => { FILTER = f.value.toLowerCase().trim(); const p = f.selectionStart; customers(); const n = $('#flt'); n.focus(); n.setSelectionRange(p, p); };
    $$('[data-s]').forEach((b) => (b.onclick = () => { SHOW = b.dataset.s; customers(); }));
    $$('[data-a]').forEach((b) => (b.onclick = () => act(b.dataset.a, b.dataset.id)));
  }
  function row(u) {
    const status = !u.active ? '<span class="pill off">Switched off</span>' : u.verified ? '<span class="pill ok">Confirmed</span>' : '<span class="pill warn">Waiting for email</span>';
    return `<tr><td><b>${esc(u.name)}</b><small>${esc(u.email)}</small></td><td>${esc(u.company || '–')}<small>${esc(u.phone || '')}</small></td><td>${status}</td>
      <td>${fmt(u.createdAt)}</td><td>${ago(u.lastSeen)}</td><td class="num">${u.viewed}</td>
      <td><div class="acts">${!u.verified ? `<button type="button" class="mini" data-a="verify" data-id="${u.id}">Confirm</button><button type="button" class="mini" data-a="resend" data-id="${u.id}">Resend email</button>` : `<button type="button" class="mini" data-a="reset" data-id="${u.id}">Send password link</button>`}
      <button type="button" class="mini" data-a="toggle" data-id="${u.id}">${u.active ? 'Switch off' : 'Switch on'}</button><button type="button" class="mini danger" data-a="del" data-id="${u.id}">Delete</button></div></td></tr>`;
  }
  async function act(a, id) {
    const u = USERS.find((x) => x.id === id); if (!u) return;
    try {
      if (a === 'verify') { if (!(await confirmBox('Confirm this customer?', `Mark <b>${esc(u.email)}</b> as confirmed so they can sign in without clicking the email link.`, 'Confirm'))) return; await API.call('/admin/users/' + id, { method: 'PATCH', body: { verified: true } }); toast('Customer confirmed'); }
      if (a === 'resend') { await API.call(`/admin/users/${id}/resend-verify`, { method: 'POST' }); toast('Confirmation email sent'); }
      if (a === 'reset') { await API.call(`/admin/users/${id}/send-reset`, { method: 'POST' }); toast('Password link sent to ' + u.email); }
      if (a === 'toggle') { await API.call('/admin/users/' + id, { method: 'PATCH', body: { active: !u.active } }); toast(u.active ? 'Account switched off' : 'Account switched on'); }
      if (a === 'del') { if (!(await confirmBox('Delete this customer?', `<b>${esc(u.name)}</b> (${esc(u.email)}) will lose access and their history is removed. They can sign up again later.`, 'Delete', true))) return; await API.call('/admin/users/' + id, { method: 'DELETE' }); toast('Customer deleted'); }
      await load(); customers();
    } catch (x) { toast(x.message, true); }
  }
  function addCustomer() {
    modal(`<h2>Add a customer</h2><p class="muted" style="font-size:14px">Their account is confirmed straight away, and they get an email to set their own password.</p>
      <form id="af" style="display:grid;gap:12px"><div class="field"><label for="a-name">Full name</label><input id="a-name" required maxlength="60"></div>
      <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" required maxlength="100"></div>
      <div class="field"><label for="a-company">Company</label><input id="a-company" maxlength="80"></div>
      <div class="field"><label for="a-phone">Mobile</label><input id="a-phone" type="tel" maxlength="24"></div>
      <p class="formerr" role="alert"></p><div class="mrow"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Add customer</button></div></form>`, (m, close) => {
      $('#a-name', m).focus();
      $('#af', m).onsubmit = async (e) => {
        e.preventDefault();
        try { const d = await API.call('/admin/users', { method: 'POST', body: { name: $('#a-name', m).value, email: $('#a-email', m).value, company: $('#a-company', m).value, phone: $('#a-phone', m).value } });
          close(); toast(d.mailed ? 'Customer added and emailed' : 'Customer added. Email is not connected, so send them a password link later.', !d.mailed); await load(); customers(); }
        catch (x) { $('.formerr', m).textContent = x.message; }
      };
    });
  }

  /* ---------- guides ---------- */
  function guides() {
    const rows = KB.topics.map((t) => { const s = STATS[t.id] || {}; const votes = (s.yes || 0) + (s.no || 0); return { t, views: s.views || 0, yes: s.yes || 0, no: s.no || 0, pct: votes ? Math.round(((s.yes || 0) / votes) * 100) : null }; })
      .sort((a, b) => b.views - a.views);
    const mods = Object.fromEntries(KB.modules.map((m) => [m.id, m.name.en]));
    $('.adm').innerHTML = `<div class="head"><div><h1>Guides</h1><p class="muted">How many customers opened each guide, and whether they found it helpful.</p></div></div>
      <div class="tblwrap"><table><thead><tr><th>Guide</th><th>Module</th><th class="num">Opened by</th><th class="num">Helpful</th><th class="num">Not helpful</th><th>Helpful rate</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><b>${esc(r.t.t.en)}</b><small>${r.t.demo ? 'Animated guide' : 'Steps only'}</small></td><td>${esc(mods[r.t.module])}</td><td class="num">${r.views}</td><td class="num">${r.yes}</td><td class="num">${r.no}</td>
        <td>${r.pct == null ? '<span class="muted">No votes</span>' : `<div style="display:flex;gap:8px;align-items:center"><span class="bar2"><i style="width:${r.pct}%"></i></span><span class="num">${r.pct}%</span></div>`}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- settings ---------- */
  function settings() {
    const m = SETTINGS.mail;
    $('.adm').innerHTML = `<div class="head"><div><h1>Settings</h1></div></div>
      <section class="panel"><h2>Sign-up</h2>
        <label class="sw toggle"><span><b>Let people create their own account</b><small>Shows "Create account" on the website. People must confirm their email before they can sign in.</small></span><input type="checkbox" id="s-signup" ${SETTINGS.allowSignup ? 'checked' : ''}></label></section>
      <section class="panel"><h2>Modules shown to customers</h2>
        ${KB.modules.map((x) => `<label class="sw toggle"><span><b>${esc(x.name.en)}</b><small>${KB.topics.filter((t) => t.module === x.id).length} guides written</small></span><input type="checkbox" data-mod="${x.id}" ${SETTINGS.modules[x.id] ? 'checked' : ''}></label>`).join('')}</section>
      <section class="panel"><h2>Email sending</h2>
        ${m.connected ? `<p class="banner ok"><b>Connected</b> through ${esc(m.provider)}${m.from ? `, sending from <b>${esc(m.from)}</b>` : ''}.</p>
          <form id="tm" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><div class="field" style="flex:1;min-width:220px"><label for="t-to">Send a test email to</label><input id="t-to" type="email" required></div><button class="btn" type="submit">Send test</button></form>`
        : `<p class="banner warn"><b>Not connected.</b> Customers can sign up, but they won't get the confirmation email. You can confirm them by hand in Customers.</p>
          <div class="setup"><b>Connect free email sending with Brevo (about 10 minutes)</b><ol>
            <li>Create a free account at <b>brevo.com</b> (300 emails a day free).</li>
            <li>In Brevo, go to <b>Senders, domains &amp; dedicated IPs → Senders</b> and add the address emails should come from, for example <code>noreply@yourcompany.com</code>. Confirm it from the email Brevo sends.</li>
            <li>Go to <b>SMTP &amp; API → API keys</b> and create a key.</li>
            <li>In Netlify, open this site's <b>Site configuration → Environment variables</b> and add <code>BREVO_API_KEY</code> (the key) and <code>MAIL_FROM</code> (the sender address).</li>
            <li>Redeploy the site. This page then shows <b>Connected</b>, and you can send a test email.</li></ol></div>`}
      </section>`;
    $('#s-signup').onchange = (e) => save({ allowSignup: e.target.checked }, e.target.checked ? 'Sign-up is open' : 'Sign-up is closed', e.target);
    $$('[data-mod]').forEach((i) => (i.onchange = () => save({ modules: { [i.dataset.mod]: i.checked } }, i.checked ? 'Module shown to customers' : 'Module hidden', i)));
    const tm = $('#tm'); if (tm) tm.onsubmit = async (e) => { e.preventDefault(); try { await API.call('/admin/test-mail', { method: 'POST', body: { to: $('#t-to').value } }); toast('Test email sent'); } catch (x) { toast(x.message, true); } };
  }
  async function save(body, msg, input) {
    try { SETTINGS = await API.call('/admin/settings', { method: 'PATCH', body }); toast(msg); } catch (x) { input.checked = !input.checked; toast(x.message, true); }
  }

  st.get('fr-kb-admin') ? dash() : login();
})();
