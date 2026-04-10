/**
 * FLOW-DETAILS.JS - Node Detail Popup
 * Shows a popup with:
 *   - Editable activity name, type, location, workpack
 *   - WYSIWYG Overview editor
 *   - WYSIWYG Scope & Notes editor (with bullet support)
 *   - Equipment list (right panel)
 *
 * Storage format: { nodeId: { overview: "html...", bullets: "html..." } }
 */

const FlowDetails = {

    _activeNodeId: null,
    _pendingNodeId: null,   // set by node context menu

    /** Open from the right-click context menu */
    openFromMenu() {
        if (this._pendingNodeId != null) {
            this.open(this._pendingNodeId);
        }
    },

    open(nodeId) {
        const node = FlowData.getNode(nodeId);
        if (!node) return;
        this._activeNodeId = nodeId;

        // ── Editable header fields ──────────────────────────
        const nameInput = document.getElementById('detailNameInput');
        if (nameInput) nameInput.value = node.name || '';

        // Type dropdown
        const typeSelect = document.getElementById('detailTypeSelect');
        if (typeSelect) {
            typeSelect.innerHTML = DataModel.testTypes
                .map(t => '<option value="' + t + '"' + (t === node.type ? ' selected' : '') + '>' + t + '</option>').join('');
        }

        // Location dropdown
        const locSelect = document.getElementById('detailLocationSelect');
        if (locSelect) {
            locSelect.innerHTML = DataModel.getLocationNames()
                .map(l => '<option value="' + l + '"' + (l === node.location ? ' selected' : '') + '>' + l + '</option>').join('');
        }

        // Workpack dropdown
        const wpSelect = document.getElementById('detailWorkpackSelect');
        if (wpSelect) {
            wpSelect.innerHTML = '<option value="">—</option>' +
                DataModel.workpacks.map(w =>
                    '<option value="' + w + '"' + (w === node.workpack ? ' selected' : '') + '>' + w + '</option>'
                ).join('');
        }

        // Meta line (uid, dates)
        const meta = document.getElementById('detailNodeMeta');
        if (meta) {
            var parts = [];
            if (node.uid)       parts.push('\uD83C\uDFF7 ' + node.uid);
            if (node.startDate) parts.push('\uD83D\uDCC5 ' + node.startDate);
            if (node.endDate)   parts.push('\u2192 ' + node.endDate);
            meta.textContent = parts.join('  \u2022  ');
        }

        // ── Load description data ───────────────────────────
        var desc = FlowData.descriptions[nodeId];
        var overview = '';
        var bullets  = '';
        if (typeof desc === 'string') {
            overview = this._escHtml(desc);
        } else if (desc && typeof desc === 'object') {
            overview = desc.overview || '';
            bullets  = desc.bullets  || '';
        }

        var overviewEl = document.getElementById('detailOverview');
        if (overviewEl) overviewEl.innerHTML = overview;

        var notesEl = document.getElementById('detailNotes');
        if (notesEl) notesEl.innerHTML = bullets || '';

        // ── WYSIWYG toolbar wiring ──────────────────────────
        this._wireToolbar('overviewToolbar', 'detailOverview');
        this._wireToolbar('notesToolbar', 'detailNotes');

        // Auto-convert "* " typed inside notes editor
        if (notesEl) {
            notesEl.removeEventListener('input', this._notesInputHandler);
            this._notesInputHandler = function() { FlowDetails._autoConvertBullet(notesEl); };
            notesEl.addEventListener('input', this._notesInputHandler);
        }

        // ── Equipment list ──────────────────────────────────
        this._renderEquipmentList(nodeId);

        // ── Attachments ──────────────────────────────────────
        this._renderAttachments(nodeId);

        // Show
        var overlay = document.getElementById('detailModalOverlay');
        if (overlay) overlay.classList.add('active');
        setTimeout(function() { if (nameInput) nameInput.focus(); }, 150);
    },

    /* ── WYSIWYG ──────────────────────────────────────────── */

    _wireToolbar(toolbarId, editorId) {
        var toolbar = document.getElementById(toolbarId);
        var editor  = document.getElementById(editorId);
        if (!toolbar || !editor) return;

        toolbar.querySelectorAll('.wysiwyg-btn').forEach(function(btn) {
            btn.onmousedown = function(e) { e.preventDefault(); };
            btn.onclick = function() {
                editor.focus();
                document.execCommand(btn.dataset.cmd, false, null);
            };
        });
    },

    /** Auto-convert "* " or "- " at start of text node into a bullet list */
    _autoConvertBullet(editor) {
        var sel = window.getSelection();
        if (!sel || !sel.anchorNode) return;

        var textNode = sel.anchorNode;
        if (textNode.nodeType !== 3) return;

        var text = textNode.textContent;
        if (/^[\*\-]\s/.test(text)) {
            textNode.textContent = text.replace(/^[\*\-]\s/, '');
            var range = document.createRange();
            range.setStart(textNode, textNode.textContent.length);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('insertUnorderedList', false, null);
        }
    },

    _notesInputHandler: null,

    /* ── Attachments ──────────────────────────────────────── */

    addAttachment() {
        var fi = document.getElementById('detailFileInput');
        if (fi) { fi.value = ''; fi.click(); }
    },

    _onFilesSelected(input) {
        if (!input.files || !input.files.length || !this._activeNodeId) return;
        var self = this;
        var nodeId = this._activeNodeId;

        Array.from(input.files).forEach(function(file) {
            if (file.size > 10 * 1024 * 1024) {
                alert('File "' + file.name + '" is too large (max 10 MB).');
                return;
            }
            var reader = new FileReader();
            reader.onload = function(e) {
                if (!FlowData.attachments) FlowData.attachments = {};
                if (!FlowData.attachments[nodeId]) FlowData.attachments[nodeId] = [];
                FlowData.attachments[nodeId].push({
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    size: file.size,
                    data: e.target.result,
                    addedAt: new Date().toISOString()
                });
                FlowData.save();
                self._renderAttachments(nodeId);
            };
            reader.readAsDataURL(file);
        });
    },

    openAttachment(nodeId, index) {
        if (!FlowData.attachments || !FlowData.attachments[nodeId]) return;
        var att = FlowData.attachments[nodeId][index];
        if (!att || !att.data) return;
        var parts = att.data.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var raw = atob(parts[1]);
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        var blob = new Blob([arr], { type: mime });
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
    },

    removeAttachment(nodeId, index) {
        if (!FlowData.attachments || !FlowData.attachments[nodeId]) return;
        FlowData.attachments[nodeId].splice(index, 1);
        if (FlowData.attachments[nodeId].length === 0) delete FlowData.attachments[nodeId];
        FlowData.save();
        this._renderAttachments(nodeId);
    },

    _renderAttachments(nodeId) {
        var el = document.getElementById('detailAttachmentsList');
        if (!el) return;
        var atts = (FlowData.attachments && FlowData.attachments[nodeId]) ? FlowData.attachments[nodeId] : [];
        if (atts.length === 0) {
            el.innerHTML = '<div class="detail-empty">No files attached</div>';
            return;
        }
        var self = this;
        var html = '';
        atts.forEach(function(att, i) {
            var icon = self._fileIcon(att.type, att.name);
            var size = self._formatSize(att.size);
            html += '<div class="detail-attach-item">' +
                '<span class="detail-attach-icon">' + icon + '</span>' +
                '<span class="detail-attach-name" onclick="FlowDetails.openAttachment(' + nodeId + ',' + i + ')" title="Click to open: ' + self._escHtml(att.name) + '">' + self._escHtml(att.name) + '</span>' +
                '<span class="detail-attach-size">' + size + '</span>' +
                '<button class="detail-attach-del" onclick="FlowDetails.removeAttachment(' + nodeId + ',' + i + ')" title="Remove">&times;</button>' +
                '</div>';
        });
        el.innerHTML = html;
    },

    _fileIcon(type, name) {
        if (!type) type = '';
        if (type.indexOf('pdf') !== -1 || (name && name.toLowerCase().endsWith('.pdf'))) return '\uD83D\uDCC4';
        if (type.indexOf('image') !== -1) return '\uD83D\uDDBC';
        if (type.indexOf('spreadsheet') !== -1 || type.indexOf('excel') !== -1 || (name && /\.xlsx?$/i.test(name))) return '\uD83D\uDCCA';
        if (type.indexOf('word') !== -1 || type.indexOf('document') !== -1 || (name && /\.docx?$/i.test(name))) return '\uD83D\uDCDD';
        if (type.indexOf('presentation') !== -1 || (name && /\.pptx?$/i.test(name))) return '\uD83D\uDCCA';
        if (type.indexOf('text') !== -1) return '\uD83D\uDCC3';
        if (type.indexOf('zip') !== -1 || type.indexOf('archive') !== -1) return '\uD83D\uDCE6';
        return '\uD83D\uDCCE';
    },

    _formatSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    /* ── Equipment List ─────────────────────────────────── */

    _renderEquipmentList(nodeId) {
        var listEl = document.getElementById('detailEquipmentList');
        if (!listEl) return;

        var m = StorageManager.loadMatrix();
        if (!m || !m.sections) {
            listEl.innerHTML = '<div class="detail-empty">No matrix data available</div>';
            return;
        }

        var items = [];
        m.sections.forEach(function(section) {
            section.rows.forEach(function(row) {
                var qty = row.testQty ? row.testQty[nodeId] : undefined;
                if (qty && qty !== '0' && qty !== '') {
                    items.push({
                        section: section.name,
                        itemNo: row.itemNo || '-',
                        description: row.description || '-',
                        partNo: row.partNo || '-',
                        qty: qty,
                        workpack: row.workpack || '-'
                    });
                }
            });
        });

        if (items.length === 0) {
            listEl.innerHTML = '<div class="detail-empty">No items assigned</div>';
            return;
        }

        var html = '<div class="detail-item-count">' + items.length + ' item' + (items.length > 1 ? 's' : '') + '</div>';
        html += '<table class="detail-table"><thead><tr>';
        html += '<th>Section</th><th>Part No.</th><th>Description</th><th>QTY</th>';
        html += '</tr></thead><tbody>';

        var self = this;
        items.forEach(function(item) {
            html += '<tr>' +
                '<td class="detail-section">' + self._escHtml(item.section) + '</td>' +
                '<td>' + self._escHtml(item.partNo) + '</td>' +
                '<td>' + self._escHtml(item.description) + '</td>' +
                '<td class="detail-qty">' + self._escHtml(item.qty) + '</td>' +
            '</tr>';
        });

        html += '</tbody></table>';
        listEl.innerHTML = html;
    },

    /* ── Save / Close ───────────────────────────────────── */

    save() {
        if (!this._activeNodeId) return;
        var node = FlowData.getNode(this._activeNodeId);
        if (!node) return;

        // ── Save name, type, location, workpack ─────────────
        var newName     = (document.getElementById('detailNameInput')   || {}).value || '';
        newName = newName.trim();
        var newType     = (document.getElementById('detailTypeSelect')  || {}).value || node.type;
        var newLocation = (document.getElementById('detailLocationSelect') || {}).value || node.location;
        var newWorkpack = (document.getElementById('detailWorkpackSelect') || {}).value || '';

        var nameChanged = newName && newName !== node.name;
        var typeChanged = newType !== node.type;
        var locChanged  = newLocation !== node.location;
        var wpChanged   = newWorkpack !== node.workpack;

        if (newName)     node.name     = newName;
        if (typeChanged) node.type     = newType;
        node.location = newLocation;
        node.workpack = newWorkpack;

        // Sync back to matrix storage if any header fields changed
        if (nameChanged || typeChanged || locChanged || wpChanged) {
            var m = StorageManager.loadMatrix();
            if (m && m.testColumns) {
                var col = m.testColumns.find(function(t) { return t.id === node.id; });
                if (col) {
                    if (newName)     col.name     = newName;
                    if (typeChanged) col.type     = newType;
                    col.location = newLocation;
                    col.workpack = newWorkpack;
                    StorageManager.saveNow({ matrix: m });
                }
            }
        }

        // ── Save description (overview + notes as HTML) ─────
        var overview = (document.getElementById('detailOverview') || {}).innerHTML || '';
        var bullets  = (document.getElementById('detailNotes')    || {}).innerHTML || '';

        var cleanOverview = this._cleanHtml(overview);
        var cleanBullets  = this._cleanHtml(bullets);

        if (cleanOverview || cleanBullets) {
            FlowData.descriptions[this._activeNodeId] = {
                overview: cleanOverview,
                bullets: cleanBullets
            };
        } else {
            delete FlowData.descriptions[this._activeNodeId];
        }
        FlowData.save();
        this.close();
        FlowApp.renderAll();
    },

    close() {
        var overlay = document.getElementById('detailModalOverlay');
        if (overlay) overlay.classList.remove('active');
        this._activeNodeId = null;
    },

    /** Strip empty HTML that browsers insert */
    _cleanHtml(html) {
        if (!html) return '';
        var clean = html
            .replace(/<br\s*\/?>\s*$/i, '')
            .replace(/^<div><br><\/div>$/i, '')
            .trim();
        if (clean.replace(/<br\s*\/?>/gi, '').replace(/<\/?div>/gi, '').replace(/<\/?p>/gi, '').trim() === '') {
            return '';
        }
        return clean;
    },

    _escHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
};
