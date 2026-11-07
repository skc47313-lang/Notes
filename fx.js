/* Notes Bazar - fx.js
   Two OPTIONAL extras (both off until the person switches them on, in Settings / Appearance / Admin > Appearance):
     - Nebula theme  : deep purple glass look with a floating glass blob
     - Scroll effects: reveal-on-scroll, colour that changes while scrolling, parallax, card tilt, floating header
   State is kept in localStorage (nb_nebula, nb_scrollfx). The <head> script in index.html applies the classes
   before the first paint, so there is no flash. */
(function () {
    'use strict';
    var root = document.documentElement;
    function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
    var HUES = [262, 215, 160, 24, 330, 275, 195], NEB = [262, 285, 310, 245, 275, 325, 255];       // one colour family per section while scrolling
    var on = { nebula: root.classList.contains('nebula'), scrollfx: root.classList.contains('scrollfx') };
    var io = null, mo = null, secIo = null, ticking = false, bound = false, prevDark = null, singleN = 0;

    function isOn(k) { return !!on[k]; }
    function $(id) { return document.getElementById(id); }

    /* ---------- background layer ---------- */
    function ensureBg() {
        if ($('fxBg')) return;
        var d = document.createElement('div');
        d.id = 'fxBg'; d.setAttribute('aria-hidden', 'true');
        d.innerHTML = '<div class="fx-wash"></div><div class="fx-stars"></div><div class="fx-orb o1"></div><div class="fx-orb o2"></div><div class="fx-orb o3"></div><div class="fx-blob"><i></i><i></i></div>' +
            '<svg width="0" height="0" style="position:absolute"><filter id="fxCrumple" x="-10%" y="-10%" width="120%" height="120%">' +
            '<feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="3" seed="7" result="n"/>' +
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="46" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';
        document.body.insertBefore(d, document.body.firstChild);
        var p = document.createElement('div'); p.id = 'fxProg'; p.setAttribute('aria-hidden', 'true'); document.body.appendChild(p);
        var t = document.createElement('button'); t.id = 'fxTop'; t.type = 'button'; t.setAttribute('aria-label', 'Back to top');
        t.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="bg" cx="22" cy="22" r="19"/><circle class="pr" cx="22" cy="22" r="19" pathLength="100"/></svg><i class="fa-solid fa-arrow-up" aria-hidden="true"></i>';
        t.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }; document.body.appendChild(t);
    }

    /* ---------- scroll state ----------
       Variables are written ONLY on the few elements that use them (not on <html>), so the browser does not
       re-calculate the style of the whole page on every scroll frame. */
    var cache = {};
    function el1(id, sel) { var e = cache[id]; if (!e || !e.isConnected) e = cache[id] = (sel ? document.querySelector(sel) : $(id)); return e; }
    var lastSy = -1, lastTop = null, lastScr = null;
    function frame() {
        ticking = false;
        var y = window.pageYOffset || root.scrollTop || 0;
        if (y === lastSy) return; lastSy = y;
        var max = Math.max(1, (root.scrollHeight || 1) - window.innerHeight), sp = Math.min(1, Math.max(0, y / max)).toFixed(4);
        var bg = el1('bg'), pr = el1('prog'), tp = el1('top'), hero = el1('hero', '#heroSlider');
        if (bg) { bg.style.setProperty('--sy', y.toFixed(0)); bg.style.setProperty('--sp', sp); }
        if (pr) pr.style.setProperty('--sp', sp);
        if (tp) tp.style.setProperty('--sp', sp);
        if (hero && y < 900) { hero.style.setProperty('--hp', Math.min(1, y / 520).toFixed(3)); hero.style.setProperty('--sy', y.toFixed(0)); }
        var wm = document.querySelectorAll('.watermark-book'); for (var i = 0; i < wm.length; i++) wm[i].style.setProperty('--sy', y.toFixed(0));
        var scr = on.scrollfx && y > 40, top = on.scrollfx && y > 420;
        if (scr !== lastScr) { lastScr = scr; root.classList.toggle('fx-scrolled', scr); }
        if (top !== lastTop) { lastTop = top; root.classList.toggle('fx-top', top); }
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

    /* ---------- reveal on scroll ----------
       Every card gets a direction from where it really sits in its grid (works for 1, 2, 3 or 4 columns, PC and mobile):
         first column -> slides in from the LEFT, last column -> from the RIGHT, middle columns -> rise from the BOTTOM.
       Single blocks (sections, banners, headings) alternate between "rise from the bottom" and "soft fade-in". */
    var SEL = 'main:not(.hidden) > section, main:not(.hidden) > div, main:not(.hidden) .sec-title, main:not(.hidden) > section > p, ' +
        'main:not(.hidden) .hm-grid > *, main:not(.hidden) [id$="Grid"] > *, main:not(.hidden) #homeResults > *, ' +
        'main:not(.hidden) #homeQuickSection > h3, main:not(.hidden) #homeQuickSection .qo-grid > .qo-card, main:not(.hidden) #homeQuickSection .qo-extra-in > .qo-card, ' +
        'main:not(.hidden) #homeBrowseSection .grid > *, main:not(.hidden) #homeDl > *, main:not(.hidden) #homeRecent > *, main:not(.hidden) #homeFav > *';
    var TILT = '.hm-grid > *, [id$="Grid"] > *, #homeResults > *';
    var GRID_CHILD = '.qo-grid, .hm-grid, [id$="Grid"], #homeResults, #homeBrowseSection > .grid';
    var DIRS = ['fx-l', 'fx-rt', 'fx-fade'];
    function splitTitle(el) {
        var sp = el.querySelector(':scope > span:not([class*="rounded"])');
        if (!sp || sp.children.length || !sp.textContent.trim() || sp.__sp) return;
        sp.__sp = 1; sp.classList.add('fx-split');
        sp.innerHTML = sp.textContent.trim().split(/\s+/).map(function (w, i) { return '<span class="fx-w"><i style="--wi:' + i + '">' + w.replace(/[<>&]/g, '') + '</i></span>'; }).join(' ');
    }
    function hasGridChild(el) {            // a wrapper whose cards animate on their own must not animate twice
        var c = el.children;
        for (var i = 0; i < c.length; i++) if (c[i].matches && c[i].matches(GRID_CHILD)) return true;
        return false;
    }
    function scan() {
        if (!on.scrollfx) return;
        var list = document.querySelectorAll(SEL);
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el.__fx || el.id === 'heroSlider' || el.classList.contains('qo-extra')) continue;
            if (el.matches('main > section, main > div') && hasGridChild(el)) { el.__fx = 3; continue; }
            el.__fx = 1;
            if (el.classList.contains('sec-title')) { splitTitle(el); el.classList.add('fx-title'); }
            else el.classList.add('fx-r');
            io.observe(el);
        }
    }
    function gridOf(el) {
        var p = el.parentElement;
        while (p && p !== document.body) {
            var d = getComputedStyle(p).display;
            if (d === 'grid' || d === 'inline-grid') return p;
            if (d !== 'contents') return null;
            p = p.parentElement;
        }
        return null;
    }
    function pickDir(el) {
        var g = gridOf(el);
        if (g) {
            var cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length;
            if (cols >= 2) {
                var gr = g.getBoundingClientRect(), r = el.getBoundingClientRect();
                var col = Math.floor((r.left + r.width / 2 - gr.left) / (gr.width / cols));
                col = Math.max(0, Math.min(cols - 1, col));
                if (col === 0) return 'fx-l';
                if (col === cols - 1) return 'fx-rt';
                return '';                                   // middle -> from the bottom (the default state)
            }
        }
        return (singleN++ % 2) ? 'fx-fade' : '';             // single block: fade-in / rise, alternately
    }
    function reveal(el, i) {
        if (el.classList.contains('fx-title')) { el.classList.add('in'); return; }
        var dir = pickDir(el);
        el.style.setProperty('--d', Math.min(i, 8) * 70 + 'ms');
        el.classList.remove.apply(el.classList, DIRS);
        el.style.transition = 'none';                         // jump to the right start position without animating...
        if (dir) el.classList.add(dir);
        void el.offsetWidth;
        el.style.transition = '';                             // ...then animate to the final position
        el.classList.add('in');
        setTimeout(function () {                              // give transforms back to the page's own hover effects
            el.classList.remove('fx-r', 'in', 'fx-l', 'fx-rt', 'fx-fade'); el.style.removeProperty('--d'); el.__fx = 2;
            if (el.matches && el.matches(TILT)) el.classList.add('fx-tilt');
        }, 1700);
    }
    function mkObservers() {
        if (io) return;
        io = new IntersectionObserver(function (es) {
            var vis = es.filter(function (e) { return e.isIntersecting; });
            if (!vis.length) return;
            vis.sort(function (a, b) { var A = a.boundingClientRect, B = b.boundingClientRect; return (Math.round(A.top / 40) - Math.round(B.top / 40)) || (A.left - B.left); });
            vis.forEach(function (e, i) { io.unobserve(e.target); reveal(e.target, i); });
        }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
        secIo = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
                if (e.isIntersecting && e.intersectionRatio > 0.2) {
                    var k = Array.prototype.indexOf.call(e.target.parentElement ? e.target.parentElement.children : [], e.target);
                    var H = on.nebula ? NEB : HUES; root.style.setProperty('--fxh', H[Math.max(0, k) % H.length]);
                }
            });
        }, { threshold: [0.2, 0.5] });
        var t = null;
        mo = new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { scan(); watchSections(); }, 120); });
    }
    function watchSections() {
        var s = document.querySelectorAll('main:not(.hidden) > section, main:not(.hidden) > div');
        for (var i = 0; i < s.length; i++) if (!s[i].__fxs) { s[i].__fxs = 1; secIo.observe(s[i]); }
    }

    /* ---------- card tilt ---------- */
    function tilt(e) {
        if (!on.scrollfx || e.pointerType === 'touch') return;
        var c = e.target.closest && e.target.closest('.fx-tilt'); if (!c) return;
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg'); c.style.setProperty('--rx', (-y * 9).toFixed(2) + 'deg'); c.style.setProperty('--ty', '-4px');
    }
    function untilt(e) {
        var c = e.target.closest && e.target.closest('.fx-tilt'); if (!c) return;
        if (e.relatedTarget && c.contains(e.relatedTarget)) return;
        c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); c.style.removeProperty('--ty');
    }

    function startScroll() {
        ensureBg(); mkObservers();
        if (!bound) {
            bound = true;
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onScroll, { passive: true });
            document.addEventListener('pointermove', tilt, { passive: true });
            document.addEventListener('pointerout', untilt, { passive: true });
        }
        frame(); scan(); watchSections();
        var m = document.querySelector('main'); if (m && m.parentElement) mo.observe(m.parentElement, { childList: true, subtree: true });
        setTimeout(function () { scan(); watchSections(); }, 600);
    }
    function stopScroll() {
        if (mo) mo.disconnect();
        var l = document.querySelectorAll('.fx-r, .fx-tilt, .fx-title');
        for (var i = 0; i < l.length; i++) { l[i].classList.remove('fx-r', 'in', 'fx-l', 'fx-rt', 'fx-fade', 'fx-tilt'); l[i].style.removeProperty('--d'); l[i].__fx = 0; }
        root.classList.remove('fx-top');
        root.classList.remove('fx-scrolled'); lastScr = lastTop = null; lastSy = -1;
    }

    /* ---------- Nebula: it is a dark look, so it switches dark mode on and puts it back when turned off ---------- */
    function nebulaOn() {
        if (prevDark === null) prevDark = ls('nb_nebula_prev') || (root.classList.contains('dark') ? '1' : '0');
        ls('nb_nebula_prev', prevDark);
        root.classList.add('nebula', 'dark'); ensureBg();
        try { var m = document.querySelector('meta[name="theme-color"]'); if (m) { m.__old = m.__old || m.content; m.content = '#0b0420'; } } catch (e) {}
    }
    function nebulaOff() {
        root.classList.remove('nebula');
        var was = ls('nb_nebula_prev'); prevDark = null; ls('nb_nebula_prev', null);
        if (was === '0') { root.classList.remove('dark'); }
        try { var m = document.querySelector('meta[name="theme-color"]'); if (m && m.__old) m.content = m.__old; } catch (e) {}
    }
    /* Nebula is a dark look: if something else drops the dark class, put it back.
       Picking "Light" on purpose (setMode) turns Nebula off instead. */
    var wantLight = false;
    new MutationObserver(function () {
        if (on.nebula && !root.classList.contains('dark')) { if (wantLight) set('nebula', false, true); else root.classList.add('dark'); }
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
    function hookMode() {
        if (window.__fxHook || typeof window.setMode !== 'function') return; window.__fxHook = 1;
        var o = window.setMode;
        window.setMode = function (m) { wantLight = (m === 'light'); try { return o.apply(this, arguments); } finally { wantLight = false; } };
    }

    function sync() {
        [['togNebula', 'nebula'], ['togScroll', 'scrollfx'], ['tmNebula', 'nebula'], ['tmScroll', 'scrollfx'], ['admNebula', 'nebula'], ['admScroll', 'scrollfx']].forEach(function (p) {
            var b = $(p[0]); if (b) { b.setAttribute('aria-checked', on[p[1]] ? 'true' : 'false'); if (b.classList.contains('tm-tile')) b.classList.toggle('on', !!on[p[1]]); }
        });
    }
    function set(k, v, quiet) {
        v = !!v; on[k] = v;
        if (k === 'nebula') { ls('nb_nebula', v ? '1' : '0'); if (v) nebulaOn(); else if (!quiet || true) nebulaOff(); }
        else { ls('nb_scrollfx', v ? '1' : '0'); root.classList.toggle('scrollfx', v); if (v) { if (root.classList.contains('lite')) { root.classList.remove('lite'); } startScroll(); } else stopScroll(); }
        if (k === 'nebula' && v && !bound) { frame(); }
        if (k === 'nebula' && v) { startBg(); }
        sync();
        if (!quiet && window.NB && NB.toast) { try { NB.toast((k === 'nebula' ? 'Nebula theme ' : 'Scroll animations ') + (v ? 'on' : 'off')); } catch (e) {} }
    }
    function startBg() { ensureBg(); if (!bound) { window.addEventListener('scroll', onScroll, { passive: true }); bound = true; document.addEventListener('pointermove', tilt, { passive: true }); document.addEventListener('pointerout', untilt, { passive: true }); } frame(); }

    /* ---------- admin card (Admin > Appearance) ---------- */
    function adminCard() {
        function row(id, k, t, d) { return '<div class="a-row"><div class="tx"><b>' + t + '</b><span>' + d + '</span></div><button type="button" id="' + id + '" class="a-toggle" role="switch" aria-checked="' + (!!on[k]) + '" aria-label="' + t + '" onclick="NBFx.toggle(\'' + k + '\')"></button></div>'; }
        return '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> Extra looks (optional)</h3></div>' +
            row('admNebula', 'nebula', 'Nebula purple theme', 'Deep purple glass look with a floating 3D glass blob. Applies to this device and the admin dashboard.') +
            row('admScroll', 'scrollfx', 'Scroll animations', 'Cards reveal as you scroll, background colour changes by section, floating header, card tilt.') + '</section>';
    }

    window.NBFx = {
        isOn: isOn,
        toggle: function (k) { set(k, !on[k]); },
        set: function (k, v) { set(k, v); },
        adminCard: adminCard, sync: sync
    };

    /* ---------- boot ---------- */
    function boot() {
        hookMode(); setTimeout(hookMode, 800);
        if (on.nebula) { nebulaOn(); startBg(); }
        if (on.scrollfx) startScroll();
        sync();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#settingsBtn, [onclick*="settingsModal"], [onclick*="themeModal"]')) setTimeout(sync, 50); });
})();
