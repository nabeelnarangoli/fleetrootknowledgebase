# Fleetroot Knowledge Base

A customer help centre for Fleetroot: a landing page, sign-up with email confirmation, animated "Watch how" guides on real Fleetroot screens (English with Arabic subtitles), and an admin panel.

| Address | What it is |
|---|---|
| `/` | Landing page about Fleetroot and the knowledge base |
| `/help` | Customer app: sign up, confirm email, sign in, guides |
| `/admin` | Admin panel: customers, guide statistics, settings |

## How it's built

| Part | What it is |
|---|---|
| `public/` | The website: plain HTML, CSS and JavaScript (no build step) |
| `public/js/kb-content.js` | All guide text (English + Arabic) and the animated demo steps. Edit guides here |
| `public/img/kb/` | Real Fleetroot screenshots used by the animated guides |
| `public/js/player.js` | The "Watch how" player |
| `netlify/functions/api.mjs` | The API, running as a Netlify Function at `/api/*` |
| `netlify/lib/handler.mjs` | Sign-up, email confirmation, sign-in, admin |
| `netlify/lib/mail.mjs` | Sends email through Brevo or Resend |
| Netlify Blobs | Storage for customers and statistics (built into Netlify, no database to set up) |

## Put it online (Netlify)

1. Sign in at **app.netlify.com** → **Add new site → Import an existing project → GitHub** → pick `fleetrootknowledgebase`. Leave the build settings as they are.
2. **Site configuration → Environment variables**, add:
   - `ADMIN_PASSWORD` (required): a long password only you know, for `/admin`.
   - `SESSION_SECRET` (optional): any long random text. Changing it signs everyone out.
   - `BREVO_API_KEY` and `MAIL_FROM`: to send confirmation emails (see below).
   - `SITE_URL` (optional): your final address, for example `https://help.fleetroot.com`, so email links always point there.
3. **Deploys → Trigger deploy**.
4. Open `/admin`, log in, and check **Settings → Email sending** says *Connected*. Send yourself a test email.

## Confirmation emails (Brevo, free)

Customers must confirm their email before they can sign in. The confirmation email is sent automatically by the site; nothing is sent from your own mailbox.

1. Create a free account at **brevo.com** (300 emails a day free).
2. **Senders, domains & dedicated IPs → Senders**: add the sending address (for example `noreply@yourdomain.com`) and confirm it.
3. **SMTP & API → API keys**: create a key.
4. In Netlify add `BREVO_API_KEY` and `MAIL_FROM`, then redeploy.

Until email is connected, people can still sign up, and you can confirm them by hand in **Admin → Customers → Confirm**.

## Adding guides and animations

- Text for every guide is in `public/js/kb-content.js`: a title, a summary and steps, each in English (`en`) and Arabic (`ar`). Fleetroot screen labels stay in English, written as `**Label**`.
- A guide with a `demo` gets the "Watch how" player. Each demo step names a screenshot in `public/img/kb/` and the control's position on screen: `at: [centre X %, centre Y %, width %, height %]`.
- Turn modules on or off for customers in **Admin → Settings**.

## Run it on your own computer

You need Node.js 22 or newer.

```bash
npm install
ADMIN_PASSWORD=test123 DEV_MAIL_LOG=1 npm run dev
# open http://localhost:8888  (admin: http://localhost:8888/admin)
```

`DEV_MAIL_LOG=1` prints emails (with their confirmation links) in the terminal instead of sending them. Local data is saved in `.data/`, which git ignores.
