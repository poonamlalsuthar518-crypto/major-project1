require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT || 8000);
const DATABASE_FILE = path.join(__dirname, 'users.json');
const CONTACTS_FILE = path.join(__dirname, 'emergency_contacts.json');
const SOS_ALERTS_FILE = path.join(__dirname, 'sos_alerts.json');
let dbConnection = null;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

function getUsersJson() {
  try {
    if (fs.existsSync(DATABASE_FILE)) {
      const data = fs.readFileSync(DATABASE_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error reading users.json:', error);
    return [];
  }
}

function saveUsersJson(users) {
  try {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving users.json:', error);
    return false;
  }
}

function getContactsJson() {
  try {
    if (fs.existsSync(CONTACTS_FILE)) {
      const data = fs.readFileSync(CONTACTS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error reading emergency_contacts.json:', error);
    return [];
  }
}

function saveContactsJson(contacts) {
  try {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving emergency_contacts.json:', error);
    return false;
  }
}

function getSosAlertsJson() {
  try {
    if (fs.existsSync(SOS_ALERTS_FILE)) {
      const data = fs.readFileSync(SOS_ALERTS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error reading sos_alerts.json:', error);
    return [];
  }
}

function saveSosAlertsJson(alerts) {
  try {
    fs.writeFileSync(SOS_ALERTS_FILE, JSON.stringify(alerts, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving sos_alerts.json:', error);
    return false;
  }
}

async function ensureMySqlConnection() {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    console.warn('MySQL environment variables are not configured. Falling back to users.json persistence.');
    return false;
  }

  try {
    dbConnection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        phone VARCHAR(20) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('MySQL persistence is active.');
    return true;
  } catch (error) {
    console.warn('MySQL unavailable. Using local JSON fallback for now.');
    dbConnection = null;
    return false;
  }
}

async function registerUser({ fullName, email, phone, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(fullName || '').trim();
  const normalizedPhone = String(phone || '').trim();

  if (!normalizedName || !normalizedEmail || !normalizedPhone || !password) {
    return { success: false, status: 400, message: 'All fields are required.' };
  }

  if (!/^[0-9]{10}$/.test(normalizedPhone)) {
    return { success: false, status: 400, message: 'Phone number must be 10 digits.' };
  }

  if (password.length < 6) {
    return { success: false, status: 400, message: 'Password must be at least 6 characters.' };
  }

  if (dbConnection) {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      await dbConnection.execute(
        'INSERT INTO users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
        [normalizedName, normalizedEmail, normalizedPhone, passwordHash]
      );

      const [rows] = await dbConnection.execute('SELECT id, full_name, email, phone FROM users WHERE email = ?', [normalizedEmail]);
      const user = rows[0];
      return {
        success: true,
        status: 201,
        message: 'Account created successfully.',
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
        },
      };
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') {
        return { success: false, status: 409, message: 'An account with this email already exists.' };
      }
      console.error('MySQL registration error:', error);
      return { success: false, status: 500, message: 'Registration failed on the database layer.' };
    }
  }

  const users = getUsersJson();
  if (users.some((u) => String(u.email).toLowerCase() === normalizedEmail)) {
    return { success: false, status: 409, message: 'An account with this email already exists.' };
  }

  const newUser = {
    id: users.length ? Math.max(...users.map((u) => Number(u.id || 0))) + 1 : 1,
    fullName: normalizedName,
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    registeredAt: new Date().toLocaleString(),
  };

  users.push(newUser);
  saveUsersJson(users);

  return {
    success: true,
    status: 201,
    message: 'Account created successfully.',
    user: {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      phone: newUser.phone,
    },
  };
}

async function loginUser({ email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return { success: false, status: 400, message: 'Email and password are required.' };
  }

  if (dbConnection) {
    try {
      const [rows] = await dbConnection.execute('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
      const user = rows[0];
      if (!user) {
        return { success: false, status: 401, message: 'Invalid email or password.' };
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatches) {
        return { success: false, status: 401, message: 'Invalid email or password.' };
      }

      return {
        success: true,
        status: 200,
        message: 'Login successful.',
        user: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
        },
      };
    } catch (error) {
      console.error('MySQL login error:', error);
      return { success: false, status: 500, message: 'Login failed on the database layer.' };
    }
  }

  const users = getUsersJson();
  const user = users.find((u) => String(u.email).toLowerCase() === normalizedEmail && String(u.password) === String(password));

  if (!user) {
    return { success: false, status: 401, message: 'Invalid email or password.' };
  }

  return {
    success: true,
    status: 200,
    message: 'Login successful.',
    user: {
      id: user.id || users.indexOf(user) + 1,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
    },
  };
}

async function getUsersList() {
  if (dbConnection) {
    try {
      const [rows] = await dbConnection.execute('SELECT id, full_name AS fullName, email, phone, created_at AS createdAt FROM users ORDER BY id DESC');
      return rows;
    } catch (error) {
      console.error('MySQL user fetch error:', error);
      return [];
    }
  }

  return getUsersJson();
}

app.get('/api/config', (req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SecureStep API',
    dbMode: dbConnection ? 'mysql' : 'json-fallback',
    timestamp: new Date().toISOString(),
  });
});

app.post(['/register.php', '/api/register'], async (req, res) => {
  const result = await registerUser(req.body || {});
  res.status(result.status).json({
    success: result.success,
    message: result.message,
    user: result.user || null,
  });
});

app.post(['/login.php', '/api/login'], async (req, res) => {
  const result = await loginUser(req.body || {});
  res.status(result.status).json({
    success: result.success,
    message: result.message,
    user: result.user || null,
  });
});

app.get('/api/users', async (req, res) => {
  res.json(await getUsersList());
});

app.get('/api/export-csv', async (req, res) => {
  const users = await getUsersList();
  let csv = 'ID,Full Name,Email,Phone,Registered At\n';
  users.forEach((user) => {
    const fullName = String(user.fullName || user.full_name || '').replace(/"/g, '""');
    const email = String(user.email || '');
    const phone = String(user.phone || '');
    const registeredAt = String(user.registeredAt || user.createdAt || 'N/A');
    csv += `${user.id || ''},"${fullName}","${email}","${phone}","${registeredAt}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="securestep_users_${Date.now()}.csv"`);
  res.send(csv);
});

// Police Stations API endpoints
app.get('/api/police-stations', async (req, res) => {
  try {
    if (dbConnection) {
      const [rows] = await dbConnection.execute(
        'SELECT id, name, latitude, longitude, address, phone, website, jurisdiction FROM police_stations'
      );
      const stations = rows.map(row => ({
        id: row.id,
        name: row.name,
        lat: row.latitude,
        lng: row.longitude,
        address: row.address || 'Not available',
        phone: row.phone || 'Not available',
        website: row.website || 'Not available',
        jurisdiction: row.jurisdiction || 'Not available'
      }));
      res.json(stations);
    } else {
      // Fallback to JSON file
      try {
        const fs = require('fs');
        const path = require('path');
        const policeDataPath = path.join(__dirname, 'data-police-stations.json');
        if (fs.existsSync(policeDataPath)) {
          const policeData = JSON.parse(fs.readFileSync(policeDataPath, 'utf8'));
          const stations = policeData.map((station, index) => ({
            id: index + 1,
            name: station.name,
            lat: station.lat,
            lng: station.lng,
            address: station.address || 'Not available',
            phone: station.phone || 'Not available',
            website: 'Not available',
            jurisdiction: station.jurisdiction || 'Not available'
          }));
          res.json(stations);
        } else {
          res.json([]);
        }
      } catch (jsonError) {
        console.error('Failed to load police stations from JSON:', jsonError);
        res.json([]);
      }
    }
  } catch (error) {
    console.error('Police stations fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch police stations' });
  }
});

// Hospitals API endpoints
app.get('/api/hospitals', async (req, res) => {
  try {
    if (dbConnection) {
      const [rows] = await dbConnection.execute(
        'SELECT id, name, latitude, longitude, address, phone, website, type FROM hospitals'
      );
      const hospitals = rows.map(row => ({
        id: row.id,
        name: row.name,
        lat: row.latitude,
        lng: row.longitude,
        address: row.address || 'Not available',
        phone: row.phone || 'Not available',
        website: row.website || 'Not available',
        type: row.type || 'General'
      }));
      res.json(hospitals);
    } else {
      // Fallback to JSON file
      try {
        const fs = require('fs');
        const path = require('path');
        const hospitalDataPath = path.join(__dirname, 'data-hospitals.json');
        if (fs.existsSync(hospitalDataPath)) {
          const hospitalData = JSON.parse(fs.readFileSync(hospitalDataPath, 'utf8'));
          const hospitals = hospitalData.map((hospital, index) => ({
            id: index + 1,
            name: hospital.name,
            lat: hospital.lat,
            lng: hospital.lng,
            address: hospital.address || 'Not available',
            phone: hospital.phone || 'Not available',
            website: 'Not available',
            type: hospital.type || 'General'
          }));
          res.json(hospitals);
        } else {
          res.json([]);
        }
      } catch (jsonError) {
        console.error('Failed to load hospitals from JSON:', jsonError);
        res.json([]);
      }
    }
  } catch (error) {
    console.error('Hospitals fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch hospitals' });
  }
});

// Streetlights API endpoints
app.get('/api/streetlights', async (req, res) => {
  try {
    if (dbConnection) {
      const [rows] = await dbConnection.execute(
        'SELECT id, name, latitude, longitude, zone, ward, type, lighting_level FROM streetlights'
      );
      const streetlights = rows.map(row => ({
        id: row.id,
        name: row.name,
        lat: row.latitude,
        lng: row.longitude,
        zone: row.zone || 'Unknown',
        ward: row.ward || 'Unknown',
        type: row.type || 'Unknown',
        lightingLevel: row.lighting_level || 50
      }));
      res.json(streetlights);
    } else {
      // Fallback to JSON file
      try {
        const fs = require('fs');
        const path = require('path');
        const streetlightDataPath = path.join(__dirname, 'data-streetlights.json');
        if (fs.existsSync(streetlightDataPath)) {
          const streetlightData = JSON.parse(fs.readFileSync(streetlightDataPath, 'utf8'));
          const streetlights = streetlightData.map((light, index) => ({
            id: index + 1,
            name: light.name,
            lat: light.lat,
            lng: light.lng,
            zone: light.zone || 'Unknown',
            ward: 'Unknown',
            type: light.description || 'Unknown',
            lightingLevel: typeof light.lightingLevel !== 'undefined' ? light.lightingLevel : 50
          }));
          res.json(streetlights);
        } else {
          res.json([]);
        }
      } catch (jsonError) {
        console.error('Failed to load streetlights from JSON:', jsonError);
        res.json([]);
      }
    }
  } catch (error) {
    console.error('Streetlights fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch streetlights' });
  }
});

// Emergency Contacts API endpoints
app.get('/api/emergency-contacts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (dbConnection) {
      const [rows] = await dbConnection.execute(
        'SELECT id, name, relationship, phone, email, is_primary FROM emergency_contacts WHERE user_id = ? ORDER BY is_primary DESC, created_at DESC',
        [userId]
      );
      res.json({ success: true, contacts: rows });
    } else {
      const contacts = getContactsJson();
      const userContacts = contacts
        .filter(c => String(c.user_id) === String(userId))
        .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
      res.json({ success: true, contacts: userContacts });
    }
  } catch (error) {
    console.error('Emergency contacts fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch emergency contacts' });
  }
});

