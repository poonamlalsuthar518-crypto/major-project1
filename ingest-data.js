const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'securestep_db'
};

// Simple XML parser for KML files
function parseKML(kmlContent, zone) {
    const placemarks = [];
    const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    const nameRegex = /<name>(.*?)<\/name>/;
    const coordsRegex = /<coordinates>(.*?)<\/coordinates>/;
    const descRegex = /<description>(.*?)<\/description>/;
    
    let match;
    while ((match = placemarkRegex.exec(kmlContent)) !== null) {
        const placemarkContent = match[1];
        
        const nameMatch = nameRegex.exec(placemarkContent);
        const coordsMatch = coordsRegex.exec(placemarkContent);
        const descMatch = descRegex.exec(placemarkContent);
        
        if (coordsMatch) {
            const coords = coordsMatch[1].trim().split(/\s+/);
            if (coords.length >= 2) {
                const lng = parseFloat(coords[0]);
                const lat = parseFloat(coords[1]);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    placemarks.push({
                        name: nameMatch ? nameMatch[1].trim() : '',
                        latitude: lat,
                        longitude: lng,
                        zone: zone,
                        description: descMatch ? descMatch[1].trim() : ''
                    });
                }
            }
        }
        
        // Reset regex lastIndex
        nameRegex.lastIndex = 0;
        coordsRegex.lastIndex = 0;
        descRegex.lastIndex = 0;
    }
    
    return placemarks;
}

// Parse police station CSV
function parsePoliceCSV(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    const stations = [];
    
    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV with quoted fields
        const matches = line.match(/("([^"]*)"|[^,]+)/g);
        if (matches && matches.length >= 3) {
            const sl = matches[0].replace(/"/g, '').trim();
            const code = matches[1] ? matches[1].replace(/"/g, '').trim() : '';
            const stationInfo = matches[2] ? matches[2].replace(/"/g, '').trim() : '';
            const unit = matches[3] ? matches[3].replace(/"/g, '').trim() : '';
            const dcp = matches[4] ? matches[4].replace(/"/g, '').trim() : '';
            const acp = matches[5] ? matches[5].replace(/"/g, '').trim() : '';
            
            // Extract phone number from station info
            const phoneMatch = stationInfo.match(/Ph no\.?\s*([\d\s\-]+)/);
            const phone = phoneMatch ? phoneMatch[1].trim() : '';
            
            // Clean station name
            const name = stationInfo.replace(/Ph no\.?[\d\s\-]+/g, '').trim();
            
            stations.push({
                name: name,
                phone: phone,
                jurisdiction: dcp || unit,
                address: stationInfo
            });
        }
    }
    
    return stations;
}

// Ingest streetlights into database
async function ingestStreetlights(connection, zone, kmlFile) {
    console.log(`Processing streetlights for ${zone}...`);
    
    const kmlContent = fs.readFileSync(kmlFile, 'utf8');
    const placemarks = parseKML(kmlContent, zone);
    
    console.log(`Found ${placemarks.length} streetlights in ${zone}`);
    
    let inserted = 0;
    for (const placemark of placemarks) {
        try {
            await connection.execute(
                `INSERT INTO streetlights (name, latitude, longitude, zone, source, source_updated_at) 
                 VALUES (?, ?, ?, ?, 'OpenCity BBMP', CURDATE())`,
                [placemark.name, placemark.latitude, placemark.longitude, placemark.zone]
            );
            inserted++;
        } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') {
                console.error('Error inserting streetlight:', error.message);
            }
        }
    }
    
    console.log(`Inserted ${inserted} streetlights for ${zone}`);
    return inserted;
}

// Ingest police stations into database
async function ingestPoliceStations(connection, csvFile, kmlFile) {
    console.log('Processing police stations...');
    
    // First, parse CSV for contact info
    const csvContent = fs.readFileSync(csvFile, 'utf8');
    const csvStations = parsePoliceCSV(csvContent);
    
    console.log(`Found ${csvStations.length} police stations in CSV`);
    
    // Create a map for quick lookup by name
    const stationMap = new Map();
    csvStations.forEach(station => {
        const key = station.name.toLowerCase().replace(/\s+/g, '');
        stationMap.set(key, station);
    });
    
    // Parse KML for coordinates
    const kmlContent = fs.readFileSync(kmlFile, 'utf8');
    const kmlStations = parseKML(kmlContent, 'Bangalore');
    
    console.log(`Found ${kmlStations.length} police station locations in KML`);
    
    let inserted = 0;
    for (const kmlStation of kmlStations) {
        const key = kmlStation.name.toLowerCase().replace(/\s+/g, '');
        const csvStation = stationMap.get(key);
        
        const phone = csvStation ? csvStation.phone : '';
        const jurisdiction = csvStation ? csvStation.jurisdiction : kmlStation.zone;
        const address = csvStation ? csvStation.address : kmlStation.description;
        
        try {
            await connection.execute(
                `INSERT INTO police_stations (name, latitude, longitude, address, phone, jurisdiction, source, source_updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, 'OpenCity/KSRSAC', CURDATE())`,
                [kmlStation.name, kmlStation.latitude, kmlStation.longitude, address, phone, jurisdiction]
            );
            inserted++;
        } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') {
                console.error('Error inserting police station:', error.message);
            }
        }
    }
    
    console.log(`Inserted ${inserted} police stations`);
    return inserted;
}

// Main function
async function main() {
    let connection;
    
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Database connected successfully');
        
        let totalStreetlights = 0;
        
        // Ingest streetlights from KML files
        const streetlightFiles = [
            { zone: 'RR Nagar', file: 'rr-nagar-streetlights.kml' },
            { zone: 'Bangalore East', file: 'bangalore-east-streetlights.kml' },
            { zone: 'Bommanahalli', file: 'bommanahalli-streetlights.kml' }
        ];
        
        for (const { zone, file } of streetlightFiles) {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                const count = await ingestStreetlights(connection, zone, filePath);
                totalStreetlights += count;
            } else {
                console.log(`File not found: ${file}`);
            }
        }
        
        // Ingest police stations
        const policeCSV = path.join(__dirname, 'bangalore-police-stations.csv');
        const policeKML = path.join(__dirname, 'police-stations-locations.kml');
        
        if (fs.existsSync(policeCSV) && fs.existsSync(policeKML)) {
            const policeCount = await ingestPoliceStations(connection, policeCSV, policeKML);
            console.log(`\nTotal police stations inserted: ${policeCount}`);
        } else {
            console.log('Police station files not found');
        }
        
        console.log(`\nTotal streetlights inserted: ${totalStreetlights}`);
        console.log('Data ingestion completed successfully');
        
    } catch (error) {
        console.error('Error during data ingestion:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed');
        }
    }
}

main();
