/**
 * FLOW-DATA.JS - Flow View Data Model
 * Manages nodes (activities), edges (connections), and positions
 */

const FlowData = {
    // Lane definitions (order matters)
    laneTypes: ['FAT', 'EFAT', 'FIT', 'M-SIT', 'SIT', 'SRT'],

    // Color map per type
    colors: {
        'FAT':   { primary: '#00d4ff', bg: 'rgba(0, 212, 255, 0.12)' },
        'FIT':   { primary: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
        'EFAT':  { primary: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
        'SIT':   { primary: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
        'M-SIT': { primary: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
        'SRT':   { primary: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' }
    },

    /**
     * Location colors — delegates to DataModel (single source of truth).
     * Returns the color config object for a location name, or null.
     */
    getLocationColor(name) {
        if (typeof DataModel !== 'undefined') {
            return DataModel.getLocationColor(name);
        }
        return null;
    },

    // Nodes: each represents an activity / test
    // { id, name, type, location, startDate, endDate, y (position within lane) }
    nodes: [],

    // Edges: connections between nodes
    // { id, fromNodeId, toNodeId, label }
    edges: [],

    // Node descriptions: { nodeId: "line1\nline2\nline3" }
    descriptions: {},

    // Milestones on the timeline: { id, laneType, x (0-100%), text }
    milestones: [],
    hiddenLanes: {},
    lockedHiddenLanes: {},
    inactiveNodes: {},  // { nodeId: true } — visually greyed out, not needed
    attachments: {},    // { nodeId: [{name, type, size, data, addedAt}] }
    nextMilestoneId: 1,

    // ID counters
    nextNodeId: 1,
    nextEdgeId: 1,

    // Project metadata
    docNo: '',
    projectName: '',

    /**
     * Load nodes from matrix testColumns data (from localStorage)
     */
    loadFromMatrix(matrixData) {
        if (!matrixData || !matrixData.testColumns) return false;

        this.docNo = matrixData.docNo || '';
        this.projectName = matrixData.projectName || '';

        // Merge matrix activities with existing node positions
        const existingPositions = {};
        this.nodes.forEach(n => {
            existingPositions[n.id] = n.y;
        });

        this.nodes = matrixData.testColumns.map((test, index) => ({
            id: test.id,
            name: test.name,
            subtitle: test.subtitle || '',
            type: test.type,
            location: test.location || '',
            startDate: test.startDate || '',
            endDate: test.endDate || '',
            y: existingPositions[test.id] !== undefined ? existingPositions[test.id] : 20 + index * 100
        }));

        // Update ID counter
        const maxId = Math.max(...this.nodes.map(n => n.id), 0);
        this.nextNodeId = maxId + 1;

        return true;
    },

    /**
     * Get nodes for a specific lane type
     */
    getNodesForLane(type) {
        return this.nodes.filter(n => n.type === type).sort((a, b) => a.y - b.y);
    },

    /**
     * Get node by ID
     */
    getNode(id) {
        return this.nodes.find(n => n.id === id);
    },

    /**
     * Update node position
     */
    updateNodePosition(id, y) {
        const node = this.getNode(id);
        if (node) {
            node.y = Math.max(0, y);
            this.save();
        }
    },

    /**
     * Add a new edge
     */
    addEdge(fromNodeId, toNodeId, label = '') {
        // Check for duplicate
        const exists = this.edges.some(e =>
            (e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) ||
            (e.fromNodeId === toNodeId && e.toNodeId === fromNodeId)
        );
        if (exists || fromNodeId === toNodeId) return null;

        const edge = {
            id: this.nextEdgeId++,
            fromNodeId,
            toNodeId,
            label
        };
        this.edges.push(edge);
        this.save();
        return edge;
    },

    /**
     * Remove an edge
     */
    removeEdge(edgeId) {
        this.edges = this.edges.filter(e => e.id !== edgeId);
        this.save();
    },

    /**
     * Update edge label
     */
    updateEdgeLabel(edgeId, label) {
        const edge = this.edges.find(e => e.id === edgeId);
        if (edge) {
            edge.label = label;
            this.save();
        }
    },

    /**
     * Get edge by ID
     */
    getEdge(edgeId) {
        return this.edges.find(e => e.id === edgeId);
    },

    /**
     * Get all edges connected to a node
     */
    getEdgesForNode(nodeId) {
        return this.edges.filter(e => e.fromNodeId === nodeId || e.toNodeId === nodeId);
    },

    /**
     * Save flow-specific data (positions + edges) via StorageManager
     */
    save() {
        if (typeof StorageManager === 'undefined') return;

        const positions = {};
        this.nodes.forEach(n => { positions[n.id] = n.y; });

        StorageManager.save({
            flow: {
                positions,
                edges: this.edges,
                nextEdgeId: this.nextEdgeId,
                descriptions: this.descriptions,
                milestones: this.milestones,
                nextMilestoneId: this.nextMilestoneId,
                hiddenLanes: this.hiddenLanes || {},
                lockedHiddenLanes: this.lockedHiddenLanes || {},
                inactiveNodes: this.inactiveNodes || {},
                attachments: this.attachments || {}
            }
        });
    },

    /**
     * Load flow-specific data (positions, edges) from StorageManager
     */
    load() {
        if (typeof StorageManager === 'undefined') return false;

        const f = StorageManager.loadFlow();
        if (!f) return false;

        // Restore positions into existing nodes
        if (f.positions) {
            this.nodes.forEach(n => {
                if (f.positions[n.id] !== undefined) {
                    n.y = f.positions[n.id];
                }
            });
        }
        if (f.edges)           this.edges           = f.edges;
        if (f.nextEdgeId)      this.nextEdgeId      = f.nextEdgeId;
        if (f.descriptions)    this.descriptions    = f.descriptions;
        if (f.milestones)      this.milestones      = f.milestones;
        if (f.nextMilestoneId) this.nextMilestoneId = f.nextMilestoneId;
        this.hiddenLanes = f.hiddenLanes || {};
        this.lockedHiddenLanes = f.lockedHiddenLanes || {};
        this.attachments = f.attachments || {};
        // Ensure locked lanes are hidden
        for (var key in this.lockedHiddenLanes) {
            if (this.lockedHiddenLanes[key]) this.hiddenLanes[key] = true;
        }
        return true;
    },

    /**
     * Export full state as JSON
     */
    exportData() {
        return {
            docNo: this.docNo,
            projectName: this.projectName,
            nodes: this.nodes,
            edges: this.edges,
            descriptions: this.descriptions,
            milestones: this.milestones,
            exportDate: new Date().toISOString()
        };
    },

    /**
     * Import full state from JSON
     */
    importData(data) {
        if (!data.nodes) return false;
        this.docNo = data.docNo || '';
        this.projectName = data.projectName || '';
        this.nodes = data.nodes;
        this.edges = data.edges || [];
        this.descriptions = data.descriptions || {};
        this.milestones = data.milestones || [];
        this.nextNodeId = Math.max(...this.nodes.map(n => n.id), 0) + 1;
        this.nextEdgeId = Math.max(...this.edges.map(e => e.id), 0) + 1;
        this.nextMilestoneId = this.milestones.length > 0
            ? Math.max(...this.milestones.map(m => m.id), 0) + 1 : 1;
        this.save();
        return true;
    },

    /**
     * Clear all edges
     */
    clearEdges() {
        this.edges = [];
        this.nextEdgeId = 1;
        this.save();
    }
};