app.post('/api/emergency-contacts', async (req, res) => {
  try {
    const { userId, name, relationship, phone, email, isPrimary } = req.body;
    
    if (!userId || !name || !phone) {
      return res.status(400).json({ success: false, message: 'User ID, name, and phone are required' });
    }

    if (dbConnection) {
      if (isPrimary) {
        await dbConnection.execute(
          'UPDATE emergency_contacts SET is_primary = FALSE WHERE user_id = ?',
          [userId]
        );
      }

      const [result] = await dbConnection.execute(
        'INSERT INTO emergency_contacts (user_id, name, relationship, phone, email, is_primary) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, name, relationship || 'Other', phone, email || null, isPrimary ? 1 : 0]
      );

      res.json({ success: true, id: result.insertId });
    } else {
      const contacts = getContactsJson();
      if (isPrimary) {
        contacts.forEach(c => {
          if (String(c.user_id) === String(userId)) c.is_primary = 0;
        });
      }
      const newId = contacts.length ? Math.max(...contacts.map(c => Number(c.id || 0))) + 1 : 1;
      const newContact = {
        id: newId,
        user_id: userId,
        name: String(name).trim(),
        relationship: relationship || 'Other',
        phone: String(phone).trim(),
        email: email ? String(email).trim() : null,
        is_primary: isPrimary ? 1 : 0,
        created_at: new Date().toISOString()
      };
      contacts.push(newContact);
      saveContactsJson(contacts);
      res.json({ success: true, id: newId });
    }
  } catch (error) {
    console.error('Emergency contact creation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create emergency contact' });
  }
});

