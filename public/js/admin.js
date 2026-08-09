(function () {
  const DAY_NAMES = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
  let csrfToken = null;
  let treatmentsCache = [];

  const loginScreen = document.getElementById('loginScreen');
  const adminApp = document.getElementById('adminApp');

  async function api(path, options = {}) {
    const opts = { headers: { 'Content-Type': 'application/json' }, ...options };
    if (options.method && options.method !== 'GET') {
      opts.headers['CSRF-Token'] = csrfToken;
    }
    const res = await fetch('/api' + path, opts);
    if (res.status === 401) {
      showLogin();
      throw new Error('Niet ingelogd');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Er is iets misgegaan.');
    return data;
  }

  async function refreshCsrf() {
    const r = await fetch('/api/csrf-token');
    const d = await r.json();
    csrfToken = d.csrfToken;
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    adminApp.style.display = 'none';
  }
  function showApp() {
    loginScreen.style.display = 'none';
    adminApp.style.display = 'block';
    initApp();
  }

  // ---------- Login ----------
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const errorBox = document.getElementById('loginError');
    errorBox.innerHTML = '';
    try {
      await refreshCsrf();
      await api('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      showApp();
    } catch (err) {
      errorBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await api('/admin/logout', { method: 'POST' }); } catch (e) {}
    showLogin();
  });

  // ---------- Tabs ----------
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
      document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
      loadTab(btn.dataset.tab);
    });
  });

  function loadTab(tab) {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'agenda') loadAgenda();
    if (tab === 'beschikbaarheid') loadAvailability();
    if (tab === 'afspraken') loadAppointments();
    if (tab === 'behandelingen') loadTreatmentsAdmin();
    if (tab === 'website') loadWebsiteSettings();
  }

  async function initApp() {
    await refreshCsrf();
    loadDashboard();
  }

  // ---------- Dashboard ----------
  async function loadDashboard() {
    try {
      const d = await api('/admin/dashboard');
      document.getElementById('statToday').textContent = d.today_count;
      document.getElementById('statWeek').textContent = d.week_count;
      document.getElementById('statNext').textContent = d.next_appointment
        ? `${d.next_appointment.date} ${d.next_appointment.start_time} – ${d.next_appointment.customer_name}`
        : 'Geen';
    } catch (err) { console.error(err); }
  }

  // ---------- Agenda ----------
  async function loadAgenda() {
    const dateInput = document.getElementById('agendaDate');
    if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
    dateInput.onchange = renderAgendaList;
    renderAgendaList();
  }

  async function renderAgendaList() {
    const date = document.getElementById('agendaDate').value;
    const list = document.getElementById('agendaList');
    list.innerHTML = '<p>Laden…</p>';
    try {
      const rows = await api(`/admin/appointments?date=${date}`);
      if (rows.length === 0) { list.innerHTML = '<p>Geen afspraken op deze dag.</p>'; return; }
      list.innerHTML = rows.map(a => `
        <div class="list-item">
          <div>
            <strong>${a.start_time} – ${a.end_time}</strong> &middot; ${escapeHtml(a.customer_name)}
            <br><small>${escapeHtml(a.treatment_name)} &middot; ${a.location_type === 'huis' ? 'Aan huis' : 'Praktijk'}</small>
          </div>
          <span class="badge badge-${a.status}">${a.status}</span>
        </div>`).join('');
    } catch (err) { list.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  }

  // ---------- Beschikbaarheid ----------
  async function loadAvailability() {
    try {
      const data = await api('/admin/availability');
      renderWeekEditor(data.weekly);
      renderSpecialList(data.special);
      renderBlockedList(data.blocked);
    } catch (err) { console.error(err); }
  }

  function renderWeekEditor(weekly) {
    const byDay = {};
    weekly.forEach(w => { byDay[w.day_of_week] = w; });
    const editor = document.getElementById('weekScheduleEditor');
    editor.innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const w = byDay[d];
      return `
        <div class="day-row" data-day="${d}">
          <label class="day-name"><input type="checkbox" class="day-active" ${w ? 'checked' : ''}> ${DAY_NAMES[d]}</label>
          <input type="time" class="day-start" value="${w ? w.start_time : '09:00'}">
          <span>tot</span>
          <input type="time" class="day-end" value="${w ? w.end_time : '17:00'}">
        </div>`;
    }).join('');
  }

  document.getElementById('saveWeekScheduleBtn').addEventListener('click', async () => {
    const rows = [...document.querySelectorAll('#weekScheduleEditor .day-row')].map(row => ({
      day_of_week: Number(row.dataset.day),
      start_time: row.querySelector('.day-start').value,
      end_time: row.querySelector('.day-end').value,
      active: row.querySelector('.day-active').checked
    })).filter(r => r.active);
    try {
      await api('/admin/availability', { method: 'PUT', body: JSON.stringify({ weekly: rows }) });
      alert('Weekschema opgeslagen.');
    } catch (err) { alert(err.message); }
  });

  document.getElementById('specialType').addEventListener('change', (e) => {
    document.getElementById('specialTimesGroup').style.display = e.target.value === 'extra' ? 'flex' : 'none';
  });

  function renderSpecialList(items) {
    const list = document.getElementById('specialList');
    if (items.length === 0) { list.innerHTML = '<p style="color:#857a74;">Geen eenmalige aanpassingen.</p>'; return; }
    list.innerHTML = items.map(s => `
      <div class="list-item">
        <div>${s.date} &middot; ${s.type === 'closed' ? 'Geblokkeerd' : 'Extra: ' + s.start_time + '-' + s.end_time}
          ${s.note ? ' &middot; ' + escapeHtml(s.note) : ''}</div>
        <button class="delete-btn" data-id="${s.id}">✕</button>
      </div>`).join('');
    list.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', async () => {
      await api('/admin/special-availability/' + b.dataset.id, { method: 'DELETE' });
      loadAvailability();
    }));
  }

  document.getElementById('addSpecialBtn').addEventListener('click', async () => {
    const date = document.getElementById('specialDate').value;
    const type = document.getElementById('specialType').value;
    const start_time = document.getElementById('specialStart').value;
    const end_time = document.getElementById('specialEnd').value;
    const note = document.getElementById('specialNote').value;
    if (!date) { alert('Kies een datum.'); return; }
    try {
      await api('/admin/special-availability', { method: 'POST', body: JSON.stringify({ date, type, start_time, end_time, note }) });
      loadAvailability();
    } catch (err) { alert(err.message); }
  });

  function renderBlockedList(items) {
    const list = document.getElementById('blockedList');
    if (items.length === 0) { list.innerHTML = '<p style="color:#857a74;">Geen geblokkeerde tijden.</p>'; return; }
    list.innerHTML = items.map(b => `
      <div class="list-item">
        <div>${b.date} &middot; ${b.start_time}-${b.end_time} ${b.reason ? '&middot; ' + escapeHtml(b.reason) : ''}</div>
        <button class="delete-btn" data-id="${b.id}">✕</button>
      </div>`).join('');
    list.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', async () => {
      await api('/admin/blocked-times/' + b.dataset.id, { method: 'DELETE' });
      loadAvailability();
    }));
  }

  document.getElementById('addBlockBtn').addEventListener('click', async () => {
    const date = document.getElementById('blockDate').value;
    const start_time = document.getElementById('blockStart').value;
    const end_time = document.getElementById('blockEnd').value;
    const reason = document.getElementById('blockReason').value;
    if (!date || !start_time || !end_time) { alert('Vul datum, starttijd en eindtijd in.'); return; }
    try {
      await api('/admin/blocked-times', { method: 'POST', body: JSON.stringify({ date, start_time, end_time, reason }) });
      loadAvailability();
    } catch (err) { alert(err.message); }
  });

  // ---------- Afspraken ----------
  async function loadAppointments() {
    if (!treatmentsCache.length) {
      treatmentsCache = await api('/admin/treatments');
    }
    renderAppointmentsTable();
  }

  document.getElementById('filterBtn').addEventListener('click', renderAppointmentsTable);

  async function renderAppointmentsTable() {
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const status = document.getElementById('filterStatus').value;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    const container = document.getElementById('appointmentsTable');
    container.innerHTML = '<p>Laden…</p>';
    try {
      const rows = await api('/admin/appointments?' + params.toString());
      if (rows.length === 0) { container.innerHTML = '<p>Geen afspraken gevonden.</p>'; return; }
      container.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Datum</th><th>Tijd</th><th>Klant</th><th>Behandeling</th><th>Locatie</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${rows.map(a => `
              <tr>
                <td>${a.date}</td>
                <td>${a.start_time}</td>
                <td>${escapeHtml(a.customer_name)}<br><small>${escapeHtml(a.phone)}</small></td>
                <td>${escapeHtml(a.treatment_name)}</td>
                <td>${a.location_type === 'huis' ? 'Aan huis' : 'Praktijk'}</td>
                <td><span class="badge badge-${a.status}">${a.status}</span></td>
                <td>
                  <button class="action-btn" data-edit="${a.id}">Bewerken</button>
                  <button class="action-btn" data-cancel="${a.id}" style="color:var(--danger)">Annuleren</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      container.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () =>
        openAppointmentModal(rows.find(r => r.id == btn.dataset.edit))));
      container.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Weet je zeker dat je deze afspraak wilt annuleren?')) return;
        await api('/admin/appointments/' + btn.dataset.cancel, { method: 'PUT', body: JSON.stringify({ status: 'geannuleerd' }) });
        renderAppointmentsTable();
        loadDashboard();
      }));
    } catch (err) { container.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  }

  document.getElementById('newAppointmentBtn').addEventListener('click', () => openAppointmentModal(null));

  function openAppointmentModal(appt) {
    const isNew = !appt;
    const modalBox = document.getElementById('modalBox');
    modalBox.innerHTML = `
      <h3>${isNew ? 'Nieuwe afspraak' : 'Afspraak bewerken'}</h3>
      <div id="modalError"></div>
      <div class="form-group"><label>Naam</label><input type="text" id="mName" value="${appt ? escapeAttr(appt.customer_name) : ''}"></div>
      <div class="form-group"><label>Telefoon</label><input type="text" id="mPhone" value="${appt ? escapeAttr(appt.phone) : ''}"></div>
      <div class="form-group"><label>E-mail</label><input type="email" id="mEmail" value="${appt ? escapeAttr(appt.email || '') : ''}"></div>
      <div class="form-group"><label>Behandeling</label>
        <select id="mTreatment">${treatmentsCache.map(t => `<option value="${t.id}" ${appt && appt.treatment_id === t.id ? 'selected' : ''}>${escapeHtml(t.name)} (${t.duration_minutes} min)</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Locatie</label>
        <select id="mLocation">
          <option value="praktijk" ${appt && appt.location_type === 'praktijk' ? 'selected' : ''}>Praktijk</option>
          <option value="huis" ${appt && appt.location_type === 'huis' ? 'selected' : ''}>Aan huis</option>
        </select>
      </div>
      <div class="form-group"><label>Datum</label><input type="date" id="mDate" value="${appt ? appt.date : ''}"></div>
      <div class="form-group"><label>Starttijd</label><input type="time" id="mStart" value="${appt ? appt.start_time : ''}"></div>
      <div class="form-group"><label>Eindtijd</label><input type="time" id="mEnd" value="${appt ? appt.end_time : ''}"></div>
      ${!isNew ? `
      <div class="form-group"><label>Status</label>
        <select id="mStatus">
          ${['aangevraagd', 'bevestigd', 'geannuleerd', 'voltooid'].map(s => `<option value="${s}" ${appt.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="form-group"><label>Opmerking</label><textarea id="mNote" rows="2">${appt ? escapeHtml(appt.note || '') : ''}</textarea></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modalCancelBtn">Annuleren</button>
        <button class="btn btn-primary" id="modalSaveBtn">Opslaan</button>
      </div>`;
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
    document.getElementById('modalSaveBtn').addEventListener('click', async () => {
      const treatment = treatmentsCache.find(t => t.id == document.getElementById('mTreatment').value);
      const payload = {
        customer_name: document.getElementById('mName').value.trim(),
        phone: document.getElementById('mPhone').value.trim(),
        email: document.getElementById('mEmail').value.trim(),
        treatment_id: treatment.id,
        location_type: document.getElementById('mLocation').value,
        date: document.getElementById('mDate').value,
        start_time: document.getElementById('mStart').value,
        end_time: document.getElementById('mEnd').value,
        note: document.getElementById('mNote').value.trim()
      };
      if (!isNew) payload.status = document.getElementById('mStatus').value;
      if (!payload.customer_name || !payload.phone || !payload.date || !payload.start_time || !payload.end_time) {
        document.getElementById('modalError').innerHTML = '<div class="alert alert-error">Vul alle verplichte velden in.</div>';
        return;
      }
      try {
        if (isNew) await api('/admin/appointments', { method: 'POST', body: JSON.stringify(payload) });
        else await api('/admin/appointments/' + appt.id, { method: 'PUT', body: JSON.stringify(payload) });
        closeModal();
        renderAppointmentsTable();
        loadDashboard();
      } catch (err) {
        document.getElementById('modalError').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
      }
    });
  }

  function closeModal() { document.getElementById('modalOverlay').style.display = 'none'; }
  document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });

  // ---------- Behandelingen ----------
  async function loadTreatmentsAdmin() {
    treatmentsCache = await api('/admin/treatments');
    renderTreatmentsAdminList();
  }

  function renderTreatmentsAdminList() {
    const list = document.getElementById('treatmentsAdminList');
    list.innerHTML = treatmentsCache.map(t => `
      <div class="list-item">
        <div>
          <strong>${escapeHtml(t.name)}</strong> &middot; &euro;${Number(t.price).toFixed(2)} &middot; ${t.duration_minutes} min
          ${!t.active ? ' <span class="badge badge-geannuleerd">inactief</span>' : ''}
          <br><small>${t.practice_available ? 'Praktijk' : ''}${t.practice_available && t.home_available ? ' & ' : ''}${t.home_available ? 'Aan huis' : ''}</small>
        </div>
        <div>
          <button class="action-btn" data-edit="${t.id}">Bewerken</button>
          <button class="delete-btn" data-delete="${t.id}">✕</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
      openTreatmentModal(treatmentsCache.find(t => t.id == b.dataset.edit))));
    list.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Deze behandeling verwijderen?')) return;
      await api('/admin/treatments/' + b.dataset.delete, { method: 'DELETE' });
      loadTreatmentsAdmin();
    }));
  }

  document.getElementById('newTreatmentBtn').addEventListener('click', () => openTreatmentModal(null));

  function openTreatmentModal(t) {
    const isNew = !t;
    const modalBox = document.getElementById('modalBox');
    modalBox.innerHTML = `
      <h3>${isNew ? 'Behandeling toevoegen' : 'Behandeling bewerken'}</h3>
      <div id="modalError"></div>
      <div class="form-group"><label>Naam</label><input type="text" id="tName" value="${t ? escapeAttr(t.name) : ''}"></div>
      <div class="form-group"><label>Beschrijving</label><textarea id="tDesc" rows="2">${t ? escapeHtml(t.description || '') : ''}</textarea></div>
      <div class="form-group"><label>Prijs (&euro;)</label><input type="number" step="0.01" id="tPrice" value="${t ? t.price : ''}"></div>
      <div class="form-group"><label>Duur (minuten)</label><input type="number" id="tDuration" value="${t ? t.duration_minutes : ''}"></div>
      <div class="form-group"><label><input type="checkbox" id="tPractice" ${!t || t.practice_available ? 'checked' : ''}> Beschikbaar in praktijk</label></div>
      <div class="form-group"><label><input type="checkbox" id="tHome" ${t && t.home_available ? 'checked' : ''}> Beschikbaar aan huis</label></div>
      <div class="form-group"><label><input type="checkbox" id="tActive" ${!t || t.active ? 'checked' : ''}> Actief (zichtbaar op website)</label></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modalCancelBtn">Annuleren</button>
        <button class="btn btn-primary" id="modalSaveBtn">Opslaan</button>
      </div>`;
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
    document.getElementById('modalSaveBtn').addEventListener('click', async () => {
      const payload = {
        name: document.getElementById('tName').value.trim(),
        description: document.getElementById('tDesc').value.trim(),
        price: parseFloat(document.getElementById('tPrice').value),
        duration_minutes: parseInt(document.getElementById('tDuration').value, 10),
        practice_available: document.getElementById('tPractice').checked,
        home_available: document.getElementById('tHome').checked,
        active: document.getElementById('tActive').checked
      };
      if (!payload.name || !payload.price || !payload.duration_minutes) {
        document.getElementById('modalError').innerHTML = '<div class="alert alert-error">Vul naam, prijs en duur in.</div>';
        return;
      }
      try {
        if (isNew) await api('/admin/treatments', { method: 'POST', body: JSON.stringify(payload) });
        else await api('/admin/treatments/' + t.id, { method: 'PUT', body: JSON.stringify(payload) });
        closeModal();
        loadTreatmentsAdmin();
      } catch (err) {
        document.getElementById('modalError').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
      }
    });
  }

  // ---------- Website ----------
  async function loadWebsiteSettings() {
    try {
      const s = await api('/admin/settings');
      document.getElementById('setBusinessName').value = s.business_name || '';
      document.getElementById('setBusinessPhone').value = s.business_phone || '';
      document.getElementById('setBusinessAddress').value = s.business_address || '';
      document.getElementById('setHeroHeadline').value = s.hero_headline || '';
      document.getElementById('setHeroSubheadline').value = s.hero_subheadline || '';
      document.getElementById('setAboutText').value = s.about_text || '';
    } catch (err) { console.error(err); }
  }

  document.getElementById('saveWebsiteBtn').addEventListener('click', async () => {
    const payload = {
      business_name: document.getElementById('setBusinessName').value.trim(),
      business_phone: document.getElementById('setBusinessPhone').value.trim(),
      business_address: document.getElementById('setBusinessAddress').value.trim(),
      hero_headline: document.getElementById('setHeroHeadline').value.trim(),
      hero_subheadline: document.getElementById('setHeroSubheadline').value.trim(),
      about_text: document.getElementById('setAboutText').value.trim()
    };
    const errorBox = document.getElementById('websiteError');
    try {
      await api('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
      errorBox.innerHTML = '<div class="alert alert-success">Wijzigingen opgeslagen.</div>';
    } catch (err) {
      errorBox.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });

  // ---------- Helpers ----------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

  // ---------- Init: check of al ingelogd ----------
  (async function checkSession() {
    try {
      await refreshCsrf();
      await api('/admin/dashboard');
      showApp();
    } catch (err) {
      showLogin();
    }
  })();
})();
