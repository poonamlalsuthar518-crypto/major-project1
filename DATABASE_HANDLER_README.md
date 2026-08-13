# Database Handler Setup - Documentation

## Overview
The `database-handler.php` file provides a robust JSON-based database system for managing user data. When a user registers through `register.php`, their information is automatically saved to `users.json`.

## Files Created/Modified

### 1. **database-handler.php** (NEW)
A complete database handler class with the following features:
- ✅ Read/Write users from/to `users.json`
- ✅ File locking to prevent corruption during concurrent access
- ✅ User validation and duplicate checking
- ✅ Full CRUD operations (Create, Read, Update, Delete)
- ✅ Password hashing support
- ✅ CSV export functionality

### 2. **register.php** (UPDATED)
Now uses the `UserDatabaseHandler` instead of MySQL:
- ✅ Validates form inputs
- ✅ Checks for duplicate emails
- ✅ Hashes passwords securely
- ✅ Automatically updates `users.json` file
- ✅ Returns proper HTTP status codes

### 3. **database-usage-examples.php** (NEW)
Reference guide with code examples for:
- Checking if user exists
- Getting user by email
- Retrieving all users
- Updating user information
- Deleting users
- Sample login function
- API endpoints for user management

## How It Works

### Registration Flow:
```
User Registration Form
         ↓
    register.php
         ↓
   UserDatabaseHandler
         ↓
  Validate Inputs
         ↓
  Check Duplicate Email
         ↓
  Hash Password
         ↓
  Acquire File Lock
         ↓
  Add to users.json
         ↓
  Release Lock
         ↓
  Return Success Response
```

### File Locking:
The system uses file locks to ensure safe concurrent access:
- Prevents data corruption when multiple requests occur simultaneously
- Automatically waits up to 5 seconds for lock availability
- Uses temporary `.lock` files

## Usage Examples

### Basic Registration (Already Implemented in register.php)
```php
$db = new UserDatabaseHandler('users.json');

$result = $db->addUser([
    'fullName' => 'John Doe',
    'email' => 'john@example.com',
    'phone' => '9876543210',
    'password_hash' => password_hash('password', PASSWORD_DEFAULT)
]);

if ($result['success']) {
    echo "User registered: " . $result['user']['fullName'];
}
```

### Check User Existence
```php
$db = new UserDatabaseHandler('users.json');

if ($db->userExists('john@example.com')) {
    echo "User already exists";
}
```

### Get User Data
```php
$db = new UserDatabaseHandler('users.json');

$user = $db->getUserByEmail('john@example.com');
if ($user) {
    echo "Full Name: " . $user['fullName'];
    echo "Phone: " . $user['phone'];
    echo "Registered: " . $user['registeredAt'];
}
```

### Get All Users
```php
$db = new UserDatabaseHandler('users.json');

$allUsers = $db->getAllUsers();
foreach ($allUsers as $user) {
    echo $user['fullName'] . " - " . $user['email'] . "\n";
}
```

### Update User
```php
$db = new UserDatabaseHandler('users.json');

$result = $db->updateUser('john@example.com', [
    'phone' => '9999999999',
    'fullName' => 'Jane Doe'
]);
```

### Delete User
```php
$db = new UserDatabaseHandler('users.json');

$result = $db->deleteUser('john@example.com');
```

### Export to CSV
```php
$db = new UserDatabaseHandler('users.json');

$csv = $db->exportToCSV();
file_put_contents('users_backup.csv', $csv);
```

## User Data Structure (users.json)

Each user in the JSON file contains:
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "",
  "password_hash": "$2y$10$...",
  "registeredAt": "2026-08-12 10:30:45",
  "id": 1
}
```

## Available Methods

### Read Operations
- `getAllUsers()` - Get all users
- `getUserByEmail($email)` - Get specific user
- `userExists($email)` - Check if user exists
- `getUserCount()` - Get total user count

### Write Operations
- `addUser($userData)` - Add new user
- `updateUser($email, $updates)` - Update user info
- `deleteUser($email)` - Delete user

### Export
- `exportToCSV()` - Export all users to CSV format

## Implementing Login (Using the Handler)

Create or update `login.php`:
```php
<?php
require_once 'database-handler.php';
session_start();

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
    echo json_encode(['success' => false, 'message' => 'Email and password required']);
    exit;
}

$db = new UserDatabaseHandler('users.json');
$user = $db->getUserByEmail($email);

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
    exit;
}

$_SESSION['user_id'] = $user['id'];
$_SESSION['full_name'] = $user['fullName'];
$_SESSION['email'] = $user['email'];

http_response_code(200);
echo json_encode([
    'success' => true,
    'message' => 'Login successful',
    'user' => ['fullName' => $user['fullName'], 'email' => $user['email']]
]);
```

## Benefits

✅ **File-based Database** - No MySQL setup required
✅ **Data Persistence** - All data saved to `users.json`
✅ **Thread-Safe** - File locking prevents data corruption
✅ **Easy Integration** - Simple class-based API
✅ **Extensible** - Easy to add custom methods
✅ **Secure** - Password hashing with PHP's PASSWORD_DEFAULT
✅ **Backup-friendly** - JSON format is human-readable and portable
✅ **No Dependencies** - Uses only PHP's standard library

## Testing

After registration, check `users.json` to verify:
1. New user data is added
2. JSON formatting is correct
3. Password is properly hashed
4. Registration timestamp is set

Example of properly formatted users.json:
```json
[
  {
    "fullName": "Alex Johnson",
    "email": "alex@example.com",
    "phone": "9876543210",
    "password": "",
    "password_hash": "$2y$10$...",
    "registeredAt": "2026-08-12 10:30:45",
    "id": 1
  }
]
```

## Troubleshooting

**Issue:** "Database is temporarily locked"
- **Cause:** File lock timeout (another process is writing)
- **Solution:** Retry the request after a few seconds

**Issue:** Users not appearing in users.json
- **Cause:** File permissions issue
- **Solution:** Ensure `users.json` has write permissions (644 or 777)

**Issue:** Password not hashing
- **Cause:** `password_hash()` not being used in `addUser()`
- **Solution:** Always pass `password_hash` field when adding users (not just `password`)

**Issue:** Duplicate users being added
- **Cause:** Race condition with file locking
- **Solution:** The handler prevents this with file locks, but ensure you're checking `userExists()` before adding

## Next Steps

1. ✅ Test registration to confirm users are saved to `users.json`
2. Create a `login.php` file (see example above)
3. Update any other files that need user data access
4. Consider adding `logout.php` and session management
5. Add optional features like password reset, email verification, etc.
