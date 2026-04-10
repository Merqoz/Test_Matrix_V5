/**
 * MANAGE.JS - Activity Reorder & Visibility Manager
 * Provides a modal to reorder test activities (via drag) and toggle
 * which ones are visible in both the matrix and the activity flow.
 * Persists hidden IDs to StorageManager prefs.
 */

const ActivityManager = {

    _dragEl: null,
    _dragOverEl: null,

    open() {
        const overlay = document.getElementById('manageOverlay');
        if (!overlay) return;

        this._renderList();
        overlay.classList.add('active');
    },

    close() {
        const overlay = document.getElementById('manageOverlay');
        if (overlay) overlay.classList.remove('active');
    },

    /* ── Build sortable list ──────────────────────────── */

    _renderList() {
        const list = document.getElementById('manageList');
        if (!list) return;

        list.innerHTML = '';
        DataModel.testColumns.forEach((test, idx) => {
            const visible = DataModel.isActivityVisible(test.id);
            const color = (typeof FlowData !== 'undefined' && FlowData.colors[test.type])
                ? FlowData.colors[test.type].primary
                : this._typeColor(test.type);

            const item = document.createElement('div');
            item.className = `manage-item${visible ? '' : ' manage-hidden'}`;
            item.dataset.testId = test.id;
            item.draggable = true;

            item.innerHTML = `
                <span class="manage-grip" title="Drag to reorder">⠿</span>
                <span class="manage-type-dot" style="background:${color}"></span>
                <span class="manage-name">${this._esc(test.name)}</span>
                <span class="manage-type">${test.type}</span>
                <label class="manage-toggle" title="${visible ? 'Hide' : 'Show'}">
                    <input type="checkbox" ${visible ? 'checked' : ''} onchange="ActivityManager._toggleVisibility(${test.id}, this.checked)">
                    <span class="manage-slider"></span>
                </label>
            `;

            // Drag events
            item.addEventListener('dragstart', e => {
                this._dragEl = item;
                item.classList.add('manage-dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('manage-dragging');
                this._dragEl = null;
                this._clearDropIndicators(list);
            });
            item.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                this._clearDropIndicators(list);
                if (this._dragEl && this._dragEl !== item) {
                    const rect = item.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    if (e.clientY < mid) {
                        item.classList.add('manage-drop-above');
                    } else {
                        item.classList.add('manage-drop-below');
                    }
                }
            });
            item.addEventListener('drop', e => {
                e.preventDefault();
                if (!this._dragEl || this._dragEl === item) return;
                const rect = item.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (e.clientY < mid) {
                    list.insertBefore(this._dragEl, item);
                } else {
                    list.insertBefore(this._dragEl, item.nextSibling);
                }
                this._clearDropIndicators(list);
                this._applyOrder(list);
            });

            list.appendChild(item);
        });
    },

    _clearDropIndicators(list) {
        list.querySelectorAll('.manage-drop-above, .manage-drop-below').forEach(el => {
            el.classList.remove('manage-drop-above', 'manage-drop-below');
        });
    },

    /* ── Toggle visibility ───────────────────────────── */

    _toggleVisibility(testId, visible) {
        if (visible) {
            DataModel.hiddenActivities = DataModel.hiddenActivities.filter(id => id !== testId);
        } else {
            if (!DataModel.hiddenActivities.includes(testId)) {
                DataModel.hiddenActivities.push(testId);
            }
        }
        this._savePrefs();

        // Update item styling
        const item = document.querySelector(`.manage-item[data-test-id="${testId}"]`);
        if (item) item.classList.toggle('manage-hidden', !visible);
    },

    showAll() {
        DataModel.hiddenActivities = [];
        this._savePrefs();
        this._renderList();
    },

    /* ── Apply reorder from DOM ──────────────────────── */

    _applyOrder(list) {
        const ids = Array.from(list.querySelectorAll('.manage-item'))
            .map(el => parseInt(el.dataset.testId));

        const reordered = [];
        ids.forEach(id => {
            const col = DataModel.testColumns.find(t => t.id === id);
            if (col) reordered.push(col);
        });
        // Keep any not in the list (safety)
        DataModel.testColumns.forEach(t => {
            if (!reordered.includes(t)) reordered.push(t);
        });
        DataModel.testColumns = reordered;

        // Persist matrix order
        if (typeof App !== 'undefined') {
            App.persistMatrix();
        } else {
            StorageManager.save({
                matrix: { testColumns: DataModel.testColumns }
            });
        }
    },

    /* ── Save & Apply ─────────────────────────────────── */

    save() {
        // Re-read DOM order in case user dragged but didn't trigger drop
        const list = document.getElementById('manageList');
        if (list) this._applyOrder(list);

        this._savePrefs();
        this.close();

        // Re-render everything
        if (typeof Renderer !== 'undefined') Renderer.render();
        if (typeof FlowApp !== 'undefined') {
            FlowApp.renderAll();
            setTimeout(() => { if (typeof FlowTimeline !== 'undefined') FlowTimeline.render(); }, 50);
        }
    },

    _savePrefs() {
        StorageManager.save({
            prefs: { hiddenActivities: DataModel.hiddenActivities }
        });
    },

    /* ── Group by type ────────────────────────────────── */

    groupByType() {
        const order = DataModel.testTypes; // ['FAT','EFAT','FIT','M-SIT','SIT','SRT']
        const grouped = [];
        order.forEach(type => {
            DataModel.testColumns.filter(t => t.type === type).forEach(t => grouped.push(t));
        });
        // Catch any not in canonical types
        DataModel.testColumns.forEach(t => { if (!grouped.includes(t)) grouped.push(t); });
        DataModel.testColumns = grouped;

        if (typeof App !== 'undefined') App.persistMatrix();
        this._renderList();
    },

    /* ── Helpers ───────────────────────────────────────── */

    _typeColor(type) {
        const map = { FAT:'#00d4ff', EFAT:'#10b981', FIT:'#8b5cf6', 'M-SIT':'#ef4444', SIT:'#f59e0b', SRT:'#ec4899' };
        return map[type] || '#667';
    },

    _esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }
};
