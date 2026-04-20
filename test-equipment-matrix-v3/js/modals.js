/**
 * MODALS.JS - Modal Dialog Management
 * Handles opening, closing, and events for modals
 */

const ModalManager = {
    /**
     * Open a modal by ID
     */
    open(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    },

    /**
     * Close a modal by ID
     */
    close(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    },

    /**
     * Close all modals
     */
    closeAll() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('active');
        });
    },

    /**
     * Initialize modal event listeners
     */
    init() {
        // Close modal when clicking overlay
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });

        // Setup drag and drop zones
        this.setupDropZone('dropZone');
        this.setupDropZone('projectDropZone');

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAll();
            }
        });
    },

    /**
     * Setup drag and drop for a drop zone
     */
    setupDropZone(zoneId) {
        const zone = document.getElementById(zoneId);
        if (!zone) return;

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                if (zoneId === 'projectDropZone') {
                    ImportManager.processProjectFile(files[0]);
                } else {
                    ImportManager.processTableFile(files[0]);
                }
            }
        });
    }
};
