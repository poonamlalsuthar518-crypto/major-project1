/*
 Dashboard Map Module for SecureStep
 Interactive map displaying police stations, hospitals, and CivicSense incidents using MapLibre GL JS & OpenFreeMap.
 100% Free & API-Keyless.
*/

class DashboardMap {
    constructor(mapElementId = 'dashboardMap') {
        this.mapElementId = mapElementId;
        this.map = null;
        this.userLocation = null;
        this.policeMarkers = [];
        this.hospitalMarkers = [];
        this.incidentMarkers = [];
        this.userMarker = null;
        this.safetyRouteSourceIds = [];
        this.routePoliceMarkers = [];
        this.precinctMarkers = [];
        this.layerControls = {
            police: true,
            hospital: true,
            incidents: true
        };
        this.defaultCenter = [77.5946, 12.9716]; // Bengaluru [lng, lat]
    }

    initWithExistingMap(existingMap) {
        this.map = existingMap;
        this.userLocation = { lat: 12.9716, lng: 77.5946 };
        console.log('Dashboard map initialized with existing map instance');
    }

    async initialize() {
        const container = document.getElementById(this.mapElementId);
        if (!container) {
            console.warn('Dashboard map container not found');
            return;
        }

        try {
            await window.loadMapLibreApi();

            this.map = await window.SecureStepMap.createMap(container, this.defaultCenter, 13);

            await this.getUserLocation();
            await this.loadNearbyServices();
            this.loadCivicSenseIncidents();

            console.log('Dashboard MapLibre Map initialized successfully (Keyless OpenFreeMap)');
        } catch (error) {
            console.error('Failed to initialize dashboard map:', error);
            container.innerHTML = '<div style="padding:20px;color:#ef4444">Failed to initialize map. See console for details.</div>';
        }
    }

