require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');

const db = require('./database');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://www.googletagmanager.com"],
      imgSrc: ["'self'", "data:", "https://www.google-analytics.com"],
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://www.googletagmanager.com"]
    }
  }
}));
app.use(express.json());
app.use(cookieParser());

app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  secret: process.env.SESSION_SECRET || 'wijzig-dit-geheim',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8 uur
  }
}));

// Algemene rate limiter voor de API
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api', apiLimiter);

// Strenge limiter voor login
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.' } });

// CSRF-bescherming voor de admin/schrijf-routes (op basis van cookie)
const csrfProtection = csurf({ cookie: false });

app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.post('/api/admin/login', loginLimiter, csrfProtection, auth.login);
app.post('/api/admin/logout', csrfProtection, auth.requireAdmin, auth.logout);

// CSRF toepassen op alle overige muterende admin/publieke schrijf-routes
app.use('/api', (req, res, next) => {
  const mutating = ['POST', 'PUT', 'DELETE'].includes(req.method);
  const alreadyHandled = req.path === '/admin/login' || req.path === '/admin/logout';
  if (mutating && !alreadyHandled) {
    return csrfProtection(req, res, next);
  }
  next();
});

app.use('/api', require('./routes/treatments'));
app.use('/api', require('./routes/availability'));
app.use('/api', require('./routes/appointments'));
app.use('/api', require('./routes/settings'));

// CSRF errors netjes afhandelen
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Ongeldige beveiligingstoken. Herlaad de pagina en probeer opnieuw.' });
  }
  next(err);
});

// Statische bestanden
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Algemene foutafhandeling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
});

app.listen(PORT, () => {
  console.log(`Pedicure Bianca Passmann draait op poort ${PORT}`);
});
