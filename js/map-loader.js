/**
 * SecureStep - 100% Free & API-Keyless Map Module
 * Powered by:
 * - MapLibre GL JS (WebGL vector map rendering)
 * - OpenFreeMap (High performance, free street map vector tiles)
 * - OSRM (Open Source Routing Machine for real road routing & alternatives)
 * - OpenStreetMap Nominatim / Photon (Place search & geocoding)
 *
 * No API keys, no tokens, no billing, no usage limits.
 */

(function() {
    'use strict';

    const MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
    const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
    const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';

    // Inject MapLibre CSS
    function injectStyles() {
        if (document.getElementById('maplibre-gl-css')) return;
        const link = document.createElement('link');
        link.id = 'maplibre-gl-css';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = MAPLIBRE_CSS;
        (document.head || document.documentElement).appendChild(link);

        // Inject custom marker & popup style improvements
        if (!document.getElementById('securestep-map-custom-css')) {
            const customStyle = document.createElement('style');
            customStyle.id = 'securestep-map-custom-css';
            customStyle.textContent = `
                .maplibregl-popup-content {
                    padding: 14px 16px;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(15,23,42,0.18);
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    color: #0f172a;
                    border: 1px solid #e2e8f0;
                }
                .maplibregl-popup-close-button {
                    font-size: 16px;
                    padding: 4px 8px;
                    color: #64748b;
                }
                .maplibregl-ctrl-group {
                    border-radius: 10px !important;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1) !important;
                    border: 1px solid #e2e8f0 !important;
                    overflow: hidden;
                }
                .user-pulse-marker {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: #38bdf8;
                    border: 3px solid #ffffff;
                    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7);
                    animation: mapUserPulse 2s infinite;
                    cursor: pointer;
                }
                @keyframes mapUserPulse {
                    0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7); }
                    70% { box-shadow: 0 0 0 14px rgba(56, 189, 248, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
                }
                .service-marker-pin {
                    cursor: pointer;
                    transition: transform 0.15s ease-out;
                    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2));
                }
                .service-marker-pin:hover {
                    transform: scale(1.2) translateY(-2px);
                }
            `;
            (document.head || document.documentElement).appendChild(customStyle);
        }
    }

    injectStyles();

    let loadPromise = null;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (window.maplibregl) return resolve(window.maplibregl);
                existing.addEventListener('load', () => resolve(window.maplibregl));
                existing.addEventListener('error', (e) => reject(e));
                return;
            }
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = src;
            script.async = false;
            script.onload = () => resolve(window.maplibregl);
            script.onerror = (e) => reject(e);
            document.head.appendChild(script);
        });
    }

    function loadMapLibreApi() {
        if (window.maplibregl) {
            return Promise.resolve(window.maplibregl);
        }
        if (loadPromise) return loadPromise;

        loadPromise = loadScript(MAPLIBRE_JS).then(() => {
            console.log('MapLibre GL JS & OpenFreeMap loaded successfully (100% keyless).');
            window.dispatchEvent(new CustomEvent('securestep:mapsReady'));
            return window.maplibregl;
        });

        return loadPromise;
    }

    /**
     * Helper to create marker HTML element with custom SVG
     */
    function createMarkerElement(options = {}) {
        const {
            color = '#38bdf8',
            strokeColor = '#ffffff',
            strokeWidth = 2,
            size = 24,
            type = 'circle',
            isUser = false
        } = options;

        const el = document.createElement('div');
        el.className = isUser ? 'user-pulse-marker' : 'service-marker-pin';

        if (isUser) {
            return el;
        }

        let svg = '';
        if (type === 'circle') {
            const r = size / 2 - strokeWidth;
            const center = size / 2;
            svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle cx="${center}" cy="${center}" r="${r}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
            </svg>`;
        } else if (type === 'pin') {
            const width = size;
            const height = Math.round(size * 1.35);
            svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 32">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
                <circle cx="12" cy="12" r="4.5" fill="${strokeColor}"/>
            </svg>`;
        } else if (type === 'incident') {
            svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
                <path d="M12 7v6M12 16v1" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round"/>
            </svg>`;
        } else if (type === 'hospital') {
            svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="11" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
                <path d="M12 6v12M6 12h12" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round"/>
            </svg>`;
        } else if (type === 'police') {
            svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
                <path d="M12 2L4 5v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V5l-8-3z" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
                <path d="M9 12l2 2 4-4" stroke="${strokeColor}" stroke-width="2" fill="none" stroke-linecap="round"/>
            </svg>`;
        }

        el.innerHTML = svg;
        return el;
    }

    /**
     * Unified Keyless Map Object
     */
    const SecureStepMap = {
        load: loadMapLibreApi,
        getStyle: () => MAP_STYLE,

        /**
         * Initialize a MapLibre GL map instance
         */
        async createMap(container, center = [77.5946, 12.9716], zoom = 13, options = {}) {
            await loadMapLibreApi();

            const targetId = typeof container === 'string' ? container : container.id;
            const targetEl = typeof container === 'string' ? document.getElementById(container) : container;
            if (!targetEl) throw new Error('Map container element not found');

            // MapLibre uses [lng, lat]
            const lngLatCenter = Array.isArray(center) ? center : [center.lng, center.lat];

            const map = new maplibregl.Map({
                container: targetEl,
                style: options.style || MAP_STYLE,
                center: lngLatCenter,
                zoom: zoom,
                attributionControl: false,
                ...(options.mapOptions || {})
            });

            // Add standard controls
            map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
            map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');
            map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

            // Responsive map resize
            const resizeObserver = new ResizeObserver(() => {
                if (map) map.resize();
            });
            resizeObserver.observe(targetEl);

            await new Promise((resolve) => {
                if (map.loaded()) resolve();
                else map.once('load', () => resolve());
            });

            return map;
        },

        /**
         * Create custom MapLibre marker
         */
        createMarker(lat, lng, options = {}) {
            const el = createMarkerElement(options);
            const markerOptions = { element: el };

            const marker = new maplibregl.Marker(markerOptions)
                .setLngLat([Number(lng), Number(lat)]);

            if (options.popupHtml) {
                const popup = new maplibregl.Popup({ offset: 25, closeButton: true })
                    .setHTML(options.popupHtml);
                marker.setPopup(popup);
            }

            return marker;
        },

        /**
         * Geocode place name using OpenStreetMap Nominatim & Photon (100% keyless)
         */
        async geocode(query) {
            if (!query || !query.trim()) throw new Error('Empty search query');

            // 1. Try Nominatim
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
                const res = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });
                if (res.ok) {
                    const items = await res.json();
                    if (items && items.length > 0) {
                        const first = items[0];
                        return {
                            lat: parseFloat(first.lat),
                            lng: parseFloat(first.lon),
                            display_name: first.display_name
                        };
                    }
                }
            } catch (e) {
                console.warn('Nominatim geocode failed, trying Photon:', e);
            }

            // 2. Fallback: Photon API
            try {
                const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
                const res2 = await fetch(photonUrl);
                if (res2.ok) {
                    const data = await res2.json();
                    if (data.features && data.features.length > 0) {
                        const first = data.features[0];
                        const [lng, lat] = first.geometry.coordinates;
                        const name = [first.properties.name, first.properties.city, first.properties.state, first.properties.country]
                            .filter(Boolean).join(', ');
                        return {
                            lat: lat,
                            lng: lng,
                            display_name: name || query
                        };
                    }
                }
            } catch (e2) {
                console.error('Photon geocode failed:', e2);
            }

            throw new Error(`Location not found: "${query}"`);
        },

        /**
         * Reverse geocode coordinates
         */
        async reverseGeocode(lat, lng) {
            try {
                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.display_name) {
                        return { lat, lng, display_name: data.display_name };
                    }
                }
            } catch (e) {
                console.warn('Reverse geocoding error:', e);
            }
            return { lat, lng, display_name: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
        },

        /**
         * Calculate 3 genuinely different real road routes via OSRM (100% keyless).
         * Strategy:
         *  1. Primary OSRM call with alternatives=true (returns up to 2).
         *  2. If fewer than 3 unique routes, call again via perpendicular waypoints
         *     to force OSRM onto different roads.
         *  3. Deduplicate by geometry similarity — keep only routes that are
         *     sufficiently different from each other.
         */
        async calculateRoutes(srcCoord, dstCoord) {
            if (!srcCoord || !dstCoord) throw new Error('Invalid coordinates provided');

            /**
             * Helper: parse OSRM response into route objects.
             */
            function parseOsrmRoutes(data, idOffset = 0) {
                if (!data || !data.routes || data.routes.length === 0) return [];
                return data.routes.map((route, index) => {
                    const distance_m = route.distance || 0;
                    const duration_s = route.duration || 0;
                    const distance_km = (distance_m / 1000).toFixed(2);
                    const duration_min = Math.max(1, Math.round(duration_s / 60));
                    const geojsonCoords = (route.geometry && route.geometry.coordinates) || [];
                    const coords = geojsonCoords.map(([lng, lat]) => ({ lat, lng }));
                    let summary = `Route ${idOffset + index + 1}`;
                    if (route.legs && route.legs[0] && route.legs[0].summary) {
                        summary = `via ${route.legs[0].summary}`;
                    }
                    // Collect turn-by-turn steps from all legs
                    const steps = [];
                    if (route.legs) {
                        route.legs.forEach(leg => {
                            if (leg.steps) steps.push(...leg.steps);
                        });
                    }
                    return {
                        id: 'route_' + (idOffset + index),
                        index: idOffset + index,
                        distance_m,
                        distance_km,
                        duration_min,
                        coords,
                        geojsonCoords,
                        summary,
                        steps, // OSRM maneuver steps for turn-by-turn
                        routeType: (idOffset + index) === 0 ? 'Primary' : `Alternative ${idOffset + index}`
                    };
                });
            }

            /**
             * Helper: fetch OSRM route via optional intermediate waypoint.
             * Returns parsed routes array or [].
             */
            async function fetchOsrm(src, dst, via = null) {
                try {
                    let coords;
                    if (via) {
                        coords = `${src.lng},${src.lat};${via.lng},${via.lat};${dst.lng},${dst.lat}`;
                    } else {
                        coords = `${src.lng},${src.lat};${dst.lng},${dst.lat}`;
                    }
                    // steps=true for primary call (no via) so we get turn-by-turn maneuvers
                    const stepsParam = via ? 'false' : 'true';
                    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=${via ? 'false' : 'true'}&steps=${stepsParam}`;
                    const res = await fetch(url);
                    if (!res.ok) return [];
                    const data = await res.json();
                    return data;
                } catch {
                    return null;
                }
            }

            /**
             * Helper: compute a simple "signature" of a route — sample a few
             * evenly-spaced coordinate pairs and hash them into a string.
             */
            function routeSignature(coords) {
                if (!coords || coords.length === 0) return '';
                const step = Math.max(1, Math.floor(coords.length / 8));
                const samples = [];
                for (let i = 0; i < coords.length; i += step) {
                    const [lng, lat] = coords[i];
                    samples.push(`${lat.toFixed(3)},${lng.toFixed(3)}`);
                }
                return samples.join('|');
            }

            /**
             * Helper: are two routes "sufficiently different"?
             * Compare mid-section coordinates — routes through different roads
             * will differ substantially at the midpoint.
             */
            function routesDiffer(a, b) {
                const midA = a.geojsonCoords[Math.floor(a.geojsonCoords.length / 2)];
                const midB = b.geojsonCoords[Math.floor(b.geojsonCoords.length / 2)];
                if (!midA || !midB) return true;
                const dLat = Math.abs(midA[1] - midB[1]);
                const dLng = Math.abs(midA[0] - midB[0]);
                // Routes are "different" if midpoints differ by more than ~200 metres (~0.002°)
                return (dLat + dLng) > 0.002;
            }

            /**
             * Generate perpendicular waypoints at different offsets to force
             * OSRM onto different road networks.
             */
            function perpendicularWaypoints(src, dst) {
                const midLat = (src.lat + dst.lat) / 2;
                const midLng = (src.lng + dst.lng) / 2;
                const dLat = dst.lat - src.lat;
                const dLng = dst.lng - src.lng;
                // Perpendicular vector (rotated 90°), normalised
                const len = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
                const perpLat = -dLng / len;
                const perpLng = dLat / len;
                const offsets = [0.012, -0.012, 0.02, -0.02, 0.008, -0.008];
                return offsets.map(o => ({
                    lat: midLat + perpLat * o,
                    lng: midLng + perpLng * o
                }));
            }

            // ── Step 1: Primary OSRM call with alternatives ──────────────────
            const primaryData = await fetchOsrm(srcCoord, dstCoord);
            if (!primaryData || !primaryData.routes || primaryData.routes.length === 0) {
                throw new Error('No driving routes found between selected locations');
            }

            let collected = parseOsrmRoutes(primaryData, 0);
            const seenSignatures = new Set(collected.map(r => routeSignature(r.geojsonCoords)));

            // ── Step 2: Try waypoint variants until we have 3 distinct routes ──
            if (collected.length < 3) {
                const waypoints = perpendicularWaypoints(srcCoord, dstCoord);
                for (const wp of waypoints) {
                    if (collected.length >= 3) break;
                    const altData = await fetchOsrm(srcCoord, dstCoord, wp);
                    if (!altData || !altData.routes || altData.routes.length === 0) continue;
                    const candidates = parseOsrmRoutes(altData, collected.length);
                    for (const candidate of candidates) {
                        if (collected.length >= 3) break;
                        const sig = routeSignature(candidate.geojsonCoords);
                        if (seenSignatures.has(sig)) continue;
                        // Must differ from ALL existing routes
                        const allDiffer = collected.every(existing => routesDiffer(candidate, existing));
                        if (!allDiffer) continue;
                        // Re-index to avoid ID collisions
                        candidate.id = 'route_' + collected.length;
                        candidate.index = collected.length;
                        candidate.routeType = `Alternative ${collected.length}`;
                        seenSignatures.add(sig);
                        collected.push(candidate);
                    }
                }
            }

            // ── Step 3: Return only genuine OSRM routes (no synthetic coordinate jittering) ──
            return collected.slice(0, 3);
        },

        /**
         * Add GeoJSON polyline and glow layer to map
         */
        addRouteLayer(map, routeId, geojsonCoords, options = {}) {
            const sourceId = `source-${routeId}`;
            const glowLayerId = `layer-${routeId}-glow`;
            const lineLayerId = `layer-${routeId}-line`;

            const strokeColor = options.color || '#10b981';
            const isSafest = options.isSafest || false;

            const geojsonData = {
                type: 'Feature',
                properties: { routeId: routeId },
                geometry: {
                    type: 'LineString',
                    coordinates: geojsonCoords
                }
            };

            if (map.getSource(sourceId)) {
                map.getSource(sourceId).setData(geojsonData);
                return;
            }

            map.addSource(sourceId, {
                type: 'geojson',
                data: geojsonData
            });

            // Background glow layer
            map.addLayer({
                id: glowLayerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': strokeColor,
                    'line-width': isSafest ? 12 : 8,
                    'line-opacity': isSafest ? 0.35 : 0.15
                }
            });

            // Foreground crisp line layer
            map.addLayer({
                id: lineLayerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': strokeColor,
                    'line-width': isSafest ? 6 : 4,
                    'line-opacity': isSafest ? 0.95 : 0.75
                }
            });

            // Interactive click
            if (options.onClick) {
                map.on('click', lineLayerId, () => options.onClick());
                map.on('mouseenter', lineLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', lineLayerId, () => { map.getCanvas().style.cursor = ''; });
            }
        },

        /**
         * Remove route layer from map
         */
        removeRouteLayer(map, routeId) {
            const sourceId = `source-${routeId}`;
            const glowLayerId = `layer-${routeId}-glow`;
            const lineLayerId = `layer-${routeId}-line`;

            if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
            if (map.getLayer(glowLayerId)) map.removeLayer(glowLayerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        },

        /**
         * Fit map bounds to coordinate list
         */
        fitBounds(map, coordsList) {
            if (!coordsList || coordsList.length === 0) return;
            const bounds = new maplibregl.LngLatBounds();
            coordsList.forEach(pt => {
                if (Array.isArray(pt)) {
                    bounds.extend([pt[0], pt[1]]);
                } else if (pt.lat !== undefined && pt.lng !== undefined) {
                    bounds.extend([pt.lng, pt.lat]);
                }
            });
            map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 800 });
        }
    };

    window.SecureStepMap = SecureStepMap;
    window.loadMapLibreApi = loadMapLibreApi;

    // Auto-load on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => loadMapLibreApi().catch(() => {}));
    } else {
        loadMapLibreApi().catch(() => {});
    }
})();
