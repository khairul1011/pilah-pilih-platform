require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function migrate() {
    try {
        console.log("Starting database migrations...");

        // 1. users table
        try {
            await db.promise().query(`ALTER TABLE users 
                ADD COLUMN pengepul_id INT DEFAULT NULL,
                ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE,
                ADD COLUMN latitude DECIMAL(10,8) DEFAULT NULL,
                ADD COLUMN longitude DECIMAL(11,8) DEFAULT NULL,
                ADD COLUMN availability_status ENUM('AVAILABLE', 'BUSY', 'OFFLINE') DEFAULT 'OFFLINE',
                ADD COLUMN service_radius DECIMAL(10,2) DEFAULT 15.00,
                ADD FOREIGN KEY (pengepul_id) REFERENCES users(id) ON DELETE SET NULL;
            `);
            console.log("Updated users table.");
        } catch(e) {
            console.log("users table might already be updated:", e.message);
        }

        // 2. pickups table
        try {
            await db.promise().query(`ALTER TABLE pickups
                ADD COLUMN pickup_fee DECIMAL(15,2) DEFAULT 0.00,
                ADD COLUMN latitude DECIMAL(10,8) DEFAULT NULL,
                ADD COLUMN longitude DECIMAL(11,8) DEFAULT NULL,
                ADD COLUMN distance_km DECIMAL(10,2) DEFAULT NULL,
                ADD COLUMN accepted_at TIMESTAMP NULL DEFAULT NULL,
                ADD COLUMN finished_at TIMESTAMP NULL DEFAULT NULL;
            `);
            console.log("Updated pickups table.");
        } catch(e) {
            console.log("pickups table might already be updated:", e.message);
        }

        // 3. waste_prices table
        try {
            await db.promise().query(`ALTER TABLE waste_prices 
                CHANGE COLUMN price_per_kg price_user_per_kg DECIMAL(10,2) NOT NULL,
                ADD COLUMN price_pengepul_per_kg DECIMAL(10,2) NOT NULL DEFAULT 0.00;
            `);
            console.log("Updated waste_prices table.");

            // Update existing prices to have a pengepul price (+500 from user price)
            await db.promise().query(`UPDATE waste_prices SET price_pengepul_per_kg = price_user_per_kg + 500;`);
            console.log("Updated waste_prices values.");
        } catch(e) {
            console.log("waste_prices table might already be updated:", e.message);
        }

        // 4. pickup_items table
        // We also need to add price_pengepul_per_kg to pickup_items for accurate records. Actually, the requirement just says we record the price_user_per_kg and calculate difference. 
        // We will leave pickup_items as is for now and just use waste_prices or calculate it at checkout.

        console.log("Migrations completed.");
    } catch(err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit();
    }
}

migrate();
