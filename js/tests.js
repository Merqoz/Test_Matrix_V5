/**
 * TESTS.JS - Test Column Management
 * Handles adding, deleting, and updating test columns
 */

const TestManager = {
    /**
     * Add new test column
     */
    add(opts) {
        const o = opts || {};
        // Ensure nextTestId is always above any existing id
        const maxId = DataModel.testColumns.reduce((mx, t) => Math.max(mx, t.id || 0), 0);
        if (DataModel.nextTestId <= maxId) DataModel.nextTestId = maxId + 1;

        DataModel.testColumns.push({
            id: DataModel.nextTestId++,
            uid: DataModel.generateUid(),
            name: o.name || `Test ${DataModel.testColumns.length + 1}`,
            type: o.type || 'FAT',
            location: o.location || DataModel.getLocationNames()[0] || '',
            workpack: o.workpack || '',
            startDate: o.startDate || '',
            endDate: o.endDate || ''
        });
        
        // Renderer.render() already calls FilterManager.refresh() which applies
        // filters synchronously — no extra call needed
        Renderer.render();
        if (typeof App !== 'undefined') App.persistMatrix();
    },

    /**
     * Open the add test activity modal with pre-populated dropdowns
     */
    openAddModal() {
        const modal = document.getElementById('addTestModal');
        if (!modal) return;

        // Populate type dropdown
        const typeSelect = document.getElementById('addTestType');
        if (typeSelect) {
            typeSelect.innerHTML = DataModel.testTypes.map(t =>
                `<option value="${t}">${t}</option>`
            ).join('');
        }

        // Populate location dropdown
        const locSelect = document.getElementById('addTestLocation');
        if (locSelect) {
            locSelect.innerHTML = DataModel.getLocationNames().map(n =>
                `<option value="${n}">${n}</option>`
            ).join('');
        }

        // Populate workpack dropdown
        const wpSelect = document.getElementById('addTestWorkpack');
        if (wpSelect) {
            wpSelect.innerHTML = '<option value="">—</option>' +
                DataModel.workpacks.map(wp =>
                    `<option value="${wp}">${wp}</option>`
                ).join('');
        }

        // Clear/reset fields
        document.getElementById('addTestName').value = '';
        document.getElementById('addTestStart').value = '';
        document.getElementById('addTestEnd').value = '';

        modal.classList.add('active');
        setTimeout(() => document.getElementById('addTestName').focus(), 50);

        // Enter key submits
        modal._keyHandler = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.confirmAdd(); }
            if (e.key === 'Escape') { this.closeAddModal(); }
        };
        modal.addEventListener('keydown', modal._keyHandler);
    },

    /**
     * Close the add test modal
     */
    closeAddModal() {
        const modal = document.getElementById('addTestModal');
        if (modal) {
            modal.classList.remove('active');
            if (modal._keyHandler) {
                modal.removeEventListener('keydown', modal._keyHandler);
                modal._keyHandler = null;
            }
        }
    },

    /**
     * Confirm and add the new test activity from modal fields
     */
    confirmAdd() {
        const name = (document.getElementById('addTestName').value || '').trim();
        const type = document.getElementById('addTestType').value;
        const location = document.getElementById('addTestLocation').value;
        const workpack = document.getElementById('addTestWorkpack').value;
        const startDate = document.getElementById('addTestStart').value;
        const endDate = document.getElementById('addTestEnd').value;

        if (!name) {
            document.getElementById('addTestName').focus();
            document.getElementById('addTestName').style.borderColor = '#ef4444';
            setTimeout(() => document.getElementById('addTestName').style.borderColor = '', 1500);
            return;
        }

        this.add({ name, type, location, workpack, startDate, endDate });
        this.closeAddModal();
    },

    /**
     * Delete test column
     */
    delete(testId) {
        if (DataModel.testColumns.length <= 1) {
            alert('You must have at least one test column.');
            return;
        }

        if (confirm('Are you sure you want to delete this test column?')) {
            // Capture the activity before removal
            const test = DataModel.testColumns.find(t => t.id === testId);

            // Capture attached equipment for this activity
            const equipment = [];
            if (test) {
                DataModel.sections.forEach(section => {
                    section.rows.forEach(row => {
                        const qty = row.testQty ? row.testQty[testId] : '';
                        if (qty && qty !== '0' && String(qty).trim() !== '') {
                            equipment.push({
                                section: section.name,
                                sectionId: section.id,
                                itemNo: row.itemNo || '',
                                description: row.description || '',
                                partNo: row.partNo || '',
                                qty: qty,
                                workpack: row.workpack || '',
                                stakeholder: row.stakeholder || ''
                            });
                        }
                    });
                });
            }

            // Log to history
            if (test && typeof StorageManager !== 'undefined') {
                const history = StorageManager.loadHistory();
                history.deletedActivities.push({
                    ...test,
                    equipment: equipment,
                    deletedAt: new Date().toISOString()
                });
                // Keep last 100 entries to avoid storage bloat
                if (history.deletedActivities.length > 100) {
                    history.deletedActivities = history.deletedActivities.slice(-100);
                }
                StorageManager.saveNow({ history: history });
            }

            // Remove test column
            DataModel.testColumns = DataModel.testColumns.filter(t => t.id !== testId);
            
            // Remove test quantities from all rows (including sub-activity IDs)
            const subIds = (test && test.subActivities) ? test.subActivities.map(s => s.id) : [];
            DataModel.sections.forEach(section => {
                section.rows.forEach(row => {
                    delete row.testQty[testId];
                    subIds.forEach(sid => delete row.testQty[sid]);
                });
            });
            
            Renderer.render();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Update test name — only persist if changed
     */
    updateName(testId, value) {
        const test = DataModel.getTest(testId);
        if (test && test.name !== value) {
            test.name = value;
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Update test type — only persist if changed
     */
    updateType(testId, value) {
        const test = DataModel.getTest(testId);
        if (test && test.type !== value) {
            test.type = value;
            if (typeof FilterManager !== 'undefined') FilterManager.refresh();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Update test location — persist and sync to gantt bars
     */
    updateLocation(testId, value) {
        const test = DataModel.getTest(testId);
        if (test && test.location !== value) {
            test.location = value;
            this._syncToGanttBars(testId, { location: value });
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Update test date — persist and sync to gantt bars
     */
    updateDate(testId, field, value) {
        const test = DataModel.getTest(testId);
        if (test && test[field] !== value) {
            test[field] = value;
            var patch = {};
            patch[field] = value;
            this._syncToGanttBars(testId, patch);
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Update test workpack — only persist if changed
     */
    updateWorkpack(testId, value) {
        const test = DataModel.getTest(testId);
        if (test && test.workpack !== value) {
            test.workpack = value;
            if (typeof FilterManager !== 'undefined') FilterManager.refresh();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Update test uid — only persist if changed
     */
    updateUid(testId, value) {
        const test = DataModel.getTest(testId);
        if (test) {
            const newUid = value.trim() || DataModel.generateUid();
            if (test.uid !== newUid) {
                test.uid = newUid;
                if (typeof App !== 'undefined') App.persistMatrix();
            }
        }
    },

    /**
     * Toggle the settings popup for a test column
     */
    toggleSettingsPopup(testId) {
        const popup = document.getElementById(`settings-popup-${testId}`);
        if (!popup) return;

        // Close all other open settings popups first
        document.querySelectorAll('.test-settings-popup.open').forEach(p => {
            if (p !== popup) p.classList.remove('open');
        });

        popup.classList.toggle('open');

        // Close popup when clicking outside
        if (popup.classList.contains('open')) {
            const closeHandler = (e) => {
                if (!popup.contains(e.target) && !e.target.closest(`.settings-btn[data-test-id="${testId}"]`)) {
                    popup.classList.remove('open');
                    document.removeEventListener('click', closeHandler, true);
                }
            };
            // Use setTimeout to avoid the current click from immediately closing
            setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
        }
    },

    /**
     * Show uid edit popup for a test
     */
    showUidPopup(testId) {
        const test = DataModel.getTest(testId);
        if (!test) return;

        // Remove existing popup
        const old = document.getElementById('uidPopup');
        if (old) old.remove();

        const popup = document.createElement('div');
        popup.id = 'uidPopup';
        popup.className = 'uid-popup';
        popup.innerHTML = `
            <div class="uid-popup-content">
                <div class="uid-popup-title">Test Activity ID</div>
                <p class="uid-popup-desc">Unique identifier for <strong>${test.name}</strong>. Auto-assigned if left empty. Used for references and integrations.</p>
                <div class="uid-popup-field">
                    <label>UID</label>
                    <input type="text" id="uidPopupInput" value="${test.uid || ''}" placeholder="e.g. test-01" spellcheck="false">
                </div>
                <div class="uid-popup-actions">
                    <button class="modal-btn secondary" onclick="document.getElementById('uidPopup').remove()">Cancel</button>
                    <button class="modal-btn primary" onclick="TestManager.confirmUid(${testId})">Save</button>
                </div>
            </div>
        `;
        popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
        document.body.appendChild(popup);
        document.getElementById('uidPopupInput').focus();
    },

    confirmUid(testId) {
        const input = document.getElementById('uidPopupInput');
        if (input) this.updateUid(testId, input.value);
        const popup = document.getElementById('uidPopup');
        if (popup) popup.remove();
        Renderer.render();
    },

    /**
     * Reorder test columns
     */
    reorder(draggedId, targetId) {
        const draggedIndex = DataModel.testColumns.findIndex(t => t.id === draggedId);
        const targetIndex = DataModel.testColumns.findIndex(t => t.id === targetId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [removed] = DataModel.testColumns.splice(draggedIndex, 1);
            DataModel.testColumns.splice(targetIndex, 0, removed);
            Renderer.render();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Auto-group test columns by activity type
     * Groups appear in the canonical order defined in DataModel.testTypes
     * Within each group, original relative order is preserved
     */
    groupByType() {
        const typeOrder = DataModel.testTypes; // ['FAT','EFAT','FIT','M-SIT','SIT','SRT']
        const grouped = [];

        typeOrder.forEach(type => {
            DataModel.testColumns
                .filter(t => t.type === type)
                .sort((a, b) => (a.workpack || '').localeCompare(b.workpack || ''))
                .forEach(t => grouped.push(t));
        });

        // Catch any columns whose type doesn't match the canonical list
        DataModel.testColumns.forEach(t => {
            if (!grouped.includes(t)) grouped.push(t);
        });

        DataModel.testColumns = grouped;
        Renderer.render();
        if (typeof App !== 'undefined') App.persistMatrix();
    },

    // =============================================
    // SUB-ACTIVITY MANAGEMENT
    // =============================================

    /**
     * Add a sub-activity to a parent test (duplicates parent data by default)
     */
    addSubActivity(parentId) {
        const parent = DataModel.testColumns.find(t => t.id === parentId);
        if (!parent) return;

        // Ensure nextTestId is above all existing IDs
        let maxId = DataModel.testColumns.reduce((mx, t) => Math.max(mx, t.id || 0), 0);
        DataModel.testColumns.forEach(t => {
            if (t.subActivities) t.subActivities.forEach(s => { maxId = Math.max(maxId, s.id || 0); });
        });
        if (DataModel.nextTestId <= maxId) DataModel.nextTestId = maxId + 1;

        if (!parent.subActivities) parent.subActivities = [];

        const subId = DataModel.nextTestId++;
        const subNum = parent.subActivities.length + 1;

        parent.subActivities.push({
            id: subId,
            parentId: parentId,
            uid: DataModel.generateUid(),
            name: `${parent.name} #${subNum}`,
            type: parent.type,
            location: parent.location,
            workpack: parent.workpack,
            startDate: parent.startDate,
            endDate: parent.endDate
        });

        // Copy parent test quantities to sub-activity for each row
        DataModel.sections.forEach(section => {
            section.rows.forEach(row => {
                if (row.testQty && row.testQty[parentId]) {
                    row.testQty[subId] = row.testQty[parentId];
                }
            });
        });

        // Auto-expand so the new sub is visible
        if (!DataModel.isSubExpanded(parentId)) {
            DataModel.toggleSubExpanded(parentId);
        }

        // Close settings popup
        const popup = document.getElementById(`settings-popup-${parentId}`);
        if (popup) popup.classList.remove('open');

        Renderer.render();
        if (typeof App !== 'undefined') App.persistMatrix();
    },

    /**
     * Toggle sub-activity visibility for a parent test
     */
    toggleSubActivities(parentId) {
        DataModel.toggleSubExpanded(parentId);
        Renderer.render();
    },

    /**
     * Delete a sub-activity
     */
    deleteSubActivity(parentId, subId) {
        const parent = DataModel.testColumns.find(t => t.id === parentId);
        if (!parent || !parent.subActivities) return;

        if (confirm('Delete this sub-activity?')) {
            parent.subActivities = parent.subActivities.filter(s => s.id !== subId);

            // Clean up testQty references
            DataModel.sections.forEach(section => {
                section.rows.forEach(row => {
                    delete row.testQty[subId];
                });
            });

            Renderer.render();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Update a field on a sub-activity
     */
    updateSubField(parentId, subId, field, value) {
        const parent = DataModel.testColumns.find(t => t.id === parentId);
        if (!parent || !parent.subActivities) return;
        const sub = parent.subActivities.find(s => s.id === subId);
        if (sub && sub[field] !== value) {
            sub[field] = value;
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Move sub-activity left within parent's sub-array
     */
    moveSubLeft(parentId, subId) {
        const parent = DataModel.testColumns.find(t => t.id === parentId);
        if (!parent || !parent.subActivities) return;
        const idx = parent.subActivities.findIndex(s => s.id === subId);
        if (idx > 0) {
            const [moved] = parent.subActivities.splice(idx, 1);
            parent.subActivities.splice(idx - 1, 0, moved);
            Renderer.render();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Move sub-activity right within parent's sub-array
     */
    moveSubRight(parentId, subId) {
        const parent = DataModel.testColumns.find(t => t.id === parentId);
        if (!parent || !parent.subActivities) return;
        const idx = parent.subActivities.findIndex(s => s.id === subId);
        if (idx >= 0 && idx < parent.subActivities.length - 1) {
            const [moved] = parent.subActivities.splice(idx, 1);
            parent.subActivities.splice(idx + 1, 0, moved);
            Renderer.render();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Sync test activity changes (location, dates) to gantt bars that reference this testId.
     * Updates bars in StorageManager gantt slice so gantt-chart.html picks them up.
     * @param {number} testId
     * @param {object} patch — { location?, startDate?, endDate? }
     */
    _syncToGanttBars(testId, patch) {
        if (typeof StorageManager === 'undefined') return;
        var gantt = StorageManager.loadGantt();
        if (!gantt || !gantt.bars) return;

        var changed = false;
        var numId = parseInt(testId);

        Object.keys(gantt.bars).forEach(function(rowKey) {
            gantt.bars[rowKey].forEach(function(bar) {
                if (bar.testId && parseInt(bar.testId) === numId) {
                    if (patch.location && bar.location !== patch.location) {
                        bar.location = patch.location;
                        bar.label = patch.location;
                        changed = true;
                    }
                    if (patch.startDate && bar.startDate !== patch.startDate) {
                        bar.startDate = patch.startDate;
                        changed = true;
                    }
                    if (patch.endDate && bar.endDate !== patch.endDate) {
                        bar.endDate = patch.endDate;
                        changed = true;
                    }
                }
            });
        });

        if (changed) {
            StorageManager.saveNow({ gantt: gantt });
        }
    }
};
