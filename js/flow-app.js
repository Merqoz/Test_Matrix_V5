/**
 * FLOW-APP.JS - Main Flow Application
 * Initializes the activity flow view and orchestrates all modules
 */

const FlowApp = {
    _resetting: false,
    _dataFingerprint: '',

    /**
     * Initialize the flow view — renders exactly ONCE.
     */
    init() {
        console.log('Activity Flow - Initializing...');

        // 1. Storage — migrate legacy, then load
        StorageManager.init();

        // 2. Navigation
        Nav.render('flow');

        // 3. Load & merge data (no write-back, no render)
        this.loadData();

        // 4. Single render pass — lanes, nodes, edges, timeline
        this._renderOnce();

        // 5. Events
        this.setupEvents();

        // 6. Cross-tab sync — re-render ONLY if matrix page changes the data
        StorageManager.onChange(doc => this.onCrossTabChange(doc));

        // 7. Remote sync (JSONbin) — pull on load, no polling
        if (typeof SyncManager !== 'undefined') {
            SyncManager.onRemoteUpdate(doc => this.onCrossTabChange(doc));
            SyncManager.init();
        }

        // 8. Undo/Redo
        if (typeof UndoManager !== 'undefined') UndoManager.init();

        // 9. Load page title
        this.loadPageTitle();

        console.log('Activity Flow - Ready!');
    },

    /**
     * Save the flow page title to localStorage
     */
    savePageTitle(val) {
        try { localStorage.setItem('tem_page_title_flow', val); } catch(e) {}
        document.title = (val || 'Activity Flow') + ' - Test Equipment Matrix';
    },

    /**
     * Load the flow page title from localStorage
     */
    loadPageTitle() {
        try {
            var saved = localStorage.getItem('tem_page_title_flow');
            if (saved !== null) {
                var el = document.getElementById('flowPageTitle');
                if (el) el.value = saved;
                document.title = (saved || 'Activity Flow') + ' - Test Equipment Matrix';
            }
        } catch(e) {}
    },

    /**
     * Load & merge data from unified storage.
     * Matrix owns the canonical activity list; flow owns positions + edges.
     * Does NOT write back or render — just populates FlowData in memory.
     */
    loadData() {
        const m = StorageManager.loadMatrix();
        const f = StorageManager.loadFlow();
        const p = StorageManager.loadPrefs();

        // Load visibility prefs
        if (p && p.hiddenActivities) {
            DataModel.hiddenActivities = p.hiddenActivities;
        }

        // Load custom locations
        if (p && p.customLocations) {
            for (const name in p.customLocations) {
                DataModel.locations[name] = p.customLocations[name];
            }
        }

        // Build positions lookup from flow slice
        const savedPositions = (f && f.positions) ? f.positions : {};
        const savedEdges     = (f && f.edges)     ? f.edges     : [];
        const savedNextEdge  = (f && f.nextEdgeId) ? f.nextEdgeId : 1;

        if (m && m.testColumns && m.testColumns.length > 0) {
            // Keep DataModel in sync so exports can access sub-activities
            DataModel.testColumns = m.testColumns;
            if (m.sections) DataModel.sections = m.sections;

            // Build nodes from matrix testColumns + flow positions
            FlowData.nodes = m.testColumns.map((test, index) => ({
                id: test.id,
                uid: test.uid || '',
                name: test.name,
                type: test.type,
                location: test.location || '',
                workpack: test.workpack || '',
                startDate: test.startDate || '',
                endDate: test.endDate || '',
                y: savedPositions[test.id] !== undefined
                    ? savedPositions[test.id]
                    : 20 + index * 100
            }));

            FlowData.docNo = m.docNo || '';
            FlowData.projectName = m.projectName || '';

            const maxId = Math.max(...FlowData.nodes.map(n => n.id), 0);
            FlowData.nextNodeId = maxId + 1;
        } else {
            // No matrix data — use defaults
            FlowData.nodes = [
                { id: 1, uid: 'test-01', name: 'Test 1', type: 'FAT', location: 'Norway, Egersund', workpack: '', startDate: '', endDate: '', y: 20 }
            ];
            FlowData.nextNodeId = 2;
        }

        // Restore edges, pruning any that reference deleted nodes
        const nodeIds = new Set(FlowData.nodes.map(n => n.id));
        FlowData.edges = savedEdges.filter(e =>
            nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)
        );
        FlowData.nextEdgeId = savedNextEdge;

        // Restore descriptions and milestones
        FlowData.descriptions    = (f && f.descriptions)    ? f.descriptions    : {};
        FlowData.milestones      = (f && f.milestones)      ? f.milestones      : [];
        FlowData.nextMilestoneId = (f && f.nextMilestoneId) ? f.nextMilestoneId : 1;

        // Restore lane visibility — critical for lock/hide persistence
        FlowData.hiddenLanes       = (f && f.hiddenLanes)       ? f.hiddenLanes       : {};
        FlowData.lockedHiddenLanes = (f && f.lockedHiddenLanes) ? f.lockedHiddenLanes : {};
        FlowData.inactiveNodes     = (f && f.inactiveNodes)     ? f.inactiveNodes     : {};
        // Ensure all locked lanes stay hidden
        for (var lk in FlowData.lockedHiddenLanes) {
            if (FlowData.lockedHiddenLanes[lk]) FlowData.hiddenLanes[lk] = true;
        }

        // Update fingerprint (but do NOT write back or render)
        this._dataFingerprint = this._fingerprint();
    },

    /**
     * Build location legend — only shows locations used by current nodes.
     */
    _buildLocationLegend() {
        const legend = document.getElementById('locationLegend');
        if (!legend || typeof DataModel === 'undefined') return;
        legend.innerHTML = '';

        // Collect locations actually in use
        const usedLocations = new Set(
            FlowData.nodes.map(n => n.location).filter(Boolean)
        );

        DataModel.getLocationNames().forEach(name => {
            if (!usedLocations.has(name)) return;
            const loc = DataModel.locations[name];
            const item = document.createElement('span');
            item.className = 'legend-item';
            item.style.setProperty('--loc-color', loc.color);
            item.innerHTML = `<span class="legend-dot"></span>${name}`;
            legend.appendChild(item);
        });
    },

    /**
     * Build a lightweight fingerprint of the current data so we can
     * skip expensive DOM rebuilds when nothing actually changed.
     */
    _fingerprint() {
        const nodes = FlowData.nodes.map(n => `${n.id}:${n.name}:${n.type}:${n.location}:${n.y}`).join('|');
        const edges = FlowData.edges.map(e => `${e.fromNodeId}-${e.toNodeId}:${e.label||''}`).join('|');
        const ms    = FlowData.milestones.map(m => `${m.id}:${m.laneType}:${m.x}:${m.text}:${m.shape}:${m.color}:${m.size}`).join('|');
        return `${nodes}##${edges}##${ms}`;
    },

    /**
     * First render on page load — synchronous, no staggered timeouts.
     * Called exactly once during init().
     */
    _renderOnce() {
        // Resolve any overlapping nodes from stored positions
        if (FlowNodes.resolveCollisions()) FlowData.save();
        FlowLanes.render();
        FlowNodes.render();
        FlowEdges.render();
        if (typeof FlowTimeline !== 'undefined') FlowTimeline.render();
        this._buildLocationLegend();
        this._populateWpFilter();
        this._applyWpFilter();
    },

    /**
     * Full re-render — used after user actions (add activity, clear edges, import).
     * Intentional rebuilds; always executes.
     */
    renderAll() {
        FlowNodes.resolveCollisions();
        FlowLanes.render();
        FlowNodes.render();
        FlowEdges.render();
        if (typeof FlowTimeline !== 'undefined') FlowTimeline.render();
        this._buildLocationLegend();
        this._populateWpFilter();
        this._applyWpFilter();
        this._dataFingerprint = this._fingerprint();
    },

    /**
     * Populate the WP filter bar with chip buttons (like index.html style).
     * Only shows WPs that are actually used by nodes.
     */
    _populateWpFilter() {
        var bar = document.getElementById('flowFilterBar');
        if (!bar) return;

        // Collect used workpacks
        var used = {};
        FlowData.nodes.forEach(function(n) {
            if (n.workpack) used[n.workpack] = true;
        });
        var wps = Object.keys(used).sort();

        if (wps.length === 0) {
            bar.innerHTML = '';
            bar.style.display = 'none';
            return;
        }
        bar.style.display = '';

        // Initialize active set if not existing
        if (!this._activeWpFilters) this._activeWpFilters = {};

        var wpColors = {
            'WP03':'#06b6d4','WP04':'#8b5cf6','WP05':'#10b981',
            'WP06':'#f59e0b','WP07':'#ef4444','WP09':'#ec4899','WP10':'#6366f1','WP11':'#14b8a6'
        };

        var anyActive = false;
        for (var k in this._activeWpFilters) {
            if (this._activeWpFilters[k]) { anyActive = true; break; }
        }

        var html = '<div class="filter-row">' +
            '<div class="filter-label" style="opacity:0.6">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">' +
            '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>' +
            '</svg> WP</div>' +
            '<div class="filter-chips">';

        var self = this;
        // Load locked WP state only once (not on every render)
        if (!this._lockedWpFiltersLoaded) {
            this._lockedWpFiltersLoaded = true;
            this._lockedWpFilters = {};
            try { var prefs = StorageManager.loadPrefs(); if (prefs && prefs.flowLockedWpFilters) { prefs.flowLockedWpFilters.forEach(function(w) { self._lockedWpFilters[w] = true; self._activeWpFilters[w] = true; }); } } catch(e) {}
        }

        wps.forEach(function(wp) {
            var c = wpColors[wp] || '#888';
            var isActive = !!self._activeWpFilters[wp];
            var isLocked = !!self._lockedWpFilters[wp];
            html += '<button class="filter-chip ' + (isActive ? 'active' : '') + '"' +
                ' style="--chip-color: ' + c + '; --chip-bg: ' + c + '18; --chip-border: ' + c + '"' +
                ' onclick="FlowApp.toggleWpFilter(\'' + wp + '\')"' +
                ' oncontextmenu="event.preventDefault();FlowApp._showWpChipCtx(event,\'' + wp + '\')">' +
                '<span class="chip-dot"></span>' + wp + (isLocked ? ' \uD83D\uDD12' : '') + '</button>';
        });

        html += '</div>';

        if (anyActive) {
            html += '<button class="filter-clear" onclick="FlowApp.clearWpFilter()">Clear</button>';
        }

        html += '</div>';
        bar.innerHTML = html;
    },

    /**
     * Toggle a workpack filter chip on/off.
     */
    toggleWpFilter(wp) {
        if (!this._activeWpFilters) this._activeWpFilters = {};
        this._activeWpFilters[wp] = !this._activeWpFilters[wp];
        this._applyWpFilter();
        this._populateWpFilter();
    },

    /**
     * Clear all workpack filters.
     */
    clearWpFilter() {
        // Keep locked WPs active
        this._activeWpFilters = {};
        if (this._lockedWpFilters) {
            for (var k in this._lockedWpFilters) {
                if (this._lockedWpFilters[k]) this._activeWpFilters[k] = true;
            }
        }
        this._applyWpFilter();
        this._populateWpFilter();
    },

    /**
     * Apply the current WP filter — dim non-matching nodes.
     */
    _applyWpFilter() {
        if (!this._activeWpFilters) this._activeWpFilters = {};

        var anyActive = false;
        for (var k in this._activeWpFilters) {
            if (this._activeWpFilters[k]) { anyActive = true; break; }
        }

        FlowData.nodes.forEach(function(node) {
            var el = document.getElementById('node-' + node.id);
            if (!el) return;
            if (!anyActive) {
                el.classList.remove('wp-dimmed', 'wp-highlighted');
            } else if (this._activeWpFilters[node.workpack]) {
                el.classList.remove('wp-dimmed');
                el.classList.add('wp-highlighted');
            } else {
                el.classList.add('wp-dimmed');
                el.classList.remove('wp-highlighted');
            }
        }.bind(this));
    },

    /**
     * Setup global events
     */
    setupEvents() {
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => FlowEdges.render(), 150);
        });

        const wrapper = document.getElementById('flowCanvasWrapper');

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const overlay = document.getElementById('labelModalOverlay');
                if (overlay && overlay.classList.contains('active')) {
                    FlowEdges.saveLabel();
                }
                const aaOverlay = document.getElementById('addActivityOverlay');
                if (aaOverlay && aaOverlay.classList.contains('active')) {
                    this.addActivityFromModal();
                }
            }
            if (e.key === 'Escape') {
                FlowEdges.closeLabelModal();
                if (typeof FlowDetails !== 'undefined') FlowDetails.close();
                if (typeof FlowTimeline !== 'undefined') FlowTimeline.closeModal();
                if (typeof ActivityManager !== 'undefined') ActivityManager.close();
                this.closeAddActivityModal();
                document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('active'));
            }
        });

        if (wrapper) {
            wrapper.addEventListener('scroll', () => {
                document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('active'));
            });

            // Right-click on lane headers and collapsed labels → lock/unlock hide
            wrapper.addEventListener('contextmenu', (e) => {
                const laneHeader = e.target.closest('.lane-header, .lane-collapsed-label, .lane-collapsed, .tl-lane-label');
                if (laneHeader) {
                    // Find the lane type from parent lane div
                    const laneEl = laneHeader.closest('[data-lane]') || laneHeader;
                    const laneType = laneEl.dataset?.lane;
                    if (laneType) {
                        e.preventDefault();
                        e.stopPropagation();
                        this._showLaneCtx(e.clientX, e.clientY, laneType);
                        return;
                    }
                }
            });

            // Right-click on canvas background → add activity menu
            const canvas = document.getElementById('flowCanvas');
            if (canvas) {
                canvas.addEventListener('contextmenu', e => {
                    // Skip if an edge context menu was just shown
                    if (FlowEdges._justShowedMenu) {
                        FlowEdges._justShowedMenu = false;
                        return;
                    }
                    // Skip if clicking on a node, port, or milestone
                    if (e.target.closest('.flow-node') || e.target.closest('.tl-milestone')) return;
                    // Skip if clicking on an edge path (inside SVG)
                    if (e.target.closest('.edge-group')) return;
                    e.preventDefault();
                    // Hide all other context menus
                    document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('active'));
                    // Show canvas menu
                    const cmenu = document.getElementById('canvasContextMenu');
                    if (cmenu) {
                        cmenu.style.left = e.clientX + 'px';
                        cmenu.style.top = e.clientY + 'px';
                        cmenu.classList.add('active');
                    }
                    // Store click position — compute Y relative to the lane
                    const lane = e.target.closest('.lane');
                    this._addNodeLaneType = lane?.dataset?.lane || 'FAT';
                    if (lane) {
                        const laneBody = lane.querySelector('.lane-body');
                        const bodyRect = (laneBody || lane).getBoundingClientRect();
                        this._addNodeY = e.clientY - bodyRect.top + (laneBody?.scrollTop || 0);
                    } else {
                        this._addNodeY = 50;
                    }
                });
            }
        }

        // Close all context menus on any left click
        document.addEventListener('click', () => {
            document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('active'));
        });

        // Flush storage before the tab closes
        window.addEventListener('beforeunload', () => {
            if (this._resetting) return;
            FlowData.save();
            StorageManager.saveNow(undefined);
        });
    },

    /**
     * Cross-tab change handler — another tab (matrix) wrote to storage.
     * Reload nodes from the matrix slice, preserve positions + edges.
     * ONLY re-renders if the data actually changed (fingerprint guard).
     */
    onCrossTabChange(doc) {
        if (!doc || !doc.matrix) return;

        const m = doc.matrix;
        if (!m.testColumns) return;

        // Keep DataModel in sync so exports can access sub-activities
        DataModel.testColumns = m.testColumns;
        if (m.sections) DataModel.sections = m.sections;

        // Build positions lookup from current nodes
        const posMap = {};
        FlowData.nodes.forEach(n => { posMap[n.id] = n.y; });

        FlowData.nodes = m.testColumns.map((test, i) => ({
            id: test.id,
            uid: test.uid || '',
            name: test.name,
            type: test.type,
            location: test.location || '',
            workpack: test.workpack || '',
            startDate: test.startDate || '',
            endDate: test.endDate || '',
            y: posMap[test.id] !== undefined ? posMap[test.id] : 20 + i * 100
        }));

        FlowData.docNo = m.docNo || '';
        FlowData.projectName = m.projectName || '';

        // Also pick up flow slice updates (edges, milestones, descriptions)
        if (doc.flow) {
            const f = doc.flow;
            if (f.edges)           FlowData.edges           = f.edges;
            if (f.nextEdgeId)      FlowData.nextEdgeId      = f.nextEdgeId;
            if (f.descriptions)    FlowData.descriptions    = f.descriptions;
            if (f.milestones)      FlowData.milestones      = f.milestones;
            if (f.nextMilestoneId) FlowData.nextMilestoneId = f.nextMilestoneId;
        }

        // Prune stale edges
        const nodeIds = new Set(FlowData.nodes.map(n => n.id));
        FlowData.edges = FlowData.edges.filter(e =>
            nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)
        );

        const maxId = Math.max(...FlowData.nodes.map(n => n.id), 0);
        FlowData.nextNodeId = maxId + 1;

        // ── Fingerprint guard: skip re-render if nothing changed ──
        const newFp = this._fingerprint();
        if (newFp === this._dataFingerprint) {
            return;   // data identical — no DOM work needed
        }
        this._dataFingerprint = newFp;

        console.log('[Flow] Cross-tab update — re-rendering');
        this.renderAll();
    },

    /**
     * Clear all edges
     */
    clearAllEdges() {
        if (!confirm('Clear all connections? This cannot be undone.')) return;
        FlowData.clearEdges();
        FlowEdges.render();
    },

    /**
     * Reset everything to blank template.
     */
    resetToTemplate() {
        if (!confirm(
            'Reset to blank template?\n\n' +
            'This will erase ALL data in both the Matrix and the Activity Flow, ' +
            'including all test columns, equipment rows, and connections.\n\n' +
            'This cannot be undone.'
        )) return;

        this._resetting = true;
        StorageManager.resetToTemplate();
        window.location.reload();
    },

    /**
     * Open the Add Activity modal
     */
    openAddActivityModal() {
        // Close canvas context menu
        const cmenu = document.getElementById('canvasContextMenu');
        if (cmenu) cmenu.classList.remove('active');

        // Populate dropdowns from DataModel
        const locSelect = document.getElementById('aaLocation');
        if (locSelect) {
            locSelect.innerHTML = DataModel.getLocationNames()
                .map(l => `<option value="${l}">${l}</option>`).join('');
        }

        const typeSelect = document.getElementById('aaType');
        if (typeSelect) {
            const laneType = this._addNodeLaneType || 'FAT';
            typeSelect.innerHTML = DataModel.testTypes
                .map(t => `<option value="${t}" ${t === laneType ? 'selected' : ''}>${t}</option>`).join('');
        }

        const wpSelect = document.getElementById('aaWorkpack');
        if (wpSelect) {
            wpSelect.innerHTML = '<option value="">—</option>' +
                DataModel.workpacks.map(w => `<option value="${w}">${w}</option>`).join('');
        }

        // Clear inputs
        document.getElementById('aaName').value = '';

        document.getElementById('addActivityOverlay')?.classList.add('active');
        setTimeout(() => document.getElementById('aaName')?.focus(), 100);
    },

    closeAddActivityModal() {
        document.getElementById('addActivityOverlay')?.classList.remove('active');
    },

    /**
     * Create activity from modal — adds to both matrix and flow.
     * Mirrors the "+" button behaviour in index.html (TestManager.add)
     * so the new column appears in the matrix on next load or cross-tab sync.
     */
    addActivityFromModal() {
        const name     = (document.getElementById('aaName')?.value || '').trim();
        const location = document.getElementById('aaLocation')?.value || '';
        const type     = document.getElementById('aaType')?.value || 'FAT';
        const workpack = document.getElementById('aaWorkpack')?.value || '';

        if (!name) {
            document.getElementById('aaName')?.focus();
            return;
        }

        // Read the full current matrix from storage (source of truth)
        const m = StorageManager.loadMatrix() || {};
        const testColumns = m.testColumns || [];
        const sections    = m.sections    || [];
        const docNo       = m.docNo       || '';
        const projectName = m.projectName || '';

        const maxId = testColumns.length > 0
            ? Math.max(...testColumns.map(t => t.id), 0) : 0;
        let nextTestId = maxId + 1;

        const id  = nextTestId++;
        const uid = DataModel.generateUid();
        const newTest = {
            id, uid, name, type, location, workpack,
            startDate: '', endDate: ''
        };
        testColumns.push(newTest);

        // Persist the FULL matrix (testColumns + sections + metadata)
        // so cross-tab sync and next page-load see everything intact
        StorageManager.saveNow({
            matrix: { docNo, projectName, testColumns, sections }
        });

        // Update DataModel in memory (for dropdown generation etc.)
        DataModel.testColumns = testColumns;
        DataModel.sections    = sections;
        DataModel.nextTestId  = nextTestId;

        // Add as flow node
        const yPos = this._addNodeY || (20 + FlowData.nodes.length * 100);
        FlowData.nodes.push({
            id, uid, name, type, location, workpack,
            startDate: '', endDate: '',
            y: yPos
        });
        FlowData.nextNodeId = Math.max(FlowData.nextNodeId, id + 1);
        FlowData.save();

        this.closeAddActivityModal();
        this.renderAll();
    },

    /**
     * Export flow data as JSON
     */
    exportFlow() {
        const data = FlowData.exportData();
        data.edges = FlowData.edges;

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-flow-${data.projectName || 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Import flow data from JSON file
     */
    importFlow() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (FlowData.importData(data)) {
                        this.renderAll();
                    } else {
                        alert('Invalid flow data file.');
                    }
                } catch (err) {
                    alert('Error reading file: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    // ═════ LIGHT MODE TOGGLE ══════════════════════════════

    toggleLightMode() {
        if (typeof Nav !== 'undefined') Nav.toggleTheme();
    },

    // ═════ WP CHIP LOCK ═════════════════════════════════

    _showWpChipCtx(event, wp) {
        var menu = document.getElementById('canvasContextMenu');
        if (!menu) return;
        if (!this._lockedWpFilters) this._lockedWpFilters = {};
        var isLocked = !!this._lockedWpFilters[wp];
        var self = this;

        menu.innerHTML = '<div style="padding:6px 14px;font-size:10px;color:#5c6370;text-transform:uppercase;letter-spacing:1px;">' + wp + '</div>' +
            (!isLocked
                ? '<div class="context-menu-item" data-action="lock-wp">\uD83D\uDD12 Lock Filter (keep on refresh)</div>'
                : '<div class="context-menu-item" data-action="unlock-wp">\uD83D\uDD13 Unlock Filter</div>');

        menu.style.left = event.clientX + 'px';
        menu.style.top = event.clientY + 'px';
        menu.classList.add('active');

        setTimeout(function() {
            menu.querySelectorAll('.context-menu-item').forEach(function(el) {
                el.onclick = function(ev) {
                    ev.stopPropagation();
                    if (el.dataset.action === 'lock-wp') {
                        self._lockedWpFilters[wp] = true;
                        self._activeWpFilters[wp] = true;
                    } else {
                        delete self._lockedWpFilters[wp];
                    }
                    // Save to prefs
                    var locked = [];
                    for (var k in self._lockedWpFilters) if (self._lockedWpFilters[k]) locked.push(k);
                    StorageManager.save({ prefs: { flowLockedWpFilters: locked } });
                    self._populateWpFilter();
                    self._applyWpFilter();
                    menu.classList.remove('active');
                };
            });
        }, 0);
    },

    // ══════════════════════════════════════════════════════
    // LANE LOCK — right-click lane label to lock/unlock hide
    // ══════════════════════════════════════════════════════

    _showLaneCtx(x, y, laneType) {
        // Reuse canvas context menu element
        const menu = document.getElementById('canvasContextMenu');
        if (!menu) return;
        const isHidden = FlowData.hiddenLanes[laneType];
        const isLocked = FlowData.lockedHiddenLanes && FlowData.lockedHiddenLanes[laneType];

        menu.innerHTML = `
            <div style="padding:6px 14px;font-size:10px;color:#5c6370;text-transform:uppercase;letter-spacing:1px;">${laneType}</div>
            ${!isHidden
                ? '<div class="context-menu-item" data-action="hide-lane">👁‍🗨 Hide Lane</div>'
                : '<div class="context-menu-item" data-action="show-lane">👁 Show Lane</div>'}
            <div class="context-menu-divider"></div>
            ${!isLocked
                ? '<div class="context-menu-item" data-action="lock-lane">🔒 Lock Hide</div>'
                : '<div class="context-menu-item" data-action="unlock-lane">🔓 Unlock</div>'}
        `;

        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.classList.add('active');

        setTimeout(() => {
            menu.querySelectorAll('.context-menu-item').forEach(el => {
                el.onclick = (ev) => {
                    ev.stopPropagation();
                    const action = el.dataset.action;
                    if (!FlowData.lockedHiddenLanes) FlowData.lockedHiddenLanes = {};
                    if (action === 'hide-lane') { FlowData.hiddenLanes[laneType] = true; }
                    else if (action === 'show-lane') { delete FlowData.hiddenLanes[laneType]; }
                    else if (action === 'lock-lane') { FlowData.hiddenLanes[laneType] = true; FlowData.lockedHiddenLanes[laneType] = true; }
                    else if (action === 'unlock-lane') { delete FlowData.lockedHiddenLanes[laneType]; }
                    FlowData.save();
                    FlowApp.renderAll();
                    menu.classList.remove('active');
                };
            });
        }, 0);
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    FlowApp.init();
});
