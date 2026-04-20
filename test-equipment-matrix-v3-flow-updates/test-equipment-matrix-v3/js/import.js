/**
 * IMPORT.JS - Project Import Functionality
 * Handles importing full project data from JSON or CSV files
 * via the header "Import" button.
 *
 * Mirrors the export format produced by ExportManager so that
 * every attribute round-trips correctly:
 *
 *  JSON:  docNo, projectName, testColumns, sections,
 *         flowEdges, flowPositions, activityDescriptions,
 *         timelineMilestones
 *
 *  CSV:   Document No. / Project Name / Export Date
 *         Data table (Section -> Stakeholder + test qty columns)
 *         --- Activity Summary ---
 *         --- Node Relations ---
 *         --- Activity Descriptions ---
 *         --- Timeline Milestones ---
 */

const ImportManager = {
    /**
     * Open project import modal
     */
    openProjectModal() {
        ModalManager.open('projectImportModal');
    },

    /**
     * Handle project file input
     */
    handleProjectFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = '';
        this.processProjectFile(file);
    },

    /**
     * Process project file — auto-detect JSON or CSV
     */
    processProjectFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();

        reader.onload = (e) => {
            const text = e.target.result;

            try {
                let success = false;

                if (ext === 'json') {
                    success = this._importJSON(text);
                } else if (ext === 'csv') {
                    success = this._importCSV(text);
                } else {
                    alert('Unsupported format. Use .json or .csv');
                    return;
                }

                if (success) {
                    Renderer.render();
                    if (typeof App !== 'undefined') App.persistMatrix();
                    ModalManager.close('projectImportModal');
                    alert('Project imported successfully!');
                } else {
                    alert('Could not parse project data from file.');
                }
            } catch (err) {
                console.error('[Import] Error:', err);
                alert('Error importing project: ' + err.message);
            }
        };

        reader.onerror = () => alert('Error reading file.');
        reader.readAsText(file);
    },

    /* ══════════════════════════════════════════════════════
       JSON IMPORT
       ══════════════════════════════════════════════════════ */

    /**
     * Import from JSON project file.
     * Handles the exact structure produced by ExportManager._buildMatrixJSON():
     *   { docNo, projectName, testColumns, sections, exportDate,
     *     flowEdges, flowPositions, activityDescriptions,
     *     timelineMilestones, blender_scene }
     */
    _importJSON(text) {
        const data = JSON.parse(text);
        const ok = DataModel.importData(data);
        if (!ok) return false;

        // Restore all flow data if StorageManager is available
        if (typeof StorageManager !== 'undefined') {
            const hasFlow = data.flowEdges || data.flowPositions ||
                            data.activityDescriptions || data.timelineMilestones;
            if (hasFlow) {
                const flowPatch = {};

                // Edges (node relations)
                if (data.flowEdges && Array.isArray(data.flowEdges)) {
                    flowPatch.edges = data.flowEdges;
                    const maxEdgeId = data.flowEdges.reduce((mx, e) => Math.max(mx, e.id || 0), 0);
                    flowPatch.nextEdgeId = maxEdgeId + 1;
                }

                // Node positions (vertical positions per lane)
                if (data.flowPositions && typeof data.flowPositions === 'object') {
                    flowPatch.positions = data.flowPositions;
                }

                // Activity descriptions (overview + scope/notes)
                if (data.activityDescriptions && typeof data.activityDescriptions === 'object') {
                    flowPatch.descriptions = data.activityDescriptions;
                }

                // Timeline milestones
                if (data.timelineMilestones && Array.isArray(data.timelineMilestones)) {
                    flowPatch.milestones = data.timelineMilestones;
                    const maxMsId = data.timelineMilestones.reduce((mx, m) => Math.max(mx, m.id || 0), 0);
                    flowPatch.nextMilestoneId = maxMsId + 1;
                }

                // Inactive nodes (greyed out visual state)
                if (data.inactiveNodes && typeof data.inactiveNodes === 'object') {
                    flowPatch.inactiveNodes = data.inactiveNodes;
                }

                // Flush flow data immediately so it survives the
                // App.persistMatrix() call that follows right after
                StorageManager.saveNow({ flow: flowPatch });
            }

            // Gantt bars + map positions
            const hasGantt = data.ganttBars || data.ganttMapPositions;
            if (hasGantt) {
                const ganttPatch = {};
                if (data.ganttBars && typeof data.ganttBars === 'object') ganttPatch.bars = data.ganttBars;
                if (data.ganttNextBarId) ganttPatch.nextBarId = data.ganttNextBarId;
                if (data.ganttMapPositions && typeof data.ganttMapPositions === 'object') ganttPatch.mapPositions = data.ganttMapPositions;
                StorageManager.saveNow({ gantt: ganttPatch });
            }

            // Custom locations
            if (data.customLocations && typeof data.customLocations === 'object') {
                // Merge into DataModel
                Object.keys(data.customLocations).forEach(function(name) {
                    var loc = data.customLocations[name];
                    var entry = {
                        color: loc.color || '#888',
                        bg: loc.bg || 'rgba(136,136,136,0.08)',
                        border: loc.border || 'rgba(136,136,136,0.25)'
                    };
                    if (loc.lat !== undefined && loc.lng !== undefined) {
                        entry.lat = loc.lat;
                        entry.lng = loc.lng;
                    }
                    // Regenerate bg/border from color if not provided
                    if (!loc.bg && loc.color) {
                        var r = parseInt(loc.color.slice(1,3),16)||0;
                        var g = parseInt(loc.color.slice(3,5),16)||0;
                        var b = parseInt(loc.color.slice(5,7),16)||0;
                        entry.bg = 'rgba('+r+','+g+','+b+',0.08)';
                        entry.border = 'rgba('+r+','+g+','+b+',0.25)';
                    }
                    DataModel.locations[name] = entry;
                });
                StorageManager.saveNow({ prefs: { customLocations: data.customLocations } });
            }

            // Deletion history
            if (data.deletionHistory && typeof data.deletionHistory === 'object') {
                StorageManager.saveNow({ history: data.deletionHistory });
            }
        }

        return true;
    },

    /* ══════════════════════════════════════════════════════
       CSV IMPORT
       ══════════════════════════════════════════════════════ */

    /**
     * Import from CSV project file.
     * Expects the format produced by ExportManager._buildMatrixCSV():
     *
     *   Row 1: Document No., <value>
     *   Row 2: Project Name, <value>
     *   Row 3: Export Date, <value>
     *   Row 4: (blank)
     *   Row 5: Section, Item #, Description, Part No., QTY, Workpack, Stakeholder, Test1 (FAT), ...
     *   Row 6+: data rows
     *   ...
     *   --- Activity Summary ---
     *   UID, Name, Type, Location, Workpack, Start Date, End Date
     *   ...
     *   --- Node Relations ---
     *   From Node ID, From Name, To Node ID, To Name, Label
     *   ...
     *   --- Activity Descriptions ---
     *   Activity ID, Activity Name, Overview, Scope & Notes
     *   ...
     *   --- Timeline Milestones ---
     *   ID, Lane, Position %, Text, Date, Shape, Color
     */
    _importCSV(text) {
        const lines = text.split(/\r?\n/);

        // ── 1. Extract metadata ─────────────────────────────
        let docNo = '';
        let projectName = '';

        if (lines[0]?.startsWith('Document No.')) {
            docNo = this._csvVal(lines[0]);
        }
        if (lines[1]?.startsWith('Project Name')) {
            projectName = this._csvVal(lines[1]);
        }

        // ── 2. Locate section markers ───────────────────────
        const summaryIdx      = lines.findIndex(l => l.includes('--- Activity Summary ---'));
        const relationsIdx    = lines.findIndex(l => l.includes('--- Node Relations ---'));
        const descriptionsIdx = lines.findIndex(l => l.includes('--- Activity Descriptions ---'));
        const milestonesIdx   = lines.findIndex(l => l.includes('--- Timeline Milestones ---'));

        // ── 3. Parse Activity Summary ───────────────────────
        const activities = [];
        if (summaryIdx !== -1) {
            const summaryHeader = (lines[summaryIdx + 1] || '').toLowerCase();
            const isNewFormat = summaryHeader.startsWith('uid,') || summaryHeader.includes('uid');

            const summaryEnd = this._nextSectionEnd(summaryIdx + 2, lines,
                [relationsIdx, descriptionsIdx, milestonesIdx]);

            for (let i = summaryIdx + 2; i < summaryEnd; i++) {
                const cols = this._splitCSV(lines[i]);
                if (cols.length < 2 || !cols[0]?.trim()) continue;
                if (lines[i].startsWith('---')) break;

                if (isNewFormat) {
                    activities.push({
                        uid:       cols[0]?.trim() || '',
                        name:      cols[1]?.trim() || '',
                        type:      (cols[2]?.trim() || 'FAT').toUpperCase(),
                        location:  cols[3]?.trim() || '',
                        workpack:  cols[4]?.trim() || '',
                        startDate: cols[5]?.trim() || '',
                        endDate:   cols[6]?.trim() || ''
                    });
                } else {
                    activities.push({
                        uid:       '',
                        name:      cols[0]?.trim() || '',
                        type:      (cols[1]?.trim() || 'FAT').toUpperCase(),
                        location:  cols[2]?.trim() || '',
                        workpack:  '',
                        startDate: cols[3]?.trim() || '',
                        endDate:   cols[4]?.trim() || ''
                    });
                }
            }
        }

        // ── 4. Parse data header & rows ─────────────────────
        let headerIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().startsWith('section,')) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1 || activities.length === 0) {
            if (activities.length > 0) {
                return this._applyImport(docNo, projectName, activities, [], null, lines);
            }
            throw new Error('Could not find data header row or activity summary in CSV.');
        }

        const headers = this._splitCSV(lines[headerIdx]);
        const fixedCount = 7; // Section, Item#, Desc, PartNo, QTY, Workpack, Stakeholder
        const testColumnNames = headers.slice(fixedCount);

        // Parse data rows — stop at the first section marker or blank gap before summary
        const sectionRows = {};
        const dataEnd = summaryIdx !== -1 ? summaryIdx : lines.length;
        for (let i = headerIdx + 1; i < dataEnd; i++) {
            const cols = this._splitCSV(lines[i]);
            if (cols.length < 3 || !cols[0]?.trim()) continue;
            if (lines[i].startsWith('---')) break;

            const sectionName = cols[0]?.trim();
            if (!sectionRows[sectionName]) sectionRows[sectionName] = [];

            const testQty = {};
            testColumnNames.forEach((_, ti) => {
                const val = cols[fixedCount + ti]?.trim() || '';
                if (val) testQty['_idx_' + ti] = val;
            });

            sectionRows[sectionName].push({
                itemNo:      cols[1]?.trim() || '',
                description: cols[2]?.trim() || '',
                partNo:      cols[3]?.trim() || '',
                qty:         cols[4]?.trim() || '',
                workpack:    cols[5]?.trim() || '',
                stakeholder: cols[6]?.trim() || '',
                testQty
            });
        }

        return this._applyImport(docNo, projectName, activities,
            Object.entries(sectionRows), testColumnNames, lines);
    },

    /* ══════════════════════════════════════════════════════
       APPLY IMPORT — build DataModel + restore flow data
       ══════════════════════════════════════════════════════ */

    /**
     * Apply parsed import data to DataModel and StorageManager.
     * Handles: test columns, sections/rows, node relations,
     * activity descriptions, and timeline milestones.
     */
    _applyImport(docNo, projectName, activities, sectionEntries, testColumnNames, csvLines) {
        // ── Build test columns with new IDs, preserve uid/workpack ──
        let nextId = 1;
        const usedUids = new Set();
        const testColumns = activities.map((a) => {
            const uid = a.uid || 'test-' + String(nextId).padStart(2, '0');
            usedUids.add(uid);
            return {
                id: nextId++,
                uid: uid,
                name: a.name,
                type: DataModel.testTypes.includes(a.type) ? a.type : 'FAT',
                location: a.location,
                workpack: a.workpack || '',
                startDate: a.startDate,
                endDate: a.endDate
            };
        });

        // ── Build sections ──────────────────────────────────
        let sections;
        if (sectionEntries && sectionEntries.length > 0) {
            sections = sectionEntries.map(([name, rows], si) => ({
                id: name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'section_' + si,
                name,
                collapsed: false,
                rows: rows.map(r => {
                    const tq = {};
                    Object.entries(r.testQty).forEach(([key, val]) => {
                        const idx = parseInt(key.replace('_idx_', ''));
                        if (!isNaN(idx) && testColumns[idx]) {
                            tq[testColumns[idx].id] = val;
                        }
                    });
                    return {
                        itemNo: r.itemNo,
                        description: r.description,
                        partNo: r.partNo,
                        qty: r.qty,
                        workpack: r.workpack,
                        stakeholder: r.stakeholder,
                        testQty: tq
                    };
                })
            }));
        } else {
            sections = [
                { id: 'main', name: 'Main Equipment', collapsed: false, rows: [{ itemNo:'',description:'',partNo:'',qty:'',workpack:'',stakeholder:'',testQty:{} }] },
                { id: 'tooling', name: 'Tooling Items', collapsed: false, rows: [{ itemNo:'',description:'',partNo:'',qty:'',workpack:'',stakeholder:'',testQty:{} }] },
                { id: 'auxiliary', name: 'Auxiliary', collapsed: false, rows: [{ itemNo:'',description:'',partNo:'',qty:'',workpack:'',stakeholder:'',testQty:{} }] }
            ];
        }

        // ── Apply to DataModel ──────────────────────────────
        DataModel.setDocNo(docNo);
        DataModel.setProjectName(projectName);
        DataModel.testColumns = testColumns;
        DataModel.sections = sections;
        DataModel.nextTestId = nextId;

        // ── Restore flow data from CSV sections ─────────────
        if (csvLines && typeof StorageManager !== 'undefined') {
            const flowPatch = {};

            // Name->newId lookup for matching old references to new IDs
            const nameToId = {};
            testColumns.forEach(t => { nameToId[t.name.toLowerCase()] = t.id; });

            // UID->newId lookup for activity descriptions
            const uidToId = {};
            testColumns.forEach(t => { uidToId[t.uid] = t.id; });

            // ── Node Relations ───────────────────────────────
            const relIdx = csvLines.findIndex(l => l.includes('--- Node Relations ---'));
            if (relIdx !== -1) {
                const edges = [];
                const relEnd = this._nextSectionEnd(relIdx + 2, csvLines,
                    [csvLines.findIndex(l => l.includes('--- Activity Descriptions ---')),
                     csvLines.findIndex(l => l.includes('--- Timeline Milestones ---')),
                     csvLines.findIndex(l => l.includes('--- Flow Positions ---')),
                     csvLines.findIndex(l => l.includes('--- Inactive Nodes ---')),
                     csvLines.findIndex(l => l.includes('--- Gantt Bars ---')),
                     csvLines.findIndex(l => l.includes('--- Gantt Map Positions ---')),
                     csvLines.findIndex(l => l.includes('--- Custom Locations ---'))]);

                // Detect format: new has "From UID" header, old has "From Node ID"
                const relHeader = (csvLines[relIdx + 1] || '').toLowerCase();
                const hasUid = relHeader.includes('from uid');

                for (let i = relIdx + 2; i < relEnd; i++) {
                    const cols = this._splitCSV(csvLines[i]);
                    if (cols.length < 4 || !cols[0]?.trim()) continue;
                    if (csvLines[i].startsWith('---')) break;

                    var fromId, toId, label;

                    if (hasUid) {
                        // New format: From UID, From Name, From Node ID, To UID, To Name, To Node ID, Label
                        var fromUid  = (cols[0] || '').trim();
                        var fromName = (cols[1] || '').trim().toLowerCase();
                        var toUid    = (cols[3] || '').trim();
                        var toName   = (cols[4] || '').trim().toLowerCase();
                        label        = (cols[6] || '').trim();

                        // Resolve: UID first, then name, then raw numeric ID
                        fromId = uidToId[fromUid] || nameToId[fromName] || parseInt(cols[2]);
                        toId   = uidToId[toUid]   || nameToId[toName]   || parseInt(cols[5]);
                    } else {
                        // Old format: From Node ID, From Name, To Node ID, To Name, Label
                        var fromName = (cols[1] || '').trim().toLowerCase();
                        var toName   = (cols[3] || '').trim().toLowerCase();
                        label        = (cols[4] || '').trim();

                        fromId = nameToId[fromName] || parseInt(cols[0]);
                        toId   = nameToId[toName]   || parseInt(cols[2]);
                    }

                    if (!fromId || !toId || isNaN(fromId) || isNaN(toId)) continue;
                    // Skip if either node doesn't exist in the imported test columns
                    if (!testColumns.find(t => t.id === fromId)) continue;
                    if (!testColumns.find(t => t.id === toId)) continue;

                    edges.push({
                        id: edges.length + 1,
                        fromNodeId: fromId,
                        toNodeId:   toId,
                        label:      label
                    });
                }
                if (edges.length > 0) {
                    flowPatch.edges = edges;
                    flowPatch.nextEdgeId = edges.length + 1;
                }
            }

            // ── Activity Descriptions ────────────────────────
            const descIdx = csvLines.findIndex(l => l.includes('--- Activity Descriptions ---'));
            if (descIdx !== -1) {
                const descriptions = {};
                const descEnd = this._nextSectionEnd(descIdx + 2, csvLines,
                    [csvLines.findIndex(l => l.includes('--- Timeline Milestones ---')),
                     csvLines.findIndex(l => l.includes('--- Flow Positions ---')),
                     csvLines.findIndex(l => l.includes('--- Inactive Nodes ---')),
                     csvLines.findIndex(l => l.includes('--- Gantt Bars ---')),
                     csvLines.findIndex(l => l.includes('--- Gantt Map Positions ---')),
                     csvLines.findIndex(l => l.includes('--- Custom Locations ---'))]);

                for (let i = descIdx + 2; i < descEnd; i++) {
                    const cols = this._splitCSV(csvLines[i]);
                    if (cols.length < 3 || !cols[0]?.trim()) continue;
                    if (csvLines[i].startsWith('---')) break;

                    // cols: Activity ID, Activity Name, Overview, Scope & Notes
                    const activityIdRaw = cols[0].trim();
                    const activityName  = (cols[1] || '').trim().toLowerCase();
                    const overview      = (cols[2] || '').trim();
                    const bullets       = (cols[3] || '').trim();

                    // Resolve the new ID: try name match, then UID match, then raw ID
                    let newId = nameToId[activityName];
                    if (!newId) {
                        newId = uidToId[activityIdRaw];
                    }
                    if (!newId) {
                        const parsed = parseInt(activityIdRaw);
                        if (!isNaN(parsed) && testColumns.find(t => t.id === parsed)) {
                            newId = parsed;
                        }
                    }

                    if (newId && (overview || bullets)) {
                        descriptions[newId] = {
                            overview: overview,
                            bullets: bullets
                        };
                    }
                }

                if (Object.keys(descriptions).length > 0) {
                    flowPatch.descriptions = descriptions;
                }
            }

            // ── Timeline Milestones ──────────────────────────
            const msIdx = csvLines.findIndex(l => l.includes('--- Timeline Milestones ---'));
            if (msIdx !== -1) {
                const milestones = [];
                // Detect header format: new has WP column (9 cols), old has 7 cols
                const headerLine = (csvLines[msIdx + 1] || '').toLowerCase();
                const hasWpCol = headerLine.includes(',wp,');

                for (let i = msIdx + 2; i < csvLines.length; i++) {
                    const cols = this._splitCSV(csvLines[i]);
                    if (cols.length < 3 || !cols[0]?.trim()) continue;
                    if (csvLines[i].startsWith('---')) break;

                    var milestone;
                    if (hasWpCol) {
                        // New format: ID, Lane, WP, Position %, Text, Date, Shape, Color, Size
                        const id       = parseInt(cols[0]?.trim());
                        const laneType = (cols[1] || '').trim();
                        const wpRow    = (cols[2] || '').trim();
                        const x        = parseFloat(cols[3]?.trim());
                        const text     = (cols[4] || '').trim();
                        const date     = (cols[5] || '').trim();
                        const shape    = (cols[6] || '').trim() || 'circle';
                        const color    = (cols[7] || '').trim();
                        const size     = (cols[8] || '').trim() || 'medium';

                        if (!isNaN(id) && !isNaN(x)) {
                            milestone = { id: id, laneType: laneType || 'FAT', wpRow: wpRow || 'WP03', x: x, text: text, shape: shape, size: size };
                            if (date) milestone.date = date;
                            if (color) milestone.color = color;
                            milestones.push(milestone);
                        }
                    } else {
                        // Old format: ID, Lane, Position %, Text, Date, Shape, Color
                        const id       = parseInt(cols[0]?.trim());
                        const laneType = (cols[1] || '').trim();
                        const x        = parseFloat(cols[2]?.trim());
                        const text     = (cols[3] || '').trim();
                        const date     = (cols[4] || '').trim();
                        const shape    = (cols[5] || '').trim() || 'circle';
                        const color    = (cols[6] || '').trim();

                        if (!isNaN(id) && laneType && !isNaN(x)) {
                            milestone = { id: id, laneType: laneType, wpRow: 'WP03', x: x, text: text, shape: shape };
                            if (date) milestone.date = date;
                            if (color) milestone.color = color;
                            milestones.push(milestone);
                        }
                    }
                }

                if (milestones.length > 0) {
                    flowPatch.milestones = milestones;
                    var maxMsId = milestones.reduce(function(mx, m) { return Math.max(mx, m.id || 0); }, 0);
                    flowPatch.nextMilestoneId = maxMsId + 1;
                }
            }

            // ── Save all flow data at once (immediate flush) ──

            // Flow positions
            const posIdx = csvLines.findIndex(l => l.includes('--- Flow Positions ---'));
            if (posIdx !== -1) {
                var positions = {};
                for (let i = posIdx + 2; i < csvLines.length; i++) {
                    const cols = this._splitCSV(csvLines[i]);
                    if (cols.length < 2 || !cols[0]?.trim()) continue;
                    if (csvLines[i].startsWith('---')) break;
                    var nid = cols[0].trim();
                    var yPos = parseFloat(cols[1]);
                    if (nid && !isNaN(yPos)) positions[nid] = yPos;
                }
                if (Object.keys(positions).length > 0) flowPatch.positions = positions;
            }

            // Inactive nodes
            const inactIdx = csvLines.findIndex(l => l.includes('--- Inactive Nodes ---'));
            if (inactIdx !== -1) {
                var inactiveNodes = {};
                for (let i = inactIdx + 2; i < csvLines.length; i++) {
                    const cols = this._splitCSV(csvLines[i]);
                    if (!cols[0]?.trim()) continue;
                    if (csvLines[i].startsWith('---')) break;
                    inactiveNodes[cols[0].trim()] = true;
                }
                if (Object.keys(inactiveNodes).length > 0) flowPatch.inactiveNodes = inactiveNodes;
            }

            if (Object.keys(flowPatch).length > 0) {
                StorageManager.saveNow({ flow: flowPatch });
            }

            // ── Gantt bars ──
            const ganttIdx = csvLines.findIndex(l => l.includes('--- Gantt Bars ---'));
            if (ganttIdx !== -1) {
                var bars = {}, nextBarId = 1;
                for (let i = ganttIdx + 2; i < csvLines.length; i++) {
                    const cols = this._splitCSV(csvLines[i]);
                    if (cols.length < 5 || !cols[0]?.trim()) continue;
                    if (csvLines[i].startsWith('---')) break;
                    var rowKey = cols[0].trim();
                    var bar = {
                        id: parseInt(cols[1]) || nextBarId,
                        location: (cols[2] || '').trim(),
                        startDate: (cols[3] || '').trim(),
                        endDate: (cols[4] || '').trim(),
                        type: (cols[5] || 'location').trim(),
                        label: (cols[6] || '').trim()
                    };
                    if (cols[7] && cols[7].trim()) bar.fromLocation = cols[7].trim();
                    if (cols[8] && cols[8].trim()) bar.testId = parseInt(cols[8]);
                    if (bar.id >= nextBarId) nextBarId = bar.id + 1;
                    if (!bars[rowKey]) bars[rowKey] = [];
                    bars[rowKey].push(bar);
                }
                if (Object.keys(bars).length > 0) {
                    StorageManager.saveNow({ gantt: { bars: bars, nextBarId: nextBarId } });
                }
            }

            // ── Gantt map positions ──
            const gmpIdx = csvLines.findIndex(l => l.includes('--- Gantt Map Positions ---'));
            if (gmpIdx !== -1) {
                var mapPositions = {};
                for (let i = gmpIdx + 2; i < csvLines.length; i++) {
                    const cols = this._splitCSV(csvLines[i]);
                    if (cols.length < 3 || !cols[0]?.trim()) continue;
                    if (csvLines[i].startsWith('---')) break;
                    mapPositions[cols[0].trim()] = { x: parseFloat(cols[1]) || 0, y: parseFloat(cols[2]) || 0 };
                }
                if (Object.keys(mapPositions).length > 0) {
                    var existingGantt = StorageManager.loadGantt() || {};
                    existingGantt.mapPositions = mapPositions;
                    StorageManager.saveNow({ gantt: existingGantt });
                }
            }

            // ── Custom locations ──
            const locIdx = csvLines.findIndex(l => l.includes('--- Custom Locations ---'));
            if (locIdx !== -1) {
                var customLocs = {};
                for (let i = locIdx + 2; i < csvLines.length; i++) {
                    const cols = this._splitCSV(csvLines[i]);
                    if (cols.length < 2 || !cols[0]?.trim()) continue;
                    if (csvLines[i].startsWith('---')) break;

                    var locName = (cols[0] || '').trim();
                    var locColor = (cols[1] || '').trim() || '#888';
                    var locLat = parseFloat(cols[2]);
                    var locLng = parseFloat(cols[3]);

                    if (locName) {
                        var r = parseInt(locColor.slice(1,3),16)||0;
                        var g = parseInt(locColor.slice(3,5),16)||0;
                        var b = parseInt(locColor.slice(5,7),16)||0;
                        var entry = {
                            color: locColor,
                            bg: 'rgba('+r+','+g+','+b+',0.08)',
                            border: 'rgba('+r+','+g+','+b+',0.25)'
                        };
                        if (!isNaN(locLat) && !isNaN(locLng)) {
                            entry.lat = locLat;
                            entry.lng = locLng;
                        }
                        DataModel.locations[locName] = entry;
                        customLocs[locName] = entry;
                    }
                }
                if (Object.keys(customLocs).length > 0) {
                    StorageManager.saveNow({ prefs: { customLocations: customLocs } });
                }
            }
        }

        return true;
    },

    /* ══════════════════════════════════════════════════════
       CSV HELPERS
       ══════════════════════════════════════════════════════ */

    /**
     * Determine where a CSV section ends.
     * Returns the line index of the next section marker, or end of file.
     */
    _nextSectionEnd(start, lines, otherSections) {
        var candidates = otherSections.filter(function(idx) { return idx > start; });
        if (candidates.length > 0) {
            return Math.min.apply(null, candidates);
        }
        return lines.length;
    },

    /**
     * Extract a value from a "Key,Value" CSV line
     */
    _csvVal(line) {
        var parts = line.split(',');
        return parts.slice(1).join(',').trim().replace(/^"|"$/g, '');
    },

    /**
     * Split a CSV line respecting quoted fields
     */
    _splitCSV(line) {
        var result = [];
        var current = '';
        var inQuotes = false;
        for (var i = 0; i < (line || '').length; i++) {
            var ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
                else if (ch === '"') { inQuotes = false; }
                else { current += ch; }
            } else {
                if (ch === '"') { inQuotes = true; }
                else if (ch === ',') { result.push(current); current = ''; }
                else { current += ch; }
            }
        }
        result.push(current);
        return result;
    }
};