app.put('/api/emergency-contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, relationship, phone, email, isPrimary } = req.body;

    if (dbConnection) {
      const [contactRows] = await dbConnection.execute(
        'SELECT user_id FROM emergency_contacts WHERE id = ?',
        [id]
      );

      if (contactRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Contact not found' });
      }

      const userId = contactRows[0].user_id;

      if (isPrimary) {
        await dbConnection.execute(
          'UPDATE emergency_contacts SET is_primary = FALSE WHERE user_id = ? AND id != ?',
          [userId, id]
        );
      }

      await dbConnection.execute(
        'UPDATE emergency_contacts SET name = ?, relationship = ?, phone = ?, email = ?, is_primary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, relationship || 'Other', phone, email || null, isPrimary ? 1 : 0, id]
      );

      res.json({ success: true });
    } else {
      const contacts = getContactsJson();
      const index = contacts.findIndex(c => String(c.id) === String(id));
      if (index === -1) {
        return res.status(404).json({ success: false, message: 'Contact not found' });
      }

      const userId = contacts[index].user_id;
      if (isPrimary) {
        contacts.forEach(c => {
          if (String(c.user_id) === String(userId) && String(c.id) !== String(id)) {
            c.is_primary = 0;
          }
        });
      }

      contacts[index] = {
        ...contacts[index],
        name: name !== undefined ? String(name).trim() : contacts[index].name,
        relationship: relationship !== undefined ? relationship : contacts[index].relationship,
        phone: phone !== undefined ? String(phone).trim() : contacts[index].phone,
        email: email !== undefined ? (email ? String(email).trim() : null) : contacts[index].email,
        is_primary: isPrimary !== undefined ? (isPrimary ? 1 : 0) : contacts[index].is_primary,
        updated_at: new Date().toISOString()
      };
      saveContactsJson(contacts);
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Emergency contact update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update emergency contact' });
  }
});

