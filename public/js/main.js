(function () {
  const state = {
    step: 1,
    treatments: [],
    selectedTreatment: null,
    location: null, // 'praktijk' | 'huis'
    date: null,
    slots: [],
    selectedSlot: null,
    csrfToken: null
  };

  const stepContent = document.getElementById('bookingStepContent');
  const bookingNav = document.getElementById('bookingNav');
  const stepsIndicator = document.getElementById('stepsIndicator');

  // ---------- Hamburger menu ----------
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mainNav = document.getElementById('mainNav');
  hamburgerBtn.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    hamburgerBtn.setAttribute('aria-expanded', isOpen);
  });
  mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    mainNav.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  }));

  // ---------- Data laden ----------
  async function loadInitialData() {
    try {
      const [treatments, settings, csrf] = await Promise.all([
        fetch('/api/treatments').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/csrf-token').then(r => r.json())
      ]);
      state.treatments = treatments;
      state.csrfToken = csrf.csrfToken;
      applySettings(settings);
      renderTreatmentsGrid();
      renderStep();
    } catch (err) {
      console.error(err);
      document.getElementById('treatmentsGrid').innerHTML =
        '<p style="text-align:center;grid-column:1/-1;">Kon behandelingen niet laden. Probeer de pagina te herladen.</p>';
    }
  }

  function applySettings(s) {
    if (s.business_name) {
      document.title = document.title.replace('Pedicure Bianca Passmann', s.business_name);
      document.getElementById('footerBusinessName').textContent = s.business_name;
    }
    if (s.hero_headline) document.getElementById('heroHeadline').textContent = s.hero_headline;
    if (s.hero_subheadline) document.getElementById('heroSubheadline').textContent = s.hero_subheadline;
    if (s.about_text) document.getElementById('aboutText').textContent = s.about_text;
    if (s.business_address) document.getElementById('contactAddress').textContent = s.business_address;
    if (s.business_phone) {
      document.getElementById('contactPhoneDisplay').textContent = s.business_phone;
      const digits = s.business_phone.replace(/[^0-9]/g, '');
      document.getElementById('callLink').href = 'tel:' + digits;
      document.getElementById('waLink').href = 'https://wa.me/31' + digits.replace(/^0/, '');
    }
  }

  function renderTreatmentsGrid() {
    const grid = document.getElementById('treatmentsGrid');
    if (state.treatments.length === 0) {
      grid.innerHTML = '<p style="text-align:center;grid-column:1/-1;">Er zijn op dit moment geen behandelingen beschikbaar.</p>';
      return;
    }
    const treatmentIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3c-1.7 0-2.6 1.9-2.3 3.6.2 1.1.9 1.9.9 3 0 1.6-1.6 2.5-1.6 4.9 0 3 2.1 5 4.6 5 2.9 0 3.9-2 3.9-4.3 0-2.9-1.4-3.9-1.9-6.1C11.1 6.8 11 3 8 3z"/></svg>`;
    const clockIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
    grid.innerHTML = state.treatments.map(t => `
      <div class="card">
        <div class="card-icon">${treatmentIcon}</div>
        <h3>${escapeHtml(t.name)}</h3>
        <p>${escapeHtml(t.description || '')}</p>
        <p class="price">&euro; ${Number(t.price).toFixed(2)}</p>
        <p class="meta">${clockIcon}${t.duration_minutes} minuten ${t.home_available ? '&middot; ook aan huis' : ''}</p>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ---------- Wizard rendering ----------
  function setStep(n) {
    state.step = n;
    [...stepsIndicator.children].forEach((el, i) => el.classList.toggle('active', i === n - 1));
    renderStep();
    document.getElementById('afspraak').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderStep() {
    bookingNav.innerHTML = '';
    if (state.step === 1) renderTreatmentStep();
    else if (state.step === 2) renderLocationStep();
    else if (state.step === 3) renderDateStep();
    else if (state.step === 4) renderTimeStep();
    else if (state.step === 5) renderDetailsStep();
  }

  function renderTreatmentStep() {
    stepContent.innerHTML = `
      <h3>Kies een behandeling</h3>
      <div class="option-list">
        ${state.treatments.map(t => `
          <button class="option-btn" data-id="${t.id}">
            <span>${escapeHtml(t.name)} <br><small>${t.duration_minutes} min</small></span>
            <span class="price">&euro; ${Number(t.price).toFixed(2)}</span>
          </button>
        `).join('')}
      </div>`;
    stepContent.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedTreatment = state.treatments.find(t => t.id == btn.dataset.id);
        state.location = null; state.date = null; state.selectedSlot = null;
        setStep(2);
      });
    });
  }

  function renderLocationStep() {
    const t = state.selectedTreatment;
    const options = [];
    if (t.practice_available) options.push({ key: 'praktijk', label: 'In de praktijk', desc: 'Hazelaarstraat 3, Lutten' });
    if (t.home_available) options.push({ key: 'huis', label: 'Aan huis', desc: 'Bianca komt bij je langs' });

    stepContent.innerHTML = `
      <h3>Praktijk of aan huis?</h3>
      <div class="option-list">
        ${options.map(o => `
          <button class="option-btn" data-key="${o.key}">
            <span>${o.label}<br><small>${o.desc}</small></span>
          </button>`).join('')}
      </div>`;
    stepContent.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => { state.location = btn.dataset.key; setStep(3); });
    });
    renderBackButton(1);
  }

  function renderDateStep() {
    const today = new Date().toISOString().slice(0, 10);
    stepContent.innerHTML = `
      <h3>Kies een datum</h3>
      <div class="form-group date-picker">
        <label for="dateInput">Datum</label>
        <input type="date" id="dateInput" min="${today}" value="${state.date || ''}">
      </div>`;
    document.getElementById('dateInput').addEventListener('change', (e) => {
      state.date = e.target.value;
    });
    bookingNav.innerHTML = '';
    renderBackButton(2);
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary';
    nextBtn.textContent = 'Bekijk tijden';
    nextBtn.addEventListener('click', () => {
      if (!state.date) { alert('Kies eerst een datum.'); return; }
      setStep(4);
    });
    bookingNav.appendChild(nextBtn);
  }

  async function renderTimeStep() {
    stepContent.innerHTML = `<h3>Kies een tijd</h3><p>Beschikbare tijden laden…</p>`;
    renderBackButton(3);
    try {
      const res = await fetch(`/api/available-slots?date=${state.date}&treatment_id=${state.selectedTreatment.id}`);
      const data = await res.json();
      state.slots = data.slots || [];
      if (state.slots.length === 0) {
        stepContent.innerHTML = `
          <h3>Kies een tijd</h3>
          <div class="alert alert-error">Geen beschikbare tijden op deze datum. Kies een andere datum.</div>`;
        return;
      }
      stepContent.innerHTML = `
        <h3>Kies een tijd</h3>
        <p class="section-intro" style="margin-bottom:16px;">${formatDateNL(state.date)}</p>
        <div class="slot-grid">
          ${state.slots.map(s => `<button class="slot-btn" data-start="${s.start}">${s.start}</button>`).join('')}
        </div>`;
      stepContent.querySelectorAll('.slot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          stepContent.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.selectedSlot = state.slots.find(s => s.start === btn.dataset.start);
          const nextBtn = document.getElementById('toDetailsBtn');
          if (nextBtn) nextBtn.disabled = false;
        });
      });
    } catch (err) {
      stepContent.innerHTML = `<div class="alert alert-error">Kon beschikbare tijden niet laden. Probeer het opnieuw.</div>`;
    }
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary';
    nextBtn.id = 'toDetailsBtn';
    nextBtn.textContent = 'Volgende';
    nextBtn.disabled = true;
    nextBtn.addEventListener('click', () => {
      if (!state.selectedSlot) { alert('Kies eerst een tijd.'); return; }
      setStep(5);
    });
    bookingNav.appendChild(nextBtn);
  }

  function renderDetailsStep() {
    stepContent.innerHTML = `
      <h3>Jouw gegevens</h3>
      <table class="summary-table">
        <tr><td>Behandeling</td><td>${escapeHtml(state.selectedTreatment.name)}</td></tr>
        <tr><td>Locatie</td><td>${state.location === 'huis' ? 'Aan huis' : 'In de praktijk'}</td></tr>
        <tr><td>Datum</td><td>${formatDateNL(state.date)}</td></tr>
        <tr><td>Tijd</td><td>${state.selectedSlot.start}</td></tr>
      </table>
      <div id="detailsError"></div>
      <div class="form-group"><label for="nameInput">Naam *</label><input type="text" id="nameInput" required></div>
      <div class="form-group"><label for="phoneInput">Telefoonnummer *</label><input type="tel" id="phoneInput" required></div>
      <div class="form-group"><label for="emailInput">E-mailadres (optioneel)</label><input type="email" id="emailInput"></div>
      <div class="form-group"><label for="noteInput">Opmerking (optioneel)</label><textarea id="noteInput" rows="3"></textarea></div>
    `;
    renderBackButton(4);
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Afspraak bevestigen';
    submitBtn.addEventListener('click', submitBooking);
    bookingNav.appendChild(submitBtn);
  }

  async function submitBooking() {
    const name = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    const email = document.getElementById('emailInput').value.trim();
    const note = document.getElementById('noteInput').value.trim();
    const errorBox = document.getElementById('detailsError');
    errorBox.innerHTML = '';

    if (!name || !phone) {
      errorBox.innerHTML = '<div class="alert alert-error">Vul je naam en telefoonnummer in.</div>';
      return;
    }

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': state.csrfToken },
        body: JSON.stringify({
          customer_name: name, phone, email, note,
          treatment_id: state.selectedTreatment.id,
          location_type: state.location,
          date: state.date,
          start_time: state.selectedSlot.start
        })
      });
      const data = await res.json();
      if (!res.ok) {
        errorBox.innerHTML = `<div class="alert alert-error">${escapeHtml(data.error || 'Er is iets misgegaan.')}</div>`;
        if (res.status === 409) {
          // Slot bleek al bezet: ga terug naar tijdstap en herlaad
          setTimeout(() => setStep(4), 1500);
        }
        return;
      }
      renderSuccess(data);
    } catch (err) {
      errorBox.innerHTML = '<div class="alert alert-error">Kon de afspraak niet versturen. Controleer je verbinding en probeer opnieuw.</div>';
    }
  }

  function renderSuccess(data) {
    bookingNav.innerHTML = '';
    stepContent.innerHTML = `
      <div class="success-box">
        <div class="success-icon">✓</div>
        <h3>Je afspraak is succesvol aangevraagd</h3>
        <table class="summary-table">
          <tr><td>Behandeling</td><td>${escapeHtml(data.summary.treatment)}</td></tr>
          <tr><td>Locatie</td><td>${data.summary.location === 'huis' ? 'Aan huis' : 'In de praktijk'}</td></tr>
          <tr><td>Datum</td><td>${formatDateNL(data.summary.date)}</td></tr>
          <tr><td>Tijd</td><td>${data.summary.time}</td></tr>
          <tr><td>Naam</td><td>${escapeHtml(data.summary.name)}</td></tr>
        </table>
        <p>Je ontvangt bericht zodra de afspraak is bevestigd.</p>
        <button class="btn btn-secondary" id="newBookingBtn">Nieuwe afspraak plannen</button>
      </div>`;
    document.getElementById('newBookingBtn').addEventListener('click', () => {
      state.selectedTreatment = null; state.location = null; state.date = null; state.selectedSlot = null;
      setStep(1);
    });
  }

  function renderBackButton(target) {
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.textContent = 'Terug';
    backBtn.addEventListener('click', () => setStep(target));
    bookingNav.appendChild(backBtn);
  }

  function formatDateNL(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  loadInitialData();
})();
