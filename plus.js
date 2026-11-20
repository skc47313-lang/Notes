/* Notes Bazar - plus.js  (extra student features; styles are in plus.css)
   1) Profile: Level + badges, streak calendar, mock-test progress graph, saved folders, share-my-progress card
   2) Home: "Continue reading" card              3) Voice search (mic) in the search boxes
   4) Mobile: pull-down to refresh, tiny tap vibration
   It only reads the data the site already keeps (days, downloads, saved, tests) and never changes how the site works. */
(function () {
    'use strict';
    var NB = window.NB = window.NB || {};
    var $ = function (id) { return document.getElementById(id); };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function arr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    /* ------------------------------------------------------------------ numbers shown in the profile */
    function stats() {
        var days = arr(jget('nb_days', [])).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); });
        var dl = Object.keys(jget('nb_dlhist', {}) || {}).length;
        var saved = arr(jget('nb_favs', [])).length;
        var tests = arr(jget('nb_quiz', []));
        var best = 0, cur = 0;
        try { best = NB.bestStreak ? NB.bestStreak() : 0; cur = NB.streak ? NB.streak() : 0; } catch (e) {}
        var pomo = 0, po = jget('nb_pomo', {}); Object.keys(po || {}).forEach(function (k) { pomo += +po[k] || 0; });
        var top = 0; tests.forEach(function (t) { if (t && t.total) top = Math.max(top, t.score / t.total); });
        return { days: days, dl: dl, saved: saved, tests: tests, best: best, cur: cur, top: top, pomo: pomo };
    }
    function levelOf(s) {
        var xp = s.days.length * 10 + s.dl * 5 + s.tests.length * 15 + s.saved * 2 + s.best * 5 + s.pomo * 3;
        var L = Math.floor(Math.sqrt(xp / 25)) + 1, lo = (L - 1) * (L - 1) * 25, hi = L * L * 25;
        return { xp: xp, level: L, pct: Math.max(0, Math.min(100, Math.round((xp - lo) / (hi - lo) * 100))), next: hi - xp };
    }
    var TITLES = ['Beginner', 'Learner', 'Explorer', 'Achiever', 'Scholar', 'Topper', 'Champion', 'Legend'];
    function badges(s) {
        return [
            ['🔥', '3-day streak', s.best >= 3], ['⚡', 'Week warrior', s.best >= 7], ['🏆', 'Month master', s.best >= 30],
            ['📥', 'First download', s.dl >= 1], ['📚', 'Collector', s.dl >= 10], ['❤️', 'Bookworm', s.saved >= 5],
            ['📝', 'Test taker', s.tests.length >= 1], ['🎯', 'Quiz pro', s.tests.length >= 10], ['🌟', 'High scorer', s.top >= 0.9], ['⏱️', 'Focus starter', s.pomo >= 1], ['🧠', 'Deep focus', s.pomo >= 25]
        ];
    }

    /* ------------------------------------------------------------------ profile cards */
    var calMonth = null;
    function cardLevel(s) {
        var lv = levelOf(s), b = badges(s), got = b.filter(function (x) { return x[2]; }).length;
        var h = '<div class="plx-top"><div class="plx-lvl">' + lv.level + '</div><div class="plx-lt"><b>Level ' + lv.level + ' · ' + TITLES[Math.min(TITLES.length - 1, Math.floor((lv.level - 1) / 2))] + '</b><small>' + lv.xp + ' XP · ' + lv.next + ' XP to next level</small></div></div>' +
            '<div class="plx-bar"><i style="width:' + lv.pct + '%"></i></div>' +
            '<div class="plx-sub">Badges <em>' + got + '/' + b.length + '</em></div><div class="plx-badges">';
        b.forEach(function (x) { h += '<span class="plx-b' + (x[2] ? ' on' : '') + '" title="' + esc(x[1]) + '"><i>' + x[0] + '</i><small>' + esc(x[1]) + '</small></span>'; });
        return h + '</div>';
    }
    function cardCal(s) {
        var now = new Date(); if (!calMonth) calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        var y = calMonth.getFullYear(), m = calMonth.getMonth(), first = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
        var set = {}; s.days.forEach(function (d) { set[d] = 1; });
        var h = '<div class="plx-ch"><b><i class="fa-solid fa-fire"></i> Study calendar</b><span><button type="button" data-plx="calPrev" aria-label="Previous month">‹</button><em>' + MON[m] + ' ' + y + '</em><button type="button" data-plx="calNext" aria-label="Next month">›</button></span></div>' +
            '<div class="plx-streaks"><span><b>' + s.cur + '</b> current streak</span><span><b>' + s.best + '</b> best streak</span><span><b>' + s.days.length + '</b> days studied</span></div>' +
            '<div class="plx-cal">';
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (d) { h += '<small>' + d + '</small>'; });
        for (var i = 0; i < first; i++) h += '<span></span>';
        var tk = key(now);
        for (var d = 1; d <= dim; d++) {
            var k = y + '-' + pad(m + 1) + '-' + pad(d);
            h += '<span class="' + (set[k] ? 'on' : '') + (k === tk ? ' today' : '') + '">' + d + '</span>';
        }
        return h + '</div>';
    }
    function cardGraph(s) {
        var t = s.tests.filter(function (x) { return x && x.total; }).slice(0, 12).reverse();
        if (t.length < 2) return '<div class="plx-ch"><b><i class="fa-solid fa-chart-line"></i> Mock test progress</b></div><p class="plx-empty">' + (t.length ? 'Take one more test to see your progress line.' : 'Take a mock test and your score graph will appear here.') + '</p>';
        var W = 300, H = 90, P = 8, pts = t.map(function (x, i) { return { x: P + i * (W - 2 * P) / (t.length - 1), y: H - P - (x.score / x.total) * (H - 2 * P), p: Math.round(x.score / x.total * 100) }; });
        var line = pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
        var avg = Math.round(pts.reduce(function (a, p) { return a + p.p; }, 0) / pts.length);
        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="plx-svg" role="img" aria-label="Test scores over time"><polyline points="' + P + ',' + H + ' ' + line + ' ' + (W - P) + ',' + H + '" class="plx-area"/><polyline points="' + line + '" class="plx-line"/>';
        pts.forEach(function (p) { svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.2"/>'; });
        svg += '</svg>';
        var by = {};
        s.tests.forEach(function (x) { if (!x || !x.total) return; var n = String(x.subj || '').replace(/^AI\s*·\s*/, '').trim(); if (!n) return; (by[n] = by[n] || []).push(x.score / x.total); });
        var rows = Object.keys(by).map(function (n) { return { n: n, p: Math.round(by[n].reduce(function (a, b) { return a + b; }, 0) / by[n].length * 100), c: by[n].length }; }).sort(function (a, b) { return b.p - a.p; });
        var sub = '';
        if (rows.length >= 2) {
            var strong = rows.slice(0, 2), weak = rows.slice(-2).reverse().filter(function (r) { return strong.indexOf(r) < 0; });
            sub = '<div class="plx-sw">' + strong.map(function (r) { return '<span class="g">💪 ' + esc(r.n.slice(0, 22)) + ' · ' + r.p + '%</span>'; }).join('') + weak.map(function (r) { return '<span class="r">🎯 Practise ' + esc(r.n.slice(0, 22)) + ' · ' + r.p + '%</span>'; }).join('') + '</div>';
        }
        return '<div class="plx-ch"><b><i class="fa-solid fa-chart-line"></i> Mock test progress</b><em>Average ' + avg + '%</em></div>' + svg + sub;
    }

    function build() {
        var pf = $('nbPf'); if (!pf) return;
        var list = pf.querySelector('.nbp-list'); if (!list) return;
        var s = stats();
        var w = $('plxWrap');
        if (!w) {
            w = document.createElement('div'); w.id = 'plxWrap'; w.className = 'plx-wrap';
            w.innerHTML = '<button type="button" class="nbp-row" data-plx="folders"><i class="fa-regular fa-folder-open"></i><div><b>Saved folders</b><small id="plxFolderSub">Sort saved notes into your own folders</small></div></button>' +
                '<button type="button" class="nbp-row" data-plx="share"><i class="fa-solid fa-share-nodes"></i><div><b>Share my progress</b><small>Make a picture of your streak and level</small></div></button>' +
                '<section class="plx-card plx-cloud" id="plxCloud" hidden></section><section class="plx-card" id="plxLevel"></section><section class="plx-card" id="plxCal"></section><section class="plx-card" id="plxGraph"></section><section class="plx-card" id="plxBoard"></section>';
            list.appendChild(w);
            w.addEventListener('click', function (e) {
                var b = e.target.closest('[data-plx]'); if (!b) return;
                var a = b.dataset.plx;
                if (a === 'calPrev') { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); $('plxCal').innerHTML = cardCal(stats()); }
                else if (a === 'calNext') { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); $('plxCal').innerHTML = cardCal(stats()); }
                else if (a === 'folders') openFolders();
                else if (a === 'share') shareCard();
                else if (a === 'cloudRetry') { try { NB.pull && NB.pull('cloud'); } catch (e) {} NB.toast('Trying again…', 1800); setTimeout(build, 2500); }
                else if (a === 'boardJoin') { jset('nb_board_on', 1); boardSync(true); }
                else if (a === 'boardLeave') { jset('nb_board_on', 0); paintBoard(null); }
                else if (a === 'boardRefresh') boardSync(true);
            });
        }
        paintCloud(); paintBoard(boardCache); $('plxLevel').innerHTML = cardLevel(s); $('plxCal').innerHTML = cardCal(s); $('plxGraph').innerHTML = cardGraph(s);
        var fo = jget('nb_folders', {}), n = Object.keys(fo).length, fs = $('plxFolderSub'); if (fs) fs.textContent = n ? n + (n === 1 ? ' folder' : ' folders') + ' · tap to open' : 'Sort saved notes into your own folders';
    }

    /* ------------------------------------------------------------------ saved folders */
    function itemById(id) { return (window.allItems || []).filter(function (i) { return i.id === id; })[0]; }
    function openFolders() {
        var m = $('plxFo');
        if (!m) {
            m = document.createElement('div'); m.className = 'nbo plx-fo'; m.id = 'plxFo'; m.setAttribute('aria-hidden', 'true');
            m.innerHTML = '<div class="nbo-card plx-fc" role="dialog" aria-modal="true" aria-label="Saved folders"><button type="button" class="nbo-x" id="plxFoX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
                '<h3 class="nbo-h">Saved folders</h3><p class="nbo-sub">Put your saved notes in folders like "Exam" or "Revise later".</p>' +
                '<div class="plx-new"><input id="plxFoName" class="nbo-in" maxlength="24" placeholder="New folder name" autocomplete="off"><button type="button" class="nbo-save" id="plxFoAdd">Create</button></div><div id="plxFoList"></div></div>';
            document.body.appendChild(m);
            $('plxFoX').addEventListener('click', function () { NB.close('plxFo'); });
            $('plxFoAdd').addEventListener('click', function () { var i = $('plxFoName'), v = i.value.replace(/[.$#\[\]\/\u0000-\u001f]/g, '').trim().slice(0, 24); if (!v) return; var f = jget('nb_folders', {}); if (!f[v]) f[v] = []; jset('nb_folders', f); i.value = ''; paintFolders(); build(); });
            $('plxFoName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('plxFoAdd').click(); } });
            m.addEventListener('click', function (e) {
                var b = e.target.closest('[data-fa]'); if (!b) return;
                var f = jget('nb_folders', {}), nm = b.dataset.f, id = b.dataset.id, a = b.dataset.fa;
                if (a === 'del') { if (confirm('Delete folder "' + nm + '"? Your saved notes stay saved.')) delete f[nm]; }
                else if (a === 'rm') f[nm] = (f[nm] || []).filter(function (x) { return x !== id; });
                else if (a === 'add') { f[nm] = f[nm] || []; if (f[nm].indexOf(id) < 0) f[nm].push(id); }
                else if (a === 'open') { NB.close('plxFo'); NB.close('nbPf'); (window.nbEnsureItems ? window.nbEnsureItems([id]) : Promise.resolve()).then(function () { if (window.openPreview) window.openPreview(id); }); return; }
                else if (a === 'toggle') { open[nm] = !open[nm]; paintFolders(); return; }
                jset('nb_folders', f); paintFolders(); build();
            });
        }
        paintFolders(); NB.open('plxFo');
        var need = arr(jget('nb_favs', [])).concat([].concat.apply([], Object.keys(jget('nb_folders', {})).map(function (k) { return jget('nb_folders', {})[k]; })));
        if (window.nbEnsureItems && need.length) window.nbEnsureItems(need).then(paintFolders);
    }
    var open = {};
    function title(id) { var i = itemById(id); return (i && (i.title || i.name || i.subject)) || 'Saved note'; }
    function paintFolders() {
        var box = $('plxFoList'); if (!box) return;
        var f = jget('nb_folders', {}), favs = arr(jget('nb_favs', [])), names = Object.keys(f);
        if (!names.length) { box.innerHTML = '<p class="plx-empty">No folders yet. Type a name above and tap Create.</p>'; return; }
        box.innerHTML = names.map(function (nm) {
            var ids = arr(f[nm]), isOpen = !!open[nm];
            var h = '<div class="plx-fol"><div class="plx-fh"><button type="button" data-fa="toggle" data-f="' + esc(nm) + '"><i class="fa-solid fa-folder' + (isOpen ? '-open' : '') + '"></i><b>' + esc(nm) + '</b><em>' + ids.length + '</em></button><button type="button" class="plx-del" data-fa="del" data-f="' + esc(nm) + '" aria-label="Delete folder"><i class="fa-regular fa-trash-can"></i></button></div>';
            if (isOpen) {
                h += '<div class="plx-fb">';
                h += ids.length ? ids.map(function (id) { return '<div class="plx-it"><button type="button" data-fa="open" data-id="' + esc(id) + '">' + esc(title(id)) + '</button><button type="button" data-fa="rm" data-f="' + esc(nm) + '" data-id="' + esc(id) + '" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></div>'; }).join('') : '<p class="plx-empty">Empty folder.</p>';
                var cand = favs.filter(function (id) { return ids.indexOf(id) < 0; });
                if (cand.length) h += '<div class="plx-addh">Add from saved</div>' + cand.map(function (id) { return '<button type="button" class="plx-pick" data-fa="add" data-f="' + esc(nm) + '" data-id="' + esc(id) + '"><i class="fa-solid fa-plus"></i> ' + esc(title(id)) + '</button>'; }).join('');
                else if (!favs.length) h += '<p class="plx-empty">Save some notes with the heart first.</p>';
                h += '</div>';
            }
            return h + '</div>';
        }).join('');
    }

    /* ------------------------------------------------------------------ share my progress (picture) */
    function wrap(ctx, text, x, y, mw, lh) { var words = String(text).split(' '), line = ''; words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > mw && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = t; }); ctx.fillText(line, x, y); return y; }
    function shareCard() {
        var s = stats(), lv = levelOf(s), p = (NB.profile && NB.profile()) || {}, cs = getComputedStyle(document.documentElement);
        var c1 = (cs.getPropertyValue('--theme-primary') || '#6366f1').trim() || '#6366f1', c2 = (cs.getPropertyValue('--theme-secondary') || '#a855f7').trim() || '#a855f7';
        var cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; var x = cv.getContext('2d');
        var g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
        x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(940, 160, 280, 0, 7); x.fill(); x.beginPath(); x.arc(110, 1230, 320, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '800 54px system-ui,Segoe UI,Roboto,sans-serif'; x.fillText('Notes Bazar', 540, 130);
        x.font = '500 32px system-ui,sans-serif'; x.globalAlpha = .85; x.fillText('Student study hub', 540, 178); x.globalAlpha = 1;
        x.font = '800 60px system-ui,sans-serif'; wrap(x, p.name || 'My progress', 540, 330, 900, 70);
        x.font = '500 34px system-ui,sans-serif'; x.globalAlpha = .9; x.fillText((p.cls || '') + ' · Level ' + lv.level, 540, 400); x.globalAlpha = 1;
        x.font = '800 300px system-ui,sans-serif'; x.fillText(String(s.cur), 540, 700);
        x.font = '600 48px system-ui,sans-serif'; x.fillText('🔥 day streak', 540, 780);
        var items = [[s.best, 'Best streak'], [s.dl, 'Downloads'], [s.tests.length, 'Tests'], [s.saved, 'Saved']];
        items.forEach(function (it, i) { var cx = 150 + i * 260; x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); (x.roundRect || x.rect).call(x, cx - 105, 900, 210, 190, 28); x.fill(); x.fillStyle = '#fff'; x.font = '800 70px system-ui,sans-serif'; x.fillText(String(it[0]), cx, 1000); x.font = '500 26px system-ui,sans-serif'; x.fillText(it[1], cx, 1050); });
        x.font = '600 34px system-ui,sans-serif'; x.globalAlpha = .9; x.fillText('Study with me on Notes Bazar', 540, 1230); x.font = '500 28px system-ui,sans-serif'; x.fillText('skc47313-lang.github.io/Notes', 540, 1280); x.globalAlpha = 1;
        cv.toBlob(function (b) {
            if (!b) return;
            var file = new File([b], 'my-notes-bazar-progress.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) { navigator.share({ files: [file], title: 'My Notes Bazar progress' }).catch(function () {}); return; }
            var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'my-notes-bazar-progress.png'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
            NB.toast && NB.toast('Picture saved. Share it with your friends!', 2800);
        }, 'image/png');
    }

    /* ------------------------------------------------------------------ continue reading (home) */
    function remember(id) {
        var it = itemById(id); if (!it || it.private) return;
        try { logOpen(id); } catch (e) {}
        jset('nb_cont', { id: id, title: it.title || 'Study material', type: it.type || 'note', cls: it.className || '', sub: it.subject || '', t: Date.now() });
        paintCont(); paintGoal(true);
    }
    function paintCont() {
        var c = jget('nb_cont', null), box = $('plxCont'), home = $('homeView');
        if (!home) return;
        if (!c || !c.id) { if (box) box.remove(); return; }
        if (!box) { box = document.createElement('section'); box.id = 'plxCont'; box.className = 'plx-cont'; var first = home.firstElementChild; home.insertBefore(box, first); }
        var ic = c.type === 'book' ? 'fa-book' : c.type === 'pyq' ? 'fa-file-circle-question' : 'fa-file-lines';
        box.innerHTML = '<button type="button" id="plxContGo"><span class="plx-ci"><i class="fa-solid ' + ic + '"></i></span><span class="plx-ct"><small>Continue reading</small><b>' + esc(c.title) + '</b><em>' + esc([c.cls, c.sub].filter(Boolean).join(' · ')) + '</em></span><i class="fa-solid fa-arrow-right plx-go"></i></button>' +
            '<button type="button" class="plx-cx" id="plxContX" aria-label="Hide"><i class="fa-solid fa-xmark"></i></button>';
        $('plxContGo').onclick = function () { (window.nbEnsureItems ? window.nbEnsureItems([c.id]) : Promise.resolve()).then(function () { if (itemById(c.id) && window.openPreview) window.openPreview(c.id); else NB.toast && NB.toast('This item is no longer available.', 2400); }); };
        $('plxContX').onclick = function () { try { localStorage.removeItem('nb_cont'); } catch (e) {} paintCont(); };
    }

    /* ------------------------------------------------------------------ voice search */
    function voice() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
        ['homeSearchInput', 'notesSearchInput', 'booksSearchInput', 'pyqSearchInput'].forEach(function (id) {
            var inp = $(id); if (!inp || inp.__plx) return; inp.__plx = 1;
            var par = inp.parentElement; if (!par) return;
            if (getComputedStyle(par).position === 'static') par.style.position = 'relative';
            var b = document.createElement('button'); b.type = 'button'; b.className = 'plx-mic'; b.setAttribute('aria-label', 'Search by voice'); b.title = 'Search by voice'; b.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            par.appendChild(b); inp.classList.add('plx-has-mic');
            var rec = null;
            b.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                if (rec) { try { rec.stop(); } catch (x) {} return; }
                try {
                    rec = new SR(); rec.lang = (document.documentElement.lang === 'hi' ? 'hi-IN' : 'en-IN'); rec.interimResults = false; rec.maxAlternatives = 1;
                    rec.onresult = function (ev) { var t = ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : ''; if (t) { inp.value = t.replace(/[.?!]+$/, ''); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); } };
                    rec.onerror = function (ev) { if (ev && /not-allowed|service-not-allowed/.test(ev.error)) NB.toast && NB.toast('Allow the microphone to search by voice.', 3000); };
                    rec.onend = function () { rec = null; b.classList.remove('on'); };
                    b.classList.add('on'); rec.start();
                } catch (x) { rec = null; b.classList.remove('on'); }
            });
        });
    }

    /* ------------------------------------------------------------------ pull down to refresh + tap vibration (touch screens) */
    function touchBits() {
        if (!('ontouchstart' in window)) return;
        var ind = document.createElement('div'); ind.id = 'plxPtr'; ind.setAttribute('aria-hidden', 'true'); ind.innerHTML = '<i class="fa-solid fa-arrow-down"></i>'; document.body.appendChild(ind);
        var y0 = 0, dy = 0, on = false, busy = false, TH = 80;
        function blocked(t) { return document.body.classList.contains('modal-open') || document.querySelector('.nbo.open') || document.querySelector('.fixed[id$="Modal"]:not(.hidden)') || (t && t.closest && t.closest('textarea,input,select,[contenteditable],.overflow-y-auto,.overflow-auto')); }
        document.addEventListener('touchstart', function (e) { on = false; dy = 0; if (busy || e.touches.length !== 1 || (window.pageYOffset || 0) > 0 || blocked(e.target)) return; y0 = e.touches[0].clientY; on = true; }, { passive: true });
        document.addEventListener('touchmove', function (e) {
            if (!on) return; dy = e.touches[0].clientY - y0;
            if (dy <= 0 || (window.pageYOffset || 0) > 0) { ind.style.opacity = 0; return; }
            var d = Math.min(dy * .5, 110); ind.style.opacity = Math.min(1, d / 50); ind.style.transform = 'translate(-50%,' + (d - 40) + 'px) rotate(' + (d >= TH * .5 ? 180 : 0) + 'deg)';
        }, { passive: true });
        document.addEventListener('touchend', function () {
            if (!on) return; on = false;
            if (dy * .5 >= TH * .5 && !busy) {
                busy = true; ind.classList.add('spin'); ind.innerHTML = '<i class="fa-solid fa-rotate"></i>'; ind.style.transform = 'translate(-50%,28px)'; ind.style.opacity = 1;
                try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
                try { if (window.loadCloudData) window.loadCloudData(); if (NB.pull) NB.pull('cloud'); } catch (e) {}
                setTimeout(function () { ind.classList.remove('spin'); ind.style.opacity = 0; ind.style.transform = 'translate(-50%,-60px)'; ind.innerHTML = '<i class="fa-solid fa-arrow-down"></i>'; busy = false; NB.toast && NB.toast('Updated ✅', 1400); }, 1100);
            } else { ind.style.opacity = 0; ind.style.transform = 'translate(-50%,-60px)'; }
        }, { passive: true });
        var lastV = 0;
        document.addEventListener('pointerdown', function (e) {
            if (e.pointerType !== 'touch' || localStorage.getItem('nb_haptic') === '0' || !navigator.vibrate) return;
            var t = e.target && e.target.closest ? e.target.closest('button,[role="button"],.nbp-row,.nbh-tab,.plx-b') : null; if (!t) return;
            var n = Date.now(); if (n - lastV < 80) return; lastV = n; try { navigator.vibrate(6); } catch (x) {}
        }, { passive: true });
    }

    /* ------------------------------------------------------------------ start */
    /* ------------------------------------------------------------------ cloud-sync warning (profile) */
    function paintCloud() {
        var c = $('plxCloud'); if (!c) return;
        var signed = false; try { signed = !!(NB.acct && NB.acct()) || !!jget('nb_acct', null); } catch (e) {}
        if (NB.cloudOk === false) {
            c.hidden = false;
            c.innerHTML = '<div class="plx-warn"><i class="fa-solid fa-cloud-bolt"></i><div><b>Cloud sync is off</b><small>Your streak and history are saved only on this device right now. The site admin has to publish the Firebase rules once.</small></div><button type="button" data-plx="cloudRetry">Try again</button></div>';
        } else if (!c.hidden) { c.hidden = true; c.innerHTML = ''; }
    }

    /* ------------------------------------------------------------------ weekly leaderboard (opt-in, name + points only) */
    var boardCache = null, boardBusy = false;
    function weekKey(d) { d = d || new Date(); var t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var dow = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dow); return key(t); }
    function weekPoints() {
        var wk = weekKey(), pts = 0, d0 = new Date(wk + 'T00:00:00');
        var days = arr(jget('nb_days', [])), po = jget('nb_pomo', {}), lg = jget('nb_goal_log', {});
        for (var i = 0; i < 7; i++) { var d = new Date(d0); d.setDate(d0.getDate() + i); var k = key(d);
            if (days.indexOf(k) >= 0) pts += 10; pts += 5 * (+(po && po[k]) || 0); pts += 3 * arr(lg && lg[k]).length; }
        return pts;
    }
    var DBURL = 'https://notes-market-d309b-default-rtdb.firebaseio.com';
    async function boardSync(show) {
        if (boardBusy || !jget('nb_board_on', 0)) return paintBoard(boardCache); boardBusy = true;
        try {
            var a = NB.authInfo ? await NB.authInfo() : null;
            if (!a) { boardCache = { err: 'login' }; return paintBoard(boardCache); }
            var me = (NB.profile && NB.profile()) || {}, wk = weekKey();
            var put = await fetch(DBURL + '/notes_bazar_board/' + a.uid + '.json?auth=' + encodeURIComponent(a.token), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n: String(me.name || 'Student').slice(0, 24), p: weekPoints(), w: wk, t: Date.now() }) });
            if (!put.ok) { boardCache = { err: put.status === 401 || put.status === 403 ? 'rules' : 'net' }; return paintBoard(boardCache); }
            var r = await fetch(DBURL + '/notes_bazar_board.json?auth=' + encodeURIComponent(a.token));
            if (!r.ok) { boardCache = { err: 'rules' }; return paintBoard(boardCache); }
            var all = await r.json() || {}, rows = Object.keys(all).map(function (u) { var v = all[u] || {}; return { u: u, n: v.n, p: +v.p || 0, w: v.w }; }).filter(function (x) { return x.w === wk && x.n; }).sort(function (x, y) { return y.p - x.p; });
            boardCache = { rows: rows.slice(0, 10), me: a.uid, rank: rows.findIndex(function (x) { return x.u === a.uid; }) + 1, total: rows.length };
        } catch (e) { boardCache = { err: 'net' }; }
        boardBusy = false; paintBoard(boardCache);
    }
    function paintBoard(b) {
        var el = $('plxBoard'); if (!el) return;
        var h = '<div class="plx-ch"><b><i class="fa-solid fa-ranking-star"></i> Weekly leaderboard</b>';
        if (!jget('nb_board_on', 0)) { el.innerHTML = h + '</div><p class="plx-note">Compete with other students this week. Only your name and points are shown. Points: 10 per study day, 5 per focus session, 3 per note opened.</p><button type="button" class="plx-btn" data-plx="boardJoin">Join leaderboard</button>'; return; }
        h += '<span><button type="button" data-plx="boardRefresh" aria-label="Refresh"><i class="fa-solid fa-rotate"></i></button></span></div>';
        if (!b) { el.innerHTML = h + '<p class="plx-note">Loading…</p>'; boardSync(); return; }
        if (b.err === 'rules') { el.innerHTML = h + '<p class="plx-note">Leaderboard is not enabled yet. The site admin has to add the <code>notes_bazar_board</code> rule in Firebase.</p><button type="button" class="plx-btn ghost" data-plx="boardLeave">Hide</button>'; return; }
        if (b.err) { el.innerHTML = h + '<p class="plx-note">' + (b.err === 'login' ? 'Log in to join the leaderboard.' : 'Could not load right now. Check your internet.') + '</p><button type="button" class="plx-btn ghost" data-plx="boardLeave">Hide</button>'; return; }
        var medal = ['🥇', '🥈', '🥉'];
        h += '<ol class="plx-lb">' + b.rows.map(function (r, i) { return '<li' + (r.u === b.me ? ' class="me"' : '') + '><span>' + (medal[i] || (i + 1)) + '</span><b>' + esc(r.n) + (r.u === b.me ? ' (you)' : '') + '</b><em>' + r.p + ' pts</em></li>'; }).join('') + '</ol>';
        h += '<p class="plx-note">' + (b.rank ? 'Your rank this week: #' + b.rank + ' of ' + b.total : 'Open a note to get on the board.') + ' · resets every Monday</p><button type="button" class="plx-btn ghost" data-plx="boardLeave">Leave</button>';
        el.innerHTML = h;
    }

    /* ------------------------------------------------------------------ home: daily goal ring + study nudge */
    function logOpen(id) {
        var lg = jget('nb_goal_log', {}), k = key(new Date()), a = arr(lg[k]);
        if (a.indexOf(id) < 0) { a.push(id); lg[k] = a; var ks = Object.keys(lg).sort(); while (ks.length > 14) delete lg[ks.shift()]; jset('nb_goal_log', lg); }
    }
    function goalState() {
        var n = +jget('nb_goal', 2) || 2, c = arr((jget('nb_goal_log', {}) || {})[key(new Date())]).length;
        return { n: n, c: c, done: c >= n };
    }
    function confetti() {
        if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        var box = document.createElement('div'); box.className = 'plx-conf'; var cols = ['#7c3aed', '#a855f7', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
        for (var i = 0; i < 44; i++) { var p = document.createElement('i'); p.style.cssText = 'left:' + (Math.random() * 100) + '%;background:' + cols[i % 6] + ';animation-delay:' + (Math.random() * .4) + 's;animation-duration:' + (1.4 + Math.random() * 1.1) + 's;transform:rotate(' + (Math.random() * 360) + 'deg)'; box.appendChild(p); }
        document.body.appendChild(box); setTimeout(function () { box.remove(); }, 3000);
    }
    function paintGoal(celebrate) {
        var home = $('homeView'); if (!home) return;
        var g = goalState(), el = $('plxGoal');
        if (!el) { el = document.createElement('section'); el.id = 'plxGoal'; el.className = 'plx-goal'; home.insertBefore(el, home.firstChild);
            el.addEventListener('click', function (e) { if (e.target.closest('[data-goal]')) { var o = [1, 2, 3, 5], n = +jget('nb_goal', 2) || 2; jset('nb_goal', o[(o.indexOf(n) + 1) % o.length]); paintGoal(); } else if (e.target.closest('[data-remind]')) remindOn(); }); }
        var r = 24, C = 2 * Math.PI * r, off = C * (1 - Math.min(1, g.c / g.n));
        var hr = new Date().getHours(), late = !g.done && hr >= 17;
        var rem = ('Notification' in window) && Notification.permission !== 'denied' && !jget('nb_remind', 0) ? '<button type="button" class="plx-gb" data-remind>🔔 Remind me</button>' : '';
        el.className = 'plx-goal' + (g.done ? ' done' : '');
        el.innerHTML = '<svg viewBox="0 0 60 60" width="58" height="58" aria-hidden="true"><circle cx="30" cy="30" r="' + r + '" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="6"/><circle cx="30" cy="30" r="' + r + '" fill="none" stroke="url(#plxG)" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 30 30)"/><defs><linearGradient id="plxG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs></svg>' +
            '<div class="plx-gt"><b>' + (g.done ? 'Daily goal done! 🎉' : 'Today\'s goal') + '</b><small>' + Math.min(g.c, g.n) + ' / ' + g.n + ' notes opened' + (late ? ' · evening reminder: finish it today' : '') + '</small></div>' +
            rem + '<button type="button" class="plx-gb" data-goal aria-label="Change daily goal">Goal: ' + g.n + '</button>';
        if (celebrate && g.done && jget('nb_goal_done', '') !== key(new Date())) { jset('nb_goal_done', key(new Date())); confetti(); NB.toast('Daily goal complete! Keep the streak going 🔥', 3200); }
    }
    function remindOn() {
        if (!('Notification' in window)) { NB.toast('This browser does not support reminders.', 2600); return; }
        Notification.requestPermission().then(function (p) { if (p === 'granted') { jset('nb_remind', 1); NB.toast('Reminder on. Keep the site open in a tab and I will nudge you at 8 PM.', 3600); armReminder(); } paintGoal(); });
    }
    var remT = 0;
    function armReminder() {
        clearTimeout(remT);
        if (!jget('nb_remind', 0) || !('Notification' in window) || Notification.permission !== 'granted') return;
        var now = new Date(), at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0), ms = at - now;
        if (ms < 0 || ms > 20 * 3600e3) return;
        remT = setTimeout(function () {
            var g = goalState(); if (g.done || jget('nb_rem_d', '') === key(new Date())) return;
            jset('nb_rem_d', key(new Date()));
            var body = 'Your daily goal is still pending (' + g.c + '/' + g.n + '). Open a note to keep your ' + (NB.streak ? NB.streak() : 0) + '-day streak!';
            try { if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (r) { r.showNotification('Notes Bazar', { body: body, icon: 'icon-192.png', tag: 'nb-goal' }); }); else new Notification('Notes Bazar', { body: body }); } catch (e) { try { new Notification('Notes Bazar', { body: body }); } catch (e2) {} }
        }, ms);
    }

    function boot() {
        var mo = new MutationObserver(function () {
            var pf = $('nbPf');
            if (pf && !pf.__plx) { pf.__plx = 1; new MutationObserver(function () { if (pf.classList.contains('open')) { calMonth = null; build(); } }).observe(pf, { attributes: true, attributeFilter: ['class'] }); if (pf.classList.contains('open')) { calMonth = null; build(); } }
            if ($('homeView') && !$('plxCont') && jget('nb_cont', null)) paintCont();
            if ($('homeView') && !$('plxGoal')) paintGoal();
            voice();
        });
        mo.observe(document.body, { childList: true, subtree: true });
        var tries = 0, t = setInterval(function () {      // wrap openPreview as soon as the main script has defined it
            if (window.openPreview && !window.openPreview.__plx) {
                var o = window.openPreview; var w = function (id) { var r = o.apply(this, arguments); try { remember(id); } catch (e) {} return r; }; w.__plx = 1; window.openPreview = w; clearInterval(t);
            } else if (++tries > 100) clearInterval(t);
        }, 150);
        paintCont(); paintGoal(); armReminder(); voice(); touchBits();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