app.delete('/api/emergency-contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (dbConnection) {
      await dbConnection.execute('DELETE FROM emergency_contacts WHERE id = ?', [id]);
      res.json({ success: true });
    } else {
      const contacts = getContactsJson();
      const filtered = contacts.filter(c => String(c.id) !== String(id));
      saveContactsJson(filtered);
      res.json({ success: true });
    }
  } catch (error) {
    console.error('Emergency contact delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete emergency contact' });
  }
});

// In-memory token store for MySQL mode fallback if token column not present
const sosTokensMap = new Map();

// SOS API endpoints with MySQL & JSON fallback
app.post('/api/sos/start', async (req, res) => {
  try {
    const { userId, userName, latitude, longitude } = req.body;
    
    if (!userId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'User ID, latitude, and longitude are required' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const name = userName ? String(userName).trim() : 'SecureStep User';

    if (dbConnection) {
      try {
        await dbConnection.execute('ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS token VARCHAR(64)');
      } catch (e) { /* column may already exist or ALTER not permitted */ }

      let sosId;
      try {
        const [result] = await dbConnection.execute(
          'INSERT INTO sos_alerts (user_id, latitude, longitude, status, token) VALUES (?, ?, ?, ?, ?)',
          [userId, latitude, longitude, 'active', token]
        );
        sosId = result.insertId;
      } catch (insertErr) {
        // Fallback without token column
        const [result] = await dbConnection.execute(
          'INSERT INTO sos_alerts (user_id, latitude, longitude, status) VALUES (?, ?, ?, ?)',
          [userId, latitude, longitude, 'active']
        );
        sosId = result.insertId;
      }
      sosTokensMap.set(String(sosId), { token, userName: name });

      res.json({
        success: true,
        sosId,
        token,
        userName: name,
        shareUrl: `/emergency-live.html?sosId=${sosId}&token=${token}`,
        googleMapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`
      });
    } else {
      const alerts = getSosAlertsJson();
      const newId = alerts.length ? Math.max(...alerts.map(a => Number(a.id || 0))) + 1 : 1;
      const newAlert = {
        id: newId,
        user_id: userId,
        user_name: name,
        token: token,
        latitude: Number(latitude),
        longitude: Number(longitude),
        status: 'active',
        locations: [
          {
            latitude: Number(latitude),
            longitude: Number(longitude),
            recorded_at: new Date().toISOString()
          }
        ],
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ended_at: null
      };
      alerts.push(newAlert);
      saveSosAlertsJson(alerts);
      res.json({
        success: true,
        sosId: newId,
        token: token,
        userName: name,
        shareUrl: `/emergency-live.html?sosId=${newId}&token=${token}`,
        googleMapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`
      });
    }
  } catch (error) {
    console.error('SOS start error:', error);
    res.status(500).json({ success: false, message: 'Failed to start SOS' });
  }
});

app.post('/api/sos/location', async (req, res) => {
  try {
    const { sosId, token, latitude, longitude } = req.body;
    
    if (!sosId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'SOS ID, latitude, and longitude are required' });
    }

    const now = new Date().toISOString();

    if (dbConnection) {
      await dbConnection.execute(
        'INSERT INTO sos_locations (sos_id, latitude, longitude) VALUES (?, ?, ?)',
        [sosId, latitude, longitude]
      );

      await dbConnection.execute(
        'UPDATE sos_alerts SET latitude = ?, longitude = ? WHERE id = ?',
        [latitude, longitude, sosId]
      );

      res.json({ success: true, updated_at: now });
    } else {
      const alerts = getSosAlertsJson();
      const alert = alerts.find(a => String(a.id) === String(sosId));
      if (alert) {
        alert.latitude = Number(latitude);
        alert.longitude = Number(longitude);
        alert.updated_at = now;
        if (!alert.locations) alert.locations = [];
        alert.locations.push({
          latitude: Number(latitude),
          longitude: Number(longitude),
          recorded_at: now
        });
        saveSosAlertsJson(alerts);
      }
      res.json({ success: true, updated_at: now });
    }
  } catch (error) {
    console.error('SOS location update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update SOS location' });
  }
});

