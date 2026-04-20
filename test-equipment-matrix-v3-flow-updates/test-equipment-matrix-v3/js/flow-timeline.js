/**
 * FLOW-TIMELINE.JS - Interactive Milestone Timeline (WP-based rows)
 * Each WP (WP03-WP11) gets its own row.
 * Right-click track -> add milestone.  Dbl-click / right-click milestone -> edit.
 * Drag milestones horizontally + across rows.  Toggle visibility.
 */

const FlowTimeline = {

    _activeMsId: null,
    _selectedShape: 'circle',
    _selectedColor: '#ffffff',
    _selectedSize: 'medium',
    _sizeMap: { small: 10, medium: 22, large: 32 },
    _visible: true,
    _hiddenWpRows: {},

    wpRows: ['WP03', 'WP04', 'WP05', 'WP06', 'WP07', 'WP09', 'WP10', 'WP11'],

    wpColors: {
        'WP03': '#06b6d4', 'WP04': '#8b5cf6', 'WP05': '#10b981',
        'WP06': '#f59e0b', 'WP07': '#ef4444', 'WP09': '#ec4899',
        'WP10': '#6366f1', 'WP11': '#14b8a6'
    },

    render() {
        var container = document.getElementById('timelineStrip');
        if (!container) return;

        // Load visibility pref
        try {
            var p = StorageManager.loadPrefs();
            if (p && p.flowTimelineVisible === false) this._visible = false;
            if (p && p.flowHiddenWpRows) this._hiddenWpRows = p.flowHiddenWpRows;
        } catch(e) {}

        // Update toggle button text
        var toggleBtn = document.getElementById('tlToggleBtn');
        if (toggleBtn) {
            toggleBtn.innerHTML = this._visible
                ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span>Hide Timeline</span>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg><span>Show Timeline</span>';
        }

        if (!this._visible) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = '';

        // Migrate old milestones without wpRow
        this.migrateOldMilestones();

        var html = '', self = this;
        this.wpRows.forEach(function(wp) {
            if (self._hiddenWpRows[wp]) return;
            var color = self.wpColors[wp] || '#888';
            html += '<div class="tl-wp-row" id="tl-wp-' + wp + '" data-wp="' + wp + '">';
            html += '<div class="tl-wp-label" style="color:' + color + '">' + wp + '</div>';
            html += '<div class="tl-wp-track" data-wp="' + wp + '">';
            html += '<div class="tl-wp-line" style="background:' + color + '30;"></div>';

            FlowData.milestones.filter(function(m) { return m.wpRow === wp; }).forEach(function(m) {
                html += self._milestoneHTML(m);
            });

            html += '</div></div>';
        });

        container.innerHTML = html;
        this._attachEvents();
    },

    toggle: function() {
        this._visible = !this._visible;
        StorageManager.save({ prefs: { flowTimelineVisible: this._visible } });
        this.render();
    },

    _milestoneHTML: function(m) {
        var size = this._sizeMap[m.size || 'medium'] || 22;
        var msColor = m.color || '#ffffff';
        var shape = m.shape || 'circle';
        return '<div class="tl-milestone" id="tl-ms-' + m.id + '" data-ms-id="' + m.id + '" style="left:' + m.x + '%;">' +
            '<div class="tl-ms-title">' + this._esc(m.text || '') + '</div>' +
            this._shapeHTML(shape, msColor, size) +
            '<div class="tl-ms-date">' + this._esc(m.date || '') + '</div>' +
        '</div>';
    },

    _shapeHTML: function(shape, color, size) {
        var s = size || 22, h = s / 2, inner = '';
        if (shape === 'square') {
            var i = s * 0.1;
            inner = '<rect x="' + i + '" y="' + i + '" width="' + (s-i*2) + '" height="' + (s-i*2) + '" rx="1.5" fill="' + color + '"/>';
        } else if (shape === 'triangle') {
            inner = '<polygon points="' + h + ',' + (s*0.08) + ' ' + (s*0.92) + ',' + (s*0.88) + ' ' + (s*0.08) + ',' + (s*0.88) + '" fill="' + color + '"/>';
        } else if (shape === 'diamond') {
            inner = '<polygon points="' + h + ',' + (s*0.05) + ' ' + (s*0.95) + ',' + h + ' ' + h + ',' + (s*0.95) + ' ' + (s*0.05) + ',' + h + '" fill="' + color + '"/>';
        } else {
            inner = '<circle cx="' + h + '" cy="' + h + '" r="' + (h*0.78) + '" fill="' + color + '"/>';
        }
        return '<svg class="tl-ms-shape" width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '" style="filter:drop-shadow(0 0 3px ' + color + '80);">' + inner + '</svg>';
    },

    _attachEvents: function() {
        var self = this;

        // Right-click on WP track -> add milestone
        this.wpRows.forEach(function(wp) {
            var row = document.getElementById('tl-wp-' + wp);
            if (!row) return;
            var track = row.querySelector('.tl-wp-track');
            if (!track) return;
            track.addEventListener('contextmenu', function(e) {
                if (e.target.closest('.tl-milestone')) return;
                e.preventDefault();
                var rect = track.getBoundingClientRect();
                var x = ((e.clientX - rect.left) / rect.width) * 100;
                self._addMilestone(wp, Math.max(2, Math.min(98, x)));
            });
        });

        // Milestone interactions
        document.querySelectorAll('.tl-milestone').forEach(function(el) {
            el.addEventListener('mousedown', function(e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                self._startDrag(e, el);
            });
            el.addEventListener('dblclick', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.openModal(parseInt(el.dataset.msId));
            });
            el.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.openModal(parseInt(el.dataset.msId));
            });
        });
    },

    _addMilestone: function(wpRow, xPercent) {
        var ms = {
            id: FlowData.nextMilestoneId++,
            wpRow: wpRow,
            laneType: FlowData.laneTypes[0] || 'FAT',
            x: Math.round(xPercent * 10) / 10,
            text: '', date: '',
            shape: 'circle', color: '#ffffff', size: 'medium'
        };
        FlowData.milestones.push(ms);
        FlowData.save();
        this.render();
        this.openModal(ms.id);
    },

    /* -- Drag ------------------------------------------------ */

    _startDrag: function(event, el) {
        var msId = parseInt(el.dataset.msId);
        var ms = FlowData.milestones.find(function(m) { return m.id === msId; });
        if (!ms) return;

        el.classList.add('dragging');

        var strip = document.getElementById('timelineStrip');
        if (!strip) return;
        var stripRect = strip.getBoundingClientRect();

        var tracks = [], self = this;
        this.wpRows.forEach(function(wp) {
            var row = document.getElementById('tl-wp-' + wp);
            if (!row) return;
            var track = row.querySelector('.tl-wp-track');
            if (track) tracks.push({ wp: wp, el: track, rect: track.getBoundingClientRect() });
        });
        if (tracks.length === 0) return;

        document.body.appendChild(el);
        el.style.position = 'fixed';
        el.style.top = event.clientY + 'px';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.left = event.clientX + 'px';
        el.style.zIndex = '10000';

        var vLine = document.getElementById('tl-drag-vline');
        if (!vLine) {
            vLine = document.createElement('div');
            vLine.id = 'tl-drag-vline';
            vLine.style.cssText = 'position:fixed;width:1px;pointer-events:none;z-index:9999;background:rgba(0,212,255,0.35);display:none;';
            document.body.appendChild(vLine);
        }
        vLine.style.top = stripRect.top + 'px';
        vLine.style.height = stripRect.height + 'px';
        vLine.style.left = event.clientX + 'px';
        vLine.style.display = 'block';

        var onMove = function(e) {
            var clampedX = Math.max(stripRect.left + 4, Math.min(stripRect.right - 4, e.clientX));
            el.style.left = clampedX + 'px';
            el.style.top = e.clientY + 'px';
            vLine.style.left = clampedX + 'px';

            tracks.forEach(function(tr) {
                var inRow = e.clientY >= tr.rect.top && e.clientY <= tr.rect.bottom;
                tr.el.classList.toggle('tl-drop-target', inRow);
            });
        };

        var onUp = function(e) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            el.classList.remove('dragging');
            vLine.style.display = 'none';
            tracks.forEach(function(tr) { tr.el.classList.remove('tl-drop-target'); });

            var target = null;
            for (var i = 0; i < tracks.length; i++) {
                if (e.clientY >= tracks[i].rect.top && e.clientY <= tracks[i].rect.bottom) {
                    target = tracks[i]; break;
                }
            }
            if (!target) {
                var minDist = Infinity;
                for (var j = 0; j < tracks.length; j++) {
                    var centerY = (tracks[j].rect.top + tracks[j].rect.bottom) / 2;
                    var dist = Math.abs(e.clientY - centerY);
                    if (dist < minDist) { minDist = dist; target = tracks[j]; }
                }
            }

            var cursorX = Math.max(target.rect.left, Math.min(target.rect.right, e.clientX));
            var pct = ((cursorX - target.rect.left) / target.rect.width) * 100;
            ms.wpRow = target.wp;
            ms.x = Math.round(Math.max(2, Math.min(98, pct)) * 10) / 10;

            el.style.position = '';
            el.style.top = '';
            el.style.transform = '';
            el.style.zIndex = '';
            el.style.left = ms.x + '%';
            target.el.appendChild(el);

            FlowData.save();
            self.render();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    /* -- Modal ----------------------------------------------- */

    openModal: function(msId) {
        var ms = FlowData.milestones.find(function(m) { return m.id === msId; });
        if (!ms) return;

        this._activeMsId = msId;
        this._selectedShape = ms.shape || 'circle';
        this._selectedColor = ms.color || '#ffffff';
        this._selectedSize = ms.size || 'medium';

        document.getElementById('msTextInput').value = ms.text || '';
        document.getElementById('msDateInput').value = ms.date || '';

        // WP selector
        var wpSel = document.getElementById('msWpSelect');
        if (wpSel) {
            var self = this;
            wpSel.innerHTML = this.wpRows.map(function(wp) {
                return '<option value="' + wp + '"' + (wp === ms.wpRow ? ' selected' : '') + '>' + wp + '</option>';
            }).join('');
        }

        // Shape buttons
        var selShape = this._selectedShape, selColor = this._selectedColor, selSize = this._selectedSize, that = this;
        document.querySelectorAll('#msShapePicker .ms-shape-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.shape === selShape);
            btn.onclick = function() {
                that._selectedShape = btn.dataset.shape;
                document.querySelectorAll('#msShapePicker .ms-shape-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                that._updatePreview();
            };
        });

        // Color buttons
        document.querySelectorAll('#msColorPicker .ms-color-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.color === selColor);
            btn.onclick = function() {
                that._selectedColor = btn.dataset.color;
                document.querySelectorAll('#msColorPicker .ms-color-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                that._updatePreview();
            };
        });

        // Size buttons
        document.querySelectorAll('#msSizePicker .ms-size-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.size === selSize);
            btn.onclick = function() {
                that._selectedSize = btn.dataset.size;
                document.querySelectorAll('#msSizePicker .ms-size-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                that._updatePreview();
            };
        });

        document.getElementById('msTextInput').oninput = function() { that._updatePreview(); };
        document.getElementById('msDateInput').oninput = function() { that._updatePreview(); };

        this._updatePreview();
        document.getElementById('milestoneModalOverlay').classList.add('active');
        setTimeout(function() { document.getElementById('msTextInput').focus(); }, 100);
    },

    _updatePreview: function() {
        var el = document.getElementById('msPreview');
        if (!el) return;
        var text = (document.getElementById('msTextInput') || {}).value || '';
        var date = (document.getElementById('msDateInput') || {}).value || '';
        var size = this._sizeMap[this._selectedSize] || 22;
        el.innerHTML = '<div class="ms-preview-stack">' +
            '<span class="ms-preview-title">' + this._esc(text || 'Title') + '</span>' +
            this._shapeHTML(this._selectedShape, this._selectedColor, size) +
            '<span class="ms-preview-date">' + this._esc(date || 'dd.mm.yy') + '</span>' +
        '</div>';
    },

    saveModal: function() {
        var ms = FlowData.milestones.find(function(m) { return m.id === FlowTimeline._activeMsId; });
        if (!ms) return;
        ms.text  = ((document.getElementById('msTextInput') || {}).value || '').trim();
        ms.date  = ((document.getElementById('msDateInput') || {}).value || '').trim();
        ms.shape = this._selectedShape;
        ms.color = this._selectedColor;
        ms.size  = this._selectedSize;
        var wpSel = document.getElementById('msWpSelect');
        if (wpSel) ms.wpRow = wpSel.value;
        FlowData.save();
        this.closeModal();
        this.render();
    },

    deleteFromModal: function() {
        if (!this._activeMsId) return;
        FlowData.milestones = FlowData.milestones.filter(function(m) { return m.id !== FlowTimeline._activeMsId; });
        FlowData.save();
        this.closeModal();
        this.render();
    },

    closeModal: function() {
        var el = document.getElementById('milestoneModalOverlay');
        if (el) el.classList.remove('active');
        this._activeMsId = null;
    },

    migrateOldMilestones: function() {
        FlowData.milestones.forEach(function(ms) {
            if (!ms.wpRow) ms.wpRow = 'WP03';
        });
    },

    _esc: function(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    },

    // ══════ WP Visibility Panel ══════

    openWpPanel: function() {
        this._renderWpPanel();
        var overlay = document.getElementById('flowWpPanelOverlay');
        if (overlay) overlay.classList.add('active');
    },

    closeWpPanel: function() {
        var overlay = document.getElementById('flowWpPanelOverlay');
        if (overlay) overlay.classList.remove('active');
        StorageManager.save({ prefs: { flowHiddenWpRows: this._hiddenWpRows } });
        this.render();
    },

    _renderWpPanel: function() {
        var list = document.getElementById('flowWpPanelList');
        if (!list) return;
        var self = this;
        var html = '';
        this.wpRows.forEach(function(wp) {
            var color = self.wpColors[wp] || '#888';
            var hidden = !!self._hiddenWpRows[wp];
            html += '<div class="flow-wp-panel-item">';
            html += '<span class="flow-wp-panel-dot" style="background:' + color + '"></span>';
            html += '<span class="flow-wp-panel-name">' + wp + '</span>';
            html += '<label class="flow-wp-toggle"><input type="checkbox" ' + (hidden ? '' : 'checked') + ' onchange="FlowTimeline.toggleWpRow(\'' + wp + '\',this.checked)"><span class="flow-wp-slider"></span></label>';
            html += '</div>';
        });
        list.innerHTML = html;
    },

    toggleWpRow: function(wp, visible) {
        if (visible) delete this._hiddenWpRows[wp];
        else this._hiddenWpRows[wp] = true;
        StorageManager.save({ prefs: { flowHiddenWpRows: this._hiddenWpRows } });
        this.render();
    },

    wpPanelShowAll: function() {
        this._hiddenWpRows = {};
        this._renderWpPanel();
        StorageManager.save({ prefs: { flowHiddenWpRows: this._hiddenWpRows } });
        this.render();
    },

    wpPanelHideAll: function() {
        var self = this;
        this.wpRows.forEach(function(wp) { self._hiddenWpRows[wp] = true; });
        this._renderWpPanel();
        StorageManager.save({ prefs: { flowHiddenWpRows: this._hiddenWpRows } });
        this.render();
    }
};
