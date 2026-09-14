/*
 Security scoring module for SecureStep
 Comprehensive route analysis including road conditions, lighting, police/hospital proximity, and community reports
*/

// Enhanced safety scoring algorithm based on available safety infrastructure
function calculateSafetyScore(route, analysisData){
    // route: object containing distance_km, duration_min, coords
    // analysisData: comprehensive route analysis data

    const weights = {
        roadConditions: 0.15,
        lightingConditions: 0.40, // Increased weight for lighting
        policeProximity: 0.25, // Increased weight for police proximity
        hospitalProximity: 0.15,
        civicSenseReports: 0.05,
        distanceFactor: 0.05
    };

    let score = 100;
    const analysis = analysisData || getDefaultAnalysisData();

    // Road conditions penalty (narrow roads penalized more)
    score -= analysis.roadConditions.poorRoads * weights.roadConditions * 12;
    score -= analysis.roadConditions.narrowRoads * weights.roadConditions * 15;
    score -= analysis.roadConditions.constructionZones * weights.roadConditions * 10;

    // Lighting conditions penalty (heavily weighted for safety)
    score -= analysis.lightingConditions.poorLighting * weights.lightingConditions * 20;
    score -= analysis.lightingConditions.darkAreas * weights.lightingConditions * 15;
    score += analysis.lightingConditions.wellLitAreas * weights.lightingConditions * 10;
    
    // Additional penalty for low street light density
    if (analysis.lightingConditions.streetLightDensity === 'low') {
        score -= 15 * weights.lightingConditions;
    }
    
    // Additional penalty for low average light level
    if (analysis.lightingConditions.averageLightLevel < 4) {
        score -= 10 * weights.lightingConditions;
    }

    // Police proximity bonus (heavily weighted - closer = much safer)
    const policeBonus = Math.max(0, 15 - analysis.policeProximity.nearestDistanceKm * 2);
    score += policeBonus * weights.policeProximity;
    
    // Additional bonus for multiple nearby police stations
    if (analysis.policeProximity.stationsNearby >= 3) {
        score += 5 * weights.policeProximity;
    }

    // Hospital proximity bonus
    const hospitalBonus = Math.max(0, 10 - analysis.hospitalProximity.nearestDistanceKm * 1.5);
    score += hospitalBonus * weights.hospitalProximity;

    // CivicSense reports penalty (based on actual reports, not crime prediction)
    score -= analysis.civicSenseReports.recentReports * weights.civicSenseReports * 5;

    // Distance penalty (longer exposure = slightly higher risk)
    const distKm = parseFloat(route.distance_km) || (route.distance_m ? route.distance_m/1000 : 0);
    score -= distKm * weights.distanceFactor * 2;

    // Normalize and clamp
    score = Math.round(Math.max(0, Math.min(100, score)));

    // Detailed breakdown for UI
    const breakdown = {
        base: 100,
        roadConditionPenalty: Math.round((analysis.roadConditions.poorRoads * 12 + analysis.roadConditions.narrowRoads * 15 + analysis.roadConditions.constructionZones * 10) * weights.roadConditions),
        lightingPenalty: Math.round((analysis.lightingConditions.poorLighting * 15 + analysis.lightingConditions.darkAreas * 12) * weights.lightingConditions),
        lightingBonus: Math.round(analysis.lightingConditions.wellLitAreas * 8 * weights.lightingConditions),
        policeBonus: Math.round(policeBonus * weights.policeProximity),
        policeStationBonus: analysis.policeProximity.stationsNearby >= 3 ? Math.round(5 * weights.policeProximity) : 0,
        hospitalBonus: Math.round(hospitalBonus * weights.hospitalProximity),
        civicSensePenalty: Math.round(analysis.civicSenseReports.recentReports * 5 * weights.civicSenseReports),
        distancePenalty: Math.round(distKm * weights.distanceFactor * 2)
    };

    return { score, breakdown, analysis };
}

