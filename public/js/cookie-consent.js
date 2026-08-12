(function () {
  const STORAGE_KEY = 'pbp_cookie_consent'; // 'accepted' | 'rejected'
  const GA_ID = 'G-51XPQP53L4';
  let gaLoaded = false;

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* localStorage niet beschikbaar */ }
  }

  function loadAnalytics() {
    if (gaLoaded) return;
    gaLoaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    // anonymize_ip: extra voorzorg, ook al anonimiseert Google IP's tegenwoordig standaard
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  function removeBanner() {
    const el = document.getElementById('cookieBanner');
    if (el) el.remove();
  }

  function showBanner() {
    if (document.getElementById('cookieBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'cookieBanner';
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookiemelding');
    banner.innerHTML = `
      <div class="cookie-banner-inner">
        <p>Deze website gebruikt alleen cookies die noodzakelijk zijn voor het maken van een afspraak. Daarnaast willen we, met jouw toestemming, graag Google Analytics gebruiken om te zien hoe de website wordt gebruikt. Lees meer in onze <a href="${location.pathname.includes('privacy.html') ? '' : 'privacy.html'}#cookies">privacyverklaring</a>.</p>
        <div class="cookie-banner-buttons">
          <button type="button" id="cookieRejectBtn" class="btn btn-secondary">Alleen noodzakelijke</button>
          <button type="button" id="cookieAcceptBtn" class="btn btn-primary">Alles accepteren</button>
        </div>
      </div>`;
    document.body.appendChild(banner);

    document.getElementById('cookieAcceptBtn').addEventListener('click', () => {
      setConsent('accepted');
      loadAnalytics();
      removeBanner();
    });
    document.getElementById('cookieRejectBtn').addEventListener('click', () => {
      setConsent('rejected');
      removeBanner();
    });
  }

  // Beschikbaar maken zodat de "Cookie-instellingen"-link in de footer de banner opnieuw kan tonen
  window.openCookieSettings = function () {
    showBanner();
  };

  function init() {
    const consent = getConsent();
    if (consent === 'accepted') {
      loadAnalytics();
    } else if (consent !== 'rejected') {
      showBanner();
    }
    // bij 'rejected' doen we niets: geen Analytics, geen banner
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
