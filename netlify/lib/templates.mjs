// Branded emails (English with an Arabic line), built with tables so every mail app shows them correctly.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';

function shell({ eyebrow, title, intro, introAr, button, buttonAr, link, footnote }) {
  return `<!doctype html><html><body style="margin:0;background:#F3F2EE;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F2EE;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0E0E10;padding:18px 26px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:-.01em">fleetroot <span style="color:#A99BFF;font-weight:normal">Knowledge Base</span></td></tr>
<tr><td style="padding:28px 26px 8px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4C30FF;font-weight:bold">${eyebrow}</p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0E0E10">${title}</h1>
<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#2B2B31">${intro}</p>
<p dir="rtl" style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#5A5A63;text-align:right">${introAr}</p>
<p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;background:#4C30FF;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:bold;font-size:15px">${button} &nbsp;·&nbsp; ${buttonAr}</a></p>
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#5A5A63">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all"><a href="${esc(link)}" style="color:#4C30FF">${esc(link)}</a></p>
</td></tr>
<tr><td style="padding:16px 26px;border-top:1px solid #ECEBE6;color:#7A7A83;font-size:12px;line-height:1.6">${footnote}<br>Fleetroot FZCO · DAFZA, Dubai, UAE · support@fleetroot.com</td></tr>
</table></td></tr></table></body></html>`;
}

export function verifyMail({ name, email, link }) {
  const subject = 'Confirm your email for the Fleetroot Knowledge Base';
  const html = shell({
    eyebrow: 'Confirm your email', title: `Welcome, ${esc(first(name))}`,
    intro: 'Thanks for signing up to the Fleetroot Knowledge Base. Confirm your email address to finish creating your account. The link works for 48 hours.',
    introAr: 'شكرًا لتسجيلك في قاعدة معرفة Fleetroot. يرجى تأكيد بريدك الإلكتروني لإكمال إنشاء حسابك. الرابط صالح لمدة 48 ساعة.',
    button: 'Confirm my email', buttonAr: 'تأكيد بريدي الإلكتروني', link,
    footnote: 'You received this because this address was used to sign up. If that was not you, ignore this email and no account will be created.',
  });
  const text = `Hi ${first(name)},\n\nConfirm your email for the Fleetroot Knowledge Base by opening this link (valid for 48 hours):\n${link}\n\nIf you did not sign up, ignore this email.\n\nFleetroot FZCO · support@fleetroot.com`;
  return { to: email, subject, html, text };
}

export function resetMail({ name, email, link }) {
  const subject = 'Set your Fleetroot Knowledge Base password';
  const html = shell({
    eyebrow: 'Password', title: `Hi ${esc(first(name))}, set your password`,
    intro: 'Use the button below to choose a new password for the Fleetroot Knowledge Base. The link works for 2 hours and can be used once.',
    introAr: 'استخدم الزر أدناه لاختيار كلمة مرور جديدة لقاعدة معرفة Fleetroot. الرابط صالح لمدة ساعتين ويمكن استخدامه مرة واحدة.',
    button: 'Set my password', buttonAr: 'تعيين كلمة المرور', link,
    footnote: 'If you did not ask for this, ignore this email. Your password stays the same.',
  });
  const text = `Hi ${first(name)},\n\nChoose a new password for the Fleetroot Knowledge Base (link valid for 2 hours, one use):\n${link}\n\nIf you did not ask for this, ignore this email.\n\nFleetroot FZCO · support@fleetroot.com`;
  return { to: email, subject, html, text };
}
