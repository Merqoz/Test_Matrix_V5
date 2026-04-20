/**
 * APP.JS - Main Matrix Application
 * Handles initialization, storage sync, and global functions
 */

const App = {
    _resetting: false,

    /**
     * Initialize the application
     */
    init() {
        console.log('Test Equipment Matrix - Initializing...');

        // 1. Storage first — migrate legacy, load saved state
        StorageManager.init();
        this.loadFromStorage();

        // 2. Navigation
        Nav.render('matrix');

        // 3. Initialize modules
        ModalManager.init();
        FreezeManager.init();
        if (typeof FreezeRowsManager !== 'undefined') FreezeRowsManager.init();
        FilterManager.init();
        RefreshManager.init();

        // 4. Render
        Renderer.render();

        // 5. Resize handles
        ResizeManager.init();

        // 5b. Excel-like clipboard & keyboard nav
        if (typeof ClipboardManager !== 'undefined') ClipboardManager.init();

        // 6. Restore export folder handle from IndexedDB
        ExportManager.init();

        // 7. Events
        this.setupWindowEvents();

        // 8. Listen for cross-tab changes (e.g. flow page edits)
        StorageManager.onChange(doc => this.onCrossTabChange(doc));

        // 9. Remote sync (JSONbin) — pulls latest, starts polling
        if (typeof SyncManager !== 'undefined') {
            SyncManager.onRemoteUpdate(doc => this.onCrossTabChange(doc));
            SyncManager.init();
        }

        // 10. Undo/Redo
        if (typeof UndoManager !== 'undefined') UndoManager.init();

        // 11. Load page title
        this.loadPageTitle();

        console.log('Test Equipment Matrix - Ready!');
    },

    /**
     * Save the page title to localStorage
     */
    savePageTitle(val) {
        try { localStorage.setItem('tem_page_title_matrix', val); } catch(e) {}
        document.title = (val || 'Test Equipment Matrix') + (FlowData && FlowData.projectName ? ' — ' + FlowData.projectName : '');
    },

    /**
     * Load the page title from localStorage
     */
    loadPageTitle() {
        try {
            var saved = localStorage.getItem('tem_page_title_matrix');
            if (saved !== null) {
                var el = document.getElementById('pageTitle');
                if (el) el.value = saved;
                document.title = (saved || 'Test Equipment Matrix');
            }
        } catch(e) {}
    },

    /**
     * Load matrix data from StorageManager into DataModel
     */
    loadFromStorage() {
        const m = StorageManager.loadMatrix();
        if (m && m.testColumns && m.testColumns.length > 0) {
            DataModel.testColumns = m.testColumns;
            DataModel.sections = m.sections || DataModel.sections;
            DataModel.setDocNo(m.docNo || '');
            DataModel.setProjectName(m.projectName || '');
            // Update ID counter
            const maxId = Math.max(...DataModel.testColumns.map(t => t.id), 0);
            DataModel.nextTestId = maxId + 1;

            // Backfill missing uid / workpack on existing saved data
            const usedUids = new Set(DataModel.testColumns.map(t => t.uid).filter(Boolean));
            let uidCounter = DataModel.testColumns.length + 1;
            DataModel.testColumns.forEach(t => {
                if (!t.uid) {
                    let uid;
                    do { uid = `test-${String(uidCounter++).padStart(2, '0')}`; } while (usedUids.has(uid));
                    t.uid = uid;
                    usedUids.add(uid);
                }
                if (t.workpack === undefined) t.workpack = '';
            });
        }

        // Preferences
        const p = StorageManager.loadPrefs();
        if (p) {
            DataModel.freezeEnabled = !!p.freezeEnabled;
            DataModel.freezeRowsEnabled = !!p.freezeRowsEnabled;
            DataModel.hiddenActivities = p.hiddenActivities || [];

            // Load custom locations into DataModel
            if (p.customLocations) {
                for (const name in p.customLocations) {
                    DataModel.locations[name] = p.customLocations[name];
                }
            }
        }

        // Restore locked filter state into FilterManager (matrix-specific keys only)
        if (p && typeof FilterManager !== 'undefined') {
            var lockedTypes = p.matrixLockedTypeFilters || [];
            var lockedWps = p.matrixLockedWpFilters || [];
            lockedTypes.forEach(t => FilterManager.activeFilters.add(t));
            lockedWps.forEach(w => FilterManager.activeWpFilters.add(w));
            FilterManager._lockedTypes = new Set(lockedTypes);
            FilterManager._lockedWps = new Set(lockedWps);
        }
    },

    /**
     * Persist current DataModel state into StorageManager.
     * Called after every meaningful change.
     */
    persistMatrix() {
        StorageManager.save({
            matrix: {
                docNo: DataModel.getDocNo(),
                projectName: DataModel.getProjectName(),
                testColumns: DataModel.testColumns,
                sections: DataModel.sections
            }
        });
    },

    /**
     * When another tab (e.g. flow) writes to storage,
     * reload matrix data and re-render.
     */
    onCrossTabChange(doc) {
        if (!doc || !doc.matrix) return;
        console.log('[Matrix] Cross-tab update received');
        const m = doc.matrix;
        if (m.testColumns) DataModel.testColumns = m.testColumns;
        if (m.sections)    DataModel.sections = m.sections;
        DataModel.setDocNo(m.docNo || '');
        DataModel.setProjectName(m.projectName || '');
        const maxId = Math.max(...DataModel.testColumns.map(t => t.id), 0);
        DataModel.nextTestId = maxId + 1;
        Renderer.render();
    },

    /**
     * Setup window-level events
     */
    setupWindowEvents() {
        window.addEventListener('resize', () => {
            ResizeManager.updateFreezePositions();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (typeof ActivityManager !== 'undefined') ActivityManager.close();
            }
        });

        // Flush storage before the tab closes (skip if resetting)
        window.addEventListener('beforeunload', () => {
            if (this._resetting) return;
            this.persistMatrix();
            StorageManager.saveNow(undefined);
        });
    },

    /**
     * Refresh the matrix — delegates to RefreshManager pipeline
     */
    refresh() {
        RefreshManager.run();
    },

    /**
     * Reset everything to the blank template.
     * Clears storage, reloads the page.
     */
    resetToTemplate() {
        if (!confirm(
            'Reset to blank template?\n\n' +
            'This will erase ALL data in both the Matrix and the Activity Flow, ' +
            'including all test columns, equipment rows, and connections.\n\n' +
            'This cannot be undone.'
        )) return;

        this._resetting = true;           // prevent beforeunload from overwriting
        StorageManager.resetToTemplate();
        window.location.reload();
    },

    getVersion() { return '2.1.0'; }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