// Analyze route for comprehensive safety factors
function analyzeRouteSafety(route, routeCoords){
    // This function should be replaced with actual data analysis
    // For now, returns default analysis data
    // In production, this would fetch real data from backend APIs
    
    const analysis = {
        roadConditions: {
            poorRoads: 0,
            narrowRoads: 0,
            constructionZones: 0,
            trafficDensity: 'low',
            roadWidth: 'medium'
        },
        lightingConditions: {
            poorLighting: 0,
            darkAreas: 0,
            wellLitAreas: 0,
            streetLightDensity: 'medium',
            averageLightLevel: 0
        },
        policeProximity: {
            nearestDistanceKm: 0,
            patrolFrequency: 'medium',
            stationsNearby: 0,
            totalOfficersInArea: 0
        },
        hospitalProximity: {
            nearestDistanceKm: 0,
            hospitalsNearby: 0
        },
        civicSenseReports: {
            recentReports: 0
        }
    };

    return analysis;
}

function getDefaultAnalysisData(){
    return {
        roadConditions: { 
            poorRoads: 0, 
            narrowRoads: 0,
            constructionZones: 0, 
            trafficDensity: 'low',
            roadWidth: 'medium'
        },
        lightingConditions: { 
            poorLighting: 0, 
            darkAreas: 0, 
            wellLitAreas: 0,
            streetLightDensity: 'medium',
            averageLightLevel: 0
        },
        policeProximity: { 
            nearestDistanceKm: 0, 
            patrolFrequency: 'medium', 
            stationsNearby: 0,
            totalOfficersInArea: 0
        },
        hospitalProximity: { 
            nearestDistanceKm: 0, 
            hospitalsNearby: 0 
        },
        civicSenseReports: {
            recentReports: 0
        }
    };
}

function classifyRoute(score){
    if(score >= 80) return { label: 'LOW RISK', level: 'safe', color: '#10b981' };
    if(score >= 60) return { label: 'MODERATE', level: 'moderate', color: '#f59e0b' };
    if(score >= 40) return { label: 'CAUTION', level: 'caution', color: '#f59e0b' };
    return { label: 'HIGH RISK', level: 'unsafe', color: '#ef4444' };
}

// Generate safety recommendations based on analysis
function generateSafetyRecommendations(analysis, score){
    const recommendations = [];

    if (analysis.lightingConditions.poorLighting > 2) {
        recommendations.push('Route has multiple poorly lit areas. Consider alternative during nighttime.');
    }
    if (analysis.lightingConditions.wellLitAreas >= 4) {
        recommendations.push('Route has excellent street lighting coverage. Good for night travel.');
    }
    if (analysis.roadConditions.narrowRoads > 2) {
        recommendations.push('Route contains narrow road segments. Exercise caution and stay alert.');
    }
    if (analysis.roadConditions.roadWidth === 'wide') {
        recommendations.push('Route uses wide main roads with good visibility.');
    }
    if (analysis.roadConditions.poorRoads > 1) {
        recommendations.push('Some road segments are in poor condition. Exercise caution.');
    }
    if (analysis.policeProximity.nearestDistanceKm > 2) {
        recommendations.push('Police stations are not nearby. Ensure phone is charged for emergencies.');
    }
    if (analysis.policeProximity.stationsNearby >= 3) {
        recommendations.push('Multiple police stations nearby. High patrol coverage area.');
    }
    if (analysis.policeProximity.totalOfficersInArea > 50) {
        recommendations.push('High police presence in area with ' + analysis.policeProximity.totalOfficersInArea + ' officers.');
    }
    if (analysis.civicSenseReports.recentReports > 3) {
        recommendations.push('Recent CivicSense reports in area. Stay alert and follow basic safety precautions.');
    }
    if (score >= 80) {
        recommendations.push('This route has excellent safety ratings. Standard precautions apply.');
    } else if (score >= 60) {
        recommendations.push('Route has moderate safety. Stay alert and follow basic safety precautions.');
    } else {
        recommendations.push('Route has elevated risk factors. Consider alternative route if available.');
    }

    return recommendations.length > 0 ? recommendations : ['Route appears safe with normal precautions.'];
}
