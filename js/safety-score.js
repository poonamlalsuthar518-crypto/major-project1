/*
 Security scoring module for SecureStep
 This file provides a modular calculateSafetyScore(route, safetyData) function
 that can be replaced with the real SecureStep algorithm later. For now it
 uses sample data and a simple weighted heuristic.

 TODO: Replace sample data calls with backend fetches from Node.js + MySQL.
*/

// Example placeholder to compute safety score for a route.
function calculateSafetyScore(route, safetyData){
    // route: object containing distance_km, duration_min, coords, segments
    // safetyData: object with crimeRisk, incidentRisk, highRiskZones (sample)

    // Sample weights - tweakable
    const weights = {
        crimeRisk: 0.6,
        incidentRisk: 0.25,
        highRiskZones: 0.15,
        distanceFactor: 0.02, // penalty per km (small)
        segmentFactor: 0.5
    };

    // Base score
    let score = 100;

    // Use provided safetyData when available; fall back to sample values
    const sample = safetyData || { crimeRisk:15, incidentRisk:8, highRiskZones:1 };

    // Deduct based on risks (higher risk values reduce the score)
    score -= sample.crimeRisk * weights.crimeRisk;
    score -= sample.incidentRisk * weights.incidentRisk;
    score -= sample.highRiskZones * 8 * weights.highRiskZones;

    // Distance penalty (longer routes may be slightly less safe if long exposure)
    const distKm = parseFloat(route.distance_km) || (route.distance_m ? route.distance_m/1000 : 0);
    score -= distKm * weights.distanceFactor * 10;

    // More segments (many legs) may indicate more complex route -> small penalty
    const segments = route.segments || 1;
    score -= segments * weights.segmentFactor;

    // Normalize and clamp
    score = Math.round(Math.max(0, Math.min(100, score)));

    // Breakdown for UI explanation
    const breakdown = {
        base: 100,
        crimePenalty: Math.round(sample.crimeRisk * weights.crimeRisk),
        incidentPenalty: Math.round(sample.incidentRisk * weights.incidentRisk),
        highRiskZonePenalty: Math.round(sample.highRiskZones * 8 * weights.highRiskZones),
        distancePenalty: Math.round(distKm * weights.distanceFactor * 10),
        segmentPenalty: Math.round(segments * weights.segmentFactor)
    };

    return { score, breakdown };

}

// Placeholder that in future will query the backend for crime risk overlapping a route.
function getCrimeRiskForRoute(route){
    // TODO: Replace sample safety data with data fetched from Node.js backend and MySQL crime database.
    const sampleSafetyData = { crimeRisk: 15, incidentRisk: 8, highRiskZones: 1 };
    return sampleSafetyData;
}

// Placeholder for CivicSense/community reports.
function getCommunityRiskForRoute(route){
    // TODO: Fetch CivicSense reports from backend.
    return { theftReports: 2, harassmentReports: 0, poorLighting: 1, accidents: 0 };
}

function classifyRoute(score){
    if(score >= 80) return { label: 'SAFE', level: 'safe' };
    if(score >= 60) return { label: 'MODERATE', level: 'moderate' };
    return { label: 'HIGH RISK', level: 'unsafe' };
}
