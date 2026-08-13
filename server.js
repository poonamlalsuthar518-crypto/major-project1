const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const DATABASE_FILE = path.join(__dirname, 'users.json');

// ============================================
// DATABASE FUNCTIONS
// ============================================

function getUsers() {
    try {
        if (fs.existsSync(DATABASE_FILE)) {
            const data = fs.readFileSync(DATABASE_FILE, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error reading database:', error);
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving database:', error);
        return false;
    }
}

function parseJsonBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch (e) {
                resolve({});
            }
        });
    });
}

// ============================================
// HTML DASHBOARD
// ============================================

function getDashboardHTML(users) {
    const totalUsers = users.length;
    const userRows = users.map((user, index) => `
        <tr>
            <td><span class="user-id">#${user.id || index + 1}</span></td>
            <td>
                <strong>${escapeHtml(user.fullName)}</strong><br>
                <span class="user-email">${escapeHtml(user.email)}</span>
            </td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.phone)}</td>
            <td><span class="timestamp">${user.registeredAt || 'N/A'}</span></td>
            <td><span class="badge badge-success">Active</span></td>
        </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Database - SecureStep</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            background: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .header h1 {
            color: #333;
            margin-bottom: 10px;
        }
        
        .header p {
            color: #666;
            margin-bottom: 20px;
        }
        
        .stats {
            display: flex;
            gap: 20px;
            margin-top: 20px;
        }
        
        .stat-box {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            flex: 1;
            text-align: center;
        }
        
        .stat-box h3 {
            font-size: 32px;
            font-weight: bold;
        }
        
        .stat-box p {
            font-size: 14px;
            opacity: 0.9;
            margin-top: 5px;
        }
        
        .table-wrapper {
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        thead {
            background: #667eea;
            color: white;
        }
        
        th {
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        
        tbody tr:hover {
            background: #f5f5f5;
        }
        
        .user-id {
            font-weight: bold;
            color: #667eea;
        }
        
        .user-email {
            color: #555;
            font-size: 13px;
        }
        
        .empty-message {
            text-align: center;
            padding: 40px;
            color: #999;
        }
        
        .action-buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: #667eea;
            color: white;
        }
        
        .btn-primary:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
        }

        .btn-secondary {
            background: #6c757d;
            color: white;
        }

        .btn-secondary:hover {
            background: #5a6268;
        }
        
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        
        .badge-success {
            background: #d4edda;
            color: #155724;
        }
        
        .timestamp {
            font-size: 12px;
            color: #999;
        }

        .info-box {
            background: #e7f3ff;
            border-left: 4px solid #667eea;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
            color: #333;
        }

        .info-box code {
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>👥 SecureStep - User Database</h1>
            <p>View and manage all registered users in the system</p>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>${totalUsers}</h3>
                    <p>Total Users</p>
                </div>
                <div class="stat-box">
                    <h3>${new Date().toLocaleDateString()}</h3>
                    <p>Today's Date</p>
                </div>
            </div>
            
            <div class="action-buttons">
                <a href="/database" class="btn btn-primary">🔄 Refresh</a>
                <a href="/api/export-csv" class="btn btn-primary">📥 Export to CSV</a>
                <a href="/api/users" class="btn btn-primary">📋 View as JSON</a>
                <a href="/" class="btn btn-secondary">🏠 Back to Home</a>
            </div>

            <div class="info-box">
                <strong>✅ SecureStep Project Running</strong><br>
                Database file: <code>users.json</code> - Updates automatically when users register
            </div>
        </div>
        
        ${totalUsers > 0 ? `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Full Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Registered At</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${userRows}
                </tbody>
            </table>
        </div>
        ` : `
        <div class="table-wrapper">
            <div class="empty-message">
                <p>No users registered yet.</p>
            </div>
        </div>
        `}
    </div>
</body>
</html>
    `;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ============================================
// MIME TYPES
// ============================================

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// ============================================
// CREATE HTTP SERVER
// ============================================

const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8000'}`);
    const pathname = parsedUrl.pathname;

    try {
        // ============================================
        // API: Register Endpoint
        // ============================================
        if (req.method === 'POST' && (pathname === '/register.php' || pathname === '/api/register')) {
            const body = await parseJsonBody(req);
            const fullName = (body.fullName || '').trim();
            const email = (body.email || '').trim().toLowerCase();
            const phone = (body.phone || '').trim();
            const password = body.password || '';
            const confirmPassword = body.confirmPassword || '';

            // Validate inputs
            if (!fullName || !email || !phone || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'All fields are required' }));
                return;
            }

            if (!/^[0-9]{10}$/.test(phone)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Phone number must be 10 digits' }));
                return;
            }

            if (password.length < 6) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Password must be at least 6 characters' }));
                return;
            }

            if (password !== confirmPassword) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Passwords do not match' }));
                return;
            }

            // Check if email exists
            const users = getUsers();
            if (users.some(u => u.email.toLowerCase() === email)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'An account with this email already exists' }));
                return;
            }

            // Add new user
            const newUser = {
                id: users.length + 1,
                fullName,
                email,
                phone,
                password: password, // Note: In production, use hashed password
                registeredAt: new Date().toLocaleString()
            };

            users.push(newUser);
            saveUsers(users);

            console.log(`✅ New user registered: ${fullName} (${email})`);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Account created successfully',
                user: {
                    id: newUser.id,
                    fullName: newUser.fullName,
                    email: newUser.email
                }
            }));
            return;
        }

        // ============================================
        // API: Login Endpoint
        // ============================================
        if (req.method === 'POST' && (pathname === '/login.php' || pathname === '/api/login')) {
            const body = await parseJsonBody(req);
            const email = (body.email || '').trim().toLowerCase();
            const password = body.password || '';

            if (!email || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Email and password are required' }));
                return;
            }

            const users = getUsers();
            const user = users.find(u => u.email.toLowerCase() === email && u.password === password);

            if (user) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Login successful',
                    user: {
                        id: user.id,
                        fullName: user.fullName,
                        email: user.email,
                        phone: user.phone
                    }
                }));
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
            }
            return;
        }

        // ============================================
        // DATABASE VIEWER ENDPOINTS
        // ============================================

        // Database Dashboard
        if (pathname === '/database' && req.method === 'GET') {
            const users = getUsers();
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getDashboardHTML(users));
            return;
        }

        // API: Get all users as JSON
        if (pathname === '/api/users' && req.method === 'GET') {
            const users = getUsers();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(users, null, 2));
            return;
        }

        // API: Export as CSV
        if (pathname === '/api/export-csv' && req.method === 'GET') {
            const users = getUsers();
            let csv = 'ID,Full Name,Email,Phone,Registered At\n';
            users.forEach((user) => {
                csv += `${user.id},"${(user.fullName || '').replace(/"/g, '""')}","${user.email}","${user.phone}","${user.registeredAt || 'N/A'}"\n`;
            });
            res.writeHead(200, {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="users_${Date.now()}.csv"`
            });
            res.end(csv);
            return;
        }

        // ============================================
        // SERVE STATIC FILES
        // ============================================

        let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
        
        // Prevent directory traversal
        if (!filePath.startsWith(__dirname)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }

        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 - Page Not Found</h1><p>The requested page does not exist.</p>');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        });

    } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
});

// ============================================
// START SERVER
// ============================================

server.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 SecureStep Project is Running!`);
    console.log(`${'='.repeat(60)}\n`);
    console.log(`📍 Main Application: http://localhost:${PORT}`);
    console.log(`📊 Database Viewer:  http://localhost:${PORT}/database`);
    console.log(`📋 Users as JSON:    http://localhost:${PORT}/api/users`);
    console.log(`📥 Export to CSV:    http://localhost:${PORT}/api/export-csv`);
    console.log(`\n📁 Database file: ${DATABASE_FILE}`);
    console.log(`\n✅ Server Status: RUNNING`);
    console.log(`\nPress Ctrl+C to stop the server\n`);
    console.log(`${'='.repeat(60)}\n`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${PORT} is already in use!`);
        console.error(`\nPlease close the other application or use a different port.\n`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
        process.exit(1);
    }
});

