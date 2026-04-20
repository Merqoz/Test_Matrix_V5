/**
 * UNDO.JS — Undo / Redo System
 *
 * Captures full StorageManager snapshots before each save.
 * Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo.
 * In-memory only (not persisted across page reloads).
 * Works across all pages: matrix, flow, gantt-chart.
 */

const UndoManager = {

    _undoStack: [],   // array of JSON strings (oldest first)
    _redoStack: [],   // array of JSON strings
    _maxHistory: 50,
    _ignoreNext: false, // skip capturing when we're restoring
    _lastSnapshot: '',  // dedup — don't push if nothing changed

    /**
     * Initialize: patch StorageManager.save to auto-capture,
     * bind Ctrl+Z / Ctrl+Y keyboard shortcuts.
     */
    init() {
        this._patchStorage();
        this._bindKeys();
        // Take initial snapshot
        this._captureInitial();
        console.log('[Undo] Initialized — Ctrl+Z to undo, Ctrl+Y to redo');
    },

    /**
     * Patch StorageManager.save so every save auto-captures a snapshot BEFORE the change.
     */
    _patchStorage() {
        if (typeof StorageManager === 'undefined') return;
        const originalSave = StorageManager.save.bind(StorageManager);
        const originalSaveNow = StorageManager.saveNow.bind(StorageManager);
        const self = this;

        StorageManager.save = function(partial) {
            if (!self._ignoreNext) {
                self._beforeSave();
            }
            const result = originalSave(partial);
            if (!self._ignoreNext) {
                self._afterSave();
            }
            return result;
        };

        StorageManager.saveNow = function(partial) {
            if (!self._ignoreNext) {
                self._beforeSave();
            }
            const result = originalSaveNow(partial);
            if (!self._ignoreNext) {
                self._afterSave();
            }
            return result;
        };
    },

    /**
     * Called BEFORE save — push the previous state onto undo stack.
     */
    _beforeSave() {
        // _lastSnapshot holds the state as-of the last save (or init).
        // Push it to undo stack — this is what we'll restore on undo.
        if (this._lastSnapshot) {
            // Only push if we have a previous state
            if (this._undoStack.length === 0 || this._undoStack[this._undoStack.length - 1] !== this._lastSnapshot) {
                this._undoStack.push(this._lastSnapshot);
                if (this._undoStack.length > this._maxHistory) this._undoStack.shift();
            }
            this._redoStack = [];
        }
    },

    /**
     * Called AFTER save — update _lastSnapshot to the new state.
     */
    _afterSave() {
        try {
            const data = StorageManager._pending || StorageManager.load();
            if (data) {
                this._lastSnapshot = JSON.stringify(data);
            }
        } catch (e) {}
    },

    /**
     * Capture the initial state on page load.
     */
    _captureInitial() {
        try {
            const data = StorageManager._pending || StorageManager.load();
            if (data) {
                this._lastSnapshot = JSON.stringify(data);
            }
        } catch (e) {}
    },

    /**
     * Undo — restore previous state.
     */
    undo() {
        if (this._undoStack.length === 0) {
            this._toast('Nothing to undo');
            return;
        }

        // Save current state to redo stack
        this._redoStack.push(this._lastSnapshot);

        // Pop and restore
        const snapshot = this._undoStack.pop();
        this._restore(snapshot);
        this._toast('Undo');
    },

    /**
     * Redo — restore next state.
     */
    redo() {
        if (this._redoStack.length === 0) {
            this._toast('Nothing to redo');
            return;
        }

        // Save current state to undo stack
        this._undoStack.push(this._lastSnapshot);

        const snapshot = this._redoStack.pop();
        this._restore(snapshot);
        this._toast('Redo');
    },

    /**
     * Restore a snapshot JSON string into StorageManager,
     * then trigger re-render on the current page.
     */
    _restore(json) {
        try {
            const data = JSON.parse(json);
            this._lastSnapshot = json;

            // Write directly to storage, bypassing our patch
            this._ignoreNext = true;
            StorageManager._pending = null;
            if (StorageManager._timer) {
                clearTimeout(StorageManager._timer);
                StorageManager._timer = null;
            }
            StorageManager._writeRaw(data);
            this._ignoreNext = false;

            // Reload data into in-memory models and re-render
            this._reloadPage(data);
        } catch (e) {
            console.error('[Undo] Failed to restore', e);
            this._ignoreNext = false;
        }
    },

    /**
     * Reload data models and re-render based on which page we're on.
     */
    _reloadPage(data) {
        // Reload DataModel from matrix slice
        if (data.matrix && typeof DataModel !== 'undefined') {
            if (data.matrix.testColumns) DataModel.testColumns = data.matrix.testColumns;
            if (data.matrix.sections) DataModel.sections = data.matrix.sections;
            DataModel.setDocNo(data.matrix.docNo || '');
            DataModel.setProjectName(data.matrix.projectName || '');
            const maxId = Math.max(...DataModel.testColumns.map(t => t.id), 0);
            DataModel.nextTestId = maxId + 1;
        }

        // Reload prefs
        if (data.prefs && typeof DataModel !== 'undefined') {
            DataModel.freezeEnabled = !!data.prefs.freezeEnabled;
            DataModel.hiddenActivities = data.prefs.hiddenActivities || [];
        }

        // Matrix page (index.html)
        if (typeof Renderer !== 'undefined') {
            if (typeof FreezeManager !== 'undefined') FreezeManager.updateUI();
            if (typeof FilterManager !== 'undefined') {
                FilterManager.renderFilterBar();
                FilterManager.apply();
            }
            Renderer.render();
        }

        // Flow page (flow.html)
        if (typeof FlowData !== 'undefined' && typeof FlowApp !== 'undefined' && typeof FlowLanes !== 'undefined') {
            FlowApp.loadData();
            FlowApp.renderAll();
        }

        // Gantt page (gantt-chart.html)
        if (typeof GCApp !== 'undefined') {
            GCApp._loadMatrix();
            GCApp._loadBars();
            GCApp._buildEquipList();
            GCApp._calcRange();
            GCApp.render();
        }
    },

    /**
     * Bind keyboard shortcuts.
     */
    _bindKeys() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger in input/textarea
            if (e.target.matches('input, textarea, select, [contenteditable]')) return;

            // Ctrl+Z = undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
                return;
            }

            // Ctrl+Y or Ctrl+Shift+Z = redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
                return;
            }
        });
    },

    /**
     * Show a brief toast notification.
     */
    _toast(msg) {
        let el = document.getElementById('undoToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'undoToast';
            el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);' +
                'background:rgba(17,24,32,0.95);border:1px solid rgba(0,212,255,0.4);color:#00d4ff;' +
                'padding:8px 20px;border-radius:8px;font-size:12px;font-family:inherit;font-weight:500;' +
                'letter-spacing:0.5px;box-shadow:0 8px 32px rgba(0,0,0,0.5);pointer-events:none;' +
                'opacity:0;transition:opacity 0.2s,transform 0.2s;z-index:10001;backdrop-filter:blur(10px);';
            document.body.appendChild(el);
        }

        const stackInfo = ' (' + this._undoStack.length + ' undo' +
            (this._redoStack.length > 0 ? ', ' + this._redoStack.length + ' redo' : '') + ')';

        el.textContent = msg + stackInfo;
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(el._timer);
        el._timer = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%) translateY(20px)';
        }, 1800);
    }
};
