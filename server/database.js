const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'pedicure.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS treatments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  practice_available INTEGER NOT NULL DEFAULT 1,
  home_available INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week INTEGER NOT NULL, -- 0=zondag .. 6=zaterdag
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS special_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  type TEXT NOT NULL DEFAULT 'extra', -- extra | closed
  note TEXT
);

CREATE TABLE IF NOT EXISTS blocked_times (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  treatment_id INTEGER NOT NULL REFERENCES treatments(id),
  location_type TEXT NOT NULL DEFAULT 'praktijk', -- praktijk | huis
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'aangevraagd', -- aangevraagd | bevestigd | geannuleerd | voltooid
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(date, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// ---------- Seed defaults (alleen als leeg) ----------
const treatmentCount = db.prepare('SELECT COUNT(*) c FROM treatments').get().c;
if (treatmentCount === 0) {
  const insert = db.prepare(`INSERT INTO treatments
    (name, description, price, duration_minutes, practice_available, home_available, active)
    VALUES (@name, @description, @price, @duration_minutes, @practice_available, @home_available, 1)`);
  insert.run({ name: 'Basispedicure', description: 'Nagels knippen, eelt verwijderen, voeten verzorgen.', price: 27.5, duration_minutes: 45, practice_available: 1, home_available: 1 });
  insert.run({ name: 'Pedicure + massage', description: 'Basisbehandeling met ontspannende voetmassage.', price: 34.5, duration_minutes: 60, practice_available: 1, home_available: 1 });
  insert.run({ name: 'Diabetische voet', description: 'Specialistische behandeling voor diabetespatiënten.', price: 32.5, duration_minutes: 45, practice_available: 1, home_available: 1 });
}

const availabilityCount = db.prepare('SELECT COUNT(*) c FROM availability').get().c;
if (availabilityCount === 0) {
  const insert = db.prepare(`INSERT INTO availability (day_of_week, start_time, end_time, active) VALUES (?, ?, ?, ?)`);
  // Maandag t/m vrijdag 09:00-17:00, in de praktijk
  for (let d = 1; d <= 5; d++) {
    insert.run(d, '09:00', '17:00', 1);
  }
}

const settingsDefaults = {
  business_name: 'Pedicure Bianca Passmann',
  business_phone: '0651162472',
  business_address: 'Hazelaarstraat 3, Lutten',
  hero_headline: 'Professionele pedicure, gewoon bij jou in de buurt.',
  hero_subheadline: 'Professionele pedicurebehandelingen in de praktijk én ambulant aan huis.',
  about_text: 'Bianca Passmann is uw pedicure in Lutten, met oog voor persoonlijke en vakkundige voetverzorging, zowel in de praktijk als aan huis.',
  slot_interval_minutes: '15',
  default_buffer_minutes: '15',
  minimum_booking_notice_hours: '2',
  maximum_booking_days_ahead: '60'
};
const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(settingsDefaults)) {
  if (!getSetting.get(key)) insertSetting.run(key, value);
}

module.exports = db;
