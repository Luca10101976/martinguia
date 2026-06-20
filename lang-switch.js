(function () {
  var STORAGE_KEY = 'mg_lang_pref';

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function getStoredLanguage() {
    try {
      var fromStorage = window.localStorage.getItem(STORAGE_KEY);
      if (fromStorage === 'cz' || fromStorage === 'es') return fromStorage;
    } catch (e) {}
    var fromCookie = readCookie(STORAGE_KEY);
    if (fromCookie === 'cz' || fromCookie === 'es') return fromCookie;
    return '';
  }

  function persistLanguage(lang) {
    if (lang !== 'cz' && lang !== 'es') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {}
    document.cookie = STORAGE_KEY + '=' + encodeURIComponent(lang) + '; path=/; max-age=31536000; SameSite=Lax';
  }

  function inferBrowserLanguage() {
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    var first = String(langs[0] || '').toLowerCase();
    return first.indexOf('es') === 0 ? 'es' : 'cz';
  }

  function getFilename() {
    var path = window.location.pathname;
    var file = path.split('/').pop();
    if (!file || file === '') return 'index.html';
    if (file.indexOf('.') === -1) return file + '.html';
    return file;
  }

  var filename = getFilename();
  var isEs = filename.endsWith('-es.html');
  var currentLang = isEs ? 'es' : 'cz';
  var czFile = isEs ? filename.replace(/-es\.html$/, '.html') : filename;
  var esFile = isEs ? filename : filename.replace(/\.html$/, '-es.html');
  var storedLang = getStoredLanguage();
  var preferredLang = storedLang || inferBrowserLanguage();

  // First visit behavior:
  // - If user has no saved preference and browser is Spanish,
  //   move from CZ page to matching ES page.
  if (!storedLang && preferredLang === 'es' && currentLang === 'cz') {
    window.location.replace(esFile);
    return;
  }

  var czLink = document.querySelector('[data-lang-switch="cz"]');
  var esLink = document.querySelector('[data-lang-switch="es"]');

  if (czLink) {
    czLink.href = czFile;
    czLink.setAttribute('aria-label', 'Česky');
    czLink.addEventListener('click', function () { persistLanguage('cz'); });
    if (!isEs) {
      czLink.classList.add('font-semibold', 'text-green-700');
      czLink.setAttribute('aria-current', 'page');
    }
  }

  if (esLink) {
    esLink.href = esFile;
    esLink.setAttribute('aria-label', 'Español');
    esLink.addEventListener('click', function () { persistLanguage('es'); });
    if (isEs) {
      esLink.classList.add('font-semibold', 'text-green-700');
      esLink.setAttribute('aria-current', 'page');
    }
  }
})();
