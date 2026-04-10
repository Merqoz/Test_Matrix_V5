/**
 * SETTINGS.JS - Location Manager
 * Simple list with Edit button per row → opens edit popup.
 */
var SettingsManager = {

    _palette:['#06b6d4','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#6366f1','#14b8a6','#f97316','#84cc16'],

    _geoDb:{
        'london':{lat:51.51,lng:-0.13},'paris':{lat:48.86,lng:2.35},'berlin':{lat:52.52,lng:13.41},
        'rome':{lat:41.90,lng:12.50},'madrid':{lat:40.42,lng:-3.70},'amsterdam':{lat:52.37,lng:4.90},
        'oslo':{lat:59.91,lng:10.75},'bergen':{lat:60.39,lng:5.32},'stavanger':{lat:58.97,lng:5.73},
        'egersund':{lat:58.45,lng:5.99},'\u00e5gotnes':{lat:60.37,lng:5.01},'trondheim':{lat:63.43,lng:10.39},
        'stockholm':{lat:59.33,lng:18.07},'copenhagen':{lat:55.68,lng:12.57},'helsinki':{lat:60.17,lng:24.94},
        'new york':{lat:40.71,lng:-74.01},'houston':{lat:29.76,lng:-95.37},'los angeles':{lat:34.05,lng:-118.24},
        'toronto':{lat:43.65,lng:-79.38},'tokyo':{lat:35.68,lng:139.69},'seoul':{lat:37.57,lng:126.98},
        'singapore':{lat:1.35,lng:103.82},'mumbai':{lat:19.08,lng:72.88},'pune':{lat:18.52,lng:73.86},
        'dubai':{lat:25.20,lng:55.27},'sydney':{lat:-33.87,lng:151.21},'sao paulo':{lat:-23.55,lng:-46.63},
        'kuala lumpur':{lat:3.14,lng:101.69},'malaysia':{lat:3.14,lng:101.69},'brazil':{lat:-14.24,lng:-51.93},
        'india':{lat:20.59,lng:78.96},'norway':{lat:60.47,lng:8.47},'uk':{lat:51.51,lng:-0.13},
        'usa':{lat:39.83,lng:-98.58},'germany':{lat:51.17,lng:10.45},'france':{lat:46.23,lng:2.21},
        'aberdeen':{lat:57.15,lng:-2.09},'edinburgh':{lat:55.95,lng:-3.19},'manchester':{lat:53.48,lng:-2.24}
    },

    _suggestCoords:function(name){
        if(!name)return null;var lower=name.toLowerCase().trim();
        if(this._geoDb[lower])return this._geoDb[lower];
        var parts=lower.split(/[,\s]+/).map(function(s){return s.trim();}).filter(Boolean);
        for(var i=parts.length-1;i>=0;i--){if(this._geoDb[parts[i]])return this._geoDb[parts[i]];}
        return null;
    },

    open:function(){this._renderList();this._wireAutoSuggest();document.getElementById('settingsOverlay').classList.add('open');},
    close:function(){document.getElementById('settingsOverlay').classList.remove('open');},

    _wireAutoSuggest:function(){
        var self=this,ni=document.getElementById('settingsNewLocName'),la=document.getElementById('settingsNewLocLat'),ln=document.getElementById('settingsNewLocLng');
        if(!ni||!la||!ln)return;
        ni.addEventListener('input',function(){
            if(la.value||ln.value)return;
            var s=self._suggestCoords(ni.value);
            if(s){la.placeholder=s.lat.toFixed(2)+' (auto)';ln.placeholder=s.lng.toFixed(2)+' (auto)';la.dataset.suggested=s.lat;ln.dataset.suggested=s.lng;}
            else{la.placeholder='Latitude';ln.placeholder='Longitude';delete la.dataset.suggested;delete ln.dataset.suggested;}
        });
    },

    /* ── List view ──────────────────────────────────── */

    _renderList:function(){
        var list=document.getElementById('settingsLocList');if(!list)return;
        var self=this,locs=DataModel.locations;
        var names=Object.keys(locs).sort(function(a,b){return a.localeCompare(b);});
        var html='';
        names.forEach(function(name){
            var loc=locs[name];
            var hasCoords=(loc.lat!==undefined&&loc.lng!==undefined);
            var coordStr=hasCoords?loc.lat.toFixed(2)+', '+loc.lng.toFixed(2):'No coords';
            html+='<div class="sloc-row">';
            html+='<span class="sloc-dot" style="background:'+(loc.color||'#888')+'"></span>';
            html+='<span class="sloc-name">'+self._esc(name)+'</span>';
            html+='<span class="sloc-coords'+(hasCoords?'':' sloc-no-coords')+'">'+coordStr+'</span>';
            html+='<button class="sloc-edit-btn" data-loc="'+self._escAttr(name)+'">Edit</button>';
            html+='<button class="sloc-del-btn" data-loc="'+self._escAttr(name)+'">&times;</button>';
            html+='</div>';
        });
        if(names.length===0) html='<div class="settings-loc-empty">No locations defined.</div>';
        list.innerHTML=html;

        // Bind
        list.querySelectorAll('.sloc-edit-btn').forEach(function(btn){
            btn.addEventListener('click',function(){self.openEditPopup(btn.dataset.loc);});
        });
        list.querySelectorAll('.sloc-del-btn').forEach(function(btn){
            btn.addEventListener('click',function(){
                if(!confirm('Remove "'+btn.dataset.loc+'"?'))return;
                delete DataModel.locations[btn.dataset.loc];
                self._persistLocations();self._renderList();
            });
        });
    },

    /* ── Edit popup ──────────────────────────────────── */

    openEditPopup:function(name){
        var loc=DataModel.locations[name];if(!loc)return;
        var ov=document.getElementById('settingsEditOverlay');if(!ov)return;
        document.getElementById('seditOrigName').value=name;
        document.getElementById('seditName').value=name;
        document.getElementById('seditColor').value=loc.color||'#888';
        document.getElementById('seditLat').value=(loc.lat!==undefined)?loc.lat:'';
        document.getElementById('seditLng').value=(loc.lng!==undefined)?loc.lng:'';
        document.getElementById('seditTitle').textContent='Edit Location';
        // Preview
        this._updateEditPreview();
        ov.classList.add('active');
        document.getElementById('seditName').focus();
    },

    _updateEditPreview:function(){
        var el=document.getElementById('seditPreview');if(!el)return;
        var c=document.getElementById('seditColor').value||'#888';
        var n=document.getElementById('seditName').value||'Location';
        el.innerHTML='<span class="sloc-dot" style="background:'+c+';width:16px;height:16px;"></span><span style="color:'+c+';font-weight:600;">'+this._esc(n)+'</span>';
    },

    saveEditPopup:function(){
        var origName=document.getElementById('seditOrigName').value;
        var newName=document.getElementById('seditName').value.trim();
        var color=document.getElementById('seditColor').value;
        var lat=parseFloat(document.getElementById('seditLat').value);
        var lng=parseFloat(document.getElementById('seditLng').value);

        if(!newName){alert('Name cannot be empty.');return;}
        if(newName!==origName&&DataModel.locations[newName]){alert('"'+newName+'" already exists.');return;}

        // Rename if needed
        if(newName!==origName){
            DataModel.locations[newName]=DataModel.locations[origName];
            delete DataModel.locations[origName];
            DataModel.testColumns.forEach(function(t){if(t.location===origName)t.location=newName;});
            this._persistMatrix();
        }

        var loc=DataModel.locations[newName];
        loc.color=color;
        loc.bg=this._colorToBg(color,0.08);
        loc.border=this._colorToBg(color,0.25);
        if(!isNaN(lat)&&!isNaN(lng)){loc.lat=lat;loc.lng=lng;}
        else{delete loc.lat;delete loc.lng;}

        this._persistLocations();
        this.closeEditPopup();
        this._renderList();
    },

    closeEditPopup:function(){
        var ov=document.getElementById('settingsEditOverlay');if(ov)ov.classList.remove('active');
    },

    /* ── Add ──────────────────────────────────── */

    addLocation:function(){
        var ni=document.getElementById('settingsNewLocName'),ci=document.getElementById('settingsNewLocColor');
        var la=document.getElementById('settingsNewLocLat'),ln=document.getElementById('settingsNewLocLng');
        if(!ni)return;var name=ni.value.trim();
        if(!name){ni.focus();return;}
        if(DataModel.locations[name]){alert('"'+name+'" already exists.');return;}
        var color=ci?ci.value:this._palette[Object.keys(DataModel.locations).length%this._palette.length];
        var entry={color:color,bg:this._colorToBg(color,0.08),border:this._colorToBg(color,0.25)};
        var lat=la?parseFloat(la.value):NaN,lng=ln?parseFloat(ln.value):NaN;
        if(isNaN(lat)&&la&&la.dataset.suggested)lat=parseFloat(la.dataset.suggested);
        if(isNaN(lng)&&ln&&ln.dataset.suggested)lng=parseFloat(ln.dataset.suggested);
        if(!isNaN(lat)&&!isNaN(lng)){entry.lat=lat;entry.lng=lng;}
        else{var s=this._suggestCoords(name);if(s){entry.lat=s.lat;entry.lng=s.lng;}}
        DataModel.locations[name]=entry;
        this._persistLocations();
        ni.value='';
        if(la){la.value='';la.placeholder='Latitude';delete la.dataset.suggested;}
        if(ln){ln.value='';ln.placeholder='Longitude';delete ln.dataset.suggested;}
        this._renderList();
    },

    /* ── Persistence ──────────────────────────────────── */

    _persistLocations:function(){
        var d={};Object.keys(DataModel.locations).forEach(function(n){
            var l=DataModel.locations[n],e={color:l.color,bg:l.bg,border:l.border};
            if(l.lat!==undefined&&l.lng!==undefined){e.lat=l.lat;e.lng=l.lng;}d[n]=e;
        });StorageManager.save({prefs:{customLocations:d}});
    },
    _persistMatrix:function(){
        if(typeof App!=='undefined'&&App.persistMatrix)App.persistMatrix();
        else StorageManager.save({matrix:{testColumns:DataModel.testColumns,sections:DataModel.sections}});
    },
    loadCustomLocations:function(){
        try{var p=StorageManager.loadPrefs();if(p&&p.customLocations){Object.keys(p.customLocations).forEach(function(n){DataModel.locations[n]=p.customLocations[n];});}}catch(e){}
    },
    _colorToBg:function(hex,a){var r=parseInt(hex.slice(1,3),16)||0,g=parseInt(hex.slice(3,5),16)||0,b=parseInt(hex.slice(5,7),16)||0;return'rgba('+r+','+g+','+b+','+a+')';},
    _esc:function(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;},
    _escAttr:function(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
};
