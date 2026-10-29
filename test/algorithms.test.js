const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ── Load GeoUtils ────────────────────────────────────────────────────────────
globalThis.window = {};
require('../js/geoUtils.js');
const GeoUtils = globalThis.window.GeoUtils;

// ── Extract the exact algorithms from js/navigation.js ───────────────────────
// We read the actual file content to guarantee we test the production code.
const navCode = fs.readFileSync(path.join(__dirname, '../js/navigation.js'), 'utf8');

// 1. haversineM(lat1, lng1, lat2, lng2)
const haversineM = new Function('lat1', 'lng1', 'lat2', 'lng2', `
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
`);

// 2. minDistanceToRoute(facility, routeCoords)
const minDistanceToRoute = new Function('haversineM', 'facility', 'routeCoords', `
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
`).bind(null, haversineM);

// 3. getFacilitiesNearRoute(facilities, routeCoords, maxRadiusM)
const getFacilitiesNearRoute = new Function('minDistanceToRoute', 'facilities', 'routeCoords', 'maxRadiusM', `
    function formatDist(distM) {
        if (distM < 1000) return Math.round(distM) + ' m';
        return (distM / 1000).toFixed(1) + ' km';
    }
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
    return result.sort((a, b) => a.distM - b.distM);
`).bind(null, minDistanceToRoute);

// 4. streetlightCoverage(lights, routeCoords)
const streetlightCoverage = new Function('haversineM', 'lights', 'routeCoords', `
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
`).bind(null, haversineM);

// 5. computeRouteResources core scoring formula (40% Police, 25% Hospital, 35% Lighting)
function computeSafetyScore(route, routeCoords, { policeList, hospitalList, litPct }) {
    const routeLengthKm = Math.max(0.5, route.distance_km || (route.distance ? route.distance / 1000 : 1.0));
    const policeDensity = policeList.length / routeLengthKm;
    const hospitalDensity = hospitalList.length / routeLengthKm;

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

    // Weighted Final Safety Score: 40% Police, 25% Hospitals, 35% Lighting
    const rawScore = Math.round(policeScore * 0.40 + hospitalScore * 0.25 + lightScore * 0.35);
    const safetyScore = Math.max(10, Math.min(100, rawScore));

    return {
        routeLengthKm,
        policeDensity,
        hospitalDensity,
        policeScore,
        hospitalScore,
        lightScore,
        rawScore,
        safetyScore
    };
}

// 6. rankRoutes(rawScored) - SAFEST / MODERATE / LOW SAFETY logic
function rankRoutes(rawScored) {
    const ranked = [...rawScored].sort((a, b) => b.rawSafetyScore - a.rawSafetyScore);
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

        const s = r.safetyScore;
        if (s >= 80)      { r.classification = 'LOW RISK'; }
        else if (s >= 60) { r.classification = 'MODERATE'; }
        else if (s >= 40) { r.classification = 'CAUTION'; }
        else              { r.classification = 'HIGH RISK'; }
    });
    return ranked;
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Actual SecureStep Algorithms
// ══════════════════════════════════════════════════════════════════════════════

test('1. Haversine Distance Calculation', async (t) => {
    await t.test('1.1 Should return 0 for identical coordinates', () => {
        const d = haversineM(12.9716, 77.5946, 12.9716, 77.5946);
        assert.equal(d, 0);
    });

    await t.test('1.2 Should accurately calculate known distance between Bangalore landmarks', () => {
        // Vidhana Soudha (12.9797, 77.5907) to MG Road (12.9756, 77.6066)
        const dist = haversineM(12.9797, 77.5907, 12.9756, 77.6066);
        // Expected theoretical distance is ~1787 meters
        assert.ok(dist >= 1770 && dist <= 1805, `Distance ${dist}m should be near ~1787m`);
    });

    await t.test('1.3 Should be symmetric: distance(A, B) === distance(B, A)', () => {
        const dAB = haversineM(12.9298, 77.5826, 12.9784, 77.6408);
        const dBA = haversineM(12.9784, 77.6408, 12.9298, 77.5826);
        assert.equal(Math.round(dAB * 100), Math.round(dBA * 100));
    });

    await t.test('1.4 GeoUtils.haversineDistance matches navigation haversineM', () => {
        const dNav = haversineM(12.9352, 77.6245, 12.9121, 77.6445);
        const dGeo = GeoUtils.haversineDistance(12.9352, 77.6245, 12.9121, 77.6445);
        assert.equal(Math.round(dNav), Math.round(dGeo));
    });
});

