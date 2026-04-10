/**
 * ACTIVITY-IMPORT.JS - Activity Column Import
 * Handles the "|||" button — import test activity columns from JSON or CSV.
 *
 * Supports TWO import modes:
 *  A) Column definitions: adds new test columns (Name, Type, Location, …)
 *  B) Single test export (with items): creates the column AND maps
 *     test quantities onto existing rows by matching Part No. or Item #.
 *
 * Format detection is automatic based on file structure.
 */

const ActivityImport = {

    /** Open the activity import modal */
    open() {
        const preview = document.getElementById('activityImportPreview');
        if (preview) preview.innerHTML = '<p style="color:#667;text-align:center;padding:20px;">Select a file to preview activities…</p>';
        this._pending = null;
        const confirmBtn = document.getElementById('activityImportConfirm');
        if (confirmBtn) confirmBtn.disabled = true;
        ModalManager.open('activityImportModal');
    },

    /** Staging area for parsed import */
    _pending: null, // { mode: 'columns'|'test', activities?, testInfo?, items? }

    /** Handle file selection */
    handleFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = '';

        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target.result;
            try {
                let result;
                if (ext === 'json') {
                    result = this._parseJSON(text);
                } else if (ext === 'csv') {
                    result = this._parseCSV(text);
                } else {
                    alert('Unsupported format. Use .json or .csv');
                    return;
                }

                if (!result) {
                    alert('No valid data found in file.');
                    return;
                }

                this._pending = result;
                this._showPreview(result, file.name);
            } catch (err) {
                alert('Error parsing file: ' + err.message);
            }
        };

        reader.onerror = () => alert('Error reading file.');
        reader.readAsText(file);
    },

    /* ── JSON Parsing ──────────────────────────────────── */

    _parseJSON(text) {
        const data = JSON.parse(text);

        // Mode B: Single test activity export (has testActivity + items)
        if (data.testActivity && data.items) {
            return {
                mode: 'test',
                testInfo: {
                    uid:       data.testActivity.uid || '',
                    name:      data.testActivity.name || 'Imported Test',
                    type:      this._validType(data.testActivity.type),
                    location:  data.testActivity.location || '',
                    workpack:  data.testActivity.workpack || '',
                    startDate: data.testActivity.startDate || '',
                    endDate:   data.testActivity.endDate || ''
                },
                items: data.items.map(r => ({
                    section:     r.section     || '',
                    itemNo:      r.itemNo      || '',
                    description: r.description || '',
                    partNo:      r.partNo      || '',
                    qty:         r.qtyOrdered  || r.qty || '',
                    testQty:     r.testQty     || '',
                    workpack:    r.workpack    || '',
                    stakeholder: r.stakeholder || ''
                }))
            };
        }

        // Mode A: Column definitions
        let raw = [];
        if (data.testColumns && Array.isArray(data.testColumns))        raw = data.testColumns;
        else if (data.activities && Array.isArray(data.activities))      raw = data.activities;
        else if (Array.isArray(data))                                   raw = data;
        else throw new Error('Unrecognised JSON structure.');

        const activities = raw.map(r => this._normalise(r)).filter(Boolean);
        if (activities.length === 0) return null;
        return { mode: 'columns', activities };
    },

    /* ── CSV Parsing ───────────────────────────────────── */

    _parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row.');

        // Detect Mode B: starts with "Test Activity Export"
        if (lines[0]?.startsWith('Test Activity Export')) {
            return this._parseTestCSV(lines);
        }

        // Mode A: column definitions
        const header = this._splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());
        const nameIdx     = this._findCol(header, ['name', 'test name', 'activity', 'test']);
        const typeIdx     = this._findCol(header, ['type', 'activity type', 'test type']);
        const locationIdx = this._findCol(header, ['location', 'loc', 'site']);
        const wpIdx       = this._findCol(header, ['workpack', 'wp', 'work package']);
        const uidIdx      = this._findCol(header, ['uid', 'id', 'test id']);
        const startIdx    = this._findCol(header, ['start', 'start date', 'startdate', 'from']);
        const endIdx      = this._findCol(header, ['end', 'end date', 'enddate', 'to']);

        if (nameIdx === -1) throw new Error('CSV must have a "Name" column.');

        const activities = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = this._splitCSVLine(lines[i]);
            if (cols.length === 0 || !cols[0]?.trim()) continue;
            activities.push({
                uid:       cols[uidIdx]?.trim()       || '',
                name:      cols[nameIdx]?.trim()      || `Activity ${i}`,
                type:      this._validType(cols[typeIdx]?.trim()),
                location:  cols[locationIdx]?.trim()   || '',
                workpack:  cols[wpIdx]?.trim()         || '',
                startDate: cols[startIdx]?.trim()      || '',
                endDate:   cols[endIdx]?.trim()         || ''
            });
        }
        if (activities.length === 0) return null;
        return { mode: 'columns', activities };
    },

    /** Parse per-test CSV export format */
    _parseTestCSV(lines) {
        // Lines: "Test Activity Export", "UID,<v>", "Test Name,<v>", "Type,<v>", "Location,<v>", "Workpack,<v>", …
        const testInfo = {
            uid: '', name: '', type: 'FAT', location: '', workpack: '', startDate: '', endDate: ''
        };

        let dataStart = -1;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('UID,'))        testInfo.uid      = line.split(',').slice(1).join(',').trim();
            else if (line.startsWith('Test Name,'))  testInfo.name     = line.split(',').slice(1).join(',').trim();
            else if (line.startsWith('Type,'))  testInfo.type     = this._validType(line.split(',')[1]?.trim());
            else if (line.startsWith('Location,')) testInfo.location = line.split(',').slice(1).join(',').trim();
            else if (line.startsWith('Workpack,')) testInfo.workpack = line.split(',')[1]?.trim() || '';
            else if (line.startsWith('Start Date,')) testInfo.startDate = line.split(',')[1]?.trim() || '';
            else if (line.startsWith('End Date,'))   testInfo.endDate   = line.split(',')[1]?.trim() || '';
            else if (line.toLowerCase().startsWith('section,')) {
                dataStart = i + 1;
                break;
            }
        }

        if (!testInfo.name) testInfo.name = 'Imported Test';

        const items = [];
        if (dataStart > 0) {
            for (let i = dataStart; i < lines.length; i++) {
                const cols = this._splitCSVLine(lines[i]);
                if (cols.length < 3 || !cols[0]?.trim()) continue;
                items.push({
                    section:     cols[0]?.trim() || '',
                    itemNo:      cols[1]?.trim() || '',
                    description: cols[2]?.trim() || '',
                    partNo:      cols[3]?.trim() || '',
                    qty:         cols[4]?.trim() || '',
                    testQty:     cols[5]?.trim() || '',
                    workpack:    cols[6]?.trim() || '',
                    stakeholder: cols[7]?.trim() || ''
                });
            }
        }

        return { mode: 'test', testInfo, items };
    },

    /* ── Preview ───────────────────────────────────────── */

    _showPreview(result, fileName) {
        const preview = document.getElementById('activityImportPreview');
        if (!preview) return;

        const colorMap = {
            'FAT':'#00d4ff','FIT':'#8b5cf6','EFAT':'#10b981',
            'SIT':'#f59e0b','M-SIT':'#ef4444','SRT':'#ec4899'
        };

        let html = `<p style="color:#aab;font-size:11px;margin-bottom:10px">
            📄 <strong>${fileName}</strong></p>`;

        if (result.mode === 'columns') {
            html += `<p style="color:#aab;font-size:11px;margin-bottom:8px">${result.activities.length} activity column(s) will be added.</p>`;
            html += `<table><thead><tr><th>Name</th><th>Type</th><th>Location</th><th>Start</th><th>End</th></tr></thead><tbody>`;
            result.activities.forEach(a => {
                const c = colorMap[a.type] || '#888';
                html += `<tr><td>${a.name}</td><td><span style="color:${c};font-weight:600">${a.type}</span></td>
                    <td>${a.location||'-'}</td><td>${a.startDate||'-'}</td><td>${a.endDate||'-'}</td></tr>`;
            });
            html += '</tbody></table>';
        } else {
            // Mode: single test with items
            const c = colorMap[result.testInfo.type] || '#888';
            html += `<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;border-left:3px solid ${c}">
                <strong style="color:${c}">${result.testInfo.name}</strong> (${result.testInfo.type})
                ${result.testInfo.location ? ' — ' + result.testInfo.location : ''}
            </div>`;
            html += `<p style="color:#aab;font-size:11px;margin-bottom:6px">${result.items.length} item(s) to match against existing rows:</p>`;

            // Match preview
            const matches = this._findMatches(result.items);
            let matchCount = 0, noMatchCount = 0;
            html += `<table><thead><tr><th>Item #</th><th>Part No.</th><th>Description</th><th>Test QTY</th><th>Match</th></tr></thead><tbody>`;
            result.items.forEach((item, i) => {
                const m = matches[i];
                const matched = m.length > 0;
                if (matched) matchCount++; else noMatchCount++;
                const status = matched
                    ? `<span style="color:#10b981">✓ Found (${m.length})</span>`
                    : `<span style="color:#f59e0b">+ New row</span>`;
                html += `<tr style="${matched ? '' : 'opacity:0.7'}">
                    <td>${item.itemNo||'-'}</td><td>${item.partNo||'-'}</td>
                    <td>${item.description||'-'}</td>
                    <td style="color:#00d4ff;font-weight:600">${item.testQty||'-'}</td>
                    <td>${status}</td></tr>`;
            });
            html += '</tbody></table>';
            html += `<p style="color:#778;font-size:11px;margin-top:8px">
                <span style="color:#10b981">${matchCount}</span> matched · 
                <span style="color:#f59e0b">${noMatchCount}</span> unmatched (will be added to first section)
            </p>`;
        }

        preview.innerHTML = html;
        const confirmBtn = document.getElementById('activityImportConfirm');
        if (confirmBtn) confirmBtn.disabled = false;
    },

    /* ── Matching engine ───────────────────────────────── */

    /**
     * Find matching existing rows for each imported item.
     * Matches by: exact partNo, or exact itemNo, or fuzzy description.
     * Returns array of arrays: matches[i] = [{ sectionId, rowIndex }, …]
     */
    _findMatches(items) {
        return items.map(item => {
            const results = [];
            const iPart = (item.partNo || '').trim().toLowerCase();
            const iItem = (item.itemNo || '').trim().toLowerCase();
            const iDesc = (item.description || '').trim().toLowerCase();

            DataModel.sections.forEach(section => {
                section.rows.forEach((row, rowIdx) => {
                    const rPart = (row.partNo || '').trim().toLowerCase();
                    const rItem = (row.itemNo || '').trim().toLowerCase();
                    const rDesc = (row.description || '').trim().toLowerCase();

                    // Match priority: partNo > itemNo > description substring
                    if (iPart && rPart && iPart === rPart) {
                        results.push({ sectionId: section.id, rowIndex: rowIdx, via: 'partNo' });
                    } else if (iItem && rItem && iItem === rItem) {
                        results.push({ sectionId: section.id, rowIndex: rowIdx, via: 'itemNo' });
                    } else if (iDesc && rDesc && iDesc.length > 3 && rDesc.length > 3 &&
                               (rDesc.includes(iDesc) || iDesc.includes(rDesc))) {
                        results.push({ sectionId: section.id, rowIndex: rowIdx, via: 'description' });
                    }
                });
            });
            return results;
        });
    },

    /* ── Confirm ───────────────────────────────────────── */

    confirm() {
        if (!this._pending) return;

        if (this._pending.mode === 'columns') {
            // Mode A: add activity columns
            this._pending.activities.forEach(a => {
                DataModel.testColumns.push({
                    id: DataModel.nextTestId++,
                    uid: a.uid || DataModel.generateUid(),
                    name: a.name, type: a.type, location: a.location,
                    workpack: a.workpack || '',
                    startDate: a.startDate, endDate: a.endDate
                });
            });
        } else {
            // Mode B: add test column + map quantities to rows
            const info = this._pending.testInfo;
            const newId = DataModel.nextTestId++;
            DataModel.testColumns.push({
                id: newId,
                uid: info.uid || DataModel.generateUid(),
                name: info.name, type: info.type, location: info.location,
                workpack: info.workpack || '',
                startDate: info.startDate, endDate: info.endDate
            });

            // Match and assign quantities
            const matches = this._findMatches(this._pending.items);
            const unmatchedItems = [];

            this._pending.items.forEach((item, i) => {
                const qty = item.testQty || '';
                if (!qty) return;

                if (matches[i].length > 0) {
                    // Assign qty to first match
                    const m = matches[i][0];
                    const section = DataModel.getSection(m.sectionId);
                    if (section && section.rows[m.rowIndex]) {
                        section.rows[m.rowIndex].testQty[newId] = qty;
                    }
                } else {
                    unmatchedItems.push(item);
                }
            });

            // Add unmatched items as new rows in first section
            if (unmatchedItems.length > 0 && DataModel.sections.length > 0) {
                const firstSection = DataModel.sections[0];
                unmatchedItems.forEach(item => {
                    const newRow = {
                        itemNo: item.itemNo || '',
                        description: item.description || '',
                        partNo: item.partNo || '',
                        qty: item.qty || '',
                        workpack: item.workpack || '',
                        stakeholder: item.stakeholder || '',
                        testQty: {}
                    };
                    newRow.testQty[newId] = item.testQty || '';
                    firstSection.rows.push(newRow);
                });
            }
        }

        this._pending = null;
        ModalManager.close('activityImportModal');
        Renderer.render();
        if (typeof App !== 'undefined') App.persistMatrix();
        console.log('[ActivityImport] Import confirmed.');
    },

    /* ── Helpers ────────────────────────────────────────── */

    _normalise(raw) {
        if (!raw || (!raw.name && !raw.Name)) return null;
        return {
            uid:       raw.uid || raw.UID || '',
            name:      raw.name || raw.Name || '',
            type:      this._validType(raw.type || raw.Type),
            location:  raw.location || raw.Location || '',
            workpack:  raw.workpack || raw.Workpack || '',
            startDate: raw.startDate || raw.start_date || raw['Start Date'] || '',
            endDate:   raw.endDate || raw.end_date || raw['End Date'] || ''
        };
    },

    _validType(t) {
        const upper = (t || 'FAT').toUpperCase();
        return DataModel.testTypes.includes(upper) ? upper : 'FAT';
    },

    _splitCSVLine(line) {
        const result = [];
        let current = '', inQuotes = false;
        for (let i = 0; i < (line || '').length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
                else if (ch === '"') inQuotes = false;
                else current += ch;
            } else {
                if (ch === '"') inQuotes = true;
                else if (ch === ',') { result.push(current); current = ''; }
                else current += ch;
            }
        }
        result.push(current);
        return result;
    },

    _findCol(headers, candidates) {
        for (const c of candidates) {
            const idx = headers.indexOf(c);
            if (idx !== -1) return idx;
        }
        return -1;
    }
};
