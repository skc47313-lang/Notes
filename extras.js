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
    /* rejects with an empty message when the person cancels (callers ignore empty messages).
       Editor: drag to move, slider / +- / mouse wheel / two-finger pinch to resize (zoom out far enough to fit the whole photo), rotate, fit. */
    NB.cropPhoto = function (img) {
        return new Promise(function (res, rej) {
            var old = document.getElementById('nbCrop'); if (old) { NB.close('nbCrop'); }
            var V = Math.max(200, Math.min(300, window.innerWidth - 72)), OUT = 256, done = false, MAXZ = 5;
            var src = document.createElement('canvas'); src.width = img.naturalWidth || img.width; src.height = img.naturalHeight || img.height;
            src.getContext('2d').drawImage(img, 0, 0);
            var zoom = 1, cx = 0, cy = 0, minZ = 1;
            function calcMin() { minZ = Math.max(0.2, Math.min(1, Math.min(src.width, src.height) / Math.max(src.width, src.height))); }
            calcMin();
            var m = NB.mk('<div class="nbo nbcr" id="nbCrop" aria-hidden="true"><div class="nbo-card nbcr-card" role="dialog" aria-modal="true" aria-label="Adjust profile photo">' +
                '<h3 class="nbo-h">Adjust your photo</h3><p class="nbo-sub">Drag to move. Pinch, scroll or use the slider to zoom.</p>' +
                '<div class="nbcr-stage" id="nbcrStage" style="width:' + V + 'px;height:' + V + 'px"><canvas id="nbcrCv" width="' + V + '" height="' + V + '"></canvas><div class="nbcr-frame"></div></div>' +
                '<div class="nbcr-ctl"><button type="button" class="nbcr-ib" id="nbcrMinus" aria-label="Zoom out"><i class="fa-solid fa-minus"></i></button>' +
                '<input type="range" id="nbcrZoom" min="' + minZ + '" max="' + MAXZ + '" step="0.01" value="1" aria-label="Zoom">' +
                '<button type="button" class="nbcr-ib" id="nbcrPlus" aria-label="Zoom in"><i class="fa-solid fa-plus"></i></button>' +
                '<button type="button" class="nbcr-ib" id="nbcrFit" aria-label="Reset size and position" title="Reset"><i class="fa-solid fa-expand"></i></button>' +
                '<button type="button" class="nbcr-ib" id="nbcrRot" aria-label="Rotate"><i class="fa-solid fa-rotate-right"></i></button></div>' +
                '<button type="button" class="nbo-save" id="nbcrOk">Use this photo</button><button type="button" class="nbo-skip" id="nbcrNo">Cancel</button>' +
                '</div></div>');
            document.body.appendChild(m);
            var cv = document.getElementById('nbcrCv'), zr = document.getElementById('nbcrZoom');
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
            function setZoom(z) { zoom = Math.max(minZ, Math.min(MAXZ, z)); zr.value = zoom; draw(); }
            zr.addEventListener('input', function () { setZoom(+this.value); });
            document.getElementById('nbcrMinus').addEventListener('click', function () { setZoom(zoom - 0.2); });
            document.getElementById('nbcrPlus').addEventListener('click', function () { setZoom(zoom + 0.2); });
            document.getElementById('nbcrFit').addEventListener('click', function () { cx = 0; cy = 0; setZoom(1); });
            document.getElementById('nbcrRot').addEventListener('click', function () {
                var r = document.createElement('canvas'); r.width = src.height; r.height = src.width;
                var x = r.getContext('2d'); x.translate(r.width / 2, r.height / 2); x.rotate(Math.PI / 2); x.drawImage(src, -src.width / 2, -src.height / 2);
                src = r; cx = 0; cy = 0; calcMin(); zr.min = minZ; setZoom(1);
            });
            /* one finger / mouse = move, two fingers = pinch zoom */
            var st = document.getElementById('nbcrStage'), ptrs = {}, pinch0 = 0, zoom0 = 1;
            function ids() { return Object.keys(ptrs); }
            function dist() { var k = ids(), a = ptrs[k[0]], b = ptrs[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
            st.addEventListener('pointerdown', function (e) {
                ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
                try { st.setPointerCapture(e.pointerId); } catch (er) {}
                if (ids().length === 2) { pinch0 = dist(); zoom0 = zoom; }
                e.preventDefault();
            });
            st.addEventListener('pointermove', function (e) {
                var p = ptrs[e.pointerId]; if (!p) return;
                if (ids().length >= 2) {
                    p.x = e.clientX; p.y = e.clientY; setZoom(zoom0 * dist() / pinch0);
                } else {
                    cx += e.clientX - p.x; cy += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; draw();
                }
            });
            function endPtr(e) { delete ptrs[e.pointerId]; if (ids().length === 1) { var q = ptrs[ids()[0]]; if (q) { /* keep remaining finger as a mover */ } } }
            st.addEventListener('pointerup', endPtr); st.addEventListener('pointercancel', endPtr); st.addEventListener('lostpointercapture', endPtr);
            st.addEventListener('wheel', function (e) { e.preventDefault(); setZoom(zoom - e.deltaY * 0.002); }, { passive: false });
            NB.onClose.nbCrop = function () {
                if (!done) { done = true; rej(new Error('')); }
                var n = document.getElementById('nbCrop'); if (n && n.parentNode) n.parentNode.removeChild(n);
                delete NB.onClose.nbCrop;
            };
            document.getElementById('nbcrNo').addEventListener('click', function () { NB.close('nbCrop'); });
            document.getElementById('nbcrOk').addEventListener('click', function () {
                var o = document.createElement('canvas'); o.width = o.height = OUT; paint(o, OUT);
                var url = o.toDataURL('image/jpeg', 0.85);
                done = true; res(url); NB.close('nbCrop');
            });
            draw(); NB.open('nbCrop');
        });
    };

    /* ---------- view / change / remove the profile photo ---------- */
    NB.photoSheet = function () {
        var p = NB.profile(); if (!p) return;
        var has = !!(p.photo && PHOTO_RE.test(p.photo));
        var old = $('nbPhoto'); if (old && old.parentNode) old.parentNode.removeChild(old);
        var letter = Array.from(p.name || '')[0] || '👤';
        var m = NB.mk('<div class="nbo nbph" id="nbPhoto" aria-hidden="true"><div class="nbo-card nbph-card" role="dialog" aria-modal="true" aria-label="Profile photo">' +
            '<button type="button" class="nbo-x" id="nbphX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<div class="nbph-big' + (has ? ' has-photo' : '') + '" id="nbphBig" role="img" aria-label="' + NB.esc(p.name) + '">' + (has ? '' : NB.esc(letter.toUpperCase())) + '</div>' +
            '<b class="nbph-n">' + NB.esc(p.name) + '</b>' +
            '<button type="button" class="nbo-save" id="nbphChange"><i class="fa-solid fa-camera"></i> ' + (has ? 'Change photo' : 'Add photo') + '</button>' +
            (has ? '<button type="button" class="nbph-rm" id="nbphRemove"><i class="fa-regular fa-trash-can"></i> Remove photo</button>' : '') +
            '</div></div>');
        document.body.appendChild(m);
        if (has) $('nbphBig').style.backgroundImage = 'url("' + p.photo + '")';
        function gone() { NB.close('nbPhoto'); }
        NB.onClose.nbPhoto = function () { var n = $('nbPhoto'); if (n && n.parentNode) n.parentNode.removeChild(n); delete NB.onClose.nbPhoto; };
        $('nbphX').addEventListener('click', gone);
        $('nbphChange').addEventListener('click', function () { gone(); var f = $('nbpFile'); if (f) f.click(); });
        var rm = $('nbphRemove');
        if (rm) rm.addEventListener('click', function () {
            var q = NB.profile(); if (!q) return; q.photo = ''; NB.setProfile(q); gone(); ui.refreshAll(); NB.toast('Profile photo removed');
        });
        NB.open('nbPhoto');
    };

    /* ---------- activity days + streak (for the study plan) ---------- */
    NB.days = function () { var d = LSX.get('nb_days', []); return Array.isArray(d) ? d : []; };
    NB.markDay = function () {
        var k = NB.dayKey(), d = NB.days();
        if (d.indexOf(k) < 0) { d.push(k); d.sort(); LSX.set('nb_days', d.slice(-400)); }
        NB.paintStreak();
    };
    /* header streak chip (phone + desktop) */
    NB.paintStreak = function () {
        var n = NB.streak(), b = document.getElementById('nbhStreakN'), c = document.getElementById('nbhStreak');
        if (b) b.textContent = n;
        if (c) { c.setAttribute('aria-label', 'Study streak: ' + n + (n === 1 ? ' day' : ' days')); c.title = 'Study streak: ' + n + (n === 1 ? ' day' : ' days'); c.classList.toggle('on', n > 0); }
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
    var SYNC = { favs: 'nb_favs', recent: 'nb_recent', seen: 'nb_seen', dl: 'nb_dlhist', days: 'nb_days', exam: 'nb_exam', quiz: 'nb_quiz', todo: 'nb_todo' };
    var applying = false, pushT = 0;
    function asArr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); }
    function unionArr(a, b) { var s = {}, o = []; asArr(a).concat(asArr(b)).forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }
    function mergeObj(a, b) { var o = {}, k; a = a || {}; b = b || {}; for (k in b) o[k] = b[k]; for (k in a) o[k] = (o[k] && o[k] < a[k]) ? o[k] : a[k]; return o; }
    function snapshot() {
        var o = { updatedAt: Date.now() };
        Object.keys(SYNC).forEach(function (k) { var v = LSX.get(SYNC[k], null); o[k] = v == null ? null : v; });
        try {   // compact copy of the saved test history (no questions), so the admin can see every test a student took
            var th = LSX.get('nb_tests', []);
            o.tests = Array.isArray(th) ? th.slice(0, 40).map(function (r) { return { t: r.t, title: r.title, subj: r.subj, cls: r.cls, mode: r.mode, src: r.src, score: r.score, total: r.total, secs: r.secs }; }) : null;
        } catch (er) { o.tests = null; }
        try { var ac = JSON.parse(localStorage.getItem('nb_act') || 'null'); o.act = ac && typeof ac === 'object' ? ac : null; o.streak = NB.streak(); o.best = NB.bestStreak ? NB.bestStreak() : 0; } catch (er2) {}
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
        keys[PKEY] = 1; keys['nb_tests'] = 1; keys['nb_act'] = 1;
        Storage.prototype.setItem = function (key) {
            var r = orig.apply(this, arguments);
            try { if (this === window.localStorage && !applying) { if (aiIsKey(key)) NB.scheduleAiPush(); else if (keys[key]) { if (key === PKEY) NB.scheduleProfilePush(); else NB.schedulePush(); } } } catch (e) {}
            return r;
        };
    })();
    /* ---------- Bazar AI chats / memory / XP: synced to the account at /ai ----------
       Local keys are  nb_ai_chats_<userId>, nb_ai_mem_<userId>, nb_ai_xp_<userId>  (same naming as app.js bzUser()). */
    var AI_BASES = ['nb_ai_chats', 'nb_ai_mem', 'nb_ai_xp'], aiPushT = 0, AI_TS = 'nb_ai_sync_ts';
    function aiUid() { var a = NB.account(); return a ? String(a.userId || a.uid || a.id || a.email || 'u') : null; }
    function aiKey(b) { var u = aiUid(); return u ? b + '_' + u : null; }
    function aiIsKey(key) { var u = aiUid(); if (!u || typeof key !== 'string') return false; for (var i = 0; i < AI_BASES.length; i++) if (key === AI_BASES[i] + '_' + u) return true; return false; }
    function aiChatsLocal() { var c = LSX.get(aiKey('nb_ai_chats'), []); return Array.isArray(c) ? c : []; }
    NB.aiPush = async function () {
        if (!NB.loggedIn()) return;
        var ONLY = 'nb_ai_localonly';   // chats that could not fit in the cloud: they stay on this device only
        try {
            var all = aiChatsLocal().filter(function (c) { return c && c.id && Array.isArray(c.msgs); }).sort(function (a, b) { return b.ts - a.ts; });
            var mem = LSX.get(aiKey('nb_ai_mem'), {}) || {}, xp = LSX.get(aiKey('nb_ai_xp'), {}) || {};
            var keep = all.length, done = false, lastErr = null;
            while (keep > 0 && !done) {
                var chats = all.slice(0, keep), body = { updatedAt: Date.now(), chats: chats, mem: mem, xp: xp };
                if (JSON.stringify(body).length > 3000000) { keep = Math.max(1, Math.floor(keep / 2)); if (keep === 1 && JSON.stringify({ chats: all.slice(0, 1) }).length > 3000000) break; continue; }
                try { await cloud('PUT', '/ai', body); done = true; }
                catch (e) { lastErr = e; if (e.status === 413 && keep > 1) keep = Math.floor(keep / 2); else break; }   // cloud says "too big": upload fewer chats
            }
            if (!done) {
                if (lastErr && (lastErr.status === 401 || lastErr.status === 403)) NB.cloudOk = false;
                if (lastErr) console.warn('AI chat push failed, chats stay on this device', lastErr);
                return;   // nothing changed in the cloud; everything is still safe in this device's storage
            }
            var left = all.slice(keep).map(function (c) { return c.id; });
            if (left.length) { LSX.set(ONLY, left); if (!NB.aiFullWarned) { NB.aiFullWarned = true; NB.toast('Cloud storage is full. Your older AI chats are saved on this device only.', 5200); } }
            else LSX.del(ONLY);
            LSX.set(AI_TS, Date.now()); NB.cloudOk = true;
        } catch (e) { console.warn('AI chat push failed', e); if (e.status === 401 || e.status === 403) NB.cloudOk = false; }
    };
    NB.scheduleAiPush = function () { if (!NB.loggedIn() || applying) return; clearTimeout(aiPushT); aiPushT = setTimeout(NB.aiPush, 2500); };
    /* mode 'union' = keep everything from both sides (login); 'cloud' = the account is the truth, but chats changed here since the last sync are kept */
    NB.aiPull = async function (mode) {
        if (!NB.loggedIn()) return;
        try {
            var c = await cloud('GET', '/ai');
            NB.cloudOk = true;
            var lastSync = LSX.get(AI_TS, 0) || 0, local = aiChatsLocal();
            if (!c || !c.chats) { if (local.length) await NB.aiPush(); return; }   // first time: upload what this device already has
            if (mode !== 'union' && (c.updatedAt || 0) <= lastSync) return;          // nothing newer in the cloud
            var cc = asArr(c.chats).filter(function (x) { return x && x.id && Array.isArray(x.msgs || (x.msgs = [])); }), byId = {}, out = [], changedLocal = false;
            local.forEach(function (x) { if (x && x.id) byId[x.id] = x; });
            cc.forEach(function (x) { var l = byId[x.id]; out.push(l && (l.ts || 0) > (x.ts || 0) ? l : x); if (l) delete byId[x.id]; });
            var only = LSX.get('nb_ai_localonly', []) || [];
            Object.keys(byId).forEach(function (id) { var l = byId[id]; if (mode === 'union' || (l.ts || 0) > lastSync || only.indexOf(id) >= 0) { out.push(l); changedLocal = true; } });   // unsynced local chats survive
            out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); out = out.slice(0, 40);
            applying = true;
            try {
                LSX.set(aiKey('nb_ai_chats'), out);
                var lm = LSX.get(aiKey('nb_ai_mem'), {}) || {}, cm = c.mem && typeof c.mem === 'object' ? c.mem : {};
                LSX.set(aiKey('nb_ai_mem'), mode === 'union' ? Object.assign({}, cm, lm) : (Object.keys(lm).length && !(c.updatedAt > lastSync) ? lm : cm));
                var lx = LSX.get(aiKey('nb_ai_xp'), {}) || {}, cx = c.xp && typeof c.xp === 'object' ? c.xp : {};
                LSX.set(aiKey('nb_ai_xp'), (+cx.xp || 0) > (+lx.xp || 0) ? cx : lx);
            } finally { applying = false; }
            LSX.set(AI_TS, Date.now());
            if (typeof window.nbApplyAiRemote === 'function') { try { window.nbApplyAiRemote(); } catch (e) { console.warn(e); } }
            if (changedLocal) NB.scheduleAiPush();
        } catch (e) { console.warn('AI chat pull failed', e); if (e.status === 401 || e.status === 403) NB.cloudOk = false; }
    };
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
            try { if (c.act && typeof c.act === 'object') { var la = JSON.parse(localStorage.getItem('nb_act') || '{}') || {}; Object.keys(c.act).forEach(function (dk) { var cd = c.act[dk] || {}, ld = la[dk] || (la[dk] = {}); Object.keys(cd).forEach(function (kk) { ld[kk] = Math.max(+ld[kk] || 0, +cd[kk] || 0); }); }); localStorage.setItem('nb_act', JSON.stringify(la)); } } catch (e) {}
            if (c.todo && Array.isArray(c.todo.items) || c.todo && c.todo.w) {
                var lt = LSX.get('nb_todo', null), ct = { w: c.todo.w, items: asArr(c.todo.items) };
                if (mode === 'cloud' || !lt || !lt.w || lt.w < ct.w) LSX.set('nb_todo', ct);
                else if (lt.w === ct.w) { var ids = {}; lt.items = asArr(lt.items); lt.items.forEach(function (x) { ids[x.id] = 1; }); ct.items.forEach(function (x) { if (!ids[x.id]) lt.items.push(x); }); LSX.set('nb_todo', lt); }
            } else if (mode === 'cloud') LSX.del('nb_todo');
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
        LSX.del(AI_TS);
        await NB.aiPull('union');   // bring this account's AI chat history onto this device
        return cred.user;
    };
    var PERSONAL = ['nb_profile', 'nb_acct', 'nb_favs', 'nb_recent', 'nb_seen', 'nb_dlhist', 'nb_days', 'nb_exam', 'nb_quiz', 'nb_todo', 'nb_ai_test', 'nb_act', 'nb_ai_seen', 'nb_sync_ts', 'nb_filters_v1', 'nb_recent_q', 'nb_reported'];
    NB.logout = async function () {
        try { await NB.pushNow(); } catch (e) {}
        try { clearTimeout(aiPushT); await NB.aiPush(); } catch (e) {}
        var aiLocal = AI_BASES.map(aiKey).filter(Boolean);   // remember this user's local AI keys before the account is cleared
        try { var s = await authSdk(); await s.au.signOut(s.auth); } catch (e) {}
        applying = true; PERSONAL.concat(aiLocal, [AI_TS, 'nb_ai_localonly']).forEach(function (k) { LSX.del(k); }); applying = false;
        if (typeof window.nbApplyAiRemote === 'function') { try { window.nbApplyAiRemote(); } catch (e) {} }
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
            await NB.aiPull('cloud');
            return u;
        } catch (e) { console.warn('restore failed', e); return 'offline'; }
    };
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && NB.loggedIn()) { NB.pull('cloud'); NB.aiPull('cloud'); } });
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
    var A = { mode: 'login', cls: '', photo: '' };
    function buildAuth() {
        var m = NB.mk('<div class="nbo" id="nbAuth" aria-hidden="true"><div class="nbo-card" role="dialog" aria-modal="true" aria-labelledby="nbaTitle">' +
            '<button type="button" class="nbo-x" id="nbaX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<div class="nba-brand"><svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><use href="#nbLogo"/></svg><b id="nbaTitle">Notes Bazar</b></div>' +
            '<div class="nba-tabs" role="tablist"><button type="button" role="tab" data-m="login" aria-selected="true">Log in</button><button type="button" role="tab" data-m="signup" aria-selected="false">Create account</button></div>' +
            '<p class="nbo-sub" id="nbaSub"></p>' +
            '<form id="nbaForm" novalidate autocomplete="on">' +
            '<div class="nba-photo" data-only="signup"><button type="button" class="nb-av nb-av-lg" id="nbaAv" aria-label="Add profile photo"><i class="fa-solid fa-camera"></i></button><small>Profile photo<br>(optional)</small><input type="file" id="nbaFile" accept="image/*" class="nb-hide"></div>' +
            '<div data-only="signup"><label class="nbo-l" for="nbaName">Full name</label><input id="nbaName" class="nbo-in" type="text" maxlength="30" autocomplete="name" placeholder="Your name"></div>' +
            '<div data-only="signup"><label class="nbo-l">Class</label><div class="nbo-cls" id="nbaCls" role="group" aria-label="Class"></div></div>' +
            '<label class="nbo-l" for="nbaId">User ID</label><input id="nbaId" class="nbo-in" type="text" maxlength="20" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. rahul_10">' +
            '<div class="nba-hint" data-only="signup">4–20 characters: letters, numbers, dot or underscore.</div>' +
            '<label class="nbo-l" for="nbaPw">Password</label><div class="nba-pw"><input id="nbaPw" class="nbo-in" type="password" maxlength="64" autocomplete="new-password" placeholder="At least 6 characters"><button type="button" id="nbaEye" aria-label="Show or hide password"><i class="fa-solid fa-eye"></i></button></div>' +
            '<div id="nbaErr" class="nbo-err" role="alert"></div>' +
            '<button type="submit" id="nbaGo" class="nbo-save">Log in</button>' +
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
        authMode(mode || 'login');
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
        $('nbpAv').addEventListener('click', function () { NB.photoSheet(); });
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
            $('nbPlanWeek').addEventListener('click', function (ev) { var b = ev.target.closest('[data-day]'); if (b && NB.openTodo) NB.openTodo(b.dataset.day); });
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
            var tc = NB.todoCount ? NB.todoCount(k) : { n: 0, done: 0 };
            h += '<button type="button" class="nbs-dc" data-day="' + k + '" aria-label="Plan ' + d.toDateString() + (tc.n ? ' (' + tc.n + ' to-do)' : '') + '"><span>' + L + '</span><span class="nbs-d ' + cls + '">' + (cls === 'done' ? '<i class="fa-solid fa-check"></i>' : d.getDate()) + (tc.n ? '<i class="nbs-td' + (tc.done === tc.n ? ' all' : '') + '"></i>' : '') + '</span></button>';
        });
        wk.innerHTML = h;
        var st = NB.streak(), total = NB.days().length;
        $('nbPlanFoot').textContent = st > 1 ? st + '-day streak · ' + total + ' study days so far' : 'Open Notes Bazar every day to build your streak';
        var hint = $('nbPlanHint');
        if (!hint) { hint = document.createElement('div'); hint.id = 'nbPlanHint'; hint.className = 'nbs-hint'; $('nbPlanFoot').parentNode.appendChild(hint); }
        hint.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> Tap a day to plan your study, set targets and reminders';
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
        renderPlan(); NB.paintStreak();
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
            if (v === 'home') NB.markDay('visit');
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
                '<button type="button" class="nbai-cta" id="nbqAi"><i class="fa-solid fa-wand-magic-sparkles"></i><span><b>Make a test with AI</b><small>Any topic, any chapter. Chat with the AI and get your own test</small></span><i class="fa-solid fa-chevron-right"></i></button>' +
                '<label class="nbo-l">Test type</label><div class="nbq-modes"><button type="button" class="nbq-mode" data-m="practice" aria-pressed="' + (QZ.mode === 'practice') + '"><b>Practice quiz</b><small>10 questions · instant answers</small></button>' +
                '<button type="button" class="nbq-mode" data-m="mock" aria-pressed="' + (QZ.mode === 'mock') + '"><b>Mock test</b><small>20 questions · 20 min timer</small></button></div>' +
                '<label class="nbo-l">Subject</label><div class="nbq-chips" id="nbqSubs">' + subs.map(function (s) { return '<button type="button" data-s="' + NB.esc(s) + '" aria-pressed="' + (QZ.subj === s) + '">' + NB.esc(s) + '</button>'; }).join('') + '</div>' +
                '<label class="nbo-l" for="nbqCls">Class level</label><select id="nbqCls" class="nbo-in">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return '<option value="' + n + '"' + (n === QZ.cls ? ' selected' : '') + '>Class ' + n + '</option>'; }).join('') + '</select>' +
                '<div class="nbo-err" id="nbqErr"></div><button type="button" class="nbo-save" id="nbqStart">Start</button><button type="button" class="nbo-skip" id="nbqHistBtn">📊 Test history &amp; progress</button>' +
                (hist.length ? '<div class="nbq-hist" style="margin-top:12px"><b>Recent results</b><br>' + hist.map(function (r) { return NB.esc(r.mode === 'mock' ? 'Mock' : 'Practice') + ' · ' + NB.esc(r.subj) + ' · Class ' + r.cls + ' · <b>' + r.score + '/' + r.total + '</b> · ' + new Date(r.t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }).join('<br>') + '</div>' : '');
            body.innerHTML = h;
            body.querySelectorAll('.nbq-mode').forEach(function (b) { b.addEventListener('click', function () { QZ.mode = b.dataset.m; body.querySelectorAll('.nbq-mode').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }); });
            $('nbqSubs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; QZ.subj = b.dataset.s; Array.prototype.forEach.call(this.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); });
            $('nbqCls').addEventListener('change', function () { QZ.cls = parseInt(this.value, 10); });
            $('nbqStart').addEventListener('click', function () { QZ.src = 'bank'; quizStart(); }); $('nbqHistBtn').addEventListener('click', NB.openTestHistory);
            $('nbqAi').addEventListener('click', aiScreen); qpCta();
        }).catch(function () {
            body.innerHTML = '<h3 class="nbo-h">Tests</h3><p class="nbo-sub">The built-in questions could not be loaded. Check your internet connection and try again.</p>' +
                '<button type="button" class="nbai-cta" id="nbqAi"><i class="fa-solid fa-wand-magic-sparkles"></i><span><b>Make a test with AI</b><small>Any topic, any chapter</small></span><i class="fa-solid fa-chevron-right"></i></button>';
            $('nbqAi').addEventListener('click', aiScreen); qpCta();
        });
    }
    function quizStart() {
        QZ.list = QZ.src === 'ai' && AIT.qs ? aiPick() : pickQuestions(QZ.mode === 'mock' ? 20 : 10);
        if (QZ.list.length < 3) { if ($('nbqErr')) $('nbqErr').textContent = 'Not enough questions for this selection. Try another subject.'; return; }
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
        if (q.qh) { var qh = document.createElement('div'); qh.className = 'nbq-hi nbq-hq'; qh.textContent = q.qh; $('nbqQ').appendChild(qh); }          // Both: Hindi question right below the English one
        var ob = $('nbqOpts');
        q.o.forEach(function (o, i) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'nbq-opt';
            var l = document.createElement('span'); l.textContent = String.fromCharCode(65 + i); var t = document.createElement('div'); t.textContent = o;
            if (q.oh && q.oh[i]) { var th = document.createElement('div'); th.className = 'nbq-hi'; th.textContent = q.oh[i]; t.appendChild(th); }
            b.appendChild(l); b.appendChild(t);
            if (mock) b.setAttribute('aria-pressed', sel === i ? 'true' : 'false');
            if (locked) { b.disabled = true; if (i === q.a) b.classList.add('right'); else if (i === sel) b.classList.add('wrong'); }
            b.addEventListener('click', function () { if (locked) return; QZ.ans[QZ.idx] = i; quizShow(); });
            ob.appendChild(b);
        });
        if (locked && q.e) { var ex = document.createElement('div'); ex.className = 'nbq-exp'; ex.textContent = (sel === q.a ? 'Correct! ' : 'Not quite. ') + q.e; if (q.eh) { var eh = document.createElement('div'); eh.className = 'nbq-hi'; eh.textContent = (sel === q.a ? 'सही! ' : 'सही नहीं। ') + q.eh; ex.appendChild(eh); } $('nbqBody').appendChild(ex); }
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
        var hist = asArr(LSX.get('nb_quiz', [])); hist.unshift({ t: Date.now(), score: score, total: total, mode: QZ.mode, subj: QZ.src === 'ai' ? 'AI · ' + String(QZ.aiTitle || 'test').slice(0, 24) : QZ.subj, cls: QZ.cls });
        LSX.set('nb_quiz', hist.slice(0, 30)); thSave(secs); NB.markDay(QZ.src === 'ai' ? 'aitest' : 'test'); ui.refreshAll();
        var msg = pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Good effort. Keep practising!' : 'Keep going. Review the answers below and try again.';
        var h = '<div class="nbq-score"><b>' + score + ' / ' + total + '</b><span>' + pct + '% · ' + msg + '<br>Time taken: ' + fmtT(secs) + '</span></div>';
        $('nbqBody').innerHTML = h + '<div id="nbqRev"></div><div class="nbq-nav"><button type="button" id="nbqAgain">Try again</button><button type="button" class="pri" id="nbqNew">New test</button></div><button type="button" class="nbo-skip" id="nbqHistR">📊 My test history &amp; progress</button>';
        var rv = $('nbqRev');
        QZ.list.forEach(function (q, i) {
            var ok = QZ.ans[i] === q.a, d = document.createElement('div'); d.className = 'nbq-rev ' + (ok ? 'ok' : 'bad');
            var a = document.createElement('b'); a.textContent = (i + 1) + '. ' + q.q; d.appendChild(a);
            if (q.qh) { var ah = document.createElement('div'); ah.className = 'nbq-hi'; ah.textContent = q.qh; d.appendChild(ah); }
            var y = document.createElement('div'); y.textContent = 'Your answer: ' + (QZ.ans[i] >= 0 ? q.o[QZ.ans[i]] : 'Not answered') + (QZ.ans[i] >= 0 && q.oh ? ' / ' + q.oh[QZ.ans[i]] : '') + (ok ? ' ✓' : ''); d.appendChild(y);
            if (!ok) { var c = document.createElement('div'); c.textContent = 'Correct answer: ' + q.o[q.a] + (q.oh ? ' / ' + q.oh[q.a] : ''); d.appendChild(c); }
            if (q.e) { var e = document.createElement('div'); e.style.opacity = '.8'; e.textContent = q.e + (q.eh ? ' / ' + q.eh : ''); d.appendChild(e); }
            rv.appendChild(d);
        });
        $('nbqAgain').addEventListener('click', quizStart); $('nbqNew').addEventListener('click', quizSetup); $('nbqHistR').addEventListener('click', NB.openTestHistory);
    }

    /* =====================================================================
       AI Test Maker: chat with Bazar AI, get a mock test on ANY topic, then take it
       with the same practice / mock engine as the built-in question bank.
       ===================================================================== */
    var AIT = { hist: [], busy: false, qs: null, title: '', subj: '', last: 0, lang: 'auto' };
    function aiSystem(cls, n, lang, diff, avoid) {
        var both = lang === 'Both';
        return 'You are the AI Test Maker inside Notes Bazar, a study app for Indian school students. The student is in Class ' + cls + '. ' +
            'Make exactly ' + n + ' multiple-choice questions (unless the student asks for another number, maximum 25) on ANY topic the student asks for. The topic does NOT have to be in the school syllabus: general knowledge, current affairs, sports, technology, coding, history, movies, careers, competitive exams, hobbies and everything else are allowed. ' +
            'Use the class only to judge difficulty (easy words and simple ideas for small classes). For school topics follow CBSE / NCERT style; for other topics use common, well-established facts. Each question has 4 options and exactly one correct answer, and you must be sure that the answer is right; do not invent facts. Only refuse topics that are harmful, illegal or sexual, and then reply in one friendly sentence and suggest another topic. ' +
            (both ? 'LANGUAGE RULE (very important): BILINGUAL test. Write EVERY question twice: first in English and then the same question in Hindi (Devanagari script). Put the English question in "q", its Hindi translation in "qh", the 4 English options in "o", the same 4 options in Hindi in "oh" (same order, so the correct index "a" is the same), the English explanation in "e" and the Hindi explanation in "eh". The Hindi must say exactly what the English says. "q", "o", "e" contain only English; "qh", "oh", "eh" contain only Hindi (numbers, symbols and chemical formulas can stay as they are). Never leave a Hindi field empty. '
                : lang === 'English' ? 'LANGUAGE RULE (very important): write EVERYTHING in English only, even if the student writes in Hindi. '
                : lang === 'Hindi' ? 'LANGUAGE RULE (very important): write EVERYTHING in Hindi using Devanagari script only, even if the student writes in English. '
                : 'Write the questions in the same language the student writes in (English, Hindi or Hinglish). ') +
            ({ easy: 'DIFFICULTY: EASY. Direct recall and very simple understanding questions that a weak student can solve. ', medium: 'DIFFICULTY: MEDIUM. Questions that test understanding and simple application, like a normal school exam. ', hard: 'DIFFICULTY: HARD. Tricky, multi-step, application and higher-order thinking questions with close distractor options, like for a topper or a competitive exam. ' }[diff] || 'DIFFICULTY: MIXED. About 40% easy, 40% medium and 20% hard questions. ') +
            'UNIQUE QUESTIONS (very important): every request must give NEW and DIFFERENT questions. Cover different sub-topics, use different examples and numbers, never copy a standard textbook line, and never repeat a question you made before. Variation code: ' + Math.random().toString(36).slice(2, 8) + '. ' +
            (avoid && avoid.length ? 'Do NOT repeat or rephrase any of these earlier questions: ' + avoid.join(' | ') + '. ' : '') +
            'WHEN THE TOPIC IS CLEAR reply with ONLY a JSON object and nothing else (no markdown fences, no extra words): ' +
            (both ? '{"title":"short title","subject":"subject name","questions":[{"q":"English question","qh":"same question in Hindi","o":["English option A","English option B","English option C","English option D"],"oh":["Hindi option A","Hindi option B","Hindi option C","Hindi option D"],"a":0,"e":"one short English line explaining the answer","eh":"the same line in Hindi"}]} '
                : '{"title":"short title","subject":"subject name","questions":[{"q":"question text","o":["option A","option B","option C","option D"],"a":0,"e":"one short line explaining the answer"}]} ') +
            'where "a" is the index 0-3 of the correct option; vary the position of the correct answer. ' +
            'If the topic is missing or too vague, or the student only chats or asks something else, answer in one or two short friendly sentences and ask which topic they want tested. ' +
            'If the student asks to change the test (harder, easier, more questions, another topic), make a new full JSON test.';
    }
    /* take the JSON out of the reply, even when the AI added words around it or the reply was cut off */
    function aiParseTest(txt, need) {
        txt = String(txt || '').replace(/```(?:json)?/gi, '');
        var i = txt.indexOf('{'); if (i < 0) return null;
        var obj = null, j = txt.lastIndexOf('}');
        if (j > i) { try { obj = JSON.parse(txt.slice(i, j + 1)); } catch (e) {} }
        var arr = obj && Array.isArray(obj.questions) ? obj.questions : null;
        if (!arr) {                                              // salvage the complete question objects from a truncated reply
            var k = txt.indexOf('['); arr = [];
            if (k > -1) {
                var depth = 0, st = -1, inS = false, esc = false, c;
                for (var x = k + 1; x < txt.length; x++) {
                    c = txt[x];
                    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
                    if (c === '"') inS = true;
                    else if (c === '{') { if (!depth) st = x; depth++; }
                    else if (c === '}') { depth--; if (!depth && st > -1) { try { arr.push(JSON.parse(txt.slice(st, x + 1))); } catch (e) {} st = -1; } }
                }
            }
            obj = obj || {};
        }
        var qs = [];
        arr.forEach(function (q) {
            if (!q || typeof q.q !== 'string' || !Array.isArray(q.o)) return;
            var o = q.o.map(function (v) { return String(v == null ? '' : v).trim().slice(0, 160); }).filter(Boolean).slice(0, 6), a = parseInt(q.a, 10);
            if (o.length < 2 || !(a >= 0 && a < o.length)) return;
            var item = { q: q.q.trim().slice(0, 300), o: o, a: a, e: typeof q.e === 'string' ? q.e.trim().slice(0, 240) : '' };
            if (typeof q.qh === 'string' && q.qh.trim() && Array.isArray(q.oh)) {          // Hindi copy of the question: kept only when it has the same number of options
                var oh = q.oh.map(function (v) { return String(v == null ? '' : v).trim().slice(0, 200); }).filter(Boolean).slice(0, 6);
                if (oh.length === o.length) { item.qh = q.qh.trim().slice(0, 360); item.oh = oh; item.eh = typeof q.eh === 'string' ? q.eh.trim().slice(0, 280) : ''; }
            }
            qs.push(item);
        });
        if (need) qs = qs.filter(function (q) { return q.qh; });                              // a "Both" test keeps only the questions that really have Hindi
        if (qs.length < 3) return null;
        return { title: String(obj.title || 'AI test').slice(0, 60), subject: String(obj.subject || 'AI test').slice(0, 30), qs: qs.slice(0, 25) };
    }
    function aiPick() {                                          // fresh option order every attempt
        return shuffle(AIT.qs).map(function (q) {
            var idx = shuffle(q.o.map(function (_, i) { return i; }));
            var r = { q: q.q, s: AIT.subj, e: q.e, o: idx.map(function (i) { return q.o[i]; }), a: idx.indexOf(q.a) };
            if (q.qh && q.oh && q.oh.length === q.o.length) { r.qh = q.qh; r.eh = q.eh || ''; r.oh = idx.map(function (i) { return q.oh[i]; }); }
            return r;
        });
    }
    function aiBubble(role, text) {
        var box = $('nbaiChat'); if (!box) return null;
        var d = document.createElement('div'); d.className = 'nbai-m ' + role; d.textContent = text; box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
    }
    function aiStartTest(mode) {
        if (!AIT.qs) return;
        QZ.src = 'ai'; QZ.mode = mode || QZ.mode; QZ.aiTitle = AIT.title;
        quizStart();
    }
    function aiReady() {
        var box = $('nbaiChat'); if (!box) return;
        var d = document.createElement('div'); d.className = 'nbai-m bot nbai-ready';
        d.innerHTML = '<b></b><span></span><div class="nbai-go"><button type="button" class="pri" data-m="practice">Practice (see answers)</button><button type="button" data-m="mock">Timed mock test</button></div>';
        d.querySelector('b').textContent = 'Test ready: ' + AIT.title;
        d.querySelector('span').textContent = AIT.qs.length + ' questions · ' + AIT.subj + '. You can also tell me to change it (harder, easier, other topic…).';
        d.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { aiStartTest(b.dataset.m); }); });
        box.appendChild(d); box.scrollTop = box.scrollHeight;
    }
    async function aiSend(text) {
        text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
        if (!text || AIT.busy) return;
        if (typeof window.nbCallAi !== 'function') { aiBubble('bot', 'The AI is still loading. Please try again in a moment.'); return; }
        AIT.busy = true; aiBubble('me', text);
        var wait = aiBubble('bot', 'Thinking…'); wait.classList.add('wait');
        var n = aiN(), diff = ($('nbaiD') || {}).value || 'mixed', go = $('nbaiGo'), lg = ($('nbaiL') || {}).value || AIT.lang || 'auto'; AIT.lang = lg; if (go) go.disabled = true;
        AIT.hist.push({ role: 'user', content: text }); AIT.hist = AIT.hist.slice(-8);
        try {
            if (lg === 'Both' && n > 15) n = 15;                  // a bilingual test is twice as long, so keep it shorter
            var seen0 = LSX.get('nb_ai_seen', []); if (!Array.isArray(seen0)) seen0 = [];
            var out = await window.nbCallAi([{ role: 'system', content: aiSystem(QZ.cls, n, lg, diff, seen0.slice(-30)) }].concat(AIT.hist), { timeout: lg === 'Both' ? 90000 : 60000, temperature: 0.95 });
            var t = aiParseTest(out, lg === 'Both');
            if (wait.parentNode) wait.remove();
            if (t) {
                AIT.qs = t.qs; AIT.title = t.title; AIT.subj = t.subject;
                try { var sn2 = LSX.get('nb_ai_seen', []); if (!Array.isArray(sn2)) sn2 = []; t.qs.forEach(function (q) { sn2.push(String(q.q).slice(0, 70)); }); LSX.set('nb_ai_seen', sn2.slice(-60)); } catch (e) {}
                try { LSX.set('nb_ai_test', { title: t.title, subject: t.subject, qs: t.qs, t: Date.now() }); } catch (e) {}
                AIT.hist.push({ role: 'assistant', content: '[Made a ' + t.qs.length + '-question test: ' + t.title + ']' });
                aiReady();
            } else {
                var shown = String(out || '').replace(/```[\s\S]*?```/g, '').trim();
                if (/^\s*[\[{]/.test(shown) || !shown) shown = lg === 'Both' ? 'I could not build the English + Hindi test this time. Please send the topic again, or try fewer questions.' : 'I could not build a proper test from that. Try again with a topic, for example "Photosynthesis" or "Algebra – linear equations".';
                AIT.hist.push({ role: 'assistant', content: shown.slice(0, 300) });
                aiBubble('bot', shown.slice(0, 600));
            }
        } catch (e) {
            if (wait.parentNode) wait.remove(); AIT.hist.pop();
            aiBubble('bot', 'Sorry, the AI could not be reached right now. Check your internet and try again, or use the built-in practice questions.');
        } finally { AIT.busy = false; if (go) go.disabled = false; }
    }
    function aiN() { var sel = $('nbaiN'), v = sel ? sel.value : '10'; v = v === 'custom' ? parseInt(($('nbaiNC') || {}).value, 10) : parseInt(v, 10); if (!(v >= 1)) v = 10; return Math.min(25, v); }
    function aiFillSubj() {
        var cs = $('nbaiTCls'), sb = $('nbaiTSubj'); if (!cs || !sb) return;
        var cur = sb.value, l = qpSubjList(parseInt(cs.value, 10)).filter(function (x) { return x[0] !== 'other'; });
        sb.innerHTML = '<option value="">Any topic (I will type it)</option>' + l.map(function (x) { return '<option value="' + x[0] + '">' + NB.esc(x[1]) + '</option>'; }).join('');
        if (cur && l.some(function (x) { return x[0] === cur; })) sb.value = cur;
        chRender('nbaiT');
    }
    function aiMakeText() {
        var sb = $('nbaiTSubj'), sn = sb && sb.value ? sb.options[sb.selectedIndex].text : '', tp = (($('nbaiTTopic') || {}).value || '').trim();
        if (!sn && !tp) return '';
        return (sn || '') + (sn && tp ? ': ' : '') + tp + ' (Class ' + QZ.cls + ')';
    }
    function aiScreen() {
        stopTimer(); QZ.src = 'bank';
        var body = $('nbqBody'), last = LSX.get('nb_ai_test', null);
        body.innerHTML = '<h3 class="nbo-h"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Test Maker</h3><p class="nbo-sub">Any topic, even outside your syllabus. Bazar AI makes the test in seconds.</p>' +
            '<div class="nbai-set"><label>Class<select id="nbaiTCls" class="nbo-in">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return '<option value="' + n + '"' + (n === QZ.cls ? ' selected' : '') + '>Class ' + n + '</option>'; }).join('') + '</select></label>' +
            '<label>Subject<select id="nbaiTSubj" class="nbo-in"></select></label>' +
            '<label>Difficulty<select id="nbaiD" class="nbo-in"><option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>' +
            '<label>Questions<select id="nbaiN" class="nbo-in"><option>5</option><option selected>10</option><option>15</option><option>20</option><option>25</option><option value="custom">Custom number</option></select><input id="nbaiNC" class="nbo-in nbai-nc" type="number" inputmode="numeric" min="1" max="25" placeholder="1 to 25" hidden aria-label="Custom number of questions"></label>' +

            '<label>Language<select id="nbaiL" class="nbo-in">' + [['auto', 'Same as I write'], ['English', 'English'], ['Hindi', 'हिंदी (Hindi)'], ['Both', 'English + हिंदी (Both)']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === (AIT.lang || 'auto') ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label></div>' +
            '<div id="nbaiTChWrap" style="margin-bottom:6px"></div>' +
            '<input id="nbaiTTopic" class="nbo-in" maxlength="200" placeholder="Topic or chapter (optional, you can type)" aria-label="Topic or chapter" style="margin-bottom:8px">' +
            '<button type="button" class="nbai-make" id="nbaiMake"><i class="fa-solid fa-wand-magic-sparkles"></i> Make test</button>' +
            '<div class="nbai-chat" id="nbaiChat" aria-live="polite"></div>' +
            '<div class="nbai-chips" id="nbaiChips"></div>' +
            '<form class="nbai-form" id="nbaiForm" autocomplete="off"><input id="nbaiIn" class="nbo-in" maxlength="400" placeholder="Topic, e.g. Photosynthesis, Class 10" aria-label="Topic for your test"><button type="submit" id="nbaiGo" class="nbai-send" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button></form>' +
            '<button type="button" class="nbo-skip" id="nbaiBack">Back to tests</button>';
        $('nbaiTCls').addEventListener('change', function () { QZ.cls = parseInt(this.value, 10); aiFillSubj(); });
        $('nbaiTSubj').addEventListener('change', function () { chRender('nbaiT'); });
        $('nbaiN').addEventListener('change', function () { var c = $('nbaiNC'); c.hidden = this.value !== 'custom'; if (!c.hidden) c.focus(); });
        $('nbaiMake').addEventListener('click', function () { var t = aiMakeText(); if (!t) { aiBubble('bot', 'Please choose a subject, or type a topic first.'); return; } aiSend(t); });
        aiFillSubj();
        $('nbaiL').addEventListener('change', function () { AIT.lang = this.value; });
        AIT.hist = []; AIT.qs = null;
        aiBubble('bot', 'Hi! Which topic do you want to be tested on? It can be any chapter or subject, or anything outside your syllabus too (GK, current affairs, sports, coding, history…). You can also tell me the level (easy / hard).');
        var sug = ['Photosynthesis', 'Algebra: linear equations', 'Indian Constitution', 'General knowledge', 'Cricket World Cups', 'Basics of Python coding', 'विज्ञान: प्रकाश'];
        $('nbaiChips').innerHTML = ''; sug.forEach(function (s) { var b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.addEventListener('click', function () { aiSend(s + ' (Class ' + QZ.cls + ')'); }); $('nbaiChips').appendChild(b); });
        if (last && Array.isArray(last.qs) && last.qs.length >= 3) {
            var r = document.createElement('button'); r.type = 'button'; r.className = 'nbai-last'; r.textContent = 'Retake your last AI test: ' + last.title;
            r.addEventListener('click', function () { AIT.qs = last.qs; AIT.title = last.title; AIT.subj = last.subject || 'AI test'; aiReady(); r.remove(); });
            $('nbaiChips').appendChild(r);
        }
        $('nbaiForm').addEventListener('submit', function (e) { e.preventDefault(); var i = $('nbaiIn'), v = i.value; i.value = ''; aiSend(v); });
        $('nbaiBack').addEventListener('click', quizSetup);
    }
    NB.openAiTest = function () {
        closeSiteMenu(); if (!$('nbQz')) buildQuiz();
        var p = NB.profile(); QZ.cls = p ? parseInt(p.cls.replace('Class ', ''), 10) : QZ.cls;
        NB.open('nbQz'); aiScreen();
    };

    /* =====================================================================
       Test History: every test is saved with all answers, so the student can
       see marks, progress graphs, mistakes with explanations, and retake it.
       ===================================================================== */
    var TH_KEY = 'nb_tests', TH_MAX = 40, TH = { id: '', f: 'all' };
    function thAll() { var a = LSX.get(TH_KEY, []); return Array.isArray(a) ? a : []; }
    function thPut(a) { a = a.slice(0, TH_MAX); while (a.length && !LSX.set(TH_KEY, a)) a.pop(); if (!a.length) LSX.del(TH_KEY); }
    function thSave(secs) {
        try {
            var ai = QZ.src === 'ai', score = 0, a;
            var qs = QZ.list.map(function (q, i) { if (QZ.ans[i] === q.a) score++; var r = { q: q.q, o: q.o, a: q.a, e: q.e || '', s: q.s || '', x: QZ.ans[i] }; if (q.qh) { r.qh = q.qh; r.oh = q.oh; r.eh = q.eh || ''; } return r; });
            var title = ai ? String(QZ.aiTitle || 'AI test') : ('Practice · ' + QZ.subj);
            a = thAll(); a.unshift({ id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), t: Date.now(), title: title.slice(0, 60), subj: ai ? (AIT.subj || 'AI test') : QZ.subj, cls: QZ.cls, mode: QZ.mode, src: QZ.src, score: score, total: qs.length, secs: secs, qs: qs });
            thPut(a);
        } catch (e) {}
    }
    function thCol(p) { return p >= 80 ? '#16a34a' : (p >= 50 ? '#f59e0b' : '#ef4444'); }
    function thPct(r) { return r.total ? Math.round(r.score / r.total * 100) : 0; }
    function thDate(t) { var d = new Date(t); return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]; }
    function thLine(list) {                                      // list: oldest -> newest
        var W = 340, H = 150, L = 26, R = 10, T = 10, B = 22, n = list.length, i, g = '', pts = [], x = function (k) { return n === 1 ? L + (W - L - R) / 2 : L + k * (W - L - R) / (n - 1); }, y = function (v) { return T + (H - T - B) * (1 - v / 100); };
        [0, 50, 80, 100].forEach(function (v) { g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="currentColor" stroke-opacity="' + (v === 80 ? '.4' : '.12') + '"' + (v === 80 ? ' stroke-dasharray="4 3"' : '') + '/><text x="' + (L - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end" font-size="9" fill="currentColor" fill-opacity=".55">' + v + '</text>'; });
        list.forEach(function (r, k) { pts.push(x(k).toFixed(1) + ',' + y(thPct(r)).toFixed(1)); });
        g += '<polygon points="' + x(0).toFixed(1) + ',' + y(0) + ' ' + pts.join(' ') + ' ' + x(n - 1).toFixed(1) + ',' + y(0) + '" fill="url(#thg)"/><polyline points="' + pts.join(' ') + '" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
        list.forEach(function (r, k) { g += '<circle cx="' + x(k).toFixed(1) + '" cy="' + y(thPct(r)).toFixed(1) + '" r="4" fill="' + thCol(thPct(r)) + '" stroke="#fff" stroke-width="1.5"/>'; });
        [0, Math.floor((n - 1) / 2), n - 1].filter(function (v, k, a) { return a.indexOf(v) === k; }).forEach(function (k) { g += '<text x="' + x(k).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="currentColor" fill-opacity=".6">' + thDate(list[k].t) + '</text>'; });
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Score trend" style="width:100%;height:auto;display:block"><defs><linearGradient id="thg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1" stop-opacity=".28"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>' + g + '</svg>';
    }
    function thSubjects(a) {
        var m = {}, out = [];
        a.forEach(function (r) { r.qs.forEach(function (q) { var k = q.s || r.subj || 'General'; m[k] = m[k] || { r: 0, t: 0 }; m[k].t++; if (q.x === q.a) m[k].r++; }); });
        Object.keys(m).forEach(function (k) { out.push({ s: k, r: m[k].r, t: m[k].t, p: Math.round(m[k].r / m[k].t * 100) }); });
        return out.sort(function (p, q) { return p.p - q.p; }).slice(0, 8);
    }
    function thRender() {
        TH.id = ''; var a = thAll(), body = $('nbthBody'), E = NB.esc, h;
        h = '<h3 class="nbo-h"><i class="fa-solid fa-chart-line"></i> Test History</h3><p class="nbo-sub">All your tests, marks, mistakes and progress in one place.</p>';
        if (!a.length) {
            body.innerHTML = h + '<p class="nbo-sub" style="text-align:center;margin:26px 0">No tests yet. Take a quiz or an AI test and it will appear here.</p><button type="button" class="nbo-save" data-a="start">Start a test</button>';
            return;
        }
        var avg = Math.round(a.reduce(function (s, r) { return s + thPct(r); }, 0) / a.length), best = Math.max.apply(null, a.map(thPct)), qn = a.reduce(function (s, r) { return s + r.total; }, 0), trend = '';
        if (a.length >= 6) {
            var rec5 = a.slice(0, 5), old5 = a.slice(5, 10), f = function (l) { return l.reduce(function (s, r) { return s + thPct(r); }, 0) / l.length; }, d = Math.round(f(rec5) - f(old5));
            trend = '<div class="th-trend" style="color:' + (d >= 0 ? '#16a34a' : '#ef4444') + '">' + (d >= 0 ? '▲ Improving' : '▼ Dropping') + ': last 5 tests are ' + Math.abs(d) + '% ' + (d >= 0 ? 'better' : 'lower') + ' than the 5 before</div>';
        }
        h += '<div class="th-stats"><div><b>' + a.length + '</b><small>Tests</small></div><div><b style="color:' + thCol(avg) + '">' + avg + '%</b><small>Average</small></div><div><b style="color:' + thCol(best) + '">' + best + '%</b><small>Best</small></div><div><b>' + qn + '</b><small>Questions</small></div></div>' + trend;
        h += '<div class="th-card"><b>Score trend</b><small> (' + (a.length === 1 ? 'your first test' : 'last ' + Math.min(a.length, 15) + ' tests') + ', dashed line = 80%)</small>' + thLine(a.slice(0, 15).reverse()) + '</div>';
        var sb = thSubjects(a);
        h += '<div class="th-card"><b>Subject-wise accuracy</b><small> (weakest first)</small>' + sb.map(function (s) {
            return '<div class="th-bar"><span class="th-bl">' + E(s.s) + '</span><span class="th-bt"><i style="width:' + Math.max(s.p, 3) + '%;background:' + thCol(s.p) + '"></i></span><span class="th-bp">' + s.p + '% <small>(' + s.r + '/' + s.t + ')</small></span></div>';
        }).join('') + (sb[0] && sb[0].p < 60 ? '<div class="th-tip">💡 Focus on <b>' + E(sb[0].s) + '</b> next. Retake your mistakes from that test.</div>' : '') + '</div>';
        h += '<div class="th-list-h"><b>All tests</b><button type="button" class="th-del" id="thClear" data-a="delall">Delete all</button></div>' + a.map(function (r) {
            var p = thPct(r); return '<button type="button" class="th-row" data-a="open" data-id="' + E(r.id) + '"><span class="th-badge" style="background:' + thCol(p) + '">' + p + '%</span><span class="th-tx"><b>' + E(r.title) + '</b><small>' + E(thDate(r.t) + ' · ' + (r.mode === 'mock' ? 'Mock' : 'Practice') + ' · Class ' + r.cls + ' · ' + r.score + '/' + r.total + ' correct') + '</small></span><i class="fa-solid fa-chevron-right"></i></button>';
        }).join('');
        body.innerHTML = h;
    }
    function thDetail(id) {
        var a = thAll(), r = a.filter(function (x) { return x.id === id; })[0], body = $('nbthBody'), E = NB.esc, right = 0, wrong = 0, skip = 0, p, h, letters = 'ABCDEF';
        if (!r) { thRender(); return; }
        TH.id = id; r.qs.forEach(function (q) { if (q.x === q.a) right++; else if (q.x >= 0) wrong++; else skip++; });
        p = thPct(r);
        h = '<button type="button" class="np-back" data-a="back"><i class="fa-solid fa-arrow-left"></i> All tests</button><h3 class="nbo-h" style="margin-top:2px">' + E(r.title) + '</h3>' +
            '<div class="th-score"><b style="color:' + thCol(p) + '">' + r.score + ' / ' + r.total + '</b><span>' + p + '% · ' + E(thDate(r.t)) + ' · ' + (r.mode === 'mock' ? 'Mock test' : 'Practice') + ' · ' + Math.floor((r.secs || 0) / 60) + ' min ' + ((r.secs || 0) % 60) + ' s</span></div>' +
            '<div class="th-actions"><button type="button" class="nbo-save" data-a="retake"><i class="fa-solid fa-rotate-right"></i> Retake this test</button>' + ((wrong + skip) ? '<button type="button" class="pdf-share" data-a="retakew" style="margin-top:8px">🎯 Retake only my mistakes (' + (wrong + skip) + ')</button>' : '') + '</div>' +
            '<div class="th-tabs">' + [['all', 'All ' + r.total], ['wrong', 'Wrong ' + wrong], ['skip', 'Skipped ' + skip], ['right', 'Right ' + right]].map(function (t) { return '<button type="button" data-a="tab" data-f="' + t[0] + '" aria-pressed="' + (TH.f === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
        r.qs.forEach(function (q, i) {
            var st = q.x === q.a ? 'right' : (q.x >= 0 ? 'wrong' : 'skip');
            if (TH.f !== 'all' && TH.f !== st) return;
            h += '<div class="th-q th-' + st + '"><div class="th-qq"><b>' + (i + 1) + '.</b> ' + E(q.q) + (q.qh ? '<div class="nbq-hi nbq-hq">' + E(q.qh) + '</div>' : '') + '</div>' + q.o.map(function (o, j) {
                var c = j === q.a ? 'ok' : (j === q.x ? 'bad' : '');
                return '<div class="th-o ' + c + '"><span>' + letters[j] + '</span><div>' + E(o) + (q.oh && q.oh[j] ? '<div class="nbq-hi">' + E(q.oh[j]) + '</div>' : '') + '</div>' + (j === q.a ? '<em>✓ Correct</em>' : (j === q.x ? '<em>✗ Your answer</em>' : '')) + '</div>';
            }).join('') + (st === 'skip' ? '<div class="th-note">You did not answer this one.</div>' : '') + (q.e ? '<div class="th-exp"><b>Why:</b> ' + E(q.e) + (q.eh ? '<div class="nbq-hi">' + E(q.eh) + '</div>' : '') + '</div>' : '') +
                (st !== 'right' ? '<button type="button" class="th-why" data-a="why" data-i="' + i + '">🤖 Explain simply</button><div class="th-ai" id="thAi' + i + '"></div>' : '') + '</div>';
        });
        h += '<button type="button" class="th-del th-delone" data-a="del">Delete this test</button>';
        body.innerHTML = h;
    }
    function thRetake(only) {
        var r = thAll().filter(function (x) { return x.id === TH.id; })[0]; if (!r) return;
        var all = r.qs.map(function (q) { return { q: q.q, o: q.o, a: q.a, e: q.e, qh: q.qh, oh: q.oh, eh: q.eh, bad: q.x !== q.a }; }), list = only ? all.filter(function (q) { return q.bad; }) : all;
        if (list.length < 3) list = list.concat(all.filter(function (q) { return !q.bad; })).slice(0, Math.max(3, list.length));      // the quiz needs at least 3 questions
        AIT.qs = list.map(function (q) { return { q: q.q, o: q.o, a: q.a, e: q.e, qh: q.qh, oh: q.oh, eh: q.eh }; });
        AIT.title = (only ? 'Mistakes: ' : 'Retest: ') + String(r.title).replace(/^(Retest|Mistakes): /, '').slice(0, 40); AIT.subj = r.subj || 'Test';
        QZ.cls = r.cls || QZ.cls; NB.close('nbTh'); if (!$('nbQz')) buildQuiz(); NB.open('nbQz'); aiStartTest(r.mode === 'mock' ? 'mock' : 'practice');
    }
    async function thWhy(i, btn) {
        var r = thAll().filter(function (x) { return x.id === TH.id; })[0], q = r && r.qs[i], box = $('thAi' + i); if (!q || !box) return;
        btn.disabled = true; box.textContent = 'Thinking…';
        var L = 'ABCDEF', ask = 'A Class ' + (r.cls || 10) + ' student got this multiple-choice question wrong. Explain in 3 to 4 very short, simple sentences why the correct answer is right and why the student\'s choice is wrong (if they chose one). Reply in the same language as the question. No headings.\nQuestion: ' + q.q + '\nOptions: ' + q.o.map(function (o, j) { return L[j] + ') ' + o; }).join('  ') + '\nCorrect: ' + L[q.a] + ') ' + q.o[q.a] + '\nStudent chose: ' + (q.x >= 0 ? L[q.x] + ') ' + q.o[q.x] : 'no answer');
        try {
            if (typeof window.nbCallAi !== 'function') throw new Error('no ai');
            var out = await window.nbCallAi([{ role: 'system', content: ask }, { role: 'user', content: 'Explain now.' }], { timeout: 45000 });
            box.textContent = String(out || '').replace(/[*#`]/g, '').trim().slice(0, 700) || 'No explanation came back. Please try again.';
        } catch (e) { box.textContent = 'The AI is busy right now. Please try again in a minute.'; }
        btn.disabled = false;
    }
    function thClick(e) {
        var b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
        var act = b.getAttribute('data-a');
        if (act === 'start') { NB.close('nbTh'); NB.openQuiz(); }
        else if (act === 'open') { TH.f = 'all'; thDetail(b.getAttribute('data-id')); $('nbthBody').scrollTop = 0; }
        else if (act === 'back') thRender();
        else if (act === 'tab') { TH.f = b.getAttribute('data-f'); thDetail(TH.id); }
        else if (act === 'retake') thRetake(false);
        else if (act === 'retakew') thRetake(true);
        else if (act === 'why') thWhy(parseInt(b.getAttribute('data-i'), 10), b);
        else if (act === 'del' || act === 'delall') {
            if (b.getAttribute('data-ask')) {
                if (act === 'del') { thPut(thAll().filter(function (x) { return x.id !== TH.id; })); thRender(); NB.toast('Test deleted.', 1800); }
                else { LSX.del(TH_KEY); thRender(); NB.toast('All tests deleted.', 1800); }
                return;
            }
            var old = b.textContent; b.setAttribute('data-ask', '1'); b.textContent = act === 'del' ? 'Tap again to delete this test' : 'Tap again to delete all';
            setTimeout(function () { if (b.parentNode) { b.removeAttribute('data-ask'); b.textContent = old; } }, 4000);
        }
    }
    function buildTh() {
        document.body.appendChild(NB.mk('<div class="nbo" id="nbTh" aria-hidden="true"><div class="nbo-card nbq nbqp" role="dialog" aria-modal="true" aria-label="Test History">' +
            '<button type="button" class="nbo-x" id="nbthX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div id="nbthBody"></div></div></div>'));
        $('nbthX').addEventListener('click', function () { NB.close('nbTh'); });
        $('nbthBody').addEventListener('click', thClick);
    }
    NB.openTestHistory = function () { closeSiteMenu(); try { NB.close('nbQz'); } catch (e) {} if (!$('nbTh')) buildTh(); NB.open('nbTh'); thRender(); };

    /* =====================================================================
       AI Question Paper: objective (MCQ) or subjective questions, any number,
       with or without answers, saved as a PDF (browser print dialog -> "Save as PDF").
       Uses the same AI proxy as Bazar AI (window.nbCallAi).
       ===================================================================== */
    var QP = { run: 0, busy: false, paper: null };
    var QP_LIM = { mcq: 12, short: 12, long: 6, mixed: 8 };          // questions per AI call (keeps every reply short enough)
    var QP_TYPE = { mcq: 'Objective (MCQ)', short: 'Subjective: short answer', long: 'Subjective: long answer', mixed: 'Subjective: mixed' };
    var QP_CSS = '.qpw{font-family:"Segoe UI","Noto Sans Devanagari",Mangal,Arial,sans-serif;color:#111;background:#fff;font-size:13px;line-height:1.55;text-align:left}' +
        '.qpw h1{font-size:19px;margin:0;text-align:center;color:#111}.qpw h2{font-size:15px;margin:16px 0 8px;padding-bottom:3px;border-bottom:1px solid #999;color:#111}' +
        '.qpw .qp-sub{text-align:center;font-size:12px;color:#444;margin:2px 0 8px}' +
        '.qpw .qp-meta{display:flex;justify-content:space-between;gap:6px 14px;flex-wrap:wrap;border-top:1.5px solid #111;border-bottom:1.5px solid #111;padding:5px 0;margin:8px 0 14px;font-weight:600;font-size:12px}' +
        '.qpw .qp-q{margin:0 0 12px;page-break-inside:avoid;break-inside:avoid}.qpw .qp-qt{display:flex;gap:10px;justify-content:space-between}' +
        '.qpw .qp-m{white-space:nowrap;font-weight:700;font-size:12px}' +
        '.qpw .qp-cov{border:1.5px solid #111;padding:7px 10px;margin:8px 0 10px;font-size:12px}.qpw .qp-cov-t{text-align:center;font-weight:800;font-size:13px;margin-bottom:6px}.qpw .qp-cov-r{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;justify-content:space-between;margin:4px 0}.qpw .qp-cov-f b{margin-right:6px}' +
        '.qpw .qp-bxs{display:inline-flex;gap:2px;vertical-align:middle}.qpw .qp-bx{display:inline-block;width:15px;height:19px;border:1px solid #111}.qpw .qp-code{display:inline-block;min-width:54px;padding:2px 8px;border:1.5px solid #111;text-align:center;font-weight:800;letter-spacing:2px}' +
        '.qpw .qp-en{margin:1px 0 0 17px;color:#222}.qpw .qp-hi{margin:2px 0 0}' +
        '.qpw .qp-att{margin:0 0 10px;padding:7px 10px;border:2px solid #111;font-size:13px;line-height:1.6;display:flex;flex-wrap:wrap;gap:4px 18px;align-items:center}.qpw .qp-att>b{flex:none}.qpw .qp-att u{font-weight:800}' +
        '.qpw .qp-ins{margin:0 0 12px;padding:6px 10px;border:1px solid #999;font-size:12px;line-height:1.5}.qpw .qp-ins b{display:block;margin-bottom:2px}.qpw .qp-ins ol{margin:0;padding-left:20px}.qpw .qp-ins li{margin:0 0 3px}.qpw .qp-ins li i{display:block;font-style:normal;color:#333}' +
        '.qpw .qp-o{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:2px 16px;margin:4px 0 0 22px}' +
        '.qpw .qp-a{margin:6px 0 0 22px;padding:5px 9px;background:#eef2ff;border-left:3px solid #6366f1;font-size:12.5px}.qpw .qp-a.qp-k{margin-left:0}' +
        '.qpw .qp-sum{margin:0 0 12px;font-weight:600;line-height:1.9}.qpw .qp-brk{page-break-before:always;break-before:page}' +
        '.qpw h2{page-break-after:avoid;break-after:avoid}.qpw h2.qp-h3{font-size:13px;margin:12px 0 6px;border-bottom:1px dashed #bbb}.qpw .qp-inst{font-size:12px;font-style:italic;margin:0 0 10px;color:#333}';
    /* ---- Model Set layout: 80 MCQ (1 mark) + 15 short (2 marks) + 10 long (5 marks) = 160 marks ---- */
    /* ---- Model Set layouts (edit the numbers here to change the paper) ----
       Science / Maths:  Full = 80 objective + 25 short (2 marks) + 8 long (5 marks)   | Half = 40 + 15 + 4
       Other subjects:   Full = 70 objective + 20 short (2 marks) + 8 long (5 marks)   | Half = 35 + 10 + 4
       Science is split equally between Physics, Chemistry and Biology.
       Social Science is split equally between History, Political Science, Economics, Geography and Disaster
       Management (Disaster Management has no 5-mark question, as in the BSEB paper). */
    var QP_LAYOUT = {
        sci:   { full: { mcq: 80, short: 25, long: 8 }, half: { mcq: 40, short: 15, long: 4 } },
        other: { full: { mcq: 70, short: 20, long: 8 }, half: { mcq: 35, short: 10, long: 4 } }
    };
    var QP_MARKS = { mcq: 1, short: 2, long: 5 };
    var QP_SCI_PARTS = [{ key: 'physics', en: 'Physics', hi: 'भौतिक विज्ञान' }, { key: 'chemistry', en: 'Chemistry', hi: 'रसायन विज्ञान' }, { key: 'biology', en: 'Biology', hi: 'जीव विज्ञान' }];
    var QP_SST_PARTS = [{ key: 'history', en: 'History', hi: 'इतिहास' }, { key: 'polsci', en: 'Political Science', hi: 'राजनीति विज्ञान' }, { key: 'economics', en: 'Economics', hi: 'अर्थशास्त्र' }, { key: 'geography', en: 'Geography', hi: 'भूगोल' }, { key: 'disaster', en: 'Disaster Management', hi: 'आपदा प्रबंधन', noLong: true }];
    function qpDist(total, n) { var a = [], i, b = Math.floor(total / n), r = total % n; for (i = 0; i < n; i++) a.push(b + (i < r ? 1 : 0)); return a; }
    function qpParts(o) {                                         // subject parts that get an equal share of the paper, or null
        if (o.subj === 'science') return QP_SCI_PARTS;
        if (o.subj === 'sst') {
            var e = (window.NB_BSEB || {})[o.cls + '|sst'], txt = e && e.groups ? e.groups.map(function (g) { return g.g; }).join(' ') : '';
            var l = txt ? QP_SST_PARTS.filter(function (p) { return txt.indexOf(p.en) > -1; }) : QP_SST_PARTS.slice(0, o.cls >= 9 ? 5 : 4);
            return l.length ? l : QP_SST_PARTS;
        }
        return null;
    }
    /* Class 12 Science / Maths follow the real BSEB Intermediate paper:
       Physics, Chemistry, Biology (70 marks theory): 70 objective (any 35) + 20 short (any 10) + 6 long (any 3)
       Maths (100 marks): 100 objective (any 50) + 30 short (any 15) + 8 long (any 4)
       Full Model Set = the whole paper with the "attempt any" choice; Half Model Set = only the questions to attempt, all compulsory. */
    function qpLay(o) {
        var sci = !!QP_NCERT[o.subj], l;
        if (o.cls === 12 && sci) {
            var m = o.subj === 'math', f = m ? { mcq: 100, short: 30, long: 8 } : { mcq: 70, short: 20, long: 6 }, a = m ? { mcq: 50, short: 15, long: 4 } : { mcq: 35, short: 10, long: 3 };
            return o.half ? { mcq: a.mcq, short: a.short, long: a.long, att: null } : { mcq: f.mcq, short: f.short, long: f.long, att: a };
        }
        l = QP_LAYOUT[sci ? 'sci' : 'other'][o.half ? 'half' : 'full'];
        var h = QP_LAYOUT[sci ? 'sci' : 'other'].half;
        return { mcq: l.mcq, short: l.short, long: l.long, att: o.half ? null : { mcq: h.mcq, short: h.short, long: h.long } };   // Full set: e.g. objective 80 -> attempt any 40, short 25 -> any 15, long 8 -> any 4
    }
    function qpPlan(o) {                                          // [{k, part, n}] in paper order
        var lay = qpLay(o), parts = qpParts(o), plan = [];
        ['mcq', 'short', 'long'].forEach(function (k) {
            if (!parts) { plan.push({ k: k, part: null, n: lay[k] }); return; }
            var el = parts.filter(function (p) { return !(k === 'long' && p.noLong); }), d = qpDist(lay[k], el.length);
            el.forEach(function (p, i) { if (d[i] > 0) plan.push({ k: k, part: p, n: d[i] }); });
        });
        return plan;
    }
    function qpPlanCount(o) { var c = { mcq: 0, short: 0, long: 0 }; qpPlan(o).forEach(function (t) { c[t.k] += t.n; }); return c; }
    var QP_SUBJ = {
        low: [['math', 'Maths', 'गणित', 'Ganit'], ['science', 'Science', 'विज्ञान', 'Vigyan'], ['sst', 'Social Science', 'सामाजिक विज्ञान', 'Samajik Vigyan'], ['english', 'English', 'अंग्रेज़ी', 'Angrezi'], ['hindi', 'Hindi', 'हिंदी', 'Hindi'], ['evs', 'EVS', 'पर्यावरण अध्ययन', 'Paryavaran Adhyayan'], ['computer', 'Computer', 'कंप्यूटर', 'Computer'], ['gk', 'General Knowledge', 'सामान्य ज्ञान', 'Samanya Gyan'], ['maithili', 'Maithili', 'मैथिली', 'Maithili']],
        mid: [['math', 'Maths', 'गणित', 'Ganit'], ['science', 'Science', 'विज्ञान', 'Vigyan'], ['sst', 'Social Science', 'सामाजिक विज्ञान', 'Samajik Vigyan'], ['english', 'English', 'अंग्रेज़ी', 'Angrezi'], ['hindi', 'Hindi', 'हिंदी', 'Hindi'], ['sanskrit', 'Sanskrit', 'संस्कृत', 'Sanskrit'], ['maithili', 'Maithili', 'मैथिली', 'Maithili'], ['it', 'Information Technology', 'सूचना प्रौद्योगिकी', 'Information Technology']],
        high: [['physics', 'Physics', 'भौतिक विज्ञान', 'Bhautik Vigyan'], ['chemistry', 'Chemistry', 'रसायन विज्ञान', 'Rasayan Vigyan'], ['biology', 'Biology', 'जीव विज्ञान', 'Jeev Vigyan'], ['math', 'Maths', 'गणित', 'Ganit'], ['english', 'English', 'अंग्रेज़ी', 'Angrezi'], ['hindi', 'Hindi', 'हिंदी', 'Hindi'], ['maithili', 'Maithili', 'मैथिली', 'Maithili'], ['accountancy', 'Accountancy', 'लेखाशास्त्र', 'Lekhashastra'], ['business', 'Business Studies', 'व्यवसाय अध्ययन', 'Vyavsay Adhyayan'], ['economics', 'Economics', 'अर्थशास्त्र', 'Arthshastra'], ['history', 'History', 'इतिहास', 'Itihas'], ['geography', 'Geography', 'भूगोल', 'Bhugol'], ['polsci', 'Political Science', 'राजनीति विज्ञान', 'Rajneeti Vigyan'], ['cs', 'Computer Science', 'कंप्यूटर विज्ञान', 'Computer Vigyan']]
    };
    var QP_L = {
        English: { cls: 'Class', total: 'Total marks', time: 'Time', min: 'min', hrs: '3 hours 15 min (incl. 15 min reading time)', hrsH: '2 hours', name: 'Name', date: 'Date', ans: 'Answer', key: 'Answer Key', set: 'Full Model Set', half: 'Half Model Set', insH: 'Instructions', roll: 'Roll No.', scode: 'Subject Code', bsl: 'Question Booklet Sl. No.', exam: 'Matriculation (Class 10) Examination', fm: 'Full Marks', exam12: 'Intermediate (Class 12) Examination', anyN: 'Attempt any {n}',
            types: { mcq: 'Objective (MCQ)', short: 'Subjective: short answer', long: 'Subjective: long answer', mixed: 'Subjective: mixed' },
            secs: ['Section A: Objective questions (1 mark each)', 'Section B: Short answer questions (2 marks each)', 'Section C: Long answer questions (5 marks each)'],
            ins: ['All questions are compulsory. Section A has {m} objective questions (1 mark each), Section B has {s} short-answer questions (2 marks each) and Section C has {l} long-answer questions (5 marks each).',
                'Objective questions: choose the correct option (A, B, C or D). In the real exam, darken the circle of your answer on the OMR sheet with a blue or black ball pen only.',
                'Short and long answer questions: write the answers in your own words as far as possible.',
                'The figures in the right margin show the full marks of the question.',
                'There is no negative marking. Use of any electronic device is not allowed.'] },
        Hindi: { cls: 'कक्षा', total: 'कुल अंक', time: 'समय', min: 'मिनट', hrs: '3 घंटे 15 मिनट (15 मिनट प्रश्न-पत्र पढ़ने का अतिरिक्त समय)', hrsH: '2 घंटे', name: 'नाम', date: 'दिनांक', ans: 'उत्तर', key: 'उत्तर कुंजी', set: 'फुल मॉडल सेट', half: 'हाफ मॉडल सेट', insH: 'निर्देश', roll: 'अनुक्रमांक', scode: 'विषय कोड', bsl: 'प्रश्न पुस्तिका क्रमांक', exam: 'माध्यमिक (मैट्रिक) परीक्षा', fm: 'पूर्णांक', exam12: 'इंटरमीडिएट (कक्षा 12) परीक्षा', anyN: 'किन्हीं {n} प्रश्नों के उत्तर दें',
            types: { mcq: 'वस्तुनिष्ठ (बहुविकल्पीय)', short: 'लघु उत्तरीय प्रश्न', long: 'दीर्घ उत्तरीय प्रश्न', mixed: 'विषयनिष्ठ (मिश्रित)' },
            secs: ['खंड अ: वस्तुनिष्ठ प्रश्न (प्रत्येक 1 अंक)', 'खंड ब: लघु उत्तरीय प्रश्न (प्रत्येक 2 अंक)', 'खंड स: दीर्घ उत्तरीय प्रश्न (प्रत्येक 5 अंक)'],
            ins: ['सभी प्रश्न अनिवार्य हैं। खंड अ में {m} वस्तुनिष्ठ प्रश्न (प्रत्येक 1 अंक), खंड ब में {s} लघु उत्तरीय प्रश्न (प्रत्येक 2 अंक) तथा खंड स में {l} दीर्घ उत्तरीय प्रश्न (प्रत्येक 5 अंक) हैं।',
                'वस्तुनिष्ठ प्रश्नों में सही विकल्प (A, B, C या D) चुनें। वास्तविक परीक्षा में उत्तर OMR शीट पर केवल नीले या काले बॉल पेन से वृत्त भरकर दें।',
                'लघु एवं दीर्घ उत्तरीय प्रश्नों के उत्तर यथासंभव अपने शब्दों में लिखें।',
                'दाहिनी ओर हाशिये पर दिए गए अंक प्रश्न के पूर्णांक निर्दिष्ट करते हैं।',
                'ऋणात्मक अंकन नहीं है। किसी भी इलेक्ट्रॉनिक उपकरण का प्रयोग वर्जित है।'] },
        Hinglish: { cls: 'Class', total: 'Kul ank', time: 'Samay', min: 'minute', hrs: '3 ghante 15 minute (15 minute padhne ka alag samay)', hrsH: '2 ghante', name: 'Naam', date: 'Dinank', ans: 'Uttar', key: 'Uttar Kunji', set: 'Full Model Set', half: 'Half Model Set', insH: 'Nirdesh', roll: 'Roll No.', scode: 'Vishay Code', bsl: 'Prashn Pustika Kramank', exam: 'Madhyamik (Matric) Pariksha', fm: 'Purnank', exam12: 'Intermediate (Class 12) Pariksha', anyN: 'Kisi bhi {n} ke uttar dijiye',
            types: { mcq: 'Vastunishth (MCQ)', short: 'Laghu uttariya prashn', long: 'Dirgh uttariya prashn', mixed: 'Vishayanishth (mishrit)' },
            secs: ['Khand A: Vastunishth prashn (har ek 1 ank)', 'Khand B: Laghu uttariya prashn (har ek 2 ank)', 'Khand C: Dirgh uttariya prashn (har ek 5 ank)'],
            ins: ['Sabhi prashn anivarya hain. Khand A me {m} vastunishth prashn (har ek 1 ank), Khand B me {s} laghu uttariya prashn (har ek 2 ank) aur Khand C me {l} dirgh uttariya prashn (har ek 5 ank) hain.',
                'Vastunishth prashn: sahi vikalp (A, B, C ya D) chuniye. Asli pariksha me uttar OMR sheet par sirf neele ya kale ball pen se gola bharkar dijiye.',
                'Laghu aur dirgh uttariya prashnon ke uttar jahan tak ho sake apne shabdon me likhiye.',
                'Daahine hashiye me diye gaye ank prashn ke purnank dikhate hain.',
                'Rinatmak (negative) marking nahi hai. Kisi bhi electronic upkaran ka prayog mana hai.'] }
    };
    /* "Both" = Hindi first (as in the BSEB paper), the same text in English right below it. Labels become "हिंदी / English". */
    function qpLab(lang) {
        if (lang !== 'Both') return QP_L[lang] || QP_L.English;
        if (QP_L.Both) return QP_L.Both;
        var e = QP_L.English, h = QP_L.Hindi, j = function (a, b) { return b + ' / ' + a; }, o = {};
        ['cls', 'total', 'time', 'min', 'hrs', 'hrsH', 'name', 'date', 'ans', 'key', 'set', 'half', 'insH', 'roll', 'scode', 'bsl', 'exam', 'exam12', 'fm'].forEach(function (k) { o[k] = j(e[k], h[k]); });
        o.types = {}; Object.keys(e.types).forEach(function (k) { o.types[k] = j(e.types[k], h.types[k]); });
        o.secs = e.secs.map(function (x, i) { return j(x, h.secs[i]); });
        o.ins = h.ins.map(function (x, i) { return [x, e.ins[i]]; });
        o.insA = h.insA.map(function (x, i) { return x === e.insA[i] ? x : [x, e.insA[i]]; });
        o.anyN = h.anyN + ' / ' + e.anyN;
        QP_L.Both = o; return o;
    }
    QP_L.English.insA = ['Section A has {m} objective questions (1 mark each): answer any {am} of them on the OMR sheet. Section B has {s} short-answer questions (2 marks each): answer any {as}; and {l} long-answer questions (5 marks each): answer any {al}.',
        'If more than {am} objective questions are answered, only the first {am} answers are evaluated.'];
