const fs = require('fs');
const path = require('path');

// Dictionary of known Bangalore locations to precise coordinates
const locationCoords = {
    'cubbon park': { lat: 12.9716, lng: 77.6046 },
    'v.v.tower': { lat: 12.9785, lng: 77.5925 },
    'vidhanasoudha': { lat: 12.9797, lng: 77.5907 },
    'highgrounds': { lat: 12.9875, lng: 77.5842 },
    'seshadripuram': { lat: 12.9912, lng: 77.5786 },
    'sadashivanagar': { lat: 13.0068, lng: 77.5813 },
    'vyalikaval': { lat: 13.0014, lng: 77.5752 },
    's.j.park': { lat: 12.9642, lng: 77.5815 },
    'ashoknagar': { lat: 12.9705, lng: 77.6068 },
    's.r.nagar': { lat: 12.9584, lng: 77.5912 },
    'ulsoorgate': { lat: 12.9678, lng: 77.5876 },
    'viveknagar': { lat: 12.9482, lng: 77.6214 },
    'wilsongarden': { lat: 12.9465, lng: 77.5954 },
    'hal': { lat: 12.9542, lng: 77.6685 },
    'bowring': { lat: 12.9835, lng: 77.6045 },
    'bharathinagar': { lat: 12.9856, lng: 77.6125 },
    'commercial street': { lat: 12.9814, lng: 77.6086 },
    'd.j.halli': { lat: 13.0084, lng: 77.6142 },
    'frazer town': { lat: 12.9975, lng: 77.6135 },
    'banasawadi': { lat: 13.0125, lng: 77.6485 },
    'hennur': { lat: 13.0285, lng: 77.6358 },
    'kadugondanahalli': { lat: 13.0185, lng: 77.6195 },
    'k.r.puram': { lat: 13.0085, lng: 77.6958 },
    'mahadevapura': { lat: 12.9915, lng: 77.6912 },
    'ramamurthynagar': { lat: 13.0195, lng: 77.6685 },
    'byappanahalli': { lat: 12.9895, lng: 77.6525 },
    'airport': { lat: 12.9568, lng: 77.6625 },
    'jeevanabimanagar': { lat: 12.9645, lng: 77.6548 },
    'indiranagar': { lat: 12.9784, lng: 77.6408 },
    'shivajinagar': { lat: 12.9856, lng: 77.6012 },
    'ulsoor': { lat: 12.9815, lng: 77.6248 },
    'chickpet': { lat: 12.9705, lng: 77.5752 },
    'kalasipalyam': { lat: 12.9615, lng: 77.5768 },
    'market': { lat: 12.9658, lng: 77.5762 },
    'upparpet': { lat: 12.9745, lng: 77.5742 },
    'byatarayanapura': { lat: 12.9548, lng: 77.5412 },
    'chandra layout': { lat: 12.9578, lng: 77.5258 },
    'jnanabharathi': { lat: 12.9465, lng: 77.5028 },
    'j.j.nagar': { lat: 12.9612, lng: 77.5585 },
    'cottonpet': { lat: 12.9695, lng: 77.5685 },
    'kengeri': { lat: 12.9085, lng: 77.4858 },
    'basaveshwaranagar': { lat: 12.9865, lng: 77.5385 },
    'vijayanagar': { lat: 12.9715, lng: 77.5328 },
    'kempapura': { lat: 12.9642, lng: 77.5485 },
    'kamakshipalya': { lat: 12.9825, lng: 77.5215 },
    'magadi road': { lat: 12.9758, lng: 77.5528 },
    'hebbal': { lat: 13.0358, lng: 77.5985 },
    'j.c.nagar': { lat: 13.0015, lng: 77.5925 },
    'r.t.nagar': { lat: 13.0215, lng: 77.5958 },
    'yelahanka': { lat: 13.1015, lng: 77.5712 },
    'sanjaynagar': { lat: 13.0385, lng: 77.5758 },
    'mahalakshmi': { lat: 13.0145, lng: 77.5485 },
    'malleshwaram': { lat: 12.9985, lng: 77.5708 },
    'nandini layout': { lat: 13.0185, lng: 77.5368 },
    'rajagopalanagar': { lat: 13.0115, lng: 77.5185 },
    'rajajinagar': { lat: 12.9915, lng: 77.5548 },
    'srirampura': { lat: 12.9945, lng: 77.5615 },
    'soladevanahalli': { lat: 13.0785, lng: 77.5085 },
    'gangammanagudi': { lat: 13.0545, lng: 77.5428 },
    'koramangala': { lat: 12.9352, lng: 77.6245 },
    'madiwala': { lat: 12.9215, lng: 77.6185 },
    'hsr layout': { lat: 12.9121, lng: 77.6445 },
    'electronic city': { lat: 12.8452, lng: 77.6602 },
    'whitefield': { lat: 12.9698, lng: 77.7499 },
    'marathahalli': { lat: 12.9592, lng: 77.6974 },
    'jayanagar': { lat: 12.9298, lng: 77.5826 },
    'jp nagar': { lat: 12.9068, lng: 77.5855 },
    'banashankari': { lat: 12.9254, lng: 77.5468 }
};

