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
    /* ---------------- layout catalogue ----------------
       The first 6 are the original CSS layouts (layouts.css). The others are described by a small spec and their CSS
       is generated below, so adding one more design only means adding one more line here.
       spec: dark = forces dark mode | nav = top bar kind (bar|pill|grad|center|side)  | hbg/hbd/hfg = header background / border / text
             hdark = header is dark or coloured | act/actfg/r = active tab | f = footer kind | card = card style */
    var LAYOUTS = [
        { id: 'classic', n: 'Classic (current)', d: 'Your original Notes Bazar look.', sw: 'linear-gradient(135deg,#6366f1,#7c3aed)', tags: 'light top' },
        { id: 'glass', n: 'Apple Glassmorphism', d: 'Floating glass header, soft gradient, rounded footer card.', sw: 'linear-gradient(135deg,#dfe7ff,#f3e8ff)', tags: 'light top' },
        { id: 'dark', n: 'Dark Modern', d: 'Dark neon header, centered glow footer.', sw: 'linear-gradient(135deg,#0b0d1c,#7c5cff)', tags: 'dark top', dark: true },
        { id: 'grad', n: 'Gradient Dream', d: 'Full gradient header, curved 4-column footer.', sw: 'linear-gradient(90deg,#6d28d9,#c026d3)', tags: 'light top' },
        { id: 'min', n: 'Minimal Clean', d: 'White, thin green lines, one-line footer.', sw: 'linear-gradient(135deg,#ffffff,#bbf7d0)', tags: 'light top' },
        { id: 'eleg', n: 'Elegant Premium', d: 'Centered serif header, gold-brown footer.', sw: 'linear-gradient(135deg,#fffaf0,#d4a017)', tags: 'light top' }
    ];
    var NEW = [
        { id: 'gls', n: 'Glass Light Sidebar', d: 'Frosted light sidebar on a soft lavender page.', nav: 'side', bg: 'linear-gradient(135deg,#e9edff 0%,#f6eaff 55%,#e3f2ff 100%)', fg: '#1e1b4b', p: '#6366f1', s: '#8b5cf6', hbg: 'rgba(255,255,255,.82)', hbd: 'rgba(99,102,241,.16)', hfg: '#475569', act: 'linear-gradient(135deg,#6366f1,#8b5cf6)', actfg: '#fff', r: '14px', f: 'card', fbg: 'rgba(255,255,255,.72)', fbd: '#ffffff', ffg: '#3b3b6b', card: 'glass' },
        { id: 'nzen', n: 'Dark Neon Zen', d: 'Deep navy sidebar with electric blue glow.', dark: true, nav: 'side', bg: 'linear-gradient(160deg,#04081c,#0a1130 60%,#070c24)', fg: '#e6ebff', p: '#3b82f6', s: '#6366f1', hbg: '#060b22', hbd: '#14214f', hfg: '#dbe4ff', hdark: 1, act: 'linear-gradient(90deg,#3b82f6,#6366f1)', actfg: '#fff', r: '12px', f: 'center', fbg: '#060b22', fbd: '#14214f', ffg: '#8fa0d6', card: 'neon' },
        { id: 'mzen', n: 'Minimal Zen', d: 'White sidebar, black pill buttons, calm and simple.', nav: 'side', bg: '#f6f6fa', fg: '#111827', p: '#111827', s: '#374151', hbg: '#ffffff', hbd: '#ececf3', hfg: '#4b5563', act: '#111827', actfg: '#fff', r: '999px', f: 'line', fbg: '#ffffff', fbd: '#ececf3', ffg: '#6b7280', card: 'flat' },
        { id: 'ppro', n: 'Purple Progress', d: 'Rich purple gradient with a deep violet sidebar.', dark: true, nav: 'side', bg: 'linear-gradient(160deg,#1b0c52,#35198a 55%,#5b21b6)', fg: '#f3eeff', p: '#a78bfa', s: '#7c3aed', hbg: '#170a4a', hbd: 'rgba(167,139,250,.28)', hfg: '#efe9ff', hdark: 1, act: 'linear-gradient(90deg,#8b5cf6,#6d28d9)', actfg: '#fff', r: '14px', f: 'card', fbg: 'rgba(255,255,255,.08)', fbd: 'rgba(255,255,255,.16)', ffg: '#d8ccff', card: 'glass' },
        { id: 'sblue', n: 'Soft Blue Modern', d: 'Clean white top bar on a light blue page.', nav: 'bar', bg: 'linear-gradient(180deg,#e8f0ff,#f5f8ff)', fg: '#0f2554', p: '#2563eb', s: '#3b82f6', hbg: '#ffffff', hbd: '#dbe6ff', hfg: '#475569', act: 'rgba(37,99,235,.12)', actfg: '#1d4ed8', r: '12px', f: 'bar', fbg: '#ffffff', fbd: '#dbe6ff', ffg: '#475569', card: 'round' },
        { id: 'pblack', n: 'Pro Black', d: 'Pure black with an indigo accent. Sharp and premium.', dark: true, nav: 'side', bg: '#05060b', fg: '#e5e7ef', p: '#6366f1', s: '#8b5cf6', hbg: '#090a11', hbd: '#1a1c2b', hfg: '#cfd3e6', hdark: 1, act: 'linear-gradient(90deg,#4f46e5,#7c3aed)', actfg: '#fff', r: '12px', f: 'line', fbg: '#090a11', fbd: '#1a1c2b', ffg: '#8a8fa8', card: 'flat' },
        { id: 'mvio', n: 'Midnight Violet', d: 'Glowing violet sidebar over a midnight purple page.', dark: true, nav: 'side', bg: 'radial-gradient(900px 520px at 15% -10%,#3b1d8f 0%,#0c0826 60%)', fg: '#efeaff', p: '#8b5cf6', s: '#6366f1', hbg: '#0d0830', hbd: 'rgba(139,92,246,.4)', hfg: '#e6defd', hdark: 1, act: 'linear-gradient(90deg,#8b5cf6,#6366f1)', actfg: '#fff', r: '14px', f: 'center', fbg: '#0d0830', fbd: 'rgba(139,92,246,.4)', ffg: '#a99be0', card: 'neon' },
        { id: 'cream', n: 'Sunny Cream', d: 'Warm cream page, golden accent and a soft sidebar.', nav: 'side', bg: 'linear-gradient(135deg,#fff8e8,#ffefd0)', fg: '#3a2a08', p: '#f59e0b', s: '#fbbf24', hbg: '#fffaf0', hbd: '#f6e3b4', hfg: '#7a5a14', act: '#fcd34d', actfg: '#3a2a08', r: '14px', f: 'card', fbg: '#fffaf0', fbd: '#f6e3b4', ffg: '#7a5a14', card: 'round' },
        { id: 'aur', n: 'Aurora Lavender', d: 'Navy-to-violet sidebar on a light lavender page.', nav: 'side', bg: 'linear-gradient(135deg,#ece8ff,#f3eaff 50%,#e3efff)', fg: '#231a5c', p: '#6d4aff', s: '#8b5cf6', hbg: 'linear-gradient(180deg,#24135f,#4527b0)', hbd: 'transparent', hfg: '#ece8ff', hdark: 1, act: 'rgba(255,255,255,.2)', actfg: '#fff', r: '14px', f: 'card', fbg: '#ffffff', fbd: '#e1dcff', ffg: '#4c3f8a', card: 'glass' },
        { id: 'gpre', n: 'Glassmorphism Premium', d: 'Floating frosted pill header over a deep blue-purple page.', dark: true, nav: 'pill', bg: 'linear-gradient(135deg,#1a1368,#3b1c8c 50%,#0d5aa7)', fg: '#f0f4ff', p: '#7c8cff', s: '#a78bfa', hbg: 'rgba(18,12,70,.6)', hbd: 'rgba(255,255,255,.22)', hfg: '#eef0ff', hdark: 1, act: 'linear-gradient(90deg,#6d7bff,#a78bfa)', actfg: '#fff', r: '999px', f: 'card', fbg: 'rgba(18,12,70,.55)', fbd: 'rgba(255,255,255,.18)', ffg: '#cfd6ff', card: 'glass' },
        { id: 'nfut', n: 'Neon Future', d: 'Cyan neon on dark space blue with a glowing sidebar.', dark: true, nav: 'side', bg: 'radial-gradient(1000px 600px at 75% -10%,#0b3b7d 0%,#050b1e 60%)', fg: '#e3f4ff', p: '#22d3ee', s: '#3b82f6', hbg: '#050d24', hbd: 'rgba(34,211,238,.3)', hfg: '#cfeaff', hdark: 1, act: 'linear-gradient(90deg,#06b6d4,#3b82f6)', actfg: '#fff', r: '12px', f: 'center', fbg: '#050d24', fbd: 'rgba(34,211,238,.35)', ffg: '#8db6d6', card: 'neon' },
        { id: 'cute', n: 'Cute Pastel', d: 'Friendly pastel colours, round shapes, pink accent.', nav: 'pill', bg: 'linear-gradient(135deg,#fff0f3,#fff4d6 50%,#e3f4ff)', fg: '#4a1d33', p: '#f43f5e', s: '#fb7185', hbg: 'rgba(255,255,255,.92)', hbd: '#ffd6df', hfg: '#7a3550', act: 'linear-gradient(90deg,#fb7185,#f43f5e)', actfg: '#fff', r: '999px', f: 'card', fbg: '#ffffff', fbd: '#ffd6df', ffg: '#7a3550', card: 'round', font: 'ui-rounded,"Nunito","Poppins",system-ui,sans-serif' },
        { id: 'mgrad', n: 'Modern Gradient', d: 'Vibrant purple-pink-orange header and footer.', nav: 'grad', bg: 'linear-gradient(135deg,#f4e9ff,#ffe8f3 55%,#fff0dc)', fg: '#3b0f4f', p: '#8b2fd9', s: '#e11d74', hbg: 'linear-gradient(90deg,#7c3aed,#db2777 60%,#f59e0b)', hbd: 'transparent', hfg: '#ffffff', hdark: 1, act: 'rgba(255,255,255,.26)', actfg: '#fff', r: '16px', f: 'bar', fbg: 'linear-gradient(90deg,#7c3aed,#db2777 60%,#f59e0b)', fbd: 'transparent', ffg: '#fff4fb', card: 'soft' },
        { id: 'acad', n: 'Academic Pro', d: 'Navy sidebar with a gold highlight. Professional and focused.', nav: 'side', bg: '#eef2fa', fg: '#0f1f4d', p: '#1d4ed8', s: '#3b82f6', hbg: 'linear-gradient(180deg,#0e1b45,#13296b)', hbd: 'transparent', hfg: '#dbe5ff', hdark: 1, act: '#f5c542', actfg: '#0e1b45', r: '12px', f: 'bar', fbg: '#0e1b45', fbd: 'transparent', ffg: '#c4d2ff', card: 'flat' },
        { id: 'nat', n: 'Nature Calm', d: 'Fresh green top bar, peaceful sage background.', nav: 'bar', bg: 'linear-gradient(135deg,#ecfdf3,#f1f8e6)', fg: '#12351f', p: '#15803d', s: '#22c55e', hbg: '#ffffff', hbd: '#bfe6cc', hfg: '#2f5b3f', act: '#dcfce7', actfg: '#14532d', r: '12px', f: 'bar', fbg: '#14532d', fbd: 'transparent', ffg: '#d6f5df', card: 'round' },
        { id: 'lux', n: 'Dark Luxury', d: 'Black and gold, centered serif header.', dark: true, nav: 'center', bg: 'radial-gradient(900px 500px at 50% -10%,#3a2a08 0%,#0a0806 60%)', fg: '#f5e9c8', p: '#d4a017', s: '#f5c542', hbg: '#0d0a05', hbd: '#8a6a12', hfg: '#f1deaa', hdark: 1, act: 'transparent', actfg: '#f5c542', r: '0', f: 'grid', fbg: '#0d0a05', fbd: '#8a6a12', ffg: '#cdb877', card: 'flat', font: 'Georgia,"Times New Roman",serif' },
        { id: 'teal', n: 'Ocean Teal', d: 'Cool teal and cyan, light and airy.', nav: 'bar', bg: 'linear-gradient(135deg,#e6fbff,#e9f7f4 55%,#eef6ff)', fg: '#0b3b46', p: '#0891b2', s: '#14b8a6', hbg: '#ffffff', hbd: '#c3ecf3', hfg: '#36606a', act: 'linear-gradient(90deg,#0891b2,#14b8a6)', actfg: '#fff', r: '12px', f: 'line', fbg: '#ffffff', fbd: '#c3ecf3', ffg: '#36606a', card: 'soft' },
        { id: 'nbpro', n: 'Student Super App (Pro)', d: 'Review design: sidebar on desktop, bottom bar on mobile, student dashboard, verified badges, wide Bazar AI chat.', nav: 'side', font: 'Inter,system-ui,sans-serif', bg: '#F7F8FC', fg: '#0F172A', p: '#635BFF', s: '#3478F6', hbg: '#ffffff', hbd: '#E5E7F0', hfg: '#475569', act: 'rgba(99,91,255,.12)', actfg: '#635BFF', r: '14px', f: 'line', fbg: '#ffffff', fbd: '#E5E7F0', ffg: '#64748b', card: 'soft' }
    ];
    NEW.forEach(function (L) { L.tags = (L.dark ? 'dark ' : 'light ') + (L.nav === 'side' ? 'side' : 'top'); LAYOUTS.push(L); });
    var OK = {}, BYID = {}; LAYOUTS.forEach(function (l) { OK[l.id] = 1; BYID[l.id] = l; });
    var H = document.documentElement;
    var BGP = {
        night: '#0f172a', navy: '#172554', forest: '#052e16', wine: '#4c0519',
        sunrise: 'linear-gradient(135deg,#fde68a,#fca5a5,#c4b5fd)', ocean: 'linear-gradient(135deg,#0ea5e9,#6366f1,#8b5cf6)',
        mint: 'linear-gradient(135deg,#a7f3d0,#bae6fd)', dusk: 'linear-gradient(160deg,#1e1b4b,#7c3aed 60%,#ec4899)'
    };
    var HEX = /^#[0-9a-f]{6}$/i;
    function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
    function toast(m, ms) { if (window.nbToast) window.nbToast(m, ms || 3000); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function rgba(h, a) { var n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
    function shade(h, k) {                                        // k < 0 darker, k > 0 lighter
        var n = parseInt(h.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { v = k < 0 ? v * (1 + k) : v + (255 - v) * k; return Math.max(0, Math.min(255, Math.round(v))); });
        return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    }

    /* ---------------- CSS for the generated layouts ---------------- */
    function genCss() {
        var o = '';
        NEW.forEach(function (L) {
            var S = 'html[data-layout="' + L.id + '"]', side = L.nav === 'side', hf = L.hfg, o1 = '';
            var card = S + ' .qo-card,' + S + ' .class-tile,' + S + ' [class*="rounded-2xl"][class*="dark:bg-slate-900"]';
            o1 += S + '{--lx-bg:' + L.bg + ';--lx-fg:' + L.fg + ';--theme-primary:' + L.p + '!important;--theme-secondary:' + L.s + '!important}';
            if (L.font) o1 += S + ' body,' + S + ' .nbh,' + S + ' #nbFooter{font-family:' + L.font + '}';
            /* header (top bar kinds; "side" uses the same bar below 1024px) */
            if (L.nav === 'pill') {
                o1 += S + ' .nbh{background:transparent!important;border:0!important;box-shadow:none!important;padding-top:10px}';
                o1 += S + ' .nbh-in{border-radius:999px;background:' + L.hbg + ';-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid ' + L.hbd + ';box-shadow:0 10px 34px ' + rgba(L.p, .22) + ';padding-left:14px;padding-right:14px}';
            } else {
                o1 += S + ' .nbh{background:' + L.hbg + '!important;border-bottom:1px solid ' + L.hbd + '!important;box-shadow:' + (L.dark || L.hdark ? '0 4px 26px ' + rgba(L.p, .22) : 'none') + '!important}';
            }
            if (hf) o1 += S + ' .nbh-tab,' + S + ' .m-tab,' + S + ' .nbh-bn small{color:' + hf + '!important}';
            if (L.hdark) {
                o1 += S + ' .nbh-brand b{color:' + hf + '!important;-webkit-text-fill-color:' + hf + '!important;background:none!important}';
                o1 += S + ' .nbh-ib{background:rgba(255,255,255,.12)!important;border-color:rgba(255,255,255,.22)!important;color:' + hf + '!important}';
                o1 += S + ' .nbh-nav{background:transparent!important;border-color:rgba(255,255,255,.18)!important}';
                o1 += S + ' nav.lg\\:hidden{border-color:rgba(255,255,255,.18)!important}';
            }
            o1 += S + ' .nbh-tab{border-radius:' + L.r + '}';
            o1 += S + ' .nbh-tab:hover{background:' + (L.hdark ? 'rgba(255,255,255,.12)' : rgba(L.p, .1)) + '!important}';
            o1 += S + ' .nbh-tab.nav-btn-active,' + S + ' .m-tab.nav-btn-active{background:' + L.act + '!important;color:' + L.actfg + '!important;' + (L.nav === 'center' ? 'border-bottom:2px solid ' + L.p + ';' : '') + (L.act.indexOf('gradient') > -1 ? 'box-shadow:0 6px 18px ' + rgba(L.p, .35) + ';' : '') + '}';
            if (L.nav === 'center') {
                o1 += S + ' .nbh-in{position:relative;flex-wrap:wrap;justify-content:center;row-gap:4px}' + S + ' .nbh-left{order:1;flex:1 0 100%;justify-content:center}' + S + ' .nbh-nav{order:2;justify-content:center}' +
                    S + ' .nbh-right{order:3;position:absolute;right:12px;top:8px}' + S + ' .nbh-brand b{font-size:1.45rem;letter-spacing:.08em}' +
                    '@media (max-width:640px){' + S + ' .nbh-right{position:static}}';
            }
            /* sidebar (desktop only): the header becomes a fixed left column */
            if (side) {
                o1 += '@media (min-width:1024px){' + S + '{--nb-header-h:0px;--lx-sw:244px}' +
                    S + ' body{padding-left:var(--lx-sw)}' +
                    S + ' .nbh{position:fixed!important;top:0;left:0;bottom:0;width:var(--lx-sw);z-index:45;border-bottom:0!important;border-right:1px solid ' + L.hbd + '!important;overflow-y:auto;overflow-x:hidden;padding:0;box-shadow:' + (L.dark || L.hdark ? '8px 0 30px ' + rgba(L.p, .18) : '4px 0 24px rgba(15,23,42,.06)') + '!important}' +
                    S + ' .nbh-in{flex-direction:column;align-items:stretch;height:100%;max-width:none;padding:22px 14px 16px;gap:14px}' +
                    S + ' .nbh-left{flex:none;min-width:0}' + S + ' .nbh-left>.nbh-ib{display:none}' +
                    S + ' .nbh-brand{padding:2px 6px}' + S + ' .nbh-bn small{display:block}' +
                    S + ' .nbh-nav{display:flex;flex-direction:column;align-items:stretch;gap:4px;margin:6px 0 0;padding:0;border:0;background:transparent!important}' +
                    S + ' .nbh-tab{height:44px;width:100%;justify-content:flex-start;padding:0 14px;font-size:14px}' +
                    S + ' .nbh-tab i{width:18px;text-align:center}' +
                    S + ' .nbh-right{margin:auto 0 0;flex-wrap:wrap;justify-content:flex-start;gap:8px}' +
                    S + ' .nbh-pop{position:static}' +
                    S + ' .nbh-menu,' + S + ' .nbh-panel{position:fixed;left:calc(var(--lx-sw) + 10px);right:auto;top:auto;bottom:12px;max-height:calc(100dvh - 24px)}' +
                    S + ' .nbn{top:12px}}';
            }
            /* footer */
            var fcard = L.f === 'card';
            o1 += S + ' #nbFooter{background:' + L.fbg + '!important;border:' + (L.fbd === 'transparent' ? '0' : '1px solid ' + L.fbd) + '!important;color:' + L.ffg + '!important;text-align:left;' +
                (fcard ? 'margin:28px 14px 14px;border-radius:26px;box-shadow:0 10px 34px ' + rgba(L.p, .14) + ';' : 'margin-top:36px;border-radius:' + (L.f === 'bar' ? '36px 36px 0 0' : '0') + ';') + (L.f === 'center' ? 'text-align:center;' : '') + '}';
            /* cards */
            var dk = L.dark;
            if (L.card === 'glass') o1 += card + '{background:' + (dk ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.68)') + '!important;border-color:' + (dk ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.95)') + '!important;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}';
            else if (L.card === 'neon') o1 += card + '{background:' + (dk ? 'rgba(255,255,255,.04)' : '#fff') + '!important;border-color:' + rgba(L.p, .45) + '!important;box-shadow:0 0 18px ' + rgba(L.p, .18) + '!important}';
            else if (L.card === 'flat') o1 += card + '{box-shadow:none!important;border-color:' + (L.hbd === 'transparent' ? 'rgba(100,116,139,.25)' : L.hbd) + '!important}';
            else if (L.card === 'round') o1 += card + '{border-radius:28px!important;box-shadow:0 8px 24px ' + rgba(L.p, .12) + '!important}';
            o += o1 + '\n';
        });
        return o;
    }
    var st = document.createElement('style'); st.id = 'lxGen'; st.textContent = genCss(); document.head.appendChild(st);

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
        var f = BYID[id] && BYID[id].f;
        if (id === 'glass' || f === 'card') return '<div class="lxf-grid">' + about + explore + study + '</div>' + COPY;
        if (id === 'dark' || f === 'center') return '<div class="lxf-center">' + brand + '<div class="lxf-row">' + LINKS + '</div>' + COPY + '</div>';
        if (id === 'grad' || id === 'eleg' || f === 'bar' || f === 'grid') return '<div class="lxf-grid">' + about + explore + study + care + '</div>' + COPY;
        if (id === 'min' || f === 'line') return '<div class="lxf-line"><span>&copy; 2026 Notes Bazar</span><span class="lxf-row" style="margin:0">' + LINKS + '</span></div>';
        return footerOrig;
    }

    /* ---------------- live (published) state and the admin's unpublished changes ---------------- */
    function norm(v) {
        v = v && typeof v === 'object' ? v : {};
        var acc = v.acc && HEX.test(v.acc.p || '') && HEX.test(v.acc.s || '') ? { p: v.acc.p.toLowerCase(), s: v.acc.s.toLowerCase() } : null;
        var b = v.bg, bg = null;
        if (b && BGP[b.k]) bg = { k: b.k };
        else if (b && HEX.test(b.c || '')) bg = { c: b.c.toLowerCase(), c2: HEX.test(b.c2 || '') ? b.c2.toLowerCase() : '' };
        return { id: OK[v.id] ? v.id : 'classic', acc: acc, bg: bg };
    }
    function bgCss(bg) { return !bg ? '' : bg.k ? BGP[bg.k] : (bg.c2 ? 'linear-gradient(135deg,' + bg.c + ',' + bg.c2 + ')' : bg.c); }
    var live = norm(null), pend = norm(null), editing = false;
    function sameState(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

    function applyAcc(acc, persist) {
        if (acc) { H.style.setProperty('--lx-ap', acc.p); H.style.setProperty('--lx-as', acc.s); H.classList.add('lx-acc'); }
        else { H.style.removeProperty('--lx-ap'); H.style.removeProperty('--lx-as'); H.classList.remove('lx-acc'); }
        if (!persist) return;
        if (acc) { lsSet('nb_theme', JSON.stringify({ p: acc.p, s: acc.s })); lsSet('nb_adm_acc', '1'); }
        else if (ls('nb_adm_acc') === '1') { lsDel('nb_theme'); lsDel('nb_adm_acc'); H.style.removeProperty('--theme-primary'); H.style.removeProperty('--theme-secondary'); }
    }
    function applyBg(bg, persist) {
        var v = bgCss(bg);
        if (v) { H.style.setProperty('--custom-bg', v); H.classList.add('custom-bg'); }
        else {
            var mine = null; try { mine = JSON.parse(ls('nb_bg') || 'null'); } catch (e) {}
            if (!persist || ls('nb_adm_bg') === '1' || !mine) {
                if (persist && ls('nb_adm_bg') === '1') { lsDel('nb_bg'); mine = null; }
                if (mine && mine.v) { H.style.setProperty('--custom-bg', mine.v); H.classList.add('custom-bg'); }
                else { H.style.removeProperty('--custom-bg'); H.classList.remove('custom-bg'); }
            }
        }
        if (!persist) return;
        if (v) { lsSet('nb_bg', JSON.stringify({ v: v })); lsSet('nb_adm_bg', '1'); }
        else lsDel('nb_adm_bg');
    }

    /* ---------------- apply a layout ---------------- */
    function apply(id, persist) {
        if (!OK[id]) id = 'classic';
        H.setAttribute('data-layout', id);
        if (id === 'dark' || (BYID[id] && BYID[id].dark)) H.classList.add('dark');
        else if (id !== 'classic') H.classList.remove('dark');
        else { var d = ls('nb_dark'); if (d === null) d = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? '1' : '0'; H.classList.toggle('dark', d === '1'); }
        if (footer) footer.innerHTML = footerHTML(id);
        if (persist) lsSet('nb_layout', id);
    }
    function applyAll(s, persist) {
        apply(s.id, persist); applyAcc(s.acc, persist); applyBg(s.bg, persist);
        if (persist) lsSet('nb_lx', JSON.stringify(s));
    }
    function loadLive() {
        return fetch(DB + '/notes_bazar_layout.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (v) {
                live = norm(v);
                if (editing) { refreshBar(); return live.id; }       // the admin is previewing something: do not overwrite it
                pend = JSON.parse(JSON.stringify(live)); applyAll(live, true); return live.id;
            })
            .catch(function () {
                var c = null; try { c = JSON.parse(ls('nb_lx') || 'null'); } catch (e) {}
                live = norm(c || { id: ls('nb_layout') }); pend = JSON.parse(JSON.stringify(live)); applyAll(live, false);
            });
    }
    (function boot() {                                           // instant: use the last published state stored on this device
        var c = null; try { c = JSON.parse(ls('nb_lx') || 'null'); } catch (e) {}
        var s = norm(c || { id: ls('nb_layout') }); live = s; pend = JSON.parse(JSON.stringify(s)); applyAll(s, false);
    })();
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
    var filter = 'all';
    function preview(l) {
        if (!l.nav) return '<div class="lx-sw" style="background:' + l.sw + '"><i></i><u></u></div>';
        var side = l.nav === 'side', hb = l.hbg;
        return '<div class="lx-sw lx-mini' + (side ? ' side' : '') + '" style="background:' + l.bg + '"><em style="background:' + hb + ';' + (l.hbd && l.hbd !== 'transparent' ? 'border-color:' + l.hbd : '') + '"></em>' +
            '<b style="background:' + l.p + '"></b><s style="background:' + (l.dark ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.85)') + '"></s><s style="background:' + (l.dark ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.85)') + '"></s></div>';
    }
    function cardHTML() {
        var list = LAYOUTS.filter(function (l) { return filter === 'all' || (' ' + l.tags + ' ').indexOf(' ' + filter + ' ') > -1; });
        var chips = [['all', 'All'], ['light', 'Light'], ['dark', 'Dark'], ['side', 'Sidebar'], ['top', 'Top bar']].map(function (f) {
            return '<button type="button" class="lx-chip' + (filter === f[0] ? ' on' : '') + '" onclick="NBLayout.filter(\'' + f[0] + '\')" aria-pressed="' + (filter === f[0]) + '">' + f[1] + '</button>';
        }).join('');
        return '<section class="a-card" id="lxCard" style="margin-bottom:18px"><div class="a-ch"><h3><i class="fa-solid fa-table-columns"></i> Website layout <span class="a-pill" style="margin-left:6px">' + LAYOUTS.length + ' designs</span></h3></div>' +
            '<p style="margin:0;font-size:13.5px;line-height:1.55;opacity:.8">Choose a complete design (header or sidebar, footer, background and card style). Click a card to preview it, then publish &mdash; all students will see the published design on phone and PC. Sidebar designs turn into a normal top bar on phones and small windows.</p>' +
            '<div class="lx-chips">' + chips + '</div>' +
            '<div class="lx-grid">' + list.map(function (l) {
                return '<button type="button" class="lx-card' + (pend.id === l.id ? ' sel' : '') + '" onclick="NBLayout.choose(\'' + l.id + '\')" aria-pressed="' + (pend.id === l.id) + '">' + preview(l) + '<b>' + esc(l.n) + (live.id === l.id ? '<span class="lx-live">Live</span>' : '') + '</b><small>' + esc(l.d) + '</small></button>';
            }).join('') + '</div>' +
            '<button type="button" class="a-btn pri" data-lx-pub onclick="NBLayout.publish()"><i class="fa-solid fa-cloud-arrow-up"></i><span>Publish to all students</span></button><span class="lx-msg" id="lxMsg" role="status"></span>' +
            '<p class="lx-hint">Publish sends the layout, the accent colour and the website background below together.</p>' +
            '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:13px">One-time Firebase rules (needed for publish and delete)</summary><div class="lx-rule" id="lxRule">' + esc(rules('')) + '</div><button type="button" class="a-btn sm" style="margin-top:8px" onclick="NBLayout.copyRules()"><i class="fa-solid fa-copy"></i> Copy rules</button></details></section>';
    }
    function mount() {
        var host = document.getElementById('adminPanel-appearance'); if (!host) return;
        var old = document.getElementById('lxCard'); if (old) old.remove();
        host.insertAdjacentHTML('afterbegin', cardHTML());
        refreshBar();
        adminToken().then(function (t) { var em = emailOf(t), r = document.getElementById('lxRule'); if (r && em) r.textContent = rules(em); });
    }
    function refreshBar() {
        var changed = !sameState(pend, live);
        document.querySelectorAll('[data-lx-pub]').forEach(function (b) {
            b.disabled = !changed;
            var t = b.querySelector('span'); if (t) t.textContent = changed ? 'Publish to all students' : 'Already live';
        });
        var m = document.getElementById('lxMsg');
        if (m && changed && !m.getAttribute('data-keep')) { m.textContent = 'You have unpublished changes (only you can see them).'; m.style.color = '#d97706'; }
    }
    function say(m, bad) { var e = document.getElementById('lxMsg'); if (e) { e.setAttribute('data-keep', '1'); e.textContent = m; e.style.color = bad ? '#e11d48' : '#16a34a'; setTimeout(function () { e.removeAttribute('data-keep'); }, 4000); } }
    function touch() { editing = true; applyAll(pend, false); refreshBar(); }
    var API = window.NBLayout = {
        list: LAYOUTS,
        state: function () { return JSON.parse(JSON.stringify(pend)); },
        filter: function (f) { filter = f; mount(); },
        choose: function (id) { if (!OK[id]) return; pend.id = id; touch(); mount(); },
        setAccent: function (p, s) {
            if (!p) { pend.acc = null; touch(); return; }
            if (!HEX.test(p)) return;
            pend.acc = { p: p.toLowerCase(), s: (s && HEX.test(s) ? s : shade(p, -0.22)).toLowerCase() }; touch();
        },
        setBg: function (b) { pend.bg = b == null ? null : norm({ bg: b }).bg; touch(); },
        publish: async function () {
            var bs = document.querySelectorAll('[data-lx-pub]'); bs.forEach(function (b) { b.disabled = true; });
            try {
                var tok = await adminToken(); if (!tok) throw new Error('Please log in as admin first.');
                var body = { id: pend.id, at: Date.now() }; if (pend.acc) body.acc = pend.acc; if (pend.bg) body.bg = pend.bg;
                var r = await fetch(DB + '/notes_bazar_layout.json?auth=' + encodeURIComponent(tok), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!r.ok) { var er = new Error('HTTP ' + r.status); er.status = r.status; throw er; }
                live = JSON.parse(JSON.stringify(pend)); editing = false; applyAll(live, true);
                if (window.NBAdmin && NBAdmin.render && document.getElementById('adminPanel-appearance')) NBAdmin.render('appearance', window.NBA && NBA.ctx ? NBA.ctx() : undefined); else mount();
                say('Published. Students will see it on their next load.'); toast('Published to all students ✓');
            } catch (e) {
                refreshBar();
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
