/**
 * SCROLL-INDICATOR.JS - Fixed Horizontal Scrollbar at Bottom Right
 * Shows a persistent horizontal scrollbar indicator at the bottom right corner
 */

const ScrollIndicator = {
    _indicator: null,
    _thumb: null,
    _scrollEl: null,

    /**
     * Initialize the scroll indicator
     */
    init(scrollElement) {
        this._scrollEl = scrollElement;
        
        // Create indicator element if it doesn't exist
        if (!this._indicator) {
            this._indicator = document.createElement('div');
            this._indicator.className = 'scroll-indicator';
            this._indicator.id = 'scrollIndicator';
            
            this._thumb = document.createElement('div');
            this._thumb.className = 'scroll-indicator-thumb';
            
            this._indicator.appendChild(this._thumb);
            document.body.appendChild(this._indicator);
        }

        if (!this._scrollEl) return;

        // Listen to scroll events
        this._scrollEl.addEventListener('scroll', () => this.update());
        window.addEventListener('resize', () => this.update());

        // Initial update
        this.update();
    },

    /**
     * Update the scroll indicator position and width
     */
    update() {
        if (!this._scrollEl || !this._indicator || !this._thumb) return;

        const scrollWidth = this._scrollEl.scrollWidth;
        const clientWidth = this._scrollEl.clientWidth;
        const scrollLeft = this._scrollEl.scrollLeft;

        // If content fits in view, hide indicator
        if (scrollWidth <= clientWidth) {
            this._indicator.style.display = 'none';
            return;
        }

        this._indicator.style.display = 'block';

        // Calculate indicator dimensions
        const indicatorWidth = Math.max(50, (clientWidth / scrollWidth) * window.innerWidth);
        const indicatorLeft = (scrollLeft / scrollWidth) * (window.innerWidth - indicatorWidth);

        // Apply styles
        this._indicator.style.width = indicatorWidth + 'px';
        this._indicator.style.left = indicatorLeft + 'px';
        this._thumb.style.width = '100%';

        // Show indicator briefly on scroll
        this._indicator.classList.add('visible');
        
        // Hide after scroll stops (only if not actively scrolling)
        if (this._hideTimer) clearTimeout(this._hideTimer);
        this._hideTimer = setTimeout(() => {
            this._indicator.classList.remove('visible');
        }, 1500);
    },

    /**
     * Show the scroll indicator
     */
    show() {
        if (this._indicator) {
            this._indicator.style.display = 'block';
            this._indicator.classList.add('visible');
        }
    },

    /**
     * Hide the scroll indicator
     */
    hide() {
        if (this._indicator) {
            this._indicator.classList.remove('visible');
        }
    },

    _hideTimer: null
};
