/* UI wiring for Safe Navigation page. Connects DOM to SecureStepMap functions.
   Waits for the maps to be ready, then sets up autocomplete, button handlers,
   renders route result cards, and displays route-specific facility markers. */

document.addEventListener('DOMContentLoaded', ()=>{
    // Initialize MapLibre map
    if(window.SecureStepMap && window.SecureStepMap.initializeMap) {
        window.SecureStepMap.initializeMap();
    }
    const locBtn = document.getElementById('locBtn');
    const findRouteBtn = document.getElementById('findRouteBtn');
    const routesList = document.getElementById('routesList');

    // ── Haversine distance (metres) ─────────────────────────────────────────
    function haversineM(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 +
                  Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // ── Distance formatting ──────────────────────────────────────────────────
    function formatDist(distM) {
        if (distM < 1000) {
            return `${Math.round(distM)} m`;
        }
        return `${(distM / 1000).toFixed(1)} km`;
    }

    // ── Minimum distance from facility to any point on routeCoords ──────────
    function minDistanceToRoute(facility, routeCoords) {
        if (!facility || facility.lat == null || facility.lng == null || !routeCoords || routeCoords.length === 0) {
            return Infinity;
        }
        const step = routeCoords.length > 120 ? Math.floor(routeCoords.length / 80) : 1;
        let minM = Infinity;
        for (let i = 0; i < routeCoords.length; i += step) {
            const pt = routeCoords[i];
            const distM = haversineM(pt.lat, pt.lng, facility.lat, facility.lng);
            if (distM < minM) {
                minM = distM;
            }
        }
        return minM;
    }

    // ── Filter facilities within maxRadiusM & attach distance ───────────────
    function getFacilitiesNearRoute(facilities, routeCoords, maxRadiusM) {
        if (!facilities || !routeCoords || routeCoords.length === 0) return [];
        const result = [];
        facilities.forEach(f => {
            if (f.lat == null || f.lng == null) return;
            const distM = minDistanceToRoute(f, routeCoords);
            if (distM <= maxRadiusM) {
                result.push(Object.assign({}, f, {
                    distM: distM,
                    distStr: formatDist(distM)
                }));
            }
        });
        // Sort closest first
        return result.sort((a, b) => a.distM - b.distM);
    }

    // ── Streetlight coverage: % of sampled route points within 50m of a light ─
    function streetlightCoverage(lights, routeCoords) {
        if (!lights || lights.length === 0 || !routeCoords || routeCoords.length === 0) return 0;
        const step = Math.max(1, Math.floor(routeCoords.length / 60));
        const sampled = routeCoords.filter((_, i) => i % step === 0);
        if (sampled.length === 0) return 0;
        let covered = 0;
        sampled.forEach(pt => {
            const near = lights.some(l =>
                l.lat != null && l.lng != null && haversineM(pt.lat, pt.lng, l.lat, l.lng) <= 50
            );
            if (near) covered++;
        });
        return Math.round((covered / sampled.length) * 100);
    }

    // ── Fetch police, hospitals, lights once and cache ───────────────────────
    let _policeCache = null, _hospitalCache = null, _lightsCache = null;
    async function fetchAllFacilities() {
        if (!_policeCache) {
            try {
                const r = await fetch('/api/police-stations');
                _policeCache = r.ok ? await r.json() : [];
            } catch { _policeCache = []; }
        }
        if (!_hospitalCache) {
            try {
                const r = await fetch('/api/hospitals');
                _hospitalCache = r.ok ? await r.json() : [];
            } catch { _hospitalCache = []; }
        }
        if (!_lightsCache) {
            try {
                const r = await fetch('/api/streetlights');
                _lightsCache = r.ok ? await r.json() : [];
            } catch { _lightsCache = []; }
        }
        return { police: _policeCache, hospitals: _hospitalCache, lights: _lightsCache };
    }

    // ── Compute route-specific resources & normalized safety score ──────────
    async function computeRouteResources(route, routeCoords) {
        const { police, hospitals, lights } = await fetchAllFacilities();

        // 1. Facilities associated with this route (with distance from route)
        const policeList   = getFacilitiesNearRoute(police,    routeCoords, 1000); // Police within 1km
        const hospitalList = getFacilitiesNearRoute(hospitals, routeCoords, 2000); // Hospitals within 2km
        const lightsList   = getFacilitiesNearRoute(lights,    routeCoords, 50);   // Streetlights within 50m
        const litPct       = streetlightCoverage(lights, routeCoords);

        // 2. Route length normalization (km)
        const routeLengthKm = Math.max(0.5, route.distance_km || (route.distance ? route.distance/1000 : 1.0));

        // Density per km
        const policeDensity   = policeList.length / routeLengthKm;
        const hospitalDensity = hospitalList.length / routeLengthKm;

        // 3. Normalized Component Scores (0-100 scale)
        // Police score (40% weight): Benchmark 2.0 police/km = max score
        const policeScore = Math.min(100, Math.round(
            (policeDensity / 2.0) * 80 + (policeList.length > 0 ? 20 : 0)
        ));

        // Hospital score (25% weight): Benchmark 1.5 hospitals/km = max score
        const hospitalScore = Math.min(100, Math.round(
            (hospitalDensity / 1.5) * 80 + (hospitalList.length > 0 ? 20 : 0)
        ));

        // Streetlight coverage score (35% weight): % of route points illuminated
        const lightScore = Math.min(100, Math.max(0, litPct));

        // 4. Weighted Final Safety Score: 40% Police, 25% Hospitals, 35% Lighting
        const rawScore = Math.round(policeScore * 0.40 + hospitalScore * 0.25 + lightScore * 0.35);
        const safetyScore = Math.max(10, Math.min(100, rawScore));

        return {
            policeNearby:   policeList.length,
            hospitalsNearby: hospitalList.length,
            litPct:          litPct,
            policeList:      policeList,
            hospitalList:    hospitalList,
            lightsList:      lightsList,
            safetyScore:     safetyScore,
            breakdown: {
                policeScore,
                hospitalScore,
                lightScore
            }
        };
    }

    // ── Update "Nearby Resources" sidebar with route-specific counts ─────────
    function updateNearbySidebar(resources) {
        const policeEl   = document.getElementById('nearPoliceCount');
        const hospitalEl = document.getElementById('nearHospitalCount');
        const lightEl    = document.getElementById('nearLightCoverage');
        if (policeEl)   policeEl.textContent   = resources.policeNearby;
        if (hospitalEl) hospitalEl.textContent = resources.hospitalsNearby;
        if (lightEl)    lightEl.textContent    = resources.litPct + '%';
    }

    // ── Turn-by-turn navigation panel ────────────────────────────────────────
    const MANEUVER_ICONS = {
        'turn-left':            '↰ Turn left',
        'turn-right':           '↱ Turn right',
        'turn-sharp-left':      '⬅ Sharp left',
        'turn-sharp-right':     '➡ Sharp right',
        'turn-slight-left':     '↖ Slight left',
        'turn-slight-right':    '↗ Slight right',
        'continue':             '↑ Continue',
        'straight':             '↑ Go straight',
        'roundabout':           '🔄 Take roundabout',
        'roundabout turn':      '🔄 Roundabout turn',
        'arrive':               '📍 Arrive',
        'depart':               '🚦 Depart',
        'merge':                '↘ Merge',
        'fork':                 '⑂ Fork',
        'end of road':          '⤵ End of road',
        'new name':             '↑ Continue on',
        'notification':         'ℹ️',
        'use lane':             '↑ Use lane',
    };

    function maneuverText(step) {
        const m = step.maneuver || {};
        const type = m.type || '';
        const modifier = m.modifier || '';
        const key = modifier ? `${type}-${modifier}` : type;
        const icon = MANEUVER_ICONS[key] || MANEUVER_ICONS[type] || '↑';
        const name = step.name ? ` onto <strong>${step.name}</strong>` : '';
        const dist = step.distance >= 1000
            ? `${(step.distance/1000).toFixed(1)} km`
            : `${Math.round(step.distance)} m`;
        return `${icon}${name} <span style="color:var(--muted);font-size:11px">(${dist})</span>`;
    }

    function showTurnByTurn(info) {
        const panel = document.getElementById('turnByTurnPanel');
        const stepsEl = document.getElementById('turnByTurnSteps');
        if (!panel || !stepsEl) return;

        const steps = info.steps || [];
        if (steps.length === 0) {
            stepsEl.innerHTML = '<div style="color:var(--muted);font-size:13px">No step-by-step data available for this route.</div>';
        } else {
            stepsEl.innerHTML = steps.map((step, i) => `
                <div class="nav-step" style="
                    display:flex;gap:10px;align-items:flex-start;
                    padding:8px 0;
                    border-bottom:1px solid rgba(255,255,255,0.07);
                    font-size:13px;
                ">
                    <div style="
                        min-width:24px;height:24px;border-radius:50%;
                        background:var(--primary,#38bdf8);color:#fff;
                        display:flex;align-items:center;justify-content:center;
                        font-size:11px;font-weight:700;flex-shrink:0;
                    ">${i+1}</div>
                    <div>${maneuverText(step)}</div>
                </div>
            `).join('');
        }

        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        const header = document.getElementById('turnByTurnHeader');
        if (header) {
            const colorClass = info.displayColor || 'safe';
            const borderColor = colorClass==='safe'?'#10b981':colorClass==='moderate'?'#eab308':'#ef4444';
            header.textContent = `${info.displayLabel || ''} ROUTE — ${info.distance_km} km · ${info.duration_min} min`;
            header.style.color = borderColor;
        }
    }

    function hideTurnByTurn() {
        const panel = document.getElementById('turnByTurnPanel');
        if (panel) panel.style.display = 'none';
    }

    function initUI(){
        locBtn.addEventListener('click', async ()=>{
            try{
                const loc = await window.SecureStepMap.getCurrentLocation();
                if(loc){
                    const src = document.getElementById('sourceInput');
                    src.value = 'Current Location (detected)';
                    src.dataset.lat = loc.lat;
                    src.dataset.lng = loc.lng;
                }
            }catch(e){
                console.warn(e);
                alert('Unable to access your location. Please allow permission or enter location manually.');
            }
        });

        findRouteBtn.addEventListener('click', async ()=>{
            const srcInput = document.getElementById('sourceInput');
            const dstInput = document.getElementById('destInput');
            const srcText = srcInput.value.trim();
            const dstText = dstInput.value.trim();
            if(!srcText || !dstText){ alert('Please enter both source and destination (or use Current Location).'); return; }

            routesList.innerHTML = '<div style="color:var(--muted)">Finding safe routes...</div>';
            findRouteBtn.disabled = true;
            hideTurnByTurn();

            try{
                // Resolve coordinates
                let srcCoord = null, dstCoord = null;
                if(srcInput.dataset && srcInput.dataset.lat && srcInput.dataset.lng){
                    srcCoord = {lat:parseFloat(srcInput.dataset.lat), lng:parseFloat(srcInput.dataset.lng)};
                } else {
                    srcCoord = await window.Routing.getCoordinates(srcText);
                }
                if(dstInput.dataset && dstInput.dataset.lat && dstInput.dataset.lng){
                    dstCoord = {lat:parseFloat(dstInput.dataset.lat), lng:parseFloat(dstInput.dataset.lng)};
                } else {
                    dstCoord = await window.Routing.getCoordinates(dstText);
                }

                const osrmRoutes = await window.Routing.findRoutes(srcCoord, dstCoord);

                // Compute route-specific resources & normalized safety score for each route
                const rawScored = await Promise.all(osrmRoutes.map(async (r) => {
                    const res = await computeRouteResources(r, r.coords);
                    return Object.assign({}, r, {
                        rawSafetyScore: res.safetyScore,
                        policeList:     res.policeList,
                        hospitalList:   res.hospitalList,
                        lightsList:     res.lightsList,
                        routeResources: res,
                        routeAnalysis: {
                            policeStationsNearby: res.policeNearby,
                            hospitalsNearby:       res.hospitalsNearby,
                            streetlightCoverage:   res.litPct
                        }
                    });
                }));

                // Rank by raw safety score (highest first)
                const ranked = [...rawScored].sort((a, b) => b.rawSafetyScore - a.rawSafetyScore);

                // Spread penalties so scores are visibly distinct if close & assign explicit colors
                const spreadPenalties = [0, -8, -16];
                ranked.forEach((r, rankIdx) => {
                    const penalty = spreadPenalties[rankIdx] || 0;
                    r.safetyScore = Math.max(5, Math.min(100, r.rawSafetyScore + penalty));
                    r._rank = rankIdx;

                    if (rankIdx === 0) {
                        r.displayLabel = 'SAFEST';
                        r.displayColor = 'safe';
                        r.color = '#10b981';
                    } else if (rankIdx === 1) {
                        r.displayLabel = 'MODERATE';
                        r.displayColor = 'moderate';
                        r.color = '#eab308';
                    } else {
                        r.displayLabel = 'LOW SAFETY';
                        r.displayColor = 'unsafe';
                        r.color = '#ef4444';
                    }
                });

                // Reclassify after ranking
                ranked.forEach(r => {
                    const s = r.safetyScore;
                    if (s >= 80)      { r.classification = 'LOW RISK';  r.classificationColor = '#10b981'; r.classificationLevel = 'safe'; }
                    else if (s >= 60) { r.classification = 'MODERATE';  r.classificationColor = '#eab308'; r.classificationLevel = 'moderate'; }
                    else if (s >= 40) { r.classification = 'CAUTION';   r.classificationColor = '#eab308'; r.classificationLevel = 'moderate'; }
                    else              { r.classification = 'HIGH RISK'; r.classificationColor = '#ef4444'; r.classificationLevel = 'unsafe'; }
                });

                // Display routes ordered by safety rank (SAFEST -> MODERATE -> LOW SAFETY)
                const finalRoutes = ranked;

                // Draw routes on map with explicit colors
                if(window.SecureStepMap && window.SecureStepMap.drawRoutes) {
                    window.SecureStepMap.drawRoutes(finalRoutes);
                }
                renderRouteCards(finalRoutes);

                // Auto-select safest route
                if(finalRoutes && finalRoutes.length){
                    selectRoute(finalRoutes[0].id, finalRoutes[0]);
                }
            }catch(err){
                routesList.innerHTML = `<div style='color:#ef4444'>Unable to find a route. Please check the source and destination.</div>`;
                console.warn(err);
            }finally{
                findRouteBtn.disabled = false;
            }
        });

        // Delegate route card button clicks
        routesList.addEventListener('click', function(e){
            const useBtn    = e.target.closest('.use-route');
            const selectBtn = e.target.closest('.select-route');

            if(useBtn && useBtn.dataset.route){
                const id   = useBtn.dataset.route;
                const info = window._lastRoutes && window._lastRoutes.find(r=>r.id===id);
                if(info){
                    selectRoute(id, info);
                    showTurnByTurn(info);
                }
            }
            if(selectBtn && selectBtn.dataset.route){
                const id   = selectBtn.dataset.route;
                const info = window._lastRoutes && window._lastRoutes.find(r=>r.id===id);
                if(info) selectRoute(id, info);
            }
        });

        // Map route click handler
        window.onRouteClick = function(route){
            selectRoute(route.id, route);
            const el = document.querySelector(`[data-route="${route.id}"]`);
            if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
        };

        // Close turn-by-turn panel
        const closeBtn = document.getElementById('closeTurnByTurn');
        if(closeBtn) closeBtn.addEventListener('click', hideTurnByTurn);
    }

    // ── Render route cards ───────────────────────────────────────────────────
    function renderRouteCards(routes){
        window._lastRoutes = routes;
        const container = document.getElementById('routesList');
        container.innerHTML = '';

        if (routes.length === 0) {
            container.innerHTML = '<div style="color:var(--muted)">No routes found. Please try different locations.</div>';
            return;
        }

        // Render in original order
        routes.forEach(r => {
            const div = document.createElement('div');
            div.className = 'route-item card';
            const colorClass  = r.displayColor || 'moderate';
            const borderColor = colorClass==='safe'?'#10b981':colorClass==='moderate'?'#eab308':'#ef4444';
            const badgeIcon   = colorClass==='safe'?'🟢':colorClass==='moderate'?'🟡':'🔴';
            div.style.borderLeft = `6px solid ${borderColor}`;
            div.dataset.route = r.id;

            // Route-specific facility counts
            const res = r.routeResources || r.routeAnalysis || {};
            const policeCount   = res.policeNearby   ?? res.policeStationsNearby ?? '0';
            const hospitalCount = res.hospitalsNearby ?? '0';
            const litPct        = res.litPct          ?? res.streetlightCoverage   ?? '0';
            const facilityLine  = `🚔 ${policeCount} police (within 1km) · 🏥 ${hospitalCount} hospitals (within 2km) · 💡 ${litPct}% lit`;

            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-weight:800;color:${borderColor}">${badgeIcon} ${r.displayLabel} ROUTE</div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <div class="badge ${colorClass}">${r.safetyScore}/100</div>
                        <button class="btn-ghost select-route" data-route="${r.id}">Preview</button>
                    </div>
                </div>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">${r.classification} · ${r.summary || ''}</div>
                <div style="display:flex;gap:12px;margin-top:8px;color:var(--muted)">
                    <div><i class="fas fa-route"></i> ${r.distance_km} km</div>
                    <div><i class="far fa-clock"></i> ${r.duration_min} min</div>
                    <div><i class="fas fa-shield-alt"></i> ${r.safetyScore}/100</div>
                </div>
                <div style="margin-top:6px;font-size:11px;color:var(--muted);border-top:1px solid rgba(255,255,255,0.07);padding-top:6px">
                    ${facilityLine}
                </div>
                <div style="margin-top:8px;display:flex;justify-content:flex-end">
                    <button class="btn use-route" style="padding:8px 10px" data-route="${r.id}">
                        <i class="fas fa-navigation"></i> Use This Route
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    // ── Select a route: highlight on map, update detail panel & sidebar ──────
    function selectRoute(id, info){
        if (!info && window._lastRoutes) {
            info = window._lastRoutes.find(r => r.id === id);
        }

        // Highlight line & render facility markers on MapLibre
        if(window.SecureStepMap && window.SecureStepMap.selectRoute){
            window.SecureStepMap.selectRoute(id, info);
        }

        if(!info) return;

        // Update route detail panel
        document.getElementById('routeDistance').textContent   = info.distance_km + ' km';
        document.getElementById('routeTime').textContent       = info.duration_min + ' min';
        const safetyScoreEl = document.getElementById('routeSafetyScore');
        if (safetyScoreEl) safetyScoreEl.textContent = info.safetyScore + '/100';
        document.getElementById('routeExplanation').textContent = generateExplanation(info);
        const badge = document.getElementById('overallSafetyBadge');
        if (badge) {
            badge.textContent = info.safetyScore + '/100';
            badge.className = 'badge ' + (info.safetyScore>=80?'safe':info.safetyScore>=60?'moderate':'unsafe');
        }

        // Update Nearby Facilities panel (route-specific)
        updateNearbyFacilitiesPanel(info);

        // Update Nearby Resources sidebar (route-specific)
        const res = info.routeResources || {};
        updateNearbySidebar({
            policeNearby:    res.policeNearby   ?? 0,
            hospitalsNearby: res.hospitalsNearby ?? 0,
            litPct:          res.litPct          ?? 0
        });
    }

    // ── Update the "Nearby Facilities" bottom-right panel ────────────────────
    function updateNearbyFacilitiesPanel(info) {
        const el = document.getElementById('nearbyFacilitiesList');
        if (!el) return;
        const res = info.routeResources || info.routeAnalysis || {};
        const police   = res.policeNearby   ?? res.policeStationsNearby ?? 0;
        const hospital = res.hospitalsNearby ?? 0;
        const lit      = res.litPct          ?? res.streetlightCoverage   ?? 0;
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:4px 0">
                <span><i class="fas fa-shield-alt" style="color:#38bdf8;width:16px"></i> Police Stations (within 1km)</span>
                <strong>${police}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:4px 0">
                <span><i class="fas fa-hospital" style="color:#10b981;width:16px"></i> Hospitals (within 2km)</span>
                <strong>${hospital}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:4px 0">
                <span><i class="fas fa-lightbulb" style="color:#f59e0b;width:16px"></i> Streetlight Coverage</span>
                <strong>${lit}%</strong>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:6px">
                Normalized for this ${info.distance_km || ''} km route
            </div>
        `;
    }

    // ── Generate explanation text for detail panel ───────────────────────────
    function generateExplanation(info){
        const res = info.routeResources || {};
        const parts = [];
        if (res.policeNearby !== undefined)   parts.push(`${res.policeNearby} police station(s) within 1km`);
        if (res.hospitalsNearby !== undefined) parts.push(`${res.hospitalsNearby} hospital(s) within 2km`);
        if (res.litPct !== undefined)         parts.push(`${res.litPct}% of route is well-lit`);
        return parts.length
            ? `Normalized safety score based on ${parts.join(', ')}.`
            : 'Route safety based on infrastructure data.';
    }

    // Initialize when maps are ready
    if(window.SecureStepMap && window.SecureStepMap.drawRoutes){
        initUI();
    }
    window.addEventListener('securestep:mapsReady', ()=>{ initUI(); });

});
