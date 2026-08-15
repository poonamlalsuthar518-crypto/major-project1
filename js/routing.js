/* routing.js
   Uses Nominatim for geocoding and OSRM for routing (public demo services).
   Functions: getCoordinates(query), findRoutes(srcCoord, dstCoord)

   Note: These public endpoints are for development/demo only. Do not overload.
*/

const NominatimBase = 'https://nominatim.openstreetmap.org/search';
const OSRMBase = 'https://router.project-osrm.org/route/v1/driving';

async function getCoordinates(place){
    if(!place || !place.trim()) throw new Error('Empty place');
    const q = encodeURIComponent(place);
    const url = `${NominatimBase}?q=${q}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    if(!data || data.length===0) throw new Error('Location not found');
    const item = data[0];
    return { lat: parseFloat(item.lat), lng: parseFloat(item.lon), display_name: item.display_name };
}

async function findRoutes(srcCoord, dstCoord){
    // srcCoord, dstCoord: {lat, lng}
    if(!srcCoord || !dstCoord) throw new Error('Invalid coords');
    const src = `${srcCoord.lng},${srcCoord.lat}`; // lon,lat
    const dst = `${dstCoord.lng},${dstCoord.lat}`;
    const url = `${OSRMBase}/${src};${dst}?alternatives=true&overview=full&geometries=geojson`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('Routing failed');
    const data = await res.json();
    if(!data || !data.routes || data.routes.length===0) throw new Error('No routes found');

    // Map OSRM routes to a friendly structure
    const routes = data.routes.map((r, idx)=>{
        const coords = r.geometry.coordinates.map(c=>({lng:c[0], lat:c[1]}));
        const distance_m = r.distance || 0;
        const duration_s = r.duration || 0;
        return {
            id: 'route_' + idx,
            index: idx,
            distance_m,
            distance_km: (distance_m/1000).toFixed(2),
            duration_min: Math.round(duration_s/60),
            coords,
            raw: r
        };
    });

    return routes;
}

// Expose functions
window.Routing = { getCoordinates, findRoutes };