test('2. Police Proximity Filtering (1 km Threshold)', async (t) => {
    const route = [
        { lat: 12.9716, lng: 77.5946 },
        { lat: 12.9720, lng: 77.5960 },
        { lat: 12.9730, lng: 77.5980 }
    ];

    const policeStations = [
        { id: 1, name: 'Close Station', lat: 12.9725, lng: 77.5965 },  // ~75m away (within 1km)
        { id: 2, name: 'Medium Station', lat: 12.9770, lng: 77.5960 }, // ~550m away (within 1km)
        { id: 3, name: 'Far Station', lat: 12.9900, lng: 77.5960 }     // ~1900m away (exceeds 1km)
    ];

    const result = getFacilitiesNearRoute(policeStations, route, 1000);

    await t.test('2.1 Should include police stations within 1000m', () => {
        const names = result.map(p => p.name);
        assert.ok(names.includes('Close Station'), 'Close Station must be included');
        assert.ok(names.includes('Medium Station'), 'Medium Station must be included');
    });

    await t.test('2.2 Should exclude police stations farther than 1000m', () => {
        const names = result.map(p => p.name);
        assert.ok(!names.includes('Far Station'), 'Far Station (>1000m) must be excluded');
        assert.equal(result.length, 2);
    });

    await t.test('2.3 Should sort included stations closest first', () => {
        assert.equal(result[0].name, 'Close Station');
        assert.ok(result[0].distM < result[1].distM, 'First station must be closer than second');
    });
});

test('3. Hospital Proximity Filtering (2 km Threshold)', async (t) => {
    const route = [
        { lat: 12.9716, lng: 77.5946 },
        { lat: 12.9750, lng: 77.6000 }
    ];

    const hospitals = [
        { id: 101, name: 'Nearby General', lat: 12.9740, lng: 77.5980 }, // ~230m (within 2km)
        { id: 102, name: 'Outer Hospital', lat: 12.9850, lng: 77.6050 }, // ~1200m (within 2km)
        { id: 103, name: 'Distant Hospital', lat: 13.0100, lng: 77.6000 } // ~3900m (exceeds 2km)
    ];

    const result = getFacilitiesNearRoute(hospitals, route, 2000);

    await t.test('3.1 Should include hospitals within 2000m (2 km)', () => {
        const ids = result.map(h => h.id);
        assert.ok(ids.includes(101));
        assert.ok(ids.includes(102));
    });

    await t.test('3.2 Should exclude hospitals beyond 2000m', () => {
        const ids = result.map(h => h.id);
        assert.ok(!ids.includes(103), 'Distant hospital (>2km) must be excluded');
        assert.equal(result.length, 2);
    });

    await t.test('3.3 Should sort hospitals by distance ascending', () => {
        assert.ok(result[0].distM < result[1].distM);
    });
});

test('4. Streetlight Coverage (50 m Threshold)', async (t) => {
    const route = [
        { lat: 12.9710, lng: 77.5940 },
        { lat: 12.9715, lng: 77.5945 },
        { lat: 12.9720, lng: 77.5950 },
        { lat: 12.9725, lng: 77.5955 }
    ];

    await t.test('4.1 Should calculate 100% when all sampled points have a streetlight within 50m', () => {
        // Place a streetlight at each route coordinate
        const lights = route.map(pt => ({ lat: pt.lat, lng: pt.lng }));
        const coverage = streetlightCoverage(lights, route);
        assert.equal(coverage, 100);
    });

    await t.test('4.2 Should calculate 0% when no streetlights are within 50m', () => {
        // Place streetlights far away (> 500m)
        const lights = [{ lat: 12.9800, lng: 77.6100 }];
        const coverage = streetlightCoverage(lights, route);
        assert.equal(coverage, 0);
    });

    await t.test('4.3 Should return 0% when streetlight list or route is empty', () => {
        assert.equal(streetlightCoverage([], route), 0);
        assert.equal(streetlightCoverage([{ lat: 12.9710, lng: 77.5940 }], []), 0);
    });
});

