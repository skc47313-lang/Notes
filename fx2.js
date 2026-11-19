/* Notes Bazar - fx2.js  (modern motion layer, ON by default; styles are in fx2.css)
   1) reveal on scroll (left column from the left, right column from the right, middle + single blocks rise)
   2) hero text arrives line by line on every slide   3) header drops in after the intro
   4) thin scroll-progress bar                        5) soft 3D card tilt on PC
   It never touches data or logic. It stays completely off in Lite mode / no-anim / reduced-motion (unless Full is forced),
   and when the older optional "Scroll animations" are switched on (those have their own reveal). */
(function () {
    'use strict';
    var root = document.documentElement;
    var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var hasIO = 'IntersectionObserver' in window;
    var fine = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);

    function animOK() {
        if (root.classList.contains('lite') || root.classList.contains('no-anim')) return false;
        return !reduce || root.classList.contains('force-anim');
    }
    function revealOK() { return hasIO && animOK() && !root.classList.contains('scrollfx'); }
    function sync() { var want = animOK(), has = root.classList.contains('fx2-ok'); if (want && !has) root.classList.add('fx2-ok'); else if (!want && has) root.classList.remove('fx2-ok'); }

    /* ---------- when is the intro splash over? ---------- */
    function whenSplashDone(cb) {
        var t0 = Date.now();
        (function check() {
            var s = document.getElementById('splash');
            var gone = !s || !s.isConnected || s.classList.contains('hide') || s.classList.contains('hidden');
            if (!gone) { var cs = getComputedStyle(s); gone = cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0; }
            if (gone || Date.now() - t0 > 6500) cb(); else setTimeout(check, 200);
        })();
    }

    /* ================= 1) reveal on scroll ================= */
    var io = null, mo = null, scanT = 0, SAFE = 0;
    var GRIDS = '#homeView .qo-grid, #homeView .nbp-tiles, #homeBrowseSection > div.grid, #homeView .hm-grid';
    var BLOCKS = '#nbPlan, #homeSearchSection';
    var TITLES = '#homeView .sec-title, #homeQuickSection > h3';

    function cols(grid) {
        try { var n = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(function (x) { return x && x !== 'none'; }).length; return n || 1; } catch (e) { return 1; }
    }
    var Q = [];                                                        // collected first (reads only), written afterwards (no layout thrash)
    function want(el, dir, delay) { if (el && !el.__fx2 && el.offsetParent !== null) Q.push([el, dir, delay]); }
    function flush() {
        for (var i = 0; i < Q.length; i++) {
            var el = Q[i][0], dir = Q[i][1], delay = Q[i][2];
            el.__fx2 = 1; el.classList.add('fx2-r');
            if (dir) el.classList.add(dir);
            if (delay) el.style.setProperty('--fx2-d', delay + 'ms');
            io.observe(el);
        }
        Q.length = 0;
    }
    function scan() {
        if (!revealOK() || !io) return;
        var i, j, k;
        var grids = document.querySelectorAll(GRIDS);
        for (i = 0; i < grids.length; i++) {
            var g = grids[i], n = cols(g), kids = g.children;
            for (j = 0; j < kids.length; j++) {
                var c = j % n, dir = n === 1 ? '' : (c === 0 ? 'fx2-l' : (c === n - 1 ? 'fx2-rt' : ''));
                if (n === 2 && c === 1) dir = 'fx2-rt';
                want(kids[j], dir, Math.min(c, 4) * 70);
            }
        }
        var bl = document.querySelectorAll(BLOCKS); for (k = 0; k < bl.length; k++) want(bl[k], 'fx2-fade', 0);
        var tt = document.querySelectorAll(TITLES); for (k = 0; k < tt.length; k++) want(tt[k], 'fx2-l', 0);
        flush();
        clearTimeout(SAFE); SAFE = setTimeout(rescue, 3500);
    }
    function sched() { clearTimeout(scanT); scanT = setTimeout(scan, 160); }
    function done(el) {
        setTimeout(function () {                                           // leave the element exactly as the site made it
            el.classList.remove('fx2-r', 'in', 'fx2-l', 'fx2-rt', 'fx2-fade'); el.style.removeProperty('--fx2-d');
        }, 1300);
    }
    /* safety net: if something never got observed properly, show it anyway */
    function rescue() {
        var p = document.querySelectorAll('.fx2-r:not(.in)');
        for (var i = 0; i < p.length; i++) { var r = p[i].getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) { p[i].classList.add('in'); done(p[i]); } }
    }
    function startReveal() {
        if (!revealOK() || io) { if (io) scan(); return; }
        io = new IntersectionObserver(function (ents) {
            ents.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); e.target.classList.add('in'); done(e.target); } });
        }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
        var hv = document.getElementById('homeView');
        if (hv && 'MutationObserver' in window) {
            mo = new MutationObserver(sched);
            mo.observe(hv, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }
        scan();
    }

    /* ================= 2) hero text, line by line ================= */
    var heroIo = null, heroMo = null;
    function heroInit() {
        var h = document.getElementById('heroSlider');
        if (!h || !animOK() || !hasIO) return;
        if (heroIo) heroIo.disconnect();
        var slides = h.querySelectorAll('.hs-slide');
        if (!slides.length) return;
        heroIo = new IntersectionObserver(function (ents) {
            ents.forEach(function (e) { e.target.classList.toggle('fx2-on', e.isIntersecting && e.intersectionRatio >= 0.55); });
        }, { threshold: [0, 0.55, 0.9] });
        [].forEach.call(slides, function (s) {
            [].forEach.call(s.children, function (c, i) { c.style.setProperty('--i', i); });
            heroIo.observe(s);
        });
        h.classList.add('fx2-hero');
        setTimeout(function () {                                           // safety: a slide that is on screen must never stay hidden
            [].forEach.call(h.querySelectorAll('.hs-slide:not(.fx2-on)'), function (s) { var r = s.getBoundingClientRect(); if (r.left >= -2 && r.right <= innerWidth + 2 && r.bottom > 0 && r.top < innerHeight) s.classList.add('fx2-on'); });
        }, 2200);
        if (!heroMo && 'MutationObserver' in window) {                     // the admin can rebuild the slides: watch and redo
            var tr = h.querySelector('.hs-track');
            if (tr) { heroMo = new MutationObserver(function () { clearTimeout(heroInit.t); heroInit.t = setTimeout(heroInit, 120); }); heroMo.observe(tr, { childList: true }); }
        }
    }

    /* ================= 4) scroll progress ================= */
    var bar = null, pt = 0;
    function progInit() {
        if (bar) return;
        bar = document.createElement('div'); bar.id = 'fx2Prog'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
        window.addEventListener('scroll', function () { if (!pt) pt = requestAnimationFrame(progDraw); }, { passive: true });
        progDraw();
    }
    function progDraw() {
        pt = 0; if (!bar) return;
        var d = document.documentElement, max = d.scrollHeight - innerHeight, y = window.pageYOffset || d.scrollTop || 0;
        var p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
        bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
        bar.classList.toggle('on', y > 60);
    }

    /* ================= 5) card tilt (mouse only) ================= */
    var TILT = '.qo-card, .class-tile, .nbp-tile, #notesGrid > *, #booksGrid > *, #pyqGrid > *, #homeLatest > *';
    var tiltEl = null, tiltRaf = 0, tx = 0, ty = 0, MAXD = 5;
    function tiltDraw() {
        tiltRaf = 0; if (!tiltEl) return;
        var r = tiltEl.getBoundingClientRect(); if (!r.width) return;
        var nx = Math.max(-1, Math.min(1, ((tx - r.left) / r.width - 0.5) * 2)), ny = Math.max(-1, Math.min(1, ((ty - r.top) / r.height - 0.5) * 2));
        var m = Math.min(1, Math.hypot(nx, ny));
        tiltEl.style.rotate = m < 0.02 ? '' : (-ny).toFixed(3) + ' ' + nx.toFixed(3) + ' 0 ' + (m * MAXD).toFixed(2) + 'deg';
    }
    function tiltReset(el) {
        if (!el) return;
        var from = el.style.rotate; el.style.rotate = '';
        try { if (from && el.animate) el.animate([{ rotate: from }, { rotate: '0 0 1 0deg' }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' }); } catch (e) {}
    }
    function tiltInit() {
        if (!fine) return;
        document.addEventListener('pointermove', function (e) {
            if (e.pointerType !== 'mouse' || !animOK() || root.classList.contains('scrollfx')) return;
            var c = e.target && e.target.closest ? e.target.closest(TILT) : null;
            if (c && c.querySelector('.fx-tilt')) c = null;
            if (c !== tiltEl) {
                tiltReset(tiltEl); tiltEl = c;
                if (c && c.parentElement) c.parentElement.classList.add('fx2-persp');
            }
            if (!c) return;
            tx = e.clientX; ty = e.clientY;
            if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltDraw);
        }, { passive: true });
        root.addEventListener('mouseleave', function () { tiltReset(tiltEl); tiltEl = null; });
        window.addEventListener('blur', function () { tiltReset(tiltEl); tiltEl = null; });
    }

    /* ================= start ================= */
    function boot() {
        sync();
        var lastDark = root.classList.contains('dark'), lastLay = root.getAttribute('data-layout'), xfT = 0;
        if (window.MutationObserver) new MutationObserver(function () {   // Lite / Full switched while the page is open
            var dk = root.classList.contains('dark'), ly = root.getAttribute('data-layout');
            if ((dk !== lastDark || ly !== lastLay) && root.classList.contains('fx2-go') && animOK()) {   // theme changed after load: fade the colours instead of snapping
                root.classList.add('fx2-xf'); clearTimeout(xfT); xfT = setTimeout(function () { root.classList.remove('fx2-xf'); }, 420);
            }
            lastDark = dk; lastLay = ly;
            var was = root.classList.contains('fx2-ok'); sync();
            if (!was && root.classList.contains('fx2-ok') && root.classList.contains('fx2-go')) { startReveal(); heroInit(); }
        }).observe(root, { attributes: true, attributeFilter: ['class', 'data-layout'] });
        progInit(); tiltInit();
        whenSplashDone(function () {
            root.classList.add('fx2-go');
            startReveal(); heroInit();
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
