/**
 * DRAGDROP.JS - Matrix Column Reordering via Arrow Buttons
 * ◀ ▶ arrows in each column header move the column left / right.
 * Constraint: can only swap with adjacent columns of the SAME activity type.
 */

const DragDropManager = {

    /**
     * No-op: kept for backward compatibility with render.js call.
     * Arrow buttons are rendered inline in the header HTML.
     */
    attachEvents(_element) {},

    /**
     * Move a column one position to the LEFT.
     * Only swaps if the column to the left has the same type.
     */
    moveLeft(testId) {
        const cols = DataModel.testColumns;
        const idx  = cols.findIndex(t => t.id === testId);
        if (idx <= 0) return;

        const current = cols[idx];
        const target  = cols[idx - 1];

        if (current.type !== target.type) {
            this._flash(testId, 'invalid');
            return;
        }

        // Swap in place
        cols[idx]     = target;
        cols[idx - 1] = current;

        Renderer.render();
        if (typeof App !== 'undefined') App.persistMatrix();
    },

    /**
     * Move a column one position to the RIGHT.
     * Only swaps if the column to the right has the same type.
     */
    moveRight(testId) {
        const cols = DataModel.testColumns;
        const idx  = cols.findIndex(t => t.id === testId);
        if (idx < 0 || idx >= cols.length - 1) return;

        const current = cols[idx];
        const target  = cols[idx + 1];

        if (current.type !== target.type) {
            this._flash(testId, 'invalid');
            return;
        }

        cols[idx]     = target;
        cols[idx + 1] = current;

        Renderer.render();
        if (typeof App !== 'undefined') App.persistMatrix();
    },

    /**
     * Quick visual flash on invalid move attempt
     */
    _flash(testId, cls) {
        const th = document.querySelector(`th[data-test-id="${testId}"]`);
        if (!th) return;
        th.classList.add(`col-${cls}`);
        setTimeout(() => th.classList.remove(`col-${cls}`), 400);
    }
};