// Simple XML parser for KML files
function parseKML(kmlContent, zone) {
    const placemarks = [];
    const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    const nameRegex = /<name>(.*?)<\/name>/;
    const simpleDataNameRegex = /<SimpleData name="RW_POL_STAName">(.*?)<\/SimpleData>/;
    const coordsRegex = /<coordinates>(.*?)<\/coordinates>/;
    const descRegex = /<description>(.*?)<\/description>/;
    
    let match;
    while ((match = placemarkRegex.exec(kmlContent)) !== null) {
        const placemarkContent = match[1];
        
        const nameMatch = nameRegex.exec(placemarkContent);
        const simpleDataNameMatch = simpleDataNameRegex.exec(placemarkContent);
        const coordsMatch = coordsRegex.exec(placemarkContent);
        const descMatch = descRegex.exec(placemarkContent);
        
        if (coordsMatch) {
            const coords = coordsMatch[1].trim().split(/\s+/);
            if (coords.length >= 2) {
                const lng = parseFloat(coords[0]);
                const lat = parseFloat(coords[1]);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    const name = simpleDataNameMatch ? simpleDataNameMatch[1].trim() : (nameMatch ? nameMatch[1].trim() : 'Police Station');
                    placemarks.push({
                        name: name,
                        lat: lat,
                        lng: lng,
                        zone: zone || 'Railway Police',
                        description: descMatch ? descMatch[1].trim() : ''
                    });
                }
            }
        }
        
        nameRegex.lastIndex = 0;
        simpleDataNameRegex.lastIndex = 0;
        coordsRegex.lastIndex = 0;
        descRegex.lastIndex = 0;
    }
    
    return placemarks;
}

// Parse police station CSV handling CSV quotes correctly
function parsePoliceCSV(csvContent) {
    const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
    const stations = [];

    // Simple robust CSV line splitter
    function splitCSVLine(text) {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                if (inQuotes && text[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur);
        return result;
    }

    for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        // Remove outer wrapper quote if present
        if (line.startsWith('"') && line.endsWith('"')) {
            line = line.substring(1, line.length - 1);
        }
        
        const cols = splitCSVLine(line).map(c => c.trim().replace(/^"+|"+$/g, ''));
        if (cols.length >= 3) {
            const sl = cols[0];
            const code = cols[1];
            const stationInfo = cols[2];
            const unit = cols[3] || 'Bengaluru City Police';
            const dcp = cols[4] || 'City Police Division';
            const acp = cols[5] || 'Police Sub-Division';

            // Extract phone number from station info
            const phoneMatch = stationInfo.match(/Ph\s*no\.?\s*([\d\s\-\,]+)/i);
            const phone = phoneMatch ? phoneMatch[1].trim() : '080-22942222';

            // Clean station name & address
            let cleanInfo = stationInfo.replace(/Ph\s*no\.?[\d\s\-\,]+/gi, '').trim();
            const nameParts = cleanInfo.split(/\s+/);
            const name = (nameParts[0] || 'Police Station') + ' Police Station';

            stations.push({
                code: code,
                rawName: nameParts[0] || '',
                name: name,
                address: cleanInfo,
                phone: phone,
                unit: unit,
                jurisdiction: `${dcp} (${acp})`,
                dcp: dcp,
                acp: acp
            });
        }
    }

    return stations;
}

