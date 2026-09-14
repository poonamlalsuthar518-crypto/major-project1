/*
 Central Safety Scoring Service for SecureStep
 Calculates safety scores based on real infrastructure data and community reports
*/

const SafetyScoreService = {
    // Configuration weights for safety scoring
    config: {
        weights: {
            streetlightCoverage: 0.40,
            policeProximity: 0.25,
            hospitalProximity: 0.15,
            civicSenseReports: 0.15,
            routeEfficiency: 0.05
        },
        thresholds: {
            streetlightProximityMeters: 50,
            policeRadiusKm: 2,
            hospitalRadiusKm: 2,
            civicSenseLookbackDays: 30
        },
        riskLevels: {
            lowRisk: { min: 80, label: 'LOW RISK', color: '#10b981' },
            moderate: { min: 60, label: 'MODERATE', color: '#f59e0b' },
            caution: { min: 40, label: 'CAUTION', color: '#f59e0b' },
            highRisk: { min: 0, label: 'HIGH RISK', color: '#ef4444' }
        }
    },

    // Main function to calculate safety score for a route
    async calculateSafetyScore(route, routeCoords) {
        try {
            // Fetch real data from APIs
            const [streetlights, policeStations, hospitals, civicSenseReports] = await Promise.all([
                this.fetchStreetlights(),
                this.fetchPoliceStations(),
                this.fetchHospitals(),
                this.fetchCivicSenseReports(routeCoords)
            ]);

            // Perform analysis using real data
            const streetlightAnalysis = this.analyzeStreetlightCoverage(routeCoords, streetlights);
            const policeAnalysis = this.analyzePoliceProximity(routeCoords, policeStations);
            const hospitalAnalysis = this.analyzeHospitalProximity(routeCoords, hospitals);
            const civicSenseAnalysis = this.analyzeCivicSenseReports(routeCoords, civicSenseReports);
            const routeEfficiencyAnalysis = this.analyzeRouteEfficiency(route);

            // Calculate individual scores
            const streetlightScore = this.calculateStreetlightScore(streetlightAnalysis);
            const policeScore = this.calculatePoliceScore(policeAnalysis);
            const hospitalScore = this.calculateHospitalScore(hospitalAnalysis);
            const civicSenseScore = this.calculateCivicSenseScore(civicSenseAnalysis);
            const routeEfficiencyScore = this.calculateRouteEfficiencyScore(routeEfficiencyAnalysis);

            // Calculate weighted final score
            const finalScore = Math.round(
                streetlightScore * this.config.weights.streetlightCoverage +
                policeScore * this.config.weights.policeProximity +
                hospitalScore * this.config.weights.hospitalProximity +
                civicSenseScore * this.config.weights.civicSenseReports +
                routeEfficiencyScore * this.config.weights.routeEfficiency
            );

            // Clamp score between 0 and 100
            const clampedScore = Math.max(0, Math.min(100, finalScore));

            // Determine risk level
            const riskLevel = this.classifyRiskLevel(clampedScore);

            // Generate explanation
            const explanation = this.generateExplanation({
                streetlightAnalysis,
                policeAnalysis,
                hospitalAnalysis,
                civicSenseAnalysis,
                routeEfficiencyAnalysis,
                scores: {
                    streetlight: streetlightScore,
                    police: policeScore,
                    hospital: hospitalScore,
                    civicSense: civicSenseScore,
                    routeEfficiency: routeEfficiencyScore
                }
            });

            return {
                score: clampedScore,
                riskLevel,
                factors: {
                    streetlightCoverage: streetlightAnalysis.coveragePercentage,
                    nearestPoliceDistance: policeAnalysis.nearestDistance,
                    policeStationsNearby: policeAnalysis.stationsNearby,
                    nearestHospitalDistance: hospitalAnalysis.nearestDistance,
                    hospitalsNearby: hospitalAnalysis.hospitalsNearby,
                    civicSenseReports: civicSenseAnalysis.recentReports,
                    routeDistance: route.distance_km,
                    routeDuration: route.duration_min
                },
                explanation,
                breakdown: {
                    streetlightScore,
                    policeScore,
                    hospitalScore,
                    civicSenseScore,
                    routeEfficiencyScore
                }
            };
        } catch (error) {
            console.error('Error calculating safety score:', error);
            return {
                score: 50,
                riskLevel: this.config.riskLevels.moderate,
                factors: {},
                explanation: 'Unable to calculate safety score due to data unavailability.',
                breakdown: {}
            };
        }
    },

    // Fetch streetlights from API
    async fetchStreetlights() {
        try {
            const response = await fetch('/api/streetlights');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('Failed to fetch streetlights:', error);
        }
        return [];
    },

    // Fetch police stations from API
    async fetchPoliceStations() {
        try {
            const response = await fetch('/api/police-stations');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('Failed to fetch police stations:', error);
        }
        return [];
    },

    // Fetch hospitals from API
    async fetchHospitals() {
        try {
            const response = await fetch('/api/hospitals');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('Failed to fetch hospitals:', error);
        }
        return [];
    },

    // Fetch CivicSense reports near route
    async fetchCivicSenseReports(routeCoords) {
        try {
            if (!routeCoords || routeCoords.length === 0) return [];

            // Calculate route center
            const centerLat = routeCoords.reduce((sum, coord) => sum + coord.lat, 0) / routeCoords.length;
            const centerLng = routeCoords.reduce((sum, coord) => sum + coord.lng, 0) / routeCoords.length;

            const response = await fetch(`/api/civicsense/reports/nearby?lat=${centerLat}&lng=${centerLng}&radius=5`);
            if (response.ok) {
                const data = await response.json();
                return data.reports || [];
            }
        } catch (error) {
            console.warn('Failed to fetch CivicSense reports:', error);
        }
        return [];
    },

    // Analyze streetlight coverage along route
    analyzeStreetlightCoverage(routeCoords, streetlights) {
        if (!routeCoords || routeCoords.length === 0 || !streetlights || streetlights.length === 0) {
            return {
                coveragePercentage: 0,
                coveredSamplePoints: 0,
                totalSamplePoints: 0,
                nearbyStreetlights: []
            };
        }

        // Use GeoUtils if available
        if (window.GeoUtils) {
            return window.GeoUtils.calculateRouteCoverage(
                routeCoords,
                streetlights.map(s => ({ lat: s.lat, lng: s.lng, id: s.id })),
                this.config.thresholds.streetlightProximityMeters
            );
        }

        // Fallback: simple distance check
        let coveredPoints = 0;
        const totalPoints = routeCoords.length;
        const nearbyStreetlights = [];

        routeCoords.forEach(coord => {
            const nearby = streetlights.some(streetlight => {
                const distance = this.haversineDistance(
                    coord.lat, coord.lng,
                    streetlight.lat, streetlight.lng
                );
                return distance <= this.config.thresholds.streetlightProximityMeters;
            });

            if (nearby) coveredPoints++;
        });

        return {
            coveragePercentage: Math.round((coveredPoints / totalPoints) * 100),
            coveredSamplePoints: coveredPoints,
            totalSamplePoints: totalPoints,
            nearbyStreetlights
        };
    },

    // Analyze police proximity along route
    analyzePoliceProximity(routeCoords, policeStations) {
        if (!routeCoords || routeCoords.length === 0 || !policeStations || policeStations.length === 0) {
            return {
                nearestDistance: Infinity,
                stationsNearby: 0,
                nearestStation: null
            };
        }

        let nearestDistance = Infinity;
        let nearestStation = null;
        let stationsNearby = 0;

        policeStations.forEach(station => {
            // Check if station is near any point in the route
            routeCoords.forEach(coord => {
                const distance = this.haversineDistance(
                    coord.lat, coord.lng,
                    station.lat, station.lng
                );

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestStation = station;
                }

                if (distance <= this.config.thresholds.policeRadiusKm * 1000) {
                    stationsNearby++;
                }
            });
        });

        return {
            nearestDistance: nearestDistance === Infinity ? 0 : nearestDistance / 1000, // Convert to km
            stationsNearby,
            nearestStation
        };
    },

    // Analyze hospital proximity along route
    analyzeHospitalProximity(routeCoords, hospitals) {
        if (!routeCoords || routeCoords.length === 0 || !hospitals || hospitals.length === 0) {
            return {
                nearestDistance: Infinity,
                hospitalsNearby: 0,
                nearestHospital: null
            };
        }

        let nearestDistance = Infinity;
        let nearestHospital = null;
        let hospitalsNearby = 0;

        hospitals.forEach(hospital => {
            routeCoords.forEach(coord => {
                const distance = this.haversineDistance(
                    coord.lat, coord.lng,
                    hospital.lat, hospital.lng
                );

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestHospital = hospital;
                }

                if (distance <= this.config.thresholds.hospitalRadiusKm * 1000) {
                    hospitalsNearby++;
                }
            });
        });

        return {
            nearestDistance: nearestDistance === Infinity ? 0 : nearestDistance / 1000,
            hospitalsNearby,
            nearestHospital
        };
    },

    // Analyze CivicSense reports
    analyzeCivicSenseReports(routeCoords, reports) {
        if (!reports || reports.length === 0) {
            return {
                recentReports: 0,
                highSeverityReports: 0,
                reportsNearRoute: []
            };
        }

        const cutoffDate = new Date(Date.now() - this.config.thresholds.civicSenseLookbackDays * 24 * 60 * 60 * 1000);
        const recentReports = reports.filter(report => new Date(report.created_at) >= cutoffDate);
        const highSeverityReports = recentReports.filter(report => report.severity === 'high' || report.severity === 'critical');

        return {
            recentReports: recentReports.length,
            highSeverityReports: highSeverityReports.length,
            reportsNearRoute: recentReports
        };
    },

    // Analyze route efficiency
    analyzeRouteEfficiency(route) {
        const distance = parseFloat(route.distance_km) || 0;
        const duration = parseFloat(route.duration_min) || 0;

        // Calculate efficiency based on distance and time
        // Shorter, faster routes are generally more efficient
        const efficiencyScore = distance > 0 && duration > 0 
            ? Math.max(0, 100 - (distance * 2) - (duration * 0.5))
            : 50;

        return {
            distance,
            duration,
            efficiencyScore
        };
    },

    // Calculate streetlight score (0-100)
    calculateStreetlightScore(analysis) {
        const coverage = analysis.coveragePercentage || 0;
        return Math.min(100, coverage);
    },

    // Calculate police score (0-100)
    calculatePoliceScore(analysis) {
        const distance = analysis.nearestDistance || 0;
        const stationsNearby = analysis.stationsNearby || 0;

        // Closer police = higher score
        const distanceScore = Math.max(0, 100 - (distance * 20));
        const stationBonus = Math.min(20, stationsNearby * 5);

        return Math.min(100, distanceScore + stationBonus);
    },

    // Calculate hospital score (0-100)
    calculateHospitalScore(analysis) {
        const distance = analysis.nearestDistance || 0;
        const hospitalsNearby = analysis.hospitalsNearby || 0;

        // Closer hospital = higher score
        const distanceScore = Math.max(0, 100 - (distance * 15));
        const hospitalBonus = Math.min(15, hospitalsNearby * 5);

        return Math.min(100, distanceScore + hospitalBonus);
    },

    // Calculate CivicSense score (0-100)
    calculateCivicSenseScore(analysis) {
        const recentReports = analysis.recentReports || 0;
        const highSeverityReports = analysis.highSeverityReports || 0;

        // Fewer reports = higher score
        const reportPenalty = Math.min(50, recentReports * 5);
        const severityPenalty = Math.min(30, highSeverityReports * 10);

        return Math.max(0, 100 - reportPenalty - severityPenalty);
    },

    // Calculate route efficiency score (0-100)
    calculateRouteEfficiencyScore(analysis) {
        return Math.max(0, Math.min(100, analysis.efficiencyScore || 50));
    },

    // Classify risk level based on score
    classifyRiskLevel(score) {
        if (score >= this.config.riskLevels.lowRisk.min) {
            return this.config.riskLevels.lowRisk;
        } else if (score >= this.config.riskLevels.moderate.min) {
            return this.config.riskLevels.moderate;
        } else if (score >= this.config.riskLevels.caution.min) {
            return this.config.riskLevels.caution;
        } else {
            return this.config.riskLevels.highRisk;
        }
    },

    // Generate explanation for the safety score
    generateExplanation(analysis) {
        const explanations = [];

        if (analysis.streetlightAnalysis.coveragePercentage >= 80) {
            explanations.push('Excellent streetlight coverage along the route.');
        } else if (analysis.streetlightAnalysis.coveragePercentage >= 50) {
            explanations.push('Moderate streetlight coverage along the route.');
        } else if (analysis.streetlightAnalysis.coveragePercentage > 0) {
            explanations.push('Limited streetlight coverage along the route.');
        } else {
            explanations.push('No streetlight data available for this route.');
        }

        if (analysis.policeAnalysis.nearestDistance <= 1) {
            explanations.push('Police station within 1km of the route.');
        } else if (analysis.policeAnalysis.nearestDistance <= 2) {
            explanations.push('Police station within 2km of the route.');
        } else if (analysis.policeAnalysis.nearestDistance > 0) {
            explanations.push('Police station more than 2km from the route.');
        }

        if (analysis.policeAnalysis.stationsNearby >= 3) {
            explanations.push('Multiple police stations nearby providing good coverage.');
        }

        if (analysis.hospitalAnalysis.nearestDistance <= 2) {
            explanations.push('Hospital within 2km of the route.');
        } else if (analysis.hospitalAnalysis.nearestDistance > 0) {
            explanations.push('Hospital more than 2km from the route.');
        }

        if (analysis.civicSenseAnalysis.recentReports === 0) {
            explanations.push('No recent CivicSense reports in the area.');
        } else if (analysis.civicSenseAnalysis.recentReports <= 3) {
            explanations.push('Few recent CivicSense reports in the area.');
        } else {
            explanations.push('Several recent CivicSense reports in the area.');
        }

        return explanations.join(' ');
    },

    // Haversine distance calculation (fallback if GeoUtils not available)
    haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
};

// Expose to global scope
window.SafetyScoreService = SafetyScoreService;
