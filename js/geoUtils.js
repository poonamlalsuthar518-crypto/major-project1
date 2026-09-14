/*
 Geographic Utility Functions for SecureStep
 Provides reusable geographic calculations for route analysis and safety scoring
*/

const GeoUtils = {
    // Haversine formula to calculate distance between two coordinates
    haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in meters
    },

    // Convert degrees to radians
    toRadians(degrees) {
        return degrees * Math.PI / 180;
    },

    // Calculate distance from a point to a polyline (route)
    pointToPolylineDistance(pointLat, pointLng, polylineCoords) {
        if (!polylineCoords || polylineCoords.length < 2) {
            return Infinity;
        }

        let minDistance = Infinity;

        for (let i = 0; i < polylineCoords.length - 1; i++) {
            const segmentStart = polylineCoords[i];
            const segmentEnd = polylineCoords[i + 1];
            
            const distance = this.pointToSegmentDistance(
                pointLat, pointLng,
                segmentStart.lat, segmentStart.lng,
                segmentEnd.lat, segmentEnd.lng
            );
            
            if (distance < minDistance) {
                minDistance = distance;
            }
        }

        return minDistance;
    },

    // Calculate distance from a point to a line segment
    pointToSegmentDistance(pointLat, pointLng, segStartLat, segStartLng, segEndLat, segEndLng) {
        // Convert to radians
        const lat1 = this.toRadians(pointLat);
        const lng1 = this.toRadians(pointLng);
        const lat2 = this.toRadians(segStartLat);
        const lng2 = this.toRadians(segStartLng);
        const lat3 = this.toRadians(segEndLat);
        const lng3 = this.toRadians(segEndLng);

        // Calculate distances
        const d12 = this.haversineDistance(pointLat, pointLng, segStartLat, segStartLng);
        const d13 = this.haversineDistance(pointLat, pointLng, segEndLat, segEndLng);
        const d23 = this.haversineDistance(segStartLat, segStartLng, segEndLat, segEndLng);

        // If the segment length is zero, return distance to start point
        if (d23 === 0) {
            return d12;
        }

        // Check if the projection falls within the segment
        if (d12 * d12 + d23 * d23 - d13 * d13 < 0) {
            return d12; // Closest to start point
        }
        
        if (d13 * d13 + d23 * d23 - d12 * d12 < 0) {
            return d13; // Closest to end point
        }

        // Calculate perpendicular distance using cross product formula
        const s = (d12 + d13 + d23) / 2;
        const area = Math.sqrt(s * (s - d12) * (s - d13) * (s - d23));
        return (2 * area) / d23;
    },

    // Sample route geometry at regular intervals
    sampleRouteGeometry(routeCoords, intervalMeters = 100) {
        if (!routeCoords || routeCoords.length < 2) {
            return [];
        }

        const sampledPoints = [routeCoords[0]]; // Always include start point
        let accumulatedDistance = 0;
        let lastSampledIndex = 0;

        for (let i = 1; i < routeCoords.length; i++) {
            const segmentDistance = this.haversineDistance(
                routeCoords[i - 1].lat, routeCoords[i - 1].lng,
                routeCoords[i].lat, routeCoords[i].lng
            );

            accumulatedDistance += segmentDistance;

            // If we've exceeded the interval, add a sample point
            if (accumulatedDistance >= intervalMeters) {
                sampledPoints.push(routeCoords[i]);
                accumulatedDistance = 0;
                lastSampledIndex = i;
            }
        }

        // Always include the end point
        if (lastSampledIndex !== routeCoords.length - 1) {
            sampledPoints.push(routeCoords[routeCoords.length - 1]);
        }

        return sampledPoints;
    },

    // Count points within a given radius of a location
    countNearbyPoints(centerLat, centerLng, points, radiusMeters) {
        if (!points || points.length === 0) {
            return 0;
        }

        let count = 0;
        const nearbyPoints = [];

        points.forEach(point => {
            const distance = this.haversineDistance(
                centerLat, centerLng,
                point.lat || point.latitude, 
                point.lng || point.longitude
            );

            if (distance <= radiusMeters) {
                count++;
                nearbyPoints.push({ ...point, distance });
            }
        });

        return { count, nearbyPoints };
    },

    // Find the nearest point from a collection
    findNearestPoint(centerLat, centerLng, points) {
        if (!points || points.length === 0) {
            return null;
        }

        let nearestPoint = null;
        let minDistance = Infinity;

        points.forEach(point => {
            const distance = this.haversineDistance(
                centerLat, centerLng,
                point.lat || point.latitude,
                point.lng || point.longitude
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = { ...point, distance };
            }
        });

        return nearestPoint;
    },

    // Calculate route coverage percentage for infrastructure
    calculateRouteCoverage(routeCoords, infrastructurePoints, proximityMeters = 50) {
        if (!routeCoords || routeCoords.length === 0 || !infrastructurePoints || infrastructurePoints.length === 0) {
            return {
                coveragePercentage: 0,
                coveredSamplePoints: 0,
                totalSamplePoints: 0,
                nearbyInfrastructure: []
            };
        }

        // Sample the route at regular intervals
        const sampledPoints = this.sampleRouteGeometry(routeCoords, proximityMeters);
        const totalSamplePoints = sampledPoints.length;
        let coveredSamplePoints = 0;
        const nearbyInfrastructure = [];

        // Check each sampled point for nearby infrastructure
        sampledPoints.forEach(samplePoint => {
            const { count, nearbyPoints } = this.countNearbyPoints(
                samplePoint.lat, samplePoint.lng,
                infrastructurePoints,
                proximityMeters
            );

            if (count > 0) {
                coveredSamplePoints++;
                nearbyPoints.forEach(nearby => {
                    if (!nearbyInfrastructure.find(existing => existing.id === nearby.id)) {
                        nearbyInfrastructure.push(nearby);
                    }
                });
            }
        });

        const coveragePercentage = totalSamplePoints > 0 
            ? (coveredSamplePoints / totalSamplePoints) * 100 
            : 0;

        return {
            coveragePercentage: Math.round(coveragePercentage),
            coveredSamplePoints,
            totalSamplePoints,
            nearbyInfrastructure
        };
    },

    // Calculate route length from coordinates
    calculateRouteLength(routeCoords) {
        if (!routeCoords || routeCoords.length < 2) {
            return 0;
        }

        let totalDistance = 0;

        for (let i = 1; i < routeCoords.length; i++) {
            totalDistance += this.haversineDistance(
                routeCoords[i - 1].lat, routeCoords[i - 1].lng,
                routeCoords[i].lat, routeCoords[i].lng
            );
        }

        return totalDistance; // Distance in meters
    },

    // Check if two routes have similar geometry (for duplicate detection)
    areRoutesSimilar(route1Coords, route2Coords, similarityThreshold = 0.8) {
        if (!route1Coords || !route2Coords) {
            return false;
        }

        // Calculate overlap by checking common points
        const route1Set = new Set(route1Coords.map(coord => `${coord.lat},${coord.lng}`));
        const route2Set = new Set(route2Coords.map(coord => `${coord.lat},${coord.lng}`));

        const intersection = new Set([...route1Set].filter(coord => route2Set.has(coord)));
        const union = new Set([...route1Set, ...route2Set]);

        const overlapRatio = intersection.size / union.size;

        return overlapRatio >= similarityThreshold;
    },

    // Calculate bearing between two points
    calculateBearing(lat1, lng1, lat2, lng2) {
        const dLon = this.toRadians(lng2 - lng1);
        const lat1Rad = this.toRadians(lat1);
        const lat2Rad = this.toRadians(lat2);

        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

        const bearing = Math.atan2(y, x);
        return (this.toDegrees(bearing) + 360) % 360;
    },

    // Convert radians to degrees
    toDegrees(radians) {
        return radians * 180 / Math.PI;
    },

    // Calculate bounding box for a set of coordinates
    calculateBoundingBox(coords) {
        if (!coords || coords.length === 0) {
            return null;
        }

        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;

        coords.forEach(coord => {
            minLat = Math.min(minLat, coord.lat);
            maxLat = Math.max(maxLat, coord.lat);
            minLng = Math.min(minLng, coord.lng);
            maxLng = Math.max(maxLng, coord.lng);
        });

        return {
            minLat, maxLat, minLng, maxLng,
            centerLat: (minLat + maxLat) / 2,
            centerLng: (minLng + maxLng) / 2
        };
    }
};

// Expose to global scope
window.GeoUtils = GeoUtils;
