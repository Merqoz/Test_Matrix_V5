/**
 * FLOW-NODES.JS - Node Rendering & Management
 * Absolute-positioned nodes, freely draggable across all lanes.
 * Entire node body is the drag surface (except edge ports).
 */

const FlowNodes = {

    NODE_HEIGHT: 82,     // min-height(56) + padding(24) + 2px border
    NODE_GAP: 4,         // minimum gap between nodes (tight)
    ALIGN_GAP: 6,        // gap used by smart align (slightly more breathing room)

    /** Render all nodes into their respective lanes */
    render() {
        FlowData.laneTypes.forEach(type => this.renderLane(type));
        FlowData.laneTypes.forEach(type => {
            const all = FlowData.getNodesForLane(type);
            const visible = all.filter(n => DataModel.isActivityVisible(n.id));
            const h = document.querySelector(`.lane-${type} .lane-count`);
            if (h) h.textContent = `(${visible.length})`;
        });
    },

    /** Render nodes for a single lane */
    renderLane(type) {
        const body = FlowLanes.getLaneBody(type);
        if (!body) return;

        const nodes = FlowData.getNodesForLane(type)
            .filter(n => DataModel.isActivityVisible(n.id));
        body.innerHTML = '';

        if (nodes.length === 0) {
            body.innerHTML = '<div class="lane-empty">No activities</div>';
            return;
        }

        // Sort by Y position (user's arrangement)
        nodes.sort(function(a, b) { return a.y - b.y; });

        const maxY = Math.max(...nodes.map(n => n.y)) + 120;
        body.style.minHeight = Math.max(600, maxY) + 'px';

        nodes.forEach(node => body.appendChild(this.createNodeElement(node)));
    },

    /**
     * Compute a topological rank for nodes in a lane.
     * Rank 0 = no incoming edges (source), higher = further downstream.
     * Uses BFS/Kahn's algorithm.
     */
    _topoRank(laneNodes) {
        var nodeIds = {};
        laneNodes.forEach(function(n) { nodeIds[n.id] = true; });

        var inDegree = {};
        var children = {};
        laneNodes.forEach(function(n) {
            inDegree[n.id] = 0;
            children[n.id] = [];
        });

        // Build graph from ALL edges (cross-lane edges affect rank too)
        FlowData.edges.forEach(function(e) {
            if (!nodeIds[e.toNodeId]) return;
            if (nodeIds[e.fromNodeId]) {
                children[e.fromNodeId].push(e.toNodeId);
            }
            inDegree[e.toNodeId] = (inDegree[e.toNodeId] || 0) + 1;
        });

        // BFS — assign ranks level by level
        var rank = {};
        var queue = [];
        laneNodes.forEach(function(n) {
            if (inDegree[n.id] === 0) {
                queue.push(n.id);
                rank[n.id] = 0;
            }
        });

        while (queue.length > 0) {
            var nid = queue.shift();
            var r = rank[nid];
            (children[nid] || []).forEach(function(cid) {
                inDegree[cid]--;
                rank[cid] = Math.max(rank[cid] || 0, r + 1);
                if (inDegree[cid] === 0) queue.push(cid);
            });
        }

        // Unranked nodes (cycles or no edges) get rank based on their Y
        laneNodes.forEach(function(n) {
            if (rank[n.id] === undefined) rank[n.id] = 999;
        });

        return rank;
    },

    /**
     * Resolve collisions within each lane — push overlapping nodes apart.
     * Sorts purely by Y position so the user's drag arrangement is preserved.
     * Returns true if any positions were adjusted.
     */
    resolveCollisions() {
        var self = this;
        var adjusted = false;
        var minStep = self.NODE_HEIGHT + self.NODE_GAP;

        FlowData.laneTypes.forEach(function(type) {
            var nodes = FlowData.getNodesForLane(type)
                .filter(function(n) { return DataModel.isActivityVisible(n.id); });
            if (nodes.length < 2) return;

            // Sort by Y position only — user's arrangement
            nodes.sort(function(a, b) { return a.y - b.y; });

            // Push down any that overlap with the one above
            for (var i = 1; i < nodes.length; i++) {
                var prev = nodes[i - 1];
                var curr = nodes[i];
                var minY = prev.y + minStep;
                if (curr.y < minY) {
                    curr.y = minY;
                    adjusted = true;
                }
            }

            // Ensure nothing is above y=0
            if (nodes[0].y < 0) {
                var shift = -nodes[0].y;
                nodes.forEach(function(n) { n.y += shift; });
                adjusted = true;
            }
        });

        return adjusted;
    },

    /** Create a DOM element for a node */
    createNodeElement(node) {
        const el = document.createElement('div');
        const isInactive = FlowData.inactiveNodes && FlowData.inactiveNodes[node.id];
        el.className = 'flow-node' + (isInactive ? ' node-inactive' : '');
        el.id = `node-${node.id}`;
        el.dataset.nodeId = node.id;
        el.dataset.type = node.type;
        el.style.top = node.y + 'px';

        // Location color coding — subtle background tint
        const locColor = FlowData.getLocationColor(node.location);
        if (locColor) {
            el.style.background = locColor.bg;
            el.style.borderColor = locColor.border;
            el.dataset.location = node.location;
        }

        const metaParts = [];
        if (node.location)  metaParts.push(`<span class="node-location-tag" style="color:${locColor?.color || '#778'}">${node.location}</span>`);
        if (node.workpack)  metaParts.push(`📦 ${node.workpack}`);
        if (node.startDate) metaParts.push(`📅 ${node.startDate}`);

        // Description indicator
        const desc = FlowData.descriptions[node.id];
        const hasDesc = desc && (typeof desc === 'string' ? desc : (desc.overview || desc.bullets));
        const descIcon = hasDesc ? '<span class="node-desc-indicator" title="Has description">📝</span>' : '';

        el.innerHTML = `
            <div class="node-port node-port-left"
                 data-node-id="${node.id}" data-side="left"
                 onmousedown="FlowEdges.startEdge(event, ${node.id})"></div>
            <div class="node-port node-port-right"
                 data-node-id="${node.id}" data-side="right"
                 onmousedown="FlowEdges.startEdge(event, ${node.id})"></div>
            <div class="node-name">${this.escapeHtml(node.name)} ${descIcon}</div>
            <div class="node-meta">
                ${metaParts.map(p => `<span>${p}</span>`).join('')}
            </div>
        `;

        // Whole node is draggable (left-click only, except ports)
        el.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            if (e.target.closest('.node-port')) return;
            FlowDrag.onMouseDown(e, node.id);
        });

        // Right-click → show node context menu
        el.addEventListener('contextmenu', e => {
            if (e.target.closest('.node-port')) return;
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('active'));
            FlowDetails._pendingNodeId = node.id;
            const menu = document.getElementById('nodeContextMenu');
            if (menu) {
                const isInactive = FlowData.inactiveNodes && FlowData.inactiveNodes[node.id];
                menu.innerHTML = `
                    <div class="context-menu-item" onclick="FlowDetails.openFromMenu()">ℹ️ Activity Info</div>
                    <div class="context-menu-divider"></div>
                    <div class="context-menu-item" onclick="FlowNodes.toggleInactive(${node.id})">
                        ${isInactive ? '✅ Mark as Active' : '⬜ Mark as Inactive (grey out)'}
                    </div>
                `;
                menu.style.left = e.clientX + 'px';
                menu.style.top  = e.clientY + 'px';
                menu.classList.add('active');
            }
        });

        // Edge drawing finish on mouseup
        el.addEventListener('mouseup', e => {
            if (FlowEdges.isDrawing) FlowEdges.finishEdge(e, node.id);
        });

        return el;
    },

    /**
     * Toggle a node's inactive (greyed out) state.
     */
    toggleInactive(nodeId) {
        if (!FlowData.inactiveNodes) FlowData.inactiveNodes = {};
        if (FlowData.inactiveNodes[nodeId]) {
            delete FlowData.inactiveNodes[nodeId];
        } else {
            FlowData.inactiveNodes[nodeId] = true;
        }
        FlowData.save();
        // Toggle class on the node element directly (no full re-render needed)
        const el = document.getElementById('node-' + nodeId);
        if (el) el.classList.toggle('node-inactive', !!FlowData.inactiveNodes[nodeId]);
        // Hide context menu
        document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('active'));
    },

    /**
     * Auto-align nodes in a single lane — respects topological order.
     */
    alignLane(type, direction) {
        direction = direction || 'down';
        var self = this;
        var nodes = FlowData.getNodesForLane(type);
        if (nodes.length === 0) return;

        var spacing = self.NODE_HEIGHT + self.NODE_GAP;
        var startY = 20;

        var ranked = self._topoRank(nodes);
        nodes.sort(function(a, b) {
            var ra = ranked[a.id] || 0;
            var rb = ranked[b.id] || 0;
            if (ra !== rb) return ra - rb;
            return a.y - b.y;
        });
        if (direction === 'up') nodes.reverse();

        nodes.forEach(function(node, i) { node.y = startY + i * spacing; });
        FlowData.save();
        this.renderLane(type);
        FlowEdges.render();
    },

    /**
     * Auto-align ALL lanes — even spacing, respects topological order
     */
    alignAll(direction) {
        direction = direction || 'down';
        var self = this;
        var spacing = self.NODE_HEIGHT + self.NODE_GAP;
        var startY = 20;

        FlowData.laneTypes.forEach(function(type) {
            var nodes = FlowData.getNodesForLane(type);
            if (nodes.length === 0) return;

            // Sort by topological rank, then current Y
            var ranked = self._topoRank(nodes);
            nodes.sort(function(a, b) {
                var ra = ranked[a.id] || 0;
                var rb = ranked[b.id] || 0;
                if (ra !== rb) return ra - rb;
                return a.y - b.y;
            });
            if (direction === 'up') nodes.reverse();

            nodes.forEach(function(node, i) { node.y = startY + i * spacing; });
        });
        FlowData.save();
        FlowNodes.render();
        FlowEdges.render();
    },

    /**
     * Smart align — groups nodes that share the same source together,
     * orders by topological depth, and eliminates overlap.
     */
    smartAlign() {
        var self = this;
        var step = self.NODE_HEIGHT + self.ALIGN_GAP;
        var startY = 10;

        FlowData.laneTypes.forEach(function(laneType) {
            var nodes = FlowData.getNodesForLane(laneType);
            if (nodes.length === 0) return;

            var nodeMap = {};
            nodes.forEach(function(n) { nodeMap[n.id] = n; });
            var nodeIds = {};
            nodes.forEach(function(n) { nodeIds[n.id] = true; });

            // Build parent→children map (within-lane edges only)
            var childrenOf = {};   // parentId → [childId, ...]
            var parentOf   = {};   // childId  → [parentId, ...]
            nodes.forEach(function(n) { childrenOf[n.id] = []; parentOf[n.id] = []; });

            FlowData.edges.forEach(function(e) {
                if (!nodeIds[e.fromNodeId] || !nodeIds[e.toNodeId]) return;
                childrenOf[e.fromNodeId].push(e.toNodeId);
                parentOf[e.toNodeId].push(e.fromNodeId);
            });

            // Find roots (no in-lane parents)
            var roots = nodes.filter(function(n) { return parentOf[n.id].length === 0; });
            // Sort roots by current Y to preserve user intent
            roots.sort(function(a, b) { return a.y - b.y; });

            // BFS: place each root, then its children grouped directly below
            var placed = {};
            var order = [];

            function placeTree(nodeId) {
                if (placed[nodeId]) return;
                placed[nodeId] = true;
                order.push(nodeId);

                // Sort children by their current Y position
                var kids = (childrenOf[nodeId] || []).slice();
                kids.sort(function(a, b) {
                    return (nodeMap[a] ? nodeMap[a].y : 0) - (nodeMap[b] ? nodeMap[b].y : 0);
                });
                kids.forEach(function(cid) { placeTree(cid); });
            }

            roots.forEach(function(r) { placeTree(r.id); });

            // Any unplaced nodes (cycles or disconnected)
            nodes.forEach(function(n) {
                if (!placed[n.id]) order.push(n.id);
            });

            // Assign Y in order
            order.forEach(function(nid, i) {
                if (nodeMap[nid]) nodeMap[nid].y = startY + i * step;
            });
        });

        FlowData.save();
        FlowNodes.render();
        FlowEdges.render();
        if (typeof FlowApp !== 'undefined') FlowApp._applyWpFilter();
    },

    /**
     * Sort nodes within each lane by workpack order (WP03, WP04, WP05, ...),
     * then by current Y position within the same workpack.
     * Creates clean, grouped vertical layout.
     */
    sortByWorkpack() {
        var self = this;
        var step = self.NODE_HEIGHT + self.NODE_GAP;
        var startY = 20;

        // Build workpack order map from DataModel
        var wpOrder = {};
        if (typeof DataModel !== 'undefined' && DataModel.workpacks) {
            DataModel.workpacks.forEach(function(wp, i) { wpOrder[wp] = i; });
        }

        FlowData.laneTypes.forEach(function(laneType) {
            var nodes = FlowData.getNodesForLane(laneType);
            if (nodes.length === 0) return;

            nodes.sort(function(a, b) {
                var wpA = wpOrder[a.workpack] !== undefined ? wpOrder[a.workpack] : 999;
                var wpB = wpOrder[b.workpack] !== undefined ? wpOrder[b.workpack] : 999;
                if (wpA !== wpB) return wpA - wpB;
                return a.y - b.y;  // preserve relative order within same WP
            });

            nodes.forEach(function(node, i) { node.y = startY + i * step; });
        });

        FlowData.save();
        FlowNodes.render();
        FlowEdges.render();
        if (typeof FlowApp !== 'undefined') FlowApp._applyWpFilter();
    },

    /**
     * Sync a node's type change back to matrix storage.
     */
    syncTypeToMatrix(nodeId, newType) {
        if (typeof StorageManager === 'undefined') return;
        const m = StorageManager.loadMatrix();
        if (!m || !m.testColumns) return;
        const col = m.testColumns.find(t => t.id === nodeId);
        if (col) {
            col.type = newType;
            StorageManager.saveNow({ matrix: m });
            console.log(`[Flow→Matrix] Node ${nodeId} type → ${newType}`);
        }
    },

    /* ── Geometry helpers (used by FlowEdges) ──────────── */

    /**
     * All geometry uses getBoundingClientRect() for both node and canvas.
     * Since both are inside the same scrollable wrapper, their viewport
     * positions shift equally when scrolled — the difference (nr - cr)
     * always gives the correct SVG coordinate. No scroll offset needed.
     */

    getNodeCenter(nodeId) {
        var el = document.getElementById('node-' + nodeId);
        var canvas = document.getElementById('flowCanvas');
        if (!el || !canvas) return null;
        var nr = el.getBoundingClientRect();
        var cr = canvas.getBoundingClientRect();
        return {
            x: nr.left - cr.left + nr.width  / 2,
            y: nr.top  - cr.top  + nr.height / 2
        };
    },

    /**
     * Get port position snapped exactly to the node border.
     * Optionally accepts a Y-offset index for stacking multiple connections.
     */
    getPortPosition(nodeId, side, offsetIdx, totalPorts) {
        var el = document.getElementById('node-' + nodeId);
        var canvas = document.getElementById('flowCanvas');
        if (!el || !canvas) return null;
        var nr = el.getBoundingClientRect();
        var cr = canvas.getBoundingClientRect();

        var x, y;

        if (side === 'left' || side === 'right') {
            y = nr.top - cr.top + nr.height / 2;
            if (totalPorts && totalPorts > 1 && offsetIdx !== undefined) {
                var portSpacing = Math.min(18, (nr.height - 8) / totalPorts);
                var totalSpan = portSpacing * (totalPorts - 1);
                y = nr.top - cr.top + (nr.height / 2) - (totalSpan / 2) + (offsetIdx * portSpacing);
            }
            x = side === 'left' ? nr.left - cr.left : nr.right - cr.left;
        } else if (side === 'top' || side === 'bottom') {
            x = nr.left - cr.left + nr.width / 2;
            if (totalPorts && totalPorts > 1 && offsetIdx !== undefined) {
                var hSpacing = Math.min(22, (nr.width - 8) / totalPorts);
                var hSpan = hSpacing * (totalPorts - 1);
                x = nr.left - cr.left + (nr.width / 2) - (hSpan / 2) + (offsetIdx * hSpacing);
            }
            y = side === 'top' ? nr.top - cr.top : nr.bottom - cr.top;
        } else {
            x = nr.left - cr.left + nr.width / 2;
            y = nr.top - cr.top + nr.height / 2;
        }
        return { x: x, y: y };
    },

    getBestPorts(fromNodeId, toNodeId, edge) {
        // If edge has custom port overrides, use them
        if (edge && edge.fromSide && edge.toSide) {
            return { fromSide: edge.fromSide, toSide: edge.toSide };
        }
        var fc = this.getNodeCenter(fromNodeId);
        var tc = this.getNodeCenter(toNodeId);
        if (!fc || !tc) return null;
        if (tc.x > fc.x + 20)      return { fromSide: 'right', toSide: 'left' };
        else if (tc.x < fc.x - 20) return { fromSide: 'left',  toSide: 'right' };
        else                        return { fromSide: 'right', toSide: 'right' };
    },

    escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
};
