/* =====================================================================
   Notes Bazar - Study Planner section (additive module)
   1 Daily Study Planner   2 Weekly Timetable    3 Monthly Study Calendar
   4 To-Do List            5 Subject-wise Goals  6 Revision Reminders
   7 Exam Countdown        8 Pomodoro Timer      9 Habit Tracker
   Data lives in localStorage. Shared with existing features:
   nb_exam (exam countdown), nb_pomo (pomodoro sessions), nb_habits (habits).
   ===================================================================== */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var DAY = 86400000;
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var arr = function (x) { return Array.isArray(x) ? x : []; };
    function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function pdate(k) { var p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function addDays(k, n) { var d = pdate(k); d.setDate(d.getDate() + n); return dkey(d); }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function clean(s, n) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, n || 60); }
    function toast(m, ms) { if (window.nbToast) window.nbToast(m, ms); }
    function tone() { try { if (window.NB && window.NB.playNotifTone) window.NB.playNotifTone(); } catch (e) {} }
    function markDay() { try { if (window.NB && window.NB.markDay) window.NB.markDay(); } catch (e) {} }
    function fmtDate(k) { return pdate(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
    function to12(t) { var p = String(t).split(':'), h = +p[0], m = p[1]; return ((h + 11) % 12 + 1) + ':' + m + (h < 12 ? ' AM' : ' PM'); }
    function nowHM() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function diffDays(a, b) { return Math.round((pdate(b) - pdate(a)) / DAY); }

    var COLORS = ['#38bdf8', '#8b5cf6', '#f472b6', '#34d399', '#fb923c', '#6366f1', '#14b8a6', '#e879f9', '#f59e0b'];
    function colorOf(s) { var h = 0, i; s = String(s || '').toLowerCase(); for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
    var SUBJECTS = ['Maths', 'Science', 'Physics', 'Chemistry', 'Biology', 'Hindi', 'English', 'SST', 'Maithili', 'Computer'];
    var WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var WDL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var REV_STEPS = [1, 3, 7, 15];

    /* ---------- storage ---------- */
    var K = { blocks: 'nbp_blocks', week: 'nbp_week', todo: 'nbp_todo', goals: 'nbp_goals', rev: 'nbp_rev', exams: 'nbp_exams', pmin: 'nbp_pmin', pset: 'nbp_pset' };
    var blocks = function () { return arr(jget(K.blocks, [])); };
    var week = function () { var w = jget(K.week, {}); return w && typeof w === 'object' ? w : {}; };
    var todos = function () { return arr(jget(K.todo, [])); };
    var goals = function () { return arr(jget(K.goals, [])); };
    var revs = function () { return arr(jget(K.rev, [])); };
    var exams = function () { return arr(jget(K.exams, [])); };
    function habits() { var o = jget('nb_habits', null); if (!o || !Array.isArray(o.list)) o = { list: ['Read 1 chapter', 'Revise yesterday', 'Solve 10 questions'], log: {} }; if (!o.log) o.log = {}; return o; }
    function pomoToday() { var o = jget('nb_pomo', {}); return +(o && o[dkey()]) || 0; }
    function subjOptions() {
        var set = {}, out = [];
        SUBJECTS.concat(blocks().map(function (b) { return b.subj; }), goals().map(function (g) { return g.subj; })).forEach(function (s) { if (s && !set[s.toLowerCase()]) { set[s.toLowerCase()] = 1; out.push(s); } });
        return out;
    }
    function subjList() { return '<datalist id="nbpSubj">' + subjOptions().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>'; }

    /* ---------- state ---------- */
    var S = { tab: 'daily', day: dkey(), month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), tf: 'all' };
    var TABS = [
        ['daily', 'fa-sun', 'Daily Planner'], ['weekly', 'fa-table-cells', 'Weekly Timetable'], ['monthly', 'fa-calendar-days', 'Monthly Calendar'],
        ['todo', 'fa-clipboard-check', 'To-Do List'], ['goals', 'fa-bullseye', 'Subject Goals'], ['revision', 'fa-rotate', 'Revision'],
        ['exam', 'fa-hourglass-half', 'Exam Countdown'], ['pomo', 'fa-stopwatch', 'Pomodoro'], ['habit', 'fa-seedling', 'Habit Tracker']
    ];

    /* ---------- derived numbers ---------- */
    function revDue() { var t = dkey(); return revs().filter(function (r) { return !r.done && r.d <= t; }); }
    function todayTodo() { var t = dkey(); return todos().filter(function (x) { return !x.d || x.d === t || !x.done; }); }
    function summary() {
        var t = dkey(), tl = todos(), pend = tl.filter(function (x) { return !x.done; }).length;
        var bl = blocks().filter(function (b) { return b.d === t; });
        return { blocks: bl.length, blocksDone: bl.filter(function (b) { return b.done; }).length, pend: pend, rev: revDue().length, pomo: pomoToday() };
    }

    /* =================== TAB RENDERERS =================== */

    /* ---------- 1. Daily ---------- */
    function blockHtml(b, canEdit) {
        var now = b.d === dkey() && nowHM() >= b.s && nowHM() < b.e;
        return '<div class="nbp-blk' + (b.done ? ' done' : '') + (now ? ' now' : '') + '" style="--c:' + colorOf(b.subj) + '"><span class="tm">' + to12(b.s) + '</span>' +
            '<div class="t">' + esc(b.subj) + '<small>' + (b.topic ? esc(b.topic) + ' &bull; ' : '') + to12(b.s) + ' - ' + to12(b.e) + '</small></div>' +
            (canEdit ? '<button type="button" data-a="bdone" data-id="' + b.id + '" aria-label="Mark done"><i class="fa-solid fa-check"></i></button><button type="button" data-a="bdel" data-id="' + b.id + '" aria-label="Delete"><i class="fa-solid fa-xmark"></i></button>' : '') + '</div>';
    }
    function tDaily() {
        var day = S.day, isToday = day === dkey();
        var list = blocks().filter(function (b) { return b.d === day; }).sort(function (a, b) { return a.s < b.s ? -1 : 1; });
        var done = list.filter(function (b) { return b.done; }).length, pct = list.length ? Math.round(done * 100 / list.length) : 0;
        var dueRev = revs().filter(function (r) { return !r.done && r.d === day; });
        return '<div class="nbp-nav"><button type="button" data-a="dprev" aria-label="Previous day"><i class="fa-solid fa-chevron-left"></i></button><b>' + (isToday ? 'Today, ' : '') + fmtDate(day) + '</b><button type="button" data-a="dnext" aria-label="Next day"><i class="fa-solid fa-chevron-right"></i></button></div>' +
            '<div class="nbp-card"><div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;margin-bottom:6px"><span>Day progress</span><span>' + done + '/' + list.length + ' sessions</span></div><div class="nbp-bar"><span style="width:' + pct + '%"></span></div></div>' +
            '<div class="nbp-card"><h4><i class="fa-solid fa-plus"></i> Add study session</h4>' + subjList() +
            '<form class="nbp-form" data-f="block"><input class="nbp-in" name="subj" list="nbpSubj" placeholder="Subject" maxlength="30" required><input class="nbp-in" name="topic" placeholder="Topic / chapter (optional)" maxlength="50">' +
            '<input class="nbp-in sm" type="time" name="s" value="' + (isToday ? nowHM() : '16:00') + '" required aria-label="Start time"><input class="nbp-in sm" type="time" name="e" value="' + (isToday ? pad(Math.min(23, new Date().getHours() + 1)) + ':' + pad(new Date().getMinutes()) : '17:00') + '" required aria-label="End time"><button class="nbp-btn pri" type="submit"><i class="fa-solid fa-plus"></i> Add</button></form>' +
            '<div style="margin-top:8px"><button type="button" class="nbp-btn sm" data-a="fillweek"><i class="fa-solid fa-table-cells"></i> Fill from weekly timetable</button></div></div>' +
            (dueRev.length ? '<div class="nbp-card"><h4><i class="fa-solid fa-rotate"></i> Revise today</h4>' + dueRev.map(function (r) { return '<div class="nbp-li"><div class="t">' + esc(r.topic) + '<small>' + esc(r.subj) + '</small></div></div>'; }).join('') + '</div>' : '') +
            (list.length ? list.map(function (b) { return blockHtml(b, true); }).join('') : '<div class="nbp-empty">No study sessions for this day yet. Add one above.</div>');
    }

    /* ---------- 2. Weekly timetable ---------- */
    function tWeekly() {
        var w = week(), tdi = (new Date().getDay() + 6) % 7, cols = '';
        WD.forEach(function (n, i) {
            var l = arr(w[i]).slice().sort(function (a, b) { return a.s < b.s ? -1 : 1; });
            cols += '<div class="nbp-wk-c' + (i === tdi ? ' today' : '') + '"><h5>' + n + '</h5>' + (l.length ? l.map(function (x) {
                return '<div class="nbp-slot" style="--c:' + colorOf(x.subj) + '"><button type="button" data-a="wdel" data-day="' + i + '" data-id="' + x.id + '" aria-label="Remove">&times;</button><b>' + esc(x.subj) + '</b>' + to12(x.s) + ' - ' + to12(x.e) + '</div>';
            }).join('') : '<div class="nbp-empty" style="padding:10px 0;font-size:.68rem">Free</div>') + '</div>';
        });
        return '<div class="nbp-card"><h4><i class="fa-solid fa-plus"></i> Add to weekly timetable</h4>' + subjList() +
            '<form class="nbp-form" data-f="slot"><select class="nbp-sel" name="days" aria-label="Day"><option value="0">Monday</option><option value="1">Tuesday</option><option value="2">Wednesday</option><option value="3">Thursday</option><option value="4">Friday</option><option value="5">Saturday</option><option value="6">Sunday</option><option value="all">Every day</option><option value="wk">Mon to Sat</option></select>' +
            '<input class="nbp-in" name="subj" list="nbpSubj" placeholder="Subject" maxlength="30" required><input class="nbp-in sm" type="time" name="s" value="16:00" required aria-label="Start"><input class="nbp-in sm" type="time" name="e" value="17:00" required aria-label="End"><button class="nbp-btn pri" type="submit"><i class="fa-solid fa-plus"></i> Add</button></form></div>' +
            '<p class="nbp-mute">Your repeating weekly routine. Use "Fill from weekly timetable" in Daily Planner to copy a day\'s slots into that date.</p><div class="nbp-wk">' + cols + '</div>';
    }

    /* ---------- 3. Monthly calendar ---------- */
    function tMonthly() {
        var m = S.month, y = m.getFullYear(), mo = m.getMonth(), first = (new Date(y, mo, 1).getDay() + 6) % 7, total = new Date(y, mo + 1, 0).getDate();
        var bl = blocks(), rv = revs().filter(function (r) { return !r.done; }), ex = exams(), td = todos().filter(function (x) { return !x.done && x.d; }), today = dkey();
        var html = '<div class="nbp-nav"><button type="button" data-a="mprev" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button><b>' + m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + '</b><button type="button" data-a="mnext" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button></div><div class="nbp-cal">';
        WD.forEach(function (n) { html += '<div class="h">' + n.charAt(0) + '</div>'; });
        var i, cells = Math.ceil((first + total) / 7) * 7;
        for (i = 0; i < cells; i++) {
            var dn = i - first + 1, out = dn < 1 || dn > total, dt = new Date(y, mo, dn), k = dkey(dt);
            var dots = '';
            if (bl.some(function (b) { return b.d === k; })) dots += '<i></i>';
            if (rv.some(function (r) { return r.d === k; })) dots += '<i class="r"></i>';
            if (td.some(function (x) { return x.d === k; })) dots += '<i class="t"></i>';
            if (ex.some(function (e) { return e.date === k; })) dots += '<i class="e"></i>';
            html += '<button type="button" class="nbp-d' + (out ? ' out' : '') + (k === today ? ' today' : '') + (k === S.day ? ' sel' : '') + '" data-a="pick" data-k="' + k + '">' + dt.getDate() + '<span class="nbp-dots">' + dots + '</span></button>';
        }
        html += '</div><div class="nbp-leg"><span><i style="background:#38bdf8"></i>Study session</span><span><i style="background:#f59e0b"></i>Revision</span><span><i style="background:#10b981"></i>Task due</span><span><i style="background:#ef4444"></i>Exam</span></div>';
        var dayB = bl.filter(function (b) { return b.d === S.day; }).sort(function (a, b) { return a.s < b.s ? -1 : 1; });
        var dayR = rv.filter(function (r) { return r.d === S.day; }), dayT = td.filter(function (x) { return x.d === S.day; }), dayE = ex.filter(function (e) { return e.date === S.day; });
        html += '<div class="nbp-card" style="margin-top:12px"><h4><i class="fa-solid fa-calendar-day"></i> ' + fmtDate(S.day) + '</h4>' +
            dayE.map(function (e) { return '<div class="nbp-li"><span class="nbp-pri-h"><i class="fa-solid fa-flag"></i></span><div class="t">Exam: ' + esc(e.name) + '</div></div>'; }).join('') +
            dayB.map(function (b) { return blockHtml(b, false); }).join('') +
            dayR.map(function (r) { return '<div class="nbp-li"><i class="fa-solid fa-rotate" style="color:#f59e0b"></i><div class="t">Revise: ' + esc(r.topic) + '<small>' + esc(r.subj) + '</small></div></div>'; }).join('') +
            dayT.map(function (x) { return '<div class="nbp-li"><i class="fa-solid fa-clipboard-check" style="color:#10b981"></i><div class="t">' + esc(x.x) + '</div></div>'; }).join('') +
            (!dayB.length && !dayR.length && !dayT.length && !dayE.length ? '<div class="nbp-empty">Nothing planned.</div>' : '') +
            '<button type="button" class="nbp-btn pri" data-a="godaily" style="margin-top:6px"><i class="fa-solid fa-plus"></i> Plan this day</button></div>';
        return html;
    }

    /* ---------- 4. To-do ---------- */
    var PRI = { h: ['High', 'nbp-pri-h'], m: ['Medium', 'nbp-pri-m'], l: ['Low', 'nbp-pri-l'] };
    function tTodo() {
        var all = todos(), done = all.filter(function (x) { return x.done; }).length, pct = all.length ? Math.round(done * 100 / all.length) : 0;
        var list = all.filter(function (x) { return S.tf === 'all' || (S.tf === 'done' ? x.done : !x.done); });
        var rank = { h: 0, m: 1, l: 2 };
        list.sort(function (a, b) { return (a.done - b.done) || (rank[a.p] - rank[b.p]) || ((a.d || '9') < (b.d || '9') ? -1 : 1); });
        var t = dkey();
        return '<div class="nbp-card"><div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;margin-bottom:6px"><span>Tasks done</span><span>' + done + '/' + all.length + '</span></div><div class="nbp-bar"><span style="width:' + pct + '%"></span></div></div>' +
            '<div class="nbp-card"><form class="nbp-form" data-f="todo"><input class="nbp-in" name="x" placeholder="New task, e.g. Finish Algebra exercise 4" maxlength="80" required>' +
            '<select class="nbp-sel" name="p" style="flex:0 1 110px" aria-label="Priority"><option value="m">Medium</option><option value="h">High</option><option value="l">Low</option></select>' +
            '<input class="nbp-in sm" type="date" name="d" value="' + t + '" aria-label="Due date" style="flex:0 1 140px"><button class="nbp-btn pri" type="submit"><i class="fa-solid fa-plus"></i> Add</button></form></div>' +
            '<div class="nbp-chips">' + [['all', 'All'], ['pend', 'Pending'], ['done', 'Done']].map(function (c) { return '<button type="button" class="nbp-chip' + (S.tf === c[0] ? ' on' : '') + '" data-a="tf" data-v="' + c[0] + '">' + c[1] + '</button>'; }).join('') +
            (done ? '<button type="button" class="nbp-chip" data-a="clrdone">Clear done</button>' : '') + '</div>' +
            '<div class="nbp-card">' + (list.length ? list.map(function (x) {
                var late = !x.done && x.d && x.d < t;
                return '<div class="nbp-li' + (x.done ? ' done' : '') + '"><button type="button" class="nbp-ck' + (x.done ? ' on' : '') + '" data-a="tdone" data-id="' + x.id + '" aria-label="Toggle done"><i class="fa-solid fa-check"></i></button><div class="t">' + esc(x.x) +
                    '<small><span class="' + PRI[x.p || 'm'][1] + '">' + PRI[x.p || 'm'][0] + '</span>' + (x.d ? ' &bull; ' + (late ? '<span class="nbp-pri-h">Overdue ' : '') + fmtDate(x.d) + (late ? '</span>' : '') : '') + '</small></div><button type="button" class="nbp-ico" data-a="tdel" data-id="' + x.id + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></div>';
            }).join('') : '<div class="nbp-empty">No tasks here. Add your first task above.</div>') + '</div>';
    }

    /* ---------- 5. Subject goals ---------- */
    function tGoals() {
        var g = goals(), by = {}, order = [];
        g.forEach(function (x) { var k = x.subj; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(x); });
        var t = dkey();
        return '<div class="nbp-card"><h4><i class="fa-solid fa-bullseye"></i> Set a subject goal</h4>' + subjList() +
            '<form class="nbp-form" data-f="goal"><input class="nbp-in" name="subj" list="nbpSubj" placeholder="Subject" maxlength="30" required><input class="nbp-in" name="title" placeholder="Goal, e.g. Finish all chapters" maxlength="60" required>' +
            '<input class="nbp-in sm" type="number" name="target" min="1" max="999" value="10" required aria-label="Target count"><input class="nbp-in sm" name="unit" value="chapters" maxlength="14" aria-label="Unit">' +
            '<input class="nbp-in sm" type="date" name="due" aria-label="Deadline" style="flex:0 1 140px"><button class="nbp-btn pri" type="submit"><i class="fa-solid fa-plus"></i> Add</button></form></div>' +
            (order.length ? order.map(function (s) {
                return '<div class="nbp-card"><h4><span class="nbp-pill" style="background:' + colorOf(s) + '">' + esc(s) + '</span></h4>' + by[s].map(function (x) {
                    var pct = Math.min(100, Math.round(x.done * 100 / x.target)), left = x.due ? diffDays(t, x.due) : null;
                    return '<div class="nbp-goal"><div class="nbp-goal-r"><span>' + esc(x.title) + '<br><small>' + x.done + ' / ' + x.target + ' ' + esc(x.unit) + (left != null ? ' &bull; ' + (left < 0 ? 'deadline passed' : left === 0 ? 'due today' : left + ' days left') : '') + '</small></span>' +
                        '<span class="nbp-step"><button type="button" class="nbp-btn sm" data-a="gdec" data-id="' + x.id + '" aria-label="Decrease">-</button><button type="button" class="nbp-btn sm pri" data-a="ginc" data-id="' + x.id + '" aria-label="Increase">+</button><button type="button" class="nbp-ico" data-a="gdel" data-id="' + x.id + '" aria-label="Delete goal"><i class="fa-solid fa-trash"></i></button></span></div>' +
                        '<div class="nbp-bar"><span style="width:' + pct + '%"></span></div>' + (pct >= 100 ? '<small style="color:#10b981;font-weight:700">Goal complete!</small>' : '') + '</div>';
                }).join('') + '</div>';
            }).join('') : '<div class="nbp-empty">No goals yet. Set a goal for each subject to track your progress.</div>');
    }

    /* ---------- 6. Revision reminders ---------- */
    function tRevision() {
        var t = dkey(), all = revs().slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; });
        var groups = { over: [], today: [], soon: [], done: [] };
        all.forEach(function (r) { if (r.done) groups.done.push(r); else if (r.d < t) groups.over.push(r); else if (r.d === t) groups.today.push(r); else groups.soon.push(r); });
        function sec(title, icon, l, cls) {
            if (!l.length) return '';
            return '<div class="nbp-card"><h4><i class="fa-solid ' + icon + '"></i> ' + title + ' <span class="nbp-pill" style="background:' + cls + '">' + l.length + '</span></h4>' + l.map(function (r) {
                return '<div class="nbp-li' + (r.done ? ' done' : '') + '"><button type="button" class="nbp-ck' + (r.done ? ' on' : '') + '" data-a="rdone" data-id="' + r.id + '" aria-label="Mark revised"><i class="fa-solid fa-check"></i></button><div class="t">' + esc(r.topic) + '<small>' + esc(r.subj) + ' &bull; Revision ' + r.step + ' of ' + REV_STEPS.length + ' &bull; ' + fmtDate(r.d) + '</small></div><button type="button" class="nbp-ico" data-a="rdel" data-id="' + r.id + '" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></div>';
            }).join('') + '</div>';
        }
        var notif = (window.Notification && Notification.permission === 'default') ? '<button type="button" class="nbp-btn sm" data-a="notif"><i class="fa-solid fa-bell"></i> Enable browser alerts</button>' : '';
        return '<div class="nbp-card"><h4><i class="fa-solid fa-rotate"></i> Add a topic you studied</h4><p class="nbp-mute">We schedule revisions after ' + REV_STEPS.join(', ') + ' days (spaced repetition) so you remember it for the exam.</p>' + subjList() +
            '<form class="nbp-form" data-f="rev"><input class="nbp-in" name="subj" list="nbpSubj" placeholder="Subject" maxlength="30" required><input class="nbp-in" name="topic" placeholder="Topic / chapter" maxlength="60" required><button class="nbp-btn pri" type="submit"><i class="fa-solid fa-plus"></i> Schedule</button></form>' + (notif ? '<div style="margin-top:8px">' + notif + '</div>' : '') + '</div>' +
            sec('Overdue', 'fa-triangle-exclamation', groups.over, '#ef4444') + sec('Revise today', 'fa-bell', groups.today, '#f59e0b') + sec('Upcoming', 'fa-calendar-plus', groups.soon, '#7c3aed') + sec('Completed', 'fa-circle-check', groups.done, '#10b981') +
            (all.length ? '' : '<div class="nbp-empty">No revisions scheduled yet.</div>');
    }

    /* ---------- 7. Exam countdown ---------- */
    function examList() { return exams().filter(function (e) { return e && e.date; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }); }
    function cdParts(date) {
        var ms = pdate(date).getTime() - Date.now(); if (ms < 0) ms = 0;
        return { d: Math.floor(ms / DAY), h: Math.floor(ms % DAY / 3600000), m: Math.floor(ms % 3600000 / 60000), s: Math.floor(ms % 60000 / 1000), over: pdate(date).getTime() <= Date.now() };
    }
    function tExam() {
        var l = examList(), t = dkey();
        return '<div class="nbp-card"><h4><i class="fa-solid fa-hourglass-half"></i> Add an exam</h4><form class="nbp-form" data-f="exam"><input class="nbp-in" name="name" placeholder="Exam name, e.g. Half-yearly" maxlength="30" required><input class="nbp-in sm" type="date" name="date" min="' + t + '" required style="flex:0 1 150px"><button class="nbp-btn pri" type="submit"><i class="fa-solid fa-plus"></i> Add</button></form></div>' +
            (l.length ? l.map(function (e) {
                var p = cdParts(e.date), total = Math.max(1, diffDays(e.created || t, e.date)), used = Math.min(total, Math.max(0, diffDays(e.created || t, t))), left = diffDays(t, e.date);
                var msg = left > 1 ? 'Study a little every day and revise often to stay on track.' : left === 1 ? 'Exam is tomorrow. Revise and sleep well!' : left === 0 ? 'Exam is today. All the best!' : 'This exam is over.';
                return '<div class="nbp-ex" data-end="' + e.date + '"><h5><span>' + esc(e.name) + '</span><button type="button" data-a="xdel" data-id="' + e.id + '" aria-label="Remove exam"><i class="fa-solid fa-xmark"></i></button></h5><small>' + fmtDate(e.date) + '</small>' +
                    '<div class="nbp-cd"><div><b data-u="d">' + p.d + '</b><span>Days</span></div><div><b data-u="h">' + pad(p.h) + '</b><span>Hours</span></div><div><b data-u="m">' + pad(p.m) + '</b><span>Mins</span></div><div><b data-u="s">' + pad(p.s) + '</b><span>Secs</span></div></div>' +
                    '<div class="nbp-bar"><span style="width:' + Math.round(used * 100 / total) + '%"></span></div><small style="display:block;margin-top:6px">' + msg + '</small></div>';
            }).join('') : '<div class="nbp-empty">No exam added. Add your exam date to start the countdown.</div>');
    }
    function syncExam() {
        var l = examList().filter(function (e) { return e.date >= dkey(); });
        try { if (l.length) localStorage.setItem('nb_exam', JSON.stringify({ name: l[0].name, date: l[0].date })); else localStorage.removeItem('nb_exam'); } catch (e) {}
        if (window.NB && NB.ui && NB.ui.refreshAll) { try { NB.ui.refreshAll(); } catch (e) {} }
    }

    /* ---------- 8. Pomodoro ---------- */
    var PM = { mode: 'focus', left: 25 * 60, run: false, t: null, end: 0, cycle: 0, subj: '' };
    function pset() { var o = jget(K.pset, null) || {}; return { f: +o.f || 25, b: +o.b || 5, l: +o.l || 15 }; }
    function pmLen(mode) { var s = pset(); return (mode === 'focus' ? s.f : mode === 'short' ? s.b : s.l) * 60; }
    function pmFmt(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
    function pminToday() { var o = jget(K.pmin, {}); return +(o && o[dkey()]) || 0; }
    function tPomo() {
        var s = pset();
        return '<div class="nbp-card nbp-pm"><div class="nbp-chips" style="justify-content:center">' +
            [['focus', 'Focus'], ['short', 'Short break'], ['long', 'Long break']].map(function (m) { return '<button type="button" class="nbp-chip" data-a="pmode" data-m="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>' +
            '<div class="nbp-ring"><svg viewBox="0 0 120 120"><defs><linearGradient id="nbpGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="nbpPmC" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="0"/></svg><div class="tx"><b id="nbpPmT">25:00</b><span id="nbpPmM">Focus time</span></div></div>' +
            '<div class="nbp-form"><button type="button" class="nbp-btn pri" id="nbpPmGo"></button><button type="button" class="nbp-btn" data-a="pmreset"><i class="fa-solid fa-rotate-left"></i> Reset</button><button type="button" class="nbp-btn" data-a="pmskip"><i class="fa-solid fa-forward"></i> Skip</button></div>' +
            '<form class="nbp-form" data-f="pset" style="margin-top:12px"><input class="nbp-in" name="subj" list="nbpSubj" placeholder="What are you studying? (optional)" value="' + esc(PM.subj) + '" maxlength="40">' + subjList() +
            '<input class="nbp-in sm" type="number" name="f" min="1" max="120" value="' + s.f + '" aria-label="Focus minutes" title="Focus minutes"><input class="nbp-in sm" type="number" name="b" min="1" max="60" value="' + s.b + '" aria-label="Break minutes" title="Break minutes"><input class="nbp-in sm" type="number" name="l" min="1" max="60" value="' + s.l + '" aria-label="Long break minutes" title="Long break minutes"><button class="nbp-btn" type="submit">Save</button></form>' +
            '<p class="nbp-mute" style="margin-top:6px">Focus / break / long break minutes. A long break comes after every 4 focus sessions.</p>' +
            '<div class="nbp-pm-stats"><div><b id="nbpPmN">' + pomoToday() + '</b><small>Sessions today</small></div><div><b id="nbpPmMin">' + pminToday() + '</b><small>Focus minutes</small></div><div><b id="nbpPmCy">' + (PM.cycle % 4) + '/4</b><small>Until long break</small></div></div></div>';
    }
    function pmPaint() {
        var t = $('nbpPmT'); if (!t) return;
        var tot = pmLen(PM.mode), c = $('nbpPmC');
        t.textContent = pmFmt(PM.left);
        $('nbpPmM').textContent = (PM.mode === 'focus' ? 'Focus time' : PM.mode === 'short' ? 'Short break' : 'Long break') + (PM.subj && PM.mode === 'focus' ? ' - ' + PM.subj : '');
        $('nbpPmGo').innerHTML = PM.run ? '<i class="fa-solid fa-pause"></i> Pause' : '<i class="fa-solid fa-play"></i> Start';
        if (c) c.style.strokeDashoffset = (326.7 * (1 - PM.left / tot)).toFixed(1);
        var ch = document.querySelectorAll('#nbPlanner [data-a="pmode"]'), i; for (i = 0; i < ch.length; i++) ch[i].classList.toggle('on', ch[i].dataset.m === PM.mode);
        var n = $('nbpPmN'); if (n) { n.textContent = pomoToday(); $('nbpPmMin').textContent = pminToday(); $('nbpPmCy').textContent = (PM.cycle % 4) + '/4'; }
        document.title = PM.run ? pmFmt(PM.left) + ' - ' + (PM.mode === 'focus' ? 'Focus' : 'Break') : baseTitle;
    }
    function pmFinish(skipped) {
        clearInterval(PM.t); PM.run = false;
        if (PM.mode === 'focus' && !skipped) {
            var o = jget('nb_pomo', {}); o[dkey()] = pomoToday() + 1; jset('nb_pomo', o);
            var m = jget(K.pmin, {}); m[dkey()] = pminToday() + Math.round(pmLen('focus') / 60); jset(K.pmin, m);
            PM.cycle++; markDay(); tone();
            PM.mode = PM.cycle % 4 === 0 ? 'long' : 'short';
            toast(PM.mode === 'long' ? 'Great work! Take a long break.' : 'Focus session done! Take a short break.', 4000);
        } else if (PM.mode === 'focus') { PM.mode = 'short'; }
        else { if (!skipped) { tone(); toast('Break over. Ready for the next session?', 3500); } PM.mode = 'focus'; }
        PM.left = pmLen(PM.mode); pmPaint(); refreshHome();
    }
    function pmTick() { PM.left = Math.max(0, Math.round((PM.end - Date.now()) / 1000)); if (PM.left <= 0) pmFinish(false); else pmPaint(); }
    function pmToggle() {
        if (PM.run) { clearInterval(PM.t); PM.run = false; PM.left = Math.max(1, Math.round((PM.end - Date.now()) / 1000)); }
        else { PM.run = true; PM.end = Date.now() + PM.left * 1000; PM.t = setInterval(pmTick, 500); }
        pmPaint();
    }

    /* ---------- 9. Habit tracker ---------- */
    function habitStreak(h, i) { var n = 0, k = dkey(); if ((h.log[k] || []).indexOf(i) < 0) k = addDays(k, -1); while ((h.log[k] || []).indexOf(i) >= 0) { n++; k = addDays(k, -1); } return n; }
    function tHabit() {
        var h = habits(), today = h.log[dkey()] || [], done = today.length, pct = h.list.length ? Math.round(done * 100 / h.list.length) : 0;
        return '<div class="nbp-card"><div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;margin-bottom:6px"><span>Today\'s habits</span><span>' + done + '/' + h.list.length + '</span></div><div class="nbp-bar"><span style="width:' + pct + '%"></span></div></div>' +
            '<div class="nbp-card">' + (h.list.length ? h.list.map(function (n, i) {
                var dots = '', j; for (j = 6; j >= 0; j--) dots += '<i class="' + ((h.log[addDays(dkey(), -j)] || []).indexOf(i) >= 0 ? 'on' : '') + '"></i>';
                var st = habitStreak(h, i);
                return '<div class="nbp-li"><button type="button" class="nbp-ck' + (today.indexOf(i) >= 0 ? ' on' : '') + '" data-a="hdone" data-i="' + i + '" aria-label="Toggle habit"><i class="fa-solid fa-check"></i></button><div class="t">' + esc(n) + '<small><span class="nbp-wkdots" aria-label="Last 7 days">' + dots + '</span>' + (st ? ' &bull; ' + st + ' day streak' : '') + '</small></div><button type="button" class="nbp-ico" data-a="hdel" data-i="' + i + '" aria-label="Remove habit"><i class="fa-solid fa-trash"></i></button></div>';
            }).join('') : '<div class="nbp-empty">No habits yet.</div>') + '</div>' +
            '<div class="nbp-card"><form class="nbp-form" data-f="habit"><input class="nbp-in" name="n" placeholder="New habit, e.g. Write notes for 15 minutes" maxlength="40" required><button class="nbp-btn pri" type="submit"><i class="fa-solid fa-plus"></i> Add habit</button></form></div>';
    }

    var RENDER = { daily: tDaily, weekly: tWeekly, monthly: tMonthly, todo: tTodo, goals: tGoals, revision: tRevision, exam: tExam, pomo: tPomo, habit: tHabit };

    /* =================== SHELL =================== */
    var baseTitle = document.title, built = false, cdTimer = null;
    function build() {
        if (built && $('nbPlanner')) return; built = true;
        var o = document.createElement('div'); o.id = 'nbPlanner'; o.className = 'nbp'; o.setAttribute('aria-hidden', 'true');
        o.innerHTML = '<div class="nbp-sheet" role="dialog" aria-modal="true" aria-label="Study Planner"><div class="nbp-head"><div class="nbp-head-r1"><h3><i class="fa-solid fa-calendar-check"></i> Study Planner</h3><button type="button" class="nbp-x" data-a="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="nbp-sum" id="nbpSum"></div></div><div class="nbp-tabs" id="nbpTabs" role="tablist"></div><div class="nbp-body" id="nbpBody"></div></div>';
        document.body.appendChild(o);
        o.addEventListener('click', onClick);
        o.addEventListener('submit', onSubmit);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && o.classList.contains('open')) close(); });
    }
    function paintHead() {
        var s = summary(), rv = s.rev;
        $('nbpSum').innerHTML = '<span><i class="fa-solid fa-sun"></i> ' + s.blocksDone + '/' + s.blocks + ' sessions today</span><span><i class="fa-solid fa-clipboard-check"></i> ' + s.pend + ' tasks pending</span><span><i class="fa-solid fa-stopwatch"></i> ' + s.pomo + ' focus</span>' + (rv ? '<span><i class="fa-solid fa-bell"></i> ' + rv + ' to revise</span>' : '');
        $('nbpTabs').innerHTML = TABS.map(function (t) {
            return '<button type="button" role="tab" class="nbp-tab' + (S.tab === t[0] ? ' on' : '') + '" data-a="tab" data-t="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '"><i class="fa-solid ' + t[1] + '"></i>' + t[2] + (t[0] === 'revision' && rv ? '<em>' + rv + '</em>' : '') + '</button>';
        }).join('');
    }
    function paint(keepScroll) {
        var b = $('nbpBody'); if (!b) return; var y = b.scrollTop;
        paintHead(); b.innerHTML = RENDER[S.tab]();
        if (keepScroll) b.scrollTop = y; else b.scrollTop = 0;
        if (S.tab === 'pomo') pmPaint();
        clearInterval(cdTimer);
        if (S.tab === 'exam') cdTimer = setInterval(cdTick, 1000);
        var act = document.querySelector('#nbpTabs .on'); if (act && act.scrollIntoView) { try { act.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} }
    }
    function cdTick() {
        var cards = document.querySelectorAll('#nbpBody .nbp-ex'), i;
        for (i = 0; i < cards.length; i++) { var p = cdParts(cards[i].dataset.end); ['d', 'h', 'm', 's'].forEach(function (u) { var el = cards[i].querySelector('[data-u="' + u + '"]'); if (el) el.textContent = u === 'd' ? p[u] : pad(p[u]); }); }
    }
    function open(tab) {
        build(); if (tab && RENDER[tab]) S.tab = tab;
        try { if (typeof window.closeModal === 'function') window.closeModal('mobileMenuModal'); } catch (e) {}
        $('nbPlanner').classList.add('open'); $('nbPlanner').setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
        paint(false);
    }
    function close() {
        var o = $('nbPlanner'); if (!o) return; o.classList.remove('open'); o.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
        clearInterval(cdTimer); refreshHome();
    }

    /* =================== EVENTS =================== */
    function save(k, v) { jset(k, v); }
    function onClick(e) {
        if (e.target === $('nbPlanner')) return close();
        var el = e.target.closest('[data-a]'); if (!el) return;
        var a = el.dataset.a, id = el.dataset.id, i;
        switch (a) {
            case 'close': return close();
            case 'tab': S.tab = el.dataset.t; return paint(false);
            /* daily */
            case 'dprev': S.day = addDays(S.day, -1); return paint(true);
            case 'dnext': S.day = addDays(S.day, 1); return paint(true);
            case 'bdone': { var b = blocks(); b.forEach(function (x) { if (x.id === id) { x.done = !x.done; if (x.done) markDay(); } }); save(K.blocks, b); return paint(true); }
            case 'bdel': save(K.blocks, blocks().filter(function (x) { return x.id !== id; })); return paint(true);
            case 'fillweek': {
                var wd = (pdate(S.day).getDay() + 6) % 7, slots = arr(week()[wd]), bl = blocks(), added = 0;
                slots.forEach(function (s) { if (!bl.some(function (x) { return x.d === S.day && x.s === s.s && x.subj === s.subj; })) { bl.push({ id: uid(), d: S.day, s: s.s, e: s.e, subj: s.subj, topic: '', done: false }); added++; } });
                save(K.blocks, bl); toast(added ? added + ' session(s) added from timetable' : (slots.length ? 'Already added' : 'No timetable slots for ' + WDL[wd])); return paint(true);
            }
            /* weekly */
            case 'wdel': { var w = week(), dd = el.dataset.day; w[dd] = arr(w[dd]).filter(function (x) { return x.id !== id; }); save(K.week, w); return paint(true); }
            /* monthly */
            case 'mprev': S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); return paint(true);
            case 'mnext': S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); return paint(true);
            case 'pick': S.day = el.dataset.k; { var pm = pdate(S.day); if (pm.getMonth() !== S.month.getMonth()) S.month = new Date(pm.getFullYear(), pm.getMonth(), 1); } return paint(true);
            case 'godaily': S.tab = 'daily'; return paint(false);
            /* todo */
            case 'tf': S.tf = el.dataset.v; return paint(true);
            case 'tdone': { var t = todos(); t.forEach(function (x) { if (x.id === id) { x.done = !x.done; if (x.done) markDay(); } }); save(K.todo, t); return paint(true); }
            case 'tdel': save(K.todo, todos().filter(function (x) { return x.id !== id; })); return paint(true);
            case 'clrdone': save(K.todo, todos().filter(function (x) { return !x.done; })); return paint(true);
            /* goals */
            case 'ginc': case 'gdec': { var g = goals(); g.forEach(function (x) { if (x.id === id) { x.done = Math.max(0, Math.min(x.target, x.done + (a === 'ginc' ? 1 : -1))); if (a === 'ginc') markDay(); } }); save(K.goals, g); return paint(true); }
            case 'gdel': save(K.goals, goals().filter(function (x) { return x.id !== id; })); return paint(true);
            /* revision */
            case 'rdone': { var r = revs(); r.forEach(function (x) { if (x.id === id) { x.done = !x.done; if (x.done) markDay(); } }); save(K.rev, r); return paint(true); }
            case 'rdel': save(K.rev, revs().filter(function (x) { return x.id !== id; })); return paint(true);
            case 'notif': try { Notification.requestPermission().then(function () { paint(true); }); } catch (x) {} return;
            /* exam */
            case 'xdel': save(K.exams, exams().filter(function (x) { return x.id !== id; })); syncExam(); return paint(true);
            /* pomodoro */
            case 'pmode': if (PM.run) { clearInterval(PM.t); PM.run = false; } PM.mode = el.dataset.m; PM.left = pmLen(PM.mode); return pmPaint();
            case 'pmreset': clearInterval(PM.t); PM.run = false; PM.left = pmLen(PM.mode); return pmPaint();
            case 'pmskip': return pmFinish(true);
            /* habits */
            case 'hdone': { var h = habits(), idx = +el.dataset.i, l = h.log[dkey()] || [], p = l.indexOf(idx); if (p >= 0) l.splice(p, 1); else { l.push(idx); markDay(); } h.log[dkey()] = l; save('nb_habits', h); return paint(true); }
            case 'hdel': {
                var hh = habits(), di = +el.dataset.i; hh.list.splice(di, 1);
                Object.keys(hh.log).forEach(function (k) { hh.log[k] = arr(hh.log[k]).filter(function (n) { return n !== di; }).map(function (n) { return n > di ? n - 1 : n; }); });
                save('nb_habits', hh); return paint(true);
            }
        }
    }
    function onSubmit(e) {
        var f = e.target.closest('[data-f]'); if (!f) return; e.preventDefault();
        var fd = new FormData(f), v = function (n) { return fd.get(n); }, kind = f.dataset.f, i;
        if (kind === 'block') {
            if (v('e') <= v('s')) return toast('End time must be after start time');
            var b = blocks(); b.push({ id: uid(), d: S.day, s: v('s'), e: v('e'), subj: clean(v('subj'), 30), topic: clean(v('topic'), 50), done: false }); save(K.blocks, b);
        } else if (kind === 'slot') {
            if (v('e') <= v('s')) return toast('End time must be after start time');
            var w = week(), days = v('days') === 'all' ? [0, 1, 2, 3, 4, 5, 6] : v('days') === 'wk' ? [0, 1, 2, 3, 4, 5] : [+v('days')];
            days.forEach(function (d) { w[d] = arr(w[d]); w[d].push({ id: uid(), s: v('s'), e: v('e'), subj: clean(v('subj'), 30) }); }); save(K.week, w);
        } else if (kind === 'todo') {
            var t = todos(); t.push({ id: uid(), x: clean(v('x'), 80), p: v('p') || 'm', d: v('d') || '', done: false }); save(K.todo, t);
        } else if (kind === 'goal') {
            var g = goals(); g.push({ id: uid(), subj: clean(v('subj'), 30), title: clean(v('title'), 60), target: Math.max(1, +v('target') || 1), done: 0, unit: clean(v('unit'), 14) || 'items', due: v('due') || '' }); save(K.goals, g);
        } else if (kind === 'rev') {
            var r = revs(), base = dkey(), tp = clean(v('topic'), 60), sj = clean(v('subj'), 30);
            REV_STEPS.forEach(function (n, k) { r.push({ id: uid() + k, subj: sj, topic: tp, d: addDays(base, n), step: k + 1, done: false }); }); save(K.rev, r); toast('Revisions scheduled: ' + REV_STEPS.join(', ') + ' days');
        } else if (kind === 'exam') {
            var x = exams(); x.push({ id: uid(), name: clean(v('name'), 30), date: v('date'), created: dkey() }); save(K.exams, x); syncExam();
        } else if (kind === 'pset') {
            PM.subj = clean(v('subj'), 40); save(K.pset, { f: Math.min(120, Math.max(1, +v('f') || 25)), b: Math.min(60, Math.max(1, +v('b') || 5)), l: Math.min(60, Math.max(1, +v('l') || 15)) });
            if (!PM.run) PM.left = pmLen(PM.mode); toast('Timer settings saved'); return pmPaint();
        } else if (kind === 'habit') {
            var h = habits(); if (h.list.length >= 12) return toast('Maximum 12 habits'); h.list.push(clean(v('n'), 40)); save('nb_habits', h);
        }
        paint(true);
    }

    /* =================== HOME SECTION =================== */
    var HOME_TILES = [
        ['daily', 'fa-sun', 'Daily Planner'], ['weekly', 'fa-table-cells', 'Weekly Timetable'], ['monthly', 'fa-calendar-days', 'Monthly Calendar'],
        ['todo', 'fa-clipboard-check', 'To-Do List'], ['goals', 'fa-bullseye', 'Subject Goals'], ['revision', 'fa-rotate', 'Revision Reminders'],
        ['exam', 'fa-hourglass-half', 'Exam Countdown'], ['pomo', 'fa-stopwatch', 'Pomodoro Timer'], ['habit', 'fa-seedling', 'Habit Tracker']
    ];
    function tileSub(k) {
        var s = summary(), ex = examList().filter(function (e) { return e.date >= dkey(); })[0], h = habits();
        switch (k) {
            case 'daily': return s.blocks ? s.blocksDone + '/' + s.blocks + ' done' : 'Plan today';
            case 'weekly': return Object.keys(week()).reduce(function (n, d) { return n + arr(week()[d]).length; }, 0) + ' slots';
            case 'monthly': return new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
            case 'todo': return s.pend + ' pending';
            case 'goals': return goals().length + ' goals';
            case 'revision': return s.rev ? s.rev + ' due now' : 'All clear';
            case 'exam': return ex ? diffDays(dkey(), ex.date) + ' days left' : 'Set date';
            case 'pomo': return s.pomo + ' today';
            case 'habit': return (h.log[dkey()] || []).length + '/' + h.list.length + ' today';
        }
        return '';
    }
    function refreshHome() {
        var home = $('homeView'); if (!home) return;
        var sec = $('nbpHome');
        if (!sec) {
            sec = document.createElement('section'); sec.id = 'nbpHome'; sec.className = 'nbp-home'; sec.setAttribute('aria-label', 'Study Planner');
            sec.addEventListener('click', function (e) { var b = e.target.closest('[data-open]'); if (b) open(b.dataset.open); });
            var anchor = $('nbDash2') || $('nbPlan');
            if (anchor && anchor.parentNode === home) home.insertBefore(sec, anchor.nextSibling);
            else if (home.firstElementChild && home.firstElementChild.nextSibling) home.insertBefore(sec, home.firstElementChild.nextSibling);
            else home.appendChild(sec);
        }
        var s = summary();
        sec.innerHTML = '<div class="nbp-hero"><div class="nbp-hero-top"><div><h2><i class="fa-solid fa-calendar-check"></i> Study Planner</h2><p>' + (s.rev ? s.rev + ' topic(s) to revise today. ' : '') + 'Plan, track and revise everything in one place.</p></div><button type="button" class="nbp-open-btn" data-open="daily"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open planner</button></div>' +
            '<div class="nbp-tiles">' + HOME_TILES.map(function (t) { return '<button type="button" class="nbp-tile" data-open="' + t[0] + '"><i class="fa-solid ' + t[1] + '"></i><b>' + t[2] + '</b><small>' + esc(tileSub(t[0])) + '</small></button>'; }).join('') + '</div></div>';
    }

    /* =================== BOOT =================== */
    function dueAlert() {
        var n = revDue().length; if (!n) return;
        try { if (sessionStorage.getItem('nbp_alert') === dkey()) return; sessionStorage.setItem('nbp_alert', dkey()); } catch (e) {}
        setTimeout(function () { toast(n + ' topic(s) to revise today. Open Study Planner > Revision.', 4500); tone(); }, 2500);
        try { if (window.Notification && Notification.permission === 'granted') new Notification('Notes Bazar', { body: n + ' topic(s) to revise today.' }); } catch (e) {}
    }
    function hookMenus() {
        var o = window.nbhDo;
        if (typeof o === 'function' && !o.__nbp) {
            var w = function (act) { if (act === 'plan') { try { o.call(this, '__nbp'); } catch (e) {} open('daily'); return; } return o.apply(this, arguments); };
            w.__nbp = true; window.nbhDo = w;
        }
        var wrap = $('mobileMenuModal'); if (wrap && !$('nbpMenuBtn')) {
            var ref = wrap.querySelector('[onclick*="openExam"]'), sub = ref ? ref.parentNode : wrap.querySelector('.nbm-sub'); if (sub) { var b = document.createElement('button'); b.type = 'button'; b.id = 'nbpMenuBtn'; b.className = 'nbm-i'; b.style.setProperty('--nbm-ic', '#7c3aed'); b.innerHTML = '<i class="fa-solid fa-calendar-check"></i><span>Study Planner</span>'; b.onclick = function () { open('daily'); }; sub.insertBefore(b, sub.firstChild); }
        }
    }
    function boot() {
        refreshHome(); hookMenus(); dueAlert();
        var tries = 0, iv = setInterval(function () { hookMenus(); if (!$('nbpHome') || !$('nbpHome').parentNode) refreshHome(); if (++tries > 20) clearInterval(iv); }, 800);
        window.addEventListener('storage', function () { refreshHome(); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshHome(); });
        var oSw = window.switchView;
        if (typeof oSw === 'function' && !oSw.__nbp) { var w = function () { var r = oSw.apply(this, arguments); setTimeout(refreshHome, 80); return r; }; w.__nbp = true; window.switchView = w; }
    }
    window.NBPlanner = { open: open, close: close, refresh: refreshHome };
    window.openStudyPlanner = function (t) { try { open(t || 'daily'); } catch (e) { console.warn('Planner', e); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1100); });
    else setTimeout(boot, 1100);
})();


