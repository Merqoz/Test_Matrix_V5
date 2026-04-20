/**
 * FLOW-LANES.JS - Lane / Column Rendering
 * Renders vertical activity lanes on the canvas with hide/show toggle.
 * Hidden state is persisted in FlowData.hiddenLanes.
 */

const FlowLanes = {

    isLaneVisible(type) {
        return !FlowData.hiddenLanes[type];
    },

    toggleLane(type) {
        FlowData.hiddenLanes[type] = !FlowData.hiddenLanes[type];
        if (!FlowData.hiddenLanes[type]) delete FlowData.hiddenLanes[type];
        FlowData.save();
        this.render();
        FlowNodes.render();
        FlowEdges.render();
        if (typeof FlowApp !== 'undefined') {
            FlowApp._buildLocationLegend();
            FlowApp._populateWpFilter();
            FlowApp._applyWpFilter();
        }
    },

    getVisibleLaneTypes() {
        var self = this;
        return FlowData.laneTypes.filter(function(t) { return self.isLaneVisible(t); });
    },

    /**
     * Render all lanes into the canvas
     */
    render() {
        var canvas = document.getElementById('flowCanvas');
        if (!canvas) return;
        var self = this;

        var html = '<div class="lanes-container" id="lanesContainer">';

        FlowData.laneTypes.forEach(function(type) {
            if (!self.isLaneVisible(type)) {
                // Collapsed lane — thin clickable strip
                html += '<div class="lane lane-collapsed lane-' + type + '" data-lane="' + type + '" id="lane-' + type + '"' +
                    ' onclick="FlowLanes.toggleLane(\'' + type + '\')" title="Show ' + type + ' lane">' +
                    '<div class="lane-collapsed-label">' + type + '</div>' +
                    '</div>';
                return;
            }

            var nodes = FlowData.getNodesForLane(type);
            html += '<div class="lane lane-' + type + '" data-lane="' + type + '" id="lane-' + type + '">' +
                '<div class="lane-bg"></div>' +
                '<div class="lane-header">' +
                    '<button class="lane-toggle" onclick="event.stopPropagation(); FlowLanes.toggleLane(\'' + type + '\')" title="Hide ' + type + ' lane">' +
                        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
                            '<circle cx="12" cy="12" r="3"/>' +
                        '</svg>' +
                    '</button>' +
                    type +
                    '<span class="lane-count">(' + nodes.length + ')</span>' +
                '</div>' +
                '<div class="lane-body" id="laneBody-' + type + '"></div>' +
            '</div>';
        });

        html += '</div>';
        html += '<svg class="edge-layer" id="edgeLayer"></svg>';
        canvas.innerHTML = html;
    },

    getLaneRect(type) {
        var el = document.getElementById('laneBody-' + type);
        return el ? el.getBoundingClientRect() : null;
    },

    getLaneBody(type) {
        return document.getElementById('laneBody-' + type);
    }
};
