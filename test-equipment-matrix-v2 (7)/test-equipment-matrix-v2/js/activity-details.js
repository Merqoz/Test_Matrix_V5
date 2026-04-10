/**
 * ACTIVITY-DETAILS.JS — Activity detail modal for index.html
 * Opens a modal showing activity overview, notes, and equipment list.
 * Shares data with FlowDetails via StorageManager (flow descriptions).
 */

const ActivityDetails = {

    _activeTestId: null,
    _initialized: false,

    _init() {
        if (this._initialized) return;
        this._initialized = true;

        // Inject modal HTML into the page
        var overlay = document.createElement('div');
        overlay.id = 'activityDetailOverlay';
        overlay.className = 'ad-overlay';
        overlay.innerHTML =
            '<div class="ad-modal">' +
                '<div class="ad-header">' +
                    '<h3 id="adTitle"></h3>' +
                    '<div class="ad-meta" id="adMeta"></div>' +
                '</div>' +
                '<div class="ad-body">' +
                    '<div class="ad-editors">' +
                        '<div class="ad-section-label">Overview</div>' +
                        '<div class="ad-toolbar" id="adOverviewToolbar">' +
                            '<button class="wysiwyg-btn" data-cmd="bold" title="Bold"><b>B</b></button>' +
                            '<button class="wysiwyg-btn" data-cmd="italic" title="Italic"><i>I</i></button>' +
                            '<button class="wysiwyg-btn" data-cmd="underline" title="Underline"><u>U</u></button>' +
                            '<button class="wysiwyg-btn" data-cmd="insertUnorderedList" title="Bullet list">☰</button>' +
                        '</div>' +
                        '<div class="ad-editor" id="adOverview" contenteditable="true"></div>' +
                        '<div class="ad-section-label">Scope &amp; Notes</div>' +
                        '<div class="ad-toolbar" id="adNotesToolbar">' +
                            '<button class="wysiwyg-btn" data-cmd="bold" title="Bold"><b>B</b></button>' +
                            '<button class="wysiwyg-btn" data-cmd="italic" title="Italic"><i>I</i></button>' +
                            '<button class="wysiwyg-btn" data-cmd="underline" title="Underline"><u>U</u></button>' +
                            '<button class="wysiwyg-btn" data-cmd="insertUnorderedList" title="Bullet list">☰</button>' +
                            '<button class="wysiwyg-btn" data-cmd="indent" title="Indent">→</button>' +
                            '<button class="wysiwyg-btn" data-cmd="outdent" title="Outdent">←</button>' +
                        '</div>' +
                        '<div class="ad-editor ad-editor-notes" id="adNotes" contenteditable="true"></div>' +
                    '</div>' +
                    '<div class="ad-equipment">' +
                        '<div class="ad-section-label">Equipment</div>' +
                        '<div id="adEquipmentList"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="ad-actions">' +
                    '<button class="btn-cancel" onclick="ActivityDetails.close()">Cancel</button>' +
                    '<button class="btn-save" onclick="ActivityDetails.save()">Save</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        // Close on overlay click
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) ActivityDetails.close();
        });
    },

    open(testId) {
        this._init();
        this._activeTestId = testId;

        var test = DataModel.getTest(testId);
        if (!test) return;

        // Title and meta
        document.getElementById('adTitle').textContent = test.name;
        var meta = [];
        if (test.type) meta.push(test.type);
        if (test.location) meta.push(test.location);
        if (test.workpack) meta.push(test.workpack);
        if (test.uid) meta.push('\uD83C\uDFF7 ' + test.uid);
        if (test.startDate) meta.push('\uD83D\uDCC5 ' + test.startDate);
        if (test.endDate) meta.push('\u2192 ' + test.endDate);
        document.getElementById('adMeta').textContent = meta.join('  \u2022  ');

        // Load descriptions from flow storage
        var desc = this._loadDescription(testId);
        document.getElementById('adOverview').innerHTML = desc.overview || '';
        document.getElementById('adNotes').innerHTML = desc.bullets || '';

        // Wire toolbars
        this._wireToolbar('adOverviewToolbar', 'adOverview');
        this._wireToolbar('adNotesToolbar', 'adNotes');

        // Equipment list
        this._renderEquipment(testId);

        // Show
        document.getElementById('activityDetailOverlay').classList.add('active');
    },

    _loadDescription(testId) {
        var f = StorageManager.loadFlow();
        if (!f || !f.descriptions) return {};
        var desc = f.descriptions[testId];
        if (!desc) return {};
        if (typeof desc === 'string') return { overview: desc, bullets: '' };
        return desc;
    },

    _wireToolbar(toolbarId, editorId) {
        var toolbar = document.getElementById(toolbarId);
        var editor = document.getElementById(editorId);
        if (!toolbar || !editor) return;
        toolbar.querySelectorAll('.wysiwyg-btn').forEach(function(btn) {
            btn.onmousedown = function(e) { e.preventDefault(); };
            btn.onclick = function() {
                editor.focus();
                document.execCommand(btn.dataset.cmd, false, null);
            };
        });
    },

    _renderEquipment(testId) {
        var listEl = document.getElementById('adEquipmentList');
        if (!listEl) return;

        var items = [];
        DataModel.sections.forEach(function(section) {
            section.rows.forEach(function(row) {
                var qty = row.testQty ? row.testQty[testId] : '';
                if (qty && qty !== '0' && String(qty).trim() !== '') {
                    items.push({
                        section: section.name,
                        partNo: row.partNo || '-',
                        description: row.description || '-',
                        qty: qty
                    });
                }
            });
        });

        if (items.length === 0) {
            listEl.innerHTML = '<div class="ad-empty">No items assigned</div>';
            return;
        }

        var html = '<div class="ad-item-count">' + items.length + ' item' + (items.length > 1 ? 's' : '') + '</div>';
        html += '<table class="ad-table"><thead><tr>';
        html += '<th>Section</th><th>Part No.</th><th>Description</th><th>QTY</th>';
        html += '</tr></thead><tbody>';

        items.forEach(function(item) {
            html += '<tr>' +
                '<td class="ad-sec">' + ActivityDetails._esc(item.section) + '</td>' +
                '<td>' + ActivityDetails._esc(item.partNo) + '</td>' +
                '<td>' + ActivityDetails._esc(item.description) + '</td>' +
                '<td class="ad-qty">' + ActivityDetails._esc(item.qty) + '</td>' +
            '</tr>';
        });

        html += '</tbody></table>';
        listEl.innerHTML = html;
    },

    save() {
        if (!this._activeTestId) return;

        var overview = (document.getElementById('adOverview') || {}).innerHTML || '';
        var bullets = (document.getElementById('adNotes') || {}).innerHTML || '';

        // Clean empty HTML
        overview = this._clean(overview);
        bullets = this._clean(bullets);

        // Save to flow storage
        var f = StorageManager.loadFlow() || {};
        if (!f.descriptions) f.descriptions = {};

        if (overview || bullets) {
            f.descriptions[this._activeTestId] = { overview: overview, bullets: bullets };
        } else {
            delete f.descriptions[this._activeTestId];
        }

        StorageManager.save({ flow: f });
        this.close();
    },

    close() {
        var overlay = document.getElementById('activityDetailOverlay');
        if (overlay) overlay.classList.remove('active');
        this._activeTestId = null;
    },

    _clean(html) {
        if (!html) return '';
        var c = html.replace(/<br\s*\/?>\s*$/i, '').replace(/^<div><br><\/div>$/i, '').trim();
        if (c.replace(/<br\s*\/?>/gi, '').replace(/<\/?div>/gi, '').replace(/<\/?p>/gi, '').trim() === '') return '';
        return c;
    },

    _esc(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }
};
