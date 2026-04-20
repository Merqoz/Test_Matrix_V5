/**
 * RESIZE.JS - Column Resize Functionality
 * Handles resizing of table columns by dragging
 */

const ResizeManager = {
    isResizing: false,
    currentCol: null,
    startX: 0,
    startWidth: 0,
    colIndex: -1,
    STORAGE_KEY: 'tem_col_widths',

    // Column configuration: class name -> index for CSS variables
    columnConfig: [
        { class: 'col-delete', index: 0, minWidth: 40, maxWidth: 60 },
        { class: 'col-item', index: 1, minWidth: 50, maxWidth: 150 },
        { class: 'col-desc', index: 2, minWidth: 100, maxWidth: 500 },
        { class: 'col-partno', index: 3, minWidth: 60, maxWidth: 150 },
        { class: 'col-melqty', index: 4, minWidth: 45, maxWidth: 100 },
        { class: 'col-qty', index: 5, minWidth: 40, maxWidth: 80 },
        { class: 'col-workpack', index: 6, minWidth: 60, maxWidth: 150 },
        { class: 'col-stakeholder', index: 7, minWidth: 70, maxWidth: 180 }
    ],

    init() {
        this.addResizeHandles();
        this._loadSavedWidths();
        this.initColumnWidths();

        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    },

    /** Load saved column widths from localStorage */
    _loadSavedWidths() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return;
            this._savedWidths = JSON.parse(raw);
        } catch (e) {
            this._savedWidths = null;
        }
    },

    /** Save current column widths to localStorage */
    _saveWidths() {
        const table = document.getElementById('matrixTable');
        if (!table) return;
        const widths = {};
        this.columnConfig.forEach(config => {
            const val = table.style.getPropertyValue(`--col-${config.index}-width`);
            if (val) widths[config.index] = val;
        });
        this._savedWidths = widths;
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(widths));
        } catch (e) {}
    },

    addResizeHandles() {
        const headerRow = document.getElementById('tableHead');
        if (!headerRow) return;

        setTimeout(() => {
            const headers = headerRow.querySelectorAll('th');
            headers.forEach((th, index) => {
                const config = this.columnConfig.find(c => th.classList.contains(c.class));
                if (config && config.index > 0) {
                    this.addHandle(th, config);
                }
            });
        }, 100);
    },

    addHandle(th, config) {
        const existing = th.querySelector('.resize-handle');
        if (existing) existing.remove();

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.dataset.colIndex = config.index;
        handle.dataset.colClass = config.class;

        handle.addEventListener('mousedown', (e) => this.onMouseDown(e, th, config));
        th.appendChild(handle);
    },

    /** Initialize column widths — apply saved widths first, then measure */
    initColumnWidths() {
        const table = document.getElementById('matrixTable');
        if (!table) return;
        const headerRow = document.querySelector('#tableHead tr');
        if (!headerRow) return;

        this.columnConfig.forEach((config) => {
            // Apply saved width if available
            if (this._savedWidths && this._savedWidths[config.index]) {
                const saved = this._savedWidths[config.index];
                table.style.setProperty(`--col-${config.index}-width`, saved);
                // Also set inline styles on all cells
                const px = parseInt(saved);
                if (!isNaN(px)) {
                    this.updateColumnWidth(config.class, px);
                }
            } else {
                const th = headerRow.querySelector(`.${config.class}`);
                if (th) {
                    const width = th.offsetWidth;
                    table.style.setProperty(`--col-${config.index}-width`, `${width}px`);
                }
            }
        });
    },

    updateFreezePositions() {
        const table = document.getElementById('matrixTable');
        if (!table) return;
        const headerRow = document.querySelector('#tableHead tr');
        if (!headerRow) return;

        this.columnConfig.forEach((config) => {
            // Prefer saved width over measured
            if (this._savedWidths && this._savedWidths[config.index]) {
                table.style.setProperty(`--col-${config.index}-width`, this._savedWidths[config.index]);
            } else {
                const th = headerRow.querySelector(`.${config.class}`);
                if (th) {
                    const width = th.offsetWidth;
                    table.style.setProperty(`--col-${config.index}-width`, `${width}px`);
                }
            }
        });
    },

    onMouseDown(e, th, config) {
        e.preventDefault();
        e.stopPropagation();

        this.isResizing = true;
        this.currentCol = th;
        this.startX = e.pageX;
        this.startWidth = th.offsetWidth;
        this.colIndex = config.index;
        this.colConfig = config;

        const table = document.getElementById('matrixTable');
        if (table) table.classList.add('resizing');
        const handle = th.querySelector('.resize-handle');
        if (handle) handle.classList.add('resizing');
    },

    onMouseMove(e) {
        if (!this.isResizing) return;

        const diff = e.pageX - this.startX;
        let newWidth = this.startWidth + diff;
        newWidth = Math.max(this.colConfig.minWidth, newWidth);
        newWidth = Math.min(this.colConfig.maxWidth, newWidth);

        this.currentCol.style.width = `${newWidth}px`;
        this.currentCol.style.minWidth = `${newWidth}px`;
        this.updateColumnWidth(this.colConfig.class, newWidth);

        const table = document.getElementById('matrixTable');
        if (table) {
            table.style.setProperty(`--col-${this.colIndex}-width`, `${newWidth}px`);
        }
    },

    updateColumnWidth(colClass, width) {
        const cells = document.querySelectorAll(`.${colClass}`);
        cells.forEach(cell => {
            cell.style.width = `${width}px`;
            cell.style.minWidth = `${width}px`;
        });
    },

    onMouseUp(e) {
        if (!this.isResizing) return;
        this.isResizing = false;

        const table = document.getElementById('matrixTable');
        if (table) table.classList.remove('resizing');
        if (this.currentCol) {
            const handle = this.currentCol.querySelector('.resize-handle');
            if (handle) handle.classList.remove('resizing');
        }

        this.updateFreezePositions();
        // Persist column widths
        this._saveWidths();

        this.currentCol = null;
        this.colIndex = -1;
        this.colConfig = null;
    },

    refresh() {
        this.addResizeHandles();
        this.initColumnWidths();
        this.updateFreezePositions();
    }
};
