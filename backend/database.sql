-- ============================================================
--  PILAH PILIH DATABASE
--  File    : database.sql
--  Deskripsi: Setup awal database dan tabel untuk aplikasi Pilah Pilih
-- ============================================================

-- Buat & gunakan database



-- ============================================================
-- Tabel: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100)   NOT NULL,
    email       VARCHAR(100)   NOT NULL UNIQUE,
    password    VARCHAR(255)   NOT NULL,
    phone       VARCHAR(20)    DEFAULT NULL,
    company_name VARCHAR(100)  DEFAULT NULL,
    address     TEXT           DEFAULT NULL,
    is_active   BOOLEAN        DEFAULT TRUE,
    is_verified BOOLEAN        DEFAULT FALSE,
    role        ENUM('user', 'petugas', 'pengepul', 'admin') DEFAULT 'user',
    pengepul_id INT            DEFAULT NULL,
    must_change_password BOOLEAN DEFAULT FALSE,
    latitude    DECIMAL(10,8)  DEFAULT NULL,
    longitude   DECIMAL(11,8)  DEFAULT NULL,
    availability_status ENUM('AVAILABLE', 'BUSY', 'OFFLINE') DEFAULT 'OFFLINE',
    service_radius DECIMAL(10,2) DEFAULT 15.00,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pengepul_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- Tabel: pickups
-- ============================================================
CREATE TABLE IF NOT EXISTS pickups (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL,
    petugas_id       INT DEFAULT NULL,
    pengepul_id      INT DEFAULT NULL,
    address          TEXT,
    waste_type       VARCHAR(100),
    estimated_weight DECIMAL(10,2),
    actual_weight    DECIMAL(10,2) DEFAULT NULL,
    pickup_date      DATE,
    notes            TEXT,
    status           ENUM(
                        'pending', 
                        'accepted', 
                        'on_the_way', 
                        'arrived', 
                        'collected', 
                        'waiting_collector', 
                        'received_by_collector', 
                        'weighing', 
                        'confirmed', 
                        'completed', 
                        'cancelled'
                     ) DEFAULT 'pending',
    cancel_reason    TEXT,
    total_price      DECIMAL(15,2) DEFAULT 0.00,
    pickup_fee       DECIMAL(15,2) DEFAULT 0.00,
    latitude         DECIMAL(10,8) DEFAULT NULL,
    longitude        DECIMAL(11,8) DEFAULT NULL,
    distance_km      DECIMAL(10,2) DEFAULT NULL,
    accepted_at      TIMESTAMP NULL DEFAULT NULL,
    finished_at      TIMESTAMP NULL DEFAULT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (petugas_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (pengepul_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- Tabel: pickup_items (Untuk penimbangan multi-jenis sampah)
-- ============================================================
CREATE TABLE IF NOT EXISTS pickup_items (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    pickup_id     INT NOT NULL,
    waste_type    VARCHAR(100) NOT NULL,
    weight        DECIMAL(10,2) NOT NULL,
    price_per_kg  DECIMAL(10,2) NOT NULL,
    total_price   DECIMAL(15,2) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- Table: tickets (Pusat Bantuan)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
    id VARCHAR(20) PRIMARY KEY,
    user_id INT,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('open', 'replied', 'closed') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- Table: ticket_replies
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_replies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(20),
    sender_role ENUM('user', 'admin') DEFAULT 'admin',
    reply TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- ============================================================
-- Tabel: pickup_photos
-- ============================================================
CREATE TABLE IF NOT EXISTS pickup_photos (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    pickup_id     INT NOT NULL,
    uploaded_by   INT NOT NULL,
    photo_type    ENUM('pickup_proof', 'weighing_proof') NOT NULL,
    file_path     VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Tabel: pickup_status_logs (Audit log pergerakan order)
-- ============================================================
CREATE TABLE IF NOT EXISTS pickup_status_logs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    pickup_id     INT NOT NULL,
    status        VARCHAR(50) NOT NULL,
    changed_by    INT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- Tabel: wallets
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    balance     DECIMAL(15,2) DEFAULT 0.00,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Tabel: wallet_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    amount      DECIMAL(15,2) NOT NULL,
    type        ENUM('credit', 'debit') NOT NULL,
    description TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Tabel: petugas_earnings
-- ============================================================
CREATE TABLE IF NOT EXISTS petugas_earnings (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    petugas_id    INT NOT NULL,
    pickup_id     INT NOT NULL,
    amount        DECIMAL(15,2) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (petugas_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (pickup_id) REFERENCES pickups(id) ON DELETE CASCADE
);

-- ============================================================
-- Tabel: withdrawals
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawals (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    amount          DECIMAL(15,2) NOT NULL,
    bank_name       VARCHAR(50) NOT NULL,
    account_number  VARCHAR(50) NOT NULL,
    account_name    VARCHAR(100) NOT NULL,
    status          ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    reject_reason   TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Tabel: waste_prices
-- ============================================================
CREATE TABLE IF NOT EXISTS waste_prices (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    waste_type      VARCHAR(100) NOT NULL UNIQUE,
    price_user_per_kg    DECIMAL(10,2) NOT NULL,
    price_pengepul_per_kg DECIMAL(10,2) NOT NULL
);

-- Insert harga dasar
INSERT IGNORE INTO waste_prices (waste_type, price_user_per_kg, price_pengepul_per_kg) VALUES 
('Botol Plastik', 2000.00, 2500.00),
('Kardus', 1000.00, 1500.00),
('Buku/HPS', 1500.00, 2000.00),
('Besi', 5000.00, 5500.00),
('Aluminium', 8000.00, 8500.00),
('Minyak Jelantah', 3000.00, 3500.00);

-- ============================================================
-- Tabel: rewards
-- ============================================================
CREATE TABLE IF NOT EXISTS rewards (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    points_needed INT NOT NULL,
    stock         INT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO rewards (name, points_needed, stock) VALUES
('Pulsa Rp 10.000', 10000, 100),
('Voucher Belanja Rp 50.000', 50000, 50),
('Tumbler Eksklusif', 75000, 20),
('Tas Belanja Ramah Lingkungan', 25000, 100);

-- ============================================================
-- Tabel: reward_redemptions
-- ============================================================
CREATE TABLE IF NOT EXISTS reward_redemptions (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    reward_id     INT NOT NULL,
    points_used   INT NOT NULL,
    status        ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
);

-- ============================================================
-- Tabel: notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    title       VARCHAR(100) NOT NULL,
    message     TEXT NOT NULL,
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
