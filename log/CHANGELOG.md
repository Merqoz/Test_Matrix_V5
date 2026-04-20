# Test Equipment Matrix — Changelog

All notable changes to this project are documented here.  
**Format:** `[version] — YYYY-MM-DD`

---

## [2.9.0] — 2026-04-20

### Fixed — Doc Nr. Missing on Flow Nodes
- Flow node metadata now shows the `Doc Nr.` field entered in `index.html`, placed right after the start date
- Root cause: `FlowApp.loadData()` and the sync-refresh path both rebuilt `FlowData.nodes` from `testColumns` without copying the `subtitle` property — so `node.subtitle` was always `undefined` and the existing render code (`flow-nodes.js` line 162) silently dropped it
- Fix: add `subtitle: test.subtitle || ''` to both node-construction paths in `flow-app.js` (lines 104-116 and 469-479)

### Improved — Edge Endpoint Drag Interaction
- **Snap-to-port preview:** while dragging an edge endpoint, the live preview line now snaps to the nearest port of the node under the cursor (not just the cursor position) — the curve bends naturally into the target side
- **Anchor indication:** the non-dragged endpoint is now visually anchored (dashed dim outline) so it's clear which end stays fixed
- **Escape to cancel:** pressing Esc mid-drag cancels without applying the change and restores the original edge
- **Port highlight on target:** the specific port indicator (left/right/top/bottom) that will be chosen on release is now highlighted during hover
- **Missing CSS fix:** `.edge-drag-preview` had light-theme styling but no dark-theme rules — the preview line is now properly visible in both themes, with a flowing dash animation that turns solid when snapped to a target
- **Larger, more forgiving drop zone:** node hit-area expanded from 12px to 18px padding; pulsing glow on drop-target nodes
- **Bigger handle hit target:** invisible 16px-radius grab ring around each endpoint dot — easier to grab on touchpads/small handles
- **No-op on miss:** releasing outside any node now cleanly restores the original edge instead of guessing a side

### Improved — PDF & PPTX "Connections & Equipment Transfers"
- Last page of the PDF export (and matching PPTX slide) now filters edges the same way the flow diagram does — only edges whose **both endpoints are visible** are listed
- Matches the visibility logic already used by the "Test Activity Summary" page: respects `DataModel.hiddenActivities` AND `FlowData.hiddenLanes`
- Summary line above the table shows how many connections are listed, and how many are hidden because an endpoint is hidden (e.g. `12 connections shown (3 hidden — endpoint not visible)`)
- Affects `FlowExport.exportPDF()` and `FlowExport.exportPPTX()`

---

## [2.8.0] — 2026-04-10

### Added — File Attachments on Flow Nodes
- New "Attachments" section in the flow.html activity detail popup (below Equipment Items)
- Paperclip "Add" button opens a file picker — any file type, multiple files, up to 10 MB each
- Files stored as base64 data URIs in `FlowData.attachments`, persisted via StorageManager
- Click a filename to open the file directly in a new browser tab
- × button removes individual attachments
- File-type icons: 📄 PDF, 🖼 image, 📊 spreadsheet, 📝 document, 📦 archive, 📎 other

### Changed — Sticky Scrollbar & Header (index.html)
- Horizontal scrollbar now stays visible within the viewport (no more scrolling to page bottom)
- `.table-scroll` has `max-height: calc(100vh - 180px)` with `overflow: auto`
- Table header rows are `position: sticky; top: 0` — pinned while scrolling vertically
- Filter row sticks below the main header at `top: 36px`
- Freeze mode columns retain higher z-index (30) and work correctly on top of sticky headers
- Custom scrollbar styling matches the dark theme

### Changed — Location Colors Sync to Gantt Chart
- Gantt chart `_onCrossTabChange` now reloads `customLocations` from prefs when index.html updates colors
- Bars, map nodes, transport paths, legend dots all use `DataModel.locations[name].color` as single source of truth

---

## [2.7.0] — 2026-04-10

### Fixed — Edge Port Indicators Clickable
- Port indicator dots on flow.html nodes now have `pointer-events: all` and click handlers
- When an edge is selected, click any port dot (left/right/top/bottom) to snap the endpoint — no drag needed
- Dots highlight on hover with cyan glow

### Changed — Bidirectional Location & Date Sync (index.html ↔ gantt-chart.html)
- `TestManager.updateLocation()` and `updateDate()` now call `_syncToGanttBars()` to write changes to gantt bar storage
- New `_syncToGanttBars(testId, patch)` scans gantt bars for matching `testId` and updates location/startDate/endDate
- Gantt chart has new `_onCrossTabChange` listener — reloads test columns + gantt bars from storage and re-renders when matrix page writes
- Flow shortcut bars now carry `testId` for sync

