const db = require("../config/db");
const bcrypt = require("bcryptjs");

// ============================================================
// GET semua user (role = 'user')
// ============================================================
exports.getAllUsers = (req, res) => {
  const sql = `
    SELECT u.id, u.name, u.email, u.role, u.created_at, u.is_active,
           COALESCE(MAX(w.balance), 0) AS saldo,
           COUNT(DISTINCT p.id) AS total_pickup,
           COALESCE(SUM(CASE WHEN p.actual_weight IS NOT NULL THEN p.actual_weight ELSE 0 END), 0) AS total_sampah,
           COALESCE((SELECT SUM(wd.amount) FROM withdrawals wd WHERE wd.user_id = u.id AND wd.status = 'success'), 0) AS total_penarikan
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    LEFT JOIN pickups p ON p.user_id = u.id AND p.status = 'completed'
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
};

// ============================================================
// Toggle aktif/nonaktif user (via custom field is_active)
// ============================================================
exports.toggleUserStatus = (req, res) => {
  const { id } = req.params;
  // We use a simple approach: update role atau tambah kolom is_active
  // Karena schema tidak punya is_active, kita gunakan kolom status custom
  db.query("SELECT is_active FROM users WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    const current = result[0].is_active;
    db.query("UPDATE users SET is_active = ? WHERE id = ?", [!current, id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, message: "Status user berhasil diubah" });
    });
  });
};

// ============================================================
// Hapus user
// ============================================================
exports.deleteUser = (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM users WHERE id = ? AND role = 'user'", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    res.json({ success: true, message: "User berhasil dihapus" });
  });
};

// ============================================================
// GET semua petugas (role = 'petugas')
// ============================================================
exports.getAllPetugas = (req, res) => {
  const sql = `
    SELECT u.id, u.name, u.email, u.created_at, u.is_active,
           COALESCE(MAX(w.balance), 0) AS saldo,
           COUNT(DISTINCT p.id) AS total_order,
           COALESCE(SUM(CASE WHEN p.actual_weight IS NOT NULL THEN p.actual_weight ELSE 0 END), 0) AS total_sampah
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    LEFT JOIN pickups p ON p.petugas_id = u.id AND p.status = 'completed'
    WHERE u.role = 'petugas'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
};

// ============================================================
// Tambah petugas
// ============================================================
exports.addPetugas = (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: "Nama, email, dan password wajib" });

  db.query("SELECT id FROM users WHERE email = ?", [email], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (rows.length > 0) return res.status(409).json({ success: false, message: "Email sudah terdaftar" });

    const hashed = bcrypt.hashSync(password, 10);
    db.query(
      "INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, 'petugas', ?)",
      [name, email, hashed, phone || null],
      (err2, result) => {
        if (err2) return res.status(500).json({ success: false, message: err2.message });
        db.query("INSERT INTO wallets (user_id, balance) VALUES (?, 0)", [result.insertId]);
        res.status(201).json({ success: true, message: "Petugas berhasil ditambahkan" });
      }
    );
  });
};

// ============================================================
// Edit petugas
// ============================================================
exports.editPetugas = (req, res) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;
  db.query(
    "UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ? AND role = 'petugas'",
    [name, email, phone || null, id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Petugas tidak ditemukan" });
      res.json({ success: true, message: "Petugas berhasil diperbarui" });
    }
  );
};

// ============================================================
// Hapus petugas
// ============================================================
exports.deletePetugas = (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM users WHERE id = ? AND role = 'petugas'", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Petugas tidak ditemukan" });
    res.json({ success: true, message: "Petugas berhasil dihapus" });
  });
};

// ============================================================
// Toggle status petugas
// ============================================================
exports.togglePetugasStatus = (req, res) => {
  const { id } = req.params;
  db.query("SELECT is_active FROM users WHERE id = ? AND role='petugas'", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "Petugas tidak ditemukan" });
    db.query("UPDATE users SET is_active = ? WHERE id = ?", [!result[0].is_active, id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, message: "Status petugas berhasil diubah" });
    });
  });
};

