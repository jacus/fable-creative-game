'use strict';
// Interface language (pl / en). Loaded first, before the other scripts.
// Order: ?lang=pl|en in the URL → remembered choice → browser language (pl) → English.
const LANG_KEY = 'smocza-poczta-lang';
const LANG = (() => {
  const ok = v => (v === 'pl' || v === 'en' ? v : null);
  let v = null;
  try { v = ok(new URLSearchParams(location.search).get('lang')); } catch (e) {}
  if (v) return v;
  try { v = ok(localStorage.getItem(LANG_KEY)); } catch (e) {}
  if (v) return v;
  return String(navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'en';
})();
const tr = (pl, en) => (LANG === 'en' ? en : pl);

function setLang(l) {
  if (l === LANG) return;
  let saved = false;
  try { localStorage.setItem(LANG_KEY, l); saved = localStorage.getItem(LANG_KEY) === l; } catch (e) {}
  try {
    const u = new URL(location.href);
    if (saved) u.searchParams.delete('lang'); else u.searchParams.set('lang', l);
    history.replaceState(history.state, '', u.href);
  } catch (e) {}
  location.reload();
}

(function applyLang() {
  document.documentElement.lang = LANG;
  document.title = tr('Smocza Poczta – Wyspy Snów', 'Dragon Mail – Dream Islands');
  if (LANG === 'en') {
    document.querySelectorAll('[data-en]').forEach(el => { el.innerHTML = el.dataset.en; });
    document.querySelectorAll('[data-en-aria]').forEach(el => el.setAttribute('aria-label', el.dataset.enAria));
  }
  document.querySelectorAll('#uiLang button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === LANG);
    b.addEventListener('click', () => { b.blur(); setLang(b.dataset.v); });
  });
})();
