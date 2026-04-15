/**
 * SECTIONS.JS - Section Management
 * Handles section collapse, row add/delete, and data updates
 */

const SectionManager = {
    /**
     * Toggle section collapse
     */
    toggle(sectionId) {
        const section = DataModel.getSection(sectionId);
        if (section) {
            section.collapsed = !section.collapsed;
            Renderer.render();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Toggle WP sub-group collapse
     */
    toggleWp(wpId) {
        if (!DataModel._collapsedWps) DataModel._collapsedWps = {};
        DataModel._collapsedWps[wpId] = !DataModel._collapsedWps[wpId];
        Renderer.render();
    },

    /**
     * Add new row to section
     */
    addRow(sectionId) {
        const section = DataModel.getSection(sectionId);
        if (section) {
            section.rows.push({
                itemNo: '',
                description: '',
                partNo: '',
                qty: '',
                melQty: '',
                workpack: '',
                stakeholder: '',
                testQty: {}
            });
            Renderer.render();
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Delete row from section
     */
    deleteRow(sectionId, rowIndex) {
        const section = DataModel.getSection(sectionId);
        if (!section) return;

        if (section.rows.length > 1) {
            if (confirm('Are you sure you want to delete this row?')) {
                // Log to history
                const row = section.rows[rowIndex];
                if (row && (row.itemNo || row.description) && typeof StorageManager !== 'undefined') {
                    const history = StorageManager.loadHistory();
                    history.deletedEquipment.push({
                        section: section.name,
                        sectionId: section.id,
                        itemNo: row.itemNo || '',
                        description: row.description || '',
                        partNo: row.partNo || '',
                        qty: row.qty || '',
                        melQty: row.melQty || '',
                        workpack: row.workpack || '',
                        stakeholder: row.stakeholder || '',
                        testQty: row.testQty ? JSON.parse(JSON.stringify(row.testQty)) : {},
                        deletedAt: new Date().toISOString()
                    });
                    if (history.deletedEquipment.length > 200) {
                        history.deletedEquipment = history.deletedEquipment.slice(-200);
                    }
                    StorageManager.saveNow({ history: history });
                }

                section.rows.splice(rowIndex, 1);
                Renderer.render();
                if (typeof App !== 'undefined') App.persistMatrix();
            }
        } else {
            // Clear the last row instead of deleting
            if (confirm('This is the last row. Clear all data instead?')) {
                section.rows[0] = {
                    itemNo: '',
                    description: '',
                    partNo: '',
                    qty: '',
                    melQty: '',
                    workpack: '',
                    stakeholder: '',
                    testQty: {}
                };
                Renderer.render();
                if (typeof App !== 'undefined') App.persistMatrix();
            }
        }
    },

    /**
     * Update row field
     */
    updateRow(sectionId, rowIndex, field, value) {
        const section = DataModel.getSection(sectionId);
        if (section && section.rows[rowIndex]) {
            section.rows[rowIndex][field] = value;
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Update test quantity for a row
     */
    updateTestQty(sectionId, rowIndex, testId, value) {
        const section = DataModel.getSection(sectionId);
        if (section && section.rows[rowIndex]) {
            section.rows[rowIndex].testQty[testId] = value;
            // Auto-recalculate QTY sum
            let sum = 0;
            Object.values(section.rows[rowIndex].testQty).forEach(v => {
                const n = parseFloat(v);
                if (!isNaN(n)) sum += n;
            });
            section.rows[rowIndex].qty = sum > 0 ? String(sum) : '';
            // Update the displayed sum in the QTY cell
            const tr = document.querySelector(`tr.data-row[data-section="${sectionId}"][data-row-index="${rowIndex}"]`);
            if (tr) {
                const qtySpan = tr.querySelector('.qty-sum');
                if (qtySpan) qtySpan.textContent = sum > 0 ? sum : '—';
            }
            if (typeof App !== 'undefined') App.persistMatrix();
        }
    },

    /**
     * Get all rows with test quantities for a specific test
     */
    getRowsForTest(testId) {
        const rows = [];
        
        DataModel.sections.forEach(section => {
            section.rows.forEach(row => {
                const testQty = row.testQty[testId];
                if (testQty && testQty !== '0' && testQty !== '') {
                    rows.push({
                        section: section.name,
                        itemNo: row.itemNo,
                        description: row.description,
                        partNo: row.partNo,
                        qtyOrdered: row.qty,
                        testQty: testQty,
                        workpack: row.workpack,
                        stakeholder: row.stakeholder
                    });
                }
            });
        });

        return rows;
    },

    /**
     * Check for duplicates based on item, description, and part number
     */
    checkDuplicates(rows) {
        const seen = new Map();
        const duplicates = [];
        
        rows.forEach((row, index) => {
            const key = `${row.itemNo}|${row.description}|${row.partNo}`.toLowerCase();
            if (key !== '||' && seen.has(key)) {
                duplicates.push({
                    index: index,
                    original: seen.get(key),
                    row: row
                });
            } else if (key !== '||') {
                seen.set(key, index);
            }
        });
        
        return duplicates;
    }
};
