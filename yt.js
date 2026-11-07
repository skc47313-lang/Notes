/* =====================================================================
   Notes Bazar – yt.js   ("YouTube link -> Notes", in AI PDF Maker)
   The student pastes a YouTube link, the app gets the video's transcript and sends it to the
   existing AI Notes Maker (colour notes as PDF, quiz, My PDFs...). Nothing else is rebuilt.

   A browser cannot read YouTube captions by itself (CORS), so a tiny free Cloudflare Worker does it.
   Deploy yt-transcript-worker.js (see the file), then paste the Worker address in YT_API below.
   Until then the page still works: the student can paste the transcript text by hand.
   ===================================================================== */
(function () {
    'use strict';
    var YT_API = '';                                   // <- e.g. 'https://bazar-yt.YOURNAME.workers.dev'
    var NB = window.NB;
    if (!NB) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var busy = false;

    function parseId(u) {
        u = String(u || '').trim();
        if (/^[\w-]{11}$/.test(u)) return u;
        var m;
        try {
            var x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u), h = x.hostname.replace(/^www\.|^m\./, '');
            if (h === 'youtu.be') { m = x.pathname.match(/^\/([\w-]{11})/); return m ? m[1] : ''; }
            if (/(^|\.)youtube(-nocookie)?\.com$/.test(h)) {
                if (x.searchParams.get('v') && /^[\w-]{11}$/.test(x.searchParams.get('v'))) return x.searchParams.get('v');
                m = x.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/); return m ? m[1] : '';
            }
        } catch (e) {}
        return '';
    }
    function api() { return String(window.NB_YT_API || YT_API || '').replace(/\/+$/, ''); }
    function toast(m) { if (window.nbToast) window.nbToast(m, 3600); }

    var CSS = '#nbYt{position:fixed;inset:0;z-index:2600;overflow-y:auto;overscroll-behavior:contain;display:none;color:#3b2f2a;font-family:inherit;' +
        'background:radial-gradient(120% 70% at 50% 0%,#c9bdf0 0%,#e3dcf6 38%,#f4f0fa 70%,#f8f6fb 100%)}#nbYt.open{display:block}' +
        '#nbYt .yt-hd{position:sticky;top:0;z-index:3;display:flex;justify-content:center;padding:14px 14px 0;transition:padding .25s}' +
        '#nbYt .yt-bar{width:100%;max-width:1180px;display:flex;align-items:center;gap:10px;padding:10px 6px 10px 6px;border-radius:999px;background:transparent;box-shadow:none;transition:all .25s}' +
        '#nbYt.sc .yt-bar{max-width:900px;padding:9px 10px 9px 18px;background:#fff;box-shadow:0 6px 24px rgba(76,52,140,.14)}' +
        '#nbYt .yt-logo{white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:9px;font-weight:800;font-size:21px;letter-spacing:-.02em;color:#2f2724;margin-right:auto;border:0;background:none;cursor:pointer;padding:0}' +
        '#nbYt .yt-mark{width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 3px 0 #4c1d95}' +
        '#nbYt .yt-nl{border:0;background:none;font:600 15px inherit;font-family:inherit;color:#8a7f79;padding:8px 12px;border-radius:99px;cursor:pointer}#nbYt .yt-nl:hover{color:#3b2f2a}' +
        '#nbYt .yt-cta{white-space:nowrap;border:0;font-family:inherit;font-weight:800;font-size:15px;padding:12px 22px;border-radius:999px;cursor:pointer;background:#fff;color:#2f2724;box-shadow:0 2px 10px rgba(76,52,140,.12);transition:all .25s}' +
        '#nbYt.sc .yt-cta{background:#7c3aed;color:#fff}@media(max-width:480px){#nbYt .yt-logo{font-size:17px}#nbYt .yt-cta{font-size:13px;padding:10px 14px}}#nbYt .yt-x{flex-shrink:0;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.75);color:#4b3f3a;font-size:17px;cursor:pointer}' +
        '#nbYt .yt-main{max-width:760px;margin:0 auto;padding:46px 18px 70px;text-align:center}' +
        '#nbYt h1{font-size:clamp(36px,7vw,62px);line-height:1.04;font-weight:800;letter-spacing:-.035em;margin:0 0 16px;color:#3a2f2a}#nbYt h1 em{font-style:normal;color:#7c3aed}' +
        '#nbYt .yt-sub{font-size:clamp(16px,2.4vw,20px);color:#9a8f89;line-height:1.5;margin:0 auto 28px;max-width:560px}' +
        '#nbYt .yt-card{background:#fff;border-radius:26px;box-shadow:0 18px 50px rgba(76,52,140,.16);padding:18px;text-align:left}' +
        '#nbYt .yt-in{display:flex;align-items:center;gap:10px;border:2px dashed #d9d1ee;border-radius:18px;padding:6px 6px 6px 14px;background:#fbfaff}' +
        '#nbYt .yt-in i.fa-youtube{color:#ef4444;font-size:24px}#nbYt .yt-in input{flex:1;min-width:0;border:0;background:none;font:600 15px inherit;font-family:inherit;color:#3b2f2a;outline:none;padding:11px 4px}' +
        '#nbYt .yt-pb{border:0;border-radius:12px;background:#efeafd;color:#6d28d9;font-family:inherit;font-weight:700;font-size:13px;padding:10px 14px;cursor:pointer}' +
        '#nbYt .yt-pv{display:none;gap:12px;align-items:center;margin-top:14px;padding:10px;border-radius:16px;background:#f6f3fd}#nbYt .yt-pv.on{display:flex}' +
        '#nbYt .yt-pv img{width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#ddd}#nbYt .yt-pv b{display:block;font-size:14px;line-height:1.3;color:#2f2724}#nbYt .yt-pv small{color:#8a7f79;font-size:12px}' +
        '#nbYt .yt-g{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}@media(min-width:640px){#nbYt .yt-g{grid-template-columns:repeat(4,1fr)}}' +
        '#nbYt .yt-g label{display:block;font-size:11px;font-weight:700;color:#8a7f79;margin:0 0 4px}#nbYt .yt-g select{width:100%;border:1.5px solid #e3dcf3;border-radius:12px;padding:10px 8px;background:#fff;font:600 13px inherit;font-family:inherit;color:#3b2f2a}' +
        '#nbYt .yt-go{display:block;width:100%;margin-top:16px;border:0;border-radius:18px;padding:17px;background:#7c3aed;color:#fff;font-family:inherit;font-weight:800;font-size:18px;cursor:pointer;box-shadow:0 5px 0 #4c1d95;transition:transform .1s,box-shadow .1s}' +
        '#nbYt .yt-go:active{transform:translateY(4px);box-shadow:0 1px 0 #4c1d95}#nbYt .yt-go:disabled{opacity:.6;cursor:wait}' +
        '#nbYt .yt-st{min-height:20px;margin-top:10px;font-size:13px;font-weight:600;color:#6d28d9;text-align:center}#nbYt .yt-st.err{color:#dc2626}' +
        '#nbYt details{margin-top:12px;font-size:13px;color:#6b5f59}#nbYt summary{cursor:pointer;font-weight:700;color:#6d28d9}#nbYt textarea{width:100%;min-height:110px;margin-top:8px;border:1.5px solid #e3dcf3;border-radius:12px;padding:10px;font:500 13px inherit;font-family:inherit;color:#3b2f2a;background:#fff;resize:vertical}' +
        '#nbYt .yt-ft{margin-top:22px;font-size:13px;color:#a39a94}' +
        '@media(max-width:560px){#nbYt .yt-nl{display:none}#nbYt .yt-main{padding-top:30px}#nbYt .yt-pv img{width:96px}}';

    function build() {
        if ($('nbYt')) return;
        var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        var d = document.createElement('div'); d.id = 'nbYt'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'YouTube link to notes');
        var cls = 10; try { var pr = NB.profile && NB.profile(); if (pr && pr.cls) cls = parseInt(String(pr.cls).replace('Class ', ''), 10) || 10; } catch (e) {}
        var opt = function (arr, cur) { return arr.map(function (x) { return '<option value="' + x[0] + '"' + (String(x[0]) === String(cur) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); };
        d.innerHTML = '<header class="yt-hd"><div class="yt-bar"><button type="button" class="yt-logo" id="ytHome" aria-label="AI PDF Maker"><span class="yt-mark"><i class="fa-solid fa-graduation-cap"></i></span>notes bazar</button>' +
            '<button type="button" class="yt-nl" id="ytPm">AI PDF Maker</button><button type="button" class="yt-nl" id="ytMy">My PDFs</button>' +
            '<button type="button" class="yt-cta" id="ytCta">Get started <span aria-hidden="true">→</span></button><button type="button" class="yt-x" id="ytX" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div></header>' +
            '<main class="yt-main"><h1>Turn any YouTube video into <em>notes.</em></h1><p class="yt-sub">Paste a link. Bazar AI reads the video and makes colourful notes you can save as a PDF and practise with a quiz.</p>' +
            '<div class="yt-card"><div class="yt-in"><i class="fa-brands fa-youtube" aria-hidden="true"></i><input id="ytUrl" type="url" inputmode="url" autocomplete="off" placeholder="Paste YouTube link here" aria-label="YouTube link"><button type="button" class="yt-pb" id="ytPaste">Paste</button></div>' +
            '<div class="yt-pv" id="ytPv"><img id="ytTh" alt=""><div><b id="ytTi"></b><small id="ytAu"></small></div></div>' +
            '<div class="yt-g"><div><label for="ytCls">Class</label><select id="ytCls">' + opt([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return [n, 'Class ' + n]; }), cls) + '</select></div>' +
            '<div><label for="ytType">Notes type</label><select id="ytType">' + opt([['short', 'Short notes'], ['long', 'Long notes']], 'short') + '</select></div>' +
            '<div><label for="ytLang">Language</label><select id="ytLang">' + opt([['English', 'English'], ['Hindi', 'हिंदी'], ['Hinglish', 'Hinglish']], 'Hinglish') + '</select></div>' +
            '<div><label for="ytPics">Pictures</label><select id="ytPics">' + opt([['1', 'Add pictures'], ['0', 'No pictures']], '1') + '</select></div></div>' +
            '<details id="ytMan"><summary>No captions or not working? Paste the transcript yourself</summary><textarea id="ytTx" placeholder="On YouTube open the video, tap ⋯ / More → Show transcript, copy the text and paste it here."></textarea></details>' +
            '<button type="button" class="yt-go" id="ytGo">Make notes →</button><div class="yt-st" id="ytSt" aria-live="polite"></div></div>' +
            '<p class="yt-ft">Works best with videos that have captions. Long videos: the notes cover the main parts spread across the whole video.</p></main>';
        document.body.appendChild(d);
        var close = function () { d.classList.remove('open'); d.classList.remove('sc'); document.documentElement.style.overflow = ''; };
        $('ytX').addEventListener('click', close);
        $('ytHome').addEventListener('click', function () { close(); NB.openPdfMaker && NB.openPdfMaker(); });
        $('ytPm').addEventListener('click', function () { close(); NB.openPdfMaker && NB.openPdfMaker(); });
        $('ytMy').addEventListener('click', function () { close(); NB.openMyPdfs && NB.openMyPdfs(); });
        $('ytCta').addEventListener('click', function () { $('ytUrl').focus(); });
        d.addEventListener('scroll', function () { d.classList.toggle('sc', d.scrollTop > 24); }, { passive: true });
        d.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
        $('ytPaste').addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { $('ytUrl').value = String(t || '').trim(); preview(); }).catch(function () { $('ytUrl').focus(); toast('Press and hold to paste the link.'); });
            else { $('ytUrl').focus(); toast('Press and hold to paste the link.'); }
        });
        $('ytUrl').addEventListener('input', preview);
        $('ytUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        $('ytGo').addEventListener('click', go);
        d._close = close;
    }
    function say(t, bad) { var e = $('ytSt'); if (e) { e.textContent = t || ''; e.className = 'yt-st' + (bad ? ' err' : ''); } }
    var pvT = 0;
    function preview() {
        clearTimeout(pvT);
        pvT = setTimeout(function () {
            var id = parseId($('ytUrl').value), pv = $('ytPv');
            if (!id) { pv.classList.remove('on'); return; }
            $('ytTh').src = 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'; $('ytTi').textContent = 'YouTube video'; $('ytAu').textContent = id; pv.classList.add('on');
            fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id)).then(function (r) { return r.ok ? r.json() : null; })
                .then(function (j) { if (j && parseId($('ytUrl').value) === id) { $('ytTi').textContent = j.title || 'YouTube video'; $('ytAu').textContent = j.author_name || ''; } }).catch(function () {});
        }, 250);
    }

    async function transcript(id, lang) {
        var base = api();
        if (!base) { var e0 = new Error('Auto transcript is not set up yet.'); e0.code = 'noapi'; throw e0; }
        var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 35000), r, j;
        try { r = await fetch(base + '/?v=' + encodeURIComponent(id) + '&lang=' + encodeURIComponent(lang), { signal: c.signal }); j = await r.json(); }
        catch (e) { var e1 = new Error('Could not reach the transcript service.'); e1.code = 'net'; throw e1; }
        finally { clearTimeout(t); }
        if (!r.ok || !j || !j.text) { var e2 = new Error((j && j.error) || 'No transcript found for this video.'); e2.code = (j && j.code) || 'none'; throw e2; }
        return j;
    }
    // long video -> up to ~9000 letters taken evenly from the whole video, so the notes cover all of it
    function spread(text, cap) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        if (text.length <= cap) return text;
        var n = 6, per = Math.floor(cap / n), step = (text.length - per) / (n - 1), out = [], i;
        for (i = 0; i < n; i++) out.push(text.slice(Math.round(i * step), Math.round(i * step) + per));
        return out.join(' … ');
    }
    async function go() {
        if (busy) return;
        var id = parseId($('ytUrl').value), manual = String($('ytTx').value || '').trim();
        if (!id && manual.length < 200) { say('Paste a valid YouTube link first (youtube.com or youtu.be).', true); return; }
        if (typeof window.nbCallAi !== 'function') { say('The AI is still loading. Try again in a moment.', true); return; }
        busy = true; $('ytGo').disabled = true; say('Reading the video…');
        try {
            var title = $('ytTi').textContent && $('ytTi').textContent !== 'YouTube video' ? $('ytTi').textContent : '', text = manual, lang = $('ytLang').value === 'Hindi' ? 'hi' : ($('ytLang').value === 'English' ? 'en' : 'hi');
            if (manual.length < 200) {
                var j = await transcript(id, lang); text = j.text; title = j.title || title;
            }
            if (text.replace(/\s/g, '').length < 150) throw Object.assign(new Error('The transcript is too short to make notes.'), { code: 'short' });
            say('Making notes…');
            var p = { title: (title || 'YouTube video notes').slice(0, 170), text: spread(text, 9000), cls: parseInt($('ytCls').value, 10), type: $('ytType').value, lang: $('ytLang').value, pics: $('ytPics').value === '1', auto: true };
            $('nbYt')._close(); say('');
            if (NB.notesFromText) NB.notesFromText(p); else toast('Notes Maker is not ready.');
        } catch (e) {
            var m = e && e.code === 'noapi' ? 'Auto transcript is not set up on this site yet. Open "No captions or not working?" below, paste the transcript text and tap Make notes again.'
                : e && e.code === 'net' ? 'Could not reach the transcript service. Check the internet, or paste the transcript below.'
                : e && e.code === 'nocaptions' ? 'This video has no captions. Paste the transcript below, or try another video.'
                : (e && e.message) || 'Something went wrong.';
            say(m, true);
            if (e && (e.code === 'noapi' || e.code === 'nocaptions' || e.code === 'net')) $('ytMan').open = true;
        }
        busy = false; var g = $('ytGo'); if (g) g.disabled = false;
    }

    NB.openYoutube = function () {
        build(); var d = $('nbYt');
        if (NB.closeSiteMenu) NB.closeSiteMenu();
        d.classList.add('open'); d.scrollTop = 0; document.documentElement.style.overflow = 'hidden';
        setTimeout(function () { try { $('ytUrl').focus({ preventScroll: true }); } catch (e) {} }, 120);
    };
    NB.parseYoutubeId = parseId;
})();
