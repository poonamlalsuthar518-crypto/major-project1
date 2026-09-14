/* Google Maps-based map functions for SecureStep Safe Navigation
   Provides: initializeMap(), getCurrentLocation(), drawRoutes(routes), selectRoute(id)
*/
(function(){
    let map = null;
    let currentMarker = null;
    const routePolylines = new Map();
    const defaultCenter = { lat: 12.9716, lng: 77.5946 }; // Bengaluru

    async function initializeMap() {
        const container = document.getElementById('map');
        if (!container) return null;

        await window.loadGoogleMapsApi();

        if (map) return map;

        try {
            map = new google.maps.Map(container, {
                center: defaultCenter,
                zoom: 13,
                mapTypeControl: true,
                streetViewControl: false,
                fullscreenControl: true
            });

            return map;
        } catch (e) {
            console.error('Failed to initialize Google Map:', e);
            if (container) {
                container.innerHTML = '<div style="padding:20px;color:#ef4444">Failed to initialize Google Map. See console for details.</div>';
            }
            return null;
        }
    }

    async function getCurrentLocation() {
        if (!navigator.geolocation) throw new Error('Geolocation not supported');

        await window.loadGoogleMapsApi();

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const latlng = { lat, lng };

                if (!map) await initializeMap();

                if (map) {
                    map.setCenter(latlng);
                    map.setZoom(15);

                    if (currentMarker) currentMarker.setMap(null);

                    currentMarker = new google.maps.Marker({
                        position: latlng,
                        map: map,
                        title: 'Your Current Location',
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: '#4fc3f7',
                            fillOpacity: 1,
                            strokeColor: '#ffffff',
                            strokeWeight: 3
                        }
                    });
                }
                resolve({ lat, lng });
            }, (err) => {
                reject(err);
            }, { enableHighAccuracy: true, timeout: 10000 });
        });
    }

    function clearRoutes() {
        for (const layer of routePolylines.values()) {
            if (layer.poly) layer.poly.setMap(null);
            if (layer.glow) layer.glow.setMap(null);
        }
        routePolylines.clear();
    }

    function drawRoutes(routes) {
        if (!map) return;
        clearRoutes();

        if (!routes || !routes.length) return;

        // Determine safest route ID (highest safety score)
        const sorted = [...routes].sort((a, b) => b.safetyScore - a.safetyScore);
        const safestRouteId = sorted.length ? sorted[0].id : null;

        const bounds = new google.maps.LatLngBounds();

        routes.forEach((r, idx) => {
            const isSafest = r.id === safestRouteId;
            const strokeColor = isSafest ? '#10b981' : (idx === 1 ? '#3b82f6' : '#f59e0b');
            const path = r.coords.map(c => new google.maps.LatLng(c.lat, c.lng));

            path.forEach(pt => bounds.extend(pt));

            // Background glow line for safest route
            const glow = new google.maps.Polyline({
                path: path,
                geodesic: true,
                strokeColor: strokeColor,
                strokeOpacity: isSafest ? 0.35 : 0.15,
                strokeWeight: isSafest ? 12 : 8,
                zIndex: isSafest ? 90 : 10,
                map: map
            });

            // Foreground polyline
            const poly = new google.maps.Polyline({
                path: path,
                geodesic: true,
                strokeColor: strokeColor,
                strokeOpacity: isSafest ? 0.95 : 0.75,
                strokeWeight: isSafest ? 7 : 5,
                zIndex: isSafest ? 100 : 20,
                map: map
            });

            poly.addListener('click', () => {
                selectRoute(r.id);
                if (window.onRouteClick) window.onRouteClick(r);
            });

            routePolylines.set(r.id, { poly, glow, color: strokeColor, isSafest, info: r });
        });

        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, 50);
        }
    }

    function selectRoute(id) {
        for (const [rid, layer] of routePolylines.entries()) {
            const isSelected = rid === id;
            if (isSelected) {
                layer.poly.setOptions({ strokeWeight: 9, strokeOpacity: 1.0, zIndex: 200 });
                layer.glow.setOptions({ strokeWeight: 14, strokeOpacity: 0.5, zIndex: 190 });
            } else {
                const isSafest = layer.isSafest;
                layer.poly.setOptions({
                    strokeWeight: isSafest ? 7 : 5,
                    strokeOpacity: isSafest ? 0.95 : 0.6,
                    zIndex: isSafest ? 100 : 20
                });
                layer.glow.setOptions({
                    strokeWeight: isSafest ? 12 : 8,
                    strokeOpacity: isSafest ? 0.35 : 0.15,
                    zIndex: isSafest ? 90 : 10
                });
            }
        }
    }

    window.SecureStepMaps = { initializeMap, getCurrentLocation, drawRoutes, selectRoute };

    document.addEventListener('DOMContentLoaded', () => {
        window.loadGoogleMapsApi().then(() => {
            initializeMap();
        }).catch(e => console.warn(e));
    });
})();
