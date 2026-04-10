/**
 * FREEZE.JS - Column Freeze Functionality
 * Handles toggling frozen columns on/off
 */

const FreezeManager = {
    /**
     * Toggle freeze mode
     */
    toggle() {
        DataModel.freezeEnabled = !DataModel.freezeEnabled;
        this.updateUI();
        this.savePreference();
        Renderer.render();
        
        // Update freeze positions based on current column widths
        if (typeof ResizeManager !== 'undefined') {
            setTimeout(() => ResizeManager.updateFreezePositions(), 100);
        }
    },

    /**
     * Enable freeze
     */
    enable() {
        DataModel.freezeEnabled = true;
        this.updateUI();
        Renderer.render();
        
        if (typeof ResizeManager !== 'undefined') {
            setTimeout(() => ResizeManager.updateFreezePositions(), 100);
        }
    },

    /**
     * Disable freeze
     */
    disable() {
        DataModel.freezeEnabled = false;
        this.updateUI();
        Renderer.render();
    },

    /**
     * Update UI to reflect freeze state
     */
    updateUI() {
        const btn = document.getElementById('freezeToggle');
        const label = document.getElementById('freezeLabel');
        const tableScroll = document.getElementById('tableScroll');

        if (DataModel.freezeEnabled) {
            btn.classList.add('active');
            label.textContent = 'Freeze On';
            tableScroll.classList.add('freeze-mode');
        } else {
            btn.classList.remove('active');
            label.textContent = 'Freeze Off';
            tableScroll.classList.remove('freeze-mode');
        }
    },

    /**
     * Initialize freeze state from stored preference
     */
    init() {
        const prefs = typeof StorageManager !== 'undefined' ? StorageManager.loadPrefs() : null;
        if (prefs && prefs.freezeEnabled) {
            DataModel.freezeEnabled = true;
        }
        this.updateUI();
    },

    /**
     * Save freeze preference
     */
    savePreference() {
        if (typeof StorageManager !== 'undefined') {
            StorageManager.save({ prefs: { freezeEnabled: DataModel.freezeEnabled } });
        }
    }
};
