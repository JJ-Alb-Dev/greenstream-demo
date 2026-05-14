import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { authenticateDemoUser } from './server/demoUsers.js';
import {
  validateAdminReportBody,
  streamAdminReportPdf,
  buildReportAttachmentFilename,
} from './server/adminReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || (isProd ? 3000 : 3001);

const SESSION_COOKIE = 'gs_session';
const SESSION_MAX_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, { email: string, role: string, name: string, expires: number }>} */
const sessions = new Map();

function cookieBase() {
  return {
    httpOnly: true,
    secure: Boolean(isProd),
    sameSite: 'lax',
    path: '/',
  };
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expires < now) sessions.delete(id);
  }
}

function createSession(user) {
  pruneSessions();
  const id = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + SESSION_MAX_MS;
  sessions.set(id, { ...user, expires });
  return id;
}

function readSessionUser(req) {
  const id = req.cookies?.[SESSION_COOKIE];
  if (!id) return null;
  const s = sessions.get(id);
  if (!s || s.expires < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return { id, user: { email: s.email, role: s.role, name: s.name } };
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

if (!isProd) {
  app.use(
    cors({
      origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/],
      credentials: true,
    }),
  );
}

/** Të gjitha rrugët API — montuar para statikës / SPA në produksion. */
const api = express.Router();

api.post('/login', (req, res) => {
  const email = req.body?.email;
  const password = req.body?.password;
  if (email == null || password == null || String(email).trim() === '' || String(password) === '') {
    return res.status(400).json({ error: 'E-posta dhe fjalëkalimi janë të detyrueshëm.' });
  }
  const user = authenticateDemoUser(String(email), String(password));
  if (!user) {
    return res.status(401).json({ error: 'E-posta ose fjalëkalimi nuk përputhen.' });
  }
  const sid = createSession(user);
  res.cookie(SESSION_COOKIE, sid, { ...cookieBase(), maxAge: SESSION_MAX_MS });
  return res.json({ user });
});

api.get('/me', (req, res) => {
  const sess = readSessionUser(req);
  if (!sess) return res.json({ user: null });
  return res.json({ user: sess.user });
});

api.post('/logout', (req, res) => {
  const id = req.cookies?.[SESSION_COOKIE];
  if (id) sessions.delete(id);
  res.clearCookie(SESSION_COOKIE, { ...cookieBase(), maxAge: 0 });
  return res.json({ ok: true });
});

api.post('/admin/report', (req, res) => {
  const sess = readSessionUser(req);
  if (!sess) {
    return res.status(401).json({ error: 'Duhet të identifikoheni për të gjeneruar raportin.' });
  }
  if (sess.user.role !== 'admin') {
    return res.status(403).json({ error: 'Vetëm administratorët mund të gjenerojnë këtë raport.' });
  }
  const parsed = validateAdminReportBody(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  const v = parsed.value;
  const filename = buildReportAttachmentFilename(v.dataFillimit, v.dataMbarimit);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  try {
    streamAdminReportPdf(res, {
      ...v,
      generatedBy: sess.user.name ? `${sess.user.name} <${sess.user.email}>` : sess.user.email,
    });
  } catch (err) {
    console.error('[greenstream] PDF raport:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Gjenerimi i PDF dështoi. Provoni përsëri.' });
    }
    res.destroy(err);
  }
});

app.use('/api', api);

const distDir = path.join(__dirname, 'dist');

if (isProd) {
  app.use(express.static(distDir, { index: false }));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use((req, res) => {
  const isApi = req.path === '/api' || req.path.startsWith('/api/');
  const msg = isApi
    ? 'Kjo pikë fundore e API nuk ekziston ose metoda nuk mbështetet.'
    : 'Nuk u gjet.';
  res.status(404).json({ error: msg });
});

app.listen(PORT, () => {
  console.log(`[greenstream] Duke dëgjuar në http://127.0.0.1:${PORT} (${isProd ? 'produksion' : 'zhvillim'})`);
});