    async getUserLocation() {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported');
            this.userLocation = { lat: 12.9716, lng: 77.5946 };
            return;
        }

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };

                    if (this.map) {
                        this.map.flyTo({
                            center: [this.userLocation.lng, this.userLocation.lat],
                            zoom: 14,
                            essential: true
                        });

                        if (this.userMarker) {
                            this.userMarker.remove();
                        }

                        this.userMarker = window.SecureStepMap.createMarker(this.userLocation.lat, this.userLocation.lng, {
                            isUser: true,
                            popupHtml: '<strong>Your Location</strong>'
                        });

                        this.userMarker.addTo(this.map);
                    }
                    resolve();
                },
                (error) => {
                    console.warn('Could not get user location:', error);
                    this.userLocation = { lat: 12.9716, lng: 77.5946 };
                    resolve();
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    async loadNearbyServices() {
        if (!this.userLocation) return;

        this.clearServiceMarkers();

        const policeStations = await this.fetchPoliceStations();
        const hospitals = await this.fetchHospitals();

        if (this.layerControls.police) {
            this.addPoliceMarkers(policeStations);
        }
        if (this.layerControls.hospital) {
            this.addHospitalMarkers(hospitals);
        }

        this.updateFacilitiesUI(policeStations, hospitals);
        this.drawSafetyRoutes(policeStations);
    }

    drawSafetyRoutes(policeStations) {
        if (!this.userLocation || !this.map) return;

        // Clear previous lines
        this.safetyRouteSourceIds.forEach(id => {
            if (this.map.getLayer(`layer-${id}`)) this.map.removeLayer(`layer-${id}`);
            if (this.map.getSource(`source-${id}`)) this.map.removeSource(`source-${id}`);
        });
        this.safetyRouteSourceIds = [];

        const nearestStations = policeStations.slice(0, 3);

        nearestStations.forEach((station, index) => {
            const routeColor = index === 0 ? '#10b981' : index === 1 ? '#3b82f6' : '#f59e0b';
            const sourceId = `safety-dash-route-${index}`;

            const geojsonData = {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [this.userLocation.lng, this.userLocation.lat],
                        [station.lng, station.lat]
                    ]
                }
            };

            this.map.addSource(sourceId, {
                type: 'geojson',
                data: geojsonData
            });

            this.map.addLayer({
                id: `layer-${sourceId}`,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': routeColor,
                    'line-width': index === 0 ? 4 : 2.5,
                    'line-dasharray': [2, 2],
                    'line-opacity': 0.85
                }
            });

            this.safetyRouteSourceIds.push(sourceId);
        });
    }

    calculateRouteSafety(station) {
        const distance = parseFloat(station.distance) || 0;
        const officers = station.officers || 0;
        const rating = station.rating || 0;

        let safetyScore = 100 - (distance * 5) + (officers * 0.3) + (rating * 2);
        safetyScore = Math.min(100, Math.max(0, Math.round(safetyScore)));

        if (safetyScore >= 80) return 'SAFE';
        if (safetyScore >= 60) return 'MODERATE';
        return 'CAUTION';
    }

    async findPoliceStationsAlongRoute(routeCoords) {
        if (!routeCoords || routeCoords.length === 0) return [];

        const allStations = await this.fetchPoliceStations();
        const nearbyStations = [];

        allStations.forEach(station => {
            const isNearRoute = routeCoords.some(coord => {
                const distance = this.calculateDistance(
                    coord.lat, coord.lng,
                    station.lat, station.lng
                );
                return distance < 0.5;
            });

            if (isNearRoute) {
                nearbyStations.push(station);
            }
        });

        return nearbyStations;
    }

    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async displayPoliceStationsAlongRoute(routeCoords, routeId) {
        const stationsAlongRoute = await this.findPoliceStationsAlongRoute(routeCoords);

        if (this.routePoliceMarkers) {
            this.routePoliceMarkers.forEach(marker => marker.remove());
        }
        this.routePoliceMarkers = [];

        stationsAlongRoute.forEach(station => {
            const popupHtml = `
                <div style="min-width:200px;color:#0f172a;">
                    <strong style="color:#1e3a5f;font-size:14px;">${station.name}</strong><br>
                    <span style="color:#10b981;font-size:12px;font-weight:700;">On your route</span><br>
                    <span style="color:#64748b;font-size:12px;">${station.address}</span><br>
                    <span style="color:#64748b;font-size:12px;">📞 ${station.phone}</span>
                </div>
            `;

            const marker = window.SecureStepMap.createMarker(station.lat, station.lng, {
                color: '#1e3a5f',
                strokeColor: '#10b981',
                strokeWidth: 2,
                size: 20,
                type: 'police',
                popupHtml
            });

            marker.addTo(this.map);
            this.routePoliceMarkers.push(marker);
        });

        return stationsAlongRoute;
    }

    async showNearbyPrecincts(srcCoord, dstCoord) {
        if (!this.map) return;

        if (this.precinctMarkers) {
            this.precinctMarkers.forEach(marker => marker.remove());
        }
        this.precinctMarkers = [];

        const allStations = await this.fetchPoliceStations();

        const srcNearbyStations = allStations.filter(station => {
            return this.calculateDistance(srcCoord.lat, srcCoord.lng, station.lat, station.lng) < 2;
        });

        const dstNearbyStations = allStations.filter(station => {
            return this.calculateDistance(dstCoord.lat, dstCoord.lng, station.lat, station.lng) < 2;
        });

        const nearbyStations = [...srcNearbyStations, ...dstNearbyStations]
            .filter((station, index, self) =>
                index === self.findIndex(s => s.name === station.name)
            );

        const bounds = new maplibregl.LngLatBounds();

        nearbyStations.forEach(station => {
            bounds.extend([station.lng, station.lat]);

            const popupHtml = `
                <div style="min-width:220px;color:#0f172a;">
                    <strong style="color:#dc2626;font-size:15px;">${station.name}</strong><br>
                    <span style="color:#64748b;font-size:12px;">${station.jurisdiction}</span>
                    <div style="font-size:12px;margin-top:6px;">
                        <div>📍 ${station.address}</div>
                        <div>📞 ${station.phone}</div>
                    </div>
                </div>
            `;

            const marker = window.SecureStepMap.createMarker(station.lat, station.lng, {
                color: '#dc2626',
                strokeColor: '#ffffff',
                strokeWidth: 2,
                size: 22,
                type: 'pin',
                popupHtml
            });

            marker.addTo(this.map);
            this.precinctMarkers.push(marker);
        });

        if (nearbyStations.length > 0 && !bounds.isEmpty()) {
            this.map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
        }

        return nearbyStations;
    }

    async fetchPoliceStations() {
        try {
            const response = await fetch('/api/police-stations');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('Failed to fetch police stations from API:', error);
        }
        return [];
    }

    async fetchHospitals() {
        try {
            const response = await fetch('/api/hospitals');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('Failed to fetch hospitals from API:', error);
        }
        return [];
    }

    addPoliceMarkers(stations) {
        stations.forEach(station => {
            const popupHtml = `
                <div style="min-width:240px;color:#0f172a;">
                    <strong style="color:#1e3a5f;font-size:15px;">${station.name}</strong><br>
                    <span style="color:#64748b;font-size:12px;">${station.jurisdiction}</span><br>
                    <span style="color:#334155;font-size:12px;">📍 ${station.address}</span><br>
                    <span style="color:#334155;font-size:12px;">📞 ${station.phone}</span>
                </div>
            `;

            const marker = window.SecureStepMap.createMarker(station.lat, station.lng, {
                color: '#1e3a5f',
                strokeColor: '#ffffff',
                strokeWidth: 2,
                size: 22,
                type: 'police',
                popupHtml
            });

            marker.stationData = station;
            marker.addTo(this.map);
            this.policeMarkers.push(marker);
        });
    }

    addHospitalMarkers(hospitals) {
        hospitals.forEach(hospital => {
            const popupHtml = `
                <div style="min-width:200px;color:#0f172a;">
                    <strong style="color:#ef4444;font-size:15px;">${hospital.name}</strong><br>
                    <span style="color:#64748b;font-size:12px;">${hospital.address}</span><br>
                    <span style="color:#64748b;font-size:12px;">📞 ${hospital.phone}</span>
                </div>
            `;

            const marker = window.SecureStepMap.createMarker(hospital.lat, hospital.lng, {
                color: '#ef4444',
                strokeColor: '#ffffff',
                strokeWidth: 2,
                size: 22,
                type: 'hospital',
                popupHtml
            });

            marker.hospitalData = hospital;
            marker.addTo(this.map);
            this.hospitalMarkers.push(marker);
        });
    }

    clearServiceMarkers() {
        this.policeMarkers.forEach(m => m.remove());
        this.hospitalMarkers.forEach(m => m.remove());
        this.policeMarkers = [];
        this.hospitalMarkers = [];
    }

    updateFacilitiesUI(policeStations, hospitals) {
        if (policeStations.length > 0) {
            const nearestPolice = policeStations.reduce((a, b) => (Number(a.distance) || 0) < (Number(b.distance) || 0) ? a : b);
            const policeName = document.getElementById('policeName');
            const policeAddr = document.getElementById('policeAddr');
            if (policeName) policeName.textContent = nearestPolice.name;
            if (policeAddr) policeAddr.textContent = `${nearestPolice.address} • ${nearestPolice.distance || '0.8'} km`;
        }

        if (hospitals.length > 0) {
            const nearestHospital = hospitals.reduce((a, b) => (Number(a.distance) || 0) < (Number(b.distance) || 0) ? a : b);
            const hospitalName = document.getElementById('hospitalName');
            const hospitalAddr = document.getElementById('hospitalAddr');
            if (hospitalName) hospitalName.textContent = nearestHospital.name;
            if (hospitalAddr) hospitalAddr.textContent = `${nearestHospital.address} • ${nearestHospital.distance || '1.2'} km`;
        }
    }

    loadCivicSenseIncidents() {
        if (!window.civicSense) return;
        const reports = window.civicSense.getRecentReports(20);
        this.addIncidentMarkers(reports);
    }

    addIncidentMarkers(reports) {
        this.incidentMarkers.forEach(m => m.remove());
        this.incidentMarkers = [];

        if (!this.layerControls.incidents) return;

        reports.forEach(report => {
            if (!report.location) return;

            const display = window.civicSense.formatReportForDisplay(report);
            const severityColors = {
                critical: '#ef4444',
                high: '#f59e0b',
                medium: '#3b82f6',
                low: '#10b981'
            };
            const color = severityColors[report.severity] || '#64748b';

            const popupHtml = `
                <div style="min-width:200px;color:#0f172a;">
                    <strong style="color:${color};font-size:14px;">${display.typeName}</strong><br>
                    <span style="color:#334155;font-size:13px;">${report.description}</span><br>
                    <span style="color:#64748b;font-size:12px;">${display.timeAgo}</span>
                </div>
            `;

            const marker = window.SecureStepMap.createMarker(report.location.latitude, report.location.longitude, {
                color: color,
                strokeColor: '#ffffff',
                strokeWidth: 2,
                size: 20,
                type: 'incident',
                popupHtml
            });

            marker.addTo(this.map);
            this.incidentMarkers.push(marker);
        });
    }

    toggleLayer(layer) {
        this.layerControls[layer] = !this.layerControls[layer];

        if (layer === 'police') {
            this.policeMarkers.forEach(m => {
                if (this.layerControls.police) m.addTo(this.map);
                else m.remove();
            });
        } else if (layer === 'hospital') {
            this.hospitalMarkers.forEach(m => {
                if (this.layerControls.hospital) m.addTo(this.map);
                else m.remove();
            });
        } else if (layer === 'incidents') {
            this.incidentMarkers.forEach(m => {
                if (this.layerControls.incidents) m.addTo(this.map);
                else m.remove();
            });
        }
    }

    async refreshNearbyServices() {
        await this.getUserLocation();
        await this.loadNearbyServices();
    }

    centerOnUser() {
        if (this.userLocation && this.map) {
            this.map.flyTo({
                center: [this.userLocation.lng, this.userLocation.lat],
                zoom: 15,
                essential: true
            });
        }
    }

    highlightService(type, name) {
        const markers = type === 'police' ? this.policeMarkers : this.hospitalMarkers;
        markers.forEach(marker => {
            const data = type === 'police' ? marker.stationData : marker.hospitalData;
            if (data && data.name && data.name.includes(name)) {
                this.map.flyTo({
                    center: [data.lng, data.lat],
                    zoom: 16,
                    essential: true
                });
                marker.togglePopup();
            }
        });
    }
}

window.dashboardMap = new DashboardMap();

document.addEventListener('DOMContentLoaded', () => {
    window.loadMapLibreApi().then(() => {
        window.dashboardMap.initialize();
    }).catch(e => console.warn(e));
});