QP_L.Hindi.insA = QP_L.English.insA; QP_L.Hinglish.insA = QP_L.English.insA;   // attempt instructions always use simple English words
    var QP_LANGSUBJ = { hindi: 1, english: 1, maithili: 1, sanskrit: 1, nonhindi: 1 };   // language subjects never get the "Both" option
    function qpLim(o, n) { return o.lang === 'Both' ? Math.max(2, Math.ceil(n / 2)) : n; }   // a bilingual question is twice as long, so fewer per AI call
    var QP_OTHER = ['other', 'Other / any topic', 'अन्य विषय', 'Anya vishay'];
    var QP_NONHINDI = ['nonhindi', 'Non-Hindi', 'गैर-हिंदी', 'Non-Hindi'];   // BSEB Class 10 only: its questions come from the Class 8 Hindi book
    function qpSubjList(cls) { var l = (cls <= 8 ? QP_SUBJ.low : (cls <= 10 ? QP_SUBJ.mid : QP_SUBJ.high)).slice(); if (cls === 10) l.push(QP_NONHINDI); return l.concat([QP_OTHER]); }
    /* Science + Maths follow NCERT; every other school subject follows BSEB / SCERT Bihar books */
    var QP_NCERT = { math: 1, science: 1, physics: 1, chemistry: 1, biology: 1 };
    function qpBoard(subj) { return subj === 'other' || !subj ? 'any' : (QP_NCERT[subj] ? 'ncert' : 'bseb'); }
    function qpBoardName(subj) { var b = qpBoard(subj); return b === 'ncert' ? 'NCERT' : (b === 'bseb' ? 'BSEB / SCERT Bihar' : ''); }
    function qpBoardLine(subj, what) {
        var n = qpBoardName(subj);
        if (subj === 'nonhindi') return '<i class="fa-solid fa-book"></i> ' + what + ' will come from the <b>Class 8 Hindi book (Kislay Bhag-3)</b> of BSEB / SCERT Bihar';
        return n ? '<i class="fa-solid fa-book"></i> ' + what + ' will follow <b>' + n + '</b> books' : what + ' will follow the best matching textbook';
    }
    /* chapter lists + book names for the Bihar board come from bseb-chapters.js */
    function qpBookRule(o) {
        var e = (window.NB_BSEB || {})[o.cls + '|' + o.subj], t = '';
        if (o.subj === 'nonhindi') return 'NON-HINDI RULE (very important): this is the BSEB Class 10 Non-Hindi (Hindi for non-Hindi students) paper. Take everything ONLY from the Class 8 Hindi textbook of BSEB / SCERT Bihar (Kislay Bhag-3): its lessons, poems, vocabulary and Hindi grammar at Class 8 level, even though the student is in Class 10. Do NOT use the Class 10 Hindi book (Godhuli) or any other book. The 23 lessons of Kislay Bhag-3, in order: ' + ((e && e.groups) ? e.groups[0].c.join(' | ') : '') + '. If the topic names one of these lessons, make every question only from that real lesson (its story / poem, author, characters, theme, difficult words, grammar). ';
        if (!e || !e.groups) return o.subj === 'sst' ? 'SOCIAL SCIENCE RULE: in the Bihar board, Social Science is taught from separate SCERT Bihar books (History, Geography, Political Science / Civics, Economics and, in the higher classes, Disaster Management). If the topic starts with the name of a part, take everything only from that book and that chapter. Never use NCERT / CBSE content. ' : '';
        t = 'BOOK RULE (very important): the books are ' + (e.book || 'the BSEB / SCERT Bihar books of this class') + '. Use ONLY these Bihar board books and their real chapters, never NCERT / CBSE or any other book. ';
        if (e.groups.length > 1) t += 'The chapter name may start with the part (book) it belongs to; then take everything only from that part and that chapter. ';
        if (o.model) t += 'The chapters of the book(s), in order: ' + e.groups.map(function (g) { return g.g + ' = ' + g.c.join(' | '); }).join(' ;; ') + '. ';
        return t;
    }
    function qpSubjFind(cls, key) { var l = qpSubjList(cls), i; for (i = 0; i < l.length; i++) if (l[i][0] === key) return l[i]; return l[0]; }
    function qpSubjName(o) { var s = o.subjN || ['', o.topic, o.topic, o.topic]; return o.lang === 'Both' ? (s[1] === s[2] ? s[1] : s[2] + ' / ' + s[1]) : (o.lang === 'Hindi' ? s[2] : (o.lang === 'Hinglish' ? s[3] : s[1])); }
    function qpLangRule(lang, subj) {
        if (lang === 'Hindi' && subj === 'maithili') return 'LANGUAGE RULE (very important): the subject is Maithili, so write EVERYTHING in Maithili language using Devanagari script only (मैथिली). Every question, option, explanation and answer must be in Devanagari. Do NOT use English/Roman letters or Hinglish.';
        if (lang === 'Both') return 'LANGUAGE RULE (very important): BILINGUAL paper. Write EVERY question twice: first in English and then the same question in Hindi (Devanagari script). Put the English question in "q" and its exact Hindi translation in "qh"; for multiple-choice put the 4 English options in "o" and the same 4 options in Hindi in "oh" (same order, so the correct index is the same); put the English explanation in "e" and the Hindi explanation in "eh"; for written questions put the English model answer in "ans" and the Hindi model answer in "ansh". The Hindi must say exactly the same thing as the English. Fields "q", "o", "e", "ans" must contain only English; fields "qh", "oh", "eh", "ansh" must contain only Hindi in Devanagari (numbers, symbols and chemical formulas may stay as they are). Never leave a Hindi field empty.';
        if (lang === 'Hindi') return 'LANGUAGE RULE (very important): write EVERYTHING in Hindi using Devanagari script only (हिंदी). Every question, every option, every explanation and every answer must be in Devanagari. Do NOT write Hindi words in English/Roman letters and do NOT answer in English or Hinglish. Only unavoidable symbols, numbers and chemical formulas may use Roman letters.';
        if (lang === 'Hinglish') return 'LANGUAGE RULE (very important): write everything in Hinglish, meaning simple Hindi written in English (Roman) letters, like "Bharat ki rajdhani kya hai?". Do not use Devanagari script.';
        return 'LANGUAGE RULE (very important): write EVERYTHING in English only. If the topic is given in Hindi or any other language, understand it and write the questions, options and answers in English. Do not use Devanagari or Hindi words.';
    }
    function qpSeed() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
    function qpKey(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().slice(0, 80); }   // unicode aware (Hindi letters count too)
    function qpHistKey(o) { return o.type === 'model' ? 'M|' + o.cls + '|' + o.subj + '|' + o.lang : 'T|' + o.cls + '|' + o.type + '|' + (o.subj || '') + '|' + qpKey(o.book) + '|' + qpKey(o.topic); }
    function qpHistGet(o) { var h = LSX.get('nb_qp_hist', {}) || {}, a = h[qpHistKey(o)]; return Array.isArray(a) ? a : []; }
    function qpHistSave(o, qs) {
        var h = LSX.get('nb_qp_hist', {}) || {}, k = qpHistKey(o), a = Array.isArray(h[k]) ? h[k] : [], ks = Object.keys(h);
        qs.forEach(function (q) { var x = qpKey(q.q); if (x && a.indexOf(x) < 0) a.push(x); });
        h[k] = a.slice(-420);
        if (ks.length > 30) delete h[ks[0]];
        LSX.set('nb_qp_hist', h);
    }
    function qpPick(a, n) { var c = a.slice(), out = [], i; while (c.length && out.length < n) { i = Math.floor(Math.random() * c.length); out.push(c.splice(i, 1)[0]); } return out; }
    function qpShuf(n) { var a = [], i, j, t; for (i = 0; i < n; i++) a.push(i + 1); for (i = n - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function qpLangOk(qs, lang) {                                // did the AI really write in the chosen language?
        if (lang === 'Both') {                                   // English fields must be English, Hindi fields must be Hindi
            var te = '', th = '', de, le, dh, lh;
            qs.forEach(function (q) { te += ' ' + q.q + ' ' + (q.o ? q.o.join(' ') : '') + ' ' + (q.ans || '') + ' ' + (q.e || ''); th += ' ' + (q.qh || '') + ' ' + (q.oh ? q.oh.join(' ') : '') + ' ' + (q.ansh || '') + ' ' + (q.eh || ''); });
            de = (te.match(/[\u0900-\u097F]/g) || []).length; le = (te.match(/[A-Za-z]/g) || []).length;
            dh = (th.match(/[\u0900-\u097F]/g) || []).length; lh = (th.match(/[A-Za-z]/g) || []).length;
            return (de + le === 0 || de / (de + le) <= 0.1) && (dh + lh === 0 || dh / (dh + lh) >= 0.4);
        }
        var t = '';
        qs.forEach(function (q) { t += ' ' + q.q + ' ' + (q.o ? q.o.join(' ') : '') + ' ' + (q.ans || '') + ' ' + (q.e || ''); });
        var dev = (t.match(/[\u0900-\u097F]/g) || []).length, lat = (t.match(/[A-Za-z]/g) || []).length, tot = dev + lat;
        if (!tot) return true;
        return lang === 'Hindi' ? dev / tot >= 0.55 : dev / tot <= 0.08;
    }
    function qpTitleOf(txt, lang) {
        var m = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(String(txt || '')); if (!m) return '';
        try { var t = JSON.parse('"' + m[1] + '"').trim().slice(0, 120); return t && (lang === 'Both' || qpLangOk([{ q: t }], lang)) ? t : ''; } catch (e) { return ''; }
    }
    function qpSyllabus(o) {
        var b = qpBoard(o.subj), sn = o.subjN ? o.subjN[1] : o.topic, t = '';
        if (b === 'ncert') t = 'SYLLABUS RULE (very important): the subject is ' + sn + '. Follow the NCERT textbook and the NCERT / CBSE syllabus of Class ' + o.cls + ' (chapter names, definitions, examples and exercises in NCERT style). ';
        else if (b === 'bseb') t = 'SYLLABUS RULE (very important): the subject is ' + sn + '. Follow the textbooks and syllabus prescribed by BSEB (Bihar School Examination Board) / SCERT Bihar for Class ' + o.cls + ' and the BSEB exam pattern, NOT NCERT / CBSE books. ' + (o.subj === 'hindi' ? '(For Hindi the books are, for example, the Kislay series, Godhuli, and the Hindi grammar book.) ' : '') + qpBookRule(o);
        else t = 'Use well-established facts only; for school topics follow the textbooks used in Bihar (BSEB / SCERT) or NCERT, whichever fits the topic. ';
        if (!o.model && !o.src) t += 'CHAPTER RULE (very important): the topic may be the name of a lesson, story, poem, essay or chapter from a school textbook, sometimes with the book name (for example "Kislay Bhag 3, chapter 2: Idgah"). First identify the REAL lesson in that book/subject and make every question from its actual content (author, characters, events, theme, message, important lines, vocabulary, grammar of that lesson). Never replace it with a different or generic topic. If you are NOT sure what that lesson contains, do not guess and do not invent: reply with only {"unsure":true}. ';
        if (o.book) t += 'The textbook is: "' + o.book + '". ';
        if (o.src) t += 'SOURCE TEXT of the lesson is given below (it may have been scanned from a photo or PDF, so ignore small spelling mistakes, broken words and stray symbols and understand the meaning). Never reply {"unsure":true} when source text is given. Make ALL questions only from this text and its subject; do not add outside facts about it.\n"""\n' + o.src + '\n"""\n';
        return t;
    }
    function qpPrompt(o, n, done, c) {
        var mcq = o.type === 'mcq', needA = o.ans !== 'none', sn = o.subjN && o.subj !== 'other' ? o.subjN[1] : '';
        var pt = o.part ? o.part.en : '';
        var what = o.model && pt ? 'only the ' + pt + ' portion of the full ' + o.topic + ' syllabus (only the ' + pt + ' chapters / book of Class ' + o.cls + ')' : o.model ? (o.subj === 'nonhindi' ? 'the full Non-Hindi syllabus (all lessons of the Class 8 Hindi book Kislay Bhag-3)' : 'the full ' + o.topic + ' syllabus (all chapters of the Class ' + o.cls + ' ' + o.topic + ' book)') : 'this chapter / topic' + (sn ? ' of the subject ' + sn : '') + ': "' + o.topic + '"';
        var s = 'You are the Question Paper Maker inside Notes Bazar, a study app for Indian school students (Bihar and all India). Make a question paper for Class ' + o.cls + ' on ' + what + '. Difficulty: ' + o.level + '. ' + qpLangRule(o.lang, o.subj) + ' ' + qpSyllabus(o) +
            'Be sure every answer is correct; never invent facts. ';
        if (mcq) s += 'Make EXACTLY ' + n + ' multiple-choice questions. Each has 4 options and exactly one correct option; vary the position of the correct option. Do not put "A)" or "B)" labels inside the option text. ';
        else if (o.type === 'short') s += 'Make EXACTLY ' + n + ' short-answer questions, 2 marks each' + (needA ? ', with a model answer of 2 to 4 lines' : '') + '. ';
        else if (o.type === 'long') s += 'Make EXACTLY ' + n + ' long-answer questions, 5 marks each' + (needA ? ', with a complete model answer in 6 to 10 lines or points' : '') + '. ';
        else s += 'Make EXACTLY ' + n + ' subjective questions, a mix of 2, 3 and 5 mark questions' + (needA ? ', with a model answer whose length fits the marks' : '') + '. ';
        if (pt) s += 'PART RULE (very important): this batch is only for the ' + pt + ' part of ' + o.topic + '. EVERY question must be strictly from ' + pt + ' (its chapters / book) and from nothing else; never from the other parts. ';
        if (c.N) s += 'This is part of a Model Set that must cover the WHOLE syllabus' + (pt ? ' of ' + pt : '') + '. Divide ' + (pt ? 'the ' + pt + ' portion' : 'the textbook') + ' into ' + c.N + ' equal parts in chapter order and take the questions of THIS batch from part ' + c.seg + ' of ' + c.N + ', each question from a different concept. ';
        s += 'Variation code ' + c.seed + ': use it so this paper is different from any other paper on the same subject (different concepts, examples, names and numbers). ';
        s += 'Reply with ONLY one JSON object and nothing else (no markdown fences, no extra words): ';
        var both = o.lang === 'Both';
        var ti = o.model ? '' : '"title":"' + (both ? 'short paper title in English / the same title in Hindi' : 'short paper title in ' + (o.lang === 'Hinglish' ? 'Hinglish' : o.lang)) + '",';
        if (mcq && both) s += '{' + ti + '"questions":[{"q":"English question","qh":"same question in Hindi","o":["English option 1","English option 2","English option 3","English option 4"],"oh":["Hindi option 1","Hindi option 2","Hindi option 3","Hindi option 4"]' + (needA ? ',"a":0,"e":"one short English line explaining the answer","eh":"the same line in Hindi"' : '') + '}]} ' + (needA ? 'where "a" is the index 0-3 of the correct option. ' : '');
        else if (both) s += '{' + ti + '"questions":[{"q":"English question","qh":"same question in Hindi","m":2' + (needA ? ',"ans":"English model answer (use \\n for new lines)","ansh":"same model answer in Hindi (use \\n for new lines)"' : '') + '}]} where "m" is the marks. ';
        else if (mcq) s += '{' + ti + '"questions":[{"q":"question text","o":["option 1","option 2","option 3","option 4"]' + (needA ? ',"a":0,"e":"one short line explaining the answer"' : '') + '}]} ' + (needA ? 'where "a" is the index 0-3 of the correct option. ' : '');
        else s += '{' + ti + '"questions":[{"q":"question text","m":2' + (needA ? ',"ans":"model answer (use \\n for new lines)"' : '') + '}]} where "m" is the marks. ';
        var avoid = done.slice(-40).map(function (q) { return q.q.slice(0, 70); }).concat((c.avoid || []).slice(0, 30));
        if (avoid.length) s += 'These questions already exist, so do NOT repeat or paraphrase them: ' + avoid.map(function (q) { return '"' + q + '"'; }).join('; ') + '. ';
        s += 'Only if the topic is harmful, illegal or sexual, reply with one friendly sentence (no JSON) and suggest another topic.';
        return s;
    }
    function qpStatus(t) { var e = $('qpSt'); if (e) e.textContent = t || ''; }
    /* one chain of AI calls that makes `target` new questions into ctx.pool (several chains may share one pool) */
    async function qpGenSec(o, target, ctx) {
        var mine = 0, fails = 0, langFails = 0, call = 0, lim = qpLim(o, ctx.lim || QP_LIM[o.type]), msg = '', c, n, out, raw, fresh, tt;
        while (mine < target && fails < 4) {
            if (ctx.run !== QP.run) return null;
            n = Math.min(lim, target - mine);
            c = { seed: ctx.seed, N: ctx.N || 0, seg: ctx.segs ? ctx.segs[call % ctx.segs.length] : 0, avoid: ctx.avoid };
            ctx.prog(fails);
            try {
                out = await window.nbCallAi([{ role: 'system', content: qpPrompt(o, n, ctx.pool, c) },
                    { role: 'user', content: 'Make the questions now. ' + qpLangRule(o.lang, o.subj) + ' (variation ' + ctx.seed + '-' + call + ')' }], { timeout: 90000 });
            } catch (e) { fails++; continue; }
            if (ctx.run !== QP.run) return null;
            if (/"unsure"\s*:\s*true/i.test(String(out || ''))) { if (!ctx.pool.length) msg = 'I am not sure what is in "' + o.topic + '". To get the real chapter, write the exact lesson name and book name, or paste the chapter text in the box below, then try again.'; break; }
            raw = qpObjs(out);
            if (raw === null) { if (!ctx.pool.length) msg = String(out || '').replace(/```[\s\S]*?```/g, '').trim().slice(0, 300); break; }
            fresh = qpNorm(raw, o);
            if (fresh.length && !qpLangOk(fresh, o.lang)) { fails++; if (++langFails >= 3) { if (!ctx.pool.length) msg = 'The AI could not write this paper in ' + (o.lang === 'Both' ? 'English and Hindi' : o.lang) + ' right now. Please tap "Make question paper" again.'; break; } continue; }
            fresh = fresh.filter(function (q) { var k = qpKey(q.q); if (!k || ctx.seen[k]) return false; ctx.seen[k] = 1; return true; });
            if (!fresh.length) { fails++; continue; }
            if (!o.title && !o.model && (tt = qpTitleOf(out, o.lang))) o.title = tt;
            fresh = fresh.slice(0, target - mine);
            fresh.forEach(function (q) { ctx.pool.push(q); });
            mine += fresh.length; call++; ctx.prog(0);
        }
        return { msg: msg };
    }
    async function qpGenerate(o) {
        var run = ++QP.run, pool = [], seen = {}, hist = qpHistGet(o), r;
        if (o.type === 'model') return qpGenModel(o, run, hist);
        r = await qpGenSec(o, o.count, { run: run, pool: pool, seen: seen, seed: qpSeed(), avoid: qpPick(hist, 30), lim: QP_LIM[o.type],
            prog: function (f) { qpStatus('Making questions ' + (pool.length + 1) + ' to ' + Math.min(o.count, pool.length + qpLim(o, QP_LIM[o.type])) + ' of ' + o.count + '…' + (f ? ' (trying again)' : '')); } });
        if (r === null) return null;
        return pool.length ? { qs: pool } : { msg: r.msg };
    }
    async function qpGenModel(o, run, hist) {
        var seed = qpSeed(), seen = {}, avoid = qpPick(hist, 30), plan = qpPlan(o), total = 0, cancelled = false, pass, i;
        hist.forEach(function (k) { seen[k] = 1; });               // never repeat questions from the earlier model sets
        plan.forEach(function (t) { t.pool = []; t.o = Object.assign({}, o, { type: t.k, model: true, part: t.part }); total += t.n; });
        var prog = function (f) { var d = 0; plan.forEach(function (t) { d += t.pool.length; }); qpStatus('Making your ' + (o.half ? 'half model set' : 'model set') + '… ' + d + ' of ' + total + ' questions' + (f ? ' (trying again)' : '')); };
        var lims = { mcq: 10, short: 8, long: 5 };
        var mk = function (t) {
            var N = t.k === 'mcq' ? Math.min(8, Math.max(1, Math.ceil(t.n / 6))) : Math.min(3, Math.max(1, Math.ceil(t.n / 4)));
            return { run: run, pool: t.pool, seen: seen, seed: seed, avoid: avoid, lim: lims[t.k], segs: N > 1 ? qpShuf(N) : null, N: N > 1 ? N : 0, prog: prog };
        };
        for (pass = 0; pass < 2 && !cancelled; pass++) {           // second pass fills whatever the first pass could not make
            var idx = 0;
            var worker = async function () {
                var t, need, r;
                while (idx < plan.length && !cancelled) {
                    t = plan[idx++]; need = t.n - t.pool.length; if (need <= 0) continue;
                    r = await qpGenSec(t.o, need, mk(t));
                    if (r === null) { cancelled = true; return; }
                }
            };
            await Promise.all([worker(), worker(), worker(), worker()]);   // 4 chains run side by side so it finishes sooner
        }
        if (cancelled) return null;
        var secs = [], all = [];
        plan.forEach(function (t) { if (t.pool.length) { var qs = t.pool.slice(0, t.n); secs.push({ k: t.k, part: t.part, qs: qs }); all = all.concat(qs); } });
        return all.length ? { qs: all, secs: secs } : { msg: 'Could not make the model set right now. Please try again in a moment.' };
    }
    function qpNl(s) { return NB.esc(s).replace(/\n/g, '<br>'); }
    function qpAns(q, mcq, num, L) {                             // Both: the Hindi answer first, the English one right below it
        var both = !!q.qh, E = NB.esc, h = '<div class="qp-a' + (num ? ' qp-k' : '') + '"><b>' + (num ? (both ? num + '. ' : 'Q' + num + '. ') : L.ans + ': ');
        if (mcq) h += '(' + 'ABCDEF'[q.a] + ') ' + (both && q.oh && q.oh[q.a] ? E(q.oh[q.a]) + ' / ' : '') + E(q.o[q.a]);
        h += '</b>';
        if (mcq) { if (both) { if (q.eh) h += '<div class="qp-hi">' + E(q.eh) + '</div>'; if (q.e) h += '<div class="qp-hi">' + E(q.e) + '</div>'; } else h += q.e ? ' · ' + E(q.e) : ''; }
        else if (both) h += '<div class="qp-hi">' + qpNl(q.ansh || '') + '</div><div class="qp-hi">' + qpNl(q.ans) + '</div>';
        else h += qpNl(q.ans);
        return h + '</div>';
    }
    function qpQ(q, mcq, num, marks, below, L) {                 // Both: Hindi question + English question together, options as "हिंदी / English"
        var both = !!q.qh, E = NB.esc;
        var h = '<div class="qp-q"><div class="qp-qt"><span><b>' + (both ? num + '.' : 'Q' + num + '.') + '</b> ' + E(both ? q.qh : q.q) + '</span>' + (marks ? '<span class="qp-m">[' + marks + ']</span>' : '') + '</div>';
        if (both) h += '<div class="qp-en">' + E(q.q) + '</div>';
        if (mcq) h += '<div class="qp-o">' + q.o.map(function (t, j) { return '<span>(' + 'ABCDEF'[j] + ') ' + (both && q.oh && q.oh.length === q.o.length ? E(q.oh[j]) + ' / ' : '') + E(t) + '</span>'; }).join('') + '</div>';
        if (below) h += qpAns(q, mcq, 0, L);
        return h + '</div>';
    }
    function qpMeta(L, total, time) { return '<div class="qp-meta"><span>' + L.total + ': ' + total + '</span><span>' + L.time + ': ' + time + '</span><span>' + L.name + ': ______________</span><span>' + L.date + ': __________</span></div>'; }
    var QP_SCODE = { hindi: '101', maithili: '104', sanskrit: '105', math: '110', sst: '111', science: '112', english: '113' };   // BSEB Class 10 subject codes
    function qpCover(L, o, total, time) {                        // first-page block of the BSEB paper
        var E = NB.esc, code = o.cls === 10 && QP_SCODE[o.subj] ? QP_SCODE[o.subj] : '', box = '<span class="qp-bx"></span>', i, boxes = '';
        for (i = 0; i < 10; i++) boxes += box;
        return '<div class="qp-cov"><div class="qp-cov-t">' + E(o.cls === 12 ? L.exam12 : L.exam) + '</div>' +
            '<div class="qp-cov-r"><div class="qp-cov-f"><b>' + E(L.roll) + '</b><div class="qp-bxs">' + boxes + '</div></div>' +
            '<div class="qp-cov-f qp-cov-s"><b>' + E(L.scode) + '</b><div class="qp-code">' + (code ? E(code) : '&nbsp;') + '</div></div></div>' +
            '<div class="qp-cov-r"><div class="qp-cov-f"><b>' + E(L.bsl) + '</b> ____________</div>' +
            '<div class="qp-cov-f"><b>' + E(L.time) + ':</b> ' + E(time) + '</div><div class="qp-cov-f"><b>' + E(L.fm) + ':</b> ' + total + '</div></div></div>';
    }
    function qpPartName(pt, lang) { return lang === 'Both' ? pt.hi + ' / ' + pt.en : (lang === 'Hindi' ? pt.hi : pt.en); }
    function qpInsHtml(L, cnt, att) {
        var f = function (t) { return NB.esc(t).replace(/\{m\}/g, cnt.mcq).replace(/\{s\}/g, cnt.short).replace(/\{l\}/g, cnt.long).replace(/\{am\}/g, att ? att.mcq : '').replace(/\{as\}/g, att ? att.short : '').replace(/\{al\}/g, att ? att.long : ''); };
        var lines = L.ins.slice();
        if (att && L.insA) { lines[0] = L.insA[0]; lines.splice(1, 0, L.insA[1]); }
        return '<div class="qp-ins"><b>' + NB.esc(L.insH) + '</b><ol>' + lines.map(function (x) { return '<li>' + (Array.isArray(x) ? f(x[0]) + '<i>' + f(x[1]) + '</i>' : f(x)) + '</li>'; }).join('') + '</ol></div>';
    }
    function qpAttHtml(cnt, att) {                                // big "attempt any" strip printed above the instructions
        if (!att) return '';
        var row = function (n, t, a, m) { return '<span><b>' + n + '</b> ' + t + ': out of ' + a + ', attempt any <u>' + m + '</u></span>'; };
        return '<div class="qp-att"><b>IMPORTANT:</b>' + row('A', 'Objective', cnt.mcq, att.mcq) + row('B', 'Short answer', cnt.short, att.short) + row('C', 'Long answer', cnt.long, att.long) + '</div>';
    }
    function qpBodyModel(p) {
        var o = p.o, L = qpLab(o.lang), E = NB.esc, h = '', n = 0, total = 0, starts = [], cnt = { mcq: 0, short: 0, long: 0 }, lastK = '', kinds = ['mcq', 'short', 'long'];
        p.secs.forEach(function (s) { total += s.qs.length * QP_MARKS[s.k]; cnt[s.k] += s.qs.length; });
        var att = qpLay(o).att; if (att && (cnt.mcq < att.mcq || cnt.short < att.short || cnt.long < att.long)) att = null;
        if (att) total = att.mcq + att.short * 2 + att.long * 5;
        var anyT = function (k) { return att ? ' (' + (L.anyN || '').replace(/\{n\}/g, att[k]) + ')' : ''; };
        var setName = o.half ? L.half : L.set;
        h += '<h1>' + E(qpSubjName(o)) + ' · ' + E(setName) + '</h1><div class="qp-sub">Notes Bazar · ' + L.cls + ' ' + o.cls + (qpBoardName(o.subj) ? ' · ' + qpBoardName(o.subj) : '') + ' · ' + E(setName) + '</div>' + qpCover(L, o, total, o.half ? L.hrsH : L.hrs) + qpMeta(L, total, o.half ? L.hrsH : L.hrs).replace(/<span>[^<]*(?:Time|समय|Samay)[^<]*<\/span>/, '') + qpAttHtml(cnt, att) + qpInsHtml(L, cnt, att);
        p.secs.forEach(function (s) {
            starts.push(n);
            if (s.k !== lastK) { h += '<h2>' + E(L.secs[kinds.indexOf(s.k)] + anyT(s.k)) + '</h2>'; lastK = s.k; }
            if (s.part) h += '<h2 class="qp-h3">' + E(qpPartName(s.part, o.lang)) + '</h2>';
            s.qs.forEach(function (q) { n++; h += qpQ(q, s.k === 'mcq', n, s.k === 'mcq' ? 0 : QP_MARKS[s.k], o.ans === 'below', L); });
        });
        if (o.ans === 'end') {
            h += '<div class="qp-brk"></div><h2>' + E(L.key) + '</h2>'; lastK = '';
            p.secs.forEach(function (s, si) {
                if (!s.qs.length) return;
                if (s.k !== lastK) { h += '<h2 class="qp-h3">' + E(L.secs[kinds.indexOf(s.k)]) + '</h2>'; lastK = s.k; }
                if (s.part) h += '<div class="qp-sum" style="margin-bottom:4px"><u>' + E(qpPartName(s.part, o.lang)) + '</u></div>';
                if (s.k === 'mcq') h += '<div class="qp-sum">' + s.qs.map(function (q, i) { return (starts[si] + i + 1) + '-' + 'ABCDEF'[q.a]; }).join(' &nbsp; ') + '</div>';
                s.qs.forEach(function (q, i) { h += '<div class="qp-q">' + qpAns(q, s.k === 'mcq', starts[si] + i + 1, L) + '</div>'; });
            });
        }
        return h;
    }
    function qpBody(p) {
        if (p.o.type === 'model') return qpBodyModel(p);
        var o = p.o, mcq = o.type === 'mcq', E = NB.esc, L = qpLab(o.lang), h = '';
        var total = mcq ? p.qs.length : p.qs.reduce(function (s, q) { return s + (q.m || 0); }, 0);
        var mins = mcq ? Math.max(5, Math.ceil(p.qs.length * 1.2)) : Math.max(10, Math.ceil(total * 1.5));
        h += '<h1>' + E(o.title || o.topic) + '</h1><div class="qp-sub">Notes Bazar · ' + L.cls + ' ' + o.cls + (o.subj && o.subj !== 'other' ? ' · ' + E(qpSubjName(o)) : '') + (qpBoardName(o.subj) ? ' · ' + qpBoardName(o.subj) : '') + ' · ' + E(L.types[o.type]) + '</div>' + qpMeta(L, total, mins + ' ' + L.min);
        p.qs.forEach(function (q, i) { h += qpQ(q, mcq, i + 1, mcq ? 0 : q.m, o.ans === 'below', L); });
        if (o.ans === 'end') {
            h += '<div class="qp-brk"></div><h2>' + E(L.key) + '</h2>';
            if (mcq) h += '<div class="qp-sum">' + p.qs.map(function (q, i) { return (i + 1) + '-' + 'ABCDEF'[q.a]; }).join(' &nbsp; ') + '</div>';
            p.qs.forEach(function (q, i) { h += '<div class="qp-q">' + qpAns(q, mcq, i + 1, L) + '</div>'; });
        }
        return h;
    }
    function qpFormOpts() { var tv = $('qpType').value; return { cls: parseInt($('qpCls').value, 10), subj: $('qpSubj').value, half: tv === 'half' }; }
    function qpModelTotal(o) { var c = qpPlanCount(o); return c.mcq + c.short + c.long; }
    function qpModelText(o) {
        var c = qpPlanCount(o), parts = qpParts(o), at = qpLay(o).att, marks = at ? at.mcq + at.short * 2 + at.long * 5 : c.mcq + c.short * 2 + c.long * 5;
        return '<p class="nbo-sub" style="margin:6px 0 0">' + (o.half ? 'Half Model Set' : 'Full Model Set') + ': one PDF with ' + c.mcq + ' objective (1 mark)' + (at ? ', attempt any ' + at.mcq : '') + ' + ' + c.short + ' short answer (2 marks)' + (at ? ', attempt any ' + at.short : '') + ' + ' + c.long + ' long answer (5 marks)' + (at ? ', attempt any ' + at.long : '') + ' questions = ' + marks + ' marks' + (at ? ' (attempt-any pattern)' : '') + ', from the whole book' +
            (parts ? ', shared equally between ' + parts.map(function (p) { return p.en; }).join(', ') : '') + '. BSEB style instructions are printed on top. A fresh set every time.</p>';
    }
    function qpSync() {                                           // Model Set: topic + question count are not needed
        var tv = $('qpType').value, m = tv === 'model' || tv === 'half', t = $('qpTopic'), c = $('qpCount'), w = $('qpSubWrap');
        if (m) { if (!c.disabled) QP.cnt = c.value; t.disabled = true; c.disabled = true; c.value = qpModelTotal(qpFormOpts()); t.placeholder = 'Not needed for Model Set'; w.style.display = ''; w.innerHTML = qpModelText(qpFormOpts()); }
        else { t.disabled = false; c.disabled = false; if (QP.cnt) { c.value = QP.cnt; QP.cnt = 0; } t.placeholder = 'e.g. Idgah, Life Processes, Algebra'; w.style.display = 'none'; }
        t.parentNode.classList.toggle('qp-off', m); $('qpMore').style.display = m ? 'none' : '';
    }
    function qpFillSubj(keep) {
        var cls = parseInt($('qpCls').value, 10), sel = $('qpSubj'), l = qpSubjList(cls);
        sel.innerHTML = l.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === keep ? ' selected' : '') + '>' + NB.esc(x[1] + (x[0] === 'other' ? '' : ' (' + x[2] + ')')) + '</option>'; }).join('');
        qpBoardHint();
    }
    /* the "Both" language option is only for non-language subjects (Maths, Science, Social Science ...), never for Hindi / English / Maithili / Sanskrit / Non-Hindi */
    function qpLangFix(initial) {
        var lg = $('qpLang'), sj = $('qpSubj'), o, has, ok; if (!lg || !sj) return;
        ok = !QP_LANGSUBJ[sj.value];
        o = lg.querySelector('option[value="Both"]'); has = !!o;
        if (ok && !has) { o = document.createElement('option'); o.value = 'Both'; o.textContent = 'English + हिंदी (Both)'; lg.appendChild(o); if (initial) { var sv = (LSX.get('nb_qp_opts', null) || {}).lang; if (sv === 'Both') lg.value = 'Both'; } }
        if (!ok && has) { if (lg.value === 'Both') lg.value = sj.value === 'english' ? 'English' : 'Hindi'; o.remove(); }
    }
    function qpBoardHint() {
        var b = $('qpBoard'), v = $('qpSubj') && $('qpSubj').value; if (!b) return;
        b.innerHTML = qpBoardLine(v, 'Questions');
    }
    function qpForm() {
        QP.run++; QP.busy = false; QP.cnt = 0; QP.fromMy = false;
        var body = $('nbqpBody'), s = LSX.get('nb_qp_opts', null) || {}, pr = NB.profile();
        var cls = s.cls || (pr ? parseInt(String(pr.cls).replace('Class ', ''), 10) : 10) || 10;
        body.innerHTML = '<button type="button" class="np-back" id="qpBack"><i class="fa-solid fa-arrow-left"></i> AI PDF Maker</button><h3 class="nbo-h"><i class="fa-solid fa-file-pdf"></i> AI Question Paper</h3><p class="nbo-sub">Make objective or subjective questions on any topic, or a Half / Full Model Set, with or without answers, and save them as a PDF.</p>' +
            '<div class="nbai-set" style="margin-top:10px"><label>Class' + qpSel('qpCls', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return [n, 'Class ' + n]; }), cls) + '</label>' +
            '<label>Question type' + qpSel('qpType', [['mcq', 'Objective (MCQ)'], ['short', 'Subjective: short (2 marks)'], ['long', 'Subjective: long (5 marks)'], ['mixed', 'Subjective: mixed'], ['half', 'Half Model Set (half paper)'], ['model', 'Full Model Set (full paper)']], s.type || 'mcq') + '</label></div>' +
            '<div style="margin-top:10px"><label class="nbo-l" for="qpSubj" style="margin-top:0">Subject</label><select id="qpSubj" class="nbo-in"></select><div class="qp-board" id="qpBoard"></div></div>' +
            '<div id="qpSubWrap" class="qp-subwrap" style="display:none"></div>' +
            '<div id="qpTopicBox" style="margin-top:10px"><div id="qpChWrap"></div><label class="nbo-l" for="qpTopic">Chapter / topic</label><input id="qpTopic" class="nbo-in" maxlength="170" autocomplete="off" placeholder="e.g. Idgah, Life Processes, Algebra" value="' + NB.esc(s.topic || '') + '"></div>' +
            '<details id="qpMore" class="qp-more"><summary>Better accuracy: add the book name, or photo / PDF / paste of the chapter</summary>' +
            qpScanHtml('qp') +
            '<label class="nbo-l" for="qpBook">Book name (optional)</label><input id="qpBook" class="nbo-in" maxlength="80" autocomplete="off" placeholder="e.g. Kislay Bhag 3" value="' + NB.esc(s.book || '') + '">' +
            '<label class="nbo-l" for="qpSrc">Chapter text (optional)</label><textarea id="qpSrc" class="nbo-in" rows="5" maxlength="12000" placeholder="Paste the lesson text here. Questions will then come only from it."></textarea></details>' +
            '<div class="nbai-set"><label>How many questions<input id="qpCount" class="nbo-in" type="number" min="1" max="50" inputmode="numeric" value="' + (s.count || 10) + '"></label>' +
            '<label>Answers' + qpSel('qpAns', [['none', 'No answers'], ['end', 'Answer key at the end'], ['below', 'Answer below each question']], s.ans || 'end') + '</label></div>' +
            '<div class="nbai-set"><label>Language' + qpSel('qpLang', [['English', 'English'], ['Hindi', 'हिंदी (Hindi)'], ['Hinglish', 'Hinglish'], ['Both', 'English + हिंदी (Both)']], s.lang || 'English') + '</label>' +
            '<label>Difficulty' + qpSel('qpLevel', [['Easy', 'Easy'], ['Medium', 'Medium'], ['Hard', 'Hard']], s.level || 'Medium') + '</label></div>' +
            '<div class="nbo-sub" id="qpSt" style="min-height:18px;margin:8px 0 0" aria-live="polite"></div><div class="nbo-err" id="qpErr"></div>' +
            '<button type="button" class="nbo-save" id="qpGo"><i class="fa-solid fa-wand-magic-sparkles"></i> Make question paper</button>';
        qpFillSubj(s.subj); qpSync(); chRender('qp'); qpLangFix(true);
        qpScanInit('qp');
        $('qpBack').addEventListener('click', function () { NB.close('nbQp'); NB.openPdfMaker(); });
        $('qpType').addEventListener('change', qpSync);
        $('qpCls').addEventListener('change', function () { qpFillSubj($('qpSubj').value); chRender('qp'); qpLangFix(false); qpSync(); });
        $('qpSubj').addEventListener('change', function () {
            chRender('qp');
            qpBoardHint(); var v = this.value, lg = $('qpLang');
            if (v === 'hindi' || v === 'maithili' || v === 'sanskrit' || v === 'nonhindi' || v === 'sst') lg.value = 'Hindi'; else if (v === 'english') lg.value = 'English';   // those papers are written in their own language
            qpLangFix(false); qpSync();
        });
        $('qpGo').addEventListener('click', async function () {
            if (QP.busy) return;
            var err = $('qpErr'); err.textContent = '';
            var tv = $('qpType').value, m = tv === 'model' || tv === 'half', cl = parseInt($('qpCls').value, 10), sj = qpSubjFind(cl, $('qpSubj').value);
            if (m && sj[0] === 'other') { err.textContent = 'Please choose a subject for the Model Set.'; return; }
            var o = { topic: m ? sj[1] : (qpTopic() || (sj[0] === 'other' ? '' : sj[1] + ' (any chapters)')), cls: cl, type: m ? 'model' : tv, half: tv === 'half', count: m ? qpModelTotal({ cls: cl, subj: sj[0], half: tv === 'half' }) : parseInt($('qpCount').value, 10), ans: $('qpAns').value, lang: $('qpLang').value, level: $('qpLevel').value, subj: sj[0], subjN: sj,
                book: m ? '' : String($('qpBook').value || '').replace(/\s+/g, ' ').trim().slice(0, 80), src: m ? '' : String($('qpSrc').value || '').trim().slice(0, 12000) };
            if (!m) {
                if (o.topic.length < 2) { err.textContent = 'Please write the topic or chapter first, or choose a subject.'; return; }
                var max = o.type === 'mcq' ? 50 : 30;
                if (!(o.count >= 1)) o.count = 10; if (o.count > max) { o.count = max; $('qpCount').value = max; err.textContent = 'Maximum ' + max + ' questions for this type. Making ' + max + '.'; }
            }
            LSX.set('nb_qp_opts', { topic: qpTopic(), book: o.book, cls: o.cls, type: tv, count: m ? (QP.cnt || 10) : o.count, ans: o.ans, lang: o.lang, level: o.level, subj: o.subj });
            if (typeof window.nbCallAi !== 'function') { err.textContent = 'The AI is still loading. Please try again in a moment.'; return; }
            QP.busy = true; var go = $('qpGo'); go.disabled = true;
            var r = await qpGenerate(o);
            QP.busy = false; if (go) go.disabled = false;
            if (!r) return;                                      // window was closed while it was working
            qpStatus('');
            if (r.msg || !r.qs) { err.textContent = r.msg || 'Could not make the questions right now. Please try again in a moment.'; return; }
            if (!r.qs.length) { err.textContent = 'Could not make the questions right now. Please try again in a moment.'; return; }
            try { qpHistSave(o, r.qs); } catch (e) {}
            QP.paper = { o: o, qs: r.qs, secs: r.secs }; mySave('paper', QP.paper); qpResult(r.qs.length < o.count);
        });
    }
    function qpResult(partial) {
        var body = $('nbqpBody'), p = QP.paper;
        if (!$('qpStyle')) { var st = document.createElement('style'); st.id = 'qpStyle'; st.textContent = QP_CSS; document.head.appendChild(st); }
        body.innerHTML = '<button type="button" class="np-back" id="qpRBack"><i class="fa-solid fa-arrow-left"></i> Back</button><h3 class="nbo-h"><i class="fa-solid fa-file-pdf"></i> Your question paper</h3><p class="nbo-sub">' + p.qs.length + ' questions' + (partial ? ' (the AI could not make all ' + p.o.count + ', tap "Make another paper" to try again)' : '') + '</p>' +
            '<div class="nbqp-prev"><div class="qpw">' + qpBody(p) + '</div></div>' +
            pdfBtns() + '<p class="nbo-sub" style="margin:8px 0 0">Saved in <b>My PDFs</b> on this phone.</p>' +
            '<button type="button" class="nbo-skip" id="qpNew">Make another paper</button>';
        pdfWire('qp');
        $('qpNew').addEventListener('click', qpForm);
        $('qpRBack').addEventListener('click', function () { if (QP.fromMy) { QP.fromMy = false; NB.close('nbQp'); NB.openMyPdfs(); } else qpForm(); });
    }

    /* ---------- Scan a page: camera / photo / PDF -> text (OCR runs on the phone, no AI vision needed) ---------- */
    var QS = { tess: null, pdf: null, worker: null, busy: false, p: 'qp' };
    function qpLoadScript(src) {
        return new Promise(function (res, rej) {
            var el = document.createElement('script'); el.src = src; el.async = true; el.crossOrigin = 'anonymous';
            el.onload = res; el.onerror = function () { rej(new Error('Could not load ' + src)); };
            document.head.appendChild(el);
        });
    }
    function qpScanSt(t, bad) { var e = $(QS.p + 'ScanSt'); if (e) { e.textContent = t || ''; e.classList.toggle('qp-bad', !!bad); } }
    async function qpTess() {
        if (QS.tess) return QS.tess;
        if (!window.Tesseract) await qpLoadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
        QS.tess = window.Tesseract; return QS.tess;
    }
    async function qpOcrWorker(lang) {
        var T = await qpTess();
        if (QS.worker && QS.worker.lang === lang) return QS.worker.w;
        if (QS.worker) { try { await QS.worker.w.terminate(); } catch (e) {} QS.worker = null; }
        var w = await T.createWorker(lang, 1, { logger: function (m) {
            if (m && m.status === 'recognizing text') qpScanSt('Reading text… ' + Math.round((m.progress || 0) * 100) + '%');
            else if (m && /loading/.test(m.status || '')) qpScanSt('Loading Hindi + English reader (first time only)…');
        } });
        QS.worker = { w: w, lang: lang }; return w;
    }
    function qpScanLang() {
        var l = $(QS.p + 'Lang') ? $(QS.p + 'Lang').value : 'English', sj = $(QS.p + 'Subj') ? $(QS.p + 'Subj').value : '';
        return (l === 'Hindi' || sj === 'hindi' || sj === 'maithili' || sj === 'sanskrit' || sj === 'nonhindi' || sj === 'sst') ? 'hin+eng' : 'eng+hin';
    }
    function qpImgToCanvas(file) {                               // shrink big camera photos (faster + less memory) and make them greyscale/contrasty
        return new Promise(function (res, rej) {
            var url = URL.createObjectURL(file), im = new Image();
            im.onload = function () {
                var max = 2000, k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
                c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.filter = 'grayscale(1) contrast(1.25)'; x.drawImage(im, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url); res(c);
            };
            im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('This image could not be opened.')); };
            im.src = url;
        });
    }
    function qpCleanText(t) { return String(t || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
    async function qpOcrCanvas(c) {
        var w = await qpOcrWorker(qpScanLang()), r = await w.recognize(c);
        return qpCleanText(r && r.data && r.data.text);
    }
    async function qpPdfLib() {
        if (QS.pdf) return QS.pdf;
        if (!window.pdfjsLib) await qpLoadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        QS.pdf = window.pdfjsLib; return QS.pdf;
    }
    async function qpReadPdf(file) {
        var lib = await qpPdfLib(), buf = await file.arrayBuffer(), doc = await lib.getDocument({ data: buf }).promise, n = Math.min(doc.numPages, 12), out = [], i, pg, tc, txt, vp, cv;
        for (i = 1; i <= n; i++) {
            qpScanSt('Reading PDF page ' + i + ' of ' + n + '…');
            pg = await doc.getPage(i);
            tc = await pg.getTextContent();
            txt = qpCleanText(tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ' '); }).join(''));
            if (txt.replace(/\s/g, '').length < 40) {            // scanned page (no real text) -> OCR it
                vp = pg.getViewport({ scale: 2 }); cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
                await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
                txt = await qpOcrCanvas(cv);
            }
            if (txt) out.push(txt);
            if (out.join('\n\n').length > 12000) break;
        }
        if (doc.numPages > n) qpScanSt('Only the first ' + n + ' pages were read.');
        return out.join('\n\n');
    }
    NB.readDoc = async function (file) {                          // used by Bazar AI: text of a PDF (scanned pages are OCR-ed) or of a photo
        QS.p = '__none';
        if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) return qpReadPdf(file);
        if (/^image\//.test(file.type)) return qpOcrCanvas(await qpImgToCanvas(file));
        return file.text();
    };
    async function qpScanFiles(files, pfx) {
        if (QS.busy || !files || !files.length) return;
        QS.p = pfx || 'qp';
        if (!navigator.onLine) { qpScanSt('You are offline. Connect to the internet to read a page.', true); return; }
        QS.busy = true; var btns = document.querySelectorAll('.qp-sb'), i, parts = [], f, txt;
        btns.forEach(function (b) { b.disabled = true; });
        try {
            for (i = 0; i < files.length && i < 6; i++) {
                f = files[i];
                qpScanSt((files.length > 1 ? 'Page ' + (i + 1) + ' of ' + Math.min(files.length, 6) + ': ' : '') + 'Preparing…');
                if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { if (f.size > 20 * 1024 * 1024) throw new Error('This PDF is too big (max 20 MB).'); txt = await qpReadPdf(f); }
                else if (/^image\//.test(f.type)) txt = await qpOcrCanvas(await qpImgToCanvas(f));
                else throw new Error('Please choose a photo or a PDF.');
                if (txt) parts.push(txt);
            }
            var all = qpCleanText(parts.join('\n\n'));
            if (all.replace(/\s/g, '').length < 20) { qpScanSt('No readable text found. Take a clear, straight photo in good light and try again.', true); return; }
            var ta = $(QS.p + 'Src'), old = String(ta.value || '').trim(), max = 12000;
            ta.value = (old ? old + '\n\n' + all : all).slice(0, max);
            var det = $(QS.p + 'More'); if (det) det.open = true;
            qpScanSt('Done. Text was added below (' + all.length + ' letters). Check it, fix mistakes if any, then tap "Make question paper".');
            var er = $(QS.p + 'Err'); if (er) er.textContent = '';
        } catch (e) {
            console.warn('scan failed', e);
            qpScanSt(/load/i.test(String(e && e.message)) ? 'The reader could not be loaded. Check your internet and try again.' : (e && e.message ? e.message : 'Could not read this file. Please try another photo.'), true);
        } finally { QS.busy = false; btns.forEach(function (b) { b.disabled = false; }); }
    }
    function qpScanHtml(p) {
        return '<div class="qp-scan"><div class="qp-scan-t"><i class="fa-solid fa-camera"></i> Take a photo or upload the page</div>' +
            '<div class="qp-scan-b"><button type="button" class="qp-sb" id="' + p + 'Cam"><i class="fa-solid fa-camera"></i> Camera</button>' +
            '<button type="button" class="qp-sb" id="' + p + 'Img"><i class="fa-solid fa-image"></i> Photo / Gallery</button>' +
            '<button type="button" class="qp-sb" id="' + p + 'PdfUp"><i class="fa-solid fa-file-pdf"></i> PDF</button></div>' +
            '<input type="file" id="' + p + 'FCam" accept="image/*" capture="environment" hidden>' +
            '<input type="file" id="' + p + 'FImg" accept="image/*" multiple hidden>' +
            '<input type="file" id="' + p + 'FPdf" accept="application/pdf,.pdf" hidden>' +
            '<div class="qp-scan-s" id="' + p + 'ScanSt" aria-live="polite"></div></div>';
    }
    function qpScanInit(p) {
        p = p || 'qp';
        [[p + 'Cam', p + 'FCam'], [p + 'Img', p + 'FImg'], [p + 'PdfUp', p + 'FPdf']].forEach(function (m) {
            var b = $(m[0]), inp = $(m[1]); if (!b || !inp) return;
            b.addEventListener('click', function () { if (!QS.busy) inp.click(); });
            inp.addEventListener('change', function () { var fl = Array.prototype.slice.call(inp.files || []); inp.value = ''; qpScanFiles(fl, p); });
        });
    }
    function qpTopic() { return String(($('qpTopic') || {}).value || '').replace(/\s+/g, ' ').trim().slice(0, 170); }
    function qpObjs(txt) {                                       // pull the question objects out of the reply, even when it was cut off
        txt = String(txt || '').replace(/```(?:json)?/gi, '');
        var i = txt.indexOf('{'); if (i < 0) return null;
        var j = txt.lastIndexOf('}');
        if (j > i) { try { var o = JSON.parse(txt.slice(i, j + 1)); if (o && Array.isArray(o.questions)) return o.questions; } catch (e) {} }
        var k = txt.indexOf('['), arr = []; if (k < 0) return null;
        var depth = 0, st = -1, inS = false, esc = false, c;
        for (var x = k + 1; x < txt.length; x++) {
            c = txt[x];
            if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
            if (c === '"') inS = true;
            else if (c === '{') { if (!depth) st = x; depth++; }
            else if (c === '}') { depth--; if (!depth && st > -1) { try { arr.push(JSON.parse(txt.slice(st, x + 1))); } catch (e) {} st = -1; } }
        }
        return arr;
    }
    function qpNorm(arr, o) {
        var mcq = o.type === 'mcq', needA = o.ans !== 'none', out = [];
        (arr || []).forEach(function (q) {
            if (!q || typeof q.q !== 'string' || !q.q.trim()) return;
            if (mcq) {
                if (!Array.isArray(q.o)) return;
                var op = q.o.map(function (v) { return String(v == null ? '' : v).replace(/^\(?[A-Fa-f][\).:]\s+/, '').trim().slice(0, 200); }).filter(Boolean).slice(0, 6), a = parseInt(q.a, 10);
                if (op.length < 2) return;
                if (needA && !(a >= 0 && a < op.length)) return;
                var item = { q: q.q.trim().slice(0, 400), o: op, a: needA ? a : -1, e: typeof q.e === 'string' ? q.e.trim().slice(0, 260) : '' };
                if (o.lang === 'Both') {                         // the Hindi copy must have the same number of options, or the question is skipped
                    var oh = Array.isArray(q.oh) ? q.oh.map(function (v) { return String(v == null ? '' : v).replace(/^\(?[A-Fa-fअ-औ][\).:]\s+/, '').trim().slice(0, 220); }).filter(Boolean).slice(0, 6) : [];
                    if (typeof q.qh !== 'string' || !q.qh.trim() || oh.length !== op.length) return;
                    item.qh = q.qh.trim().slice(0, 450); item.oh = oh; item.eh = typeof q.eh === 'string' ? q.eh.trim().slice(0, 300) : '';
                }
                out.push(item);
            } else {
                var m = parseInt(q.m, 10); if (o.type === 'short') m = 2; else if (o.type === 'long') m = 5; else if (!(m > 0 && m <= 10)) m = 3;
                var ans = Array.isArray(q.ans) ? q.ans.join('\n') : (typeof q.ans === 'string' ? q.ans : '');
                ans = ans.trim().slice(0, 2500);
                if (needA && !ans) return;
                var it2 = { q: q.q.trim().slice(0, 500), m: m, ans: ans };
                if (o.lang === 'Both') {
                    if (typeof q.qh !== 'string' || !q.qh.trim()) return;
                    var ah = Array.isArray(q.ansh) ? q.ansh.join('\n') : (typeof q.ansh === 'string' ? q.ansh : ''); ah = ah.trim().slice(0, 2800);
                    if (needA && !ah) return;
                    it2.qh = q.qh.trim().slice(0, 550); it2.ansh = ah;
                }
                out.push(it2);
            }
        });
        return out;
    }
    function qpDoc(p) {
        return '<!doctype html><html><head><meta charset="utf-8"><title>' + NB.esc('Question Paper - ' + p.o.topic) + '</title><style>@page{size:A4;margin:14mm}body{margin:0}' + QP_CSS + '</style></head><body><div class="qpw">' + qpBody(p) + '</div></body></html>';
    }
    function qpPrint() {
        NB.markDay('pdf');
        if (!QP.paper) return;
        var html = qpDoc(QP.paper), f = document.createElement('iframe');
        f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(f);
        var d = f.contentWindow.document; d.open(); d.write(html); d.close();
        var go = function () {
            try { f.contentWindow.focus(); f.contentWindow.print(); }
            catch (e) { var w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); setTimeout(function () { w.print(); }, 400); } else NB.toast('Please allow pop-ups to download the PDF.', 3500); }
            setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 90000);
        };
        setTimeout(go, 400);
        NB.toast('Choose "Save as PDF" as the printer in the next window.', 4500);
    }
    function qpSel(id, opts, cur) { return '<select id="' + id + '" class="nbo-in">' + opts.map(function (x) { return '<option value="' + x[0] + '"' + (String(x[0]) === String(cur) ? ' selected' : '') + '>' + NB.esc(x[1]) + '</option>'; }).join('') + '</select>'; }
    function buildPaper() {
        document.body.appendChild(NB.mk('<div class="nbo" id="nbQp" aria-hidden="true"><div class="nbo-card nbq nbqp" role="dialog" aria-modal="true" aria-label="AI Question Paper">' +
            '<button type="button" class="nbo-x" id="nbqpX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div id="nbqpBody"></div></div></div>'));
        $('nbqpX').addEventListener('click', function () { NB.close('nbQp'); });
        NB.onClose.nbQp = function () { QP.run++; QP.busy = false; };
    }
    NB.openPaper = function () { closeSiteMenu(); if (!$('nbQp')) buildPaper(); NB.open('nbQp'); qpForm(); };

    /* =====================================================================
       AI PDF Maker (hub) + Notes Maker: colourful short / long notes as PDF
       Structure comes from the AI (JSON blocks); the look, tables, flow charts,
       mind maps and highlights are drawn here. Pictures come from Wikimedia Commons.
       ===================================================================== */
    var NP = { run: 0, busy: false, doc: null };
    var NP_PAL = [['#2563eb', '#dbeafe'], ['#db2777', '#fce7f3'], ['#16a34a', '#dcfce7'], ['#ea580c', '#ffedd5'], ['#7c3aed', '#ede9fe'], ['#0891b2', '#cffafe']];
    var NP_SEC = { short: [3, 4, 5, 6, 7], long: [5, 6, 8, 10, 12] };            // sections per class band: 1-2, 3-5, 6-8, 9-10, 11-12
    var NP_WORDS = { short: [30, 45, 60, 80, 100], long: [90, 140, 200, 280, 360] };   // words per section per class band (higher class = more)
    var NP_LEVEL = [
        'CLASS LEVEL: Class 1-2. Use very short, very simple sentences and everyday examples a small child knows. No difficult words.',
        'CLASS LEVEL: Class 3-5. Use simple language, small sentences, easy daily-life examples.',
        'CLASS LEVEL: Class 6-8. Clear middle-school language, textbook definitions in simple words, easy formulas and examples.',
        'CLASS LEVEL: Class 9-10 (board exam). Follow the textbook exactly: textbook definitions, laws, formulas with units, numerical examples, diagram-based points and exam-style points.',
        'CLASS LEVEL: Class 11-12 (advanced board + entrance exam). Be precise and deeper: exact definitions, laws with conditions, derivations, exceptions, units and dimensions, higher-level examples and numericals.'
    ];
    var NP_L = {
        English: { def: 'Definition', f: 'Formula', eg: 'Example', tip: 'Important', mn: 'Memory trick', short: 'Short Notes', long: 'Detailed Notes', cls: 'Class', cred: 'Pictures: Wikimedia Commons (free licences)' },
        Hindi: { def: 'परिभाषा', f: 'सूत्र', eg: 'उदाहरण', tip: 'महत्वपूर्ण', mn: 'याद रखने की ट्रिक', short: 'संक्षिप्त नोट्स', long: 'विस्तृत नोट्स', cls: 'कक्षा', cred: 'चित्र: Wikimedia Commons (मुफ़्त लाइसेंस)' },
        Hinglish: { def: 'Paribhasha', f: 'Sutra', eg: 'Udaharan', tip: 'Mahatvapurn', mn: 'Yaad rakhne ki trick', short: 'Sankshipt Notes', long: 'Vistrit Notes', cls: 'Class', cred: 'Pictures: Wikimedia Commons (free licences)' }
    };
    var NP_CSS = [
        '.npw{font-family:"Segoe UI",Roboto,"Noto Sans Devanagari",Mangal,Arial,sans-serif;color:#1e293b;background:#fff;font-size:13px;line-height:1.55;text-align:left}',
        '.npw,.npw *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
        '.npw .np-hd{background:linear-gradient(135deg,#4f46e5,#db2777 60%,#f59e0b);color:#fff;border-radius:14px;padding:16px 18px;margin:0 0 14px}',
        '.npw .np-ht{font-size:22px;font-weight:800;line-height:1.25}.npw .np-hm{font-size:11.5px;margin-top:5px;font-weight:600;opacity:.95}',
        '.npw .np-s{margin:0 0 16px}',
        '.npw .np-s h2{display:flex;align-items:center;gap:8px;margin:0 0 8px;padding:7px 12px;border-radius:10px;background:var(--c);color:#fff;font-size:15px;font-weight:800;break-after:avoid;page-break-after:avoid}',
        '.npw .np-n{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:50%;background:#fff;color:var(--c);font-size:12px;font-weight:800}',
        '.npw .np-b{margin:0 0 9px;break-inside:avoid;page-break-inside:avoid}',
        '.npw .np-lb{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:1px 8px;border-radius:99px;background:var(--c);color:#fff;margin-right:6px;vertical-align:1px}',
        '.npw .np-def{border-left:5px solid var(--c);background:var(--b);padding:8px 11px;border-radius:0 10px 10px 0}.npw .np-def b{color:var(--c)}',
        '.npw mark{background:#fde047;color:#111;padding:0 3px;border-radius:3px}',
        '.npw .np-pt{font-weight:800;color:var(--c);margin:0 0 3px}',
        '.npw .np-p{list-style:none;margin:0;padding:0}.npw .np-p li{position:relative;padding-left:18px;margin:3px 0}',
        '.npw .np-p li::before{content:"";position:absolute;left:3px;top:.55em;width:8px;height:8px;border-radius:50%;background:var(--c)}',
        '.npw .np-f{border:2px dashed #7c3aed;background:#f5f3ff;border-radius:12px;padding:8px 12px;text-align:center}',
        '.npw .np-fv{font-family:"Cambria Math","Segoe UI",serif;font-size:17px;font-weight:800;color:#5b21b6;margin:3px 0}.npw .np-fn{font-size:11.5px;color:#475569}',
        '.npw .np-tw{overflow-x:auto}.npw .np-t{width:100%;border-collapse:collapse;font-size:12px}',
        '.npw .np-t th{background:var(--c);color:#fff;padding:5px 7px;text-align:left;border:1px solid var(--c)}',
        '.npw .np-t td{padding:5px 7px;border:1px solid #cbd5e1;vertical-align:top}.npw .np-t tr:nth-child(even) td{background:var(--b)}',
        '.npw .np-fl{display:flex;flex-wrap:wrap;align-items:center;gap:6px 4px}',
        '.npw .np-fs{background:var(--b);border:2px solid var(--c);color:#111;border-radius:10px;padding:5px 10px;font-weight:600;font-size:12px}.npw .np-fa{color:var(--c);font-weight:800;font-size:17px}',
        '.npw .np-eg{background:#ecfdf5;border-left:5px solid #16a34a;border-radius:0 10px 10px 0;padding:8px 11px}.npw .np-eg .np-lb{background:#16a34a}',
        '.npw .np-tip{background:#fef9c3;border:1.5px solid #eab308;border-radius:10px;padding:7px 11px}.npw .np-tip .np-lb{background:#ca8a04}',
        '.npw .np-mn{background:#fdf2f8;border:1.5px solid #db2777;border-radius:10px;padding:7px 11px}.npw .np-mn .np-lb{background:#db2777}',
        '.npw .np-map{border:2px solid var(--b);border-radius:12px;padding:4px;background:#fff}.npw .np-map svg{width:100%;height:auto;display:block}',
        '.npw .np-img{margin:0 0 9px;text-align:center;position:relative;break-inside:avoid;page-break-inside:avoid;border:2px solid var(--b);border-radius:12px;padding:6px;background:#fff}',
        '.npw .np-img img{max-width:100%;max-height:250px;object-fit:contain}.npw .np-img figcaption{font-size:10.5px;color:#64748b;margin-top:2px}',
        '.npw .np-rm{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;border:0;background:rgba(15,23,42,.75);color:#fff;font-size:13px;line-height:24px;cursor:pointer;padding:0}',
        '.npw .np-ft{text-align:center;font-size:10.5px;color:#64748b;margin-top:10px;border-top:1px solid #e2e8f0;padding-top:6px}',
        '@media print{.npw .np-rm{display:none!important}}'
    ].join('');

    /* --- text helpers --- */
    function npS(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 600); }
    function npH(t) { return NB.esc(String(t || '')).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>').replace(/\*\*/g, ''); }
    function npStatus(t) { var e = $('npSt'); if (e) e.textContent = t || ''; }
    function npJson(txt) {
        txt = String(txt || '').replace(/```(?:json)?/gi, '');
        var i = txt.indexOf('{'), j = txt.lastIndexOf('}'); if (i < 0 || j <= i) return null;
        try { return JSON.parse(txt.slice(i, j + 1)); } catch (e) { return null; }
    }
    function npBlocks(txt) {                                     // blocks array, even from a reply that was cut off
        var o = npJson(txt); if (o && Array.isArray(o.blocks)) return o.blocks;
        txt = String(txt || '').replace(/```(?:json)?/gi, '');
        var k = txt.indexOf('['), arr = [], depth = 0, st = -1, inS = false, esc = false, c, x;
        if (k < 0) return null;
        for (x = k + 1; x < txt.length; x++) {
            c = txt[x];
            if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
            if (c === '"') inS = true;
            else if (c === '{') { if (!depth) st = x; depth++; }
            else if (c === '}') { depth--; if (!depth && st > -1) { try { arr.push(JSON.parse(txt.slice(st, x + 1))); } catch (e) {} st = -1; } }
        }
        return arr;
    }
    function npNB(b) {
        if (!b || typeof b.t !== 'string') return null;
        var t = b.t, v, items, head, rows, cols, steps, nodes;
        if (t === 'def') { v = npS(b.v, 800); return v ? { t: t, k: npS(b.k, 90), v: v } : null; }
        if (t === 'pts') { items = (Array.isArray(b.items) ? b.items : []).map(function (x) { return npS(x, 320); }).filter(Boolean).slice(0, 14); return items.length ? { t: t, title: npS(b.title, 90), items: items } : null; }
        if (t === 'formula') { v = npS(b.v, 320); return v ? { t: t, k: npS(b.k, 90), v: v, n: npS(b.n, 320) } : null; }
        if (t === 'table') {
            head = (Array.isArray(b.head) ? b.head : []).map(function (x) { return npS(x, 80); }).slice(0, 6); cols = head.length;
            if (cols < 2 || !Array.isArray(b.rows)) return null;
            rows = b.rows.filter(Array.isArray).slice(0, 12).map(function (r) { var o = r.slice(0, cols).map(function (x) { return npS(x, 180); }); while (o.length < cols) o.push(''); return o; });
            return rows.length ? { t: t, title: npS(b.title, 90), head: head, rows: rows } : null;
        }
        if (t === 'flow') { steps = (Array.isArray(b.steps) ? b.steps : []).map(function (x) { return npS(x, 90); }).filter(Boolean).slice(0, 8); return steps.length >= 2 ? { t: t, title: npS(b.title, 90), steps: steps } : null; }
        if (t === 'map') { nodes = (Array.isArray(b.nodes) ? b.nodes : []).map(function (x) { return npS(x, 60); }).filter(Boolean).slice(0, 8); return (nodes.length >= 3 && npS(b.center, 60)) ? { t: t, center: npS(b.center, 60), nodes: nodes } : null; }
        if (t === 'eg') { v = String(b.v == null ? '' : b.v).replace(/\r/g, '').trim().slice(0, 1600); return v ? { t: t, title: npS(b.title, 90), v: v } : null; }
        if (t === 'tip' || t === 'mnem') { v = npS(b.v, 420); return v ? { t: t === 'mnem' ? 'mn' : t, v: v } : null; }
        return null;
    }
    function npLangOk(blocks, lang) {
        var t = JSON.stringify(blocks), dev = (t.match(/[\u0900-\u097F]/g) || []).length, lat = (t.match(/[A-Za-z]/g) || []).length, tot = dev + lat;
        if (tot < 40) return true;
        return lang === 'Hindi' ? dev / tot >= 0.3 : dev / tot <= 0.1;
    }

    /* --- prompts --- */
    function npBand(c) { return c <= 2 ? 0 : (c <= 5 ? 1 : (c <= 8 ? 2 : (c <= 10 ? 3 : 4))); }
    function npCommon(o) {
        var sn = o.subjN && o.subj !== 'other' ? o.subjN[1] : '', b = qpBoard(o.subj), t;
        t = 'You are the Notes Maker inside Notes Bazar, a study app for Indian school students (Bihar and all India). Make ' + (o.type === 'short' ? 'SHORT' : 'LONG (detailed)') + ' study notes for Class ' + o.cls + (sn ? ', subject ' + sn : '') + ', chapter / topic: "' + o.topic + '". ' + qpLangRule(o.lang, o.subj) + ' ' + NP_LEVEL[npBand(o.cls)] + ' ';
        if (b === 'ncert') t += 'SYLLABUS RULE: follow the NCERT textbook and CBSE syllabus of Class ' + o.cls + '. ';
        else if (b === 'bseb') t += 'SYLLABUS RULE: follow the textbooks and syllabus of BSEB (Bihar School Examination Board) / SCERT Bihar for Class ' + o.cls + ', NOT NCERT / CBSE books. ' + qpBookRule(o);
        else t += 'Use well-established facts only; follow the school textbooks (BSEB / SCERT Bihar or NCERT) that fit the topic. ';
        if (!o.src) t += 'CHAPTER RULE (very important): the topic may be a lesson, story, poem or chapter of a school textbook, sometimes with the book name. First identify the REAL lesson in that book and use its actual content (author, characters, events, theme, important lines, vocabulary, grammar). Never replace it with a different or generic topic. If you are NOT sure what that lesson contains, do not guess and do not invent: reply with only {"unsure":true}. ';
        if (o.book) t += 'The textbook is: "' + o.book + '". ';
        if (o.src) t += 'SOURCE TEXT of the lesson is given below (it may be scanned from a photo or PDF, so ignore small spelling mistakes, broken words and stray symbols and understand the meaning). Never reply {"unsure":true} when source text is given. Make ALL the notes only from this text; do not add outside facts about it.\n"""\n' + o.src.slice(0, 9000) + '\n"""\n';
        return t + 'Be sure every fact, definition and formula is correct; never invent facts. ';
    }
    function npOutlinePrompt(o, N, maxImg) {
        return npCommon(o) + 'STEP 1: make ONLY the OUTLINE. Plan exactly ' + N + ' sections in the best teaching order (for a story, poem or lesson: introduction and author, summary, characters or main ideas, important lines and words, message). The last section must be a "Quick revision" section with the key points' + (o.type === 'long' ? ', and the section before it must be "Exam tips and common mistakes"' : '') + '. For each section give a short heading, ONE matching emoji as "icon", and "img": a short ENGLISH search phrase for a real labelled diagram or picture of that section (for example "human heart labelled diagram"), or an empty string if no picture would help. Use pictures for at most ' + maxImg + ' sections only (never for Quick revision, Maths working or grammar). Headings and the title are written in the chosen language. Reply with ONLY one JSON object, no markdown: {"title":"short notes title","sections":[{"h":"heading","icon":"📘","img":""}]} ' +
            'Only if the topic is harmful, illegal or sexual, reply with one friendly sentence (no JSON).';
    }
    function npSecPrompt(o, outline, i, words) {
        var list = outline.sections.map(function (s, k) { return (k + 1) + '. ' + s.h; }).join('; '), s = outline.sections[i], long = o.type === 'long', q;
        q = npCommon(o) + 'The notes outline is: ' + list + '. NOW write ONLY section ' + (i + 1) + ' of ' + outline.sections.length + ': "' + s.h + '". Do not repeat what other sections cover. ';
        q += 'Use these block types inside "blocks" (pick what fits; vary them): ' +
            '{"t":"def","k":"term","v":"definition"} ; ' +
            '{"t":"pts","title":"optional small heading","items":["point","point"]} ; ' +
            '{"t":"formula","k":"formula name","v":"the formula","n":"meaning of each symbol and its unit"} ; ' +
            '{"t":"table","title":"","head":["col1","col2"],"rows":[["a","b"]]} ; ' +
            '{"t":"flow","title":"","steps":["step 1","step 2","step 3"]} for a process or sequence (3 to 7 short steps) ; ' +
            '{"t":"map","center":"main idea","nodes":["part 1","part 2","part 3"]} for a mind map (3 to 8 short nodes) ; ' +
            '{"t":"eg","title":"Example","v":"solved example, use \\n between steps"} ; ' +
            '{"t":"tip","v":"important exam point"} ; {"t":"mnem","v":"memory trick or mnemonic"}. ';
        q += 'Put **double stars** around the most important words (about 3 to 8 per section) so they get highlighted. Write formulas in plain Unicode text (x², √, ×, ÷, →, Δ, π), never LaTeX and never $ signs. ';
        if (long) q += 'LONG NOTES: give the complete definition and clear explanation, EVERY important formula with the meaning of each symbol and its unit, derivation or working steps where the textbook has them, a comparison table when two or more things can be compared, a flow or map for processes, at least one solved example for Maths / Science numericals, and a tip' + (' and a memory trick when useful') + '. Write about ' + words + ' words in total for this section (formula and derivation sections may be a little longer). ';
        else q += 'SHORT NOTES: keep it brief and quick to revise. Every definition is only 1 or 2 lines. Points are short (under 14 words). Add the formulas that matter. Use at most one table, flow or map and only if it really helps. About ' + words + ' words in total for this section. ';
        if (/revision/i.test(s.h)) q += 'This is the quick revision section: use mostly "pts" (the most important points) and formulas only. ';
        return q + 'Reply with ONLY one JSON object, no markdown: {"blocks":[ ... ]} Only if the topic is harmful, illegal or sexual, reply with one friendly sentence (no JSON).';
    }

    /* --- pictures (Wikimedia Commons) --- */
    async function npImg(q) {
        var ctrl = new AbortController(), tm = setTimeout(function () { ctrl.abort(); }, 9000), r, j, pages, arr, i, ii, p;
        try {
            r = await fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=' + encodeURIComponent(q) + '&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=700', { signal: ctrl.signal });
            j = await r.json(); pages = j && j.query && j.query.pages; if (!pages) return null;
            arr = Object.keys(pages).map(function (k) { return pages[k]; }).sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
            for (i = 0; i < arr.length; i++) {
                p = arr[i]; ii = p.imageinfo && p.imageinfo[0];
                if (!ii || !ii.thumburl || !/^image\/(jpeg|png|svg\+xml)$/.test(ii.mime || '') || (ii.width || 0) < 300) continue;
                return { src: ii.thumburl, cap: String(p.title || '').replace(/^File:/i, '').replace(/\.[a-z]{3,4}$/i, '').replace(/_/g, ' ').slice(0, 90) };
            }
        } catch (e) {} finally { clearTimeout(tm); }
        return null;
    }

    /* --- generation --- */
    async function npAi(msgs, run) {                             // the AI key is shared by all students, so when it is busy wait and try again
        var d = [0, 12000, 25000, 40000], i;
        for (i = 0; i < d.length; i++) {
            if (d[i]) { npStatus('The AI is busy right now, trying again in a few seconds…'); await new Promise(function (r) { setTimeout(r, d[i]); }); if (run !== NP.run) return ''; }
            try { return await window.nbCallAi(msgs, { timeout: 90000 }); } catch (e) {}
        }
        throw new Error('AI busy');
    }
    async function npSection(o, outline, i, words, run) {
        var a, out, bl, nb;
        for (a = 0; a < 2; a++) {
            if (run !== NP.run) return null;
            try { out = await npAi([{ role: 'system', content: npSecPrompt(o, outline, i, words) }, { role: 'user', content: 'Write the section now. ' + qpLangRule(o.lang, o.subj) }], run); } catch (e) { return null; }
            if (run !== NP.run) return null;
            bl = npBlocks(out); if (!bl) continue;
            nb = bl.map(npNB).filter(Boolean);
            if (nb.length && npLangOk(nb, o.lang)) return nb;
        }
        return [];
    }
    async function npGenerate(o) {
        var run = ++NP.run, band = npBand(o.cls), N = NP_SEC[o.type][band], words = NP_WORDS[o.type][band], maxImg = o.pics ? (o.type === 'short' ? 2 : 4) : 0, outline = null, tries, out, j, msg = '', secs, res, next = 0, done = 0, notes = [];
        npStatus('Planning the notes…');
        for (tries = 0; tries < 2 && !outline; tries++) {
            try { out = await npAi([{ role: 'system', content: npOutlinePrompt(o, N, maxImg) }, { role: 'user', content: 'Make the outline now. ' + qpLangRule(o.lang, o.subj) }], run); } catch (e) { msg = 'The AI is busy right now (many students use it at the same time). Please wait a minute and tap "Make notes" again.'; break; }
            if (run !== NP.run) return null;
            if (/"unsure"\s*:\s*true/i.test(String(out || '')) && !o.src) { msg = 'I am not sure what is in "' + o.topic + '". To get the real chapter, write the exact lesson name and book name, or paste / scan the chapter text in the box below, then try again.'; break; }
            j = npJson(out);
            if (j && Array.isArray(j.sections)) {
                j.sections = j.sections.filter(function (s) { return s && typeof s.h === 'string' && s.h.trim(); }).slice(0, N + 1).map(function (s) { return { h: npS(s.h, 90), icon: npS(s.icon, 8) || '📘', img: npS(s.img, 80) }; });
                if (j.sections.length >= 2) outline = j;
            } else if (!j && out && !/\{/.test(out)) { msg = String(out).trim().slice(0, 300); break; }
        }
        if (!outline) return { msg: msg || 'The AI could not plan the notes right now. Please tap "Make notes" again.' };
        secs = outline.sections; res = new Array(secs.length);
        async function worker() {
            var i;
            while (next < secs.length) {
                i = next++; if (run !== NP.run) return;
                npStatus('Writing section ' + (i + 1) + ' of ' + secs.length + '…');
                res[i] = await npSection(o, outline, i, words, run); done++;
                npStatus('Written ' + done + ' of ' + secs.length + ' sections…');
            }
        }
        await Promise.all([worker(), worker()]);
        if (run !== NP.run) return null;
        secs.forEach(function (s, i) { if (res[i] && res[i].length) notes.push({ h: s.h, icon: s.icon, img: s.img, blocks: res[i], pic: null }); });
        if (!notes.length) return { msg: 'The AI could not write these notes right now (it may be busy). Please wait a minute and tap "Make notes" again.' };
        if (maxImg) {
            npStatus('Finding pictures…');
            var want = notes.filter(function (n) { return n.img; }).slice(0, maxImg);
            await Promise.all(want.map(function (n) { return npImg(n.img).then(function (r) { n.pic = r; }); }));
            if (run !== NP.run) return null;
        }
        return { title: String(outline.title || o.topic).slice(0, 120), notes: notes, missed: secs.length - notes.length };
    }


    /* --- notes -> quiz ("Isi se test do") --- */
    function npPlain(d) {
        var out = [];
        d.notes.forEach(function (s) {
            var t = s.h + ':';
            s.blocks.forEach(function (b) {
                if (b.t === 'def') t += ' ' + (b.k ? b.k + ' - ' : '') + b.v + '.';
                else if (b.t === 'pts') t += ' ' + b.items.join('; ') + '.';
                else if (b.t === 'formula') t += ' ' + (b.k ? b.k + ': ' : '') + b.v + (b.n ? ' (' + b.n + ')' : '') + '.';
                else if (b.t === 'table') t += ' ' + b.head.join(' | ') + ': ' + b.rows.map(function (r) { return r.join(' | '); }).join('; ') + '.';
                else if (b.t === 'flow') t += ' ' + b.steps.join(' -> ') + '.';
                else if (b.t === 'map') t += ' ' + b.center + ': ' + b.nodes.join(', ') + '.';
                else t += ' ' + String(b.v || '').replace(/\n/g, ' ') + '.';
            });
            out.push(t.replace(/\*\*/g, ''));
        });
        return out.join('\n').slice(0, 8000);
    }
    function npQuizPrompt(o, n, txt) {
        return 'You are the AI Test Maker inside Notes Bazar. Make exactly ' + n + ' multiple-choice questions for a Class ' + o.cls + ' student ONLY from the study notes below (chapter: "' + o.topic + '"). Cover different parts of the notes and do not ask anything that is not in the notes. ' + qpLangRule(o.lang, o.subj) +
            ' Each question has 4 options and exactly one correct answer; vary the position of the correct answer; "e" is a one-line explanation. Reply with ONLY one JSON object, no markdown: {"title":"short title","subject":"subject name","questions":[{"q":"question text","o":["option A","option B","option C","option D"],"a":0,"e":"one short line"}]} where "a" is the index 0-3 of the correct option.\nNOTES:\n"""\n' + txt + '\n"""';
    }
    function npQuizOpen() {
        var box = $('npQz'); if (!box) return;
        box.innerHTML = '<div class="np-qp"><b>🎯 Test yourself on these notes</b><div class="nbai-set" style="margin-top:8px"><label>Questions' + qpSel('npQzN', [[5, '5'], [10, '10'], [15, '15']], 10) + '</label><label>Mode' + qpSel('npQzM', [['practice', 'Practice (see answers)'], ['mock', 'Timed mock test']], 'practice') + '</label></div>' +
            '<button type="button" class="nbo-save" id="npQzGo" style="margin-top:10px"><i class="fa-solid fa-play"></i> Start quiz</button><div class="nbo-sub" id="npQzSt" style="margin:6px 0 0" aria-live="polite"></div></div>';
        $('npQzGo').addEventListener('click', npQuizRun);
    }
    async function npQuizRun() {
        var d = NP.doc, st = $('npQzSt'), go = $('npQzGo'), run = NP.run, n, mode, out, t = null;
        if (!d || NP.qzBusy) return;
        if (typeof window.nbCallAi !== 'function' || typeof aiParseTest !== 'function') { st.textContent = 'The quiz is still loading. Please try again in a moment.'; return; }
        n = parseInt($('npQzN').value, 10) || 10; mode = $('npQzM').value;
        NP.qzBusy = true; go.disabled = true; st.textContent = 'Making your quiz from these notes…';
        try {
            out = await npAi([{ role: 'system', content: npQuizPrompt(d.o, n, npPlain(d)) }, { role: 'user', content: 'Make the quiz now.' }], run);
            t = aiParseTest(out);
            if (!t) st.textContent = 'The quiz could not be made this time. Please tap Start quiz again.';
        } catch (e) { st.textContent = 'The AI is busy right now. Please wait a minute and try again.'; }
        NP.qzBusy = false; if ($('npQzGo')) $('npQzGo').disabled = false;
        if (!t || run !== NP.run) return;
        AIT.qs = t.qs; AIT.title = t.title || d.title; AIT.subj = t.subject || (d.o.subjN ? d.o.subjN[1] : 'Notes quiz');
        try { LSX.set('nb_ai_test', { title: AIT.title, subject: AIT.subj, qs: t.qs, t: Date.now() }); } catch (e) {}
        QZ.cls = d.o.cls; NB.close('nbNt'); if (!$('nbQz')) buildQuiz(); NB.open('nbQz'); aiStartTest(mode);
    }

    /* --- drawing --- */
    function npWrap(t, n) {
        var w = String(t).split(' '), L = [], cur = '';
        w.forEach(function (x) { if (cur && (cur + ' ' + x).length > n) { L.push(cur); cur = x; } else cur = (cur ? cur + ' ' : '') + x; });
        if (cur) L.push(cur); return L.slice(0, 3);
    }
    function npMapSvg(center, nodes, ci) {
        var W = 640, H = 380, cx = W / 2, cy = H / 2, rx = 240, ry = 135, n = nodes.length, E = NB.esc, P = NP_PAL[ci % 6], lines = '', boxes = '', cl = npWrap(center, 14), i, a, x, y, ls, w, h, c, k;
        var cw = Math.min(180, Math.max(100, Math.max.apply(null, cl.map(function (l) { return l.length; })) * 9.5 + 22)), ch = cl.length * 18 + 16;
        for (i = 0; i < n; i++) {
            a = -Math.PI / 2 + i * 2 * Math.PI / n; x = cx + rx * Math.cos(a); y = cy + ry * Math.sin(a);
            ls = npWrap(nodes[i], 16); c = NP_PAL[(ci + i + 1) % 6];
            w = Math.min(165, Math.max(80, Math.max.apply(null, ls.map(function (l) { return l.length; })) * 8.6 + 20)); h = ls.length * 16 + 14;
            lines += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + c[0] + '" stroke-width="3" stroke-linecap="round"/>';
            boxes += '<rect x="' + (x - w / 2).toFixed(1) + '" y="' + (y - h / 2).toFixed(1) + '" width="' + w + '" height="' + h + '" rx="11" fill="' + c[1] + '" stroke="' + c[0] + '" stroke-width="2"/><text x="' + x.toFixed(1) + '" y="' + (y - (ls.length - 1) * 8 + 4.5).toFixed(1) + '" text-anchor="middle" font-size="12.5" font-weight="600" fill="#111">' +
                ls.map(function (l, q) { return '<tspan x="' + x.toFixed(1) + '"' + (q ? ' dy="16"' : '') + '>' + E(l) + '</tspan>'; }).join('') + '</text>';
        }
        boxes += '<rect x="' + (cx - cw / 2) + '" y="' + (cy - ch / 2) + '" width="' + cw + '" height="' + ch + '" rx="14" fill="' + P[0] + '"/><text x="' + cx + '" y="' + (cy - (cl.length - 1) * 9 + 5) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">' +
            cl.map(function (l, q) { return '<tspan x="' + cx + '"' + (q ? ' dy="18"' : '') + '>' + E(l) + '</tspan>'; }).join('') + '</text>';
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' + lines + boxes + '</svg>';
    }
    function npBlockHtml(b, L, ci) {
        var h = '<div class="np-b">', lbl = function (k) { return '<span class="np-lb">' + NB.esc(L[k]) + '</span>'; };
        if (b.t === 'def') h += '<div class="np-def">' + lbl('def') + (b.k ? '<b>' + npH(b.k) + ':</b> ' : '') + npH(b.v) + '</div>';
        else if (b.t === 'pts') h += (b.title ? '<div class="np-pt">' + npH(b.title) + '</div>' : '') + '<ul class="np-p">' + b.items.map(function (x) { return '<li>' + npH(x) + '</li>'; }).join('') + '</ul>';
        else if (b.t === 'formula') h += '<div class="np-f">' + lbl('f') + (b.k ? '<b>' + npH(b.k) + '</b>' : '') + '<div class="np-fv">' + npH(b.v) + '</div>' + (b.n ? '<div class="np-fn">' + npH(b.n) + '</div>' : '') + '</div>';
        else if (b.t === 'table') h += (b.title ? '<div class="np-pt">' + npH(b.title) + '</div>' : '') + '<div class="np-tw"><table class="np-t"><thead><tr>' + b.head.map(function (x) { return '<th>' + npH(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + b.rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + npH(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
        else if (b.t === 'flow') h += (b.title ? '<div class="np-pt">' + npH(b.title) + '</div>' : '') + '<div class="np-fl">' + b.steps.map(function (x, i) { return (i ? '<span class="np-fa">➜</span>' : '') + '<span class="np-fs">' + npH(x) + '</span>'; }).join('') + '</div>';
        else if (b.t === 'map') h += '<div class="np-map">' + npMapSvg(b.center, b.nodes, ci) + '</div>';
        else if (b.t === 'eg') h += '<div class="np-eg">' + lbl('eg') + (b.title && b.title.toLowerCase() !== 'example' ? '<b>' + npH(b.title) + '</b> ' : '') + npH(b.v).replace(/\n/g, '<br>') + '</div>';
        else if (b.t === 'tip') h += '<div class="np-tip">' + lbl('tip') + '💡 ' + npH(b.v) + '</div>';
        else if (b.t === 'mn') h += '<div class="np-mn">' + lbl('mn') + '🧠 ' + npH(b.v) + '</div>';
        return h + '</div>';
    }
    function npBody(d) {
        var o = d.o, L = NP_L[o.lang] || NP_L.English, E = NB.esc, h = '', anyPic = false, bn = qpBoardName(o.subj);
        h += '<div class="np-hd"><div class="np-ht">' + E(d.title) + '</div><div class="np-hm">Notes Bazar · ' + E(L.cls) + ' ' + o.cls + (o.subj !== 'other' ? ' · ' + E(qpSubjName(o)) : '') + ' · ' + E(L[o.type]) + (bn ? ' · ' + E(bn) : '') + '</div></div>';
        d.notes.forEach(function (s, i) {
            var P = NP_PAL[i % 6];
            h += '<section class="np-s" style="--c:' + P[0] + ';--b:' + P[1] + '"><h2><span class="np-n">' + (i + 1) + '</span><span>' + E(s.icon) + '</span><span>' + E(s.h) + '</span></h2>';
            if (s.pic) { anyPic = true; h += '<figure class="np-img" data-i="' + i + '"><img src="' + E(s.pic.src) + '" alt="' + E(s.pic.cap) + '" loading="eager"><figcaption>' + E(s.pic.cap) + '</figcaption><button type="button" class="np-rm" title="Remove picture" aria-label="Remove picture">✕</button></figure>'; }
            s.blocks.forEach(function (b) { h += npBlockHtml(b, L, i); });
            h += '</section>';
        });
        h += '<div class="np-ft">Notes Bazar · AI Notes Maker' + (anyPic ? ' · ' + E(L.cred) : '') + '</div>';
        return h;
    }
    function npResult() {
        var body = $('nbntBody'), d = NP.doc;
        if (!$('npStyle')) { var st = document.createElement('style'); st.id = 'npStyle'; st.textContent = NP_CSS; document.head.appendChild(st); }
        var pics = d.notes.some(function (s) { return s.pic; });
        body.innerHTML = '<button type="button" class="np-back" id="npRBack"><i class="fa-solid fa-arrow-left"></i> Back</button><h3 class="nbo-h"><i class="fa-solid fa-book-open"></i> Your notes</h3><p class="nbo-sub">' + d.notes.length + ' sections' + (d.missed ? ' (' + d.missed + ' could not be written because the AI was busy. Tap "Make other notes" to try again)' : '') + (pics ? '. Tap ✕ on a picture to remove it if it does not match.' : '') + '</p>' +
            '<div class="nbqp-prev np-prev"><div class="npw" id="npDoc">' + npBody(d) + '</div></div>' +
            pdfBtns() + '<p class="nbo-sub" style="margin:8px 0 0">Saved in <b>My PDFs</b> on this phone.</p>' +
            '<div id="npQz"><button type="button" class="np-qb" id="npQzOpen"><i class="fa-solid fa-bullseye"></i> Isi se test do <small>(quiz from these notes)</small></button></div>' +
            '<button type="button" class="nbo-skip" id="npNew">Make other notes</button>';
        pdfWire('np'); $('npQzOpen').addEventListener('click', npQuizOpen); $('npNew').addEventListener('click', npForm);
        $('npRBack').addEventListener('click', function () { if (NP.fromMy) { NP.fromMy = false; NB.close('nbNt'); NB.openMyPdfs(); } else npForm(); });
        $('npDoc').addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('.np-rm'), fg = b && b.parentNode, si;
            if (!fg || !fg.parentNode) return;
            si = parseInt(fg.getAttribute('data-i'), 10); fg.parentNode.removeChild(fg);
            if (NP.doc.notes[si]) { NP.doc.notes[si].pic = null; mySave('notes', NP.doc); }
        });
    }
    function npPrint() {
        NB.markDay('pdf');
        var doc = $('npDoc'); if (!doc || !NP.doc) return;
        var clone = doc.cloneNode(true); Array.prototype.forEach.call(clone.querySelectorAll('.np-rm'), function (x) { x.parentNode.removeChild(x); });
        var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + NB.esc('Notes - ' + NP.doc.o.topic) + '</title><style>@page{size:A4;margin:12mm}body{margin:0}' + NP_CSS + '</style></head><body><div class="npw">' + clone.innerHTML + '</div></body></html>';
        var f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(f);
        var d = f.contentWindow.document; d.open(); d.write(html); d.close();
        var go = function () {
            try { f.contentWindow.focus(); f.contentWindow.print(); }
            catch (e) { var w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); setTimeout(function () { w.print(); }, 600); } else NB.toast('Please allow pop-ups to download the PDF.', 3500); }
            setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 90000);
        };
        var imgs = Array.prototype.slice.call(d.images || []), t0 = Date.now();      // wait until the pictures are loaded (max 8 s)
        (function wait() { if (imgs.every(function (im) { return im.complete; }) || Date.now() - t0 > 8000) setTimeout(go, 300); else setTimeout(wait, 200); })();
        NB.toast('Choose "Save as PDF" as the printer in the next window.', 4500);
    }

    /* --- form --- */
    function npBoardHint() {
        var b = $('npBoard'), v = $('npSubj') && $('npSubj').value; if (!b) return;
        b.innerHTML = qpBoardLine(v, 'Notes');
    }
    function npFillSubj(keep) {
        var cls = parseInt($('npCls').value, 10), sel = $('npSubj'), l = qpSubjList(cls);
        sel.innerHTML = l.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === keep ? ' selected' : '') + '>' + NB.esc(x[1] + (x[0] === 'other' ? '' : ' (' + x[2] + ')')) + '</option>'; }).join('');
        npBoardHint();
    }
    function npForm() {
        NP.run++; NP.busy = false; NP.fromMy = false;
        var body = $('nbntBody'), s = LSX.get('nb_np_opts', null) || {}, pr = NB.profile();
        var cls = s.cls || (pr ? parseInt(String(pr.cls).replace('Class ', ''), 10) : 10) || 10;
        body.innerHTML = '<button type="button" class="np-back" id="npBack"><i class="fa-solid fa-arrow-left"></i> AI PDF Maker</button>' +
            '<h3 class="nbo-h"><i class="fa-solid fa-book-open"></i> AI Notes Maker</h3><p class="nbo-sub">Colourful notes as a PDF: definitions, formulas, tables, flow charts, mind maps and pictures, made for your class.</p>' +
            '<div class="nbai-set" style="margin-top:10px"><label>Class' + qpSel('npCls', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return [n, 'Class ' + n]; }), cls) + '</label>' +
            '<label>Notes type' + qpSel('npType', [['short', 'Short notes'], ['long', 'Long (full) notes']], s.type || 'short') + '</label></div>' +
            '<div style="margin-top:10px"><label class="nbo-l" for="npSubj" style="margin-top:0">Subject</label><select id="npSubj" class="nbo-in"></select><div class="qp-board" id="npBoard"></div></div>' +
            '<div id="npTopicBox" style="margin-top:10px"><div id="npChWrap"></div><label class="nbo-l" for="npTopic">Chapter / topic</label><input id="npTopic" class="nbo-in" maxlength="170" autocomplete="off" placeholder="e.g. Life Processes, Idgah, Quadratic Equations" value="' + NB.esc(s.topic || '') + '"></div>' +
            '<div class="nbo-sub" id="npTypeHint" style="margin:6px 0 0"></div>' +
            '<details id="npMore" class="qp-more"><summary>Better accuracy: add the book name, or photo / PDF / paste of the chapter</summary>' +
            '<label class="nbo-l" for="npBook">Book name (optional)</label><input id="npBook" class="nbo-in" maxlength="80" autocomplete="off" placeholder="e.g. Kislay Bhag 3" value="' + NB.esc(s.book || '') + '">' +
            qpScanHtml('np') +
            '<label class="nbo-l" for="npSrc">Chapter text (optional)</label><textarea id="npSrc" class="nbo-in" rows="5" maxlength="12000" placeholder="Paste the lesson text here, or use Camera / Photo / PDF above. Notes will then come only from it."></textarea></details>' +
            '<div class="nbai-set"><label>Language' + qpSel('npLang', [['English', 'English'], ['Hindi', 'हिंदी (Hindi)'], ['Hinglish', 'Hinglish']], s.lang || 'English') + '</label>' +
            '<label>Pictures' + qpSel('npPics', [['1', 'Add pictures / diagrams'], ['0', 'No pictures']], s.pics === '0' ? '0' : '1') + '</label></div>' +
            '<div class="nbo-sub" id="npSt" style="min-height:18px;margin:8px 0 0" aria-live="polite"></div><div class="nbo-err" id="npErr"></div>' +
            '<button type="button" class="nbo-save" id="npGo"><i class="fa-solid fa-wand-magic-sparkles"></i> Make notes</button>';
        npFillSubj(s.subj); chRender('np'); qpScanInit('np');
        var hint = function () { var t = $('npType').value, c = parseInt($('npCls').value, 10), b = npBand(c); $('npTypeHint').textContent = t === 'short' ? 'Short notes: quick 1 to 2 line definitions and key points (about ' + NP_SEC.short[b] + ' sections for Class ' + c + ').' : 'Long notes: full definitions, formulas, tables, diagrams, examples and exam tips (about ' + NP_SEC.long[b] + ' sections for Class ' + c + ').'; };
        hint(); $('npType').addEventListener('change', hint);
        $('npCls').addEventListener('change', function () { npFillSubj($('npSubj').value); chRender('np'); hint(); });
        $('npSubj').addEventListener('change', function () {
            chRender('np');
            npBoardHint(); var v = this.value, lg = $('npLang');
            if (v === 'hindi' || v === 'maithili' || v === 'sanskrit' || v === 'nonhindi' || v === 'sst') lg.value = 'Hindi'; else if (v === 'english') lg.value = 'English';
        });
        $('npBack').addEventListener('click', function () { NB.close('nbNt'); NB.openPdfMaker(); });
        $('npGo').addEventListener('click', async function () {
            if (NP.busy) return;
            var err = $('npErr'); err.textContent = '';
            var cl = parseInt($('npCls').value, 10), sj = qpSubjFind(cl, $('npSubj').value), topic = String($('npTopic').value || '').replace(/\s+/g, ' ').trim().slice(0, 170);
            if (!topic && sj[0] !== 'other') topic = sj[1] + ' (important chapters)';
            if (topic.length < 2) { err.textContent = 'Please write the chapter or topic first, or choose a subject.'; return; }
            var o = { topic: topic, cls: cl, type: $('npType').value, lang: $('npLang').value, subj: sj[0], subjN: sj, pics: $('npPics').value === '1',
                book: String($('npBook').value || '').replace(/\s+/g, ' ').trim().slice(0, 80), src: String($('npSrc').value || '').trim().slice(0, 12000) };
            LSX.set('nb_np_opts', { topic: String($('npTopic').value || '').trim(), book: o.book, cls: o.cls, type: o.type, lang: o.lang, subj: o.subj, pics: o.pics ? '1' : '0' });
            if (typeof window.nbCallAi !== 'function') { err.textContent = 'The AI is still loading. Please try again in a moment.'; return; }
            NP.busy = true; var go = $('npGo'); go.disabled = true;
            var r = await npGenerate(o);
            NP.busy = false; if (go) go.disabled = false;
            if (!r) return;                                        // window was closed while it was working
            npStatus('');
            if (r.msg) { err.textContent = r.msg; return; }
            NP.doc = { o: o, title: r.title, notes: r.notes, missed: r.missed || 0 }; mySave('notes', NP.doc); npResult();
        });
    }
    function buildNotes() {
        document.body.appendChild(NB.mk('<div class="nbo" id="nbNt" aria-hidden="true"><div class="nbo-card nbq nbqp" role="dialog" aria-modal="true" aria-label="AI Notes Maker">' +
            '<button type="button" class="nbo-x" id="nbntX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div id="nbntBody"></div></div></div>'));
        $('nbntX').addEventListener('click', function () { NB.close('nbNt'); });
        NB.onClose.nbNt = function () { NP.run++; NP.busy = false; };
    }
    NB.openNotes = function () { closeSiteMenu(); NB.close('nbPm'); if (!$('nbNt')) buildNotes(); NB.open('nbNt'); npForm(); };


    /* =====================================================================
       1) Chapter lists (pick from a dropdown instead of typing)
       Maths + Science follow NCERT chapters (Bihar board uses the same books).
       Other subjects: the AI suggests the list once and it is saved on the phone.
       ===================================================================== */
    var CH = {
        '9|math': ['Number Systems', 'Polynomials', 'Coordinate Geometry', 'Linear Equations in Two Variables', 'Introduction to Euclid\'s Geometry', 'Lines and Angles', 'Triangles', 'Quadrilaterals', 'Areas of Parallelograms and Triangles', 'Circles', 'Constructions', 'Heron\'s Formula', 'Surface Areas and Volumes', 'Statistics', 'Probability'],
        '9|science': ['Matter in Our Surroundings', 'Is Matter Around Us Pure?', 'Atoms and Molecules', 'Structure of the Atom', 'The Fundamental Unit of Life', 'Tissues', 'Diversity in Living Organisms', 'Motion', 'Force and Laws of Motion', 'Gravitation', 'Work and Energy', 'Sound', 'Why Do We Fall Ill?', 'Natural Resources', 'Improvement in Food Resources'],
        '10|math': ['Real Numbers', 'Polynomials', 'Pair of Linear Equations in Two Variables', 'Quadratic Equations', 'Arithmetic Progressions', 'Triangles', 'Coordinate Geometry', 'Introduction to Trigonometry', 'Some Applications of Trigonometry', 'Circles', 'Constructions', 'Areas Related to Circles', 'Surface Areas and Volumes', 'Statistics', 'Probability'],
        '10|science': ['Chemical Reactions and Equations', 'Acids, Bases and Salts', 'Metals and Non-metals', 'Carbon and its Compounds', 'Periodic Classification of Elements', 'Life Processes', 'Control and Coordination', 'How do Organisms Reproduce?', 'Heredity', 'Light: Reflection and Refraction', 'The Human Eye and the Colourful World', 'Electricity', 'Magnetic Effects of Electric Current', 'Sources of Energy', 'Our Environment', 'Management of Natural Resources'],
        '11|physics': ['Units and Measurements', 'Motion in a Straight Line', 'Motion in a Plane', 'Laws of Motion', 'Work, Energy and Power', 'System of Particles and Rotational Motion', 'Gravitation', 'Mechanical Properties of Solids', 'Mechanical Properties of Fluids', 'Thermal Properties of Matter', 'Thermodynamics', 'Kinetic Theory', 'Oscillations', 'Waves'],
        '11|chemistry': ['Some Basic Concepts of Chemistry', 'Structure of Atom', 'Classification of Elements and Periodicity in Properties', 'Chemical Bonding and Molecular Structure', 'Thermodynamics', 'Equilibrium', 'Redox Reactions', 'Organic Chemistry: Some Basic Principles and Techniques', 'Hydrocarbons'],
        '11|biology': ['The Living World', 'Biological Classification', 'Plant Kingdom', 'Animal Kingdom', 'Morphology of Flowering Plants', 'Anatomy of Flowering Plants', 'Structural Organisation in Animals', 'Cell: The Unit of Life', 'Biomolecules', 'Cell Cycle and Cell Division', 'Photosynthesis in Higher Plants', 'Respiration in Plants', 'Plant Growth and Development', 'Breathing and Exchange of Gases', 'Body Fluids and Circulation', 'Excretory Products and their Elimination', 'Locomotion and Movement', 'Neural Control and Coordination', 'Chemical Coordination and Integration'],
        '11|math': ['Sets', 'Relations and Functions', 'Trigonometric Functions', 'Complex Numbers and Quadratic Equations', 'Linear Inequalities', 'Permutations and Combinations', 'Binomial Theorem', 'Sequences and Series', 'Straight Lines', 'Conic Sections', 'Introduction to Three Dimensional Geometry', 'Limits and Derivatives', 'Statistics', 'Probability'],
        '12|physics': ['Electric Charges and Fields', 'Electrostatic Potential and Capacitance', 'Current Electricity', 'Moving Charges and Magnetism', 'Magnetism and Matter', 'Electromagnetic Induction', 'Alternating Current', 'Electromagnetic Waves', 'Ray Optics and Optical Instruments', 'Wave Optics', 'Dual Nature of Radiation and Matter', 'Atoms', 'Nuclei', 'Semiconductor Electronics'],
        '12|chemistry': ['Solutions', 'Electrochemistry', 'Chemical Kinetics', 'The d- and f-Block Elements', 'Coordination Compounds', 'Haloalkanes and Haloarenes', 'Alcohols, Phenols and Ethers', 'Aldehydes, Ketones and Carboxylic Acids', 'Amines', 'Biomolecules'],
        '12|biology': ['Sexual Reproduction in Flowering Plants', 'Human Reproduction', 'Reproductive Health', 'Principles of Inheritance and Variation', 'Molecular Basis of Inheritance', 'Evolution', 'Human Health and Disease', 'Microbes in Human Welfare', 'Biotechnology: Principles and Processes', 'Biotechnology and its Applications', 'Organisms and Populations', 'Ecosystem', 'Biodiversity and Conservation'],
        '12|math': ['Relations and Functions', 'Inverse Trigonometric Functions', 'Matrices', 'Determinants', 'Continuity and Differentiability', 'Application of Derivatives', 'Integrals', 'Application of Integrals', 'Differential Equations', 'Vector Algebra', 'Three Dimensional Geometry', 'Linear Programming', 'Probability']
    };
    function chAiAll() { var a = LSX.get('nb_ch_ai', {}); return a && typeof a === 'object' ? a : {}; }
    function chGet(cls, subj) {
        var k = cls + '|' + subj, c = chAiAll()[k], d = (window.NB_BSEB || {})[k];
        if (d && d.groups && d.groups.length) return { groups: d.groups, ai: false, approx: !!d.approx };     // fixed Bihar board list (bseb-chapters.js)
        if (CH[k]) return { list: CH[k], ai: false };
        return Array.isArray(c) && c.length ? { list: c, ai: true } : null;
    }
    /* one flat list of {g: part, l: shown text, t: text that goes into the topic box} */
    function chItems(r) {
        var out = [];
        if (r.groups) r.groups.forEach(function (g) { g.c.forEach(function (c, i) { out.push({ g: g.g, l: (i + 1) + '. ' + c, t: (g.tp || g.g) + ': ' + c }); }); });
        else r.list.forEach(function (c, i) { out.push({ g: '', l: (i + 1) + '. ' + c, t: c }); });
        return out;
    }
    function chRender(p) {
        var w = $(p + 'ChWrap'), cs = $(p + 'Cls'), sb = $(p + 'Subj'); if (!w || !cs || !sb) return;
        var cls = parseInt(cs.value, 10), subj = sb.value, r, items, html, last;
        if (subj === 'other' || !subj) { w.innerHTML = ''; return; }
        r = chGet(cls, subj);
        if (r) {
            items = chItems(r); last = null;
            html = '<label class="nbo-l" for="' + p + 'Ch" style="margin-top:0">Pick a chapter</label><select id="' + p + 'Ch" class="nbo-in"><option value="">Choose from the list…</option>';
            items.forEach(function (it, i) {
                if (it.g !== last) { if (last) html += '</optgroup>'; if (it.g) html += '<optgroup label="' + NB.esc(it.g) + '">'; last = it.g; }
                html += '<option value="' + i + '">' + NB.esc(it.l) + '</option>';
            });
            if (last) html += '</optgroup>';
            html += '<option value="own">✍ My chapter is not here (I will type it)</option></select>' +
                (r.ai ? '<div class="nbo-sub" style="margin:4px 0 0">AI suggested list. Please check that it matches your book.</div>' : '') +
                (r.approx ? '<div class="nbo-sub" style="margin:4px 0 0">Please check that this list matches your book. If a chapter is missing, choose “My chapter is not here”.</div>' : '') +
                '<div class="nbo-sub" style="margin:8px 0 0">Or type the chapter yourself:</div>';
            w.innerHTML = html;
            $(p + 'Ch').addEventListener('change', function () {
                var t = $(p + 'Topic'); if (!t || this.value === '') return;
                if (this.value === 'own') { t.value = ''; t.focus(); return; }
                t.value = (items[parseInt(this.value, 10)] || {}).t || '';
            });
        } else {
            w.innerHTML = '<button type="button" class="ch-ai-b" id="' + p + 'ChAi"><i class="fa-solid fa-list-ol"></i> Show chapter list (AI)</button><div class="nbo-sub" id="' + p + 'ChSt" style="margin:4px 0 6px" aria-live="polite"></div>';
            $(p + 'ChAi').addEventListener('click', function () { chFetch(p); });
        }
    }
    async function chFetch(p) {
        var cls = parseInt($(p + 'Cls').value, 10), subj = $(p + 'Subj').value, sj = qpSubjFind(cls, subj), st = $(p + 'ChSt'), btn = $(p + 'ChAi'), b = qpBoard(subj), out, j, list, seen = {};
        if (typeof window.nbCallAi !== 'function') { st.textContent = 'The AI is still loading. Please try again in a moment.'; return; }
        if (!navigator.onLine) { st.textContent = 'You are offline.'; return; }
        btn.disabled = true; st.textContent = 'Getting the chapter list…';
        var hindi = (subj === 'hindi' || subj === 'maithili' || subj === 'sanskrit' || subj === 'nonhindi' || subj === 'sst');
        var bc = subj === 'nonhindi' ? 8 : cls, sname = subj === 'nonhindi' ? 'Hindi (Kislay Bhag-3)' : sj[1];
        var q = 'List the chapters / lessons of the ' + (b === 'ncert' ? 'NCERT' : 'BSEB / SCERT Bihar (Bihar government school)') + ' textbook for Class ' + bc + ' ' + sname + ', in the order of the book. ' +
            (subj === 'sst' ? 'Social Science has separate books (History, Geography, Political Science, Economics, Disaster Management): start every item with the part name, like \"इतिहास: chapter name\". ' : '') +
            (hindi ? 'Write the chapter names in Devanagari script exactly as in the book. ' : 'Write the chapter names in English. ') +
            'Only list chapters you are SURE are in that real book. If you are not sure about this book, reply {"chapters":[]}. Never invent chapter names. Reply with ONLY one JSON object, no markdown: {"chapters":["Chapter 1 name","Chapter 2 name"]} (at most 40).';
        try { out = await window.nbCallAi([{ role: 'system', content: q }, { role: 'user', content: 'Give the chapter list now.' }], { timeout: 60000 }); } catch (e) { out = ''; }
        j = npJson(out); list = [];
        if (j && Array.isArray(j.chapters)) j.chapters.forEach(function (c) { c = npS(c, 90).replace(/^\s*(chapter|lesson|ch\.?|अध्याय|पाठ)?\s*\d+\s*[.:)\-–]\s*/i, ''); if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; list.push(c); } });
        list = list.slice(0, 40);
        if (!$(p + 'ChSt')) return;                                    // form was closed meanwhile
        if (list.length < 3) { btn.disabled = false; st.textContent = 'The AI is not sure about this book. Please type the chapter name yourself.'; return; }
        var all = chAiAll(); all[cls + '|' + subj] = list; LSX.set('nb_ch_ai', all);
        chRender(p);
    }

    /* =====================================================================
       2) Real PDF file (no print window): page is drawn by the browser, saved as an A4 PDF
       ===================================================================== */
    var PDF = { W: 794, H: 1123, MX: 38, MT: 34, MB: 54, S: 2, busy: false, cache: null };
    function pdfLoadImg(url) {
        return new Promise(function (res, rej) {
            var im = new Image(), tm = setTimeout(function () { rej(new Error('page image timeout')); }, 20000);
            im.onload = function () { clearTimeout(tm); res(im); };
            im.onerror = function () { clearTimeout(tm); rej(new Error('page image failed')); };
            im.src = url;
        });
    }
    async function pdfInlineImages(host) {                           // pictures must be inside the page as data, or the browser leaves them out
        var imgs = Array.prototype.slice.call(host.querySelectorAll('img'));
        await Promise.all(imgs.map(async function (im) {
            var fig = im.closest('figure') || im, src = im.getAttribute('src') || '', ctrl, tm, r, bl, du;
            try {
                if (!/^data:/i.test(src)) {
                    ctrl = new AbortController(); tm = setTimeout(function () { ctrl.abort(); }, 9000);
                    r = await fetch(src, { signal: ctrl.signal, mode: 'cors' }); clearTimeout(tm);
                    if (!r.ok) throw new Error('img');
                    bl = await r.blob();
                    du = await new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = no; fr.readAsDataURL(bl); });
                    im.setAttribute('src', du);
                }
                await new Promise(function (ok, no) { if (im.complete && im.naturalWidth) ok(); else { im.onload = ok; im.onerror = function () { no(new Error('img')); }; } });
            } catch (e) { if (fig.parentNode) fig.parentNode.removeChild(fig); }
        }));
    }
    function pdfBreaks(root, PH) {                                   // where a page may end: between blocks, never right after a heading
        var base = root.getBoundingClientRect().top, cand = [], forced = [], total = root.getBoundingClientRect().height;
        (function walk(el) {
            var kids = el.children, i, k, p, r, keep;
            for (i = 0; i < kids.length; i++) {
                k = kids[i]; if (/^(STYLE|SCRIPT)$/.test(k.tagName)) continue;
                r = k.getBoundingClientRect();
                if (k.classList.contains('qp-brk')) { forced.push(r.top - base); continue; }
                p = i ? kids[i - 1] : null;
                keep = p && (/^H[1-4]$/.test(p.tagName) || /(^|\s)(np-pt|np-hd|qp-sub|qp-meta|qp-inst)(\s|$)/.test(p.className || ''));
                if (p && !keep) cand.push(r.top - base);
                if (k.children.length && r.height > PH * 0.5) walk(k);
            }
        })(root);
        var num = function (a, b) { return a - b; };
        return { cand: cand.sort(num), forced: forced.sort(num), total: total };
    }
    function pdfPlan(br, PH) {
        var pages = [], y = 0, lim, cut, f, i;
        while (y < br.total - 2 && pages.length < 80) {
            lim = y + PH; cut = null; f = null;
            for (i = 0; i < br.forced.length; i++) if (br.forced[i] > y + 1 && br.forced[i] <= lim) { f = br.forced[i]; break; }
            if (f != null) cut = f;
            else if (br.total <= lim + 1) cut = br.total;
            else { for (i = br.cand.length - 1; i >= 0; i--) if (br.cand[i] <= lim && br.cand[i] > y + 40) { cut = br.cand[i]; break; } if (cut == null) cut = lim; }
            pages.push([y, cut]); y = cut;
        }
        return pages;
    }
    function pdfSvg(ser, css, y, h) {
        var W = PDF.W - 2 * PDF.MX, c = css.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + h + '"><foreignObject x="0" y="0" width="' + W + '" height="' + h + '"><div xmlns="http://www.w3.org/1999/xhtml" style="width:' + W + 'px;height:' + h + 'px;overflow:hidden;background:#fff"><style>' + c + '</style><div style="position:relative;top:' + (-y) + 'px;width:' + W + 'px">' + ser + '</div></div></foreignObject></svg>';
    }
    function pdfHex16(t) { var h = 'FEFF', i, c; for (i = 0; i < t.length; i++) { c = t.charCodeAt(i).toString(16).toUpperCase(); h += ('0000' + c).slice(-4); } return h; }
    function pdfWrite(pages, title) {                                // minimal PDF: one JPEG picture per A4 page
        var enc = new TextEncoder(), parts = [], off = 0, xref = [], n = pages.length, total = 3 * n + 4, mw = 595.28, mh = 841.89, kids = [], i;
        function put(x) { var u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); off += u.length; }
        function obj(id, body) { xref[id] = off; put(id + ' 0 obj\n' + body + '\nendobj\n'); }
        put('%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n');
        for (i = 0; i < n; i++) kids.push((4 + 3 * i) + ' 0 R');
        obj(1, '<</Type/Catalog/Pages 2 0 R>>');
        obj(2, '<</Type/Pages/Kids[' + kids.join(' ') + ']/Count ' + n + '>>');
        obj(3, '<</Title<' + pdfHex16(String(title || 'Notes Bazar')) + '>/Producer(Notes Bazar)>>');
        pages.forEach(function (p, k) {
            var pg = 4 + 3 * k, im = pg + 1, ct = pg + 2, cs = 'q ' + mw + ' 0 0 ' + mh + ' 0 0 cm /Im0 Do Q';
            obj(pg, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + mw + ' ' + mh + ']/Resources<</XObject<</Im0 ' + im + ' 0 R>>>>/Contents ' + ct + ' 0 R>>');
            xref[im] = off; put(im + ' 0 obj\n<</Type/XObject/Subtype/Image/Width ' + p.w + '/Height ' + p.h + '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + p.bytes.length + '>>\nstream\n'); put(p.bytes); put('\nendstream\nendobj\n');
            obj(ct, '<</Length ' + cs.length + '>>\nstream\n' + cs + '\nendstream');
        });
        var xs = off; put('xref\n0 ' + total + '\n0000000000 65535 f \n');
        for (i = 1; i < total; i++) put(('0000000000' + xref[i]).slice(-10) + ' 00000 n \n');
        put('trailer\n<</Size ' + total + '/Root 1 0 R/Info 3 0 R>>\nstartxref\n' + xs + '\n%%EOF');
        return new Blob(parts, { type: 'application/pdf' });
    }
    async function pdfRender(o) {                                    // o: { cls, css, html, title, onProgress }
        var W = PDF.W - 2 * PDF.MX, PH = PDF.H - PDF.MT - PDF.MB, S = PDF.S, host = document.createElement('div'), pages = [], i, root, br, plan, ser, h, img, cv, cx, last;
        host.setAttribute('aria-hidden', 'true'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + W + 'px;visibility:hidden;pointer-events:none';
        host.innerHTML = '<style>' + o.css + '</style><div class="' + o.cls + '">' + o.html + '</div>';
        document.body.appendChild(host);
        try {
            root = host.lastElementChild; root.style.width = W + 'px';
            await pdfInlineImages(host);
            if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
            br = pdfBreaks(root, PH); plan = pdfPlan(br, PH); ser = new XMLSerializer().serializeToString(root);
            for (i = 0; i < plan.length; i++) {
                if (o.onProgress) o.onProgress(i + 1, plan.length);
                last = i === plan.length - 1; h = Math.max(20, Math.floor(plan[i][1] - plan[i][0]) + (last ? 2 : 0));
                img = await pdfLoadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pdfSvg(ser, o.css, plan[i][0], h)));
                cv = document.createElement('canvas'); cv.width = PDF.W * S; cv.height = PDF.H * S; cx = cv.getContext('2d');
                cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
                cx.drawImage(img, PDF.MX * S, PDF.MT * S, W * S, h * S);
                cx.strokeStyle = '#e2e8f0'; cx.lineWidth = S; cx.beginPath(); cx.moveTo(PDF.MX * S, (PDF.H - 38) * S); cx.lineTo((PDF.W - PDF.MX) * S, (PDF.H - 38) * S); cx.stroke();
                cx.fillStyle = '#94a3b8'; cx.textAlign = 'center'; cx.font = '600 ' + (10.5 * S) + 'px "Segoe UI",Arial,sans-serif';
                cx.fillText('Notes Bazar · AI PDF Maker · Page ' + (i + 1) + ' of ' + plan.length, PDF.W * S / 2, (PDF.H - 22) * S);
                pages.push(await new Promise(function (ok, no) {
                    var w = cv.width, hh = cv.height;
                    cv.toBlob(function (b) { if (!b) { no(new Error('toBlob')); return; } b.arrayBuffer().then(function (a) { ok({ w: w, h: hh, bytes: new Uint8Array(a) }); }, no); }, 'image/jpeg', 0.9);
                }));
                cv.width = 1; cv.height = 1;
            }
        } finally { if (host.parentNode) host.parentNode.removeChild(host); }
        return pdfWrite(pages, o.title);
    }
    NB._pdf = { render: pdfRender };
    function pdfName(parts) {
        var s = parts.filter(Boolean).map(function (x) { return String(x).replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''); }).filter(Boolean).join('_');
        return (s || 'NotesBazar').slice(0, 70) + '.pdf';
    }
    function pdfCfg(kind) {
        var c, clone, o;
        if (kind === 'np') {
            if (!NP.doc || !$('npDoc')) return null; o = NP.doc.o;
            clone = $('npDoc').cloneNode(true); Array.prototype.forEach.call(clone.querySelectorAll('.np-rm'), function (x) { x.parentNode.removeChild(x); });
            return { cls: 'npw', css: NP_CSS, html: clone.innerHTML, title: NP.doc.title, fallback: npPrint,
                name: pdfName(['NotesBazar', 'Class' + o.cls, o.subj !== 'other' ? o.subjN && o.subjN[1] : '', NP.doc.title, o.type === 'short' ? 'Short-Notes' : 'Long-Notes']) };
        }
        if (!QP.paper) return null; o = QP.paper.o;
        return { cls: 'qpw', css: QP_CSS, html: qpBody(QP.paper), title: o.title || o.topic, fallback: qpPrint,
            name: pdfName(['NotesBazar', 'Class' + o.cls, o.subj !== 'other' ? o.subjN && o.subjN[1] : '', o.type === 'model' ? (o.half ? 'Half-Model-Set' : 'Full-Model-Set') : (o.title || o.topic), 'Question-Paper']) };
    }
    function pdfCanShare() {
        try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] })); } catch (e) { return false; }
    }
    function pdfBtns() {
        return '<button type="button" class="nbo-save" id="pdfDl"><i class="fa-solid fa-download"></i> Download PDF</button>' +
            '<button type="button" class="pdf-share" id="pdfSh" style="display:none"><i class="fa-solid fa-share-nodes"></i> Share (WhatsApp etc.)</button>' +
            '<div class="nbo-sub pdf-st" id="pdfSt" aria-live="polite"></div>';
    }
    async function pdfGet(kind) {
        NB.markDay('pdf');                                    // the PDF blob for what is on screen (kept so a second tap is instant)
        var cfg = pdfCfg(kind); if (!cfg) return null;
        var key = kind + '|' + cfg.title + '|' + cfg.html.length;
        if (PDF.cache && PDF.cache.key === key) return { blob: PDF.cache.blob, cfg: cfg };
        var blob = await pdfRender({ cls: cfg.cls, css: cfg.css, html: cfg.html, title: cfg.title, onProgress: function (i, n) { var s = $('pdfSt'); if (s) s.textContent = 'Making your PDF… page ' + i + ' of ' + n; } });
        PDF.cache = { key: key, blob: blob }; return { blob: blob, cfg: cfg };
    }
    function pdfWire(kind) {
        var dl = $('pdfDl'), sh = $('pdfSh'), st = $('pdfSt');
        if (pdfCanShare()) sh.style.display = '';
        async function run(share) {
            if (PDF.busy) return; PDF.busy = true; dl.disabled = true; sh.disabled = true; st.textContent = 'Making your PDF…';
            var r = null;
            try { r = await pdfGet(kind); }
            catch (e) {
                console.warn('pdf failed', e); st.textContent = 'Could not make the PDF file here, so the print window is opening. Choose "Save as PDF" there.';
                var cfg = pdfCfg(kind); if (cfg) cfg.fallback();
            }
            if (r) {
                var file = null; try { file = new File([r.blob], r.cfg.name, { type: 'application/pdf' }); } catch (e) {}
                if (share && file && pdfCanShare()) {
                    try { await navigator.share({ files: [file], title: r.cfg.title }); st.textContent = 'Shared.'; }
                    catch (e) { st.textContent = (e && e.name === 'AbortError') ? '' : 'Sharing did not work. Use Download PDF instead.'; }
                } else {
                    var url = URL.createObjectURL(r.blob), a = document.createElement('a');
                    a.href = url; a.download = r.cfg.name; a.style.display = 'none'; document.body.appendChild(a); a.click();
                    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 800);
                    st.innerHTML = 'PDF saved as <b>' + NB.esc(r.cfg.name) + '</b>. Check your Downloads. <a href="' + url + '" target="_blank" rel="noopener">Not downloaded? Tap here to open it.</a>';
                }
            }
            PDF.busy = false; dl.disabled = false; sh.disabled = false;
        }
        dl.addEventListener('click', function () { run(false); });
        sh.addEventListener('click', function () { run(true); });
    }

    /* =====================================================================
       3) My PDFs: every notes / paper that is made is saved on this phone
       ===================================================================== */
    var MY_KEY = 'nb_my_pdfs', MY_MAX = 20;
    function myAll() { var a = LSX.get(MY_KEY, []); return Array.isArray(a) ? a : []; }
    function myPut(a) { a = a.slice(0, MY_MAX); while (a.length && !LSX.set(MY_KEY, a)) a.pop(); if (!a.length) LSX.del(MY_KEY); }
    function mySave(kind, doc) {
        try {
            var id = doc.id || (doc.id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)), o = {}, k, data, rec, a;
            for (k in doc.o) if (Object.prototype.hasOwnProperty.call(doc.o, k)) o[k] = doc.o[k];
            o.src = '';
            data = kind === 'notes' ? { id: id, o: o, title: doc.title, notes: doc.notes } : { id: id, o: o, qs: o.type === 'model' ? [] : doc.qs, secs: doc.secs };
            if (JSON.stringify(data).length > 600000) return;
            rec = { id: id, kind: kind, title: kind === 'notes' ? doc.title : (o.title || o.topic), ts: Date.now(), cls: o.cls, subj: (o.subj && o.subj !== 'other') ? qpSubjName(o) : '', lang: o.lang, type: o.type, half: !!o.half, data: data };
            a = myAll().filter(function (x) { return x.id !== id; }); a.unshift(rec); myPut(a);
            NB.markDay(kind === 'notes' ? 'notes' : 'paper');
        } catch (e) {}
    }
    function myKindLabel(r) { return r.kind === 'notes' ? (r.type === 'short' ? 'Short notes' : 'Long notes') : (r.type === 'model' ? (r.half ? 'Half Model Set' : 'Full Model Set') : 'Question paper'); }
    function myRender() {
        var a = myAll(), body = $('nbmyBody'), E = NB.esc;
        body.innerHTML = '<button type="button" class="np-back" id="myBack"><i class="fa-solid fa-arrow-left"></i> AI PDF Maker</button>' +
            '<h3 class="nbo-h"><i class="fa-solid fa-folder-open"></i> My PDFs</h3><p class="nbo-sub">Saved on this phone. Open them again any time without waiting for the AI.</p>' +
            (a.length ? a.map(function (r) {
                var d = new Date(r.ts);
                return '<div class="my-row" data-id="' + E(r.id) + '"><div class="my-ic" style="background:' + (r.kind === 'notes' ? 'linear-gradient(135deg,#f97316,#db2777)' : 'linear-gradient(135deg,#0ea5e9,#6366f1)') + '">' + (r.kind === 'notes' ? '📒' : '📄') + '</div>' +
                    '<div class="my-tx"><b>' + E(String(r.title || '').slice(0, 70)) + '</b><small>' + E('Class ' + r.cls + (r.subj ? ' · ' + r.subj : '') + ' · ' + myKindLabel(r) + ' · ' + d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]) + '</small></div>' +
                    '<div class="my-btns"><button type="button" class="my-b" data-a="open">Open</button><button type="button" class="my-x" data-a="del" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></div></div>';
            }).join('') : '<p class="nbo-sub" style="text-align:center;margin:22px 0">Nothing saved yet. Make notes or a question paper and it will appear here.</p>') +
            (a.length ? '<button type="button" class="nbo-skip" id="myClear">Delete all (' + a.length + ')</button>' : '');
        $('myBack').addEventListener('click', function () { NB.close('nbMy'); if (NB.parentOf && NB.parentOf('nbMy') === 'nbPm') NB.openPdfMaker(); });
        if ($('myClear')) $('myClear').addEventListener('click', function () {
            var c = this;
            if (c.getAttribute('data-ask')) { LSX.del(MY_KEY); myRender(); NB.toast('All saved PDFs deleted.', 1800); return; }
            c.setAttribute('data-ask', '1'); c.textContent = 'Tap again to delete all ' + a.length + ' PDFs'; c.style.color = '#ef4444';
            setTimeout(function () { if (c.parentNode) { c.removeAttribute('data-ask'); c.textContent = 'Delete all (' + a.length + ')'; c.style.color = ''; } }, 4000);
        });
        body.onclick = function (e) {
            var b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
            var row = b.closest('.my-row'), id = row && row.getAttribute('data-id'), rec = myAll().filter(function (x) { return x.id === id; })[0];
            if (!rec) return;
            var act = b.getAttribute('data-a');
            if (act === 'del') { row.classList.add('my-ask'); row.querySelector('.my-btns').innerHTML = '<span class="my-cf">Delete?</span><button type="button" class="my-yes" data-a="yes">Yes</button><button type="button" class="my-no" data-a="no">No</button>'; return; }
            if (act === 'no') { myRender(); return; }
            if (act === 'yes') { myPut(myAll().filter(function (x) { return x.id !== id; })); myRender(); NB.toast('Deleted from My PDFs.', 1800); return; }
            NB.close('nbMy');
            if (rec.kind === 'notes') { NP.doc = rec.data; if (!$('nbNt')) buildNotes(); NB.open('nbNt'); npResult(); NP.fromMy = true; }
            else {
                QP.paper = rec.data; if (rec.data.o.type === 'model') rec.data.qs = (rec.data.secs || []).reduce(function (s, x) { return s.concat(x.qs || []); }, []);
                if (!$('nbQp')) buildPaper(); NB.open('nbQp'); qpResult(false); QP.fromMy = true;
            }
        };
    }
    NB.openMyPdfs = function () {
        closeSiteMenu(); NB.close('nbPm');
        if (!$('nbMy')) {
            document.body.appendChild(NB.mk('<div class="nbo" id="nbMy" aria-hidden="true"><div class="nbo-card" role="dialog" aria-modal="true" aria-label="My PDFs" style="max-width:440px">' +
                '<button type="button" class="nbo-x" id="nbmyX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div id="nbmyBody"></div></div></div>'));
            $('nbmyX').addEventListener('click', function () { NB.close('nbMy'); });
        }
        myRender(); NB.open('nbMy');
    };

    /* --- hub: AI PDF Maker --- */
    NB.openPdfMaker = function () {
        closeSiteMenu();
        if (!$('nbPm')) {
            document.body.appendChild(NB.mk('<div class="nbo" id="nbPm" aria-hidden="true"><div class="nbo-card" role="dialog" aria-modal="true" aria-label="AI PDF Maker" style="max-width:440px">' +
                '<button type="button" class="nbo-x" id="nbpmX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
                '<h3 class="nbo-h"><i class="fa-solid fa-file-pdf"></i> AI PDF Maker</h3><p class="nbo-sub">What do you want to make today?</p>' +
                '<button type="button" class="pm-card" id="pmQp" style="--pm:linear-gradient(135deg,#0ea5e9,#6366f1)"><span class="pm-ic"><i class="fa-solid fa-file-circle-question"></i></span><span class="pm-tx"><b>Question Paper Maker</b><small>MCQ, short and long questions or a full Model Set, with answers, as PDF</small></span><i class="fa-solid fa-chevron-right"></i></button>' +
                '<button type="button" class="pm-card" id="pmNt" style="--pm:linear-gradient(135deg,#f97316,#db2777)"><span class="pm-ic"><i class="fa-solid fa-book-open"></i></span><span class="pm-tx"><b>Notes Maker</b><small>Colourful short or long notes with definitions, formulas, diagrams and pictures, as PDF</small></span><i class="fa-solid fa-chevron-right"></i></button>' +
                '<button type="button" class="pm-card pm-my" id="pmMy"><span class="pm-ic"><i class="fa-solid fa-folder-open"></i></span><span class="pm-tx"><b>My PDFs <span id="pmMyN"></span></b><small>Open the notes and papers you made before, no waiting for the AI</small></span><i class="fa-solid fa-chevron-right"></i></button>' +
                '</div></div>'));
            $('pmMy').addEventListener('click', function () { NB.openMyPdfs(); });
            $('nbpmX').addEventListener('click', function () { NB.close('nbPm'); });
            $('pmQp').addEventListener('click', function () { NB.close('nbPm'); NB.openPaper(); });
            $('pmNt').addEventListener('click', function () { NB.close('nbPm'); NB.openNotes(); });
        }
        var n = myAll().length; $('pmMyN').textContent = n ? '(' + n + ')' : '';
        NB.open('nbPm');
    };
    function qpCta() {                                           // extra button on the "Tests" screen
        var a = $('nbqAi'); if (!a || $('nbqPaper')) return;
        var b = document.createElement('button'); b.type = 'button'; b.id = 'nbqPaper'; b.className = 'nbai-cta'; b.style.background = 'linear-gradient(135deg,#0ea5e9,#6366f1)';
        b.innerHTML = '<i class="fa-solid fa-file-pdf"></i><span><b>Make a question paper (PDF)</b><small>Objective or subjective, with or without answers</small></span><i class="fa-solid fa-chevron-right"></i>';
        b.addEventListener('click', function () { NB.close('nbQz'); NB.openPaper(); });
        a.parentNode.insertBefore(b, a.nextSibling);
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
            else ui.openAuth('signup');   // no account yet: the sign-up / login page is shown every time (see the gate below)
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
    /* a photo is either an https link or an uploaded, already-compressed picture stored inside the slide (data:image/jpeg|webp|png) */
    function photo(v) { v = String(v || '').trim(); return v.length <= 900000 && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+\/=]+$/.test(v) ? v : url(v); }
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
                img: photo(s.img), imgM: photo(s.imgM), fit: s.fit === 'contain' ? 'contain' : 'cover', pos: /^(top|center|bottom)$/.test(s.pos) ? s.pos : 'center', ov: Math.round(num(s.ov, 0, 85, 35)),
                tc: col(s.tc, '#ffffff'), al: s.al === 'left' ? 'left' : 'center',
                ar: s.ar ? Math.round(num(s.ar, 0.8, 6, 3.2) * 100) / 100 : 0, arM: s.arM ? Math.round(num(s.arM, 0.8, 6, 1.33) * 100) / 100 : 0,
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
            a.classList.add('hs-photo'); if (s.fit === 'contain') a.classList.add('hs-fit');
            a.style.setProperty('--hs-d', 'url("' + s.img + '")'); a.style.setProperty('--hs-m', 'url("' + (s.imgM || s.img) + '")');
            a.style.setProperty('--hs-o', 'rgba(0,0,0,' + o + ')'); a.style.setProperty('--hs-pos', s.pos || 'center');
            if (s.ar) a.style.setProperty('--hs-ar', s.ar); if (s.arM) a.style.setProperty('--hs-arm', s.arM);
            if (!s.title && !s.text && !s.badge && !s.b.length) a.classList.add('hs-only');
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
        var pvb = $('hzPv'); if (pvb) Array.prototype.forEach.call(pvb.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pv') === (st.pv || 'd'))); });
        if (!s) { box.innerHTML = '<div class="hz-empty">No slides yet. Press <b>Add slide</b>.</div>'; return; }
        var c = NB.heroClean({ slides: [s] }).slides[0];
        var w = document.createElement('div'); w.className = 'hs';
        var t = document.createElement('div'); t.className = 'hs-track';
        var sl = NB.heroSlide(c, st.sel, st.cfg.slides.length);
        if (st.pv === 'm') { sl.classList.add('hs-pm'); w.style.maxWidth = '360px'; w.style.margin = '0 auto'; }
        t.appendChild(sl); w.appendChild(t); box.appendChild(w);
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
        $('hzAdd').disabled = a.length >= MAXS; $('hzAddPh').disabled = a.length >= MAXS;
    }
    function fld(label, inner, cls) { return '<label class="hz-f' + (cls ? ' ' + cls : '') + '"><span class="nbo-l">' + label + '</span>' + inner + '</label>'; }
    function inp(key, val, max, ph) { return '<input class="nbo-in" data-f="' + key + '" maxlength="' + max + '" value="' + h(val) + '" placeholder="' + h(ph || '') + '" autocomplete="off">'; }
    function colorF(label, key, val) { return fld(label, '<span class="hz-col"><input type="color" data-f="' + key + '" value="' + h(val) + '"><code>' + h(val) + '</code></span>'); }
    function range(key, val, min, max, step, unit) { return '<div class="hz-rng"><input type="range" data-f="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><output class="hz-out" data-u="' + unit + '">' + val + unit + '</output></div>'; }
    function seg(attr, cur, list) { return '<div class="hz-seg">' + list.map(function (x) { return '<button type="button" class="hz-btn" data-' + attr + '="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>'; }
    function kb(v) { return Math.round(String(v || '').length * 0.75 / 1024); }
    function thumb(v, auto) { return v ? '<div class="hz-th" style="background-image:url(&quot;' + h(v) + '&quot;)">' + (auto ? '<small>same as main</small>' : '') + '</div>' : '<div class="hz-th empty"><i class="fa-regular fa-image"></i></div>'; }
    /* uploaded picture -> compressed JPEG data URL (so it works on every phone and PC without any file hosting) */
    function readPhoto(file, maxDim, q) {
        return new Promise(function (res, rej) {
            if (!file || !/^image\//.test(file.type)) { rej(new Error('Please choose an image file.')); return; }
            if (file.size > 20 * 1024 * 1024) { rej(new Error('That photo is too large (max 20 MB).')); return; }
            var fr = new FileReader();
            fr.onerror = function () { rej(new Error('Could not read that photo.')); };
            fr.onload = function () {
                var im = new Image();
                im.onerror = function () { rej(new Error('That image format is not supported.')); };
                im.onload = function () {
                    var sc = Math.min(1, maxDim / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'), x = c.getContext('2d');
                    c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
                    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
                    var out = c.toDataURL('image/jpeg', q);
                    while (out.length > 600000 && q > 0.4) { q -= 0.08; out = c.toDataURL('image/jpeg', q); }
                    if (out.length > 880000) { rej(new Error('That photo is still too heavy after compressing. Try a smaller one.')); return; }
                    res(out);
                };
                im.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
    }
    /* ---------- photo cropper: drag to move, zoom, pick the banner shape or a custom size ---------- */
    var HC = null;                                                  // state of the open cropper
    var HC_SHAPES = [['16:5', 'Wide banner', 16, 5], ['16:9', 'Standard', 16, 9], ['4:3', 'Classic', 4, 3], ['1:1', 'Square', 1, 1], ['custom', 'Custom size', 0, 0]];
    function hcEl() { return $('nbHeroCrop'); }
    function hcBuild() {
        if (hcEl()) return;
        var el = NB.mk('<div id="nbHeroCrop" class="nbo" role="dialog" aria-modal="true" aria-hidden="true" dir="ltr" style="z-index:75"><div class="nbo-card hc-card">'
            + '<button type="button" class="nbo-x" data-hc="cancel" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>'
            + '<h3 class="nbo-h"><i class="fa-solid fa-crop-simple dynamic-text"></i> Adjust photo</h3>'
            + '<p class="nbo-sub">Drag the photo to move it. Zoom with the slider, the + / - buttons, the mouse wheel or two fingers.</p>'
            + '<div class="hc-chips" id="hcChips">' + HC_SHAPES.map(function (x) { return '<button type="button" class="hz-btn" data-shape="' + x[0] + '">' + x[1] + (x[2] ? ' <small>' + x[0] + '</small>' : '') + '</button>'; }).join('') + '</div>'
            + '<div class="hc-custom" id="hcCustom" style="display:none"><label>Width<input type="number" id="hcW" class="nbo-in" min="200" max="2400" value="1600" inputmode="numeric"></label><span>&times;</span><label>Height<input type="number" id="hcH" class="nbo-in" min="200" max="2400" value="500" inputmode="numeric"></label><em>px</em></div>'
            + '<div class="hc-stage" id="hcStage"><img id="hcImg" alt="" draggable="false"><div class="hc-frame" id="hcFrame"></div></div>'
            + '<div class="hc-zoom"><button type="button" class="hz-btn" data-hc="zout" aria-label="Zoom out"><i class="fa-solid fa-minus"></i></button><input type="range" id="hcZoom" min="100" max="500" step="1" value="100" aria-label="Zoom"><button type="button" class="hz-btn" data-hc="zin" aria-label="Zoom in"><i class="fa-solid fa-plus"></i></button><output id="hcZo">100%</output></div>'
            + '<div class="hc-info" id="hcInfo"></div>'
            + '<div class="hc-foot"><button type="button" class="hz-btn" data-hc="reset"><i class="fa-solid fa-rotate-left"></i> Reset</button><span><button type="button" class="hz-btn" data-hc="cancel">Cancel</button> <button type="button" class="hz-btn hz-pri" data-hc="use"><i class="fa-solid fa-check"></i> Use photo</button></span></div>'
            + '</div></div>');
        document.body.appendChild(el);
        NB.onClose.nbHeroCrop = function () { hcFinish(null); };
        el.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-hc],[data-shape]') : null; if (!b || !HC) return;
            var a = b.getAttribute('data-hc'), sh = b.getAttribute('data-shape');
            if (sh) { HC.shape = sh; HC.keepZ = true; hcLayout(); return; }
            if (a === 'cancel') NB.close('nbHeroCrop');
            else if (a === 'use') hcUse();
            else if (a === 'reset') { HC.z = 1; HC.cx = HC.iw / 2; HC.cy = HC.ih / 2; hcLayout(); }
            else if (a === 'zin') hcZoom(HC.z * 1.15);
            else if (a === 'zout') hcZoom(HC.z / 1.15);
        });
        $('hcZoom').addEventListener('input', function () { hcZoom(this.value / 100); });
        $('hcW').addEventListener('input', function () { if (HC) hcLayout(); }); $('hcH').addEventListener('input', function () { if (HC) hcLayout(); });
        var st0 = $('hcStage'), ptr = {}, last = 0;
        st0.addEventListener('pointerdown', function (e) { if (!HC) return; try { st0.setPointerCapture(e.pointerId); } catch (x) {} ptr[e.pointerId] = { x: e.clientX, y: e.clientY }; last = hcPinch(ptr); });
        st0.addEventListener('pointermove', function (e) {
            if (!HC || !ptr[e.pointerId]) return;
            var ids = Object.keys(ptr), p = ptr[e.pointerId], dx = e.clientX - p.x, dy = e.clientY - p.y;
            ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
            if (ids.length >= 2) { var d = hcPinch(ptr); if (last && d) hcZoom(HC.z * d / last); last = d; return; }
            HC.cx -= dx / HC.scale; HC.cy -= dy / HC.scale; hcLayout();
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { st0.addEventListener(n, function (e) { delete ptr[e.pointerId]; last = hcPinch(ptr); }); });
        st0.addEventListener('wheel', function (e) { if (!HC) return; e.preventDefault(); hcZoom(HC.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
        window.addEventListener('resize', function () { if (HC && NB.isOpen('nbHeroCrop')) hcLayout(); });
    }
    function hcPinch(ptr) { var k = Object.keys(ptr); if (k.length < 2) return 0; var a = ptr[k[0]], b = ptr[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
    function hcRatio() {
        if (HC.shape === 'custom') {
            var w = Math.max(200, Math.min(2400, +$('hcW').value || 1600)), h = Math.max(200, Math.min(2400, +$('hcH').value || 500));
            return { r: Math.max(0.8, Math.min(6, w / h)), w: w, h: h };
        }
        var s = HC_SHAPES.filter(function (x) { return x[0] === HC.shape; })[0];
        return { r: s[2] / s[3], w: 0, h: 0 };
    }
    function hcZoom(z) { HC.z = Math.max(1, Math.min(5, z)); hcLayout(); }
    function hcLayout() {                                           // places the photo + the crop frame; keeps the photo covering the frame
        var stg = $('hcStage'), sw = stg.clientWidth || 320, sh = stg.clientHeight || 280, R = hcRatio(), r = R.r, maxW = sw - 24, maxH = sh - 24, fw, fh;
        if (maxW / maxH > r) { fh = maxH; fw = fh * r; } else { fw = maxW; fh = fw / r; }
        var s0 = Math.max(fw / HC.iw, fh / HC.ih), scale = s0 * HC.z;
        HC.fw = fw; HC.fh = fh; HC.scale = scale; HC.r = r;
        HC.cx = Math.max(fw / 2 / scale, Math.min(HC.iw - fw / 2 / scale, HC.cx)); HC.cy = Math.max(fh / 2 / scale, Math.min(HC.ih - fh / 2 / scale, HC.cy));
        var fl = (sw - fw) / 2, ft = (sh - fh) / 2, im = $('hcImg'), fr = $('hcFrame');
        fr.style.cssText = 'left:' + fl + 'px;top:' + ft + 'px;width:' + fw + 'px;height:' + fh + 'px';
        im.style.cssText = 'width:' + (HC.iw * scale) + 'px;height:' + (HC.ih * scale) + 'px;left:' + (fl + fw / 2 - HC.cx * scale) + 'px;top:' + (ft + fh / 2 - HC.cy * scale) + 'px';
        $('hcZoom').value = Math.round(HC.z * 100); $('hcZo').textContent = Math.round(HC.z * 100) + '%';
        $('hcCustom').style.display = HC.shape === 'custom' ? '' : 'none';
        [].forEach.call($('hcChips').children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-shape') === HC.shape)); });
        var o = hcOut(1600); $('hcInfo').textContent = 'Saved picture size: ' + o[0] + ' \u00d7 ' + o[1] + ' px (also made smaller for phones automatically)';
    }
    function hcOut(maxDim) {                                        // output pixel size for the chosen shape (long side <= maxDim)
        var R = hcRatio(), w, h;
        if (HC.shape === 'custom') { w = R.w; h = R.h; } else { w = 1600; h = Math.round(1600 / R.r); }
        var k = Math.min(1, maxDim / Math.max(w, h)); return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
    }
    function hcRender(maxDim, q) {
        var o = hcOut(maxDim), c = document.createElement('canvas'), x = c.getContext('2d');
        c.width = o[0]; c.height = o[1];
        var sw = HC.fw / HC.scale, sh = HC.fh / HC.scale, sx = HC.cx - sw / 2, sy = HC.cy - sh / 2;
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.imageSmoothingQuality = 'high'; x.drawImage(HC.im, sx, sy, sw, sh, 0, 0, c.width, c.height);
        var out = c.toDataURL('image/jpeg', q);
        while (out.length > 600000 && q > 0.4) { q -= 0.08; out = c.toDataURL('image/jpeg', q); }
        return out;
    }
    function hcUse() {
        try {
            var d = hcRender(1600, 0.8), m = hcRender(900, 0.76);
            if (d.length > 880000 || m.length > 880000) { NB.toast('That photo is still too heavy after cropping. Zoom in a little or use a smaller custom size.', 4500); return; }
            var ar = Math.round(HC.r * 100) / 100, done = HC.done; HC.done = null; NB.close('nbHeroCrop'); HC = null; if (done) done({ d: d, m: m, ar: ar });
        } catch (e) { NB.toast('Could not crop that photo. Try another one.', 4000); }
    }
    function hcFinish(v) { var d = HC && HC.done; if (HC) HC.done = null; if (d) d(v); }
    function openCrop(file, kind) {
        return new Promise(function (res, rej) {
            if (!file || !(/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|avif|jfif)$/i.test(file.name || ''))) { rej(new Error('Please choose an image file (JPG, PNG or WebP).')); return; }
            if (file.size > 25 * 1024 * 1024) { rej(new Error('That photo is too large (max 25 MB).')); return; }
            var url = URL.createObjectURL(file), im = new Image();
            im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('This image format is not supported here (for example HEIC). Please choose a JPG, PNG or WebP photo.')); };
            im.onload = function () {
                hcBuild();
                HC = { im: im, iw: im.naturalWidth, ih: im.naturalHeight, cx: im.naturalWidth / 2, cy: im.naturalHeight / 2, z: 1, shape: kind === 'm' ? '4:3' : '16:5', done: function (v) { URL.revokeObjectURL(url); res(v); } };
                $('hcImg').src = url;
                NB.open('nbHeroCrop');
                requestAnimationFrame(function () { if (HC) hcLayout(); });
                setTimeout(function () { if (HC) hcLayout(); }, 120);
            };
            im.src = url;
        });
    }
    var picking = 'd';
    function pickFile(kind) { picking = kind; var f = $('hzFile'); f.value = ''; f.click(); }
    function onFile() {
        var f = this.files && this.files[0]; if (!f || !st) return;
        var kind = picking; msg('Opening photo');
        openCrop(f, kind).then(function (r) {
            if (!r || !st) { msg(''); return; }
            if (kind === 'new') {
                if (st.cfg.slides.length >= MAXS) { msg('You can have up to ' + MAXS + ' slides.', 'err'); NB.toast('You can have up to ' + MAXS + ' slides.', 3500); return; }
                var n = newSlide(); n.bg = 'img'; n.title = ''; n.text = ''; n.badge = ''; n.icon = ''; n.ov = 0; n.b = [{ t: '', a: 'notes', u: '', s: 'light' }, { t: '', a: 'notes', u: '', s: 'light' }];
                n.img = r.d; n.imgM = r.m; n.ar = r.ar; n.arM = 0; st.cfg.slides.push(n); st.sel = st.cfg.slides.length - 1;
            } else {
                var s = slide(); if (!s) return;
                if (kind === 'm') { s.imgM = r.m; s.arM = r.ar; } else { s.bg = 'img'; s.img = r.d; s.imgM = r.m; s.ar = r.ar; s.arM = 0; }
            }
            dirty(); renderAll(); msg('Photo added. Press Publish to show it to everyone.', 'ok');
        }).catch(function (e) { var t = (e && e.message) || 'Could not use that photo.'; msg(t, 'err'); NB.toast(t, 4500); });
    }
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
        if (s.bg === 'img') {
            o += '<div class="hz-ph"><div class="hz-ph-box"><span class="nbo-l">Photo (desktop &amp; mobile) – you can zoom &amp; crop it</span>' + thumb(s.img) +
                '<div class="hz-ph-b"><button type="button" class="hz-btn hz-pri" data-hz="pick-d"><i class="fa-solid fa-upload"></i> ' + (s.img ? 'Change photo' : 'Upload photo') + '</button>' + (s.img ? '<button type="button" class="hz-btn hz-danger" data-hz="clr-d"><i class="fa-solid fa-xmark"></i> Remove</button>' : '') + '</div></div>' +
                '<div class="hz-ph-box"><span class="nbo-l">Mobile photo (optional)</span>' + thumb(s.imgM || s.img, !s.imgM) +
                '<div class="hz-ph-b"><button type="button" class="hz-btn" data-hz="pick-m"><i class="fa-solid fa-mobile-screen"></i> ' + (s.imgM ? 'Change' : 'Upload different') + '</button>' + (s.imgM ? '<button type="button" class="hz-btn hz-danger" data-hz="clr-m"><i class="fa-solid fa-xmark"></i> Use main photo</button>' : '') + '</div></div></div>' +
                '<p class="hz-note">One upload is enough: it is resized for PC and phone automatically (' + kb(s.img) + ' KB desktop' + (s.imgM ? ', ' + kb(s.imgM) + ' KB mobile' : '') + '). Upload a separate mobile photo only if you want a different picture on phones.</p>' +
                '<div class="hz-grid hz-2">' + fld('Fit', seg('fit', s.fit, [['cover', 'Fill (crop edges)'], ['contain', 'Show whole photo']])) + fld('Focus', seg('pos', s.pos, [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']])) + '</div>' +
                fld('Or use an image link (https://…)', inp('img', /^data:/.test(s.img) ? '' : s.img, 500, 'https://example.com/banner.jpg')) +
                fld('Dark overlay (keeps the text readable, 0 = none)', range('ov', s.ov, 0, 85, 5, '%'));
        }
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
        return { id: 's' + Math.random().toString(36).slice(2, 9), on: true, badge: 'New', title: 'Your heading here', text: 'Write one or two short, useful lines.', icon: 'star', bg: 'grad', c: ['#4f46e5', '#7c3aed', ''], p: [0, 55, 110], ang: 135, solid: '#4f46e5', img: '', imgM: '', fit: 'cover', pos: 'center', ov: 35, tc: '#ffffff', al: 'center',
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
        var t = e.target.closest ? e.target.closest('[data-bg],[data-al],[data-fit],[data-pos],[data-icon],[data-preset],[data-hz],[data-i],[data-pv]') : null;
        if (!t) return;
        var s = slide(), v;
        if ((v = t.getAttribute('data-hz'))) {
            if (v === 'close') { if (st.dirty && !confirm('Close without publishing? Your changes will be lost.')) return; NB.close('nbHeroEd'); }
            else if (v === 'save') save();
            else if (v === 'reset') reset();
            else if (v === 'copy') copyRule();
            else if (v === 'pick-d' || v === 'pick-m') pickFile(v.charAt(5));
            else if (v === 'photo') pickFile('new');
            else if (v === 'clr-d') { var q0 = slide(); if (q0) { q0.img = ''; q0.imgM = ''; dirty(); renderForm(); renderPrev(); } }
            else if (v === 'clr-m') { var q1 = slide(); if (q1) { q1.imgM = ''; dirty(); renderForm(); renderPrev(); } }
            else act(v);
            return;
        }
        if ((v = t.getAttribute('data-pv'))) { st.pv = v; renderPrev(); return; }
        if ((v = t.getAttribute('data-i')) !== null) { st.sel = +v; renderStrip(); renderForm(); renderPrev(); return; }
        if (!s) return;
        if ((v = t.getAttribute('data-bg'))) s.bg = v;
        else if ((v = t.getAttribute('data-al'))) s.al = v;
        else if ((v = t.getAttribute('data-fit'))) s.fit = v;
        else if ((v = t.getAttribute('data-pos'))) s.pos = v;
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
            var isPh = a[k].bg === 'img' && a[k].img;
            if (!a[k].title.trim() && !isPh) { st.sel = k; renderAll(); msg('Slide ' + (k + 1) + ' needs a heading (or make it a photo slide).', 'err'); return; }
            if (a[k].bg === 'img' && !/^data:image\//.test(a[k].img) && !validUrl(a[k].img)) { st.sel = k; renderAll(); msg('Slide ' + (k + 1) + ': upload a photo or add a valid https:// image link, or pick another background.', 'err'); return; }
            for (j = 0; j < 2; j++) { b = a[k].b[j]; if (b.t.trim() && b.a === 'link' && !validUrl(b.u)) { st.sel = k; renderAll(); msg('Slide ' + (k + 1) + ', button ' + (j + 1) + ': add a valid https:// link.', 'err'); return; } }
        }
        var cfg = NB.heroClean(st.cfg);
        var bytes = JSON.stringify(cfg).length;
        if (bytes > 3200000) { msg('Photos are too heavy together (' + (bytes / 1048576).toFixed(1) + ' MB). Remove a photo or use fewer photo slides (limit about 3 MB).', 'err'); return; }
        if (!cfg.slides.some(function (s) { return s.on; }) && !confirm('No slide is visible, so the hero section will be hidden on Home. Continue?')) return;
        var btn = $('hzSave'); btn.disabled = true; btn.textContent = 'Publishing…'; msg('');
        try {
            cfg.updatedAt = Date.now();
            await write('PUT', cfg);
            delete cfg.updatedAt;
            NB.heroApply(cfg); st.dirty = false;
            msg('Published ✓ Everyone will see the new hero on PC and phone.' + (bytes > 1500000 ? ' Tip: the photos are large (' + (bytes / 1048576).toFixed(1) + ' MB), so Home may load slower on weak internet.' : ''), 'ok'); NB.toast('Hero published');
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
            + '<div class="hz-pvw"><span class="hz-cnt">Preview</span><div id="hzPv" class="hz-seg"><button type="button" class="hz-btn" data-pv="d" aria-pressed="true"><i class="fa-solid fa-desktop"></i> PC</button><button type="button" class="hz-btn" data-pv="m" aria-pressed="false"><i class="fa-solid fa-mobile-screen"></i> Phone</button></div></div>'
            + '<div id="hzPrev" class="hz-prev"></div><input type="file" id="hzFile" accept="image/*" class="nb-hide">'
            + '<div class="hz-bar"><span id="hzCount" class="hz-cnt"></span><span class="hz-addw"><button type="button" id="hzAddPh" class="hz-btn" data-hz="photo"><i class="fa-regular fa-image"></i> Add photo</button><button type="button" id="hzAdd" class="hz-btn hz-pri" data-hz="add"><i class="fa-solid fa-plus"></i> Add slide</button></span></div>'
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
        $('hzFile').addEventListener('change', onFile);
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

    /* bell: the site's own openNotifications() renders into #notificationList but opens a
       modal that no longer exists, so give it a hidden stand-in and show our header panel instead */
    var origNotif = typeof window.openNotifications === 'function' ? window.openNotifications : null;
    window.openNotifications = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var p = $('nbhNotif'); if (!p) return;
        var on = p.classList.contains('hidden');
        closeProfile(); setOpen($('nbhBell'), p, on);
        if (on && origNotif) {
            if (!$('notificationModal')) { var st = document.createElement('div'); st.id = 'notificationModal'; st.className = 'hidden'; st.style.display = 'none'; document.body.appendChild(st); }
            try { var r = origNotif(); if (r && r.catch) r.catch(function () {}); } catch (er) {}
            var st2 = $('notificationModal'); if (st2) st2.classList.add('hidden');
        }
    };

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
            case 'todo': if (NB.openTodo) NB.openTodo(); break;
            case 'sounds': if (NB.openSounds) NB.openSounds(); break;
            case 'voice': if (NB.openVoice) NB.openVoice(); break;
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
        var x = $('qoExtra'), b = $('qoMoreBtn'); if (!x || !b) return;
        var on = !x.classList.contains('open');
        x.classList.toggle('open', on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
        var t = b.querySelector('.qo-more-t'); if (t) t.textContent = on ? 'See less' : 'See more';
    };
})();

/* =====================================================================
   To-Do list (7-day study planner) + reminders + notification / reminder tones
   - tasks are kept for the current Mon-Sun week only; a new week starts with a fresh list
   - tones are synthesised with the Web Audio API (no audio files needed)
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var LSX = NB.ls, $ = function (id) { return document.getElementById(id); }, esc = NB.esc, pad = NB.pad;
    var KEY = 'nb_todo', SKEY = 'nb_snd', SNOOZE = 5 * 60 * 1000, LATE = 3 * 3600 * 1000;

    /* ---------- tones ---------- */
    /* note = [frequency Hz, start s, length s, wave, volume] */
    var NT = {
        chime:   { n: 'Chime',       notes: [[880, 0, .5, 'sine', .5], [1318.5, .12, .7, 'sine', .4]] },
        bell:    { n: 'Bell',        notes: [[1046.5, 0, 1.1, 'sine', .5], [2093, 0, .8, 'sine', .14], [1568, 0, .9, 'sine', .12]] },
        pop:     { n: 'Pop',         notes: [[700, 0, .12, 'sine', .6], [1100, .08, .16, 'sine', .5]] },
        dingdong:{ n: 'Ding-dong',   notes: [[784, 0, .45, 'sine', .5], [587.3, .35, .8, 'sine', .5]] },
        sparkle: { n: 'Sparkle',     notes: [[1318.5, 0, .18, 'triangle', .35], [1568, .1, .18, 'triangle', .35], [2093, .2, .35, 'triangle', .35]] },
        soft:    { n: 'Soft note',   notes: [[392, 0, .6, 'sine', .4], [523.3, .2, .9, 'sine', .35]] },
        loudbell:{ n: 'Loud bell',   loud: 1, notes: [[1046.5, 0, 1.4, 'sawtooth', .9], [2093, 0, 1, 'square', .45], [1568, 0, 1.2, 'triangle', .7]] },
        horn:    { n: 'Air horn',    loud: 1, notes: [[349.2, 0, .9, 'sawtooth', 1], [440, 0, .9, 'sawtooth', .9], [523.3, 0, .9, 'square', .6]] },
        urgent:  { n: 'Urgent alert',loud: 1, notes: [[1200, 0, .14, 'square', .85], [800, .18, .14, 'square', .85], [1200, .36, .14, 'square', .85], [800, .54, .26, 'square', .85]] },
        buzzer:  { n: 'Loud buzzer', loud: 1, notes: [[220, 0, .5, 'sawtooth', 1], [233, 0, .5, 'sawtooth', 1], [220, .62, .5, 'sawtooth', 1], [233, .62, .5, 'sawtooth', 1]] },
        megaphone:{ n: 'Megaphone alert', loud: 1, notes: [[600, 0, .25, 'square', 1], [900, .25, .25, 'square', 1], [600, .5, .25, 'square', 1], [900, .75, .35, 'square', 1]] },
        clockring:{ n: 'Alarm clock',  loud: 1, notes: [[1800, 0, .08, 'square', .9], [1800, .12, .08, 'square', .9], [1800, .24, .08, 'square', .9], [1800, .36, .08, 'square', .9], [1800, .48, .08, 'square', .9], [1800, .6, .2, 'square', .9]] },
        thunder: { n: 'Thunder bell', loud: 1, notes: [[130.8, 0, 1.2, 'sawtooth', 1], [196, 0, 1.2, 'sawtooth', .9], [1318.5, .05, 1, 'square', .6], [2637, .05, .8, 'square', .35]] },
        trumpet: { n: 'Trumpet blast', loud: 1, notes: [[392, 0, .25, 'sawtooth', 1], [392, .3, .25, 'sawtooth', 1], [523.3, .6, .7, 'sawtooth', 1], [659.3, .6, .7, 'square', .6]] }
    };
    var RT = {
        melody:  { n: 'Morning melody', p: 2.6, notes: [[523.3, 0, .22, 'triangle', .45], [659.3, .25, .22, 'triangle', .45], [784, .5, .22, 'triangle', .45], [659.3, .75, .22, 'triangle', .45], [523.3, 1, .22, 'triangle', .45], [659.3, 1.25, .22, 'triangle', .45], [784, 1.5, .22, 'triangle', .45], [1046.5, 1.8, .6, 'triangle', .5]] },
        alarm:   { n: 'Classic alarm',  p: 1.6, notes: [[1000, 0, .14, 'square', .2], [1000, .24, .14, 'square', .2], [1000, .48, .14, 'square', .2], [1000, .72, .14, 'square', .2]] },
        rise:    { n: 'Rising tone',    p: 1.9, notes: [[440, 0, .22, 'sine', .5], [554.4, .24, .22, 'sine', .5], [659.3, .48, .22, 'sine', .5], [880, .72, .6, 'sine', .55]] },
        digital: { n: 'Digital beep',   p: 1.2, notes: [[1400, 0, .1, 'square', .16], [1400, .17, .1, 'square', .16], [1400, .34, .1, 'square', .16], [1900, .6, .25, 'square', .16]] },
        gentle:  { n: 'Gentle wake-up', p: 3.2, notes: [[523.3, 0, 1, 'sine', .45], [659.3, .55, 1, 'sine', .45], [784, 1.1, 1.5, 'sine', .45]] },
        temple:  { n: 'Temple bells',   p: 3.4, notes: [[1046.5, 0, 1.6, 'sine', .42], [1568, 0, 1.2, 'sine', .1], [880, .9, 1.7, 'sine', .42], [1318.5, .9, 1.2, 'sine', .1]] },
        siren:   { n: 'Loud siren',     loud: 1, p: 2.3, notes: [[700, 0, .55, 'sawtooth', 1], [1100, .55, .55, 'sawtooth', 1], [700, 1.1, .55, 'sawtooth', 1], [1100, 1.65, .55, 'sawtooth', 1]] },
        fire:    { n: 'Fire alarm',     loud: 1, p: 1.1, notes: [[2000, 0, .14, 'square', .9], [2000, .22, .14, 'square', .9], [2000, .44, .14, 'square', .9], [2000, .66, .14, 'square', .9]] },
        ring:    { n: 'Loud phone ring',loud: 1, p: 2.2, notes: [[1400, 0, .4, 'square', .8], [1000, 0, .4, 'square', .8], [1400, .5, .4, 'square', .8], [1000, .5, .4, 'square', .8]] },
        blaster: { n: 'Wake-up blaster',loud: 1, p: 2.4, notes: [[523.3, 0, .3, 'sawtooth', 1], [659.3, .3, .3, 'sawtooth', 1], [784, .6, .3, 'sawtooth', 1], [1046.5, .9, .3, 'sawtooth', 1], [784, 1.2, .3, 'sawtooth', 1], [1046.5, 1.5, .7, 'sawtooth', 1]] },
        hornloop:{ n: 'Air horn blast', loud: 1, p: 1.9, notes: [[349.2, 0, .8, 'sawtooth', 1], [440, 0, .8, 'sawtooth', 1], [523.3, 0, .8, 'square', .6], [349.2, 1, .6, 'sawtooth', 1], [440, 1, .6, 'sawtooth', 1]] },
        police:  { n: 'Police siren',   loud: 1, p: 1.6, notes: [[950, 0, .4, 'square', .9], [650, .4, .4, 'square', .9], [950, .8, .4, 'square', .9], [650, 1.2, .4, 'square', .9]] },
        rocket:  { n: 'Rocket alarm',   loud: 1, p: 1.5, notes: [[400, 0, .3, 'sawtooth', 1], [600, .3, .3, 'sawtooth', 1], [800, .6, .3, 'sawtooth', 1], [1200, .9, .5, 'square', .9]] },
        drumroll:{ n: 'Loud wake-up bell', loud: 1, p: 2, notes: [[1568, 0, .15, 'square', .9], [1047, .15, .15, 'square', .9], [1568, .3, .15, 'square', .9], [1047, .45, .15, 'square', .9], [1568, .6, .15, 'square', .9], [2093, .85, .8, 'sawtooth', .8]] }
    };
    /* tones the user adds from their own phone / PC (kept in IndexedDB; ids look like "c:abc123") */
    var CT = {}, CT_DB = 'nb_tones', CT_MAX = 8, CT_BYTES = 5 * 1024 * 1024, CT_PRE = /^c:[a-z0-9]{3,16}$/;
    function ctDb() {
        return new Promise(function (res, rej) {
            if (!window.indexedDB) { rej(new Error('no idb')); return; }
            var rq = indexedDB.open(CT_DB, 1);
            rq.onupgradeneeded = function () { rq.result.createObjectStore('t', { keyPath: 'id' }); };
            rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); };
        });
    }
    function ctTx(mode, fn) { return ctDb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction('t', mode), r = fn(tx.objectStore('t')); tx.oncomplete = function () { res(r && r.result); }; tx.onerror = tx.onabort = function () { rej(tx.error); }; }); }); }
    function ctLoad() {
        ctTx('readonly', function (st) { return st.getAll(); }).then(function (all) {
            (all || []).forEach(function (r) { if (r && r.blob && !CT['c:' + r.id]) CT['c:' + r.id] = { n: r.name, url: URL.createObjectURL(r.blob) }; });
            if ($('nbSnd') && NB.isOpen('nbSnd')) paintSnd(); ctTodoOpts();
        }).catch(function () {});
    }
    function ctKeys() { return Object.keys(CT); }
    var AC = null;
    function ctx() {
        if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { AC = new C(); } catch (e) { return null; } }
        if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
        return AC;
    }
    /* browsers only allow sound after a tap: unlock on the first touch / click / key press */
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { ctx(); }, { once: true, passive: true }); });

    function snd() {
        var s = LSX.get(SKEY, null) || {};
        return { on: s.on !== false, n: NT[s.n] || CT_PRE.test(s.n || '') ? s.n : 'chime', r: RT[s.r] || CT_PRE.test(s.r || '') ? s.r : 'melody', v: typeof s.v === 'number' ? Math.max(.1, Math.min(1, s.v)) : .8 };
    }
    function saveSnd(patch) { var s = snd(); for (var k in patch) s[k] = patch[k]; LSX.set(SKEY, s); }

    /* kind 'n' = notification tone (plays once), 'r' = reminder ringtone (repeats until stopped); force = ignore the on/off switch (preview) */
    function play(kind, key, loopMs, force) {
        var S = snd(); if (!S.on && !force) return null;
        if (CT_PRE.test(key || '') && CT[key]) {                               // a tone from the user's own device
            var au = new Audio(CT[key].url), tm2 = 0, dead = false; au.volume = S.v; au.loop = !!loopMs;
            var stop2 = function () { if (dead) return; dead = true; clearTimeout(tm2); try { au.pause(); au.currentTime = 0; } catch (e) {} };
            try { var pr = au.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
            tm2 = setTimeout(stop2, loopMs || 8000);
            if (!loopMs) au.addEventListener('ended', stop2);
            return { stop: stop2 };
        }
        if (CT_PRE.test(key || '')) key = kind === 'n' ? 'chime' : 'melody';       // custom tone not loaded (or deleted): use the default
        var c = ctx(); if (!c) return null;
        var def = (kind === 'n' ? NT : RT)[key] || (kind === 'n' ? NT.chime : RT.melody);
        var master = c.createGain(); master.gain.value = 1; master.connect(c.destination);
        var iv = 0, tm = 0, stopped = false;
        function once() {
            var t0 = c.currentTime + .03;
            def.notes.forEach(function (n) {
                var o = c.createOscillator(), g = c.createGain(), s = t0 + n[1], e = s + n[2];
                o.type = n[3] || 'sine'; o.frequency.value = n[0];
                g.gain.setValueAtTime(.0001, s);
                g.gain.exponentialRampToValueAtTime(Math.max(.001, (n[4] || .4) * S.v), s + .02);
                g.gain.exponentialRampToValueAtTime(.0001, e);
                o.connect(g); g.connect(master); o.start(s); o.stop(e + .05);
            });
        }
        function stop() {
            if (stopped) return; stopped = true; clearInterval(iv); clearTimeout(tm);
            try { master.gain.cancelScheduledValues(c.currentTime); master.gain.setTargetAtTime(0, c.currentTime, .03); } catch (e) {}
            setTimeout(function () { try { master.disconnect(); } catch (e) {} }, 400);
        }
        once();
        if (loopMs) { iv = setInterval(once, (def.p || 2) * 1000); tm = setTimeout(stop, loopMs); }
        else setTimeout(stop, 2500);
        return { stop: stop };
    }
    var pv = null;
    function preview(kind, key) { if (pv) pv.stop(); pv = play(kind, key, kind === 'r' ? 4200 : 0, true); }
    NB.playNotifTone = function () { play('n', snd().n); };

    /* every in-page notification the site raises also plays the chosen notification tone */
    var origNotify = window.nbNotify;
    window.nbNotify = function (title, body, url) {
        NB.playNotifTone();
        return origNotify ? origNotify(title, body, url) : Promise.resolve(false);
    };

    /* ---------- data ---------- */
    function mondayKey() { var n = new Date(), dow = (n.getDay() + 6) % 7; return NB.dayKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() - dow)); }
    function weekKeys() { var n = new Date(), dow = (n.getDay() + 6) % 7, a = [], i; for (i = 0; i < 7; i++) a.push(NB.dayKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() - dow + i))); return a; }
    function load() {
        var o = LSX.get(KEY, null), w = mondayKey();
        if (!o || o.w !== w || !Array.isArray(o.items)) {
            var had = o && Array.isArray(o.items) && o.items.length;
            o = { w: w, items: [] };
            if (had) LSX.set(KEY, o);            // a new 7-day week began: last week's list is dropped
        }
        return o;
    }
    function save(o) { LSX.set(KEY, o); if (NB.ui && NB.ui.refreshAll) NB.ui.refreshAll(); }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function atOf(it) { var p = it.d.split('-'), t = it.t.split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]).getTime(); }
    function fmtT(t) { if (!t) return ''; var h = +t.split(':')[0], m = t.split(':')[1]; return (h % 12 || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM'); }
    function dayName(k, long) { return parseKey(k).toLocaleDateString('en-IN', long ? { weekday: 'long', day: 'numeric', month: 'short' } : { weekday: 'short' }); }
    NB.todoCount = function (k) {
        var n = 0, d = 0; load().items.forEach(function (it) { if (it.d === k) { n++; if (it.done) d++; } });
        return { n: n, done: d };
    };

    /* ---------- to-do dialog ---------- */
    var sel = '', editing = null;
    function ctOpts() {
        return '<option value="">Default tone</option>' + Object.keys(RT).map(function (k) { return '<option value="' + k + '">' + (RT[k].loud ? 'Loud: ' : '') + RT[k].n + '</option>'; }).join('') +
            ctKeys().map(function (k) { return '<option value="' + k + '">My tone: ' + esc(CT[k].n) + '</option>'; }).join('');
    }
    function ctTodoOpts() { var sl = $('nbTdTone'); if (!sl) return; var v = sl.value; sl.innerHTML = ctOpts(); sl.value = v; }
    function ensureTd() {
        if ($('nbTd')) return;
        var opts = ctOpts();
        var m = NB.mk('<div class="nbo" id="nbTd" aria-hidden="true"><div class="nbo-card nbtd-card" role="dialog" aria-modal="true" aria-labelledby="nbTdT">' +
            '<button type="button" class="nbo-x" id="nbTdX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<h3 class="nbo-h" id="nbTdT">To-Do List</h3><p class="nbo-sub">Pick a day, then set what to study and when.</p>' +
            '<div class="nbtd-days" id="nbTdDays" role="group" aria-label="This week"></div>' +
            '<div class="nbtd-dh"><b id="nbTdDate"></b><span id="nbTdCnt"></span></div>' +
            '<div class="nbtd-list" id="nbTdList"></div>' +
            '<form id="nbTdForm" class="nbtd-form" novalidate>' +
            '<label class="nbo-l" for="nbTdTxt" id="nbTdFormL">Add a target</label>' +
            '<input id="nbTdTxt" class="nbo-in" maxlength="80" placeholder="e.g. Physics: Newton\'s laws" autocomplete="off">' +
            '<div class="nbtd-2"><div><label class="nbo-l" for="nbTdTime">Time</label><input id="nbTdTime" class="nbo-in" type="time"></div>' +
            '<div><label class="nbo-l" for="nbTdTone">Reminder tone</label><div class="nbtd-tw"><select id="nbTdTone" class="nbo-in">' + opts + '</select>' +
            '<button type="button" id="nbTdPrev" class="nbtd-pv" aria-label="Play this tone"><i class="fa-solid fa-play"></i></button></div></div></div>' +
            '<label class="nbtd-chk"><input type="checkbox" id="nbTdRem" checked><span>Remind me at this time</span></label>' +
            '<div class="nbo-err" id="nbTdErr" role="alert"></div>' +
            '<button type="submit" class="nbo-save" id="nbTdGo">Add to to-do list</button>' +
            '<button type="button" class="nbo-skip nb-hide" id="nbTdCancel">Cancel editing</button>' +
            '</form>' +
            '<p class="nbo-note"><i class="fa-regular fa-clock"></i> This list is kept for the current 7 days (Mon–Sun) and a fresh list starts with the new week. Reminders ring while Notes Bazar is open. <button type="button" class="nbtd-lnk" id="nbTdSnd">Change tones</button></p>' +
            '</div></div>');
        document.body.appendChild(m);
        $('nbTdX').addEventListener('click', function () { NB.close('nbTd'); });
        $('nbTdSnd').addEventListener('click', function () { NB.close('nbTd'); NB.openSounds(); });
        $('nbTdPrev').addEventListener('click', function () { var v = $('nbTdTone').value || snd().r; preview('r', v); });
        $('nbTdDays').addEventListener('click', function (e) { var b = e.target.closest('[data-d]'); if (b) { sel = b.dataset.d; resetForm(); renderTd(); } });
        $('nbTdForm').addEventListener('submit', submitTd);
        $('nbTdCancel').addEventListener('click', function () { resetForm(); renderTd(); });
        $('nbTdRem').addEventListener('change', function () { $('nbTdTone').disabled = !this.checked; });
        $('nbTdList').addEventListener('click', function (e) {
            var b = e.target.closest('[data-a]'); if (!b) return;
            var row = b.closest('[data-id]'), id = row && row.dataset.id, o = load(), it = o.items.filter(function (x) { return x.id === id; })[0];
            if (!it) return;
            if (b.dataset.a === 'tg') { it.done = !it.done; save(o); renderTd(); }
            else if (b.dataset.a === 'rm') { o.items = o.items.filter(function (x) { return x.id !== id; }); if (editing === id) resetForm(); save(o); renderTd(); }
            else if (b.dataset.a === 'ed') {
                editing = id; $('nbTdTxt').value = it.x; $('nbTdTime').value = it.t || ''; $('nbTdRem').checked = !!it.r; $('nbTdTone').value = it.tn || ''; $('nbTdTone').disabled = !it.r;
                $('nbTdGo').textContent = 'Save changes'; $('nbTdFormL').textContent = 'Edit target'; $('nbTdCancel').classList.remove('nb-hide'); $('nbTdErr').textContent = '';
                $('nbTdTxt').focus(); renderTd();
            }
        });
    }
    function defTime() {
        var n = new Date();
        if (sel === NB.dayKey()) { var h = Math.min(23, n.getHours() + 1); return pad(h) + ':00'; }
        return '18:00';
    }
    function resetForm() {
        editing = null; $('nbTdTxt').value = ''; $('nbTdTime').value = defTime(); $('nbTdRem').checked = true; $('nbTdTone').value = ''; $('nbTdTone').disabled = false;
        $('nbTdGo').textContent = 'Add to to-do list'; $('nbTdFormL').textContent = 'Add a target'; $('nbTdCancel').classList.add('nb-hide'); $('nbTdErr').textContent = '';
    }
    function renderTd() {
        var o = load(), keys = weekKeys(), today = NB.dayKey(), h = '';
        if (keys.indexOf(sel) < 0) sel = keys.indexOf(today) >= 0 ? today : keys[0];
        keys.forEach(function (k) {
            var c = NB.todoCount(k), cls = (k === sel ? ' sel' : '') + (k === today ? ' today' : '');
            h += '<button type="button" class="nbtd-day' + cls + '" data-d="' + k + '" aria-pressed="' + (k === sel) + '" aria-label="' + dayName(k, true) + (c.n ? ', ' + c.n + ' tasks' : '') + '"><small>' + dayName(k) + '</small><b>' + parseKey(k).getDate() + '</b><i class="nbtd-dot' + (c.n ? (c.done === c.n ? ' all' : ' on') : '') + '"></i></button>';
        });
        $('nbTdDays').innerHTML = h;
        $('nbTdDate').textContent = (sel === today ? 'Today · ' : '') + dayName(sel, true);
        var c = NB.todoCount(sel); $('nbTdCnt').textContent = c.n ? c.done + ' of ' + c.n + ' done' : '';
        var items = o.items.filter(function (x) { return x.d === sel; }).sort(function (a, b) { return (a.t || '99:99') < (b.t || '99:99') ? -1 : (a.t || '99:99') > (b.t || '99:99') ? 1 : 0; });
        $('nbTdList').innerHTML = items.length ? items.map(function (it) {
            return '<div class="nbtd-it' + (it.done ? ' done' : '') + (editing === it.id ? ' editing' : '') + '" data-id="' + it.id + '">' +
                '<button type="button" class="nbtd-ck" data-a="tg" role="checkbox" aria-checked="' + (!!it.done) + '" aria-label="Mark as done"><i class="fa-solid fa-check"></i></button>' +
                '<div class="nbtd-tx"><b>' + esc(it.x) + '</b><small>' + (it.t ? '<i class="fa-regular fa-clock"></i> ' + fmtT(it.t) : 'Any time') + (it.r && it.t ? ' · <i class="fa-solid fa-bell"></i> Reminder' : '') + '</small></div>' +
                '<button type="button" class="nbtd-ib" data-a="ed" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
                '<button type="button" class="nbtd-ib del" data-a="rm" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></div>';
        }).join('') : '<div class="nbtd-empty"><i class="fa-regular fa-clipboard"></i><span>Nothing planned for this day yet.<br>Add your first target below.</span></div>';
    }
    function submitTd(e) {
        e.preventDefault();
        var err = $('nbTdErr'), x = String($('nbTdTxt').value).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80), t = $('nbTdTime').value, r = $('nbTdRem').checked;
        err.textContent = '';
        if (x.length < 2) { err.textContent = 'Write what you want to study (subject or topic).'; $('nbTdTxt').focus(); return; }
        if (r && !t) { err.textContent = 'Choose a time to get a reminder, or turn the reminder off.'; $('nbTdTime').focus(); return; }
        if (r && atOf({ d: sel, t: t }) <= Date.now()) { err.textContent = 'That time has already passed. Pick a later time or turn the reminder off.'; $('nbTdTime').focus(); return; }
        var o = load(), tn = r ? $('nbTdTone').value : '', it = editing ? o.items.filter(function (z) { return z.id === editing; })[0] : null;
        if (it) { it.x = x; it.t = t; it.r = r; it.tn = tn; it.n = 0; it.sn = 0; }
        else o.items.push({ id: uid(), d: sel, x: x, t: t, r: r, tn: tn, done: false, n: 0, sn: 0 });
        var wasEdit = !!it;
        save(o); resetForm(); renderTd();
        NB.toast(wasEdit ? 'Target updated' : 'Added to your to-do list' + (r ? ' · reminder set for ' + fmtT(t) : ''), 2600);
        if (r && NB.notif && window.Notification && Notification.permission === 'default' && NB.notif.request) NB.notif.request();
        ctx();
    }
    NB.openTodo = function (day) {
        NB.closeSiteMenu();
        ensureTd();
        var keys = weekKeys(), today = NB.dayKey();
        ctTodoOpts();
        sel = day && keys.indexOf(day) >= 0 ? day : (keys.indexOf(sel) >= 0 && !day ? sel : today);
        resetForm(); renderTd(); NB.open('nbTd');
    };

    /* ---------- tones dialog (menu, settings and the bell panel all open this) ---------- */
    function ensureSnd() {
        if ($('nbSnd')) return;
        var m = NB.mk('<div class="nbo" id="nbSnd" aria-hidden="true"><div class="nbo-card nbsn-card" role="dialog" aria-modal="true" aria-labelledby="nbSnT">' +
            '<button type="button" class="nbo-x" id="nbSnX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<h3 class="nbo-h" id="nbSnT">Reminder &amp; notification tones</h3><p class="nbo-sub">Tap a tone to select it and hear it. Tones marked with the speaker icon are extra loud. You can also add your own tone from your phone or PC.</p>' +
            '<label class="nbtd-chk nbsn-on"><input type="checkbox" id="nbSnOn"><span>Play sounds</span></label>' +
            '<input type="file" id="nbSnFile" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac" class="nb-hide">' +
            '<div class="nbsn-h"><i class="fa-solid fa-bell"></i> Notification tone</div><div class="nbsn-list" id="nbSnN" role="radiogroup" aria-label="Notification tone"></div>' +
            '<button type="button" class="nbsn-add" data-add="n"><i class="fa-solid fa-folder-open"></i> Add a tone from my device</button>' +
            '<div class="nbsn-h"><i class="fa-solid fa-clock"></i> Reminder ringtone</div><div class="nbsn-list" id="nbSnR" role="radiogroup" aria-label="Reminder ringtone"></div>' +
            '<button type="button" class="nbsn-add" data-add="r"><i class="fa-solid fa-folder-open"></i> Add a tone from my device</button>' +
            '<div class="nbsn-h"><i class="fa-solid fa-volume-high"></i> Volume</div><input type="range" id="nbSnV" min="10" max="100" step="5" aria-label="Volume" class="nbsn-v">' +
            '<p class="nbo-note">Tones play while Notes Bazar is open. Your phone\'s own notification sound is controlled by your phone settings.</p>' +
            '</div></div>');
        document.body.appendChild(m);
        $('nbSnX').addEventListener('click', function () { NB.close('nbSnd'); });
        $('nbSnOn').addEventListener('change', function () { saveSnd({ on: this.checked }); });
        $('nbSnV').addEventListener('input', function () { saveSnd({ v: this.value / 100 }); });
        $('nbSnV').addEventListener('change', function () { preview('n', snd().n); });
        var addKind = 'n';
        m.addEventListener('click', function (e) { var a = e.target.closest('[data-add]'); if (!a) return; addKind = a.getAttribute('data-add'); var f = $('nbSnFile'); f.value = ''; f.click(); });
        $('nbSnFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) ctAdd(f, addKind); });
        ['N', 'R'].forEach(function (K) {
            $('nbSn' + K).addEventListener('click', function (e) {
                var d = e.target.closest('[data-del]');
                if (d) { ctDel(d.getAttribute('data-del')); return; }
                var b = e.target.closest('[data-k]'); if (!b) return;
                var kind = K === 'N' ? 'n' : 'r'; saveSnd(kind === 'n' ? { n: b.dataset.k } : { r: b.dataset.k });
                paintSnd(); preview(kind, b.dataset.k);
            });
        });
    }
    function paintSnd() {
        var S = snd();
        $('nbSnOn').checked = S.on; $('nbSnV').value = Math.round(S.v * 100);
        function rows(map, cur) {
            return Object.keys(map).map(function (k) { return '<button type="button" role="radio" class="nbsn-r' + (map[k].loud ? ' nbsn-loud' : '') + '" data-k="' + k + '" aria-checked="' + (k === cur) + '"><i class="fa-solid ' + (map[k].loud ? 'fa-volume-high' : 'fa-circle-play') + '"></i><span>' + map[k].n + '</span><i class="fa-solid fa-check nbsn-ok"></i></button>'; }).join('') +
                ctKeys().map(function (k) { return '<div class="nbsn-cw"><button type="button" role="radio" class="nbsn-r nbsn-my" data-k="' + k + '" aria-checked="' + (k === cur) + '" title="' + esc(CT[k].n) + '"><i class="fa-solid fa-music"></i><span>' + esc(CT[k].n) + '</span><i class="fa-solid fa-check nbsn-ok"></i></button><button type="button" class="nbsn-del" data-del="' + k + '" aria-label="Delete this tone"><i class="fa-solid fa-trash"></i></button></div>'; }).join('');
        }
        $('nbSnN').innerHTML = rows(NT, S.n); $('nbSnR').innerHTML = rows(RT, S.r);
    }
    function ctAdd(f, kind) {
        var okT = /^audio\//.test(f.type) || /\.(mp3|wav|ogg|oga|m4a|aac|opus|weba|flac)$/i.test(f.name || '');
        if (!okT) { NB.toast('Please choose an audio file (MP3, WAV, OGG or M4A).', 3800); return; }
        if (f.size > CT_BYTES) { NB.toast('That file is too big. Choose a tone under 5 MB.', 3800); return; }
        if (ctKeys().length >= CT_MAX) { NB.toast('You can keep up to ' + CT_MAX + ' tones. Delete one first.', 3800); return; }
        var id = Math.random().toString(36).slice(2, 10), key = 'c:' + id, name = String(f.name || 'My tone').replace(/\.[^.]+$/, '').replace(/[<>]/g, '').trim().slice(0, 24) || 'My tone';
        var url = URL.createObjectURL(f), t = new Audio(url);
        t.onerror = function () { URL.revokeObjectURL(url); NB.toast('This device cannot play that file. Try an MP3 or WAV.', 4000); };
        t.onloadedmetadata = function () {
            CT[key] = { n: name, url: url };
            ctTx('readwrite', function (st) { return st.put({ id: id, name: name, blob: f }); }).catch(function () { NB.toast('Added for now, but this browser could not save it for next time.', 4000); });
            saveSnd(kind === 'n' ? { n: key } : { r: key }); paintSnd(); ctTodoOpts(); preview(kind, key);
            NB.toast('Tone added: ' + name, 2600);
        };
    }
    function ctDel(key) {
        var t = CT[key]; if (!t || !confirm('Delete the tone "' + t.n + '"?')) return;
        try { URL.revokeObjectURL(t.url); } catch (e) {} delete CT[key];
        ctTx('readwrite', function (st) { return st.delete(key.slice(2)); }).catch(function () {});
        var S = snd(), patch = {}; if (S.n === key) patch.n = 'chime'; if (S.r === key) patch.r = 'melody'; saveSnd(patch);
        paintSnd(); ctTodoOpts();
    }
    ctLoad();
    NB.openSounds = function () { NB.closeSiteMenu(); ensureSnd(); paintSnd(); NB.open('nbSnd'); };

    /* ---------- reminders ---------- */
    var rings = {}, ringH = null;
    function stopRing() { if (ringH) { ringH.stop(); ringH = null; } }
    function ensureRem() {
        var c = $('nbRem');
        if (!c) {
            c = NB.mk('<div id="nbRem" class="nbrm" aria-live="assertive"></div>'); document.body.appendChild(c);
            c.addEventListener('click', function (e) {
                var b = e.target.closest('[data-a]'); if (!b) return;
                var card = b.closest('[data-id]'), id = card.dataset.id, o = load(), it = o.items.filter(function (x) { return x.id === id; })[0];
                if (b.dataset.a === 'dn' && it) { it.done = true; save(o); }
                if (b.dataset.a === 'sn' && it) { it.sn = Date.now() + SNOOZE; it.n = 0; save(o); NB.toast('Snoozed for 5 minutes', 2200); }
                card.remove(); delete rings[id];
                if (!c.children.length) stopRing();
                if (NB.isOpen('nbTd')) renderTd();
            });
        }
        return c;
    }
    function fire(it, late) {
        var c = ensureRem();
        if (!c.querySelector('[data-id="' + it.id + '"]')) {
            c.appendChild(NB.mk('<div class="nbrm-c" data-id="' + it.id + '" role="alert"><div class="nbrm-i"><i class="fa-solid fa-bell"></i></div>' +
                '<div class="nbrm-t"><b>Time to study!</b><span>' + esc(it.x) + '</span><small>' + fmtT(it.t) + (late ? ' · missed while the app was closed' : '') + '</small></div>' +
                '<div class="nbrm-b"><button type="button" data-a="dn">Done</button><button type="button" data-a="sn">Snooze 5 min</button><button type="button" data-a="x" class="ghost">Dismiss</button></div></div>'));
        }
        rings[it.id] = 1;
        stopRing();
        ringH = play('r', it.tn && (RT[it.tn] || CT_PRE.test(it.tn)) ? it.tn : snd().r, late ? 6000 : 40000);
        try { if (origNotify) origNotify('Time to study: ' + it.x, fmtT(it.t) + ' · Notes Bazar'); } catch (e) {}
    }
    var lastW = mondayKey();
    function tick() {
        var w = mondayKey();
        if (w !== lastW) { lastW = w; load(); if (NB.ui && NB.ui.refreshAll) NB.ui.refreshAll(); if (NB.isOpen('nbTd')) renderTd(); }
        var o = load(), now = Date.now(), changed = false;
        o.items.forEach(function (it) {
            if (!it.r || it.done || !it.t || it.n) return;
            var at = it.sn || atOf(it);
            if (now < at) return;
            it.n = now; changed = true;
            if (now - at > LATE) return;                   // far too old: just mark it as handled
            fire(it, now - at > 120000);
        });
        if (changed) { LSX.set(KEY, o); }
    }
    setInterval(tick, 15000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') tick(); });
    setTimeout(tick, 2500);
})();

/* =====================================================================
   Bazar AI voice: 15 voice styles (8 female + 7 male, soft / normal / strong), speed control,
   "Listen" engine shared by the chat, and the Live voice assistant.
   Menu: three lines > "Voice & speed".  Uses the phone / PC text-to-speech voices (works offline).
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var $ = function (id) { return document.getElementById(id); };
    var VKEY = 'nb_voice';
    // g = gender, st = style, p = pitch, r = speed multiplier, v = loudness
    var PROFILES = [
        { id: 'f1', n: 'Ananya', g: 'f', st: 'Normal', p: 1.05, r: 1.0, v: .85 },
        { id: 'f2', n: 'Priya', g: 'f', st: 'Soft', p: 1.15, r: .92, v: .6 },
        { id: 'f3', n: 'Riya', g: 'f', st: 'Strong', p: 1.0, r: 1.05, v: 1 },
        { id: 'f4', n: 'Kavya', g: 'f', st: 'Normal', p: 1.25, r: 1.0, v: .85 },
        { id: 'f5', n: 'Meera', g: 'f', st: 'Soft', p: .95, r: .88, v: .55 },
        { id: 'f6', n: 'Neha', g: 'f', st: 'Strong', p: 1.2, r: 1.08, v: 1 },
        { id: 'f7', n: 'Sana', g: 'f', st: 'Normal', p: .9, r: .96, v: .85 },
        { id: 'f8', n: 'Isha', g: 'f', st: 'Soft', p: 1.3, r: .9, v: .6 },
        { id: 'm1', n: 'Arjun', g: 'm', st: 'Normal', p: .95, r: 1.0, v: .85 },
        { id: 'm2', n: 'Rohan', g: 'm', st: 'Strong', p: .85, r: 1.05, v: 1 },
        { id: 'm3', n: 'Vikram', g: 'm', st: 'Strong', p: .7, r: .98, v: 1 },
        { id: 'm4', n: 'Aman', g: 'm', st: 'Soft', p: 1.0, r: .9, v: .6 },
        { id: 'm5', n: 'Karan', g: 'm', st: 'Normal', p: .8, r: 1.0, v: .85 },
        { id: 'm6', n: 'Dev', g: 'm', st: 'Soft', p: .88, r: .88, v: .55 },
        { id: 'm7', n: 'Raj', g: 'm', st: 'Normal', p: .72, r: .95, v: .85 }
    ];
    var FEM = /female|woman|zira|heera|swara|neerja|samantha|priya|veena|kalpana|aria|jenny|sonia|susan|hazel|karen|moira|tessa|fiona|victoria|google (hindi|uk english female|us english)|lekha|kanya|aditi|raveena|sara|natasha|libby|emily|olivia|nova/i;
    var MAL = /\bmale\b|\bman\b|david|mark|hemant|prabhat|ravi|madhur|guy|george|james|daniel|alex|fred|rishi|ryan|eric|brian|christopher|liam|prabhas/i;
    var VOICES = [];
    function ok() { return !!(window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined'); }
    function loadVoices() { try { VOICES = window.speechSynthesis.getVoices() || []; } catch (e) { VOICES = []; } }
    if (ok()) { loadVoices(); try { window.speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) { window.speechSynthesis.onvoiceschanged = loadVoices; } }
    function cfg() {
        var s = {}; try { s = JSON.parse(localStorage.getItem(VKEY) || '{}') || {}; } catch (e) {}
        var id = (PROFILES.some(function (p) { return p.id === s.id; }) || /^v:/.test(String(s.id || ''))) ? s.id : 'f1';
        var sp = typeof s.speed === 'number' ? Math.max(.5, Math.min(1.6, s.speed)) : .95;
        return { id: id, speed: sp };
    }
    function save(patch) { var c = cfg(); for (var k in patch) c[k] = patch[k]; try { localStorage.setItem(VKEY, JSON.stringify(c)); } catch (e) {} }
    function prof(id) { return PROFILES.filter(function (p) { return p.id === id; })[0] || PROFILES[0]; }
    function quality(v) { return /natural|neural|online|google|microsoft|enhanced|premium/i.test(v.name) ? 1 : 0; }
    function pickVoice(p, lang) {
        var pre = lang.slice(0, 2).toLowerCase();
        var pool = VOICES.filter(function (v) { return v.lang && v.lang.replace('_', '-').toLowerCase().indexOf(pre) === 0; });
        if (!pool.length) return null;
        pool.sort(function (a, b) { return quality(b) - quality(a); });
        var same = pool.filter(function (v) { return p.g === 'f' ? (FEM.test(v.name) && !MAL.test(v.name)) : (MAL.test(v.name) && !FEM.test(v.name)); });
        var list = same.length ? same : pool;
        var idx = (+p.id.slice(1) - 1) % list.length;                 // different profiles use different system voices when the device has several
        return list[idx] || list[0];
    }
    /* real Hindi voices installed on this phone / PC (best first): up to 3 girl + 2 boy voices, then any others, max 5 */
    function genderOf(v) { return MAL.test(v.name) && !FEM.test(v.name) ? 'm' : (FEM.test(v.name) ? 'f' : ''); }
    function hiVoices() {
        var pool = VOICES.filter(function (v) { return v.lang && /^hi([-_]|$)/i.test(v.lang); }), out = [], seen = {};
        pool.sort(function (a, b) { return quality(b) - quality(a); });
        function take(g, n) { pool.forEach(function (v) { if (n > 0 && !seen[v.name] && genderOf(v) === g) { seen[v.name] = 1; out.push(v); n--; } }); }
        take('f', 3); take('m', 2);
        pool.forEach(function (v) { if (out.length < 5 && !seen[v.name]) { seen[v.name] = 1; out.push(v); } });
        return out;
    }
    function realVoice(id) { var n = String(id).slice(2), l = VOICES.filter(function (v) { return v.name === n; }); return l[0] || null; }
    function clean(el) {
        var c = el.cloneNode(true);
        c.querySelectorAll('button,a,script,style').forEach(function (n) { n.remove(); });
        c.querySelectorAll('br,li,p,div').forEach(function (n) { n.insertAdjacentText('afterend', '. '); });
        return (c.textContent || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[*_#`>~|]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    var token = 0;
    function stop() { token++; try { if (ok()) window.speechSynthesis.cancel(); } catch (e) {} }
    function say(text, o) {
        o = o || {}; if (!ok() || !text) { if (o.onend) o.onend(); return; }
        stop(); var my = token;
        var c = cfg(), cid = o.id || c.id, real = /^v:/.test(cid) ? realVoice(cid) : null, p = real ? { id: 'f1', g: genderOf(real) || 'f', p: 1, r: 1, v: 1 } : prof(cid), hi = /[ऀ-ॿ]/.test(text), lang = hi ? 'hi-IN' : 'en-IN';
        var voice = real || pickVoice(p, lang);
        var parts = text.match(/[^.!?।]+[.!?।]?/g) || [text], chunks = [], cur = '';
        parts.forEach(function (s) { if ((cur + s).length > 160 && cur) { chunks.push(cur); cur = s; } else cur += s; });
        if (cur.trim()) chunks.push(cur);
        if (o.onstart) o.onstart();
        chunks.forEach(function (t, i) {
            var u = new SpeechSynthesisUtterance(t.trim()); u.lang = voice ? voice.lang : lang; if (voice) u.voice = voice;
            u.pitch = Math.max(.1, Math.min(2, p.p)); u.volume = p.v; u.rate = Math.max(.4, Math.min(2, (o.speed || c.speed) * p.r));
            if (i === chunks.length - 1) u.onend = u.onerror = function () { if (my === token && o.onend) o.onend(); };
            window.speechSynthesis.speak(u);
        });
    }
    NB.voice = { ok: ok, say: say, stop: stop, clean: clean, cfg: cfg, profiles: PROFILES };

    /* ---------- settings dialog ---------- */
    var SAMPLE = 'Hello! I am Bazar AI. Main aapki padhai mein madad karungi. Ask me any doubt.';
    var SAMPLE_M = 'Hello! I am Bazar AI. Main aapki padhai mein madad karunga. Ask me any doubt.';
    function rows(g) {
        var cur = cfg().id;
        return PROFILES.filter(function (p) { return p.g === g; }).map(function (p) {
            var ic = p.st === 'Strong' ? 'fa-volume-high' : p.st === 'Soft' ? 'fa-feather' : 'fa-circle-play';
            return '<button type="button" role="radio" class="nbsn-r nbv-r" data-v="' + p.id + '" aria-checked="' + (p.id === cur) + '"><i class="fa-solid ' + ic + '"></i><span>' + p.n + ' <small>' + p.st + '</small></span><i class="fa-solid fa-check nbsn-ok"></i></button>';
        }).join('');
    }
    function hiRows() {
        var cur = cfg().id, list = hiVoices();
        $('nbVHn').textContent = list.length ? 'These are real Hindi voices installed on your device. Natural / Online voices sound the best.' : 'No Hindi voice found on this device yet. Android: Settings > Language > Text-to-speech > install Hindi voice. Windows: Settings > Time & language > Speech > add Hindi. In Microsoft Edge the free Hindi voices Swara (girl) and Madhur (boy) are built in.';
        return list.map(function (v) {
            var g = genderOf(v), id = 'v:' + v.name, nm = v.name.replace(/^(Microsoft|Google)\s+/i, '').replace(/\s*-\s*.*$/, '').replace(/\s*\((Natural|Online)[^)]*\)/ig, '').trim() || v.name;
            return '<button type="button" role="radio" class="nbsn-r nbv-r" data-v="' + NB.esc(id) + '" aria-checked="' + (id === cur) + '"><i class="fa-solid ' + (g === 'm' ? 'fa-person' : (g === 'f' ? 'fa-person-dress' : 'fa-user')) + '"></i><span>' + NB.esc(nm) + ' <small>' + (g === 'm' ? 'Boy' : (g === 'f' ? 'Girl' : 'Voice')) + (quality(v) ? ' · Natural' : '') + '</small></span><i class="fa-solid fa-check nbsn-ok"></i></button>';
        }).join('');
    }
    function paint() {
        $('nbVH').innerHTML = hiRows();
        $('nbVF').innerHTML = rows('f'); $('nbVM').innerHTML = rows('m');
        var s = cfg().speed; $('nbVSp').value = Math.round(s * 100); $('nbVSo').textContent = s.toFixed(2).replace(/0$/, '') + '×';
    }
    function sample() {
        var id = cfg().id, rv = /^v:/.test(id) ? realVoice(id) : null, g = rv ? genderOf(rv) : prof(id).g;
        if (rv && /^hi/i.test(rv.lang || '')) say(g === 'm' ? '\u0928\u092e\u0938\u094d\u0924\u0947! \u092e\u0948\u0902 \u092c\u091c\u093c\u093e\u0930 AI \u0939\u0942\u0901\u0964 \u092e\u0948\u0902 \u0906\u092a\u0915\u0940 \u092a\u0922\u093c\u093e\u0908 \u092e\u0947\u0902 \u092e\u0926\u0926 \u0915\u0930\u0942\u0901\u0917\u093e\u0964' : '\u0928\u092e\u0938\u094d\u0924\u0947! \u092e\u0948\u0902 \u092c\u091c\u093c\u093e\u0930 AI \u0939\u0942\u0901\u0964 \u092e\u0948\u0902 \u0906\u092a\u0915\u0940 \u092a\u0922\u093c\u093e\u0908 \u092e\u0947\u0902 \u092e\u0926\u0926 \u0915\u0930\u0942\u0901\u0917\u0940\u0964');
        else say(g === 'm' ? SAMPLE_M : SAMPLE);
    }
    function ensure() {
        if ($('nbVoice')) return;
        var m = NB.mk('<div class="nbo" id="nbVoice" aria-hidden="true"><div class="nbo-card nbsn-card" role="dialog" aria-modal="true" aria-labelledby="nbVT">' +
            '<button type="button" class="nbo-x" id="nbVX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '<h3 class="nbo-h" id="nbVT">Voice &amp; speed</h3><p class="nbo-sub">Choose the voice Bazar AI uses when it reads answers aloud and talks in Live mode.</p>' +
            '<div class="nbsn-h"><i class="fa-solid fa-language"></i> Best Hindi voices on this device</div><div class="nbsn-list" id="nbVH" role="radiogroup" aria-label="Hindi voices"></div><p class="nbo-note" id="nbVHn" style="margin-top:4px"></p>' +
            '<div class="nbsn-h"><i class="fa-solid fa-person-dress"></i> Girl voices</div><div class="nbsn-list" id="nbVF" role="radiogroup" aria-label="Girl voices"></div>' +
            '<div class="nbsn-h"><i class="fa-solid fa-person"></i> Boy voices</div><div class="nbsn-list" id="nbVM" role="radiogroup" aria-label="Boy voices"></div>' +
            '<div class="nbsn-h"><i class="fa-solid fa-gauge-high"></i> Speaking speed <output id="nbVSo" class="nbv-so"></output></div>' +
            '<input type="range" id="nbVSp" min="50" max="160" step="5" aria-label="Speaking speed" class="nbsn-v"><div class="nbv-sl"><span>Slow</span><span>Normal</span><span>Fast</span></div>' +
            '<button type="button" class="nbsn-add" id="nbVPlay"><i class="fa-solid fa-play"></i> Play sample</button>' +
            '<p class="nbo-note" id="nbVNote">Voices come from your phone / PC. Soft = quiet and gentle, Normal = clear, Strong = loud. If the sound is not clear, try another voice or lower the speed.</p>' +
            '</div></div>');
        document.body.appendChild(m);
        $('nbVX').addEventListener('click', function () { stop(); NB.close('nbVoice'); });
        NB.onClose.nbVoice = function () { stop(); };
        $('nbVPlay').addEventListener('click', sample);
        $('nbVSp').addEventListener('input', function () { save({ speed: this.value / 100 }); $('nbVSo').textContent = (this.value / 100).toFixed(2).replace(/0$/, '') + '×'; });
        $('nbVSp').addEventListener('change', sample);
        m.addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; save({ id: b.getAttribute('data-v') }); paint(); sample(); });
    }
    NB.openVoice = function () {
        if (NB.closeSiteMenu) NB.closeSiteMenu();
        ensure(); paint();
        if (!ok()) $('nbVNote').textContent = 'This browser cannot read aloud. Please open Notes Bazar in Chrome, Edge or Safari.';
        NB.open('nbVoice');
    };
})();

