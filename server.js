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
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10
});

// Automatically build required tables on server startup
function initDatabase() {
    // Products Table
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
        if (err) console.error('❌ Error creating products table:', err.message);
        else console.log('✅ Products table ready.');
    });

    // Settings Table
    pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            setting_key VARCHAR(50) PRIMARY KEY,
            setting_value VARCHAR(255) NOT NULL
        );
    `, (err) => {
        if (!err) {
            pool.query("INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('delivery_fee', '2.00')");
            console.log('✅ Settings table ready.');
        } else {
            console.error('❌ Error creating settings table:', err.message);
        }
    });

    // Categories Table
    pool.query(`
        CREATE TABLE IF NOT EXISTS categories (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL
        );
    `, (err) => {
        if (!err) {
            // Seed default categories if empty
            pool.query("INSERT IGNORE INTO categories (id, name) VALUES ('tech', 'Desk & Tech'), ('utility', 'Daily Utility'), ('comfort', 'Comfort & Home')");
            console.log('✅ Categories table ready.');
        } else {
            console.error('❌ Error creating categories table:', err.message);
        }
    });
}

initDatabase();

// ==========================================
// API ROUTES
// ==========================================

// Health Check Route (Visiting the backend URL in browser should show this)
app.get('/', (req, res) => {
    res.json({ status: 'success', message: 'Nexo Backend is running perfectly!' });
});

// 1. GET all data (products, settings, categories)
app.get('/api/store', (req, res) => {
    pool.query('SELECT * FROM products ORDER BY created_at DESC', (err, products) => {
        if (err) return res.status(500).json({ error: 'DB Error (Products): ' + err.message });

        pool.query('SELECT * FROM settings', (err, settings) => {
            if (err) return res.status(500).json({ error: 'DB Error (Settings): ' + err.message });

            pool.query('SELECT * FROM categories', (err, categories) => {
                if (err) return res.status(500).json({ error: 'DB Error (Categories): ' + err.message });

                const settingsObj = {};
                if (settings) settings.forEach(s => settingsObj[s.setting_key] = s.setting_value);

                res.json({
                    products: products || [],
                    settings: settingsObj,
                    categories: categories || []
                });
            });
        });
    });
});

// 2. PRODUCTS CRUD
app.post('/api/products', (req, res) => {
    const { id, name, category, priceUsd, rating, reviews, image, badge, description } = req.body;

    // VALIDATION: Prevent crashes from missing data
    if (!id || !name || !category || priceUsd === undefined || isNaN(priceUsd)) {
        return res.status(400).json({ error: 'Invalid product data. Name, Category, and a valid Number Price are required.' });
    }

    const query = 'INSERT INTO products (id, name, category, price_usd, rating, reviews, image, badge, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    pool.query(query, [id, name, category, priceUsd, rating || 5.0, reviews || 1, image, badge || 'New', description || ''], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/products/:id', (req, res) => {
    const { name, category, priceUsd, rating, reviews, image, badge, description } = req.body;

    if (!name || !category || priceUsd === undefined || isNaN(priceUsd)) {
        return res.status(400).json({ error: 'Invalid product data for update.' });
    }

    const query = `UPDATE products SET name=?, category=?, price_usd=?, rating=?, reviews=?, image=?, badge=?, description=? WHERE id=?`;
    pool.query(query, [name, category, priceUsd, rating || 5.0, reviews || 1, image, badge || '', description || '', req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
        res.json({ success: true });
    });
});

app.delete('/api/products/:id', (req, res) => {
    pool.query('DELETE FROM products WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 3. SETTINGS
app.post('/api/settings', (req, res) => {
    const { deliveryFee } = req.body;
    if (deliveryFee === undefined || isNaN(deliveryFee)) {
        return res.status(400).json({ error: 'Valid delivery fee required.' });
    }

    pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [deliveryFee, 'delivery_fee'], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 4. CATEGORIES CRUD
app.post('/api/categories', (req, res) => {
    const { id, name } = req.body;

    if (!id || !name) {
        return res.status(400).json({ error: 'Category ID and Name are required.' });
    }

    pool.query('INSERT INTO categories (id, name) VALUES (?, ?)', [id, name], (err) => {
        if (err) {
            // Handle duplicate entry error specifically
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Category ID already exists.' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

app.put('/api/categories/:id', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category Name is required.' });

    pool.query('UPDATE categories SET name = ? WHERE id = ?', [name, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/categories/:id', (req, res) => {
    pool.query('DELETE FROM categories WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Nexo Backend server running on port ${PORT}`));