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
            "ALTER TABLE users ADD COLUMN service_radius DECIMAL(10,2) DEFAULT 5.00",
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
            "UPDATE users SET latitude = 0.5333, longitude = 101.4500, service_radius = 50.00 WHERE role = 'petugas'"
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
            SELECT id, 
            ( 6371 * acos( greatest(-1.0, least(1.0, cos( radians(?) ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians(?) ) + sin( radians(?) ) * sin( radians( latitude ) ) )) ) ) AS distance
            FROM users
            WHERE role = 'petugas' AND latitude IS NOT NULL AND longitude IS NOT NULL
            ORDER BY distance ASC
            LIMIT 1
        `;

        db.query(haversineSql, [latitude, longitude, latitude], (err, petugasRes) => {
            if(err) {
                console.error("Haversine error:", err.message);
                // Fallback: ambil sembarang petugas jika query jarak gagal
                return db.query("SELECT id FROM users WHERE role = 'petugas' LIMIT 1", (err2, fallbackRes) => {
                    if (err2 || fallbackRes.length === 0) return res.status(404).json({ success: false, message: "Belum ada petugas yang tersedia saat ini." });
                    // Return 999 to easily debug that fallback was hit
                    const distance_km_fallback = 999.9;
                    const pickup_fee_fallback = Math.round(distance_km_fallback * 1500);
                    res.json({ success: true, distance_km: distance_km_fallback, pickup_fee: pickup_fee_fallback, nearestPetugasId: fallbackRes[0].id, debug_err: err.message });
                });
            }
            
            if (petugasRes.length === 0) {
                return res.status(404).json({ success: false, message: "Belum ada petugas yang tersedia di wilayah Anda saat ini." });
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

    // 1. Dapatkan harga_user_per_kg untuk menghitung estimasi biaya penjemputan
    db.query("SELECT price_user_per_kg FROM waste_prices WHERE waste_type = ?", [waste_type], (errPrice, priceRes) => {
        if(errPrice) return res.status(500).json({ success: false, message: errPrice.message });
        const price_user = priceRes.length > 0 ? priceRes[0].price_user_per_kg : 0;
        const total_price_est = price_user * (estimated_weight || 0);

        // 2. Cari Petugas terdekat yang AVAILABLE menggunakan Haversine Formula
        const haversineSql = `
            SELECT id, pengepul_id, service_radius,
            ( 6371 * acos( greatest(-1.0, least(1.0, cos( radians(?) ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians(?) ) + sin( radians(?) ) * sin( radians( latitude ) ) )) ) ) AS distance
            FROM users
            WHERE role = 'petugas'
            AND availability_status = 'AVAILABLE'
            ORDER BY distance ASC
            LIMIT 1
        `;

        db.query(haversineSql, [latitude, longitude, latitude], (err, petugasRes) => {
            if(err) {
                console.error("Haversine error:", err.message);
                // Fallback: ambil sembarang petugas jika gagal
                return db.query("SELECT id, pengepul_id FROM users WHERE role = 'petugas' AND availability_status = 'AVAILABLE' LIMIT 1", (err2, fallbackRes) => {
                    if (err2 || fallbackRes.length === 0) return res.status(404).json({ success: false, message: "Tidak ada petugas yang sedang online. Silakan coba beberapa saat lagi." });
                    
                    const nearestPetugas = fallbackRes[0];
                    const distance_km = 999.9;
                    const pickup_fee = Math.round(distance_km * 1500);
                    
                    const insertSql = `
                        INSERT INTO pickups
                        (user_id, petugas_id, pengepul_id, address, waste_type, estimated_weight, pickup_date, notes, latitude, longitude, distance_km, pickup_fee)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    db.query(insertSql, [user_id, nearestPetugas.id, nearestPetugas.pengepul_id, address, waste_type, estimated_weight, pickup_date, notes, latitude, longitude, distance_km, pickup_fee], (errInsert, result) => {
                        if(errInsert) return res.status(500).json({ success: false, message: errInsert.message });
                        
                        const pickupId = result.insertId;
                        // db.query("UPDATE users SET availability_status = 'BUSY' WHERE id = ?", [nearestPetugas.id]); // Dihapus agar bisa terima order gabungan
                        logStatusChange(pickupId, 'pending', user_id);
                        
                        res.status(201).json({ success: true, message: "Permintaan penjemputan berhasil dibuat (Fallback GPS)", pickup_id: pickupId, distance_km, pickup_fee });
                    });
                });
            }
            
            if (petugasRes.length === 0) {
                return res.status(404).json({ success: false, message: "Tidak ada petugas yang sedang online di wilayah Anda saat ini. Silakan coba lagi nanti." });
            }

            const nearestPetugas = petugasRes[0];
            const distance_km = nearestPetugas.distance;
            
            // Hitung Biaya Penjemputan: Rp 1.500 per kilometer
            let pickup_fee = Math.round(distance_km * 1500);

            // 3. Simpan Order (Petugas langsung di-assign, status = pending/accepted sesuai flow, kita set 'accepted' karena langsung dapat petugas, 
            // atau 'pending' dan petugas_id diisi. Kita ikuti 'pending' tapi isi petugas_id).
            const insertSql = `
                INSERT INTO pickups
                (user_id, petugas_id, pengepul_id, address, waste_type, estimated_weight, pickup_date, notes, latitude, longitude, distance_km, pickup_fee)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.query(insertSql, [user_id, nearestPetugas.id, nearestPetugas.pengepul_id, address, waste_type, estimated_weight, pickup_date, notes, latitude, longitude, distance_km, pickup_fee], (errInsert, result) => {
                if(errInsert) return res.status(500).json({ success: false, message: errInsert.message });
                
                const pickupId = result.insertId;
                
                // Ubah status Petugas menjadi BUSY (Dihapus agar bisa terima order gabungan)
                // db.query("UPDATE users SET availability_status = 'BUSY' WHERE id = ?", [nearestPetugas.id]);

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
exports.confirmAndComplete = (req, res) => {
    const pickupId = req.params.id;
    const action_user_id = req.user.id; // Bisa pengepul atau petugas
    const { payment_method } = req.body; // 'cash' atau 'saldo'

    db.query("SELECT * FROM pickups WHERE id = ?", [pickupId], (err, results) => {
        if(err) return res.status(500).json({ success: false, message: err.message });
        if(results.length === 0) return res.status(404).json({ success: false, message: "Order tidak ditemukan" });

        const pickup = results[0];
        if (pickup.status !== 'weighing') return res.status(400).json({ success: false, message: "Order belum ditimbang!" });

        // Update status ke completed dan isi finished_at
        db.query("UPDATE pickups SET status = 'completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?", [pickupId], (errUpd) => {
            if(errUpd) return res.status(500).json({ success: false, message: errUpd.message });

            // Reset petugas_id status to AVAILABLE
            if (pickup.petugas_id) {
                db.query("UPDATE users SET availability_status = 'AVAILABLE' WHERE id = ?", [pickup.petugas_id]);
            }

            // Wallet/Saldo transfer jika user memilih 'saldo'
            const finalAmount = Math.max(0, pickup.total_price - pickup.pickup_fee);
            if (payment_method === 'saldo' && finalAmount > 0) {
                // Pastikan wallet user ada
                db.query("SELECT id FROM wallets WHERE user_id = ?", [pickup.user_id], (errWal, walRes) => {
                    if (!errWal && walRes.length === 0) {
                        db.query("INSERT INTO wallets (user_id, balance) VALUES (?, ?)", [pickup.user_id, finalAmount]);
                    } else if (!errWal) {
                        db.query("UPDATE wallets SET balance = balance + ? WHERE user_id = ?", [finalAmount, pickup.user_id]);
                    }
                    
                    // Catat transaksi
                    db.query(
                        "INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES (?, ?, 'credit', ?)", 
                        [pickup.user_id, finalAmount, `Penjualan sampah (Order #${pickupId})`]
                    );
                });
            }

            logStatusChange(pickupId, 'completed', action_user_id);
            res.json({ success: true, message: `Transaksi dikonfirmasi menggunakan ${payment_method === 'saldo' ? 'Saldo Dompet' : 'Cash'}.` });
        });
    });
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
