/**
 * DATA.JS - Data Model and State Management
 * Handles all application data and state
 */

const DataModel = {
    // Test columns configuration
    testColumns: [
        { id: 1, uid: 'test-01', name: 'Test 1', type: 'FAT', location: 'Norway, Egersund', workpack: '', startDate: '2026-02-04', endDate: '2026-06-04' },
        { id: 2, uid: 'test-02', name: 'Test 2', type: 'FIT', location: 'Norway, Ågotnes', workpack: '', startDate: '', endDate: '' }
    ],

    // Sections with equipment rows
    sections: [
        {
            id: 'main',
            name: 'Main Equipment',
            collapsed: false,
            rows: [
                { itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }
            ]
        },
        {
            id: 'tooling',
            name: 'Tooling Items',
            collapsed: false,
            rows: [
                { itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }
            ]
        },
        {
            id: 'auxiliary',
            name: 'Auxiliary',
            collapsed: false,
            rows: [
                { itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }
            ]
        }
    ],

    // Dropdown options
    testTypes: ['FAT', 'EFAT', 'FIT', 'M-SIT', 'SIT', 'SRT'],
    workpacks: ['WP03', 'WP04', 'WP05', 'WP06', 'WP07', 'WP09', 'WP10', 'WP11'],

    /**
     * LOCATIONS — single source of truth.
     * Format: "Country, City"
     * Add / remove / rename here and everything updates automatically:
     *   - Matrix dropdown, Flow node colors, Flow legend
     */
    locations: {
        'Norway, Egersund':    { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)', lat: 58.45, lng: 5.99 },
        'Norway, Ågotnes':     { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.08)',  border: 'rgba(6, 182, 212, 0.25)', lat: 60.37, lng: 5.01 },
        'Norway, Bergen':      { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)',  border: 'rgba(59, 130, 246, 0.25)', lat: 60.39, lng: 5.32 },
        'Norway, Oslo':        { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)',   border: 'rgba(34, 197, 94, 0.25)', lat: 59.91, lng: 10.75 },
        'India, Pune':         { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)',  border: 'rgba(251, 191, 36, 0.25)', lat: 18.52, lng: 73.86 },
        'Malaysia':            { color: '#e879f9', bg: 'rgba(232, 121, 249, 0.08)', border: 'rgba(232, 121, 249, 0.25)', lat: 3.14, lng: 101.69 },
        'Brazil':              { color: '#34d399', bg: 'rgba(52, 211, 153, 0.08)',  border: 'rgba(52, 211, 153, 0.25)', lat: -14.24, lng: -51.93 },
        'Digital Activity':    { color: '#cbd5e1', bg: 'rgba(203, 213, 225, 0.06)', border: 'rgba(203, 213, 225, 0.20)' },
        'Multidisciplinary':   { color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.08)', border: 'rgba(167, 139, 250, 0.25)' }
    },

    /** Helper — returns location names as a sorted array (for dropdowns) */
    getLocationNames() {
        return Object.keys(this.locations).sort(function(a, b) { return a.localeCompare(b); });
    },

    /** Helper — returns color config for a location */
    getLocationColor(name) {
        return this.locations[name] || null;
    },

    /** Helper — returns { lat, lng } for a location, or null */
    getLocationCoords(name) {
        var loc = this.locations[name];
        if (loc && loc.lat !== undefined && loc.lng !== undefined) {
            return { lat: loc.lat, lng: loc.lng };
        }
        return null;
    },

    // ID counter for new tests
    nextTestId: 3,

    // Current export test ID
    currentExportTestId: null,

    // Freeze state
    freezeEnabled: false,

    // Hidden activities (array of test IDs to hide from view)
    hiddenActivities: [],

    // Collapsed WP sub-groups within sections (runtime, not persisted)
    _collapsedWps: {},

    /** Check if an activity is visible */
    isActivityVisible(testId) {
        return !this.hiddenActivities.includes(testId);
    },

    /** Get visible test columns in order */
    getVisibleColumns() {
        return this.testColumns.filter(t => this.isActivityVisible(t.id));
    },

    /**
     * Get section by ID
     */
    getSection(sectionId) {
        return this.sections.find(s => s.id === sectionId);
    },

    /**
     * Get test by ID
     */
    getTest(testId) {
        return this.testColumns.find(t => t.id === testId);
    },

    /**
     * Get document number
     */
    getDocNo() {
        return document.getElementById('docNo')?.value || '';
    },

    /**
     * Set document number
     */
    setDocNo(value) {
        const el = document.getElementById('docNo');
        if (el) el.value = value;
    },

    /**
     * Get project name
     */
    getProjectName() {
        return document.getElementById('projectName')?.value || '';
    },

    /**
     * Set project name
     */
    setProjectName(value) {
        const el = document.getElementById('projectName');
        if (el) el.value = value;
    },

    /**
     * Get total number of columns (fixed + test + add button)
     */
    getTotalColumns() {
        return 7 + this.testColumns.length + 1; // 7 fixed + tests + add button
    },

    /**
     * Generate a unique test activity ID like test-03
     */
    generateUid() {
        const existing = new Set(this.testColumns.map(t => t.uid).filter(Boolean));
        let n = this.testColumns.length + 1;
        let uid;
        do {
            uid = `test-${String(n).padStart(2, '0')}`;
            n++;
        } while (existing.has(uid));
        return uid;
    },

    /**
     * Export all data as JSON object
     */
    exportData() {
        return {
            docNo: this.getDocNo(),
            projectName: this.getProjectName(),
            testColumns: this.testColumns,
            sections: this.sections,
            exportDate: new Date().toISOString()
        };
    },

    /**
     * Import data from JSON object
     */
    importData(data) {
        if (data.testColumns && data.sections) {
            this.setDocNo(data.docNo || '');
            this.setProjectName(data.projectName || '');
            this.testColumns = data.testColumns;
            this.sections = data.sections;
            
            // Update next ID
            const maxId = Math.max(...this.testColumns.map(t => t.id), 0);
            this.nextTestId = maxId + 1;

            // Backfill missing uid / workpack fields
            const usedUids = new Set(this.testColumns.map(t => t.uid).filter(Boolean));
            let uidCounter = this.testColumns.length + 1;
            this.testColumns.forEach(t => {
                if (!t.uid) {
                    let uid;
                    do { uid = `test-${String(uidCounter++).padStart(2, '0')}`; } while (usedUids.has(uid));
                    t.uid = uid;
                    usedUids.add(uid);
                }
                if (t.workpack === undefined) t.workpack = '';
            });
            
            return true;
        }
        return false;
    },

    /**
     * Reset to default state
     */
    reset() {
        this.testColumns = [
            { id: 1, uid: 'test-01', name: 'Test 1', type: 'FAT', location: 'Egersund', workpack: '', startDate: '', endDate: '' },
            { id: 2, uid: 'test-02', name: 'Test 2', type: 'FIT', location: 'Ågotnes', workpack: '', startDate: '', endDate: '' }
        ];
        this.sections = [
            {
                id: 'main',
                name: 'Main Equipment',
                collapsed: false,
                rows: [{ itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }]
            },
            {
                id: 'tooling',
                name: 'Tooling Items',
                collapsed: false,
                rows: [{ itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }]
            },
            {
                id: 'auxiliary',
                name: 'Auxiliary',
                collapsed: false,
                rows: [{ itemNo: '', description: '', partNo: '', qty: '', workpack: '', stakeholder: '', testQty: {} }]
            }
        ];
        this.nextTestId = 3;
        this.setDocNo('');
        this.setProjectName('');
    }
};