// ============================================================
// GET semua pengepul
// ============================================================
exports.getAllPengepul = (req, res) => {
  const sql = `
    SELECT u.id, u.name, u.email, u.phone, u.company_name, u.address, u.is_verified, u.created_at,
           COUNT(DISTINCT p.id) AS total_transaksi,
           COALESCE(SUM(CASE WHEN p.actual_weight IS NOT NULL THEN p.actual_weight ELSE 0 END), 0) AS total_sampah
    FROM users u
    LEFT JOIN pickups p ON p.pengepul_id = u.id
    WHERE u.role = 'pengepul'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
};

// ============================================================
// Tambah pengepul
// ============================================================
exports.addPengepul = (req, res) => {
  const { name, email, password, phone, company_name, address } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: "Data tidak lengkap" });

  db.query("SELECT id FROM users WHERE email = ?", [email], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (rows.length > 0) return res.status(409).json({ success: false, message: "Email sudah terdaftar" });

    const hashed = bcrypt.hashSync(password, 10);
    db.query(
      "INSERT INTO users (name, email, password, role, phone, company_name, address) VALUES (?, ?, ?, 'pengepul', ?, ?, ?)",
      [name, email, hashed, phone || null, company_name || null, address || null],
      (err2, result) => {
        if (err2) return res.status(500).json({ success: false, message: err2.message });
        res.status(201).json({ success: true, message: "Pengepul berhasil ditambahkan" });
      }
    );
  });
};

// ============================================================
// Edit pengepul
// ============================================================
exports.editPengepul = (req, res) => {
  const { id } = req.params;
  const { name, email, phone, company_name, address } = req.body;
  db.query(
    "UPDATE users SET name=?, email=?, phone=?, company_name=?, address=? WHERE id=? AND role='pengepul'",
    [name, email, phone || null, company_name || null, address || null, id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Pengepul tidak ditemukan" });
      res.json({ success: true, message: "Pengepul berhasil diperbarui" });
    }
  );
};

// ============================================================
// Hapus pengepul
// ============================================================
exports.deletePengepul = (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM users WHERE id=? AND role='pengepul'", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Pengepul tidak ditemukan" });
    res.json({ success: true, message: "Pengepul berhasil dihapus" });
  });
};

// ============================================================
// Toggle verifikasi pengepul
// ============================================================
exports.toggleVerifikasiPengepul = (req, res) => {
  const { id } = req.params;
  db.query("SELECT is_verified FROM users WHERE id=? AND role='pengepul'", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "Pengepul tidak ditemukan" });
    db.query("UPDATE users SET is_verified=? WHERE id=?", [!result[0].is_verified, id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, message: "Status verifikasi berhasil diubah" });
    });
  });
};

// ============================================================
// GET semua jenis sampah
// ============================================================
exports.getAllWasteTypes = (req, res) => {
  db.query("SELECT * FROM waste_types ORDER BY id DESC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
};

// ============================================================
// Tambah jenis sampah
// ============================================================
exports.addWasteType = (req, res) => {
  const { name, icon, description } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "Nama jenis sampah wajib diisi" });
  db.query(
    "INSERT INTO waste_types (name, icon, description) VALUES (?, ?, ?)",
    [name, icon || "♻️", description || null],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.status(201).json({ success: true, message: "Jenis sampah berhasil ditambahkan", id: result.insertId });
    }
  );
};

// ============================================================
// Edit jenis sampah
// ============================================================
exports.editWasteType = (req, res) => {
  const { id } = req.params;
  const { name, icon, description } = req.body;
  db.query(
    "UPDATE waste_types SET name=?, icon=?, description=? WHERE id=?",
    [name, icon, description, id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Tidak ditemukan" });
      res.json({ success: true, message: "Jenis sampah berhasil diperbarui" });
    }
  );
};

// ============================================================
// Hapus jenis sampah
// ============================================================
exports.deleteWasteType = (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM waste_types WHERE id=?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Tidak ditemukan" });
    res.json({ success: true, message: "Jenis sampah berhasil dihapus" });
  });
};

// ============================================================
// Toggle aktif jenis sampah
// ============================================================
exports.toggleWasteType = (req, res) => {
  const { id } = req.params;
  db.query("SELECT is_active FROM waste_types WHERE id=?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "Tidak ditemukan" });
    db.query("UPDATE waste_types SET is_active=? WHERE id=?", [!result[0].is_active, id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, message: "Status berhasil diubah" });
    });
  });
};

// ============================================================
// GET semua harga sampah
// ============================================================
exports.getAllPrices = (req, res) => {
  db.query("SELECT * FROM waste_prices ORDER BY id ASC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
};

// ============================================================
// Update harga sampah
// ============================================================
exports.updatePrice = (req, res) => {
  const { id } = req.params;
  const { price_per_kg } = req.body; // tetapkan price_per_kg dari API body agar kompatibel dengan frontend lama
  if (!price_per_kg) return res.status(400).json({ success: false, message: "Harga wajib diisi" });

  // Simpan riwayat dulu
  db.query("SELECT waste_type, price_user_per_kg as price_per_kg FROM waste_prices WHERE id=?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "Harga tidak ditemukan" });

    const old = result[0];
    db.query(
      "INSERT INTO price_history (waste_type, old_price, new_price, changed_by) VALUES (?,?,?,?)",
      [old.waste_type, old.price_per_kg, price_per_kg, req.user.id],
      () => {}
    );

    // Update both user and pengepul price (pengepul is +500)
    db.query("UPDATE waste_prices SET price_user_per_kg=?, price_pengepul_per_kg=? WHERE id=?", [price_per_kg, Number(price_per_kg) + 500, id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, message: "Harga berhasil diperbarui" });
    });
  });
};

// ============================================================
// GET riwayat perubahan harga
// ============================================================
exports.getPriceHistory = (req, res) => {
  db.query(
    `SELECT ph.*, u.name as changed_by_name FROM price_history ph
     LEFT JOIN users u ON u.id = ph.changed_by
     ORDER BY ph.id DESC LIMIT 50`,
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, data: results });
    }
  );
};

// ============================================================
// GET semua penarikan saldo (admin)
// ============================================================
exports.getAllWithdrawals = (req, res) => {
  const sql = `
    SELECT w.*, u.name as user_name, u.email as user_email
    FROM withdrawals w
    JOIN users u ON u.id = w.user_id
    ORDER BY w.created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
};

