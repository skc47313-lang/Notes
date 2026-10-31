/* =====================================================================
   Notes Bazar – admin.js
   UI layer of the full-screen Admin Dashboard.
   app.js keeps all data + actions (upload, edit, reply, safe, hero...) and
   calls NBAdmin.render(tab, ctx) whenever something changes; this file draws
   the sidebar, top bar, dashboard widgets and the extra pages
   (Categories, Users, Analytics, Settings, Appearance, Notifications).
   ===================================================================== */
(function () {
    'use strict';
    var A = window.NBAdmin = {};
    var DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var q = function (v) { return esc(JSON.stringify(String(v == null ? '' : v))); };           // safe JS string inside an HTML attribute
    var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var dkey = function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
    var fmtN = function (n) {
        n = Number(n) || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
        if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
        return n.toLocaleString('en-IN');
    };
    function ago(ts) {
        if (!ts) return '';
        var m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
        if (m < 1) return 'just now';
        if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
        var h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
        var d = Math.floor(h / 24); if (d < 31) return d + (d === 1 ? ' day ago' : ' days ago');
        var mo = Math.floor(d / 30); return mo < 12 ? mo + (mo === 1 ? ' month ago' : ' months ago') : Math.floor(mo / 12) + ' yr ago';
    }
    function fdate(ts) { return ts ? new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; }
    function toast(m) { if (window.nbToast) window.nbToast(m, 3200); else try { alert(m); } catch (e) {} }

    var S = {
        ctx: null, tab: 'overview', range: 30, metric: 'views', catDim: 'subject',
        compact: lsGet('nb_adm_compact') === '1', email: '', usersQ: '', usersShown: 24, catView: 'subject', rulesShown: false
    };
    var NAV = [
        { id: 'overview', label: 'Dashboard', icon: 'fa-house' },
        { id: 'uploads', label: 'Manage Notes', icon: 'fa-file-lines' },
        { id: 'categories', label: 'Manage Categories', icon: 'fa-layer-group' },
        { id: 'users', label: 'View Users', icon: 'fa-users' },
        { id: 'analytics', label: 'Analytics', icon: 'fa-chart-column' },
        { id: 'settings', label: 'Settings', icon: 'fa-gear' },
        { id: 'appearance', label: 'Appearance', icon: 'fa-palette' },
        { id: 'notifications', label: 'Notifications', icon: 'fa-bell', badge: 'pending' },
        { id: 'support', label: 'Support', icon: 'fa-circle-question', group: ['support', 'complain', 'wish'] },
        { id: 'safe', label: 'Safe Folder', icon: 'fa-lock' }
    ];
    var BNAV = [['overview', 'Home', 'fa-house'], ['uploads', 'Notes', 'fa-file-lines'], ['users', 'Users', 'fa-users'], ['settings', 'Settings', 'fa-gear']];
    var PAGES = {
        uploads: { t: 'Manage Notes', d: 'Upload, edit, hide or delete notes, books and PYQ.' },
        categories: { t: 'Manage Categories', d: 'See every class and subject, rename subjects and jump to their notes.' },
        users: { t: 'View Users', d: 'Students who created an account on Notes Bazar.' },
        analytics: { t: 'Analytics', d: 'Visits, visitors, uploads and the most popular resources.' },
        settings: { t: 'Settings', d: 'Admin account, backup, data refresh and Firebase rules.' },
        appearance: { t: 'Appearance', d: 'Colours, dark mode and the Home hero slider.' },
        notifications: { t: 'Notifications', d: 'Messages waiting for your reply and everything that happened lately.' },
        support: { t: 'Support', d: 'Questions, complaints and requests from students.' },
        complain: { t: 'Support', d: 'Questions, complaints and requests from students.' },
        wish: { t: 'Support', d: 'Questions, complaints and requests from students.' },
        safe: { t: 'Safe Folder', d: 'Your private, password-protected files.' }
    };

    /* =============================== derived data =============================== */
    function allItems(c) { return (c.items || []).concat(c.priv || []); }
    function pendingMsgs(c) { return (c.msgs || []).filter(function (m) { return !m.reply; }); }
    function statSum(c, k) { var t = 0, s = c.stats || {}; Object.keys(s).forEach(function (id) { if (s[id] && typeof s[id] === 'object') t += Number(s[id][k]) || 0; }); return t; }
    function typeName(t) { return t === 'book' ? 'book' : t === 'pyq' ? 'PYQ' : 'note'; }
    function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
    var CHIP = ['c-blue', 'c-purple', 'c-green', 'c-orange', 'c-teal', 'c-rose', 'c-amber'];
    function chipCls(s) { return CHIP[hash(s) % CHIP.length]; }
    function fileIcon(i) {
        var n = String(i.fileName || '').toLowerCase();
        if (i.fileLink) return { i: 'fa-link', c: 'c-teal' };
        if (/\.pdf$/.test(n) || !n) return { i: 'fa-file-pdf', c: 'c-rose' };
        if (/\.(docx?|rtf|txt)$/.test(n)) return { i: 'fa-file-word', c: 'c-blue' };
        if (/\.(pptx?)$/.test(n)) return { i: 'fa-file-powerpoint', c: 'c-orange' };
        if (/\.(xlsx?|csv)$/.test(n)) return { i: 'fa-file-excel', c: 'c-green' };
        if (/\.(png|jpe?g|gif|webp)$/.test(n)) return { i: 'fa-file-image', c: 'c-purple' };
        if (/\.(zip|rar|7z)$/.test(n)) return { i: 'fa-file-zipper', c: 'c-amber' };
        return { i: 'fa-file-lines', c: 'c-blue' };
    }

    /* ---- daily visits (public node written by app.js trackVisit) ---- */
    var daily = { state: 'idle', data: {}, at: 0, err: '' };
    function loadDaily(force) {
        if (daily.state === 'loading') return;
        if (!force && daily.state !== 'idle' && Date.now() - daily.at < 60000) return;
        daily.state = 'loading';
        fetch(window.NBA.dburl + '/notes_bazar_daily.json', { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) { daily.data = (d && typeof d === 'object') ? d : {}; daily.state = 'ok'; daily.at = Date.now(); rerender(); })
            .catch(function (e) { daily.state = 'err'; daily.err = String(e && e.message || e); daily.at = Date.now(); rerender(); });
    }
    function dayVal(k, key) { var d = daily.data && daily.data[k]; return d && typeof d === 'object' ? Number(d[key]) || 0 : 0; }

    function buildSeries(c, metric, range) {
        var now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()), pts = [], i, d;
        var ups = allItems(c);
        function upsOn(pred) { var n = 0; ups.forEach(function (x) { if (x.createdAt && pred(new Date(x.createdAt))) n++; }); return n; }
        if (range > 180) {
            for (i = 11; i >= 0; i--) {
                d = new Date(t0.getFullYear(), t0.getMonth() - i, 1);
                var pre = d.getFullYear() + '-' + p2(d.getMonth() + 1), v = 0;
                if (metric === 'uploads') v = upsOn(function (x) { return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); });
                else Object.keys(daily.data || {}).forEach(function (k) { if (k.indexOf(pre) === 0) v += dayVal(k, metric === 'visitors' ? 'u' : 'v'); });
                pts.push({ l: MON[d.getMonth()], t: MON[d.getMonth()] + ' ' + d.getFullYear(), v: v });
            }
        } else {
            for (i = range - 1; i >= 0; i--) {
                d = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - i);
                var key = dkey(d), val;
                if (metric === 'uploads') { var y = d.getFullYear(), m = d.getMonth(), dd = d.getDate(); val = upsOn(function (x) { return x.getFullYear() === y && x.getMonth() === m && x.getDate() === dd; }); }
                else val = dayVal(key, metric === 'visitors' ? 'u' : 'v');
                pts.push({ l: range <= 7 ? WD[d.getDay()] : d.getDate() + ' ' + MON[d.getMonth()], t: WD[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()], v: val });
            }
        }
        return pts;
    }
    var UNIT = { views: 'Visits', visitors: 'Visitors', uploads: 'Uploads' };

    /* =============================== charts =============================== */
    function niceMax(m) {
        if (m <= 4) return 4;
        var e = Math.pow(10, Math.floor(Math.log10(m / 4))), f = (m / 4) / e, n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
        return n * e * 4;
    }
    function smooth(P) {
        if (P.length < 2) return '';
        var d = 'M' + P[0][0].toFixed(1) + ' ' + P[0][1].toFixed(1);
        for (var i = 0; i < P.length - 1; i++) {
            var p0 = P[i - 1] || P[i], p1 = P[i], p2_ = P[i + 1], p3 = P[i + 2] || p2_;
            var lo = Math.min(p1[1], p2_[1]), hi = Math.max(p1[1], p2_[1]);
            var c1y = Math.min(hi, Math.max(lo, p1[1] + (p2_[1] - p0[1]) / 6)), c2y = Math.min(hi, Math.max(lo, p2_[1] - (p3[1] - p1[1]) / 6));
            d += 'C' + (p1[0] + (p2_[0] - p0[0]) / 6).toFixed(1) + ' ' + c1y.toFixed(1) + ',' + (p2_[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + c2y.toFixed(1) + ',' + p2_[0].toFixed(1) + ' ' + p2_[1].toFixed(1);
        }
        return d;
    }
    function drawChart(el, pts, unit) {
        if (!el) return;
        var W = el.clientWidth, H = el.clientHeight;
        if (!W || !H) { el.__pending = [pts, unit]; return; }
        el.__pending = null;
        var L = 40, R = 12, T = 12, B = 26, max = 0;
        pts.forEach(function (p) { if (p.v > max) max = p.v; });
        var top = niceMax(max), iw = Math.max(10, W - L - R), ih = Math.max(10, H - T - B), n = pts.length;
        var X = function (i) { return L + (n === 1 ? iw / 2 : i * iw / (n - 1)); }, Y = function (v) { return T + ih - (v / top) * ih; };
        var P = pts.map(function (p, i) { return [X(i), Y(p.v)]; });
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(unit + ' chart') + '"><defs><linearGradient id="aAr_' + el.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity=".30"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>';
        for (var g = 0; g <= 4; g++) {
            var gy = T + ih - g * ih / 4;
            s += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/><text class="tk" x="' + (L - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + fmtN(top * g / 4) + '</text>';
        }
        var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / (n > 12 ? 62 : 44)))));
        pts.forEach(function (p, i) { if ((n - 1 - i) % step === 0) s += '<text class="tk" x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 && n > 1 ? 'start' : 'middle') + '">' + esc(p.l) + '</text>'; });
        if (n > 1) {
            s += '<path class="ar" fill="url(#aAr_' + el.id + ')" d="' + smooth(P) + 'L' + P[n - 1][0].toFixed(1) + ' ' + (T + ih) + 'L' + P[0][0].toFixed(1) + ' ' + (T + ih) + 'Z"/><path class="ln" d="' + smooth(P) + '"/>';
        } else s += '<circle class="dt" r="4" cx="' + P[0][0] + '" cy="' + P[0][1] + '"/>';
        if (n <= 31) P.forEach(function (pt, i) { if (pts[i].v > 0 || n <= 8) s += '<circle class="dt" r="3.4" cx="' + pt[0].toFixed(1) + '" cy="' + pt[1].toFixed(1) + '"/>'; });
        s += '<line class="gd" id="aGd" x1="0" x2="0" y1="' + T + '" y2="' + (T + ih) + '" style="display:none"/><circle class="dt" id="aGc" r="5" cx="0" cy="0" style="display:none"/></svg><div class="a-tip" id="aTip" style="display:none"></div>';
        el.innerHTML = s;
        var tip = el.querySelector('#aTip'), gd = el.querySelector('#aGd'), gc = el.querySelector('#aGc');
        function show(i) {
            i = Math.max(0, Math.min(n - 1, i)); var p = pts[i];
            gd.setAttribute('x1', P[i][0]); gd.setAttribute('x2', P[i][0]); gd.style.display = '';
            gc.setAttribute('cx', P[i][0]); gc.setAttribute('cy', P[i][1]); gc.style.display = '';
            tip.innerHTML = fmtN(p.v) + ' ' + esc(unit) + '<small>' + esc(p.t) + '</small>'; tip.style.display = '';
            var tx = Math.max(52, Math.min(W - 52, P[i][0])); tip.style.left = tx + 'px'; tip.style.top = Math.max(34, P[i][1] - 10) + 'px';
        }
        function hide() { tip.style.display = 'none'; gd.style.display = 'none'; gc.style.display = 'none'; }
        el.onpointermove = function (e) { var r = el.getBoundingClientRect(); show(Math.round((e.clientX - r.left - L) / (iw / Math.max(1, n - 1)))); };
        el.onpointerleave = hide; el.onpointercancel = hide;
        el.onclick = function (e) { var r = el.getBoundingClientRect(); show(Math.round((e.clientX - r.left - L) / (iw / Math.max(1, n - 1)))); };
    }
    function donutHtml(parts, total, centerLabel) {
        var R = 15.9155, acc = 0, ring = '<circle cx="21" cy="21" r="' + R + '" stroke="var(--a-hover)"/>';
        parts.forEach(function (p) {
            if (!p.pct) return;
            ring += '<circle cx="21" cy="21" r="' + R + '" stroke="' + p.color + '" stroke-dasharray="' + Math.max(0, p.pct - .6) + ' ' + (100 - Math.max(0, p.pct - .6)) + '" stroke-dashoffset="' + (-acc) + '" stroke-linecap="butt"/>';
            acc += p.pct;
        });
        var leg = parts.map(function (p) { return '<li><i style="background:' + p.color + '"></i><span class="n" title="' + esc(p.name) + '">' + esc(p.name) + '</span><span class="p">' + p.pct + '%</span></li>'; }).join('');
        return '<div class="a-donut"><svg viewBox="0 0 42 42" aria-hidden="true">' + ring + '</svg><div class="ctr"><b>' + fmtN(total) + '</b><small>' + esc(centerLabel) + '</small></div></div><ul class="a-legend">' + leg + '</ul>';
    }
    var PAL = ['#3b6ff5', '#14b8a6', '#22c55e', '#ec4899', '#f59e0b', '#8b5cf6'];
    function groupBy(c, dim) {
        var map = {};
        allItems(c).forEach(function (i) {
            var k = dim === 'type' ? ({ note: 'Notes', book: 'Books', pyq: 'PYQ' }[i.type || 'note'] || 'Notes') : dim === 'class' ? (i.className || 'General') : (i.subject || 'General');
            var o = map[k] || (map[k] = { name: k, n: 0, pub: 0, priv: 0, v: 0, d: 0, ids: [] });
            o.n++; if (i.private) o.priv++; else o.pub++;
            var st = (c.stats || {})[i.id]; if (st) { o.v += Number(st.v) || 0; o.d += Number(st.d) || 0; }
            o.ids.push(i.id);
        });
        return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });
    }
    function percents(vals) {   // largest-remainder so the legend always adds up to 100
        var tot = vals.reduce(function (a, b) { return a + b; }, 0); if (!tot) return vals.map(function () { return 0; });
        var raw = vals.map(function (v) { return v * 100 / tot; }), fl = raw.map(Math.floor), left = 100 - fl.reduce(function (a, b) { return a + b; }, 0);
        raw.map(function (r, i) { return [r - fl[i], i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, left).forEach(function (x) { fl[x[1]]++; });
        return fl;
    }

    /* =============================== shell: nav, top bar =============================== */
    function setNav(c) {
        var pend = pendingMsgs(c).length, tab = S.tab, on = function (n) { return n.group ? n.group.indexOf(tab) >= 0 : n.id === tab; };
        $('aNav').innerHTML = NAV.map(function (n) {
            var b = n.badge === 'pending' && pend ? '<span class="a-badge">' + (pend > 99 ? '99+' : pend) + '</span>' : '';
            return '<button type="button" class="a-ni' + (on(n) ? ' on' : '') + '" onclick="NBAdmin.go(\'' + n.id + '\')" title="' + esc(n.label) + '"' + (on(n) ? ' aria-current="page"' : '') + '><i class="fa-solid ' + n.icon + '"></i><span class="t">' + esc(n.label) + '</span>' + b + '</button>';
        }).join('') + '<button type="button" class="a-ni out" onclick="NBAdmin.closeAll();adminLogout()" title="Logout"><i class="fa-solid fa-right-from-bracket"></i><span class="t">Logout</span></button>';
        $('aBnav').innerHTML = BNAV.map(function (b) {
            var act = b[0] === tab || (b[0] === 'overview' && tab === 'overview');
            return '<button type="button" class="' + (act ? 'on' : '') + '" onclick="NBAdmin.go(\'' + b[0] + '\')"><i class="fa-solid ' + b[2] + '"></i>' + b[1] + '</button>';
        }).join('');
        var bb = $('aBellBadge'); bb.textContent = pend > 99 ? '99+' : pend; bb.classList.toggle('hidden', !pend);
        $('aTopTitle').textContent = tab === 'overview' ? 'Dashboard' : (PAGES[tab] ? PAGES[tab].t : 'Dashboard');
        $('aApp').classList.toggle('compact', S.compact);
        var y = $('aYear'); if (y) y.textContent = new Date().getFullYear();
        var av = $('aAv'), mail = $('aAccMail');
        if (S.email) { av.textContent = S.email.charAt(0).toUpperCase(); mail.textContent = S.email; }
        else if (!S.emailAsked) { S.emailAsked = true; window.NBA.email().then(function (e) { S.emailAsked = false; if (e) { S.email = e; rerender(); } }); }
    }
    function pageHead() {
        var h = $('aPageHead'), p = PAGES[S.tab];
        if (!p || S.tab === 'overview') { h.classList.add('hidden'); return; }
        var acts = '';
        if (S.tab === 'uploads') acts = '<button class="a-btn pri" onclick="openUploadModal()"><i class="fa-solid fa-plus"></i>Upload New</button>';
        else if (S.tab === 'categories') acts = '<button class="a-btn" onclick="adminSwitchTab(\'uploads\')"><i class="fa-solid fa-file-lines"></i>Manage Notes</button>';
        else if (S.tab === 'users') acts = '<button class="a-btn" onclick="NBAdmin.reloadUsers()"><i class="fa-solid fa-rotate"></i>Refresh</button>';
        else if (S.tab === 'analytics') acts = '<button class="a-btn" onclick="NBAdmin.reloadDaily()"><i class="fa-solid fa-rotate"></i>Refresh</button>';
        else if (S.tab === 'appearance' || S.tab === 'settings') acts = '<button class="a-btn pri" onclick="NBAdmin.hero()"><i class="fa-solid fa-wand-magic-sparkles"></i>Customize Hero</button>';
        h.innerHTML = '<div><h1>' + esc(p.t) + '</h1><p>' + esc(p.d) + '</p></div><div class="acts">' + acts + '</div>';
        h.classList.remove('hidden');
    }
    function supBar(c) {
        var bar = $('aSupBar'), on = ['support', 'complain', 'wish'].indexOf(S.tab) >= 0;
        bar.classList.toggle('hidden', !on); if (!on) return;
        var T = [['support', 'Support', 'fa-headset'], ['complain', 'Complaints', 'fa-circle-exclamation'], ['wish', 'User Requests', 'fa-lightbulb']];
        bar.innerHTML = T.map(function (t) {
            var all = (c.msgs || []).filter(function (m) { return m.type === t[0]; }), pd = all.filter(function (m) { return !m.reply; }).length;
            return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" class="' + (S.tab === t[0] ? 'on' : '') + '" onclick="adminSwitchTab(\'' + t[0] + '\')"><i class="fa-solid ' + t[2] + '"></i>' + t[1] + '<span class="cnt">' + all.length + '</span>' + (pd ? '<span class="pd" title="' + pd + ' waiting"></span>' : '') + '</button>';
        }).join('');
    }

    /* =============================== dashboard (overview) =============================== */
    function stat(cls, label, val, icon, sub, flat, go) {
        return '<button type="button" class="a-stat ' + cls + '" onclick="' + go + '"><span class="ic"><i class="fa-solid ' + icon + '"></i></span><span class="tx"><span class="lb">' + esc(label) + '</span><span class="vl">' + val + '</span><span class="dl' + (flat ? ' flat' : '') + '">' + sub + '</span></span></button>';
    }
    function overview(c) {
        var items = allItems(c), now = Date.now(), month = items.filter(function (i) { return i.createdAt && now - i.createdAt < 30 * DAY; }).length;
        var views = statSum(c, 'v'), dls = statSum(c, 'd'), today = dkey(new Date());
        var usersN = users.state === 'ok' ? users.count : null;
        var act = daily.state === 'ok' ? dayVal(today, 'u') : null;
        $('admStats').innerHTML =
            stat('s1', 'Total Notes', fmtN(items.length), 'fa-file-lines', month ? '<i class="fa-solid fa-arrow-up"></i> +' + month + ' this month' : 'No new uploads this month', !month, "adminSwitchTab('uploads')") +
            stat('s2', 'Total Users', usersN == null ? '&mdash;' : fmtN(usersN), 'fa-users', usersN == null ? (users.state === 'denied' ? 'Allow access to see this' : users.state === 'loading' ? 'Loading&hellip;' : 'Tap to view') : 'Registered students', true, "adminSwitchTab('users')") +
            stat('s3', 'Total Views', fmtN(views), 'fa-eye', dls ? '<i class="fa-solid fa-download"></i> ' + fmtN(dls) + ' downloads' : 'Counted per resource', !dls, "adminSwitchTab('analytics')") +
            stat('s4', 'Active Today', act == null ? '&mdash;' : fmtN(act), 'fa-star', daily.state === 'err' ? 'Visit rule needed' : act == null ? 'Loading&hellip;' : fmtN(dayVal(today, 'v')) + ' visits today', daily.state !== 'ok' || !act, "adminSwitchTab('analytics')");

        // chart
        $('admRangeSeg').innerHTML = [[7, '7D'], [30, '30D'], [90, '90D'], [365, '1Y']].map(function (r) { return '<button type="button" class="' + (S.range === r[0] ? 'on' : '') + '" aria-pressed="' + (S.range === r[0]) + '" onclick="NBAdmin.setRange(' + r[0] + ')">' + r[1] + '</button>'; }).join('');
        $('admMetricSeg').innerHTML = chartMetricBtns();
        drawMain($('admChart'), c, $('admChartNote'));

        // donut
        $('admCatSeg').innerHTML = [['subject', 'Subject'], ['class', 'Class'], ['type', 'Type']].map(function (d) { return '<button type="button" class="' + (S.catDim === d[0] ? 'on' : '') + '" aria-pressed="' + (S.catDim === d[0]) + '" onclick="NBAdmin.setCat(\'' + d[0] + '\')">' + d[1] + '</button>'; }).join('');
        var g = groupBy(c, S.catDim), parts = [];
        if (!g.length) $('admDonut').innerHTML = '<div class="a-empty"><i class="fa-solid fa-chart-pie"></i>Upload some notes to see categories here.</div>';
        else {
            var top = g.slice(0, 3), rest = g.slice(3).reduce(function (a, b) { return a + b.n; }, 0);
            parts = top.map(function (x, i) { return { name: x.name, v: x.n, color: PAL[i] }; });
            if (rest) parts.push({ name: 'Others', v: rest, color: PAL[3] });
            var pc = percents(parts.map(function (p) { return p.v; })); parts.forEach(function (p, i) { p.pct = pc[i]; });
            $('admDonut').innerHTML = donutHtml(parts, items.length, 'Total');
        }

        // activity
        var ev = events(c).slice(0, 5);
        $('admFeed').innerHTML = ev.length ? ev.map(feedLi).join('') : '<li class="a-empty" style="width:100%"><i class="fa-regular fa-clock"></i>Nothing has happened yet.<br>Uploads and student messages will show up here.</li>';

        // recent
        var rec = items.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 3);
        $('admRecent').innerHTML = rec.length ? rec.map(recentRow).join('') : '<div class="a-empty"><i class="fa-regular fa-file-lines"></i>No notes uploaded yet.<br><button class="a-btn pri sm" style="margin-top:10px" onclick="openUploadModal()"><i class="fa-solid fa-plus"></i>Upload your first note</button></div>';

        // quick actions
        var Q = [['q1', 'fa-plus', 'Add New Note', 'openUploadModal()'], ['q2', 'fa-layer-group', 'Manage Categories', "adminSwitchTab('categories')"], ['q3', 'fa-users', 'View Users', "adminSwitchTab('users')"], ['q4', 'fa-gear', 'Site Settings', "adminSwitchTab('settings')"], ['q5', 'fa-wand-magic-sparkles', 'Customize Hero', 'NBAdmin.hero()'], ['q6', 'fa-headset', 'Support Inbox', "adminSwitchTab('support')"]];
        $('admQuick').innerHTML = Q.map(function (x) { return '<button type="button" class="a-qa ' + x[0] + '" onclick="' + x[3] + '"><i class="fa-solid ' + x[1] + '"></i><span>' + x[2] + '</span></button>'; }).join('');
    }
    function chartMetricBtns() {
        return [['views', 'Visits'], ['visitors', 'Visitors'], ['uploads', 'Uploads']].map(function (m) { return '<button type="button" class="' + (S.metric === m[0] ? 'on' : '') + '" aria-pressed="' + (S.metric === m[0]) + '" onclick="NBAdmin.setMetric(\'' + m[0] + '\')">' + m[1] + '</button>'; }).join('');
    }
    function drawMain(el, c, noteEl) {
        var pts = buildSeries(c, S.metric, S.range);
        drawChart(el, pts, UNIT[S.metric]);
        var note = '';
        if (S.metric !== 'uploads') {
            if (daily.state === 'err') note = 'Visit data could not be read (' + esc(daily.err) + '). <button type="button" onclick="NBAdmin.showRules(\'daily\')">Show the Firebase rule</button>';
            else if (daily.state === 'ok' && !pts.some(function (p) { return p.v > 0; })) note = 'Visit tracking is on. The graph fills in as students open the website. If it stays empty for a day, <button type="button" onclick="NBAdmin.showRules(\'daily\')">add the Firebase rule</button>.';
        }
        if (noteEl) { noteEl.innerHTML = note; noteEl.classList.toggle('hidden', !note); }
    }
    function events(c) {
        var ev = [];
        allItems(c).forEach(function (i) {
            if (!i.createdAt) return;
            ev.push({ ts: i.createdAt, ic: 'fa-file-circle-plus', c: i.private ? 'c-amber' : 'c-blue', t: 'A new ' + typeName(i.type) + ' was added' + (i.private ? ' (private)' : ''), s: i.title || '', go: "adminSwitchTab('uploads')" });
        });
        (c.msgs || []).forEach(function (m) {
            if (!m.createdAt) return;
            var k = { support: ['fa-headset', 'c-teal', 'Support message from '], complain: ['fa-circle-exclamation', 'c-rose', 'Complaint from '], wish: ['fa-lightbulb', 'c-purple', 'New request from '] }[m.type] || ['fa-envelope', 'c-teal', 'Message from '];
            ev.push({ ts: m.createdAt, ic: k[0], c: k[1], t: k[2] + (m.name || 'a student'), s: String(m.message || '').replace(/^\[[^\]]*\]\s*/, ''), go: "adminSwitchTab('" + (m.type in { support: 1, complain: 1, wish: 1 } ? m.type : 'support') + "')", wait: !m.reply });
        });
        return ev.sort(function (a, b) { return b.ts - a.ts; });
    }
    function feedLi(e) {
        return '<li><span class="fi ' + e.c + '"><i class="fa-solid ' + e.ic + '"></i></span><div class="ft"><b>' + esc(e.t) + '</b><span title="' + esc(e.s) + '">' + (e.s ? esc(e.s) + ' &middot; ' : '') + esc(ago(e.ts)) + '</span></div></li>';
    }
    function recentRow(i) {
        var f = fileIcon(i), sub = i.subject || 'General';
        return '<div class="a-rn"><span class="fi ' + f.c + '"><i class="fa-solid ' + f.i + '"></i></span><div class="tx"><b title="' + esc(i.title) + '">' + esc(i.title) + '</b><span>' + (i.createdAt ? 'Updated: ' + esc(ago(i.createdAt)) : esc(i.className || '')) + (i.private ? ' &middot; Private' : '') + '</span></div>' +
            '<span class="a-chip ' + chipCls(sub) + '">' + esc(sub) + '</span>' +
            '<button type="button" class="a-dots" aria-label="Actions for ' + esc(i.title) + '" aria-haspopup="true" onclick="NBAdmin.menu(event,\'aRm' + esc(i.id) + '\')"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
            '<div class="a-pop" id="aRm' + esc(i.id) + '" hidden role="menu">' +
            '<button type="button" role="menuitem" onclick="NBAdmin.closeAll();openPreview(' + q(i.id) + ')"><i class="fa-solid fa-eye"></i>Preview</button>' +
            '<button type="button" role="menuitem" onclick="NBAdmin.closeAll();openEditItem(' + q(i.id) + ')"><i class="fa-solid fa-pen"></i>Edit</button>' +
            '<button type="button" role="menuitem" onclick="NBAdmin.closeAll();toggleVisibility(' + q(i.id) + ')"><i class="fa-solid ' + (i.private ? 'fa-globe' : 'fa-lock') + '"></i>' + (i.private ? 'Make public' : 'Make private') + '</button>' +
            '<button type="button" role="menuitem" class="danger" onclick="NBAdmin.closeAll();deleteCloudItem(' + q(i.id) + ')"><i class="fa-solid fa-trash"></i>Delete</button></div></div>';
    }

    /* =============================== Categories =============================== */
    function pageCategories(c) {
        var dimTabs = '<div class="a-seg" role="group" aria-label="Group by">' + [['subject', 'Subjects'], ['class', 'Classes'], ['type', 'Types']].map(function (d) { return '<button type="button" class="' + (S.catView === d[0] ? 'on' : '') + '" onclick="NBAdmin.setCatView(\'' + d[0] + '\')">' + d[1] + '</button>'; }).join('') + '</div>';
        var g = groupBy(c, S.catView), max = g.reduce(function (m, x) { return Math.max(m, x.n); }, 1), tot = allItems(c).length;
        var rows = g.map(function (x) {
            var acts = '<button class="a-btn sm" onclick="NBAdmin.viewCat(' + q(x.name) + ')"><i class="fa-solid fa-eye"></i>View</button>';
            if (S.catView === 'subject' && x.name !== 'General') acts += '<button class="a-btn sm" onclick="NBAdmin.renameSubject(' + q(x.name) + ')"><i class="fa-solid fa-pen"></i>Rename</button>';
            return '<tr><td class="nm"><span class="a-chip ' + chipCls(x.name) + '" style="max-width:220px">' + esc(x.name) + '</span></td><td class="r"><b>' + x.n + '</b></td><td style="min-width:110px"><div class="a-bar" title="' + Math.round(x.n * 100 / Math.max(1, tot)) + '% of all"><i style="width:' + Math.max(4, x.n * 100 / max) + '%"></i></div></td><td class="r">' + x.pub + ' / ' + x.priv + '</td><td class="r">' + fmtN(x.v) + '</td><td class="r">' + fmtN(x.d) + '</td><td><div class="acts">' + acts + '</div></td></tr>';
        }).join('');
        $('adminPanel-categories').innerHTML =
            '<div class="a-kpis"><div class="a-kpi"><small>Subjects</small><b>' + groupBy(c, 'subject').length + '</b></div><div class="a-kpi"><small>Classes in use</small><b>' + groupBy(c, 'class').length + '</b></div><div class="a-kpi"><small>Total resources</small><b>' + tot + '</b></div></div>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-layer-group"></i> Categories</h3>' + dimTabs + '</div>' +
            (g.length ? '<div class="a-tw"><table class="a-table"><thead><tr><th>Name</th><th class="r">Items</th><th>Share</th><th class="r">Public / Private</th><th class="r">Views</th><th class="r">Downloads</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="a-empty"><i class="fa-solid fa-layer-group"></i>No resources yet, so there are no categories.</div>') +
            (S.catView === 'subject' ? '<p class="a-note" style="background:var(--a-hover);border-color:var(--a-line);color:var(--a-mute)"><i class="fa-solid fa-circle-info"></i> Rename changes the subject of every note, book and PYQ inside it (public and private) in one step. Renaming to an existing subject merges the two.</p>' : '') +
            '</section>';
    }
    A.setCatView = function (v) { S.catView = v; rerender(); };
    A.viewCat = function (name) { var i = $('adminSearch'); if (i) i.value = name; window.adminSwitchTab('uploads'); };
    A.renameSubject = async function (from) {
        var to = prompt('Rename the subject "' + from + '" to:', from);
        if (to == null) return; to = to.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40);
        if (!to || to === from) return;
        var n = (S.ctx.items.concat(S.ctx.priv)).filter(function (i) { return (i.subject || 'General') === from; }).length;
        if (!confirm('Change the subject of ' + n + ' item' + (n === 1 ? '' : 's') + ' from "' + from + '" to "' + to + '"?')) return;
        try { var done = await window.NBA.renameSubject(from, to); toast('Renamed ' + done + ' item' + (done === 1 ? '' : 's') + ' ✓'); }
        catch (e) { alert('Rename failed: ' + (e && (e.code || e.message) || e)); }
    };

    /* =============================== Users =============================== */
    var users = { state: 'idle', keys: [], count: 0, docs: {}, loading: false, err: '' };
    async function usersFetch(path) {
        var tok = await window.NBA.token(); if (!tok) { var e = new Error('Not signed in'); e.status = 401; throw e; }
        var r = await fetch(window.NBA.dburl + path + (path.indexOf('?') < 0 ? '?' : '&') + 'auth=' + encodeURIComponent(tok), { cache: 'no-store' });
        if (!r.ok) { var er = new Error('HTTP ' + r.status); er.status = r.status; throw er; }
        return r.json();
    }
    async function loadUsers(force) {
        if (users.state === 'loading') return;
        if (!force && (users.state === 'ok' || users.state === 'denied')) return;
        users.state = 'loading'; rerender();
        try {
            var k = await usersFetch('/notes_bazar_users.json?shallow=true');
            users.keys = k ? Object.keys(k) : []; users.count = users.keys.length; users.docs = {}; users.state = 'ok';
            rerender(); loadMoreUsers();
        } catch (e) { users.state = (e.status === 401 || e.status === 403) ? 'denied' : 'err'; users.err = e.message; rerender(); }
    }
    async function loadMoreUsers() {
        var need = users.keys.slice(0, S.usersShown).filter(function (k) { return !(k in users.docs); });
        if (!need.length || users.loading) return;
        users.loading = true; rerender();
        for (var i = 0; i < need.length; i += 6) {
            await Promise.all(need.slice(i, i + 6).map(async function (uid) {
                try { var d = await usersFetch('/notes_bazar_users/' + encodeURIComponent(uid) + '.json'); users.docs[uid] = d || {}; } catch (e) { users.docs[uid] = {}; }
            }));
        }
        users.loading = false; rerender();
    }
    A.reloadUsers = function () { loadUsers(true); };
    A.moreUsers = function () { S.usersShown += 24; loadMoreUsers(); rerender(); };
    A.searchUsers = function (v) { S.usersQ = v; var pos = v.length; rerender(); var i = $('aUserQ'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } };
    function userRows() {
        var term = S.usersQ.toLowerCase().trim();
        var list = users.keys.map(function (k) { var d = users.docs[k]; return { uid: k, d: d, p: (d && d.profile) || {} }; });
        list.sort(function (a, b) { return ((b.d && b.d.updatedAt) || 0) - ((a.d && a.d.updatedAt) || 0); });
        if (term) list = list.filter(function (u) { return [u.p.name, u.p.userId, u.p.cls].join(' ').toLowerCase().indexOf(term) >= 0; });
        return list;
    }
    function pageUsers(c) {
        var el = $('adminPanel-users');
        if (users.state === 'idle') { loadUsers(); }
        if (users.state === 'loading' && !users.count) { el.innerHTML = '<div class="a-card"><div class="a-loading"><i class="fa-solid fa-spinner fa-spin"></i>Loading users&hellip;</div></div>'; return; }
        if (users.state === 'denied' || users.state === 'err') {
            el.innerHTML = '<div class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-users"></i> Users list is locked</h3></div><p style="margin:0 0 6px;font-size:13.5px;line-height:1.6;color:var(--a-mute)">' + (users.state === 'denied' ? 'Firebase is not allowing the admin to read the list of students yet. This is a one-time setup:' : 'Could not load users (' + esc(users.err) + '). If this keeps happening, check the rule below:') + '</p><ol style="margin:8px 0 0 18px;padding:0;font-size:13px;line-height:1.7;color:var(--a-mute)"><li>Open Firebase Console &rarr; Realtime Database &rarr; <b>Rules</b>.</li><li>Replace the <code>notes_bazar_users</code> block with the text below and press <b>Publish</b>.</li></ol><div id="aUsersRule"></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="a-btn pri sm" onclick="NBAdmin.copyRule(\'users\')"><i class="fa-regular fa-copy"></i>Copy rule</button><button class="a-btn sm" onclick="NBAdmin.reloadUsers()"><i class="fa-solid fa-rotate"></i>Try again</button></div></div>';
            ruleInto($('aUsersRule'), 'users'); return;
        }
        var all = userRows(), shown = all.slice(0, S.usersShown), today = dkey(new Date());
        var activeToday = Object.keys(users.docs).filter(function (k) { var d = users.docs[k]; return d && Array.isArray(d.days) ? d.days.indexOf(today) >= 0 : false; }).length;
        var rows = shown.map(function (u) {
            var p = u.p, nm = p.name || 'Student', av = /^data:image\/(png|jpe?g|webp|gif);base64,/.test(p.photo || '') && String(p.photo).length < 400000 ? '<img alt="" src="' + esc(p.photo) + '">' : esc(nm.charAt(0).toUpperCase());
            var d = u.d || {}, favs = d.favs ? (Array.isArray(d.favs) ? d.favs.length : Object.keys(d.favs).length) : 0;
            return '<div class="a-user"><span class="av">' + av + '</span><div class="tx"><b>' + esc(nm) + '</b><span>' + (p.userId ? '@' + esc(p.userId) : 'No User ID') + (p.cls ? ' &middot; ' + esc(p.cls) : '') + '</span></div><div class="meta"><span>' + (d.updatedAt ? 'Active ' + esc(ago(d.updatedAt)) : (u.uid in users.docs ? 'No activity yet' : 'Loading&hellip;')) + '</span><span><i class="fa-solid fa-heart"></i> ' + favs + ' saved</span></div><button type="button" class="a-btn sm" style="margin-left:8px;color:#e11d48" title="Delete account" aria-label="Delete account of ' + esc(nm) + '" onclick="NBLayout.adminDelete(' + q(u.uid) + ',' + q(nm) + ')"><i class="fa-solid fa-trash"></i></button></div>';
        }).join('');
        el.innerHTML = '<div class="a-kpis"><div class="a-kpi"><small>Registered students</small><b>' + fmtN(users.count) + '</b><span>Accounts created on the site</span></div><div class="a-kpi"><small>Visitors today</small><b>' + (daily.state === 'ok' ? fmtN(dayVal(today, 'u')) : '&mdash;') + '</b><span>Unique devices</span></div><div class="a-kpi"><small>Active today (loaded)</small><b>' + activeToday + '</b><span>Of the profiles shown below</span></div></div>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-users"></i> Students</h3><div class="a-search" style="flex:1;min-width:180px;max-width:320px"><i class="fa-solid fa-magnifying-glass"></i><input id="aUserQ" type="search" value="' + esc(S.usersQ) + '" placeholder="Search name, User ID or class" oninput="NBAdmin.searchUsers(this.value)" aria-label="Search students"></div></div>' +
            (shown.length ? '<div>' + rows + '</div>' : '<div class="a-empty"><i class="fa-solid fa-user-graduate"></i>' + (users.count ? 'No student matches your search.' : 'No student has created an account yet.') + '</div>') +
            (users.loading ? '<div class="a-loading"><i class="fa-solid fa-spinner fa-spin"></i>Loading profiles&hellip;</div>' : '') +
            (all.length > shown.length || users.keys.length > S.usersShown ? '<div style="text-align:center;margin-top:12px"><button class="a-btn" onclick="NBAdmin.moreUsers()">Load more</button></div>' : '') + '</section>';
    }

    /* =============================== Analytics =============================== */
    function pageAnalytics(c) {
        var el = $('adminPanel-analytics'), items = allItems(c), pts = buildSeries(c, S.metric, S.range), sum = pts.reduce(function (a, p) { return a + p.v; }, 0);
        var vis = buildSeries(c, 'views', S.range).reduce(function (a, p) { return a + p.v; }, 0), uv = buildSeries(c, 'visitors', S.range).reduce(function (a, p) { return a + p.v; }, 0), up = buildSeries(c, 'uploads', S.range).reduce(function (a, p) { return a + p.v; }, 0);
        var rl = { 7: 'last 7 days', 30: 'last 30 days', 90: 'last 90 days', 365: 'last 12 months' }[S.range];
        var top = items.map(function (i) { var s = (c.stats || {})[i.id] || {}; return { i: i, v: Number(s.v) || 0, d: Number(s.d) || 0 }; }).filter(function (x) { return x.v || x.d; }).sort(function (a, b) { return (b.v + b.d * 3) - (a.v + a.d * 3); }).slice(0, 8);
        var maxv = top.reduce(function (m, x) { return Math.max(m, x.v); }, 1);
        var byType = groupBy(c, 'type'), tmax = byType.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
        var subj = groupBy(c, 'subject').filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6), smax = subj.reduce(function (m, x) { return Math.max(m, x.v); }, 1);
        el.innerHTML =
            '<div class="a-kpis"><div class="a-kpi"><small>Visits</small><b>' + (daily.state === 'ok' ? fmtN(vis) : '&mdash;') + '</b><span>' + rl + '</span></div><div class="a-kpi"><small>Unique visitors</small><b>' + (daily.state === 'ok' ? fmtN(uv) : '&mdash;') + '</b><span>' + rl + '</span></div><div class="a-kpi"><small>New uploads</small><b>' + fmtN(up) + '</b><span>' + rl + '</span></div><div class="a-kpi"><small>Resource views</small><b>' + fmtN(statSum(c, 'v')) + '</b><span>All time</span></div><div class="a-kpi"><small>Downloads</small><b>' + fmtN(statSum(c, 'd')) + '</b><span>All time</span></div></div>' +
            '<section class="a-card" style="margin-bottom:18px"><div class="a-ch"><h3><i class="fa-solid fa-chart-column"></i> ' + UNIT[S.metric] + ' &middot; ' + rl + ' <span style="font-weight:600;color:var(--a-mute);font-size:13px">(' + fmtN(sum) + ' total)</span></h3><div class="a-seg" id="anRange" role="group" aria-label="Range">' + [[7, '7D'], [30, '30D'], [90, '90D'], [365, '1Y']].map(function (r) { return '<button type="button" class="' + (S.range === r[0] ? 'on' : '') + '" onclick="NBAdmin.setRange(' + r[0] + ')">' + r[1] + '</button>'; }).join('') + '</div></div><div class="a-metric">' + chartMetricBtns() + '</div><div class="a-chart" id="anChart" style="height:280px"></div><p class="a-note hidden" id="anNote"></p></section>' +
            '<div class="a-two"><section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-fire"></i> Most viewed resources</h3></div>' +
            (top.length ? '<div class="a-tw"><table class="a-table"><thead><tr><th>Title</th><th class="r">Views</th><th class="r">Downloads</th><th></th></tr></thead><tbody>' + top.map(function (x) { return '<tr><td class="nm">' + esc(x.i.title) + '<div style="font-weight:500;font-size:11.5px;color:var(--a-mute)">' + esc(x.i.className || '') + ' &middot; ' + esc(x.i.subject || '') + '</div><div class="a-bar" style="margin-top:6px"><i style="width:' + Math.max(4, x.v * 100 / maxv) + '%"></i></div></td><td class="r"><b>' + fmtN(x.v) + '</b></td><td class="r">' + fmtN(x.d) + '</td><td class="r"><button class="a-btn sm" onclick="openPreview(' + q(x.i.id) + ')"><i class="fa-solid fa-eye"></i></button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="a-empty"><i class="fa-regular fa-eye"></i>Views and downloads will appear here once students open your resources.</div>') + '</section>' +
            '<div class="a-stack"><section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-layer-group"></i> By type</h3></div>' + (byType.length ? byType.map(function (x) { return '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:5px"><span>' + esc(x.name) + '</span><span>' + x.n + '</span></div><div class="a-bar"><i style="width:' + Math.max(4, x.n * 100 / tmax) + '%"></i></div></div>'; }).join('') : '<div class="a-empty">No data yet.</div>') + '</section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-book"></i> Subjects by views</h3></div>' + (subj.length ? subj.map(function (x) { return '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:5px"><span>' + esc(x.name) + '</span><span>' + fmtN(x.v) + '</span></div><div class="a-bar"><i style="width:' + Math.max(4, x.v * 100 / smax) + '%"></i></div></div>'; }).join('') : '<div class="a-empty">No views yet.</div>') + '</section></div></div>';
        drawMain($('anChart'), c, $('anNote'));
    }
    A.reloadDaily = function () { loadDaily(true); };

    /* =============================== Settings =============================== */
    var RULES = {
        daily: function () { return '"notes_bazar_daily": {\n  ".read": true,\n  "$day": {\n    "v": { ".write": true, ".validate": "newData.isNumber()" },\n    "u": { ".write": true, ".validate": "newData.isNumber()" }\n  }\n}'; },
        users: function (em) { return '"notes_bazar_users": {\n  ".read": "auth != null && auth.token.email === \'' + em + '\'",\n  "$uid": {\n    ".read": "auth != null && auth.uid === $uid",\n    ".write": "auth != null && (auth.uid === $uid || auth.token.email === \'' + em + '\')"\n  }\n}'; }
    };
    function ruleText(k) { return RULES[k](S.email || 'YOUR_ADMIN_EMAIL'); }
    function ruleInto(el, k) { if (el) el.innerHTML = '<pre class="a-code">' + esc(ruleText(k)) + '</pre>'; }
    A.copyRule = function (k) {
        var t = ruleText(k);
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Rule copied ✓'); }).catch(function () { prompt('Copy this rule:', t); });
    };
    A.showRules = function (k) { S.rulesShown = k; window.adminSwitchTab('settings'); };
    function pageSettings(c) {
        var el = $('adminPanel-settings'), email = S.email || '…';
        el.innerHTML =
            '<div class="a-two"><div class="a-stack">' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-user-shield"></i> Admin account</h3></div>' +
            '<div class="a-row"><div class="tx"><b>' + esc(email) + '</b><span>You are signed in as the site admin.</span></div><button class="a-btn" onclick="NBAdmin.resetPw()"><i class="fa-solid fa-key"></i>Send password reset</button></div>' +
            '<div class="a-row"><div class="tx"><b>Log out</b><span>Ends the admin session on this device.</span></div><button class="a-btn dng" onclick="NBAdmin.closeAll();adminLogout()"><i class="fa-solid fa-right-from-bracket"></i>Logout</button></div><div class="a-msg" id="aSetMsg"></div></section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-globe"></i> Website</h3></div>' +
            '<div class="a-row"><div class="tx"><b>Home hero slider</b><span>Edit slides, text, colours and buttons shown on the Home page.</span></div><button class="a-btn pri" onclick="NBAdmin.hero()"><i class="fa-solid fa-wand-magic-sparkles"></i>Customize Hero</button></div>' +
            '<div class="a-row"><div class="tx"><b>Open the website</b><span>Closes the dashboard. You stay logged in.</span></div><button class="a-btn" onclick="closeAdminDashboard()"><i class="fa-solid fa-arrow-up-right-from-square"></i>View website</button></div>' +
            '<div class="a-row"><div class="tx"><b>Refresh data</b><span>Reload notes, messages and private items from Firebase.</span></div><button class="a-btn" id="aRefBtn" onclick="NBAdmin.refresh()"><i class="fa-solid fa-rotate"></i>Refresh</button></div></section>' +
            '</div><div class="a-stack">' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-database"></i> Data &amp; backup</h3></div>' +
            '<div class="a-row"><div class="tx"><b>Download backup (JSON)</b><span>All note details, categories and messages (' + allItems(c).length + ' items, ' + (c.msgs || []).length + ' messages). Files themselves are not included.</span></div><button class="a-btn" onclick="NBAdmin.backup()"><i class="fa-solid fa-download"></i>Download</button></div>' +
            '<div class="a-row"><div class="tx"><b>Clear offline cache</b><span>If the site looks old on this device, this removes saved copies and reloads.</span></div><button class="a-btn" onclick="NBAdmin.clearCache()"><i class="fa-solid fa-broom"></i>Clear &amp; reload</button></div></section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-shield-halved"></i> Firebase rules</h3></div>' +
            '<div class="a-row"><div class="tx"><b>Private items &amp; Safe folder</b><span>Rules that keep private material visible to you only.</span></div><button class="a-btn" onclick="openRulesHelp()"><i class="fa-solid fa-lock"></i>Show</button></div>' +
            '<div class="a-row"><div class="tx"><b>Visit analytics</b><span>Lets the site count daily visits for the Analytics chart.</span></div><button class="a-btn" onclick="NBAdmin.toggleRule(\'daily\')"><i class="fa-solid fa-chart-line"></i>' + (S.rulesShown === 'daily' ? 'Hide' : 'Show') + '</button></div>' + (S.rulesShown === 'daily' ? '<div id="aRuleDaily"></div><button class="a-btn pri sm" onclick="NBAdmin.copyRule(\'daily\')"><i class="fa-regular fa-copy"></i>Copy rule</button>' : '') +
            '<div class="a-row"><div class="tx"><b>Users list</b><span>Lets only you read the list of registered students.</span></div><button class="a-btn" onclick="NBAdmin.toggleRule(\'users\')"><i class="fa-solid fa-users"></i>' + (S.rulesShown === 'users' ? 'Hide' : 'Show') + '</button></div>' + (S.rulesShown === 'users' ? '<div id="aRuleUsers"></div><button class="a-btn pri sm" onclick="NBAdmin.copyRule(\'users\')"><i class="fa-regular fa-copy"></i>Copy rule</button>' : '') + '</section>' +
            '</div></div>';
        if (S.rulesShown === 'daily') ruleInto($('aRuleDaily'), 'daily');
        if (S.rulesShown === 'users') ruleInto($('aRuleUsers'), 'users');
    }
    A.toggleRule = function (k) { S.rulesShown = S.rulesShown === k ? false : k; rerender(); };
    A.resetPw = async function () {
        var m = $('aSetMsg'); m.className = 'a-msg'; m.textContent = 'Sending…';
        try { var e = await window.NBA.resetPassword(); m.className = 'a-msg ok'; m.textContent = 'Reset link sent to ' + e + '. Check the inbox.'; }
        catch (e) { m.className = 'a-msg err'; m.textContent = 'Could not send: ' + (e && (e.code || e.message) || e); }
    };
    A.refresh = async function () {
        var b = $('aRefBtn'); if (b) { b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Refreshing'; }
        try { await window.NBA.refresh(); loadDaily(true); users.state = 'idle'; toast('Data refreshed ✓'); } catch (e) { toast('Refresh failed'); }
        if (b) { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-rotate"></i>Refresh'; }
    };
    A.backup = function () {
        var c = S.ctx, strip = function (i) { var o = {}; Object.keys(i).forEach(function (k) { if (k !== 'fileData') o[k] = i[k]; }); return o; };
        var data = { exportedAt: new Date().toISOString(), site: 'Notes Bazar', items: c.items.map(strip), privateItems: c.priv.map(strip), messages: c.msgs, stats: c.stats };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'notes-bazar-backup-' + dkey(new Date()) + '.json'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); toast('Backup downloaded ✓');
    };
    A.clearCache = async function () {
        if (!confirm('Remove saved copies of the site on this device and reload?')) return;
        try { if (window.caches) { var k = await caches.keys(); await Promise.all(k.map(function (x) { return caches.delete(x); })); } if (navigator.serviceWorker) { var r = await navigator.serviceWorker.getRegistrations(); await Promise.all(r.map(function (x) { return x.unregister(); })); } } catch (e) {}
        location.reload();
    };

    /* =============================== Appearance =============================== */
    var ACC = [['default', 'Indigo', '#6366f1', '#7c3aed'], ['blue', 'Blue', '#2563eb', '#1d4ed8'], ['emerald', 'Emerald', '#059669', '#10b981'], ['sunset', 'Sunset', '#ea580c', '#f97316']];
    var BGS = [['night', '#0f172a'], ['navy', '#172554'], ['forest', '#052e16'], ['wine', '#4c0519'], ['sunrise', 'linear-gradient(135deg,#fde68a,#fca5a5,#c4b5fd)'], ['ocean', 'linear-gradient(135deg,#0ea5e9,#6366f1,#8b5cf6)'], ['mint', 'linear-gradient(135deg,#a7f3d0,#bae6fd)'], ['dusk', 'linear-gradient(160deg,#1e1b4b,#7c3aed 60%,#ec4899)']];
    function curAccent() { var p = (document.documentElement.style.getPropertyValue('--theme-primary') || '').trim().toLowerCase(); return (ACC.filter(function (a) { return a[2] === p; })[0] || ACC[0])[0]; }
    function pageAppearance() {
        var dark = document.documentElement.classList.contains('dark'), cur = curAccent();
        $('adminPanel-appearance').innerHTML =
            '<div class="a-hero-card" style="margin-bottom:18px"><div class="tx"><b><i class="fa-solid fa-wand-magic-sparkles"></i> Home hero slider</b><p>The big banner on the Home page. Add, reorder or hide slides and change text, colours and buttons. Changes go live for everyone when you publish.</p></div><button class="a-btn-y" onclick="NBAdmin.hero()"><i class="fa-solid fa-pen-ruler"></i> Customize Hero</button></div>' +
            '<div class="a-two"><div class="a-stack"><section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-circle-half-stroke"></i> Mode</h3></div><div class="a-mode"><button class="' + (!dark ? 'on' : '') + '" onclick="NBAdmin.mode(\'light\')"><i class="fa-solid fa-sun"></i>Light</button><button class="' + (dark ? 'on' : '') + '" onclick="NBAdmin.mode(\'dark\')"><i class="fa-solid fa-moon"></i>Dark</button></div><p class="a-note" style="background:var(--a-hover);border-color:var(--a-line);color:var(--a-mute)">Applies to the dashboard and the whole website on this device.</p></section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-palette"></i> Accent colour</h3></div><div class="a-sw">' + ACC.map(function (a) { return '<button type="button" class="' + (cur === a[0] ? 'on' : '') + '" onclick="NBAdmin.accent(\'' + a[0] + '\')" aria-pressed="' + (cur === a[0]) + '"><i style="background:linear-gradient(135deg,' + a[2] + ',' + a[3] + ')"></i>' + a[1] + '</button>'; }).join('') + '</div></section></div>' +
            '<div class="a-stack"><section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-image"></i> Website background</h3><button class="a-btn sm" onclick="NBAdmin.bg(null)"><i class="fa-solid fa-rotate-left"></i>Reset</button></div><div class="a-sw bg">' + BGS.map(function (b) { return '<button type="button" onclick="NBAdmin.bg(\'' + b[0] + '\')" title="' + b[0] + '"><i style="background:' + b[1] + '"></i>' + b[0].charAt(0).toUpperCase() + b[0].slice(1) + '</button>'; }).join('') + '</div></section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-table-columns"></i> Dashboard layout</h3></div><div class="a-row"><div class="tx"><b>Compact sidebar</b><span>Show only icons in the sidebar on large screens.</span></div><button type="button" class="a-toggle" role="switch" aria-checked="' + S.compact + '" aria-label="Compact sidebar" onclick="NBAdmin.compact()"></button></div></section></div></div>';
    }
    A.mode = function (m) { if (window.setMode) window.setMode(m); rerender(); };
    A.accent = function (k) { if (window.setTheme) window.setTheme(k); rerender(); };
    A.bg = function (k) { if (k == null) { if (window.resetBg) window.resetBg(); } else if (window.setBgPreset) window.setBgPreset(k); toast(k == null ? 'Background reset' : 'Background changed ✓'); };
    A.compact = function () { S.compact = !S.compact; lsSet('nb_adm_compact', S.compact ? '1' : '0'); rerender(); };

    /* =============================== Notifications =============================== */
    function pageNotifications(c) {
        var pend = pendingMsgs(c).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        var STY = { support: ['fa-headset', 'c-teal', 'Support'], complain: ['fa-circle-exclamation', 'c-rose', 'Complaint'], wish: ['fa-lightbulb', 'c-purple', 'Request'] };
        var wait = pend.map(function (m) {
            var s = STY[m.type] || STY.support, body = String(m.message || '').replace(/^\[[^\]]*\]\s*/, '');
            return '<div class="a-user"><span class="av ' + s[1] + '" style="background:var(--fb);color:var(--fc)"><i class="fa-solid ' + s[0] + '"></i></span><div class="tx"><b>' + esc(s[2]) + ' &middot; ' + esc(m.name || 'Anonymous') + '</b><span title="' + esc(body) + '">' + esc(body) + '</span></div><div class="meta"><span>' + esc(ago(m.createdAt)) + '</span></div><button class="a-btn pri sm" onclick="openReplyModal(' + q(m.id) + ')"><i class="fa-solid fa-reply"></i>Reply</button></div>';
        }).join('');
        var ev = events(c).slice(0, 30);
        $('adminPanel-notifications').innerHTML =
            '<div class="a-two"><section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-bell"></i> Awaiting your reply <span class="a-pill c-amber">' + pend.length + '</span></h3></div>' + (wait || '<div class="a-empty"><i class="fa-regular fa-circle-check"></i>All messages have been answered 🎉</div>') + '</section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-wave-square"></i> Recent activity</h3></div>' + (ev.length ? '<ol class="a-feed">' + ev.map(feedLi).join('') + '</ol>' : '<div class="a-empty"><i class="fa-regular fa-clock"></i>Nothing has happened yet.</div>') + '</section></div>';
    }

    /* =============================== public API / glue =============================== */
    function rerender() { if (S.ctx && $('adminDashboardModal') && !$('adminDashboardModal').classList.contains('hidden')) A.render(S.tab, window.NBA.ctx()); }
    A.render = function (tab, c) {
        if (!$('aNav')) return;
        var changed = tab !== S.tab; S.tab = tab; S.ctx = c;
        if (changed) { closeMenus(); A.drawer(false); }
        setNav(c); pageHead(); supBar(c);
        if (tab === 'overview' || tab === 'analytics' || tab === 'users') loadDaily(false);
        if (tab === 'overview' || tab === 'users') { if (users.state === 'idle') loadUsers(); }
        if (tab === 'overview' || tab === 'analytics') { if (!c.statsLoaded) window.NBA.ensureStats().catch(function () {}); }
        if (tab === 'overview') overview(c);
        else if (tab === 'categories') pageCategories(c);
        else if (tab === 'users') pageUsers(c);
        else if (tab === 'analytics') pageAnalytics(c);
        else if (tab === 'settings') pageSettings(c);
        else if (tab === 'appearance') pageAppearance();
        else if (tab === 'notifications') pageNotifications(c);
    };
    A.go = function (id) { window.adminSwitchTab(id); };
    A.setRange = function (r) { S.range = r; rerender(); };
    A.setMetric = function (m) { S.metric = m; rerender(); };
    A.setCat = function (d) { S.catDim = d; rerender(); };
    A.hero = function () { closeMenus(); A.drawer(false); if (window.NB && NB.openHeroEditor) NB.openHeroEditor(); else toast('Hero editor is still loading, try again in a moment.'); };
    A.drawer = function (open) { var a = $('aApp'); if (a) a.classList.toggle('drawer', !!open); };
    A.burger = function () { if (window.matchMedia('(max-width:1023px)').matches) A.drawer(!$('aApp').classList.contains('drawer')); else A.compact(); };
    function closeMenus() { document.querySelectorAll('#adminDashboardModal .a-pop').forEach(function (p) { p.hidden = true; }); var b = $('aAccBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
    A.closeAll = function () { closeMenus(); A.drawer(false); };
    A.menu = function (e, id) {
        e.stopPropagation(); var p = $(id), was = p && !p.hidden; closeMenus();
        if (p && !was) { p.hidden = false; if (id === 'aAccMenu') $('aAccBtn').setAttribute('aria-expanded', 'true'); var f = p.querySelector('button'); if (f && e.detail === 0) f.focus(); }
    };
    document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.a-pop')) closeMenus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var m = $('adminDashboardModal'); if (m && !m.classList.contains('hidden')) { var open = document.querySelector('#adminDashboardModal .a-pop:not([hidden])'); if (open || $('aApp').classList.contains('drawer')) { closeMenus(); A.drawer(false); e.stopImmediatePropagation(); } } } }, true);
    window.addEventListener('resize', function () {
        var m = $('adminDashboardModal'); if (!m || m.classList.contains('hidden')) return;
        if (!window.matchMedia('(max-width:1023px)').matches) A.drawer(false);
        clearTimeout(A._rt); A._rt = setTimeout(function () { ['admChart', 'anChart'].forEach(function (id) { var el = $(id); if (el && el.clientWidth) { rerender(); } }); }, 120);
    });
})();