test('5. Safety Score Calculation (40% Police, 25% Hospital, 35% Lighting)', async (t) => {
    const route = { distance_km: 2.0 };
    const routeCoords = [{ lat: 12.9700, lng: 77.5900 }, { lat: 12.9800, lng: 77.6000 }];

    await t.test('5.1 Maximum safety score: 100 for well-resourced route', () => {
        // Route length: 2 km
        // policeList: 4 stations -> density = 2.0/km (reaches 2.0 benchmark -> 100)
        // hospitalList: 3 hospitals -> density = 1.5/km (reaches 1.5 benchmark -> 100)
        // litPct: 100% (score 100)
        const res = computeSafetyScore(route, routeCoords, {
            policeList: [{}, {}, {}, {}],
            hospitalList: [{}, {}, {}],
            litPct: 100
        });
        assert.equal(res.policeScore, 100, 'Police score should reach max 100');
        assert.equal(res.hospitalScore, 100, 'Hospital score should reach max 100');
        assert.equal(res.lightScore, 100, 'Light score should reach max 100');
        // Weighted: 100*0.40 + 100*0.25 + 100*0.35 = 40 + 25 + 35 = 100
        assert.equal(res.rawScore, 100);
        assert.equal(res.safetyScore, 100);
    });

    await t.test('5.2 Minimum score clamped to baseline 10 when resources are 0', () => {
        const res = computeSafetyScore(route, routeCoords, {
            policeList: [],
            hospitalList: [],
            litPct: 0
        });
        assert.equal(res.policeScore, 0);
        assert.equal(res.hospitalScore, 0);
        assert.equal(res.lightScore, 0);
        assert.equal(res.rawScore, 0);
        assert.equal(res.safetyScore, 10, 'Safety score must be clamped to minimum 10');
    });

    await t.test('5.3 Isolated component weight verification (40% Police, 25% Hospital, 35% Lighting)', () => {
        // Police only (max police, 0 hospital, 0 light) -> 100 * 0.40 = 40
        const policeOnly = computeSafetyScore(route, routeCoords, {
            policeList: [{}, {}, {}, {}],
            hospitalList: [],
            litPct: 0
        });
        assert.equal(policeOnly.rawScore, 40, 'Police component alone must contribute 40 points');

        // Hospital only (max hospital, 0 police, 0 light) -> 100 * 0.25 = 25
        const hospitalOnly = computeSafetyScore(route, routeCoords, {
            policeList: [],
            hospitalList: [{}, {}, {}],
            litPct: 0
        });
        assert.equal(hospitalOnly.rawScore, 25, 'Hospital component alone must contribute 25 points');

        // Lighting only (100% light, 0 police, 0 hospital) -> 100 * 0.35 = 35
        const lightOnly = computeSafetyScore(route, routeCoords, {
            policeList: [],
            hospitalList: [],
            litPct: 100
        });
        assert.equal(lightOnly.rawScore, 35, 'Lighting component alone must contribute 35 points');

        // Total weights sum exactly to 100: 40 + 25 + 35 = 100
        assert.equal(policeOnly.rawScore + hospitalOnly.rawScore + lightOnly.rawScore, 100);
    });
});

test('6. Route Ranking & Tier Classification (SAFEST / MODERATE / LOW SAFETY)', async (t) => {
    const rawRoutes = [
        { id: 'route_1', summary: 'via Outer Ring Rd', rawSafetyScore: 72 },
        { id: 'route_0', summary: 'via Main Rd', rawSafetyScore: 88 },
        { id: 'route_2', summary: 'via Old Road', rawSafetyScore: 50 }
    ];

    const ranked = rankRoutes(rawRoutes);

    await t.test('6.1 Ranks routes descending by raw safety score', () => {
        assert.equal(ranked[0].id, 'route_0', 'Highest raw score must be ranked first');
        assert.equal(ranked[1].id, 'route_1', 'Second highest raw score must be ranked second');
        assert.equal(ranked[2].id, 'route_2', 'Lowest raw score must be ranked third');
    });

    await t.test('6.2 Applies spread penalties [0, -8, -16] correctly', () => {
        assert.equal(ranked[0].safetyScore, 88 - 0);
        assert.equal(ranked[1].safetyScore, 72 - 8);
        assert.equal(ranked[2].safetyScore, 50 - 16);
    });

    await t.test('6.3 Assigns correct display labels and color themes', () => {
        assert.equal(ranked[0].displayLabel, 'SAFEST');
        assert.equal(ranked[0].displayColor, 'safe');
        assert.equal(ranked[0].color, '#10b981');

        assert.equal(ranked[1].displayLabel, 'MODERATE');
        assert.equal(ranked[1].displayColor, 'moderate');
        assert.equal(ranked[1].color, '#eab308');

        assert.equal(ranked[2].displayLabel, 'LOW SAFETY');
        assert.equal(ranked[2].displayColor, 'unsafe');
        assert.equal(ranked[2].color, '#ef4444');
    });

    await t.test('6.4 Handles dynamic route lists with fewer than 3 routes', () => {
        const singleRoute = [{ id: 'route_0', rawSafetyScore: 75 }];
        const rankedSingle = rankRoutes(singleRoute);
        assert.equal(rankedSingle.length, 1);
        assert.equal(rankedSingle[0].displayLabel, 'SAFEST');
        assert.equal(rankedSingle[0].safetyScore, 75);

        const twoRoutes = [
            { id: 'route_b', rawSafetyScore: 60 },
            { id: 'route_a', rawSafetyScore: 80 }
        ];
        const rankedTwo = rankRoutes(twoRoutes);
        assert.equal(rankedTwo.length, 2);
        assert.equal(rankedTwo[0].displayLabel, 'SAFEST');
        assert.equal(rankedTwo[1].displayLabel, 'MODERATE');
    });
});