// Protected endpoint to view live emergency location and status
app.get('/api/sos/live/:sosId', async (req, res) => {
  try {
    const { sosId } = req.params;
    const providedToken = req.query.token || req.headers['x-emergency-token'] || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));

    if (!providedToken) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Valid emergency session token required'
      });
    }

    if (dbConnection) {
      let rows;
      try {
        const [r] = await dbConnection.execute(
          'SELECT a.id, a.user_id, a.latitude, a.longitude, a.status, a.token, a.started_at, a.ended_at, u.full_name AS user_name FROM sos_alerts a LEFT JOIN users u ON a.user_id = u.id WHERE a.id = ?',
          [sosId]
        );
        rows = r;
      } catch (err) {
        const [r] = await dbConnection.execute(
          'SELECT a.id, a.user_id, a.latitude, a.longitude, a.status, a.started_at, a.ended_at, u.full_name AS user_name FROM sos_alerts a LEFT JOIN users u ON a.user_id = u.id WHERE a.id = ?',
          [sosId]
        );
        rows = r;
      }

      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Emergency alert session not found' });
      }

      const alert = rows[0];
      const validToken = alert.token || (sosTokensMap.get(String(sosId)) ? sosTokensMap.get(String(sosId)).token : null);

      if (!validToken || String(validToken) !== String(providedToken)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Invalid emergency session token'
        });
      }

      // Fetch tracking locations trail
      const [locations] = await dbConnection.execute(
        'SELECT latitude, longitude, recorded_at FROM sos_locations WHERE sos_id = ? ORDER BY recorded_at ASC',
        [sosId]
      );

      res.json({
        success: true,
        sos: {
          id: alert.id,
          userId: alert.user_id,
          userName: alert.user_name || (sosTokensMap.get(String(sosId)) ? sosTokensMap.get(String(sosId)).userName : 'SecureStep User'),
          latitude: alert.latitude,
          longitude: alert.longitude,
          status: alert.status,
          started_at: alert.started_at,
          updated_at: alert.ended_at || alert.started_at,
          ended_at: alert.ended_at,
          googleMapsUrl: `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`,
          locations: locations || []
        }
      });
    } else {
      const alerts = getSosAlertsJson();
      const alert = alerts.find(a => String(a.id) === String(sosId));

      if (!alert) {
        return res.status(404).json({ success: false, message: 'Emergency alert session not found' });
      }

      if (!alert.token || String(alert.token) !== String(providedToken)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Invalid emergency session token'
        });
      }

      res.json({
        success: true,
        sos: {
          id: alert.id,
          userId: alert.user_id,
          userName: alert.user_name || 'SecureStep User',
          latitude: alert.latitude,
          longitude: alert.longitude,
          status: alert.status,
          started_at: alert.started_at,
          updated_at: alert.updated_at || alert.started_at,
          ended_at: alert.ended_at,
          googleMapsUrl: `https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`,
          locations: alert.locations || []
        }
      });
    }
  } catch (error) {
    console.error('Protected live SOS fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch live SOS data' });
  }
});

