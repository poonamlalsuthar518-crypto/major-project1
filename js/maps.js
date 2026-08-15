/* Leaflet-based map functions for SecureStep Safe Navigation
   Provides: initializeMap(), getCurrentLocation(), drawRoutes(routes), selectRoute(id), addSampleMarkers()
*/
(function(){
    let map, currentMarker = null;
    const routeLayers = new Map();
    const defaultCenter = [12.9716, 77.5946]; // Bengaluru

    function initializeMap(){
        const container = document.getElementById('map');
        if(typeof L === 'undefined'){
            if(container) container.innerHTML = '<div style="padding:20px;color:#ef4444">Unable to load map library (Leaflet). Please check your connection.</div>';
            console.error('Leaflet (L) is not available.');
            return null;
        }
        if(map) return map;
        try{
            map = L.map('map').setView(defaultCenter, 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);

            // Add demo legend markers (no real data)
            addSampleMarkers();

            return map;
        }catch(e){
            console.error('Failed to initialize Leaflet map', e);
            if(container) container.innerHTML = '<div style="padding:20px;color:#ef4444">Failed to initialize map. See console for details.</div>';
            return null;
        }
    }

    async function getCurrentLocation(){
        if(!navigator.geolocation) throw new Error('Geolocation not supported');
        return new Promise((resolve, reject)=>{
            navigator.geolocation.getCurrentPosition((pos)=>{
                const lat = pos.coords.latitude; const lng = pos.coords.longitude;
                const latlng = [lat,lng];
                if(!map) initializeMap();
                map.setView(latlng, 15);
                if(currentMarker) currentMarker.remove();
                currentMarker = L.marker(latlng).addTo(map).bindPopup('Your Current Location').openPopup();
                resolve({lat,lng});
            }, (err)=>{
                reject(err);
            }, { enableHighAccuracy:true, timeout:10000 });
        });
    }

    function clearRoutes(){
        for(const layer of routeLayers.values()){ map.removeLayer(layer.poly); if(layer.highlight) map.removeLayer(layer.highlight); }
        routeLayers.clear();
    }

    function drawRoutes(routes){
        // routes: array of objects with id, coords [[lat,lng],...], distance_km, duration_min, safetyScore, classification
        if(!map) initializeMap();
        clearRoutes();
        const colors = ['#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6'];
        routes.forEach((r, idx)=>{
            const color = colors[idx % colors.length];
            const latlngs = r.coords.map(c=>[c.lat,c.lng]);
            const poly = L.polyline(latlngs, {color:color, weight:6, opacity:0.8}).addTo(map);
            const highlight = L.polyline(latlngs, {color:color, weight:10, opacity:0.25});
            poly.on('click', ()=>{
                // highlight selected
                selectRoute(r.id);
                if(window.onRouteClick) window.onRouteClick(r);
            });
            routeLayers.set(r.id, {poly, highlight, info:r});
        });
        // fit to first route
        if(routes.length && routes[0].coords.length){
            const bounds = L.latLngBounds(routes[0].coords.map(c=>[c.lat,c.lng]));
            map.fitBounds(bounds.pad(0.2));
        }
    }

    function selectRoute(id){
        for(const [rid, layer] of routeLayers.entries()){
            if(layer.highlight){ map.removeLayer(layer.highlight); }
            if(rid === id){
                layer.highlight.addTo(map);
            }
        }
    }

    function addSampleMarkers(){
        // Demo markers for police/hospital/incidents (clearly labeled demo)
        const demo = [
            {type:'police', name:'Central Precinct (demo)', lat:12.9722, lng:77.5936},
            {type:'hospital', name:'City General Hospital (demo)', lat:12.9666, lng:77.5969},
            {type:'incident', name:'Reported incident (demo)', lat:12.9700, lng:77.5950}
        ];
        demo.forEach(d=>{
            const color = d.type==='police'? '#0ea5a4' : d.type==='hospital'? '#ef4444' : '#f59e0b';
            L.circleMarker([d.lat,d.lng], {radius:6, fillColor:color, color:'#fff', weight:1, fillOpacity:0.9}).addTo(map).bindPopup(d.name);
        });
    }

    window.SecureStepMaps = { initializeMap, getCurrentLocation, drawRoutes, selectRoute };

    // Auto-initialize
    document.addEventListener('DOMContentLoaded', ()=>{ try{ initializeMap(); }catch(e){ console.warn(e); } });

})();
