const db = require('./database');

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(m) {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}
function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

// Geeft de open tijdsblokken (in minuten) voor een specifieke datum terug,
// rekening houdend met het weekschema en eenmalige aanpassingen/vakanties.
function getOpenBlocksForDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = date.getDay(); // 0=zondag..6=zaterdag

  // Is de hele dag geblokkeerd (vakantie/feestdag)?
  const closedDay = db.prepare(
    `SELECT * FROM special_availability WHERE date = ? AND type = 'closed' AND (start_time IS NULL OR start_time = '')`
  ).get(dateStr);
  if (closedDay) return [];

  let blocks = [];

  const weekly = db.prepare(
    'SELECT start_time, end_time FROM availability WHERE day_of_week = ? AND active = 1'
  ).all(dayOfWeek);
  weekly.forEach(b => blocks.push([timeToMinutes(b.start_time), timeToMinutes(b.end_time)]));

  // Eenmalige extra beschikbaarheid
  const extras = db.prepare(
    `SELECT start_time, end_time FROM special_availability WHERE date = ? AND type = 'extra' AND start_time IS NOT NULL`
  ).all(dateStr);
  extras.forEach(b => blocks.push([timeToMinutes(b.start_time), timeToMinutes(b.end_time)]));

  // Eenmalige sluiting van een deel van de dag
  const closedPartial = db.prepare(
    `SELECT start_time, end_time FROM special_availability WHERE date = ? AND type = 'closed' AND start_time IS NOT NULL`
  ).all(dateStr);

  // Geblokkeerde tijden (handmatig door Bianca)
  const blocked = db.prepare(
    'SELECT start_time, end_time FROM blocked_times WHERE date = ?'
  ).all(dateStr);

  const subtractRanges = [...closedPartial, ...blocked].map(b => [timeToMinutes(b.start_time), timeToMinutes(b.end_time)]);

  // Subtraheer geblokkeerde ranges van de open blocks
  for (const sub of subtractRanges) {
    const newBlocks = [];
    for (const [s, e] of blocks) {
      if (sub[1] <= s || sub[0] >= e) {
        newBlocks.push([s, e]); // geen overlap
      } else {
        if (sub[0] > s) newBlocks.push([s, sub[0]]);
        if (sub[1] < e) newBlocks.push([sub[1], e]);
      }
    }
    blocks = newBlocks;
  }

  return blocks;
}

// Geeft beschikbare starttijden (HH:MM) terug voor een datum + behandelduur
function getAvailableSlots(dateStr, durationMinutes) {
  const interval = parseInt(getSetting('slot_interval_minutes', '15'), 10);
  const buffer = parseInt(getSetting('default_buffer_minutes', '15'), 10);
  const noticeHours = parseInt(getSetting('minimum_booking_notice_hours', '2'), 10);
  const maxDaysAhead = parseInt(getSetting('maximum_booking_days_ahead', '60'), 10);

  const now = new Date();
  const targetDate = new Date(dateStr + 'T00:00:00');
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + maxDaysAhead);

  if (targetDate > maxDate) return [];
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (targetDate < startOfToday) return [];

  const openBlocks = getOpenBlocksForDate(dateStr);
  if (openBlocks.length === 0) return [];

  // Bestaande afspraken die niet geannuleerd zijn, plus buffer
  const existing = db.prepare(
    `SELECT start_time, end_time FROM appointments WHERE date = ? AND status != 'geannuleerd'`
  ).all(dateStr);

  const occupied = existing.map(a => [
    timeToMinutes(a.start_time) - buffer,
    timeToMinutes(a.end_time) + buffer
  ]);

  const slots = [];
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const earliestMinutes = isToday ? (now.getHours() * 60 + now.getMinutes() + noticeHours * 60) : -Infinity;

  for (const [blockStart, blockEnd] of openBlocks) {
    for (let start = blockStart; start + durationMinutes <= blockEnd; start += interval) {
      const end = start + durationMinutes;
      if (start < earliestMinutes) continue;

      const overlaps = occupied.some(([os, oe]) => start < oe && end > os);
      if (!overlaps) {
        slots.push({ start: minutesToTime(start), end: minutesToTime(end) });
      }
    }
  }

  return slots;
}

module.exports = { getAvailableSlots, getOpenBlocksForDate, timeToMinutes, minutesToTime };
