const db = require("../config/db");

// Ambil statistik dashboard
exports.getDashboardStats = (req, res) => {
    const pengepulId = req.user.id;

    const queries = {
        totalMasuk: `SELECT SUM(actual_weight) as total FROM pickups WHERE pengepul_id = ? AND status = 'completed'`,
        totalKeluar: `SELECT SUM(weight) as total FROM pengepul_sales WHERE pengepul_id = ? AND status = 'completed'`,
        totalTransaksi: `SELECT COUNT(*) as total FROM pengepul_sales WHERE pengepul_id = ?`,
        totalKeuntungan: `
            SELECT 
                (SELECT IFNULL(SUM(total_price), 0) FROM pengepul_sales WHERE pengepul_id = ? AND status = 'completed') 
                - 
                (SELECT IFNULL(SUM(w.amount), 0) FROM wallet_transactions w JOIN users u ON w.user_id = u.id WHERE w.type = 'credit' AND w.payment_method = 'saldo' AND u.role = 'user') 
            AS laba
            -- Catatan: Pengeluaran asli harusnya dari transaksi Pengepul membayar Petugas/User. 
            -- Query di atas adalah simplifikasi.
        `
    };

    // Eksekusi secara paralel atau satu per satu
    db.query(queries.totalMasuk, [pengepulId], (err, resMasuk) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query(queries.totalKeluar, [pengepulId], (err, resKeluar) => {
            if (err) return res.status(500).json({ error: err.message });

            db.query(queries.totalTransaksi, [pengepulId], (err, resTransaksi) => {
                if (err) return res.status(500).json({ error: err.message });

                // Dummy keuntungan for now
                const totalMasuk = resMasuk[0].total || 0;
                const totalKeluar = resKeluar[0].total || 0;
                const totalTransaksi = resTransaksi[0].total || 0;
                const totalKeuntungan = totalKeluar * 1500; // Asumsi laba Rp1.500 per Kg penjualan

                res.json({
                    totalMasuk,
                    totalKeluar,
                    totalTransaksi,
                    totalKeuntungan
                });
            });
        });
    });
};

// Ambil statistik grafik bulanan
exports.getMonthlyStats = (req, res) => {
    const pengepulId = req.user.id;

    // Untuk simpelnya, kita buat query untuk mendapatkan penjualan dan pembelian 6 bulan terakhir.
    // Karena ini MySQL, kita bisa menggunakan MONTH() dan YEAR() atau dummy stat yang di-generate dari DB.
    // Query ini mengambil total berat masuk & keluar per bulan untuk tahun ini.
    const queryMasuk = `
        SELECT MONTH(created_at) as month, SUM(actual_weight) as total
        FROM pickups
        WHERE pengepul_id = ? AND status = 'completed' AND YEAR(created_at) = YEAR(CURDATE())
        GROUP BY MONTH(created_at)
    `;
    const queryKeluar = `
        SELECT MONTH(created_at) as month, SUM(weight) as total, SUM(total_price) as total_price
        FROM pengepul_sales
        WHERE pengepul_id = ? AND status = 'completed' AND YEAR(created_at) = YEAR(CURDATE())
        GROUP BY MONTH(created_at)
    `;

    db.query(queryMasuk, [pengepulId], (err, resMasuk) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query(queryKeluar, [pengepulId], (err, resKeluar) => {
            if (err) return res.status(500).json({ error: err.message });

            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
            const monthlyData = [];
            const profitData = [];

            // Buat array untuk 6 bulan terakhir
            const currentMonth = new Date().getMonth();
            for (let i = 5; i >= 0; i--) {
                let mIndex = currentMonth - i;
                let yearOffset = 0;
                if (mIndex < 0) {
                    mIndex += 12;
                    yearOffset = -1;
                }
                
                // Cari data masuk
                const mMasuk = resMasuk.find(r => r.month === mIndex + 1);
                const mKeluar = resKeluar.find(r => r.month === mIndex + 1);

                const masukVal = mMasuk ? parseFloat(mMasuk.total) : 0;
                const keluarVal = mKeluar ? parseFloat(mKeluar.total) : 0;
                const keluarPrice = mKeluar ? parseFloat(mKeluar.total_price) : 0;
                
                // Asumsi modal rata-rata 1500/kg
                const laba = keluarPrice > 0 ? (keluarPrice - (keluarVal * 1500)) : (keluarVal * 1500); 

                monthlyData.push({
                    name: months[mIndex],
                    Masuk: masukVal,
                    Keluar: keluarVal
                });

                profitData.push({
                    name: months[mIndex],
                    Laba: laba
                });
            }

            res.json({
                monthlyData,
                profitData
            });
        });
    });
};

