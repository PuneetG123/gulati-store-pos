const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

// Active session tokens
const activeTokens = new Set();

// Setup Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

let pgPool = null;
let sqliteDb = null;

if (DATABASE_URL) {
  console.log("Using PostgreSQL Cloud Database (Supabase)...");
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  createPostgresTables();
} else {
  console.log("Using Local SQLite Database...");
  const DB_FILE = path.join(__dirname, 'GULATISTORE.db');
  sqliteDb = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
      console.error("Error opening SQLite database GULATISTORE.db:", err);
    } else {
      console.log("Connected to SQLite database GULATISTORE.db");
      createSqliteTables();
    }
  });
}

// Universal DB Query Helpers
async function dbAll(sql, params = []) {
  if (pgPool) {
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows || [];
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

async function dbGet(sql, params = []) {
  if (pgPool) {
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows[0] || null;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
}

async function dbRun(sql, params = []) {
  if (pgPool) {
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    return await pgPool.query(pgSql, params);
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }
}

function createSqliteTables() {
  sqliteDb.serialize(() => {
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS products (
      sku TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      hsn TEXT,
      costPrice REAL,
      sellingPrice REAL,
      gstSlab REAL,
      discountPercent REAL DEFAULT 0,
      stock REAL,
      reorderLevel REAL,
      unit TEXT
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT,
      customerName TEXT,
      customerPhone TEXT,
      items TEXT,
      subtotal REAL,
      discountType TEXT,
      discountValue REAL,
      discountAmount REAL,
      gstAmount REAL,
      totalPayable REAL,
      paymentMethod TEXT
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS customers (
      phone TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      totalPurchased REAL,
      balance REAL,
      lastTxn TEXT
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS customer_ledger (
      id TEXT PRIMARY KEY,
      date TEXT,
      phone TEXT,
      type TEXT,
      amount REAL,
      ref TEXT
    )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`, [], (err) => {
      if (!err) {
        sqliteDb.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('pin', '1234')");
        sqliteDb.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('printer_name', 'Default')");
        sqliteDb.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_print', 'false')");
        sqliteDb.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('gstin', '07AAAAA1111A1Z1')");
      }
    });
  });
}

async function createPostgresTables() {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS products (
        sku TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        hsn TEXT,
        "costPrice" REAL,
        "sellingPrice" REAL,
        "gstSlab" REAL,
        "discountPercent" REAL,
        stock REAL,
        "reorderLevel" REAL,
        unit TEXT
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        date TEXT,
        "customerName" TEXT,
        "customerPhone" TEXT,
        subtotal REAL,
        "discountType" TEXT,
        "discountValue" REAL,
        "discountAmount" REAL,
        "gstAmount" REAL,
        "totalPayable" REAL,
        "paymentMethod" TEXT,
        items TEXT
      );

      CREATE TABLE IF NOT EXISTS customers (
        phone TEXT PRIMARY KEY,
        name TEXT,
        "totalPurchased" REAL,
        balance REAL,
        "lastTxn" TEXT
      );

      CREATE TABLE IF NOT EXISTS customer_ledger (
        id TEXT PRIMARY KEY,
        phone TEXT,
        date TEXT,
        type TEXT,
        amount REAL,
        ref TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS print_queue (
        id SERIAL PRIMARY KEY,
        receipt_text TEXT,
        printer_name TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pgPool.query("INSERT INTO settings (key, value) VALUES ('pin', '1234') ON CONFLICT (key) DO NOTHING");
    await pgPool.query("INSERT INTO settings (key, value) VALUES ('printer_name', 'Default') ON CONFLICT (key) DO NOTHING");
    await pgPool.query("INSERT INTO settings (key, value) VALUES ('auto_print', 'false') ON CONFLICT (key) DO NOTHING");
    await pgPool.query("INSERT INTO settings (key, value) VALUES ('gstin', '07AAAAA1111A1Z1') ON CONFLICT (key) DO NOTHING");
    console.log("PostgreSQL database tables initialized.");
  } catch (err) {
    console.error("Failed to initialize PostgreSQL tables:", err);
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Access denied. Auth token missing." });
  }
  
  const token = authHeader.split(' ')[1];
  if (!activeTokens.has(token)) {
    return res.status(401).json({ error: "Session expired or invalid. Please re-authenticate." });
  }
  
  next();
}

function handleDatabaseError(err, res, message = "Database operation failed") {
  console.error(message, err);
  res.status(500).json({ error: message, details: err ? err.message : '' });
}

// Auth Routes
app.post('/api/login', async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "PIN is required" });

  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'pin'");
    const currentPin = row ? row.value : "1234";

    if (String(pin).trim() === String(currentPin).trim()) {
      const token = crypto.randomBytes(16).toString('hex');
      activeTokens.add(token);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: "Incorrect PIN" });
    }
  } catch (err) {
    handleDatabaseError(err, res, "Failed to query authentication system");
  }
});

let pendingPinChange = null;

app.post('/api/request-otp', authenticateToken, async (req, res) => {
  const { oldPin, newPin } = req.body;
  if (!oldPin || !newPin) return res.status(400).json({ error: "Current PIN and New PIN are required" });
  if (!/^\d{4}$/.test(newPin)) return res.status(400).json({ error: "New PIN must be exactly 4 digits" });

  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'pin'");
    const currentPin = row ? row.value : "1234";

    if (oldPin !== currentPin) return res.status(400).json({ error: "Current PIN is incorrect" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    pendingPinChange = { newPin, otp, expiresAt: Date.now() + 300000 };

    console.log(`\n=======================================================`);
    console.log(` ⚠️  SECURITY ALERT: PIN CHANGE REQUESTED!`);
    console.log(` >>> VERIFICATION OTP CODE: ${otp} <<<`);
    console.log(`=======================================================\n`);

    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to request OTP");
  }
});

app.post('/api/verify-otp', authenticateToken, async (req, res) => {
  const { otp } = req.body;
  if (!otp) return res.status(400).json({ error: "OTP is required" });
  if (!pendingPinChange) return res.status(400).json({ error: "No pending PIN change request found." });
  if (Date.now() > pendingPinChange.expiresAt) {
    pendingPinChange = null;
    return res.status(400).json({ error: "OTP has expired. Please request a new one." });
  }
  if (otp !== pendingPinChange.otp) return res.status(400).json({ error: "Incorrect OTP." });

  try {
    await dbRun("UPDATE settings SET value = ? WHERE key = 'pin'", [pendingPinChange.newPin]);
    console.log(`[SECURITY] PIN changed successfully to ${pendingPinChange.newPin}`);
    pendingPinChange = null;
    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to save new PIN to database");
  }
});

// Load All Data API
app.get('/api/data', authenticateToken, async (req, res) => {
  try {
    const settings = await dbAll("SELECT * FROM settings");
    const rawProducts = await dbAll("SELECT * FROM products");
    const rawTransactions = await dbAll("SELECT * FROM transactions");
    const rawCustomers = await dbAll("SELECT * FROM customers");
    
    let ledgerEntries = [];
    try {
      ledgerEntries = await dbAll("SELECT * FROM customer_ledger ORDER BY date ASC");
    } catch (e) {
      ledgerEntries = await dbAll("SELECT * FROM ledgerEntries ORDER BY date ASC");
    }

    // Normalize products so app.js receives exact expected properties
    const products = rawProducts.map(p => ({
      sku: String(p.sku || p.id || 'PROD_' + Math.random().toString(36).substr(2, 6)),
      name: p.name || 'Unnamed Item',
      category: p.category || 'General',
      hsn: p.hsn || '',
      costPrice: parseFloat(p.costPrice ?? p.purchasePrice ?? 0),
      sellingPrice: parseFloat(p.sellingPrice ?? 0),
      gstSlab: parseFloat(p.gstSlab ?? p.gstRate ?? 0),
      discountPercent: parseFloat(p.discountPercent ?? 0),
      stock: parseFloat(p.stock ?? 0),
      reorderLevel: parseFloat(p.reorderLevel ?? 0),
      unit: p.unit || 'pcs'
    }));

    const transactions = rawTransactions.map(r => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items || '[]') : r.items
    }));

    const customers = rawCustomers.map(c => ({
      ...c,
      totalPurchased: parseFloat(c.totalPurchased ?? c.totalPurchases ?? 0),
      balance: parseFloat(c.balance ?? 0)
    }));

    res.json({ products, transactions, customers, ledgerEntries, settings });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to load database payload");
  }
});

// Save All Data API
app.post('/api/save', authenticateToken, async (req, res) => {
  const { products, transactions, customers, ledgerEntries } = req.body;
  if (!products || !transactions || !customers || !ledgerEntries) {
    return res.status(400).json({ error: "Missing required database fields in payload" });
  }

  try {
    // 1. Sync Products
    await dbRun("DELETE FROM products");
    for (const p of products) {
      const sku = String(p.sku || p.id);
      await dbRun(
        "INSERT INTO products (sku, name, category, hsn, \"costPrice\", \"sellingPrice\", \"gstSlab\", \"discountPercent\", stock, \"reorderLevel\", unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [sku, p.name, p.category, p.hsn || '', p.costPrice || p.purchasePrice || 0, p.sellingPrice || 0, p.gstSlab || p.gstRate || 0, p.discountPercent || 0, p.stock || 0, p.reorderLevel || 0, p.unit || 'pcs']
      );
    }

    // 2. Sync Transactions
    await dbRun("DELETE FROM transactions");
    for (const t of transactions) {
      await dbRun(
        "INSERT INTO transactions (id, date, \"customerName\", \"customerPhone\", subtotal, \"discountType\", \"discountValue\", \"discountAmount\", \"gstAmount\", \"totalPayable\", \"paymentMethod\", items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [t.id, t.date, t.customerName, t.customerPhone, t.subtotal, t.discountType || 'flat', t.discountValue || 0, t.discountAmount || 0, t.gstAmount || 0, t.totalPayable || 0, t.paymentMethod || 'Cash', JSON.stringify(t.items)]
      );
    }

    // 3. Sync Customers
    await dbRun("DELETE FROM customers");
    for (const c of customers) {
      await dbRun(
        "INSERT INTO customers (phone, name, \"totalPurchased\", balance, \"lastTxn\") VALUES (?, ?, ?, ?, ?)",
        [c.phone, c.name, c.totalPurchased || c.totalPurchases || 0, c.balance || 0, c.lastTxn || '']
      );
    }

    // 4. Sync Ledger
    try {
      await dbRun("DELETE FROM customer_ledger");
      for (const l of ledgerEntries) {
        await dbRun(
          "INSERT INTO customer_ledger (id, phone, date, type, amount, ref) VALUES (?, ?, ?, ?, ?, ?)",
          [l.id || `led_${Date.now()}_${Math.random().toString(36).substr(2,4)}`, l.phone, l.date, l.type, l.amount, l.ref]
        );
      }
    } catch (e) {
      await dbRun("DELETE FROM ledgerEntries");
      for (const l of ledgerEntries) {
        await dbRun(
          "INSERT INTO ledgerEntries (date, phone, type, amount, ref) VALUES (?, ?, ?, ?, ?)",
          [l.date, l.phone, l.type, l.amount, l.ref]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to save database state");
  }
});

// Save Store Settings API
app.post('/api/save-printer', authenticateToken, async (req, res) => {
  const { printerName, autoPrint, gstin } = req.body;
  try {
    await dbRun("INSERT INTO settings (key, value) VALUES ('printer_name', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [printerName || 'Default']);
    await dbRun("INSERT INTO settings (key, value) VALUES ('auto_print', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [autoPrint ? 'true' : 'false']);
    await dbRun("INSERT INTO settings (key, value) VALUES ('gstin', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [gstin || '07AAAAA1111A1Z1']);
    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to save settings");
  }
});

// Direct Print API
app.post('/api/print', authenticateToken, async (req, res) => {
  const { receiptText } = req.body;
  if (!receiptText) return res.status(400).json({ error: "Receipt text is required" });

  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'printer_name'");
    const printer = row ? row.value : 'Default';

    if (pgPool) {
      // Cloud Mode: Queue job for Laptop Print Agent
      await pgPool.query(
        "INSERT INTO print_queue (receipt_text, printer_name, status) VALUES ($1, $2, 'pending')",
        [receiptText, printer]
      );
      res.json({ success: true, queued: true });
    } else {
      // Local Mode: Execute raw_print.ps1 directly
      const fs = require('fs');
      const { exec } = require('child_process');
      const tempFile = path.join(__dirname, 'temp_receipt.txt');
      const scriptFile = path.join(__dirname, 'raw_print.ps1');
      
      fs.writeFileSync(tempFile, receiptText, 'utf8');
      const escapedPrinter = printer.replace(/"/g, '`"');
      const cmd = `powershell -ExecutionPolicy Bypass -File "${scriptFile}" -PrinterName "${escapedPrinter}" -FilePath "${tempFile}"`;
      
      exec(cmd, (execErr, stdout, stderr) => {
        fs.unlink(tempFile, () => {});
        if (execErr) {
          console.error("Direct printing failed:", execErr, stderr);
          return res.status(500).json({ error: "Direct printing failed on host machine" });
        }
        res.json({ success: true, queued: false });
      });
    }
  } catch (err) {
    handleDatabaseError(err, res, "Failed to process print request");
  }
});

// Laptop Print Agent Queue Endpoints
app.get('/api/print-queue', async (req, res) => {
  try {
    if (pgPool) {
      const resPg = await pgPool.query("SELECT * FROM print_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 5");
      res.json(resPg.rows || []);
    } else {
      res.json([]);
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch print queue" });
  }
});

app.post('/api/print-queue/ack', async (req, res) => {
  const { jobId } = req.body;
  try {
    if (pgPool && jobId) {
      await pgPool.query("UPDATE print_queue SET status = 'printed' WHERE id = $1", [jobId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to acknowledge print job" });
  }
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` Gulati Store POS server is running on port ${PORT}!`);
  console.log(` Database: ${DATABASE_URL ? 'Cloud PostgreSQL (Supabase)' : DB_FILE}`);
  console.log(`=======================================================`);
});
