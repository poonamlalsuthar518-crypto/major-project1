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

                const osrmRoutes = await window.Routing.findRoutes(srcCoord, dstCoord);

                // For each route compute safety score using demo data
                const enhanced = osrmRoutes.map(r=>{
                    const demoSafety = getCrimeRiskForRoute(r); // demo values
                    const community = getCommunityRiskForRoute(r);
                    const scoreObj = calculateSafetyScore(r, demoSafety);
                    const classification = classifyRoute(scoreObj.score);
                    return Object.assign({}, r, { safetyScore: scoreObj.score, safetyBreakdown: scoreObj.breakdown, communityRisk: community, classification: classification.label });
                });

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
        routes.forEach(r=>{
            const div = document.createElement('div');
            div.className = 'route-item card';
            const colorClass = r.safetyScore >=80 ? 'safe' : r.safetyScore >=60 ? 'moderate' : 'unsafe';
            div.style.borderLeft = `6px solid ${colorClass==='safe'? '#10b981' : colorClass==='moderate'? '#f59e0b' : '#ef4444'}`;
            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-weight:800">Route ${r.index+1} — ${r.classification}</div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <div class="badge ${colorClass}">${r.safetyScore}</div>
                        <button class="btn-ghost select-route" data-route="${r.id}">Preview</button>
                    </div>
                </div>
                <div style="display:flex;gap:12px;margin-top:8px;color:var(--muted)">
                    <div><i class="fas fa-route"></i> ${r.distance_km} km</div>
                    <div><i class="far fa-clock"></i> ${r.duration_min} min</div>
                    <div><i class="fas fa-exclamation-triangle"></i> Risk: ${r.classification}</div>
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
        // Update details panel
        if(info){
            document.getElementById('routeDistance').textContent = info.distance_km + ' km';
            document.getElementById('routeTime').textContent = info.duration_min + ' min';
            document.getElementById('routeRisk').textContent = info.classification;
            const explanation = generateExplanation(info);
            document.getElementById('routeExplanation').textContent = explanation;
            const badge = document.getElementById('overallSafetyBadge');
            badge.textContent = info.safetyScore + '/100';
            badge.className = 'badge ' + (info.safetyScore>=80 ? 'safe' : info.safetyScore>=60 ? 'moderate' : 'unsafe');
        }
    }

    function generateExplanation(info){
        // Simple dynamic explanation based on breakdown when available
        if(info.safetyBreakdown){
            const b = info.safetyBreakdown;
            if(b.crimePenalty + b.highRiskZonePenalty > 20) return 'This route passes near areas with reported incidents; score lowered due to crime-related penalties.';
            if(b.distancePenalty > 5) return 'This route is longer but passes through safer main roads.';
            return 'Lower crime risk detected along this route. Fewer CivicSense reports found near this route.';
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
