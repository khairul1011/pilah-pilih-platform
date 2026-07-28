const db = require("../config/db");

// Helper function to log status change
const logStatusChange = (pickupId, status, changedBy) => {
    db.query(
        "INSERT INTO pickup_status_logs (pickup_id, status, changed_by) VALUES (?, ?, ?)",
        [pickupId, status, changedBy]
    );
    // Emit socket event if io is available
    if (global.io) {
        global.io.emit("pickup_status_changed", { pickupId, status });
    }
};

exports.runMigration = async (req, res) => {
    try {
        const queries = [
            "ALTER TABLE users ADD COLUMN pengepul_id INT DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN latitude DECIMAL(10,8) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN longitude DECIMAL(11,8) DEFAULT NULL",
            "ALTER TABLE users ADD COLUMN availability_status ENUM('AVAILABLE', 'BUSY', 'OFFLINE') DEFAULT 'OFFLINE'",
            "ALTER TABLE users ADD COLUMN service_radius DECIMAL(10,2) DEFAULT 15.00",
            "ALTER TABLE users ADD FOREIGN KEY (pengepul_id) REFERENCES users(id) ON DELETE SET NULL",
            "ALTER TABLE pickups ADD COLUMN pickup_fee DECIMAL(15,2) DEFAULT 0.00",
            "ALTER TABLE pickups ADD COLUMN latitude DECIMAL(10,8) DEFAULT NULL",
            "ALTER TABLE pickups ADD COLUMN longitude DECIMAL(11,8) DEFAULT NULL",
            "ALTER TABLE pickups ADD COLUMN distance_km DECIMAL(10,2) DEFAULT NULL",
            "ALTER TABLE pickups ADD COLUMN accepted_at TIMESTAMP NULL DEFAULT NULL",
            "ALTER TABLE pickups ADD COLUMN finished_at TIMESTAMP NULL DEFAULT NULL",
            "ALTER TABLE waste_prices CHANGE COLUMN price_per_kg price_user_per_kg DECIMAL(10,2) NOT NULL",
            "ALTER TABLE waste_prices ADD COLUMN price_pengepul_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0.00",
            "UPDATE waste_prices SET price_pengepul_per_kg = price_user_per_kg + 500",
            "UPDATE users SET latitude = 0.5333, longitude = 101.4500, service_radius = 50.00 WHERE role = 'petugas'",
            // Migration baru: audit trail cash
            "ALTER TABLE pickups ADD COLUMN deposit_status ENUM('pending','confirmed') DEFAULT NULL",
            "ALTER TABLE pickups ADD COLUMN deposit_confirmed_at TIMESTAMP NULL DEFAULT NULL",
            "ALTER TABLE wallet_transactions ADD COLUMN payment_method ENUM('saldo','cash') NOT NULL DEFAULT 'saldo'"
        ];

        for (let q of queries) {
            await db.promise().query(q).catch(e => console.log("Migration warning:", e.message));
        }

        res.json({ success: true, message: "Migration completed successfully on server!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ============================================================
// USER — Estimasi Biaya Penjemputan
// ============================================================
exports.estimateFee = (req, res) => {
    const { latitude, longitude, waste_type, estimated_weight } = req.body;

    if (!latitude || !longitude) {
        return res.status(400).json({ success: false, message: "Lokasi GPS wajib diaktifkan." });
    }

    db.query("SELECT price_user_per_kg FROM waste_prices WHERE waste_type = ?", [waste_type], (errPrice, priceRes) => {
        if(errPrice) return res.status(500).json({ success: false, message: errPrice.message });
        const price_user = priceRes.length > 0 ? priceRes[0].price_user_per_kg : 0;
        const total_price_est = price_user * (estimated_weight || 0);

        const haversineSql = `
            SELECT id, service_radius,
            ( 6371 * acos( greatest(-1.0, least(1.0, cos( radians(?) ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians(?) ) + sin( radians(?) ) * sin( radians( latitude ) ) )) ) ) AS distance
            FROM users
            WHERE role = 'petugas' AND availability_status = 'AVAILABLE' AND latitude IS NOT NULL AND longitude IS NOT NULL
            HAVING distance <= IFNULL(service_radius, 15)
            ORDER BY distance ASC
            LIMIT 1
        `;

        db.query(haversineSql, [latitude, longitude, latitude], (err, petugasRes) => {
            if(err) {
                console.error("Haversine error:", err.message);
                return res.status(500).json({ success: false, message: "Terjadi kesalahan pada server saat mencari petugas terdekat." });
            }
            
            if (petugasRes.length === 0) {
                return db.query("SELECT COUNT(id) as count FROM users WHERE role = 'petugas' AND availability_status = 'AVAILABLE'", (errCheck, checkRes) => {
                    if (checkRes && checkRes[0].count > 0) {
                        return res.status(400).json({ success: false, message: "Lokasi di luar jangkauan layanan petugas terdekat." });
                    } else {
                        return res.status(404).json({ success: false, message: "Belum ada petugas yang tersedia saat ini." });
                    }
                });
            }

            const nearestPetugas = petugasRes[0];
            const distance_km = nearestPetugas.distance;
            
            let pickup_fee = Math.round(distance_km * 1500);

            res.json({ success: true, distance_km, pickup_fee, nearestPetugasId: nearestPetugas.id });
        });
    });
};

// ============================================================
// USER — Buat Permintaan Penjemputan
// ============================================================
exports.createPickup = (req, res) => {
    const { address, waste_type, estimated_weight, pickup_date, notes, latitude, longitude } = req.body;
    const user_id = req.user.id;

    if (!latitude || !longitude) {
        return res.status(400).json({ success: false, message: "Lokasi GPS wajib diaktifkan." });
    }

    db.query("SELECT price_user_per_kg FROM waste_prices WHERE waste_type = ?", [waste_type], (errPrice, priceRes) => {
        if(errPrice) return res.status(500).json({ success: false, message: errPrice.message });
        const price_user = priceRes.length > 0 ? priceRes[0].price_user_per_kg : 0;
        const total_price_est = price_user * (estimated_weight || 0);

        const haversineSql = `
            SELECT id, pengepul_id, service_radius,
            ( 6371 * acos( greatest(-1.0, least(1.0, cos( radians(?) ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians(?) ) + sin( radians(?) ) * sin( radians( latitude ) ) )) ) ) AS distance
            FROM users
            WHERE role = 'petugas'
            AND availability_status = 'AVAILABLE'
            AND latitude IS NOT NULL AND longitude IS NOT NULL
            HAVING distance <= IFNULL(service_radius, 15)
            ORDER BY distance ASC
            LIMIT 1
        `;

        db.query(haversineSql, [latitude, longitude, latitude], (err, petugasRes) => {
            if(err) {
                console.error("Haversine error:", err.message);
                return res.status(500).json({ success: false, message: "Terjadi kesalahan pada server saat mencari petugas terdekat." });
            }
            
            if (petugasRes.length === 0) {
                return db.query("SELECT COUNT(id) as count FROM users WHERE role = 'petugas' AND availability_status = 'AVAILABLE'", (errCheck, checkRes) => {
                    if (checkRes && checkRes[0].count > 0) {
                        return res.status(400).json({ success: false, message: "Lokasi di luar jangkauan layanan petugas terdekat." });
                    } else {
                        return res.status(404).json({ success: false, message: "Tidak ada petugas yang sedang online di wilayah Anda saat ini. Silakan coba lagi nanti." });
                    }
                });
            }

            const nearestPetugas = petugasRes[0];
            const distance_km = nearestPetugas.distance;
            
            let pickup_fee = Math.round(distance_km * 1500);

            const insertSql = `
                INSERT INTO pickups
                (user_id, petugas_id, pengepul_id, address, waste_type, estimated_weight, pickup_date, notes, latitude, longitude, distance_km, pickup_fee)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.query(insertSql, [user_id, nearestPetugas.id, nearestPetugas.pengepul_id, address, waste_type, estimated_weight, pickup_date, notes, latitude, longitude, distance_km, pickup_fee], (errInsert, result) => {
                if(errInsert) return res.status(500).json({ success: false, message: errInsert.message });
                
                const pickupId = result.insertId;
                
                logStatusChange(pickupId, 'pending', user_id);
                
                res.status(201).json({ success: true, message: "Permintaan penjemputan berhasil dibuat", pickup_id: pickupId, distance_km, pickup_fee });
            });
        });
    });
};

// ============================================================
// USER — Lihat Riwayat Pickup Sendiri
// ============================================================
exports.getMyPickups = (req, res) => {
    const user_id = req.user.id;
    db.query("SELECT * FROM pickups WHERE user_id = ? ORDER BY id DESC", [user_id], (err, result) => {
        if(err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: result });
    });
};

// ============================================================
// UNIVERSAL — Lihat Detail Pickup
// ============================================================
exports.getPickupById = (req, res) => {
    const { id } = req.params;
    db.query("SELECT * FROM pickups WHERE id = ?", [id], (err, results) => {
        if(err) return res.status(500).json({ success: false, message: err.message });
        if(results.length === 0) return res.status(404).json({ success: false, message: "Pickup tidak ditemukan" });
        
        // Fetch photos and items if any
        db.query("SELECT * FROM pickup_photos WHERE pickup_id = ?", [id], (err2, photos) => {
            db.query("SELECT * FROM pickup_items WHERE pickup_id = ?", [id], (err3, items) => {
                const data = results[0];
                data.photos = photos || [];
                data.items = items || [];
                res.json({ success: true, data });
            });
        });
    });
};

// ============================================================
// PETUGAS — Lihat Semua Order Masuk (Pending)
// ============================================================
exports.getPendingPickups = (req, res) => {
    const petugas_id = req.user.id;
    db.query("SELECT * FROM pickups WHERE status = 'pending' AND petugas_id = ? ORDER BY id ASC", [petugas_id], (err, result) => {
        if(err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: result });
    });
};

// ============================================================
// PETUGAS — Lihat Order Aktif Sendiri
// ============================================================
exports.getMyActivePickups = (req, res) => {
    const petugas_id = req.user.id;
    db.query(
        "SELECT * FROM pickups WHERE petugas_id = ? AND status IN ('accepted', 'on_the_way', 'arrived', 'collected') ORDER BY id DESC",
        [petugas_id],
        (err, result) => {
            if(err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: result });
        }
    );
};

// ============================================================
// PETUGAS — Lihat Semua Order (Pending + Milik Sendiri)
// ============================================================
exports.getAllMyPickups = (req, res) => {
    const petugas_id = req.user.id;
    db.query(
        "SELECT * FROM pickups WHERE petugas_id = ? ORDER BY id DESC",
        [petugas_id],
        (err, result) => {
            if(err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: result });
        }
    );
};

// ============================================================
// PETUGAS — Update Status (Terima, Mulai Perjalanan, Tiba, Antar)
// ============================================================
exports.updateStatus = (req, res) => {
    const pickupId = req.params.id;
    const { status, cancel_reason, pengepul_id } = req.body;
    const user_id = req.user.id;

    let sql = "UPDATE pickups SET status = ?";
    let params = [status];

    if (status === 'accepted') {
        sql += ", petugas_id = ?, accepted_at = CURRENT_TIMESTAMP";
        params.push(user_id);
    }
    
    if (status === 'waiting_collector') {
        if (!pengepul_id) return res.status(400).json({ success: false, message: "Pengepul tujuan wajib diisi" });
        sql += ", pengepul_id = ?";
        params.push(pengepul_id);
    }

    if (status === 'cancelled' && cancel_reason) {
        sql += ", cancel_reason = ?";
        params.push(cancel_reason);
    }

    sql += " WHERE id = ?";
    params.push(pickupId);

    db.query(sql, params, (err) => {
        if(err) {
            console.error("DB Error in updateStatus:", err);
            return res.status(500).json({ success: false, message: err.message });
        }

        // Jika dibatalkan, reset status petugas ke AVAILABLE jika ada
        if (status === 'cancelled') {
            db.query("SELECT petugas_id FROM pickups WHERE id = ?", [pickupId], (errSel, results) => {
                if (!errSel && results.length > 0 && results[0].petugas_id) {
                    db.query("UPDATE users SET availability_status = 'AVAILABLE' WHERE id = ?", [results[0].petugas_id]);
                }
            });
        }

        logStatusChange(pickupId, status, user_id);
        res.json({ success: true, message: `Status order berhasil diupdate ke ${status}` });
    });
};

// ============================================================
// PETUGAS / PENGEPUL — Upload Foto Bukti
// ============================================================
exports.uploadPhoto = (req, res) => {
    const pickupId = req.params.id;
    const { photo_type } = req.body; // 'pickup_proof' atau 'weighing_proof'
    const user_id = req.user.id;

    if (!req.file) return res.status(400).json({ success: false, message: "File gambar wajib diunggah" });
    if (!photo_type) return res.status(400).json({ success: false, message: "Tipe foto wajib diisi" });

    const file_path = "/uploads/pickups/" + req.file.filename;

    db.query(
        "INSERT INTO pickup_photos (pickup_id, uploaded_by, photo_type, file_path) VALUES (?, ?, ?, ?)",
        [pickupId, user_id, photo_type, file_path],
        (err) => {
            if(err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: "Foto berhasil diunggah", file_path });
        }
    );
};

// ============================================================
// PENGEPUL — Lihat Order Menunggu
// ============================================================
exports.getWaitingPickups = (req, res) => {
    const pengepul_id = req.user.id;
    const q = `
        SELECT p.*, 
               u.name as user_name, 
               pt.name as petugas_name 
        FROM pickups p 
        LEFT JOIN users u ON p.user_id = u.id 
        LEFT JOIN users pt ON p.petugas_id = pt.id 
        WHERE p.pengepul_id = ? 
          AND p.status IN ('waiting_collector', 'weighing', 'completed') 
        ORDER BY p.id DESC
    `;
    db.query(q, [pengepul_id], (err, result) => {
        if(err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: result });
    });
};

// ============================================================
// PENGEPUL — Input Penimbangan & Hitung Harga
// ============================================================
exports.weighItems = (req, res) => {
    const pickupId = req.params.id;
    const { items } = req.body; // array of { waste_type, weight }
    const user_id = req.user.id;

    // Bersihkan items lama jika ada
    db.query("DELETE FROM pickup_items WHERE pickup_id = ?", [pickupId], (err) => {
        if(err) return res.status(500).json({ success: false, message: err.message });

        db.query("SELECT * FROM waste_prices", (errPrices, prices) => {
            if(errPrices) return res.status(500).json({ success: false, message: errPrices.message });
            
            let totalOrderPrice = 0;
            const insertPromises = items.map(item => {
                return new Promise((resolve, reject) => {
                    const priceRow = prices.find(p => p.waste_type === item.waste_type);
                    const price_per_kg = priceRow ? priceRow.price_user_per_kg : 0;
                    const total_price = price_per_kg * item.weight;
                    totalOrderPrice += total_price;

                    db.query(
                        "INSERT INTO pickup_items (pickup_id, waste_type, weight, price_per_kg, total_price) VALUES (?, ?, ?, ?, ?)",
                        [pickupId, item.waste_type, item.weight, price_per_kg, total_price],
                        (errInsert) => {
                            if (errInsert) reject(errInsert);
                            else resolve();
                        }
                    );
                });
            });

            Promise.all(insertPromises).then(() => {
                db.query("UPDATE pickups SET total_price = ?, status = 'weighing' WHERE id = ?", [totalOrderPrice, pickupId], (errUpd) => {
                    if(errUpd) return res.status(500).json({ success: false, message: errUpd.message });
                    logStatusChange(pickupId, 'weighing', user_id);
                    res.json({ success: true, message: "Data timbangan berhasil disimpan", totalOrderPrice });
                });
            }).catch(e => {
                res.status(500).json({ success: false, message: e.message });
            });
        });
    });
};

// ============================================================
// PENGEPUL — Konfirmasi Transaksi & Selesaikan
// ============================================================
exports.confirmAndComplete = async (req, res) => {
    const pickupId = req.params.id;
    const action_user_id = req.user.id;
    const { payment_method } = req.body; // 'cash' atau 'saldo'

    // Validasi payment_method di awal
    if (!['saldo', 'cash'].includes(payment_method)) {
        return res.status(400).json({ success: false, message: `Metode pembayaran tidak valid: '${payment_method}'. Gunakan 'saldo' atau 'cash'.` });
    }

    try {
        const [results] = await db.promise().query("SELECT * FROM pickups WHERE id = ?", [pickupId]);
        if (results.length === 0) return res.status(404).json({ success: false, message: "Order tidak ditemukan" });

        const pickup = results[0];
        if (pickup.status !== 'weighing') return res.status(400).json({ success: false, message: "Order belum ditimbang!" });

        const finalAmount = Math.max(0, pickup.total_price - pickup.pickup_fee);

        // Gunakan 1 koneksi eksklusif untuk seluruh transaksi DB
        const conn = await db.promise().getConnection();
        
        try {
            await conn.beginTransaction();

            // 1. Update status utama ke completed (Sekarang DI DALAM transaction!)
            await conn.query(
                "UPDATE pickups SET status = 'completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?", 
                [pickupId]
            );

            // 2. Reset petugas availability (opsional tapi aman dalam transaction)
            if (pickup.petugas_id) {
                await conn.query("UPDATE users SET availability_status = 'AVAILABLE' WHERE id = ?", [pickup.petugas_id]);
            }

            // 3. Eksekusi alur pembayaran
            if (payment_method === 'saldo') {
                // ── SALDO ──
                if (finalAmount > 0) {
                    const [walRes] = await conn.query("SELECT id FROM wallets WHERE user_id = ? FOR UPDATE", [pickup.user_id]);
                    if (walRes.length === 0) {
                        await conn.query("INSERT INTO wallets (user_id, balance) VALUES (?, ?)", [pickup.user_id, finalAmount]);
                    } else {
                        await conn.query("UPDATE wallets SET balance = balance + ? WHERE user_id = ?", [finalAmount, pickup.user_id]);
                    }
                    await conn.query(
                        "INSERT INTO wallet_transactions (user_id, amount, type, description, payment_method) VALUES (?, ?, 'credit', ?, 'saldo')",
                        [pickup.user_id, finalAmount, `Penjualan sampah (Order #${pickupId})`]
                    );
                }
                
                if (pickup.petugas_id && pickup.pickup_fee > 0) {
                    const [walRes2] = await conn.query("SELECT id FROM wallets WHERE user_id = ? FOR UPDATE", [pickup.petugas_id]);
                    if (walRes2.length === 0) {
                        await conn.query("INSERT INTO wallets (user_id, balance) VALUES (?, ?)", [pickup.petugas_id, pickup.pickup_fee]);
                    } else {
                        await conn.query("UPDATE wallets SET balance = balance + ? WHERE user_id = ?", [pickup.pickup_fee, pickup.petugas_id]);
                    }
                    await conn.query(
                        "INSERT INTO wallet_transactions (user_id, amount, type, description, payment_method) VALUES (?, ?, 'credit', ?, 'saldo')",
                        [pickup.petugas_id, pickup.pickup_fee, `Pendapatan argo penjemputan (Order #${pickupId})`]
                    );
                }
            } else if (payment_method === 'cash') {
                // ── CASH ──
                await conn.query(
                    "INSERT INTO petugas_earnings (petugas_id, pickup_id, amount) VALUES (?,?,?)",
                    [pickup.petugas_id, pickupId, pickup.pickup_fee]
                );
                await conn.query(
                    "INSERT INTO wallet_transactions (user_id, amount, type, description, payment_method) VALUES (?,?,'credit',?,'cash')",
                    [pickup.petugas_id, pickup.pickup_fee, `Pendapatan argo cash (Order #${pickupId})`]
                );
                await conn.query(
                    "INSERT INTO wallet_transactions (user_id, amount, type, description, payment_method) VALUES (?,?,'credit',?,'cash')",
                    [pickup.user_id, finalAmount, `Penjualan sampah tunai (Order #${pickupId})`]
                );
                await conn.query(
                    "UPDATE pickups SET deposit_status='pending' WHERE id=?",
                    [pickupId]
                );
            }

            // Commit transaction jika semuanya sukses
            await conn.commit();
            conn.release();

            // Selesai DB transaction, jalankan helper log (fire-and-forget)
            logStatusChange(pickupId, 'completed', action_user_id);

            const msg = payment_method === 'saldo' 
                ? 'Transaksi dikonfirmasi. Saldo dompet diperbarui.' 
                : 'Transaksi cash dicatat. Mohon konfirmasi setoran ke Pengepul.';
            return res.json({ success: true, message: msg });

        } catch (trxErr) {
            // Jika ada satu query saja yg gagal, rollback semuanya termasuk status pickup
            await conn.rollback();
            conn.release();
            throw trxErr; 
        }

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mencatat transaksi: ' + err.message });
    }
};

// ============================================================
// PENGEPUL — Konfirmasi Terima Setoran Cash dari Petugas
// ============================================================
exports.confirmDeposit = (req, res) => {
    const pickupId = req.params.id;
    const pengepulId = req.user.id; // Dari token, bukan body

    // WHERE pengepul_id = ? : cegah Pengepul A konfirmasi milik Pengepul B
    // WHERE deposit_status = 'pending' : guard idempotency di level DB
    //   → jika tombol diklik dua kali, MySQL row lock memastikan hanya satu UPDATE yang berhasil
    //   → affectedRows === 0 pada request kedua → return error, tidak ada efek ganda
    db.query(
        `UPDATE pickups
         SET deposit_status = 'confirmed', deposit_confirmed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND pengepul_id = ? AND status = 'completed' AND deposit_status = 'pending'`,
        [pickupId, pengepulId],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            if (result.affectedRows === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Konfirmasi tidak valid: order bukan milik Anda, sudah dikonfirmasi, atau status tidak sesuai.'
                });
            }
            res.json({ success: true, message: 'Setoran berhasil dikonfirmasi.' });
        }
    );
};

// ============================================================
// PETUGAS — Ambil Daftar Kontak Chat
// ============================================================
exports.getPetugasContacts = (req, res) => {
    const petugasId = req.user.id;
    db.query("SELECT id, name, email, phone, role FROM users WHERE role = 'pengepul'", (err, pengepul) => {
        if(err) return res.status(500).json({ success: false, message: err.message });
        const sqlUsers = `
            SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role
            FROM pickups p
            JOIN users u ON p.user_id = u.id
            WHERE p.petugas_id = ? AND p.status IN ('accepted', 'on_the_way', 'arrived', 'collected')
        `;
        db.query(sqlUsers, [petugasId], (err, users) => {
            if(err) return res.status(500).json({ success: false, message: err.message });
            const contacts = [...pengepul, ...users];
            const uniqueContacts = Array.from(new Map(contacts.map(c => [c.id, c])).values());
            res.json({ success: true, data: uniqueContacts });
        });
    });
};
