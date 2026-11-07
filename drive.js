/* =====================================================================
   Notes Bazar – drive.js
   Downloads a Google Drive FILE or a whole FOLDER (with sub-folders) inside the browser,
   so the app can keep it in its own storage (IndexedDB) instead of opening Drive.

   How it works: a plain <a href="drive.google.com/uc?export=download"> cannot be read by
   JavaScript (Google sends no CORS headers). The official Drive API (v3) DOES allow it, for
   files / folders shared as "Anyone with the link", when a Google API key is added.

   >>> SETUP (one time, 3 minutes) <<<
   1. console.cloud.google.com -> select the project "notes-market-d309b" -> APIs & Services
      -> Library -> enable "Google Drive API".
   2. APIs & Services -> Credentials -> use the existing browser key or create an API key.
      Restrict it: "Websites" = your site URL, "API restrictions" = Google Drive API
      (+ Identity Toolkit / Firebase APIs if the same key is used for Firebase).
   3. Paste the key below in DRIVE_API_KEY (or leave it empty to try the Firebase web key).
   ===================================================================== */
(function () {
    'use strict';
    var DRIVE_API_KEY = '';                                  // <- paste your Drive API key here
    var FALLBACK_KEY = 'AIzaSyChG_jBGcieowmVVKHdwaiI1zvOwvvPag0';   // Firebase web key (works only if Drive API is enabled for that project and the key is not restricted)
    var B = 'https://www.googleapis.com/drive/v3/files';
    var MAX_FILES = 150, MAX_BYTES = 450 * 1024 * 1024, MAX_DEPTH = 4, PAR = 3;
    var FOLDER = 'application/vnd.google-apps.folder', GAPPS = 'application/vnd.google-apps.';

    function key() { return DRIVE_API_KEY || window.NB_DRIVE_KEY || FALLBACK_KEY; }
    function err(code, msg, extra) { var e = new Error(msg); e.code = code; if (extra) e.detail = extra; return e; }

    // link -> file / folder id (or null when it is not a Google Drive link)
    function parse(link) {
        var u;
        try { u = new URL(String(link)); } catch (e) { return null; }
        if (!/^https?:$/.test(u.protocol) || !/(^|\.)(drive|docs)\.google\.com$/i.test(u.hostname)) return null;
        var m = u.pathname.match(/\/folders\/([\w-]{10,})/) || u.pathname.match(/\/d\/([\w-]{10,})/) || (u.search || '').match(/[?&]id=([\w-]{10,})/);
        return m ? { id: m[1] } : null;
    }

    function api(url, opt) {
        opt = opt || {};
        return (function go(attempt) {
            return fetch(url, { signal: opt.signal }).then(function (r) {
                if (r.ok) return r;
                if ((r.status === 429 || r.status >= 500) && attempt < 2) return new Promise(function (res) { setTimeout(res, 900 * (attempt + 1)); }).then(function () { return go(attempt + 1); });
                return r.text().then(function (t) {
                    var j = null, reason = '', msg = '';
                    try { j = JSON.parse(t); reason = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || (j.error && j.error.status) || ''; msg = (j.error && j.error.message) || ''; } catch (e) {}
                    if (/accessNotConfigured|SERVICE_DISABLED|API_KEY_INVALID|keyInvalid|API key not valid|ipRefererBlocked|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_SERVICE_BLOCKED|referer/i.test(reason + ' ' + msg)) throw err('api', 'Drive API is not set up for this key: ' + msg);
                    if (/downloadQuotaExceeded|dailyLimitExceeded|userRateLimitExceeded|rateLimitExceeded|quota/i.test(reason + ' ' + msg)) throw err('quota', 'Google Drive download limit reached. Try again later.');
                    if (r.status === 404 || r.status === 403 || r.status === 401) throw err('private', 'This Drive item is private or was deleted. Share it as "Anyone with the link".');
                    throw err('http', 'Drive error ' + r.status);
                });
            }, function (e) { if (e && e.name === 'AbortError') throw e; throw err('net', 'No connection to Google Drive.'); });
        })(0);
    }
    function q(o) { return Object.keys(o).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); }

    function meta(id, opt) {
        return api(B + '/' + id + '?' + q({ fields: 'id,name,mimeType,size,shortcutDetails', supportsAllDrives: 'true', key: key() }), opt).then(function (r) { return r.json(); });
    }
    function list(id, opt) {
        var out = [];
        return (function page(tok) {
            var p = { q: "'" + id + "' in parents and trashed=false", fields: 'nextPageToken,files(id,name,mimeType,size,shortcutDetails)', pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', orderBy: 'name', key: key() };
            if (tok) p.pageToken = tok;
            return api(B + '?' + q(p), opt).then(function (r) { return r.json(); }).then(function (j) {
                out = out.concat(j.files || []);
                return j.nextPageToken && out.length < 1500 ? page(j.nextPageToken) : out;
            });
        })('');
    }
    function safeName(n) { return String(n || 'file').replace(/[\\:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').slice(0, 150) || 'file'; }

    // walk a folder (recursively) -> flat list of downloadable entries
    function walk(id, prefix, depth, st, opt) {
        return list(id, opt).then(function (items) {
            var subs = [];
            items.forEach(function (it) {
                var mt = it.mimeType;
                if (mt === GAPPS + 'shortcut' && it.shortcutDetails) { mt = it.shortcutDetails.targetMimeType; it = { id: it.shortcutDetails.targetId, name: it.name, mimeType: mt, size: it.size }; }
                if (mt === FOLDER) { if (depth < MAX_DEPTH) subs.push(it); else st.skipped.push(prefix + it.name + ' (too deep)'); return; }
                if (mt && mt.indexOf(GAPPS) === 0) {
                    if (/document$|spreadsheet$|presentation$|drawing$/.test(mt)) st.files.push({ id: it.id, path: prefix + safeName(it.name) + '.pdf', mime: 'application/pdf', size: 0, exp: true });
                    else st.skipped.push(prefix + it.name);
                    return;
                }
                st.files.push({ id: it.id, path: prefix + safeName(it.name), mime: mt || 'application/octet-stream', size: Number(it.size) || 0 });
            });
            return subs.reduce(function (p, s) { return p.then(function () { return walk(s.id, prefix + safeName(s.name) + '/', depth + 1, st, opt); }); }, Promise.resolve());
        });
    }

    function getBlob(f, opt) {
        var url = f.exp ? B + '/' + f.id + '/export?' + q({ mimeType: 'application/pdf', key: key() }) : B + '/' + f.id + '?' + q({ alt: 'media', supportsAllDrives: 'true', key: key() });
        return api(url, opt).then(function (r) { return r.blob(); });
    }

    /* link -> { kind:'file'|'folder', name, files:[{name:path, path, blob, mime, size}], skipped:[] }
       opt: { onProgress(done,total,name), signal } */
    function fetchAll(link, opt) {
        opt = opt || {};
        var p = parse(link);
        if (!p) return Promise.reject(err('notdrive', 'This is not a Google Drive link.'));
        var st = { files: [], skipped: [] }, kind = 'file', rootName = '';
        return meta(p.id, opt).then(function (m) {
            rootName = m.name || 'Drive item';
            var mt = m.mimeType;
            if (mt === GAPPS + 'shortcut' && m.shortcutDetails) { return meta(m.shortcutDetails.targetId, opt).then(function (t) { p.id = t.id; return t; }); }
            return m;
        }).then(function (m) {
            if (m.mimeType === FOLDER) { kind = 'folder'; return walk(p.id, '', 0, st, opt); }
            if (m.mimeType.indexOf(GAPPS) === 0) {
                if (!/document$|spreadsheet$|presentation$|drawing$/.test(m.mimeType)) throw err('type', 'This type of Google file cannot be downloaded.');
                st.files.push({ id: m.id, path: safeName(m.name) + '.pdf', mime: 'application/pdf', size: 0, exp: true });
            } else st.files.push({ id: m.id, path: safeName(m.name), mime: m.mimeType || 'application/octet-stream', size: Number(m.size) || 0 });
        }).then(function () {
            if (!st.files.length) throw err('empty', 'This folder has no files to download.');
            if (st.files.length > MAX_FILES) { st.skipped = st.skipped.concat(st.files.slice(MAX_FILES).map(function (f) { return f.path + ' (limit)'; })); st.files = st.files.slice(0, MAX_FILES); }
            var total = st.files.reduce(function (a, f) { return a + f.size; }, 0);
            if (total > MAX_BYTES) throw err('big', 'This is too big for the app storage (' + Math.round(total / 1048576) + ' MB, max ' + Math.round(MAX_BYTES / 1048576) + ' MB).');
            var done = 0, next = 0, out = new Array(st.files.length), n = st.files.length;
            if (opt.onProgress) opt.onProgress(0, n, st.files[0].path);
            function worker() {
                if (next >= n) return Promise.resolve();
                var i = next++, f = st.files[i];
                return getBlob(f, opt).then(function (b) {
                    out[i] = { name: f.path, path: f.path, blob: b, mime: f.mime || b.type, size: b.size };
                    done++; if (opt.onProgress) opt.onProgress(done, n, f.path);
                }).then(worker);
            }
            var ws = []; for (var w = 0; w < Math.min(PAR, n); w++) ws.push(worker());
            return Promise.all(ws).then(function () { return { kind: kind, name: rootName, files: out, skipped: st.skipped }; });
        });
    }

    /* ---------- tiny ZIP writer (no compression: PDFs are already compressed) ---------- */
    var CRC = (function () { var t = new Uint32Array(256), c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    function crc32(u8) { var c = 0xFFFFFFFF, i; for (i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    function zip(files) {                                    // files: [{ name, blob }] -> Promise<Blob>
        var enc = new TextEncoder(), parts = [], central = [], offset = 0, d = new Date();
        var dt = ((d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate()) & 0xFFFF, tm = (d.getHours() << 11 | d.getMinutes() << 5 | (d.getSeconds() >> 1)) & 0xFFFF;
        return files.reduce(function (p, f) {
            return p.then(function () { return f.blob.arrayBuffer(); }).then(function (buf) {
                var u8 = new Uint8Array(buf), name = enc.encode(String(f.name || 'file').replace(/^\/+/, '')), crc = crc32(u8), sz = u8.length;
                var h = new DataView(new ArrayBuffer(30));
                h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
                h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
                parts.push(h.buffer, name, u8);
                var c = new DataView(new ArrayBuffer(46));
                c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true);
                c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, offset, true);
                central.push(c.buffer, name);
                offset += 30 + name.length + sz;
            });
        }, Promise.resolve()).then(function () {
            var csz = 0; central.forEach(function (x) { csz += x.byteLength; });
            var e = new DataView(new ArrayBuffer(22));
            e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, offset, true);
            return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
        });
    }

    window.nbDrive = { parse: parse, fetchAll: fetchAll, zip: zip, key: key };
})();
