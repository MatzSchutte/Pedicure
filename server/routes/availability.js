const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('../auth');
const { getAvailableSlots } = require('../slots');

// Publiek: weekschema (voor info, niet strikt nodig maar handig)
router.get('/availability', (req, res) => {
  const rows = db.prepare('SELECT * FROM availability WHERE active = 1 ORDER BY day_of_week, start_time').all();
  res.json(rows);
});

// Publiek: beschikbare tijden voor een datum + behandeling
router.get('/available-slots', (req, res) => {
  const { date, treatment_id } = req.query;
  if (!date || !treatment_id) {
    return res.status(400).json({ error: 'Datum en behandeling zijn verplicht.' });
  }
  const treatment = db.prepare('SELECT * FROM treatments WHERE id = ? AND active = 1').get(treatment_id);
  if (!treatment) return res.status(404).json({ error: 'Behandeling niet gevonden.' });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Ongeldige datum.' });
  }

  const slots = getAvailableSlots(date, treatment.duration_minutes);
  res.json({ date, treatment_id: Number(treatment_id), slots });
});

// ---------- Admin ----------

router.get('/admin/availability', requireAdmin, (req, res) => {
  const weekly = db.prepare('SELECT * FROM availability ORDER BY day_of_week, start_time').all();
  const special = db.prepare('SELECT * FROM special_availability ORDER BY date').all();
  const blocked = db.prepare('SELECT * FROM blocked_times ORDER BY date, start_time').all();
  res.json({ weekly, special, blocked });
});

// Vervang het volledige weekschema
router.put('/admin/availability', requireAdmin, (req, res) => {
  const { weekly } = req.body || {};
  if (!Array.isArray(weekly)) return res.status(400).json({ error: 'Ongeldig weekschema.' });

  const tx = db.transaction((items) => {
    db.prepare('DELETE FROM availability').run();
    const insert = db.prepare('INSERT INTO availability (day_of_week, start_time, end_time, active) VALUES (?, ?, ?, ?)');
    for (const item of items) {
      insert.run(item.day_of_week, item.start_time, item.end_time, item.active ? 1 : 0);
    }
  });
  tx(weekly);
  res.json({ success: true });
});

// Speciale datum toevoegen (extra beschikbaarheid, vakantie, feestdag)
router.post('/admin/special-availability', requireAdmin, (req, res) => {
  const { date, start_time, end_time, type, note } = req.body || {};
  if (!date || !type) return res.status(400).json({ error: 'Datum en type zijn verplicht.' });
  const result = db.prepare(
    'INSERT INTO special_availability (date, start_time, end_time, type, note) VALUES (?, ?, ?, ?, ?)'
  ).run(date, start_time || null, end_time || null, type, note || '');
  res.json({ id: result.lastInsertRowid });
});

router.delete('/admin/special-availability/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM special_availability WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Tijd blokkeren
router.post('/admin/blocked-times', requireAdmin, (req, res) => {
  const { date, start_time, end_time, reason } = req.body || {};
  if (!date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Datum, starttijd en eindtijd zijn verplicht.' });
  }
  const result = db.prepare(
    'INSERT INTO blocked_times (date, start_time, end_time, reason) VALUES (?, ?, ?, ?)'
  ).run(date, start_time, end_time, reason || '');
  res.json({ id: result.lastInsertRowid });
});

router.delete('/admin/blocked-times/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM blocked_times WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
