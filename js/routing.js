/* routing.js
   Uses Google Maps Platform (Geocoder and DirectionsService) for geocoding and routing.
   Functions: getCoordinates(query), findRoutes(srcCoord, dstCoord)
*/

async function getCoordinates(place) {
    if (!place || !place.trim()) throw new Error('Empty place query');

    await window.loadGoogleMapsApi();

    if (window.google && window.google.maps && window.google.maps.Geocoder) {
        const geocoder = new google.maps.Geocoder();
        return new Promise((resolve, reject) => {
            geocoder.geocode({ address: place }, (results, status) => {
                if (status === 'OK' && results && results.length > 0) {
                    const loc = results[0].geometry.location;
                    resolve({
                        lat: loc.lat(),
                        lng: loc.lng(),
                        display_name: results[0].formatted_address
                    });
                } else {
                    reject(new Error(`Geocoding failed for "${place}": ${status}`));
                }
            });
        });
    }

    // Fallback: Client-side HTTP Geocoding API if script not initialized
    throw new Error('Google Maps Geocoder service is not initialized.');
}

async function findRoutes(srcCoord, dstCoord) {
    if (!srcCoord || !dstCoord) throw new Error('Invalid coordinates provided for routing');

    await window.loadGoogleMapsApi();

    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
        throw new Error('Google Maps DirectionsService is not available');
    }

    const directionsService = new google.maps.DirectionsService();

    const request = {
        origin: new google.maps.LatLng(srcCoord.lat, srcCoord.lng),
        destination: new google.maps.LatLng(dstCoord.lat, dstCoord.lng),
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true
    };

    return new Promise((resolve, reject) => {
        directionsService.route(request, (result, status) => {
            if (status === 'OK' && result && result.routes && result.routes.length > 0) {
                const formattedRoutes = result.routes.map((gRoute, index) => {
                    const leg = gRoute.legs[0];
                    const coords = gRoute.overview_path.map(p => ({
                        lat: p.lat(),
                        lng: p.lng()
                    }));

                    const distance_m = leg.distance.value;
                    const duration_s = leg.duration.value;

                    return {
                        id: 'route_' + index,
                        index: index,
                        distance_m: distance_m,
                        distance_km: (distance_m / 1000).toFixed(2),
                        duration_min: Math.round(duration_s / 60),
                        coords: coords,
                        summary: gRoute.summary || (`Route ${index + 1}`),
                        googleRoute: gRoute,
                        routeType: index === 0 ? 'Primary' : `Alternative ${index}`
                    };
                });

                resolve(formattedRoutes);
            } else {
                reject(new Error(`Google Maps routing failed: ${status}`));
            }
        });
    });
}

window.Routing = { getCoordinates, findRoutes };