/* =====================================================================
   Live voice assistant (AI window, right side button): talk, Bazar AI answers by voice, then listens again.
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var $ = function (id) { return document.getElementById(id); };
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var L = { on: false, state: 'idle', rec: null, lang: 'hi-IN', muted: false, tries: 0 };
    var LABEL = { idle: 'Tap the circle to talk', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking… tap to interrupt', muted: 'Mic is off' };
    function build() {
        if ($('nbLive')) return;
        var el = NB.mk('<div id="nbLive" class="nbl" aria-hidden="true" role="dialog" aria-label="Live voice assistant"><div class="nbl-card">' +
            '<div class="nbl-top"><b><i class="fa-solid fa-wave-square"></i> Live with Bazar AI</b><button type="button" class="nbl-x" data-l="close" aria-label="Close live mode"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<button type="button" class="nbl-orb" id="nbLOrb" data-l="orb" aria-label="Talk"><span></span><span></span><i class="fa-solid fa-microphone"></i></button>' +
            '<div class="nbl-st" id="nbLSt" role="status" aria-live="polite"></div>' +
            '<div class="nbl-tx" id="nbLTx"></div>' +
            '<div class="nbl-bar"><button type="button" class="nbl-b" data-l="lang" id="nbLLang"></button><button type="button" class="nbl-b" data-l="mute" id="nbLMute"><i class="fa-solid fa-microphone-slash"></i> Mic off</button><button type="button" class="nbl-b" data-l="voice"><i class="fa-solid fa-sliders"></i> Voice</button><button type="button" class="nbl-b nbl-end" data-l="close"><i class="fa-solid fa-phone-slash"></i> End</button></div>' +
            '</div></div>');
        document.body.appendChild(el);
        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-l]'); if (!b) return; var a = b.getAttribute('data-l');
            if (a === 'close') stopLive();
            else if (a === 'orb') { if (L.state === 'speaking') { NB.voice.stop(); listen(); } else if (L.state === 'idle' || L.state === 'muted') { L.muted = false; listen(); } else if (L.state === 'listening') { try { L.rec && L.rec.stop(); } catch (x) {} } }
            else if (a === 'lang') { L.lang = L.lang === 'hi-IN' ? 'en-IN' : 'hi-IN'; paintBar(); if (L.state === 'listening') { abortRec(); listen(); } }
            else if (a === 'mute') { L.muted = !L.muted; if (L.muted) { abortRec(); NB.voice.stop(); setState('muted'); } else listen(); paintBar(); }
            else if (a === 'voice') { NB.openVoice(); $('nbVoice').style.zIndex = 90; }
        });
    }
    function paintBar() {
        $('nbLLang').innerHTML = '<i class="fa-solid fa-language"></i> ' + (L.lang === 'hi-IN' ? 'हिंदी / Hinglish' : 'English');
        $('nbLMute').innerHTML = L.muted ? '<i class="fa-solid fa-microphone"></i> Mic on' : '<i class="fa-solid fa-microphone-slash"></i> Mic off';
    }
    function setState(s) { L.state = s; var o = $('nbLOrb'); if (!o) return; o.className = 'nbl-orb ' + s; $('nbLSt').textContent = LABEL[s] || ''; }
    function abortRec() { var r = L.rec; L.rec = null; if (r) { r.onend = r.onerror = r.onresult = null; try { r.abort(); } catch (e) {} } }
    function listen() {
        if (!L.on || L.muted) return;
        if (!SR) { NB.toast('Live voice needs Chrome, Edge or Safari.', 4000); stopLive(); return; }
        abortRec(); NB.voice.stop();
        var r = new SR(), got = '', finalText = '';
        r.lang = L.lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        r.onresult = function (e) {
            var t = '', f = '';
            for (var i = e.resultIndex; i < e.results.length; i++) { var x = e.results[i][0].transcript; if (e.results[i].isFinal) f += x; else t += x; }
            if (f) finalText += f; got = (finalText + t).trim(); $('nbLTx').textContent = got; L.tries = 0;
        };
        r.onerror = function (e) {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { NB.toast('Please allow the microphone to talk with Bazar AI.', 5000); stopLive(); }
        };
        r.onend = function () {
            if (L.rec !== r) return; L.rec = null;
            var q = (finalText || got).trim();
            if (q) send(q);
            else if (L.on && !L.muted) { L.tries++; if (L.tries > 4) { L.tries = 0; setState('idle'); } else setTimeout(listen, 250); }
        };
        L.rec = r; setState('listening'); $('nbLTx').textContent = '';
        try { r.start(); } catch (e) { setTimeout(listen, 400); }
    }
    async function send(q) {
        setState('thinking'); $('nbLTx').textContent = '“' + q + '”';
        var chat = $('aiChatHistory'), before = chat ? chat.querySelectorAll('.nb-say').length : 0;
        window.NB_LIVE = true;
        try { await window.sendAiMessage(q); } catch (e) {}
        window.NB_LIVE = false;
        if (!L.on) return;
        var all = chat ? chat.querySelectorAll('.nb-say') : [], last = all.length > before ? all[all.length - 1] : null;
        var text = last ? NB.voice.clean(last) : '';
        if (!text) { listen(); return; }
        setState('speaking');
        NB.voice.say(text, { onend: function () { if (L.on && L.state === 'speaking') listen(); } });
    }
    function stopLive() {
        L.on = false; abortRec(); NB.voice.stop(); setState('idle'); window.NB_LIVE = false;
        var el = $('nbLive'); if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
    }
    NB.live = { stop: stopLive, isOn: function () { return L.on; } };
    NB.openLive = function () {
        if (!SR) { NB.toast('Live voice needs Chrome, Edge or Safari. Your browser does not support it.', 4500); return; }
        build(); L.on = true; L.muted = false; L.tries = 0; paintBar();
        $('nbLive').classList.add('open'); $('nbLive').setAttribute('aria-hidden', 'false'); $('nbLTx').textContent = '';
        listen();
    };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && L.on) stopLive(); });
})();

/* =====================================================================
   Admin > Appearance > website layout: show only 6 designs, "See more" reveals the rest below (no overlap)
   ===================================================================== */
