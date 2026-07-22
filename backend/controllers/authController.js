const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ============================================================
// REGISTER (user biasa - role default 'user')
// ============================================================
exports.register = (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Nama, email, dan password wajib diisi" });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length > 0) return res.status(409).json({ success: false, message: "Email sudah terdaftar" });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, hashedPassword], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      db.query("INSERT INTO wallets (user_id, balance) VALUES (?, 0)", [result.insertId], (errWallet) => {
        if (errWallet) return res.status(500).json({ success: false, message: errWallet.message });
        return res.status(201).json({ success: true, message: "Register berhasil" });
      });
    });
  });
};

// ============================================================
// REGISTER PETUGAS (role = 'petugas')
// ============================================================
exports.registerPetugas = (req, res) => {
  const { name, email, password, service_radius } = req.body;
  const pengepul_id = req.user.id;

  if (req.user.role !== 'pengepul') {
    return res.status(403).json({ success: false, message: "Hanya pengepul yang dapat mendaftarkan petugas." });
  }

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Nama, email, dan password wajib diisi" });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "Password minimal 6 karakter" });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length > 0) return res.status(409).json({ success: false, message: "Email sudah terdaftar" });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const radius = service_radius || 15.00;

    db.query(
      "INSERT INTO users (name, email, password, role, pengepul_id, must_change_password, service_radius) VALUES (?, ?, ?, 'petugas', ?, true, ?)",
      [name, email, hashedPassword, pengepul_id, radius],
      (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        
        // Buat wallet untuk petugas
        db.query("INSERT INTO wallets (user_id, balance) VALUES (?, 0)", [result.insertId], (errWallet) => {
          if (errWallet) return res.status(500).json({ success: false, message: errWallet.message });
          return res.status(201).json({ success: true, message: "Akun petugas berhasil dibuat! Silakan berikan kredensial ke petugas." });
        });
      }
    );
  });
};

// ============================================================
// REGISTER PENGEPUL (role = 'pengepul')
// ============================================================
exports.registerPengepul = (req, res) => {
  const { name, email, password, phone, company_name, address } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Nama, email, dan password wajib diisi" });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "Password minimal 6 karakter" });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length > 0) return res.status(409).json({ success: false, message: "Email sudah terdaftar" });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.query(
      "INSERT INTO users (name, email, password, role, phone, company_name, address) VALUES (?, ?, ?, 'pengepul', ?, ?, ?)",
      [name, email, hashedPassword, phone || null, company_name || null, address || null],
      (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        
        // Buat wallet untuk pengepul
        db.query("INSERT INTO wallets (user_id, balance) VALUES (?, 0)", [result.insertId], (errWallet) => {
          if (errWallet) return res.status(500).json({ success: false, message: errWallet.message });
          return res.status(201).json({ success: true, message: "Akun pengepul berhasil dibuat! Silakan login." });
        });
      }
    );
  });
};

// ============================================================
// REGISTER ADMIN (role = 'admin')
// ============================================================
exports.registerAdmin = (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Nama, email, dan password wajib diisi" });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "Password minimal 6 karakter" });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length > 0) return res.status(409).json({ success: false, message: "Email sudah terdaftar" });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')",
      [name, email, hashedPassword],
      (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        
        // Buat wallet untuk admin (walaupun jarang dipakai, tetap dibuat untuk keseragaman relasi)
        db.query("INSERT INTO wallets (user_id, balance) VALUES (?, 0)", [result.insertId], (errWallet) => {
          if (errWallet) return res.status(500).json({ success: false, message: errWallet.message });
          return res.status(201).json({ success: true, message: "Akun admin berhasil dibuat! Silakan login." });
        });
      }
    );
  });
};

// ============================================================
// LOGIN
// ============================================================
exports.login = (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "Email tidak ditemukan" });

    const user = result[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(401).json({ success: false, message: "Password salah" });

    if (user.role === 'pengepul' && !user.is_verified) {
      return res.status(403).json({ success: false, message: "Akun Anda sedang menunggu verifikasi Admin." });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      token,
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        must_change_password: !!user.must_change_password
      },
    });
  });
};

// ============================================================
// PROFILE (protected)
// ============================================================
exports.profile = (req, res) => {
  db.query("SELECT * FROM users WHERE id = ?", [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length === 0) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    res.json({ success: true, user: results[0] });
  });
};

// ============================================================
// UPDATE PROFILE (protected)
// ============================================================
exports.updateProfile = (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "Nama wajib diisi" });

  db.query("UPDATE users SET name = ? WHERE id = ?", [name, req.user.id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: "Profil berhasil diperbarui" });
  });
};

// ============================================================
// UPDATE PETUGAS STATUS & GPS (protected)
// ============================================================
exports.updatePetugasStatus = (req, res) => {
  const { latitude, longitude, availability_status } = req.body;
  const validStatuses = ['AVAILABLE', 'BUSY', 'OFFLINE'];
  
  if (req.user.role !== 'petugas') {
    return res.status(403).json({ success: false, message: "Hanya petugas yang dapat update status." });
  }

  let updateFields = [];
  let updateValues = [];

  if (latitude !== undefined && longitude !== undefined) {
    updateFields.push("latitude = ?", "longitude = ?");
    updateValues.push(latitude, longitude);
  }

  if (availability_status && validStatuses.includes(availability_status)) {
    updateFields.push("availability_status = ?");
    updateValues.push(availability_status);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ success: false, message: "Tidak ada data yang diupdate" });
  }

  updateValues.push(req.user.id);
  const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

  db.query(sql, updateValues, (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: "Status dan lokasi berhasil diperbarui" });
  });
};

// ============================================================
// CHANGE PASSWORD (protected)
// ============================================================
exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "Password lama dan baru wajib diisi" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "Password baru minimal 6 karakter" });
  }

  db.query("SELECT password FROM users WHERE id = ?", [req.user.id], async (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.length === 0) return res.status(404).json({ success: false, message: "User tidak ditemukan" });

    const isMatch = await bcrypt.compare(oldPassword, result[0].password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Password lama salah" });

    const hashed = bcrypt.hashSync(newPassword, 10);
    db.query("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?", [hashed, req.user.id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      res.json({ success: true, message: "Password berhasil diubah" });
    });
  });
};

// ============================================================
// LOGOUT
// ============================================================
exports.logout = (req, res) => {
  return res.status(200).json({ success: true, message: "Logout berhasil. Hapus token di sisi client." });
};