/* =====================================================================
   Header menu module
   1) Three-line (hamburger) button: opens the full menu on DESKTOP too
      (all layouts), not only on phones.
   2) Student Super App (Pro) layout: every option lives in the top header
      (Planner, Tools, Help, search, theme, settings, ...), no side drawer.
   ===================================================================== */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var root = document.documentElement;

    function fn(path) {                       /* call window.a.b safely */
        var parts = path.split('.'), o = window, i;
        for (i = 0; i < parts.length - 1; i++) { o = o && o[parts[i]]; }
        var f = o && o[parts[parts.length - 1]];
        return typeof f === 'function' ? function () { return f.apply(o, arguments); } : null;
    }
    function modal(id) { var f = fn('openModal'); if (f) f(id); }
    function plan(t) { if (window.NBPlanner) window.NBPlanner.open(t); }
    var ACT = {
        planner: function () { plan('daily'); }, todo: function () { plan('todo'); }, exam: function () { plan('exam'); },
        pomo: function () { plan('pomo'); }, habit: function () { plan('habit'); }, goals: function () { plan('goals'); },
        calc: function () { (fn('NB.openCalc') || function () {})(); }, quiz: function () { (fn('NB.openQuiz') || function () {})(); },
        pdf: function () { (fn('NB.openPdfMaker') || function () {})(); }, hist: function () { (fn('NB.openTestHistory') || function () {})(); },
        sounds: function () { (fn('NB.openSounds') || function () {})(); }, voice: function () { (fn('NB.openVoice') || function () {})(); },
        ai: function () { modal('aiModal'); }, support: function () { modal('supportModal'); }, complain: function () { modal('complainModal'); },
        wish: function () { modal('wishModal'); }, insta: function () { window.open('https://www.instagram.com/_shailesh_136/', '_blank', 'noopener'); },
        search: function () { (fn('nbhSearch') || function () {})(); },
        dark: function () { var f = fn('nbhDo'); if (f) f('dark'); else root.classList.toggle('dark'); },
        settings: function () { (fn('openSettings') || function () {})(); }, theme: function () { modal('themeModal'); },
        profile: function () { (fn('NB.openProfile') || function () {})(); }
    };

    /* ---------- 1. hamburger -> full menu (desktop + mobile) ---------- */
    function menuEl() { return $('mobileMenuModal'); }
    function force(m) { m.style.setProperty('display', 'flex', 'important'); m.style.setProperty('z-index', '2147483000', 'important'); }
    function unforce(m) { m.style.removeProperty('display'); m.style.removeProperty('z-index'); }
    function openMenu() {
        var m = menuEl(); if (!m) return;
        try { var f = fn('openModal'); if (f) f('mobileMenuModal'); } catch (e) {}
        m.classList.remove('hidden'); force(m);
        try { var a = m.querySelector('.nbm-x'); if (a) a.focus({ preventScroll: true }); } catch (e) {}
    }
    function closeMenu() { var m = menuEl(); if (!m) return; try { var f = fn('closeModal'); if (f) f('mobileMenuModal'); } catch (e) {} m.classList.add('hidden'); unforce(m); }
    function watchMenu() {
        var m = menuEl(); if (!m || m.__nbw) return; m.__nbw = 1;
        try { new MutationObserver(function () { if (m.classList.contains('hidden')) unforce(m); }).observe(m, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('#nbHeader .nbh-left > .nbh-ib, #nbHeader [aria-label="Open menu"]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation(); watchMenu(); openMenu();
    }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var m = menuEl(); if (m && !m.classList.contains('hidden')) closeMenu(); } });

    /* ---------- 2. Pro layout header: all the options ---------- */
    function btn(cls, act, icon, label, color) {
        return '<button type="button" class="' + cls + '" data-nbpdo="' + act + '"' + (color ? ' style="--nbp-ic:' + color + '"' : '') + ' title="' + label + '"><i class="fa-solid ' + icon + '" aria-hidden="true"></i><span>' + label + '</span></button>';
    }
    function dd(id, icon, label, items) {
        return '<div class="nbp-dd" id="' + id + '"><button type="button" class="nbh-tab nbp-dd-b" data-nbpdd="' + id + '" aria-haspopup="true" aria-expanded="false"><i class="fa-solid ' + icon + '" aria-hidden="true"></i><span>' + label + '</span><i class="fa-solid fa-chevron-down nbp-car" aria-hidden="true"></i></button>' +
            '<div class="nbp-dd-p" role="menu">' + items.map(function (x) { return btn('nbp-dd-i', x[0], x[1], x[2], x[3]); }).join('') + '</div></div>';
    }
    function buildPro() {
        var nav = document.querySelector('#nbHeader .nbh-nav'), right = document.querySelector('#nbHeader .nbh-right');
        if (!nav || !right || $('nbpProExtra')) return;
        var ex = document.createElement('span'); ex.id = 'nbpProExtra'; ex.className = 'nbp-extra';
        ex.innerHTML = btn('nbh-tab', 'planner', 'fa-calendar-check', 'Planner', '#8b5cf6') +
            dd('nbpDdTools', 'fa-screwdriver-wrench', 'Tools', [
                ['todo', 'fa-clipboard-check', 'To-Do List', '#d946ef'], ['exam', 'fa-hourglass-half', 'Exam Countdown', '#8b5cf6'], ['pomo', 'fa-stopwatch', 'Pomodoro Timer', '#ef4444'],
                ['habit', 'fa-seedling', 'Habit Tracker', '#10b981'], ['goals', 'fa-bullseye', 'Subject Goals', '#f59e0b'],
                ['calc', 'fa-calculator', 'Calculator', '#0ea5e9'], ['quiz', 'fa-list-check', 'Tests & Quiz', '#f59e0b'], ['pdf', 'fa-file-pdf', 'AI PDF Maker', '#0ea5e9'],
                ['hist', 'fa-chart-line', 'Test History', '#6366f1'], ['sounds', 'fa-music', 'Reminder tones', '#0ea5e9'], ['voice', 'fa-microphone-lines', 'Voice & speed', '#8b5cf6']
            ]) +
            btn('nbh-tab', 'ai', 'fa-robot', 'Bazar AI', '#a855f7') +
            dd('nbpDdHelp', 'fa-life-ring', 'Help', [
                ['support', 'fa-headset', 'Support', '#3b82f6'], ['complain', 'fa-circle-exclamation', 'Complain', '#f43f5e'], ['wish', 'fa-lightbulb', 'What if you want?', '#14b8a6'], ['insta', 'fa-address-book', 'Contact Us', '#ec4899']
            ]);
        nav.appendChild(ex);
        var rx = document.createElement('span'); rx.id = 'nbpProRight'; rx.className = 'nbp-extra nbp-extra-r';
        rx.innerHTML = btn('nbh-ib nbp-ib', 'search', 'fa-magnifying-glass', 'Search') + btn('nbh-ib nbp-ib', 'dark', 'fa-moon', 'Dark mode') + btn('nbh-ib nbp-ib', 'settings', 'fa-gear', 'Settings');
        right.insertBefore(rx, right.firstChild);
    }
    function closeDd(except) {
        var l = document.querySelectorAll('.nbp-dd.open'), i;
        for (i = 0; i < l.length; i++) if (l[i] !== except) { l[i].classList.remove('open'); l[i].firstChild.setAttribute('aria-expanded', 'false'); }
    }
    document.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target : null; if (!t) return;
        var d = t.closest('[data-nbpdd]');
        if (d) { var w = $(d.dataset.nbpdd), on = !w.classList.contains('open'); closeDd(w); w.classList.toggle('open', on); d.setAttribute('aria-expanded', on ? 'true' : 'false'); return; }
        var a = t.closest('[data-nbpdo]');
        if (a) { closeDd(); var f = ACT[a.dataset.nbpdo]; if (f) { try { f(); } catch (er) { console.warn(er); } } return; }
        closeDd();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDd(); });
    function init() { buildPro(); watchMenu(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    /* header may be re-rendered by other scripts: re-check for a few seconds */
    var n = 0, iv = setInterval(function () { init(); if (++n > 20) clearInterval(iv); }, 700);
})();