(function () {
    'use strict';
    var SHOW = 6, busy = false, t = 0;
    function same(el) { var k = el.children, n = k.length, i; if (n < SHOW + 2) return false; for (i = 1; i < n; i++) if (k[i].tagName !== k[0].tagName) return false; return true; }
    function find(panel) {
        var best = null, score = 0, all = panel.querySelectorAll('*'), i;
        for (i = 0; i < all.length; i++) {
            var el = all[i]; if (!same(el) || el.hasAttribute('data-nbmore-btn')) continue;
            var n = el.children.length, sc = n, ctx = '', p = el, d = 0;
            while (p && p !== panel && d < 4) { ctx += ' ' + (p.previousElementSibling ? p.previousElementSibling.textContent : '') + ' ' + (p.getAttribute('aria-label') || ''); p = p.parentElement; d++; }
            if (/layout|design/i.test(ctx)) sc += 40;
            if (n >= 20 && n <= 26) sc += 25; if (n === 23) sc += 25;
            if (el.querySelector('input[type="color"]')) sc -= 40;
            if (sc > score) { score = sc; best = el; }
        }
        return score >= 30 ? best : null;
    }
    function apply(panel) {
        var g = find(panel); if (!g) return;
        var kids = Array.prototype.slice.call(g.children), open = g.getAttribute('data-nbmore') === 'open';
        g.setAttribute('data-nbmore', open ? 'open' : 'closed');
        kids.forEach(function (k, i) { k.classList.toggle('nbmore-h', !open && i >= SHOW); });
        var b = g.nextElementSibling && g.nextElementSibling.hasAttribute('data-nbmore-btn') ? g.nextElementSibling : null;
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.className = 'nbmore-btn'; b.setAttribute('data-nbmore-btn', '1');
            b.addEventListener('click', function () {
                var o = g.getAttribute('data-nbmore') === 'open', ks = Array.prototype.slice.call(g.children);
                g.setAttribute('data-nbmore', o ? 'closed' : 'open');
                ks.forEach(function (k, i) { if (i >= SHOW) { k.classList.toggle('nbmore-h', o); if (!o) { k.classList.remove('nbmore-in'); void k.offsetWidth; k.classList.add('nbmore-in'); } } });
                label(b, g, !o);
            });
            g.parentNode.insertBefore(b, g.nextSibling);
        }
        label(b, g, open);
    }
    function label(b, g, open) { var n = g.children.length - SHOW; b.setAttribute('aria-expanded', String(open)); b.innerHTML = open ? '<i class="fa-solid fa-chevron-up"></i> Show less' : 'See more (' + n + ' more) <i class="fa-solid fa-chevron-down"></i>'; }
    function run() { var panel = document.getElementById('adminPanel-appearance'); if (!panel || busy) return; busy = true; try { apply(panel); } catch (e) { console.warn('layout see-more', e); } setTimeout(function () { busy = false; }, 0); }
    function init() {
        var panel = document.getElementById('adminPanel-appearance'); if (!panel) return;
        new MutationObserver(function () { if (busy) return; clearTimeout(t); t = setTimeout(run, 60); }).observe(panel, { childList: true, subtree: true });
        run();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* =====================================================================
   Navigation helpers: back arrow on every dialog, full screen preview,
   and "My PDFs" shortcut inside My Downloads
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var $ = function (id) { return document.getElementById(id); };
    var par = {}, lastClosed = { id: '', t: 0 }, backing = false;
    var _open = NB.open, _close = NB.close;

    /* ---- remember which dialog was open before (so "back" returns to it) ---- */
    NB.close = function (id) { var was = NB.isOpen(id); _close.apply(NB, arguments); if (was) lastClosed = { id: id, t: Date.now() }; };
    NB.open = function (id) {
        var m = $(id), opens, cand = null;
        if (m && !backing && !m.classList.contains('open')) {
            opens = [].slice.call(document.querySelectorAll('.nbo.open')).map(function (e) { return e.id; }).filter(function (x) { return x && x !== id; });
            if (opens.length) cand = opens[opens.length - 1];
            else if (lastClosed.id && lastClosed.id !== id && Date.now() - lastClosed.t < 700) cand = lastClosed.id;
            par[id] = cand;
        }
        _open.apply(NB, arguments);
        if (m) decorate(m);
    };
    NB.parentOf = function (id) { return par[id] || null; };
    function reopen(p) {
        backing = true;
        try { if (p === 'nbPm' && NB.openPdfMaker) NB.openPdfMaker(); else if (p === 'nbMy' && NB.openMyPdfs) NB.openMyPdfs(); else NB.open(p); } finally { backing = false; }
    }
    function goBack(m) {
        var id = m.id, card = m.querySelector('.nbo-card') || m, inner = id === 'nbMy' ? null : card.querySelector('.np-back'), x, p;
        if (inner) { inner.click(); return; }                    // sub-screens have their own "back" (result -> form, form -> AI PDF Maker)
        x = m.querySelector('.nbo-x'); p = par[id];
        if (x) x.click(); else NB.close(id);
        if (p && $(p) && !NB.isOpen(id)) reopen(p);
    }
    function decorate(m) {
        if (!m || m.__bk || !m.classList.contains('nbo')) return;
        var x = m.querySelector('.nbo-x'), b;
        if (!x || NB.noClose[m.id] || m.querySelector('.nbo-sm')) return;
        if (m.querySelector('.np-back')) return;                 // this screen already has its own back arrow: keep only that one
        b = document.createElement('button'); b.type = 'button'; b.className = 'nbo-bk'; b.setAttribute('aria-label', 'Back'); b.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
        b.addEventListener('click', function (e) { e.stopPropagation(); goBack(m); });
        x.parentNode.insertBefore(b, x); m.__bk = 1;
    }
    function decorateAll() {
        [].forEach.call(document.querySelectorAll('.nbo'), function (m) {
            var bk = m.querySelector('.nbo-bk');
            if (m.querySelector('.np-back')) { if (bk) bk.parentNode.removeChild(bk); m.__bk = 0; return; }   // inner screen came in: drop the extra arrow
            decorate(m);
        });
    }

    /* ---- same back arrow for the Tailwind dialogs of index.html ---- */
    var TW = ['themeModal', 'langModal', 'settingsModal', 'previewModal', 'aiModal', 'wishModal', 'supportModal', 'complainModal', 'savedModal', 'aboutModal', 'downloadsModal', 'safePreviewModal', 'rulesHelpModal'];
    function twDecorate() {
        TW.forEach(function (id) {
            var m = $(id), c, h, b;
            if (!m || m.__bk) return;
            c = m.querySelector('[onclick*="closeModal(\'' + id + '\')"],[onclick*="closeSafePreview"]');
            if (!c) return;
            h = c.closest('.justify-between'); if (!h || !m.contains(h)) return;
            b = document.createElement('button'); b.type = 'button'; b.className = 'nb-bk-tw'; b.setAttribute('aria-label', 'Back'); b.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
            b.addEventListener('click', function (e) { e.stopPropagation(); c.click(); });
            h.insertBefore(b, h.firstChild); m.__bk = 1;
        });
    }

    /* ---- full screen viewer (works for PDFs in an iframe and for the made notes / papers) ---- */
    var fsKey = null, fsOv = null, fsOverflow = '';
    NB.fullscreen = function (o) {
        var ov, c, pg, req;
        NB.closeFullscreen();
        ov = document.createElement('div'); ov.className = 'nb-fso'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
        ov.innerHTML = '<div class="nb-fsbar"><span class="nb-fst"></span><button type="button" class="nb-fsb" data-k="x" aria-label="Close full screen"><i class="fa-solid fa-down-left-and-up-right-to-center"></i> Close full screen</button></div><div class="nb-fsc"></div>';
        ov.querySelector('.nb-fst').textContent = o.title || '';
        c = ov.querySelector('.nb-fsc');
        if (o.src) { var f = document.createElement('iframe'); f.src = o.src; f.title = o.title || 'Preview'; f.setAttribute('allowfullscreen', ''); c.appendChild(f); }
        else if (o.node) { pg = document.createElement('div'); pg.className = 'nb-fspage'; pg.appendChild(o.node); c.appendChild(pg); }
        ov.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-k="x"]')) NB.closeFullscreen(); });
        fsOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
        document.body.appendChild(ov); fsOv = ov;
        try { req = ov.requestFullscreen || ov.webkitRequestFullscreen; if (req) { var pr = req.call(ov); if (pr && pr.catch) pr.catch(function () {}); } } catch (e) {}   // real full screen where the browser allows it; the overlay already fills the page otherwise
    };
    NB.closeFullscreen = function () {
        var ov = fsOv; if (!ov) return;
        fsOv = null;
        try { var fe = document.fullscreenElement || document.webkitFullscreenElement; if (fe) { var ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) { var pr = ex.call(document); if (pr && pr.catch) pr.catch(function () {}); } } } catch (e) {}
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        document.body.style.overflow = fsOverflow;
    };
    document.addEventListener('fullscreenchange', function () { if (fsOv && !document.fullscreenElement) NB.closeFullscreen(); });   // user pressed Esc / system back in real full screen
    document.addEventListener('webkitfullscreenchange', function () { if (fsOv && !document.webkitFullscreenElement) NB.closeFullscreen(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fsOv) { e.stopImmediatePropagation(); NB.closeFullscreen(); } }, true);

    function prevButtons() {                                      // "Full screen" button above every made notes / paper preview
        [].forEach.call(document.querySelectorAll('.nbqp-prev:not([data-fs])'), function (pv) {
            var row = document.createElement('div'), b = document.createElement('button');
            pv.setAttribute('data-fs', '1'); row.className = 'nbp-fsrow';
            b.type = 'button'; b.className = 'nbo-mini'; b.innerHTML = '<i class="fa-solid fa-expand"></i> Full screen';
            b.addEventListener('click', function () {
                var src = pv.firstElementChild; if (!src) return;
                var n = src.cloneNode(true), h = pv.parentNode && pv.parentNode.querySelector('.nbo-h');
                [].forEach.call(n.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
                NB.fullscreen({ node: n, title: h ? h.textContent.trim() : 'Preview' });
            });
            row.appendChild(b); pv.parentNode.insertBefore(row, pv);
        });
    }
    function frameButtons() {                                     // "Full screen" button on the PDF preview of notes / downloaded files
        ['previewContentContainer', 'safePrevBody'].forEach(function (cid) {
            var c = $(cid); if (!c) return;
            [].forEach.call(c.querySelectorAll('iframe:not([data-fs])'), function (f) {
                var w = f.parentNode, b = document.createElement('button'), t = $(cid === 'safePrevBody' ? 'safePrevTitle' : 'previewTitle');
                f.setAttribute('data-fs', '1'); w.classList.add('nb-fsw');
                b.type = 'button'; b.className = 'nb-fsbtn'; b.innerHTML = '<i class="fa-solid fa-expand"></i> Full screen';
                b.addEventListener('click', function () { NB.fullscreen({ src: f.src, title: t ? t.textContent.trim() : 'Preview' }); });
                w.appendChild(b);
            });
        });
    }

    /* ---- "My PDFs" inside My Downloads ---- */
    function myPdfCount() { try { var a = JSON.parse(localStorage.getItem('nb_my_pdfs') || '[]'); return Array.isArray(a) ? a.length : 0; } catch (e) { return 0; } }
    function updMyN() { var e = $('dlMyPdfN'); if (e) { var n = myPdfCount(); e.textContent = n ? '(' + n + ')' : ''; } }
    function wrapDownloads() {
        if (window.openDownloads && !window.openDownloads.__nb) {
            var o = window.openDownloads;
            window.openDownloads = function () { updMyN(); return o.apply(this, arguments); };
            window.openDownloads.__nb = 1; return true;
        }
        return !!(window.openDownloads && window.openDownloads.__nb);
    }

    function tick() { decorateAll(); twDecorate(); prevButtons(); frameButtons(); }
    function init() {
        tick(); updMyN();
        var t = null, n = 0, w = setInterval(function () { if (wrapDownloads() || ++n > 40) clearInterval(w); }, 250);
        new MutationObserver(function () { clearTimeout(t); t = setTimeout(tick, 70); }).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


/* =====================================================================
   Account gate: until the student has an account, every tap / search /
   download shows the sign-up (or log in) page again. Skipping or closing
   the page only hides it; the next tap brings it back.
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {}, last = 0;
    var FREE = '#nbAuth,#splash,#nbToast,#adminLoginModal,#adminDashboardModal,#uploadModal,#editItemModal,#adminReplyModal,#rulesHelpModal,#pwaBar,#offlinePill';
    function isAdmin() { return /admin/i.test(location.hash || ''); }
    function blocked(t) {
        if (!t || !t.closest) return false;
        if (NB.loggedIn && NB.loggedIn()) return false;
        if (!window.__nbReady && !document.getElementById('nbAuth')) return false;   // page is still starting
        if (isAdmin()) return false;
        if (t.closest(FREE)) return false;
        return !!t.closest('a,button,input,select,textarea,label,summary,[onclick],[role="button"],[tabindex],.card,[data-id],#aiFab,[data-nav],nav,header,main,section');
    }
    function ask(e) {
        e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (x) {}
        if (NB.isOpen && NB.isOpen('nbAuth')) return;
        if (Date.now() - last < 350) return; last = Date.now();
        if (NB.ui && NB.ui.openAuth) { NB.ui.openAuth('signup'); if (NB.toast) NB.toast('Create your free account to use Notes Bazar 🔐', 2600); }
    }
    ['click', 'pointerdown', 'submit', 'focusin', 'keydown'].forEach(function (ev) {
        document.addEventListener(ev, function (e) {
            if (ev === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
            if (blocked(e.target)) ask(e);
        }, true);
    });
})();


/* =====================================================================
   One streak for everything: opening the app, Bazar AI questions, tests, AI notes / papers,
   PDF downloads and note downloads. Header fire icon -> streak page with the full history.
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var $ = function (id) { return document.getElementById(id); };
    var KIND = { visit: ['👋', 'Opened Notes Bazar'], chat: ['🤖', 'Asked Bazar AI'], test: ['📝', 'Took a test'], aitest: ['✨', 'Took an AI test'], notes: ['📒', 'Made AI notes'], paper: ['📄', 'Made a question paper'], pdf: ['📥', 'Downloaded a PDF'], dl: ['⬇️', 'Downloaded a note'] };
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function readAct() { try { var a = JSON.parse(localStorage.getItem('nb_act') || '{}'); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; } catch (e) { return {}; } }
    function logAct(kind) {
        var k = NB.dayKey(), a = readAct(), d = a[k] || (a[k] = {}), ks;
        d[kind] = kind === 'visit' ? 1 : (d[kind] || 0) + 1;
        ks = Object.keys(a).sort(); while (ks.length > 120) delete a[ks.shift()];
        try { localStorage.setItem('nb_act', JSON.stringify(a)); } catch (e) {}
    }
    var base = NB.markDay;
    NB.markDay = function (kind) { base.call(NB); logAct(kind || 'visit'); NB.paintStreakCard(); };
    function parse(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
    NB.bestStreak = function () {
        var d = NB.days().filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); }).sort(), best = 0, run = 0, prev = null;
        d.forEach(function (k) { var t = parse(k).getTime(); run = prev !== null && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; prev = t; if (run > best) best = run; });
        return Math.max(best, NB.streak());
    };
    function totals() {
        var a = readAct(), t = {}, n = 0;
        Object.keys(a).forEach(function (d) { Object.keys(a[d]).forEach(function (k) { t[k] = (t[k] || 0) + (+a[d][k] || 0); }); });
        var dl = 0, qz = 0, my = 0;
        try { dl = Object.keys(JSON.parse(localStorage.getItem('nb_dlhist') || '{}')).length; } catch (e) {}
        try { qz = (JSON.parse(localStorage.getItem('nb_quiz') || '[]') || []).length; } catch (e) {}
        try { my = (JSON.parse(localStorage.getItem('nb_my_pdfs') || '[]') || []).length; } catch (e) {}
        return { act: t, dl: dl, tests: qz, made: my, days: NB.days().length };
    }
    function level(c) { return c === 0 ? '' : c < 2 ? 'l1' : c < 4 ? 'l2' : c < 7 ? 'l3' : 'l4'; }
    function dayLabel(k) { var d = parse(k), t = NB.dayKey(), y = NB.dayKey(new Date(Date.now() - 864e5)); return k === t ? 'Today' : k === y ? 'Yesterday' : DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()]; }
    function msg(n) { return n === 0 ? 'Do one thing today to start your streak!' : n < 3 ? 'Nice start! Come back tomorrow 💪' : n < 7 ? 'You are on fire! Keep going 🔥' : n < 15 ? 'One week done, legend! 🏆' : 'Unstoppable! You are a topper in the making 🚀'; }

    /* ---- home card ---- */
    NB.paintStreakCard = function () {
        var old = $('nbStreakCard'); if (old) old.remove();   // the streak now lives in the header chip only; History opens from there
        return;
        var home = $('homeView'), plan = $('nbPlan'); if (!home || !plan) return;
        var c = $('nbStreakCard');
        if (!c) {
            c = document.createElement('section'); c.id = 'nbStreakCard'; c.className = 'nbs nbst-home'; c.setAttribute('aria-label', 'Your streak');
            c.innerHTML = '<div class="nbs-in"><button type="button" class="nbst-card" id="nbStreakGo"></button></div>';
            plan.parentNode.insertBefore(c, plan);
            $('nbStreakGo').addEventListener('click', function () { NB.openStreak(); });
        }
        var n = NB.streak(), t = totals();
        $('nbStreakGo').innerHTML = '<span class="nbst-fire' + (n > 0 ? ' on' : '') + '">🔥</span><span class="nbst-tx"><b>' + n + (n === 1 ? ' day streak' : ' day streak') + '</b><small>Best ' + NB.bestStreak() + ' · ' + t.days + ' active days · ' + (t.dl + t.tests + t.made) + ' downloads, tests &amp; PDFs</small></span><span class="nbst-go">History <i class="fa-solid fa-chevron-right"></i></span>';
    };
    var hw = 0; hw = setInterval(function () { if ($('nbPlan')) { NB.paintStreakCard(); clearInterval(hw); } }, 700); setTimeout(function () { clearInterval(hw); }, 15000);
    var op = NB.paintStreak; NB.paintStreak = function () { op.call(NB); try { NB.paintStreakCard(); } catch (e) {} };

    /* ---- streak page ---- */
    var scr = null;
    NB.openStreak = function () {
        if (scr) return;
        var n = NB.streak(), best = NB.bestStreak(), t = totals(), act = readAct(), set = {}, i, d, h = '';
        NB.days().forEach(function (k) { set[k] = 1; });
        var now = new Date(), wd = (now.getDay() + 6) % 7, week = '';          // week starts on Monday
        for (i = 0; i < 7; i++) { d = new Date(now.getTime() + (i - wd) * 864e5); var k = NB.dayKey(d), on = !!set[k], fut = i > wd; week += '<div class="nbst-wd' + (on ? ' on' : '') + (i === wd ? ' now' : '') + (fut ? ' fut' : '') + '"><span>' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i] + '</span><i>' + (on ? '🔥' : (fut ? '' : '·')) + '</i></div>'; }
        var cal = '';
        for (i = 69; i >= 0; i--) { d = new Date(now.getTime() - i * 864e5); var kk = NB.dayKey(d), a = act[kk] || {}, c = Object.keys(a).reduce(function (s2, q) { return s2 + (+a[q] || 0); }, 0) || (set[kk] ? 1 : 0); cal += '<i class="nbst-sq ' + level(c) + '" title="' + dayLabel(kk) + (c ? ': ' + c + ' activities' : '') + '"></i>'; }
        var keys = {}; Object.keys(act).forEach(function (x) { keys[x] = 1; }); Object.keys(set).forEach(function (x) { keys[x] = 1; });
        var list = Object.keys(keys).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); }).sort().reverse().slice(0, 60);
        var hist = list.map(function (k) {
            var a = act[k] || {}, ch = Object.keys(a).filter(function (q) { return KIND[q]; }).map(function (q) { return '<span>' + KIND[q][0] + ' ' + NB.esc(KIND[q][1]) + (a[q] > 1 ? ' ×' + a[q] : '') + '</span>'; }).join('');
            return '<div class="nbst-h"><b>' + NB.esc(dayLabel(k)) + '</b><div>' + (ch || '<span>👋 Opened Notes Bazar</span>') + '</div></div>';
        }).join('') || '<p class="nbst-none">No activity yet. Open a note, ask Bazar AI or take a test to start your streak!</p>';
        var A = t.act, tile = function (ic, v, l) { return '<div><i>' + ic + '</i><b>' + v + '</b><small>' + l + '</small></div>'; };
        scr = document.createElement('div'); scr.className = 'nbst-screen'; scr.setAttribute('role', 'dialog'); scr.setAttribute('aria-label', 'Streak history');
        scr.innerHTML = '<div class="nbst-top"><button type="button" class="nbst-back" data-a="x" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button><b>Your streak</b><span></span></div>' +
            '<div class="nbst-body"><div class="nbst-hero"><div class="nbst-big">🔥</div><div class="nbst-num">' + n + '</div><div class="nbst-lbl">day streak</div><p>' + msg(n) + '</p></div>' +
            '<div class="nbst-stats"><div><b>' + best + '</b><small>Best streak</small></div><div><b>' + t.days + '</b><small>Active days</small></div><div><b>' + (n > 0 ? 'Yes' : 'No') + '</b><small>Done today</small></div></div>' +
            '<h4>This week</h4><div class="nbst-week">' + week + '</div>' +
            '<h4>Last 10 weeks</h4><div class="nbst-cal">' + cal + '</div>' +
            '<h4>Overall</h4><div class="nbst-tiles">' + tile('🤖', A.chat || 0, 'AI questions') + tile('📝', (t.tests || 0), 'Tests taken') + tile('✨', A.aitest || 0, 'AI tests') + tile('📒', (A.notes || 0) + (A.paper || 0), 'AI notes &amp; papers') + tile('📥', A.pdf || 0, 'PDF downloads') + tile('⬇️', t.dl, 'Notes downloaded') + '</div>' +
            '<h4>History</h4><div class="nbst-hist">' + hist + '</div>' +
            '<div class="nbst-how"><b>How to keep the streak</b><span>Do any one of these every day: open Notes Bazar, ask Bazar AI, take a test, make AI notes or a paper, download a PDF or a note.</span></div></div>';
        document.body.appendChild(scr); scr.__ov = document.body.style.overflow; document.body.style.overflow = 'hidden';
        scr.addEventListener('click', function (e) { if (e.target.closest('[data-a="x"]')) NB.closeStreak(); });
    };
    NB.closeStreak = function () { if (!scr) return; document.body.style.overflow = scr.__ov || ''; scr.remove(); scr = null; };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && scr) NB.closeStreak(); });
    NB.paintStreak();
})();