app.post(['/api/sos/stop', '/api/sos/resolve'], async (req, res) => {
  try {
    const { sosId, token } = req.body;
    
    if (!sosId) {
      return res.status(400).json({ success: false, message: 'SOS ID is required' });
    }

    const now = new Date().toISOString();

    if (dbConnection) {
      await dbConnection.execute(
        'UPDATE sos_alerts SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['resolved', sosId]
      );

      res.json({ success: true, message: 'Emergency marked resolved and live tracking ended.' });
    } else {
      const alerts = getSosAlertsJson();
      const alert = alerts.find(a => String(a.id) === String(sosId));
      if (alert) {
        alert.status = 'resolved';
        alert.ended_at = now;
        alert.updated_at = now;
        saveSosAlertsJson(alerts);
      }
      res.json({ success: true, message: 'Emergency marked resolved and live tracking ended.' });
    }
  } catch (error) {
    console.error('SOS resolve/stop error:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve SOS' });
  }
});

app.get('/api/sos/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (dbConnection) {
      const [rows] = await dbConnection.execute(
        'SELECT id, latitude, longitude, status, started_at, ended_at FROM sos_alerts WHERE user_id = ? ORDER BY started_at DESC',
        [userId]
      );
      res.json({ success: true, history: rows });
    } else {
      const alerts = getSosAlertsJson();
      const userAlerts = alerts
        .filter(a => String(a.user_id) === String(userId))
        .map(a => ({
          id: a.id,
          latitude: a.latitude,
          longitude: a.longitude,
          status: a.status,
          started_at: a.started_at,
          ended_at: a.ended_at
        }))
        .reverse();
      res.json({ success: true, history: userAlerts });
    }
  } catch (error) {
    console.error('SOS history fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SOS history' });
  }
});

// Emergency SOS API endpoints (legacy - keeping for compatibility)
const emergencyReports = [];

app.post('/api/emergency/sos', async (req, res) => {
  try {
    const { type, location, timestamp, contacts, userId } = req.body;
    
    const report = {
      id: 'SOS_' + Date.now(),
      type,
      location,
      timestamp,
      contacts,
      userId,
      status: 'active'
    };
    
    emergencyReports.push(report);
    
    // In production, this would send actual notifications to contacts
    console.log('Emergency SOS triggered:', report);
    
    res.json({ success: true, report });
  } catch (error) {
    console.error('SOS error:', error);
    res.status(500).json({ success: false, message: 'Failed to process SOS' });
  }
});

app.get('/api/emergency/reports', async (req, res) => {
  res.json(emergencyReports);
});

// Location Sharing API endpoints
const locationUpdates = [];

app.post('/api/location/update', async (req, res) => {
  try {
    const { userId, location, sharedWith, timestamp } = req.body;
    
    const update = {
      id: 'LOC_' + Date.now(),
      userId,
      location,
      sharedWith,
      timestamp
    };
    
    locationUpdates.push(update);
    
    // Keep only last 100 updates per user
    const userUpdates = locationUpdates.filter(u => u.userId === userId);
    if (userUpdates.length > 100) {
      const toRemove = userUpdates.length - 100;
      for (let i = 0; i < toRemove; i++) {
        const index = locationUpdates.findIndex(u => u.userId === userId);
        if (index > -1) locationUpdates.splice(index, 1);
      }
    }
    
    res.json({ success: true, update });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
});

app.post('/api/location/notify', async (req, res) => {
  try {
    const { action, userId, contacts, location, timestamp } = req.body;
    
    // In production, this would send actual notifications to contacts
    console.log('Location notification:', { action, userId, contacts, location, timestamp });
    
    res.json({ success: true, message: 'Contacts notified' });
  } catch (error) {
    console.error('Location notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to notify contacts' });
  }
});

