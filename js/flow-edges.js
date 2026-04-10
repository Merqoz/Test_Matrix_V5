/**
 * FLOW-EDGES.JS - Edge / Connection Drawing
 * Handles creating, rendering, and managing edges (connections) between nodes
 */

const FlowEdges = {
    // Drawing state
    isDrawing: false,
    drawingFromNodeId: null,
    tempLine: null,

    // Context menu state
    activeEdgeId: null,
    _justShowedMenu: false,

    /**
     * Render all edges as SVG paths
     */
    render() {
        var svg = document.getElementById('edgeLayer');
        if (!svg) return;

        // Clear selection state (SVG is about to be rebuilt)
        this._selectedEdgeId = null;

        var canvas = document.getElementById('flowCanvas');
        if (canvas) {
            svg.setAttribute('width', canvas.scrollWidth);
            svg.setAttribute('height', canvas.scrollHeight);
        }

        var tempLine = svg.querySelector('.edge-temp');
        svg.innerHTML = '';
        if (tempLine) svg.appendChild(tempLine);

        // Click on SVG background deselects
        var self = this;
        svg.addEventListener('click', function(e) {
            if (!e.target.closest('.edge-group') && !e.target.closest('.edge-handle')) {
                self.deselectEdge();
            }
        });

        // Pre-compute port usage: count how many edges connect to each node+side
        var portCounts = {};   // key: "nodeId-side" → total count
        var portIndex  = {};   // key: "edgeId-nodeId-side" → index

        var visibleEdges = FlowData.edges.filter(function(edge) {
            if (typeof DataModel !== 'undefined') {
                if (!DataModel.isActivityVisible(edge.fromNodeId) ||
                    !DataModel.isActivityVisible(edge.toNodeId)) return false;
            }
            return true;
        });

        // First pass: determine port side for each edge
        var edgePorts = {};
        visibleEdges.forEach(function(edge) {
            var ports = FlowNodes.getBestPorts(edge.fromNodeId, edge.toNodeId, edge);
            if (!ports) return;
            edgePorts[edge.id] = ports;

            var fromKey = edge.fromNodeId + '-' + ports.fromSide;
            var toKey   = edge.toNodeId + '-' + ports.toSide;
            portCounts[fromKey] = (portCounts[fromKey] || 0) + 1;
            portCounts[toKey]   = (portCounts[toKey]   || 0) + 1;
        });

        // Second pass: assign index per port
        var portAssigned = {};
        visibleEdges.forEach(function(edge) {
            var ports = edgePorts[edge.id];
            if (!ports) return;

            var fromKey = edge.fromNodeId + '-' + ports.fromSide;
            var toKey   = edge.toNodeId + '-' + ports.toSide;

            if (!portAssigned[fromKey]) portAssigned[fromKey] = 0;
            if (!portAssigned[toKey])   portAssigned[toKey]   = 0;

            portIndex[edge.id + '-from'] = portAssigned[fromKey]++;
            portIndex[edge.id + '-to']   = portAssigned[toKey]++;
        });

        // Draw edges with computed offsets
        var self = this;
        visibleEdges.forEach(function(edge) {
            var ports = edgePorts[edge.id];
            if (!ports) return;

            var fromKey = edge.fromNodeId + '-' + ports.fromSide;
            var toKey   = edge.toNodeId + '-' + ports.toSide;

            var fromIdx   = portIndex[edge.id + '-from'];
            var fromTotal = portCounts[fromKey];
            var toIdx     = portIndex[edge.id + '-to'];
            var toTotal   = portCounts[toKey];

            self.drawEdge(svg, edge, ports, fromIdx, fromTotal, toIdx, toTotal);
        });
    },

    /**
     * Draw a single edge as an SVG bezier curve
     */
    drawEdge(svg, edge, ports, fromIdx, fromTotal, toIdx, toTotal) {
        var from = FlowNodes.getPortPosition(edge.fromNodeId, ports.fromSide, fromIdx, fromTotal);
        var to   = FlowNodes.getPortPosition(edge.toNodeId,   ports.toSide,   toIdx,   toTotal);
        if (!from || !to) return;

        // Create group
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('edge-group');
        group.dataset.edgeId = edge.id;

        // Calculate bezier control points
        const path = this.buildBezierPath(from, to, ports);

        // Invisible fat hit area for easier clicking
        const hitLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitLine.setAttribute('d', path);
        hitLine.classList.add('edge-line-hit');
        group.appendChild(hitLine);

        // Visible line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d', path);
        line.classList.add('edge-line');
        group.appendChild(line);

        // Arrow at the end
        this.addArrowhead(group, from, to, ports);

        // Label and/or transfer indicator
        var transferCount = edge.transferItems ? Object.keys(edge.transferItems).length : 0;
        var displayLabel = edge.label || '';
        if (transferCount > 0) {
            displayLabel = (displayLabel ? displayLabel + '  ' : '') + '\uD83D\uDCE6' + transferCount;
        }
        if (displayLabel) {
            this.addLabel(group, from, to, displayLabel);
        }

        // Events
        group.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            this.showContextMenu(e, edge.id);
        });
        group.addEventListener('dblclick', e => {
            e.preventDefault();
            this.editLabel(edge.id);
        });
        group.addEventListener('click', e => {
            e.stopPropagation();
            this.selectEdge(edge.id, ports);
        });

        // Tooltip showing transferred equipment
        if (transferCount > 0) {
            var tipLines = [];
            for (var tKey in edge.transferItems) {
                var tItem = edge.transferItems[tKey];
                if (typeof tItem === 'object' && tItem.description) {
                    tipLines.push(tItem.description + ' (' + tItem.partNo + ') x' + tItem.qty);
                }
            }
            if (tipLines.length > 0) {
                var titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                titleEl.textContent = 'Equipment transfer:\n' + tipLines.join('\n');
                group.appendChild(titleEl);
            }
        }

        svg.appendChild(group);
    },

    /**
     * Build a bezier curve path between two points
     */
    buildBezierPath(from, to, ports) {
        const dx = Math.abs(to.x - from.x);
        const dy = Math.abs(to.y - from.y);
        const cpOffset = Math.max(60, dx * 0.4);
        const cpOffsetV = Math.max(60, dy * 0.4);

        let cp1x, cp1y, cp2x, cp2y;
        const fs = ports.fromSide, ts = ports.toSide;

        if (fs === 'right' && ts === 'left') {
            cp1x = from.x + cpOffset; cp1y = from.y;
            cp2x = to.x - cpOffset;   cp2y = to.y;
        } else if (fs === 'left' && ts === 'right') {
            cp1x = from.x - cpOffset; cp1y = from.y;
            cp2x = to.x + cpOffset;   cp2y = to.y;
        } else if (fs === 'bottom' && ts === 'top') {
            cp1x = from.x; cp1y = from.y + cpOffsetV;
            cp2x = to.x;   cp2y = to.y - cpOffsetV;
        } else if (fs === 'top' && ts === 'bottom') {
            cp1x = from.x; cp1y = from.y - cpOffsetV;
            cp2x = to.x;   cp2y = to.y + cpOffsetV;
        } else if (fs === 'right' && ts === 'top') {
            cp1x = from.x + cpOffset; cp1y = from.y;
            cp2x = to.x;              cp2y = to.y - cpOffsetV;
        } else if (fs === 'right' && ts === 'bottom') {
            cp1x = from.x + cpOffset; cp1y = from.y;
            cp2x = to.x;              cp2y = to.y + cpOffsetV;
        } else if (fs === 'left' && ts === 'top') {
            cp1x = from.x - cpOffset; cp1y = from.y;
            cp2x = to.x;              cp2y = to.y - cpOffsetV;
        } else if (fs === 'left' && ts === 'bottom') {
            cp1x = from.x - cpOffset; cp1y = from.y;
            cp2x = to.x;              cp2y = to.y + cpOffsetV;
        } else if (fs === 'top' && ts === 'left') {
            cp1x = from.x; cp1y = from.y - cpOffsetV;
            cp2x = to.x - cpOffset;   cp2y = to.y;
        } else if (fs === 'top' && ts === 'right') {
            cp1x = from.x; cp1y = from.y - cpOffsetV;
            cp2x = to.x + cpOffset;   cp2y = to.y;
        } else if (fs === 'bottom' && ts === 'left') {
            cp1x = from.x; cp1y = from.y + cpOffsetV;
            cp2x = to.x - cpOffset;   cp2y = to.y;
        } else if (fs === 'bottom' && ts === 'right') {
            cp1x = from.x; cp1y = from.y + cpOffsetV;
            cp2x = to.x + cpOffset;   cp2y = to.y;
        } else if (fs === 'top' && ts === 'top') {
            var upOff = Math.max(60, dy * 0.5);
            cp1x = from.x; cp1y = from.y - upOff;
            cp2x = to.x;   cp2y = to.y - upOff;
        } else if (fs === 'bottom' && ts === 'bottom') {
            var downOff = Math.max(60, dy * 0.5);
            cp1x = from.x; cp1y = from.y + downOff;
            cp2x = to.x;   cp2y = to.y + downOff;
        } else {
            // Same side fallback (e.g., right→right)
            const offset = Math.max(80, Math.abs(to.y - from.y) * 0.5);
            if (fs === 'left' && ts === 'left') {
                cp1x = from.x - offset; cp1y = from.y;
                cp2x = to.x - offset;   cp2y = to.y;
            } else {
                cp1x = from.x + offset; cp1y = from.y;
                cp2x = to.x + offset;   cp2y = to.y;
            }
        }

        return `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`;
    },

    /**
     * Add an arrowhead near the target node
     */
    addArrowhead(group, from, to, ports) {
        const arrowSize = 8;
        let adjustedAngle;
        if (ports.toSide === 'left') adjustedAngle = Math.PI;
        else if (ports.toSide === 'right') adjustedAngle = 0;
        else if (ports.toSide === 'top') adjustedAngle = -Math.PI / 2;
        else if (ports.toSide === 'bottom') adjustedAngle = Math.PI / 2;
        else adjustedAngle = Math.atan2(to.y - from.y, to.x - from.x);

        // Same-side override
        if (ports.fromSide === ports.toSide) {
            if (ports.toSide === 'right') adjustedAngle = 0;
            else if (ports.toSide === 'left') adjustedAngle = Math.PI;
            else if (ports.toSide === 'top') adjustedAngle = -Math.PI / 2;
            else if (ports.toSide === 'bottom') adjustedAngle = Math.PI / 2;
        }

        const tipX = to.x;
        const tipY = to.y;

        const p1x = tipX - arrowSize * Math.cos(adjustedAngle - 0.4);
        const p1y = tipY - arrowSize * Math.sin(adjustedAngle - 0.4);
        const p2x = tipX - arrowSize * Math.cos(adjustedAngle + 0.4);
        const p2y = tipY - arrowSize * Math.sin(adjustedAngle + 0.4);

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`);
        arrow.classList.add('edge-arrow');
        group.appendChild(arrow);
    },

    /**
     * Add a label to an edge at the midpoint
     */
    addLabel(group, from, to, text) {
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;

        const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelGroup.classList.add('edge-label-group');

        // Measure text width approximately
        const textWidth = text.length * 6.5 + 16;
        const textHeight = 22;

        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', mx - textWidth / 2);
        bg.setAttribute('y', my - textHeight / 2);
        bg.setAttribute('width', textWidth);
        bg.setAttribute('height', textHeight);
        bg.classList.add('edge-label-bg');
        labelGroup.appendChild(bg);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', mx);
        label.setAttribute('y', my);
        label.classList.add('edge-label-text');
        label.textContent = text;
        labelGroup.appendChild(label);

        group.appendChild(labelGroup);
    },

    /**
     * Start drawing an edge from a node port
     */
    startEdge(event, nodeId) {
        event.preventDefault();
        event.stopPropagation();

        this.isDrawing = true;
        this.drawingFromNodeId = nodeId;
        document.body.classList.add('edge-mode');

        // Highlight source node
        const nodeEl = document.getElementById(`node-${nodeId}`);
        if (nodeEl) nodeEl.classList.add('edge-source');

        // Show indicator
        const indicator = document.getElementById('edgeModeIndicator');
        if (indicator) indicator.classList.add('active');

        // Create temp line in SVG
        const svg = document.getElementById('edgeLayer');
        if (svg) {
            const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempLine.classList.add('edge-temp');
            tempLine.id = 'tempEdgeLine';
            svg.appendChild(tempLine);
            this.tempLine = tempLine;
        }

        // Track mouse movement
        this._onMouseMove = e => this.onDrawMove(e);
        this._onMouseUp = e => this.cancelDraw(e);
        this._onKeyDown = e => { if (e.key === 'Escape') this.cancelDraw(e); };
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('keydown', this._onKeyDown);
    },

    /**
     * Track mouse during edge drawing
     */
    onDrawMove(event) {
        if (!this.isDrawing || !this.tempLine) return;

        var canvas = document.getElementById('flowCanvas');
        if (!canvas) return;

        var canvasRect = canvas.getBoundingClientRect();
        var fromCenter = FlowNodes.getNodeCenter(this.drawingFromNodeId);
        if (!fromCenter) return;

        // Mouse position relative to canvas (no scroll offset needed —
        // getBoundingClientRect already accounts for scroll)
        var mouseX = event.clientX - canvasRect.left;
        var mouseY = event.clientY - canvasRect.top;

        var dx = mouseX - fromCenter.x;
        var cpOffset = Math.max(40, Math.abs(dx) * 0.4);

        var path = 'M ' + fromCenter.x + ' ' + fromCenter.y + ' C ' + (fromCenter.x + cpOffset) + ' ' + fromCenter.y + ', ' + (mouseX - cpOffset) + ' ' + mouseY + ', ' + mouseX + ' ' + mouseY;
        this.tempLine.setAttribute('d', path);
    },

    /**
     * Complete the edge to a target node
     */
    finishEdge(event, targetNodeId) {
        if (!this.isDrawing || !this.drawingFromNodeId) return;
        event.stopPropagation();

        if (this.drawingFromNodeId !== targetNodeId) {
            const edge = FlowData.addEdge(this.drawingFromNodeId, targetNodeId);
            if (edge) {
                // Prompt for label
                this.cleanupDraw();
                this.editLabel(edge.id);
                this.render();
                return;
            }
        }

        this.cleanupDraw();
    },

    /**
     * Cancel edge drawing
     */
    cancelDraw(event) {
        if (!this.isDrawing) return;
        // Don't cancel if mouseup is on a node (that's handled by finishEdge)
        if (event && event.type === 'mouseup') {
            const target = event.target;
            if (target.closest && target.closest('.flow-node')) return;
        }
        this.cleanupDraw();
    },

    /**
     * Clean up drawing state
     */
    cleanupDraw() {
        this.isDrawing = false;
        document.body.classList.remove('edge-mode');

        // Remove source highlight
        if (this.drawingFromNodeId) {
            const nodeEl = document.getElementById(`node-${this.drawingFromNodeId}`);
            if (nodeEl) nodeEl.classList.remove('edge-source');
        }
        this.drawingFromNodeId = null;

        // Remove temp line
        const tempLine = document.getElementById('tempEdgeLine');
        if (tempLine) tempLine.remove();
        this.tempLine = null;

        // Hide indicator
        const indicator = document.getElementById('edgeModeIndicator');
        if (indicator) indicator.classList.remove('active');

        // Remove listeners
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('keydown', this._onKeyDown);
    },

    /**
     * Show context menu for an edge
     */
    showContextMenu(event, edgeId) {
        this.activeEdgeId = edgeId;
        this._justShowedMenu = true;  // prevent canvas menu from also firing
        const menu = document.getElementById('contextMenu');
        if (!menu) return;

        // Close canvas menu if it's open
        const cmenu = document.getElementById('canvasContextMenu');
        if (cmenu) cmenu.classList.remove('active');

        menu.style.left = event.clientX + 'px';
        menu.style.top = event.clientY + 'px';
        menu.classList.add('active');

        // Close on outside click
        setTimeout(() => {
            const closeHandler = () => {
                menu.classList.remove('active');
                document.removeEventListener('click', closeHandler);
            };
            document.addEventListener('click', closeHandler);
        }, 10);
    },

    /**
     * Edit edge details (label + equipment transfer)
     */
    editLabel(edgeId) {
        const edge = FlowData.getEdge(edgeId);
        if (!edge) return;

        this.activeEdgeId = edgeId;
        const overlay = document.getElementById('labelModalOverlay');
        const input = document.getElementById('labelInput');
        if (!overlay || !input) return;

        input.value = edge.label || '';

        // Populate equipment transfer list
        this._renderEdgeEquipment(edge);

        overlay.classList.add('active');
        setTimeout(() => input.focus(), 100);
    },

    /**
     * Render the equipment transfer checklist.
     * Shows items that exist in the source node's activity.
     * Items also in the target node get a "shared" indicator.
     */
    _renderEdgeEquipment(edge) {
        var listEl = document.getElementById('edgeEquipmentList');
        if (!listEl) return;

        var m = typeof StorageManager !== 'undefined' ? StorageManager.loadMatrix() : null;
        if (!m || !m.sections) {
            listEl.innerHTML = '<div class="edge-eq-empty">No matrix data</div>';
            return;
        }

        var fromId = edge.fromNodeId;
        var toId = edge.toNodeId;
        var fromNode = FlowData.getNode(fromId);
        var toNode = FlowData.getNode(toId);

        // Collect items in source and target
        var items = [];
        var targetItems = {};

        m.sections.forEach(function(section) {
            section.rows.forEach(function(row, ri) {
                var fromQty = row.testQty ? row.testQty[fromId] : '';
                var toQty = row.testQty ? row.testQty[toId] : '';
                var hasFrom = fromQty && fromQty !== '0' && String(fromQty).trim() !== '';
                var hasTo = toQty && toQty !== '0' && String(toQty).trim() !== '';

                if (hasFrom) {
                    var key = section.id + '-' + ri;
                    items.push({
                        key: key,
                        partNo: row.partNo || '-',
                        description: row.description || '-',
                        fromQty: fromQty,
                        toQty: hasTo ? toQty : '',
                        shared: hasTo
                    });
                }
                if (hasTo) {
                    targetItems[section.id + '-' + ri] = true;
                }
            });
        });

        if (items.length === 0) {
            listEl.innerHTML = '<div class="edge-eq-empty">No equipment in source activity' +
                (fromNode ? ' (' + fromNode.name + ')' : '') + '</div>';
            return;
        }

        // Current transfer selections
        var transfers = edge.transferItems || {};

        var html = '<div class="edge-eq-header">' +
            '<span>From: <strong>' + (fromNode ? fromNode.name : '?') + '</strong></span>' +
            '<span>To: <strong>' + (toNode ? toNode.name : '?') + '</strong></span>' +
            '</div>';

        // Table header
        html += '<div class="edge-eq-scroll">' +
            '<table class="edge-eq-table"><thead><tr>' +
            '<th class="edge-eq-th-cb"></th>' +
            '<th>Description</th>' +
            '<th>Part No.</th>' +
            '<th>QTY</th>' +
            '<th></th>' +
            '</tr></thead><tbody>';

        items.forEach(function(item) {
            var checked = transfers[item.key] ? ' checked' : '';
            var sharedTag = item.shared ? '<span class="edge-eq-shared" title="Also in target activity">↔</span>' : '';
            var rowClass = item.shared ? ' class="shared"' : '';
            html += '<tr' + rowClass + '>' +
                '<td class="edge-eq-td-cb"><input type="checkbox" data-key="' + item.key + '"' + checked + '></td>' +
                '<td class="edge-eq-td-desc">' + item.description + '</td>' +
                '<td class="edge-eq-td-pn">' + item.partNo + '</td>' +
                '<td class="edge-eq-td-qty">' + item.fromQty + '</td>' +
                '<td class="edge-eq-td-shared">' + sharedTag + '</td>' +
            '</tr>';
        });

        html += '</tbody></table></div>';
        listEl.innerHTML = html;

        // Make entire row clickable to toggle checkbox
        listEl.querySelectorAll('.edge-eq-table tbody tr').forEach(function(row) {
            row.addEventListener('click', function(e) {
                if (e.target.tagName === 'INPUT') return; // already handled
                var cb = row.querySelector('input[type="checkbox"]');
                if (cb) cb.checked = !cb.checked;
            });
        });
    },

    /**
     * Save label and equipment transfers
     */
    saveLabel() {
        const input = document.getElementById('labelInput');
        if (!input || !this.activeEdgeId) return;

        var edge = FlowData.getEdge(this.activeEdgeId);
        if (edge) {
            edge.label = input.value.trim();

            // Collect checked equipment transfers with item details
            var transfers = {};
            var listEl = document.getElementById('edgeEquipmentList');
            if (listEl) {
                listEl.querySelectorAll('.edge-eq-table tbody tr').forEach(function(row) {
                    var cb = row.querySelector('input[type="checkbox"]');
                    if (!cb || !cb.checked) return;
                    var key = cb.dataset.key;
                    var descTd = row.querySelector('.edge-eq-td-desc');
                    var pnTd = row.querySelector('.edge-eq-td-pn');
                    var qtyTd = row.querySelector('.edge-eq-td-qty');
                    transfers[key] = {
                        description: descTd ? descTd.textContent.trim() : '',
                        partNo: pnTd ? pnTd.textContent.trim() : '',
                        qty: qtyTd ? qtyTd.textContent.trim() : ''
                    };
                });
            }
            edge.transferItems = transfers;
            FlowData.save();
        }

        this.closeLabelModal();
        this.render();
    },

    /**
     * Close label modal
     */
    closeLabelModal() {
        const overlay = document.getElementById('labelModalOverlay');
        if (overlay) overlay.classList.remove('active');
        this.activeEdgeId = null;
    },

    /**
     * Delete the active edge (from context menu)
     */
    deleteActiveEdge() {
        if (!this.activeEdgeId) return;
        FlowData.removeEdge(this.activeEdgeId);
        this.activeEdgeId = null;
        this._selectedEdgeId = null;

        const menu = document.getElementById('contextMenu');
        if (menu) menu.classList.remove('active');

        this.render();
    },

    /**
     * Reset custom port routing on an edge (from context menu)
     */
    resetEdgePorts(edgeId) {
        var eid = edgeId || this.activeEdgeId;
        var edge = FlowData.getEdge(eid);
        if (edge) {
            delete edge.fromSide;
            delete edge.toSide;
            FlowData.save();
        }
        this._selectedEdgeId = null;
        var menu = document.getElementById('contextMenu');
        if (menu) menu.classList.remove('active');
        this.render();
    },

    // ══════════════════════════════════════════════════════
    // EDGE ENDPOINT REPOSITIONING
    // ══════════════════════════════════════════════════════

    _selectedEdgeId: null,
    _handleDrag: null,

    selectEdge(edgeId, ports) {
        // If already selected, deselect
        if (this._selectedEdgeId === edgeId) { this.deselectEdge(); return; }
        this.deselectEdge();
        this._selectedEdgeId = edgeId;
        // Highlight the edge group
        var g = document.querySelector('.edge-group[data-edge-id="'+edgeId+'"]');
        if (g) g.classList.add('edge-selected');
        this._showHandles(edgeId, ports);
    },

    deselectEdge() {
        this._selectedEdgeId = null;
        // Remove highlights
        document.querySelectorAll('.edge-selected').forEach(function(el){ el.classList.remove('edge-selected'); });
        // Remove handle elements
        document.querySelectorAll('.edge-handle').forEach(function(el){ el.remove(); });
    },

    _showHandles(edgeId, ports) {
        var edge = FlowData.getEdge(edgeId);
        if (!edge) return;
        var svg = document.getElementById('edgeLayer');
        if (!svg) return;

        var fromPos = FlowNodes.getPortPosition(edge.fromNodeId, ports.fromSide, 0, 1);
        var toPos = FlowNodes.getPortPosition(edge.toNodeId, ports.toSide, 0, 1);
        if (!fromPos || !toPos) return;

        var self = this;
        var sides = ['left','right','top','bottom'];

        // Create from-handle
        var hFrom = document.createElementNS('http://www.w3.org/2000/svg','g');
        hFrom.classList.add('edge-handle');
        hFrom.dataset.end = 'from';
        hFrom.innerHTML = '<circle cx="'+fromPos.x+'" cy="'+fromPos.y+'" r="7" class="edge-handle-dot"/>' +
            '<text x="'+fromPos.x+'" y="'+(fromPos.y-12)+'" class="edge-handle-label">'+ports.fromSide+'</text>';
        hFrom.style.cursor = 'grab';
        svg.appendChild(hFrom);

        // Create to-handle
        var hTo = document.createElementNS('http://www.w3.org/2000/svg','g');
        hTo.classList.add('edge-handle');
        hTo.dataset.end = 'to';
        hTo.innerHTML = '<circle cx="'+toPos.x+'" cy="'+toPos.y+'" r="7" class="edge-handle-dot"/>' +
            '<text x="'+toPos.x+'" y="'+(toPos.y-12)+'" class="edge-handle-label">'+ports.toSide+'</text>';
        hTo.style.cursor = 'grab';
        svg.appendChild(hTo);

        // Also show port indicators on connected nodes
        this._showPortIndicators(edge.fromNodeId);
        this._showPortIndicators(edge.toNodeId);

        // Drag handlers
        [hFrom, hTo].forEach(function(handle) {
            handle.addEventListener('mousedown', function(e) {
                if (e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                var end = handle.dataset.end;
                var nodeId = end === 'from' ? edge.fromNodeId : edge.toNodeId;
                self._handleDrag = { edgeId: edgeId, end: end, nodeId: nodeId, handle: handle };
                handle.style.cursor = 'grabbing';
                document.addEventListener('mousemove', self._onHandleMove);
                document.addEventListener('mouseup', self._onHandleUp);
            });
        });
    },

    _showPortIndicators(nodeId) {
        var svg = document.getElementById('edgeLayer');
        if (!svg) return;
        var self = this;
        var edgeId = this._selectedEdgeId;
        var edge = FlowData.getEdge(edgeId);
        if (!edge) return;

        var sides = ['left','right','top','bottom'];
        sides.forEach(function(side) {
            var pos = FlowNodes.getPortPosition(nodeId, side, 0, 1);
            if (!pos) return;
            var dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
            dot.setAttribute('cx', pos.x);
            dot.setAttribute('cy', pos.y);
            dot.setAttribute('r', '5');
            dot.classList.add('edge-handle', 'edge-port-indicator');
            dot.dataset.nodeId = nodeId;
            dot.dataset.side = side;

            // Click to snap edge endpoint to this port
            dot.addEventListener('click', function(e) {
                e.stopPropagation();
                // Determine which end of the edge this node belongs to
                var end = null;
                if (String(nodeId) === String(edge.fromNodeId)) end = 'from';
                else if (String(nodeId) === String(edge.toNodeId)) end = 'to';
                if (!end) return;

                // Ensure both sides are stored
                if (!edge.fromSide || !edge.toSide) {
                    var autoPorts = FlowNodes.getBestPorts(edge.fromNodeId, edge.toNodeId);
                    if (autoPorts) {
                        if (!edge.fromSide) edge.fromSide = autoPorts.fromSide;
                        if (!edge.toSide) edge.toSide = autoPorts.toSide;
                    }
                }
                if (end === 'from') edge.fromSide = side;
                else edge.toSide = side;
                FlowData.save();

                self.deselectEdge();
                self.render();
                // Re-select to show updated handles
                setTimeout(function() {
                    self.selectEdge(edgeId, { fromSide: edge.fromSide, toSide: edge.toSide });
                }, 50);
            });

            svg.appendChild(dot);
        });
    },

    _onHandleMove: function(e) {
        var d = FlowEdges._handleDrag;
        if (!d) return;
        e.preventDefault();
        var canvas = document.getElementById('flowCanvas');
        if (!canvas) return;
        var cr = canvas.getBoundingClientRect();
        var mx = e.clientX - cr.left, my = e.clientY - cr.top;

        // Move the handle dot visually
        var circle = d.handle.querySelector('circle');
        var label = d.handle.querySelector('text');
        if (circle) { circle.setAttribute('cx', mx); circle.setAttribute('cy', my); }
        if (label) { label.setAttribute('x', mx); label.setAttribute('y', my - 12); }

        // Highlight nearest port indicator
        var best = FlowEdges._getNearestSide(d.nodeId, mx, my);
        document.querySelectorAll('.edge-port-indicator[data-node-id="'+d.nodeId+'"]').forEach(function(ind) {
            ind.classList.toggle('port-hover', ind.dataset.side === best.side);
        });
        if (label) label.textContent = best.side;
    },

    _onHandleUp: function(e) {
        var d = FlowEdges._handleDrag;
        if (!d) return;
        document.removeEventListener('mousemove', FlowEdges._onHandleMove);
        document.removeEventListener('mouseup', FlowEdges._onHandleUp);

        var canvas = document.getElementById('flowCanvas');
        if (!canvas) { FlowEdges._handleDrag = null; return; }
        var cr = canvas.getBoundingClientRect();
        var mx = e.clientX - cr.left, my = e.clientY - cr.top;

        var best = FlowEdges._getNearestSide(d.nodeId, mx, my);
        var edge = FlowData.getEdge(d.edgeId);
        if (edge) {
            // Ensure both sides are stored (initialize from auto if needed)
            if (!edge.fromSide || !edge.toSide) {
                var autoPorts = FlowNodes.getBestPorts(edge.fromNodeId, edge.toNodeId);
                if (autoPorts) {
                    if (!edge.fromSide) edge.fromSide = autoPorts.fromSide;
                    if (!edge.toSide) edge.toSide = autoPorts.toSide;
                }
            }
            if (d.end === 'from') edge.fromSide = best.side;
            else edge.toSide = best.side;
            FlowData.save();
        }

        FlowEdges._handleDrag = null;
        FlowEdges.deselectEdge();
        FlowEdges.render();
        // Re-select to show updated handles
        if (edge) {
            setTimeout(function() {
                var ports = { fromSide: edge.fromSide, toSide: edge.toSide };
                FlowEdges.selectEdge(d.edgeId, ports);
            }, 50);
        }
    },

    _getNearestSide(nodeId, mx, my) {
        var sides = ['left','right','top','bottom'];
        var best = { side: 'right', dist: Infinity };
        sides.forEach(function(side) {
            var pos = FlowNodes.getPortPosition(nodeId, side, 0, 1);
            if (!pos) return;
            var dist = Math.sqrt(Math.pow(pos.x - mx, 2) + Math.pow(pos.y - my, 2));
            if (dist < best.dist) { best = { side: side, dist: dist }; }
        });
        return best;
    }
};