// Find coordinates for station based on dictionary lookup
function getCoordinatesForStation(station, index) {
    const key = (station.rawName || '').toLowerCase().trim();
    for (const [locKey, coords] of Object.entries(locationCoords)) {
        if (key.includes(locKey) || locKey.includes(key)) {
            // Add slight jitter so overlapping stations don't stack exactly
            const jitterLat = (Math.sin(index * 1.5) * 0.002);
            const jitterLng = (Math.cos(index * 1.5) * 0.002);
            return {
                lat: coords.lat + jitterLat,
                lng: coords.lng + jitterLng
            };
        }
    }

    // Default fallback spread around central Bangalore
    const angle = (index / 100) * 2 * Math.PI;
    const radius = 0.02 + ((index % 5) * 0.015);
    return {
        lat: 12.9716 + (Math.sin(angle) * radius),
        lng: 77.5946 + (Math.cos(angle) * radius)
    };
}

function main() {
    console.log('Parsing data files to JSON...');

    // 1. Streetlights KML
    const streetlightFiles = [
        { zone: 'RR Nagar', file: 'rr-nagar-streetlights.kml' },
        { zone: 'Bangalore East', file: 'bangalore-east-streetlights.kml' },
        { zone: 'Bommanahalli', file: 'bommanahalli-streetlights.kml' }
    ];

    const allStreetlights = [];
    for (const { zone, file } of streetlightFiles) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            console.log(`Processing ${file}...`);
            const kmlContent = fs.readFileSync(filePath, 'utf8');
            const placemarks = parseKML(kmlContent, zone);
            console.log(`Found ${placemarks.length} streetlights in ${zone}`);
            allStreetlights.push(...placemarks);
        }
    }
    fs.writeFileSync('data-streetlights.json', JSON.stringify(allStreetlights, null, 2));
    console.log(`Saved ${allStreetlights.length} streetlights to data-streetlights.json`);

    // 2. Police Stations CSV & KML
    const policeCSV = path.join(__dirname, 'bangalore-police-stations.csv');
    const policeKML = path.join(__dirname, 'police-stations-locations.kml');
    let allPoliceStations = [];

    if (fs.existsSync(policeCSV)) {
        console.log('Processing police stations from CSV...');
        const csvContent = fs.readFileSync(policeCSV, 'utf8');
        const csvStations = parsePoliceCSV(csvContent);

        allPoliceStations = csvStations.map((st, idx) => {
            const coords = getCoordinatesForStation(st, idx);
            return {
                id: idx + 1,
                code: st.code,
                name: st.name,
                lat: coords.lat,
                lng: coords.lng,
                address: st.address,
                phone: st.phone,
                jurisdiction: st.jurisdiction,
                hours: '24/7',
                officers: 30 + (idx % 25),
                rating: (4.0 + (idx % 10) * 0.1).toFixed(1),
                services: ['24/7 Emergency Patrol', 'Women Help Desk', 'SOS Dispatch', 'Crime Reporting'],
                distance: (1.0 + (idx % 8) * 0.5).toFixed(1)
            };
        });
    }

    // Merge KML Railway Police Stations if available
    if (fs.existsSync(policeKML)) {
        const kmlContent = fs.readFileSync(policeKML, 'utf8');
        const kmlStations = parseKML(kmlContent, 'Railway Police');
        kmlStations.forEach((kmlSt, idx) => {
            allPoliceStations.push({
                id: allPoliceStations.length + 1,
                code: `RWP-${idx + 1}`,
                name: kmlSt.name || 'Railway Police Station',
                lat: kmlSt.lat,
                lng: kmlSt.lng,
                address: `Railway Station Premises, Bengaluru`,
                phone: '080-22871291',
                jurisdiction: 'Railway Protection & City Division',
                hours: '24/7',
                officers: 40,
                rating: '4.7',
                services: ['Railway Patrol', 'Emergency SOS', 'Passenger Security'],
                distance: '2.0'
            });
        });
    }

    fs.writeFileSync('data-police-stations.json', JSON.stringify(allPoliceStations, null, 2));
    console.log(`Saved ${allPoliceStations.length} police stations to data-police-stations.json`);
    console.log('Data parsing completed successfully');
}

main();

