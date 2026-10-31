/* =====================================================================
   Notes Bazar – extras.js
   Accounts (User ID + password), cross-device sync, profile + photo,
   study plan / exam countdown, scientific calculator, tests, downloads
   history, notifications, class filter and menu glue.
   Loaded as a normal deferred script AFTER app.js.
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var DAY = 864e5;
    var $ = function (id) { return document.getElementById(id); };

    /* ---------- tiny helpers ---------- */
    var LSX = NB.ls = {
        get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
        set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
        del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
        raw: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    };
    NB.toast = function (m, ms) { if (window.nbToast) window.nbToast(m, ms); };
    NB.pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    NB.dayKey = function (d) { d = d || new Date(); return d.getFullYear() + '-' + NB.pad(d.getMonth() + 1) + '-' + NB.pad(d.getDate()); };
    NB.mk = function (html) { var t = document.createElement('div'); t.innerHTML = html.trim(); return t.firstChild; };
    NB.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;

    /* ---------- overlay manager (own dialogs) ---------- */
    var openSet = {};
    function lockScroll() { document.body.style.overflow = Object.keys(openSet).length ? 'hidden' : ''; }
    NB.open = function (id) { var m = $(id); if (!m) return; m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); openSet[id] = 1; lockScroll(); };
    NB.close = function (id) { var m = $(id); if (!m) return; m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); delete openSet[id]; lockScroll(); if (NB.onClose && NB.onClose[id]) NB.onClose[id](); };
    NB.isOpen = function (id) { var m = $(id); return !!(m && m.classList.contains('open')); };
    NB.onClose = {};
    NB.anyOpen = function () { return Object.keys(openSet).length > 0; };
    NB.noClose = {};   // dialogs that must not be dismissed with Esc / backdrop (first-run)
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var ids = Object.keys(openSet); if (!ids.length) return;
        var top = ids[ids.length - 1]; if (!NB.noClose[top]) NB.close(top);
    });
    document.addEventListener('mousedown', function (e) {
        var t = e.target;
        if (t && t.classList && t.classList.contains('nbo') && t.classList.contains('open') && !NB.noClose[t.id]) NB.close(t.id);
    });
    function closeSiteMenu() { try { if (window.closeModal) window.closeModal('mobileMenuModal'); } catch (e) {} }
    NB.closeSiteMenu = closeSiteMenu;

    /* ---------- profile (stored on this device; synced when signed in) ---------- */
    var PKEY = 'nb_profile', AKEY = 'nb_acct';
    NB.profile = function () {
        var p = LSX.get(PKEY, null);
        if (p && typeof p.name === 'string' && /^Class (?:[1-9]|1[0-2])$/.test(p.cls)) {
            if (p.photo && !PHOTO_RE.test(p.photo)) p.photo = '';
            return p;
        }
        return null;
    };
    NB.cleanName = function (s) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30); };
    NB.setProfile = function (p) { LSX.set(PKEY, p); };
    NB.account = function () { return LSX.get(AKEY, null); };
    NB.loggedIn = function () { return !!NB.account(); };

    /* avatar = photo when available, otherwise the first letter of the name */
    NB.setAvatar = function (el, p) {
        if (!el) return;
        var l = el.querySelector('.nb-l');
        if (!l) { l = document.createElement('span'); l.className = 'nb-l'; el.insertBefore(l, el.firstChild); }
        if (p && p.photo && PHOTO_RE.test(p.photo)) { el.style.backgroundImage = 'url("' + p.photo + '")'; el.classList.add('has-photo'); l.textContent = ''; }
        else {
            el.style.backgroundImage = ''; el.classList.remove('has-photo');
            var a = Array.from((p && p.name) || ''); l.textContent = a.length ? a[0].toUpperCase() : '\uD83D\uDC64';
        }
    };

    /* choose a photo -> resize / move / zoom / rotate editor -> small square JPEG (about 8-20 KB) */
    NB.readPhoto = function (file) {
        return new Promise(function (res, rej) {
            if (!file || !/^image\//.test(file.type)) { rej(new Error('Please choose an image file.')); return; }
            if (file.size > 12 * 1024 * 1024) { rej(new Error('That photo is too large. Choose one under 12 MB.')); return; }
            var rd = new FileReader();
            rd.onerror = function () { rej(new Error('Could not read that photo.')); };
            rd.onload = function () {
                var img = new Image();
                img.onerror = function () { rej(new Error('That image format is not supported.')); };
                img.onload = function () { NB.cropPhoto(img).then(res, rej); };
                img.src = rd.result;
            };
            rd.readAsDataURL(file);
        });
    };
    /* rejects with an empty message when the person cancels (callers ignore empty messages) */
    NB.cropPhoto = function (img) {
        return new Promise(function (res, rej) {
            var old = document.getElementById('nbCrop'); if (old) { NB.close('nbCrop'); }
            var V = Math.max(200, Math.min(280, window.innerWidth - 72)), OUT = 240, done = false;
            var src = document.createElement('canvas'); src.width = img.naturalWidth || img.width; src.height = img.naturalHeight || img.height;
            src.getContext('2d').drawImage(img, 0, 0);
            var zoom = 1, cx = 0, cy = 0;
            var m = NB.mk('<div class="nbo nbc" id="nbCrop" aria-hidden="true"><div class="nbo-card nbc-card" role="dialog" aria-modal="true" aria-label="Adjust profile photo">' +
                '<h3 class="nbo-h">Adjust your photo</h3><p class="nbo-sub">Drag to move, use the slider to resize</p>' +
                '<div class="nbc-stage" id="nbcStage" style="width:' + V + 'px;height:' + V + 'px"><canvas id="nbcCv" width="' + V + '" height="' + V + '"></canvas><div class="nbc-frame"></div></div>' +
                '<div class="nbc-ctl"><button type="button" class="nbc-ib" id="nbcMinus" aria-label="Zoom out"><i class="fa-solid fa-minus"></i></button>' +
                '<input type="range" id="nbcZoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom">' +
                '<button type="button" class="nbc-ib" id="nbcPlus" aria-label="Zoom in"><i class="fa-solid fa-plus"></i></button>' +
                '<button type="button" class="nbc-ib" id="nbcRot" aria-label="Rotate"><i class="fa-solid fa-rotate-right"></i></button></div>' +
                '<button type="button" class="nbo-save" id="nbcOk">Use this photo</button><button type="button" class="nbo-skip" id="nbcNo">Cancel</button>' +
                '</div></div>');
            document.body.appendChild(m);
            var cv = document.getElementById('nbcCv'), zr = document.getElementById('nbcZoom');
            function scale() { return (V / Math.min(src.width, src.height)) * zoom; }
            function clamp() {
                var s = scale(), mx = Math.max(0, src.width * s / 2 - V / 2), my = Math.max(0, src.height * s / 2 - V / 2);
                cx = Math.max(-mx, Math.min(mx, cx)); cy = Math.max(-my, Math.min(my, cy));
            }
            function paint(c, size) {
                var k = size / V, s = scale(), x = c.getContext('2d');
                x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
                x.imageSmoothingQuality = 'high';
                x.drawImage(src, (V / 2 + cx - src.width * s / 2) * k, (V / 2 + cy - src.height * s / 2) * k, src.width * s * k, src.height * s * k);
            }
            function draw() { clamp(); paint(cv, V); }
            function setZoom(z) { zoom = Math.max(1, Math.min(4, z)); zr.value = zoom; draw(); }
            zr.addEventListener('input', function () { setZoom(+this.value); });
            document.getElementById('nbcMinus').addEventListener('click', function () { setZoom(zoom - 0.25); });
            document.getElementById('nbcPlus').addEventListener('click', function () { setZoom(zoom + 0.25); });
            document.getElementById('nbcRot').addEventListener('click', function () {
                var r = document.createElement('canvas'); r.width = src.height; r.height = src.width;
                var x = r.getContext('2d'); x.translate(r.width / 2, r.height / 2); x.rotate(Math.PI / 2); x.drawImage(src, -src.width / 2, -src.height / 2);
                src = r; cx = 0; cy = 0; draw();
            });
            var st = document.getElementById('nbcStage'), drag = null;
            st.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; try { st.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); });
            st.addEventListener('pointermove', function (e) { if (!drag) return; cx += e.clientX - drag.x; cy += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; draw(); });
            function endDrag() { drag = null; }
            st.addEventListener('pointerup', endDrag); st.addEventListener('pointercancel', endDrag);
            st.addEventListener('wheel', function (e) { e.preventDefault(); setZoom(zoom - e.deltaY * 0.002); }, { passive: false });
            NB.onClose.nbCrop = function () {
                if (!done) { done = true; rej(new Error('')); }
                var n = document.getElementById('nbCrop'); if (n && n.parentNode) n.parentNode.removeChild(n);
                delete NB.onClose.nbCrop;
            };
            document.getElementById('nbcNo').addEventListener('click', function () { NB.close('nbCrop'); });
            document.getElementById('nbcOk').addEventListener('click', function () {
                var o = document.createElement('canvas'); o.width = o.height = OUT; paint(o, OUT);
                var url = o.toDataURL('image/jpeg', 0.85);
                done = true; res(url); NB.close('nbCrop');
            });
            draw(); NB.open('nbCrop');
        });
    };

    /* ---------- activity days + streak (for the study plan) ---------- */
    NB.days = function () { var d = LSX.get('nb_days', []); return Array.isArray(d) ? d : []; };
    NB.markDay = function () {
        var k = NB.dayKey(), d = NB.days();
        if (d.indexOf(k) < 0) { d.push(k); d.sort(); LSX.set('nb_days', d.slice(-400)); }
    };
    NB.streak = function () {
        var set = {}; NB.days().forEach(function (k) { set[k] = 1; });
        var n = 0, d = new Date();
        if (!set[NB.dayKey(d)]) d = new Date(d.getTime() - DAY);
        while (set[NB.dayKey(d)]) { n++; d = new Date(d.getTime() - DAY); }
        return n;
    };

    /* ---------- exam countdown ---------- */
    NB.exam = function () { var e = LSX.get('nb_exam', null); return e && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e : null; };
    NB.daysLeft = function (iso) {
        var p = iso.split('-'), t = new Date(+p[0], +p[1] - 1, +p[2]), n = new Date();
        n = new Date(n.getFullYear(), n.getMonth(), n.getDate());
        return Math.round((t - n) / DAY);
    };

    /* =====================================================================
       Firebase Auth (separate app instance "nbuser" so it never collides
       with the admin session) + REST sync of the personal document.
       ===================================================================== */
    var CFG = {
        apiKey: 'AIzaSyChG_jBGcieowmVVKHdwaiI1zvOwvvPag0',
        authDomain: 'notes-market-d309b.firebaseapp.com',
        databaseURL: 'https://notes-market-d309b-default-rtdb.firebaseio.com',
        projectId: 'notes-market-d309b',
        appId: '1:661796727875:web:f19697629ed298546138f6'
    };
    var FB = 'https://www.gstatic.com/firebasejs/10.8.0/';
    var DOMAIN = '@users.notesbazar.app';
    NB.USER_DOMAIN = DOMAIN;
    NB.FBCFG = CFG;
    var sdkP = null;
    function authSdk() {
        if (!sdkP) {
            sdkP = Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js')]).then(function (m) {
                var a = m[0], au = m[1];
                var app = a.getApps().filter(function (x) { return x.name === 'nbuser'; })[0] || a.initializeApp(CFG, 'nbuser');
                return { auth: au.getAuth(app), au: au };
            });
            sdkP.catch(function () { sdkP = null; });
        }
        return sdkP;
    }
    function emailOf(id) { return id + DOMAIN; }
    NB.validId = function (id) { return /^[a-z0-9][a-z0-9._]{3,19}$/.test(id) && !/^(admin|administrator|root|support|notesbazar)$/.test(id); };

    NB.authError = function (e) {
        var c = (e && e.code) || '', m = (e && e.message) || '';
        if (c === 'auth/email-already-in-use') return 'That User ID is already taken. Try another one.';
        if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Wrong User ID or password.';
        if (c === 'auth/weak-password') return 'Password is too weak. Use at least 6 characters.';
        if (c === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes and try again.';
        if (c === 'auth/network-request-failed') return 'No internet connection. Please check and try again.';
        if (c === 'auth/operation-not-allowed') return 'Email/Password sign-in is not enabled in Firebase Authentication.';
        if (/^Error:/.test(m) || (m && !c)) return m.replace(/^Error:\s*/, '');
        return 'Something went wrong. Please try again.';
    };

    async function tokenAndUid() {
        var s = await authSdk(), u = s.auth.currentUser;
        if (!u) return null;
        return { token: await u.getIdToken(), uid: u.uid };
    }
    async function cloud(method, path, body) {
        var t = await tokenAndUid(); if (!t) throw new Error('Not signed in');
        var r = await fetch(CFG.databaseURL + '/notes_bazar_users/' + t.uid + path + '.json?auth=' + encodeURIComponent(t.token), {
            method: method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined
        });
        if (!r.ok) { var er = new Error('HTTP ' + r.status); er.status = r.status; throw er; }
        return r.json();
    }

    /* ---------- what gets synced ---------- */
    var SYNC = { favs: 'nb_favs', recent: 'nb_recent', seen: 'nb_seen', dl: 'nb_dlhist', days: 'nb_days', exam: 'nb_exam', quiz: 'nb_quiz' };
    var applying = false, pushT = 0;
    function asArr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); }
    function unionArr(a, b) { var s = {}, o = []; asArr(a).concat(asArr(b)).forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }
    function mergeObj(a, b) { var o = {}, k; a = a || {}; b = b || {}; for (k in b) o[k] = b[k]; for (k in a) o[k] = (o[k] && o[k] < a[k]) ? o[k] : a[k]; return o; }
    function snapshot() {
        var o = { updatedAt: Date.now() };
        Object.keys(SYNC).forEach(function (k) { var v = LSX.get(SYNC[k], null); o[k] = v == null ? null : v; });
        return o;
    }
    NB.pushNow = async function () {
        if (!NB.loggedIn()) return;
        try { await cloud('PATCH', '', snapshot()); LSX.set('nb_sync_ts', Date.now()); NB.cloudOk = true; }
        catch (e) { console.warn('sync push failed', e); if (e.status === 401 || e.status === 403) NB.cloudOk = false; }
    };
    NB.schedulePush = function () { if (!NB.loggedIn() || applying) return; clearTimeout(pushT); pushT = setTimeout(NB.pushNow, 1800); };
    /* any change to a synced key on this device is pushed to the account */
    (function () {
        var orig = Storage.prototype.setItem, keys = {}, k;
        for (k in SYNC) keys[SYNC[k]] = 1;
        keys[PKEY] = 1;
        Storage.prototype.setItem = function (key) {
            var r = orig.apply(this, arguments);
            try { if (this === window.localStorage && keys[key] && !applying) { if (key === PKEY) NB.scheduleProfilePush(); else NB.schedulePush(); } } catch (e) {}
            return r;
        };
    })();
    var profT = 0;
    NB.scheduleProfilePush = function () {
        if (!NB.loggedIn() || applying) return;
        clearTimeout(profT);
        profT = setTimeout(async function () {
            var p = NB.profile(); if (!p) return;
            try { await cloud('PUT', '/profile', { name: p.name, cls: p.cls, photo: p.photo || null, userId: p.userId || null }); } catch (e) { console.warn('profile push failed', e); }
        }, 1200);
    };

    function applyCloud(c, mode) {
        if (!c) return;
        applying = true;
        try {
            var favs = mode === 'cloud' ? asArr(c.favs) : unionArr(LSX.get('nb_favs', []), c.favs);
            var rec = mode === 'cloud' ? asArr(c.recent) : unionArr(LSX.get('nb_recent', []), c.recent);
            LSX.set('nb_favs', favs); LSX.set('nb_recent', rec.slice(0, 12));
            LSX.set('nb_seen', mode === 'cloud' ? (c.seen || {}) : mergeObj(LSX.get('nb_seen', {}), c.seen));
            LSX.set('nb_dlhist', mode === 'cloud' ? (c.dl || {}) : mergeObj(LSX.get('nb_dlhist', {}), c.dl));
            var days = mode === 'cloud' ? asArr(c.days) : unionArr(NB.days(), c.days); days.sort(); LSX.set('nb_days', days.slice(-400));
            if (c.exam) LSX.set('nb_exam', c.exam); else if (mode === 'cloud') LSX.del('nb_exam');
            var q = asArr(c.quiz).concat(mode === 'cloud' ? [] : asArr(LSX.get('nb_quiz', [])));
            var sq = {}; q = q.filter(function (x) { if (!x || sq[x.t]) return false; sq[x.t] = 1; return true; }).sort(function (a, b) { return b.t - a.t; });
            LSX.set('nb_quiz', q.slice(0, 30));
            if (c.profile && c.profile.name) {
                var old = NB.profile() || {}, a = NB.account() || {};
                NB.setProfile({ name: NB.cleanName(c.profile.name), cls: /^Class (?:[1-9]|1[0-2])$/.test(c.profile.cls) ? c.profile.cls : (old.cls || 'Class 10'), photo: PHOTO_RE.test(c.profile.photo || '') ? c.profile.photo : (old.photo || ''), userId: c.profile.userId || a.userId || old.userId || '' });
            }
        } finally { applying = false; }
        LSX.set('nb_sync_ts', Date.now());
        if (typeof window.nbApplyRemote === 'function') { try { window.nbApplyRemote(); } catch (e) { console.warn(e); } }
        if (NB.ui && NB.ui.refreshAll) NB.ui.refreshAll();
    }
    NB.pull = async function (mode) {
        if (!NB.loggedIn()) return;
        try {
            var c = await cloud('GET', '');
            NB.cloudOk = true;
            if (c && (mode === 'union' || (c.updatedAt || 0) > (LSX.get('nb_sync_ts', 0) || 0))) applyCloud(c, mode || 'cloud');
            return c;
        } catch (e) { console.warn('sync pull failed', e); if (e.status === 401 || e.status === 403) NB.cloudOk = false; }
    };

    /* ---------- sign up / log in / log out ---------- */
    NB.signup = async function (o) {
        var s = await authSdk();
        var cred = await s.au.createUserWithEmailAndPassword(s.auth, emailOf(o.userId), o.password);
        LSX.set(AKEY, { uid: cred.user.uid, userId: o.userId });
        NB.setProfile({ name: o.name, cls: o.cls, photo: o.photo || '', userId: o.userId });
        NB.markDay();
        try {
            await cloud('PUT', '/profile', { name: o.name, cls: o.cls, photo: o.photo || null, userId: o.userId });
            await NB.pushNow();
        } catch (e) { NB.cloudOk = false; console.warn(e); }
        return cred.user;
    };
    NB.login = async function (userId, password) {
        var s = await authSdk();
        var cred = await s.au.signInWithEmailAndPassword(s.auth, emailOf(userId), password);
        LSX.set(AKEY, { uid: cred.user.uid, userId: userId });
        var c = null;
        try { c = await cloud('GET', ''); NB.cloudOk = true; } catch (e) { NB.cloudOk = false; console.warn(e); }
        if (c && c.profile) applyCloud(c, 'union');
        else if (!NB.profile()) NB.setProfile({ name: userId, cls: 'Class 10', photo: '', userId: userId });
        NB.markDay();
        await NB.pushNow();
        return cred.user;
    };
    var PERSONAL = ['nb_profile', 'nb_acct', 'nb_favs', 'nb_recent', 'nb_seen', 'nb_dlhist', 'nb_days', 'nb_exam', 'nb_quiz', 'nb_sync_ts', 'nb_filters_v1', 'nb_recent_q', 'nb_reported'];
    NB.logout = async function () {
        try { await NB.pushNow(); } catch (e) {}
        try { var s = await authSdk(); await s.au.signOut(s.auth); } catch (e) {}
        applying = true; PERSONAL.forEach(function (k) { LSX.del(k); }); applying = false;
        if (typeof window.nbApplyRemote === 'function') { try { window.nbApplyRemote(); } catch (e) {} }
        if (NB.ui && NB.ui.refreshAll) NB.ui.refreshAll();
    };
    /* when the page opens on a device that was signed in, confirm the session and pull fresh data */
    NB.restoreSession = async function () {
        if (!NB.loggedIn()) return null;
        try {
            var s = await authSdk();
            var u = await new Promise(function (res) { var un = s.au.onAuthStateChanged(s.auth, function (x) { un(); res(x); }); });
            if (!u) { LSX.del(AKEY); return null; }
            await NB.pull('cloud');
            return u;
        } catch (e) { console.warn('restore failed', e); return 'offline'; }
    };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && NB.loggedIn()) NB.pull('cloud'); });
    window.addEventListener('online', function () { if (NB.loggedIn()) NB.pushNow(); });

    /* =====================================================================
       UI: account dialog, profile sheet, exam dialog, welcome pill, study plan
       ===================================================================== */
    var ui = NB.ui = {};
    var CLS_RE = /^Class (?:[1-9]|1[0-2])$/;

    function classChips(box, onPick) {
        box.textContent = '';
        for (var i = 1; i <= 12; i++) (function (n) {
            var b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.dataset.cls = 'Class ' + n;
            b.setAttribute('aria-label', 'Class ' + n); b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', function () { setPressed(box, 'Class ' + n); onPick('Class ' + n); });
            box.appendChild(b);
        })(i);
    }
    function setPressed(box, cls) { Array.prototype.forEach.call(box.children, function (b) { b.setAttribute('aria-pressed', b.dataset.cls === cls ? 'true' : 'false'); }); }

    /* ---------- account dialog (create account / log in) ---------- */
    var A = { mode: 'signup', cls: '', photo: '' };
    function buildAuth() {
        var m = NB.mk('<div class="nbo" id="nbAuth" aria-hidden="true"><div class="nbo-card" role="dialog" aria-modal="true" aria-labelledby="nbaTitle">' +
            '<button type="button" class="nbo-x" id="nbaX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<div class="nba-brand"><svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><use href="#nbLogo"/></svg><b id="nbaTitle">Notes Bazar</b></div>' +
            '<div class="nba-tabs" role="tablist"><button type="button" role="tab" data-m="signup" aria-selected="true">Create account</button><button type="button" role="tab" data-m="login" aria-selected="false">Log in</button></div>' +
            '<p class="nbo-sub" id="nbaSub"></p>' +
            '<form id="nbaForm" novalidate autocomplete="on">' +
            '<div class="nba-photo" data-only="signup"><button type="button" class="nb-av nb-av-lg" id="nbaAv" aria-label="Add profile photo"><i class="fa-solid fa-camera"></i></button><small>Profile photo<br>(optional)</small><input type="file" id="nbaFile" accept="image/*" class="nb-hide"></div>' +
            '<div data-only="signup"><label class="nbo-l" for="nbaName">Full name</label><input id="nbaName" class="nbo-in" type="text" maxlength="30" autocomplete="name" placeholder="Your name"></div>' +
            '<div data-only="signup"><label class="nbo-l">Class</label><div class="nbo-cls" id="nbaCls" role="group" aria-label="Class"></div></div>' +
            '<label class="nbo-l" for="nbaId">User ID</label><input id="nbaId" class="nbo-in" type="text" maxlength="20" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. rahul_10">' +
            '<div class="nba-hint" data-only="signup">4–20 characters: letters, numbers, dot or underscore.</div>' +
            '<label class="nbo-l" for="nbaPw">Password</label><div class="nba-pw"><input id="nbaPw" class="nbo-in" type="password" maxlength="64" autocomplete="new-password" placeholder="At least 6 characters"><button type="button" id="nbaEye" aria-label="Show or hide password"><i class="fa-solid fa-eye"></i></button></div>' +
            '<div id="nbaErr" class="nbo-err" role="alert"></div>' +
            '<button type="submit" id="nbaGo" class="nbo-save">Create account</button>' +
            '</form>' +
            '<button type="button" class="nbo-skip" id="nbaSkip">Continue without an account</button>' +
            '<p class="nbo-note"><i class="fa-solid fa-cloud"></i> Your saved items, download history, exam date and test scores are stored in your account, so you can see them on any phone after logging in. Never share your password.</p>' +
            '</div></div>');
        document.body.appendChild(m);
        classChips($('nbaCls'), function (c) { A.cls = c; $('nbaErr').textContent = ''; });
        m.querySelectorAll('.nba-tabs button').forEach(function (b) { b.addEventListener('click', function () { authMode(b.dataset.m); }); });
        $('nbaAv').addEventListener('click', function () { $('nbaFile').click(); });
        $('nbaFile').addEventListener('change', function () {
            var f = this.files && this.files[0]; this.value = '';
            NB.readPhoto(f).then(function (d) { A.photo = d; var av = $('nbaAv'); av.style.backgroundImage = 'url("' + d + '")'; av.classList.add('has-photo'); av.innerHTML = ''; })
                .catch(function (e) { $('nbaErr').textContent = e.message; });
        });
        $('nbaEye').addEventListener('click', function () {
            var i = $('nbaPw'), show = i.type === 'password'; i.type = show ? 'text' : 'password';
            this.innerHTML = '<i class="fa-solid ' + (show ? 'fa-eye-slash' : 'fa-eye') + '"></i>';
        });
        $('nbaForm').addEventListener('submit', submitAuth);
        $('nbaX').addEventListener('click', function () { NB.close('nbAuth'); });
        $('nbaSkip').addEventListener('click', function () { LSX.set('nb_auth_skip', Date.now()); NB.close('nbAuth'); NB.notif.maybeAsk(900); });
    }
    function authMode(mode) {
        A.mode = mode;
        var m = $('nbAuth');
        m.querySelectorAll('.nba-tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.m === mode ? 'true' : 'false'); });
        m.querySelectorAll('[data-only="signup"]').forEach(function (e) { e.classList.toggle('nb-hide', mode !== 'signup'); });
        $('nbaGo').textContent = mode === 'signup' ? 'Create account' : 'Log in';
        $('nbaSub').textContent = mode === 'signup' ? 'Create a free account to keep your saved notes and progress on every device.' : 'Welcome back! Log in to get your saved notes, downloads history and progress.';
        $('nbaPw').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
        $('nbaErr').textContent = '';
    }
    ui.openAuth = function (mode, firstRun) {
        if (!$('nbAuth')) buildAuth();
        authMode(mode || 'signup');
        NB.noClose.nbAuth = false;
        $('nbaX').style.display = '';
        NB.open('nbAuth');
        setTimeout(function () { try { (A.mode === 'signup' ? $('nbaName') : $('nbaId')).focus(); } catch (e) {} }, 80);
    };
    async function submitAuth(e) {
        e.preventDefault();
        var err = $('nbaErr'), go = $('nbaGo'); err.textContent = '';
        var id = $('nbaId').value.trim().toLowerCase(), pw = $('nbaPw').value;
        var name = NB.cleanName($('nbaName').value);
        if (A.mode === 'signup') {
            if (name.length < 2) { err.textContent = 'Please enter your name (at least 2 letters).'; $('nbaName').focus(); return; }
            if (!A.cls) { err.textContent = 'Please choose your class.'; return; }
            if (!NB.validId(id)) { err.textContent = 'User ID must be 4–20 characters (a–z, 0–9, dot or underscore) and cannot be a reserved word.'; $('nbaId').focus(); return; }
            if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters.'; $('nbaPw').focus(); return; }
        } else if (!id || !pw) { err.textContent = 'Enter your User ID and password.'; return; }
        go.disabled = true; var label = go.textContent; go.textContent = A.mode === 'signup' ? 'Creating account…' : 'Logging in…';
        try {
            if (A.mode === 'signup') await NB.signup({ userId: id, password: pw, name: name, cls: A.cls, photo: A.photo });
            else await NB.login(id, pw);
            $('nbaPw').value = '';
            NB.close('nbAuth');
            ui.refreshAll();
            if (typeof window.nbApplyRemote === 'function') { try { window.nbApplyRemote(); } catch (x) {} }
            var p = NB.profile();
            NB.toast((A.mode === 'signup' ? 'Account created. Welcome, ' : 'Logged in. Welcome back, ') + (p ? p.name : id) + '!', 3200);
            if (NB.cloudOk === false) setTimeout(function () { NB.toast('Signed in, but cloud sync is not enabled yet. Ask the site admin to publish the Firebase rules.', 5200); }, 3400);
            NB.notif.maybeAsk(1500);
        } catch (x) {
            err.textContent = NB.authError(x);
        } finally { go.disabled = false; go.textContent = label; }
    }

    /* ---------- profile sheet ---------- */
    var PF = { cls: '' };
    function buildProfile() {
        var m = NB.mk('<div class="nbo" id="nbPf" aria-hidden="true"><div class="nbo-card nbp" role="dialog" aria-modal="true" aria-label="Profile">' +
            '<button type="button" class="nbo-x" id="nbpX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<div class="nbp-head"><button type="button" class="nb-av nb-av-lg" id="nbpAv" aria-label="Change profile photo"><span class="nbp-cam"><i class="fa-solid fa-camera"></i></span></button>' +
            '<div class="nbp-who"><b id="nbpName">Student</b><small id="nbpSub"></small><em>Student account</em></div><input type="file" id="nbpFile" accept="image/*" class="nb-hide"></div>' +
            '<div class="nbp-stats">' +
            '<button type="button" data-go="dl"><i class="fa-solid fa-download"></i><b id="nbpDl">0</b><span>Downloads</span></button>' +
            '<button type="button" data-go="saved"><i class="fa-regular fa-bookmark"></i><b id="nbpSaved">0</b><span>Saved notes</span></button>' +
            '<button type="button" data-go="plan"><i class="fa-solid fa-fire"></i><b id="nbpStreak">0 days</b><span>Study streak</span></button></div>' +
            '<div class="nbp-list" id="nbpList">' +
            '<button type="button" class="nbp-row" data-go="edit"><i class="fa-regular fa-user"></i><div><b>Personal information</b><small>Name, photo, class</small></div></button>' +
            '<button type="button" class="nbp-row" data-go="saved"><i class="fa-regular fa-bookmark"></i><div><b>Saved material</b><small>Bookmarked notes, books and PYQs</small></div></button>' +
            '<button type="button" class="nbp-row" data-go="dl"><i class="fa-solid fa-clock-rotate-left"></i><div><b>Downloads &amp; history</b><small>Downloaded and viewed material</small></div></button>' +
            '<button type="button" class="nbp-row" data-go="exam"><i class="fa-solid fa-hourglass-half"></i><div><b>Exam countdown</b><small id="nbpExam">Set your exam date</small></div></button>' +
            '<button type="button" class="nbp-row" data-go="tests"><i class="fa-solid fa-list-check"></i><div><b>Mock tests</b><small id="nbpQuiz">Practice quizzes and timed tests</small></div></button>' +
            '<button type="button" class="nbp-row" data-go="notif"><i class="fa-regular fa-bell"></i><div><b>Notifications</b><small>New notes and website updates</small></div><em id="nbpNotif"></em></button>' +
            '<button type="button" class="nbp-row" data-go="theme"><i class="fa-solid fa-palette"></i><div><b>Appearance</b><small>Dark mode, theme and language</small></div></button>' +
            '</div>' +
            '<div class="nbp-edit nb-hide" id="nbpEdit"><label class="nbo-l" for="nbpNameIn">Full name</label><input id="nbpNameIn" class="nbo-in" maxlength="30" autocomplete="name">' +
            '<label class="nbo-l">Class</label><div class="nbo-cls" id="nbpCls" role="group" aria-label="Class"></div><div class="nbo-err" id="nbpErr" role="alert"></div>' +
            '<button type="button" class="nbo-save" id="nbpSave">Save changes</button><button type="button" class="nbo-skip" id="nbpCancel">Cancel</button></div>' +
            '<div class="nbp-foot"><button type="button" class="nbm-logout" id="nbpLogout"><i class="fa-solid fa-right-from-bracket"></i><span>Logout</span></button></div>' +
            '</div></div>');
        document.body.appendChild(m);
        classChips($('nbpCls'), function (c) { PF.cls = c; $('nbpErr').textContent = ''; });
        $('nbpX').addEventListener('click', function () { NB.close('nbPf'); });
        $('nbpAv').addEventListener('click', function () { $('nbpFile').click(); });
        $('nbpFile').addEventListener('change', function () {
            var f = this.files && this.files[0]; this.value = '';
            NB.readPhoto(f).then(function (d) { var p = NB.profile(); if (!p) return; p.photo = d; NB.setProfile(p); ui.refreshAll(); NB.toast('Profile photo updated'); })
                .catch(function (e) { if (e && e.message) NB.toast(e.message, 3200); });
        });
        $('nbPf').addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) goPf(b.dataset.go); });
        $('nbpSave').addEventListener('click', saveEdit);
        $('nbpCancel').addEventListener('click', function () { showEdit(false); });
        $('nbpLogout').addEventListener('click', ui.askLogout);
    }
    function showEdit(on) {
        $('nbpEdit').classList.toggle('nb-hide', !on);
        $('nbpList').classList.toggle('nb-hide', on);
        if (on) { var p = NB.profile() || {}; $('nbpNameIn').value = p.name || ''; PF.cls = p.cls || ''; setPressed($('nbpCls'), PF.cls); $('nbpErr').textContent = ''; setTimeout(function () { $('nbpNameIn').focus(); }, 40); }
    }
    function saveEdit() {
        var name = NB.cleanName($('nbpNameIn').value), p = NB.profile();
        if (name.length < 2) { $('nbpErr').textContent = 'Please enter your name (at least 2 letters).'; return; }
        if (!CLS_RE.test(PF.cls)) { $('nbpErr').textContent = 'Please choose your class.'; return; }
        var changed = !p || p.cls !== PF.cls;
        NB.setProfile({ name: name, cls: PF.cls, photo: (p && p.photo) || '', userId: (p && p.userId) || (NB.account() || {}).userId || '' });
        showEdit(false); ui.refreshAll(); if (changed) NB.classes.apply(true);
        NB.toast('Profile saved');
    }
    function goPf(w) {
        if (w === 'edit') { showEdit(true); return; }
        NB.close('nbPf');
        if (w === 'saved' && window.openSaved) window.openSaved();
        else if (w === 'dl' && window.openDownloads) window.openDownloads();
        else if (w === 'exam') NB.openExam();
        else if (w === 'plan') { if (window.switchView) window.switchView('home'); setTimeout(function () { var s = $('nbPlan'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 250); }
        else if (w === 'tests') NB.openQuiz();
        else if (w === 'notif') NB.notif.menuClick();
        else if (w === 'theme' && window.openModal) window.openModal('themeModal');
    }
    ui.openProfile = function () {
        closeSiteMenu();
        if (!NB.loggedIn() || !NB.profile()) { ui.openAuth('login'); return; }
        if (!$('nbPf')) buildProfile();
        showEdit(false); ui.refreshAll(); NB.open('nbPf');
    };

    /* ---------- logout confirmation ---------- */
    ui.askLogout = function () {
        closeSiteMenu();
        if (!NB.loggedIn()) { ui.openAuth('login'); return; }
        if (!$('nbLo')) {
            var m = NB.mk('<div class="nbo" id="nbLo" aria-hidden="true"><div class="nbo-card nbo-sm" role="alertdialog" aria-modal="true" aria-labelledby="nbLoT">' +
                '<h3 id="nbLoT" class="nbo-h">Log out?</h3>' +
                '<p class="nbo-sub">Your saved notes, history, exam date and scores stay safe in your account. Log in again on any phone to get them back.</p>' +
                '<button type="button" id="nbLoYes" class="nbm-logout"><i class="fa-solid fa-right-from-bracket"></i><span>Yes, log out</span></button>' +
                '<button type="button" id="nbLoNo" class="nbo-skip">Cancel</button></div></div>');
            document.body.appendChild(m);
            $('nbLoNo').addEventListener('click', function () { NB.close('nbLo'); });
            $('nbLoYes').addEventListener('click', async function () {
                this.disabled = true;
                await NB.logout();
                NB.close('nbLo'); NB.close('nbPf');
                NB.toast('You have been logged out');
                setTimeout(function () { ui.openAuth('login'); }, 500);
                this.disabled = false;
            });
        }
        NB.open('nbLo');
    };

    /* ---------- exam countdown dialog ---------- */
    NB.openExam = function () {
        closeSiteMenu();
        if (!$('nbEx')) {
            var m = NB.mk('<div class="nbo" id="nbEx" aria-hidden="true"><div class="nbo-card nbo-sm" role="dialog" aria-modal="true" aria-labelledby="nbExT" style="text-align:left">' +
                '<button type="button" class="nbo-x" id="nbExX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
                '<h3 id="nbExT" class="nbo-h">Exam countdown</h3><p class="nbo-sub">Pick your exam date and we will count the days for you.</p>' +
                '<label class="nbo-l" for="nbExName">Exam name</label><input id="nbExName" class="nbo-in" maxlength="30" placeholder="e.g. Half-yearly exam">' +
                '<label class="nbo-l" for="nbExDate">Exam date</label><input id="nbExDate" class="nbo-in" type="date">' +
                '<div class="nbo-err" id="nbExErr" role="alert"></div>' +
                '<button type="button" class="nbo-save" id="nbExSave">Save</button>' +
                '<div class="nbx-row"><button type="button" id="nbExClear">Remove date</button></div></div></div>');
            document.body.appendChild(m);
            $('nbExX').addEventListener('click', function () { NB.close('nbEx'); });
            $('nbExSave').addEventListener('click', function () {
                var d = $('nbExDate').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { $('nbExErr').textContent = 'Please choose a date.'; return; }
                LSX.set('nb_exam', { name: NB.cleanName($('nbExName').value) || 'Exam', date: d });
                NB.close('nbEx'); ui.refreshAll(); NB.toast('Exam date saved');
            });
            $('nbExClear').addEventListener('click', function () { LSX.del('nb_exam'); if (NB.loggedIn()) NB.pushNow(); NB.close('nbEx'); ui.refreshAll(); NB.toast('Exam date removed'); });
        }
        var e = NB.exam(); $('nbExName').value = e ? e.name : ''; $('nbExDate').value = e ? e.date : ''; $('nbExDate').min = NB.dayKey(); $('nbExErr').textContent = '';
        NB.open('nbEx');
    };

    /* ---------- welcome-back pill (2.8 s, returning users only) ---------- */
    ui.welcome = function () {
        var p = NB.profile(); if (!p) return;
        try { if (sessionStorage.getItem('nb_welcomed')) return; sessionStorage.setItem('nb_welcomed', '1'); } catch (e) {}
        var w = $('nbWelcome');
        if (!w) { w = NB.mk('<div id="nbWelcome" class="nbw" role="status"><span class="nb-av"></span><span class="nbw-t"></span></div>'); document.body.appendChild(w); }
        NB.setAvatar(w.querySelector('.nb-av'), p);
        w.querySelector('.nbw-t').textContent = 'Welcome back, ' + p.name + '!';
        w.classList.add('show');
        requestAnimationFrame(function () { requestAnimationFrame(function () { w.classList.add('in'); }); });
        setTimeout(function () { w.classList.remove('in'); setTimeout(function () { w.classList.remove('show'); }, 300); }, 2800);
    };

    /* ---------- study plan card on Home ---------- */
    function renderPlan() {
        var home = $('homeView'); if (!home) return;
        var s = $('nbPlan');
        if (!s) {
            s = NB.mk('<section id="nbPlan" class="nbs" aria-label="Your study plan"><div class="nbs-in"><div class="nbs-top"><h3>Your study plan</h3><button type="button" class="nbs-chip" id="nbPlanChip"></button></div><div class="nbs-week" id="nbPlanWeek"></div><div class="nbs-foot" id="nbPlanFoot"></div></div></section>');
            var hero = home.firstElementChild;
            if (hero && hero.nextSibling) home.insertBefore(s, hero.nextSibling); else home.appendChild(s);
            $('nbPlanChip').addEventListener('click', NB.openExam);
        }
        var e = NB.exam(), chip = $('nbPlanChip'), txt;
        if (!e) txt = '<i class="fa-regular fa-calendar-plus"></i> Set exam date';
        else {
            var n = NB.daysLeft(e.date);
            txt = '<i class="fa-solid fa-stopwatch"></i> ' + (n > 1 ? NB.esc(e.name) + ' in ' + n + ' days' : n === 1 ? NB.esc(e.name) + ' is tomorrow' : n === 0 ? NB.esc(e.name) + ' is today' : 'Exam over – set a new date');
        }
        chip.innerHTML = txt;
        var wk = $('nbPlanWeek'), now = new Date(), dow = (now.getDay() + 6) % 7, mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
        var set = {}; NB.days().forEach(function (k) { set[k] = 1; });
        var tk = NB.dayKey(), h = '';
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (L, i) {
            var d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i), k = NB.dayKey(d);
            var cls = k === tk ? 'today' : (set[k] && k < tk ? 'done' : '');
            h += '<div><span>' + L + '</span><span class="nbs-d ' + cls + '">' + (cls === 'done' ? '<i class="fa-solid fa-check"></i>' : d.getDate()) + '</span></div>';
        });
        wk.innerHTML = h;
        var st = NB.streak(), total = NB.days().length;
        $('nbPlanFoot').textContent = st > 1 ? st + '-day streak · ' + total + ' study days so far' : 'Open Notes Bazar every day to build your streak';
    }

    /* ---------- refresh everything that shows profile data ---------- */
    ui.refreshAll = function () {
        var p = NB.profile(), acct = NB.loggedIn();
        document.querySelectorAll('[data-nb-av]').forEach(function (el) { NB.setAvatar(el, p); });
        document.querySelectorAll('[data-nb-name]').forEach(function (el) { el.textContent = p ? p.name : 'Guest'; });
        document.querySelectorAll('[data-nb-cls]').forEach(function (el) { el.textContent = p ? p.cls + (p.userId ? ' · @' + p.userId : '') : 'Log in or create account'; });
        var lo = $('nbmLogout'); if (lo) lo.classList.toggle('nb-hide', !acct);
        var li = $('nbmLogin'); if (li) li.classList.toggle('nb-hide', acct);
        var hlo = $('nbhLogout'); if (hlo) hlo.classList.toggle('nb-hide', !acct);
        var hli = $('nbhLogin'); if (hli) hli.classList.toggle('nb-hide', acct);
        if ($('nbPf')) {
            NB.setAvatar($('nbpAv'), p);
            $('nbpName').textContent = p ? p.name : 'Student';
            $('nbpSub').textContent = p ? p.cls + (p.userId ? ' · @' + p.userId : '') : '';
            var hist = LSX.get('nb_dlhist', {}) || {};
            $('nbpDl').textContent = Object.keys(hist).length;
            $('nbpSaved').textContent = asArr(LSX.get('nb_favs', [])).length;
            var sk = NB.streak(); $('nbpStreak').textContent = sk + (sk === 1 ? ' day' : ' days');
            var e = NB.exam(); $('nbpExam').textContent = e ? e.name + ' · ' + e.date : 'Set your exam date';
            var q = asArr(LSX.get('nb_quiz', [])); $('nbpQuiz').textContent = q.length ? 'Last score: ' + q[0].score + '/' + q[0].total + ' · ' + q.length + ' tests taken' : 'Practice quizzes and timed tests';
            $('nbpNotif').textContent = NB.notif ? NB.notif.label() : '';
        }
        renderPlan();
        if (NB.notif) NB.notif.render();
        if (NB.classes && window.__nbReady) NB.classes.apply(false);
    };

    /* =====================================================================
       Notifications
       ===================================================================== */
    var notif = NB.notif = {};
    var ASK = 'nb_notif_ask';
    function supported() { return 'Notification' in window; }
    function perm() { return supported() ? Notification.permission : 'unsupported'; }
    notif.label = function () { var p = perm(); return p === 'granted' ? 'On' : p === 'denied' ? 'Blocked' : p === 'unsupported' ? 'N/A' : 'Off'; };
    notif.render = function () {
        var a = $('nbNotifState'); if (a) a.textContent = notif.label();
        var b = $('nbpNotif'); if (b) b.textContent = notif.label();
    };
    function shouldAsk() { return perm() === 'default' && Date.now() - (+LSX.raw(ASK) || 0) > 7 * DAY; }
    function ensureBanner() {
        if ($('nbNp')) return;
        document.body.appendChild(NB.mk('<div id="nbNp" class="nbn" role="dialog" aria-label="Notification permission"><div class="nbn-i"><i class="fa-solid fa-bell"></i></div><div class="nbn-t"><b>Turn on notifications?</b><span>Get alerted when new notes, books or PYQs for your class are uploaded.</span></div><div class="nbn-b"><button type="button" id="nbNpYes">Allow</button><button type="button" id="nbNpNo">Not now</button></div></div>'));
        $('nbNpYes').addEventListener('click', notif.request);
        $('nbNpNo').addEventListener('click', function () { LSX.raw(ASK); try { localStorage.setItem(ASK, String(Date.now())); } catch (e) {} hideBanner(); });
    }
    function hideBanner() { var n = $('nbNp'); if (!n) return; n.classList.remove('in'); setTimeout(function () { n.classList.remove('show'); }, 220); }
    notif.maybeAsk = function (delay) {
        setTimeout(function () {
            if (!shouldAsk() || NB.anyOpen()) return;   // already allowed/blocked/unsupported -> never ask again
            ensureBanner(); var n = $('nbNp'); n.classList.add('show');
            requestAnimationFrame(function () { requestAnimationFrame(function () { n.classList.add('in'); }); });
        }, delay || 0);
    };
    notif.request = function () {
        hideBanner(); try { localStorage.setItem(ASK, String(Date.now())); } catch (e) {}
        if (!supported()) { NB.toast('This browser does not support notifications.', 3200); return; }
        var done = function (p) {
            notif.render();
            if (p === 'granted') { NB.toast('Notifications are on'); window.nbNotify('Notes Bazar', 'You will now be alerted about new study material.'); }
            else if (p === 'denied') NB.toast('Notifications are blocked. Enable them from the browser site settings.', 3800);
        };
        try { var r = Notification.requestPermission(done); if (r && r.then) r.then(done); } catch (e) { console.warn(e); }
    };
    notif.menuClick = function () {
        var p = perm();
        if (p === 'granted') NB.toast('Notifications are already on', 2600);
        else if (p === 'denied') NB.toast('Blocked. Open browser site settings → Notifications → Allow.', 4200);
        else if (p === 'unsupported') NB.toast('On iPhone, install the app to the Home Screen first, then enable notifications.', 4200);
        else { closeSiteMenu(); notif.request(); }
    };
    window.nbNotify = function (title, body, url) {
        if (!supported() || Notification.permission !== 'granted') return Promise.resolve(false);
        var opts = { body: body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'nb-' + Date.now(), data: { url: url || './' } };
        var fb = function () { try { new Notification(title, opts); return true; } catch (e) { return false; } };
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
            return navigator.serviceWorker.getRegistration().then(function (reg) {
                return reg && reg.showNotification ? reg.showNotification(title, opts).then(function () { return true; }) : fb();
            }).catch(fb);
        }
        return Promise.resolve(fb());
    };
    /* alert for a newly uploaded item (only while the site/app is open) */
    notif.checkNew = async function () {
        if (perm() !== 'granted') return;
        try {
            var r = await fetch(CFG.databaseURL + '/notes_bazar_data.json?orderBy=%22%24key%22&limitToLast=1');
            if (!r.ok) return;
            var d = await r.json(); if (!d) return;
            var id = Object.keys(d)[0], it = d[id]; if (!it || it.private) return;
            var last = LSX.raw('nb_last_item');
            try { localStorage.setItem('nb_last_item', id); } catch (e) {}
            if (!last || last === id) return;
            var p = NB.profile();
            if (p && it.className && it.className !== p.cls) return;      // only for my class
            window.nbNotify('New ' + ((it.type || 'note') === 'pyq' ? 'PYQ' : it.type || 'note') + ' uploaded', (it.title || 'New study material') + (it.className ? ' · ' + it.className : ''));
        } catch (e) { /* offline: ignore */ }
    };

    /* =====================================================================
       Font style (menu)
       ===================================================================== */
    var FONTS = [
        { k: 'inter', n: 'Inter', s: "'Inter',system-ui,sans-serif" },
        { k: 'poppins', n: 'Poppins', s: "'Poppins','Hind',system-ui,sans-serif" },
        { k: 'nunito', n: 'Nunito', s: "'Nunito','Hind',system-ui,sans-serif" },
        { k: 'hind', n: 'Hind', s: "'Hind',system-ui,sans-serif" },
        { k: 'system', n: 'System', s: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" }
    ];
    var fontsLoaded = false;
    function loadFonts() {
        if (fontsLoaded) return; fontsLoaded = true;
        var l = document.createElement('link'); l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&family=Hind:wght@400;500;600;700&display=swap';
        document.head.appendChild(l);
    }
    function applyFont(k, persist) {
        var f = FONTS.filter(function (x) { return x.k === k; })[0] || FONTS[0], h = document.documentElement;
        if (f.k === 'inter') { h.classList.remove('nb-font'); h.style.removeProperty('--nb-font'); }
        else { if (f.k !== 'system') loadFonts(); h.style.setProperty('--nb-font', f.s); h.classList.add('nb-font'); }
        if (persist) { try { localStorage.setItem('nb_font', f.k); } catch (e) {} }
        var nm = $('nbFontName'); if (nm) nm.textContent = f.n;
        var box = $('nbFontChips');
        if (box) Array.prototype.forEach.call(box.children, function (b) { b.setAttribute('aria-pressed', b.dataset.k === f.k ? 'true' : 'false'); });
    }
    function buildFonts() {
        var box = $('nbFontChips'); if (!box) return; box.textContent = '';
        FONTS.forEach(function (f) {
            var b = document.createElement('button'); b.type = 'button'; b.textContent = f.n; b.dataset.k = f.k; b.style.fontFamily = f.s; b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', function () { applyFont(f.k, true); }); box.appendChild(b);
        });
        var det = $('nbFontDet'); if (det) det.addEventListener('toggle', function () { if (det.open) loadFonts(); });
        applyFont(LSX.raw('nb_font') || 'inter', false);
    }

    /* =====================================================================
       Class filter: my class by default; searching looks in ALL classes;
       choosing another class by hand always works.
       ===================================================================== */
    var PAGES = [
        { type: 'note', view: 'notes', search: 'notesSearchInput', cls: 'notesClassFilter' },
        { type: 'book', view: 'books', search: 'booksSearchInput', cls: 'booksClassFilter' },
        { type: 'pyq', view: 'pyq', search: 'pyqSearchInput', cls: 'pyqClassFilter' }
    ];
    var manual = {};
    var classes = NB.classes = {};
    function filterPage(pg) { try { if (typeof window.filterItems === 'function') window.filterItems(pg.type); } catch (e) { console.warn(e); } }
    classes.apply = function (force) {
        var p = NB.profile();
        if (force) manual = {};
        PAGES.forEach(function (pg) {
            var sel = $(pg.cls), q = $(pg.search); if (!sel || manual[pg.type]) return;
            var want = (p && !(q && q.value.trim())) ? p.cls : '';
            if (sel.value !== want) { sel.value = want; filterPage(pg); }
        });
    };
    document.addEventListener('input', function (e) {
        var t = e.target, p = NB.profile(); if (!t || !t.id || !p) return;
        PAGES.forEach(function (pg) {
            if (pg.search !== t.id || manual[pg.type]) return;
            var sel = $(pg.cls); if (!sel) return;
            var has = t.value.trim().length > 0;
            if (has && sel.value === p.cls) sel.value = '';
            else if (!has && sel.value === '') sel.value = p.cls;
        });
    }, true);
    document.addEventListener('change', function (e) {
        var t = e.target; if (!t || !t.id || !e.isTrusted) return;
        PAGES.forEach(function (pg) { if (pg.cls === t.id) manual[pg.type] = true; });
    }, true);
    function wrapSwitchView() {
        var o = window.switchView; if (typeof o !== 'function' || o.__nb) return;
        var w = function (v) {
            var r = o.apply(this, arguments);
            var pg = PAGES.filter(function (x) { return x.view === v; })[0];
            if (pg) setTimeout(function () { classes.apply(false); filterPage(pg); }, 0);
            if (v === 'home') NB.markDay();
            return r;
        };
        w.__nb = true; window.switchView = w;
    }

    /* =====================================================================
       Scientific calculator + date calculator
       ===================================================================== */
    var calc = NB.calc = {};
    var deg = true, mem = 0, ans = 0, expr = '', justEq = false;

    /* ---- safe expression parser (no eval) ---- */
    function tokenize(s) {
        var t = [], i = 0, m;
        s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/∛/g, 'cbrt');
        while (i < s.length) {
            var c = s[i];
            if (c === ' ') { i++; continue; }
            if ((m = /^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/.exec(s.slice(i)))) { t.push({ k: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
            if ((m = /^[a-z]+/.exec(s.slice(i)))) { t.push({ k: 'w', v: m[0] }); i += m[0].length; continue; }
            if ('+-*/^()!%PC|'.indexOf(c) >= 0) { t.push({ k: 'o', v: c }); i++; continue; }
            throw new Error('Syntax error');
        }
        return t;
    }
    var FN = {
        sin: function (x) { return Math.sin(toR(x)); }, cos: function (x) { return Math.cos(toR(x)); },
        tan: function (x) { if (deg && Math.abs(x % 180) === 90) throw new Error('Undefined'); return Math.tan(toR(x)); },
        asin: function (x) { if (x < -1 || x > 1) throw new Error('Domain error'); return fromR(Math.asin(x)); },
        acos: function (x) { if (x < -1 || x > 1) throw new Error('Domain error'); return fromR(Math.acos(x)); },
        atan: function (x) { return fromR(Math.atan(x)); },
        sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
        log: function (x) { if (x <= 0) throw new Error('Domain error'); return Math.log10(x); },
        ln: function (x) { if (x <= 0) throw new Error('Domain error'); return Math.log(x); },
        sqrt: function (x) { if (x < 0) throw new Error('Invalid input'); return Math.sqrt(x); },
        cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp
    };
    function toR(x) { return deg ? x * Math.PI / 180 : x; }
    function fromR(x) { return deg ? x * 180 / Math.PI : x; }
    function fact(n) {
        if (n < 0 || Math.floor(n) !== n) throw new Error('Invalid input');
        if (n > 170) throw new Error('Too large');
        var r = 1; for (var i = 2; i <= n; i++) r *= i; return r;
    }
    function nPr(n, r) { if (n < 0 || r < 0 || r > n || Math.floor(n) !== n || Math.floor(r) !== r) throw new Error('Invalid input'); return fact(n) / fact(n - r); }
    function nCr(n, r) { return Math.round(nPr(n, r) / fact(r)); }
    calc.evaluate = function (src) {
        var tk = tokenize(src), p = 0;
        function peek() { return tk[p]; }
        function isO(v) { var x = tk[p]; return x && x.k === 'o' && x.v === v; }
        function expr1() {
            var v = term();
            while (isO('+') || isO('-')) { var o = tk[p++].v, r = term(); v = o === '+' ? v + r : v - r; }
            return v;
        }
        function startsPrimary() { var x = tk[p]; return x && (x.k === 'n' || x.k === 'w' || (x.k === 'o' && (x.v === '(' || x.v === '|'))); }
        function term() {
            var v = unary();
            for (;;) {
                if (isO('*') || isO('/')) {
                    var o = tk[p++].v, r = unary();
                    if (o === '/') { if (r === 0) throw new Error('Cannot divide by zero'); v /= r; } else v *= r;
                } else if (peek() && peek().k === 'w' && peek().v === 'mod') {
                    p++; var m = unary(); if (m === 0) throw new Error('Cannot divide by zero'); v = ((v % m) + m) % m;
                } else if (startsPrimary()) { v *= unary(); }      // implicit multiplication: 2π, 3(4+5), 2sin(30)
                else break;
            }
            return v;
        }
        function unary() {
            if (isO('-')) { p++; return -unary(); }
            if (isO('+')) { p++; return unary(); }
            return perm();
        }
        function perm() {
            var v = power();
            while (isO('P') || isO('C')) { var o = tk[p++].v, r = power(); v = o === 'P' ? nPr(v, r) : nCr(v, r); }
            return v;
        }
        function power() {
            var b = post();
            if (isO('^')) { p++; var e = unary(); var r = Math.pow(b, e); if (!isFinite(r) && isFinite(b) && isFinite(e)) throw new Error(b === 0 && e < 0 ? 'Cannot divide by zero' : 'Invalid input'); if (isNaN(r)) throw new Error('Invalid input'); return r; }
            return b;
        }
        function post() {
            var v = primary();
            for (;;) { if (isO('!')) { p++; v = fact(v); } else if (isO('%')) { p++; v = v / 100; } else break; }
            return v;
        }
        function primary() {
            var x = tk[p++];
            if (!x) throw new Error('Syntax error');
            if (x.k === 'n') return x.v;
            if (x.k === 'o' && x.v === '(') { var v = expr1(); if (!isO(')')) throw new Error('Missing )'); p++; return v; }
            if (x.k === 'o' && x.v === '|') { var a = expr1(); if (!isO('|')) throw new Error('Missing |'); p++; return Math.abs(a); }
            if (x.k === 'w') {
                if (x.v === 'pi') return Math.PI;
                if (x.v === 'e') return Math.E;
                if (x.v === 'ans') return ans;
                if (x.v === 'rand') return Math.random();
                if (FN[x.v]) {
                    var arg;
                    if (isO('(')) { p++; arg = expr1(); if (isO(')')) p++; }       // allow a missing closing bracket
                    else arg = unary();
                    var r = FN[x.v](arg); if (!isFinite(r)) throw new Error('Math error'); return r;
                }
            }
            throw new Error('Syntax error');
        }
        var res = expr1();
        if (p < tk.length) throw new Error('Syntax error');
        if (!isFinite(res)) throw new Error('Math error');
        return res;
    };
    calc.fmt = function (n) {
        if (n === 0 || Math.abs(n) < 1e-12) return '0';
        var r = parseFloat(n.toPrecision(12));
        if (Math.abs(r) >= 1e15 || Math.abs(r) < 1e-9) return r.toExponential(8).replace(/\.?0+e/, 'e').replace('e+', '×10^').replace('e-', '×10^-');
        return String(r);
    };
    calc.setDeg = function (d) { deg = d; };

    var KEYS = [
        ['sin', 'fn', 'sin('], ['cos', 'fn', 'cos('], ['tan', 'fn', 'tan('], ['⌫', 'clr', 'back'], ['AC', 'clr', 'ac'],
        ['sin⁻¹', 'fn', 'asin('], ['cos⁻¹', 'fn', 'acos('], ['tan⁻¹', 'fn', 'atan('], ['(', 'fn', '('], [')', 'fn', ')'],
        ['sinh', 'fn', 'sinh('], ['cosh', 'fn', 'cosh('], ['tanh', 'fn', 'tanh('], ['π', 'fn', 'π'], ['e', 'fn', 'e'],
        ['log', 'fn', 'log('], ['ln', 'fn', 'ln('], ['√', 'fn', '√('], ['∛', 'fn', '∛('], ['x²', 'fn', '^2'],
        ['xʸ', 'fn', '^'], ['1/x', 'fn', 'recip'], ['n!', 'fn', '!'], ['|x|', 'fn', 'abs('], ['mod', 'fn', ' mod '],
        ['nPr', 'fn', 'P'], ['nCr', 'fn', 'C'], ['EXP', 'fn', 'E'], ['%', 'fn', '%'], ['rand', 'fn', 'rand'],
        ['7', 'num', '7'], ['8', 'num', '8'], ['9', 'num', '9'], ['÷', 'op', '÷'], ['MC', 'mem', 'mc'],
        ['4', 'num', '4'], ['5', 'num', '5'], ['6', 'num', '6'], ['×', 'op', '×'], ['MR', 'mem', 'mr'],
        ['1', 'num', '1'], ['2', 'num', '2'], ['3', 'num', '3'], ['−', 'op', '−'], ['M+', 'mem', 'm+'],
        ['0', 'num', '0'], ['.', 'num', '.'], ['Ans', 'fn', 'ans'], ['+', 'op', '+'], ['M−', 'mem', 'm-'],
        ['=', 'eq', '=']
    ];
    function paintCalc(live) {
        var e = $('nbcExp'), r = $('nbcRes'); if (!e) return;
        e.textContent = expr || '\u00a0';
        if (live !== undefined) return;
        var out = '0';
        if (expr) { try { out = calc.fmt(calc.evaluate(expr)); } catch (x) { out = ''; } }
        r.classList.remove('err'); r.textContent = out === '' ? '\u00a0' : out;
        $('nbcMem').textContent = mem ? 'M = ' + calc.fmt(mem) : '';
    }
    function press(act) {
        if (act === 'ac') { expr = ''; justEq = false; paintCalc(); return; }
        if (act === 'back') { expr = expr.replace(/(sinh\(|cosh\(|tanh\(|asin\(|acos\(|atan\(|sqrt\(|cbrt\(|sin\(|cos\(|tan\(|log\(|ln\(|abs\(| mod |rand|ans|√\(|∛\(|.)$/, ''); justEq = false; paintCalc(); return; }
        if (act === 'mc') { mem = 0; paintCalc(); return; }
        if (act === 'mr') { insert(calc.fmt(mem).replace('×10^', 'E')); return; }
        if (act === 'm+' || act === 'm-') {
            try { var v = calc.evaluate(expr || '0'); mem += act === 'm+' ? v : -v; NB.toast('Memory: ' + calc.fmt(mem), 1200); } catch (x) {}
            paintCalc(); return;
        }
        if (act === '=') {
            if (!expr) return;
            try { var r = calc.evaluate(expr); ans = r; $('nbcExp').textContent = expr + ' ='; var o = calc.fmt(r); $('nbcRes').classList.remove('err'); $('nbcRes').textContent = o; expr = o.indexOf('×10^') >= 0 ? String(r) : o; justEq = true; }
            catch (x) { var rs = $('nbcRes'); rs.textContent = x.message || 'Error'; rs.classList.add('err'); justEq = false; }
            return;
        }
        if (act === 'recip') { insert('1÷('); return; }
        insert(act);
    }
    function insert(tok) {
        if (justEq) {
            if (/^[\d.(]|^[a-zπ√∛]/i.test(tok) && !/^(\^|!|%|P|C| mod |E)/.test(tok)) expr = '';
            justEq = false;
        }
        if (tok === '.' ) { var last = expr.split(/[^\d.]/).pop(); if (last.indexOf('.') >= 0) return; }
        expr += tok; paintCalc();
    }
    function buildCalc() {
        var m = NB.mk('<div class="nbo" id="nbCalc" aria-hidden="true"><div class="nbo-card nbc" role="dialog" aria-modal="true" aria-label="Calculator">' +
            '<button type="button" class="nbo-x" id="nbcX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<div class="nbc-top"><div class="nbc-tabs" role="tablist"><button type="button" role="tab" data-t="sci" aria-selected="true">Scientific</button><button type="button" role="tab" data-t="date" aria-selected="false">Date</button></div></div>' +
            '<div id="nbcSci"><div class="nbc-disp"><div class="nbc-exp" id="nbcExp">&nbsp;</div><div class="nbc-res" id="nbcRes">0</div></div>' +
            '<div class="nbc-meta"><button type="button" id="nbcAngle" aria-label="Toggle degrees or radians">DEG</button><span id="nbcMem"></span></div>' +
            '<div class="nbc-keys" id="nbcKeys"></div></div>' +
            '<div id="nbcDate" class="nb-hide"></div></div></div>');
        document.body.appendChild(m);
        var kb = $('nbcKeys');
        KEYS.forEach(function (k) {
            var b = document.createElement('button'); b.type = 'button'; b.textContent = k[0]; b.className = k[1]; b.dataset.a = k[2];
            if (k[0] === 'sin⁻¹' || k[0] === 'cos⁻¹' || k[0] === 'tan⁻¹') b.setAttribute('aria-label', 'inverse ' + k[0].slice(0, 3));
            kb.appendChild(b);
        });
        kb.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) press(b.dataset.a); });
        $('nbcX').addEventListener('click', function () { NB.close('nbCalc'); });
        $('nbcAngle').addEventListener('click', function () { deg = !deg; this.textContent = deg ? 'DEG' : 'RAD'; paintCalc(); });
        m.querySelectorAll('.nbc-tabs button').forEach(function (b) {
            b.addEventListener('click', function () {
                m.querySelectorAll('.nbc-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
                $('nbcSci').classList.toggle('nb-hide', b.dataset.t !== 'sci'); $('nbcDate').classList.toggle('nb-hide', b.dataset.t !== 'date');
                if (b.dataset.t === 'date' && !$('nbcDate').firstChild) buildDateCalc();
            });
        });
        document.addEventListener('keydown', function (e) {
            if (!NB.isOpen('nbCalc') || $('nbcSci').classList.contains('nb-hide')) return;
            if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
            var k = e.key;
            if (/^[0-9.]$/.test(k)) press(k);
            else if (k === '+') press('+'); else if (k === '-') press('−'); else if (k === '*') press('×'); else if (k === '/') { e.preventDefault(); press('÷'); }
            else if (k === '^') press('^'); else if (k === '(' || k === ')') press(k); else if (k === '!') press('!'); else if (k === '%') press('%');
            else if (k === 'Enter' || k === '=') { e.preventDefault(); press('='); }
            else if (k === 'Backspace') press('back'); else if (k === 'Delete' || k === 'c' || k === 'C') press('ac');
        });
        paintCalc();
    }
    NB.openCalc = function () { closeSiteMenu(); if (!$('nbCalc')) buildCalc(); NB.open('nbCalc'); };

    /* ---- date calculator ---- */
    var MS = 864e5;
    function utc(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
    function ymd(a, b) {            // years, months, days between two UTC dates (a <= b)
        var A = new Date(a), B = new Date(b), y = B.getUTCFullYear() - A.getUTCFullYear(), m = B.getUTCMonth() - A.getUTCMonth(), d = B.getUTCDate() - A.getUTCDate();
        if (d < 0) { m--; d += new Date(Date.UTC(B.getUTCFullYear(), B.getUTCMonth(), 0)).getUTCDate(); }
        if (m < 0) { y--; m += 12; }
        return { y: y, m: m, d: d };
    }
    var WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    function showDate(t) { var d = new Date(t); return WD[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
    calc.between = function (a, b) {
        var x = utc(a), y = utc(b), neg = x > y; if (neg) { var t = x; x = y; y = t; }
        var days = Math.round((y - x) / MS), r = ymd(x, y);
        return { days: days, weeks: Math.floor(days / 7), rem: days % 7, y: r.y, m: r.m, d: r.d };
    };
    calc.addDays = function (a, n) { return utc(a) + n * MS; };
    calc.age = function (dob, today) {
        var x = utc(dob), y = utc(today), r = ymd(x, y), d = new Date(x), t = new Date(y);
        var nb = Date.UTC(t.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); if (nb < y) nb = Date.UTC(t.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
        return { y: r.y, m: r.m, d: r.d, next: Math.round((nb - y) / MS) };
    };
    function buildDateCalc() {
        var T = NB.dayKey();
        var box = $('nbcDate');
        box.innerHTML =
            '<div class="nbd-card"><h4>Days between two dates</h4><div class="nbd-grid"><div><label for="nbdA">From</label><input id="nbdA" type="date" class="nbo-in" value="' + T + '"></div><div><label for="nbdB">To</label><input id="nbdB" type="date" class="nbo-in" value="' + T + '"></div></div><div class="nbd-out" id="nbdOut1"></div></div>' +
            '<div class="nbd-card"><h4>Add or subtract days</h4><div class="nbd-grid"><div><label for="nbdC">Start date</label><input id="nbdC" type="date" class="nbo-in" value="' + T + '"></div><div><label for="nbdN">Days</label><input id="nbdN" type="number" class="nbo-in" value="30" step="1"></div></div><div class="nbd-grid" style="margin-top:8px"><button type="button" class="nbo-mini" id="nbdAdd">Add days</button><button type="button" class="nbo-mini" id="nbdSub">Subtract days</button></div><div class="nbd-out" id="nbdOut2"></div></div>' +
            '<div class="nbd-card"><h4>Age calculator</h4><label for="nbdD" style="font-size:11px;font-weight:700;color:var(--nb-muted)">Date of birth</label><input id="nbdD" type="date" class="nbo-in" max="' + T + '"><div class="nbd-out" id="nbdOut3"></div></div>' +
            '<div class="nbd-card"><h4>Day of the week</h4><input id="nbdE" type="date" class="nbo-in" value="' + T + '"><div class="nbd-out" id="nbdOut4"></div></div>';
        function v(id) { return $(id).value; }
        function s1() {
            if (!v('nbdA') || !v('nbdB')) { $('nbdOut1').textContent = ''; return; }
            var r = calc.between(v('nbdA'), v('nbdB'));
            $('nbdOut1').textContent = r.days + ' days (' + r.weeks + ' weeks' + (r.rem ? ' ' + r.rem + ' days' : '') + ') · ' + r.y + ' y ' + r.m + ' m ' + r.d + ' d';
        }
        function s2(sign) { if (!v('nbdC')) return; var n = parseInt(v('nbdN'), 10); if (isNaN(n)) return; $('nbdOut2').textContent = showDate(calc.addDays(v('nbdC'), sign * n)); }
        function s3() { if (!v('nbdD')) { $('nbdOut3').textContent = ''; return; } var r = calc.age(v('nbdD'), T); $('nbdOut3').textContent = r.y + ' years ' + r.m + ' months ' + r.d + ' days · next birthday in ' + r.next + ' days'; }
        function s4() { if (v('nbdE')) $('nbdOut4').textContent = showDate(utc(v('nbdE'))); }
        ['nbdA', 'nbdB'].forEach(function (i) { $(i).addEventListener('input', s1); });
        $('nbdAdd').addEventListener('click', function () { s2(1); }); $('nbdSub').addEventListener('click', function () { s2(-1); });
        $('nbdD').addEventListener('input', s3); $('nbdE').addEventListener('input', s4);
        s1(); s4();
    }

    /* =====================================================================
       Tests: practice quiz + timed mock test (questions come from questions.json)
       ===================================================================== */
    var QZ = { bank: null, mode: 'practice', subj: 'All', cls: 10, list: [], idx: 0, ans: [], t0: 0, left: 0, timer: 0, done: false };
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function loadBank() {
        if (QZ.bank) return Promise.resolve(QZ.bank);
        return fetch('questions.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (b) { QZ.bank = Array.isArray(b) ? b.filter(function (q) { return q && q.q && Array.isArray(q.o) && q.o.length >= 2 && q.a >= 0 && q.a < q.o.length; }) : []; return QZ.bank; });
    }
    function pickQuestions(n) {
        var pool = QZ.bank.filter(function (q) { return QZ.subj === 'All' || q.s === QZ.subj; });
        var fit = pool.filter(function (q) { return QZ.cls >= q.c[0] && QZ.cls <= q.c[1]; });
        if (fit.length < Math.min(n, 6)) {           // widen to the nearest class levels
            fit = pool.slice().sort(function (a, b) { return dist(a) - dist(b); }).slice(0, Math.max(n, 6));
        }
        return shuffle(fit).slice(0, n).map(function (q) {
            var idx = shuffle(q.o.map(function (_, i) { return i; }));
            return { q: q.q, s: q.s, e: q.e || '', o: idx.map(function (i) { return q.o[i]; }), a: idx.indexOf(q.a) };
        });
    }
    function dist(q) { return QZ.cls < q.c[0] ? q.c[0] - QZ.cls : QZ.cls > q.c[1] ? QZ.cls - q.c[1] : 0; }
    function stopTimer() { clearInterval(QZ.timer); QZ.timer = 0; }
    function buildQuiz() {
        document.body.appendChild(NB.mk('<div class="nbo" id="nbQz" aria-hidden="true"><div class="nbo-card nbq" role="dialog" aria-modal="true" aria-label="Tests">' +
            '<button type="button" class="nbo-x" id="nbqX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div id="nbqBody"></div></div></div>'));
        $('nbqX').addEventListener('click', function () { NB.close('nbQz'); });
        NB.onClose.nbQz = stopTimer;
    }
    NB.openQuiz = function () {
        closeSiteMenu(); if (!$('nbQz')) buildQuiz();
        var p = NB.profile(); QZ.cls = p ? parseInt(p.cls.replace('Class ', ''), 10) : QZ.cls;
        NB.open('nbQz'); quizSetup();
    };
    function quizSetup() {
        stopTimer();
        var body = $('nbqBody'); body.innerHTML = '<p class="nbo-sub">Loading questions…</p>';
        loadBank().then(function () {
            if (!QZ.bank.length) { body.innerHTML = '<p class="nbo-sub">No questions are available yet.</p>'; return; }
            var subs = ['All']; QZ.bank.forEach(function (q) { if (subs.indexOf(q.s) < 0) subs.push(q.s); });
            var hist = asArr(LSX.get('nb_quiz', [])).slice(0, 4);
            var h = '<h3 class="nbo-h">Tests</h3><p class="nbo-sub">Practice with MCQs or take a timed mock test.</p>' +
                '<label class="nbo-l">Test type</label><div class="nbq-modes"><button type="button" class="nbq-mode" data-m="practice" aria-pressed="' + (QZ.mode === 'practice') + '"><b>Practice quiz</b><small>10 questions · instant answers</small></button>' +
                '<button type="button" class="nbq-mode" data-m="mock" aria-pressed="' + (QZ.mode === 'mock') + '"><b>Mock test</b><small>20 questions · 20 min timer</small></button></div>' +
                '<label class="nbo-l">Subject</label><div class="nbq-chips" id="nbqSubs">' + subs.map(function (s) { return '<button type="button" data-s="' + NB.esc(s) + '" aria-pressed="' + (QZ.subj === s) + '">' + NB.esc(s) + '</button>'; }).join('') + '</div>' +
                '<label class="nbo-l" for="nbqCls">Class level</label><select id="nbqCls" class="nbo-in">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return '<option value="' + n + '"' + (n === QZ.cls ? ' selected' : '') + '>Class ' + n + '</option>'; }).join('') + '</select>' +
                '<div class="nbo-err" id="nbqErr"></div><button type="button" class="nbo-save" id="nbqStart">Start</button>' +
                (hist.length ? '<div class="nbq-hist" style="margin-top:12px"><b>Recent results</b><br>' + hist.map(function (r) { return NB.esc(r.mode === 'mock' ? 'Mock' : 'Practice') + ' · ' + NB.esc(r.subj) + ' · Class ' + r.cls + ' · <b>' + r.score + '/' + r.total + '</b> · ' + new Date(r.t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }).join('<br>') + '</div>' : '');
            body.innerHTML = h;
            body.querySelectorAll('.nbq-mode').forEach(function (b) { b.addEventListener('click', function () { QZ.mode = b.dataset.m; body.querySelectorAll('.nbq-mode').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }); });
            $('nbqSubs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; QZ.subj = b.dataset.s; Array.prototype.forEach.call(this.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); });
            $('nbqCls').addEventListener('change', function () { QZ.cls = parseInt(this.value, 10); });
            $('nbqStart').addEventListener('click', quizStart);
        }).catch(function () { body.innerHTML = '<p class="nbo-sub">Could not load questions. Check your internet connection and try again.</p>'; });
    }
    function quizStart() {
        QZ.list = pickQuestions(QZ.mode === 'mock' ? 20 : 10);
        if (QZ.list.length < 3) { $('nbqErr').textContent = 'Not enough questions for this selection. Try another subject.'; return; }
        QZ.idx = 0; QZ.ans = QZ.list.map(function () { return -1; }); QZ.done = false; QZ.t0 = Date.now();
        stopTimer();
        if (QZ.mode === 'mock') { QZ.left = Math.min(20 * 60, QZ.list.length * 60); QZ.timer = setInterval(tick, 1000); }
        quizShow();
    }
    function fmtT(s) { return NB.pad(Math.floor(s / 60)) + ':' + NB.pad(s % 60); }
    function tick() {
        QZ.left--; var t = $('nbqTimer');
        if (t) { t.textContent = fmtT(Math.max(0, QZ.left)); t.classList.toggle('low', QZ.left <= 60); }
        if (QZ.left <= 0) quizFinish();
    }
    function quizShow() {
        var q = QZ.list[QZ.idx], mock = QZ.mode === 'mock', sel = QZ.ans[QZ.idx], locked = !mock && sel >= 0;
        var h = '<div class="nbq-top"><span>Question ' + (QZ.idx + 1) + ' / ' + QZ.list.length + ' · ' + NB.esc(q.s) + '</span>' + (mock ? '<span class="nbq-timer" id="nbqTimer">' + fmtT(Math.max(0, QZ.left)) + '</span>' : '') + '</div>' +
            '<div class="nbq-bar"><i style="width:' + Math.round((QZ.idx + (locked ? 1 : 0)) / QZ.list.length * 100) + '%"></i></div><div class="nbq-q" id="nbqQ"></div><div id="nbqOpts"></div>';
        $('nbqBody').innerHTML = h;
        $('nbqQ').textContent = q.q;
        var ob = $('nbqOpts');
        q.o.forEach(function (o, i) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'nbq-opt';
            var l = document.createElement('span'); l.textContent = String.fromCharCode(65 + i); var t = document.createElement('div'); t.textContent = o;
            b.appendChild(l); b.appendChild(t);
            if (mock) b.setAttribute('aria-pressed', sel === i ? 'true' : 'false');
            if (locked) { b.disabled = true; if (i === q.a) b.classList.add('right'); else if (i === sel) b.classList.add('wrong'); }
            b.addEventListener('click', function () { if (locked) return; QZ.ans[QZ.idx] = i; quizShow(); });
            ob.appendChild(b);
        });
        if (locked && q.e) { var ex = document.createElement('div'); ex.className = 'nbq-exp'; ex.textContent = (sel === q.a ? 'Correct! ' : 'Not quite. ') + q.e; $('nbqBody').appendChild(ex); }
        var last = QZ.idx === QZ.list.length - 1;
        var nav = NB.mk('<div class="nbq-nav">' + (mock ? '<button type="button" id="nbqPrev"' + (QZ.idx ? '' : ' disabled') + '>Previous</button>' : '') +
            '<button type="button" class="pri" id="nbqNext"' + (!mock && !locked ? ' disabled' : '') + '>' + (last ? 'Finish' : 'Next') + '</button></div>');
        $('nbqBody').appendChild(nav);
        if (mock) $('nbqPrev').addEventListener('click', function () { if (QZ.idx) { QZ.idx--; quizShow(); } });
        $('nbqNext').addEventListener('click', function () { if (last) { if (mock && QZ.ans.indexOf(-1) >= 0 && !confirm('Some questions are unanswered. Submit anyway?')) return; quizFinish(); } else { QZ.idx++; quizShow(); } });
    }
    function quizFinish() {
        if (QZ.done) return; QZ.done = true; stopTimer();
        var score = 0; QZ.list.forEach(function (q, i) { if (QZ.ans[i] === q.a) score++; });
        var total = QZ.list.length, pct = Math.round(score / total * 100), secs = Math.round((Date.now() - QZ.t0) / 1000);
        var hist = asArr(LSX.get('nb_quiz', [])); hist.unshift({ t: Date.now(), score: score, total: total, mode: QZ.mode, subj: QZ.subj, cls: QZ.cls });
        LSX.set('nb_quiz', hist.slice(0, 30)); NB.markDay(); ui.refreshAll();
        var msg = pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Good effort. Keep practising!' : 'Keep going. Review the answers below and try again.';
        var h = '<div class="nbq-score"><b>' + score + ' / ' + total + '</b><span>' + pct + '% · ' + msg + '<br>Time taken: ' + fmtT(secs) + '</span></div>';
        $('nbqBody').innerHTML = h + '<div id="nbqRev"></div><div class="nbq-nav"><button type="button" id="nbqAgain">Try again</button><button type="button" class="pri" id="nbqNew">New test</button></div>';
        var rv = $('nbqRev');
        QZ.list.forEach(function (q, i) {
            var ok = QZ.ans[i] === q.a, d = document.createElement('div'); d.className = 'nbq-rev ' + (ok ? 'ok' : 'bad');
            var a = document.createElement('b'); a.textContent = (i + 1) + '. ' + q.q; d.appendChild(a);
            var y = document.createElement('div'); y.textContent = 'Your answer: ' + (QZ.ans[i] >= 0 ? q.o[QZ.ans[i]] : 'Not answered') + (ok ? ' ✓' : ''); d.appendChild(y);
            if (!ok) { var c = document.createElement('div'); c.textContent = 'Correct answer: ' + q.o[q.a]; d.appendChild(c); }
            if (q.e) { var e = document.createElement('div'); e.style.opacity = '.8'; e.textContent = q.e; d.appendChild(e); }
            rv.appendChild(d);
        });
        $('nbqAgain').addEventListener('click', quizStart); $('nbqNew').addEventListener('click', quizSetup);
    }

    /* =====================================================================
       Start-up
       ===================================================================== */
    function whenReady(fn) {
        var n = 0, iv = setInterval(function () {
            if ((typeof window.filterItems === 'function' && typeof window.switchView === 'function') || ++n > 60) { clearInterval(iv); fn(); }
        }, 250);
    }
    function waitSplash(cb) {
        var n = 0, iv = setInterval(function () {
            var s = $('splash'), gone = !s || !s.offsetParent;
            if (!gone) { try { var cs = getComputedStyle(s); gone = cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05; } catch (e) {} }
            if (gone || ++n > 25) { clearInterval(iv); setTimeout(cb, 350); }
        }, 200);
    }
    /* Admin login has no visible button: open  yoursite/#admin  to get the email + password prompt */
    var adminMode = /^#admin$/i.test(location.hash || '');
    function checkAdminHash() {
        if (!/^#admin$/i.test(location.hash || '')) return;
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
        NB.close('nbAuth');
        if (typeof window.openAdminLogin === 'function') window.openAdminLogin();
    }
    window.addEventListener('hashchange', checkAdminHash);
    function init() {
        NB.markDay();
        buildFonts();
        ui.refreshAll();
        whenReady(function () {
            window.__nbReady = true; wrapSwitchView(); classes.apply(false);
            if (adminMode) checkAdminHash();
            setTimeout(notif.checkNew, 4000);
            setInterval(function () { if (document.visibilityState === 'visible') notif.checkNew(); }, 5 * 60 * 1000);
        });
        waitSplash(function () {
            if (NB.loggedIn()) {
                ui.welcome();
                NB.restoreSession().then(function (u) {
                    if (u === null) { NB.toast('Your session has expired. Please log in again.', 3500); setTimeout(function () { ui.refreshAll(); ui.openAuth('login'); }, 600); }
                    else notif.maybeAsk(3600);
                });
            } else if (adminMode) { /* admin is opening the dashboard: no student sign-up prompt */ }
            else if (Date.now() - (+LSX.raw('nb_auth_skip') || 0) > DAY) ui.openAuth('signup');
            else notif.maybeAsk(1200);
        });
    }
    NB.openProfile = ui.openProfile;
    NB.openLogin = function () { closeSiteMenu(); ui.openAuth('login'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* ---------- Hero slider: auto-slides right to left, loops, swipe + dots, pauses on touch/hover.
   Slides can be customised by the admin (Admin Dashboard > Hero). The saved layout lives in Firebase
   ("notes_bazar_hero"); if nothing was saved, the slides written in index.html are shown as before. ---------- */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var HKEY = 'nb_hero';
    NB.HERO_URL = 'https://notes-market-d309b-default-rtdb.firebaseio.com/notes_bazar_hero.json';
    NB.HERO_ACTIONS = [['notes', 'Open Notes'], ['pyq', 'Open PYQ'], ['books', 'Open Books'], ['quiz', 'Take a quick test'], ['ai', 'Help & AI chat'], ['support', 'Support'], ['calc', 'Calculator'], ['link', 'Open a link (URL)']];
    var ACT_OK = {}; NB.HERO_ACTIONS.forEach(function (a) { ACT_OK[a[0]] = 1; });

    /* ----- clean / validate (used for everything read from Firebase and everything saved) ----- */
    function arr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).sort(function (a, b) { return a - b; }).map(function (k) { return x[k]; }) : []); }
    function str(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n); }
    function num(v, min, max, d) { v = parseFloat(v); return isFinite(v) ? Math.min(max, Math.max(min, v)) : d; }
    function col(v, d) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d; }
    function url(v) { v = String(v || '').trim(); return /^https?:\/\/[^\s"'<>\\]+$/i.test(v) && v.length <= 500 ? v : ''; }
    function uid() { return 's' + Math.random().toString(36).slice(2, 9); }
    function btn(b) {
        if (!b || typeof b !== 'object') return null;
        var t = str(b.t, 24), a = ACT_OK[b.a] ? b.a : 'notes', u = url(b.u);
        if (!t || (a === 'link' && !u)) return null;
        return { t: t, a: a, u: a === 'link' ? u : '', s: /^(light|dark|outline)$/.test(b.s) ? b.s : 'light' };
    }
    NB.heroClean = function (raw) {
        if (!raw || typeof raw !== 'object') return null;
        var out = { auto: raw.auto !== false, delay: num(raw.delay, 2, 15, 5.5), dots: raw.dots !== false, slides: [] };
        arr(raw.slides).slice(0, 10).forEach(function (s) {
            if (!s || typeof s !== 'object') return;
            var c = arr(s.c), p = arr(s.p).map(Number);
            var pOk = p.length === 3 && p.every(function (n) { return isFinite(n) && n >= 0 && n <= 200; });
            out.slides.push({
                id: /^[a-z0-9]{3,16}$/i.test(s.id || '') ? s.id : uid(),
                on: s.on !== false,
                badge: str(s.badge, 40), title: str(s.title, 90), text: str(s.text, 200),
                icon: /^[a-z0-9-]{1,30}$/.test(s.icon || '') ? s.icon : '',
                bg: /^(theme|grad|solid|img)$/.test(s.bg) ? s.bg : 'grad',
                c: [col(c[0], '#4f46e5'), col(c[1], '#7c3aed'), col(c[2], '')],
                p: pOk ? p : [0, 55, 110],
                ang: Math.round(num(s.ang, 0, 360, 135)), solid: col(s.solid, '#4f46e5'),
                img: url(s.img), ov: Math.round(num(s.ov, 0, 85, 35)),
                tc: col(s.tc, '#ffffff'), al: s.al === 'left' ? 'left' : 'center',
                b: arr(s.b).slice(0, 2).map(btn).filter(Boolean)
            });
        });
        return out;
    };
    /* the 3 slides that are written in index.html, as data (the editor starts from these) */
    NB.heroDefaults = function () {
        return [
            { id: 'sdef1', on: true, badge: 'Welcome to Notes Bazar 🌟', title: 'Your Ultimate Student Study Hub', text: 'Free notes, books and PYQs for Class 1-12, all in one place.', icon: 'graduation-cap', bg: 'theme', c: ['#4f46e5', '#7c3aed', ''], p: [0, 55, 110], ang: 135, solid: '#4f46e5', img: '', ov: 35, tc: '#ffffff', al: 'center',
              b: [{ t: 'Explore Notes', a: 'notes', u: '', s: 'light' }, { t: 'View PYQs', a: 'pyq', u: '', s: 'dark' }] },
            { id: 'sdef2', on: true, badge: 'Daily motivation', title: 'Small steps, every single day.', text: 'One chapter today is one worry less on exam day.', icon: 'rocket', bg: 'grad', c: ['#0f172a', '#1e3a8a', '#0ea5e9'], p: [0, 55, 130], ang: 135, solid: '#4f46e5', img: '', ov: 35, tc: '#ffffff', al: 'center',
              b: [{ t: 'Start studying', a: 'notes', u: '', s: 'light' }] },
            { id: 'sdef3', on: true, badge: 'Keep the streak alive 🔥', title: 'Consistency beats last-minute cramming.', text: 'Open Notes Bazar daily and watch your progress grow.', icon: 'fire', bg: 'grad', c: ['#f97316', '#ec4899', '#8b5cf6'], p: [0, 55, 110], ang: 135, solid: '#4f46e5', img: '', ov: 35, tc: '#ffffff', al: 'center',
              b: [{ t: 'Take a quick test', a: 'quiz', u: '', s: 'light' }] }
        ];
    };

    /* ----- build one slide element (also used by the editor preview) ----- */
    NB.heroGrad = function (s) {
        var c = s.c, stops = c[2] ? c[0] + ' ' + s.p[0] + '%,' + c[1] + ' ' + s.p[1] + '%,' + c[2] + ' ' + s.p[2] + '%' : c[0] + ',' + c[1];
        return 'linear-gradient(' + s.ang + 'deg,' + stops + ')';
    };
    NB.heroSlide = function (s, k, total) {
        var a = document.createElement('article');
        a.className = 'hs-slide' + (s.al === 'left' ? ' hs-left' : '') + (s.tc !== '#ffffff' ? ' hs-tc' : '');
        a.setAttribute('aria-roledescription', 'slide'); a.setAttribute('aria-label', (k + 1) + ' of ' + total);
        if (s.tc !== '#ffffff') a.style.color = s.tc;
        if (s.bg === 'grad') { a.classList.add('hs-c'); a.style.background = NB.heroGrad(s); }
        else if (s.bg === 'solid') { a.classList.add('hs-c'); a.style.background = s.solid; }
        else if (s.bg === 'img' && s.img) {
            var o = (s.ov / 100).toFixed(2);
            a.style.backgroundImage = 'linear-gradient(rgba(0,0,0,' + o + '),rgba(0,0,0,' + o + ')),url("' + s.img + '")';
            a.style.backgroundSize = 'cover'; a.style.backgroundPosition = 'center';
        } else a.classList.add('dynamic-bg');                       // "theme" (and image without a link)
        var e;
        if (s.icon) { e = document.createElement('i'); e.className = 'fa-solid fa-' + s.icon + ' hs-deco'; e.setAttribute('aria-hidden', 'true'); a.appendChild(e); }
        if (s.badge) { e = document.createElement('span'); e.className = 'hs-badge'; e.textContent = s.badge; a.appendChild(e); }
        if (s.title) { e = document.createElement('h2'); e.className = 'hs-h'; e.textContent = s.title; a.appendChild(e); }
        if (s.text) { e = document.createElement('p'); e.className = 'hs-p'; e.textContent = s.text; a.appendChild(e); }
        if (s.b.length) {
            var w = document.createElement('div'); w.className = 'hs-btns';
            s.b.forEach(function (b) {
                var x = document.createElement('button'); x.type = 'button';
                x.className = b.s === 'dark' ? 'hs-b2' : (b.s === 'outline' ? 'hs-b2 hs-b3' : 'hs-b1');
                x.setAttribute('data-ha', b.a); if (b.u) x.setAttribute('data-hu', b.u);
                x.textContent = b.t; w.appendChild(x);
            });
            a.appendChild(w);
        }
        return a;
    };
    NB.heroAct = function (a, u) {
        var W = window;
        try {
            if (a === 'notes' || a === 'pyq' || a === 'books') { if (W.switchView) W.switchView(a); }
            else if (a === 'quiz') { if (NB.openQuiz) NB.openQuiz(); }
            else if (a === 'ai') { if (W.openModal) W.openModal('aiModal'); }
            else if (a === 'support') { if (W.openModal) W.openModal('supportModal'); }
            else if (a === 'calc') { if (NB.openCalc) NB.openCalc(); }
            else if (a === 'link' && /^https?:\/\//i.test(u || '')) W.open(u, '_blank', 'noopener,noreferrer');
        } catch (e) {}
    };

    /* ----- storage: device cache (no flash on reload) + Firebase (source of truth) ----- */
    function readCache() { try { return JSON.parse(localStorage.getItem(HKEY)); } catch (e) { return null; } }
    function writeCache(cfg) { try { if (cfg) localStorage.setItem(HKEY, JSON.stringify(cfg)); else localStorage.removeItem(HKEY); } catch (e) {} }
    NB.heroFetch = function () {
        return fetch(NB.HERO_URL, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) { return d ? NB.heroClean(d) : null; });
    };

    /* ----- the slider itself ----- */
    var box, track, dots, defHTML = '', i = 0, N = 0, timer = null, held = false, DELAY = 5500, AUTO = true, shown = '', lastFetch = 0;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    function paint() { Array.prototype.forEach.call(dots.children, function (b, k) { b.setAttribute('aria-selected', k === i % N ? 'true' : 'false'); }); }
    function pos(animate) { track.classList.toggle('no-anim', !animate); track.style.transform = 'translateX(-' + (i * 100) + '%)'; paint(); }
    function go(n) { if (N < 2) return; i = n; pos(true); }
    function next() { if (N < 2) return; i = i + 1; pos(true); }
    function prev() { if (N < 2) return; if (i === 0) { i = N; pos(false); void track.offsetWidth; } i = i - 1; pos(true); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() { stop(); if (reduce || held || document.hidden || !AUTO || N < 2) return; timer = setInterval(next, DELAY); }

    function setup() {                                            // (re)count the slides, add the loop clone + dots
        stop(); dots.innerHTML = '';
        var kids = Array.prototype.slice.call(track.children); N = kids.length; i = 0;
        box.style.display = N ? '' : 'none';                      // admin hid every slide -> no hero at all
        track.classList.add('no-anim'); track.style.transform = 'translateX(0)';
        if (N < 2) return;
        var clone = kids[0].cloneNode(true); clone.setAttribute('aria-hidden', 'true');
        Array.prototype.forEach.call(clone.querySelectorAll('button,a'), function (e) { e.tabIndex = -1; });
        track.appendChild(clone);                                 // first slide repeated at the end -> endless right-to-left loop
        for (var k = 0; k < N; k++) (function (k) {
            var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', 'Go to slide ' + (k + 1));
            b.addEventListener('click', function () { go(k); start(); }); dots.appendChild(b);
        })(k);
        pos(false); start();
    }
    function render(cfg) {                                        // cfg === null -> the slides from index.html
        if (cfg) {
            track.innerHTML = '';
            cfg.slides.filter(function (s) { return s.on; }).forEach(function (s, k, a) { track.appendChild(NB.heroSlide(s, k, a.length)); });
            DELAY = cfg.delay * 1000; AUTO = cfg.auto; dots.style.display = cfg.dots ? '' : 'none';
        } else { track.innerHTML = defHTML; DELAY = 5500; AUTO = true; dots.style.display = ''; }
        setup();
    }
    NB.heroApply = function (cfg) {                               // called after the admin publishes (and after every remote change)
        shown = cfg ? JSON.stringify(cfg) : ''; writeCache(cfg);
        if (box) render(cfg);
    };
    function remote() {
        lastFetch = Date.now();
        NB.heroFetch().then(function (cfg) { if ((cfg ? JSON.stringify(cfg) : '') !== shown) NB.heroApply(cfg); }).catch(function () {});
    }

    function init() {
        box = document.getElementById('heroSlider'); track = document.getElementById('hsTrack');
        if (!box || !track) return;
        dots = box.querySelector('.hs-dots'); defHTML = track.innerHTML;
        track.addEventListener('transitionend', function (e) { if (e.target === track && i >= N) { i = 0; pos(false); } });
        track.addEventListener('click', function (e) {            // buttons of admin-made slides
            var b = e.target.closest ? e.target.closest('button[data-ha]') : null;
            if (b) NB.heroAct(b.getAttribute('data-ha'), b.getAttribute('data-hu'));
        });
        box.addEventListener('mouseenter', function () { held = true; stop(); });
        box.addEventListener('mouseleave', function () { held = false; start(); });
        box.addEventListener('focusin', function () { held = true; stop(); });
        box.addEventListener('focusout', function () { held = false; start(); });
        document.addEventListener('visibilitychange', function () { start(); if (!document.hidden && Date.now() - lastFetch > 12e4) remote(); });
        // swipe
        var sx = 0, sy = 0, dx = 0, drag = false;
        box.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; drag = true; held = true; stop(); }, { passive: true });
        box.addEventListener('touchmove', function (e) { if (!drag) return; var t = e.touches[0]; dx = t.clientX - sx; if (Math.abs(t.clientY - sy) > Math.abs(dx)) drag = false; }, { passive: true });
        box.addEventListener('touchend', function () { if (drag && Math.abs(dx) > 40) { if (dx < 0) next(); else prev(); } drag = false; held = false; start(); });
        var c = readCache(), cfg = c ? NB.heroClean(c) : null;
        shown = cfg ? JSON.stringify(cfg) : '';
        render(cfg);
        remote();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* ---------- Hero customizer (Admin Dashboard > "Hero" button): edit / add / reorder / hide slides, publish to everyone ---------- */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var $ = function (id) { return document.getElementById(id); };
    var h = function (s) { return NB.esc(s); };
    var FBV = 'https://www.gstatic.com/firebasejs/10.8.0/';
    var MAXS = 10;
    var st = null;                                                // { cfg, sel, dirty }
    var ICONS = ['graduation-cap', 'rocket', 'fire', 'book', 'book-open', 'lightbulb', 'star', 'trophy', 'bolt', 'heart', 'flask', 'atom', 'pen', 'pencil', 'clock', 'calendar-check', 'medal', 'bell', 'gift', 'brain', 'school', 'seedling', 'bullhorn', 'comments'];
    var PRESETS = [
        { n: 'Indigo', c: ['#4f46e5', '#7c3aed', ''], p: [0, 55, 110] },
        { n: 'Ocean', c: ['#0f172a', '#1e3a8a', '#0ea5e9'], p: [0, 55, 130] },
        { n: 'Sunset', c: ['#f97316', '#ec4899', '#8b5cf6'], p: [0, 55, 110] },
        { n: 'Forest', c: ['#065f46', '#059669', '#34d399'], p: [0, 55, 110] },
        { n: 'Rose', c: ['#be123c', '#f43f5e', '#fb923c'], p: [0, 55, 110] },
        { n: 'Night', c: ['#0f172a', '#334155', ''], p: [0, 55, 110] }
    ];

    /* ----- helpers ----- */
    function deep(o) { return JSON.parse(JSON.stringify(o)); }
    function pad(cfg) {                                           // editor always shows 2 button rows per slide
        cfg.slides.forEach(function (s) { while (s.b.length < 2) s.b.push({ t: '', a: 'notes', u: '', s: 'light' }); });
        return cfg;
    }
    function startCfg(fromNet) {
        var c = fromNet;
        if (c === undefined) { try { c = NB.heroClean(JSON.parse(localStorage.getItem('nb_hero'))); } catch (e) { c = null; } }
        if (!c) c = NB.heroClean({ auto: true, delay: 5.5, dots: true, slides: NB.heroDefaults() });
        return pad(deep(c));
    }
    function slide() { return st && st.cfg.slides[st.sel]; }
    function msg(t, kind) { var m = $('hzMsg'); if (m) { m.textContent = t || ''; m.className = 'hz-msg' + (kind ? ' ' + kind : ''); } }
    function dirty() { st.dirty = true; msg(''); }
    function validUrl(v) { return /^https?:\/\/[^\s"'<>\\]+$/i.test(String(v || '').trim()); }

    /* ----- admin sign-in (the dashboard login lives in app.js as the default Firebase app) ----- */
    async function adminUser() {
        var A = await import(FBV + 'firebase-app.js'), U = await import(FBV + 'firebase-auth.js');
        var app = A.getApps().filter(function (x) { return x.name === '[DEFAULT]'; })[0] || A.initializeApp(NB.FBCFG);
        var auth = U.getAuth(app);
        if (auth.authStateReady) await auth.authStateReady();
        var u = auth.currentUser;
        if (!u || (NB.USER_DOMAIN && (u.email || '').slice(-NB.USER_DOMAIN.length) === NB.USER_DOMAIN)) return null;
        return u;
    }
    async function write(method, body) {
        var u = null, tok = '';
        try { u = await adminUser(); if (u) tok = await u.getIdToken(); } catch (e) {}
        var r = await fetch(NB.HERO_URL + (tok ? '?auth=' + encodeURIComponent(tok) : ''), { method: method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
        if (!r.ok) { var er = new Error('HTTP ' + r.status); er.status = r.status; er.email = u && u.email; throw er; }
    }
    function ruleText(email) {
        return '"notes_bazar_hero": {\n  ".read": true,\n  ".write": "auth != null && auth.token.email == \'' + (email ? String(email).toLowerCase() : 'YOUR_ADMIN_EMAIL') + '\'"\n}';
    }
    function fillRule(email) { var r = $('hzRuleTxt'); if (r) r.textContent = ruleText(email); }

    /* ----- rendering ----- */
    function renderPrev() {
        var box = $('hzPrev'), s = slide(); box.innerHTML = '';
        if (!s) { box.innerHTML = '<div class="hz-empty">No slides yet. Press <b>Add slide</b>.</div>'; return; }
        var c = NB.heroClean({ slides: [s] }).slides[0];
        var w = document.createElement('div'); w.className = 'hs';
        var t = document.createElement('div'); t.className = 'hs-track';
        t.appendChild(NB.heroSlide(c, st.sel, st.cfg.slides.length)); w.appendChild(t); box.appendChild(w);
        if (!s.on) { var n = document.createElement('div'); n.className = 'hz-hid'; n.textContent = 'Hidden: this slide is not shown on Home'; box.appendChild(n); }
    }
    function renderStrip() {
        var a = st.cfg.slides;
        $('hzStrip').innerHTML = a.map(function (x, k) {
            return '<div class="hz-chip' + (k === st.sel ? ' sel' : '') + (x.on ? '' : ' off') + '" role="button" tabindex="0" data-i="' + k + '"><b>' + (k + 1) + '</b><span>' + h(x.title || 'Untitled') + '</span>' + (x.on ? '' : '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i>') + '</div>';
        }).join('');
        $('hzCount').textContent = a.length + ' / ' + MAXS + ' slides';
        var s = slide(), v = $('hzVis');
        v.innerHTML = s && !s.on ? '<i class="fa-solid fa-eye"></i> Show' : '<i class="fa-solid fa-eye-slash"></i> Hide';
        ['hzUp', 'hzDown', 'hzDup', 'hzVis', 'hzDel'].forEach(function (id) { $(id).disabled = !s; });
        if (s) { $('hzUp').disabled = st.sel === 0; $('hzDown').disabled = st.sel === a.length - 1; }
        $('hzAdd').disabled = a.length >= MAXS;
    }
    function fld(label, inner, cls) { return '<label class="hz-f' + (cls ? ' ' + cls : '') + '"><span class="nbo-l">' + label + '</span>' + inner + '</label>'; }
    function inp(key, val, max, ph) { return '<input class="nbo-in" data-f="' + key + '" maxlength="' + max + '" value="' + h(val) + '" placeholder="' + h(ph || '') + '" autocomplete="off">'; }
    function colorF(label, key, val) { return fld(label, '<span class="hz-col"><input type="color" data-f="' + key + '" value="' + h(val) + '"><code>' + h(val) + '</code></span>'); }
    function range(key, val, min, max, step, unit) { return '<div class="hz-rng"><input type="range" data-f="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><output class="hz-out" data-u="' + unit + '">' + val + unit + '</output></div>'; }
    function seg(attr, cur, list) { return '<div class="hz-seg">' + list.map(function (x) { return '<button type="button" class="hz-btn" data-' + attr + '="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>'; }
    function renderForm() {
        var s = slide(), el = $('hzForm');
        if (!s) { el.innerHTML = ''; return; }
        var o = '';
        o += '<section class="hz-sec"><h4>Text</h4><div class="hz-grid hz-2">' + fld('Small badge (optional)', inp('badge', s.badge, 40, 'e.g. New PYQs added 🎉')) + fld('Heading', inp('title', s.title, 90, 'Main heading')) + '</div>'
           + fld('Paragraph (optional)', '<textarea class="nbo-in" rows="2" maxlength="200" data-f="text" placeholder="One or two short lines">' + h(s.text) + '</textarea>') + '</section>';
        o += '<section class="hz-sec"><h4>Background</h4>' + seg('bg', s.bg, [['theme', 'Theme colour'], ['grad', 'Gradient'], ['solid', 'Solid colour'], ['img', 'Image']]);
        if (s.bg === 'theme') o += '<p class="hz-note">Follows the site’s current theme colour automatically.</p>';
        if (s.bg === 'grad') {
            o += '<div class="hz-sws">' + PRESETS.map(function (p, k) { return '<button type="button" class="hz-sw" data-preset="' + k + '" style="background:' + NB.heroGrad({ c: p.c, p: p.p, ang: 135 }) + '" title="' + p.n + '" aria-label="' + p.n + ' preset"></button>'; }).join('') + '</div>'
               + '<div class="hz-grid hz-3">' + colorF('Colour 1', 'c0', s.c[0]) + colorF('Colour 2', 'c1', s.c[1]) + (s.c[2] ? colorF('Colour 3', 'c2', s.c[2]) : '') + '</div>'
               + '<label class="hz-chk"><input type="checkbox" data-f="c2on"' + (s.c[2] ? ' checked' : '') + '> Use a 3rd colour</label>'
               + fld('Angle', range('ang', s.ang, 0, 360, 5, '°'));
        }
        if (s.bg === 'solid') o += '<div class="hz-grid hz-3">' + colorF('Colour', 'solid', s.solid) + '</div>';
        if (s.bg === 'img') o += fld('Image link (https://…)', inp('img', s.img, 500, 'https://example.com/banner.jpg')) + fld('Dark overlay (keeps the text readable)', range('ov', s.ov, 0, 85, 5, '%'))
            + '<p class="hz-note">Paste a direct image link. Keep the picture small (under ~300 KB) so Home stays fast.</p>';
        o += '</section>';
        o += '<section class="hz-sec"><h4>Text style &amp; icon</h4><div class="hz-grid hz-2">' + colorF('Text colour', 'tc', s.tc) + fld('Alignment', seg('al', s.al, [['center', 'Center'], ['left', 'Left']])) + '</div>'
           + '<span class="nbo-l">Decoration icon (faded, bottom-right)</span><div class="hz-icons"><button type="button" class="hz-ic" data-icon="none" aria-pressed="' + (!s.icon) + '" title="No icon"><i class="fa-solid fa-ban"></i></button>'
           + ICONS.map(function (n) { return '<button type="button" class="hz-ic" data-icon="' + n + '" aria-pressed="' + (s.icon === n) + '" title="' + n + '"><i class="fa-solid fa-' + n + '"></i></button>'; }).join('') + '</div></section>';
        o += '<section class="hz-sec"><h4>Buttons</h4><p class="hz-note" style="margin-top:0">Leave a label empty to hide that button.</p>';
        for (var j = 0; j < 2; j++) {
            var b = s.b[j];
            o += '<div class="hz-brow"><b>Button ' + (j + 1) + '</b><div class="hz-grid hz-3">' + fld('Label', inp('b' + j + 't', b.t, 24, j ? 'Optional' : 'e.g. Explore Notes'))
               + fld('What it does', '<select class="nbo-in" data-f="b' + j + 'a">' + NB.HERO_ACTIONS.map(function (a) { return '<option value="' + a[0] + '"' + (b.a === a[0] ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select>')
               + fld('Look', '<select class="nbo-in" data-f="b' + j + 's">' + [['light', 'Light (white)'], ['dark', 'Dark'], ['outline', 'Outline']].map(function (a) { return '<option value="' + a[0] + '"' + (b.s === a[0] ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select>') + '</div>'
               + (b.a === 'link' ? fld('Link (https://…)', inp('b' + j + 'u', b.u, 500, 'https://')) : '') + '</div>';
        }
        o += '</section>';
        el.innerHTML = o;
    }
    function renderGlobal() {
        $('hzAuto').checked = st.cfg.auto; $('hzDots').checked = st.cfg.dots;
        $('hzDelay').value = st.cfg.delay; $('hzDelayOut').textContent = st.cfg.delay + ' s';
    }
    function renderAll() { renderPrev(); renderStrip(); renderForm(); renderGlobal(); }

    /* ----- edits ----- */
    var TXT = { badge: 1, title: 1, text: 1, solid: 1, img: 1, tc: 1 };
    function setField(k, v, committed) {
        var s = slide(), m;
        if (!s) return;
        if ((m = /^b([01])([tasu])$/.exec(k))) { s.b[+m[1]][m[2]] = v; if (m[2] === 'a' && committed) renderForm(); }
        else if (/^c[012]$/.test(k)) s.c[+k.charAt(1)] = v;
        else if (k === 'c2on') { s.c[2] = v ? (s.c[2] || '#0ea5e9') : ''; renderForm(); }
        else if (k === 'ang' || k === 'ov') s[k] = +v;
        else if (TXT[k]) s[k] = v;
        else return;
        dirty(); renderPrev(); if (k === 'title') renderStrip();
    }
    function onField(e) {
        var t = e.target, k = t.getAttribute && t.getAttribute('data-f');
        if (!k) return;
        if (t.type === 'checkbox' && e.type !== 'change') return;
        if (t.tagName === 'SELECT' && e.type !== 'change') return;
        if (t.type === 'color' && t.nextElementSibling) t.nextElementSibling.textContent = t.value;
        if (t.type === 'range') { var o = t.parentNode.querySelector('.hz-out'); if (o) o.textContent = t.value + (o.getAttribute('data-u') || ''); }
        setField(k, t.type === 'checkbox' ? t.checked : t.value, e.type === 'change');
    }
    function newSlide() {
        return { id: 's' + Math.random().toString(36).slice(2, 9), on: true, badge: 'New', title: 'Your heading here', text: 'Write one or two short, useful lines.', icon: 'star', bg: 'grad', c: ['#4f46e5', '#7c3aed', ''], p: [0, 55, 110], ang: 135, solid: '#4f46e5', img: '', ov: 35, tc: '#ffffff', al: 'center',
            b: [{ t: 'Explore Notes', a: 'notes', u: '', s: 'light' }, { t: '', a: 'notes', u: '', s: 'light' }] };
    }
    function act(w) {
        var a = st.cfg.slides, s = slide(), k = st.sel, t;
        if (w === 'add') { if (a.length >= MAXS) { msg('You can have up to ' + MAXS + ' slides.', 'err'); return; } a.push(newSlide()); st.sel = a.length - 1; }
        else if (!s) return;
        else if (w === 'up' && k > 0) { t = a[k]; a[k] = a[k - 1]; a[k - 1] = t; st.sel = k - 1; }
        else if (w === 'down' && k < a.length - 1) { t = a[k]; a[k] = a[k + 1]; a[k + 1] = t; st.sel = k + 1; }
        else if (w === 'dup') { if (a.length >= MAXS) { msg('You can have up to ' + MAXS + ' slides.', 'err'); return; } var c = deep(s); c.id = 's' + Math.random().toString(36).slice(2, 9); a.splice(k + 1, 0, c); st.sel = k + 1; }
        else if (w === 'vis') s.on = !s.on;
        else if (w === 'del') { if (!confirm('Delete this slide?')) return; a.splice(k, 1); st.sel = Math.min(k, a.length - 1); }
        else return;
        dirty(); renderAll();
    }
    function onClick(e) {
        var t = e.target.closest ? e.target.closest('[data-bg],[data-al],[data-icon],[data-preset],[data-hz],[data-i]') : null;
        if (!t) return;
        var s = slide(), v;
        if ((v = t.getAttribute('data-hz'))) {
            if (v === 'close') { if (st.dirty && !confirm('Close without publishing? Your changes will be lost.')) return; NB.close('nbHeroEd'); }
            else if (v === 'save') save();
            else if (v === 'reset') reset();
            else if (v === 'copy') copyRule();
            else act(v);
            return;
        }
        if ((v = t.getAttribute('data-i')) !== null) { st.sel = +v; renderStrip(); renderForm(); renderPrev(); return; }
        if (!s) return;
        if ((v = t.getAttribute('data-bg'))) s.bg = v;
        else if ((v = t.getAttribute('data-al'))) s.al = v;
        else if ((v = t.getAttribute('data-icon'))) s.icon = v === 'none' ? '' : v;
        else if ((v = t.getAttribute('data-preset')) !== null) { var p = PRESETS[+v]; s.bg = 'grad'; s.c = p.c.slice(); s.p = p.p.slice(); s.ang = 135; }
        dirty(); renderForm(); renderPrev();
    }

    /* ----- publish / reset ----- */
    function permission(e) {
        msg('Firebase refused the save (permission denied). Add the rule shown below in Firebase Console → Realtime Database → Rules, press Publish there, then try again.', 'err');
        fillRule(e.email); $('hzRule').open = true;
    }
    async function save() {
        var a = st.cfg.slides, k, j, b;
        for (k = 0; k < a.length; k++) {
            if (!a[k].title.trim()) { st.sel = k; renderAll(); msg('Slide ' + (k + 1) + ' needs a heading.', 'err'); return; }
            if (a[k].bg === 'img' && !validUrl(a[k].img)) { st.sel = k; renderAll(); msg('Slide ' + (k + 1) + ': add a valid https:// image link, or pick another background.', 'err'); return; }
            for (j = 0; j < 2; j++) { b = a[k].b[j]; if (b.t.trim() && b.a === 'link' && !validUrl(b.u)) { st.sel = k; renderAll(); msg('Slide ' + (k + 1) + ', button ' + (j + 1) + ': add a valid https:// link.', 'err'); return; } }
        }
        var cfg = NB.heroClean(st.cfg);
        if (!cfg.slides.some(function (s) { return s.on; }) && !confirm('No slide is visible, so the hero section will be hidden on Home. Continue?')) return;
        var btn = $('hzSave'); btn.disabled = true; btn.textContent = 'Publishing…'; msg('');
        try {
            cfg.updatedAt = Date.now();
            await write('PUT', cfg);
            delete cfg.updatedAt;
            NB.heroApply(cfg); st.dirty = false;
            msg('Published ✓ Everyone will see the new hero.', 'ok'); NB.toast('Hero published');
        } catch (e) {
            if (e.status === 401 || e.status === 403) permission(e); else msg('Could not publish. Check your internet connection and try again.', 'err');
        }
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Publish';
    }
    async function reset() {
        if (!confirm('Reset the hero to the original 3 slides for everyone? Your custom slides will be removed.')) return;
        try {
            await write('DELETE');
            NB.heroApply(null); st.cfg = startCfg(null); st.sel = 0; st.dirty = false; renderAll();
            msg('Reset ✓ The original hero is back.', 'ok');
        } catch (e) { if (e.status === 401 || e.status === 403) permission(e); else msg('Could not reset. Check your internet connection and try again.', 'err'); }
    }
    function copyRule() {
        var t = $('hzRuleTxt').textContent;
        try { navigator.clipboard.writeText(t).then(function () { NB.toast('Rule copied'); }, function () { NB.toast('Select the text and copy it'); }); } catch (e) { NB.toast('Select the text and copy it'); }
    }

    /* ----- dialog ----- */
    function build() {
        if ($('nbHeroEd')) return;
        var el = NB.mk('<div id="nbHeroEd" class="nbo" role="dialog" aria-modal="true" aria-labelledby="hzTtl" aria-hidden="true" dir="ltr"><div class="nbo-card hz-card">'
            + '<button type="button" class="nbo-x" data-hz="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>'
            + '<h3 class="nbo-h" id="hzTtl"><i class="fa-solid fa-wand-magic-sparkles dynamic-text"></i> Hero customize</h3>'
            + '<p class="nbo-sub">Edit, add, reorder or hide the slides on the Home page. Changes go live for everyone when you press <b>Publish</b>.</p>'
            + '<div id="hzPrev" class="hz-prev"></div>'
            + '<div class="hz-bar"><span id="hzCount" class="hz-cnt"></span><button type="button" id="hzAdd" class="hz-btn hz-pri" data-hz="add"><i class="fa-solid fa-plus"></i> Add slide</button></div>'
            + '<div id="hzStrip" class="hz-strip"></div>'
            + '<div class="hz-tools"><button type="button" id="hzUp" class="hz-btn" data-hz="up"><i class="fa-solid fa-arrow-left"></i> Move left</button><button type="button" id="hzDown" class="hz-btn" data-hz="down">Move right <i class="fa-solid fa-arrow-right"></i></button>'
            + '<button type="button" id="hzDup" class="hz-btn" data-hz="dup"><i class="fa-solid fa-clone"></i> Duplicate</button><button type="button" id="hzVis" class="hz-btn" data-hz="vis"></button>'
            + '<button type="button" id="hzDel" class="hz-btn hz-danger" data-hz="del"><i class="fa-solid fa-trash"></i> Delete</button></div>'
            + '<div id="hzForm"></div>'
            + '<section class="hz-sec"><h4>Slider settings</h4><div class="hz-grid hz-3">'
            + '<label class="hz-chk"><input type="checkbox" id="hzAuto"> Auto-slide</label>'
            + '<label class="hz-chk"><input type="checkbox" id="hzDots"> Show dots</label>'
            + '<label class="hz-f"><span class="nbo-l">Time per slide</span><div class="hz-rng"><input type="range" id="hzDelay" min="2" max="15" step="0.5"><output id="hzDelayOut" class="hz-out"></output></div></label></div></section>'
            + '<details id="hzRule" class="hz-rule"><summary>First time? One-time Firebase rule</summary>'
            + '<p class="hz-note">Open Firebase Console → Realtime Database → <b>Rules</b>. Paste this block inside <code>"rules": { … }</code> next to your other blocks (add a comma after the previous one) and press <b>Publish</b>. It lets everyone read the hero but only this admin change it.</p>'
            + '<pre id="hzRuleTxt" class="hz-pre"></pre><button type="button" class="hz-btn" data-hz="copy"><i class="fa-solid fa-copy"></i> Copy rule</button></details>'
            + '<div id="hzMsg" class="hz-msg" role="status" aria-live="polite"></div>'
            + '<div class="hz-foot"><button type="button" class="hz-btn hz-danger" data-hz="reset"><i class="fa-solid fa-rotate-left"></i> Reset to original</button><button type="button" id="hzSave" class="hz-btn hz-pri" data-hz="save"><i class="fa-solid fa-cloud-arrow-up"></i> Publish</button></div>'
            + '</div></div>');
        document.body.appendChild(el);
        NB.noClose.nbHeroEd = 1;                                  // no accidental Esc / outside-tap: the X button asks first if there are unsaved edits
        el.addEventListener('click', onClick);
        el.addEventListener('input', onField); el.addEventListener('change', onField);
        el.addEventListener('keydown', function (e) {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('data-i') !== null) { e.preventDefault(); onClick(e); }
        });
        $('hzAuto').addEventListener('change', function () { st.cfg.auto = this.checked; dirty(); });
        $('hzDots').addEventListener('change', function () { st.cfg.dots = this.checked; dirty(); });
        $('hzDelay').addEventListener('input', function () { st.cfg.delay = +this.value; $('hzDelayOut').textContent = this.value + ' s'; dirty(); });
    }
    NB.openHeroEditor = function () {
        build();
        st = { cfg: startCfg(), sel: 0, dirty: false };
        msg(''); $('hzRule').open = false; fillRule('');
        renderAll(); NB.open('nbHeroEd');
        adminUser().then(function (u) { if (u) fillRule(u.email); }).catch(function () {});
        NB.heroFetch().then(function (c) { if (st && !st.dirty) { st.cfg = startCfg(c); st.sel = 0; renderAll(); } }).catch(function () {});
    };
})();

/* =====================================================================
   Header actions: profile menu, mobile search, notifications panel.
   (index.html calls toggleProfileMenu / nbhSearch / nbhDo / openNotifications)
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var $ = function (id) { return document.getElementById(id); };
    function call(fn) { var a = Array.prototype.slice.call(arguments, 1); try { if (typeof window[fn] === 'function') { window[fn].apply(window, a); return true; } } catch (e) { console.warn(fn, e); } return false; }

    function setOpen(wrapBtn, menu, on) {
        if (!menu) return;
        menu.classList.toggle('hidden', !on);
        if (wrapBtn) wrapBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    function closeProfile() { setOpen($('nbhProfileBtn'), $('nbhProfileMenu'), false); }
    function closeNotif() { setOpen($('nbhBell'), $('nbhNotif'), false); }
    function syncSwitches() {
        var de = document.documentElement, d = $('nbhMiDark'), k = $('nbhMiDesktop');
        if (d) d.setAttribute('aria-checked', de.classList.contains('dark') ? 'true' : 'false');
        if (k) k.setAttribute('aria-checked', de.classList.contains('desktop-mode') ? 'true' : 'false');
    }

    window.toggleProfileMenu = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var menu = $('nbhProfileMenu'); if (!menu) return;
        var on = menu.classList.contains('hidden');
        closeNotif();
        if (on) { syncSwitches(); if (NB.ui && NB.ui.refreshAll) NB.ui.refreshAll(); }
        setOpen($('nbhProfileBtn'), menu, on);
    };

    if (typeof window.openNotifications !== 'function') {
        window.openNotifications = function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            var p = $('nbhNotif'); if (!p) return;
            var on = p.classList.contains('hidden');
            closeProfile(); setOpen($('nbhBell'), p, on);
        };
    }

    /* search icon (mobile): jump to the search box of the page you are on */
    window.nbhSearch = function () {
        closeProfile(); closeNotif();
        var view = ['notes', 'books', 'pyq'].filter(function (v) { var el = $(v + 'View'); return el && !el.classList.contains('hidden'); })[0];
        var input;
        if (view) input = $(view + 'SearchInput');
        else {
            var h = $('homeView');
            if (h && h.classList.contains('hidden')) call('switchView', 'home');
            input = $('homeSearchInput');
        }
        if (!input) return;
        setTimeout(function () {
            try { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { input.scrollIntoView(); }
            setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 280);
        }, 60);
    };

    window.nbhDo = function (act) {
        var keepOpen = act === 'dark' || act === 'desktop';
        if (!keepOpen) closeProfile();
        switch (act) {
            case 'profile': if (NB.ui && NB.ui.openProfile) NB.ui.openProfile(); break;
            case 'saved': call('openSaved'); break;
            case 'dl': call('openDownloads'); break;
            case 'notif': setTimeout(function () { window.openNotifications(); }, 0); break;
            case 'desktop': call('toggleSetting', 'desktop'); setTimeout(syncSwitches, 80); break;
            case 'dark':
                if (typeof window.setMode === 'function') call('setMode', document.documentElement.classList.contains('dark') ? 'light' : 'dark');
                else call('openModal', 'themeModal');
                setTimeout(syncSwitches, 80); break;
            case 'settings': if (!call('openSettings')) call('openModal', 'settingsModal'); break;
            case 'plan':
                call('switchView', 'home');
                setTimeout(function () { var s = $('nbPlan'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 250); break;
            case 'help': call('openModal', 'supportModal'); break;
            case 'report': call('openModal', 'complainModal'); break;
            case 'about': call('openModal', 'aboutModal'); break;
            case 'login': if (NB.ui && NB.ui.openAuth) NB.ui.openAuth('login'); break;
            case 'logout': if (NB.ui && NB.ui.askLogout) NB.ui.askLogout(); break;
        }
    };

    /* close popovers on outside tap / Esc */
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t.closest('#nbhProfileWrap')) closeProfile();
        if (!t.closest('#nbhNotifWrap')) closeNotif();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeProfile(); closeNotif(); } });
    window.addEventListener('resize', syncSwitches);

    /* mobile Quick Options: arrow button opens / closes the help cards */
    NB.toggleQuickHelp = function () {
        var g = document.querySelector('#homeQuickSection .qo-grid'), b = $('qoMoreBtn'); if (!g || !b) return;
        var on = !g.classList.contains('qo-open');
        g.classList.toggle('qo-open', on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
    };
})();
