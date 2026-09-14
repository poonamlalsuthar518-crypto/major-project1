/* UI wiring for Safe Navigation page. Connects DOM to SecureStepMaps functions.
   Waits for the maps to be ready, then sets up autocomplete, button handlers,
   and renders route result cards. */

document.addEventListener('DOMContentLoaded', ()=>{
    // Initialize Leaflet map
    if(window.SecureStepMaps && window.SecureStepMaps.initializeMap) window.SecureStepMaps.initializeMap();
    const locBtn = document.getElementById('locBtn');
    const findRouteBtn = document.getElementById('findRouteBtn');
    const routesList = document.getElementById('routesList');

    function initUI(){
        locBtn.addEventListener('click', async ()=>{
            try{
                const loc = await window.SecureStepMaps.getCurrentLocation();
                // update source input with coordinates if available
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

            try{
                // Resolve coordinates (prefer dataset lat/lng if current location used)
                let srcCoord = null, dstCoord = null;
                if(srcInput.dataset && srcInput.dataset.lat && srcInput.dataset.lng){ srcCoord = {lat:parseFloat(srcInput.dataset.lat), lng:parseFloat(srcInput.dataset.lng)}; }
                else{ srcCoord = await window.Routing.getCoordinates(srcText); }
                if(dstInput.dataset && dstInput.dataset.lat && dstInput.dataset.lng){ dstCoord = {lat:parseFloat(dstInput.dataset.lat), lng:parseFloat(dstInput.dataset.lng)}; }
                else{ dstCoord = await window.Routing.getCoordinates(dstText); }

                // Show nearby central precinct locations for source and destination
                if(window.dashboardMap){
                    await window.dashboardMap.showNearbyPrecincts(srcCoord, dstCoord);
                }

                const osrmRoutes = await window.Routing.findRoutes(srcCoord, dstCoord);

                // For each route compute safety score using the new SafetyScoreService
                const enhanced = await Promise.all(osrmRoutes.map(async (r) => {
                    let safetyResult;
                    if (window.SafetyScoreService) {
                        safetyResult = await window.SafetyScoreService.calculateSafetyScore(r, r.coords);
                    } else {
                        // Fallback to old method if service not available
                        const analysis = analyzeRouteSafety(r, r.coords);
                        const scoreObj = calculateSafetyScore(r, analysis);
                        const classification = classifyRoute(scoreObj.score);
                        const recommendations = generateSafetyRecommendations(analysis, scoreObj.score);
                        safetyResult = {
                            score: scoreObj.score,
                            riskLevel: classification,
                            factors: scoreObj.analysis,
                            explanation: recommendations.join(' '),
                            breakdown: scoreObj.breakdown
                        };
                    }
                    
                    return Object.assign({}, r, { 
                        safetyScore: safetyResult.score, 
                        safetyBreakdown: safetyResult.breakdown,
                        routeAnalysis: safetyResult.factors,
                        safetyRecommendations: [safetyResult.explanation],
                        classification: safetyResult.riskLevel.label,
                        classificationLevel: safetyResult.riskLevel.level,
                        classificationColor: safetyResult.riskLevel.color
                    });
                }));

                // Draw routes on map
                window.SecureStepMaps.drawRoutes(enhanced);
                renderRouteCards(enhanced);

                if(enhanced && enhanced.length){
                    const best = enhanced.slice().sort((a,b)=>b.safetyScore - a.safetyScore)[0];
                    selectRoute(best.id, best);
                }
            }catch(err){
                routesList.innerHTML = `<div style='color:#ef4444'>Unable to find a route. Please check the source and destination.</div>`;
                console.warn(err);
            }finally{
                findRouteBtn.disabled = false;
            }
        });

        // Delegate clicks for route cards
        routesList.addEventListener('click', function(e){
            const useBtn = e.target.closest('.use-route');
            const selectBtn = e.target.closest('.select-route');
            if(useBtn && useBtn.dataset.route){
                const id = useBtn.dataset.route;
                const info = window._lastRoutes && window._lastRoutes.find(r=>r.id===id);
                if(info){
                    selectRoute(id, info);
                    alert('You selected the recommended route. (Turn-by-turn navigation TODO)');
                }
            }
            if(selectBtn && selectBtn.dataset.route){
                const id = selectBtn.dataset.route;
                const info = window._lastRoutes && window._lastRoutes.find(r=>r.id===id);
                if(info) selectRoute(id, info);
            }
        });

        // Map route click handler
        window.onRouteClick = function(route){
            // When a route on the map is clicked, select it
            selectRoute(route.id, route);
            // Scroll to routes list and highlight
            const el = document.querySelector(`[data-route="${route.id}"]`);
            if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
        };
    }

    function renderRouteCards(routes){
        window._lastRoutes = routes;
        const container = document.getElementById('routesList');
        container.innerHTML = '';
        
        if (routes.length === 0) {
            container.innerHTML = '<div style="color:var(--muted)">No routes found. Please try different locations.</div>';
            return;
        }

        // Sort routes by safety score (highest first)
        const sortedRoutes = [...routes].sort((a,b) => b.safetyScore - a.safetyScore);
        
        // Assign labels based on sorted order and total count
        sortedRoutes.forEach((r, idx) => {
            if (idx === 0) {
                r.displayLabel = 'SAFEST';
                r.displayColor = 'safe';
            } else if (idx === 1) {
                r.displayLabel = 'ALTERNATIVE';
                r.displayColor = 'moderate';
            } else {
                r.displayLabel = 'OPTION';
                r.displayColor = 'moderate';
            }
        });
        
        // Render in original order but with assigned labels
        routes.forEach(r=>{
            const div = document.createElement('div');
            div.className = 'route-item card';
            const colorClass = r.displayColor;
            div.style.borderLeft = `6px solid ${colorClass==='safe'? '#10b981' : colorClass==='moderate'? '#f59e0b' : '#ef4444'}`;
            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-weight:800">${r.displayLabel} ROUTE — ${r.classification}</div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <div class="badge ${colorClass}">${r.safetyScore}/100</div>
                        <button class="btn-ghost select-route" data-route="${r.id}">Preview</button>
                    </div>
                </div>
                <div style="display:flex;gap:12px;margin-top:8px;color:var(--muted)">
                    <div><i class="fas fa-route"></i> ${r.distance_km} km</div>
                    <div><i class="far fa-clock"></i> ${r.duration_min} min</div>
                    <div><i class="fas fa-shield-alt"></i> ${r.displayLabel}</div>
                </div>
                <div style="margin-top:8px;font-size:12px;color:var(--muted)">
                    <i class="fas fa-check-circle"></i> Real route from Google Maps
                </div>
                <div style="margin-top:8px;display:flex;justify-content:flex-end">
                    <button class="btn" style="padding:8px 10px" data-route="${r.id}" class="use-route" data-route-2="${r.id}">Use This Route</button>
                </div>
            `;
            // Fix 'Use This Route' dataset attribute
            const useBtn = div.querySelector('button.btn');
            useBtn.classList.add('use-route');
            useBtn.dataset.route = r.id;

            container.appendChild(div);
        });
    }

    function selectRoute(id, info){
        // Tell map to highlight
        if(window.SecureStepMaps && window.SecureStepMaps.selectRoute){
            window.SecureStepMaps.selectRoute(id);
        }
        
        // Display police stations along the selected route
        if(window.dashboardMap && info.coords){
            window.dashboardMap.displayPoliceStationsAlongRoute(info.coords, id);
        }
        
        // Update details panel
        if(info){
            document.getElementById('routeDistance').textContent = info.distance_km + ' km';
            document.getElementById('routeTime').textContent = info.duration_min + ' min';
            const safetyScoreEl = document.getElementById('routeSafetyScore');
            if (safetyScoreEl) {
                safetyScoreEl.textContent = info.safetyScore + '/100';
            }
            const explanation = generateExplanation(info);
            document.getElementById('routeExplanation').textContent = explanation;
            const badge = document.getElementById('overallSafetyBadge');
            badge.textContent = info.safetyScore + '/100';
            badge.className = 'badge ' + (info.safetyScore>=80 ? 'safe' : info.safetyScore>=60 ? 'moderate' : 'unsafe');
        }
    }

    function generateExplanation(info){
        // Enhanced explanation based on comprehensive route analysis
        if(info.safetyRecommendations && info.safetyRecommendations.length > 0){
            return info.safetyRecommendations.join(' ');
        }
        if(info.safetyBreakdown){
            const b = info.safetyBreakdown;
            if(b.lightingPenalty > 10) return 'This route has limited streetlight coverage. Consider alternative during nighttime.';
            if(b.policeBonus < 5) return 'Police stations are not nearby on this route. Ensure phone is charged for emergencies.';
            if(b.distancePenalty > 5) return 'This route is longer but passes through safer main roads.';
            return 'This route has good safety infrastructure coverage.';
        }
        return 'Recommended because this route has a higher safety score.';
    }

    // Initialize when maps are ready
    if(window.SecureStepMaps){
        // If maps already loaded
        initUI();
    }
    window.addEventListener('securestep:mapsReady', ()=>{ initUI(); });

});
