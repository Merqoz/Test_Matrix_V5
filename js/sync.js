/**
 * SYNC.JS - Sync Dispatcher & UI
 * 
 * Manages the JSONbin sync provider and provides the status indicator
 * with right-click provider switching.
 *
 *  Left-click the status pill  = manual pull
 *  Right-click the status pill = choose provider
 *  Provider preference is saved in localStorage
 *
 * Providers:
 *   'none'    - offline, localStorage only
 *   'jsonbin' - JSONbin.io
 */

const SyncManager = {

    _activeProvider: 'none',
    _statusEl:      null,
    _contextMenu:   null,
    _listeners:     [],

    _jb: {
        BIN_ID:   '',
        API_KEY:  '',
        BASE_URL: 'https://api.jsonbin.io/v3/b',
        ENABLED:  false,
        pushing:  false,
        pulling:  false,
        lastPullTs: '',
    },

    /* ---- PUBLIC API ---- */

    async init(overrides) {
        if (typeof SYNC_CONFIG !== 'undefined') {
            if (SYNC_CONFIG.BIN_ID) this._jb.BIN_ID = SYNC_CONFIG.BIN_ID;
            if (SYNC_CONFIG.API_KEY) this._jb.API_KEY = SYNC_CONFIG.API_KEY;
        }

        var saved = localStorage.getItem('tem_sync_provider');
        if (saved && ['none', 'jsonbin'].includes(saved)) {
            this._activeProvider = saved;
        } else if (typeof SYNC_CONFIG !== 'undefined' && SYNC_CONFIG.ACTIVE_PROVIDER) {
            this._activeProvider = SYNC_CONFIG.ACTIVE_PROVIDER;
        }

        this._createStatusIndicator();
        this._createContextMenu();
        await this._activateProvider(this._activeProvider);
    },

    async pull() {
        if (this._activeProvider === 'jsonbin') return await this._jbPull();
        return false;
    },

    async push() {
        if (this._activeProvider === 'jsonbin') return await this._jbPush();
    },

    onRemoteUpdate(fn) {
        this._listeners.push(fn);
    },

    getProvider() {
        return this._activeProvider;
    },

    /* ---- PROVIDER SWITCHING ---- */

    async _activateProvider(provider) {
        this._activeProvider = provider;
        localStorage.setItem('tem_sync_provider', provider);

        if (provider === 'none') {
            this._jb.ENABLED = false;
            this._updateStatus('offline', 'Local only \u2014 right-click to connect');

        } else if (provider === 'jsonbin') {
            if (!this._jb.BIN_ID || this._jb.BIN_ID === 'YOUR_BIN_ID_HERE' ||
                !this._jb.API_KEY || this._jb.API_KEY === 'YOUR_X_MASTER_KEY_HERE') {
                this._updateStatus('error', 'JSONbin \u2014 no credentials configured');
                console.warn('[Sync] JSONbin selected but credentials not set in sync-config.js');
                return;
            }
            this._jb.ENABLED = true;
            console.log('[Sync] Activated JSONbin \u2014 Bin:', this._jb.BIN_ID);
            await this._jbPull();
        }

        this._updateContextMenuChecks();
    },

    /* ---- UI: STATUS INDICATOR ---- */

    _createStatusIndicator() {
        if (document.getElementById('sync-status')) return;

        var el = document.createElement('div');
        el.id = 'sync-status';
        el.style.cssText = 'position:fixed;bottom:12px;right:12px;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:#1e293b;color:#94a3b8;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;transition:opacity 0.2s;user-select:none;';
        el.title = 'Left-click: pull latest  \u2022  Right-click: change provider';

        var self = this;
        el.addEventListener('click', function(e) { e.preventDefault(); self.pull(); });
        el.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            self._showContextMenu(e);
        });

        el.innerHTML = '<span id="sync-dot" style="width:8px;height:8px;border-radius:50%;background:#64748b;display:inline-block;"></span><span id="sync-label">Initialising...</span>';
        document.body.appendChild(el);
        this._statusEl = el;
    },

    /* ---- UI: CONTEXT MENU ---- */

    _createContextMenu() {
        if (document.getElementById('sync-context-menu')) return;

        var menu = document.createElement('div');
        menu.id = 'sync-context-menu';
        menu.style.cssText = 'position:fixed;display:none;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:4px 0;min-width:200px;z-index:10000;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;color:#e2e8f0;';

        var providers = [
            { id: 'none',    label: 'Offline (local only)', icon: '\uD83D\uDCBE' },
            { id: 'jsonbin', label: 'JSONbin.io',           icon: '\u2601\uFE0F' },
        ];

        var header = document.createElement('div');
        header.style.cssText = 'padding:8px 12px 4px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;';
        header.textContent = 'Sync Provider';
        menu.appendChild(header);

        var divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:#334155;margin:4px 0;';
        menu.appendChild(divider);

        var self = this;
        providers.forEach(function(p) {
            var item = document.createElement('div');
            item.dataset.provider = p.id;
            item.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background 0.15s;';
            item.addEventListener('mouseenter', function() { item.style.background = '#334155'; });
            item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
            item.addEventListener('click', async function() {
                self._hideContextMenu();
                await self._activateProvider(p.id);
            });

            var check = document.createElement('span');
            check.className = 'sync-menu-check';
            check.style.cssText = 'width:16px;text-align:center;font-size:11px;';

            var icon = document.createElement('span');
            icon.textContent = p.icon;
            icon.style.fontSize = '14px';

            var label = document.createElement('span');
            label.textContent = p.label;

            item.appendChild(check);
            item.appendChild(icon);
            item.appendChild(label);
            menu.appendChild(item);
        });

        // Divider
        var divider2 = document.createElement('div');
        divider2.style.cssText = 'height:1px;background:#334155;margin:4px 0;';
        menu.appendChild(divider2);

        // Force Push
        var pushItem = document.createElement('div');
        pushItem.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background 0.15s;color:#94a3b8;';
        pushItem.addEventListener('mouseenter', function() { pushItem.style.background = '#334155'; });
        pushItem.addEventListener('mouseleave', function() { pushItem.style.background = 'transparent'; });
        pushItem.addEventListener('click', async function() { self._hideContextMenu(); await self.push(); });
        pushItem.innerHTML = '<span style="width:16px;text-align:center;font-size:14px;margin-left:16px;">\u2B06\uFE0F</span><span>Force Push Now</span>';
        menu.appendChild(pushItem);

        // Force Pull
        var pullItem = document.createElement('div');
        pullItem.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background 0.15s;color:#94a3b8;';
        pullItem.addEventListener('mouseenter', function() { pullItem.style.background = '#334155'; });
        pullItem.addEventListener('mouseleave', function() { pullItem.style.background = 'transparent'; });
        pullItem.addEventListener('click', async function() { self._hideContextMenu(); await self.pull(); });
        pullItem.innerHTML = '<span style="width:16px;text-align:center;font-size:14px;margin-left:16px;">\u2B07\uFE0F</span><span>Force Pull Now</span>';
        menu.appendChild(pullItem);

        document.body.appendChild(menu);
        this._contextMenu = menu;

        document.addEventListener('click', function(e) {
            if (!menu.contains(e.target) && e.target !== self._statusEl) {
                self._hideContextMenu();
            }
        });
    },

    _showContextMenu(e) {
        var menu = this._contextMenu;
        if (!menu) return;
        this._updateContextMenuChecks();

        var pillRect = this._statusEl.getBoundingClientRect();
        menu.style.display = 'block';
        var menuRect = menu.getBoundingClientRect();

        var left = pillRect.right - menuRect.width;
        var top = pillRect.top - menuRect.height - 8;
        if (left < 8) left = 8;
        if (top < 8) top = pillRect.bottom + 8;

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    },

    _hideContextMenu() {
        if (this._contextMenu) this._contextMenu.style.display = 'none';
    },

    _updateContextMenuChecks() {
        if (!this._contextMenu) return;
        var self = this;
        this._contextMenu.querySelectorAll('[data-provider]').forEach(function(item) {
            var check = item.querySelector('.sync-menu-check');
            if (check) {
                check.textContent = item.dataset.provider === self._activeProvider ? '\u2713' : '';
                check.style.color = item.dataset.provider === self._activeProvider ? '#22c55e' : 'transparent';
            }
        });
    },

    _updateStatus(state, label) {
        var dot = document.getElementById('sync-dot');
        var lbl = document.getElementById('sync-label');
        if (!dot || !lbl) return;
        var colors = { ok: '#22c55e', syncing: '#f59e0b', error: '#ef4444', offline: '#64748b' };
        dot.style.background = colors[state] || colors.offline;
        lbl.textContent = label;
    },

    /* ---- JSONBIN PROVIDER ---- */

    async _jbPull() {
        if (!this._jb.ENABLED || this._jb.pulling) return false;
        this._jb.pulling = true;
        this._updateStatus('syncing', 'JSONbin \u2014 pulling...');

        try {
            var url = this._jb.BASE_URL + '/' + this._jb.BIN_ID + '/latest';
            var res = await fetch(url, {
                method: 'GET',
                headers: { 'X-Master-Key': this._jb.API_KEY, 'X-Bin-Meta': 'false' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);

            var remote = await res.json();

            if (!remote || !remote._v) {
                this._updateStatus('ok', 'JSONbin \u2014 connected (empty)');
                this._jb.pulling = false;
                return false;
            }
            if (remote._ts && remote._ts === this._jb.lastPullTs) {
                this._updateStatus('ok', 'JSONbin \u2014 in sync');
                this._jb.pulling = false;
                return false;
            }

            var local = StorageManager.load();
            var remoteTime = remote._ts ? new Date(remote._ts).getTime() : 0;
            var localTime  = local && local._ts ? new Date(local._ts).getTime() : 0;

            if (remoteTime > localTime) {
                console.log('[Sync] JSONbin remote is newer \u2014 applying');
                localStorage.setItem(StorageManager.KEY, JSON.stringify(remote));
                StorageManager._lastJson = JSON.stringify(remote);
                this._jb.lastPullTs = remote._ts;

                this._listeners.forEach(function(fn) {
                    try { fn(remote); } catch (e) { console.error(e); }
                });

                this._updateStatus('ok', 'JSONbin \u2014 synced ' + this._timeAgo(remote._ts));
                this._jb.pulling = false;
                return true;
            } else {
                this._jb.lastPullTs = remote._ts || '';
                this._updateStatus('ok', 'JSONbin \u2014 in sync');
                this._jb.pulling = false;
                return false;
            }
        } catch (err) {
            console.error('[Sync] JSONbin pull failed:', err);
            this._updateStatus('error', 'JSONbin pull failed: ' + err.message);
            this._jb.pulling = false;
            return false;
        }
    },

    async _jbPush() {
        if (!this._jb.ENABLED || this._jb.pushing) return;
        this._jb.pushing = true;
        this._updateStatus('syncing', 'JSONbin \u2014 pushing...');

        try {
            var data = StorageManager.load();
            if (!data) { this._jb.pushing = false; return; }
            data._ts = new Date().toISOString();

            var url = this._jb.BASE_URL + '/' + this._jb.BIN_ID;
            var res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': this._jb.API_KEY },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);

            this._jb.lastPullTs = data._ts;
            console.log('[Sync] Pushed to JSONbin');
            this._updateStatus('ok', 'JSONbin \u2014 saved ' + this._timeAgo(data._ts));
        } catch (err) {
            console.error('[Sync] JSONbin push failed:', err);
            this._updateStatus('error', 'JSONbin push failed: ' + err.message);
        }
        this._jb.pushing = false;
    },

    _timeAgo(isoStr) {
        var diff = Date.now() - new Date(isoStr).getTime();
        var secs = Math.floor(diff / 1000);
        if (secs < 5) return 'just now';
        if (secs < 60) return secs + 's ago';
        var mins = Math.floor(secs / 60);
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        return hrs + 'h ago';
    }
};
