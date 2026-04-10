/**
 * EXPORT.JS - Export Functionality
 *
 * Uses the File System Access API to write files directly into:
 *   <chosen folder>/Export Test Matrix data/log/
 *
 * The directory handle is persisted in IndexedDB so the user
 * only needs to pick their folder once. On return visits the
 * browser shows a small permission prompt ("Allow?") — no
 * full folder picker.
 *
 * If the browser doesn't support the API, falls back to
 * regular file downloads.
 */

const ExportManager = {

    /** Cached directory handle (session + persisted via IDB) */
    _rootHandle: null,
    _rootName: null,       // display name of the folder
    _idbReady: false,

    /* ══════════════════════════════════════════════════════
       INIT — restore saved handle from IndexedDB
       ══════════════════════════════════════════════════════ */

    async init() {
        if (!this._hasFileSystemAPI()) return;

        try {
            const handle = await this._idbLoad();
            if (handle) {
                this._rootHandle = handle;
                this._rootName = handle.name;
            }
        } catch (err) {
            console.warn('[Export] Could not restore folder handle:', err);
        }
        this._updatePathUI();
    },

    /* ══════════════════════════════════════════════════════
       INDEXEDDB — store/load FileSystemDirectoryHandle
       ══════════════════════════════════════════════════════ */

    _idbOpen() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('tem_export', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('handles');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async _idbSave(handle) {
        const db = await this._idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'exportDir');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async _idbLoad() {
        const db = await this._idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readonly');
            const req = tx.objectStore('handles').get('exportDir');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    async _idbClear() {
        const db = await this._idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').delete('exportDir');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    /* ══════════════════════════════════════════════════════
       PATH CHOOSER UI
       ══════════════════════════════════════════════════════ */

    _updatePathUI() {
        const ids = ['exportPathText', 'testExportPathText'];
        ids.forEach(id => {
            const textEl = document.getElementById(id);
            if (!textEl) return;

            if (!this._hasFileSystemAPI()) {
                textEl.textContent = 'Downloads folder (browser default)';
                textEl.style.color = '#94a3b8';
                return;
            }

            if (this._rootName) {
                textEl.textContent = this._rootName + ' / Export Test Matrix data / log /';
                textEl.style.color = '#10b981';
            } else {
                textEl.textContent = 'Downloads folder (default) — use Browse to change';
                textEl.style.color = '#94a3b8';
            }
        });
    },

    /**
     * User clicks "Browse…" — open folder picker, save handle
     */
    async pickFolder() {
        if (!this._hasFileSystemAPI()) {
            this._toast('File System API not supported in this browser', true);
            return;
        }

        try {
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'downloads'
            });
            this._rootHandle = handle;
            this._rootName = handle.name;
            await this._idbSave(handle);
            this._updatePathUI();
            this._toast('✓ Export folder set: ' + handle.name);
        } catch (err) {
            if (err.name !== 'AbortError') {
                // Catch "system files" errors gracefully
                if (err.message && err.message.includes('block')) {
                    this._toast('That folder is protected — please choose a different folder', true);
                } else {
                    console.error('[Export] Folder pick error:', err);
                    this._toast('Could not select folder: ' + err.message, true);
                }
            }
        }
    },

    /* ══════════════════════════════════════════════════════
       GET LOG FOLDER (with auto-permission request)
       ══════════════════════════════════════════════════════ */

    async _getLogFolder() {
        if (!this._rootHandle) {
            // No saved handle — trigger picker
            await this.pickFolder();
            if (!this._rootHandle) return null;
        }

        try {
            // Re-request permission (browser shows small prompt)
            const perm = await this._rootHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                this._toast('Permission denied — please allow folder access', true);
                return null;
            }

            const exportDir = await this._rootHandle.getDirectoryHandle(
                'Export Test Matrix data', { create: true }
            );
            return await exportDir.getDirectoryHandle('log', { create: true });
        } catch (err) {
            console.error('[Export] Folder access error:', err);
            this._rootHandle = null;
            this._rootName = null;
            await this._idbClear();
            this._updatePathUI();
            this._toast('Folder access blocked — please choose a different folder via Browse', true);
            return null;
        }
    },

    async _writeFile(logDir, filename, content) {
        const fh = await logDir.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(content);
        await w.close();
    },

    /* ══════════════════════════════════════════════════════
       HELPERS
       ══════════════════════════════════════════════════════ */

    _dateStamp() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    },

    _timeStamp() {
        const d = new Date();
        return `${this._dateStamp()}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    },

    _safeName(s) {
        return (s || 'untitled').replace(/[^a-z0-9_\- ]/gi, '').replace(/\s+/g, '_').substring(0, 40);
    },

    _hasFileSystemAPI() {
        return typeof window.showDirectoryPicker === 'function';
    },

    _toastTimer: null,
    _toast(message, isError) {
        let toast = document.getElementById('exportToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'exportToast';
            toast.className = 'export-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = `export-toast ${isError ? 'error' : 'success'} show`;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    },

    /* ══════════════════════════════════════════════════════
       PROJECT EXPORT
       ══════════════════════════════════════════════════════ */

    openProjectExportModal() {
        this._updatePathUI();
        ModalManager.open('projectExportModal');
    },

    async exportProject() {
        const data = DataModel.exportData();
        const stamp = this._timeStamp();
        const projName = this._safeName(data.projectName);

        if (!this._rootHandle || !this._hasFileSystemAPI()) {
            this._download(this._buildMatrixCSV(data), `Matrix_${projName}_${stamp}.csv`, 'text/csv;charset=utf-8;');
            this._download(this._buildMatrixJSON(data), `Matrix_${projName}_${stamp}.json`, 'application/json');
            ModalManager.close('projectExportModal');
            return;
        }

        try {
            const logDir = await this._getLogFolder();
            if (!logDir) return;

            await this._writeFile(logDir, `Matrix_${projName}_${stamp}.csv`, this._buildMatrixCSV(data));
            await this._writeFile(logDir, `Matrix_${projName}_${stamp}.json`, this._buildMatrixJSON(data));

            for (const test of data.testColumns) {
                const rows = SectionManager.getRowsForTest(test.id);
                const name = `${this._safeName(test.uid)}_${test.type}_${stamp}`;
                await this._writeFile(logDir, `${name}.csv`, this._buildTestCSV(test, rows));
            }

            this._toast(`✓ ${2 + data.testColumns.length} files saved to log/`);
            ModalManager.close('projectExportModal');
        } catch (err) {
            console.error('[Export]', err);
            this._toast('Export failed: ' + err.message, true);
        }
    },

    async exportProjectCSV() {
        const data = DataModel.exportData();
        const stamp = this._timeStamp();
        const projName = this._safeName(data.projectName);
        const filename = `Matrix_${projName}_${stamp}.csv`;

        if (!this._rootHandle || !this._hasFileSystemAPI()) {
            this._download(this._buildMatrixCSV(data), filename, 'text/csv;charset=utf-8;');
            ModalManager.close('projectExportModal');
            return;
        }

        try {
            const logDir = await this._getLogFolder();
            if (!logDir) return;
            await this._writeFile(logDir, filename, this._buildMatrixCSV(data));
            this._toast(`✓ ${filename} saved`);
            ModalManager.close('projectExportModal');
        } catch (err) {
            console.error('[Export]', err);
            this._toast('Export failed: ' + err.message, true);
        }
    },

    async exportProjectJSON() {
        const data = DataModel.exportData();
        const stamp = this._timeStamp();
        const projName = this._safeName(data.projectName);
        const filename = `Matrix_${projName}_${stamp}.json`;

        if (!this._rootHandle || !this._hasFileSystemAPI()) {
            this._download(this._buildMatrixJSON(data), filename, 'application/json');
            ModalManager.close('projectExportModal');
            return;
        }

        try {
            const logDir = await this._getLogFolder();
            if (!logDir) return;
            await this._writeFile(logDir, filename, this._buildMatrixJSON(data));
            this._toast(`✓ ${filename} saved`);
            ModalManager.close('projectExportModal');
        } catch (err) {
            console.error('[Export]', err);
            this._toast('Export failed: ' + err.message, true);
        }
    },

    /* ══════════════════════════════════════════════════════
       PER-TEST EXPORT
       ══════════════════════════════════════════════════════ */

    openTestModal(testId) {
        DataModel.currentExportTestId = testId;
        const test = DataModel.getTest(testId);

        document.getElementById('exportInfo').innerHTML = `
            <strong>Test Activity:</strong> ${test.name}<br>
            <strong>UID:</strong> ${test.uid || 'N/A'}<br>
            <strong>Type:</strong> ${test.type}<br>
            <strong>Location:</strong> ${test.location}<br>
            <strong>Workpack:</strong> ${test.workpack || 'N/A'}<br>
            <strong>Period:</strong> ${test.startDate || 'N/A'} to ${test.endDate || 'N/A'}
        `;

        const exportRows = SectionManager.getRowsForTest(testId);
        const duplicates = SectionManager.checkDuplicates(exportRows);

        let html = '';
        if (duplicates.length > 0) {
            html += `<div class="export-info duplicate-warning" style="margin-bottom:15px">
                <strong>⚠️ Potential Duplicates:</strong> ${duplicates.length} item(s)
            </div>`;
        }
        if (exportRows.length === 0) {
            html = '<p style="color:#888;text-align:center;padding:20px">No items assigned to this test activity.</p>';
        } else {
            html += `<table><thead><tr>
                <th>Section</th><th>Item #</th><th>Description</th>
                <th>Part No.</th><th>QTY Ordered</th><th>Test QTY</th>
                <th>Workpack</th><th>Stakeholder</th>
            </tr></thead><tbody>`;
            exportRows.forEach((row, i) => {
                const dup = duplicates.some(d => d.index === i);
                html += `<tr ${dup ? 'style="background:rgba(255,193,7,0.1)"' : ''}>
                    <td>${row.section}</td><td>${row.itemNo||'-'}</td>
                    <td>${row.description||'-'}</td><td>${row.partNo||'-'}</td>
                    <td>${row.qtyOrdered||'-'}</td>
                    <td style="color:#00d4ff;font-weight:600">${row.testQty}</td>
                    <td>${row.workpack||'-'}</td><td>${row.stakeholder||'-'}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            html += `<p style="color:#888;font-size:11px;margin-top:10px">Total items: ${exportRows.length}</p>`;
        }
        document.getElementById('exportPreview').innerHTML = html;
        this._updatePathUI();
        ModalManager.open('exportModal');
    },

    /* ── Per-test export helpers ───────────────────────── */

    async downloadTest() {
        const testId = DataModel.currentExportTestId;
        if (!testId) return;
        const test = DataModel.getTest(testId);
        const rows = SectionManager.getRowsForTest(testId);
        const stamp = this._timeStamp();
        const baseName = `${this._safeName(test.uid)}_${test.type}_${stamp}`;

        if (!this._rootHandle || !this._hasFileSystemAPI()) {
            this._download(this._buildTestCSV(test, rows), `${baseName}.csv`, 'text/csv;charset=utf-8;');
            this._download(this._buildTestJSON(test, rows), `${baseName}.json`, 'application/json');
            ModalManager.close('exportModal');
            DataModel.currentExportTestId = null;
            return;
        }

        try {
            const logDir = await this._getLogFolder();
            if (!logDir) return;
            await this._writeFile(logDir, `${baseName}.csv`, this._buildTestCSV(test, rows));
            await this._writeFile(logDir, `${baseName}.json`, this._buildTestJSON(test, rows));
            this._toast(`✓ ${baseName} saved to log/`);
            ModalManager.close('exportModal');
            DataModel.currentExportTestId = null;
        } catch (err) {
            console.error('[Export]', err);
            this._toast('Export failed: ' + err.message, true);
        }
    },

    async downloadTestCSV() {
        const testId = DataModel.currentExportTestId;
        if (!testId) return;
        const test = DataModel.getTest(testId);
        const rows = SectionManager.getRowsForTest(testId);
        const stamp = this._timeStamp();
        const filename = `${this._safeName(test.uid)}_${test.type}_${stamp}.csv`;

        if (!this._rootHandle || !this._hasFileSystemAPI()) {
            this._download(this._buildTestCSV(test, rows), filename, 'text/csv;charset=utf-8;');
            ModalManager.close('exportModal');
            return;
        }

        try {
            const logDir = await this._getLogFolder();
            if (!logDir) return;
            await this._writeFile(logDir, filename, this._buildTestCSV(test, rows));
            this._toast(`✓ ${filename} saved`);
            ModalManager.close('exportModal');
        } catch (err) {
            console.error('[Export]', err);
            this._toast('Export failed: ' + err.message, true);
        }
    },

    async downloadTestJSON() {
        const testId = DataModel.currentExportTestId;
        if (!testId) return;
        const test = DataModel.getTest(testId);
        const rows = SectionManager.getRowsForTest(testId);
        const stamp = this._timeStamp();
        const filename = `${this._safeName(test.uid)}_${test.type}_${stamp}.json`;

        if (!this._rootHandle || !this._hasFileSystemAPI()) {
            this._download(this._buildTestJSON(test, rows), filename, 'application/json');
            ModalManager.close('exportModal');
            return;
        }

        try {
            const logDir = await this._getLogFolder();
            if (!logDir) return;
            await this._writeFile(logDir, filename, this._buildTestJSON(test, rows));
            this._toast(`✓ ${filename} saved`);
            ModalManager.close('exportModal');
        } catch (err) {
            console.error('[Export]', err);
            this._toast('Export failed: ' + err.message, true);
        }
    },

    /**
     * Quick save a single test activity (disc button on column).
     * Writes to export root, archives old to log/.
     */
    async quickSaveTest(testId) {
        const test = DataModel.getTest(testId);
        if (!test) return;
        const rows = SectionManager.getRowsForTest(testId);
        const uidPrefix = `${this._safeName(test.uid)}_`;
        const readableName = `${this._safeName(test.uid)}_${test.type}_${this._safeName(test.name)}`;

        // Default: regular browser download (goes to Downloads folder)
        if (!this._rootHandle || !this._hasFileSystemAPI()) {
            this._download(this._buildTestJSON(test, rows), `${readableName}.json`, 'application/json');
            this._toast('✓ Saved to Downloads');
            return;
        }

        try {
            const exportDir = await this._getExportDir();
            if (!exportDir) return;
            const logDir = await exportDir.getDirectoryHandle('log', { create: true });
            const stamp = this._timeStamp();

            await this._archiveByUidAndWrite(exportDir, logDir, uidPrefix, '.json', `${readableName}.json`, this._buildTestJSON(test, rows), stamp);
            await this._archiveByUidAndWrite(exportDir, logDir, uidPrefix, '.csv', `${readableName}.csv`, this._buildTestCSV(test, rows), stamp);

            this._toast(`✓ ${test.name} saved (old → log/)`);
        } catch (err) {
            console.error('[QuickSaveTest]', err);
            this._toast('Save failed: ' + err.message, true);
        }
    },

    /* ══════════════════════════════════════════════════════
       QUICK SAVE (disc button) — save to root, archive old to log
       ══════════════════════════════════════════════════════ */

    async quickSave() {
        const data = DataModel.exportData();
        const projName = this._safeName(data.projectName);

        // Default: regular browser download (goes to Downloads folder)
        // Only use File System API if user has explicitly chosen a folder via Browse
        if (!this._rootHandle || !this._hasFileSystemAPI()) {
            this._download(this._buildMatrixJSON(data), `Matrix_${projName}.json`, 'application/json');
            // Push to JSONbin
            if (typeof SyncManager !== 'undefined') {
                StorageManager.saveNow({
                    matrix: {
                        docNo: data.docNo,
                        projectName: data.projectName,
                        testColumns: data.testColumns,
                        sections: data.sections
                    }
                });
                SyncManager.push();
            }
            this._toast('✓ Saved to Downloads + synced');
            return;
        }

        try {
            const exportDir = await this._getExportDir();
            if (!exportDir) return;
            const logDir = await exportDir.getDirectoryHandle('log', { create: true });
            const stamp = this._timeStamp();

            // Archive + write matrix files
            await this._archiveAndWrite(exportDir, logDir, `Matrix_${projName}.json`, this._buildMatrixJSON(data), stamp);
            await this._archiveAndWrite(exportDir, logDir, `Matrix_${projName}.csv`, this._buildMatrixCSV(data), stamp);

            // Archive + write each test file (UID-based matching)
            for (const test of data.testColumns) {
                const rows = SectionManager.getRowsForTest(test.id);
                const uidPrefix = `${this._safeName(test.uid)}_`;
                const readableName = `${this._safeName(test.uid)}_${test.type}_${this._safeName(test.name)}`;
                await this._archiveByUidAndWrite(exportDir, logDir, uidPrefix, '.json', `${readableName}.json`, this._buildTestJSON(test, rows), stamp);
                await this._archiveByUidAndWrite(exportDir, logDir, uidPrefix, '.csv', `${readableName}.csv`, this._buildTestCSV(test, rows), stamp);
            }

            const count = 2 + data.testColumns.length * 2;
            this._toast(`✓ Saved ${count} files (old versions archived to log/)`);

            // Push to JSONbin
            if (typeof SyncManager !== 'undefined') {
                StorageManager.saveNow({
                    matrix: {
                        docNo: data.docNo,
                        projectName: data.projectName,
                        testColumns: data.testColumns,
                        sections: data.sections
                    }
                });
                SyncManager.push();
            }
        } catch (err) {
            console.error('[QuickSave]', err);
            this._toast('Save failed: ' + err.message, true);
        }
    },

    /**
     * Get the "Export Test Matrix data" root folder (not log/).
     * Creates it if needed, requests permission.
     */
    async _getExportDir() {
        if (!this._rootHandle) {
            await this.pickFolder();
            if (!this._rootHandle) return null;
        }
        try {
            const perm = await this._rootHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                this._toast('Permission denied', true);
                return null;
            }
            return await this._rootHandle.getDirectoryHandle('Export Test Matrix data', { create: true });
        } catch (err) {
            // Handle blocked/system folders gracefully
            console.error('[Export] Folder access error:', err);
            this._rootHandle = null;
            this._rootName = null;
            await this._idbClear();
            this._updatePathUI();
            this._toast('Folder access blocked — please choose a different folder via Browse', true);
            return null;
        }
    },

    /**
     * Archive existing file (exact name match) to log/, then write new content.
     * Used for matrix files where the name is stable.
     */
    async _archiveAndWrite(rootDir, logDir, filename, content, stamp) {
        try {
            const existing = await rootDir.getFileHandle(filename, { create: false });
            const file = await existing.getFile();
            const oldContent = await file.text();
            const dot = filename.lastIndexOf('.');
            const archiveName = dot > 0
                ? `${filename.substring(0, dot)}_${stamp}${filename.substring(dot)}`
                : `${filename}_${stamp}`;
            await this._writeFile(logDir, archiveName, oldContent);
            await rootDir.removeEntry(filename);
        } catch (_) { /* no existing file */ }

        await this._writeFile(rootDir, filename, content);
    },

    /**
     * Archive any file in rootDir whose name starts with `uidPrefix` and ends
     * with `ext`, then write a new file with `newFilename`.
     * This lets us find "test-01_FAT_OldName.json" and replace it with
     * "test-01_FAT_NewName.json" — UID is the stable key.
     */
    async _archiveByUidAndWrite(rootDir, logDir, uidPrefix, ext, newFilename, content, stamp) {
        // Scan directory for old files matching this UID + extension
        try {
            for await (const [name, handle] of rootDir) {
                if (handle.kind !== 'file') continue;
                if (!name.startsWith(uidPrefix)) continue;
                if (!name.endsWith(ext)) continue;

                // Archive old file to log with timestamp
                const file = await handle.getFile();
                const oldContent = await file.text();
                const dot = name.lastIndexOf('.');
                const archiveName = dot > 0
                    ? `${name.substring(0, dot)}_${stamp}${name.substring(dot)}`
                    : `${name}_${stamp}`;
                await this._writeFile(logDir, archiveName, oldContent);
                await rootDir.removeEntry(name);
            }
        } catch (_) { /* directory iteration not supported or empty */ }

        // Write new file with human-readable name
        await this._writeFile(rootDir, newFilename, content);
    },

    /* ══════════════════════════════════════════════════════
       BUILDERS
       ══════════════════════════════════════════════════════ */

    /**
     * Generate blender object data for a list of rows.
     * Each item gets a cube at position offset by 2 units along X.
     */
    _blenderObjects(rows) {
        return rows.map((r, i) => ({
            object_name: `${r.itemNo || r.description || 'item_' + i}`.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 40),
            object_type: 'cube',
            position: [i * 2.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0]
        }));
    },

    _buildMatrixCSV(data) {
        let csv = '';
        csv += `Document No.,${this._csvEscape(data.docNo)}\n`;
        csv += `Project Name,${this._csvEscape(data.projectName)}\n`;
        csv += `Export Date,${data.exportDate}\n\n`;

        const fixedH = ['Section','Item #','Description','Part No.','QTY','Workpack','Stakeholder'];
        const testH = data.testColumns.map(t => `${t.name} (${t.type})`);
        csv += fixedH.concat(testH).map(h => this._csvEscape(h)).join(',') + '\n';

        data.sections.forEach(section => {
            section.rows.forEach(row => {
                const fixed = [section.name, row.itemNo, row.description, row.partNo,
                               row.qty, row.workpack, row.stakeholder];
                const tests = data.testColumns.map(t => row.testQty[t.id] || '');
                csv += fixed.concat(tests).map(c => this._csvEscape(c)).join(',') + '\n';
            });
        });

        csv += '\n--- Activity Summary ---\n';
        csv += 'UID,Name,Type,Location,Workpack,Start Date,End Date\n';
        data.testColumns.forEach(t => {
            csv += [t.uid||'', t.name, t.type, t.location, t.workpack||'', t.startDate||'', t.endDate||'']
                .map(c => this._csvEscape(c)).join(',') + '\n';
        });

        const flow = (typeof StorageManager !== 'undefined') ? StorageManager.loadFlow() : null;
        if (flow && flow.edges && flow.edges.length > 0) {
            csv += '\n--- Node Relations ---\n';
            csv += 'From UID,From Name,From Node ID,To UID,To Name,To Node ID,Label\n';
            flow.edges.forEach(edge => {
                const from = data.testColumns.find(t => t.id === edge.fromNodeId);
                const to   = data.testColumns.find(t => t.id === edge.toNodeId);
                csv += [from?.uid || '', from?.name || `Node ${edge.fromNodeId}`, edge.fromNodeId,
                        to?.uid   || '', to?.name   || `Node ${edge.toNodeId}`,   edge.toNodeId,
                        edge.label || ''].map(c => this._csvEscape(c)).join(',') + '\n';
            });
        }

        // Activity descriptions
        if (flow && flow.descriptions) {
            const descEntries = Object.entries(flow.descriptions).filter(([, v]) => v);
            if (descEntries.length > 0) {
                csv += '\n--- Activity Descriptions ---\n';
                csv += 'Activity ID,Activity Name,Overview,Scope & Notes\n';
                descEntries.forEach(([id, desc]) => {
                    const act = data.testColumns.find(t => String(t.id) === String(id));
                    const overview = typeof desc === 'string' ? desc : (desc.overview || '');
                    const bullets  = typeof desc === 'object' ? (desc.bullets || '') : '';
                    csv += [id, act?.name || `Activity ${id}`, overview, bullets]
                        .map(c => this._csvEscape(c)).join(',') + '\n';
                });
            }
        }

        // Timeline milestones
        if (flow && flow.milestones && flow.milestones.length > 0) {
            csv += '\n--- Timeline Milestones ---\n';
            csv += 'ID,Lane,WP,Position %,Text,Date,Shape,Color,Size\n';
            flow.milestones.forEach(m => {
                csv += [m.id, m.laneType || '', m.wpRow || '', m.x, m.text || '', m.date || '', m.shape || 'circle', m.color || '', m.size || 'medium']
                    .map(c => this._csvEscape(c)).join(',') + '\n';
            });
        }

        // Flow node positions
        if (flow && flow.positions) {
            const posEntries = Object.entries(flow.positions);
            if (posEntries.length > 0) {
                csv += '\n--- Flow Positions ---\n';
                csv += 'Node ID,Y Position\n';
                posEntries.forEach(([id, y]) => {
                    csv += id + ',' + y + '\n';
                });
            }
        }

        // Inactive nodes
        if (flow && flow.inactiveNodes) {
            const inactiveIds = Object.keys(flow.inactiveNodes).filter(k => flow.inactiveNodes[k]);
            if (inactiveIds.length > 0) {
                csv += '\n--- Inactive Nodes ---\n';
                csv += 'Node ID\n';
                inactiveIds.forEach(id => { csv += id + '\n'; });
            }
        }

        // Gantt bars
        const gantt = (typeof StorageManager !== 'undefined') ? StorageManager.loadGantt() : null;
        if (gantt && gantt.bars) {
            const barEntries = Object.entries(gantt.bars).filter(([, bars]) => bars && bars.length > 0);
            if (barEntries.length > 0) {
                csv += '\n--- Gantt Bars ---\n';
                csv += 'Row Key,Bar ID,Location,Start Date,End Date,Type,Label,From Location,Test ID\n';
                barEntries.forEach(([rowKey, bars]) => {
                    bars.forEach(bar => {
                        csv += [rowKey, bar.id || '', bar.location || '', bar.startDate || '', bar.endDate || '',
                                bar.type || 'location', bar.label || '', bar.fromLocation || '', bar.testId || '']
                            .map(c => this._csvEscape(c)).join(',') + '\n';
                    });
                });
            }
        }

        // Gantt map positions (SVG node layout)
        if (gantt && gantt.mapPositions) {
            const mpEntries = Object.entries(gantt.mapPositions);
            if (mpEntries.length > 0) {
                csv += '\n--- Gantt Map Positions ---\n';
                csv += 'Location,X,Y\n';
                mpEntries.forEach(([loc, pos]) => {
                    csv += [loc, pos.x || 0, pos.y || 0].map(c => this._csvEscape(c)).join(',') + '\n';
                });
            }
        }

        // Custom locations
        const locNames = Object.keys(DataModel.locations);
        if (locNames.length > 0) {
            csv += '\n--- Custom Locations ---\n';
            csv += 'Name,Color,Latitude,Longitude\n';
            locNames.sort((a, b) => a.localeCompare(b)).forEach(name => {
                const l = DataModel.locations[name];
                csv += [name, l.color || '', (l.lat !== undefined ? l.lat : ''), (l.lng !== undefined ? l.lng : '')]
                    .map(c => this._csvEscape(c)).join(',') + '\n';
            });
        }

        return csv;
    },

    _buildMatrixJSON(data) {
        const out = { ...data };
        const flow = (typeof StorageManager !== 'undefined') ? StorageManager.loadFlow() : null;
        if (flow) {
            out.flowEdges = flow.edges || [];
            out.flowPositions = flow.positions || {};
            out.activityDescriptions = flow.descriptions || {};
            out.timelineMilestones = flow.milestones || [];
            out.inactiveNodes = flow.inactiveNodes || {};
        }

        // Gantt data
        const gantt = (typeof StorageManager !== 'undefined') ? StorageManager.loadGantt() : null;
        if (gantt) {
            out.ganttBars = gantt.bars || {};
            out.ganttNextBarId = gantt.nextBarId || 1;
            out.ganttMapPositions = gantt.mapPositions || {};
        }

        // Custom locations (name, color, lat/lng)
        const prefs = (typeof StorageManager !== 'undefined') ? StorageManager.loadPrefs() : null;
        if (prefs && prefs.customLocations) {
            out.customLocations = prefs.customLocations;
        } else {
            // Export current DataModel.locations as fallback (includes defaults + custom)
            const locs = {};
            Object.keys(DataModel.locations).forEach(name => {
                const l = DataModel.locations[name];
                const e = { color: l.color };
                if (l.lat !== undefined && l.lng !== undefined) { e.lat = l.lat; e.lng = l.lng; }
                locs[name] = e;
            });
            out.customLocations = locs;
        }

        // Blender scene metadata
        out.blender_scene = {
            unit_system: 'METRIC',
            offset_per_item: 2.0,
            template_object: 'cube'
        };

        return JSON.stringify(out, null, 2);
    },

    _buildTestCSV(test, rows) {
        let csv = `Test Activity Export\n`;
        csv += `UID,${test.uid||''}\n`;
        csv += `Test Name,${test.name}\nType,${test.type}\nLocation,${test.location}\n`;
        csv += `Workpack,${test.workpack||''}\n`;
        csv += `Start Date,${test.startDate||'N/A'}\nEnd Date,${test.endDate||'N/A'}\n`;

        // Include description if available
        const flow = (typeof StorageManager !== 'undefined') ? StorageManager.loadFlow() : null;
        const desc = flow?.descriptions?.[test.id];
        if (desc) {
            const overview = typeof desc === 'string' ? desc : (desc.overview || '');
            const bullets  = typeof desc === 'object' ? (desc.bullets || '') : '';
            if (overview) csv += `Overview,${this._csvEscape(overview)}\n`;
            if (bullets) {
                csv += `\nScope & Notes\n`;
                bullets.split('\n').forEach(line => {
                    if (line.trim()) csv += `${this._csvEscape(line)}\n`;
                });
            }
        }

        csv += `\nSection,Item #,Description,Part No.,QTY Ordered,Test QTY,Workpack,Stakeholder,Object Type,Pos X,Pos Y,Pos Z,Rot X,Rot Y,Rot Z\n`;
        rows.forEach((r, i) => {
            csv += [r.section,r.itemNo,r.description,r.partNo,r.qtyOrdered,r.testQty,r.workpack,r.stakeholder,
                    'cube', i*2.0, 0.0, 0.0, 0.0, 0.0, 0.0]
                .map(c => this._csvEscape(c==null?'':c)).join(',') + '\n';
        });
        return csv;
    },

    _buildTestJSON(test, rows) {
        const blenderObjs = this._blenderObjects(rows);
        const items = rows.map((r, i) => ({
            ...r,
            blender: blenderObjs[i]
        }));

        // Include description if available
        const flow = (typeof StorageManager !== 'undefined') ? StorageManager.loadFlow() : null;
        const rawDesc = flow?.descriptions?.[test.id];
        const desc = typeof rawDesc === 'string'
            ? { overview: rawDesc, bullets: '' }
            : (rawDesc || { overview: '', bullets: '' });

        return JSON.stringify({
            testActivity: test,
            description: desc,
            items: items,
            blender_scene: {
                unit_system: 'METRIC',
                offset_per_item: 2.0,
                template_object: 'cube'
            },
            exportDate: new Date().toISOString()
        }, null, 2);
    },

    /* ── Utilities ─────────────────────────────────────── */

    _csvEscape(val) {
        if (val == null) return '';
        const s = String(val);
        return (s.includes(',') || s.includes('"') || s.includes('\n'))
            ? '"' + s.replace(/"/g, '""') + '"' : s;
    },

    _download(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};
