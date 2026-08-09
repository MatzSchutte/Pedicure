const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('../auth');
const { getAvailableSlots, timeToMinutes } = require('../slots');
const { sendMail, notifyAdmin } = require('../mailer');

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

// Publiek: nieuwe afspraak aanvragen
router.post('/appointments', async (req, res) => {
  const { customer_name, phone, email, treatment_id, location_type, date, start_time, note } = req.body || {};

  if (!customer_name || !phone || !treatment_id || !date || !start_time) {
    return res.status(400).json({ error: 'Vul alle verplichte velden in: naam, telefoon, behandeling, datum en tijd.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Ongeldige datum.' });
  }

  const treatment = db.prepare('SELECT * FROM treatments WHERE id = ? AND active = 1').get(treatment_id);
  if (!treatment) {
    return res.status(404).json({ error: 'Deze behandeling bestaat niet (meer).' });
  }
  const loc = location_type === 'huis' ? 'huis' : 'praktijk';
  if (loc === 'huis' && !treatment.home_available) {
    return res.status(400).json({ error: 'Deze behandeling is niet beschikbaar aan huis.' });
  }
  if (loc === 'praktijk' && !treatment.practice_available) {
    return res.status(400).json({ error: 'Deze behandeling is niet beschikbaar in de praktijk.' });
  }

  // Server-side herbevestiging: is dit tijdstip nog steeds vrij?
  const freshSlots = getAvailableSlots(date, treatment.duration_minutes);
  const match = freshSlots.find(s => s.start === start_time);
  if (!match) {
    return res.status(409).json({ error: 'Dit tijdstip is helaas net vergeven. Kies een ander tijdstip.' });
  }

  let newId;
  try {
    const tx = db.transaction(() => {
      // Nogmaals checken binnen de transactie om race conditions te voorkomen
      const buffer = parseInt(getSetting('default_buffer_minutes', '15'), 10);
      const startMin = timeToMinutes(match.start) - buffer;
      const endMin = timeToMinutes(match.end) + buffer;

      const existing = db.prepare(
        `SELECT start_time, end_time FROM appointments WHERE date = ? AND status != 'geannuleerd'`
      ).all(date);

      const conflict = existing.some(a => {
        const s = timeToMinutes(a.start_time);
        const e = timeToMinutes(a.end_time);
        return startMin < e && endMin > s;
      });
      if (conflict) throw new Error('SLOT_TAKEN');

      const result = db.prepare(`INSERT INTO appointments
        (customer_name, phone, email, treatment_id, location_type, date, start_time, end_time, note, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aangevraagd')`).run(
        customer_name.trim(), phone.trim(), (email || '').trim(), treatment_id,
        loc, date, match.start, match.end, (note || '').trim()
      );
      newId = result.lastInsertRowid;
    });
    tx();
  } catch (err) {
    if (err.message === 'SLOT_TAKEN') {
      return res.status(409).json({ error: 'Dit tijdstip is helaas net vergeven. Kies een ander tijdstip.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Er is iets misgegaan bij het opslaan van je afspraak. Probeer het opnieuw.' });
  }

  const businessName = getSetting('business_name', 'Pedicure Bianca Passmann');
  const summary = `Behandeling: ${treatment.name}\nLocatie: ${loc === 'huis' ? 'Aan huis' : 'In de praktijk'}\nDatum: ${date}\nTijd: ${match.start}\nNaam: ${customer_name}`;

  if (email) {
    sendMail({
      to: email,
      subject: `Afspraakbevestiging - ${businessName}`,
      text: `Beste ${customer_name},\n\nJe afspraak is aangevraagd:\n\n${summary}\n\nJe ontvangt bericht zodra de afspraak is bevestigd.\n\nMet vriendelijke groet,\n${businessName}`
    });
  }
  notifyAdmin(`Nieuwe afspraak aangevraagd`, `${summary}\nTelefoon: ${phone}\nOpmerking: ${note || '-'}`);

  res.json({
    success: true,
    id: newId,
    message: 'Je afspraak is succesvol aangevraagd.',
    summary: { treatment: treatment.name, location: loc, date, time: match.start, name: customer_name }
  });
});

// ---------- Admin ----------

router.get('/admin/appointments', requireAdmin, (req, res) => {
  const { date, status, from, to } = req.query;
  let query = 'SELECT a.*, t.name as treatment_name FROM appointments a JOIN treatments t ON t.id = a.treatment_id WHERE 1=1';
  const params = [];
  if (date) { query += ' AND a.date = ?'; params.push(date); }
  if (from) { query += ' AND a.date >= ?'; params.push(from); }
  if (to) { query += ' AND a.date <= ?'; params.push(to); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  query += ' ORDER BY a.date, a.start_time';
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.get('/admin/dashboard', requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const todayCount = db.prepare(`SELECT COUNT(*) c FROM appointments WHERE date = ? AND status != 'geannuleerd'`).get(today).c;
  const weekCount = db.prepare(`SELECT COUNT(*) c FROM appointments WHERE date >= ? AND date <= ? AND status != 'geannuleerd'`).get(today, weekEndStr).c;
  const next = db.prepare(`SELECT a.*, t.name as treatment_name FROM appointments a JOIN treatments t ON t.id = a.treatment_id
    WHERE (a.date > ? OR (a.date = ? AND a.start_time >= ?)) AND a.status != 'geannuleerd'
    ORDER BY a.date, a.start_time LIMIT 1`).get(today, today, new Date().toTimeString().slice(0, 5));

  res.json({
    today_count: todayCount,
    week_count: weekCount,
    next_appointment: next || null
  });
});

router.post('/admin/appointments', requireAdmin, (req, res) => {
  const { customer_name, phone, email, treatment_id, location_type, date, start_time, end_time, note, status } = req.body || {};
  if (!customer_name || !phone || !treatment_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Vul alle verplichte velden in.' });
  }
  const result = db.prepare(`INSERT INTO appointments
    (customer_name, phone, email, treatment_id, location_type, date, start_time, end_time, note, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    customer_name, phone, email || '', treatment_id, location_type || 'praktijk',
    date, start_time, end_time, note || '', status || 'bevestigd'
  );
  res.json({ id: result.lastInsertRowid });
});

router.put('/admin/appointments/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Afspraak niet gevonden.' });

  const fields = ['customer_name', 'phone', 'email', 'treatment_id', 'location_type', 'date', 'start_time', 'end_time', 'note', 'status'];
  const updates = {};
  for (const f of fields) updates[f] = req.body[f] !== undefined ? req.body[f] : existing[f];

  db.prepare(`UPDATE appointments SET
      customer_name=?, phone=?, email=?, treatment_id=?, location_type=?,
      date=?, start_time=?, end_time=?, note=?, status=?, updated_at=datetime('now')
    WHERE id=?`).run(
    updates.customer_name, updates.phone, updates.email, updates.treatment_id, updates.location_type,
    updates.date, updates.start_time, updates.end_time, updates.note, updates.status, req.params.id
  );

  if (updates.status !== existing.status && updates.email) {
    const businessName = getSetting('business_name', 'Pedicure Bianca Passmann');
    if (updates.status === 'geannuleerd') {
      sendMail({ to: updates.email, subject: `Afspraak geannuleerd - ${businessName}`,
        text: `Beste ${updates.customer_name},\n\nJe afspraak op ${updates.date} om ${updates.start_time} is geannuleerd.\n\nMet vriendelijke groet,\n${businessName}` });
    } else if (updates.status === 'bevestigd') {
      sendMail({ to: updates.email, subject: `Afspraak bevestigd - ${businessName}`,
        text: `Beste ${updates.customer_name},\n\nJe afspraak op ${updates.date} om ${updates.start_time} is bevestigd.\n\nMet vriendelijke groet,\n${businessName}` });
    }
  }

  res.json({ success: true });
});

router.delete('/admin/appointments/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
