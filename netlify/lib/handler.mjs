// API for the Fleetroot Knowledge Base.
// Runs inside a Netlify Function (production) or the local dev server (dev-server.mjs).
// Storage is any object with get(key,{type:'json'}), setJSON(key,value), delete(key), list().
import crypto from 'node:crypto';
import { sendMail, mailStatus } from './mail.mjs';
import { verifyMail, resetMail } from './templates.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY = 50_000;
const DAY = 864e5;
const MODULES = ['fleet', 'lastmile', 'school', 'orders'];
const DEFAULT_SETTINGS = { allowSignup: true, modules: { fleet: true, lastmile: false, school: false, orders: false } };

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});
const redirect = (to) => new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } });
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const keyOf = (email) => sha('u:' + email).slice(0, 40);

function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString('hex')}`;
}
function checkPw(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(String(pw), salt, 32);
  const real = Buffer.from(h, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}
function safeEqual(a, b) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
}
const pwProblem = (pw) => (String(pw).length < 8 ? 'Use at least 8 characters for your password.' : String(pw).length > 100 ? 'That password is too long.' : '');
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function createHandler({ getStore, env }) {
  const cfg = () => {
    const e = env();
    const admin = e.ADMIN_PASSWORD || '';
    const secret = e.SESSION_SECRET || (admin ? sha('fr-session:' + admin) : '');
    return { admin, secret, e };
  };
  const sign = (payload, secret) => {
    const body = b64u(JSON.stringify(payload));
    return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
  };
  const verify = (token, secret) => {
    if (!token || !token.includes('.')) return null;
    const [body, mac] = token.split('.');
    const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
  };
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, company: u.company || '', phone: u.phone || '', verified: !!u.verified, active: u.active !== false, createdAt: u.createdAt, verifiedAt: u.verifiedAt || null, lastSeen: u.lastSeen || null, logins: u.logins || 0, viewed: Object.keys(u.viewed || {}).length });

  return async function handle(req) {
    const { admin, secret, e } = cfg();
    if (!admin) return json(500, { error: 'The server is not set up yet. Add an ADMIN_PASSWORD environment variable in Netlify and redeploy.' });
    const url = new URL(req.url);
    const origin = e.SITE_URL || url.origin;
    const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();
    const users = getStore('users');
    const tokens = getStore('tokens');
    const meta = getStore('meta');
    const getSettings = async () => {
      const s = (await meta.get('settings', { type: 'json' })) || {};
      return { ...DEFAULT_SETTINGS, ...s, modules: { ...DEFAULT_SETTINGS.modules, ...(s.modules || {}) } };
    };
    const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    // simple fixed-window limiter kept in the meta store
    const limited = async (name, max, windowMs) => {
      const k = 'rl-' + name + '-' + sha(ip).slice(0, 20);
      const r = (await meta.get(k, { type: 'json' })) || { n: 0, since: Date.now() };
      if (Date.now() - r.since > windowMs) { r.n = 0; r.since = Date.now(); }
      if (r.n >= max) return true;
      r.n += 1; await meta.setJSON(k, r); return false;
    };
    const newToken = async (type, user, ttl) => {
      const raw = crypto.randomBytes(32).toString('base64url');
      await tokens.setJSON(sha(raw), { type, uid: user.id, exp: Date.now() + ttl });
      return raw;
    };
    const takeToken = async (raw, type) => {
      if (!raw || raw.length > 100) return null;
      const k = sha(raw);
      const t = await tokens.get(k, { type: 'json' });
      if (!t || t.type !== type) return null;
      await tokens.delete(k);
      return t.exp > Date.now() ? t : 'expired';
    };
    const sendVerify = async (u) => {
      const raw = await newToken('verify', u, 2 * DAY);
      return sendMail(e, verifyMail({ name: u.name, email: u.email, link: `${origin}/api/verify?t=${raw}` }));
    };
    const sendReset = async (u) => {
      const raw = await newToken('reset', u, 2 * 3600_000);
      return sendMail(e, resetMail({ name: u.name, email: u.email, link: `${origin}/help?reset=${raw}` }));
    };
    const bump = async (key, field) => {
      const s = (await meta.get('stats', { type: 'json' })) || {};
      s[key] = s[key] || { views: 0, yes: 0, no: 0 };
      s[key][field] = (s[key][field] || 0) + 1;
      await meta.setJSON('stats', s);
    };

    let body = {};
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const text = await req.text();
      if (text.length > MAX_BODY) return json(413, { error: 'Too much data.' });
      try { body = text ? JSON.parse(text) : {}; } catch { return json(400, { error: 'Invalid request.' }); }
    }
    const auth = verify((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), secret);

    try {
      /* ---------- public ---------- */
      if (path === '/config' && method === 'GET') {
        const s = await getSettings();
        return json(200, { allowSignup: s.allowSignup, modules: s.modules });
      }

      if (path === '/signup' && method === 'POST') {
        const s = await getSettings();
        if (!s.allowSignup) return json(403, { error: 'Sign-up is closed at the moment. Contact Fleetroot support for access.' });
        const name = clean(body.name, 60), company = clean(body.company, 80), phone = clean(body.phone, 24);
        const email = clean(body.email, 100).toLowerCase();
        if (!name) return json(400, { error: 'Please enter your name.', field: 'name' });
        if (!EMAIL_RE.test(email)) return json(400, { error: 'Please enter a valid email address.', field: 'email' });
        const pp = pwProblem(body.password || ''); if (pp) return json(400, { error: pp, field: 'password' });
        if (await limited('signup', 6, 3600_000)) return json(429, { error: 'Too many sign-ups from this connection. Please try again in an hour.' });
        const key = keyOf(email);
        const old = await users.get(key, { type: 'json' });
        if (old && old.verified) return json(409, { error: 'An account with this email already exists. Sign in instead, or reset your password.', field: 'email' });
        const u = { id: key, name, email, company, phone, pw: hashPw(body.password), verified: false, active: true, createdAt: old?.createdAt || new Date().toISOString() };
        await users.setJSON(key, u);
        const m = await sendVerify(u);
        return json(201, { ok: true, email, mailed: m.ok, note: m.ok ? '' : 'We could not send the confirmation email just now. Fleetroot support will confirm your account shortly.' });
      }

      if (path === '/resend' && method === 'POST') {
        const email = clean(body.email, 100).toLowerCase();
        if (await limited('resend', 5, 3600_000)) return json(429, { error: 'Too many requests. Please try again in an hour.' });
        const u = EMAIL_RE.test(email) ? await users.get(keyOf(email), { type: 'json' }) : null;
        if (u && !u.verified) await sendVerify(u);
        return json(200, { ok: true });
      }

      if (path === '/verify' && method === 'GET') {
        const t = await takeToken(url.searchParams.get('t'), 'verify');
        if (!t) return redirect('/help?verified=invalid');
        if (t === 'expired') return redirect('/help?verified=expired');
        const u = await users.get(t.uid, { type: 'json' });
        if (!u) return redirect('/help?verified=invalid');
        if (!u.verified) { u.verified = true; u.verifiedAt = new Date().toISOString(); await users.setJSON(u.id, u); }
        return redirect('/help?verified=1&email=' + encodeURIComponent(u.email));
      }

      if (path === '/login' && method === 'POST') {
        const email = clean(body.email, 100).toLowerCase();
        const u = EMAIL_RE.test(email) ? await users.get(keyOf(email), { type: 'json' }) : null;
        if (u && u.lockUntil > Date.now()) return json(429, { error: 'Too many wrong tries. Wait 10 minutes and try again.' });
        if (!u || !checkPw(body.password || '', u.pw)) {
          if (u) { u.fails = (u.fails || 0) + 1; if (u.fails >= 8) { u.lockUntil = Date.now() + 600_000; u.fails = 0; } await users.setJSON(u.id, u); }
          return json(401, { error: 'That email or password is not right. Check them and try again.' });
        }
        if (!u.verified) return json(403, { error: 'Please confirm your email first. Open the link we sent to ' + u.email + '.', unverified: true });
        if (u.active === false) return json(403, { error: 'This account is switched off. Contact Fleetroot support.' });
        u.fails = 0; u.lockUntil = 0; u.lastSeen = new Date().toISOString(); u.logins = (u.logins || 0) + 1;
        await users.setJSON(u.id, u);
        return json(200, { token: sign({ u: u.id, r: 'user', exp: Date.now() + 30 * DAY }, secret), user: publicUser(u) });
      }

      if (path === '/forgot' && method === 'POST') {
        const email = clean(body.email, 100).toLowerCase();
        if (await limited('forgot', 5, 3600_000)) return json(429, { error: 'Too many requests. Please try again in an hour.' });
        const u = EMAIL_RE.test(email) ? await users.get(keyOf(email), { type: 'json' }) : null;
        if (u && u.active !== false) await sendReset(u);
        return json(200, { ok: true }); // same answer either way, so emails can't be probed
      }

      if (path === '/reset' && method === 'POST') {
        const pp = pwProblem(body.password || ''); if (pp) return json(400, { error: pp });
        const t = await takeToken(body.token, 'reset');
        if (!t || t === 'expired') return json(400, { error: 'This reset link has expired or was already used. Ask for a new one.' });
        const u = await users.get(t.uid, { type: 'json' });
        if (!u) return json(400, { error: 'Account not found.' });
        u.pw = hashPw(body.password); u.verified = true; u.verifiedAt = u.verifiedAt || new Date().toISOString(); u.fails = 0; u.lockUntil = 0;
        await users.setJSON(u.id, u);
        return json(200, { ok: true, email: u.email });
      }

      /* ---------- signed-in customer ---------- */
      if (path === '/me' || path === '/track' || path === '/profile') {
        if (!auth || auth.r !== 'user') return json(401, { error: 'Please sign in again.' });
        const u = await users.get(auth.u, { type: 'json' });
        if (!u || u.active === false || !u.verified) return json(401, { error: 'Please sign in again.' });
        if (path === '/me' && method === 'GET') {
          u.lastSeen = new Date().toISOString(); await users.setJSON(u.id, u);
          return json(200, { user: publicUser(u), viewed: u.viewed || {}, votes: u.votes || {} });
        }
        if (path === '/profile' && method === 'PATCH') {
          if (body.name !== undefined) { const n = clean(body.name, 60); if (!n) return json(400, { error: 'Name cannot be empty.' }); u.name = n; }
          if (body.company !== undefined) u.company = clean(body.company, 80);
          if (body.phone !== undefined) u.phone = clean(body.phone, 24);
          if (body.newPassword !== undefined) {
            if (!checkPw(body.password || '', u.pw)) return json(400, { error: 'Your current password is not right.' });
            const pp = pwProblem(body.newPassword); if (pp) return json(400, { error: pp });
            u.pw = hashPw(body.newPassword);
          }
          await users.setJSON(u.id, u);
          return json(200, { user: publicUser(u) });
        }
        if (path === '/track' && method === 'POST') {
          const topic = String(body.topic || '').slice(0, 60);
          if (!/^[a-z0-9-]+$/.test(topic)) return json(400, { error: 'Unknown topic.' });
          if (body.event === 'view') { u.viewed = u.viewed || {}; if (!u.viewed[topic]) await bump(topic, 'views'); u.viewed[topic] = Date.now(); }
          if (body.event === 'yes' || body.event === 'no') {
            u.votes = u.votes || {};
            if (u.votes[topic] !== body.event) { await bump(topic, body.event); u.votes[topic] = body.event; }
          }
          u.lastSeen = new Date().toISOString();
          await users.setJSON(u.id, u);
          return json(200, { ok: true });
        }
      }

      /* ---------- admin ---------- */
      if (path === '/admin/login' && method === 'POST') {
        const att = (await meta.get('admin-attempts', { type: 'json' })) || { fails: 0, lockUntil: 0 };
        if (att.lockUntil > Date.now()) return json(429, { error: 'Too many wrong tries. Wait 5 minutes.' });
        if (!safeEqual(body.password || '', admin)) {
          att.fails += 1; if (att.fails >= 6) { att.lockUntil = Date.now() + 300_000; att.fails = 0; }
          await meta.setJSON('admin-attempts', att);
          return json(401, { error: 'Wrong admin password.' });
        }
        await meta.setJSON('admin-attempts', { fails: 0, lockUntil: 0 });
        return json(200, { token: sign({ r: 'admin', exp: Date.now() + (body.remember ? 14 * DAY : 0.5 * DAY) }, secret) });
      }

      if (path.startsWith('/admin/')) {
        if (!auth || auth.r !== 'admin') return json(401, { error: 'Admin login needed.' });

        if (path === '/admin/users' && method === 'GET') {
          const { blobs } = await users.list();
          const out = [];
          for (const b of blobs) { const u = await users.get(b.key, { type: 'json' }); if (u) out.push(publicUser(u)); }
          out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          return json(200, { users: out });
        }
        if (path === '/admin/settings' && method === 'GET') return json(200, { ...(await getSettings()), mail: mailStatus(e) });
        if (path === '/admin/settings' && method === 'PATCH') {
          const cur = await getSettings();
          if (body.allowSignup !== undefined) cur.allowSignup = !!body.allowSignup;
          if (body.modules && typeof body.modules === 'object') for (const k of MODULES) if (body.modules[k] !== undefined) cur.modules[k] = !!body.modules[k];
          await meta.setJSON('settings', cur);
          return json(200, { ...cur, mail: mailStatus(e) });
        }
        if (path === '/admin/stats' && method === 'GET') return json(200, { stats: (await meta.get('stats', { type: 'json' })) || {} });
        if (path === '/admin/test-mail' && method === 'POST') {
          const to = clean(body.to, 100).toLowerCase();
          if (!EMAIL_RE.test(to)) return json(400, { error: 'Enter a valid email address.' });
          const r = await sendMail(e, { to, subject: 'Fleetroot Knowledge Base: test email', html: '<p>Email sending works. Customers will now get their confirmation emails.</p>', text: 'Email sending works. Customers will now get their confirmation emails.' });
          return r.ok ? json(200, { ok: true }) : json(502, { error: r.error });
        }
        if (path === '/admin/users' && method === 'POST') {
          // admin adds a customer: account is confirmed and they get a "set your password" email
          const name = clean(body.name, 60), email = clean(body.email, 100).toLowerCase();
          if (!name) return json(400, { error: 'Enter the customer\'s name.' });
          if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' });
          const key = keyOf(email);
          if (await users.get(key, { type: 'json' })) return json(409, { error: 'There is already an account with this email.' });
          const u = { id: key, name, email, company: clean(body.company, 80), phone: clean(body.phone, 24), pw: hashPw(crypto.randomBytes(18).toString('hex')), verified: true, verifiedAt: new Date().toISOString(), active: true, createdAt: new Date().toISOString(), byAdmin: true };
          await users.setJSON(key, u);
          const m = await sendReset(u);
          return json(201, { user: publicUser(u), mailed: m.ok });
        }
        const m = path.match(/^\/admin\/users\/([a-f0-9]{40})(\/send-reset|\/resend-verify)?$/);
        if (m) {
          const u = await users.get(m[1], { type: 'json' });
          if (!u) return json(404, { error: 'Customer not found.' });
          if (m[2] === '/send-reset' && method === 'POST') { const r = await sendReset(u); return r.ok ? json(200, { ok: true }) : json(502, { error: r.error }); }
          if (m[2] === '/resend-verify' && method === 'POST') { const r = await sendVerify(u); return r.ok ? json(200, { ok: true }) : json(502, { error: r.error }); }
          if (!m[2] && method === 'PATCH') {
            if (body.name !== undefined) { const n = clean(body.name, 60); if (!n) return json(400, { error: 'Name cannot be empty.' }); u.name = n; }
            if (body.company !== undefined) u.company = clean(body.company, 80);
            if (body.phone !== undefined) u.phone = clean(body.phone, 24);
            if (body.active !== undefined) u.active = !!body.active;
            if (body.verified === true && !u.verified) { u.verified = true; u.verifiedAt = new Date().toISOString(); }
            await users.setJSON(u.id, u);
            return json(200, { user: publicUser(u) });
          }
          if (!m[2] && method === 'DELETE') { await users.delete(u.id); return json(200, { ok: true }); }
        }
      }

      return json(404, { error: 'Not found.' });
    } catch (err) {
      console.error(err);
      return json(500, { error: 'Something went wrong on the server. Please try again.' });
    }
  };
}