// ============================================================
// Approve penarikan saldo
// ============================================================
exports.approveWithdrawal = (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM withdrawals WHERE id=? AND status='pending'", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "Penarikan tidak ditemukan atau bukan status pending" });

    const w = result[0];
    db.query("UPDATE withdrawals SET status='approved' WHERE id=?", [id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, message: "Penarikan disetujui" });
    });
  });
};

// ============================================================
// Success penarikan saldo (approved → success + potong saldo)
// ============================================================
exports.successWithdrawal = (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM withdrawals WHERE id=? AND status='approved'", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "Penarikan tidak ditemukan atau bukan status approved" });

    const w = result[0];
    // Potong saldo user
    db.query("UPDATE wallets SET balance = balance - ? WHERE user_id = ?", [w.amount, w.user_id]);
    // Catat transaksi
    db.query(
      "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES (?,?,'debit',?)",
      [w.user_id, w.amount, `Penarikan saldo via ${w.bank_name}`]
    );
    // Update status
    db.query("UPDATE withdrawals SET status='success' WHERE id=?", [id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, message: "Penarikan berhasil dicairkan" });
    });
  });
};

// ============================================================
// Reject penarikan saldo
// ============================================================
exports.rejectWithdrawal = (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  db.query("UPDATE withdrawals SET status='rejected', reject_reason=? WHERE id=? AND status='pending'", [reason || null, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Tidak ditemukan atau bukan pending" });
    res.json({ success: true, message: "Penarikan ditolak" });
  });
};

