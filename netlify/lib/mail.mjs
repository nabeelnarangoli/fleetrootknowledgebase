// Sends email through Brevo or Resend, whichever has an API key set in Netlify.
//   Brevo:  BREVO_API_KEY  + MAIL_FROM (a sender address verified in Brevo)
//   Resend: RESEND_API_KEY + MAIL_FROM (an address on a domain verified in Resend)
//   MAIL_FROM_NAME (optional) is the name people see, default "Fleetroot Knowledge Base".
// Local testing: DEV_MAIL_LOG=1 prints each email to the terminal instead of sending it.

export function mailStatus(e) {
  const provider = e.BREVO_API_KEY ? 'Brevo' : e.RESEND_API_KEY ? 'Resend' : '';
  return { connected: !!(provider && e.MAIL_FROM) || !!e.DEV_MAIL_LOG, provider: e.DEV_MAIL_LOG ? 'Terminal (testing)' : provider, from: e.MAIL_FROM || '' };
}

export async function sendMail(e, { to, subject, html, text }) {
  const name = e.MAIL_FROM_NAME || 'Fleetroot Knowledge Base';
  if (e.DEV_MAIL_LOG) {
    console.log(`\n--- email to ${to} ---\n${subject}\n${text}\n---------------------\n`);
    return { ok: true };
  }
  if (!e.MAIL_FROM || !(e.BREVO_API_KEY || e.RESEND_API_KEY)) return { ok: false, error: 'Email sending is not connected yet.' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    let res;
    if (e.BREVO_API_KEY) {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', signal: ctl.signal,
        headers: { 'api-key': e.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { email: e.MAIL_FROM, name }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
      });
    } else {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: ctl.signal,
        headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: `${name} <${e.MAIL_FROM}>`, to: [to], subject, html, text }),
      });
    }
    if (res.ok) return { ok: true };
    let msg = ''; try { const d = await res.json(); msg = d.message || d.error?.message || d.name || ''; } catch {}
    return { ok: false, error: `The email service refused the message (${res.status}${msg ? ': ' + msg : ''}).` };
  } catch (x) {
    return { ok: false, error: x.name === 'AbortError' ? 'The email service took too long to answer.' : 'Could not reach the email service.' };
  } finally { clearTimeout(timer); }
}
