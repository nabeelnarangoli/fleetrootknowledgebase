// Netlify Function: every request to /api/* lands here.
import { getStore } from '@netlify/blobs';
import { createHandler } from '../lib/handler.mjs';

const KEYS = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'SITE_URL', 'BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_FROM', 'MAIL_FROM_NAME'];
const readEnv = (k) => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];

const handler = createHandler({
  getStore: (name) => getStore({ name, consistency: 'strong' }),
  env: () => Object.fromEntries(KEYS.map((k) => [k, readEnv(k)])),
});

export default async (req) => handler(req);

export const config = { path: '/api/*' };
