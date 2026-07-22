require("dotenv").config({ path: ".env.railway.temp" }); // ensure it loads railway env
const db = require("./config/db");
const bcrypt = require("bcryptjs");

async function seed() {
  const password = "password123";
  const hash = await bcrypt.hash(password, 10);

  const queries = [
    // 1. Users
    // Users: 2 active, 1 inactive
    `INSERT INTO users (name, email, password, phone, role, is_active, is_verified) VALUES ('User Aktif 1', 'user1@demo.com', '${hash}', '08111111111', 'user', 1, 1) ON DUPLICATE KEY UPDATE name=name`,
    `INSERT INTO users (name, email, password, phone, role, is_active, is_verified) VALUES ('User Aktif 2', 'user2@demo.com', '${hash}', '08111111112', 'user', 1, 1) ON DUPLICATE KEY UPDATE name=name`,
    `INSERT INTO users (name, email, password, phone, role, is_active, is_verified) VALUES ('User Nonaktif', 'user3@demo.com', '${hash}', '08111111113', 'user', 0, 1) ON DUPLICATE KEY UPDATE name=name`,
    
    // Petugas: 2 petugas
    `INSERT INTO users (name, email, password, phone, role, is_active, is_verified) VALUES ('Petugas 1', 'petugas1@demo.com', '${hash}', '08222222221', 'petugas', 1, 1) ON DUPLICATE KEY UPDATE name=name`,
    `INSERT INTO users (name, email, password, phone, role, is_active, is_verified) VALUES ('Petugas 2', 'petugas2@demo.com', '${hash}', '08222222222', 'petugas', 1, 1) ON DUPLICATE KEY UPDATE name=name`,
    
    // Pengepul: 1 verified, 1 unverified
    `INSERT INTO users (name, email, password, phone, role, is_active, is_verified) VALUES ('Pengepul Verified', 'pengepul1@demo.com', '${hash}', '08333333331', 'pengepul', 1, 1) ON DUPLICATE KEY UPDATE name=name`,
    `INSERT INTO users (name, email, password, phone, role, is_active, is_verified) VALUES ('Pengepul Unverified', 'pengepul2@demo.com', '${hash}', '08333333332', 'pengepul', 1, 0) ON DUPLICATE KEY UPDATE name=name`,

    // 2. Waste Types & Prices
    `INSERT INTO waste_types (name, icon, description) VALUES ('Plastik', '♻️', 'Botol plastik, gelas plastik') ON DUPLICATE KEY UPDATE name=name`,
    `INSERT INTO waste_types (name, icon, description) VALUES ('Kertas', '📄', 'Kardus, kertas HVS') ON DUPLICATE KEY UPDATE name=name`,
    
    // Note: We need waste_types IDs for waste_prices. We'll assume IDs 1 and 2 if auto-increment is fresh.
    // A better approach is dynamic insert, but for simplicity we will execute queries sequentially.
  ];

  for (let q of queries) {
    await new Promise((resolve, reject) => {
      db.query(q, (err, res) => {
        if (err) {
          console.error("Error executing query:", err);
          resolve(); // ignore error for now, continue
        } else {
          resolve(res);
        }
      });
    });
  }

  // Get users
  const users = await new Promise((res) => db.query("SELECT id, role, email FROM users", (e, r) => res(r)));
  const u1 = users.find(u => u.email === 'user1@demo.com')?.id;
  const p1 = users.find(u => u.email === 'petugas1@demo.com')?.id;
  const pen1 = users.find(u => u.email === 'pengepul1@demo.com')?.id;

  // Insert Petugas & Pengepul profiles safely
  if (p1) {
    db.query(`INSERT IGNORE INTO petugas (user_id, coverage_area, max_radius) VALUES (${p1}, 'Jakarta Selatan', 10)`);
  }
  if (pen1) {
    db.query(`INSERT IGNORE INTO pengepul (user_id, company_name, address) VALUES (${pen1}, 'PT Pengepul Makmur', 'Jl. Sudirman 1')`);
  }

  const types = await new Promise((res) => db.query("SELECT id, name FROM waste_types", (e, r) => res(r)));
  const typePlastik = types.find(t => t.name === 'Plastik')?.id;
  const typeKertas = types.find(t => t.name === 'Kertas')?.id;

  if (typePlastik) {
    db.query(`INSERT IGNORE INTO waste_prices (waste_type_id, price_user_per_kg, price_pengepul_per_kg) VALUES (${typePlastik}, 2000, 2500)`);
  }
  if (typeKertas) {
    db.query(`INSERT IGNORE INTO waste_prices (waste_type_id, price_user_per_kg, price_pengepul_per_kg) VALUES (${typeKertas}, 1500, 2000)`);
  }

  // Pickups
  if (u1 && p1 && pen1) {
    const pickupQueries = [
      `INSERT INTO pickups (user_id, address, status, estimated_weight) VALUES (${u1}, 'Jl. User 1', 'pending', 5)`,
      `INSERT INTO pickups (user_id, petugas_id, address, status, estimated_weight) VALUES (${u1}, ${p1}, 'Jl. User 1', 'accepted', 10)`,
      `INSERT INTO pickups (user_id, petugas_id, pengepul_id, address, status, estimated_weight, final_weight, final_reward) VALUES (${u1}, ${p1}, ${pen1}, 'Jl. User 1', 'completed', 15, 15, 30000)`
    ];
    for (let q of pickupQueries) {
      await new Promise((resolve) => db.query(q, () => resolve()));
    }
  }

  // Wallet
  if (u1) {
    const walletQueries = [
      `INSERT INTO wallet_transactions (user_id, type, amount, status, description) VALUES (${u1}, 'topup', 50000, 'success', 'Topup awal')`,
      `INSERT INTO wallet_transactions (user_id, type, amount, status, description) VALUES (${u1}, 'reward', 30000, 'success', 'Hasil jual sampah')`,
      `INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name, status) VALUES (${u1}, 20000, 'BCA', '1234567890', 'User 1', 'pending')`
    ];
    for (let q of walletQueries) {
      await new Promise((resolve) => db.query(q, () => resolve()));
    }
    // Update balance
    db.query(`UPDATE users SET balance = 80000 WHERE id = ${u1}`);
  }

  // Notifications & Messages & Tickets
  if (u1 && p1) {
    db.query(`INSERT INTO notifications (user_id, title, message) VALUES (${u1}, 'Selamat Datang', 'Demo akun berhasil dibuat')`);
    db.query(`INSERT INTO messages (sender_id, receiver_id, pickup_id, message) VALUES (${u1}, ${p1}, NULL, 'Halo petugas, kapan bisa ambil?')`);
    db.query(`INSERT INTO tickets (user_id, subject, message, status) VALUES (${u1}, 'Tarik saldo lama', 'Halo, penarikan saya belum masuk', 'open')`);
  }

  console.log("Seeding selesai!");
  process.exit();
}

seed();
