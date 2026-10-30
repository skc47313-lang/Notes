/* Notes Bazar Premium interactions. Kept separate from existing application logic. */
(function () {
  'use strict';
  var KEY = 'nb_desktop_mode';
  function enabled() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function apply(value) {
    var root = document.documentElement;
    root.classList.toggle('nb-desktop-mode', !!value);
    root.setAttribute('data-desktop-mode', value ? 'on' : 'off');
    try { localStorage.setItem(KEY, value ? '1' : '0'); } catch (e) {}
    var toggle = document.querySelector('#nbPf [data-go="desktop"]');
    if (toggle) {
      toggle.setAttribute('aria-pressed', value ? 'true' : 'false');
      toggle.classList.toggle('is-on', !!value);
    }
    document.dispatchEvent(new CustomEvent('nb:desktop-mode-change', { detail: { enabled: !!value } }));
  }
  function toggle() { apply(!enabled()); }
  window.NBPremium = {
    isDesktopMode: enabled,
    setDesktopMode: apply,
    toggleDesktopMode: toggle
  };
  try { apply(enabled()); } catch (e) {}
  function arrangeHomeSections() {
    var home = document.getElementById('homeView');
    if (!home) return;
    var children = Array.prototype.slice.call(home.children);
    if (children.length < 4) return;
    var hero = children[0];
    var plan = document.getElementById('nbPlan');
    var quick = children.find(function (el) { return !!el.querySelector(':scope > h3.inline-flex'); });
    var search = document.getElementById('homeSearchSection');
    var latest = document.getElementById('homeLatestSection');
    var trending = document.getElementById('homeTrendingSection');
    var browse = children.find(function (el) {
      var h = el.querySelector(':scope > h3.sec-title span');
      return h && h.textContent.trim().toLowerCase() === 'browse by class';
    });
    var priority = [hero, plan, quick, trending, latest, browse, search].filter(function (el, i, arr) {
      return el && el.parentElement === home && arr.indexOf(el) === i;
    });
    var rest = Array.prototype.slice.call(home.children).filter(function (el) { return priority.indexOf(el) === -1; });
    priority.concat(rest).forEach(function (el) { home.appendChild(el); });
  }
  document.addEventListener('DOMContentLoaded', function () {
    apply(enabled());
    window.setTimeout(arrangeHomeSections, 350);
  });
})();
