<?php
require_once 'database-handler.php';

$db = new UserDatabaseHandler('users.json');
$users = $db->getAllUsers();
$totalUsers = count($users);
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User Database Viewer</title>
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>👥 User Database Viewer</h1>
            <p>View and manage all registered users in the system</p>
            
            <div class="stats">
                <div class="stat-box">
                    <h3><?php echo $totalUsers; ?></h3>
                    <p>Total Users</p>
                </div>
                <div class="stat-box">
                    <h3><?php echo date('M d'); ?></h3>
                    <p>Today's Date</p>
                </div>
            </div>
            
            <div class="action-buttons">
                <a href="view-users.php" class="btn btn-primary">🔄 Refresh</a>
                <a href="export-users.php" class="btn btn-primary">📥 Export to CSV</a>
            </div>
        </div>
        
        <?php if ($totalUsers > 0): ?>
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
                    <?php foreach ($users as $user): ?>
                    <tr>
                        <td><span class="user-id">#<?php echo $user['id'] ?? 'N/A'; ?></span></td>
                        <td>
                            <strong><?php echo htmlspecialchars($user['fullName']); ?></strong>
                            <br>
                            <span class="user-email"><?php echo htmlspecialchars($user['email']); ?></span>
                        </td>
                        <td><?php echo htmlspecialchars($user['email']); ?></td>
                        <td><?php echo htmlspecialchars($user['phone']); ?></td>
                        <td>
                            <span class="timestamp">
                                <?php echo isset($user['registeredAt']) ? htmlspecialchars($user['registeredAt']) : 'N/A'; ?>
                            </span>
                        </td>
                        <td><span class="badge badge-success">Active</span></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php else: ?>
        <div class="table-wrapper">
            <div class="empty-message">
                <p>No users registered yet.</p>
            </div>
        </div>
        <?php endif; ?>
    </div>
</body>
</html>
