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
    var io = null, mo = null, secIo = null, ticking = false, bound = false, prevDark = null;

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

    /* ---------- scroll state (only writes CSS variables, so it stays smooth) ---------- */
    var lastY = 0, vel = 0, raf2 = 0;
    function frame() {
        ticking = false;
        var y = window.pageYOffset || root.scrollTop || 0, max = Math.max(1, (root.scrollHeight || 1) - window.innerHeight);
        root.style.setProperty('--sy', y.toFixed(0));
        root.style.setProperty('--sp', Math.min(1, Math.max(0, y / max)).toFixed(4));
        root.style.setProperty('--hp', Math.min(1, y / 520).toFixed(3));
        root.classList.toggle('fx-scrolled', on.scrollfx && y > 40);
        root.classList.toggle('fx-top', on.scrollfx && y > 420);
        if (on.scrollfx) { vel += (y - lastY); if (!raf2) raf2 = requestAnimationFrame(decay); }
        lastY = y;
    }
    function decay() {                        /* scroll speed -> a small skew on the card grids, eases back to 0 */
        vel *= 0.86; var v = Math.max(-1, Math.min(1, vel / 60)) * 2.2;
        root.style.setProperty('--vel', v.toFixed(3));
        if (Math.abs(vel) > 0.4) raf2 = requestAnimationFrame(decay); else { vel = 0; raf2 = 0; root.style.setProperty('--vel', '0'); }
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

    /* ---------- reveal on scroll ---------- */
    var SEL = 'main:not(.hidden) > section, main:not(.hidden) > div, main:not(.hidden) .sec-title, main:not(.hidden) .hm-grid > *, ' +
        'main:not(.hidden) [id$="Grid"] > *, main:not(.hidden) #homeResults > *, main:not(.hidden) #homeQuickSection > div > *';
    var TILT = '.hm-grid > *, [id$="Grid"] > *, #homeResults > *';
    function splitTitle(el) {
        var sp = el.querySelector(':scope > span:not([class*="rounded"])');
        if (!sp || sp.children.length || !sp.textContent.trim() || sp.__sp) return;
        sp.__sp = 1; sp.classList.add('fx-split');
        sp.innerHTML = sp.textContent.trim().split(/\s+/).map(function (w, i) { return '<span class="fx-w"><i style="--wi:' + i + '">' + w.replace(/[<>&]/g, '') + '</i></span>'; }).join(' ');
    }
    function scan() {
        if (!on.scrollfx) return;
        var list = document.querySelectorAll(SEL);
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el.__fx || el.id === 'heroSlider') continue;
            el.__fx = 1;
            var par = el.parentElement, idx = par ? Array.prototype.indexOf.call(par.children, el) : 0;
            if (el.classList.contains('sec-title')) { splitTitle(el); el.classList.add('fx-title'); }
            else {
                el.classList.add('fx-r');
                if (par && /grid/.test(par.className + par.id)) { el.style.setProperty('--d', (Math.min(idx % 4, 3) * 90) + 'ms'); el.classList.add(idx % 3 === 0 ? 'fx-l' : (idx % 3 === 2 ? 'fx-rt' : 'fx-z')); }
            }
            io.observe(el);
        }
    }
    function mkObservers() {
        if (io) return;
        io = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
                if (!e.isIntersecting) return;
                var el = e.target; io.unobserve(el); el.classList.add('in');
                if (el.classList.contains('fx-title')) return;
                setTimeout(function () {            // give transforms back to the page's own hover effects
                    el.classList.remove('fx-r', 'in', 'fx-l', 'fx-rt', 'fx-z'); el.style.removeProperty('--d'); el.__fx = 2;
                    if (el.matches && el.matches(TILT)) el.classList.add('fx-tilt');
                }, 1900);
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
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
        var l = document.querySelectorAll('.fx-r, .fx-tilt');
        for (var i = 0; i < l.length; i++) { l[i].classList.remove('fx-r', 'in', 'fx-l', 'fx-rt', 'fx-z', 'fx-tilt'); l[i].__fx = 0; }
        root.classList.remove('fx-top');
        root.classList.remove('fx-scrolled');
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
