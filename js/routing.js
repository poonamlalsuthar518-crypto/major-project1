/* routing.js
   Keyless geocoding and real road routing via OpenStreetMap Nominatim and OSRM.
   Functions: getCoordinates(query), findRoutes(srcCoord, dstCoord)
*/

async function getCoordinates(place) {
    if (!place || !place.trim()) throw new Error('Empty place query');

    await window.loadMapLibreApi();

    if (!window.SecureStepMap) {
        throw new Error('SecureStep map module is not loaded');
    }

    try {
        const result = await window.SecureStepMap.geocode(place);
        return {
            lat: result.lat,
            lng: result.lng,
            display_name: result.display_name
        };
    } catch (err) {
        console.error('Geocoding error:', err);
        throw new Error(`Geocoding failed for "${place}": ${err.message}`);
    }
}

async function findRoutes(srcCoord, dstCoord) {
    if (!srcCoord || !dstCoord) throw new Error('Invalid coordinates provided for routing');

    await window.loadMapLibreApi();

    if (!window.SecureStepMap) {
        throw new Error('SecureStep map module is not loaded');
    }

    try {
        const routes = await window.SecureStepMap.calculateRoutes(srcCoord, dstCoord);

        if (!routes || routes.length === 0) {
            throw new Error('No routes returned by OSRM');
        }

        return routes;
    } catch (err) {
        console.error('Routing error:', err);
        throw new Error(`Routing failed: ${err.message}`);
    }
}

window.Routing = { getCoordinates, findRoutes };