app.post('/api/location/share-once', async (req, res) => {
  try {
    const { userId, location, sharedWith, timestamp } = req.body;
    
    const share = {
      id: 'SHARE_' + Date.now(),
      userId,
      location,
      sharedWith,
      timestamp,
      type: 'one-time'
    };
    
    // In production, this would send the location to contacts
    console.log('One-time location share:', share);
    
    res.json({ success: true, share });
  } catch (error) {
    console.error('One-time share error:', error);
    res.status(500).json({ success: false, message: 'Failed to share location' });
  }
});

app.get('/api/location/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userHistory = locationUpdates.filter(u => u.userId === userId);
    res.json({ success: true, history: userHistory });
  } catch (error) {
    console.error('Location history error:', error);
    res.status(500).json({ success: false, message: 'Failed to get location history' });
  }
});

// CivicSense Incident Reporting API endpoints with MySQL backend
app.post('/api/civicsense/report', async (req, res) => {
  try {
    const { userId, incidentType, description, latitude, longitude, address, isAnonymous, severity, imageUrl } = req.body;
    
    if (!incidentType || !description) {
      return res.status(400).json({ success: false, message: 'Incident type and description are required' });
    }

    if (dbConnection) {
      const [result] = await dbConnection.execute(
        'INSERT INTO civicsense_reports (user_id, incident_type, description, latitude, longitude, address, is_anonymous, severity, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId || null, incidentType, description, latitude || null, longitude || null, address || null, isAnonymous || false, severity || 'medium', imageUrl || null]
      );

      const [newReport] = await dbConnection.execute(
        'SELECT id, incident_type, description, latitude, longitude, address, is_anonymous, severity, status, created_at FROM civicsense_reports WHERE id = ?',
        [result.insertId]
      );

      res.json({ success: true, report: newReport[0] });
    } else {
      res.status(503).json({ success: false, message: 'Database not available' });
    }
  } catch (error) {
    console.error('CivicSense report error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit report' });
  }
});

app.get('/api/civicsense/reports', async (req, res) => {
  try {
    const { limit = 50, type, severity } = req.query;
    
    if (dbConnection) {
      let query = 'SELECT id, incident_type, description, latitude, longitude, address, is_anonymous, severity, status, created_at FROM civicsense_reports WHERE 1=1';
      const params = [];

      if (type) {
        query += ' AND incident_type = ?';
        params.push(type);
      }
      if (severity) {
        query += ' AND severity = ?';
        params.push(severity);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(parseInt(limit));

      const [rows] = await dbConnection.execute(query, params);
      res.json({ success: true, reports: rows });
    } else {
      res.json({ success: true, reports: [] });
    }
  } catch (error) {
    console.error('CivicSense reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to get reports' });
  }
});

app.get('/api/civicsense/reports/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude required' });
    }

    if (dbConnection) {
      const [rows] = await dbConnection.execute(
        'SELECT id, incident_type, description, latitude, longitude, address, is_anonymous, severity, status, created_at FROM civicsense_reports WHERE latitude IS NOT NULL AND longitude IS NOT NULL',
      );

      const nearbyReports = rows.filter(report => {
        const distance = calculateDistance(
          parseFloat(lat), parseFloat(lng),
          report.latitude, report.longitude
        );
        return distance <= parseFloat(radius);
      });

      res.json({ success: true, reports: nearbyReports });
    } else {
      res.json({ success: true, reports: [] });
    }
  } catch (error) {
    console.error('Nearby reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to get nearby reports' });
  }
});

