/**
 * STORAGE.JS - Unified Storage Manager
 * 
 * Single source of truth for all persistent state.
 * 
 *  • ONE localStorage key  → no key sprawl
 *  • Schema version        → detect corruption, auto-reset
 *  • Debounced writes      → batch rapid edits (300 ms)
 *  • Cross-tab sync        → `storage` event fires on OTHER tabs
 *  • Error-resilient       → try/catch everywhere, quota check
 *  • Reset to template     → wipe and reload cleanly
 *
 * Schema (version 1):
 * {
 *   _v  : 1,                        // schema version
 *   _ts : "2026-02-10T...",          // last-modified ISO timestamp
 *   matrix: {                        // everything the matrix page owns
 *     docNo, projectName,
 *     testColumns, sections
 *   },
 *   flow: {                          // everything the flow page owns
 *     positions: { nodeId: yPos },   // vertical node positions per lane
 *     edges: [],                     // connections between nodes
 *     nextEdgeId: 1
 *   },
 *   prefs: {                         // UI preferences (shared)
 *     freezeEnabled: false
 *   }
 * }
 */

const StorageManager = {

    /* ── constants ─────────────────────────────────────── */
    KEY: 'tem_unified_v1',
    SCHEMA_VERSION: 1,
    DEBOUNCE_MS: 300,

    /* ── internal state ────────────────────────────────── */
    _timer: null,           // debounce handle
    _listeners: [],         // onChange callbacks
    _lastJson: '',          // dedup writes

    /* ══════════════════════════════════════════════════════
       PUBLIC API
       ══════════════════════════════════════════════════════ */

    /**
     * Initialise: load from disk, migrate legacy keys, wire up
     * cross-tab listener.  Call once on each page's DOMContentLoaded.
     */
    init() {
        this._migrateLegacy();      // one-time: absorb old keys
        this._listenCrossTab();     // react when another tab writes
        console.log('[Storage] Initialised — key:', this.KEY);
    },

    /* ── read ──────────────────────────────────────────── */

    /**
     * Return the full stored object, or null if nothing / corrupt.
     */
    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (obj._v !== this.SCHEMA_VERSION) {
                console.warn('[Storage] Version mismatch – resetting');
                this.clear();
                return null;
            }
            return obj;
        } catch (e) {
            console.error('[Storage] Corrupt data – resetting', e);
            this.clear();
            return null;
        }
    },

    /** Shorthand: return just the matrix slice */
    loadMatrix() {
        return this.load()?.matrix ?? null;
    },

    /** Shorthand: return just the flow slice */
    loadFlow() {
        return this.load()?.flow ?? null;
    },

    /** Shorthand: return just the gantt slice */
    loadGantt() {
        return this.load()?.gantt ?? null;
    },

    /** Shorthand: return just the prefs slice */
    loadPrefs() {
        return this.load()?.prefs ?? null;
    },

    /** Shorthand: return just the history slice */
    loadHistory() {
        const h = this.load()?.history;
        return h ?? { deletedActivities: [], deletedEquipment: [] };
    },

    /* ── write (debounced) ─────────────────────────────── */

    /**
     * Merge a partial update into the stored object and flush
     * after DEBOUNCE_MS.  Accepts any subset of top-level keys:
     *   StorageManager.save({ matrix: { ... } })
     *   StorageManager.save({ flow: { edges: [...] } })
     *   StorageManager.save({ prefs: { freezeEnabled: true } })
     *
     * Deep-merges one level: the slices (matrix, flow, prefs)
     * are spread so callers don't need to pass everything.
     */
    save(partial) {
        // Read from pending (unflushed) state first, then disk, then empty
        const current = this._pending || this.load() || this._emptyDoc();

        // Shallow-merge each top-level slice
        if (partial.matrix) {
            current.matrix = { ...current.matrix, ...partial.matrix };
        }
        if (partial.flow) {
            current.flow = { ...current.flow, ...partial.flow };
        }
        if (partial.gantt) {
            current.gantt = { ...current.gantt, ...partial.gantt };
        }
        if (partial.prefs) {
            current.prefs = { ...current.prefs, ...partial.prefs };
        }
        if (partial.history) {
            if (!current.history) current.history = { deletedActivities: [], deletedEquipment: [] };
            if (partial.history.deletedActivities) current.history.deletedActivities = partial.history.deletedActivities;
            if (partial.history.deletedEquipment) current.history.deletedEquipment = partial.history.deletedEquipment;
        }

        current._ts = new Date().toISOString();

        // Debounce
        this._pending = current;
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(() => this._flush(), this.DEBOUNCE_MS);
    },

    /**
     * Force an immediate write (skip debounce).
     * Useful before page unload or reset.
     */
    saveNow(partial) {
        if (partial) {
            // Read from pending (unflushed) state first, then disk, then empty
            const current = this._pending || this.load() || this._emptyDoc();
            if (partial.matrix) current.matrix = { ...current.matrix, ...partial.matrix };
            if (partial.flow)   current.flow   = { ...current.flow,   ...partial.flow };
            if (partial.gantt)  current.gantt  = { ...current.gantt,  ...partial.gantt };
            if (partial.prefs)  current.prefs  = { ...current.prefs,  ...partial.prefs };
            if (partial.history) {
                if (!current.history) current.history = { deletedActivities: [], deletedEquipment: [] };
                if (partial.history.deletedActivities) current.history.deletedActivities = partial.history.deletedActivities;
                if (partial.history.deletedEquipment) current.history.deletedEquipment = partial.history.deletedEquipment;
            }
            current._ts = new Date().toISOString();
            this._pending = current;
        }
        this._flush();
    },

    /* ── reset ─────────────────────────────────────────── */

    /**
     * Wipe storage completely and return a clean template doc.
     * Does NOT touch in-memory DataModel / FlowData — callers
     * should reload the page after calling this.
     */
    resetToTemplate() {
        // Cancel any pending debounced write
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        this._pending = null;

        this.clear();
        const doc = this._emptyDoc();
        doc.matrix = this._templateMatrix();
        doc._ts = new Date().toISOString();
        this._lastJson = '';  // reset dedup guard
        this._writeRaw(doc);
        return doc;
    },

    /**
     * Remove the unified key (and any leftover legacy keys).
     */
    clear() {
        try {
            localStorage.removeItem(this.KEY);
            // Also sweep legacy keys
            localStorage.removeItem('tem_project_data');
            localStorage.removeItem('tem_flow_data');
            localStorage.removeItem('freezeEnabled');
            // Gantt legacy keys
            localStorage.removeItem('gc_equip_schedules_v2');
            localStorage.removeItem('gc_bars_v3');
            localStorage.removeItem('gc_map_positions');
            // Column widths
            localStorage.removeItem('tem_col_widths');
        } catch (e) {
            console.warn('[Storage] Could not clear', e);
        }
    },

    /* ── cross-tab sync ────────────────────────────────── */

    /**
     * Register a callback that fires when another tab writes.
     * Callback receives the full parsed document.
     */
    onChange(fn) {
        this._listeners.push(fn);
    },

    /* ══════════════════════════════════════════════════════
       INTERNALS
       ══════════════════════════════════════════════════════ */

    _pending: null,

    /** Actually write to localStorage */
    _flush() {
        if (!this._pending) return;
        this._writeRaw(this._pending);
        this._pending = null;
        this._timer = null;
    },

    /** Low-level write with quota guard */
    _writeRaw(obj) {
        try {
            const json = JSON.stringify(obj);
            // Dedup: skip if nothing changed
            if (json === this._lastJson) return;
            localStorage.setItem(this.KEY, json);
            this._lastJson = json;
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.error('[Storage] Quota exceeded – cannot save');
                // Could show a user-facing toast here
            } else {
                console.error('[Storage] Write failed', e);
            }
        }
    },

    /** Listen for writes from OTHER tabs on the same origin */
    _listenCrossTab() {
        window.addEventListener('storage', (e) => {
            if (e.key !== this.KEY) return;
            console.log('[Storage] Cross-tab change detected');
            const doc = this.load();
            if (doc) {
                this._listeners.forEach(fn => {
                    try { fn(doc); } catch (err) { console.error(err); }
                });
            }
        });
    },

    /** One-time migration from the old scattered keys */
    _migrateLegacy() {
        // Skip if we already have the unified key
        if (localStorage.getItem(this.KEY)) return;

        let migrated = false;
        const doc = this._emptyDoc();

        // Old matrix data
        try {
            const raw = localStorage.getItem('tem_project_data');
            if (raw) {
                const m = JSON.parse(raw);
                doc.matrix = {
                    docNo: m.docNo || '',
                    projectName: m.projectName || '',
                    testColumns: m.testColumns || [],
                    sections: m.sections || []
                };
                migrated = true;
            }
        } catch (_) {}

        // Old flow data
        try {
            const raw = localStorage.getItem('tem_flow_data');
            if (raw) {
                const f = JSON.parse(raw);
                const positions = {};
                (f.nodes || []).forEach(n => { positions[n.id] = n.y; });
                doc.flow = {
                    positions,
                    edges: f.edges || [],
                    nextEdgeId: f.nextEdgeId || 1
                };
                migrated = true;
            }
        } catch (_) {}

        // Old freeze pref
        try {
            const v = localStorage.getItem('freezeEnabled');
            if (v !== null) {
                doc.prefs.freezeEnabled = v === 'true';
                migrated = true;
            }
        } catch (_) {}

        if (migrated) {
            doc._ts = new Date().toISOString();
            this._writeRaw(doc);
            // Clean up old keys
            try {
                localStorage.removeItem('tem_project_data');
                localStorage.removeItem('tem_flow_data');
                localStorage.removeItem('freezeEnabled');
            } catch (_) {}
            console.log('[Storage] Migrated legacy keys → unified store');
        }
    },

    /** Return a blank document conforming to the schema */
    _emptyDoc() {
        return {
            _v: this.SCHEMA_VERSION,
            _ts: '',
            matrix: {
                docNo: '',
                projectName: '',
                testColumns: [],
                sections: []
            },
            flow: {
                positions: {},
                edges: [],
                nextEdgeId: 1
            },
            gantt: {
                bars: {},       // { rowKey: [bar, bar, ...] }
                nextBarId: 1,
                mapPositions: {}
            },
            history: {
                deletedActivities: [],  // [{...activity, equipment:[], deletedAt}]
                deletedEquipment: []    // [{...row, section, deletedAt}]
            },
            prefs: {
                freezeEnabled: false,
                freezeRowsEnabled: false
            }
        };
    },

    /** Default template matrix — two starter test activities */
    _templateMatrix() {
        return {
            docNo: '',
            projectName: '',
            testColumns: [
                { id: 1, name: 'Test 1', type: 'FAT', location: 'Egersund', startDate: '', endDate: '' },
                { id: 2, name: 'Test 2', type: 'FIT', location: 'Ågotnes', startDate: '', endDate: '' }
            ],
            sections: [
                {
                    id: 'main',
                    name: 'Main Equipment',
                    collapsed: false,
                    rows: [{ itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }]
                },
                {
                    id: 'tooling',
                    name: 'Tooling Items',
                    collapsed: false,
                    rows: [{ itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }]
                },
                {
                    id: 'auxiliary',
                    name: 'Auxiliary',
                    collapsed: false,
                    rows: [{ itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }]
                }
            ]
        };
    }
};
