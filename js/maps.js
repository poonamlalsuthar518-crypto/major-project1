/* Keyless MapLibre GL & OpenFreeMap map functions for SecureStep Safe Navigation
   Provides: initializeMap(), getCurrentLocation(), drawRoutes(routes), selectRoute(id), showRouteFacilityMarkers(route)
*/
(function() {
    'use strict';

    let map = null;
    let currentMarker = null;
    let activeFacilityMarkers = [];
    const activeRouteIds = [];
    const routeLayerData = new Map();
    const defaultCenter = [77.5946, 12.9716]; // Bengaluru [lng, lat]

    async function initializeMap() {
        const container = document.getElementById('map');
        if (!container) return null;

        if (map) return map;

        try {
            await window.loadMapLibreApi();

            map = await window.SecureStepMap.createMap(container, defaultCenter, 13);
            return map;
        } catch (e) {
            console.error('Failed to initialize MapLibre map:', e);
            if (container) {
                container.innerHTML = '<div style="padding:20px;color:#ef4444">Failed to initialize map. See console for details.</div>';
            }
            return null;
        }
    }

    async function getCurrentLocation() {
        if (!navigator.geolocation) throw new Error('Geolocation not supported');

        await window.loadMapLibreApi();
        if (!map) await initializeMap();

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition((pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                if (map) {
                    map.flyTo({
                        center: [lng, lat],
                        zoom: 15,
                        essential: true
                    });

                    if (currentMarker) {
                        currentMarker.remove();
                    }

                    currentMarker = window.SecureStepMap.createMarker(lat, lng, {
                        isUser: true,
                        popupHtml: '<strong>Your Location</strong>'
                    });

                    currentMarker.addTo(map);
                }
                resolve({ lat, lng });
            }, (err) => {
                reject(err);
            }, { enableHighAccuracy: true, timeout: 10000 });
        });
    }

    function clearFacilityMarkers() {
        activeFacilityMarkers.forEach(m => {
            try { m.remove(); } catch(e) {}
        });
        activeFacilityMarkers = [];
    }

    function showRouteFacilityMarkers(route) {
        if (!map) return;
        clearFacilityMarkers();

        if (!route) return;

        const policeList   = route.policeList   || (route.routeResources && route.routeResources.policeList)   || [];
        const hospitalList = route.hospitalList || (route.routeResources && route.routeResources.hospitalList) || [];
        const lightsList   = route.lightsList   || (route.routeResources && route.routeResources.lightsList)   || [];

        // 1. Clickable Police Station Markers (within 1km of route)
        policeList.forEach(p => {
            if (p.lat == null || p.lng == null) return;
            const popupHtml = `
                <div style="font-family:system-ui,-apple-system,sans-serif;padding:4px 6px">
                    <div style="font-weight:700;color:#1e40af;font-size:13px;margin-bottom:3px;display:flex;align-items:center;gap:6px">
                        <span>🚔</span> <span>${p.name || 'Police Station'}</span>
                    </div>
                    <div style="font-size:12px;color:#334155;margin-bottom:2px">
                        <strong>${p.distStr}</strong> from selected route
                    </div>
                    <div style="font-size:11px;color:#64748b">
                        ${p.address || p.area || 'Police Facility'}
                    </div>
                </div>
            `;
            const marker = window.SecureStepMap.createMarker(p.lat, p.lng, {
                type: 'police',
                color: '#1d4ed8',
                strokeColor: '#ffffff',
                size: 26,
                popupHtml: popupHtml
            });
            marker.addTo(map);
            activeFacilityMarkers.push(marker);
        });

        // 2. Clickable Hospital Markers (within 2km of route)
        hospitalList.forEach(h => {
            if (h.lat == null || h.lng == null) return;
            const popupHtml = `
                <div style="font-family:system-ui,-apple-system,sans-serif;padding:4px 6px">
                    <div style="font-weight:700;color:#065f46;font-size:13px;margin-bottom:3px;display:flex;align-items:center;gap:6px">
                        <span>🏥</span> <span>${h.name || 'Hospital'}</span>
                    </div>
                    <div style="font-size:12px;color:#334155;margin-bottom:2px">
                        <strong>${h.distStr}</strong> from selected route
                    </div>
                    <div style="font-size:11px;color:#64748b">
                        ${h.address || h.type || 'Medical Facility'}
                    </div>
                </div>
            `;
            const marker = window.SecureStepMap.createMarker(h.lat, h.lng, {
                type: 'hospital',
                color: '#059669',
                strokeColor: '#ffffff',
                size: 26,
                popupHtml: popupHtml
            });
            marker.addTo(map);
            activeFacilityMarkers.push(marker);
        });

        // 3. Clickable Lighting / Streetlight Markers (along route, sampled for clarity)
        const maxLightMarkers = 20;
        const sampledLights = lightsList.length > maxLightMarkers
            ? lightsList.filter((_, i) => i % Math.ceil(lightsList.length / maxLightMarkers) === 0)
            : lightsList;

        sampledLights.forEach(l => {
            if (l.lat == null || l.lng == null) return;
            const popupHtml = `
                <div style="font-family:system-ui,-apple-system,sans-serif;padding:4px 6px">
                    <div style="font-weight:700;color:#b45309;font-size:13px;margin-bottom:3px;display:flex;align-items:center;gap:6px">
                        <span>💡</span> <span>${l.name || 'Streetlight / Lit Area'}</span>
                    </div>
                    <div style="font-size:12px;color:#334155;margin-bottom:2px">
                        <strong>${l.distStr}</strong> from selected route
                    </div>
                    <div style="font-size:11px;color:#64748b">
                        Illuminated Safety Zone
                    </div>
                </div>
            `;
            const marker = window.SecureStepMap.createMarker(l.lat, l.lng, {
                type: 'circle',
                color: '#f59e0b',
                strokeColor: '#ffffff',
                size: 16,
                popupHtml: popupHtml
            });
            marker.addTo(map);
            activeFacilityMarkers.push(marker);
        });
    }

    function clearRoutes() {
        if (!map) return;
        activeRouteIds.forEach(id => {
            window.SecureStepMap.removeRouteLayer(map, id);
        });
        activeRouteIds.length = 0;
        routeLayerData.clear();
        clearFacilityMarkers();
    }

    function drawRoutes(routes) {
        if (!map) return;
        clearRoutes();

        if (!routes || !routes.length) return;

        // Determine safest route ID (highest safety score)
        const sorted = [...routes].sort((a, b) => (b.safetyScore || 0) - (a.safetyScore || 0));
        const safestRouteId = sorted.length ? sorted[0].id : null;

        const allCoords = [];

        routes.forEach((r, idx) => {
            const isSafest = r.id === safestRouteId;
            // Color by display label: safe=green, moderate=orange, unsafe/low-safety=red
            let strokeColor;
            if (r.displayColor === 'safe' || isSafest) {
                strokeColor = '#10b981'; // green
            } else if (r.displayColor === 'moderate') {
                strokeColor = '#eab308'; // bright yellow
            } else if (r.displayColor === 'unsafe') {
                strokeColor = '#ef4444'; // red
            } else {
                // Fallback by index
                strokeColor = idx === 0 ? '#10b981' : idx === 1 ? '#eab308' : '#ef4444';
            }

            // Extract [lng, lat] coordinates
            let geojsonCoords = r.geojsonCoords;
            if (!geojsonCoords && r.coords) {
                geojsonCoords = r.coords.map(c => [c.lng, c.lat]);
            }
            if (!geojsonCoords || geojsonCoords.length === 0) return;

            allCoords.push(...geojsonCoords);

            window.SecureStepMap.addRouteLayer(map, r.id, geojsonCoords, {
                color: strokeColor,
                isSafest: isSafest,
                onClick: () => {
                    selectRoute(r.id);
                    if (window.onRouteClick) window.onRouteClick(r);
                }
            });

            activeRouteIds.push(r.id);
            routeLayerData.set(r.id, { color: strokeColor, isSafest, info: r });
        });

        // Fit map bounds to encompass all routes
        if (allCoords.length > 0) {
            window.SecureStepMap.fitBounds(map, allCoords);
        }
    }

    function selectRoute(id, routeObject) {
        if (!map) return;

        let selectedInfo = routeObject || null;

        for (const [rid, layerInfo] of routeLayerData.entries()) {
            const lineLayerId = `layer-${rid}-line`;
            const glowLayerId = `layer-${rid}-glow`;

            if (!map.getLayer(lineLayerId) || !map.getLayer(glowLayerId)) continue;

            const isSelected = rid === id;
            if (isSelected) {
                if (!selectedInfo) selectedInfo = layerInfo.info;
                map.setPaintProperty(lineLayerId, 'line-width', 8);
                map.setPaintProperty(lineLayerId, 'line-opacity', 1.0);
                map.setPaintProperty(glowLayerId, 'line-width', 16);
                map.setPaintProperty(glowLayerId, 'line-opacity', 0.5);
            } else {
                const isSafest = layerInfo.isSafest;
                map.setPaintProperty(lineLayerId, 'line-width', isSafest ? 6 : 4);
                map.setPaintProperty(lineLayerId, 'line-opacity', isSafest ? 0.95 : 0.6);
                map.setPaintProperty(glowLayerId, 'line-width', isSafest ? 12 : 8);
                map.setPaintProperty(glowLayerId, 'line-opacity', isSafest ? 0.35 : 0.15);
            }
        }

        if (selectedInfo) {
            showRouteFacilityMarkers(selectedInfo);
        }
    }

    const navigationMapHelpers = {
        initializeMap,
        getCurrentLocation,
        drawRoutes,
        selectRoute,
        showRouteFacilityMarkers,
        clearFacilityMarkers,
        getMap: () => map
    };

    if (window.SecureStepMap) {
        Object.assign(window.SecureStepMap, navigationMapHelpers);
    }
    window.SecureStepMaps = window.SecureStepMap || navigationMapHelpers;

    document.addEventListener('DOMContentLoaded', () => {
        window.loadMapLibreApi().then(() => {
            initializeMap();
        }).catch(e => console.warn(e));
    });
})();
