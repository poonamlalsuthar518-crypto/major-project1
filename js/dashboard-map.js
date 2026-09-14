/*
 Dashboard Map Module for SecureStep
 Interactive map displaying police stations, hospitals, and CivicSense incidents using Google Maps Platform.
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
        this.safetyRoutes = [];
        this.routePoliceMarkers = [];
        this.precinctMarkers = [];
        this.layerControls = {
            police: true,
            hospital: true,
            incidents: true
        };
        this.defaultCenter = { lat: 12.9716, lng: 77.5946 }; // Bengaluru
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
            await window.loadGoogleMapsApi();

            this.map = new google.maps.Map(container, {
                center: this.defaultCenter,
                zoom: 13,
                mapTypeControl: true,
                streetViewControl: false,
                fullscreenControl: true
            });

            await this.getUserLocation();
            await this.loadNearbyServices();
            this.loadCivicSenseIncidents();

            console.log('Dashboard Google Map initialized successfully');
        } catch (error) {
            console.error('Failed to initialize dashboard map:', error);
            container.innerHTML = '<div style="padding:20px;color:#ef4444">Failed to initialize map. See console for details.</div>';
        }
    }

    async getUserLocation() {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported');
            this.userLocation = { lat: this.defaultCenter.lat, lng: this.defaultCenter.lng };
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
                        this.map.setCenter(this.userLocation);
                        this.map.setZoom(14);

                        if (this.userMarker) {
                            this.userMarker.setMap(null);
                        }

                        this.userMarker = new google.maps.Marker({
                            position: this.userLocation,
                            map: this.map,
                            title: 'Your Location',
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 9,
                                fillColor: '#4fc3f7',
                                fillOpacity: 1,
                                strokeColor: '#ffffff',
                                strokeWeight: 3
                            }
                        });
                    }
                    resolve();
                },
                (error) => {
                    console.warn('Could not get user location:', error);
                    this.userLocation = { lat: this.defaultCenter.lat, lng: this.defaultCenter.lng };
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

        if (this.safetyRoutes) {
            this.safetyRoutes.forEach(r => r.setMap(null));
        }
        this.safetyRoutes = [];

        const nearestStations = policeStations.slice(0, 3);

        nearestStations.forEach((station, index) => {
            const routeColor = index === 0 ? '#10b981' : index === 1 ? '#3b82f6' : '#f59e0b';

            const routeLine = new google.maps.Polyline({
                path: [
                    { lat: this.userLocation.lat, lng: this.userLocation.lng },
                    { lat: station.lat, lng: station.lng }
                ],
                geodesic: true,
                strokeColor: routeColor,
                strokeOpacity: 0.8,
                strokeWeight: index === 0 ? 5 : 3,
                map: this.map
            });

            this.safetyRoutes.push(routeLine);
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
            this.routePoliceMarkers.forEach(marker => marker.setMap(null));
        }
        this.routePoliceMarkers = [];

        stationsAlongRoute.forEach(station => {
            const marker = new google.maps.Marker({
                position: { lat: station.lat, lng: station.lng },
                map: this.map,
                title: station.name,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: '#1e3a5f',
                    fillOpacity: 1,
                    strokeColor: '#10b981',
                    strokeWeight: 2
                }
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="min-width:200px;">
                        <strong style="color:#1e3a5f;font-size:14px;">${station.name}</strong><br>
                        <span style="color:#10b981;font-size:12px;">On your route</span><br>
                        <span style="color:#64748b;font-size:12px;">${station.address}</span><br>
                        <span style="color:#64748b;font-size:12px;">📞 ${station.phone}</span>
                    </div>
                `
            });

            marker.addListener('click', () => infoWindow.open(this.map, marker));
            this.routePoliceMarkers.push(marker);
        });

        return stationsAlongRoute;
    }

    async showNearbyPrecincts(srcCoord, dstCoord) {
        if (!this.map) return;

        if (this.precinctMarkers) {
            this.precinctMarkers.forEach(marker => marker.setMap(null));
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

        const bounds = new google.maps.LatLngBounds();

        nearbyStations.forEach(station => {
            const pos = { lat: station.lat, lng: station.lng };
            bounds.extend(pos);

            const marker = new google.maps.Marker({
                position: pos,
                map: this.map,
                title: station.name,
                icon: {
                    path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                    scale: 6,
                    fillColor: '#dc2626',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                }
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="min-width:220px;padding:6px;">
                        <strong style="color:#dc2626;font-size:15px;">${station.name}</strong><br>
                        <span style="color:#64748b;font-size:12px;">${station.jurisdiction}</span>
                        <div style="font-size:12px;margin-top:6px;">
                            <div>📍 ${station.address}</div>
                            <div>📞 ${station.phone}</div>
                        </div>
                    </div>
                `
            });

            marker.addListener('click', () => infoWindow.open(this.map, marker));
            this.precinctMarkers.push(marker);
        });

        if (nearbyStations.length > 0 && !bounds.isEmpty()) {
            this.map.fitBounds(bounds);
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
            const marker = new google.maps.Marker({
                position: { lat: station.lat, lng: station.lng },
                map: this.map,
                title: station.name,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: '#1e3a5f',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                }
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="min-width:240px;padding:6px;">
                        <strong style="color:#1e3a5f;font-size:16px;">${station.name}</strong><br>
                        <span style="color:#64748b;font-size:12px;">${station.jurisdiction}</span><br>
                        <span style="color:#334155;font-size:12px;">📍 ${station.address}</span><br>
                        <span style="color:#334155;font-size:12px;">📞 ${station.phone}</span>
                    </div>
                `
            });

            marker.addListener('click', () => infoWindow.open(this.map, marker));
            this.policeMarkers.push(marker);
        });
    }

    addHospitalMarkers(hospitals) {
        hospitals.forEach(hospital => {
            const marker = new google.maps.Marker({
                position: { lat: hospital.lat, lng: hospital.lng },
                map: this.map,
                title: hospital.name,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: '#ef4444',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                }
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="min-width:200px;">
                        <strong style="color:#ef4444;font-size:15px;">${hospital.name}</strong><br>
                        <span style="color:#64748b;font-size:12px;">${hospital.address}</span><br>
                        <span style="color:#64748b;font-size:12px;">📞 ${hospital.phone}</span>
                    </div>
                `
            });

            marker.addListener('click', () => infoWindow.open(this.map, marker));
            this.hospitalMarkers.push(marker);
        });
    }

    clearServiceMarkers() {
        this.policeMarkers.forEach(m => m.setMap(null));
        this.hospitalMarkers.forEach(m => m.setMap(null));
        this.policeMarkers = [];
        this.hospitalMarkers = [];
    }

    updateFacilitiesUI(policeStations, hospitals) {
        if (policeStations.length > 0) {
            const nearestPolice = policeStations.reduce((a, b) => a.distance < b.distance ? a : b);
            const policeName = document.getElementById('policeName');
            const policeAddr = document.getElementById('policeAddr');
            if (policeName) policeName.textContent = nearestPolice.name;
            if (policeAddr) policeAddr.textContent = `${nearestPolice.address} • ${nearestPolice.distance} km`;
        }

        if (hospitals.length > 0) {
            const nearestHospital = hospitals.reduce((a, b) => a.distance < b.distance ? a : b);
            const hospitalName = document.getElementById('hospitalName');
            const hospitalAddr = document.getElementById('hospitalAddr');
            if (hospitalName) hospitalName.textContent = nearestHospital.name;
            if (hospitalAddr) hospitalAddr.textContent = `${nearestHospital.address} • ${nearestHospital.distance} km`;
        }
    }

    loadCivicSenseIncidents() {
        if (!window.civicSense) return;
        const reports = window.civicSense.getRecentReports(20);
        this.addIncidentMarkers(reports);
    }

    addIncidentMarkers(reports) {
        this.incidentMarkers.forEach(m => m.setMap(null));
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

            const marker = new google.maps.Marker({
                position: { lat: report.location.latitude, lng: report.location.longitude },
                map: this.map,
                title: display.typeName,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 6,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                }
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="min-width:200px;">
                        <strong style="color:${color};font-size:14px;">${display.typeName}</strong><br>
                        <span style="color:#334155;font-size:13px;">${report.description}</span><br>
                        <span style="color:#64748b;font-size:12px;">${display.timeAgo}</span>
                    </div>
                `
            });

            marker.addListener('click', () => infoWindow.open(this.map, marker));
            this.incidentMarkers.push(marker);
        });
    }

    toggleLayer(layer) {
        this.layerControls[layer] = !this.layerControls[layer];

        if (layer === 'police') {
            this.policeMarkers.forEach(m => m.setMap(this.layerControls.police ? this.map : null));
        } else if (layer === 'hospital') {
            this.hospitalMarkers.forEach(m => m.setMap(this.layerControls.hospital ? this.map : null));
        } else if (layer === 'incidents') {
            this.incidentMarkers.forEach(m => m.setMap(this.layerControls.incidents ? this.map : null));
        }
    }

    async refreshNearbyServices() {
        await this.getUserLocation();
        await this.loadNearbyServices();
    }

    centerOnUser() {
        if (this.userLocation && this.map) {
            this.map.setCenter(this.userLocation);
            this.map.setZoom(15);
        }
    }

    highlightService(type, name) {
        const markers = type === 'police' ? this.policeMarkers : this.hospitalMarkers;
        markers.forEach(marker => {
            if (marker.getTitle() && marker.getTitle().includes(name)) {
                this.map.setCenter(marker.getPosition());
                this.map.setZoom(16);
            }
        });
    }
}

window.dashboardMap = new DashboardMap();

document.addEventListener('DOMContentLoaded', () => {
    window.loadGoogleMapsApi().then(() => {
        window.dashboardMap.initialize();
    }).catch(e => console.warn(e));
});
