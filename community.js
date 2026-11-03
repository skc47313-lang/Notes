/* =====================================================================
   Notes Bazar Community
   - Students: WhatsApp / Instagram style group chat (text, photo, short video, reply, delete own)
   - Admin: sees everything (Admin Dashboard > Community), ON/OFF switch, delete messages, block / unblock users
   Data lives in Firebase Realtime Database under  notes_bazar_community/
       settings/open          true | false   (admin switch)
       blocked/<uid>          {name, userId, ts}
       messages/<pushId>      {uid, name, userId, cls, ts, text?, m?, rp?, adm?}
       media/<id>             {d: dataURL, uid, ts}    (photo / video data, loaded only when needed)
   The Firebase rules for this are shown in Admin > Community (copy and publish them once).
   ===================================================================== */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var FB = 'https://www.gstatic.com/firebasejs/10.8.0/';
    var ROOT = 'notes_bazar_community', DIR = 'notes_bazar_directory', FR = 'notes_bazar_friends', DMR = 'notes_bazar_dm';
    var MAX_TXT = 1000, MAX_VID = 3 * 1024 * 1024, PAGE = 60, OLDER = 40;
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var COLORS = ['#e11d48', '#db2777', '#9333ea', '#4f46e5', '#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#ea580c'];
    function colorOf(s) { var h = 0, i; s = String(s || ''); for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function hm(ts) { var d = new Date(ts), h = d.getHours(), a = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + ':' + pad(d.getMinutes()) + ' ' + a; }
    function dayLabel(ts) {
        var d = new Date(ts), n = new Date(), s = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
        var diff = Math.round((s(n) - s(d)) / 864e5);
        return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
    }
    function toast(m) { if (window.nbToast) window.nbToast(m, 3000); else try { alert(m); } catch (e) {} }

    /* ---------- Firebase handles ---------- */
    var stuP = null;
    function studentSdk() {                                   // the student's own Firebase session ("nbuser" app, created by extras.js)
        if (!stuP) {
            stuP = Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js')]).then(async function (m) {
                var a = m[0], au = m[1], d = m[2];
                var app = a.getApps().filter(function (x) { return x.name === 'nbuser'; })[0] || a.initializeApp(NB.FBCFG, 'nbuser');
                var auth = au.getAuth(app);
                if (auth.authStateReady) { try { await auth.authStateReady(); } catch (e) {} }
                else await new Promise(function (res) { var un = au.onAuthStateChanged(auth, function () { un(); res(); }); });
                var o = { app: app, auth: auth, db: d.getDatabase(app) };
                Object.keys(d).forEach(function (k) { o[k] = d[k]; });
                return o;
            });
            stuP.catch(function () { stuP = null; });
        }
        return stuP;
    }

    /* =====================================================================
       Chat view (shared by the students' screen and the admin page)
       o = { host, S: sdk bag, me: {uid, name, userId, cls, admin}, admin: bool, onBlock(uid, name, userId) }
       ===================================================================== */
    function mkChat(o) {
        var S = o.S, db = S.db, me = o.me, host = o.host;
        var msgs = {}, order = [], unsubs = [], msgUn = [], msgsOn = false, mediaCache = {}, sel = '', reply = null, open = false, blocked = false, firstKey = '', noMore = false, busy = false, perm = false;
        var lastSend = 0, destroyed = false, painting = 0, stick = true;
        var MPATH = o.msgPath || (ROOT + '/messages'), MEDIA = o.mediaPath || (ROOT + '/media'), dm = !!o.dm;
        if (dm) open = true;
        var mref = function (k) { return S.ref(db, MPATH + (k ? '/' + k : '')); };

        host.innerHTML =
            '<div class="cm-root' + (o.admin ? ' cm-adm' : '') + '">' +
            '<div class="cm-sel" hidden></div>' +
            '<div class="cm-banner" hidden></div>' +
            '<div class="cm-list" tabindex="-1"><div class="cm-older" hidden><button type="button">Load older messages</button></div><div class="cm-msgs"></div><div class="cm-empty" hidden></div></div>' +
            '<button type="button" class="cm-down" hidden aria-label="Jump to latest"><i class="fa-solid fa-chevron-down"></i></button>' +
            '<div class="cm-rp" hidden></div>' +
            '<div class="cm-bar"><label class="cm-ib" title="Photo or video" aria-label="Send a photo or video"><i class="fa-solid fa-paperclip"></i><input type="file" accept="image/*,video/*" hidden></label>' +
            '<textarea class="cm-in" rows="1" maxlength="' + MAX_TXT + '" placeholder="Write a message" aria-label="Message"></textarea>' +
            '<button type="button" class="cm-send" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button></div>' +
            '</div>';
        var R = host.querySelector('.cm-root'), list = R.querySelector('.cm-list'), box = R.querySelector('.cm-msgs'), emptyEl = R.querySelector('.cm-empty'),
            banner = R.querySelector('.cm-banner'), selBar = R.querySelector('.cm-sel'), rpBar = R.querySelector('.cm-rp'), inp = R.querySelector('.cm-in'),
            fileIn = R.querySelector('input[type=file]'), sendBtn = R.querySelector('.cm-send'), older = R.querySelector('.cm-older'), down = R.querySelector('.cm-down');

        function canSend() { return !blocked && !perm && (open || o.admin || dm); }
        function status() {
            var why = '';
            if (dm) why = perm ? '⚠️ This chat is not available. Ask the admin to publish the latest Firebase rules (Admin > Community).' : '';
            else if (blocked) why = '🚫 You were blocked by the admin. You can no longer see or send community messages.';
            else if (perm) why = '⚠️ The community is not set up yet. Ask the admin to publish the community Firebase rules.';
            else if (!open && !o.admin) why = '🔒 The admin has closed the community for now. You can read the old chat, but you cannot send messages.';
            else if (!open && o.admin) why = '🔒 Community is OFF for students. Only you (admin) can write here.';
            banner.hidden = !why; banner.textContent = why;
            var can = canSend();
            inp.disabled = !can; sendBtn.disabled = !can; R.classList.toggle('cm-off', !can);
            inp.placeholder = can ? 'Write a message' : (blocked ? 'You are blocked' : 'Chat is closed');
            if (o.onStatus) { try { o.onStatus({ open: open, blocked: blocked, perm: perm }); } catch (e) {} }
        }

        /* ---- rendering ---- */
        function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 120; }
        function toBottom() { list.scrollTop = list.scrollHeight; down.hidden = true; }
        function snippet(m) { return m.text ? String(m.text).slice(0, 80) : (m.m ? (m.m.k === 'vid' ? '🎥 Video' : '📷 Photo') : ''); }
        function bubble(k, m, prev) {
            var own = m.uid === me.uid, h = '', nm = m.adm ? 'Admin' : (m.name || 'Student');
            if (!prev || dayLabel(prev.ts) !== dayLabel(m.ts)) h += '<div class="cm-day"><span>' + esc(dayLabel(m.ts)) + '</span></div>';
            var same = prev && prev.uid === m.uid && dayLabel(prev.ts) === dayLabel(m.ts) && (m.ts - prev.ts) < 5 * 60000;
            h += '<div class="cm-row ' + (own ? 'own' : 'oth') + (same ? ' same' : '') + (sel === k ? ' sel' : '') + '" data-k="' + esc(k) + '">';
            if (!own) h += same ? '<span class="cm-av gap"></span>' : '<span class="cm-av" style="background:' + (m.adm ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : colorOf(m.uid)) + '">' + (m.adm ? '👑' : esc(nm.charAt(0).toUpperCase())) + '</span>';
            h += '<div class="cm-b">';
            if (!own && !same) h += '<div class="cm-nm" style="color:' + (m.adm ? '#d97706' : colorOf(m.uid)) + '">' + esc(nm) + (m.adm ? ' <em class="cm-adm-b">ADMIN</em>' : (m.cls ? ' <em>' + esc(m.cls) + '</em>' : '')) + (o.admin && m.userId && !m.adm ? ' <small>@' + esc(m.userId) + '</small>' : '') + '</div>';
            if (m.rp) h += '<div class="cm-q" data-q="' + esc(m.rp.k || '') + '"><b>' + esc(m.rp.n || '') + '</b><span>' + esc(m.rp.t || '') + '</span></div>';
            if (m.m && m.m.id) {
                var ar = m.m.w && m.m.h ? ' style="aspect-ratio:' + Math.max(1, +m.m.w) + '/' + Math.max(1, +m.m.h) + '"' : '';
                if (m.m.k === 'vid') h += '<div class="cm-vid" data-mid="' + esc(m.m.id) + '"><i class="fa-solid fa-circle-play"></i><span>Video' + (m.m.sz ? ' · ' + (m.m.sz / 1048576).toFixed(1) + ' MB' : '') + '<small>Tap to play</small></span></div>';
                else h += '<div class="cm-img" data-mid="' + esc(m.m.id) + '"' + ar + '><i class="fa-regular fa-image"></i></div>';
            }
            if (m.text) h += '<div class="cm-tx">' + esc(m.text).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>') + '</div>';
            h += '<span class="cm-t">' + hm(m.ts) + '</span></div></div>';
            return h;
        }
        function paint() {
            if (painting || destroyed) return;
            painting = requestAnimationFrame(function () {
                painting = 0; if (destroyed) return;
                var keep = stick || nearBottom(), prevH = list.scrollHeight, prevTop = list.scrollTop, h = '', prev = null;
                order.sort();
                order.forEach(function (k) { var m = msgs[k]; if (!m) return; h += bubble(k, m, prev); prev = m; });
                box.innerHTML = h;
                emptyEl.hidden = !!order.length;
                if (!order.length) emptyEl.innerHTML = '<div>💬</div><b>No messages yet</b><span>' + (canSend() ? 'Say hi to everyone 👋' : 'Nothing here yet.') + '</span>';
                older.hidden = noMore || !order.length || order.length < PAGE;
                if (keep) { toBottom(); } else { list.scrollTop = prevTop + (list.scrollHeight - prevH) * (box.__older ? 1 : 0); }
                box.__older = 0; stick = false;
                hydrate();
            });
        }
        function mediaGet(id) {
            if (mediaCache[id]) return Promise.resolve(mediaCache[id]);
            return S.get(S.ref(db, MEDIA + '/' + id)).then(function (s) {
                var v = s.val();
                if (!v || typeof v.d !== 'string' || !/^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(v.d.slice(0, 60))) throw new Error('missing');   // only real photo / video data is ever used
                mediaCache[id] = v.d; return v.d;
            });
        }
        function hydrate() {
            [].forEach.call(box.querySelectorAll('.cm-img[data-mid]:not([data-ld])'), function (el) {
                el.setAttribute('data-ld', '1');
                mediaGet(el.getAttribute('data-mid')).then(function (d) {
                    if (!el.isConnected) return;
                    var wasNear = nearBottom();
                    var im = document.createElement('img'); im.alt = 'Photo'; im.src = d; el.innerHTML = ''; el.appendChild(im); el.classList.add('ok'); el.style.aspectRatio = '';
                    if (wasNear) toBottom();
                }).catch(function () { el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><small>Photo not available</small>'; });
            });
        }
        function viewer(src, vid) {
            var v = document.createElement('div'); v.className = 'cm-view';
            v.innerHTML = '<button type="button" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' + (vid ? '<video controls autoplay playsinline></video>' : '<img alt="">');
            v.querySelector(vid ? 'video' : 'img').src = src;
            v.addEventListener('click', function (e) { if (e.target.tagName !== 'VIDEO') { var vv = v.querySelector('video'); if (vv) vv.pause(); v.remove(); } });
            document.body.appendChild(v);
        }

        /* ---- selection bar (tap a message: reply / copy / delete / block) ---- */
        function setSel(k) {
            sel = k || '';
            var m = msgs[sel];
            if (!m) { selBar.hidden = true; sel = ''; }
            else {
                var mine = m.uid === me.uid, h = '<button type="button" data-a="x" aria-label="Cancel"><i class="fa-solid fa-xmark"></i></button><span>1 selected</span>';
                if (canSend()) h += '<button type="button" data-a="reply"><i class="fa-solid fa-reply"></i><em>Reply</em></button>';
                if (m.text) h += '<button type="button" data-a="copy"><i class="fa-regular fa-copy"></i><em>Copy</em></button>';
                if (mine || o.admin) h += '<button type="button" data-a="del" class="dng"><i class="fa-solid fa-trash"></i><em>Delete</em></button>';
                if (o.admin && !mine && !m.adm) h += '<button type="button" data-a="block" class="dng"><i class="fa-solid fa-ban"></i><em>Block</em></button>';
                selBar.innerHTML = h; selBar.hidden = false;
            }
            [].forEach.call(box.querySelectorAll('.cm-row'), function (r) { r.classList.toggle('sel', r.getAttribute('data-k') === sel); });
        }
        function setReply(k) {
            var m = msgs[k]; if (!m) { reply = null; rpBar.hidden = true; return; }
            reply = { k: k, n: m.adm ? 'Admin' : (m.name || 'Student'), t: snippet(m) };
            rpBar.innerHTML = '<div><b>' + esc(reply.n) + '</b><span>' + esc(reply.t) + '</span></div><button type="button" aria-label="Cancel reply"><i class="fa-solid fa-xmark"></i></button>';
            rpBar.hidden = false; inp.focus();
        }
        selBar.addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return; var a = b.getAttribute('data-a'), k = sel, m = msgs[k];
            if (a === 'x') { setSel(''); return; }
            if (!m) return;
            if (a === 'reply') { setSel(''); setReply(k); }
            else if (a === 'copy') { try { navigator.clipboard.writeText(m.text || ''); toast('Copied'); } catch (x) { toast('Could not copy'); } setSel(''); }
            else if (a === 'del') {
                if (!confirm(o.admin && m.uid !== me.uid ? 'Delete this message of ' + (m.name || 'the student') + ' for everyone?' : 'Delete this message?')) return;
                setSel('');
                var jobs = [S.remove(mref(k))];
                if (m.m && m.m.id) jobs.push(S.remove(S.ref(db, MEDIA + '/' + m.m.id)).catch(function () {}));
                Promise.all(jobs).catch(function () { toast('Could not delete. Check your internet and the Firebase rules.'); });
            }
            else if (a === 'block') { setSel(''); if (o.onBlock) o.onBlock(m.uid, m.name, m.userId); }
        });
        rpBar.addEventListener('click', function (e) { if (e.target.closest('button')) { reply = null; rpBar.hidden = true; } });
        box.addEventListener('click', function (e) {
            var img = e.target.closest('.cm-img.ok img');
            if (img) { viewer(img.src, false); return; }
            var v = e.target.closest('.cm-vid');
            if (v && !v.classList.contains('ok')) {
                v.classList.add('busy'); v.querySelector('small').textContent = 'Loading...';
                mediaGet(v.getAttribute('data-mid')).then(function (d) { v.classList.remove('busy'); viewer(d, true); v.querySelector('small').textContent = 'Tap to play'; })
                    .catch(function () { v.classList.remove('busy'); v.querySelector('small').textContent = 'Video not available'; });
                return;
            }
            if (e.target.closest('a')) return;
            var q = e.target.closest('.cm-q');
            if (q) { var t = box.querySelector('.cm-row[data-k="' + (q.getAttribute('data-q') || '').replace(/"/g, '') + '"]'); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(function () { t.classList.remove('flash'); }, 1200); } return; }
            var row = e.target.closest('.cm-row'); if (row) setSel(sel === row.getAttribute('data-k') ? '' : row.getAttribute('data-k'));
        });
        list.addEventListener('scroll', function () { down.hidden = nearBottom(); }, { passive: true });
        down.addEventListener('click', toBottom);

        /* ---- sending ---- */
        function pushMsg(extra) {
            if (!canSend()) { toast(blocked ? 'You are blocked by the admin.' : 'The community is closed right now.'); return Promise.reject(new Error('closed')); }
            var k = S.push(mref()).key, m = { uid: me.uid, name: me.name || 'Student', ts: Date.now() };
            if (me.userId) m.userId = me.userId; if (me.cls) m.cls = me.cls; if (o.admin) m.adm = 1;
            Object.keys(extra).forEach(function (x) { m[x] = extra[x]; });
            if (reply) m.rp = { k: reply.k, n: String(reply.n).slice(0, 30), t: String(reply.t).slice(0, 80) };
            return S.set(mref(k), m).then(function () { reply = null; rpBar.hidden = true; stick = true; if (o.onSent) { try { o.onSent(m); } catch (e) {} } });
        }
        function sendText() {
            var t = inp.value.replace(/\s+$/g, '').slice(0, MAX_TXT);
            if (!t.trim()) return;
            if (Date.now() - lastSend < 900) return; lastSend = Date.now();
            inp.value = ''; grow();
            pushMsg({ text: t }).catch(function (e) { if (e && e.message !== 'closed') { inp.value = t; grow(); toast('Message not sent. Check internet or ask admin to open the community.'); } });
        }
        function grow() { inp.style.height = 'auto'; inp.style.height = Math.min(120, inp.scrollHeight) + 'px'; }
        inp.addEventListener('input', grow);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); sendText(); } });
        sendBtn.addEventListener('click', sendText);
        function readFile(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('read')); }; r.readAsDataURL(f); }); }
        function shrink(f) {
            return readFile(f).then(function (url) {
                return new Promise(function (res, rej) {
                    var im = new Image();
                    im.onload = function () {
                        var M = 1100, k = Math.min(1, M / Math.max(im.width, im.height)), c = document.createElement('canvas');
                        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
                        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
                        res({ d: c.toDataURL('image/jpeg', 0.72), w: c.width, h: c.height });
                    };
                    im.onerror = function () { rej(new Error('img')); }; im.src = url;
                });
            });
        }
        fileIn.addEventListener('change', function () {
            var f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (!f || !canSend()) return;
            var isV = /^video\//.test(f.type), isI = /^image\//.test(f.type);
            if (!isV && !isI) { toast('Please choose a photo or a video.'); return; }
            if (isV && f.size > MAX_VID) { toast('Video is too big. Please send a short clip under 3 MB.'); return; }
            if (f.size > 25 * 1048576) { toast('File is too big.'); return; }
            R.classList.add('cm-up'); var mid = S.push(S.ref(db, MEDIA)).key, meta;
            (isV ? readFile(f).then(function (d) { meta = { k: 'vid', id: mid, sz: f.size }; return { d: d }; }) : shrink(f).then(function (r) { meta = { k: 'img', id: mid, w: r.w, h: r.h }; return r; }))
                .then(function (r) { return S.set(S.ref(db, MEDIA + '/' + mid), { d: r.d, uid: me.uid, ts: Date.now() }); })
                .then(function () { mediaCache[mid] = null; delete mediaCache[mid]; var cap = inp.value.trim(); inp.value = ''; grow(); var x = { m: meta }; if (cap) x.text = cap.slice(0, MAX_TXT); return pushMsg(x).catch(function (e) { S.remove(S.ref(db, MEDIA + '/' + mid)).catch(function () {}); throw e; }); })
                .catch(function (e) { if (!e || e.message !== 'closed') toast('Could not send the file. Check internet / Firebase rules.'); })
                .then(function () { R.classList.remove('cm-up'); });
        });

        /* ---- listening ---- */
        function addMsg(s) {
            var k = s.key, v = s.val(); if (!v || typeof v !== 'object' || !v.uid) return;
            if (!(k in msgs)) order.push(k);
            msgs[k] = v; if (!firstKey || k < firstKey) firstKey = k; paint();
        }
        function stopMsgs() { msgUn.forEach(function (u) { try { u(); } catch (e) {} }); msgUn = []; msgsOn = false; }
        function startMsgs() {
            stopMsgs(); msgsOn = true;
            var q = S.query(mref(), S.limitToLast(PAGE));
            msgUn.push(S.onChildAdded(q, function (s) { perm = false; if (nearBottom()) stick = true; addMsg(s); status(); }, function (err) { onDenied(err); }));
            msgUn.push(S.onChildChanged(q, addMsg, function () {}));
            msgUn.push(S.onChildRemoved(q, function (s) { var k = s.key; delete msgs[k]; order = order.filter(function (x) { return x !== k; }); if (sel === k) setSel(''); paint(); }, function () {}));
        }
        function onDenied(err) {
            if (destroyed) return;
            if (!blocked) { perm = true; status(); }
        }
        function loadOlder() {
            if (busy || noMore || !firstKey) return; busy = true; older.querySelector('button').textContent = 'Loading...';
            S.get(S.query(mref(), S.orderByKey(), S.endBefore(firstKey), S.limitToLast(OLDER))).then(function (s) {
                var n = 0; s.forEach(function (c) { n++; var k = c.key, v = c.val(); if (v && v.uid) { if (!(k in msgs)) order.push(k); msgs[k] = v; if (!firstKey || k < firstKey) firstKey = k; } });
                if (n < OLDER) noMore = true; box.__older = 1; stick = false; paint();
            }).catch(function () { toast('Could not load older messages.'); }).then(function () { busy = false; older.querySelector('button').textContent = 'Load older messages'; });
        }
        older.querySelector('button').addEventListener('click', loadOlder);

        // settings + block status first, then messages
        if (dm) startMsgs(); else {
        unsubs.push(S.onValue(S.ref(db, ROOT + '/settings'), function (s) { var v = s.val(); open = !!(v && v.open === true); status(); paint(); }, function () { /* denied: handled by the messages listener / blocked check */ }));
        if (!o.admin) {
            unsubs.push(S.onValue(S.ref(db, ROOT + '/blocked/' + me.uid), function (s) {
                var b = s.exists();
                if (b && !blocked) { blocked = true; stopMsgs(); msgs = {}; order = []; firstKey = ''; paint(); status(); }
                else if (!b && blocked) { blocked = false; perm = false; startMsgs(); status(); }
                else if (!b && !msgsOn) { startMsgs(); }
            }, function () { if (!msgsOn) startMsgs(); }));
        } else startMsgs();
        }
        status(); grow();

        return {
            focus: function () { try { inp.focus(); } catch (e) {} },
            destroy: function () { destroyed = true; stopMsgs(); unsubs.forEach(function (u) { try { u(); } catch (e) {} }); unsubs = []; host.innerHTML = ''; },
            count: function () { return order.length; },
            isOpen: function () { return open; }
        };
    }

    /* =====================================================================
       Student screen
       ===================================================================== */
    var stu = { chat: null, dm: null, el: null, view: 'cm', S: null, me: null, fr: {}, un: [], lastU: {}, dir: null };
    function cidOf(a, b) { return a < b ? a + '_' + b : b + '_' + a; }
    function readTs(cid) { try { return +localStorage.getItem('nb_dmr_' + cid) || 0; } catch (e) { return 0; } }
    function setRead(cid) { try { localStorage.setItem('nb_dmr_' + cid, String(Date.now())); } catch (e) {} }
    function stuClose() {
        if (stu.chat) { stu.chat.destroy(); stu.chat = null; }
        if (stu.dm) { stu.dm.destroy(); stu.dm = null; }
        stu.un.forEach(function (u) { try { u(); } catch (e) {} }); stu.un = []; stu.lastU = {}; stu.fr = {};
        if (stu.el && stu.el.parentNode) stu.el.parentNode.removeChild(stu.el);
        stu.el = null; stu.view = 'cm'; document.body.style.overflow = stu.ov || '';
    }
    function avatar(n, uid, cls) { return '<span class="cm-av ' + (cls || '') + '" style="background:' + colorOf(uid) + '">' + esc(String(n || '?').charAt(0).toUpperCase()) + '</span>'; }
    function setHead(title, sub, backIsClose) { var t = $('cmTitle'), s = $('cmSub'); if (t) t.textContent = title; if (s) s.textContent = sub || ''; }
    function unreadTotal() { var n = 0; Object.keys(stu.lastU).forEach(function (cid) { var l = stu.lastU[cid]; if (l && l.uid !== stu.me.uid && l.ts > readTs(cid)) n++; }); return n; }
    function paintBadge() { var b = $('cmFrBadge'); if (!b) return; var n = unreadTotal(); b.textContent = n; b.hidden = !n; }

    /* ---- Friends tab: list ---- */
    function frList() {
        var fr = $('cmFr'); if (!fr) return;
        stu.view = 'fr'; if (stu.dm) { stu.dm.destroy(); stu.dm = null; }
        setHead('Friends', 'Chat privately with your friends');
        var ids = Object.keys(stu.fr).sort(function (a, b) { var la = stu.lastU[cidOf(stu.me.uid, a)], lb = stu.lastU[cidOf(stu.me.uid, b)]; return ((lb && lb.ts) || (stu.fr[b].ts || 0)) - ((la && la.ts) || (stu.fr[a].ts || 0)); });
        var h = '<div class="cmf-top"><button type="button" class="cmf-add" data-f="add"><i class="fa-solid fa-user-plus"></i> Add friends</button></div>';
        if (!ids.length) h += '<div class="cm-empty cmf-empty"><div>🤝</div><b>No friends yet</b><span>Tap "Add friends", search a student by User ID and start chatting.</span></div>';
        else h += '<div class="cmf-list">' + ids.map(function (id) {
            var f = stu.fr[id], cid = cidOf(stu.me.uid, id), l = stu.lastU[cid], un = l && l.uid !== stu.me.uid && l.ts > readTs(cid);
            return '<button type="button" class="cmf-row" data-f="chat" data-u="' + esc(id) + '">' + avatar(f.name, id) + '<span class="cmf-tx"><b>' + esc(f.name || 'Student') + ' <small>@' + esc(f.userId || '') + '</small></b><span class="' + (un ? 'un' : '') + '">' + esc(l ? ((l.uid === stu.me.uid ? 'You: ' : '') + l.t) : 'Say hi 👋') + '</span></span>' + (l ? '<span class="cmf-meta">' + esc(hm(l.ts)) + (un ? '<i></i>' : '') + '</span>' : '') + '</button>';
        }).join('') + '</div>';
        fr.innerHTML = h;
    }
    /* ---- Friends tab: add friends (all students, search by User ID or name) ---- */
    async function frAdd() {
        var fr = $('cmFr'); if (!fr) return;
        stu.view = 'add'; setHead('Add friends', 'Search by User ID or name');
        fr.innerHTML = '<div class="cmf-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="cmfQ" placeholder="Search User ID or name" autocomplete="off" aria-label="Search students"></div><div class="cmf-list" id="cmfRes"><div class="cm-load"><i class="fa-solid fa-spinner fa-spin"></i> Loading students...</div></div>';
        var S = stu.S;
        try {
            if (!stu.dir) { var snap = await S.get(S.query(S.ref(S.db, DIR), S.limitToFirst(400))); stu.dir = []; snap.forEach(function (c) { var v = c.val(); if (v && v.userId && c.key !== stu.me.uid) stu.dir.push({ uid: c.key, name: v.name || 'Student', userId: v.userId, cls: v.cls || '' }); }); stu.dir.sort(function (a, b) { return a.userId < b.userId ? -1 : 1; }); }
        } catch (e) { var r0 = $('cmfRes'); if (r0) r0.innerHTML = '<div class="cm-load">Could not load students. Ask the admin to publish the latest Firebase rules (Admin &gt; Community).</div>'; return; }
        var inp = $('cmfQ');
        function paint() {
            var q = (inp.value || '').trim().toLowerCase().replace(/^@/, ''), res = $('cmfRes'); if (!res) return;
            var l = stu.dir.filter(function (u) { return !q || u.userId.toLowerCase().indexOf(q) > -1 || u.name.toLowerCase().indexOf(q) > -1; });
            res.innerHTML = l.length ? l.map(function (u) {
                var isF = !!stu.fr[u.uid];
                return '<div class="cmf-row">' + avatar(u.name, u.uid) + '<span class="cmf-tx"><b>' + esc(u.name) + '</b><span>@' + esc(u.userId) + (u.cls ? ' · ' + esc(u.cls) : '') + '</span></span>' +
                    (isF ? '<button type="button" class="cmf-btn ok" data-f="chat" data-u="' + esc(u.uid) + '">Message</button>' : '<button type="button" class="cmf-btn" data-f="addone" data-u="' + esc(u.uid) + '"><i class="fa-solid fa-user-plus"></i> Add</button>') + '</div>';
            }).join('') : '<div class="cm-empty"><div>🔍</div><b>' + (q ? 'No student found' : 'No other students yet') + '</b><span>' + (q ? 'Check the User ID and try again.' : 'When more students join, they will show here.') + '</span></div>';
        }
        inp.addEventListener('input', paint); paint(); inp.focus();
    }
    async function frAddOne(uid) {
        var u = (stu.dir || []).filter(function (x) { return x.uid === uid; })[0], me = stu.me, S = stu.S; if (!u) return;
        var up = {}; up[FR + '/' + me.uid + '/' + uid] = { name: u.name, userId: u.userId, cls: u.cls, ts: Date.now() };
        up[FR + '/' + uid + '/' + me.uid] = { name: me.name, userId: me.userId, cls: me.cls, ts: Date.now() };
        try { await S.update(S.ref(S.db), up); toast(u.name + ' is now your friend 🎉'); frOpen(uid); }
        catch (e) { toast('Could not add the friend. Ask the admin to publish the latest Firebase rules.'); }
    }
    /* ---- one-to-one chat ---- */
    function frOpen(uid) {
        var f = stu.fr[uid] || (stu.dir || []).filter(function (x) { return x.uid === uid; })[0]; if (!f) { frList(); return; }
        var fr = $('cmFr'), me = stu.me, S = stu.S, cid = cidOf(me.uid, uid);
        stu.view = 'dm'; stu.dmCid = cid; if (stu.dm) { stu.dm.destroy(); stu.dm = null; }
        setHead(f.name || 'Student', '@' + (f.userId || '') + (f.cls ? ' · ' + f.cls : ''));
        fr.innerHTML = '<div id="cmDmHost" class="cm-host"></div>';
        setRead(cid); paintBadge();
        stu.dm = mkChat({ host: $('cmDmHost'), S: S, admin: false, dm: true, me: me, msgPath: DMR + '/' + cid + '/messages', mediaPath: DMR + '/' + cid + '/media',
            onSent: function (m) { setRead(cid); S.set(S.ref(S.db, DMR + '/' + cid + '/last'), { uid: me.uid, t: String(m.text || (m.m ? (m.m.k === 'vid' ? '🎥 Video' : '📷 Photo') : '')).slice(0, 60), ts: m.ts }).catch(function () {}); } });
        stu.dm.focus();
    }
    function frWatch() {                                           // my friends + the last message of each chat (for previews and the unread dot)
        var S = stu.S, me = stu.me, seen = {};
        stu.un.push(S.onValue(S.ref(S.db, FR + '/' + me.uid), function (s) {
            stu.fr = s.val() || {};
            Object.keys(stu.fr).forEach(function (id) {
                var cid = cidOf(me.uid, id); if (seen[cid]) return; seen[cid] = 1;
                stu.un.push(S.onValue(S.ref(S.db, DMR + '/' + cid + '/last'), function (ls) { stu.lastU[cid] = ls.val(); if (stu.view === 'dm' && stu.dmCid === cid) setRead(cid); paintBadge(); if (stu.view === 'fr') frList(); }, function () {}));
            });
            paintBadge(); if (stu.view === 'fr') frList();
        }, function () { stu.fr = {}; if (stu.view === 'fr') frList(); }));
    }
    function setTab(t) {
        var cm = $('cmHost'), fr = $('cmFr'); if (!cm || !fr) return;
        [].forEach.call(stu.el.querySelectorAll('.cm-tab'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === t); });
        if (t === 'cm') { cm.hidden = false; fr.hidden = true; if (stu.dm) { stu.dm.destroy(); stu.dm = null; } stu.view = 'cm'; setHead('Notes Bazar Community', stu.sub || ''); }
        else { cm.hidden = true; fr.hidden = false; frList(); }
    }
    NB.openCommunity = async function (tab) {
        try { if (NB.closeSiteMenu) NB.closeSiteMenu(); } catch (e) {}
        if (!NB.loggedIn || !NB.loggedIn()) { if (NB.ui && NB.ui.openAuth) NB.ui.openAuth('signup'); return; }
        if (stu.el) return;
        var pr = NB.profile() || {}, el = document.createElement('div');
        el.className = 'cm-screen'; el.id = 'nbCm'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Community');
        el.innerHTML = '<div class="cm-head"><button type="button" class="cm-hb" data-a="back" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<span class="cm-ava"><i class="fa-solid fa-user-group"></i></span><div class="cm-ht"><b id="cmTitle">Notes Bazar Community</b><small id="cmSub">Connecting...</small></div>' +
            '<button type="button" class="cm-hb" data-a="info" aria-label="About"><i class="fa-solid fa-circle-info"></i></button></div>' +
            '<div class="cm-tabs" role="tablist"><button type="button" class="cm-tab on" role="tab" data-t="cm"><i class="fa-solid fa-users"></i> Community</button><button type="button" class="cm-tab" role="tab" data-t="fr"><i class="fa-solid fa-user-group"></i> Friends <em id="cmFrBadge" hidden>0</em></button></div>' +
            '<div class="cm-host" id="cmHost"><div class="cm-load"><i class="fa-solid fa-spinner fa-spin"></i> Opening community...</div></div><div class="cm-host cm-fr" id="cmFr" hidden></div>';
        document.body.appendChild(el); stu.el = el; stu.ov = document.body.style.overflow; document.body.style.overflow = 'hidden'; stu.view = 'cm';
        el.addEventListener('click', function (e) {
            var t = e.target.closest('.cm-tab'); if (t) { setTab(t.getAttribute('data-t')); return; }
            var f = e.target.closest('[data-f]'); if (f) { var k = f.getAttribute('data-f'), u = f.getAttribute('data-u'); if (k === 'add') frAdd(); else if (k === 'chat') frOpen(u); else if (k === 'addone') frAddOne(u); return; }
            var b = e.target.closest('[data-a]'); if (!b) return; var a = b.getAttribute('data-a');
            if (a === 'back') { if (stu.view === 'dm' || stu.view === 'add') frList(); else stuClose(); }
            else if (a === 'info') toast('Be kind. Community messages are public and the admin can see and delete them. Friend chats are private between you and your friend.');
        });
        try {
            var S = await studentSdk(), u = S.auth.currentUser;
            if (!stu.el) return;
            if (!u) { stuClose(); toast('Please log in again to join the community.'); if (NB.ui && NB.ui.openAuth) NB.ui.openAuth('login'); return; }
            stu.S = S; stu.me = { uid: u.uid, name: pr.name || 'Student', userId: pr.userId || '', cls: pr.cls || '' };
            S.set(S.ref(S.db, DIR + '/' + u.uid), { name: stu.me.name, userId: stu.me.userId || (u.email || '').split('@')[0], cls: stu.me.cls, ts: Date.now() }).catch(function () {});   // so friends can find me by my User ID
            stu.chat = mkChat({
                host: $('cmHost'), S: S, admin: false, me: stu.me,
                onStatus: function (st) { stu.sub = st.blocked ? 'You are blocked' : st.perm ? 'Not available' : st.open ? 'Everyone can chat · admin can see all messages' : 'Closed by admin · read only'; if (stu.view === 'cm') { var s = $('cmSub'); if (s) s.textContent = stu.sub; } }
            });
            frWatch();
            if (tab === 'fr') setTab('fr');
        } catch (e) {
            console.warn('community', e);
            var h = $('cmHost'); if (h) h.innerHTML = '<div class="cm-load">Could not open the community. Check your internet and try again.<br><button type="button" class="cm-retry" onclick="NB.reopenCommunity()">Try again</button></div>';
        }
    };
    NB.reopenCommunity = function () { stuClose(); NB.openCommunity(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stu.el && !document.querySelector('.cm-view')) { if (stu.view === 'dm' || stu.view === 'add') frList(); else stuClose(); } });

    /* =====================================================================
       Admin side
       ===================================================================== */
    var RULES = function (em) {
        var adm = "auth != null && auth.token.email === '" + em + "'";
        var ok = "auth != null && (auth.token.email === '" + em + "' || (!data.exists() && newData.child('uid').val() === auth.uid && root.child('notes_bazar_community/settings/open').val() === true && !root.child('notes_bazar_community/blocked').child(auth.uid).exists()) || (data.exists() && !newData.exists() && data.child('uid').val() === auth.uid))";
        var msgV = "newData.hasChildren(['uid','name','ts']) && (newData.hasChild('text') || newData.hasChild('m')) && (!newData.hasChild('text') || (newData.child('text').isString() && newData.child('text').val().length <= 1000))";
        var medV = "newData.hasChildren(['d','uid']) && newData.child('d').isString() && newData.child('d').val().beginsWith('data:') && newData.child('d').val().length < 4500000";
        var inChat = "auth != null && ($cid.beginsWith(auth.uid + '_') || $cid.endsWith('_' + auth.uid))";
        var own = "((!data.exists() && newData.child('uid').val() === auth.uid) || (data.exists() && !newData.exists() && data.child('uid').val() === auth.uid))";
        var dmW = inChat + " && root.child('notes_bazar_friends').child(auth.uid).child($cid.replace(auth.uid, '').replace('_', '')).exists() && !root.child('notes_bazar_community/blocked').child(auth.uid).exists()";
        return '"notes_bazar_community": {\n' +
            '  ".read": "auth != null && !root.child(\'notes_bazar_community/blocked\').child(auth.uid).exists()",\n' +
            '  "settings": { ".write": "' + adm + '" },\n' +
            '  "blocked": {\n    ".read": "' + adm + '",\n    "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": "' + adm + '" }\n  },\n' +
            '  "messages": {\n    "$mid": {\n      ".write": "' + ok + '",\n      ".validate": "' + msgV + '"\n    }\n  },\n' +
            '  "media": {\n    "$id": {\n      ".write": "' + ok + '",\n      ".validate": "' + medV + '"\n    }\n  }\n},\n' +
            '"notes_bazar_directory": {\n  ".read": "auth != null",\n  "$uid": {\n    ".write": "auth != null && auth.uid === $uid",\n    ".validate": "newData.hasChildren([\'name\',\'userId\'])"\n  }\n},\n' +
            '"notes_bazar_friends": {\n  "$uid": {\n    ".read": "auth != null && auth.uid === $uid",\n    "$fuid": { ".write": "auth != null && (auth.uid === $uid || auth.uid === $fuid)" }\n  }\n},\n' +
            '"notes_bazar_dm": {\n  "$cid": {\n    ".read": "' + inChat + '",\n    "last": { ".write": "' + dmW + '" },\n' +
            '    "messages": { "$mid": { ".write": "' + dmW + ' && ' + own + '", ".validate": "' + msgV + '" } },\n' +
            '    "media": { "$id": { ".write": "' + dmW + ' && ' + own + '", ".validate": "' + medV + '" } }\n  }\n}';
    };
    var adm = { S: null, chat: null, host: null, email: '', blocked: {}, open: null, denied: false, un: [], err: '' };
    async function admSdk() { var S = await window.NBA.sdk(); if (!S.auth.currentUser) throw new Error('Admin session expired. Please log in again.'); return S; }
    function admEmail() { return (adm.S && adm.S.auth.currentUser && adm.S.auth.currentUser.email) || ''; }

    NB.communityBlock = async function (uid, name, userId) {                 // used by the chat and by the student detail window
        try {
            var S = await admSdk();
            if (adm.blocked[uid]) {
                if (!confirm('Unblock ' + (name || 'this student') + '? They will see the community and can message again.')) return false;
                await S.remove(S.ref(S.db, ROOT + '/blocked/' + uid)); toast((name || 'Student') + ' is unblocked.');
            } else {
                if (!confirm('Block ' + (name || 'this student') + '? They will not see or send any community message until you unblock them.')) return false;
                await S.set(S.ref(S.db, ROOT + '/blocked/' + uid), { name: name || '', userId: userId || '', ts: Date.now() }); toast((name || 'Student') + ' is blocked.');
            }
            return true;
        } catch (e) { toast('Could not change block status. Publish the community Firebase rules first.'); return false; }
    };
    NB.communityIsBlocked = function (uid) { return !!adm.blocked[uid]; };
    NB.communityWatch = async function () {                                   // keeps the blocked list fresh for the admin (also used by the student detail window)
        if (adm.watching) return; adm.watching = true;
        try {
            var S = await admSdk(); adm.S = S;
            adm.un.push(S.onValue(S.ref(S.db, ROOT + '/blocked'), function (s) { adm.blocked = s.val() || {}; adm.denied = false; paintTop(); }, function () { adm.denied = true; paintTop(); }));
            adm.un.push(S.onValue(S.ref(S.db, ROOT + '/settings'), function (s) { var v = s.val(); adm.open = !!(v && v.open === true); paintTop(); }, function () { adm.denied = true; paintTop(); }));
        } catch (e) { adm.watching = false; }
    };

    function paintTop() {
        var top = $('cmaTop'), bl = $('cmaBlocked'); if (!top) return;
        var n = Object.keys(adm.blocked).length;
        top.innerHTML =
            '<div class="cma-sw"><div class="tx"><b>Community chat</b><span>' + (adm.open ? 'ON: every student can send messages, photos and videos.' : 'OFF: nobody can send messages. Students can only read the old chat.') + '</span></div>' +
            '<label class="cma-tgl' + (adm.open ? ' on' : '') + '"><input type="checkbox" ' + (adm.open ? 'checked' : '') + ' onchange="NBCommunity.setOpen(this.checked)" aria-label="Community on or off"><i></i><em>' + (adm.open ? 'ON' : 'OFF') + '</em></label></div>' +
            (adm.denied ? '<div class="cma-warn"><b>Firebase is not allowing the community yet.</b><span>Copy these rules, paste them inside the "rules" object in Firebase Console &rarr; Realtime Database &rarr; Rules, then press Publish.</span><pre class="a-code">' + esc(RULES(admEmail() || 'YOUR_ADMIN_EMAIL')) + '</pre><button type="button" class="a-btn" onclick="NBCommunity.copyRules()"><i class="fa-regular fa-copy"></i>Copy rules</button></div>' : '');
        if (bl) {
            var ks = Object.keys(adm.blocked).sort(function (a, b) { return (adm.blocked[b].ts || 0) - (adm.blocked[a].ts || 0); });
            bl.innerHTML = '<div class="a-ch"><h3><i class="fa-solid fa-ban"></i> Blocked users (' + n + ')</h3></div>' + (ks.length ? ks.map(function (k) {
                var b = adm.blocked[k] || {};
                return '<div class="cma-bu"><span class="av">' + esc(String(b.name || '?').charAt(0).toUpperCase()) + '</span><div class="tx"><b>' + esc(b.name || 'Student') + '</b><span>' + (b.userId ? '@' + esc(b.userId) : '') + '</span></div><button type="button" class="a-btn sm" onclick="NBCommunity.unblock(' + esc(JSON.stringify(k)) + ')">Unblock</button></div>';
            }).join('') : '<p class="cma-none">No blocked students. Tap a message in the chat and choose Block to block someone.</p>');
        }
    }
    NB.communitySetOpen = async function (on) {
        try { var S = await admSdk(); await S.set(S.ref(S.db, ROOT + '/settings'), { open: !!on, by: admEmail(), ts: Date.now() }); toast(on ? 'Community is ON' : 'Community is OFF'); }
        catch (e) { adm.denied = true; paintTop(); toast('Could not change the switch. Publish the community Firebase rules first.'); }
    };
    NB.communityUnblock = async function (uid) { var b = adm.blocked[uid] || {}; await NB.communityBlock(uid, b.name, b.userId); };
    NB.communityCopyRules = function () {
        var t = RULES(admEmail() || 'YOUR_ADMIN_EMAIL');
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Rules copied'); }).catch(function () { prompt('Copy these rules:', t); });
    };
    NB.communityAdminRender = async function (el) {
        if (!el) return;
        if (el.__cm && el.contains(el.__cm)) return;                          // already built: the dashboard re-renders often, do not rebuild
        el.innerHTML = '<div class="cma-wrap"><section class="a-card cma-top" id="cmaTop"><div class="a-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading community...</div></section>' +
            '<div class="cma-grid"><section class="a-card cma-chat"><div class="cma-ch"><span class="cm-ava"><i class="fa-solid fa-user-group"></i></span><div><b>Community chat</b><small>You can see every message. Tap a message to delete it or block the student.</small></div></div><div id="cmaHost" class="cma-host"></div></section>' +
            '<section class="a-card cma-bl" id="cmaBlocked"></section></div></div>';
        el.__cm = el.firstChild;
        try {
            var S = await admSdk(); adm.S = S; await NB.communityWatch();
            var u = S.auth.currentUser;
            if (adm.chat) { adm.chat.destroy(); adm.chat = null; }
            adm.chat = mkChat({ host: $('cmaHost'), S: S, admin: true, me: { uid: u.uid, name: 'Admin', userId: 'admin', cls: '' }, onBlock: function (uid, name, userId) { NB.communityBlock(uid, name, userId); } });
            paintTop();
        } catch (e) { var t = $('cmaTop'); if (t) t.innerHTML = '<div class="a-loading">' + esc(e.message || 'Could not open the community') + '</div>'; el.__cm = null; }
    };
    NB.communityReset = function () {
        try { if (adm.chat) adm.chat.destroy(); } catch (e) {}
        adm.un.forEach(function (u) { try { u(); } catch (e) {} });
        adm.chat = null; adm.un = []; adm.watching = false; adm.blocked = {}; adm.open = null; adm.denied = false; adm.S = null;
        var el = $('adminPanel-community'); if (el) { el.innerHTML = ''; el.__cm = null; }
    };
    (function () {                                             // wrap the admin logout once it exists
        var n = 0, w = setInterval(function () {
            if (window.adminLogout && !window.adminLogout.__cm) { var o = window.adminLogout; window.adminLogout = function () { NB.communityReset(); return o.apply(this, arguments); }; window.adminLogout.__cm = 1; clearInterval(w); }
            else if (++n > 60) clearInterval(w);
        }, 500);
    })();
    window.NBCommunity = { setOpen: NB.communitySetOpen, unblock: NB.communityUnblock, copyRules: NB.communityCopyRules, block: NB.communityBlock, isBlocked: NB.communityIsBlocked, watch: NB.communityWatch, adminRender: NB.communityAdminRender };

    /* ---------- entry points for students: home tile + menus ---------- */
    function addEntries() {
        var dl = document.querySelector('.qo-card[onclick*="openDownloads"]');
        if (dl && !document.getElementById('nbCmTile')) {
            var t = dl.cloneNode(true); t.id = 'nbCmTile'; t.setAttribute('onclick', 'NB.openCommunity()');
            var ic = t.querySelector('div > i'); if (ic) { ic.className = 'fa-solid fa-comments'; ic.parentNode.className = ic.parentNode.className.replace('bg-emerald-500', 'bg-pink-500'); }
            var h = t.querySelector('h4'), p = t.querySelector('p'); if (h) h.textContent = 'Community'; if (p) p.textContent = 'Chat, photos & videos with all students';
            dl.parentNode.insertBefore(t, dl.nextSibling);
        }
        var mm = document.querySelector('.nbm-i[onclick*="openDownloads"]');
        if (mm && !document.getElementById('nbCmMenu')) {
            var b = document.createElement('button'); b.type = 'button'; b.id = 'nbCmMenu'; b.className = 'nbm-i'; b.style.setProperty('--nbm-ic', '#ec4899');
            b.setAttribute('onclick', "closeModal('mobileMenuModal');NB.openCommunity()"); b.innerHTML = '<i class="fa-solid fa-comments"></i><span>Community</span>';
            mm.parentNode.insertBefore(b, mm.nextSibling);
        }
        var hm2 = document.querySelector('.nbh-mi[onclick*="\'dl\'"]');
        if (hm2 && !document.getElementById('nbCmHdr')) {
            var c = document.createElement('button'); c.type = 'button'; c.id = 'nbCmHdr'; c.className = 'nbh-mi'; c.setAttribute('role', 'menuitem'); c.style.setProperty('--nbh-ic', '#ec4899');
            c.setAttribute('onclick', 'NB.openCommunity()'); c.innerHTML = '<i class="ic fa-solid fa-comments" aria-hidden="true"></i><span>Community</span>';
            hm2.parentNode.insertBefore(c, hm2.nextSibling);
        }
    }
    /* every logged-in student is listed in the directory (so friends can be found by User ID), even before opening the community */
    function registerDir() {
        try {
            if (!NB.loggedIn || !NB.loggedIn()) return;
            var pr = NB.profile() || {}, sig = [pr.userId, pr.name, pr.cls].join('|');
            if (!pr.userId || localStorage.getItem('nb_dir_sig') === sig) return;
            studentSdk().then(function (S) {
                var u = S.auth.currentUser; if (!u) return;
                return S.set(S.ref(S.db, DIR + '/' + u.uid), { name: pr.name || 'Student', userId: pr.userId, cls: pr.cls || '', ts: Date.now() }).then(function () { localStorage.setItem('nb_dir_sig', sig); });
            }).catch(function () {});
        } catch (e) {}
    }
    setTimeout(registerDir, 7000); setInterval(registerDir, 5 * 60 * 1000);
    function init() { addEntries(); var n = 0, w = setInterval(function () { addEntries(); if (++n > 20) clearInterval(w); }, 500); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
