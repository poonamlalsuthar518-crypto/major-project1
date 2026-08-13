<?php
/**
 * Database Handler Usage Examples
 * This file demonstrates how to use the UserDatabaseHandler class
 */

require_once 'database-handler.php';

// Initialize the database handler
$db = new UserDatabaseHandler('users.json');

// ============================================
// EXAMPLE 1: Check if user exists
// ============================================
// $email = 'user@example.com';
// if ($db->userExists($email)) {
//     echo "User exists!";
// }

// ============================================
// EXAMPLE 2: Get user by email
// ============================================
// $user = $db->getUserByEmail('user@example.com');
// if ($user) {
//     echo "User: " . $user['fullName'];
// }

// ============================================
// EXAMPLE 3: Get all users
// ============================================
// $allUsers = $db->getAllUsers();
// foreach ($allUsers as $user) {
//     echo $user['fullName'] . " - " . $user['email'] . "\n";
// }

// ============================================
// EXAMPLE 4: Update user information
// ============================================
// $updateResult = $db->updateUser('user@example.com', [
//     'phone' => '9999999999',
//     'fullName' => 'Updated Name'
// ]);
// if ($updateResult['success']) {
//     echo "User updated successfully";
// }

// ============================================
// EXAMPLE 5: Delete a user
// ============================================
// $deleteResult = $db->deleteUser('user@example.com');
// if ($deleteResult['success']) {
//     echo "User deleted successfully";
// }

// ============================================
// EXAMPLE 6: Get user count
// ============================================
// $count = $db->getUserCount();
// echo "Total users: " . $count;

// ============================================
// EXAMPLE 7: Export users to CSV
// ============================================
// $csv = $db->exportToCSV();
// file_put_contents('users_export.csv', $csv);

// ============================================
// SAMPLE LOGIN FUNCTION using the handler
// ============================================
function handleLogin()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

    $email = strtolower(trim($data['email'] ?? ''));
    $password = $data['password'] ?? '';

    if (empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email and password are required']);
        exit;
    }

    $db = new UserDatabaseHandler('users.json');

    // Get user by email
    $user = $db->getUserByEmail($email);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid email or password']);
        exit;
    }

    // Verify password
    if (!password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid email or password']);
        exit;
    }

    // Set session
    session_start();
    $_SESSION['user_id'] = $user['id'] ?? 'unknown';
    $_SESSION['full_name'] = $user['fullName'];
    $_SESSION['email'] = $user['email'];

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Login successful',
        'user' => [
            'id' => $user['id'] ?? 'unknown',
            'fullName' => $user['fullName'],
            'email' => $user['email']
        ]
    ]);
}

// ============================================
// SAMPLE API ENDPOINT: Get all users (Admin only)
// ============================================
function getAllUsersEndpoint()
{
    session_start();

    // Check if user is authenticated (optional check)
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $db = new UserDatabaseHandler('users.json');
    $users = $db->getAllUsers();

    // Remove sensitive data before sending
    $safeUsers = array_map(function ($user) {
        unset($user['password_hash']);
        return $user;
    }, $users);

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'totalUsers' => count($users),
        'users' => $safeUsers
    ]);
}

// ============================================
// SAMPLE ENDPOINT: User Profile
// ============================================
function getUserProfile()
{
    session_start();

    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $db = new UserDatabaseHandler('users.json');
    $user = $db->getUserByEmail($_SESSION['email']);

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User not found']);
        exit;
    }

    // Remove sensitive data
    unset($user['password_hash']);

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'user' => $user
    ]);
}

// ============================================
// SAMPLE ENDPOINT: Update Profile
// ============================================
function updateUserProfile()
{
    session_start();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        exit;
    }

    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

    $db = new UserDatabaseHandler('users.json');

    // Prepare update data (only allow certain fields)
    $updateData = [];
    if (!empty($data['phone'])) {
        $updateData['phone'] = trim($data['phone']);
    }
    if (!empty($data['fullName'])) {
        $updateData['fullName'] = trim($data['fullName']);
    }

    if (empty($updateData)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No fields to update']);
        exit;
    }

    $result = $db->updateUser($_SESSION['email'], $updateData);

    http_response_code($result['success'] ? 200 : 400);
    echo json_encode($result);
}

// Uncomment the appropriate function below to use it:
// handleLogin();
// getAllUsersEndpoint();
// getUserProfile();
// updateUserProfile();
