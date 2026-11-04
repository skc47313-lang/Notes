/* =====================================================================
   Notes Bazar - Student Dashboard 2.0 (additive module)
   Adds: home dashboard (welcome, XP, Today's Goal, Continue Learning,
   Performance, Weak Topics, Recent Activity), Pomodoro timer, Syllabus
   tracker, Habit tracker, mobile bottom navigation, Bazar AI desktop layout.
   Reads existing localStorage keys only; never changes other features.
   ===================================================================== */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var DAY = 86400000;
    function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function arr(x) { return Array.isArray(x) ? x : []; }
    function toast(m, ms) { if (window.nbToast) window.nbToast(m, ms); }
    function NB() { return window.NB || {}; }

    /* ---------- data readers ---------- */
    function profile() { try { return (NB().profile && NB().profile()) || null; } catch (e) { return null; } }
    function days() { return arr(jget('nb_days', [])); }
    function streak() { try { return NB().streak ? NB().streak() : 0; } catch (e) { return 0; } }
    function quiz() { return arr(jget('nb_quiz', [])); }
    function dlCount() { var o = jget('nb_dlhist', {}); return o && typeof o === 'object' ? Object.keys(o).length : 0; }
    function todos() { var o = jget('nb_todo', {}); return arr(o && o.items); }
    function itemById(id) { return arr(window.allItems).filter(function (i) { return i.id === id; })[0] || null; }
    function xp() {
        var q = quiz().reduce(function (a, r) { return a + (+r.score || 0) * 2; }, 0);
        return days().length * 10 + dlCount() * 5 + q;
    }
    function level(x) { return Math.floor(x / 200) + 1; }
    function greet() {
        var h = new Date().getHours();
        return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
    }
    var TIPS = [
        'One chapter today is one worry less on exam day.',
        'Revise what you studied yesterday for 10 minutes first.',
        'Short, daily sessions beat one long night before the exam.',
        'Solve one previous-year paper this week.',
        'Wrong answers are the fastest way to learn. Review them!'
    ];

    /* ---------- weak topics from quiz history ---------- */
    function weakTopics() {
        var m = {};
        quiz().forEach(function (r) {
            var k = String(r.subj || 'General'); if (!r.total) return;
            var o = m[k] || (m[k] = { s: 0, t: 0, n: 0 }); o.s += +r.score || 0; o.t += +r.total || 0; o.n++;
        });
        return Object.keys(m).map(function (k) { return { subj: k, acc: Math.round(m[k].s * 100 / m[k].t), n: m[k].n }; })
            .filter(function (x) { return x.acc < 60; }).sort(function (a, b) { return a.acc - b.acc; }).slice(0, 3);
    }

    /* ---------- dashboard markup ---------- */
    function ring(pct, label, sub) {
        var r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
        return '<div class="d2-ring" role="img" aria-label="' + esc(label) + ' ' + pct + '%"><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="' + r + '" class="d2-rt"/><circle cx="32" cy="32" r="' + r + '" class="d2-rp" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 32 32)"/></svg><b>' + pct + '%</b></div>' +
            '<div class="d2-ringt"><b>' + esc(label) + '</b><small>' + esc(sub) + '</small></div>';
    }
    function goalCard() {
        var k = dkey(), list = todos().filter(function (t) { return t.d === k; });
        var done = list.filter(function (t) { return t.done; }).length, pct = list.length ? Math.round(done * 100 / list.length) : 0;
        var rows = list.slice(0, 3).map(function (t) { return '<li class="' + (t.done ? 'on' : '') + '"><i class="fa-solid ' + (t.done ? 'fa-circle-check' : 'fa-circle') + '"></i><span>' + esc(t.x || t.title || t.text || 'Task') + '</span></li>'; }).join('');
        return '<section class="d2-card" aria-label="Today\'s goal"><div class="d2-ch"><h3><i class="fa-solid fa-bullseye"></i> Today\'s Goal</h3><button type="button" class="d2-lnk" data-act="todo">Open</button></div>' +
            '<div class="d2-ringrow">' + ring(pct, list.length ? done + ' of ' + list.length + ' done' : 'No tasks yet', list.length ? 'Keep going!' : 'Add a goal for today') + '</div>' +
            (rows ? '<ul class="d2-ul">' + rows + '</ul>' : '<button type="button" class="d2-btn" data-act="todo"><i class="fa-solid fa-plus"></i> Add today\'s target</button>') + '</section>';
    }
    function continueCard() {
        var ids = arr(jget('nb_recent', [])), it = null, i;
        for (i = 0; i < ids.length && !it; i++) it = itemById(ids[i]);
        var body;
        if (it) {
            body = '<div class="d2-cont"><span class="d2-ico"><i class="fa-solid fa-file-lines"></i></span><div><b>' + esc(it.title) + '</b><small>' + esc((it.className || 'General') + ' • ' + (it.subject || 'General')) + '</small></div></div>' +
                '<button type="button" class="d2-btn d2-pri" data-act="open" data-id="' + esc(it.id) + '"><i class="fa-solid fa-play"></i> Continue learning</button>';
        } else {
            body = '<p class="d2-mute">Open any note, book or PYQ and it will appear here so you can continue tomorrow.</p><button type="button" class="d2-btn d2-pri" data-act="notes"><i class="fa-solid fa-book"></i> Browse notes</button>';
        }
        return '<section class="d2-card d2-grad" aria-label="Continue learning"><div class="d2-ch"><h3><i class="fa-solid fa-forward"></i> Continue Learning</h3></div>' + body + '</section>';
    }
    function perfCard() {
        var set = {}; days().forEach(function (k) { set[k] = 1; });
        var now = new Date(), bars = '', cnt = 0, i, d, lab = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        for (i = 6; i >= 0; i--) {
            d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); var on = !!set[dkey(d)]; if (on) cnt++;
            bars += '<div class="d2-bar' + (i === 0 ? ' today' : '') + '"><span class="d2-bf" style="height:' + (on ? 100 : 14) + '%"></span><small>' + lab[d.getDay()] + '</small></div>';
        }
        var q = quiz(), s = 0, t = 0; q.forEach(function (r) { s += +r.score || 0; t += +r.total || 0; });
        var acc = t ? Math.round(s * 100 / t) : 0;
        return '<section class="d2-card" aria-label="Weekly performance"><div class="d2-ch"><h3><i class="fa-solid fa-chart-column"></i> Weekly Performance</h3><span class="d2-pill">' + cnt + '/7 days</span></div>' +
            '<div class="d2-bars">' + bars + '</div><div class="d2-kv"><div><b>' + (q.length ? acc + '%' : '--') + '</b><small>Test accuracy</small></div><div><b>' + q.length + '</b><small>Tests taken</small></div><div><b>' + dlCount() + '</b><small>Downloads</small></div></div></section>';
    }
    function weakCard() {
        var w = weakTopics(), body;
        if (!quiz().length) body = '<p class="d2-mute">Take a quick test and we will find the chapters that need more revision.</p><button type="button" class="d2-btn" data-act="quiz"><i class="fa-solid fa-list-check"></i> Take a test</button>';
        else if (!w.length) body = '<p class="d2-good"><i class="fa-solid fa-circle-check"></i> Great! No weak topic right now. Keep practising.</p>';
        else body = '<ul class="d2-weak">' + w.map(function (x) { return '<li><div><b>' + esc(x.subj) + '</b><small>Accuracy ' + x.acc + '% in ' + x.n + ' test' + (x.n > 1 ? 's' : '') + '. Revise this topic.</small></div><span class="d2-low">' + x.acc + '%</span></li>'; }).join('') + '</ul><button type="button" class="d2-btn" data-act="quiz"><i class="fa-solid fa-rotate-right"></i> Retake a test</button>';
        return '<section class="d2-card" aria-label="Weak topics"><div class="d2-ch"><h3><i class="fa-solid fa-triangle-exclamation"></i> Weak Topic Detection</h3></div>' + body + '</section>';
    }
    function recCard() {
        var p = profile(), cls = p && p.cls ? String(p.cls).replace(/\D/g, '') : '', seen = jget('nb_seen', {}) || {};
        var all = arr(window.allItems).filter(function (i) { return !i.private; });
        var mine = cls ? all.filter(function (i) { return i.className === 'Class ' + cls; }) : all;
        var pick = mine.filter(function (i) { return !seen[i.id]; }).concat(mine.filter(function (i) { return seen[i.id]; })).slice(0, 3);
        var body = pick.length ? '<ul class="d2-act d2-rec">' + pick.map(function (i) {
            return '<li><button type="button" data-act="open" data-id="' + esc(i.id) + '"><i class="fa-solid fa-file-lines"></i><span><b>' + esc(i.title) + '</b><small>' + esc((i.className || 'General') + ' • ' + (i.subject || 'General')) + (i.verify === 'verified' ? ' • Verified' : '') + '</small></span><i class="fa-solid fa-chevron-right"></i></button></li>';
        }).join('') + '</ul>' : '<p class="d2-mute">' + (cls ? 'Study material for Class ' + esc(cls) + ' will show here.' : 'Create an account and choose your class to get study material picked for you.') + '</p>';
        return '<section class="d2-card" aria-label="Recommended for you"><div class="d2-ch"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> Recommended for you</h3></div>' + body + '</section>';
    }
    function activityCard() {
        var rows = [], ids = arr(jget('nb_recent', [])).slice(0, 3);
        ids.forEach(function (id) { var it = itemById(id); if (it) rows.push('<li><i class="fa-regular fa-eye"></i><span>Viewed <b>' + esc(it.title) + '</b></span></li>'); });
        quiz().slice(0, 2).forEach(function (r) { rows.push('<li><i class="fa-solid fa-list-check"></i><span>Test <b>' + esc(r.subj || 'Quiz') + '</b>: ' + (+r.score || 0) + '/' + (+r.total || 0) + '</span></li>'); });
        return '<section class="d2-card" aria-label="Recent activity"><div class="d2-ch"><h3><i class="fa-solid fa-clock-rotate-left"></i> Recent Activity</h3></div>' +
            (rows.length ? '<ul class="d2-act">' + rows.join('') + '</ul>' : '<p class="d2-mute">Your recent notes and tests will show up here.</p>') + '</section>';
    }
    function dashHtml() {
        var p = profile(), name = p && p.name ? p.name.split(' ')[0] : 'Student', x = xp(), st = streak();
        var tip = TIPS[new Date().getDate() % TIPS.length];
        return '<div class="d2-top"><div class="d2-hi"><h2>' + greet() + ', ' + esc(name) + ' 👋</h2><p>' + esc(tip) + '</p></div>' +
            '<div class="d2-stats"><div><b>' + x + '</b><small>Total XP</small></div><div><b>' + st + '</b><small>Day streak</small></div><div><b>L' + level(x) + '</b><small>Level</small></div></div></div>' +
            '<div class="d2-grid">' + goalCard() + continueCard() + perfCard() + weakCard() + recCard() + activityCard() + toolsCard() + '</div>';
    }

    /* ---------- Pomodoro + habits + syllabus tool card ---------- */
    var PM = { mode: 'focus', left: 25 * 60, run: false, t: null, end: 0 };
    var PM_LEN = { focus: 25 * 60, rest: 5 * 60 };
    function pmFmt(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
    function pmCount() { var o = jget('nb_pomo', {}); return +o[dkey()] || 0; }
    function toolsCard() {
        return '<section class="d2-card d2-wide" aria-label="Study tools"><div class="d2-ch"><h3><i class="fa-solid fa-toolbox"></i> Study Tools</h3></div><div class="d2-tools">' +
            '<button type="button" class="d2-tool" data-act="pomo"><i class="fa-solid fa-stopwatch"></i><b>Pomodoro Timer</b><small>' + pmCount() + ' focus session' + (pmCount() === 1 ? '' : 's') + ' today</small></button>' +
            '<button type="button" class="d2-tool" data-act="syl"><i class="fa-solid fa-list-check"></i><b>Syllabus Tracker</b><small>' + sylSummary() + '</small></button>' +
            '<button type="button" class="d2-tool" data-act="habit"><i class="fa-solid fa-seedling"></i><b>Habit Tracker</b><small>' + habitSummary() + '</small></button>' +
            '<button type="button" class="d2-tool" data-act="ai"><i class="fa-solid fa-robot"></i><b>AI Tutor</b><small>Ask Bazar AI to explain a topic</small></button></div></section>';
    }

    /* ---------- generic modal ---------- */
    function modal(id, title, html) {
        var m = $(id);
        if (!m) {
            m = document.createElement('div'); m.id = id; m.className = 'd2-ov'; m.setAttribute('aria-hidden', 'true');
            m.innerHTML = '<div class="d2-md" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><button type="button" class="d2-x" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div class="d2-mb"></div></div>';
            document.body.appendChild(m);
            m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.d2-x')) closeModal(id); });
        }
        m.querySelector('.d2-mb').innerHTML = html; m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
        return m;
    }
    function closeModal(id) { var m = $(id); if (m) { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); } }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') ['d2Pomo', 'd2Syl', 'd2Habit'].forEach(closeModal); });

    /* ---------- Pomodoro ---------- */
    function pmPaint() {
        var t = $('d2PmT'); if (!t) return;
        t.textContent = pmFmt(PM.left);
        $('d2PmM').textContent = PM.mode === 'focus' ? 'Focus time' : 'Short break';
        $('d2PmGo').innerHTML = PM.run ? '<i class="fa-solid fa-pause"></i> Pause' : '<i class="fa-solid fa-play"></i> Start';
        $('d2PmN').textContent = pmCount();
        var pct = 100 - Math.round(PM.left * 100 / PM_LEN[PM.mode]); $('d2PmP').style.width = pct + '%';
        var tabs = document.querySelectorAll('#d2Pomo [data-pm]'); for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].dataset.pm === PM.mode);
    }
    function pmTick() {
        PM.left = Math.max(0, Math.round((PM.end - Date.now()) / 1000));
        if (PM.left <= 0) {
            clearInterval(PM.t); PM.run = false;
            if (PM.mode === 'focus') {
                var o = jget('nb_pomo', {}); o[dkey()] = pmCount() + 1; jset('nb_pomo', o);
                try { NB().markDay && NB().markDay(); } catch (e) {}
                try { NB().playNotifTone && NB().playNotifTone(); } catch (e) {}
                toast('Focus session done! Take a 5 minute break.', 4000); PM.mode = 'rest';
            } else { toast('Break over. Ready for the next session?', 3500); PM.mode = 'focus'; }
            PM.left = PM_LEN[PM.mode]; render();
        }
        pmPaint();
    }
    function pmToggle() {
        if (PM.run) { clearInterval(PM.t); PM.run = false; } else { PM.run = true; PM.end = Date.now() + PM.left * 1000; PM.t = setInterval(pmTick, 500); }
        pmPaint();
    }
    function openPomo() {
        var m = modal('d2Pomo', 'Pomodoro timer', '<h3 class="d2-mt"><i class="fa-solid fa-stopwatch"></i> Pomodoro Timer</h3><p class="d2-mute">Study 25 minutes, rest 5 minutes. Each finished focus session counts toward your streak.</p>' +
            '<div class="d2-seg"><button type="button" data-pm="focus">Focus 25</button><button type="button" data-pm="rest">Break 5</button></div>' +
            '<div class="d2-pt" id="d2PmT">25:00</div><div class="d2-pm" id="d2PmM">Focus time</div><div class="d2-pbar"><span id="d2PmP"></span></div>' +
            '<div class="d2-row"><button type="button" class="d2-btn d2-pri" id="d2PmGo"></button><button type="button" class="d2-btn" id="d2PmRs"><i class="fa-solid fa-rotate-left"></i> Reset</button></div>' +
            '<p class="d2-mute" style="margin-top:10px">Sessions today: <b id="d2PmN">0</b></p>');
        m.onclick = function (e) {
            if (e.target === m || e.target.closest('.d2-x')) return closeModal('d2Pomo');
            var s = e.target.closest('[data-pm]');
            if (s) { if (PM.run) { clearInterval(PM.t); PM.run = false; } PM.mode = s.dataset.pm; PM.left = PM_LEN[PM.mode]; pmPaint(); }
            if (e.target.closest('#d2PmGo')) pmToggle();
            if (e.target.closest('#d2PmRs')) { clearInterval(PM.t); PM.run = false; PM.left = PM_LEN[PM.mode]; pmPaint(); }
        };
        pmPaint();
    }

    /* ---------- Habit tracker ---------- */
    var DEF_HABITS = ['Read 1 chapter', 'Revise yesterday', 'Solve 10 questions'];
    function habits() { var o = jget('nb_habits', null); if (!o || !Array.isArray(o.list)) o = { list: DEF_HABITS.slice(), log: {} }; return o; }
    function habitSummary() { var h = habits(), n = (h.log[dkey()] || []).length; return n + ' of ' + h.list.length + ' done today'; }
    function openHabit() {
        var m = modal('d2Habit', 'Habit tracker', '<div id="d2HbBody"></div>');
        function paint() {
            var h = habits(), today = h.log[dkey()] || [], rows = '';
            h.list.forEach(function (n, i) {
                var wk = '';
                for (var j = 6; j >= 0; j--) { var d = new Date(Date.now() - j * DAY), on = (h.log[dkey(d)] || []).indexOf(i) >= 0; wk += '<i class="' + (on ? 'on' : '') + '"></i>'; }
                rows += '<li><button type="button" class="d2-hk' + (today.indexOf(i) >= 0 ? ' on' : '') + '" data-h="' + i + '" aria-pressed="' + (today.indexOf(i) >= 0) + '"><i class="fa-solid fa-check"></i></button><span>' + esc(n) + '</span><em class="d2-wk" aria-label="Last 7 days">' + wk + '</em><button type="button" class="d2-del" data-d="' + i + '" aria-label="Remove habit"><i class="fa-solid fa-trash-can"></i></button></li>';
            });
            $('d2HbBody').innerHTML = '<h3 class="d2-mt"><i class="fa-solid fa-seedling"></i> Habit Tracker</h3><p class="d2-mute">Tick your daily habits. The dots show the last 7 days.</p><ul class="d2-hl">' + rows + '</ul>' +
                '<div class="d2-row"><input id="d2HbIn" class="d2-in" maxlength="30" placeholder="New habit, e.g. Write notes"><button type="button" class="d2-btn d2-pri" id="d2HbAdd"><i class="fa-solid fa-plus"></i> Add</button></div>';
        }
        paint();
        m.onclick = function (e) {
            if (e.target === m || e.target.closest('.d2-x')) { closeModal('d2Habit'); render(); return; }
            var h = habits(), t = e.target.closest('[data-h]'), d = e.target.closest('[data-d]');
            if (t) { var i = +t.dataset.h, a = h.log[dkey()] || [], p = a.indexOf(i); if (p >= 0) a.splice(p, 1); else a.push(i); h.log[dkey()] = a; jset('nb_habits', h); if (a.length) try { NB().markDay && NB().markDay(); } catch (x) {} paint(); }
            else if (d) { var di = +d.dataset.d; h.list.splice(di, 1); h.log = {}; jset('nb_habits', h); paint(); }
            else if (e.target.closest('#d2HbAdd')) { var v = ($('d2HbIn').value || '').replace(/[<>]/g, '').trim(); if (v && h.list.length < 8) { h.list.push(v); jset('nb_habits', h); paint(); } }
        };
    }

    /* ---------- Syllabus tracker ---------- */
    function sylData() { var o = jget('nb_syl', {}); return o && typeof o === 'object' ? o : {}; }
    function sylKeys() { return Object.keys(window.NB_BSEB || {}); }
    function sylChapters(key) { var b = (window.NB_BSEB || {})[key]; return b ? arr(b.groups).reduce(function (a, g) { return a.concat(arr(g.c)); }, []) : []; }
    function sylSummary() {
        var d = sylData(), keys = Object.keys(d).filter(function (k) { return arr(d[k]).length; });
        if (!keys.length) return 'Mark chapters you finished';
        var k = keys[0], tot = sylChapters(k).length || 1; return k.replace('|', ' ').toUpperCase() + ': ' + Math.round(arr(d[k]).length * 100 / tot) + '% complete';
    }
    function openSyl() {
        var keys = sylKeys(), p = profile(), cls = p && p.cls ? String(p.cls).replace(/\D/g, '') : '10';
        var cur = keys.filter(function (k) { return k.split('|')[0] === cls; })[0] || keys[0];
        var m = modal('d2Syl', 'Syllabus tracker', '<div id="d2SyBody"></div>');
        function paint() {
            var d = sylData(), done = arr(d[cur]), ch = sylChapters(cur), pct = ch.length ? Math.round(done.length * 100 / ch.length) : 0;
            var opts = keys.map(function (k) { return '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>Class ' + esc(k.split('|')[0]) + ' • ' + esc(String(k.split('|')[1]).replace(/^./, function (c) { return c.toUpperCase(); })) + '</option>'; }).join('');
            var groups = arr((window.NB_BSEB[cur] || {}).groups).map(function (g) {
                return '<div class="d2-sg"><b>' + esc(g.g) + '</b>' + arr(g.c).map(function (c) { var on = done.indexOf(c) >= 0; return '<label class="d2-sc' + (on ? ' on' : '') + '"><input type="checkbox" data-c="' + esc(c) + '"' + (on ? ' checked' : '') + '><span>' + esc(c) + '</span></label>'; }).join('') + '</div>';
            }).join('');
            $('d2SyBody').innerHTML = '<h3 class="d2-mt"><i class="fa-solid fa-list-check"></i> Syllabus Tracker</h3><select id="d2SyPick" class="d2-in" aria-label="Choose class and subject">' + opts + '</select>' +
                '<div class="d2-sp"><b>' + pct + '%</b><span>' + done.length + ' of ' + ch.length + ' chapters complete</span></div><div class="d2-pbar"><span style="width:' + pct + '%"></span></div><div class="d2-sl">' + groups + '</div>';
        }
        paint();
        m.onclick = function (e) {
            if (e.target === m || e.target.closest('.d2-x')) { closeModal('d2Syl'); render(); }
        };
        m.onchange = function (e) {
            var t = e.target;
            if (t.id === 'd2SyPick') { cur = t.value; paint(); return; }
            if (t.dataset && t.dataset.c) { var d = sylData(), a = arr(d[cur]), i = a.indexOf(t.dataset.c); if (t.checked && i < 0) a.push(t.dataset.c); else if (!t.checked && i >= 0) a.splice(i, 1); d[cur] = a; jset('nb_syl', d); var sc = $('d2SyBody').scrollTop; paint(); }
        };
    }

    /* ---------- actions ---------- */
    function act(a, el) {
        var n = NB();
        if (a === 'todo') { if (n.openTodo) n.openTodo(); }
        else if (a === 'open') { if (window.openPreview) window.openPreview(el.dataset.id); }
        else if (a === 'notes') { if (window.switchView) window.switchView('notes'); }
        else if (a === 'quiz') { if (n.openQuiz) n.openQuiz(); }
        else if (a === 'pomo') openPomo();
        else if (a === 'syl') openSyl();
        else if (a === 'habit') openHabit();
        else if (a === 'ai') { if (window.openModal) window.openModal('aiModal'); }
    }

    /* ---------- render on Home ---------- */
    var rendering = false;
    function render() {
        var home = $('homeView'); if (!home || rendering) return; rendering = true;
        try {
            var s = $('nbDash2');
            if (!s) {
                s = document.createElement('section'); s.id = 'nbDash2'; s.className = 'd2'; s.setAttribute('aria-label', 'Student dashboard');
                s.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b); });
                var plan = $('nbPlan'), hero = $('heroSlider');
                if (plan && plan.parentNode === home) home.insertBefore(s, plan.nextSibling);
                else if (hero && hero.parentNode === home) home.insertBefore(s, hero.nextSibling);
                else home.insertBefore(s, home.firstChild);
            }
            s.innerHTML = dashHtml();
        } catch (e) { if (window.console) console.warn('dash2', e); }
        rendering = false;
    }
    var rt = null;
    function soon() { clearTimeout(rt); rt = setTimeout(render, 250); }

    /* ---------- mobile bottom navigation ---------- */
    function buildBnav() {
        if ($('d2Bnav')) return;
        var n = document.createElement('nav'); n.id = 'd2Bnav'; n.className = 'd2-bn'; n.setAttribute('aria-label', 'Bottom navigation');
        n.innerHTML = [['home', 'fa-house', 'Home'], ['notes', 'fa-book', 'Notes'], ['ai', 'fa-robot', 'AI'], ['pyq', 'fa-file-lines', 'PYQ'], ['more', 'fa-grip', 'More']].map(function (b) {
            return '<button type="button" data-v="' + b[0] + '" aria-label="' + b[2] + '"><i class="fa-solid ' + b[1] + '"></i><span>' + b[2] + '</span></button>';
        }).join('');
        n.addEventListener('click', function (e) {
            var b = e.target.closest('[data-v]'); if (!b) return; var v = b.dataset.v;
            if (v === 'ai') { if (window.openModal) window.openModal('aiModal'); }
            else if (v === 'more') { if (window.openModal) window.openModal('mobileMenuModal'); }
            else if (window.switchView) window.switchView(v);
        });
        document.body.appendChild(n);
        document.body.classList.add('d2-hasbn');
    }
    function paintBnav() {
        var n = $('d2Bnav'); if (!n) return;
        var cur = 'home'; ['notes', 'books', 'pyq'].forEach(function (v) { var el = $(v + 'View'); if (el && !el.classList.contains('hidden')) cur = v; });
        [].forEach.call(n.querySelectorAll('[data-v]'), function (b) { b.classList.toggle('on', b.dataset.v === cur); });
    }

    /* ---------- Bazar AI: two-pane layout on desktop ---------- */
    function aiLayout() {
        var w = document.querySelector('.bz-wrap'); if (!w || w.querySelector(':scope > .bz-main')) return;
        var main = document.createElement('div'); main.className = 'bz-main';
        [].slice.call(w.children).forEach(function (c) { if (c.id !== 'bzScrim' && c.id !== 'bzDrawer') main.appendChild(c); });
        w.appendChild(main);
    }

    /* ---------- boot ---------- */
    function boot() {
        render(); buildBnav(); paintBnav();
        var o = window.switchView;
        if (typeof o === 'function' && !o.__d2) { var w = function () { var r = o.apply(this, arguments); setTimeout(paintBnav, 30); setTimeout(render, 60); return r; }; w.__d2 = true; window.switchView = w; }
        window.addEventListener('storage', soon);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) soon(); });
        // refresh when allItems (Firebase) arrive and when other modules save progress
        var tries = 0, last = -1, iv = setInterval(function () { var n = arr(window.allItems).length; if (n !== last) { last = n; soon(); } if (++tries > 40) clearInterval(iv); }, 800);
        ['click'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e.target.closest && e.target.closest('.nbo-card,#nbTd,#nbQz')) soon(); }, true); });
        setInterval(function () { if (!document.hidden && !PM.run) soon(); }, 30000);
    }
    window.NBDash2 = { render: render, openPomo: openPomo, openSyl: openSyl, openHabit: openHabit };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 900); });
    else setTimeout(boot, 900);
})();
