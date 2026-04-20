/**
 * SCROLL-CHAIN.JS — Outer-first scroll chaining
 *
 * Default browser behavior: when the mouse is over an inner scrollable element,
 * wheel events scroll that element first. We want the opposite — the outer page
 * must be fully scrolled (up or down) before the inner table takes over. That
 * way, by the time the user is scrolling the inner table vertically, the outer
 * page is pinned at its bottom and the table's horizontal scrollbar (at its
 * bottom edge) is always in the viewport.
 *
 * Only wheel events are intercepted. Clicking / dragging the scrollbar thumbs
 * or using keyboard navigation still behaves natively.
 */
(function () {
    function init() {
        var inner = document.getElementById('tableScroll');
        if (!inner) return;

        var outer = document.scrollingElement || document.documentElement;

        inner.addEventListener('wheel', function (e) {
            // Vertical wheel only — leave horizontal scrolling alone
            if (e.deltaY === 0) return;

            var outerMax = outer.scrollHeight - outer.clientHeight;
            var outerTop = outer.scrollTop;
            var innerTop = inner.scrollTop;
            var innerMax = inner.scrollHeight - inner.clientHeight;

            // Small tolerance so floating-point rounding doesn't trap the scroll
            var EPS = 1;

            if (e.deltaY > 0) {
                // Scrolling DOWN: outer must reach its bottom before inner starts.
                if (outerTop < outerMax - EPS) {
                    e.preventDefault();
                    outer.scrollTop = Math.min(outerMax, outerTop + e.deltaY);
                }
                // else: outer is at bottom → let default bubble, inner scrolls
            } else {
                // Scrolling UP: inner must reach its top before outer starts.
                if (innerTop > EPS) {
                    // Let inner scroll up natively
                    return;
                }
                if (outerTop > EPS) {
                    e.preventDefault();
                    outer.scrollTop = Math.max(0, outerTop + e.deltaY);
                }
            }
        }, { passive: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
