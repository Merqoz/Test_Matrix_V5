/**
 * FREEZE-ROWS.JS — Row Freeze Functionality
 *
 * Independent of the column freeze (FreezeManager). Toggles whether the three
 * header rows in <thead> (main header / filter row / activity-search row with
 * the Doc Nr. / Test Activity description input) stay pinned at the top of the
 * scroll area while the user scrolls the table vertically.
 *
 * Does NOT modify FreezeManager — the two can be used independently or together.
 */
const FreezeRowsManager = {
    /** Toggle row-freeze mode */
    toggle() {
        DataModel.freezeRowsEnabled = !DataModel.freezeRowsEnabled;
        this.updateUI();
        this.savePreference();
    },

    /** Enable row freeze */
    enable() {
        DataModel.freezeRowsEnabled = true;
        this.updateUI();
        this.savePreference();
    },

    /** Disable row freeze */
    disable() {
        DataModel.freezeRowsEnabled = false;
        this.updateUI();
        this.savePreference();
    },

    /** Update UI to reflect state */
    updateUI() {
        const btn = document.getElementById('freezeRowsToggle');
        const label = document.getElementById('freezeRowsLabel');
        const tableScroll = document.getElementById('tableScroll');
        if (!btn || !label || !tableScroll) return;

        if (DataModel.freezeRowsEnabled) {
            btn.classList.add('active');
            label.textContent = 'Freeze Rows On';
            tableScroll.classList.add('freeze-rows-mode');
        } else {
            btn.classList.remove('active');
            label.textContent = 'Freeze Rows Off';
            tableScroll.classList.remove('freeze-rows-mode');
        }
    },

    /** Load stored preference on init */
    init() {
        const prefs = typeof StorageManager !== 'undefined' ? StorageManager.loadPrefs() : null;
        if (prefs && prefs.freezeRowsEnabled) {
            DataModel.freezeRowsEnabled = true;
        }
        this.updateUI();
    },

    /** Persist preference */
    savePreference() {
        if (typeof StorageManager !== 'undefined') {
            StorageManager.save({ prefs: { freezeRowsEnabled: DataModel.freezeRowsEnabled } });
        }
    }
};