---

## [2.6.0] — 2026-04-10

### Added — Edge Line Repositioning (flow.html)
- Click an edge to select it — line turns cyan, draggable circle handles appear at both endpoints
- Port indicator dots shown on all 4 sides (left, right, top, bottom) of connected nodes
- Drag a handle toward a different side — edge snaps to nearest port on release
- Custom `fromSide`/`toSide` saved per edge, persists across page reloads
- Right-click → "Reset Line Ports" clears custom routing
- `buildBezierPath()` and `addArrowhead()` handle all 16 side combinations
- `getPortPosition()` extended for top/bottom sides
- `getBestPorts()` respects stored overrides

---

## [2.5.0] — 2026-04-10

### Fixed — Locked Filters Highlight on Flow Page Revisit
- `_renderOnce()` now calls `_applyWpFilter()` after `_populateWpFilter()`
- Locked WP filters highlight nodes immediately when navigating back to flow.html

### Changed — Separated Locked Filters Between Pages
- index.html uses `matrixLockedTypeFilters` / `matrixLockedWpFilters` storage keys
- flow.html uses `flowLockedWpFilters`
- Backwards-compatible migration from old shared keys
- Lock context menu text updated to "keep on refresh"

### Fixed — Scroll Jump When Adding Test Activity (index.html)
- Removed forced `scrollLeft = scrollWidth` from `TestManager.add()`
- New column now respects current filter state via `FilterManager.apply()`

---

## [2.4.0] — 2026-04-10

### Fixed — Gantt Bar Dragging After Assigning Dates
- Rewrote `_rebuildTransfers()` — no longer forcibly rewrites bar dates
- Bars can freely overlap; transfers only inserted when there's a genuine gap between consecutive bars at different locations
- Drag, resize, and modal-set dates are always respected

---

## [2.3.0] — 2026-04-10

### Changed — Bar Right-Click: "Change Location" Popup
- Replaced inline location list in context menu with a dedicated "Change Location" button
- Opens a centered modal popup showing all locations with color dots and checkmark on active
- Context menu is now cleaner: Edit Dates, Change Location, Test Activities, Delete Bar

### Changed — Map Location Node Click → Equipment + Test Details
- **Simple view (SVG):** Left-click a location circle shows rich tooltip with test activities at location, equipment items with their linked tests nested underneath
- **World view (Leaflet):** Left-click marker opens popup with same rich content, dark-themed
- Tooltip is interactive, scrollable, auto-hides after 12s, dismisses on click outside

---

## [2.2.0] — 2026-04-10

### Added — Test Activities Without Dates Can Be Added to Gantt Chart
- Tests without dates/location now open the Add modal pre-linked (purple badge shows test name)
- Context menu shows "(assign dates)" in amber for tests lacking dates
- New `_openAddModal(sIdx, rIdx, testId, testObj)` signature with test pre-fill

### Changed — Bidirectional Test Data Sync
- `_syncTestDates` replaced with `_syncTestData(testId, startDate, endDate, location)` — syncs location too
- All bar actions (drag, modal save, context menu location change) sync back to DataModel
- Cross-tab sync via `StorageManager.onChange`

### Fixed — Timeline Slider Alignment
- Slider control restructured into two-column layout matching gantt's 220px label column
- Slider track starts/ends exactly where bars area does

---

## [2.1.0] — 2026-04-10

### Fixed — Gantt Timeline Indicator Alignment
- Header indicator uses pixel-based positioning computed from `gcGanttRows.clientWidth`
- Accounts for scrollbar width difference between header and body
- Resize listener keeps both indicators in sync

### Changed — Bar Right-Click Shows Only Overlapping Test Activities
- Context menu filters linked tests by date overlap with the clicked bar
- Shows bar date range in section header, highlights same-location tests in cyan

### Verified — JSON + CSV Storage Completeness
- Confirmed all data (matrix, flow edges, positions, descriptions, milestones, inactive nodes, gantt bars, map positions, custom locations) round-trips through both JSON and CSV export/import

---

## [2.0.0] — 2026-04-10

### Added — Gantt Chart Timeline Indicator in Header
- Blue vertical line now extends through the header area (month labels + milestone strip)
- Separate `gcTimeIndicatorHead` element in `gc-gantt-head-right`
- Both indicators update simultaneously from `_updateTimeIndicator()`