// Ambil sampah masuk dari petugas (status: completed / sudah ditimbang oleh petugas)
exports.getIncomingWaste = (req, res) => {
    const pengepulId = req.user.id;
    // Cari pickup yang sudah di-complete oleh petugas, atau yang sudah diterima pengepul
    const query = `
        SELECT p.*, u.name as nama_warga, pt.name as nama_petugas 
        FROM pickups p 
        LEFT JOIN users u ON p.user_id = u.id 
        LEFT JOIN users pt ON p.petugas_id = pt.id
        WHERE p.status IN ('weighing', 'completed', 'rejected_by_pengepul')
        ORDER BY p.created_at DESC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Terima atau tolak kiriman petugas
exports.updateWasteStatus = (req, res) => {
    const { id } = req.params;
    const { status, pengepul_id } = req.body; // status: 'received_by_pengepul' atau 'rejected_by_pengepul'
    
    // Pastikan pengepul_id adalah milik yg login
    const currentPengepul = req.user.id;

    const query = `UPDATE pickups SET status = ?, pengepul_id = ? WHERE id = ?`;
    db.query(query, [status, currentPengepul, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        if (status === 'received_by_pengepul') {
            // Tambahkan ke inventori
            db.query(`SELECT waste_type, actual_weight FROM pickups WHERE id = ?`, [id], (err, rows) => {
                if (rows.length > 0) {
                    const { waste_type, actual_weight } = rows[0];
                    const weight = parseFloat(actual_weight) || 0;
                    
                    const invQuery = `
                        INSERT INTO pengepul_inventory (pengepul_id, waste_type, weight) 
                        VALUES (?, ?, ?) 
                        ON DUPLICATE KEY UPDATE weight = weight + VALUES(weight)
                    `;
                    db.query(invQuery, [currentPengepul, waste_type, weight], (err) => {
                        if (err) console.error("Gagal update inventori", err);
                    });
                }
            });
        }
        res.json({ message: "Status sampah diperbarui" });
    });
};

// Ambil stok inventori
exports.getInventory = (req, res) => {
    const pengepulId = req.user.id;
    const query = `SELECT * FROM pengepul_inventory WHERE pengepul_id = ?`;
    db.query(query, [pengepulId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Koreksi stok inventori
exports.updateInventory = (req, res) => {
    const pengepulId = req.user.id;
    const { waste_type, weight } = req.body;
    const query = `
        INSERT INTO pengepul_inventory (pengepul_id, waste_type, weight) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE weight = ?
    `;
    db.query(query, [pengepulId, waste_type, weight, weight], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Inventori berhasil diperbarui" });
    });
};

// Ambil performa petugas
exports.getPetugasPerformance = (req, res) => {
    const pengepulId = req.user.id;
    const query = `
        SELECT 
            u.id, 
            u.name, 
            COUNT(p.id) as total_kiriman, 
            SUM(p.actual_weight) as total_berat
        FROM users u
        LEFT JOIN pickups p ON u.id = p.petugas_id AND p.status = 'completed'
        WHERE u.role = 'petugas' AND u.pengepul_id = ?
        GROUP BY u.id
        ORDER BY total_berat DESC
    `;
    db.query(query, [pengepulId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// === Penjualan ke Pabrik ===

exports.createFactorySale = (req, res) => {
    const pengepulId = req.user.id;
    const { waste_type, weight, price_per_kg } = req.body;
    const total_price = weight * price_per_kg;

    // Kurangi stok di inventori
    const invQuery = `UPDATE pengepul_inventory SET weight = weight - ? WHERE pengepul_id = ? AND waste_type = ? AND weight >= ?`;
    
    db.query(invQuery, [weight, pengepulId, waste_type, weight], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(400).json({ message: "Stok tidak mencukupi atau barang tidak ditemukan" });
        }

        const saleQuery = `INSERT INTO pengepul_sales (pengepul_id, waste_type, weight, price_per_kg, total_price, status) VALUES (?, ?, ?, ?, ?, 'completed')`;
        db.query(saleQuery, [pengepulId, waste_type, weight, price_per_kg, total_price], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Penjualan ke pabrik berhasil dibuat" });
        });
    });
};

exports.getFactorySales = (req, res) => {
    const pengepulId = req.user.id;
    db.query(`SELECT * FROM pengepul_sales WHERE pengepul_id = ? ORDER BY created_at DESC`, [pengepulId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// === Keuangan & Akun ===

exports.getKeuangan = (req, res) => {
    const pengepulId = req.user.id;

    const queryPembelian = `
        SELECT IFNULL(SUM(actual_weight * 1500), 0) as total_pembelian 
        FROM pickups 
        WHERE pengepul_id = ? AND status = 'completed'
    `;

    const queryPenjualan = `
        SELECT IFNULL(SUM(total_price), 0) as total_penjualan 
        FROM pengepul_sales 
        WHERE pengepul_id = ? AND status = 'completed'
    `;

    const queryAnalisis = `
        SELECT 
            p.waste_type as jenis,
            IFNULL(SUM(p.actual_weight), 0) as masuk,
            (SELECT IFNULL(AVG(s.price_per_kg), 0) FROM pengepul_sales s WHERE s.pengepul_id = p.pengepul_id AND s.waste_type = p.waste_type AND s.status = 'completed') as jual
        FROM pickups p
        WHERE p.pengepul_id = ? AND p.status = 'completed'
        GROUP BY p.waste_type
    `;

    db.query(queryPembelian, [pengepulId], (err, resPembelian) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query(queryPenjualan, [pengepulId], (err, resPenjualan) => {
            if (err) return res.status(500).json({ error: err.message });

            db.query(queryAnalisis, [pengepulId], (err, resAnalisis) => {
                if (err) return res.status(500).json({ error: err.message });

                const totalPembelian = parseFloat(resPembelian[0].total_pembelian);
                const totalPenjualan = parseFloat(resPenjualan[0].total_penjualan);
                const totalPengeluaran = totalPembelian * 0.1;
                const totalLaba = totalPenjualan - totalPembelian - totalPengeluaran;

                const analisisKeuntungan = resAnalisis.map(a => ({
                    jenis: a.jenis,
                    masuk: parseFloat(a.masuk),
                    beli: 1500, // Harga beli flat (dummy)
                    jual: parseFloat(a.jual) || 2000, // Default jika blm ada jual
                    emoji: a.jenis === 'Besi' ? '🔩' : a.jenis === 'Kardus' ? '📦' : a.jenis === 'Plastik PET' ? '🍾' : '♻️'
                }));

                res.json({
                    totalPembelian,
                    totalPenjualan,
                    totalLaba,
                    totalPengeluaran,
                    analisisKeuntungan
                });
            });
        });
    });
};

exports.updateProfile = (req, res) => {
    const userId = req.user.id;
    const { name, company_name, phone, address } = req.body;

    const query = `
        UPDATE users 
        SET name = ?, company_name = ?, phone = ?, address = ? 
        WHERE id = ? AND role = 'pengepul'
    `;

    db.query(query, [name, company_name, phone, address, userId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Profil berhasil diperbarui" });
    });
};

const bcrypt = require("bcryptjs");

exports.changePassword = (req, res) => {
    const userId = req.user.id;
    const { old_password, new_password } = req.body;

    // Cek password lama
    db.query(`SELECT password FROM users WHERE id = ?`, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ message: "User tidak ditemukan" });

        const user = results[0];
        bcrypt.compare(old_password, user.password, (err, isMatch) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!isMatch) return res.status(400).json({ message: "Password lama salah" });

            // Hash password baru
            bcrypt.hash(new_password, 10, (err, hash) => {
                if (err) return res.status(500).json({ error: err.message });

                // Update password
                db.query(`UPDATE users SET password = ? WHERE id = ?`, [hash, userId], (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: "Password berhasil diubah" });
                });
            });
        });
    });
};

// Ambil daftar Petugas (untuk chat 1-on-1)
exports.getPetugasList = (req, res) => {
    const pengepulId = req.user.id;
    // Ambil semua user dengan role petugas yang milik pengepul ini
    const sql = `SELECT id, name, email, role FROM users WHERE role = 'petugas' AND pengepul_id = ?`;
    db.query(sql, [pengepulId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};
