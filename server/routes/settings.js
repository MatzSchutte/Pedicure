const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('../auth');

// Publiek: alleen de website-teksten (geen technische instellingen)
const PUBLIC_KEYS = [
  'business_name', 'business_phone', 'business_address',
  'hero_headline', 'hero_subheadline', 'about_text'
];

router.get('/settings', (req, res) => {
  const rows = db.prepare(
    `SELECT key, value FROM settings WHERE key IN (${PUBLIC_KEYS.map(() => '?').join(',')})`
  ).all(...PUBLIC_KEYS);
  const result = {};
  rows.forEach(r => result[r.key] = r.value);
  res.json(result);
});

router.get('/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  rows.forEach(r => result[r.key] = r.value);
  res.json(result);
});

router.put('/admin/settings', requireAdmin, (req, res) => {
  const updates = req.body || {};
  const upsert = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, String(value));
    }
  });
  tx();
  res.json({ success: true });
});

module.exports = router;
