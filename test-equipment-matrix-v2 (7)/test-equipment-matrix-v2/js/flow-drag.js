/**
 * FLOW-DRAG.JS - Free Node Dragging (cross-lane)
 * Drag a node anywhere on the canvas. On release, the node
 * snaps into whichever lane column the cursor is over and
 * its activity type is updated accordingly (synced to matrix).
 */

const FlowDrag = {
    _active:     false,
    _nodeId:     null,
    _el:         null,
    _startX:     0,
    _startY:     0,
    _origRect:   null,
    _origType:   null,
    _origY:      0,
    _offsetX:    0,      // cursor offset from node left
    _offsetY:    0,      // cursor offset from node top

    onMouseDown(e, nodeId) {
        e.preventDefault();
        e.stopPropagation();

        const el = document.getElementById('node-' + nodeId);
        const node = FlowData.getNode(nodeId);
        if (!el || !node) return;

        this._active   = true;
        this._nodeId   = nodeId;
        this._el       = el;
        this._origRect = el.getBoundingClientRect();
        this._origType = node.type;
        this._origY    = node.y;
        this._startX   = e.clientX;
        this._startY   = e.clientY;

        // Store cursor offset relative to node top-left
        this._offsetX = e.clientX - this._origRect.left;
        this._offsetY = e.clientY - this._origRect.top;

        el.style.position = 'fixed';
        el.style.left     = this._origRect.left + 'px';
        el.style.top      = this._origRect.top  + 'px';
        el.style.width    = this._origRect.width + 'px';
        el.style.zIndex   = '500';
        el.classList.add('dragging');

        document.body.style.cursor     = 'grabbing';
        document.body.style.userSelect = 'none';

        document.querySelectorAll('.lane').forEach(function(l) { l.classList.add('drag-target'); });

        document.addEventListener('mousemove', this._onMove);
        document.addEventListener('mouseup',   this._onUp);
    },

    _onMove(e) {
        var self = FlowDrag;
        if (!self._active) return;

        // Position node so cursor stays at the same offset point
        self._el.style.left = (e.clientX - self._offsetX) + 'px';
        self._el.style.top  = (e.clientY - self._offsetY) + 'px';

        var targetType = self._laneUnderCursor(e.clientX, e.clientY);
        document.querySelectorAll('.lane').forEach(function(l) {
            l.classList.toggle('drag-hover', l.dataset.lane === targetType);
        });

        FlowEdges.render();
    },

    _onUp(e) {
        var self = FlowDrag;
        document.removeEventListener('mousemove', self._onMove);
        document.removeEventListener('mouseup',   self._onUp);
        if (!self._active) return;
        self._active = false;

        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
        document.querySelectorAll('.lane').forEach(function(l) {
            l.classList.remove('drag-target', 'drag-hover');
        });

        var targetType = self._laneUnderCursor(e.clientX, e.clientY);
        var node = FlowData.getNode(self._nodeId);
        if (!node) return;

        var typeChanged = targetType && targetType !== node.type;
        if (typeChanged) {
            node.type = targetType;
            FlowNodes.syncTypeToMatrix(self._nodeId, targetType);
        }

        var laneType = targetType || node.type;
        var laneBody = FlowLanes.getLaneBody(laneType);
        if (!laneBody) return;

        var bodyRect = laneBody.getBoundingClientRect();
        // Where the CENTER of the dragged node is in lane-body coordinates
        var nodeH = FlowNodes.NODE_HEIGHT;
        var dropTop = (e.clientY - self._offsetY) - bodyRect.top;
        var dropCenter = dropTop + nodeH / 2;

        // Get all OTHER visible nodes in this lane, sorted by Y
        var siblings = FlowData.getNodesForLane(laneType)
            .filter(function(n) {
                return n.id !== self._nodeId && DataModel.isActivityVisible(n.id);
            });
        siblings.sort(function(a, b) { return a.y - b.y; });

        // Find the insertion slot by comparing drop center to each node's center
        var minStep = FlowNodes.NODE_HEIGHT + FlowNodes.NODE_GAP;
        var insertIdx = siblings.length; // default: at the end

        for (var i = 0; i < siblings.length; i++) {
            var sibCenter = siblings[i].y + nodeH / 2;
            if (dropCenter < sibCenter) {
                insertIdx = i;
                break;
            }
        }

        // Calculate the Y for the dropped node to fit into the slot
        var newY;
        if (siblings.length === 0) {
            // Only node in lane
            newY = Math.max(0, Math.round(dropTop));
        } else if (insertIdx === 0) {
            // Insert before all others — place above the first sibling
            var firstY = siblings[0].y;
            newY = Math.max(0, Math.min(Math.round(dropTop), firstY - minStep));
        } else if (insertIdx === siblings.length) {
            // Insert after all others — place below the last sibling
            var lastY = siblings[siblings.length - 1].y;
            newY = Math.max(lastY + minStep, Math.round(dropTop));
        } else {
            // Insert between siblings[insertIdx-1] and siblings[insertIdx]
            var aboveY = siblings[insertIdx - 1].y;
            var belowY = siblings[insertIdx].y;
            var idealY = Math.round(dropTop);

            // Ensure minimum gap from node above
            newY = Math.max(aboveY + minStep, idealY);
        }

        node.y = Math.max(0, newY);

        // Resolve any remaining overlaps (push nodes below down)
        FlowNodes.resolveCollisions();
        FlowData.save();

        self._el.style.position = '';
        self._el.style.left     = '';
        self._el.style.top      = '';
        self._el.style.width    = '';
        self._el.style.zIndex   = '';
        self._el.classList.remove('dragging');
        self._el = null;

        if (typeChanged) {
            FlowLanes.render();
            FlowNodes.render();
        } else {
            FlowNodes.renderLane(node.type);
        }
        FlowEdges.render();
        if (typeof FlowApp !== 'undefined') FlowApp._applyWpFilter();
    },

    _laneUnderCursor(cx, cy) {
        var i, type, lane, r;
        for (i = 0; i < FlowData.laneTypes.length; i++) {
            type = FlowData.laneTypes[i];
            lane = document.getElementById('lane-' + type);
            if (!lane) continue;
            r = lane.getBoundingClientRect();
            if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
                return type;
            }
        }
        var closest = null, minDist = Infinity;
        for (i = 0; i < FlowData.laneTypes.length; i++) {
            type = FlowData.laneTypes[i];
            lane = document.getElementById('lane-' + type);
            if (!lane) continue;
            r = lane.getBoundingClientRect();
            var centerX = (r.left + r.right) / 2;
            var dist = Math.abs(cx - centerX);
            if (dist < minDist) { minDist = dist; closest = type; }
        }
        return closest;
    }
};
