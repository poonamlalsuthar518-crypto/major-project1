<?php
require_once 'database-handler.php';

$db = new UserDatabaseHandler('users.json');

// Get CSV data
$csv = $db->exportToCSV();

// Set headers for download
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="users_export_' . date('Y-m-d_H-i-s') . '.csv"');
header('Pragma: no-cache');
header('Expires: 0');

// Output CSV
echo $csv;
exit;
