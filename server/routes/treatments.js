const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('../auth');

// Publiek: actieve behandelingen
router.get('/treatments', (req, res) => {
  const rows = db.prepare('SELECT * FROM treatments WHERE active = 1 ORDER BY id').all();
  res.json(rows);
});

// Admin: alle behandelingen (ook inactief)
router.get('/admin/treatments', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM treatments ORDER BY id').all();
  res.json(rows);
});

router.post('/admin/treatments', requireAdmin, (req, res) => {
  const { name, description, price, duration_minutes, practice_available, home_available, active } = req.body || {};
  if (!name || !price || !duration_minutes) {
    return res.status(400).json({ error: 'Naam, prijs en duur zijn verplicht.' });
  }
  const stmt = db.prepare(`INSERT INTO treatments
    (name, description, price, duration_minutes, practice_available, home_available, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const result = stmt.run(
    name, description || '', price, duration_minutes,
    practice_available ? 1 : 0, home_available ? 1 : 0, active === false ? 0 : 1
  );
  res.json({ id: result.lastInsertRowid });
});

router.put('/admin/treatments/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM treatments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Behandeling niet gevonden.' });

  const { name, description, price, duration_minutes, practice_available, home_available, active } = req.body || {};
  db.prepare(`UPDATE treatments SET
      name = ?, description = ?, price = ?, duration_minutes = ?,
      practice_available = ?, home_available = ?, active = ?
    WHERE id = ?`).run(
    name ?? existing.name,
    description ?? existing.description,
    price ?? existing.price,
    duration_minutes ?? existing.duration_minutes,
    practice_available !== undefined ? (practice_available ? 1 : 0) : existing.practice_available,
    home_available !== undefined ? (home_available ? 1 : 0) : existing.home_available,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json({ success: true });
});

router.delete('/admin/treatments/:id', requireAdmin, (req, res) => {
  const inUse = db.prepare(`SELECT COUNT(*) c FROM appointments WHERE treatment_id = ? AND status != 'geannuleerd'`).get(req.params.id);
  if (inUse.c > 0) {
    // Niet verwijderen als er nog afspraken aan hangen; alleen deactiveren
    db.prepare('UPDATE treatments SET active = 0 WHERE id = ?').run(req.params.id);
    return res.json({ success: true, deactivated: true, message: 'Behandeling heeft nog afspraken en is gedeactiveerd in plaats van verwijderd.' });
  }
  db.prepare('DELETE FROM treatments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
