        const firebaseConfig = {
            apiKey: "AIzaSyChG_jBGcieowmVVKHdwaiI1zvOwvvPag0",
            authDomain: "notes-market-d309b.firebaseapp.com",
            databaseURL: "https://notes-market-d309b-default-rtdb.firebaseio.com",
            projectId: "notes-market-d309b",
            storageBucket: "notes-market-d309b.firebasestorage.app",
            messagingSenderId: "661796727875",
            appId: "1:661796727875:web:f19697629ed298546138f6",
            measurementId: "G-9YM7BT3BM2"
        };
        const DBURL = firebaseConfig.databaseURL;

        // Firebase SDK is loaded LAZILY (only for admin / writes). Public browsing uses
        // plain REST fetch, so first paint no longer waits for the SDK download.
        let sdkPromise = null;
        function loadSdk() {
            if (!sdkPromise) {
                sdkPromise = (async () => {
                    const base = "https://www.gstatic.com/firebasejs/10.8.0/";
                    const [a, d, au] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-database.js"), import(base + "firebase-auth.js")]);
                    const app = a.initializeApp(firebaseConfig);
                    const auth = au.getAuth(app);
                    const { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } = au;
                    return { app, db: d.getDatabase(app), auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, ...d };
                })();
                sdkPromise.catch(() => { sdkPromise = null; });
            }
            return sdkPromise;
        }

        async function restGet(path, params) {
            const r = await fetch(DBURL + '/' + path + '.json' + (params || ''));
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }

        // JS-string argument that is safe inside an HTML attribute (onclick="fn(...)")
        function jsArg(v) { return esc(JSON.stringify(String(v == null ? '' : v))); }

        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        window.allItems = [];
        window.messages = [];
        let selectedFileBase64 = "";
        let selectedFileName = "";

        const PAGE_SIZE = 3;          // 3 items at a time, next 3 load automatically on scroll
        window.hasMore = false;
        window.oldestKey = null;
        window.loaded = false;
        window.loadError = false;
        window.loadFailed = false;
        let loadingMore = false;

        // beforeKey: only items older than this key. limit: how many (undefined = all)
        async function fetchItems(beforeKey, limit) {
            try {
                let p = '?orderBy=%22%24key%22';
                if (beforeKey) p += '&endAt=' + encodeURIComponent('"' + beforeKey + '"');
                if (limit) p += '&limitToLast=' + (limit + (beforeKey ? 1 : 0));
                const data = (await restGet('notes_bazar_data', p)) || {};
                if (beforeKey) delete data[beforeKey];
                return data;
            } catch (e) {
                const { db, ref, get, query, orderByKey, limitToLast, endBefore } = await loadSdk();
                const c = [orderByKey()];
                if (beforeKey) c.push(endBefore(beforeKey));
                if (limit) c.push(limitToLast(limit));
                const snap = await get(query(ref(db, 'notes_bazar_data'), ...c));
                return snap.exists() ? snap.val() : {};
            }
        }

        function mergeData(data) {
            let n = 0;
            Object.keys(data || {}).forEach(key => {
                if (!data[key] || typeof data[key] !== 'object') return;
                n++;
                if (!window.allItems.some(i => i.id === key)) window.allItems.push({ id: key, ...data[key] });
                if (window.oldestKey === null || key < window.oldestKey) window.oldestKey = key;
            });
            window.allItems.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0) || (y.id > x.id ? 1 : -1));
            return n;
        }

        function saveCache() {
            try {
                const light = window.allItems.slice(0, PAGE_SIZE).map(i => { const c = { ...i }; delete c.fileData; return c; });
                localStorage.setItem('nb_cache_v4', JSON.stringify({ items: light, hasMore: window.hasMore }));
            } catch (e) {}
        }

        // First load: newest 5 only
        window.loadCloudData = async function() {
            try {
                const data = await fetchItems(null, PAGE_SIZE);
                window.allItems = [];
                window.oldestKey = null;
                const n = mergeData(data);
                window.hasMore = n >= PAGE_SIZE;
                window.loadError = false;
                window.loaded = true;
                renderAllPages();
                renderNotifications();
                saveCache();
                if (homeStats === null) loadStats();
            } catch (error) {
                console.error("Error loading data: ", error);
                window.loaded = true;
                window.loadError = window.allItems.length === 0;
                renderAllPages();
            }
        };

        // Auto-called when the user scrolls near the end of the list: next older 5
        window.loadMoreItems = async function() {
            if (loadingMore || !window.hasMore) return;
            loadingMore = true;
            window.loadFailed = false;
            try {
                const data = await fetchItems(window.oldestKey, PAGE_SIZE);
                const n = mergeData(data);
                window.hasMore = n >= PAGE_SIZE;
            } catch (e) { console.error(e); window.loadFailed = true; }
            loadingMore = false;
            renderAllPages();
        };
        window.retryLoadMore = function() { window.loadFailed = false; window.loadMoreItems(); };

        // Needed for search/filters and admin: get everything that is left
        window.loadAllRemaining = async function() {
            if (!window.hasMore || loadingMore) return;
            loadingMore = true;
            try {
                const data = await fetchItems(window.oldestKey, null);
                mergeData(data);
                window.hasMore = false;
            } catch (e) { console.error(e); window.loadFailed = true; }
            loadingMore = false;
            renderAllPages();
        };

        // Fetch a file only when needed (Preview / Download)
        async function getFileData(item) {
            if (item.fileData) return item.fileData;
            if (!item.private) { try { const loc = await dlGetData(item.id); if (loc) { item.fileData = loc; return loc; } } catch (e) {} }   // already downloaded -> works offline
            if (item.private) {
                const { db, ref, get } = await loadSdk();
                const s = await get(ref(db, 'notes_bazar_private/files/' + item.id));
                if (s.exists()) { item.fileData = s.val(); return item.fileData; }
                return "";
            }
            let v = await restGet('notes_bazar_files/' + item.id);
            if (!v) v = await restGet('notes_bazar_data/' + item.id + '/fileData'); // old items
            if (v) { item.fileData = v; return v; }
            return "";
        }

        // One-time: move big files out of the list node so the list loads fast
        window.migrateOldFiles = async function() {
            const old = window.allItems.filter(i => i.fileData);
            if (old.length === 0) return;
            if (!confirm(old.length + " old file(s) are stored inside the list, which makes the site slow. Optimise them now? (This can take 1-2 minutes)")) return;
            const { db, ref, get, set, remove } = await loadSdk();
            let done = 0;
            for (const it of old) {
                try {
                    await set(ref(db, 'notes_bazar_files/' + it.id), it.fileData);
                    const check = await get(ref(db, 'notes_bazar_files/' + it.id));
                    if (check.exists()) {
                        await remove(ref(db, 'notes_bazar_data/' + it.id + '/fileData'));
                        await set(ref(db, 'notes_bazar_data/' + it.id + '/hasFile'), true);
                        done++;
                    }
                } catch (err) { console.error(err); alert("Error: Firebase Rules must allow writes to 'notes_bazar_files'."); break; }
            }
            alert(done + " file(s) optimised.");
            await window.loadCloudData();
        };

        // Only the admin needs messages, so this is no longer fetched for normal visitors
        async function loadMessages() {
            try {
                const { db, ref, get } = await loadSdk();
                const snap = await get(ref(db, 'notes_bazar_messages'));
                const data = snap.exists() ? snap.val() : null;
                window.messages = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            } catch (err) {
                console.error(err);
            }
        }

        window.renderAllPages = function() {
            renderHome();
            renderGrid('notesGrid', 'notesCount', 'note');
            renderGrid('booksGrid', 'booksCount', 'book');
            renderGrid('pyqGrid', 'pyqCount', 'pyq');
        };

        function renderGrid(gridId, countId, typeFilter) { window.filterItems(typeFilter); }

        function safeHttp(u) {
            try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; }
        }

        let notifItems = [];
        function renderNotifications() {
            const list = document.getElementById('notificationList');
            if (!list) return;
            const src = (notifItems.length ? notifItems : window.allItems).slice(0, 8);
            list.innerHTML = '';
            if (src.length === 0) {
                list.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">${esc(t('No recent notifications.'))}</p>`;
                return;
            }
            src.forEach(item => {
                const div = document.createElement('div');
                div.className = "p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700 text-xs flex items-start space-x-3";
                div.innerHTML = `
                    <div class="dynamic-bg text-white p-2 rounded-lg shrink-0"><i class="fa-solid fa-bell"></i></div>
                    <div>
                        <p class="font-bold text-slate-800 dark:text-slate-200">${esc(t('New upload'))} • ${esc((item.type || 'note').toUpperCase())}</p>
                        <p class="text-slate-500 dark:text-slate-400 mt-0.5">${esc(item.title)} (${esc(item.subject || '')})</p>
                    </div>
                `;
                list.appendChild(div);
            });
        }
        window.openNotifications = async function() {
            openModal('notificationModal');
            renderNotifications();
            try {
                const data = await fetchItems(null, 8);
                notifItems = Object.keys(data || {}).map(k => ({ id: k, ...data[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                renderNotifications();
            } catch (e) { console.warn(e); }
        };

        const VIEW_TITLES = {
            home: 'Notes Bazar – Class 1-12 Notes, Books & PYQ | Student Study Hub',
            notes: 'Class Notes – Notes Bazar',
            books: 'Reference Books – Notes Bazar',
            pyq: 'Previous Year Questions (PYQ) – Notes Bazar'
        };
        function showView(viewName, push) {
            if (!VIEW_TITLES[viewName]) viewName = 'home';
            ['homeView', 'notesView', 'booksView', 'pyqView'].forEach(id => {
                document.getElementById(id).classList.add('hidden');
            });
            const cap = viewName.charAt(0).toUpperCase() + viewName.slice(1);
            ['navHomeBtn', 'navNotesBtn', 'navBooksBtn', 'navPyqBtn'].forEach(id => {
                [id, id + 'M'].forEach(x => { const b = document.getElementById(x); if (b) b.classList.remove('nav-btn-active'); });
            });
            document.getElementById(viewName + 'View').classList.remove('hidden');
            ['nav' + cap + 'Btn', 'nav' + cap + 'BtnM'].forEach(x => { const b = document.getElementById(x); if (b) b.classList.add('nav-btn-active'); });
            document.title = VIEW_TITLES[viewName];
            const cur = location.hash.replace('#', '') || 'home';
            if (push && cur !== viewName) {
                try { history.pushState({ v: viewName }, '', viewName === 'home' ? location.pathname + location.search : '#' + viewName); } catch (e) {}
            }
            closeModal('mobileMenuModal');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        window.switchView = function(v) { showView(v, true); };
        window.addEventListener('popstate', () => showView(location.hash.replace('#', '') || 'home', false));

        let previewBlobUrl = '';
        window.openPreview = function(id) {
            const item = findAnyItem(id);
            if (!item) return;
            document.getElementById('previewTitle').textContent = item.title;
            document.getElementById('previewMeta').textContent = `${item.className || 'General'} • ${item.subject || 'General'}` + (getChapter(item) ? ` • ${t('Chapter')}: ${getChapter(item)}` : '');
            if (!item.private) { trackStat(id, 'v'); addRecent(id); markSeen(id); }
            const pr = document.getElementById('previewReportBtn'), pf = document.getElementById('previewFavBtn');
            if (pr) { pr.classList.toggle('hidden', !!item.private); pr.onclick = () => openReport(id); }
            if (pf) { pf.classList.toggle('hidden', !!item.private); pf.dataset.fav = id; paintFav(pf); pf.onclick = ev => toggleFav(ev, id); }
            document.getElementById('previewDesc').textContent = item.description || t('No description provided.');

            const container = document.getElementById('previewContentContainer');
            container.innerHTML = '';
            if (previewBlobUrl) { try { URL.revokeObjectURL(previewBlobUrl); } catch (e) {} previewBlobUrl = ''; }
            const note = (cls, txt) => `<p class="text-xs ${cls} text-center py-6">${esc(txt)}</p>`;

            if (item.fileLink) {
                const link = safeHttp(item.fileLink);
                container.innerHTML = link ? `
                    <div class="p-6 text-center bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <p class="text-xs text-slate-600 dark:text-slate-300 mb-3">${esc(t('This item is hosted via Google Drive link.'))}</p>
                        <a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="dynamic-btn text-white px-5 py-2.5 rounded-xl text-xs font-bold inline-block shadow">${esc(t('Open Google Drive Link'))}</a>
                    </div>` : note('text-red-500', t('This link is not valid.'));
            } else {
                container.innerHTML = note('text-slate-400', t('Loading file...'));
                getFileData(item).then(async data => {
                    if (!data) { container.innerHTML = note('text-slate-400', t('No direct file attached.')); return; }
                    const isPdf = /^data:application\/pdf/i.test(data);
                    let url = data;
                    try { const blob = await (await fetch(data)).blob(); previewBlobUrl = URL.createObjectURL(blob); url = previewBlobUrl; } catch (e) {}
                    const bar = `
                        <div class="flex gap-2 mb-3">
                            <button onclick="downloadItem(${jsArg(item.id)})" class="flex-1 dynamic-btn text-white py-2.5 rounded-xl text-xs font-bold shadow"><i class="fa-solid fa-download mr-1.5"></i>${esc(t('Download'))}</button>
                            <a href="${esc(url)}" target="_blank" rel="noopener" class="flex-1 text-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-xs font-bold">${esc(t('Open in new tab'))}</a>
                        </div>`;
                    container.innerHTML = bar + (isPdf ? `
                        <div class="w-full h-[55vh] min-h-[300px] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                            <iframe src="${esc(url)}" class="w-full h-full" title="Preview"></iframe>
                        </div>` : note('text-slate-500', t('Preview is not available for this file type. Please download it.')));
                }).catch(() => { container.innerHTML = note('text-red-500', t('Could not load the file.')); });
            }
            openModal('previewModal');
        };

        window.downloadItem = async function(id) {
            const item = findAnyItem(id);
            let data = "";
            try { data = item ? await getFileData(item) : ""; } catch (e) {}
            if (!item || !data) {
                alert("File data not available.");
                return;
            }
            if (!item.private) { trackStat(id, 'd'); markDownloaded(item); saveOffline(item, data); }
            const a = document.createElement('a');
            a.href = data;
            a.download = item.fileName || 'document.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };

        const TYPE_IDS = { note: 'notes', book: 'books', pyq: 'pyq' };
        function getChapter(item) {
            if (item.chapter) return item.chapter;
            const m = /^Chapter: (.+?) \u2022 /.exec(item.description || '');
            return m ? m[1] : '';
        }
        function getDesc(item) { return (item.description || '').replace(/^Chapter: .+? \u2022 /, ''); }
        function typeLabel(item) { const ty = item.type || 'note'; return ty === 'pyq' ? 'PYQ' : t(ty === 'book' ? 'Books' : 'Notes'); }
        function shortDate(ts) { try { return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }

        // Views / downloads counter (used for "Trending"). Best effort: needs the notes_bazar_stats rule.
        window.trackStat = function(id, kind) {
            try {
                const key = 'nb_stat_' + kind + id;
                if (sessionStorage.getItem(key)) return;
                sessionStorage.setItem(key, '1');
                if (homeStats) { const st = homeStats[id] = homeStats[id] || {}; st[kind] = (st[kind] || 0) + 1; setTimeout(paintStats, 0); }
                fetch(DBURL + '/notes_bazar_stats/' + id + '/' + kind + '.json', { method: 'PUT', body: JSON.stringify({ '.sv': { increment: 1 } }), keepalive: true }).catch(() => {});
            } catch (e) {}
        };

        function makeCard(item) {
            const card = document.createElement('div');
            card.className = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-md transition-all duration-300 flex flex-col justify-between hover-rgb-glow";
            card.innerHTML = `
                    <div>
                        <div class="flex justify-between items-start gap-2 mb-3">
                            <span class="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-lg">${esc(t(item.className || 'General'))}</span>
                            <span class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium px-2.5 py-1 rounded-lg">${esc(t(item.subject || 'General'))}</span>
                        </div>
                        <h3 class="font-bold text-slate-800 dark:text-slate-100 text-base mb-2">${esc(item.title)}</h3>
                        <div class="nb-marks" data-marks="${esc(item.id)}">${marksHtml(item.id)}</div>
                        ${getChapter(item) ? `<p class="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 mb-2"><i class="fa-solid fa-bookmark mr-1.5"></i>${esc(t('Chapter'))}: ${esc(getChapter(item))}</p>` : ''}
                        <p class="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mb-3 line-clamp-3">${esc(getDesc(item))}</p>
                        <div class="flex items-center gap-3 text-[10px] text-slate-400 mb-3 flex-wrap"><span><i class="fa-solid fa-layer-group mr-1"></i>${esc(typeLabel(item))}</span>${item.createdAt ? `<span><i class="fa-regular fa-calendar mr-1"></i>${esc(shortDate(item.createdAt))}</span>` : ''}<span class="nb-stat inline-flex items-center gap-2" data-id="${esc(item.id)}">${statHtml(item.id)}</span><span class="ml-auto inline-flex items-center gap-1.5">${item.private ? '' : `<button type="button" onclick="openReport(${jsArg(item.id)})" class="card-ico report-btn" title="Report broken file" aria-label="Report broken file"><i class="fa-solid fa-flag"></i></button><button type="button" data-fav="${item.id}" onclick="toggleFav(event,${jsArg(item.id)})" class="card-ico fav-btn" aria-pressed="${isFav(item.id)}" title="Save" aria-label="Save"><i class="${isFav(item.id) ? 'fa-solid' : 'fa-regular'} fa-heart"></i></button>`}</span></div>
                    </div>
                    <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <span class="text-xs text-slate-400 truncate max-w-[120px]"><i class="fa-solid fa-file-pdf text-red-500 mr-1"></i> ${esc(item.fileName || t('Document'))}</span>
                        <div class="flex items-center space-x-2">
                            <button onclick="openPreview(${jsArg(item.id)})" class="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold transition">${esc(t('Preview'))}</button>
                            ${item.fileLink ? (safeHttp(item.fileLink) ? `<a href="${esc(safeHttp(item.fileLink))}" onclick="trackStat(${jsArg(item.id)},'d');nbMarkDl(${jsArg(item.id)})" target="_blank" rel="noopener noreferrer" class="dynamic-btn text-white px-3 py-2 rounded-xl text-xs font-semibold inline-block shadow">${esc(t('Drive'))}</a>` : '') : `<button onclick="downloadItem(${jsArg(item.id)})" class="dynamic-btn text-white px-3 py-2 rounded-xl text-xs font-semibold shadow">${esc(t('Download'))}</button>`}
                        </div>
                    </div>
                `;
            return card;
        }

        function skeletonCards(n) {
            let h = '';
            for (let i = 0; i < n; i++) {
                h += `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow animate-pulse space-y-3">
                    <div class="flex justify-between"><div class="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-lg"></div><div class="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-lg"></div></div>
                    <div class="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    <div class="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
                    <div class="h-3 w-2/3 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    <div class="h-9 w-full bg-slate-100 dark:bg-slate-800 rounded-xl mt-4"></div></div>`;
            }
            return h;
        }

        // Invisible-ish marker at the bottom of the list: when it scrolls into view -> load next 5
        function makeSentinel() {
            const s = document.createElement('div');
            s.className = 'col-span-full text-center py-4 text-xs text-slate-400';
            if (window.loadFailed) {
                s.innerHTML = `<button onclick="retryLoadMore()" class="dynamic-btn text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow">${esc(t('Retry'))}</button>`;
                return s;
            }
            s.innerHTML = `<div class="inline-block bg-white/85 dark:bg-slate-900/85 rounded-2xl px-4 py-2 shadow-sm"><span class="ai-typing"><span></span><span></span><span></span></span><div class="mt-1">${esc(t('Loading more...'))}</div></div>`;
            if ('IntersectionObserver' in window) {
                const io = new IntersectionObserver(entries => {
                    if (entries[0].isIntersecting) { io.disconnect(); window.loadMoreItems(); }
                }, { rootMargin: '300px' });
                io.observe(s);
            } else {
                s.innerHTML = `<button onclick="loadMoreItems()" class="dynamic-btn text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow">${esc(t('Load more'))}</button>`;
            }
            return s;
        }

        window.filterItems = function(type) {
            const k = TYPE_IDS[type] || type;
            const grid = document.getElementById(k + 'Grid');
            if (!grid) return;
            const qEl = document.getElementById(k + 'SearchInput');
            const cEl = document.getElementById(k + 'ClassFilter');
            const sEl = document.getElementById(k + 'SubjectFilter');
            const query = qEl ? qEl.value.toLowerCase().trim() : '';
            const classVal = cEl ? cEl.value : '';
            const subjectVal = sEl ? sEl.value : '';
            const sortMode = (viewOpts[k] && viewOpts[k].sort) || 'latest';
            const savedOnly = !!(viewOpts[k] && viewOpts[k].saved);
            const filtering = !!(query || classVal || subjectVal || sortMode === 'popular' || savedOnly);

            // search/filter needs all items -> fetch the rest in background
            if (filtering && window.hasMore) window.loadAllRemaining();

            const filtered = window.allItems.filter(item => {
                if ((item.type || 'note') !== type) return false;
                const matchesQuery = !query || [item.title, item.subject, getChapter(item), item.description].some(f => (f || '').toLowerCase().includes(query));
                const matchesClass = classVal === "" || (item.className || '').toLowerCase() === classVal.toLowerCase();
                const matchesSubject = subjectVal === "" || (item.subject || '').toLowerCase() === subjectVal.toLowerCase();
                return matchesQuery && matchesClass && matchesSubject && (!savedOnly || isFav(item.id));
            });
            if (sortMode === 'popular' && homeStats) filtered.sort((a, b) => statScore(b.id) - statScore(a.id) || (b.createdAt || 0) - (a.createdAt || 0));

            const countSpan = document.getElementById(k + 'Count');
            if (countSpan) countSpan.textContent = filtered.length + (window.hasMore ? '+' : '');

            grid.innerHTML = '';
            if (!window.loaded && window.allItems.length === 0) { grid.innerHTML = skeletonCards(3); return; }
            if (window.loadError) {
                grid.innerHTML = `<div class="col-span-full py-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800"><p class="text-sm font-semibold mb-3">${esc(t('Could not load data. Check your internet.'))}</p><button onclick="loadCloudData()" class="dynamic-btn text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow">${esc(t('Retry'))}</button></div>`;
                return;
            }
            if (filtered.length === 0 && (!window.hasMore || filtering)) {
                grid.innerHTML = `<div class="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"><h3 class="font-bold text-slate-800 dark:text-slate-200 text-lg">${esc(window.hasMore ? t('Searching...') : t('Nothing found yet'))}</h3></div>`;
                return;
            }
            const frag = document.createDocumentFragment();
            filtered.forEach(item => frag.appendChild(makeCard(item)));
            if (window.hasMore && !filtering) frag.appendChild(makeSentinel());
            grid.appendChild(frag);
            saveFilters();
        };


        // ================= HOME: search, class tiles, latest, trending =================
        let homeType = 'all';
        let homeStats = null;
        const $h = id => document.getElementById(id);

        function pressGroup(sel, attr, val) {
            document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', b.getAttribute(attr) === val ? 'true' : 'false'));
        }
        window.homeSearch = function() {
            const input = $h('homeSearchInput');
            if (!input) return;
            const q = input.value.toLowerCase().trim();
            const cls = $h('homeClassFilter').value, sub = $h('homeSubjectFilter').value;
            pressGroup('#homeSubjectChips .chip', 'data-sub', sub);
            pressGroup('.class-tile', 'data-cls', cls);
            pressGroup('#homeTypeTabs .chip', 'data-type', homeType);
            const wrap = $h('homeResultsWrap');
            const filtering = !!(q || cls || sub);
            saveFilters();
            if (!filtering) { wrap.classList.add('hidden'); return; }
            if (window.hasMore) window.loadAllRemaining();
            wrap.classList.remove('hidden');
            const words = q.split(/\s+/).filter(Boolean);
            const list = window.allItems.filter(it => {
                if (homeType !== 'all' && (it.type || 'note') !== homeType) return false;
                if (cls && (it.className || '').toLowerCase() !== cls.toLowerCase()) return false;
                if (sub && (it.subject || '').toLowerCase() !== sub.toLowerCase()) return false;
                const hay = [it.title, it.subject, it.className, getChapter(it), it.description].join(' ').toLowerCase();
                return words.every(w => hay.includes(w));
            });
            $h('homeResultCount').textContent = list.length + (window.hasMore ? '+' : '') + ' ' + t('results found');
            const grid = $h('homeResults');
            grid.innerHTML = '';
            if (!list.length) {
                grid.innerHTML = window.hasMore
                    ? `<div class="col-span-full text-center py-10 text-xs text-slate-400">${esc(t('Loading more...'))}</div>`
                    : `<div class="col-span-full py-12 text-center bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700"><p class="font-bold text-sm text-slate-700 dark:text-slate-200">${esc(t('No results found. Try another subject or class.'))}</p></div>`;
                return;
            }
            const frag = document.createDocumentFragment();
            list.forEach(it => frag.appendChild(makeCard(it)));
            grid.appendChild(frag);
        };
        window.setHomeSubject = function(s) { $h('homeSubjectFilter').value = s; window.homeSearch(); };
        window.setHomeClass = function(c) {
            const sel = $h('homeClassFilter');
            sel.value = sel.value === c ? '' : c;
            window.homeSearch();
            if (sel.value) $h('homeSearchSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        window.setHomeType = function(ty) { homeType = ty; window.homeSearch(); };
        window.clearHomeSearch = function() {
            $h('homeSearchInput').value = ''; $h('homeClassFilter').value = ''; $h('homeSubjectFilter').value = ''; homeType = 'all';
            window.homeSearch();
        };

        function fillGrid(id, items) {
            const g = $h(id); if (!g) return;
            g.innerHTML = '';
            const frag = document.createDocumentFragment();
            items.forEach(it => frag.appendChild(makeCard(it)));
            g.appendChild(frag);
        }
        async function loadStats() {
            try { const s = await restGet('notes_bazar_stats'); homeStats = (s && typeof s === 'object') ? s : {}; }
            catch (e) { homeStats = {}; }
            if (Object.keys(homeStats).length && window.hasMore) window.loadAllRemaining();
            renderTrending();
            paintStats();
            ['note', 'book', 'pyq'].forEach(ty => { const o = viewOpts[TYPE_IDS[ty]]; if (o && o.sort === 'popular') window.filterItems(ty); });
        }
        function renderTrending() {
            const sec = $h('homeTrendingSection'); if (!sec) return;
            if (!homeStats) { sec.classList.add('hidden'); return; }
            const top = window.allItems
                .map(it => { const s = homeStats[it.id] || {}; return { it, sc: (s.d || 0) * 3 + (s.v || 0) }; })
                .filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 6).map(x => x.it);
            sec.classList.toggle('hidden', !top.length);
            if (top.length) fillGrid('homeTrending', top);
        }
        function renderHome() {
            const latest = $h('homeLatest'); if (!latest) return;
            const sec = $h('homeLatestSection');
            if (!window.loaded && !window.allItems.length) { latest.innerHTML = skeletonCards(3); }
            else if (!window.allItems.length) { sec.classList.add('hidden'); }
            else { sec.classList.remove('hidden'); fillGrid('homeLatest', window.allItems.slice(0, 6)); }
            if (window.loaded && window.hasMore && window.allItems.length < 6) window.loadMoreItems();
            renderTrending();
            renderMine();
            window.homeSearch();
        }


        // =====================================================================
        //  NEW: Favourites, Recently viewed, Counts, Popular sort, Suggestions,
        //       remembered filters, Report broken file
        // =====================================================================
        const LS = {
            get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
            set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
        };
        let favIds = LS.get('nb_favs', []);
        let recentIds = LS.get('nb_recent', []);
        const viewOpts = { notes: { sort: 'latest', saved: false }, books: { sort: 'latest', saved: false }, pyq: { sort: 'latest', saved: false } };
        let filtersReady = false, mineTried = false;
        const isFav = id => favIds.indexOf(id) >= 0;
        const statScore = id => { const x = (homeStats && homeStats[id]) || {}; return (x.d || 0) * 3 + (x.v || 0); };
        const fmtN = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k' : String(n);
        function statHtml(id) {
            const x = homeStats && homeStats[id];
            if (!x || (!x.v && !x.d)) return '';
            return `<span title="Views"><i class="fa-regular fa-eye mr-1"></i>${fmtN(x.v || 0)}</span><span title="Downloads"><i class="fa-solid fa-download mr-1"></i>${fmtN(x.d || 0)}</span>`;
        }
        function paintStats() { document.querySelectorAll('.nb-stat').forEach(el => { el.innerHTML = statHtml(el.dataset.id); }); }
        const toast = (m, ms) => { if (window.nbToast) window.nbToast(m, ms); };

        // ---- "Viewed" / "Downloaded" marks + download history (synced to the account by extras.js) ----
        const seenMap = () => LS.get('nb_seen', {});
        const dlHist = () => LS.get('nb_dlhist', {});
        function marksHtml(id) {
            const d = dlHist()[id], v = seenMap()[id];
            return (d ? '<span class="nb-mk dl" title="You downloaded this"><i class="fa-solid fa-circle-check"></i>Downloaded</span>' : '') +
                   (v ? '<span class="nb-mk seen" title="You viewed this"><i class="fa-solid fa-eye"></i>Viewed</span>' : '');
        }
        function paintMarks() { document.querySelectorAll('[data-marks]').forEach(el => { el.innerHTML = marksHtml(el.dataset.marks); }); }
        function markSeen(id) { const m = seenMap(); if (!m[id]) { m[id] = Date.now(); LS.set('nb_seen', m); } paintMarks(); }
        function markDownloaded(item) {
            const m = dlHist();
            m[item.id] = { ts: Date.now(), title: item.title || 'Document', className: item.className || '', subject: item.subject || '', type: item.type || 'note' };
            LS.set('nb_dlhist', m); paintMarks();
            if (typeof renderDlModal === 'function') { try { renderDlModal(); } catch (e) {} }
        }
        window.nbMarkDl = function(id) { const it = findAnyItem(id); if (it) markDownloaded(it); };
        // called by extras.js after the account data (favourites, history...) was loaded from the cloud
        window.nbApplyRemote = function() {
            favIds = LS.get('nb_favs', []); recentIds = LS.get('nb_recent', []);
            paintMarks(); renderMine();
            try { dlRefresh(); } catch (e) {}
            ['note', 'book', 'pyq'].forEach(ty => window.filterItems(ty));
        };
        window.nbRedownload = async function(id) {
            toast('Fetching the file...', 1800);
            try { if (!findAnyItem(id) && window.hasMore) await window.loadAllRemaining(); } catch (e) {}
            if (!findAnyItem(id)) { toast('This item is no longer available.', 3000); return; }
            window.downloadItem(id);
        };
        function renderDlHist() {
            const box = document.getElementById('dlHist'); if (!box) return;
            const q = ((document.getElementById('dlSearch') || {}).value || '').toLowerCase().trim();
            const have = new Set(dlItems.map(x => x.id)), h = dlHist();
            const ids = Object.keys(h).filter(id => !have.has(id) && (!q || [h[id].title, h[id].subject, h[id].className].join(' ').toLowerCase().includes(q)))
                .sort((a, b) => (h[b].ts || 0) - (h[a].ts || 0)).slice(0, 40);
            box.innerHTML = ids.length ? '<div class="nb-hist-h">Download history (not stored on this device)</div>' + ids.map(id => {
                const r = h[id], meta = [r.className, r.subject, 'Downloaded ' + shortDate(r.ts)].filter(Boolean).join(' \u2022 ');
                return `<div class="dl-row"><div class="dl-ic"><i class="fa-solid fa-clock-rotate-left"></i></div>
                    <div class="min-w-0 flex-1"><div class="dl-t" title="${esc(r.title)}">${esc(r.title)}</div><div class="dl-m">${esc(meta)}</div></div>
                    <div class="flex items-center gap-1.5 shrink-0"><button type="button" class="dl-b go" onclick="nbRedownload(${jsArg(id)})" title="Download again" aria-label="Download again"><i class="fa-solid fa-download"></i></button></div></div>`;
            }).join('') : '';
        }

        function paintFav(b) {
            if (!b) return;
            const on = isFav(b.dataset.fav);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            const ic = b.firstElementChild; if (ic) ic.className = (on ? 'fa-solid' : 'fa-regular') + ' fa-heart';
        }
        function updateFavBadge() {
            const b = document.getElementById('favBadge'); if (!b) return;
            b.textContent = favIds.length > 99 ? '99+' : favIds.length;
            b.classList.toggle('hidden', !favIds.length);
        }
        window.toggleFav = function(ev, id) {
            if (ev) { ev.stopPropagation(); ev.preventDefault(); }
            const i = favIds.indexOf(id);
            if (i >= 0) favIds.splice(i, 1); else favIds.unshift(id);
            LS.set('nb_favs', favIds);
            document.querySelectorAll('[data-fav="' + id + '"]').forEach(paintFav);
            toast(i >= 0 ? 'Removed from Saved' : 'Added to Saved ❤️');
            updateFavBadge(); renderMine();
            ['note', 'book', 'pyq'].forEach(ty => { const o = viewOpts[TYPE_IDS[ty]]; if (o && o.saved) window.filterItems(ty); });
        };
        function addRecent(id) {
            recentIds = [id].concat(recentIds.filter(x => x !== id)).slice(0, 12);
            LS.set('nb_recent', recentIds);
            setTimeout(renderMine, 50);
        }
        function renderMine() {
            const byId = id => window.allItems.find(i => i.id === id);
            if (!mineTried && window.hasMore && favIds.concat(recentIds).some(id => !byId(id))) { mineTried = true; window.loadAllRemaining(); }
            if (window.loaded && !window.hasMore && !window.loadError && window.allItems.length) {   // deleted items: clean up
                const keepF = favIds.filter(byId), keepR = recentIds.filter(byId);
                if (keepF.length !== favIds.length) { favIds = keepF; LS.set('nb_favs', favIds); }
                if (keepR.length !== recentIds.length) { recentIds = keepR; LS.set('nb_recent', recentIds); }
            }
            const rec = recentIds.map(byId).filter(Boolean).slice(0, 6);
            const fav = favIds.map(byId).filter(Boolean);
            const rs = $h('homeRecentSection'), fs = $h('homeFavSection');
            if (rs) { rs.classList.toggle('hidden', !rec.length); if (rec.length) fillGrid('homeRecent', rec); }
            if (fs) { fs.classList.toggle('hidden', !fav.length); if (fav.length) { fillGrid('homeFav', fav); const c = $h('homeFavCount'); if (c) c.textContent = fav.length; } }
            updateFavBadge();
        }
        window.clearRecent = function() { recentIds = []; LS.set('nb_recent', recentIds); renderMine(); };
        window.openSaved = function() {
            showView('home', true);
            setTimeout(() => {
                const fs = $h('homeFavSection');
                if (fs && !fs.classList.contains('hidden')) fs.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else toast('Nothing saved yet. Tap the ❤️ on any card.');
            }, 120);
        };

        // ---- Sort / saved-only chips inside the Notes / Books / PYQ filter bars ----
        window.setViewOpt = function(k, key, val) {
            const o = viewOpts[k]; if (!o) return;
            o[key] = key === 'saved' ? !o.saved : val;
            paintViewOpts(k);
            const ty = Object.keys(TYPE_IDS).find(x => TYPE_IDS[x] === k);
            if (o.sort === 'popular' && homeStats === null) loadStats();
            window.filterItems(ty);
        };
        function paintViewOpts(k) {
            const o = viewOpts[k], box = document.getElementById(k + 'Opts'); if (!box) return;
            box.querySelectorAll('[data-sort]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === o.sort)));
            const sv = box.querySelector('[data-saved]'); if (sv) sv.setAttribute('aria-pressed', String(!!o.saved));
        }
        function mountViewOpts() {
            Object.keys(viewOpts).forEach(k => {
                const inp = document.getElementById(k + 'SearchInput'); if (!inp) return;
                const bar = inp.closest('.grid'); if (!bar || document.getElementById(k + 'Opts')) return;
                const d = document.createElement('div');
                d.id = k + 'Opts'; d.className = 'col-span-full flex flex-wrap items-center gap-2';
                d.innerHTML = `<span class="text-[11px] font-semibold text-slate-400 mr-1">Sort:</span>
                    <button type="button" class="chip" data-sort="latest" aria-pressed="true" onclick="setViewOpt('${k}','sort','latest')"><i class="fa-regular fa-clock mr-1"></i>Latest</button>
                    <button type="button" class="chip" data-sort="popular" aria-pressed="false" onclick="setViewOpt('${k}','sort','popular')"><i class="fa-solid fa-fire mr-1"></i>Popular</button>
                    <span class="mx-1 text-slate-300">|</span>
                    <button type="button" class="chip" data-saved="1" aria-pressed="false" onclick="setViewOpt('${k}','saved')"><i class="fa-solid fa-heart mr-1"></i>Saved only</button>`;
                bar.appendChild(d);
            });
        }

        // ---- Remember filters (class / subject / type / sort) ----
        const FKEY = 'nb_filters_v1';
        function saveFilters() {
            if (!filtersReady) return;
            const f = { home: { cls: ($h('homeClassFilter') || {}).value || '', sub: ($h('homeSubjectFilter') || {}).value || '', type: homeType } };
            Object.keys(viewOpts).forEach(k => {
                f[k] = { cls: ($h(k + 'ClassFilter') || {}).value || '', sub: ($h(k + 'SubjectFilter') || {}).value || '', sort: viewOpts[k].sort, saved: viewOpts[k].saved };
            });
            LS.set(FKEY, f);
        }
        function restoreFilters() {
            const f = LS.get(FKEY, null);
            if (f) {
                const setv = (id, v) => { const el = $h(id); if (el && v != null) el.value = v; };
                if (f.home) { setv('homeClassFilter', f.home.cls); setv('homeSubjectFilter', f.home.sub); if (['all', 'note', 'book', 'pyq'].includes(f.home.type)) homeType = f.home.type; }
                Object.keys(viewOpts).forEach(k => {
                    const o = f[k]; if (!o) return;
                    setv(k + 'ClassFilter', o.cls); setv(k + 'SubjectFilter', o.sub);
                    viewOpts[k].sort = o.sort === 'popular' ? 'popular' : 'latest'; viewOpts[k].saved = !!o.saved;
                });
            }
            Object.keys(viewOpts).forEach(paintViewOpts);
            filtersReady = true;
        }

        // ---- Search suggestions (+ recent searches) ----
        const QKEY = 'nb_recent_q';
        let sgPool = { n: -1, list: [] };
        function sgList() {
            if (sgPool.n === window.allItems.length) return sgPool.list;
            const seen = new Set(), out = [];
            window.allItems.forEach(it => [it.title, getChapter(it), it.subject].forEach(x => {
                x = (x || '').trim(); const key = x.toLowerCase();
                if (x && x.length <= 90 && !seen.has(key)) { seen.add(key); out.push(x); }
            }));
            sgPool = { n: window.allItems.length, list: out };
            return out;
        }
        function saveQuery(q) {
            q = (q || '').trim(); if (q.length < 2) return;
            const l = LS.get(QKEY, []).filter(x => x.toLowerCase() !== q.toLowerCase()); l.unshift(q);
            LS.set(QKEY, l.slice(0, 6));
        }
        function hi(text, q) {
            const i = text.toLowerCase().indexOf(q); if (i < 0 || !q) return esc(text);
            return esc(text.slice(0, i)) + '<b>' + esc(text.slice(i, i + q.length)) + '</b>' + esc(text.slice(i + q.length));
        }
        function attachSuggest(id) {
            const inp = $h(id); if (!inp) return;
            inp.setAttribute('autocomplete', 'off'); inp.setAttribute('enterkeyhint', 'search');
            const wrap = inp.parentElement; wrap.style.position = 'relative';
            const box = document.createElement('div'); box.className = 'nb-suggest hidden'; box.setAttribute('role', 'listbox'); wrap.appendChild(box);
            let items = [], act = -1;
            const hide = () => { box.classList.add('hidden'); act = -1; };
            const pick = v => { inp.value = v; saveQuery(v); hide(); inp.dispatchEvent(new Event('input', { bubbles: true })); };
            const paint = () => box.querySelectorAll('.sg-i').forEach((b, i) => b.classList.toggle('act', i === act));
            function show() {
                const q = inp.value.toLowerCase().trim();
                let html = '';
                if (!q) {
                    items = LS.get(QKEY, []);
                    if (!items.length) { hide(); return; }
                    html = '<div class="sg-h"><span>Recent searches</span><span class="sg-clear" style="cursor:pointer;color:#f43f5e">Clear</span></div>' +
                        items.map((x, i) => `<button type="button" class="sg-i" data-i="${i}"><i class="fa-solid fa-clock-rotate-left"></i><span>${esc(x)}</span></button>`).join('');
                } else {
                    items = sgList().map(x => { const l = x.toLowerCase(), p = l.indexOf(q); return p < 0 ? null : { x, r: p === 0 ? 0 : (l[p - 1] === ' ' ? 1 : 2), len: x.length }; })
                        .filter(Boolean).sort((a, b) => a.r - b.r || a.len - b.len).slice(0, 6).map(o => o.x);
                    if (!items.length) { hide(); return; }
                    html = items.map((x, i) => `<button type="button" class="sg-i" data-i="${i}"><i class="fa-solid fa-magnifying-glass"></i><span class="min-w-0 truncate">${hi(x, q)}</span></button>`).join('');
                }
                box.innerHTML = html; act = -1; box.classList.remove('hidden');
            }
            inp.addEventListener('focus', show);
            inp.addEventListener('input', show);
            inp.addEventListener('change', () => saveQuery(inp.value));
            inp.addEventListener('blur', () => setTimeout(hide, 160));
            inp.addEventListener('keydown', e => {
                if (e.key === 'Escape') { hide(); return; }
                if (e.key === 'Enter') { if (act >= 0 && items[act]) { e.preventDefault(); pick(items[act]); } else { saveQuery(inp.value); hide(); } return; }
                if (box.classList.contains('hidden') || !items.length) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); act = (act + 1) % items.length; paint(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); act = (act - 1 + items.length) % items.length; paint(); }
            });
            box.addEventListener('pointerdown', e => {
                e.preventDefault();
                if (e.target.closest('.sg-clear')) { LS.set(QKEY, []); hide(); return; }
                const b = e.target.closest('.sg-i'); if (b) pick(items[+b.dataset.i]);
            });
        }

        // ---- Report broken file ----
        let reportId = '';
        window.openReport = function(id) {
            const it = findAnyItem(id); if (!it) return;
            const done = LS.get('nb_reported', {});
            if (done[id] && Date.now() - done[id] < 864e5) { toast('This file has already been reported. Thank you! 🙏'); return; }
            reportId = id;
            $h('reportItemTitle').textContent = it.title;
            $h('reportNote').value = ''; $h('reportReason').selectedIndex = 0;
            openModal('reportModal');
        };
        window.submitReport = async function(e) {
            e.preventDefault();
            const it = findAnyItem(reportId); if (!it) { closeModal('reportModal'); return; }
            const last = LS.get('nb_report_last', 0);
            if (Date.now() - last < 15000) { toast('Please wait a moment before sending another report.'); return; }
            const btn = $h('reportSendBtn'); btn.disabled = true;
            const reason = $h('reportReason').value, note = $h('reportNote').value.trim().slice(0, 300);
            try {
                await pushMessage({ type: 'complain', name: 'Broken file report', email: '-', message: `[BROKEN FILE] ${it.title} | ${it.className || '-'} | ${it.subject || '-'} | id: ${it.id}\nProblem: ${reason}${note ? '\nNote: ' + note : ''}` });
                const done = LS.get('nb_reported', {}); done[reportId] = Date.now(); LS.set('nb_reported', done); LS.set('nb_report_last', Date.now());
                closeModal('reportModal'); toast('Report sent. We will fix it soon ✅', 3500);
            } catch (err) { console.error(err); toast('Could not send the report. Check your internet connection.'); }
            finally { btn.disabled = false; }
        };


        // =====================================================================
        //  My Downloads: files saved on the user's device (IndexedDB) -> open offline
        //  (localStorage is only ~5 MB, a PDF can be bigger, so IndexedDB is used)
        // =====================================================================
        let dlItems = [];
        function dlDb() {
            return new Promise((res, rej) => {
                if (!window.indexedDB) { rej(new Error('no-idb')); return; }
                const r = indexedDB.open('nb_downloads', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
        }
        async function dlTx(mode, fn) {
            const db = await dlDb();
            return new Promise((res, rej) => {
                const tx = db.transaction('files', mode), rq = fn(tx.objectStore('files'));
                tx.oncomplete = () => { res(rq && rq.result); db.close(); };
                tx.onerror = tx.onabort = () => { rej(tx.error); db.close(); };
            });
        }
        function blobToDataUrl(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); }
        async function dlGetData(id) { const rec = await dlTx('readonly', st => st.get(id)); return rec && rec.blob ? blobToDataUrl(rec.blob) : ''; }

        async function saveOffline(item, data) {
            if (!item || item.private || !data) return;
            try {
                const blob = dataUrlToBlob(data);
                const rec = { id: item.id, title: item.title || 'Document', className: item.className || '', subject: item.subject || '', type: item.type || 'note', chapter: getChapter(item), description: getDesc(item), fileName: item.fileName || 'document.pdf', mime: blob.type, size: blob.size, createdAt: item.createdAt || 0, savedAt: Date.now(), blob };
                const had = dlItems.some(x => x.id === item.id);
                await dlTx('readwrite', st => st.put(rec));
                try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
                await dlRefresh();
                toast(had ? 'Download updated ✅' : 'Saved to Downloads. It will open offline too ✅', 3000);
            } catch (e) {
                console.warn('offline save failed', e);
                toast(/quota/i.test(String(e && (e.name || e.message))) ? 'Not enough storage on this device, so it was not saved offline.' : 'Could not save offline (the file was still downloaded).', 3200);
            }
        }
        async function dlRefresh() {
            try { dlItems = (await dlTx('readonly', st => st.getAll())) || []; } catch (e) { dlItems = []; }
            dlItems.sort((a, b) => b.savedAt - a.savedAt);
            const bd = document.getElementById('dlBadge');
            if (bd) { bd.textContent = dlItems.length > 99 ? '99+' : dlItems.length; bd.classList.toggle('hidden', !dlItems.length); }
            const md = document.getElementById('nbmDl'); if (md) md.textContent = dlItems.length || '';
            const sec = document.getElementById('homeDlSection');
            if (sec) {
                sec.classList.toggle('hidden', !dlItems.length);
                document.getElementById('homeDlCount').textContent = dlItems.length;
                document.getElementById('homeDl').innerHTML = dlItems.slice(0, 4).map(dlRow).join('');
            }
            renderDlModal();
        }
        function dlRow(r) {
            const meta = [r.className, r.subject, fmtSize(r.size), 'Saved ' + shortDate(r.savedAt)].filter(Boolean).join(' \u2022 ');
            return `<div class="dl-row"><div class="dl-ic"><i class="fa-solid fa-file-pdf"></i></div>
                <div class="min-w-0 flex-1"><div class="dl-t" title="${esc(r.title)}">${esc(r.title)}</div><div class="dl-m">${esc(meta)}</div></div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" class="dl-b go" onclick="dlOpen(${jsArg(r.id)})" title="Open" aria-label="Open"><i class="fa-solid fa-eye"></i></button>
                    <button type="button" class="dl-b" onclick="dlSave(${jsArg(r.id)})" title="Save to device" aria-label="Save to device"><i class="fa-solid fa-download"></i></button>
                    <button type="button" class="dl-b del" onclick="dlDelete(${jsArg(r.id)})" title="Remove" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>
                </div></div>`;
        }
        window.renderDlModal = function() {
            const box = document.getElementById('dlList'); if (!box) return;
            const q = ((document.getElementById('dlSearch') || {}).value || '').toLowerCase().trim();
            const list = q ? dlItems.filter(r => [r.title, r.subject, r.className, r.chapter].join(' ').toLowerCase().includes(q)) : dlItems;
            const total = dlItems.reduce((a, r) => a + (r.size || 0), 0);
            const sm = document.getElementById('dlSummary'); if (sm) sm.textContent = dlItems.length ? dlItems.length + ' files \u2022 ' + (fmtSize(total) || '0 KB') + ' \u2022 offline available' : 'Offline library';
            const ca = document.getElementById('dlClearAll'); if (ca) ca.classList.toggle('hidden', !dlItems.length);
            renderDlHist();
            box.innerHTML = list.length ? list.map(dlRow).join('') : `<div class="text-center py-14 text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700"><i class="fa-solid fa-circle-down text-3xl text-slate-300 mb-3 block"></i>${dlItems.length ? 'No matches found.' : 'Nothing downloaded yet.<br>Tap <b>Download</b> on any note and it will be saved here.'}</div>`;
        };
        window.openDownloads = async function() { await dlRefresh(); openModal('downloadsModal'); };
        window.dlOpen = async function(id) {
            try {
                const rec = await dlTx('readonly', st => st.get(id));
                if (!rec) { toast('File not found.'); return; }
                markSeen(id);
                if (previewBlobUrl) { try { URL.revokeObjectURL(previewBlobUrl); } catch (e) {} }
                previewBlobUrl = URL.createObjectURL(rec.blob);
                document.getElementById('previewTitle').textContent = rec.title;
                document.getElementById('previewMeta').textContent = [rec.className || 'General', rec.subject || 'General'].join(' \u2022 ') + (rec.chapter ? ' \u2022 Chapter: ' + rec.chapter : '');
                document.getElementById('previewDesc').textContent = rec.description || '';
                ['previewReportBtn', 'previewFavBtn'].forEach(x => { const b = document.getElementById(x); if (b) b.classList.add('hidden'); });
                const isPdf = /pdf/i.test(rec.mime || '');
                document.getElementById('previewContentContainer').innerHTML = `
                    <div class="flex gap-2 mb-3">
                        <a href="${previewBlobUrl}" download="${esc(rec.fileName)}" class="flex-1 text-center dynamic-btn text-white py-2.5 rounded-xl text-xs font-bold shadow"><i class="fa-solid fa-download mr-1.5"></i>Save to device</a>
                        <a href="${previewBlobUrl}" target="_blank" rel="noopener" class="flex-1 text-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-xs font-bold">Open in new tab</a>
                    </div>` + (isPdf ? `<div class="w-full h-[55vh] min-h-[300px] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700"><iframe src="${previewBlobUrl}" class="w-full h-full" title="Preview"></iframe></div>` : `<p class="text-xs text-slate-500 text-center py-6">Preview is not available for this file. Save it to your device to open it.</p>`);
                openModal('previewModal');
            } catch (e) { console.warn(e); toast('Could not open the file.'); }
        };
        window.dlSave = async function(id) {
            try {
                const rec = await dlTx('readonly', st => st.get(id)); if (!rec) return;
                const u = URL.createObjectURL(rec.blob), a = document.createElement('a');
                a.href = u; a.download = rec.fileName || 'document.pdf'; document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(u), 4000);
            } catch (e) { toast('Could not save the file.'); }
        };
        window.dlDelete = async function(id) {
            if (!confirm('Remove this file from Downloads? (You can download it again when online.)')) return;
            try { await dlTx('readwrite', st => st.delete(id)); await dlRefresh(); toast('Removed.'); } catch (e) { toast('Could not remove it.'); }
        };
        window.dlDeleteAll = async function() {
            if (!dlItems.length || !confirm('Remove all downloaded files?')) return;
            try { await dlTx('readwrite', st => st.clear()); await dlRefresh(); toast('All removed.'); } catch (e) { toast('Could not remove it.'); }
        };

        window.switchUploadType = function(type) {
            const fileSection = document.getElementById('fileUploadSection');
            const linkSection = document.getElementById('linkUploadSection');
            const btnFile = document.getElementById('tabFileBtn');
            const btnLink = document.getElementById('tabLinkBtn');

            if (type === 'file') {
                fileSection.classList.remove('hidden');
                linkSection.classList.add('hidden');
                btnFile.className = "flex-1 py-2 text-xs font-bold rounded-lg dynamic-btn text-white shadow";
                btnLink.className = "flex-1 py-2 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300";
            } else {
                fileSection.classList.add('hidden');
                linkSection.classList.remove('hidden');
                btnLink.className = "flex-1 py-2 text-xs font-bold rounded-lg dynamic-btn text-white shadow";
                btnFile.className = "flex-1 py-2 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300";
            }
        };

        window.handleClassChange = function() {
            const select = document.getElementById('uploadClass');
            const customDiv = document.getElementById('customClassDiv');
            if (select.value === 'Other') customDiv.classList.remove('hidden');
            else customDiv.classList.add('hidden');
        };

        window.handleSubjectChange = function() {
            const select = document.getElementById('uploadSubject');
            const customDiv = document.getElementById('customSubjectDiv');
            if (select.value === 'Other') customDiv.classList.remove('hidden');
            else customDiv.classList.add('hidden');
        };

        // Theme / dark mode
        const ACCENTS = {
            default: ['#6366f1', '#7c3aed'],
            blue: ['#2563eb', '#1d4ed8'],
            emerald: ['#059669', '#10b981'],
            sunset: ['#ea580c', '#f97316']
        };
        function saveAccent(p, s) {
            const root = document.documentElement;
            root.style.setProperty('--theme-primary', p);
            root.style.setProperty('--theme-secondary', s);
            try { localStorage.setItem('nb_theme', JSON.stringify({ p, s })); } catch (e) {}
        }
        function updateModeButtons() {
            const on = document.documentElement.classList.contains('dark');
            const l = document.getElementById('modeLightBtn'), d = document.getElementById('modeDarkBtn');
            ['ring-2', 'ring-indigo-500'].forEach(c => { if (l) l.classList.toggle(c, !on); if (d) d.classList.toggle(c, on); });
        }
        window.setMode = function(mode) {
            const on = mode === 'dark';
            document.documentElement.classList.toggle('dark', on);
            try { localStorage.setItem('nb_dark', on ? '1' : '0'); } catch (e) {}
            updateModeButtons();
        };
        window.setTheme = function(themeName) {
            if (themeName === 'dark') { window.setMode('dark'); return; }
            const a = ACCENTS[themeName] || ACCENTS.default;
            saveAccent(a[0], a[1]);
            closeModal('themeModal');
        };
        const BG_PRESETS = {
            night: '#0f172a', navy: '#172554', forest: '#052e16', wine: '#4c0519',
            sunrise: 'linear-gradient(135deg,#fde68a,#fca5a5,#c4b5fd)',
            ocean: 'linear-gradient(135deg,#0ea5e9,#6366f1,#8b5cf6)',
            mint: 'linear-gradient(135deg,#a7f3d0,#bae6fd)',
            dusk: 'linear-gradient(160deg,#1e1b4b,#7c3aed 60%,#ec4899)'
        };
        function applyBgValue(v) {
            const h = document.documentElement;
            if (v) { h.style.setProperty('--custom-bg', v); h.classList.add('custom-bg'); }
            else { h.style.removeProperty('--custom-bg'); h.classList.remove('custom-bg'); }
        }
        function setBg(v) {
            applyBgValue(v);
            try { localStorage.setItem('nb_bg', JSON.stringify({ v })); }
            catch (e) { alert('This photo could not be saved (it is too large). Try a smaller one. For now it will only show in this session.'); }
        }
        window.setBgPreset = function(key) { setBg(BG_PRESETS[key]); };
        window.applyBgColor = function() { setBg(document.getElementById('customBgColor').value); };
        window.resetBg = function() { applyBgValue(null); try { localStorage.removeItem('nb_bg'); } catch (e) {} };
        window.handleBgImage = function(e) {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            if (!f.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
            const reader = new FileReader();
            reader.onload = ev => {
                const img = new Image();
                img.onload = () => {   // shrink so it fits in browser storage and loads fast
                    const sc = Math.min(1, 1280 / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    setBg('url("' + c.toDataURL('image/jpeg', 0.72) + '")');
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(f);
            e.target.value = '';
        };
        window.applyCustomTheme = function() {
            saveAccent(document.getElementById('customPrimaryColor').value, document.getElementById('customSecondaryColor').value);
            closeModal('themeModal');
        };

// ---------- Language (English / Hindi / Maithili) ----------
        const LANGS = { en: 'English', hi: 'हिन्दी', mai: 'मैथिली', bho: 'भोजपुरी', bn: 'বাংলা', ur: 'اردو', mr: 'मराठी', gu: 'ગુજરાતી' };
        const LANG_EN = { en: 'English', hi: 'Hindi', mai: 'Maithili', bho: 'Bhojpuri', bn: 'Bengali', ur: 'Urdu', mr: 'Marathi', gu: 'Gujarati' };
        const LANG_SHORT = { en: 'EN', hi: 'हिं', mai: 'मै', bho: 'भो', bn: 'বাং', ur: 'اردو', mr: 'मर', gu: 'ગુ' };
        const LANG_IDX = { hi: 0, mai: 1, bho: 2, bn: 3, ur: 4, mr: 5, gu: 6 };
        const TR = {
            "Student Marketplace": ["स्टूडेंट मार्केटप्लेस", "स्टूडेंट मार्केटप्लेस"],
            "Home": ["होम", "होम"],
            "Notes": ["नोट्स", "नोट्स"],
            "Books": ["किताबें", "किताब"],
            "Welcome to Notes Bazar 🌟": ["Notes Bazar में आपका स्वागत है 🌟", "Notes Bazar मे अहाँक स्वागत अछि 🌟"],
            "Your Ultimate Student Study Hub": ["आपका अपना स्टूडेंट स्टडी हब", "अहाँक अपन स्टूडेंट स्टडी हब"],
            "Discover verified class notes, reference books, previous year questions (PYQs), and get instant AI-powered study & support!": ["सत्यापित क्लास नोट्स, रेफरेंस बुक्स और पिछले वर्षों के प्रश्न-पत्र (PYQ) पाएं, और तुरंत AI से पढ़ाई व सहायता लें!", "जाँचल क्लास नोट्स, रेफरेंस बुक्स आ पिछला सालक प्रश्न-पत्र (PYQ) पाउ, आ तुरंत AI सँ पढ़ाई आ सहायता लिअ!"],
            "Explore Notes": ["नोट्स देखें", "नोट्स देखू"],
            "View PYQs": ["PYQ देखें", "PYQ देखू"],
            "Quick Options": ["त्वरित विकल्प", "तुरंत विकल्प"],
            "Class notes & study PDFs": ["क्लास नोट्स और स्टडी PDF", "क्लास नोट्स आ स्टडी PDF"],
            "Reference books & guides": ["रेफरेंस किताबें और गाइड", "रेफरेंस किताब आ गाइड"],
            "Previous year questions": ["पिछले वर्षों के प्रश्न", "पिछला सालक प्रश्न"],
            "Help & AI": ["सहायता और AI", "सहायता आ AI"],
            "24/7 AI chatbot assistant": ["24/7 AI चैटबॉट सहायक", "24/7 AI चैटबॉट सहायक"],
            "Support": ["सहायता", "सहायता"],
            "Customer support center": ["ग्राहक सहायता केंद्र", "ग्राहक सहायता केन्द्र"],
            "Complain": ["शिकायत", "शिकायत"],
            "Report issues & feedback": ["समस्या बताएं और सुझाव दें", "समस्या बताउ आ सुझाव दिअ"],
            "What if you want?": ["आपको क्या चाहिए?", "अहाँके की चाही?"],
            "Tell us what you need": ["बताइए आपको क्या चाहिए", "बताउ अहाँके की चाही"],
            "Class Notes (": ["क्लास नोट्स (", "क्लास नोट्स ("],
            "Browse all uploaded notes.": ["सभी अपलोड किए गए नोट्स देखें।", "सभ अपलोड कएल नोट्स देखू।"],
            "← Back to Home": ["← होम पर वापस", "← होम पर घुरू"],
            "All Classes": ["सभी कक्षाएँ", "सभ कक्षा"],
            "All Subjects": ["सभी विषय", "सभ विषय"],
            "Science": ["विज्ञान", "विज्ञान"],
            "Math": ["गणित", "गणित"],
            "Hindi": ["हिन्दी", "हिन्दी"],
            "English": ["अंग्रेज़ी", "अंग्रेजी"],
            "SST": ["सामाजिक विज्ञान", "सामाजिक विज्ञान"],
            "Maithili": ["मैथिली", "मैथिली"],
            "Could not load data. Check your internet.": ["डेटा लोड नहीं हो सका। इंटरनेट जाँचें।", "डेटा लोड नहि भ' सकल। इंटरनेट जाँचू।"],
            "Retry": ["फिर कोशिश करें", "फेर प्रयास करू"],
            "Reference Books (": ["रेफरेंस किताबें (", "रेफरेंस किताब ("],
            "Explore reference textbooks.": ["रेफरेंस पाठ्यपुस्तकें देखें।", "रेफरेंस पाठ्यपुस्तक देखू।"],
            "Previous Year Questions (": ["पिछले वर्षों के प्रश्न (", "पिछला सालक प्रश्न ("],
            "Practice with PYQ papers.": ["PYQ पेपर से अभ्यास करें।", "PYQ पेपर सँ अभ्यास करू।"],
            "© 2026 Notes Bazar. All rights reserved.": ["© 2026 Notes Bazar. सर्वाधिकार सुरक्षित।", "© 2026 Notes Bazar. सभ अधिकार सुरक्षित।"],
            "Built with professional student care.": ["विद्यार्थियों की देखभाल के साथ बनाया गया।", "विद्यार्थी सभक देखभालक संग बनाओल गेल।"],
            "Notes Bazar Menu": ["Notes Bazar मेनू", "Notes Bazar मेनू"],
            "Theme / Dark Mode": ["थीम / डार्क मोड", "थीम / डार्क मोड"],
            "Language": ["भाषा", "भाषा"],
            "Admin Login": ["एडमिन लॉगिन", "एडमिन लॉगिन"],
            "Theme Customizer": ["थीम कस्टमाइज़र", "थीम कस्टमाइजर"],
            "Mode (changes the whole page)": ["मोड (पूरा पेज बदलेगा)", "मोड (पूरा पेज बदलत)"],
            "Light": ["लाइट", "लाइट"],
            "Full Dark": ["फुल डार्क", "फुल डार्क"],
            "Accent colour": ["एक्सेंट रंग", "एक्सेंट रंग"],
            "Default Indigo": ["डिफ़ॉल्ट इंडिगो", "डिफ़ॉल्ट इंडिगो"],
            "Ocean Blue": ["ओशन ब्लू", "ओशन ब्लू"],
            "Emerald Green": ["एमेरल्ड ग्रीन", "एमेरल्ड ग्रीन"],
            "Sunset Orange": ["सनसेट ऑरेंज", "सनसेट ऑरेंज"],
            "Page background": ["पेज बैकग्राउंड", "पेज बैकग्राउंड"],
            "Apply Background Color": ["बैकग्राउंड रंग लगाएं", "बैकग्राउंड रंग लगाउ"],
            "Or use your own photo": ["या अपनी फोटो लगाएं", "वा अपन फोटो लगाउ"],
            "Reset Background": ["बैकग्राउंड रीसेट करें", "बैकग्राउंड रीसेट करू"],
            "Custom Color Picker": ["कस्टम कलर पिकर", "कस्टम कलर पिकर"],
            "Primary Color": ["मुख्य रंग", "मुख्य रंग"],
            "Secondary Color": ["दूसरा रंग", "दोसर रंग"],
            "Apply Custom Colors": ["कस्टम रंग लगाएं", "कस्टम रंग लगाउ"],
            "Choose Language": ["भाषा चुनें", "भाषा चुनू"],
            "Recent Upload Notifications": ["हाल की अपलोड सूचनाएँ", "हालक अपलोड सूचना"],
            "Study • Notes finder • Support • Everything": ["पढ़ाई • नोट्स खोजें • सहायता • सब कुछ", "पढ़ाई • नोट्स खोजू • सहायता • सभ किछु"],
            "🤖 All-in-One (Auto)": ["🤖 ऑल-इन-वन (ऑटो)", "🤖 ऑल-इन-वन (ऑटो)"],
            "📚 Study Mode": ["📚 स्टडी मोड", "📚 स्टडी मोड"],
            "💙 Support Mode": ["💙 सपोर्ट मोड", "💙 सपोर्ट मोड"],
            "🧠 Doubt solve": ["🧠 डाउट हल करें", "🧠 डाउट हल करू"],
            "📄 Find notes": ["📄 नोट्स खोजें", "📄 नोट्स खोजू"],
            "🗓️ Study plan": ["🗓️ स्टडी प्लान", "🗓️ स्टडी प्लान"],
            "💪 Motivation": ["💪 प्रेरणा", "💪 प्रेरणा"],
            "Tell us which notes, book or PYQ you need and we will try to upload it.": ["बताइए आपको कौन-से नोट्स, किताब या PYQ चाहिए, हम उसे अपलोड करने की कोशिश करेंगे।", "बताउ अहाँके कोन नोट्स, किताब वा PYQ चाही, हम ओकरा अपलोड करबाक प्रयास करब।"],
            "Type": ["प्रकार", "प्रकार"],
            "Book": ["किताब", "किताब"],
            "Other": ["अन्य", "अन्य"],
            "Class": ["कक्षा", "कक्षा"],
            "Subject": ["विषय", "विषय"],
            "What do you need? *": ["आपको क्या चाहिए? *", "अहाँके की चाही? *"],
            "Name (optional)": ["नाम (वैकल्पिक)", "नाम (वैकल्पिक)"],
            "Email/Phone (optional)": ["ईमेल/फ़ोन (वैकल्पिक)", "ईमेल/फोन (वैकल्पिक)"],
            "Send Request": ["अनुरोध भेजें", "अनुरोध पठाउ"],
            "Name": ["नाम", "नाम"],
            "Email": ["ईमेल", "ईमेल"],
            "How can we help?": ["हम कैसे मदद करें?", "हम कोना मदद करी?"],
            "Send Support Request": ["सहायता अनुरोध भेजें", "सहायता अनुरोध पठाउ"],
            "Complain / Report": ["शिकायत / रिपोर्ट", "शिकायत / रिपोर्ट"],
            "Issue Details": ["समस्या का विवरण", "समस्याक विवरण"],
            "Submit Complain": ["शिकायत दर्ज करें", "शिकायत दर्ज करू"],
            "Search notes...": ["नोट्स खोजें...", "नोट्स खोजू..."],
            "Search books...": ["किताबें खोजें...", "किताब खोजू..."],
            "Search PYQs...": ["PYQ खोजें...", "PYQ खोजू..."],
            "Type your question...": ["अपना सवाल लिखें...", "अपन प्रश्न लिखू..."],
            "e.g. Class 10 Science Chapter 3 short notes": ["जैसे: कक्षा 10 विज्ञान अध्याय 3 के छोटे नोट्स", "जेना: कक्षा 10 विज्ञान अध्याय 3 केर छोटका नोट्स"],
            "Document": ["दस्तावेज़", "दस्तावेज"],
            "General": ["सामान्य", "सामान्य"],
            "Preview": ["देखें", "देखू"],
            "Download": ["डाउनलोड", "डाउनलोड"],
            "Drive": ["ड्राइव", "ड्राइव"],
            "Searching...": ["खोज रहे हैं...", "खोजि रहल छी..."],
            "Nothing found yet": ["अभी कुछ नहीं मिला", "एखन किछु नहि भेटल"],
            "Loading more...": ["और लोड हो रहा है...", "आर लोड भ' रहल अछि..."],
            "Load more": ["और लोड करें", "आर लोड करू"],
            "No recent notifications.": ["कोई नई सूचना नहीं।", "कोनो नव सूचना नहि।"],
            "New upload": ["नया अपलोड", "नव अपलोड"],
            "No description provided.": ["कोई विवरण नहीं दिया गया।", "कोनो विवरण नहि देल गेल।"],
            "This item is hosted via Google Drive link.": ["यह फ़ाइल Google Drive लिंक पर है।", "ई फाइल Google Drive लिंक पर अछि।"],
            "Open Google Drive Link": ["Google Drive लिंक खोलें", "Google Drive लिंक खोलू"],
            "This link is not valid.": ["यह लिंक सही नहीं है।", "ई लिंक सही नहि अछि।"],
            "Loading file...": ["फ़ाइल लोड हो रही है...", "फाइल लोड भ' रहल अछि..."],
            "No direct file attached.": ["कोई फ़ाइल जुड़ी नहीं है।", "कोनो फाइल जुड़ल नहि अछि।"],
            "Preview is not available for this file type. Please download it.": ["इस फ़ाइल का प्रिव्यू उपलब्ध नहीं है। कृपया डाउनलोड करें।", "एहि फाइलक प्रिव्यू उपलब्ध नहि अछि। कृपया डाउनलोड करू।"],
            "Open in new tab": ["नए टैब में खोलें", "नव टैब मे खोलू"],
            "Could not load the file.": ["फ़ाइल लोड नहीं हो सकी।", "फाइल लोड नहि भ' सकल।"],
            "Class 1": ["कक्षा 1", "कक्षा 1"],
            "Class 2": ["कक्षा 2", "कक्षा 2"],
            "Class 3": ["कक्षा 3", "कक्षा 3"],
            "Class 4": ["कक्षा 4", "कक्षा 4"],
            "Class 5": ["कक्षा 5", "कक्षा 5"],
            "Class 6": ["कक्षा 6", "कक्षा 6"],
            "Class 7": ["कक्षा 7", "कक्षा 7"],
            "Class 8": ["कक्षा 8", "कक्षा 8"],
            "Class 9": ["कक्षा 9", "कक्षा 9"],
            "Class 10": ["कक्षा 10", "कक्षा 10"],
            "Class 11": ["कक्षा 11", "कक्षा 11"],
            "Class 12": ["कक्षा 12", "कक्षा 12"]
        };
        // ---- more languages: Bhojpuri, Bengali, Urdu, Marathi, Gujarati (appended after hi, mai) ----
        const TR_MORE = {"Student Marketplace": ["स्टूडेंट मार्केटप्लेस", "স্টুডেন্ট মার্কেটপ্লেস", "اسٹوڈنٹ مارکیٹ پلیس", "स्टुडंट मार्केटप्लेस", "સ્ટુડન્ટ માર્કેટપ્લેસ"], "Home": ["होम", "হোম", "ہوم", "होम", "હોમ"], "Notes": ["नोट्स", "নোটস", "نوٹس", "नोट्स", "નોટ્સ"], "Books": ["किताब", "বই", "کتابیں", "पुस्तके", "પુસ્તકો"], "Welcome to Notes Bazar 🌟": ["Notes Bazar में रउआ सभके स्वागत बा 🌟", "Notes Bazar-এ স্বাগতম 🌟", "Notes Bazar میں خوش آمدید 🌟", "Notes Bazar मध्ये आपले स्वागत आहे 🌟", "Notes Bazar માં તમારું સ્વાગત છે 🌟"], "Your Ultimate Student Study Hub": ["रउआ के आपन स्टूडेंट स्टडी हब", "আপনার নিজের স্টুডেন্ট স্টাডি হাব", "آپ کا اپنا اسٹوڈنٹ اسٹڈی حب", "तुमचे स्वतःचे स्टुडंट स्टडी हब", "તમારું પોતાનું સ્ટુડન્ટ સ્ટડી હબ"], "Discover verified class notes, reference books, previous year questions (PYQs), and get instant AI-powered study & support!": ["जाँचल क्लास नोट्स, रेफरेंस किताब, पिछला साल के सवाल (PYQ) देखीं आ तुरंत AI से पढ़ाई आ मदद पाईं!", "যাচাই করা ক্লাস নোটস, রেফারেন্স বই, আগের বছরের প্রশ্ন (PYQ) দেখুন এবং সঙ্গে সঙ্গে AI-এর সাহায্যে পড়াশোনা ও সহায়তা পান!", "تصدیق شدہ کلاس نوٹس، ریفرنس کتابیں اور پچھلے سالوں کے سوالات (PYQ) دیکھیں اور فوری AI سے پڑھائی اور مدد پائیں!", "पडताळलेले क्लास नोट्स, संदर्भ पुस्तके, मागील वर्षांचे प्रश्न (PYQ) पहा आणि AI कडून त्वरित अभ्यास व मदत मिळवा!", "ચકાસેલ ક્લાસ નોટ્સ, સંદર્ભ પુસ્તકો, અગાઉના વર્ષોના પ્રશ્નો (PYQ) જુઓ અને AI દ્વારા તરત અભ્યાસ અને મદદ મેળવો!"], "Explore Notes": ["नोट्स देखीं", "নোটস দেখুন", "نوٹس دیکھیں", "नोट्स पहा", "નોટ્સ જુઓ"], "View PYQs": ["PYQ देखीं", "PYQ দেখুন", "PYQ دیکھیں", "PYQ पहा", "PYQ જુઓ"], "Quick Options": ["जल्दी वाला विकल्प", "দ্রুত বিকল্প", "فوری اختیارات", "झटपट पर्याय", "ઝડપી વિકલ્પો"], "Class notes & study PDFs": ["क्लास नोट्स आ स्टडी PDF", "ক্লাস নোটস ও স্টাডি PDF", "کلاس نوٹس اور اسٹڈی PDF", "क्लास नोट्स आणि स्टडी PDF", "ક્લાસ નોટ્સ અને સ્ટડી PDF"], "Reference books & guides": ["रेफरेंस किताब आ गाइड", "রেফারেন্স বই ও গাইড", "ریفرنس کتابیں اور گائیڈ", "संदर्भ पुस्तके आणि मार्गदर्शक", "સંદર્ભ પુસ્તકો અને માર્ગદર્શિકા"], "Previous year questions": ["पिछला साल के सवाल", "আগের বছরের প্রশ্ন", "پچھلے سالوں کے سوالات", "मागील वर्षांचे प्रश्न", "અગાઉના વર્ષોના પ્રશ્નો"], "Help & AI": ["मदद आ AI", "সহায়তা ও AI", "مدد اور AI", "मदत आणि AI", "મદદ અને AI"], "24/7 AI chatbot assistant": ["24/7 AI चैटबॉट सहायक", "২৪/৭ AI চ্যাটবট সহকারী", "24/7 AI چیٹ بوٹ معاون", "24/7 AI चॅटबॉट सहाय्यक", "24/7 AI ચેટબોટ સહાયક"], "Support": ["मदद", "সহায়তা", "معاونت", "सहाय्य", "સપોર્ટ"], "Customer support center": ["ग्राहक सहायता केंद्र", "গ্রাহক সহায়তা কেন্দ্র", "کسٹمر سپورٹ سینٹر", "ग्राहक सहाय्य केंद्र", "ગ્રાહક સહાય કેન્દ્ર"], "Complain": ["शिकायत", "অভিযোগ", "شکایت", "तक्रार", "ફરિયાદ"], "Report issues & feedback": ["दिक्कत बताईं आ सुझाव दीं", "সমস্যা জানান ও মতামত দিন", "مسئلہ بتائیں اور رائے دیں", "समस्या सांगा आणि अभिप्राय द्या", "સમસ્યા જણાવો અને પ્રતિભાવ આપો"], "What if you want?": ["रउआ के का चाहीं?", "আপনি কী চান?", "آپ کو کیا چاہیے؟", "तुम्हाला काय हवे आहे?", "તમને શું જોઈએ છે?"], "Tell us what you need": ["बताईं रउआ के का चाहीं", "আমাদের জানান আপনার কী দরকার", "بتائیں آپ کو کیا چاہیے", "तुम्हाला काय हवे ते सांगा", "તમને શું જોઈએ તે જણાવો"], "Class Notes (": ["क्लास नोट्स (", "ক্লাস নোটস (", "کلاس نوٹس (", "क्लास नोट्स (", "ક્લાસ નોટ્સ ("], "Browse all uploaded notes.": ["सब अपलोड कइल नोट्स देखीं।", "আপলোড করা সব নোটস দেখুন।", "اپ لوڈ کیے گئے تمام نوٹس دیکھیں۔", "अपलोड केलेले सर्व नोट्स पहा.", "અપલોડ કરેલા બધા નોટ્સ જુઓ."], "← Back to Home": ["← होम पर लौटीं", "← হোমে ফিরে যান", "← ہوم پر واپس", "← होमवर परत", "← હોમ પર પાછા"], "All Classes": ["सब कक्षा", "সব শ্রেণি", "تمام جماعتیں", "सर्व इयत्ता", "બધા ધોરણ"], "All Subjects": ["सब विषय", "সব বিষয়", "تمام مضامین", "सर्व विषय", "બધા વિષયો"], "Science": ["विज्ञान", "বিজ্ঞান", "سائنس", "विज्ञान", "વિજ્ઞાન"], "Math": ["गणित", "গণিত", "ریاضی", "गणित", "ગણિત"], "Hindi": ["हिन्दी", "হিন্দি", "ہندی", "हिंदी", "હિન્દી"], "English": ["अंग्रेजी", "ইংরেজি", "انگریزی", "इंग्रजी", "અંગ્રેજી"], "SST": ["सामाजिक विज्ञान", "সামাজিক বিজ্ঞান", "سماجی علوم", "सामाजिक शास्त्र", "સામાજિક વિજ્ઞાન"], "Maithili": ["मैथिली", "মৈথিলী", "میتھلی", "मैथिली", "મૈથિલી"], "Could not load data. Check your internet.": ["डेटा लोड ना हो सकल। इंटरनेट जाँचीं।", "ডেটা লোড করা যায়নি। ইন্টারনেট পরীক্ষা করুন।", "ڈیٹا لوڈ نہیں ہو سکا۔ انٹرنیٹ چیک کریں۔", "डेटा लोड होऊ शकला नाही. इंटरनेट तपासा.", "ડેટા લોડ થઈ શક્યો નથી. ઇન્ટરનેટ તપાસો."], "Retry": ["फेर से कोशिश करीं", "আবার চেষ্টা করুন", "دوبارہ کوشش کریں", "पुन्हा प्रयत्न करा", "ફરી પ્રયાસ કરો"], "Reference Books (": ["रेफरेंस किताब (", "রেফারেন্স বই (", "ریفرنس کتابیں (", "संदर्भ पुस्तके (", "સંદર્ભ પુસ્તકો ("], "Explore reference textbooks.": ["रेफरेंस किताब देखीं।", "রেফারেন্স পাঠ্যবই দেখুন।", "ریفرنس نصابی کتابیں دیکھیں۔", "संदर्भ पाठ्यपुस्तके पहा.", "સંદર્ભ પાઠ્યપુસ્તકો જુઓ."], "Previous Year Questions (": ["पिछला साल के सवाल (", "আগের বছরের প্রশ্ন (", "پچھلے سالوں کے سوالات (", "मागील वर्षांचे प्रश्न (", "અગાઉના વર્ષોના પ્રશ્નો ("], "Practice with PYQ papers.": ["PYQ पेपर से अभ्यास करीं।", "PYQ পেপার দিয়ে অনুশীলন করুন।", "PYQ پیپرز سے مشق کریں۔", "PYQ पेपरने सराव करा.", "PYQ પેપર સાથે અભ્યાસ કરો."], "© 2026 Notes Bazar. All rights reserved.": ["© 2026 Notes Bazar. सब अधिकार सुरक्षित।", "© 2026 Notes Bazar. সর্বস্বত্ব সংরক্ষিত।", "© 2026 Notes Bazar. جملہ حقوق محفوظ ہیں۔", "© 2026 Notes Bazar. सर्व हक्क राखीव.", "© 2026 Notes Bazar. સર્વ અધિકાર સુરક્ષિત."], "Built with professional student care.": ["विद्यार्थी सब के देखभाल से बनावल गइल।", "শিক্ষার্থীদের যত্ন নিয়ে তৈরি।", "طلبہ کی دیکھ بھال کے ساتھ بنایا گیا۔", "विद्यार्थ्यांच्या काळजीने बनवलेले.", "વિદ્યાર્થીઓની કાળજી સાથે બનાવેલ."], "Notes Bazar Menu": ["Notes Bazar मेनू", "Notes Bazar মেনু", "Notes Bazar مینو", "Notes Bazar मेनू", "Notes Bazar મેનૂ"], "Theme / Dark Mode": ["थीम / डार्क मोड", "থিম / ডার্ক মোড", "تھیم / ڈارک موڈ", "थीम / डार्क मोड", "થીમ / ડાર્ક મોડ"], "Language": ["भाषा", "ভাষা", "زبان", "भाषा", "ભાષા"], "Admin Login": ["एडमिन लॉगिन", "অ্যাডমিন লগইন", "ایڈمن لاگ ان", "अ‍ॅडमिन लॉगिन", "એડમિન લોગિન"], "Theme Customizer": ["थीम कस्टमाइजर", "থিম কাস্টমাইজার", "تھیم کسٹمائزر", "थीम कस्टमायझर", "થીમ કસ્ટમાઇઝર"], "Mode (changes the whole page)": ["मोड (पूरा पेज बदल जाई)", "মোড (পুরো পেজ বদলাবে)", "موڈ (پورا صفحہ بدل جائے گا)", "मोड (संपूर्ण पेज बदलेल)", "મોડ (આખું પેજ બદલાશે)"], "Light": ["लाइट", "লাইট", "لائٹ", "लाइट", "લાઇટ"], "Full Dark": ["फुल डार्क", "ফুল ডার্ক", "فل ڈارک", "फुल डार्क", "ફુલ ડાર્ક"], "Accent colour": ["एक्सेंट रंग", "অ্যাকসেন্ট রঙ", "ایکسنٹ رنگ", "ॲक्सेंट रंग", "એક્સેન્ટ રંગ"], "Default Indigo": ["डिफ़ॉल्ट इंडिगो", "ডিফল্ট ইন্ডিগো", "ڈیفالٹ انڈیگو", "डीफॉल्ट इंडिगो", "ડિફોલ્ટ ઇન્ડિગો"], "Ocean Blue": ["ओशन ब्लू", "ওশান ব্লু", "اوشن بلیو", "ओशन ब्लू", "ઓશન બ્લુ"], "Emerald Green": ["एमरल्ड ग्रीन", "এমারেল্ড গ্রিন", "ایمرلڈ گرین", "एमराल्ड ग्रीन", "એમેરાલ્ડ ગ્રીન"], "Sunset Orange": ["सनसेट ऑरेंज", "সানসেট অরেঞ্জ", "سن سیٹ اورنج", "सनसेट ऑरेंज", "સનસેટ ઓરેન્જ"], "Page background": ["पेज बैकग्राउंड", "পেজ ব্যাকগ্রাউন্ড", "صفحے کا پس منظر", "पेज बॅकग्राउंड", "પેજ બેકગ્રાઉન્ડ"], "Apply Background Color": ["बैकग्राउंड रंग लगाईं", "ব্যাকগ্রাউন্ড রঙ প্রয়োগ করুন", "پس منظر کا رنگ لگائیں", "बॅकग्राउंड रंग लावा", "બેકગ્રાઉન્ડ રંગ લગાવો"], "Or use your own photo": ["ना त आपन फोटो लगाईं", "অথবা নিজের ছবি ব্যবহার করুন", "یا اپنی تصویر استعمال کریں", "किंवा तुमचा स्वतःचा फोटो वापरा", "અથવા તમારો પોતાનો ફોટો વાપરો"], "Reset Background": ["बैकग्राउंड रीसेट करीं", "ব্যাকগ্রাউন্ড রিসেট করুন", "پس منظر ری سیٹ کریں", "बॅकग्राउंड रीसेट करा", "બેકગ્રાઉન્ડ રીસેટ કરો"], "Custom Color Picker": ["कस्टम कलर पिकर", "কাস্টম কালার পিকার", "کسٹم کلر پکر", "कस्टम कलर पिकर", "કસ્ટમ કલર પિકર"], "Primary Color": ["मुख्य रंग", "প্রধান রঙ", "بنیادی رنگ", "मुख्य रंग", "મુખ્ય રંગ"], "Secondary Color": ["दोसर रंग", "দ্বিতীয় রঙ", "ثانوی رنگ", "दुय्यम रंग", "ગૌણ રંગ"], "Apply Custom Colors": ["कस्टम रंग लगाईं", "কাস্টম রঙ প্রয়োগ করুন", "کسٹم رنگ لگائیں", "कस्टम रंग लावा", "કસ્ટમ રંગો લગાવો"], "Choose Language": ["भाषा चुनीं", "ভাষা বেছে নিন", "زبان منتخب کریں", "भाषा निवडा", "ભાષા પસંદ કરો"], "Recent Upload Notifications": ["हाल के अपलोड सूचना", "সাম্প্রতিক আপলোডের বিজ্ঞপ্তি", "حالیہ اپ لوڈ اطلاعات", "अलीकडील अपलोड सूचना", "તાજેતરના અપલોડ સૂચનાઓ"], "Study • Notes finder • Support • Everything": ["पढ़ाई • नोट्स खोजीं • मदद • सब कुछ", "পড়াশোনা • নোটস খুঁজুন • সহায়তা • সবকিছু", "پڑھائی • نوٹس تلاش کریں • مدد • سب کچھ", "अभ्यास • नोट्स शोधा • सहाय्य • सर्व काही", "અભ્યાસ • નોટ્સ શોધો • સપોર્ટ • બધું"], "🤖 All-in-One (Auto)": ["🤖 ऑल-इन-वन (ऑटो)", "🤖 অল-ইন-ওয়ান (অটো)", "🤖 آل ان ون (آٹو)", "🤖 ऑल-इन-वन (ऑटो)", "🤖 ઓલ-ઇન-વન (ઓટો)"], "📚 Study Mode": ["📚 स्टडी मोड", "📚 স্টাডি মোড", "📚 اسٹڈی موڈ", "📚 स्टडी मोड", "📚 સ્ટડી મોડ"], "💙 Support Mode": ["💙 सपोर्ट मोड", "💙 সাপোর্ট মোড", "💙 سپورٹ موڈ", "💙 सपोर्ट मोड", "💙 સપોર્ટ મોડ"], "🧠 Doubt solve": ["🧠 डाउट हल करीं", "🧠 ডাউট সমাধান", "🧠 شک حل کریں", "🧠 शंका सोडवा", "🧠 ડાઉટ સોલ્વ"], "📄 Find notes": ["📄 नोट्स खोजीं", "📄 নোটস খুঁজুন", "📄 نوٹس تلاش کریں", "📄 नोट्स शोधा", "📄 નોટ્સ શોધો"], "🗓️ Study plan": ["🗓️ स्टडी प्लान", "🗓️ স্টাডি প্ল্যান", "🗓️ اسٹڈی پلان", "🗓️ अभ्यास योजना", "🗓️ સ્ટડી પ્લાન"], "💪 Motivation": ["💪 प्रेरणा", "💪 অনুপ্রেরণা", "💪 حوصلہ افزائی", "💪 प्रेरणा", "💪 પ્રેરણા"], "Tell us which notes, book or PYQ you need and we will try to upload it.": ["बताईं रउआ के कवन नोट्स, किताब भा PYQ चाहीं, हमनी अपलोड करे के कोशिश करब।", "আপনার কোন নোটস, বই বা PYQ দরকার আমাদের জানান, আমরা আপলোড করার চেষ্টা করব।", "بتائیں آپ کو کون سے نوٹس، کتاب یا PYQ چاہیے، ہم اسے اپ لوڈ کرنے کی کوشش کریں گے۔", "तुम्हाला कोणते नोट्स, पुस्तक किंवा PYQ हवे ते सांगा, आम्ही ते अपलोड करण्याचा प्रयत्न करू.", "તમને કયા નોટ્સ, પુસ્તક કે PYQ જોઈએ તે જણાવો, અમે તેને અપલોડ કરવાનો પ્રયત્ન કરીશું."], "Type": ["प्रकार", "ধরন", "قسم", "प्रकार", "પ્રકાર"], "Book": ["किताब", "বই", "کتاب", "पुस्तक", "પુસ્તક"], "Other": ["दोसर", "অন্যান্য", "دیگر", "इतर", "અન્ય"], "Class": ["कक्षा", "শ্রেণি", "جماعت", "इयत्ता", "ધોરણ"], "Subject": ["विषय", "বিষয়", "مضمون", "विषय", "વિષય"], "What do you need? *": ["रउआ के का चाहीं? *", "আপনার কী দরকার? *", "آپ کو کیا چاہیے؟ *", "तुम्हाला काय हवे आहे? *", "તમને શું જોઈએ છે? *"], "Name (optional)": ["नाम (मर्जी के हिसाब से)", "নাম (ঐচ্ছিক)", "نام (اختیاری)", "नाव (ऐच्छिक)", "નામ (વૈકલ્પિક)"], "Email/Phone (optional)": ["ईमेल/फोन (मर्जी के हिसाब से)", "ইমেল/ফোন (ঐচ্ছিক)", "ای میل/فون (اختیاری)", "ईमेल/फोन (ऐच्छिक)", "ઇમેઇલ/ફોન (વૈકલ્પિક)"], "Send Request": ["निहोरा भेजीं", "অনুরোধ পাঠান", "درخواست بھیجیں", "विनंती पाठवा", "વિનંતી મોકલો"], "Name": ["नाम", "নাম", "نام", "नाव", "નામ"], "Email": ["ईमेल", "ইমেল", "ای میل", "ईमेल", "ઇમેઇલ"], "How can we help?": ["हमनी कइसे मदद करीं?", "আমরা কীভাবে সাহায্য করতে পারি?", "ہم کیسے مدد کریں؟", "आम्ही कशी मदत करू?", "અમે કેવી રીતે મદદ કરી શકીએ?"], "Send Support Request": ["मदद के निहोरा भेजीं", "সহায়তার অনুরোধ পাঠান", "معاونت کی درخواست بھیجیں", "सहाय्य विनंती पाठवा", "સપોર્ટ વિનંતી મોકલો"], "Complain / Report": ["शिकायत / रिपोर्ट", "অভিযোগ / রিপোর্ট", "شکایت / رپورٹ", "तक्रार / रिपोर्ट", "ફરિયાદ / રિપોર્ટ"], "Issue Details": ["दिक्कत के ब्यौरा", "সমস্যার বিবরণ", "مسئلے کی تفصیل", "समस्येचा तपशील", "સમસ્યાની વિગતો"], "Submit Complain": ["शिकायत दर्ज करीं", "অভিযোগ জমা দিন", "شکایت درج کریں", "तक्रार नोंदवा", "ફરિયાદ નોંધાવો"], "Search notes...": ["नोट्स खोजीं...", "নোটস খুঁজুন...", "نوٹس تلاش کریں...", "नोट्स शोधा...", "નોટ્સ શોધો..."], "Search books...": ["किताब खोजीं...", "বই খুঁজুন...", "کتابیں تلاش کریں...", "पुस्तके शोधा...", "પુસ્તકો શોધો..."], "Search PYQs...": ["PYQ खोजीं...", "PYQ খুঁজুন...", "PYQ تلاش کریں...", "PYQ शोधा...", "PYQ શોધો..."], "Type your question...": ["आपन सवाल लिखीं...", "আপনার প্রশ্ন লিখুন...", "اپنا سوال لکھیں...", "तुमचा प्रश्न लिहा...", "તમારો પ્રશ્ન લખો..."], "e.g. Class 10 Science Chapter 3 short notes": ["जइसे: कक्षा 10 विज्ञान अध्याय 3 के छोट नोट्स", "যেমন: ক্লাস ১০ বিজ্ঞান অধ্যায় ৩ এর সংক্ষিপ্ত নোটস", "مثلاً: جماعت 10 سائنس باب 3 کے مختصر نوٹس", "उदा. इयत्ता 10 विज्ञान प्रकरण 3 चे छोटे नोट्स", "દા.ત. ધોરણ 10 વિજ્ઞાન પ્રકરણ 3 ના ટૂંકા નોટ્સ"], "Document": ["दस्तावेज", "নথি", "دستاویز", "दस्तऐवज", "દસ્તાવેજ"], "General": ["सामान्य", "সাধারণ", "عام", "सामान्य", "સામાન્ય"], "Preview": ["देखीं", "প্রিভিউ", "پیش منظر", "पूर्वावलोकन", "પ્રિવ્યૂ"], "Download": ["डाउनलोड", "ডাউনলোড", "ڈاؤن لوڈ", "डाउनलोड", "ડાઉનલોડ"], "Drive": ["ड्राइव", "ড্রাইভ", "ڈرائیو", "ड्राइव्ह", "ડ્રાઇવ"], "Searching...": ["खोजत बानी...", "খোঁজা হচ্ছে...", "تلاش کر رہے ہیں...", "शोधत आहे...", "શોધી રહ્યા છીએ..."], "Nothing found yet": ["अभी कुछ ना मिलल", "এখনো কিছু পাওয়া যায়নি", "ابھی کچھ نہیں ملا", "अजून काही सापडले नाही", "હજી કંઈ મળ્યું નથી"], "Loading more...": ["अउरी लोड हो रहल बा...", "আরও লোড হচ্ছে...", "مزید لوڈ ہو رہا ہے...", "आणखी लोड होत आहे...", "વધુ લોડ થઈ રહ્યું છે..."], "Load more": ["अउरी लोड करीं", "আরও লোড করুন", "مزید لوڈ کریں", "आणखी लोड करा", "વધુ લોડ કરો"], "No recent notifications.": ["कवनो नया सूचना नइखे।", "কোনো নতুন বিজ্ঞপ্তি নেই।", "کوئی نئی اطلاع نہیں۔", "कोणतीही नवीन सूचना नाही.", "કોઈ નવી સૂચના નથી."], "New upload": ["नया अपलोड", "নতুন আপলোড", "نیا اپ لوڈ", "नवीन अपलोड", "નવું અપલોડ"], "No description provided.": ["कवनो विवरण नइखे दिहल गइल।", "কোনো বিবরণ দেওয়া হয়নি।", "کوئی تفصیل فراہم نہیں کی گئی۔", "कोणतेही वर्णन दिलेले नाही.", "કોઈ વર્ણન આપવામાં આવ્યું નથી."], "This item is hosted via Google Drive link.": ["ई फाइल Google Drive लिंक पर बा।", "এই ফাইলটি Google Drive লিংকে আছে।", "یہ فائل Google Drive لنک پر ہے۔", "ही फाईल Google Drive लिंकवर आहे.", "આ ફાઇલ Google Drive લિંક પર છે."], "Open Google Drive Link": ["Google Drive लिंक खोलीं", "Google Drive লিংক খুলুন", "Google Drive لنک کھولیں", "Google Drive लिंक उघडा", "Google Drive લિંક ખોલો"], "This link is not valid.": ["ई लिंक सही नइखे।", "এই লিংকটি সঠিক নয়।", "یہ لنک درست نہیں ہے۔", "ही लिंक वैध नाही.", "આ લિંક માન્ય નથી."], "Loading file...": ["फाइल लोड हो रहल बा...", "ফাইল লোড হচ্ছে...", "فائل لوڈ ہو رہی ہے...", "फाईल लोड होत आहे...", "ફાઇલ લોડ થઈ રહી છે..."], "No direct file attached.": ["कवनो फाइल जोड़ल नइखे।", "কোনো ফাইল সংযুক্ত নেই।", "کوئی فائل منسلک نہیں ہے۔", "कोणतीही फाईल जोडलेली नाही.", "કોઈ ફાઇલ જોડાયેલ નથી."], "Preview is not available for this file type. Please download it.": ["एह फाइल के प्रिव्यू उपलब्ध नइखे। कृपया डाउनलोड करीं।", "এই ফাইলের প্রিভিউ পাওয়া যাচ্ছে না। অনুগ্রহ করে ডাউনলোড করুন।", "اس فائل کا پیش منظر دستیاب نہیں ہے۔ براہ کرم ڈاؤن لوڈ کریں۔", "या फाईलचे पूर्वावलोकन उपलब्ध नाही. कृपया डाउनलोड करा.", "આ ફાઇલનું પ્રિવ્યૂ ઉપલબ્ધ નથી. કૃપા કરીને ડાઉનલોડ કરો."], "Open in new tab": ["नया टैब में खोलीं", "নতুন ট্যাবে খুলুন", "نئے ٹیب میں کھولیں", "नवीन टॅबमध्ये उघडा", "નવા ટેબમાં ખોલો"], "Could not load the file.": ["फाइल लोड ना हो सकल।", "ফাইল লোড করা যায়নি।", "فائل لوڈ نہیں ہو سکی۔", "फाईल लोड होऊ शकली नाही.", "ફાઇલ લોડ થઈ શકી નથી."]};
        const TR_ADD = {"Settings": ["सेटिंग्स", "सेटिंग", "सेटिंग", "সেটিংস", "سیٹنگز", "सेटिंग्ज", "સેટિંગ્સ"], "Moving animations": ["चलते-फिरते एनिमेशन", "चलैत-फिरैत एनिमेशन", "चलत-फिरत एनिमेशन", "চলমান অ্যানিমেশন", "حرکت کرتے اینیمیشن", "हलणारे अ‍ॅनिमेशन", "ચાલતા એનિમેશન"], "Cards, logo and icons keep floating": ["कार्ड, लोगो और आइकन हिलते रहेंगे", "कार्ड, लोगो आ आइकन हिलैत रहत", "कार्ड, लोगो आ आइकन हिलत रहीं", "কার্ড, লোগো ও আইকন ভেসে থাকবে", "کارڈ، لوگو اور آئیکن ہلتے رہیں گے", "कार्ड, लोगो आणि आयकॉन हलत राहतील", "કાર્ડ, લોગો અને આઇકન હલતા રહેશે"], "RGB hover glow": ["RGB होवर ग्लो", "RGB होवर ग्लो", "RGB हॉवर ग्लो", "RGB হোভার গ্লো", "RGB ہوور گلو", "RGB हॉवर ग्लो", "RGB હોવર ગ્લો"], "Rotating RGB border and colour change on hover": ["होवर पर घूमता RGB बॉर्डर और रंग बदलाव", "होवर पर घूमैत RGB बॉर्डर आ रंग बदलाव", "हॉवर पर घूमत RGB बॉर्डर आ रंग बदलाव", "হোভারে ঘূর্ণায়মান RGB বর্ডার ও রঙ বদল", "ہوور پر گھومتا RGB بارڈر اور رنگ کی تبدیلی", "हॉवर केल्यावर फिरणारी RGB किनार आणि रंग बदल", "હોવર પર ફરતી RGB બોર્ડર અને રંગ બદલાવ"], "Reset settings": ["सेटिंग्स रीसेट करें", "सेटिंग रीसेट करू", "सेटिंग रीसेट करीं", "সেটিংস রিসেট করুন", "سیٹنگز ری سیٹ کریں", "सेटिंग्ज रीसेट करा", "સેટિંગ્સ રીસેટ કરો"]};
        for (let n = 1; n <= 12; n++) TR_MORE['Class ' + n] = ['कक्षा', 'শ্রেণি', 'جماعت', 'इयत्ता', 'ધોરણ'].map(w => w + ' ' + n);
        Object.keys(TR_MORE).forEach(k => { if (TR[k]) TR[k].push(...TR_MORE[k]); });
        Object.keys(TR_ADD).forEach(k => { TR[k] = TR_ADD[k]; });
        Object.assign(TR, {"Find your notes": ["अपने नोट्स खोजें", "अपन नोट्स खोजू", "आपन नोट्स खोजीं", "আপনার নোটস খুঁজুন", "اپنے نوٹس تلاش کریں", "तुमचे नोट्स शोधा", "તમારા નોટ્સ શોધો"], "Search by subject, class, chapter or topic...": ["विषय, कक्षा, अध्याय या टॉपिक से खोजें...", "विषय, कक्षा, अध्याय वा टॉपिक सँ खोजू...", "विषय, कक्षा, अध्याय भा टॉपिक से खोजीं...", "বিষয়, শ্রেণি, অধ্যায় বা টপিক দিয়ে খুঁজুন...", "مضمون، جماعت، باب یا ٹاپک سے تلاش کریں...", "विषय, इयत्ता, प्रकरण किंवा टॉपिकने शोधा...", "વિષય, ધોરણ, પ્રકરણ અથવા ટોપિકથી શોધો..."], "Browse by Class": ["कक्षा के अनुसार देखें", "कक्षा अनुसार देखू", "कक्षा के हिसाब से देखीं", "শ্রেণি অনুযায়ী দেখুন", "جماعت کے مطابق دیکھیں", "इयत्तेनुसार पहा", "ધોરણ પ્રમાણે જુઓ"], "Latest Uploads": ["नए अपलोड", "नव अपलोड", "नया अपलोड", "সাম্প্রতিক আপলোড", "تازہ ترین اپ لوڈز", "नवीनतम अपलोड", "તાજેતરના અપલોડ"], "Trending Notes": ["ट्रेंडिंग नोट्स", "ट्रेंडिंग नोट्स", "ट्रेंडिंग नोट्स", "ট্রেন্ডিং নোটস", "ٹرینڈنگ نوٹس", "ट्रेंडिंग नोट्स", "ટ્રેન્ડિંગ નોટ્સ"], "Most viewed and downloaded": ["सबसे ज़्यादा देखे और डाउनलोड किए गए", "सभसँ बेसी देखल आ डाउनलोड कएल गेल", "सबसे ज्यादा देखल आ डाउनलोड कइल गइल", "সবচেয়ে বেশি দেখা ও ডাউনলোড করা", "سب سے زیادہ دیکھے اور ڈاؤن لوڈ کیے گئے", "सर्वाधिक पाहिलेले आणि डाउनलोड केलेले", "સૌથી વધુ જોયેલા અને ડાઉનલોડ કરેલા"], "Newly added study material": ["नई जोड़ी गई पढ़ाई की सामग्री", "नव जोड़ल गेल पढ़ाइक सामग्री", "नया जोड़ल पढ़ाई के सामग्री", "নতুন যোগ করা পড়ার উপকরণ", "نیا شامل کیا گیا مطالعاتی مواد", "नव्याने जोडलेले अभ्यास साहित्य", "નવું ઉમેરેલું અભ્યાસ સામગ્રી"], "Clear search": ["खोज साफ़ करें", "खोज साफ करू", "खोज साफ करीं", "অনুসন্ধান মুছুন", "تلاش صاف کریں", "शोध साफ करा", "શોધ સાફ કરો"], "results found": ["नतीजे मिले", "नतीजा भेटल", "नतीजा मिलल", "টি ফলাফল পাওয়া গেছে", "نتائج ملے", "निकाल सापडले", "પરિણામો મળ્યા"], "All": ["सभी", "सभ", "सब", "সব", "تمام", "सर्व", "બધા"], "Chapter": ["अध्याय", "अध्याय", "अध्याय", "অধ্যায়", "باب", "प्रकरण", "પ્રકરણ"], "No results found. Try another subject or class.": ["कोई नतीजा नहीं मिला। दूसरा विषय या कक्षा आज़माएँ।", "कोनो नतीजा नहि भेटल। दोसर विषय वा कक्षा आजमाउ।", "कवनो नतीजा ना मिलल। दोसर विषय भा कक्षा आजमाईं।", "কোনো ফলাফল পাওয়া যায়নি। অন্য বিষয় বা শ্রেণি চেষ্টা করুন।", "کوئی نتیجہ نہیں ملا۔ کوئی اور مضمون یا جماعت آزمائیں۔", "कोणताही निकाल सापडला नाही. दुसरा विषय किंवा इयत्ता वापरून पहा.", "કોઈ પરિણામ મળ્યું નથી. બીજો વિષય અથવા ધોરણ અજમાવો."]});
        let curLang = 'en';
        try { const l = localStorage.getItem('nb_lang'); if (LANGS[l]) curLang = l; } catch (e) {}
        window.t = function(k) { const e = TR[k]; return (curLang !== 'en' && e && e[LANG_IDX[curLang]]) || k; };
        const NO_TR = '#adminDashboardModal,#uploadModal,#adminReplyModal,#adminLoginModal,#editItemModal,#safePreviewModal,#rulesHelpModal,#aiChatHistory,#splash,[data-lang],#setLangName,script,style,textarea';
        function applyLang() {
            const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let n;
            while ((n = tw.nextNode())) {
                if (n.__o === undefined) {
                    const raw = n.nodeValue, k = raw.trim();
                    if (!k || !TR[k] || (n.parentElement && n.parentElement.closest(NO_TR))) { n.__o = null; continue; }
                    n.__o = raw; n.__k = k;
                }
                if (n.__o === null) continue;
                n.nodeValue = curLang === 'en' ? n.__o : n.__o.replace(n.__k, window.t(n.__k));
            }
            document.querySelectorAll('[placeholder]').forEach(el => {
                if (el.closest('#adminDashboardModal,#uploadModal,#adminReplyModal,#adminLoginModal')) return;
                if (el.__ph === undefined) el.__ph = el.getAttribute('placeholder');
                el.setAttribute('placeholder', window.t(el.__ph));
            });
            document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === curLang ? 'true' : 'false'));
            const code = document.getElementById('langCode');
            if (code) code.textContent = LANG_SHORT[curLang];
            document.documentElement.lang = curLang;
            document.documentElement.dir = curLang === 'ur' ? 'rtl' : 'ltr';
            const sl = document.getElementById('setLangName'); if (sl) sl.textContent = LANGS[curLang];
        }
        window.setLang = function(l) {
            if (!LANGS[l]) return;
            curLang = l;
            try { localStorage.setItem('nb_lang', l); } catch (e) {}
            applyLang();
            window.renderAllPages();
            renderNotifications();
            closeModal('langModal');
            closeModal('mobileMenuModal');
        };


        function renderLangButtons() {
            const keys = Object.keys(LANGS);
            const list = document.getElementById('langList');
            const grid = document.getElementById('langGridMenu');
            if (list) list.innerHTML = keys.map(k => `<button data-lang="${k}" aria-pressed="${k === curLang}" onclick="setLang('${k}')" class="lang-btn w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"><span class="font-bold">${LANGS[k]}</span><span class="text-xs opacity-70">${LANG_EN[k]}</span></button>`).join('');
            if (grid) grid.innerHTML = keys.map(k => `<button data-lang="${k}" aria-pressed="${k === curLang}" onclick="setLang('${k}')" class="lang-btn py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold">${LANGS[k]}</button>`).join('');
        }

        // ---------- Settings (three-dot menu) ----------
        const rootEl = document.documentElement;
        function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
        function animOn() { return !rootEl.classList.contains('lite') && !rootEl.classList.contains('no-anim'); }
        function rgbOn() { return !rootEl.classList.contains('no-rgb'); }
        function syncSettingsUI() {
            const a = document.getElementById('togAnim'), r = document.getElementById('togRgb');
            if (a) a.setAttribute('aria-checked', animOn() ? 'true' : 'false');
            if (r) r.setAttribute('aria-checked', rgbOn() ? 'true' : 'false');
            const n = document.getElementById('setLangName'); if (n) n.textContent = LANGS[curLang];
        }
        window.toggleSetting = function(which) {
            if (which === 'anim') {
                if (animOn()) { rootEl.classList.add('no-anim'); rootEl.classList.remove('force-anim'); lsSet('nb_anim', '0'); }
                else { rootEl.classList.remove('no-anim', 'lite'); rootEl.classList.add('force-anim'); lsSet('nb_anim', '1'); }
            } else {
                rootEl.classList.toggle('no-rgb'); lsSet('nb_rgb', rgbOn() ? '1' : '0');
            }
            syncSettingsUI();
        };
        window.resetSettings = function() { lsSet('nb_anim', null); lsSet('nb_rgb', null); location.reload(); };
        window.hideMore = function() {
            const m = document.getElementById('moreMenu'), b = document.getElementById('moreBtn');
            if (m) m.classList.add('hidden');
            if (b) b.setAttribute('aria-expanded', 'false');
        };
        window.toggleMore = function(e) {
            if (e) e.stopPropagation();
            const m = document.getElementById('moreMenu'), b = document.getElementById('moreBtn');
            if (!m) return;
            const open = m.classList.contains('hidden');
            m.classList.toggle('hidden', !open);
            if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
        };
        window.openSettings = function() { hideMore(); syncSettingsUI(); openModal('settingsModal'); };
        document.addEventListener('click', e => { if (!e.target.closest('#moreWrap')) hideMore(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') hideMore(); });

        // Admin Auth
        window.togglePass = function(id, btn) {
            const inp = document.getElementById(id);
            const show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            btn.innerHTML = show ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
        };
        function setLoginMsg(msg, ok) {
            const el = document.getElementById('loginError');
            el.textContent = msg || '';
            el.classList.toggle('hidden', !msg);
            el.classList.toggle('text-red-500', !ok);
            el.classList.toggle('text-emerald-600', !!ok);
            const fw = document.getElementById('adminForgotWrap');
            if (fw) fw.classList.toggle('hidden', !(msg && !ok && window.__loginWrong));
        }
        function fbMsg(e) {
            const c = (e && e.code) || '';
            if (/invalid-credential|wrong-password|user-not-found|invalid-email|missing-password/.test(c)) return 'Wrong email or password.';
            if (c === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
            if (c === 'auth/network-request-failed') return 'Check your internet connection.';
            if (c === 'auth/operation-not-allowed') return 'Email/Password sign-in is not enabled in Firebase (see SETUP.md).';
            if (e && e.message === 'NOT_ADMIN') return 'This account is not an admin.';
            return 'Could not log in. Please try again.';
        }
        // The server (database rules) decides who is admin: only the admin account may read messages.
        async function verifyAdmin() {
            const { db, ref, get, query, limitToFirst, auth } = await loadSdk();
            if (auth.currentUser && /@users\.notesbazar\.app$/i.test(auth.currentUser.email || '')) throw new Error('NOT_ADMIN');
            await get(query(ref(db, 'notes_bazar_messages'), limitToFirst(1)));
        }
        window.openAdminLogin = async function() {
            setLoginMsg('');
            document.getElementById('adminLoginModal').classList.remove('hidden');
            try {   // already signed in on this device? go straight in
                const { auth, onAuthStateChanged, signOut } = await loadSdk();
                await new Promise(res => { const un = onAuthStateChanged(auth, () => { un(); res(); }); });
                if (auth.currentUser) {
                    try { await verifyAdmin(); closeAdminLogin(); openAdminDashboard(); }
                    catch (e) { await signOut(auth); }
                }
            } catch (e) { console.warn(e); }
        };
        window.closeAdminLogin = function() { document.getElementById('adminLoginModal').classList.add('hidden'); };

        let loginBusy = false, lastTried = '', autoT = 0;
        window.handleAdminLogin = async function(e) {
            if (e && e.preventDefault) e.preventDefault();
            if (loginBusy) return;
            const btn = document.getElementById('adminLoginBtn');
            loginBusy = true; btn.disabled = true; window.__loginWrong = false; setLoginMsg('');
            lastTried = document.getElementById('adminUser').value.trim() + '\n' + document.getElementById('adminPass').value;
            try {
                const { auth, signInWithEmailAndPassword, signOut } = await loadSdk();
                if (/@users\.notesbazar\.app$/i.test(document.getElementById('adminUser').value.trim())) throw new Error('NOT_ADMIN');   // student accounts are not admins
                await signInWithEmailAndPassword(auth, document.getElementById('adminUser').value.trim(), document.getElementById('adminPass').value);
                try { await verifyAdmin(); }
                catch (err) { await signOut(auth); throw new Error('NOT_ADMIN'); }
                document.getElementById('adminPass').value = '';
                closeAdminLogin();
                openAdminDashboard();
            } catch (err) {
                console.warn(err);
                window.__loginWrong = /invalid-credential|wrong-password|user-not-found|invalid-email|missing-password/.test((err && err.code) || '');
                setLoginMsg(fbMsg(err));
                const card = document.querySelector('#adminLoginModal > div'); if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
            } finally { loginBusy = false; btn.disabled = false; }
        };
        // auto-login: once the email and password look valid, wait a moment and try to log in automatically
        function scheduleAutoLogin() {
            clearTimeout(autoT);
            const em = document.getElementById('adminUser').value.trim();
            const pw = document.getElementById('adminPass').value;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em) || pw.length < 6) return;
            if (em + '\n' + pw === lastTried) return;      // do not retry the same wrong combination
            autoT = setTimeout(() => { if (!loginBusy) window.handleAdminLogin(); }, 1400);
        }
        document.addEventListener('DOMContentLoaded', () => {
            ['adminUser', 'adminPass'].forEach(id => { const el = document.getElementById(id); if (el) { el.addEventListener('input', scheduleAutoLogin); el.addEventListener('change', scheduleAutoLogin); } });
        });
        window.adminForgot = async function() {
            const email = document.getElementById('adminUser').value.trim();
            if (!email) { setLoginMsg('Enter your admin email above first.'); return; }
            try {
                const { auth, sendPasswordResetEmail } = await loadSdk();
                await sendPasswordResetEmail(auth, email);
                window.__loginWrong = false;
                setLoginMsg('Reset link sent to your email (check the spam folder too).', true);
            } catch (err) { setLoginMsg(fbMsg(err)); }
        };
        window.adminLogout = async function() { lockSafe(); window.privateItems = [];
            try { const { auth, signOut } = await loadSdk(); await signOut(auth); } catch (e) {}
            document.getElementById('adminDashboardModal').classList.add('hidden');
            window.messages = [];
            window.loadCloudData();
        };

const K = [], H = [];
(function () { let n = 2, c = 0; while (c < 64) { let p = true; for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; } if (p) { if (c < 8) H[c] = (Math.pow(n, .5) * 4294967296) | 0; K[c] = (Math.pow(n, 1 / 3) * 4294967296) | 0; c++; } n++; } })();
function sha256(str) {
    const bytes = new TextEncoder().encode(str), len = bytes.length;
    const total = (((len + 8) >> 6) + 1) << 6;
    const m = new Uint8Array(total); m.set(bytes); m[len] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 4, (len * 8) >>> 0); dv.setUint32(total - 8, Math.floor(len * 8 / 4294967296));
    const ror = (x, n) => (x >>> n) | (x << (32 - n));
    const W = new Array(64); let h = H.slice();
    for (let o = 0; o < total; o += 64) {
        for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = ror(W[i - 15], 7) ^ ror(W[i - 15], 18) ^ (W[i - 15] >>> 3);
            const s1 = ror(W[i - 2], 17) ^ ror(W[i - 2], 19) ^ (W[i - 2] >>> 10);
            W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25), ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + K[i] + W[i]) | 0;
            const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22), mj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + mj) | 0;
            hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h = [h[0] + a | 0, h[1] + b | 0, h[2] + c | 0, h[3] + d | 0, h[4] + e | 0, h[5] + f | 0, h[6] + g | 0, h[7] + hh | 0];
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}


        // ================= ADMIN: public/private, edit, Safe folder =================
        window.privateItems = [];
        let privateError = '';
        let adminVis = 'all';
        const SAFE_HASH = '1cb9ab7d0d0717e9afa0de25fdfb957b08a15be61264de922c057f459e4e87a2';
        const SAFE_ITEMS = 'notes_bazar_safe/items/', SAFE_FILES = 'notes_bazar_safe/files/';
        const MAX_BYTES = 7 * 1024 * 1024;

        function findAnyItem(id) { return window.allItems.find(i => i.id === id) || window.privateItems.find(i => i.id === id); }
        function cleanMeta(it) { const o = { ...it }; delete o.id; delete o.fileData; delete o.private; return o; }
        function fmtSize(b) { if (!b) return ''; return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
        function readAsDataUrl(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); }); }
        function dataUrlToBlob(d) {
            const i = d.indexOf(','), mime = (d.slice(5, i).split(';')[0]) || 'application/octet-stream';
            const bin = atob(d.slice(i + 1)), u = new Uint8Array(bin.length);
            for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
            return new Blob([u], { type: mime });
        }
        function rulesProblem(err) {
            const why = String((err && (err.code || err.message)) || err);
            if (/permission|denied/i.test(why)) {
                if (confirm('Firebase rules are not allowing the Private / Safe folder.\nShow the rules text? (one-time setup)')) openRulesHelp();
                return true;
            }
            return false;
        }

        async function loadPrivate() {
            try {
                const { db, ref, get, auth } = await loadSdk();
                if (!auth.currentUser) { window.privateItems = []; return; }
                const s = await get(ref(db, 'notes_bazar_private/items'));
                const v = s.exists() ? s.val() : {};
                window.privateItems = Object.keys(v).map(k => ({ id: k, ...v[k], private: true })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                privateError = '';
            } catch (e) { privateError = String((e && (e.code || e.message)) || e); window.privateItems = []; }
        }
        async function refreshAfterChange() {
            await window.loadCloudData();
            await window.loadAllRemaining();
            await loadPrivate();
            renderAdmin();
        }

        // ---- visibility switch (upload + edit forms) ----
        const visState = { upload: 'public', edit: 'public' };
        function paintVis(scope) {
            const on = { public: 'dynamic-btn text-white border-transparent', private: 'bg-amber-500 text-white border-transparent' };
            const off = 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300';
            ['public', 'private'].forEach(k => {
                const b = document.getElementById('vis-' + scope + '-' + k);
                if (b) b.className = 'vis-btn py-2.5 rounded-xl border font-bold flex items-center justify-center gap-2 ' + (visState[scope] === k ? on[k] : off);
            });
            const h = document.getElementById('vis-' + scope + '-hint');
            if (h) h.textContent = visState[scope] === 'private' ? 'Private: visible to the admin only, not to users.' : 'Public: visible to all users.';
        }
        window.setVis = function(scope, v) { visState[scope] = v; paintVis(scope); };

        // ---- save / move an item between public and private ----
        async function persistItem(it, patch, toVis) {
            const { db, ref, set, update, remove } = await loadSdk();
            const wasPriv = !!it.private, toPriv = toVis === 'private';
            const P = priv => priv ? { items: 'notes_bazar_private/items/', files: 'notes_bazar_private/files/' } : { items: 'notes_bazar_data/', files: 'notes_bazar_files/' };
            const src = P(wasPriv), dst = P(toPriv);
            const withFallback = async (fn, obj) => {
                try { await fn(obj); }
                catch (err) {
                    if (!obj.chapter) throw err;
                    const o = { ...obj }; const ch = o.chapter; o.chapter = null;
                    o.description = 'Chapter: ' + ch + ' \u2022 ' + (o.description || '');
                    await fn(o);
                }
            };
            if (wasPriv === toPriv) { await withFallback(o => update(ref(db, src.items + it.id), o), patch); return; }
            const meta = { ...cleanMeta(it), ...patch };
            if (!meta.chapter) delete meta.chapter;
            if (!it.fileLink) {
                const data = await getFileData(it);
                if (!data) throw new Error('File data not found, so it cannot be moved.');
                await set(ref(db, dst.files + it.id), data);
                meta.hasFile = true;
            }
            await withFallback(o => { const c = { ...o }; if (!c.chapter) delete c.chapter; return set(ref(db, dst.items + it.id), c); }, meta);
            await remove(ref(db, src.items + it.id));
            if (!it.fileLink) { try { await remove(ref(db, src.files + it.id)); } catch (e) {} }
        }

        window.toggleVisibility = async function(id) {
            const it = findAnyItem(id); if (!it) return;
            const toVis = it.private ? 'public' : 'private';
            if (!confirm(toVis === 'private' ? 'Make this item PRIVATE?\n(Users will not see it, only the admin.)' : 'Make this item PUBLIC?\n(All users will see it.)')) return;
            try { await persistItem(it, {}, toVis); await refreshAfterChange(); }
            catch (err) { console.error(err); if (!rulesProblem(err)) alert('Could not make the change: ' + String((err && (err.code || err.message)) || err)); }
        };

        let editId = null;
        function ensureOption(sel, val) { if (val && ![...sel.options].some(o => o.value === val)) sel.add(new Option(val, val)); }
        window.openEditItem = function(id) {
            const it = findAnyItem(id); if (!it) return;
            editId = id;
            const g = x => document.getElementById(x);
            g('editType').value = it.type || 'note';
            g('editTitle').value = it.title || '';
            g('editChapter').value = getChapter(it);
            g('editDesc').value = getDesc(it);
            ensureOption(g('editClass'), it.className); g('editClass').value = it.className || g('editClass').options[0].value;
            ensureOption(g('editSubject'), it.subject); g('editSubject').value = it.subject || g('editSubject').options[0].value;
            visState.edit = it.private ? 'private' : 'public'; paintVis('edit');
            g('editItemModal').classList.remove('hidden');
        };
        window.closeEditItem = function() { document.getElementById('editItemModal').classList.add('hidden'); };
        window.saveEditItem = async function(e) {
            e.preventDefault();
            const it = findAnyItem(editId); if (!it) return;
            const g = x => document.getElementById(x);
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'Saving...';
            const ch = g('editChapter').value.trim();
            const patch = { type: g('editType').value, title: g('editTitle').value.trim() || it.title, className: g('editClass').value, subject: g('editSubject').value, description: g('editDesc').value, chapter: ch || null };
            try { await persistItem(it, patch, visState.edit); closeEditItem(); await refreshAfterChange(); }
            catch (err) { console.error(err); if (!rulesProblem(err)) alert('Could not save: ' + String((err && (err.code || err.message)) || err)); }
            finally { btn.disabled = false; btn.textContent = 'Save changes'; }
        };

        // ---- Firebase rules helper ----
        window.openRulesHelp = async function() {
            let email = 'ADMIN_EMAIL_YAHAN';
            try { const { auth } = await loadSdk(); if (auth.currentUser && auth.currentUser.email) email = auth.currentUser.email; } catch (e) {}
            const cond = `"auth != null && auth.token.email === '${email}'"`;
            document.getElementById('rulesText').textContent =
`"notes_bazar_private": {
  ".read": ${cond},
  ".write": ${cond}
},
"notes_bazar_safe": {
  ".read": ${cond},
  ".write": ${cond}
}`;
            document.getElementById('rulesHelpModal').classList.remove('hidden');
        };
        window.closeRulesHelp = function() { document.getElementById('rulesHelpModal').classList.add('hidden'); };
        window.copyRules = function() {
            const txt = document.getElementById('rulesText').textContent;
            (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => alert('Copied!')).catch(() => {
                const r = document.createRange(); r.selectNodeContents(document.getElementById('rulesText')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); alert('Text selected. Now press Ctrl+C.');
            });
        };

        // ================= SAFE FOLDER =================
        let safeUnlocked = false, safeItems = [], safeFails = 0, safeLockUntil = 0, safeLast = Date.now(), safeBlob = '';
        const safeCache = {};
        setInterval(() => { if (safeUnlocked && Date.now() - safeLast > 5 * 60 * 1000) { lockSafe(); } }, 15000);
        ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (safeUnlocked) safeLast = Date.now(); }, true));

        function safeIcon(it) {
            const m = (it.mime || '').toLowerCase(), n = (it.fileName || it.name || '').toLowerCase();
            if (m.includes('pdf') || n.endsWith('.pdf')) return { i: 'fa-file-pdf', c: 'bg-red-50 text-red-500' };
            if (m.startsWith('image/')) return { i: 'fa-file-image', c: 'bg-emerald-50 text-emerald-500' };
            if (m.startsWith('video/')) return { i: 'fa-file-video', c: 'bg-purple-50 text-purple-500' };
            if (m.startsWith('audio/')) return { i: 'fa-file-audio', c: 'bg-pink-50 text-pink-500' };
            if (/\.(doc|docx)$/.test(n)) return { i: 'fa-file-word', c: 'bg-blue-50 text-blue-500' };
            if (/\.(xls|xlsx|csv)$/.test(n)) return { i: 'fa-file-excel', c: 'bg-green-50 text-green-600' };
            if (/\.(ppt|pptx)$/.test(n)) return { i: 'fa-file-powerpoint', c: 'bg-orange-50 text-orange-500' };
            if (/\.(zip|rar|7z)$/.test(n)) return { i: 'fa-file-zipper', c: 'bg-amber-50 text-amber-600' };
            return { i: 'fa-file', c: 'bg-slate-100 text-slate-500' };
        }

        function renderSafe(force) {
            const root = document.getElementById('safeRoot'); if (!root) return;
            const state = safeUnlocked ? 'open' : 'locked';
            if (!force && root.dataset.state === state) return;
            root.dataset.state = state;
            if (!safeUnlocked) {
                root.innerHTML = `
                <div class="max-w-sm mx-auto mt-6 sm:mt-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 text-center space-y-4">
                    <div class="dynamic-bg w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl shadow-lg"><i class="fa-solid fa-lock"></i></div>
                    <div><h3 class="font-extrabold text-lg">Safe Folder</h3><p class="text-xs text-slate-500 mt-1">Enter the password. The folder opens as soon as it is correct.</p></div>
                    <input id="safePass" type="password" inputmode="numeric" autocomplete="off" oninput="safeCheck(false)" onkeydown="if(event.key==='Enter')safeCheck(true)" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" class="w-full text-center tracking-[.35em] text-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 focus:outline-none">
                    <p id="safeMsg" class="text-xs text-rose-500 min-h-[1rem]"></p>
                    <button onclick="safeCheck(true)" class="w-full dynamic-btn text-white py-2.5 rounded-xl text-sm font-bold shadow"><i class="fa-solid fa-unlock mr-1.5"></i>Unlock</button>
                </div>`;
                setTimeout(() => { const i = document.getElementById('safePass'); if (i) i.focus(); }, 60);
                return;
            }
            root.innerHTML = `
                <div class="space-y-4">
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="relative flex-1 min-w-[180px]">
                            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-3.5 text-slate-400 text-xs"></i>
                            <input type="text" id="safeSearch" oninput="fillSafeList()" placeholder="Search the safe folder..." class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none">
                        </div>
                        <label class="dynamic-btn text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow cursor-pointer"><i class="fa-solid fa-plus mr-1"></i>Add file<input type="file" id="safeFileInput" multiple class="hidden" onchange="safeUpload(this)"></label>
                        <button onclick="openRulesHelp()" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl text-xs font-bold" title="Firebase rules"><i class="fa-solid fa-shield-halved"></i></button>
                        <button onclick="lockSafe()" class="bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold"><i class="fa-solid fa-lock mr-1"></i>Lock</button>
                    </div>
                    <p id="safeStatus" class="text-[11px] text-slate-400">It locks automatically after 5 minutes of inactivity. Max 7MB per file.</p>
                    <div id="safeList" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                </div>`;
            fillSafeList();
        }
        window.fillSafeList = function() {
            const el = document.getElementById('safeList'); if (!el) return;
            const q = ((document.getElementById('safeSearch') || {}).value || '').toLowerCase().trim();
            const list = safeItems.filter(i => !q || (i.name || '').toLowerCase().includes(q));
            el.innerHTML = list.length ? list.map(it => {
                const ic = safeIcon(it);
                return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col gap-3">
                    <div class="flex items-start gap-3">
                        <div class="w-11 h-11 rounded-xl ${ic.c} flex items-center justify-center text-lg shrink-0"><i class="fa-solid ${ic.i}"></i></div>
                        <div class="min-w-0"><h4 class="font-bold text-sm break-words leading-snug">${esc(it.name)}</h4><p class="text-[11px] text-slate-400 mt-0.5">${esc(fmtSize(it.size))}${it.size ? ' \u2022 ' : ''}${esc(fmtDate(it.createdAt))}</p></div>
                    </div>
                    <div class="flex gap-2 mt-auto">
                        <button onclick="safeOpen(${jsArg(it.id)})" class="flex-1 dynamic-btn text-white py-2 rounded-xl text-xs font-semibold shadow"><i class="fa-solid fa-eye mr-1"></i>Preview</button>
                        <button onclick="safeDownload(${jsArg(it.id)})" class="bg-slate-100 dark:bg-slate-800 px-3 rounded-xl text-xs" title="Download"><i class="fa-solid fa-download"></i></button>
                        <button onclick="safeRename(${jsArg(it.id)})" class="bg-slate-100 dark:bg-slate-800 px-3 rounded-xl text-xs" title="Rename"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="safeDelete(${jsArg(it.id)})" class="bg-red-50 text-red-600 px-3 rounded-xl text-xs hover:bg-red-100" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div></div>`;
            }).join('') : `<div class="col-span-full text-center text-xs text-slate-400 py-14 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700"><i class="fa-solid fa-folder-open text-2xl mb-2 block"></i>${safeItems.length ? 'No matches found.' : 'The safe folder is empty. Use "Add file" to store any file.'}</div>`;
        };

        window.safeCheck = function(manual) {
            const inp = document.getElementById('safePass'); if (!inp) return;
            const msg = document.getElementById('safeMsg'), v = inp.value;
            if (Date.now() < safeLockUntil) { if (manual) msg.textContent = 'Too many wrong attempts. Wait ' + Math.ceil((safeLockUntil - Date.now()) / 1000) + ' seconds.'; return; }
            if (!v) return;
            if (sha256('nb-safe-v1:' + v) === SAFE_HASH) { safeFails = 0; openSafe(); return; }
            if (manual) {
                safeFails++; inp.value = ''; msg.textContent = 'Wrong password';
                inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
                if (safeFails >= 5) { safeFails = 0; safeLockUntil = Date.now() + 30000; msg.textContent = '5 wrong attempts. Wait 30 seconds.'; }
            }
        };
        async function openSafe() {
            safeUnlocked = true; safeLast = Date.now(); safeItems = [];
            renderSafe(true);
            const st = document.getElementById('safeStatus'); if (st) st.textContent = 'Loading...';
            try {
                const { db, ref, get } = await loadSdk();
                const s = await get(ref(db, 'notes_bazar_safe/items'));
                const v = s.exists() ? s.val() : {};
                safeItems = Object.keys(v).map(k => ({ id: k, ...v[k] })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                if (st) st.textContent = 'It locks automatically after 5 minutes of inactivity. Max 7MB per file.';
            } catch (e) {
                console.error(e);
                if (st) st.textContent = 'Could not load the safe folder (' + String((e && (e.code || e.message)) || e) + ').';
                rulesProblem(e);
            }
            fillSafeList();
        }
        window.lockSafe = function() {
            safeUnlocked = false; safeItems = []; closeSafePreview();
            Object.keys(safeCache).forEach(k => delete safeCache[k]);
            renderSafe(true);
        };
        async function safeData(id) {
            if (safeCache[id]) return safeCache[id];
            const { db, ref, get } = await loadSdk();
            const s = await get(ref(db, SAFE_FILES + id));
            if (!s.exists()) throw new Error('File data not found.');
            safeCache[id] = s.val(); return safeCache[id];
        }
        window.safeUpload = async function(input) {
            const files = [...input.files]; input.value = '';
            const st = document.getElementById('safeStatus');
            if (!files.length) return;
            try {
                const { db, ref, set, push, remove, auth } = await loadSdk();
                if (!auth.currentUser) { alert('Admin session expired. Please log in again.'); return; }
                let ok = 0;
                for (let n = 0; n < files.length; n++) {
                    const f = files[n];
                    if (f.size > MAX_BYTES) { alert(f.name + ' is larger than 7MB, skipped.'); continue; }
                    if (st) st.textContent = 'Uploading ' + (n + 1) + '/' + files.length + ': ' + f.name;
                    const data = await readAsDataUrl(f);
                    const r = push(ref(db, 'notes_bazar_safe/items'));
                    await set(ref(db, SAFE_FILES + r.key), data);
                    try { await set(r, { name: f.name, fileName: f.name, mime: f.type || '', size: f.size, createdAt: Date.now() }); }
                    catch (e) { try { await remove(ref(db, SAFE_FILES + r.key)); } catch (e2) {} throw e; }
                    safeItems.unshift({ id: r.key, name: f.name, fileName: f.name, mime: f.type || '', size: f.size, createdAt: Date.now() });
                    ok++; fillSafeList();
                }
                if (st) st.textContent = ok + ' file safe me rakh di.';
            } catch (e) {
                console.error(e);
                if (st) st.textContent = 'Upload fail: ' + String((e && (e.code || e.message)) || e);
                rulesProblem(e);
            }
        };
        window.safeOpen = async function(id) {
            const it = safeItems.find(i => i.id === id); if (!it) return;
            const modal = document.getElementById('safePreviewModal'), body = document.getElementById('safePrevBody');
            document.getElementById('safePrevTitle').textContent = it.name;
            document.getElementById('safePrevDl').onclick = () => safeDownload(id);
            body.innerHTML = '<p class="text-center text-xs text-slate-400 py-10">Loading...</p>';
            modal.classList.remove('hidden');
            try {
                const data = await safeData(id);
                const blob = dataUrlToBlob(data);
                if (safeBlob) { try { URL.revokeObjectURL(safeBlob); } catch (e) {} }
                safeBlob = URL.createObjectURL(blob);
                const m = (it.mime || blob.type || '').toLowerCase(), n = (it.fileName || it.name || '').toLowerCase();
                if (m.startsWith('image/')) body.innerHTML = `<img src="${safeBlob}" class="max-w-full max-h-[70vh] mx-auto rounded-xl" alt="">`;
                else if (m.includes('pdf') || n.endsWith('.pdf')) body.innerHTML = `<iframe src="${safeBlob}" class="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-700" title="Preview"></iframe>`;
                else if (m.startsWith('video/')) body.innerHTML = `<video src="${safeBlob}" controls class="w-full max-h-[70vh] rounded-xl"></video>`;
                else if (m.startsWith('audio/')) body.innerHTML = `<audio src="${safeBlob}" controls class="w-full"></audio>`;
                else if (m.startsWith('text/') || /\.(txt|md|csv|json|log)$/.test(n)) { const txt = await blob.text(); body.innerHTML = `<pre class="whitespace-pre-wrap break-words text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-xl max-h-[70vh] overflow-auto">${esc(txt.slice(0, 200000))}</pre>`; }
                else body.innerHTML = '<p class="text-center text-xs text-slate-500 py-12">Preview is not available for this file type. Use Download above.</p>';
            } catch (e) { body.innerHTML = '<p class="text-center text-xs text-red-500 py-12">Could not load the file.</p>'; }
        };
        window.closeSafePreview = function() {
            const m = document.getElementById('safePreviewModal'); if (m) m.classList.add('hidden');
            const b = document.getElementById('safePrevBody'); if (b) b.innerHTML = '';
            if (safeBlob) { try { URL.revokeObjectURL(safeBlob); } catch (e) {} safeBlob = ''; }
        };
        window.safeDownload = async function(id) {
            const it = safeItems.find(i => i.id === id); if (!it) return;
            try {
                const url = URL.createObjectURL(dataUrlToBlob(await safeData(id)));
                const a = document.createElement('a'); a.href = url; a.download = it.fileName || it.name || 'file';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 4000);
            } catch (e) { alert('Download failed.'); }
        };
        window.safeRename = async function(id) {
            const it = safeItems.find(i => i.id === id); if (!it) return;
            const nn = (prompt('Naya naam:', it.name) || '').trim();
            if (!nn || nn === it.name) return;
            try { const { db, ref, set } = await loadSdk(); await set(ref(db, SAFE_ITEMS + id + '/name'), nn); it.name = nn; fillSafeList(); }
            catch (e) { alert('Rename failed.'); }
        };
        window.safeDelete = async function(id) {
            const it = safeItems.find(i => i.id === id); if (!it) return;
            if (!confirm('"' + it.name + '" will be permanently deleted from the Safe folder. Continue?')) return;
            try {
                const { db, ref, remove } = await loadSdk();
                await remove(ref(db, SAFE_ITEMS + id)); try { await remove(ref(db, SAFE_FILES + id)); } catch (e) {}
                delete safeCache[id]; safeItems = safeItems.filter(i => i.id !== id); fillSafeList();
            } catch (e) { alert('Delete failed.'); }
        };

        window.adminSetVis = function(v) { adminVis = v; renderAdmin(); };

        window.openAdminDashboard = async function() {
            document.getElementById('adminDashboardModal').classList.remove('hidden');
            renderAdmin();
            await loadMessages();
            await loadPrivate();
            await window.loadAllRemaining();
            renderAdmin();
            window.migrateOldFiles();
        };

        window.closeAdminDashboard = function() { lockSafe(); 
            document.getElementById('adminDashboardModal').classList.add('hidden'); 
            window.loadCloudData(); 
        };

        // ---------- Admin dashboard (tabs: Overview / Uploads / Support / Complaints / Wishes) ----------
        let adminTab = 'overview';
        let adminType = 'all';
        const ADMIN_TABS = [
            { id: 'overview', label: 'Overview', icon: 'fa-chart-pie' },
            { id: 'uploads', label: 'Uploads', icon: 'fa-cloud' },
            { id: 'support', label: 'Support', icon: 'fa-headset' },
            { id: 'complain', label: 'Complaints', icon: 'fa-circle-exclamation' },
            { id: 'wish', label: 'User Requests', icon: 'fa-lightbulb' },
            { id: 'safe', label: 'Safe', icon: 'fa-lock' }
        ];
        const TYPE_STYLE = {
            note: { cls: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300', label: 'Note' },
            book: { cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300', label: 'Book' },
            pyq: { cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300', label: 'PYQ' }
        };
        const MSG_STYLE = {
            support: { icon: 'fa-headset', color: 'bg-blue-500', label: 'Support' },
            complain: { icon: 'fa-circle-exclamation', color: 'bg-rose-500', label: 'Complaint' },
            wish: { icon: 'fa-lightbulb', color: 'bg-teal-500', label: 'User Request' }
        };
        const fmtDate = ts => ts ? new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

        window.adminSwitchTab = function(t) { adminTab = t; renderAdmin(); const b = document.querySelector('#adminDashboardModal .overflow-y-auto'); if (b) b.scrollTop = 0; };
        window.adminSetType = function(t) { adminType = t; renderAdmin(); };
        window.adminRender = function() { renderAdmin(); };

        function msgCard(m) {
            const st = MSG_STYLE[m.type] || MSG_STYLE.support;
            let chips = '', body = String(m.message || '');
            if (m.type === 'wish') {
                const mt = body.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
                if (mt) {
                    chips = mt[1].split('|').map(x => `<span class="bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-[10px] font-bold px-2 py-0.5 rounded-lg">${esc(x.trim())}</span>`).join('');
                    body = mt[2];
                }
            }
            const contact = m.email && m.email !== '-' ? `<span class="text-[11px] text-slate-400"><i class="fa-solid fa-at mr-1"></i>${esc(m.email)}</span>` : '';
            return `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                <div class="flex items-start gap-3">
                    <div class="${st.color} text-white w-10 h-10 rounded-xl flex items-center justify-center shrink-0"><i class="fa-solid ${st.icon}"></i></div>
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span class="font-bold text-sm">${esc(m.name || 'Anonymous')}</span>${contact}
                            <span class="text-[10px] text-slate-400 ml-auto">${fmtDate(m.createdAt)}</span>
                        </div>
                        ${chips ? `<div class="flex flex-wrap gap-1 mt-1.5">${chips}</div>` : ''}
                        <p class="text-xs text-slate-700 dark:text-slate-300 mt-2 leading-relaxed break-words">${esc(body)}</p>
                        ${m.reply ? `<div class="mt-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 rounded-xl px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300"><b>Reply:</b> ${esc(m.reply)}</div>` : ''}
                        <div class="flex items-center gap-2 mt-3">
                            <span class="text-[10px] font-bold px-2 py-1 rounded-lg ${m.reply ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${m.reply ? 'Replied' : 'Pending'}</span>
                            <button onclick="openReplyModal(${jsArg(m.id)})" class="ml-auto dynamic-btn text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow"><i class="fa-solid fa-reply mr-1"></i>${m.reply ? 'Edit reply' : 'Reply'}</button>
                            <button onclick="deleteMessage(${jsArg(m.id)})" class="bg-red-50 text-red-600 p-2 rounded-xl text-xs hover:bg-red-100" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div></div>`;
        }

        function itemCard(item) {
            const ts = TYPE_STYLE[item.type || 'note'] || TYPE_STYLE.note;
            const priv = !!item.private, ch = getChapter(item), desc = getDesc(item);
            return `<div class="bg-white dark:bg-slate-900 rounded-2xl border ${priv ? 'border-amber-300 dark:border-amber-700' : 'border-slate-200 dark:border-slate-800'} p-4 shadow-sm flex flex-col gap-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg ${ts.cls}">${ts.label}</span>
                        <span class="text-[10px] font-bold px-2 py-1 rounded-lg ${priv ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}"><i class="fa-solid ${priv ? 'fa-lock' : 'fa-globe'} mr-1"></i>${priv ? 'Private' : 'Public'}</span>
                    </div>
                    <span class="text-[10px] text-slate-400 shrink-0">${fmtDate(item.createdAt)}</span>
                </div>
                <div>
                    <h4 class="font-bold text-sm leading-snug break-words">${esc(item.title)}</h4>
                    <p class="text-[11px] text-slate-500 mt-0.5">${esc(item.className || '-')} \u2022 ${esc(item.subject || '-')}${ch ? ' \u2022 ' + esc(ch) : ''}</p>
                </div>
                ${desc ? `<p class="text-[11px] text-slate-500 line-clamp-2">${esc(desc)}</p>` : ''}
                <div class="text-[11px] text-slate-400 flex items-center gap-1.5 truncate"><i class="fa-solid ${item.fileLink ? 'fa-link text-blue-500' : 'fa-file-pdf text-red-500'}"></i><span class="truncate">${item.fileLink ? 'Google Drive link' : esc(item.fileName || 'File')}</span></div>
                <div class="flex gap-2 mt-auto">
                    <button onclick="openPreview(${jsArg(item.id)})" class="flex-1 dynamic-btn text-white py-2 rounded-xl text-xs font-semibold shadow"><i class="fa-solid fa-eye mr-1"></i>Preview</button>
                    <button onclick="openEditItem(${jsArg(item.id)})" class="bg-slate-100 dark:bg-slate-800 px-3 rounded-xl text-xs" title="Edit" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="toggleVisibility(${jsArg(item.id)})" class="${priv ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} px-3 rounded-xl text-xs" title="${priv ? 'Make public' : 'Make private'}" aria-label="Visibility"><i class="fa-solid ${priv ? 'fa-globe' : 'fa-lock'}"></i></button>
                    <button onclick="deleteCloudItem(${jsArg(item.id)})" class="bg-red-50 text-red-600 px-3 rounded-xl text-xs hover:bg-red-100" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>
                </div></div>`;
        }

        function renderAdmin() {
            const items = window.allItems, msgs = window.messages;
            const of = ty => msgs.filter(m => m.type === ty);
            const pending = msgs.filter(m => !m.reply);
            const count = { overview: 0, uploads: items.length + window.privateItems.length, support: of('support').length, complain: of('complain').length, wish: of('wish').length };
            const pend = { support: of('support').filter(m => !m.reply).length, complain: of('complain').filter(m => !m.reply).length, wish: of('wish').filter(m => !m.reply).length };

            // tabs
            document.getElementById('adminTabs').innerHTML = ADMIN_TABS.map(t => {
                const active = t.id === adminTab;
                const badge = (t.id === 'overview' || t.id === 'safe') ? '' : `<span class="${active ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700'} text-[10px] px-1.5 py-0.5 rounded-full">${count[t.id]}</span>${pend[t.id] ? `<span class="w-2 h-2 rounded-full bg-amber-400"></span>` : ''}`;
                return `<button onclick="adminSwitchTab('${t.id}')" class="shrink-0 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${active ? 'dynamic-btn text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}"><i class="fa-solid ${t.icon}"></i>${t.label}${badge}</button>`;
            }).join('');
            ADMIN_TABS.forEach(t => { const el = document.getElementById('adminPanel-' + t.id); if (el) el.classList.toggle('hidden', t.id !== adminTab); });

            if (adminTab === 'overview') {
                const stat = (label, val, icon, color) => `<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center gap-3"><div class="${color} text-white w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0"><i class="fa-solid ${icon}"></i></div><div><div class="text-2xl font-extrabold leading-none">${val}</div><div class="text-[11px] text-slate-500 mt-1">${label}</div></div></div>`;
                document.getElementById('adminStats').innerHTML =
                    stat('Public / Private', items.length + ' / ' + window.privateItems.length, 'fa-cloud', 'bg-indigo-500') +
                    stat('Notes / Books / PYQ', `${items.filter(i => (i.type || 'note') === 'note').length}/${items.filter(i => i.type === 'book').length}/${items.filter(i => i.type === 'pyq').length}`, 'fa-layer-group', 'bg-emerald-500') +
                    stat('Support + Complaints', of('support').length + of('complain').length, 'fa-headset', 'bg-blue-500') +
                    stat('User requests', of('wish').length, 'fa-lightbulb', 'bg-teal-500');
                const pl = [...pending].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);
                document.getElementById('adminPending').innerHTML = pl.length ? pl.map(m => {
                    const st = MSG_STYLE[m.type] || MSG_STYLE.support;
                    return `<button onclick="adminSwitchTab('${m.type in MSG_STYLE ? m.type : 'support'}')" class="w-full text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start gap-3 hover:border-indigo-400"><span class="${st.color} text-white w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0"><i class="fa-solid ${st.icon}"></i></span><span class="min-w-0"><span class="block text-xs font-bold">${esc(st.label)} • ${esc(m.name || 'Anonymous')}</span><span class="block text-[11px] text-slate-500 truncate">${esc(m.message)}</span></span></button>`;
                }).join('') : `<p class="text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">All messages have been answered 🎉</p>`;
                const latest = [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);
                document.getElementById('adminLatest').innerHTML = latest.length ? latest.map(i => {
                    const ts = TYPE_STYLE[i.type || 'note'] || TYPE_STYLE.note;
                    return `<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3"><span class="text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg ${ts.cls}">${ts.label}</span><span class="min-w-0 flex-1"><span class="block text-xs font-bold truncate">${esc(i.title)}</span><span class="block text-[10px] text-slate-400">${esc(i.className || '')} • ${esc(i.subject || '')}</span></span><button onclick="openPreview(${jsArg(i.id)})" class="text-indigo-600 text-xs font-semibold px-2"><i class="fa-solid fa-eye"></i></button></div>`;
                }).join('') : `<p class="text-xs text-slate-400 text-center p-4">Nothing uploaded yet.</p>`;
            }

            if (adminTab === 'uploads') {
                const tchips = [['all', 'All'], ['note', 'Notes'], ['book', 'Books'], ['pyq', 'PYQ']];
                const vchips = [['all', 'Sab'], ['public', 'Public'], ['private', 'Private']];
                const chipCls = on => 'shrink-0 px-4 py-2 rounded-xl text-xs font-bold ' + (on ? 'dynamic-btn text-white shadow' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300');
                document.getElementById('adminTypeChips').innerHTML =
                    tchips.map(([v, l]) => `<button onclick="adminSetType('${v}')" class="${chipCls(adminType === v)}">${l}</button>`).join('') +
                    '<span class="shrink-0 w-px bg-slate-300 dark:bg-slate-700 mx-1"></span>' +
                    vchips.map(([v, l]) => `<button onclick="adminSetVis('${v}')" class="${chipCls(adminVis === v)}">${v === 'private' ? '<i class="fa-solid fa-lock mr-1"></i>' : ''}${l}</button>`).join('');
                const q = (document.getElementById('adminSearch').value || '').toLowerCase().trim();
                const all = [...items, ...window.privateItems].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                const list = all.filter(i => (adminType === 'all' || (i.type || 'note') === adminType)
                    && (adminVis === 'all' || (adminVis === 'private') === !!i.private)
                    && (!q || [i.title, i.subject, i.className, getChapter(i), i.description].join(' ').toLowerCase().includes(q)));
                const warn = privateError ? `<div class="col-span-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 text-xs text-amber-800 dark:text-amber-300 flex flex-wrap items-center gap-3"><span class="flex-1 min-w-[200px]">Private items could not be loaded (${esc(privateError)}). The Firebase rules need to be set.</span><button onclick="openRulesHelp()" class="dynamic-btn text-white px-3 py-2 rounded-xl font-bold">Show rules</button></div>` : '';
                document.getElementById('adminItemsGrid').innerHTML = warn + (list.length ? list.map(itemCard).join('') : `<div class="col-span-full text-center text-xs text-slate-400 py-12 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">No matches found.</div>`);
            }
            if (adminTab === 'safe') renderSafe();

            ['support', 'complain', 'wish'].forEach(ty => {
                if (adminTab !== ty) return;
                const list = of(ty).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                const st = MSG_STYLE[ty];
                document.getElementById('adminList-' + ty).innerHTML = list.length ? list.map(msgCard).join('') : `<div class="text-center text-xs text-slate-400 py-14 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700"><i class="fa-solid ${st.icon} text-2xl mb-2 block"></i>No ${st.label.toLowerCase()} yet.</div>`;
            });
        }
        // old names still used by the rest of the code
        function renderAdminTable() { renderAdmin(); }
        function renderAdminMessagesTable() { renderAdmin(); }

        window.deleteCloudItem = async function(id) {
            const it = findAnyItem(id), priv = !!(it && it.private);
            if (!confirm(priv ? 'Delete this PRIVATE item?' : 'Delete this item from cloud?')) return;
            try {
                const { db, ref, remove } = await loadSdk();
                if (priv) { await remove(ref(db, 'notes_bazar_private/items/' + id)); try { await remove(ref(db, 'notes_bazar_private/files/' + id)); } catch (e) {} }
                else { await remove(ref(db, 'notes_bazar_data/' + id)); try { await remove(ref(db, 'notes_bazar_files/' + id)); } catch (e) {} }
                alert("Deleted successfully!");
                await refreshAfterChange();
            } catch (err) {
                alert("Error deleting item.");
            }
        };

        window.deleteMessage = async function(id) {
            if (confirm("Delete this message?")) {
                try {
                    const { db, ref, remove } = await loadSdk();
                    await remove(ref(db, 'notes_bazar_messages/' + id));
                    alert("Deleted!");
                    await loadMessages();
                    renderAdminMessagesTable();
                } catch(e) {
                    alert("Error deleting message");
                }
            }
        };

        let currentReplyId = null;
        window.openReplyModal = function(id) {
            const m = window.messages.find(x => x.id === id) || {};
            currentReplyId = id;
            document.getElementById('replyTargetInfo').textContent = `Replying to ${m.type || ''} from ${m.name || ''}${m.email && m.email !== '-' ? ' (' + m.email + ')' : ''}`;
            document.getElementById('adminReplyText').value = '';
            document.getElementById('adminReplyModal').classList.remove('hidden');
        };
        window.closeReplyModal = function() { document.getElementById('adminReplyModal').classList.add('hidden'); };

        window.sendAdminReply = async function(e) {
            e.preventDefault();
            const replyText = document.getElementById('adminReplyText').value.trim();
            if(!replyText || !currentReplyId) return;
            try {
                const { db, ref, set } = await loadSdk();
                await set(ref(db, 'notes_bazar_messages/' + currentReplyId + '/reply'), replyText);
                alert("Reply sent successfully!");
                closeReplyModal();
                await loadMessages();
                renderAdminMessagesTable();
            } catch(err) {
                alert("Failed to send reply.");
            }
        };

        window.openUploadModal = function() { visState.upload = 'public'; paintVis('upload'); document.getElementById('uploadModal').classList.remove('hidden'); };
        window.closeUploadModal = function() { document.getElementById('uploadModal').classList.add('hidden'); };

        window.handleFileSelect = function(e) {
            const file = e.target.files[0];
            if (file) {
                if(file.size > 7 * 1024 * 1024) {
                    alert("The file is larger than 7MB (Firebase limit). Please use the Google Drive link option!");
                    e.target.value = "";
                    return;
                }
                selectedFileName = file.name;
                const reader = new FileReader();
                reader.onload = function(event) { selectedFileBase64 = event.target.result; };
                reader.readAsDataURL(file);
            }
        };

        window.handleUploadItem = async function(e) {
            e.preventDefault();
            const isLinkActive = !document.getElementById('linkUploadSection').classList.contains('hidden');
            if (!isLinkActive && !selectedFileBase64) { alert('Please select a file first (it can take 1-2 seconds to load).'); return; }
            const submitBtn = e.target.querySelector('button[type=submit]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading...'; }

            let classVal = document.getElementById('uploadClass').value;
            if (classVal === 'Other') classVal = document.getElementById('uploadCustomClass').value.trim();

            let subjectVal = document.getElementById('uploadSubject').value;
            if (subjectVal === 'Other') subjectVal = document.getElementById('uploadCustomSubject').value.trim();

            const newItem = {
                type: document.getElementById('uploadCategoryType').value, // note, book, pyq
                title: document.getElementById('uploadTitle').value,
                className: classVal,
                subject: subjectVal,
                description: document.getElementById('uploadDesc').value,
                createdAt: Date.now()
            };
            const chapterVal = (document.getElementById('uploadChapter').value || '').trim();
            if (chapterVal) newItem.chapter = chapterVal;

            if (isLinkActive) {
                newItem.fileLink = document.getElementById('uploadLink').value;
                newItem.fileName = "Drive Folder / PDF";
            } else {
                newItem.hasFile = true;
                newItem.fileName = selectedFileName || "document.pdf";
            }

            const isPrivate = visState.upload === 'private';
            const ITEMS_PATH = isPrivate ? 'notes_bazar_private/items' : 'notes_bazar_data';
            const FILES_PATH = isPrivate ? 'notes_bazar_private/files' : 'notes_bazar_files';
            let newItemRef = null, sdkRef = null;
            try {
                const { db, ref, set, push, auth } = await loadSdk();
                sdkRef = { db, ref };
                if (!auth.currentUser) { alert('Admin session expired. Log in again, then upload.'); return; }
                if (!isLinkActive && selectedFileBase64.length > 9800000) { alert('The file is too large (Firebase 10MB limit). Use the Google Drive link option.'); return; }
                newItemRef = push(ref(db, ITEMS_PATH));
                if (!isLinkActive) await set(ref(db, FILES_PATH + '/' + newItemRef.key), selectedFileBase64);
                try {
                    await set(newItemRef, newItem);
                } catch (firstErr) {
                    // Firebase rules may not allow the new "chapter" field: save it inside the description instead
                    if (!newItem.chapter) throw firstErr;
                    const ch = newItem.chapter; delete newItem.chapter;
                    newItem.description = 'Chapter: ' + ch + ' • ' + (newItem.description || '');
                    await set(newItemRef, newItem);
                }

                alert(isPrivate ? "Saved as private (visible to the admin only)!" : "Published to cloud successfully!");
                visState.upload = 'public'; paintVis('upload');
                selectedFileBase64 = ""; selectedFileName = "";
                closeUploadModal();
                document.getElementById('uploadForm').reset();
                await window.loadCloudData();
                openAdminDashboard();
            } catch (error) {
                console.error(error);
                try { if (newItemRef && sdkRef && !isLinkActive) { const { remove } = await loadSdk(); await remove(sdkRef.ref(sdkRef.db, FILES_PATH + '/' + newItemRef.key)); } } catch (e2) {}
                const why = String((error && (error.code || error.message)) || error);
                const hint = /permission|denied/i.test(why) ? 'Firebase Rules are not allowing this upload (check the admin login or the rules).'
                    : /large|size|quota|limit/i.test(why) ? 'The file is large. Use the Google Drive link option.'
                    : /network|fetch|offline/i.test(why) ? 'Check your internet connection.' : 'Check the console (F12) for the error.';
                if (isPrivate && /permission|denied/i.test(why)) { rulesProblem(error); }
                else alert("Failed to publish item.\nError: " + why + "\n" + hint);
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Publish Material to Cloud'; }
            }
        };

        async function pushMessage(m) {
            const { db, ref, set, push } = await loadSdk();
            await set(push(ref(db, 'notes_bazar_messages')), { ...m, createdAt: Date.now(), reply: "" });
        }

        window.submitUserMessage = async function(e, type) {
            e.preventDefault();
            const name = document.getElementById(`${type}Name`).value;
            const email = document.getElementById(`${type}Email`).value;
            const message = document.getElementById(`${type}Msg`).value;
            try {
                await pushMessage({ type, name, email, message });
                alert(`${type.charAt(0).toUpperCase() + type.slice(1)} submitted successfully!`);
                closeAllModals();
                document.getElementById(`${type}Form`).reset();
            } catch(err) {
                alert("Submission failed.");
            }
        };

        // "What if you want?" -> goes to admin as type "wish"
        window.submitWish = async function(e) {
            e.preventDefault();
            const g = id => document.getElementById(id).value.trim();
            const message = `[${g('wishType')} | ${g('wishClass')} | ${g('wishSubject')}] ${g('wishMsg')}`;
            try {
                await pushMessage({ type: 'wish', name: g('wishName') || 'Anonymous', email: g('wishContact') || '-', message });
                alert("Request received! We will try to upload it soon. 🙏");
                closeModal('wishModal');
                document.getElementById('wishForm').reset();
            } catch (err) {
                alert("Submission failed. Check your internet connection.");
            }
        };

        // ================= BAZAR AI (all-in-one agent) =================
        // Default uses a free, key-less OpenAI-compatible endpoint. To use a stronger model
        // (Gemini / OpenAI / Claude via your own proxy) just change endpoint / model / apiKey here.
        // A web page cannot keep a secret key safe, so there are two proper ways to switch the AI on (see SETUP.md):
        //  1) proxyUrl  -> your own free Cloudflare Worker (ai-proxy-worker.js) that holds the Gemini key. [recommended]
        //  2) providers[].apiKey -> paste a Gemini key here and restrict it to your website in Google AI Studio.
        // With neither, only the built-in offline helper answers.
        const AI_CONFIG = {
            proxyUrl: 'https://bazarai.skc47313.workers.dev',   // Cloudflare Worker (Groq AI)
            timeoutMs: 9000,
            providers: [
                { name: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', apiKey: '' },
                { name: 'pollinations', endpoint: 'https://gen.pollinations.ai/v1/chat/completions', model: 'openai', apiKey: '', optionalKey: true },
                { name: 'pollinations-legacy', endpoint: 'https://text.pollinations.ai/openai', model: 'openai', apiKey: '', optionalKey: true }
            ]
        };
        if (!AI_CONFIG.proxyUrl && !AI_CONFIG.providers.some(p => p.apiKey)) console.warn('Bazar AI: no proxyUrl / apiKey set, so only the offline helper (and the unreliable keyless fallback) will answer. See SETUP.md.');
        const aiFailUntil = {};   // provider -> timestamp until which we skip it (avoids long waits)

        const AI_BASE = `You are "Bazar AI", the built-in assistant of Notes Bazar, a study platform for Indian school students (Class 1-12; subjects Science, Math, Hindi, English, SST, Maithili) with Notes, Reference Books and PYQs.
Language: reply in the same language/style the user writes in (Hindi, Hinglish, English or Maithili). Keep it simple, friendly and short unless the user asks for detail. Use short paragraphs and simple lists.
You can do EVERYTHING a good assistant can: explain doubts step by step, solve maths, summarize chapters, make short notes / MCQs / quizzes, essays, letters, translations, study timetables, exam tips, career guidance, coding, general knowledge and everyday questions.
Notes Bazar items: if "Matching items" are provided below, recommend them by title and tell the student to tap them. NEVER invent files, links or titles. If nothing matches, say it is not uploaded yet and suggest the "What if you want?" option on the home page.
Be honest: if you are not sure, say so. Never claim to be human.
Emotional safety: if the student sounds stressed, sad or lonely, listen first, be warm and practical. If they mention self-harm or suicide, respond with care, encourage them to talk to a trusted adult right now, and share the free 24x7 Tele-MANAS helpline in India: 14416 (or local emergency services). Never give methods.`;
        const AI_MODE = {
            auto: AI_BASE,
            study: AI_BASE + '\nMODE: Study focus. Prefer clear step-by-step teaching, examples, and a quick practice question at the end.',
            emotional: AI_BASE + '\nMODE: Support focus. Prioritise empathy, calm tone and small practical steps. Not a doctor; do not diagnose.'
        };
        let aiHistory = [];
        let aiBusy = false;

        const AI_SYN = { maths: 'math', ganit: 'math', 'गणित': 'math', vigyan: 'science', 'विज्ञान': 'science', angrezi: 'english', 'हिंदी': 'hindi', kitab: 'book', kitaab: 'book', books: 'book', 'किताब': 'book', notes: 'note', pyqs: 'pyq', paper: 'pyq', papers: 'pyq' };
        const AI_STOP = new Set(['the','is','are','me','mujhe','mere','mera','meri','hai','hain','ka','ki','ke','ko','kya','aur','for','of','to','a','an','in','on','please','pls','chahiye','chahiy','do','de','dena','dedo','bhai','class','kaise','how','what','and','i','my','you','se','par','hi','ho','h','want','need','send','dikhao','dhundo','find','search','koi','kuch','wala','wali','chapter']);
        const AI_TYPEW = ['note', 'book', 'pyq'];

        function aiTokens(s) {
            return String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(w => AI_SYN[w] || w);
        }

        // Look for matching items inside Notes Bazar (only when the user is asking for material)
        async function findRelated(text) {
            const toks = aiTokens(text);
            const wantTypes = toks.filter(t => AI_TYPEW.includes(t));
            const intent = wantTypes.length > 0 || toks.some(t => ['pdf', 'material', 'download'].includes(t));
            if (!intent) return { intent: false, list: [] };
            if (window.hasMore) { try { await window.loadAllRemaining(); } catch (e) {} }
            const content = toks.filter(t => !AI_TYPEW.includes(t) && !AI_STOP.has(t) && !['pdf', 'material', 'download'].includes(t) && (t.length > 1 || /\d/.test(t)));
            const scored = [];
            window.allItems.forEach(it => {
                if (wantTypes.length && !wantTypes.includes(it.type || 'note')) return;
                const hay = new Set(aiTokens([it.title, it.subject, it.className, it.description].join(' ')));
                let sc = 0;
                content.forEach(t => { if (hay.has(t)) sc++; else if (t.length >= 4 && [...hay].some(w => w.length >= 4 && (w.startsWith(t) || t.startsWith(w)))) sc += 0.5; });
                if (content.length === 0 || sc > 0) scored.push({ it, sc });
            });
            scored.sort((a, b) => b.sc - a.sc || (b.it.createdAt || 0) - (a.it.createdAt || 0));
            return { intent: true, list: scored.slice(0, 4).map(x => x.it) };
        }

        function aiFmt(t) {
            return esc(t).replace(/^#{1,6}\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^\s*[-*]\s+/gm, '• ').replace(/\n/g, '<br>');
        }

        function aiRelatedHtml(list) {
            if (!list.length) return '';
            return `<div class="mt-2 space-y-1.5">` + list.map(i => `
                <button onclick="closeModal('aiModal');openPreview(${jsArg(i.id)})" class="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs hover:border-indigo-400">
                    <span class="font-bold block">${esc(i.title)}</span>
                    <span class="block text-[10px] text-slate-400">${esc(i.type || 'note')} • ${esc(i.className || '')} • ${esc(i.subject || '')}</span>
                </button>`).join('') + `</div>`;
        }

        async function callAi(messages) {
            let lastErr = new Error('no provider available');
            if (AI_CONFIG.proxyUrl && (aiFailUntil.proxy || 0) <= Date.now()) {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), AI_CONFIG.timeoutMs + 6000);
                try {
                    const r = await fetch(AI_CONFIG.proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify({ messages }) });
                    if (!r.ok) throw new Error('proxy HTTP ' + r.status);
                    const j = await r.json();
                    if (!j || !j.reply) throw new Error('proxy empty reply');
                    return String(j.reply).trim();
                } catch (e) { console.warn('AI proxy failed', e); aiFailUntil.proxy = Date.now() + 60000; lastErr = e; }
                finally { clearTimeout(timer); }
            }
            for (const p of AI_CONFIG.providers) {
                if (!p.optionalKey && !p.apiKey) continue;                 // needs a key but none set
                if ((aiFailUntil[p.name] || 0) > Date.now()) continue;     // failed recently
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), AI_CONFIG.timeoutMs);
                try {
                    const headers = { 'Content-Type': 'application/json' };
                    if (p.apiKey) headers['Authorization'] = 'Bearer ' + p.apiKey;
                    const r = await fetch(p.endpoint, { method: 'POST', headers, signal: ctrl.signal, body: JSON.stringify({ model: p.model, messages, temperature: 0.7 }) });
                    if (!r.ok) throw new Error(p.name + ' HTTP ' + r.status);
                    const j = await r.json();
                    const out = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
                    if (!out) throw new Error(p.name + ' empty reply');
                    return String(out).trim();
                } catch (e) {
                    console.warn('AI provider failed:', p.name, e);
                    aiFailUntil[p.name] = Date.now() + 120000;
                    lastErr = e;
                } finally { clearTimeout(timer); }
            }
            throw lastErr;
        }

        // ----- offline brain: works even when no AI server is reachable -----
        function aiIsCrisis(t) {
            return /(suicide|sucide|khud ?kushi|khudkushi|kill myself|end my life|end it all|want to die|wanna die|don'?t want to live|marna (hai|chah)|mar (jana|jaana|jau|jaun|jaaun)|jeena nahi|jina nahi|jeene ka (man|mann)|zindagi (khatam|se thak)|jaan de|self[- ]?harm|aatmhatya|आत्महत्या|मरना (है|चाह)|मर (जाना|जाऊं|जाऊँ)|जीना नहीं|जीने का मन)/i.test(t);
        }
        const AI_CRISIS_MSG = "What you are feeling sounds very heavy, and you are not alone. 💙\nPlease tell someone you trust (a parent, a friend or a teacher) right now, or go and sit with them.\nFree 24x7 help: **Tele-MANAS 14416** (India). If you are in immediate danger, call **112**.\nI am right here. If you want, you can tell me what happened.";

        function aiQuickLocal(text) {
            const t = text.trim();
            if (/^(hi+|hello+|hey+|namaste|namaskar|salam|good (morning|afternoon|evening))\W*$/i.test(t)) return 'Hello! 👋 I am Bazar AI. Ask me about doubts, notes/PYQs, study plans or anything else!';
            if (/^(thanks|thank you|thx|shukriya|dhanyavaad|dhanyawad)\W*$/i.test(t)) return 'No problem! 😊 Ask me anything else you need.';
            const expr = t.replace(/[?=]/g, '').replace(/\b(calculate|solve|kitna|kitne|hota|hai|what|is|equals?)\b/gi, '').replace(/[x×]/gi, '*').replace(/÷/g, '/').replace(/\^/g, '**').trim();
            if (/^[\d\s+\-*/().%]+$/.test(expr) && /\d/.test(expr) && /[+\-*/%]/.test(expr)) {
                try { const v = Function('"use strict";return (' + expr + ')')(); if (isFinite(v)) return `**${expr.replace(/\*\*/g, '^')}** = **${+Number(v).toFixed(6)}**`; } catch (e) {}
            }
            return null;
        }

        function aiLocalReply(text, related) {
            const t = text.toLowerCase();
            if (related.intent) return related.list.length ? 'I found these items on Notes Bazar. Tap one to open it:' : 'Nothing on this topic has been uploaded yet. Tell us in "What if you want?" on the Home page and we will upload it. 🙏';
            if (/(study plan|timetable|time table|routine|plan bana)/.test(t)) return '**Simple 7-day plan:**\n- Day 1-2: make short notes for your weakest chapter\n- Day 3-4: revise formulas / key points + 20 practice questions\n- Day 5: solve one full previous-year paper (PYQ)\n- Day 6: review your mistakes and practise them again\n- Day 7: light revision + a good night of sleep\n\nStudy 45 min a day with a 10 min break. 📚';
            if (/(motivat|mann nahi|man nahi|tension|stress|dar lag|ghabra|udaas|sad|akela|akeli|pareshan)/.test(t)) return 'I understand, sometimes everything feels heavy. 💙\nTake one small step: study just **10 minutes** of one small topic right now, then drink some water. Small steps build big results.\nIf you feel very low, please talk to someone close to you.';
            if (/(exam|pariksha|yaad|याद|revision|tips)/.test(t)) return '**Exam tips:**\n- Look at PYQs first to understand the pattern\n- After studying, write the answer from memory without looking\n- Keep a separate small sheet of formulas\n- Sleep early at night and revise in the morning';
            if (/(tum kaun|who are you|aap kaun|your name|naam kya)/.test(t)) return 'I am **Bazar AI**, the study assistant of Notes Bazar. 🤖';
            return 'I cannot connect to the live AI server right now, so I can only help with the basics: finding notes/PYQs, study plans, motivation and calculations. Please try again in a little while. 🙏';
        }

        // ----- Robot mascot (inline SVG, animated eyes / arm / glow with CSS) -----
        function botSvg() {
            return `<svg viewBox="0 0 120 130" class="bot-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <ellipse class="bot-shadow" cx="60" cy="125" rx="24" ry="4" fill="#000" opacity=".18"/>
              <g class="bot-float">
                <path d="M21 56 C21 6, 99 6, 99 56" fill="none" stroke="#7c3aed" stroke-width="7" stroke-linecap="round"/>
                <rect x="38" y="84" width="44" height="31" rx="14" fill="#8b5cf6" stroke="#4c1d95" stroke-width="2.2"/>
                <circle cx="60" cy="100" r="8" fill="#fff"/>
                <circle class="bot-chest" cx="60" cy="100" r="4" fill="#22d3ee"/>
                <ellipse cx="31" cy="98" rx="7" ry="10" fill="#a78bfa" stroke="#4c1d95" stroke-width="2.2"/>
                <g class="bot-arm-r"><ellipse cx="89" cy="98" rx="7" ry="10" fill="#a78bfa" stroke="#4c1d95" stroke-width="2.2"/></g>
                <ellipse cx="50" cy="117" rx="9" ry="5" fill="#fff" stroke="#4c1d95" stroke-width="2.2"/>
                <ellipse cx="70" cy="117" rx="9" ry="5" fill="#fff" stroke="#4c1d95" stroke-width="2.2"/>
                <rect x="22" y="26" width="76" height="62" rx="27" fill="#fff" stroke="#4c1d95" stroke-width="2.4"/>
                <rect x="29" y="34" width="62" height="46" rx="20" fill="#1e1b4b"/>
                <g class="bot-look"><g class="bot-track">
                  <g class="bot-eye"><ellipse cx="47" cy="55" rx="6.5" ry="8.5" fill="#22d3ee"/><circle cx="49.2" cy="51.5" r="2.2" fill="#fff"/></g>
                  <g class="bot-eye"><ellipse cx="73" cy="55" rx="6.5" ry="8.5" fill="#22d3ee"/><circle cx="75.2" cy="51.5" r="2.2" fill="#fff"/></g>
                  <path d="M54 68 Q60 74 66 68" fill="none" stroke="#22d3ee" stroke-width="2.4" stroke-linecap="round"/>
                  <ellipse cx="39" cy="66" rx="4" ry="2.6" fill="#f472b6" opacity=".55"/>
                  <ellipse cx="81" cy="66" rx="4" ry="2.6" fill="#f472b6" opacity=".55"/>
                </g></g>
                <circle cx="20" cy="58" r="11" fill="#7c3aed" stroke="#4c1d95" stroke-width="2.2"/>
                <circle class="bot-ear" cx="20" cy="58" r="5.5" fill="none" stroke="#22d3ee" stroke-width="2.4"/>
                <circle cx="100" cy="58" r="11" fill="#7c3aed" stroke="#4c1d95" stroke-width="2.2"/>
                <circle class="bot-ear" cx="100" cy="58" r="5.5" fill="none" stroke="#22d3ee" stroke-width="2.4"/>
              </g>
            </svg>`;
        }

        function mountBot() {
            const btn = document.getElementById('aiFabBtn');
            if (btn) btn.insertAdjacentHTML('beforeend', botSvg());
            const hb = document.getElementById('aiHeadBot');
            if (hb) hb.innerHTML = botSvg();
            const bots = document.querySelectorAll('.bot-svg');
            let raf = 0, px = 0, py = 0;
            document.addEventListener('pointermove', e => {   // eyes follow the finger / mouse
                px = e.clientX; py = e.clientY;
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    bots.forEach(b => {
                        const r = b.getBoundingClientRect();
                        if (!r.width) return;
                        const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
                        b.style.setProperty('--lx', Math.max(-3, Math.min(3, dx / 50)).toFixed(2) + 'px');
                        b.style.setProperty('--ly', Math.max(-2, Math.min(2, dy / 70)).toFixed(2) + 'px');
                    });
                });
            }, { passive: true });
            const bub = document.getElementById('aiFabBubble');
            const hints = ['Hi! Have a doubt? 👋', 'Looking for notes? Ask me 📚', 'Want a study plan? 🗓️', 'I am right here 🤖'];
            let hi = 0;
            const showHint = () => {
                if (!bub || document.querySelector('[id$="Modal"]:not(.hidden)')) return;
                bub.textContent = hints[hi++ % hints.length];
                bub.classList.add('show');
                setTimeout(() => bub.classList.remove('show'), 4500);
            };
            setTimeout(showHint, 5500);
            setInterval(showHint, 14000);
            initFabDrag();
        }

        // the AI robot can be dragged anywhere (its position is remembered)
        function initFabDrag() {
            const fab = document.getElementById('aiFab'), btn = document.getElementById('aiFabBtn');
            if (!fab || !btn) return;
            const KEY = 'nb_fab_pos', M = 6;
            const size = () => { const r = fab.getBoundingClientRect(); return { w: r.width, h: r.height }; };
            const clamp = (x, y) => { const z = size(); return { x: Math.max(M, Math.min(innerWidth - z.w - M, x)), y: Math.max(M, Math.min(innerHeight - z.h - M, y)) }; };
            const place = (x, y) => {
                const p = clamp(x, y);
                fab.style.left = p.x + 'px'; fab.style.top = p.y + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto';
                const z = size();
                fab.classList.toggle('fab-left', p.x + z.w / 2 < innerWidth / 2);
                fab.classList.toggle('fab-top', p.y < 150);
                return p;
            };
            const save = p => { try { localStorage.setItem(KEY, JSON.stringify({ fx: p.x / innerWidth, fy: p.y / innerHeight })); } catch (e) {} };
            let saved = null;
            try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
            if (saved && isFinite(saved.fx) && isFinite(saved.fy)) place(saved.fx * innerWidth, saved.fy * innerHeight);
            addEventListener('resize', () => { if (fab.style.left) { const r = fab.getBoundingClientRect(); place(r.left, r.top); } }, { passive: true });

            let sx = 0, sy = 0, ox = 0, oy = 0, down = false, moved = false, pid = null;
            btn.addEventListener('pointerdown', e => {
                if (e.button !== undefined && e.button !== 0) return;
                down = true; moved = false; pid = e.pointerId;
                const r = fab.getBoundingClientRect();
                sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
                try { btn.setPointerCapture(pid); } catch (x) {}
            });
            btn.addEventListener('pointermove', e => {
                if (!down) return;
                const dx = e.clientX - sx, dy = e.clientY - sy;
                if (!moved && Math.hypot(dx, dy) < 6) return;
                if (!moved) { moved = true; window.__fabMoved = true; fab.classList.remove('snap'); fab.classList.add('dragging'); }
                place(ox + dx, oy + dy);
            });
            const end = () => {
                if (!down) return;
                down = false;
                try { btn.releasePointerCapture(pid); } catch (x) {}
                fab.classList.remove('dragging');
                if (moved) {
                    // snap slightly towards the edge
                    const r = fab.getBoundingClientRect(), z = size();
                    const toLeft = r.left + z.w / 2 < innerWidth / 2;
                    fab.classList.add('snap');
                    save(place(toLeft ? M : innerWidth - z.w - M, r.top));
                    setTimeout(() => { fab.classList.remove('snap'); window.__fabMoved = false; }, 260);
                }
            };
            btn.addEventListener('pointerup', end);
            btn.addEventListener('pointercancel', end);
            btn.addEventListener('dragstart', e => e.preventDefault());
        }

        window.clearAiChat = function() {
            aiHistory = [];
            document.getElementById('aiChatHistory').innerHTML = `<div class="flex justify-start mb-3"><div class="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-2xl rounded-tl-none text-xs max-w-[85%] shadow-sm leading-relaxed">👋 New chat started! What would you like to ask?</div></div>`;
        };

        window.sendAiMessage = async function(preset) {
            const input = document.getElementById('aiInput');
            const chat = document.getElementById('aiChatHistory');
            const mode = document.getElementById('aiCategory').value;
            const fab = document.getElementById('aiFab');
            const userText = (typeof preset === 'string' ? preset : input.value).trim();
            if (!userText || aiBusy) return;
            aiBusy = true;
            document.getElementById('aiSendBtn').disabled = true;
            input.value = '';

            const botBubble = (html, extra) => chat.insertAdjacentHTML('beforeend', `<div class="flex justify-start mb-3"><div class="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-2xl rounded-tl-none text-xs max-w-[90%] shadow-sm leading-relaxed">${html}${extra || ''}</div></div>`);
            chat.insertAdjacentHTML('beforeend', `<div class="flex justify-end mb-3"><div class="dynamic-bg text-white px-4 py-2.5 rounded-2xl rounded-tr-none text-xs max-w-[85%] shadow-sm leading-relaxed">${esc(userText)}</div></div>`);
            chat.scrollTop = chat.scrollHeight;

            const finish = () => { aiBusy = false; document.getElementById('aiSendBtn').disabled = false; if (fab) fab.classList.remove('thinking'); chat.scrollTop = chat.scrollHeight; input.focus(); };

            // 1) safety first: never depends on the network
            if (aiIsCrisis(userText)) { botBubble(aiFmt(AI_CRISIS_MSG)); finish(); return; }
            // 2) instant local answers (greetings, thanks, calculator)
            const quick = aiQuickLocal(userText);
            if (quick) { botBubble(aiFmt(quick)); finish(); return; }

            const typing = document.createElement('div');
            typing.className = 'flex justify-start mb-3';
            typing.innerHTML = `<div class="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none"><span class="ai-typing"><span></span><span></span><span></span></span></div>`;
            chat.appendChild(typing);
            chat.scrollTop = chat.scrollHeight;
            if (fab) fab.classList.add('thinking');

            let reply = '', related = { intent: false, list: [] }, offline = false;
            try { related = await findRelated(userText); } catch (e) {}
            try {
                let sys = AI_MODE[mode] || AI_MODE.auto;
                if (curLang === 'hi') sys += '\nThe user chose Hindi in the app: reply in Hindi (Devanagari) unless they write in another language.';
                if (curLang === 'mai') sys += '\nThe user chose Maithili in the app: reply in Maithili (Devanagari) where you can, otherwise simple Hindi.';
                if (!['en', 'hi', 'mai'].includes(curLang)) sys += '\nThe user chose ' + LANG_EN[curLang] + ' in the app: reply in ' + LANG_EN[curLang] + ' (native script) where you can, otherwise simple Hindi.';
                if (related.intent) {
                    sys += related.list.length
                        ? '\n\nMatching items on Notes Bazar for this request:\n' + related.list.map((i, n) => `${n + 1}. ${i.title} (${i.type || 'note'}, ${i.className || ''}, ${i.subject || ''})`).join('\n')
                        : '\n\nNo matching item is uploaded on Notes Bazar for this request right now.';
                }
                reply = await callAi([{ role: 'system', content: sys }, ...aiHistory.slice(-10), { role: 'user', content: userText }]);
                aiHistory.push({ role: 'user', content: userText }, { role: 'assistant', content: reply });
            } catch (err) {
                console.error(err);
                offline = true;
                reply = aiLocalReply(userText, related);
            }
            typing.remove();
            botBubble(aiFmt(reply) + (offline ? '<div class="mt-2 text-[10px] text-amber-600">⚠️ Live AI is not available right now, so this answer was given in offline mode.</div>' : ''), aiRelatedHtml(related.list));
            finish();
        };

        window.skipSplash = function() { const sp = document.getElementById('splash'); if (sp) sp.classList.add('skip'); };

        // until you replace YOUR-SITE-URL in the <head>, fill the SEO URLs from the real address
        function fixSeoUrls() {
            if (!/^https?:$/.test(location.protocol)) return;
            const base = location.origin + location.pathname.replace(/[^/]*$/, '');
            const fix = v => v && v.replace(/https:\/\/YOUR-SITE-URL\//g, base);
            const c = document.querySelector('link[rel=canonical]');
            if (c && (c.getAttribute('href') || '').includes('YOUR-SITE-URL')) c.setAttribute('href', base);
            document.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"]').forEach(m => {
                const v = m.getAttribute('content'); if (v && v.includes('YOUR-SITE-URL')) m.setAttribute('content', fix(v));
            });
            const ldEl = document.getElementById('ldjson');
            if (ldEl && ldEl.textContent.includes('YOUR-SITE-URL')) ldEl.textContent = fix(ldEl.textContent);
        }

        window.openModal = function(id) { document.getElementById(id).classList.remove('hidden'); };
        window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); };
        window.closeAllModals = function() {
            document.querySelectorAll('.fixed[id$="Modal"]').forEach(el => el.classList.add('hidden'));
        };

        window.addEventListener('DOMContentLoaded', () => {
            updateModeButtons();
            mountViewOpts();
            restoreFilters();
            ['homeSearchInput', 'notesSearchInput', 'booksSearchInput', 'pyqSearchInput'].forEach(attachSuggest);
            updateFavBadge();
            dlRefresh();
            mountBot();
            fixSeoUrls();
            renderLangButtons();
            applyLang();
            syncSettingsUI();
            const h0 = location.hash.replace('#', '');
            if (VIEW_TITLES[h0] && h0 !== 'home') showView(h0, false);
            setTimeout(() => { const sp = document.getElementById('splash'); if (sp) sp.remove(); }, 2500);
            // tap outside to close (only popups that have no form to lose)
            const OVERLAY_CLOSE = ['downloadsModal', 'reportModal', 'mobileMenuModal', 'settingsModal', 'themeModal', 'notificationModal', 'previewModal', 'langModal', 'aiModal'];
            document.addEventListener('click', ev => { const id = ev.target && ev.target.id; if (id && OVERLAY_CLOSE.includes(id)) closeModal(id); });
            document.addEventListener('keydown', ev => {
                if (ev.key !== 'Escape') return;
                const open = [...document.querySelectorAll('.fixed[id$="Modal"]:not(.hidden)')];
                const top = open.find(x => x.id === 'previewModal') || open[open.length - 1];
                if (!top) return;
                ({ adminDashboardModal: closeAdminDashboard, adminLoginModal: closeAdminLogin, uploadModal: closeUploadModal, adminReplyModal: closeReplyModal }[top.id] || (() => closeModal(top.id)))();
            });
            try {
                const cached = JSON.parse(localStorage.getItem('nb_cache_v4') || 'null');
                if (cached && cached.items && cached.items.length) {
                    window.allItems = cached.items;
                    window.hasMore = !!cached.hasMore;
                    window.oldestKey = cached.items.reduce((m, i) => (m === null || i.id < m ? i.id : m), null);
                    window.loaded = true;
                    renderAllPages();
                    renderNotifications();
                }
            } catch (e) {}
            window.loadCloudData();
        });
