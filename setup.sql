CREATE DATABASE IF NOT EXISTS securestep_db;
USE securestep_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Emergency contacts table
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  relationship VARCHAR(50),
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- CivicSense reports table
CREATE TABLE IF NOT EXISTS civicsense_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  incident_type VARCHAR(50) NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address VARCHAR(255),
  is_anonymous BOOLEAN DEFAULT FALSE,
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  status ENUM('pending', 'verified', 'resolved') DEFAULT 'pending',
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- SOS alerts table
CREATE TABLE IF NOT EXISTS sos_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  status ENUM('active', 'stopped', 'resolved') DEFAULT 'active',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- SOS location tracking table
CREATE TABLE IF NOT EXISTS sos_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sos_id INT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sos_id) REFERENCES sos_alerts(id) ON DELETE CASCADE
);

-- SOS notifications table
CREATE TABLE IF NOT EXISTS sos_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sos_id INT NOT NULL,
  emergency_contact_id INT,
  notification_type ENUM('sms', 'email') NOT NULL,
  status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
  message TEXT,
  sent_at TIMESTAMP NULL,
  FOREIGN KEY (sos_id) REFERENCES sos_alerts(id) ON DELETE CASCADE,
  FOREIGN KEY (emergency_contact_id) REFERENCES emergency_contacts(id) ON DELETE SET NULL
);

-- Route history table
CREATE TABLE IF NOT EXISTS route_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  source_latitude DECIMAL(10, 8),
  source_longitude DECIMAL(11, 8),
  source_address VARCHAR(255),
  destination_latitude DECIMAL(10, 8),
  destination_longitude DECIMAL(11, 8),
  destination_address VARCHAR(255),
  route_id VARCHAR(50),
  distance_km DECIMAL(10, 2),
  duration_minutes INT,
  safety_score INT,
  risk_level VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Police stations table (infrastructure data)
CREATE TABLE IF NOT EXISTS police_stations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address VARCHAR(255),
  phone VARCHAR(20),
  website VARCHAR(255),
  jurisdiction VARCHAR(100),
  source VARCHAR(100),
  source_updated_at DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hospitals table (infrastructure data)
CREATE TABLE IF NOT EXISTS hospitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address VARCHAR(255),
  phone VARCHAR(20),
  website VARCHAR(255),
  type VARCHAR(50),
  source VARCHAR(100),
  source_updated_at DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Streetlights table (infrastructure data)
CREATE TABLE IF NOT EXISTS streetlights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  zone VARCHAR(50),
  ward VARCHAR(50),
  type VARCHAR(50),
  lighting_level INT,
  source VARCHAR(100),
  source_updated_at DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dataset metadata table
CREATE TABLE IF NOT EXISTS dataset_metadata (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dataset_name VARCHAR(100) NOT NULL,
  source VARCHAR(200),
  source_url VARCHAR(500),
  download_date DATE,
  last_updated DATE,
  license VARCHAR(200),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_civicsense_user ON civicsense_reports(user_id);
CREATE INDEX idx_civicsense_location ON civicsense_reports(latitude, longitude);
CREATE INDEX idx_civicsense_status ON civicsense_reports(status);
CREATE INDEX idx_sos_user ON sos_alerts(user_id);
CREATE INDEX idx_sos_status ON sos_alerts(status);
CREATE INDEX idx_sos_locations_sos ON sos_locations(sos_id);
CREATE INDEX idx_sos_notifications_sos ON sos_notifications(sos_id);
CREATE INDEX idx_route_user ON route_history(user_id);
CREATE INDEX idx_police_location ON police_stations(latitude, longitude);
CREATE INDEX idx_hospital_location ON hospitals(latitude, longitude);
CREATE INDEX idx_streetlight_location ON streetlights(latitude, longitude);
CREATE INDEX idx_streetlight_zone ON streetlights(zone);
