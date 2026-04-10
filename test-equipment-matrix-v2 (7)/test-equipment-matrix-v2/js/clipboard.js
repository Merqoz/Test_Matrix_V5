/**
 * CLIPBOARD.JS — Excel-like table interactions
 *
 * Features:
 *   - Paste tab-separated data from Excel/Sheets into any cell
 *     → data flows right across columns and down across rows
 *     → new rows are auto-created when paste overflows
 *   - Copy selected cells (Ctrl+C) as tab-separated text
 *   - Keyboard navigation: Tab, Enter, Arrow keys
 *   - Click cell to focus, Shift+Click for range selection
 *   - Blue selection highlight
 */

const ClipboardManager = {

    _anchorCell: null,  // first cell in a shift-click range
    _selectedCells: [], // array of {td, input} currently selected

    // Column field mapping: index → DataModel field name
    // col 0 = delete button (skip), col 1..6 = fixed fields, col 7+ = test qty
    _colFields: ['_delete', 'itemNo', 'description', 'partNo', 'melQty', '_qtyAuto', 'workpack', 'stakeholder'],

    init() {
        this._attachPasteHandler();
        this._attachKeyboardNav();
        this._attachCellSelection();
    },

    // ══════════════════════════════════════════════════════
    // PASTE
    // ══════════════════════════════════════════════════════

    _attachPasteHandler() {
        const table = document.getElementById('matrixTable');
        if (!table) return;

        // Handle ALL paste — single cell and multi-cell
        table.addEventListener('paste', (e) => {
            const target = e.target;
            if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;

            const clipData = (e.clipboardData || window.clipboardData).getData('text');
            if (!clipData) return;

            e.preventDefault();
            e.stopPropagation();

            const td = target.closest('td');
            const tr = td?.closest('tr.data-row');
            if (!td || !tr) return;

            const sectionId = tr.dataset.section;
            const startRowIndex = parseInt(tr.dataset.rowIndex);
            const allTds = Array.from(tr.querySelectorAll('td'));
            const startColIndex = allTds.indexOf(td);
            if (startColIndex < 0) return;

            const rows = this._parseClipboard(clipData);
            if (rows.length === 0) return;

            // Single value (no tabs, no newlines) — put into focused cell
            if (rows.length === 1 && rows[0].length === 1) {
                target.value = rows[0][0].trim();
                // Trigger save via the cell's onchange
                target.dispatchEvent(new Event('change', { bubbles: true }));
                this._showToast('Pasted');
                return;
            }

            this._pasteData(sectionId, startRowIndex, startColIndex, rows);
        });

        // Also catch programmatic value changes: 'input' event auto-saves
        table.addEventListener('input', (e) => {
            const target = e.target;
            if (target.tagName !== 'INPUT') return;
            const td = target.closest('td');
            const tr = td?.closest('tr.data-row');
            if (!td || !tr) return;
            // Debounce auto-save
            clearTimeout(target._saveTimer);
            target._saveTimer = setTimeout(() => {
                target.dispatchEvent(new Event('change', { bubbles: true }));
            }, 400);
        });
    },

    /** Parse clipboard text into a 2D array of strings */
    _parseClipboard(text) {
        // Normalize line endings
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // Remove trailing newline
        if (text.endsWith('\n')) text = text.slice(0, -1);

        return text.split('\n').map(line => line.split('\t'));
    },

    /** Paste parsed data into the matrix starting at given position */
    _pasteData(sectionId, startRow, startCol, dataRows) {
        const section = DataModel.getSection(sectionId);
        if (!section) return;

        const visibleTests = DataModel.getVisibleColumns();
        let changed = false;

        dataRows.forEach((dataCols, rowOffset) => {
            const rowIndex = startRow + rowOffset;

            // Create new rows as needed
            while (rowIndex >= section.rows.length) {
                section.rows.push({
                    itemNo: '', description: '', partNo: '',
                    qty: '', melQty: '', workpack: '', stakeholder: '', testQty: {}
                });
                changed = true;
            }

            const row = section.rows[rowIndex];

            dataCols.forEach((value, colOffset) => {
                const colIndex = startCol + colOffset;
                const trimmed = value.trim();

                if (colIndex <= 0) return; // skip delete column
                if (colIndex <= 7) {
                    // Fixed field columns (1-7)
                    const field = this._colFields[colIndex];
                    if (field && !field.startsWith('_')) {
                        row[field] = trimmed;
                        changed = true;
                    }
                } else {
                    // Test quantity columns (col 8+ maps to visible test columns)
                    const testIdx = colIndex - 8;
                    if (testIdx < visibleTests.length) {
                        row.testQty[visibleTests[testIdx].id] = trimmed;
                        changed = true;
                    }
                }
            });
        });

        if (changed) {
            // Recalculate QTY sums for all affected rows
            dataRows.forEach((dataCols, rowOffset) => {
                const rowIndex = startRow + rowOffset;
                const row = section.rows[rowIndex];
                if (row && row.testQty) {
                    let sum = 0;
                    Object.values(row.testQty).forEach(v => { const n = parseFloat(v); if (!isNaN(n)) sum += n; });
                    row.qty = sum > 0 ? String(sum) : '';
                }
            });
            Renderer.render();
            if (typeof App !== 'undefined') App.persistMatrix();

            // Show feedback
            this._showToast(
                `Pasted ${dataRows.length} row${dataRows.length > 1 ? 's' : ''} × ${dataRows[0].length} col${dataRows[0].length > 1 ? 's' : ''}`
            );
        }
    },

    // ══════════════════════════════════════════════════════
    // COPY
    // ══════════════════════════════════════════════════════

    _copySelection() {
        if (this._selectedCells.length === 0) return;

        // Group selected cells by row
        const rowMap = new Map();
        this._selectedCells.forEach(({ td }) => {
            const tr = td.closest('tr');
            if (!tr) return;
            if (!rowMap.has(tr)) rowMap.set(tr, []);
            rowMap.get(tr).push(td);
        });

        // Sort rows by DOM order, cells by column position
        const sortedRows = Array.from(rowMap.entries()).sort((a, b) => {
            return a[0].compareDocumentPosition(b[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        const lines = sortedRows.map(([tr, tds]) => {
            const allTds = Array.from(tr.querySelectorAll('td'));
            tds.sort((a, b) => allTds.indexOf(a) - allTds.indexOf(b));
            return tds.map(td => {
                const input = td.querySelector('input');
                return input ? input.value : '';
            }).join('\t');
        });

        const text = lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            this._showToast('Copied ' + this._selectedCells.length + ' cells');
        }).catch(() => {});
    },

    // ══════════════════════════════════════════════════════
    // KEYBOARD NAVIGATION
    // ══════════════════════════════════════════════════════

    _attachKeyboardNav() {
        document.addEventListener('keydown', (e) => {
            const target = e.target;
            if (target.tagName !== 'INPUT' || !target.closest('#matrixTable')) return;

            const td = target.closest('td');
            const tr = td?.closest('tr');
            if (!td || !tr) return;

            let nextInput = null;

            if (e.key === 'Tab') {
                e.preventDefault();
                nextInput = e.shiftKey ? this._getCellAt(tr, td, 0, -1) : this._getCellAt(tr, td, 0, 1);
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                nextInput = e.shiftKey ? this._getCellAt(tr, td, -1, 0) : this._getCellAt(tr, td, 1, 0);
            }
            else if (e.key === 'ArrowDown') {
                nextInput = this._getCellAt(tr, td, 1, 0);
                if (nextInput) e.preventDefault();
            }
            else if (e.key === 'ArrowUp') {
                nextInput = this._getCellAt(tr, td, -1, 0);
                if (nextInput) e.preventDefault();
            }
            else if (e.key === 'ArrowRight' && target.selectionStart === target.value.length) {
                nextInput = this._getCellAt(tr, td, 0, 1);
                if (nextInput) e.preventDefault();
            }
            else if (e.key === 'ArrowLeft' && target.selectionStart === 0) {
                nextInput = this._getCellAt(tr, td, 0, -1);
                if (nextInput) e.preventDefault();
            }
            // Ctrl+C with selection
            else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this._selectedCells.length > 1) {
                e.preventDefault();
                this._copySelection();
                return;
            }

            if (nextInput) {
                nextInput.focus();
                nextInput.select();
            }
        });
    },

    /** Get input at offset rows/cols from current cell */
    _getCellAt(currentRow, currentTd, rowDelta, colDelta) {
        const allTds = Array.from(currentRow.querySelectorAll('td'));
        let colIdx = allTds.indexOf(currentTd) + colDelta;

        // Get all data rows in the same section
        const tbody = currentRow.closest('tbody');
        if (!tbody) return null;
        const allRows = Array.from(tbody.querySelectorAll('tr.data-row'));
        let rowIdx = allRows.indexOf(currentRow) + rowDelta;

        // Clamp
        if (rowIdx < 0 || rowIdx >= allRows.length) return null;
        const targetRow = allRows[rowIdx];
        const targetTds = Array.from(targetRow.querySelectorAll('td'));

        // If only row changed, keep same column
        if (colDelta === 0) colIdx = allTds.indexOf(currentTd);

        // Skip non-input columns and wrap
        const maxAttempts = targetTds.length;
        for (let i = 0; i < maxAttempts; i++) {
            if (colIdx < 0) {
                // Wrap to previous row's last column
                rowIdx--;
                if (rowIdx < 0) return null;
                const prevRow = allRows[rowIdx];
                const prevTds = Array.from(prevRow.querySelectorAll('td'));
                colIdx = prevTds.length - 2; // skip add-test-col
                const input = prevTds[colIdx]?.querySelector('input');
                if (input) return input;
            }
            if (colIdx >= targetTds.length - 1) {
                // Wrap to next row's first input column
                rowIdx++;
                if (rowIdx >= allRows.length) return null;
                const nextRow = allRows[rowIdx];
                const nextTds = Array.from(nextRow.querySelectorAll('td'));
                colIdx = 1; // skip delete column
                const input = nextTds[colIdx]?.querySelector('input');
                if (input) return input;
            }
            const input = targetTds[colIdx]?.querySelector('input');
            if (input) return input;
            colIdx += colDelta || 1;
        }
        return null;
    },

    // ══════════════════════════════════════════════════════
    // CELL SELECTION
    // ══════════════════════════════════════════════════════

    _attachCellSelection() {
        const table = document.getElementById('matrixTable');
        if (!table) return;

        table.addEventListener('mousedown', (e) => {
            const td = e.target.closest('td');
            if (!td || !td.closest('tr.data-row')) return;
            if (e.target.tagName === 'BUTTON') return; // ignore delete buttons

            if (e.shiftKey && this._anchorCell) {
                // Range select
                e.preventDefault();
                this._selectRange(this._anchorCell, td);
            } else {
                // Single select — set anchor
                this._clearSelection();
                this._anchorCell = td;
                this._addToSelection(td);
            }
        });

        // Clear selection on click outside table
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('#matrixTable')) {
                this._clearSelection();
            }
        });
    },

    _addToSelection(td) {
        const input = td.querySelector('input');
        td.classList.add('cell-selected');
        this._selectedCells.push({ td, input });
    },

    _clearSelection() {
        this._selectedCells.forEach(({ td }) => td.classList.remove('cell-selected'));
        this._selectedCells = [];
    },

    _selectRange(startTd, endTd) {
        this._clearSelection();

        const startTr = startTd.closest('tr');
        const endTr = endTd.closest('tr');
        const tbody = startTr.closest('tbody');
        if (!tbody) return;

        const allRows = Array.from(tbody.querySelectorAll('tr.data-row'));
        let startRowIdx = allRows.indexOf(startTr);
        let endRowIdx = allRows.indexOf(endTr);
        if (startRowIdx < 0 || endRowIdx < 0) return;

        // Normalize direction
        if (startRowIdx > endRowIdx) { const t = startRowIdx; startRowIdx = endRowIdx; endRowIdx = t; }

        const startTds = Array.from(startTr.querySelectorAll('td'));
        const endTds = Array.from(endTr.querySelectorAll('td'));
        let startColIdx = startTds.indexOf(startTd);
        let endColIdx = endTds.indexOf(endTd);
        if (startColIdx > endColIdx) { const t = startColIdx; startColIdx = endColIdx; endColIdx = t; }

        for (let r = startRowIdx; r <= endRowIdx; r++) {
            const row = allRows[r];
            const tds = Array.from(row.querySelectorAll('td'));
            for (let c = startColIdx; c <= endColIdx; c++) {
                if (tds[c]) this._addToSelection(tds[c]);
            }
        }
    },

    // ══════════════════════════════════════════════════════
    // TOAST
    // ══════════════════════════════════════════════════════

    _showToast(msg) {
        let toast = document.getElementById('clipboardToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'clipboardToast';
            toast.className = 'clipboard-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('visible');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('visible'), 2500);
    }
};
