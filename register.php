<?php
require_once 'db.php';
require_once 'database-handler.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?: $_POST;

$fullName = trim($data['fullName'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$phone = trim($data['phone'] ?? '');
$password = $data['password'] ?? '';
$confirmPassword = $data['confirmPassword'] ?? '';

if ($fullName === '' || $email === '' || $phone === '' || $password === '' || $confirmPassword === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'All fields are required']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid email format']);
    exit;
}

if (!preg_match('/^[0-9]{10}$/', $phone)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Phone number must be 10 digits']);
    exit;
}

if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Password must be at least 6 characters']);
    exit;
}

if ($password !== $confirmPassword) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Passwords do not match']);
    exit;
}

// Initialize database handler
$db = new UserDatabaseHandler('users.json');

// Check if user already exists
if ($db->userExists($email)) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'An account with this email already exists']);
    exit;
}

// Hash password for security
$hashedPassword = password_hash($password, PASSWORD_DEFAULT);

// Add user to database (updates users.json)
$result = $db->addUser([
    'fullName' => $fullName,
    'email' => $email,
    'phone' => $phone,
    'password_hash' => $hashedPassword
]);

if ($result['success']) {
    $_SESSION['user_id'] = $result['user']['id'];
    $_SESSION['full_name'] = $fullName;
    $_SESSION['email'] = $email;

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => $result['message'],
        'user' => [
            'fullName' => $fullName,
            'email' => $email
        ]
    ]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $result['message']]);
}
