/**
 * NAV.JS - Shared Navigation
 * Handles tab rendering only. Storage is handled by StorageManager.
 */

const Nav = {
    /**
     * Render the navigation tabs into a target element
     * @param {string} activePage - 'matrix', 'flow', or 'gantt-chart'
     */
    render(activePage) {
        const container = document.getElementById('navTabs');
        if (!container) return;

        container.innerHTML = `
            <a href="index.html" class="nav-tab ${activePage === 'matrix' ? 'active' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"/>
                    <rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/>
                </svg>
                Matrix
            </a>
            <a href="flow.html" class="nav-tab ${activePage === 'flow' ? 'active' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="5" cy="6" r="3"/>
                    <circle cx="19" cy="6" r="3"/>
                    <circle cx="12" cy="18" r="3"/>
                    <line x1="7.5" y1="7.5" x2="10.5" y2="16.5"/>
                    <line x1="16.5" y1="7.5" x2="13.5" y2="16.5"/>
                </svg>
                Activity Flow
            </a>
            <a href="gantt-chart.html" class="nav-tab ${activePage === 'gantt-chart' ? 'active' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="14" height="3" rx="1"/>
                    <rect x="5" y="10" width="16" height="3" rx="1"/>
                    <rect x="7" y="16" width="10" height="3" rx="1"/>
                    <line x1="3" y1="2" x2="3" y2="22"/>
                </svg>
                Gantt Chart
            </a>
        `;
    }
};
