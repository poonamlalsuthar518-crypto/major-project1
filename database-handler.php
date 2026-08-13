<?php
/**
 * Database Handler for Users JSON File
 * Handles all operations for reading and writing user data to users.json
 */

class UserDatabaseHandler
{
    private $dbFile;
    private $lockFile;

    public function __construct($dbFileName = 'users.json')
    {
        $this->dbFile = __DIR__ . '/' . $dbFileName;
        $this->lockFile = __DIR__ . '/' . $dbFileName . '.lock';
    }

    /**
     * Read all users from the JSON file
     * @return array Users array or empty array if file doesn't exist
     */
    public function getAllUsers()
    {
        if (!file_exists($this->dbFile)) {
            return [];
        }

        $content = file_get_contents($this->dbFile);
        if (empty($content)) {
            return [];
        }

        return json_decode($content, true) ?? [];
    }

    /**
     * Check if user exists by email
     * @param string $email User email to check
     * @return bool True if user exists, false otherwise
     */
    public function userExists($email)
    {
        $email = strtolower(trim($email));
        $users = $this->getAllUsers();

        foreach ($users as $user) {
            if (strtolower($user['email']) === $email) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get user by email
     * @param string $email User email
     * @return array|null User data or null if not found
     */
    public function getUserByEmail($email)
    {
        $email = strtolower(trim($email));
        $users = $this->getAllUsers();

        foreach ($users as $user) {
            if (strtolower($user['email']) === $email) {
                return $user;
            }
        }

        return null;
    }

    /**
     * Add a new user to the database
     * @param array $userData User data array with keys: fullName, email, phone, password (or password_hash)
     * @return array Result array with success status and message
     */
    public function addUser($userData)
    {
        // Validate required fields
        if (empty($userData['fullName']) || empty($userData['email']) || empty($userData['phone'])) {
            return [
                'success' => false,
                'message' => 'Missing required fields'
            ];
        }

        // Check if user already exists
        if ($this->userExists($userData['email'])) {
            return [
                'success' => false,
                'message' => 'An account with this email already exists'
            ];
        }

        // Acquire lock for safe file writing
        $lock = $this->acquireLock();
        if (!$lock) {
            return [
                'success' => false,
                'message' => 'Database is temporarily locked. Please try again.'
            ];
        }

        try {
            // Read current users
            $users = $this->getAllUsers();

            // Prepare new user data
            $newUser = [
                'fullName' => trim($userData['fullName']),
                'email' => strtolower(trim($userData['email'])),
                'phone' => trim($userData['phone']),
                'password' => $userData['password'] ?? '',
                'password_hash' => $userData['password_hash'] ?? '',
                'registeredAt' => date('Y-m-d H:i:s'),
                'id' => count($users) + 1
            ];

            // Add new user to users array
            $users[] = $newUser;

            // Write updated users to file
            $result = file_put_contents(
                $this->dbFile,
                json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
                LOCK_EX
            );

            $this->releaseLock($lock);

            if ($result === false) {
                return [
                    'success' => false,
                    'message' => 'Failed to write user data to database'
                ];
            }

            return [
                'success' => true,
                'message' => 'User registered successfully',
                'user' => [
                    'id' => $newUser['id'],
                    'fullName' => $newUser['fullName'],
                    'email' => $newUser['email']
                ]
            ];

        } catch (Exception $e) {
            $this->releaseLock($lock);
            return [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ];
        }
    }

    /**
     * Update user information
     * @param string $email User email to identify the user
     * @param array $updates Fields to update
     * @return array Result array with success status
     */
    public function updateUser($email, $updates)
    {
        if (!$this->userExists($email)) {
            return [
                'success' => false,
                'message' => 'User not found'
            ];
        }

        $lock = $this->acquireLock();
        if (!$lock) {
            return [
                'success' => false,
                'message' => 'Database is temporarily locked. Please try again.'
            ];
        }

        try {
            $users = $this->getAllUsers();
            $email = strtolower(trim($email));

            foreach ($users as &$user) {
                if (strtolower($user['email']) === $email) {
                    $user = array_merge($user, $updates);
                    break;
                }
            }

            file_put_contents(
                $this->dbFile,
                json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
                LOCK_EX
            );

            $this->releaseLock($lock);

            return [
                'success' => true,
                'message' => 'User updated successfully'
            ];

        } catch (Exception $e) {
            $this->releaseLock($lock);
            return [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ];
        }
    }

    /**
     * Delete a user
     * @param string $email User email to delete
     * @return array Result array with success status
     */
    public function deleteUser($email)
    {
        $lock = $this->acquireLock();
        if (!$lock) {
            return [
                'success' => false,
                'message' => 'Database is temporarily locked. Please try again.'
            ];
        }

        try {
            $users = $this->getAllUsers();
            $email = strtolower(trim($email));
            $found = false;

            $users = array_filter($users, function ($user) use ($email, &$found) {
                if (strtolower($user['email']) === $email) {
                    $found = true;
                    return false;
                }
                return true;
            });

            if (!$found) {
                $this->releaseLock($lock);
                return [
                    'success' => false,
                    'message' => 'User not found'
                ];
            }

            file_put_contents(
                $this->dbFile,
                json_encode(array_values($users), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
                LOCK_EX
            );

            $this->releaseLock($lock);

            return [
                'success' => true,
                'message' => 'User deleted successfully'
            ];

        } catch (Exception $e) {
            $this->releaseLock($lock);
            return [
                'success' => false,
                'message' => 'Error: ' . $e->getMessage()
            ];
        }
    }

    /**
     * Acquire a file lock for safe concurrent access
     * @return resource|false Lock resource or false if failed
     */
    private function acquireLock($timeout = 5)
    {
        $startTime = time();
        $lockHandle = null;

        while ((time() - $startTime) < $timeout) {
            if (!file_exists($this->lockFile)) {
                $lockHandle = @fopen($this->lockFile, 'w');
                if ($lockHandle && flock($lockHandle, LOCK_EX | LOCK_NB)) {
                    return $lockHandle;
                }
                if ($lockHandle) {
                    fclose($lockHandle);
                }
            }
            usleep(100000); // Wait 100ms before retry
        }

        return false;
    }

    /**
     * Release file lock
     * @param resource $lock Lock resource
     */
    private function releaseLock($lock)
    {
        if (is_resource($lock)) {
            flock($lock, LOCK_UN);
            fclose($lock);
            @unlink($this->lockFile);
        }
    }

    /**
     * Get total number of users
     * @return int Total user count
     */
    public function getUserCount()
    {
        return count($this->getAllUsers());
    }

    /**
     * Export database to CSV format
     * @return string CSV formatted data
     */
    public function exportToCSV()
    {
        $users = $this->getAllUsers();
        $output = "Full Name,Email,Phone,Registered At\n";

        foreach ($users as $user) {
            $line = sprintf(
                "\"%s\",\"%s\",\"%s\",\"%s\"\n",
                addslashes($user['fullName']),
                $user['email'],
                $user['phone'],
                $user['registeredAt'] ?? 'N/A'
            );
            $output .= $line;
        }

        return $output;
    }
}
