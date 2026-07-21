const mysql = require("mysql2");

const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

connection.getConnection((err, conn) => {
  if (err) {
    console.log("Database gagal terkoneksi", err);
  } else {
    console.log("Database terkoneksi");
    conn.release();
  }
});

module.exports = connection;
