/* Notes Bazar - motion.js
   1) image blur-up   2) page transition   3) count-up numbers   4) press feedback + ripple
   5) bottom-sheet modals (mobile)   6) Animation mode (Auto / Full / Lite) + automatic Lite on slow phones.
   Nothing here changes what the site does - it only adds polish, and every part switches itself off in Lite mode. */
(function () {
    'use strict';
    var root = document.documentElement;
    function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
    function $(id) { return document.getElementById(id); }
    var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    function animOK() {
        if (root.classList.contains('lite') || root.classList.contains('no-anim')) return false;
        return !reduce || root.classList.contains('force-anim');
    }
    function toast(m, ms) { try { if (window.nbToast) window.nbToast(m, ms || 3200); } catch (e) {} }

    /* ================= 6) Animation mode ================= */
    function isLowDevice() {
        var nv = navigator;
        return !!((nv.deviceMemory && nv.deviceMemory <= 2) || (nv.hardwareConcurrency && nv.hardwareConcurrency <= 2) || (nv.connection && nv.connection.saveData) || reduce);
    }
    function curMode() { var a = ls('nb_anim'); return a === '0' ? 'lite' : a === '1' ? 'full' : 'auto'; }
    function syncMode() {
        var m = curMode(), seg = $('nbAnimSeg');
        if (seg) [].forEach.call(seg.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute("data-nbm") === m ? 'true' : 'false'); });
        var h = $('nbAnimHint');
        if (h) h.textContent = m === 'auto' ? (root.classList.contains('lite') ? 'Auto: this phone looked slow, so Lite is ON for smoother scrolling.' : 'Auto: full animations on this device. Switches to Lite by itself if it gets slow.')
            : m === 'full' ? 'Full: all animations, always.' : 'Lite: fewer animations, fastest and best for slow phones or low battery.';
        var old = $('togAnim'); if (old) old.setAttribute('aria-checked', animOK() ? 'true' : 'false');
    }
    function setMode(m, quiet) {
        if (m === 'full') { ls('nb_anim', '1'); ls('nb_autolite', null); root.classList.remove('no-anim', 'lite'); root.classList.add('force-anim'); }
        else if (m === 'lite') { ls('nb_anim', '0'); root.classList.remove('force-anim'); root.classList.add('no-anim', 'lite'); }
        else { ls('nb_anim', null); ls('nb_autolite', null); root.classList.remove('no-anim', 'force-anim', 'lite'); if (isLowDevice()) root.classList.add('lite'); probed = 0; }
        syncMode();
        if (!quiet) toast(m === 'auto' ? 'Animation mode: Auto' : m === 'full' ? 'Animation mode: Full' : 'Animation mode: Lite');
    }
    /* Automatic Lite: while the person scrolls, watch the real frame rate. If it stays low, switch Lite on and remember it. */
    var probed = 0, samples = [], lastT = 0, probing = false, probeEnd = 0;
    function probeTick(t) {
        if (!probing) return;
        if (lastT) { var d = t - lastT; if (d < 200) samples.push(d); }
        lastT = t;
        if (t < probeEnd && samples.length < 90) { requestAnimationFrame(probeTick); return; }
        probing = false; lastT = 0;
        if (samples.length >= 40) {
            var avg = samples.reduce(function (a, b) { return a + b; }, 0) / samples.length;
            if (avg > 30) {                       // under ~33 fps while scrolling
                if (++probed >= 2 && curMode() === 'auto' && !root.classList.contains('lite')) {
                    root.classList.add('lite'); ls('nb_autolite', '1'); syncMode();
                    toast('Slow device detected: Lite mode is ON for smoother scrolling. Change it in Settings > Animation mode.', 5200);
                }
            } else probed = 0;
        }
        samples = [];
    }
    var scrollT = 0;
    function onScrollProbe() {
        if (probing || curMode() !== 'auto' || root.classList.contains('lite') || document.visibilityState !== 'visible') return;
        var n = Date.now(); if (n - scrollT < 2500) return; scrollT = n;
        probing = true; samples = []; lastT = 0; probeEnd = performance.now() + 1800; requestAnimationFrame(probeTick);
    }

    /* ================= 1) Image blur-up ================= */
    function blurUp(img) {
        if (img.__bu || !animOK()) return; img.__bu = 1;
        if (img.closest('#splash, .no-bu') || (img.complete && img.naturalWidth)) return;
        var w = +img.getAttribute('width') || 0; if (w && w < 64) return;
        img.classList.add('nb-bu');
        function done() { img.classList.add('nb-bu-go'); requestAnimationFrame(function () { img.classList.remove('nb-bu'); }); setTimeout(function () { img.classList.remove('nb-bu-go'); }, 900); }
        img.addEventListener('load', done, { once: true }); img.addEventListener('error', function () { img.classList.remove('nb-bu'); }, { once: true });
    }

    /* ================= 3) Count-up ================= */
    var CU = '#notesCount, #booksCount, #pyqCount, #homeDlCount, #homeFavCount, .a-stat .vl, .nb-stat > span';
    var NUM = /^(\d[\d,]*(?:\.\d+)?)\s*([kK+]?)$/;
    var cuIo = null, seen = {};
    function numNode(el) {
        for (var n = el.lastChild; n; n = n.previousSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return NUM.test(n.nodeValue.trim()) ? n : null;
        return null;
    }
    function runCount(el) {
        var node = numNode(el); if (!node) return;
        var txt = node.nodeValue.trim(), m = NUM.exec(txt), end = parseFloat(m[1].replace(/,/g, '')), suf = m[2], dec = (m[1].split('.')[1] || '').length, comma = m[1].indexOf(',') >= 0;
        var adm = el.closest('.a-stat'), sk = adm ? 'a:' + adm.className : '', from = 0, prev = sk && seen[sk];   // admin numbers that update keep counting from the old value
        if (end < 2 || !animOK()) return;
        if (prev && prev.txt !== txt && prev.val < end && prev.val > 0) from = prev.val;
        if (sk) seen[sk] = { txt: txt, val: end };
        function fmt(v) { var s = v.toFixed(dec); if (comma) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); } return s + suf; }
        var t0 = performance.now(), dur = Math.min(1100, 500 + Math.log10(end + 1) * 200);
        node.nodeValue = fmt(from);
        (function step(t) {
            var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
            node.nodeValue = p >= 1 ? txt : fmt(from + (end - from) * e);
            if (p < 1 && node.parentNode) requestAnimationFrame(step);
        })(t0);
    }
    function countScan() {
        if (!animOK() || !('IntersectionObserver' in window)) return;
        if (!cuIo) cuIo = new IntersectionObserver(function (es) {
            es.forEach(function (e) { if (e.isIntersecting) { cuIo.unobserve(e.target); runCount(e.target); } });
        }, { threshold: 0.4 });
        var l = document.querySelectorAll(CU);
        for (var i = 0; i < l.length; i++) { var el = l[i]; if (el.__cu) continue; if (!numNode(el)) continue; el.__cu = 1; cuIo.observe(el); }
    }

    /* ================= 2) Page transition ================= */
    var lastView = 'homeView';
    function watchViews() {
        [].forEach.call(document.querySelectorAll('main[id$="View"]'), function (m) {
            if (m.__pgw) return; m.__pgw = 1;
            new MutationObserver(function (ms) {
                var was = ms[0].oldValue || '';
                if (was.indexOf('hidden') < 0 || m.classList.contains('hidden')) return;
                var back = m.id === 'homeView';
                lastView = m.id;
                if (!animOK() || document.visibilityState !== 'visible') return;
                m.classList.remove('nb-pg-r', 'nb-pg-l'); void m.offsetWidth;
                m.classList.add(back ? 'nb-pg-l' : 'nb-pg-r');
                setTimeout(function () { m.classList.remove('nb-pg-r', 'nb-pg-l'); }, 520);
            }).observe(m, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        });
    }

    /* ================= 4) Press feedback + ripple ================= */
    var PRESS = 'button, a.dynamic-btn, .qo-card, .class-tile, .hover-rgb-glow, .chip, .nbm-i, .a-stat, [role="button"]';
    var NO_PRESS = '.nb-switch, .a-toggle, input, select, textarea, #fxTop, .hs-dots *, .nb-seg button, [data-nopress]';
    var RIP = '.dynamic-btn, .hs-b1, .hs-b2, .chip, .qo-more, .hm-more, .nb-aiask, .class-tile';
    var pEl = null, pTimer = 0, pX = 0, pY = 0;
    function release() {
        clearTimeout(pTimer);
        if (!pEl) return; var el = pEl; pEl = null;
        if (el.classList.contains('nb-press')) { el.classList.remove('nb-press'); el.classList.add('nb-rel'); setTimeout(function () { el.classList.remove('nb-rel'); }, 380); }
    }
    function ripple(el, x, y) {
        var cs = getComputedStyle(el);
        if (cs.position === 'static') el.style.position = 'relative';
        if (cs.overflow === 'visible') el.style.overflow = 'hidden';
        var r = el.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.1, d = document.createElement('span');
        d.className = 'nb-rip'; d.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (x - r.left - s / 2) + 'px;top:' + (y - r.top - s / 2) + 'px';
        el.appendChild(d); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 650);
    }
    document.addEventListener('pointerdown', function (e) {
        if (!animOK() || (e.pointerType === 'mouse' && e.button !== 0)) return;
        var t = e.target.closest && e.target.closest(PRESS); if (!t || t.matches(NO_PRESS) || t.disabled) return;
        pX = e.clientX; pY = e.clientY; pEl = t;
        var rp = t.closest(RIP); if (rp && !rp.disabled && rp === t) ripple(rp, e.clientX, e.clientY);
        clearTimeout(pTimer);
        pTimer = setTimeout(function () { if (pEl) { pEl.classList.remove('nb-rel'); pEl.classList.add('nb-press'); } }, 70);   // short delay: scrolling never triggers it
    }, { passive: true });
    document.addEventListener('pointermove', function (e) { if (pEl && (Math.abs(e.clientX - pX) > 8 || Math.abs(e.clientY - pY) > 8)) { clearTimeout(pTimer); if (pEl.classList.contains('nb-press')) release(); else pEl = null; } }, { passive: true });
    ['pointerup', 'pointercancel', 'dragstart', 'contextmenu'].forEach(function (n) { document.addEventListener(n, release, { passive: true }); });

    /* ================= 5) Modals: pop on PC, bottom sheet on phones ================= */
    var SKIP = { mobileMenuModal: 1, aiModal: 1, adminDashboardModal: 1, downloadsModal: 1, previewModal: 1, safePreviewModal: 1 };
    function prepModals() {
        var l = document.querySelectorAll('[id$="Modal"].fixed:not(.nb-modal)');
        for (var i = 0; i < l.length; i++) {
            var m = l[i]; if (SKIP[m.id] || !m.firstElementChild) continue;
            if (!/items-center/.test(m.className) || /align-items:\s*stretch/.test(m.getAttribute('style') || '')) continue;
            m.classList.add('nb-modal', 'nb-sheet');
        }
    }
    /* swipe down on the top strip of a sheet to close it */
    var sh = null, sy = 0, dy = 0;
    document.addEventListener('touchstart', function (e) {
        if (window.innerWidth > 640 || !animOK()) return;
        var p = e.target.closest && e.target.closest('.nb-sheet > :first-child'); if (!p) return;
        var r = p.getBoundingClientRect(), y = e.touches[0].clientY; if (y - r.top > 44) return;
        sh = p; sy = y; dy = 0; p.classList.add('nb-drag');
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
        if (!sh) return; dy = Math.max(0, e.touches[0].clientY - sy); sh.style.transform = 'translate3d(0,' + dy + 'px,0)';
    }, { passive: true });
    function endDrag() {
        if (!sh) return; var p = sh, far = dy > 110; sh = null; p.classList.remove('nb-drag');
        if (far) {
            p.style.transition = 'transform .22s ease-in'; p.style.transform = 'translate3d(0,100%,0)';
            setTimeout(function () { var m = p.parentElement; p.style.transition = ''; p.style.transform = ''; if (m && m.id && window.closeModal) { try { window.closeModal(m.id); } catch (e) { m.classList.add('hidden'); } } }, 200);
        } else { p.style.transition = 'transform .25s cubic-bezier(.22,1,.36,1)'; p.style.transform = ''; setTimeout(function () { p.style.transition = ''; }, 260); }
    }
    document.addEventListener('touchend', endDrag, { passive: true }); document.addEventListener('touchcancel', endDrag, { passive: true });

    /* ================= scanning ================= */
    function scanImgs() { var l = document.querySelectorAll('img:not([data-nbbu])'); for (var i = 0; i < l.length; i++) { l[i].setAttribute('data-nbbu', '1'); blurUp(l[i]); } }
    var t = 0;
    function scan() { scanImgs(); countScan(); prepModals(); watchViews(); }
    function boot() {
        if (ls('nb_anim') === '0') root.classList.add('lite');            // "Lite" = no-anim + lite
        syncMode(); scan();
        new MutationObserver(function () { clearTimeout(t); t = setTimeout(scan, 160); }).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('scroll', onScrollProbe, { passive: true });
        document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#settingsBtn, [onclick*="settingsModal"]')) setTimeout(syncMode, 60); });
    }
    window.NBMotion = { setMode: setMode, mode: curMode, sync: syncMode, countScan: countScan };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