app.get('/api/civicsense/statistics', async (req, res) => {
  try {
    const { timeRange = 24 } = req.query;
    const cutoff = new Date(Date.now() - timeRange * 60 * 60 * 1000);
    
    if (dbConnection) {
      const [rows] = await dbConnection.execute(
        'SELECT id, incident_type, severity, status, created_at FROM civicsense_reports WHERE created_at >= ?',
        [cutoff]
      );

      const stats = {
        total: rows.length,
        byType: {},
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byStatus: { pending: 0, verified: 0, resolved: 0 }
      };

      rows.forEach(report => {
        if (!stats.byType[report.incident_type]) stats.byType[report.incident_type] = 0;
        stats.byType[report.incident_type]++;
        
        if (stats.bySeverity[report.severity] !== undefined) {
          stats.bySeverity[report.severity]++;
        }
        
        if (stats.byStatus[report.status] !== undefined) {
          stats.byStatus[report.status]++;
        }
      });

      res.json({ success: true, stats });
    } else {
      res.json({ success: true, stats: { total: 0, byType: {}, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 }, byStatus: { pending: 0, verified: 0, resolved: 0 } } });
    }
  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({ success: false, message: 'Failed to get statistics' });
  }
});

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

app.get('/database', async (req, res) => {
  const users = await getUsersList();
  const totalUsers = users.length;
  const rows = users.map((user, index) => `
    <tr>
      <td><span class="user-id">#${user.id || index + 1}</span></td>
      <td><strong>${String(user.fullName || user.full_name || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]))}</strong></td>
      <td>${String(user.email || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]))}</td>
      <td>${String(user.phone || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]))}</td>
      <td>${String(user.registeredAt || user.createdAt || 'N/A')}</td>
      <td><span class="badge badge-success">Active</span></td>
    </tr>
  `).join('');

  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>SecureStep User Database</title><style>body{font-family:'Segoe UI';background:linear-gradient(135deg,#667eea,#764ba2);padding:20px;margin:0} .container{max-width:1200px;margin:0 auto} .header{background:#fff;border-radius:12px;padding:28px;box-shadow:0 10px 25px rgba(0,0,0,.1)} .stats{display:flex;gap:20px;margin-top:18px}.stat-box{flex:1;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:18px;border-radius:10px;text-align:center}.table-wrapper{background:#fff;border-radius:12px;overflow:hidden;margin-top:24px}.table{width:100%;border-collapse:collapse}.th,.td{padding:12px 14px;border-bottom:1px solid #eee}.th{background:#667eea;color:#fff}.badge{display:inline-block;padding:5px 10px;border-radius:999px;background:#d4edda;color:#155724;font-size:12px;font-weight:700}.user-id{font-weight:700;color:#667eea}.action-buttons{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.btn{padding:10px 16px;border:none;border-radius:8px;color:#fff;background:#667eea;text-decoration:none;display:inline-block}.btn.secondary{background:#6c757d}.info-box{margin-top:18px;background:#e7f3ff;padding:14px;border-left:4px solid #667eea;border-radius:6px}</style></head><body><div class="container"><div class="header"><h1>SecureStep - User Database</h1><p>View and manage all registered users in the system</p><div class="stats"><div class="stat-box"><h3>${totalUsers}</h3><p>Total Users</p></div><div class="stat-box"><h3>${new Date().toLocaleDateString()}</h3><p>Today</p></div></div><div class="action-buttons"><a class="btn" href="/database">Refresh</a><a class="btn" href="/api/export-csv">Export CSV</a><a class="btn" href="/api/users">JSON</a><a class="btn secondary" href="/">Home</a></div><div class="info-box"><strong>SecureStep project running.</strong><br>Database source: ${dbConnection ? 'MySQL' : 'users.json fallback'}</div></div><div class="table-wrapper"><table class="table"><thead><tr><th class="th">ID</th><th class="th">Full Name</th><th class="th">Email</th><th class="th">Phone</th><th class="th">Registered At</th><th class="th">Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No users registered yet.</td></tr>'}</tbody></table></div></div></body></html>`);
});

app.use(express.static(__dirname));

app.get('*', (req, res, next) => {
  const filePath = path.join(__dirname, req.path === '/' ? 'index.html' : req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  next();
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

async function startServer() {
  const mysqlReady = await ensureMySqlConnection();
  app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('SecureStep project is running.');
    console.log(`Main App: http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
    console.log(`Users API: http://localhost:${PORT}/api/users`);
    console.log(`Database mode: ${mysqlReady ? 'MySQL' : 'JSON fallback'}`);
    console.log('========================================\n');
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

