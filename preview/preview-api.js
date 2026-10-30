/* Preview mode: a stand-in for the Netlify API that runs in the browser.
   Accounts and stats are kept in localStorage; "emails" appear in a demo inbox.
   Admin password in preview: admin123 */
(function () {
  const KEY = 'fr-kb-preview-db';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  let db = load() || { users: {}, tokens: {}, settings: { allowSignup: true, modules: { fleet: true, lastmile: false, school: false, orders: false } }, stats: {}, inbox: [] };
  const commit = () => save(db);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const rand = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const idOf = (e) => 'u' + Array.from(e).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, '0') + 'a'.repeat(31);
  const now = () => new Date().toISOString();
  const pub = (u) => ({ id: u.id, name: u.name, email: u.email, company: u.company || '', phone: u.phone || '', verified: !!u.verified, active: u.active !== false, createdAt: u.createdAt, verifiedAt: u.verifiedAt || null, lastSeen: u.lastSeen || null, logins: u.logins || 0, viewed: Object.keys(u.viewed || {}).length });
  const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const base = location.href.replace(/[^/]*$/, '');

  function mail(to, subject, label, link) {
    db.inbox.unshift({ to, subject, label, link, at: Date.now() }); db.inbox = db.inbox.slice(0, 20); commit(); renderInbox(true);
  }
  function sendVerify(u) { const t = rand(); db.tokens[t] = { type: 'verify', uid: u.id }; mail(u.email, 'Confirm your email for the Fleetroot Knowledge Base', 'Confirm my email', `${base}help.html?pv=${t}`); }
  function sendReset(u) { const t = rand(); db.tokens[t] = { type: 'reset', uid: u.id }; mail(u.email, 'Set your Fleetroot Knowledge Base password', 'Set my password', `${base}help.html?reset=${t}`); }

  // confirmation links in preview: ?pv=token → mark verified, then behave like the real redirect
  const qs = new URLSearchParams(location.search);
  if (qs.get('pv')) {
    const t = db.tokens[qs.get('pv')]; delete db.tokens[qs.get('pv')];
    const u = t && t.type === 'verify' ? db.users[t.uid] : null;
    if (u) { u.verified = true; u.verifiedAt = u.verifiedAt || now(); }
    commit();
    history.replaceState(null, '', u ? `help.html?verified=1&email=${encodeURIComponent(u.email)}` : 'help.html?verified=invalid');
  }

  async function api(path, method, body, auth) {
    const s = db.settings;
    if (path === '/config') return res(200, { allowSignup: s.allowSignup, modules: s.modules });
    if (path === '/signup') {
      if (!s.allowSignup) return res(403, { error: 'Sign-up is closed at the moment. Contact Fleetroot support for access.' });
      const email = clean(body.email, 100).toLowerCase(), name = clean(body.name, 60);
      if (!name) return res(400, { error: 'Please enter your name.', field: 'name' });
      if (!EMAIL_RE.test(email)) return res(400, { error: 'Please enter a valid email address.', field: 'email' });
      if (String(body.password || '').length < 8) return res(400, { error: 'Use at least 8 characters for your password.', field: 'password' });
      const id = idOf(email); const old = db.users[id];
      if (old && old.verified) return res(409, { error: 'An account with this email already exists. Sign in instead, or reset your password.', field: 'email' });
      db.users[id] = { id, name, email, company: clean(body.company, 80), phone: clean(body.phone, 24), pw: body.password, verified: false, active: true, createdAt: old?.createdAt || now() };
      commit(); sendVerify(db.users[id]);
      return res(201, { ok: true, email, mailed: true });
    }
    if (path === '/resend') { const u = db.users[idOf(clean(body.email, 100).toLowerCase())]; if (u && !u.verified) sendVerify(u); return res(200, { ok: true }); }
    if (path === '/login') {
      const u = db.users[idOf(clean(body.email, 100).toLowerCase())];
      if (!u || u.pw !== body.password) return res(401, { error: 'That email or password is not right. Check them and try again.' });
      if (!u.verified) return res(403, { error: 'Please confirm your email first. Open the link we sent to ' + u.email + '.', unverified: true });
      if (u.active === false) return res(403, { error: 'This account is switched off. Contact Fleetroot support.' });
      u.lastSeen = now(); u.logins = (u.logins || 0) + 1; commit();
      return res(200, { token: 'user:' + u.id, user: pub(u) });
    }
    if (path === '/forgot') { const u = db.users[idOf(clean(body.email, 100).toLowerCase())]; if (u) sendReset(u); return res(200, { ok: true }); }
    if (path === '/reset') {
      if (String(body.password || '').length < 8) return res(400, { error: 'Use at least 8 characters for your password.' });
      const t = db.tokens[body.token]; delete db.tokens[body.token];
      const u = t && t.type === 'reset' ? db.users[t.uid] : null;
      if (!u) { commit(); return res(400, { error: 'This reset link has expired or was already used. Ask for a new one.' }); }
      u.pw = body.password; u.verified = true; commit(); return res(200, { ok: true, email: u.email });
    }
    if (['/me', '/track', '/profile'].includes(path)) {
      const u = auth && auth.startsWith('user:') ? db.users[auth.slice(5)] : null;
      if (!u || !u.verified || u.active === false) return res(401, { error: 'Please sign in again.' });
      if (path === '/me') { u.lastSeen = now(); commit(); return res(200, { user: pub(u), viewed: u.viewed || {}, votes: u.votes || {} }); }
      if (path === '/profile') {
        if (body.name !== undefined) u.name = clean(body.name, 60) || u.name;
        if (body.company !== undefined) u.company = clean(body.company, 80);
        if (body.phone !== undefined) u.phone = clean(body.phone, 24);
        if (body.newPassword) { if (body.password !== u.pw) return res(400, { error: 'Your current password is not right.' }); u.pw = body.newPassword; }
        commit(); return res(200, { user: pub(u) });
      }
      const k = body.topic; db.stats[k] = db.stats[k] || { views: 0, yes: 0, no: 0 };
      if (body.event === 'view') { u.viewed = u.viewed || {}; if (!u.viewed[k]) db.stats[k].views++; u.viewed[k] = Date.now(); }
      if (body.event === 'yes' || body.event === 'no') { u.votes = u.votes || {}; if (u.votes[k] !== body.event) { db.stats[k][body.event]++; u.votes[k] = body.event; } }
      commit(); return res(200, { ok: true });
    }
    if (path === '/admin/login') return body.password === 'admin123' ? res(200, { token: 'admin' }) : res(401, { error: 'Wrong admin password. In this preview it is admin123.' });
    if (path.startsWith('/admin/')) {
      if (auth !== 'admin') return res(401, { error: 'Admin login needed.' });
      const mailInfo = { connected: true, provider: 'Demo inbox (preview)', from: 'noreply@fleetroot.example' };
      if (path === '/admin/users' && method === 'GET') return res(200, { users: Object.values(db.users).map(pub).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
      if (path === '/admin/settings') {
        if (method === 'PATCH') { if (body.allowSignup !== undefined) s.allowSignup = !!body.allowSignup; if (body.modules) Object.assign(s.modules, body.modules); commit(); }
        return res(200, { ...s, mail: mailInfo });
      }
      if (path === '/admin/stats') return res(200, { stats: db.stats });
      if (path === '/admin/test-mail') { mail(clean(body.to, 100), 'Fleetroot Knowledge Base: test email', '', ''); return res(200, { ok: true }); }
      if (path === '/admin/users' && method === 'POST') {
        const email = clean(body.email, 100).toLowerCase(); if (!EMAIL_RE.test(email)) return res(400, { error: 'Enter a valid email address.' });
        const id = idOf(email); if (db.users[id]) return res(409, { error: 'There is already an account with this email.' });
        db.users[id] = { id, name: clean(body.name, 60), email, company: clean(body.company, 80), phone: clean(body.phone, 24), pw: rand(), verified: true, verifiedAt: now(), active: true, createdAt: now() };
        commit(); sendReset(db.users[id]); return res(201, { user: pub(db.users[id]), mailed: true });
      }
      const m = path.match(/^\/admin\/users\/([^/]+)(\/send-reset|\/resend-verify)?$/);
      const u = m && db.users[m[1]];
      if (u) {
        if (m[2] === '/send-reset') { sendReset(u); return res(200, { ok: true }); }
        if (m[2] === '/resend-verify') { sendVerify(u); return res(200, { ok: true }); }
        if (method === 'PATCH') { if (body.active !== undefined) u.active = !!body.active; if (body.verified) { u.verified = true; u.verifiedAt = now(); } commit(); return res(200, { user: pub(u) }); }
        if (method === 'DELETE') { delete db.users[u.id]; commit(); return res(200, { ok: true }); }
      }
    }
    return res(404, { error: 'Not found.' });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('/api')) return realFetch(url, opts);
    const path = u.replace(/^\/api/, '').split('?')[0];
    let body = {}; try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) {}
    const auth = (opts.headers?.authorization || '').replace(/^Bearer\s+/, '');
    await new Promise((r) => setTimeout(r, 180));
    return api(path, (opts.method || 'GET').toUpperCase(), body, auth);
  };

  /* demo inbox + preview ribbon */
  const css = `.pv-rib{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:90;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 24px)}
  .pv-rib span{background:#15151C;color:#fff;font:600 12px/1 Inter,system-ui,sans-serif;padding:8px 10px;border-radius:999px}
  .pv-rib a,.pv-rib button{background:#FFD84D;color:#15151C;border:0;font:700 12px/1 Inter,system-ui,sans-serif;padding:8px 11px;border-radius:999px;cursor:pointer;text-decoration:none}
  .pv-inbox{position:fixed;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(56px + env(safe-area-inset-bottom,0px));z-index:91;width:min(380px,calc(100% - 24px));max-height:70vh;overflow:auto;background:var(--surface,#fff);color:var(--ink,#111);border:1px solid var(--line,#ddd);border-radius:14px;box-shadow:0 20px 50px -15px rgba(0,0,0,.45);padding:14px;display:grid;gap:10px;font:14px/1.45 Inter,system-ui,sans-serif}
  .pv-inbox h3{margin:0;font:700 16px 'Space Grotesk',Inter,sans-serif}.pv-inbox .m{border:1px solid var(--line,#ddd);border-radius:10px;padding:10px;display:grid;gap:6px}
  .pv-inbox .m small{color:var(--muted,#666)}.pv-inbox .m a{justify-self:start;background:#4C30FF;color:#fff;text-decoration:none;font-weight:600;padding:8px 12px;border-radius:9px}
  .pv-inbox .x{justify-self:end;background:none;border:0;color:var(--muted,#666);cursor:pointer;font-size:13px}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  function renderInbox(open) {
    let box = document.querySelector('.pv-inbox');
    const n = db.inbox.length;
    const badge = document.querySelector('.pv-inbtn'); if (badge) badge.textContent = `Demo inbox (${n})`;
    if (!open) { box && box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'pv-inbox'; document.body.appendChild(box); }
    box.innerHTML = `<h3>Demo inbox</h3><small style="color:var(--muted,#666)">In the live site these go to the customer's real email.</small>${n ? db.inbox.map((m) => `<div class="m"><b>${m.subject}</b><small>To ${m.to} · ${new Date(m.at).toLocaleTimeString()}</small>${m.link ? `<a href="${m.link}">${m.label}</a>` : ''}</div>`).join('') : '<p>No emails yet. Create an account to get a confirmation email here.</p>'}<button type="button" class="x">Close</button>`;
    box.querySelector('.x').onclick = () => renderInbox(false);
  }
  function ribbon() {
    const r = document.createElement('div'); r.className = 'pv-rib';
    r.innerHTML = `<span>Preview</span><a href="./">Website</a><a href="help.html">Help centre</a><a href="admin.html">Admin (admin123)</a><button type="button" class="pv-inbtn">Demo inbox (${db.inbox.length})</button>`;
    document.body.appendChild(r);
    r.querySelector('.pv-inbtn').onclick = () => renderInbox(!document.querySelector('.pv-inbox'));
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ribbon) : ribbon();
})();
