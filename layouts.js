/* =====================================================================
   Notes Bazar - layouts.js
   1) Website layouts: admin picks one, it is saved in Firebase
      (notes_bazar_layout) and applied for every visitor.
   2) Delete account: student deletes own account (profile page),
      admin deletes any student (Admin > View Users).
   Needs: extras.js (NB), admin.js (NBAdmin), app.js (NBA).
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var DB = 'https://notes-market-d309b-default-rtdb.firebaseio.com';
    var FB = 'https://www.gstatic.com/firebasejs/10.8.0/';
    var LAYOUTS = [
        { id: 'classic', n: 'Classic (current)', d: 'Your original Notes Bazar look.', sw: 'linear-gradient(135deg,#6366f1,#7c3aed)' },
        { id: 'glass', n: 'Apple Glassmorphism', d: 'Floating glass header, soft gradient, rounded footer card.', sw: 'linear-gradient(135deg,#dfe7ff,#f3e8ff)' },
        { id: 'dark', n: 'Dark Modern', d: 'Dark neon header, centered glow footer.', sw: 'linear-gradient(135deg,#0b0d1c,#7c5cff)' },
        { id: 'grad', n: 'Gradient Dream', d: 'Full gradient header, curved 4-column footer.', sw: 'linear-gradient(90deg,#6d28d9,#c026d3)' },
        { id: 'min', n: 'Minimal Clean', d: 'White, thin green lines, one-line footer.', sw: 'linear-gradient(135deg,#ffffff,#bbf7d0)' },
        { id: 'eleg', n: 'Elegant Premium', d: 'Centered serif header, gold-brown footer.', sw: 'linear-gradient(135deg,#fffaf0,#d4a017)' }
    ];
    var OK = {}; LAYOUTS.forEach(function (l) { OK[l.id] = 1; });
    var H = document.documentElement;
    var live = 'classic', pick = 'classic';
    function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function toast(m, ms) { if (window.nbToast) window.nbToast(m, ms || 3000); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    /* ---------------- footer per layout ---------------- */
    var footer = document.getElementById('nbFooter'), footerOrig = footer ? footer.innerHTML : '';
    var LOGO = '<svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><use href="#nbLogo"/></svg>';
    function lk(view, t) { return '<button type="button" onclick="switchView(\'' + view + '\')">' + t + '</button>'; }
    var LINKS = lk('home', 'Home') + lk('notes', 'Notes') + lk('books', 'Books') + lk('pyq', 'PYQ');
    var COPY = '<div class="lxf-copy">&copy; 2026 Notes Bazar. All rights reserved.</div>';
    function footerHTML(id) {
        var brand = '<div class="lxf-brand">' + LOGO + 'Notes Bazar</div>';
        var about = '<div>' + brand + '<p>Free Class 1-12 notes, books and previous year questions.</p></div>';
        var explore = '<div><h4>Explore</h4>' + LINKS + '</div>';
        var study = '<div><h4>Study material</h4><span class="lxl">Class 1-12 notes</span><span class="lxl">Reference books</span><span class="lxl">Previous year questions</span></div>';
        var care = '<div><h4>Made for students</h4><span class="lxl">Browse, preview and download in one place.</span></div>';
        if (id === 'glass') return '<div class="lxf-grid">' + about + explore + study + '</div>' + COPY;
        if (id === 'dark') return '<div class="lxf-center">' + brand + '<div class="lxf-row">' + LINKS + '</div>' + COPY + '</div>';
        if (id === 'grad' || id === 'eleg') return '<div class="lxf-grid">' + about + explore + study + care + '</div>' + COPY;
        if (id === 'min') return '<div class="lxf-line"><span>&copy; 2026 Notes Bazar</span><span class="lxf-row" style="margin:0">' + LINKS + '</span></div>';
        return footerOrig;
    }

    /* ---------------- apply a layout ---------------- */
    function apply(id, persist) {
        if (!OK[id]) id = 'classic';
        H.setAttribute('data-layout', id);
        if (id === 'dark') H.classList.add('dark');
        else if (id !== 'classic') H.classList.remove('dark');
        else { var d = ls('nb_dark'); if (d === null) d = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? '1' : '0'; H.classList.toggle('dark', d === '1'); }
        if (footer) footer.innerHTML = footerHTML(id);
        if (persist) lsSet('nb_layout', id);
    }
    function loadLive() {
        return fetch(DB + '/notes_bazar_layout.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (v) { var id = v && OK[v.id] ? v.id : 'classic'; live = pick = id; apply(id, true); return id; })
            .catch(function () { var c = ls('nb_layout'); live = pick = OK[c] ? c : 'classic'; apply(live, false); });
    }
    apply(OK[ls('nb_layout')] ? ls('nb_layout') : 'classic', false);
    loadLive();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loadLive(); });

    /* ---------------- admin: Website layout card ---------------- */
    function adminToken() { return window.NBA && window.NBA.token ? window.NBA.token() : Promise.resolve(''); }
    function emailOf(tok) { try { return JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch (e) { return ''; } }
    function rules(em) {
        em = em || 'YOUR_ADMIN_EMAIL';
        return '"notes_bazar_layout": {\n  ".read": true,\n  ".write": "auth != null && auth.token.email === \'' + em + '\'"\n},\n' +
            '"notes_bazar_deleted": {\n  "$uid": {\n    ".read": "auth != null && (auth.uid === $uid || auth.token.email === \'' + em + '\')",\n    ".write": "auth != null && auth.token.email === \'' + em + '\'"\n  }\n},\n' +
            '"notes_bazar_users": {\n  ".read": "auth != null && auth.token.email === \'' + em + '\'",\n  "$uid": {\n    ".read": "auth != null && auth.uid === $uid",\n    ".write": "auth != null && (auth.uid === $uid || auth.token.email === \'' + em + '\')"\n  }\n}';
    }
    function cardHTML() {
        return '<section class="a-card" id="lxCard" style="margin-bottom:18px"><div class="a-ch"><h3><i class="fa-solid fa-table-columns"></i> Website layout</h3></div>' +
            '<p style="margin:0;font-size:13.5px;line-height:1.55;opacity:.8">Choose a complete design (header, footer and page style). Click a card to preview it here, then publish &mdash; all students will see the published layout.</p>' +
            '<div class="lx-grid">' + LAYOUTS.map(function (l) {
                return '<button type="button" class="lx-card' + (pick === l.id ? ' sel' : '') + '" onclick="NBLayout.choose(\'' + l.id + '\')" aria-pressed="' + (pick === l.id) + '"><div class="lx-sw" style="background:' + l.sw + '"><i></i><u></u></div><b>' + esc(l.n) + (live === l.id ? '<span class="lx-live">Live</span>' : '') + '</b><small>' + esc(l.d) + '</small></button>';
            }).join('') + '</div>' +
            '<button type="button" class="a-btn pri" id="lxPub" onclick="NBLayout.publish()"' + (pick === live ? ' disabled' : '') + '><i class="fa-solid fa-cloud-arrow-up"></i>' + (pick === live ? 'Already live' : 'Publish to all students') + '</button><span class="lx-msg" id="lxMsg"></span>' +
            '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:13px">One-time Firebase rules (needed for publish and delete)</summary><div class="lx-rule" id="lxRule">' + esc(rules('')) + '</div><button type="button" class="a-btn sm" style="margin-top:8px" onclick="NBLayout.copyRules()"><i class="fa-regular fa-copy"></i>Copy rules</button></details></section>';
    }
    function mount() {
        var host = document.getElementById('adminPanel-appearance'); if (!host) return;
        var old = document.getElementById('lxCard'); if (old) old.remove();
        host.insertAdjacentHTML('afterbegin', cardHTML());
        adminToken().then(function (t) { var em = emailOf(t), r = document.getElementById('lxRule'); if (r && em) r.textContent = rules(em); });
    }
    function say(m, bad) { var e = document.getElementById('lxMsg'); if (e) { e.textContent = m; e.style.color = bad ? '#e11d48' : '#16a34a'; } }
    var API = window.NBLayout = {
        list: LAYOUTS,
        choose: function (id) { if (!OK[id]) return; pick = id; apply(id, false); mount(); },
        publish: async function () {
            var b = document.getElementById('lxPub'); if (b) b.disabled = true;
            try {
                var tok = await adminToken(); if (!tok) throw new Error('Please log in as admin first.');
                var r = await fetch(DB + '/notes_bazar_layout.json?auth=' + encodeURIComponent(tok), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pick, at: Date.now() }) });
                if (!r.ok) { var er = new Error('HTTP ' + r.status); er.status = r.status; throw er; }
                live = pick; lsSet('nb_layout', live); mount(); say('Published. Students will see it on their next load.'); toast('Layout published ✓');
            } catch (e) {
                if (b) b.disabled = false;
                say((e.status === 401 || e.status === 403) ? 'Firebase blocked the save. Open "One-time Firebase rules", paste them in Realtime Database > Rules, publish, then try again.' : (e.message || 'Could not publish.'), true);
            }
        },
        copyRules: function () { var t = (document.getElementById('lxRule') || {}).textContent || ''; try { navigator.clipboard.writeText(t).then(function () { toast('Rules copied ✓'); }); } catch (e) { prompt('Copy these rules:', t); } },
        adminDelete: async function (uid, name) {
            if (!confirm('Delete the account of "' + name + '"? Their saved data is removed and they can no longer log in. This cannot be undone.')) return;
            try {
                var tok = await adminToken(); if (!tok) throw new Error('Please log in as admin first.');
                var q = '?auth=' + encodeURIComponent(tok);
                var f = await fetch(DB + '/notes_bazar_deleted/' + encodeURIComponent(uid) + '.json' + q, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at: Date.now(), name: String(name || '').slice(0, 40) }) });
                if (!f.ok) { var e1 = new Error('HTTP ' + f.status); e1.status = f.status; throw e1; }
                var d = await fetch(DB + '/notes_bazar_users/' + encodeURIComponent(uid) + '.json' + q, { method: 'DELETE' });
                if (!d.ok) { var e2 = new Error('HTTP ' + d.status); e2.status = d.status; throw e2; }
                toast('Account deleted ✓'); if (window.NBAdmin && NBAdmin.reloadUsers) NBAdmin.reloadUsers();
            } catch (e) {
                alert((e.status === 401 || e.status === 403) ? 'Firebase blocked this. Go to Admin > Appearance > "One-time Firebase rules", paste them in Realtime Database > Rules and publish. Then try again.' : 'Delete failed: ' + (e.message || e));
            }
        }
    };
    if (window.NBAdmin && NBAdmin.render) {
        var origRender = NBAdmin.render;
        NBAdmin.render = function (tab) { var r = origRender.apply(this, arguments); if (tab === 'appearance') mount(); return r; };
    }

    /* ---------------- student: delete own account ---------------- */
    var authP = null;
    function authBits() {
        if (!authP) authP = Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js')]).then(function (m) {
            var app = m[0].getApps().filter(function (x) { return x.name === 'nbuser'; })[0] || m[0].initializeApp(NB.FBCFG, 'nbuser');
            return { auth: m[1].getAuth(app), au: m[1] };
        });
        return authP;
    }
    async function deleteSelf(pw) {
        var s = await authBits(); if (s.auth.authStateReady) await s.auth.authStateReady();
        var u = s.auth.currentUser; if (!u) throw new Error('Please log in again, then retry.');
        await s.au.reauthenticateWithCredential(u, s.au.EmailAuthProvider.credential(u.email, pw));
        var tok = await u.getIdToken(true);
        try { await fetch(DB + '/notes_bazar_users/' + u.uid + '.json?auth=' + encodeURIComponent(tok), { method: 'DELETE' }); } catch (e) {}
        await s.au.deleteUser(u);
        try { await NB.logout(); } catch (e) {}
    }
    function openDelete() {
        if (document.getElementById('lxDelWrap')) return;
        var w = document.createElement('div'); w.id = 'lxDelWrap'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
        w.innerHTML = '<div class="lxd"><h3>Delete your account?</h3><p>This permanently removes your account, saved notes, downloads history and progress. It cannot be undone. Enter your password to confirm.</p>' +
            '<input type="password" id="lxPw" placeholder="Your password" autocomplete="current-password" aria-label="Password"><div class="lxe" id="lxErr" role="alert"></div>' +
            '<div class="lxb"><button type="button" class="lxno" id="lxNo">Cancel</button><button type="button" class="lxgo" id="lxGo">Delete forever</button></div></div>';
        document.body.appendChild(w);
        var pw = document.getElementById('lxPw'), go = document.getElementById('lxGo'), er = document.getElementById('lxErr');
        function close() { w.remove(); }
        document.getElementById('lxNo').onclick = close;
        w.addEventListener('click', function (e) { if (e.target === w) close(); });
        go.onclick = async function () {
            if (!pw.value) { er.textContent = 'Please enter your password.'; return; }
            go.disabled = true; go.textContent = 'Deleting...'; er.textContent = '';
            try { await deleteSelf(pw.value); close(); try { NB.close('nbPf'); } catch (e) {} toast('Your account has been deleted.', 3500); }
            catch (e) {
                go.disabled = false; go.textContent = 'Delete forever';
                var c = (e && e.code) || '';
                er.textContent = /wrong-password|invalid-credential/.test(c) ? 'Wrong password. Please try again.' : (c === 'auth/too-many-requests' ? 'Too many attempts. Wait a few minutes.' : (NB.authError ? NB.authError(e) : 'Something went wrong.'));
            }
        };
        setTimeout(function () { pw.focus(); }, 50);
    }
    function injectRow() {
        var l = document.getElementById('nbpList');
        if (!l || l.querySelector('.lx-del')) return;
        l.insertAdjacentHTML('beforeend', '<button type="button" class="nbp-row lx-del" data-nb-del="1"><i class="fa-solid fa-user-slash"></i><div><b>Delete account</b><small>Permanently remove your account and data</small></div></button>');
    }
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-nb-del]')) openDelete(); });
    new MutationObserver(injectRow).observe(document.body, { childList: true });
    injectRow();

    /* ---------------- student removed by admin: clean up on next login / open ---------------- */
    async function removedCheck() {
        try {
            var s = await authBits(); if (s.auth.authStateReady) await s.auth.authStateReady();
            var u = s.auth.currentUser; if (!u) return false;
            var tok = await u.getIdToken();
            var r = await fetch(DB + '/notes_bazar_deleted/' + u.uid + '.json?auth=' + encodeURIComponent(tok), { cache: 'no-store' });
            if (!r.ok || !(await r.json())) return false;
            try { await fetch(DB + '/notes_bazar_users/' + u.uid + '.json?auth=' + encodeURIComponent(tok), { method: 'DELETE' }); } catch (e) {}
            try { await s.au.deleteUser(u); } catch (e) {}
            try { await NB.logout(); } catch (e) {}
            return true;
        } catch (e) { return false; }
    }
    if (NB.login) {
        var origLogin = NB.login;
        NB.login = async function () {
            var u = await origLogin.apply(this, arguments);
            if (await removedCheck()) throw new Error('This account was removed by the admin. You can create a new account.');
            return u;
        };
    }
    setTimeout(function () { if (NB.loggedIn && NB.loggedIn()) removedCheck().then(function (g) { if (g) toast('Your account was removed by the admin.', 4500); }); }, 1500);
})();
