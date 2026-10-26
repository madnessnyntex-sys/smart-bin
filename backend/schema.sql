-- Smart Bin schema v2.
-- Already ran the v1 schema? Drop the smart_bin database first, then run this.
CREATE DATABASE IF NOT EXISTS smart_bin;
USE smart_bin;

CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  location VARCHAR(100) NULL,
  api_key_hash CHAR(64) NOT NULL UNIQUE,          -- sha256 of the key the bin sends
  rice_stock_grams INT NOT NULL DEFAULT 0,
  rice_capacity_grams INT NOT NULL DEFAULT 5000,
  last_seen_at TIMESTAMP NULL,
  CHECK (rice_stock_grams >= 0)
);

CREATE TABLE IF NOT EXISTS waste_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  category VARCHAR(30) NOT NULL,
  is_recyclable TINYINT(1) NOT NULL DEFAULT 1,
  rice_grams INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS detections (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  waste_type_id INT NOT NULL,
  confidence DECIMAL(3,2) NULL,
  rice_grams INT NOT NULL DEFAULT 0,              -- what was actually given, 0 if rejected / out of rice
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (waste_type_id) REFERENCES waste_types(id),
  INDEX idx_detections_created (created_at),
  INDEX idx_detections_device_created (device_id, created_at)
);

INSERT IGNORE INTO waste_types (name, category, is_recyclable, rice_grams) VALUES
  ('Water bottle', 'Plastic', 1, 20),
  ('Soda can', 'Metal', 1, 25),
  ('Glass bottle', 'Glass', 1, 25),
  ('Cardboard', 'Paper', 1, 10),
  ('Junk food wrapper', 'Plastic', 0, 0),
  ('Styrofoam', 'Plastic', 0, 0),
  ('Food waste', 'Organic', 0, 0),
  ('Unrecognized', 'Other', 0, 0);

-- dev device. the key the bin sends is "dev-bin-key-change-me", change it for anything real
INSERT IGNORE INTO devices (name, location, api_key_hash, rice_stock_grams, rice_capacity_grams)
VALUES ('Bin 01', 'Main entrance', SHA2('dev-bin-key-change-me', 256), 5000, 5000);
