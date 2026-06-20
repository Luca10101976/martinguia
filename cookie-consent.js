(function () {
  var storageKey = 'martinguia_cookie_consent_v1';
  try {
    if (localStorage.getItem(storageKey)) return;
  } catch (e) {
    return;
  }

  var bar = document.createElement('div');
  bar.id = 'cookie-consent';
  bar.style.position = 'fixed';
  bar.style.left = '16px';
  bar.style.right = '16px';
  bar.style.bottom = '16px';
  bar.style.zIndex = '9999';
  bar.style.background = '#111827';
  bar.style.color = '#f3f4f6';
  bar.style.borderRadius = '14px';
  bar.style.padding = '14px 16px';
  bar.style.boxShadow = '0 10px 25px rgba(0,0,0,0.35)';
  bar.style.maxWidth = '760px';
  bar.style.margin = '0 auto';

  bar.innerHTML = '' +
    '<div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">' +
      '<p style="margin:0;line-height:1.45;font-size:14px;max-width:560px">' +
        'Tento web používá technické cookies pro správné fungování a anonymní měření návštěvnosti. ' +
        '<a href="cookies.html" style="color:#86efac;text-decoration:underline">Zásady cookies</a>.' +
      '</p>' +
      '<button id="cookie-consent-accept" type="button" style="background:#15803d;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-weight:700;cursor:pointer">Rozumím</button>' +
    '</div>';

  document.body.appendChild(bar);

  var btn = document.getElementById('cookie-consent-accept');
  if (!btn) return;
  btn.addEventListener('click', function () {
    try {
      localStorage.setItem(storageKey, 'accepted');
    } catch (e) {}
    bar.remove();
  });
})();
