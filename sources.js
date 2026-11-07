/* =====================================================================
   Notes Bazar – sources.js   ("AI Source Library")
   The admin uploads books / notes (PDF, ZIP, text, Drive link, pasted NotebookLM text).
   The text is cut into small pieces and saved in Firebase (notes_bazar_src).
   Every time a student uses Bazar AI, the AI notes maker or the question paper maker,
   the best matching pieces are added to the AI prompt (RAG), so the AI answers from
   the admin's own material instead of guessing.

   Needs ONE Firebase rule (Admin dashboard > AI Sources shows it with a copy button):
     "notes_bazar_src": { ".read": true, ".write": "auth != null && auth.token.email === 'ADMIN_EMAIL'" }
   ===================================================================== */
(function () {
    'use strict';
    var HARD_DB = 'https://notes-market-d309b-default-rtdb.firebaseio.com';
    var CH = '\u00a7';                                         // "§" separates the page number from the text inside one saved piece
    var CHUNK = 900, MAX_CHARS = 4000000, BATCH = 250;
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var q = function (v) { return esc(JSON.stringify(String(v == null ? '' : v))); };
    function db() { return (window.NBA && window.NBA.dburl) || HARD_DB; }
    function toast(m) { if (window.nbToast) window.nbToast(m, 3200); }

    /* ======================= text tools ======================= */
    var STOP = new Set(('the is are was were be been of to in on at for and or a an it this that these those with as by from how what why when where which who whom do does did can could should would will you your me my i we they he she his her their our not no yes if then than so such also into about over under between each any all some more most other ' +
        'kya hai hain ho tha thi ka ki ke ko se me mein par aur ya yah ye wo woh is us un bhi to toh hi nahi nahin kaise kyun kyu kaun kab kahan kitna kitne ek do teen batao bataiye samjhao samjhaiye likho define explain short note notes question questions answer answers class chapter topic make give tell please pls bhai yaar mujhe mera meri mere liye ' +
        'के की का है हैं में से को पर और या यह वह इस उस भी तो नहीं क्या कैसे क्यों कौन कब कहाँ एक दो बताओ समझाओ लिखो').split(' '));
    function stem(w) {
        if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
        if (w.length > 5 && /(ing|ed)$/.test(w)) return w.replace(/(ing|ed)$/, '');
        if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
        if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
        return w;
    }
    function tok(s) {                                          // \p{M} keeps Hindi vowel signs (matras) inside the word
        var m = String(s || '').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [], out = [];
        m.forEach(function (w) { if (w.length < 2 && !/\d/.test(w)) return; if (STOP.has(w)) return; out.push(/^[a-z]+$/.test(w) ? stem(w) : w); });
        return out;
    }
    function clean(t) { return String(t || '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }

    // pages: [{ p, text }] -> ["12§piece", ...]
    function chunkPages(pages) {
        var out = [];
        pages.forEach(function (pg) {
            var t = String(pg.text || '').replace(/\s+/g, ' ').trim();
            if (t.length < 30) return;
            var sents = t.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g) || [t], cur = '', i, s;
            function flush() { cur = cur.trim(); if (cur.length >= 40) out.push((pg.p || 0) + CH + cur); }
            for (i = 0; i < sents.length; i++) {
                s = sents[i];
                while (s.length > CHUNK * 1.5) { var cut = s.lastIndexOf(' ', CHUNK); if (cut < CHUNK / 2) cut = CHUNK; if (cur) { flush(); cur = ''; } cur = s.slice(0, cut); flush(); cur = ''; s = s.slice(cut); }
                if (cur && (cur.length + s.length) > CHUNK) { var tail = cur.length > 200 ? '' : cur; flush(); cur = tail; }
                cur += s;
            }
            if (cur) flush();
        });
        return out;
    }
    function keywords(title, chunks) {
        var f = {}, k;
        chunks.forEach(function (c) { tok(c.slice(c.indexOf(CH) + 1)).forEach(function (w) { if (w.length >= 3 || /\d/.test(w)) f[w] = (f[w] || 0) + 1; }); });
        var arr = Object.keys(f).filter(function (w) { return f[w] >= 2; }).sort(function (a, b) { return f[b] - f[a]; }).slice(0, 80);
        tok(title).forEach(function (w) { if (arr.indexOf(w) < 0) arr.push(w); });
        return arr;
    }

    /* ======================= reading files (browser side) ======================= */
    function loadScript(src) {
        return new Promise(function (res, rej) {
            var el = document.createElement('script'); el.src = src; el.async = true; el.crossOrigin = 'anonymous';
            el.onload = res; el.onerror = function () { rej(new Error('Could not load ' + src + ' (check the internet).')); };
            document.head.appendChild(el);
        });
    }
    async function pdfLib() {
        if (!window.pdfjsLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        return window.pdfjsLib;
    }
    var ocrW = null;
    async function ocr(canvas, lang) {
        if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
        if (!ocrW || ocrW.lang !== lang) { if (ocrW) { try { await ocrW.w.terminate(); } catch (e) {} } ocrW = { lang: lang, w: await window.Tesseract.createWorker(lang, 1) }; }
        var r = await ocrW.w.recognize(canvas);
        return clean(r && r.data && r.data.text);
    }
    async function readPdf(file, opt, say) {
        var lib = await pdfLib(), doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise, pages = [], i, pg, tc, txt, vp, cv, ocrN = 0, scanned = 0;
        for (i = 1; i <= doc.numPages; i++) {
            if (opt.stop && opt.stop()) throw new Error('Stopped.');
            say(file.name + ': page ' + i + ' of ' + doc.numPages, i / doc.numPages);
            pg = await doc.getPage(i);
            tc = await pg.getTextContent();
            txt = clean(tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ' '); }).join(''));
            if (txt.replace(/\s/g, '').length < 40) {
                scanned++;
                if (opt.ocr && ocrN < 120) {
                    ocrN++; say(file.name + ': reading scanned page ' + i + ' (OCR, slow)…', i / doc.numPages);
                    vp = pg.getViewport({ scale: 2 }); cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
                    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
                    txt = await ocr(cv, opt.lang);
                }
            }
            if (txt) pages.push({ p: i, text: txt });
        }
        if (!pages.length && scanned) throw new Error(file.name + ' looks like scanned pictures with no text. Tick "Scanned pages (OCR)" and add it again.');
        if (scanned && !opt.ocr) say(scanned + ' scanned page(s) had no text and were skipped (tick OCR to read them).', 1);
        return pages;
    }

    // minimal ZIP reader (stored + deflate) using the browser's own DecompressionStream
    async function unzip(blob) {
        var buf = new DataView(await blob.arrayBuffer()), n = buf.byteLength, i, eocd = -1;
        for (i = n - 22; i >= Math.max(0, n - 65600); i--) { if (buf.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
        if (eocd < 0) throw new Error('This is not a valid ZIP file.');
        var cnt = buf.getUint16(eocd + 10, true), off = buf.getUint32(eocd + 16, true), out = [], dec = new TextDecoder('utf-8');
        if (cnt === 0xFFFF || off === 0xFFFFFFFF) throw new Error('This ZIP is too big (ZIP64). Please split it into smaller ZIPs.');
        for (i = 0; i < cnt; i++) {
            if (buf.getUint32(off, true) !== 0x02014b50) break;
            var flag = buf.getUint16(off + 8, true), method = buf.getUint16(off + 10, true), csz = buf.getUint32(off + 20, true), nl = buf.getUint16(off + 28, true), el = buf.getUint16(off + 30, true), cl = buf.getUint16(off + 32, true), lho = buf.getUint32(off + 42, true);
            var name = dec.decode(new Uint8Array(buf.buffer, off + 46, nl));
            out.push({ name: name, method: method, csz: csz, lho: lho, enc: !!(flag & 1) });
            off += 46 + nl + el + cl;
        }
        return out.filter(function (e) { return !/\/$/.test(e.name) && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.name); }).map(function (e) {
            return {
                name: e.name,
                blob: async function () {
                    if (e.enc) throw new Error(e.name + ' is password protected.');
                    var nl2 = buf.getUint16(e.lho + 26, true), el2 = buf.getUint16(e.lho + 28, true), start = e.lho + 30 + nl2 + el2;
                    var raw = blob.slice(start, start + e.csz);
                    if (e.method === 0) return raw;
                    if (e.method !== 8) throw new Error(e.name + ': unsupported ZIP compression.');
                    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open ZIP files. Use the latest Chrome.');
                    return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
                }
            };
        });
    }
    async function readDocx(file) {
        var ents = await unzip(file), e = ents.filter(function (x) { return x.name === 'word/document.xml'; })[0];
        if (!e) throw new Error(file.name + ': not a valid Word file.');
        var xml = await (await e.blob()).text();
        return clean(xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
    }

    // any file -> [{p, text}] pages. A ZIP becomes the pages of all the files inside it.
    async function readAny(file, opt, say, depth) {
        var nm = String(file.name || ''), ty = String(file.type || '');
        if (/\.zip$/i.test(nm) || /zip/.test(ty)) {
            if (depth > 0) return [];
            var ents = await unzip(file), pages = [], i, e, b, sub;
            if (ents.length > 300) throw new Error('This ZIP has ' + ents.length + ' files (max 300). Please split it.');
            for (i = 0; i < ents.length; i++) {
                e = ents[i];
                if (!/\.(pdf|txt|md|csv|json|html?|docx|png|jpe?g)$/i.test(e.name)) continue;
                if (/\.(png|jpe?g)$/i.test(e.name) && !opt.ocr) continue;
                say('ZIP file ' + (i + 1) + ' of ' + ents.length + ': ' + e.name, i / ents.length);
                b = await e.blob(); b = new File([b], e.name, { type: /\.pdf$/i.test(e.name) ? 'application/pdf' : '' });
                sub = await readAny(b, opt, say, depth + 1);
                sub.forEach(function (pg) { pages.push({ p: pg.p, text: pg.text, f: e.name.split('/').pop() }); });
            }
            return pages;
        }
        if (/\.pdf$/i.test(nm) || /pdf$/.test(ty)) { var pp = await readPdf(file, opt, say); return depth ? pp : pp.map(function (x) { x.f = nm; return x; }); }
        if (/\.docx$/i.test(nm)) return [{ p: 0, text: await readDocx(file) }];
        if (/^image\//.test(ty) || /\.(png|jpe?g)$/i.test(nm)) {
            if (!opt.ocr) throw new Error(nm + ' is a picture. Tick "Scanned pages (OCR)" to read it.');
            var bm = await createImageBitmap(file), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0);
            return [{ p: 0, text: await ocr(c, opt.lang) }];
        }
        var t = await file.text();
        if (/\.html?$/i.test(nm)) t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
        return [{ p: 0, text: clean(t) }];
    }

    /* ---- website pages: a browser cannot read other sites directly (CORS), so a "reader" service turns the page into clean text.
          Default: the free public reader r.jina.ai. For more control put your own Cloudflare Worker address here
          (it must answer GET <address>?url=<page> with the page text and allow CORS). ---- */
    var FETCH_PROXY = '';
    function readerUrl(u) { return FETCH_PROXY ? FETCH_PROXY + encodeURIComponent(u) : 'https://r.jina.ai/' + u; }
    function normUrl(u) { try { var x = new URL(u); x.hash = ''; return x.href.replace(/\/$/, ''); } catch (e) { return ''; } }
    async function fetchWeb(u, opt) {
        var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 45000), r;
        try { r = await fetch(readerUrl(u), { headers: { 'Accept': 'text/plain' }, signal: c.signal }); }
        catch (e) { throw new Error('Could not reach ' + u + ' (the reader service or the internet is not available).'); }
        finally { clearTimeout(t); }
        if (!r.ok) throw new Error('Could not read ' + u + ' (error ' + r.status + '). The site may block readers.');
        return r.text();
    }
    // reader markdown -> { text, links }
    function webText(md) {
        var links = [], m, re = /(?<!!)\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
        while ((m = re.exec(md))) links.push(m[1]);
        var body = md.replace(/^(Title|URL Source|Published Time|Markdown Content|Warning):.*$/gm, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/[*_`>|]+/g, ' ');
        return { text: clean(body), links: links };
    }
    // start page (+ same-site links) -> [{p, text, f}]
    async function readWeb(start, maxPages, say, stop) {
        var host = new URL(start).host, seen = {}, queue = [normUrl(start)], pages = [], first = true;
        seen[queue[0]] = 1;
        while (queue.length && pages.length < maxPages) {
            if (stop()) throw new Error('Stopped.');
            var u = queue.shift();
            say('Reading page ' + (pages.length + 1) + ' of up to ' + maxPages + ': ' + u, pages.length / maxPages);
            var md;
            try { md = await fetchWeb(u); } catch (e) { if (first) throw e; continue; }
            var w = webText(md); first = false;
            if (w.text.length > 150) pages.push({ p: 0, text: w.text, f: u });
            if (maxPages > 1) w.links.forEach(function (l) {
                var n = normUrl(l); if (!n || seen[n]) return;
                try { if (new URL(n).host !== host) return; } catch (e) { return; }
                if (/\.(pdf|jpe?g|png|gif|webp|zip|mp4|mp3|css|js)(\?|$)/i.test(n)) return;
                seen[n] = 1; queue.push(n);
            });
            if (queue.length && pages.length < maxPages) await new Promise(function (r) { setTimeout(r, 3200); });   // free reader: ~20 pages / minute
        }
        return pages;
    }

    /* ======================= Firebase (admin writes) ======================= */
    async function dbReq(method, path, body) {
        var tok = window.NBA && await window.NBA.token();
        if (!tok) { var e0 = new Error('Admin session expired. Please log in again.'); e0.code = 'auth'; throw e0; }
        var r = await fetch(db() + path + '.json?auth=' + encodeURIComponent(tok), { method: method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (!r.ok) { var e = new Error(r.status === 401 || r.status === 403 ? 'rules' : 'Firebase error ' + r.status); e.code = r.status === 401 || r.status === 403 ? 'rules' : 'http'; throw e; }
        return r.json();
    }
    async function jget(path, ms) {
        var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 8000);
        try { var r = await fetch(db() + path + '.json', { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
        finally { clearTimeout(t); }
    }

    /* ======================= retrieval (runs for every student) ======================= */
    var C = { meta: null, cfg: null, at: 0, failAt: 0, idx: {} };
    var SUBJ = { science: ['science', 'vigyan', 'physics', 'chemistry', 'biology', 'विज्ञान'], math: ['math', 'maths', 'mathematics', 'ganit', 'गणित', 'algebra', 'geometry'], hindi: ['hindi', 'हिंदी', 'हिन्दी'], english: ['english', 'angrezi', 'grammar'], sst: ['sst', 'social', 'history', 'geography', 'civics', 'economics', 'इतिहास', 'भूगोल'], maithili: ['maithili', 'मैथिली'], sanskrit: ['sanskrit', 'संस्कृत'] };
    function subjKey(s) {
        s = String(s || '').toLowerCase(); if (!s) return '';
        var k; for (k in SUBJ) { if (s === k || SUBJ[k].some(function (w) { return s.indexOf(w) >= 0; })) return k; }
        return '';
    }
    function clsNum(c) { var m = String(c || '').match(/\d+/); return m ? +m[0] : 0; }
    async function getMeta(force) {
        var now = Date.now();
        if (!force && C.meta && now - C.at < 10 * 60000) return C;
        if (!force && C.failAt && now - C.failAt < 3 * 60000) return null;
        try {
            var both = await Promise.all([jget('/notes_bazar_src/meta', 9000), jget('/notes_bazar_src/cfg', 9000)]);   // never the pieces themselves
            C.meta = both[0] || {}; C.cfg = both[1] || {}; C.at = now; C.failAt = 0;
        } catch (e) { C.failAt = now; return null; }
        return C;
    }
    // idb cache of downloaded pieces (so a book is downloaded once per device)
    function idb() {
        return new Promise(function (res, rej) {
            if (!window.indexedDB) { rej(new Error('no-idb')); return; }
            var r = indexedDB.open('nb_sources', 1);
            r.onupgradeneeded = function () { r.result.createObjectStore('c', { keyPath: 'id' }); };
            r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
        });
    }
    function idbGet(id) { return idb().then(function (d) { return new Promise(function (res) { var rq = d.transaction('c').objectStore('c').get(id); rq.onsuccess = function () { res(rq.result); d.close(); }; rq.onerror = function () { res(null); d.close(); }; }); }).catch(function () { return null; }); }
    function idbPut(rec) { return idb().then(function (d) { return new Promise(function (res) { var tx = d.transaction('c', 'readwrite'); tx.objectStore('c').put(rec); tx.oncomplete = function () { d.close(); res(); }; tx.onerror = tx.onabort = function () { d.close(); res(); }; }); }).catch(function () {}); }
    function idbDel(id) { return idb().then(function (d) { return new Promise(function (res) { var tx = d.transaction('c', 'readwrite'); tx.objectStore('c').delete(id); tx.oncomplete = function () { d.close(); res(); }; tx.onerror = tx.onabort = function () { d.close(); res(); }; }); }).catch(function () {}); }

    function buildIndex(arr) {
        var items = [], inv = new Map(), tot = 0;
        arr.forEach(function (s) {
            s = String(s || ''); var i = s.indexOf(CH), p = i > 0 ? +s.slice(0, i) || 0 : 0, t = i >= 0 ? s.slice(i + 1) : s;
            var tk = tok(t), tf = {}, id = items.length;
            tk.forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
            Object.keys(tf).forEach(function (w) { var a = inv.get(w); if (!a) { a = []; inv.set(w, a); } a.push([id, tf[w]]); });
            items.push({ p: p, t: t, len: tk.length || 1 }); tot += tk.length || 1;
        });
        return { items: items, inv: inv, avg: items.length ? tot / items.length : 1 };
    }
    async function loadSource(m) {
        var c = C.idx[m.id];
        if (c && c.v === m.v) return c;
        var rec = await idbGet(m.id), arr;
        if (rec && rec.v === m.v && rec.items) arr = rec.items;
        else {
            var raw = await jget('/notes_bazar_src/chunks/' + encodeURIComponent(m.id), 40000);
            arr = Array.isArray(raw) ? raw : Object.keys(raw || {}).sort(function (a, b) { return a - b; }).map(function (k) { return raw[k]; });
            idbPut({ id: m.id, v: m.v, items: arr });
        }
        c = buildIndex(arr); c.v = m.v; c.title = m.title; c.cls = m.cls; c.subj = m.subj; c.id = m.id;
        C.idx[m.id] = c; return c;
    }
    function pickSources(metaObj, qt, hint) {
        var list = Object.keys(metaObj || {}).map(function (k) { var m = metaObj[k]; if (!m || typeof m !== 'object') return null; m.id = k; return m; }).filter(function (m) { return m && m.on === true && !m.building && m.n > 0; });
        var hc = clsNum(hint.cls), hs = subjKey(hint.subj) || subjKey(hint.q);
        var scored = list.map(function (m) {
            var kw = new Set(m.kw || []), ov = 0; qt.forEach(function (w) { if (kw.has(w)) ov++; });
            var tt = tok(m.title), tov = 0; qt.forEach(function (w) { if (tt.indexOf(w) >= 0) tov++; });
            var mc = clsNum(m.cls), ms = subjKey(m.subj);
            var sc = ov + tov * 2 + (hc && mc && hc === mc ? 2 : 0) + (hs && ms && hs === ms ? 2 : 0) + (m.cls === 'All' || !mc ? 0.5 : 0) + (!ms ? 0.5 : 0);
            if (hc && mc && hc !== mc) sc -= 3;                       // another class: still allowed, but only if nothing better
            if (hs && ms && hs !== ms) sc -= 3;
            return { m: m, sc: sc, ov: ov + tov };
        });
        scored.sort(function (a, b) { return b.sc - a.sc; });
        return { all: list.length, pick: (list.length <= 3 ? scored : scored.filter(function (x) { return x.ov > 0 || x.sc > 1; })).slice(0, 3).map(function (x) { return x.m; }) };
    }
    // question -> best pieces. { any, chunks:[{title,page,text,score}] }
    async function retrieve(query, hint, K, maxChars) {
        hint = hint || {};
        var st = await getMeta(false);
        if (!st || !st.meta) return { any: false, chunks: [], cfg: {} };
        var qt = []; tok(query).forEach(function (w) { if (qt.indexOf(w) < 0) qt.push(w); }); qt = qt.slice(0, 24);
        var sel = pickSources(st.meta, qt, { q: query, cls: hint.cls, subj: hint.subj });
        var res = { any: sel.all > 0, chunks: [], cfg: st.cfg || {} };
        if (!res.any || !qt.length || !sel.pick.length) return res;
        var cand = [];
        for (var si = 0; si < sel.pick.length; si++) {
            var ix;
            try { ix = await loadSource(sel.pick[si]); } catch (e) { continue; }
            var N = ix.items.length, acc = {}, hit = {}, idfTot = 0, idfHit = {};
            qt.forEach(function (w) {
                var po = ix.inv.get(w), df = po ? po.length : 0, idf = Math.max(1, Math.log(1 + (N - df + .5) / (df + .5)));   // floor 1: a small source (few pieces) must still match
                idfTot += idf; if (!po) return;
                po.forEach(function (x) { var i = x[0], tf = x[1]; acc[i] = (acc[i] || 0) + idf * (tf * 2.4) / (tf + 1.4 * (0.25 + 0.75 * ix.items[i].len / ix.avg)); idfHit[i] = (idfHit[i] || 0) + idf; });
            });
            var boost = 1 + (clsNum(hint.cls) && clsNum(hint.cls) === clsNum(ix.cls) ? .2 : 0) + (subjKey(hint.subj) && subjKey(hint.subj) === subjKey(ix.subj) ? .1 : 0);
            Object.keys(acc).forEach(function (i) {
                var cov = idfHit[i] / (idfTot || 1);
                if (cov >= 0.34 && acc[i] >= 1.0) cand.push({ title: ix.title, page: ix.items[i].p, text: ix.items[i].t, score: acc[i] * boost * (0.6 + 0.4 * cov), cov: cov });
            });
        }
        cand.sort(function (a, b) { return b.score - a.score; });
        var used = 0;
        cand.forEach(function (c) { if (res.chunks.length >= K) return; if (used + c.text.length > maxChars && res.chunks.length) return; res.chunks.push(c); used += c.text.length; });
        return res;
    }

    var RULE_USE = 'HOW TO USE THEM: build every fact, definition, formula, number, name, date and example on these excerpts. If your own memory disagrees with the excerpts, trust the excerpts. Never contradict them and never add facts that they do not support. Keep every format, language, length and JSON rule given above exactly unchanged.';
    async function augment(messages, hint) {
        if (!hint || !hint.q || !messages || !messages.length) return messages;
        var res = await retrieve(hint.q, hint, hint.chat ? 5 : 4, hint.chat ? 4200 : 3200);
        var cfg = res.cfg || {};
        if (!res.any || cfg.on === false) return messages;
        var block = '';
        if (res.chunks.length) {
            block = '\n\nSOURCE LIBRARY (trusted textbook / notes material uploaded by the Notes Bazar admin; this is the reference for this answer):\n' +
                res.chunks.map(function (c, i) { return '[' + (i + 1) + '] ' + c.title + (c.page ? ' (page ' + c.page + ')' : '') + ': ' + c.text; }).join('\n\n') + '\n\n' + RULE_USE +
                (hint.chat ? (cfg.mode === 'strict'
                    ? ' STRICT MODE: answer study questions ONLY from these excerpts. If they do not cover part of the question, say that part is not in the Notes Bazar library yet.'
                    : ' If the excerpts do not answer the question, answer from your general knowledge and end with one short line: (Ye Notes Bazar library me nahi mila, general knowledge se bataya.)') : '');
            var seen = {}, titles = []; res.chunks.forEach(function (c) { if (!seen[c.title]) { seen[c.title] = 1; titles.push(c.title); } });
            window.nbSources.lastUsed = titles;
        } else if (hint.chat && cfg.mode === 'strict') {
            block = '\n\nSOURCE LIBRARY RULE (strict mode): no excerpt of the Notes Bazar library matched this message. If it is a study / syllabus question, do NOT answer it from memory: kindly say this topic is not in the Notes Bazar library yet and suggest the "What if you want?" request on the Home page or another topic. Small talk, motivation, emotional support, study plans and general chat are still fine to answer normally.';
        }
        if (!block) return messages;
        var done = false;
        return messages.map(function (m) {
            if (!done && m.role === 'system' && typeof m.content === 'string') { done = true; return { role: m.role, content: m.content + block }; }
            return m;
        });
    }
    window.nbSources = { augment: augment, search: retrieve, lastUsed: null, tok: tok };

    /* ======================= admin page ======================= */
    var S = { list: [], cfg: {}, state: 'idle', busy: false, tab: 'file', stop: false, err: '', rules: false };
    var CLASSES = ['All'].concat(Array.from({ length: 12 }, function (_, i) { return 'Class ' + (i + 1); }));
    var SUBJECTS = ['All', 'Science', 'Math', 'Hindi', 'English', 'SST', 'Maithili', 'Sanskrit', 'Computer', 'Other'];
    function opts(arr, cur) { return arr.map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
    function injectCss() {
        if ($('srcCss')) return;
        var st = document.createElement('style'); st.id = 'srcCss';
        st.textContent = '#adminPanel-sources [hidden],#srcStop[hidden]{display:none!important}.src-in{width:100%;min-height:42px;padding:8px 12px;border-radius:12px;border:1px solid var(--a-line);background:var(--a-card);color:var(--a-text);font-size:13px;font-family:inherit}' +
            '.src-in:focus{border-color:var(--a-p);box-shadow:0 0 0 3px rgba(99,102,241,.18);outline:none}textarea.src-in{min-height:120px;resize:vertical}' +
            '.src-g{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:10px}.src-lb{display:block;font-size:11px;font-weight:700;color:var(--a-mute);margin:0 0 4px}' +
            '.src-bar{height:8px;border-radius:99px;background:var(--a-line);overflow:hidden;margin:10px 0 4px}.src-bar i{display:block;height:100%;width:0;background:var(--a-p);transition:width .2s}' +
            '.src-t{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.src-hit{border:1px solid var(--a-line);border-radius:12px;padding:10px 12px;margin-top:8px;font-size:12px;line-height:1.5}.src-hit b{display:block;font-size:11px;color:var(--a-p);margin-bottom:3px}' +
            '.src-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--a-line)}.src-row:first-child{border-top:0}.src-row .tx{flex:1;min-width:160px}.src-row .tx b{display:block;font-size:13px}.src-row .tx span{font-size:11px;color:var(--a-mute)}.src-row select{width:auto;min-height:34px;padding:4px 8px}';
        document.head.appendChild(st);
    }
    function rulesText(em) { return '"notes_bazar_src": {\n  ".read": true,\n  ".write": "auth != null && auth.token.email === \'' + (em || 'YOUR_ADMIN_EMAIL') + '\'"\n}'; }
    function fmtK(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n || 0); }
    function dt(ts) { return ts ? new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; }

    async function loadList() {
        S.state = 'loading'; paintList();
        try {
            var both = await Promise.all([jget('/notes_bazar_src/meta', 10000), jget('/notes_bazar_src/cfg', 10000)]);
            S.cfg = both[1] || {}; var meta = both[0] || {};
            S.list = Object.keys(meta).map(function (k) { var m = meta[k]; m.id = k; return m; }).filter(function (m) { return m && typeof m === 'object'; }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            S.state = 'ok'; S.err = '';
            C.meta = meta; C.cfg = S.cfg; C.at = Date.now(); C.failAt = 0;
        } catch (e) { S.state = 'err'; S.err = 'Could not read the library. If you have not added the Firebase rule yet, add it first (see "Firebase rule" below).'; }
        paintList(); paintCfg();
    }
    function paintCfg() {
        var on = $('srcOn'), md = $('srcMode');
        if (on) { on.setAttribute('aria-checked', S.cfg.on !== false ? 'true' : 'false'); }
        if (md) md.value = S.cfg.mode === 'strict' ? 'strict' : 'prefer';
    }
    function paintList() {
        var el = $('srcList'); if (!el) return;
        if (S.state === 'loading') { el.innerHTML = '<div class="a-empty"><i class="fa-solid fa-spinner fa-spin"></i>Loading…</div>'; return; }
        if (S.state === 'err') { el.innerHTML = '<div class="a-msg err" style="display:block">' + esc(S.err) + '</div>'; return; }
        if (!S.list.length) { el.innerHTML = '<div class="a-empty"><i class="fa-solid fa-book-open"></i>No source added yet. Add your first book or notes above.</div>'; return; }
        el.innerHTML = S.list.map(function (m) {
            var st = m.building ? '<span class="a-pill c-amber">saving…</span>' : m.on ? '<span class="a-pill c-green">in use</span>' : '<span class="a-pill">paused</span>';
            return '<div class="src-row"><div class="tx"><b>' + esc(m.title || 'Untitled') + ' ' + st + '</b><span>' + esc(m.kind || 'file') + ' &middot; ' + (m.n || 0) + ' pieces &middot; ' + fmtK(m.chars) + ' letters &middot; ' + dt(m.createdAt) + '</span></div>' +
                '<select class="src-in" aria-label="Class" onchange="NBSources.tag(' + q(m.id) + ',\'cls\',this.value)">' + opts(CLASSES, m.cls || 'All') + '</select>' +
                '<select class="src-in" aria-label="Subject" onchange="NBSources.tag(' + q(m.id) + ',\'subj\',this.value)">' + opts(SUBJECTS, m.subj || 'All') + '</select>' +
                '<button type="button" class="a-toggle" role="switch" aria-checked="' + (m.on ? 'true' : 'false') + '" aria-label="Use this source" onclick="NBSources.toggle(' + q(m.id) + ')"></button>' +
                '<button type="button" class="a-btn dng sm" onclick="NBSources.del(' + q(m.id) + ')"><i class="fa-solid fa-trash"></i>Delete</button></div>';
        }).join('');
    }
    function setProg(txt, f, bad) {
        var m = $('srcMsg'), b = $('srcBar');
        if (m) { m.className = 'a-msg' + (bad ? ' err' : ''); m.style.display = txt ? 'block' : 'none'; m.textContent = txt || ''; }
        if (b) b.style.width = Math.round(Math.max(0, Math.min(1, f || 0)) * 100) + '%';
    }

    var A = window.NBSources = {};
    A.adminRender = function (el) {
        if (!el) return;
        injectCss();
        if (el.dataset.built) return;                          // admin.js redraws pages often: keep the form (and a running upload) as it is
        el.dataset.built = '1';
        var email = ''; if (window.NBA && window.NBA.email) window.NBA.email().then(function (e) { email = e; var r = $('srcRule'); if (r) r.textContent = rulesText(e); });
        el.innerHTML =
            '<div class="a-two"><div class="a-stack">' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-book-open-reader"></i> How it works</h3></div>' +
            '<p class="a-note" style="background:var(--a-hover);border-color:var(--a-line);color:var(--a-mute);margin:0 0 10px">Add your books and notes here. Bazar AI, the AI notes maker and the question paper maker will then answer from <b>your</b> material, so students do not see made-up or wrong content. Each answer uses only the few matching pieces, so it stays fast.</p>' +
            '<div class="a-row"><div class="tx"><b>Use the library in AI</b><span>Turn OFF to make the AI work as before.</span></div><button type="button" class="a-toggle" id="srcOn" role="switch" aria-checked="true" aria-label="Use the library in AI" onclick="NBSources.setCfg(\'on\')"></button></div>' +
            '<div class="a-row"><div class="tx"><b>When the library has no answer</b><span>Bazar AI chat only. Notes and papers always keep working.</span></div><select class="src-in" id="srcMode" style="width:auto" onchange="NBSources.setCfg(\'mode\',this.value)"><option value="prefer">Use my library first, then general knowledge</option><option value="strict">Only my library (say "not available")</option></select></div></section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-circle-plus"></i> Add a source</h3></div>' +
            '<div class="src-g"><div style="grid-column:1/-1"><label class="src-lb" for="srcTitle">Name (e.g. NCERT Science Class 10)</label><input class="src-in" id="srcTitle" maxlength="90" placeholder="Book or notes name"></div>' +
            '<div><label class="src-lb" for="srcCls">Class</label><select class="src-in" id="srcCls">' + opts(CLASSES, 'All') + '</select></div>' +
            '<div><label class="src-lb" for="srcSubj">Subject</label><select class="src-in" id="srcSubj">' + opts(SUBJECTS, 'All') + '</select></div></div>' +
            '<div class="src-t" id="srcTabs"><button type="button" class="a-btn pri sm" data-t="file" onclick="NBSources.tab(\'file\')"><i class="fa-solid fa-file-pdf"></i>PDF / ZIP / file</button><button type="button" class="a-btn sm" data-t="drive" onclick="NBSources.tab(\'drive\')"><i class="fa-brands fa-google-drive"></i>Drive link</button><button type="button" class="a-btn sm" data-t="web" onclick="NBSources.tab(\'web\')"><i class="fa-solid fa-globe"></i>Website link</button><button type="button" class="a-btn sm" data-t="text" onclick="NBSources.tab(\'text\')"><i class="fa-solid fa-align-left"></i>Paste text</button></div>' +
            '<div id="srcP-file"><input class="src-in" type="file" id="srcFile" multiple accept=".pdf,.zip,.txt,.md,.csv,.json,.html,.htm,.docx,image/png,image/jpeg"><p class="a-note" style="background:var(--a-hover);border-color:var(--a-line);color:var(--a-mute);margin:8px 0 0">PDF books, ZIP of PDFs, Word and text files work. Large books take a minute: the text is read on this device.</p></div>' +
            '<div id="srcP-drive" hidden><input class="src-in" id="srcDrive" placeholder="https://drive.google.com/drive/folders/... or /file/d/..."><p class="a-note" style="background:var(--a-hover);border-color:var(--a-line);color:var(--a-mute);margin:8px 0 0">The file or folder must be shared as <b>Anyone with the link</b>, and the Drive API key must be set in <code>drive.js</code>. A whole folder (with sub-folders) is read.</p></div>' +
            '<div id="srcP-web" hidden><input class="src-in" id="srcWeb" placeholder="https://book-website.com/class-10-science"><div style="margin-top:8px"><label class="src-lb" for="srcWebN">Pages to read</label><select class="src-in" id="srcWebN"><option value="1">This page only</option><option value="10">This page + linked pages of the same site (up to 10)</option><option value="30">This page + linked pages of the same site (up to 30)</option></select></div><p class="a-note" style="background:var(--a-hover);border-color:var(--a-line);color:var(--a-mute);margin:8px 0 0">The page text is read through a free reader service (r.jina.ai), about 20 pages per minute. Pages that need a login or block readers will not work. Use only websites you may copy from.</p></div>' +
            '<div id="srcP-text" hidden><textarea class="src-in" id="srcText" placeholder="Paste the text here. For Gemini NotebookLM: open the notebook, copy the source text or notes and paste them here (NotebookLM links cannot be read by a website)."></textarea></div>' +
            '<label class="a-chk" style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:12px"><input type="checkbox" id="srcOcr"> Scanned pages (OCR): read pictures of pages. Slow, use only if the PDF has no selectable text.</label>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="a-btn pri" id="srcGo" onclick="NBSources.add()"><i class="fa-solid fa-cloud-arrow-up"></i>Add to library</button><button type="button" class="a-btn dng" id="srcStop" hidden onclick="NBSources.stop()"><i class="fa-solid fa-ban"></i>Stop</button></div>' +
            '<div class="src-bar"><i id="srcBar"></i></div><div class="a-msg" id="srcMsg" style="display:none"></div></section>' +
            '</div><div class="a-stack">' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-vial"></i> Test the library</h3></div>' +
            '<p class="a-note" style="background:var(--a-hover);border-color:var(--a-line);color:var(--a-mute);margin:0 0 10px">Type a question like a student would. You will see exactly which pieces the AI would receive.</p>' +
            '<div class="src-g"><div style="grid-column:1/-1"><input class="src-in" id="srcQ" placeholder="e.g. Photosynthesis kya hai?" onkeydown="if(event.key===\'Enter\')NBSources.test()"></div><div><select class="src-in" id="srcTCls" aria-label="Class">' + opts(CLASSES, 'All') + '</select></div><div><select class="src-in" id="srcTSubj" aria-label="Subject">' + opts(SUBJECTS, 'All') + '</select></div></div>' +
            '<button type="button" class="a-btn pri" onclick="NBSources.test()"><i class="fa-solid fa-magnifying-glass"></i>Search</button><div id="srcTest"></div></section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-books"></i> Library</h3><button class="a-btn sm" onclick="NBSources.reload()"><i class="fa-solid fa-rotate"></i>Refresh</button></div><div id="srcList"></div></section>' +
            '<section class="a-card"><div class="a-ch"><h3><i class="fa-solid fa-shield-halved"></i> Firebase rule (one time)</h3></div>' +
            '<p class="a-note" style="background:var(--a-hover);border-color:var(--a-line);color:var(--a-mute);margin:0 0 8px">Firebase Console &rarr; Realtime Database &rarr; Rules: add this next to your other rules. Students need to read it; only you can write. <b>Note:</b> anyone who knows the database address can read the stored text, so add only material you are allowed to use.</p>' +
            '<pre class="a-code" id="srcRule">' + esc(rulesText(email)) + '</pre><button class="a-btn pri sm" onclick="NBSources.copyRule()"><i class="fa-regular fa-copy"></i>Copy rule</button></section>' +
            '</div></div>';
        loadList();
    };
    A.copyRule = function () { var t = ($('srcRule') || {}).textContent || rulesText(''); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Rule copied ✓'); }).catch(function () { prompt('Copy this rule:', t); }); };
    A.reload = function () { loadList(); };
    A.tab = function (t) {
        S.tab = t;
        ['file', 'drive', 'web', 'text'].forEach(function (k) { var p = $('srcP-' + k); if (p) p.hidden = k !== t; });
        document.querySelectorAll('#srcTabs button').forEach(function (b) { b.classList.toggle('pri', b.getAttribute('data-t') === t); });
    };
    A.setCfg = async function (k, v) {
        try {
            if (k === 'on') { S.cfg.on = S.cfg.on === false; await dbReq('PATCH', '/notes_bazar_src/cfg', { on: S.cfg.on }); }
            else { S.cfg.mode = v; await dbReq('PATCH', '/notes_bazar_src/cfg', { mode: v }); }
            C.cfg = S.cfg; paintCfg(); toast('Saved ✓');
        } catch (e) { toast(e.code === 'rules' ? 'Add the Firebase rule first (see below).' : 'Could not save: ' + e.message); loadList(); }
    };
    A.tag = async function (id, k, v) {
        try { var o = {}; o[k] = v; await dbReq('PATCH', '/notes_bazar_src/meta/' + id, o); var m = S.list.filter(function (x) { return x.id === id; })[0]; if (m) m[k] = v; if (C.meta && C.meta[id]) C.meta[id][k] = v; toast('Saved ✓'); }
        catch (e) { toast('Could not save: ' + e.message); loadList(); }
    };
    A.toggle = async function (id) {
        var m = S.list.filter(function (x) { return x.id === id; })[0]; if (!m) return;
        try { await dbReq('PATCH', '/notes_bazar_src/meta/' + id, { on: !m.on }); m.on = !m.on; if (C.meta && C.meta[id]) C.meta[id].on = m.on; paintList(); }
        catch (e) { toast('Could not save: ' + e.message); }
    };
    A.del = async function (id) {
        var m = S.list.filter(function (x) { return x.id === id; })[0];
        if (!confirm('Delete "' + (m ? m.title : 'this source') + '" from the library?')) return;
        try {
            await dbReq('DELETE', '/notes_bazar_src/meta/' + id); await dbReq('DELETE', '/notes_bazar_src/chunks/' + id);
            delete C.idx[id]; idbDel(id); if (C.meta) delete C.meta[id];
            S.list = S.list.filter(function (x) { return x.id !== id; }); paintList(); toast('Deleted ✓');
        } catch (e) { toast('Could not delete: ' + e.message); }
    };
    A.stop = function () { S.stop = true; setProg('Stopping…', 0); };
    A.test = async function () {
        var qq = ($('srcQ') || {}).value || '', box = $('srcTest'); if (!box) return;
        if (qq.trim().length < 2) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="a-empty"><i class="fa-solid fa-spinner fa-spin"></i>Searching…</div>';
        try {
            C.at = 0; C.failAt = 0;                                  // always use fresh data in the test
            var cl = $('srcTCls').value, sj = $('srcTSubj').value;
            var r = await retrieve(qq, { cls: cl === 'All' ? '' : cl, subj: sj === 'All' ? '' : sj }, 5, 4200);
            if (!r.any) { box.innerHTML = '<div class="a-msg err" style="display:block">No source is in use yet (or the Firebase rule is missing).</div>'; return; }
            if (!r.chunks.length) { box.innerHTML = '<div class="a-msg err" style="display:block">Nothing matched. In "Only my library" mode the AI would say this topic is not available. Add a source that covers it.</div>'; return; }
            box.innerHTML = r.chunks.map(function (c, i) { return '<div class="src-hit"><b>[' + (i + 1) + '] ' + esc(c.title) + (c.page ? ' &middot; page ' + c.page : '') + ' &middot; match ' + Math.round(Math.min(1, c.cov) * 100) + '%</b>' + esc(c.text.length > 420 ? c.text.slice(0, 420) + '…' : c.text) + '</div>'; }).join('');
        } catch (e) { box.innerHTML = '<div class="a-msg err" style="display:block">Search failed: ' + esc(e.message) + '</div>'; }
    };

    A.add = async function () {
        if (S.busy) return;
        var title = (($('srcTitle') || {}).value || '').trim().slice(0, 90), cls = $('srcCls').value, subj = $('srcSubj').value, useOcr = $('srcOcr').checked;
        var lang = /hindi|sst|maithili|sanskrit/i.test(subj) ? 'hin+eng' : 'eng+hin';
        var files = [], link = '', txt = '', kind = S.tab;
        if (kind === 'file') { files = Array.prototype.slice.call(($('srcFile') || {}).files || []); if (!files.length) { setProg('Choose a file first.', 0, true); return; } if (!title) title = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'Uploaded books'; }
        else if (kind === 'web') { link = (($('srcWeb') || {}).value || '').trim(); if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(link)) { setProg('Paste a full website link starting with https://', 0, true); return; } if (!title) { try { title = new URL(link).host; } catch (e) { title = 'Website'; } } }
        else if (kind === 'drive') { link = (($('srcDrive') || {}).value || '').trim(); if (!window.nbDrive || !window.nbDrive.parse(link)) { setProg('Paste a valid Google Drive link.', 0, true); return; } if (!title) title = 'Drive material'; }
        else { txt = clean(($('srcText') || {}).value); if (txt.length < 100) { setProg('Paste at least a few lines of text.', 0, true); return; } if (!title) title = 'Pasted notes'; }
        S.busy = true; S.stop = false; $('srcGo').disabled = true; $('srcStop').hidden = false;
        var id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), created = false;
        try {
            var opt = { ocr: useOcr, lang: lang, stop: function () { return S.stop; } }, say = function (t, f) { setProg(t, f); }, pages = [], i;
            if (kind === 'drive') {
                setProg('Downloading from Google Drive…', 0);
                var got = await window.nbDrive.fetchAll(link, { onProgress: function (d, n, nm) { setProg('Drive: file ' + d + ' of ' + n, d / n); }, signal: undefined });
                for (i = 0; i < got.files.length; i++) {
                    var gf = got.files[i], f2 = new File([gf.blob], gf.name.split('/').pop(), { type: gf.mime || '' });
                    if (!/\.(pdf|zip|txt|md|csv|json|html?|docx)$/i.test(f2.name) && !/pdf|zip|text/.test(f2.type)) continue;
                    (await readAny(f2, opt, say, 0)).forEach(function (pg) { pages.push({ p: pg.p, text: pg.text, f: pg.f || gf.name }); });
                }
                title = title || got.name;
            } else if (kind === 'web') {
                pages = await readWeb(link, +($('srcWebN') || {}).value || 1, say, function () { return S.stop; });
                if (!pages.length) throw new Error('No readable text was found on this page.');
            } else if (kind === 'file') {
                for (i = 0; i < files.length; i++) { (await readAny(files[i], opt, say, 0)).forEach(function (pg) { pages.push({ p: pg.p, text: pg.text, f: pg.f || files[i].name }); }); }
            } else pages = [{ p: 0, text: txt }];
            if (S.stop) throw new Error('Stopped.');
            var chars = pages.reduce(function (a, p) { return a + p.text.length; }, 0);
            if (chars < 200) throw new Error('No readable text was found in this material.');
            if (chars > MAX_CHARS) { var run = 0, keep = []; pages.forEach(function (p) { if (run < MAX_CHARS) { keep.push(p); run += p.text.length; } }); pages = keep; chars = run; setProg('Very large: only the first ' + fmtK(MAX_CHARS) + ' letters are used.', 0.02); }
            setProg('Preparing the pieces…', 0);
            var chunks = chunkPages(pages);
            if (!chunks.length) throw new Error('No readable text was found in this material.');
            var meta = { title: title, cls: cls, subj: subj, kind: kind === 'file' ? (files.length === 1 && /\.zip$/i.test(files[0].name) ? 'zip' : 'file') : kind, n: chunks.length, chars: chars, kw: keywords(title, chunks), createdAt: Date.now(), v: Date.now(), on: false, building: true };
            await dbReq('PUT', '/notes_bazar_src/meta/' + id, meta); created = true;
            for (i = 0; i < chunks.length; i += BATCH) {
                if (S.stop) throw new Error('Stopped.');
                var o = {}; chunks.slice(i, i + BATCH).forEach(function (c, j) { o[i + j] = c; });
                await dbReq('PATCH', '/notes_bazar_src/chunks/' + id, o);
                setProg('Saving to the library… ' + Math.min(i + BATCH, chunks.length) + ' of ' + chunks.length, Math.min(1, (i + BATCH) / chunks.length));
            }
            await dbReq('PATCH', '/notes_bazar_src/meta/' + id, { on: true, building: null });
            setProg('Done ✓ ' + chunks.length + ' pieces from ' + fmtK(chars) + ' letters were added. Try it in "Test the library".', 1);
            toast('Source added ✓');
            ['srcTitle', 'srcDrive', 'srcText', 'srcWeb'].forEach(function (k) { if ($(k)) $(k).value = ''; }); if ($('srcFile')) $('srcFile').value = '';
            await loadList();
        } catch (e) {
            if (created) { try { await dbReq('DELETE', '/notes_bazar_src/meta/' + id); await dbReq('DELETE', '/notes_bazar_src/chunks/' + id); } catch (x) {} }
            var msg = e && e.code === 'rules' ? 'Firebase refused the write. Add the rule shown on the right ("Firebase rule"), publish it, then try again.'
                : e && e.code === 'api' ? 'Google Drive is not set up: enable the Drive API and set the key in drive.js.'
                : e && e.code === 'private' ? e.message
                : (e && e.message) || 'Could not add this source.';
            setProg(msg, 0, true);
        }
        S.busy = false; var g = $('srcGo'); if (g) g.disabled = false; var sp = $('srcStop'); if (sp) sp.hidden = true;
    };
})();