// ============================================================
// GET semua penjemputan (admin monitoring)
// ============================================================
exports.getAllPickupsAdmin = (req, res) => {
  const sql = `
    SELECT p.*,
           u.name as user_name,
           petugas.name as petugas_name
    FROM pickups p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users petugas ON petugas.id = p.petugas_id
    ORDER BY p.created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
};

// ============================================================
// Admin Dashboard Stats
// ============================================================
exports.getAdminStats = (req, res) => {
  const queries = {
    total_user: `SELECT COUNT(*) as val FROM users WHERE role='user'`,
    total_petugas: `SELECT COUNT(*) as val FROM users WHERE role='petugas'`,
    total_pengepul: `SELECT COUNT(*) as val FROM users WHERE role='pengepul'`,
    total_sampah: `SELECT COALESCE(SUM(actual_weight),0) as val FROM pickups WHERE status='completed'`,
    total_penarikan: `SELECT COALESCE(SUM(amount),0) as val FROM withdrawals WHERE status='success'`,
    total_transaksi: `SELECT COUNT(*) as val FROM pickups`,
    total_pendapatan: `SELECT COALESCE(SUM(amount),0) as val FROM wallet_transactions WHERE type='credit' AND payment_method='saldo'`,
    total_pengeluaran: `SELECT COALESCE(SUM(amount),0) as val FROM wallet_transactions WHERE type='debit' AND payment_method='saldo'`,
  };

  const results = {};
  const keys = Object.keys(queries);
  let done = 0;

  keys.forEach(key => {
    db.query(queries[key], (err, rows) => {
      if (err) { results[key] = 0; } else { results[key] = rows[0].val; }
      done++;
      if (done === keys.length) {
        res.json({ success: true, data: results });
      }
    });
  });
};

// ============================================================
// GET grafik bulanan
// ============================================================
exports.getMonthlyChart = (req, res) => {
  const sampahQuery = `
    SELECT DATE_FORMAT(created_at, '%Y-%m') as bulan,
           COUNT(*) as jumlah_penjemputan,
           COALESCE(SUM(actual_weight), 0) as total_sampah
    FROM pickups
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY bulan ASC
  `;
  const keuanganQuery = `
    SELECT DATE_FORMAT(created_at, '%Y-%m') as bulan,
           SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) as pendapatan,
           SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) as pengeluaran
    FROM wallet_transactions
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY bulan ASC
  `;

  db.query(sampahQuery, (err1, sampah) => {
    if (err1) return res.status(500).json({ success: false, message: err1.message });
    db.query(keuanganQuery, (err2, keuangan) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, sampah, keuangan });
    });
  });
};

// ============================================================
// GET aktivitas terbaru
// ============================================================
exports.getRecentActivity = (req, res) => {
  const sql = `
    (SELECT 'user_baru' as tipe, u.name as deskripsi, u.created_at as waktu FROM users u WHERE u.role='user' ORDER BY u.created_at DESC LIMIT 3)
    UNION
    (SELECT 'penjemputan' as tipe, CONCAT('Order #PP-', p.id, ' selesai') as deskripsi, p.created_at as waktu FROM pickups p WHERE p.status='completed' ORDER BY p.created_at DESC LIMIT 3)
    UNION
    (SELECT 'penarikan' as tipe, CONCAT(u.name, ' - ', w.bank_name, ' Rp ', FORMAT(w.amount,0)) as deskripsi, w.created_at as waktu FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.status='pending' ORDER BY w.created_at DESC LIMIT 3)
    ORDER BY waktu DESC
    LIMIT 8
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
};

// ============================================================
// GET monitoring sampah
// ============================================================
exports.getSampahMonitoring = (req, res) => {
  const byTypeQuery = `
    SELECT waste_type, 
           COALESCE(SUM(actual_weight), 0) as total_kg,
           COUNT(*) as jumlah
    FROM pickups
    WHERE status='completed'
    GROUP BY waste_type
    ORDER BY total_kg DESC
  `;
  const todayQuery = `
    SELECT p.id, p.waste_type, p.actual_weight, p.created_at,
           u.name as user_name,
           petugas.name as petugas_name
    FROM pickups p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users petugas ON petugas.id = p.petugas_id
    WHERE DATE(p.created_at) = CURDATE() AND p.status='completed'
    ORDER BY p.created_at DESC
  `;
  db.query(byTypeQuery, (err1, byType) => {
    if (err1) return res.status(500).json({ success: false, message: err1.message });
    db.query(todayQuery, (err2, today) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, byType, today });
    });
  });
};

// ============================================================
// GET semua notifikasi user (admin view)
// ============================================================
exports.getAdminNotifications = (req, res) => {
  // Admin melihat notifikasi sistem
  db.query(
    `SELECT n.*, u.name as user_name FROM notifications n
     JOIN users u ON u.id = n.user_id
     ORDER BY n.created_at DESC LIMIT 50`,
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, data: results });
    }
  );
};

// ============================================================
// Mark notification as read
// ============================================================
exports.markNotificationAsRead = (req, res) => {
  const { id } = req.params;
  db.query("UPDATE notifications SET is_read = TRUE WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: "Notifikasi dibaca" });
  });
};

// ============================================================
// Mark all notifications as read
// ============================================================
exports.markAllNotificationsAsRead = (req, res) => {
  db.query("UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE", (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: "Semua notifikasi dibaca" });
  });
};

// ============================================================
// GET laporan keuangan ringkasan
// ============================================================
exports.getKeuanganReport = (req, res) => {
  const sql = `
    SELECT 
      (SELECT COALESCE(SUM(balance),0) FROM wallets) as total_saldo_user,
      (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE status='success') as total_penarikan,
      (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE type='credit' AND payment_method='saldo') as total_pendapatan,
      (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE type='debit' AND payment_method='saldo') as total_pengeluaran
  `;
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: result[0] });
  });
};

// ============================================================
// GET riwayat transaksi (admin)
// ============================================================
exports.getTransactionHistory = (req, res) => {
  db.query(
    `SELECT wt.*, u.name as user_name FROM wallet_transactions wt
     JOIN users u ON u.id = wt.user_id
     ORDER BY wt.created_at DESC LIMIT 100`,
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, data: results });
    }
  );
};
