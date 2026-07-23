require("dotenv").config();
const db = require("./config/db");
const bcrypt = require("bcryptjs");

async function seed() {
  const hash = await bcrypt.hash("Test1234!", 10);
  
  const query = `
    INSERT INTO users (name, email, password, role, latitude, longitude, availability_status, service_radius) 
    VALUES 
      (?, ?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      latitude=VALUES(latitude), 
      longitude=VALUES(longitude), 
      availability_status=VALUES(availability_status), 
      service_radius=VALUES(service_radius)
  `;

  // Petugas 1: Rumbio Jaya, Kampar, Riau
  const p1 = [
    "Petugas Test Dekat", 
    "petugas1@test.com", 
    hash, 
    "petugas", 
    0.317, 
    101.148, 
    "AVAILABLE", 
    10
  ];

  // Petugas 2: Jakarta
  // Approximate: -6.2088, 106.8456
  const p2 = [
    "Petugas Test Jauh", 
    "petugas2@test.com", 
    hash, 
    "petugas", 
    -6.2088, 
    106.8456, 
    "AVAILABLE", 
    5
  ];

  const values = [...p1, ...p2];

  db.query(query, values, (err) => {
    if (err) {
      console.error("Error seeding petugas:", err);
    } else {
      console.log("Petugas seeded successfully:");
      console.log("- petugas1@test.com (Lubuk Sikaping, radius 10km)");
      console.log("- petugas2@test.com (Jakarta, radius 5km)");
    }
    process.exit();
  });
}

seed();
