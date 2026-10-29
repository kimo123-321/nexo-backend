const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Aiven Cloud MySQL Pool connection using environment variables
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-1fd3fb62-nexo-essentials.h.aivencloud.com',
    port: process.env.DB_PORT || 26433,
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'defaultdb',
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10
});

// Automatically build required tables on server startup if they don't exist
function initDatabase() {
    pool.query(`
        CREATE TABLE IF NOT EXISTS products (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(50) NOT NULL,
            price_usd DECIMAL(10,2) NOT NULL,
            rating DECIMAL(3,2) DEFAULT 5.00,
            reviews INT DEFAULT 1,
            image LONGTEXT NOT NULL,
            badge VARCHAR(100),
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `, (err) => {
        if (err) console.error('Error creating products table:', err.message);
        else console.log('Products table verified/created successfully.');
    });

    pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            setting_key VARCHAR(50) PRIMARY KEY,
            setting_value VARCHAR(255) NOT NULL
        );
    `, (err) => {
        if (err) {
            console.error('Error creating settings table:', err.message);
        } else {
            pool.query("INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('delivery_fee', '2.00')");
            console.log('Settings table verified/created successfully.');
        }
    });
}

initDatabase();

// API Endpoints for the Store

// GET all products and settings
app.get('/api/store', (req, res) => {
    pool.query('SELECT * FROM products ORDER BY created_at DESC', (err, products) => {
        if (err) return res.status(500).json({ error: err.message });

        pool.query('SELECT * FROM settings', (err, settings) => {
            if (err) return res.status(500).json({ error: err.message });

            const settingsObj = {};
            if (settings) {
                settings.forEach(s => settingsObj[s.setting_key] = s.setting_value);
            }

            res.json({ products: products || [], settings: settingsObj });
        });
    });
});

// ADD a new product
app.post('/api/products', (req, res) => {
    const { id, name, category, priceUsd, rating, reviews, image, badge, description } = req.body;
    const query = 'INSERT INTO products (id, name, category, price_usd, rating, reviews, image, badge, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

    pool.query(query, [id, name, category, priceUsd, rating, reviews, image, badge, description], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// DELETE a product
app.delete('/api/products/:id', (req, res) => {
    pool.query('DELETE FROM products WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// UPDATE settings (delivery fee)
app.post('/api/settings', (req, res) => {
    const { deliveryFee } = req.body;
    pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [deliveryFee, 'delivery_fee'], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nexo Backend server running on port ${PORT}`));