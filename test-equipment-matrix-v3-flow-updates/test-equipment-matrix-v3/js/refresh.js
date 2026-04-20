/**
 * REFRESH.JS - Refresh Pipeline
 * Runs all auto-fix / auto-sort operations when the Refresh button is pressed.
 * Designed to be extended — add new steps to the pipeline array.
 */

const RefreshManager = {
    /**
     * Pipeline of refresh operations.
     * Each entry: { name, fn }
     * Add new steps by pushing to this array from other scripts.
     */
    pipeline: [],

    /**
     * Initialise built-in pipeline steps
     */
    init() {
        // Auto-sort columns by activity type order
        this.pipeline.push({
            name: 'autoSortColumns',
            fn: () => this.autoSortColumns()
        });

        // Future steps can be added from other scripts:
        //   RefreshManager.pipeline.push({ name: 'myStep', fn: () => { ... } });
    },

    /**
     * Execute the full refresh pipeline, then re-render.
     */
    run() {
        console.log('[Refresh] Running pipeline…');

        let changed = false;

        this.pipeline.forEach(step => {
            try {
                const result = step.fn();
                if (result) changed = true;
                console.log(`  ✓ ${step.name}`);
            } catch (e) {
                console.error(`  ✗ ${step.name}`, e);
            }
        });

        // Re-render
        Renderer.render();
        if (typeof ResizeManager !== 'undefined') {
            ResizeManager.refresh();
        }

        // Persist
        if (typeof App !== 'undefined') {
            App.persistMatrix();
        }

        // Visual feedback on button
        const btn = document.querySelector('.refresh-btn');
        if (btn) {
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => { btn.style.transform = ''; }, 200);
        }

        console.log('[Refresh] Done — columns sorted:', changed);
    },

    /**
     * Auto-sort test columns by canonical activity type order:
     * FAT → FIT → EFAT → M-SIT → SIT → SRT
     * Within each type group, original relative order is preserved.
     * Returns true if the order changed.
     */
    autoSortColumns() {
        const typeOrder = DataModel.testTypes;  // ['FAT','FIT','EFAT','M-SIT','SIT','SRT']
        const before = DataModel.testColumns.map(t => t.id).join(',');

        const sorted = [];
        typeOrder.forEach(type => {
            DataModel.testColumns
                .filter(t => t.type === type)
                .forEach(t => sorted.push(t));
        });

        // Catch any with non-standard types
        DataModel.testColumns.forEach(t => {
            if (!sorted.includes(t)) sorted.push(t);
        });

        DataModel.testColumns = sorted;

        const after = DataModel.testColumns.map(t => t.id).join(',');
        return before !== after;
    }
};
