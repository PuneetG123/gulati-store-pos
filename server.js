const express = require('express');
const crypto = require('crypto');
const path = require('path');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception caught:', err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection caught:', reason);
});

let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.warn("sqlite3 module load warning:", e.message);
}

let Pool = null;
try {
  Pool = require('pg').Pool;
} catch (e) {
  console.warn("pg module load warning:", e.message);
}

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

// Active session tokens & Deterministic PIN token helpers
const activeTokens = new Set();
const AUTH_SECRET = process.env.AUTH_SECRET || "GULATI_POS_SECRET_2026_KEY";

function generatePinToken(pin) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(String(pin).trim()).digest('hex');
}

function verifyPinToken(token, currentPin) {
  if (!token || !currentPin) return false;
  const expectedToken = generatePinToken(currentPin);
  return token === expectedToken;
}

// Authentication Middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Access denied. Auth token missing." });
  }
  
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: "Access denied. Invalid auth token format." });
  }
  
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'pin'");
    const currentPin = row ? String(row.value).trim() : "1234";
    if (verifyPinToken(token, currentPin)) {
      activeTokens.add(token);
      return next();
    }
  } catch (err) {}
  
  return res.status(401).json({ error: "Session expired or invalid. Please re-authenticate." });
}

function handleDatabaseError(err, res, message = "Database operation failed") {
  console.error(message, err);
  res.status(500).json({ error: message, details: err ? err.message : '' });
}

// Setup Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

let pgPool = null;
let sqliteDb = null;

if (DATABASE_URL && Pool) {
  console.log("Using PostgreSQL Cloud Database (Supabase)...");
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  createPostgresTables();
} else if (sqlite3) {
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
} else {
  console.warn("Operating with safely guarded memory storage.");
}

// Universal DB Query Helpers
async function dbAll(sql, params = []) {
  if (pgPool) {
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows || [];
  } else if (sqliteDb) {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  } else {
    return [];
  }
}

async function dbGet(sql, params = []) {
  if (pgPool) {
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    const res = await pgPool.query(pgSql, params);
    return res.rows[0] || null;
  } else if (sqliteDb) {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  } else {
    return null;
  }
}

async function dbRun(sql, params = []) {
  if (pgPool) {
    let idx = 1;
    const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
    const res = await pgPool.query(pgSql, params);
    return res;
  } else if (sqliteDb) {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  } else {
    return { lastID: 1, changes: 1 };
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
      name TEXT PRIMARY KEY,
      phone TEXT,
      totalPurchased REAL,
      balance REAL,
      lastTxn TEXT
    )`);
    sqliteDb.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_sqlite_cust_name ON customers (LOWER(TRIM(name)))");

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS customer_ledger (
      id TEXT PRIMARY KEY,
      date TEXT,
      phone TEXT,
      customer_name TEXT,
      type TEXT,
      amount REAL,
      ref TEXT,
      attachmentData TEXT,
      attachmentName TEXT
    )`);

    // Dynamic schema migrations for existing databases
    sqliteDb.run("ALTER TABLE customer_ledger ADD COLUMN customer_name TEXT", [], () => {});
    sqliteDb.run("ALTER TABLE customer_ledger ADD COLUMN attachmentData TEXT", [], () => {});
    sqliteDb.run("ALTER TABLE customer_ledger ADD COLUMN attachmentName TEXT", [], () => {});

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
        name TEXT PRIMARY KEY,
        phone TEXT,
        "totalPurchased" REAL,
        balance REAL,
        "lastTxn" TEXT
      );

      CREATE TABLE IF NOT EXISTS customer_ledger (
        id TEXT PRIMARY KEY,
        phone TEXT,
        customer_name TEXT,
        date TEXT,
        type TEXT,
        amount REAL,
        ref TEXT,
        "attachmentData" TEXT,
        "attachmentName" TEXT
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
    
    // Dynamic Postgres schema migration
    try { await pgPool.query('ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_pkey'); } catch(e) {}
    try { await pgPool.query('ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL'); } catch(e) {}
    try { await pgPool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_name_lower ON customers (LOWER(TRIM(name)))'); } catch(e) {}
    try { await pgPool.query('ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS customer_name TEXT'); } catch(e) {}
    try { await pgPool.query('ALTER TABLE customer_ledger ADD COLUMN "attachmentData" TEXT'); } catch(e) {}
    try { await pgPool.query('ALTER TABLE customer_ledger ADD COLUMN "attachmentName" TEXT'); } catch(e) {}

    await pgPool.query("INSERT INTO settings (key, value) VALUES ('pin', '1234') ON CONFLICT (key) DO NOTHING");
    await pgPool.query("INSERT INTO settings (key, value) VALUES ('printer_name', 'Default') ON CONFLICT (key) DO NOTHING");
    await pgPool.query("INSERT INTO settings (key, value) VALUES ('auto_print', 'false') ON CONFLICT (key) DO NOTHING");
    await pgPool.query("INSERT INTO settings (key, value) VALUES ('gstin', '07AAAAA1111A1Z1') ON CONFLICT (key) DO NOTHING");
    console.log("PostgreSQL database tables initialized.");
  } catch (err) {
    console.error("Failed to initialize PostgreSQL tables:", err);
  }
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
    const currentPin = row ? String(row.value).trim() : "1234";
    const reqPin = String(pin).trim();

    if (reqPin === currentPin) {
      const token = generatePinToken(reqPin);
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

app.post('/api/change-pin', authenticateToken, async (req, res) => {
  const { oldPin, newPin } = req.body;
  if (!oldPin || !newPin) return res.status(400).json({ error: "Current PIN and New PIN are required" });
  if (!/^\d{4}$/.test(newPin)) return res.status(400).json({ error: "New PIN must be exactly 4 digits" });

  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'pin'");
    const currentPin = row ? String(row.value).trim() : "1234";

    if (String(oldPin).trim() !== currentPin) return res.status(400).json({ error: "Current PIN is incorrect" });

    await dbRun("UPDATE settings SET value = ? WHERE key = 'pin'", [newPin]);
    activeTokens.clear();
    const token = generatePinToken(newPin);
    activeTokens.add(token);
    console.log(`[SECURITY] PIN changed successfully to ${newPin}`);
    res.json({ success: true, token });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to update PIN");
  }
});

// Load All Data API
app.get('/api/data', authenticateToken, async (req, res) => {
  try {
    const settings = await dbAll("SELECT * FROM settings");
    const rawProducts = await dbAll("SELECT * FROM products ORDER BY LOWER(name) ASC");
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

    const normalizedLedgerEntries = ledgerEntries.map(l => ({
      id: l.id,
      phone: l.phone || "",
      customerName: l.customer_name || l.customerName || (rawCustomers.find(c => c.phone && c.phone === l.phone) || {}).name || "",
      date: l.date,
      type: l.type,
      amount: parseFloat(l.amount) || 0,
      ref: l.ref || "",
      attachmentData: l.attachmentData || l.attachmentdata || null,
      attachmentName: l.attachmentName || l.attachmentname || null
    }));

    res.json({ products, transactions, customers, ledgerEntries: normalizedLedgerEntries, settings });
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

  let client = null;
  try {
    // Start Transaction
    if (pgPool) {
      client = await pgPool.connect();
      await client.query('BEGIN');
    } else if (sqliteDb) {
      await dbRun("BEGIN TRANSACTION");
    }

    const runQuery = async (sql, params = []) => {
      if (client) {
        let idx = 1;
        const pgSql = sql.replace(/\?/g, () => `$${idx++}`);
        return await client.query(pgSql, params);
      } else {
        return await dbRun(sql, params);
      }
    };

    // 1. Sync Products (Safe Upsert / Replace)
    if (Array.isArray(products) && products.length > 0) {
      await runQuery("DELETE FROM products");
      for (const p of products) {
        const sku = String(p.sku || p.id);
        await runQuery(
          "INSERT INTO products (sku, name, category, hsn, \"costPrice\", \"sellingPrice\", \"gstSlab\", \"discountPercent\", stock, \"reorderLevel\", unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [sku, p.name, p.category, p.hsn || '', p.costPrice || p.purchasePrice || 0, p.sellingPrice || 0, p.gstSlab || p.gstRate || 0, p.discountPercent || 0, p.stock || 0, p.reorderLevel || 0, p.unit || 'pcs']
        );
      }
    }

    // 2. Sync Transactions
    if (Array.isArray(transactions) && transactions.length > 0) {
      await runQuery("DELETE FROM transactions");
      for (const t of transactions) {
        await runQuery(
          "INSERT INTO transactions (id, date, \"customerName\", \"customerPhone\", subtotal, \"discountType\", \"discountValue\", \"discountAmount\", \"gstAmount\", \"totalPayable\", \"paymentMethod\", items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [t.id, t.date, t.customerName, t.customerPhone, t.subtotal, t.discountType || 'flat', t.discountValue || 0, t.discountAmount || 0, t.gstAmount || 0, t.totalPayable || 0, t.paymentMethod || 'Cash', JSON.stringify(t.items)]
        );
      }
    }

    // 3. Sync Customers
    if (Array.isArray(customers) && customers.length > 0) {
      await runQuery("DELETE FROM customers");
      const seenCusts = new Set();
      for (const c of customers) {
        if (!c.name) continue;
        const key = c.name.trim().toLowerCase();
        if (seenCusts.has(key)) continue;
        seenCusts.add(key);
        await runQuery(
          "INSERT INTO customers (name, phone, \"totalPurchased\", balance, \"lastTxn\") VALUES (?, ?, ?, ?, ?)",
          [c.name.trim(), c.phone ? String(c.phone).trim() : '', c.totalPurchased || c.totalPurchases || 0, c.balance || 0, c.lastTxn || '']
        );
      }
    }

    // 4. Sync Ledger
    if (Array.isArray(ledgerEntries) && ledgerEntries.length > 0) {
      try {
        await runQuery("DELETE FROM customer_ledger");
        for (const l of ledgerEntries) {
          await runQuery(
            "INSERT INTO customer_ledger (id, phone, customer_name, date, type, amount, ref, \"attachmentData\", \"attachmentName\") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [l.id || `led_${Date.now()}_${Math.random().toString(36).substr(2,4)}`, l.phone || '', l.customerName || l.customer_name || '', l.date, l.type, l.amount, l.ref, l.attachmentData || null, l.attachmentName || null]
          );
        }
      } catch (e) {
        await runQuery("DELETE FROM ledgerEntries");
        for (const l of ledgerEntries) {
          await runQuery(
            "INSERT INTO ledgerEntries (date, phone, type, amount, ref) VALUES (?, ?, ?, ?, ?)",
            [l.date, l.phone || '', l.type, l.amount, l.ref]
          );
        }
      }
    }

    // Commit Transaction
    if (client) {
      await client.query('COMMIT');
    } else {
      await dbRun("COMMIT TRANSACTION");
    }

    res.json({ success: true });
  } catch (err) {
    // Rollback Transaction on failure
    try {
      if (client) {
        await client.query('ROLLBACK');
      } else {
        await dbRun("ROLLBACK TRANSACTION");
      }
    } catch (e) {}

    handleDatabaseError(err, res, "Failed to save database state");
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.post('/api/add-customer', authenticateToken, async (req, res) => {
  const { name, phone, balance } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Customer Name is required" });
  }

  try {
    const nameStr = String(name).trim();
    const phoneStr = phone ? String(phone).trim() : "";
    if (phoneStr && !/^\d{10}$/.test(phoneStr)) {
      return res.status(400).json({ error: "If provided, mobile number must be 10 digits" });
    }

    const initialBalance = parseFloat(balance) || 0;
    const today = new Date().toISOString().split('T')[0];

    // Check if customer already exists by name (case-insensitive)
    const existing = await dbGet("SELECT * FROM customers WHERE LOWER(TRIM(name)) = LOWER(?)", [nameStr]);
    if (existing) {
      return res.status(400).json({ error: `Customer with name "${nameStr}" already exists.` });
    }

    // Insert customer
    await dbRun(
      "INSERT INTO customers (name, phone, \"totalPurchased\", balance, \"lastTxn\") VALUES (?, ?, ?, ?, ?)",
      [nameStr, phoneStr, initialBalance > 0 ? initialBalance : 0, initialBalance, initialBalance !== 0 ? today : '']
    );

    // If opening balance dues !== 0, log an opening balance entry
    if (initialBalance !== 0) {
      const ledgerId = `led_${Date.now()}_${Math.random().toString(36).substr(2,4)}`;
      try {
        await dbRun(
          "INSERT INTO customer_ledger (id, phone, customer_name, date, type, amount, ref) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [ledgerId, phoneStr, nameStr, new Date().toISOString(), initialBalance > 0 ? 'debit' : 'credit', Math.abs(initialBalance), "Opening Balance"]
        );
      } catch (e) {
        await dbRun(
          "INSERT INTO customer_ledger (id, phone, date, type, amount, ref) VALUES (?, ?, ?, ?, ?, ?)",
          [ledgerId, phoneStr, new Date().toISOString(), initialBalance > 0 ? 'debit' : 'credit', Math.abs(initialBalance), "Opening Balance"]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to add customer");
  }
});

// Atomic Multi-Device Sync Routes
app.post('/api/adjust-dues', authenticateToken, async (req, res) => {
  const { name, phone, addedDues, reason, attachmentData, attachmentName } = req.body;
  const custName = (name || "").trim();
  const custPhone = (phone || "").trim();
  if ((!custName && !custPhone) || isNaN(addedDues)) return res.status(400).json({ error: "Invalid parameters" });

  try {
    const today = new Date().toISOString().split('T')[0];
    let cust = null;
    if (custName) {
      cust = await dbGet("SELECT * FROM customers WHERE LOWER(TRIM(name)) = LOWER(?)", [custName]);
    }
    if (!cust && custPhone) {
      cust = await dbGet("SELECT * FROM customers WHERE phone = ?", [custPhone]);
    }

    const resolvedName = cust ? cust.name : (custName || "Customer " + custPhone);
    const resolvedPhone = cust ? (cust.phone || custPhone) : custPhone;

    if (!cust) {
      await dbRun(
        "INSERT INTO customers (name, phone, \"totalPurchased\", balance, \"lastTxn\") VALUES (?, ?, 0, ?, ?)",
        [resolvedName, resolvedPhone, addedDues, today]
      );
    } else {
      await dbRun(
        "UPDATE customers SET balance = balance + ?, \"lastTxn\" = ? WHERE LOWER(TRIM(name)) = LOWER(?)",
        [addedDues, today, resolvedName]
      );
    }

    const id = `led_${Date.now()}_${Math.random().toString(36).substr(2,4)}`;
    try {
      await dbRun(
        "INSERT INTO customer_ledger (id, phone, customer_name, date, type, amount, ref, \"attachmentData\", \"attachmentName\") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, resolvedPhone, resolvedName, new Date().toISOString(), addedDues > 0 ? "debit" : "credit", Math.abs(addedDues), reason || 'Balance Adjustment', attachmentData || null, attachmentName || null]
      );
    } catch(e) {
      await dbRun(
        "INSERT INTO customer_ledger (id, phone, date, type, amount, ref) VALUES (?, ?, ?, ?, ?, ?)",
        [id, resolvedPhone, new Date().toISOString(), addedDues > 0 ? "debit" : "credit", Math.abs(addedDues), reason || 'Balance Adjustment']
      );
    }

    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to adjust dues");
  }
});

app.post('/api/record-payment', authenticateToken, async (req, res) => {
  const { name, phone, amountPaid, paymentMethod } = req.body;
  const custName = (name || "").trim();
  const custPhone = (phone || "").trim();
  if ((!custName && !custPhone) || isNaN(amountPaid) || amountPaid <= 0) return res.status(400).json({ error: "Invalid parameters" });

  try {
    const today = new Date().toISOString().split('T')[0];
    let cust = null;
    if (custName) {
      cust = await dbGet("SELECT * FROM customers WHERE LOWER(TRIM(name)) = LOWER(?)", [custName]);
    }
    if (!cust && custPhone) {
      cust = await dbGet("SELECT * FROM customers WHERE phone = ?", [custPhone]);
    }

    const resolvedName = cust ? cust.name : (custName || "Customer " + custPhone);
    const resolvedPhone = cust ? (cust.phone || custPhone) : custPhone;

    if (cust) {
      await dbRun(
        "UPDATE customers SET balance = balance - ?, \"lastTxn\" = ? WHERE LOWER(TRIM(name)) = LOWER(?)",
        [amountPaid, today, resolvedName]
      );
    }

    const id = `led_${Date.now()}_${Math.random().toString(36).substr(2,4)}`;
    try {
      await dbRun(
        "INSERT INTO customer_ledger (id, phone, customer_name, date, type, amount, ref) VALUES (?, ?, ?, ?, 'credit', ?, ?)",
        [id, resolvedPhone, resolvedName, new Date().toISOString(), amountPaid, paymentMethod || 'Cash']
      );
    } catch(e) {
      await dbRun(
        "INSERT INTO customer_ledger (id, phone, date, type, amount, ref) VALUES (?, ?, ?, 'credit', ?, ?)",
        [id, resolvedPhone, new Date().toISOString(), amountPaid, paymentMethod || 'Cash']
      );
    }

    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to record payment");
  }
});

app.post('/api/add-transaction', authenticateToken, async (req, res) => {
  const t = req.body;
  if (!t || !t.id) return res.status(400).json({ error: "Invalid transaction payload" });

  try {
    await dbRun(
      "INSERT INTO transactions (id, date, \"customerName\", \"customerPhone\", subtotal, \"discountType\", \"discountValue\", \"discountAmount\", \"gstAmount\", \"totalPayable\", \"paymentMethod\", items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [t.id, t.date, t.customerName || '', t.customerPhone || '', t.subtotal || 0, t.discountType || 'flat', t.discountValue || 0, t.discountAmount || 0, t.gstAmount || 0, t.totalPayable || 0, t.paymentMethod || 'Cash', JSON.stringify(t.items || [])]
    );

    if (Array.isArray(t.items)) {
      for (const item of t.items) {
        if (item.product && item.product.sku && !item.product.isCustom) {
          await dbRun(
            "UPDATE products SET stock = stock - ? WHERE sku = ?",
            [item.quantity || 1, String(item.product.sku)]
          );
        }
      }
    }

    const custName = (t.customerName || "").trim();
    const custPhone = (t.customerPhone || "").trim();

    // Customer identified with Name only. If customerName is provided and not Walk-in Customer:
    if (custName && custName.toLowerCase() !== "walk-in customer") {
      const today = new Date().toISOString().split('T')[0];
      const addedBalance = (t.paymentMethod === 'Credit') ? (t.totalPayable || 0) : 0;

      let cust = await dbGet("SELECT * FROM customers WHERE LOWER(TRIM(name)) = LOWER(?)", [custName]);
      if (!cust && custPhone) {
        cust = await dbGet("SELECT * FROM customers WHERE phone = ?", [custPhone]);
      }

      if (!cust) {
        await dbRun(
          "INSERT INTO customers (name, phone, \"totalPurchased\", balance, \"lastTxn\") VALUES (?, ?, ?, ?, ?)",
          [custName, custPhone, t.totalPayable || 0, addedBalance, today]
        );
      } else {
        await dbRun(
          "UPDATE customers SET \"totalPurchased\" = \"totalPurchased\" + ?, balance = balance + ?, \"lastTxn\" = ?, phone = CASE WHEN (phone IS NULL OR phone = '') THEN ? ELSE phone END WHERE LOWER(TRIM(name)) = LOWER(?)",
          [t.totalPayable || 0, addedBalance, today, custPhone, cust.name]
        );
      }

      if (t.paymentMethod === 'Credit') {
        const id = `led_${Date.now()}_${Math.random().toString(36).substr(2,4)}`;
        const canonicalName = cust ? cust.name : custName;
        try {
          await dbRun(
            "INSERT INTO customer_ledger (id, phone, customer_name, date, type, amount, ref) VALUES (?, ?, ?, ?, 'debit', ?, ?)",
            [id, custPhone, canonicalName, t.date || new Date().toISOString(), t.totalPayable || 0, t.id]
          );
        } catch(e) {
          await dbRun(
            "INSERT INTO customer_ledger (id, phone, date, type, amount, ref) VALUES (?, ?, ?, 'debit', ?, ?)",
            [id, custPhone, t.date || new Date().toISOString(), t.totalPayable || 0, t.id]
          );
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to save transaction");
  }
});

app.post('/api/save-product', authenticateToken, async (req, res) => {
  const p = req.body;
  if (!p || !p.sku) return res.status(400).json({ error: "Product SKU required" });
  if (!p.name || !String(p.name).trim()) return res.status(400).json({ error: "Product name required" });

  try {
    const sku = String(p.sku);
    const prodName = String(p.name).trim();

    // Prevent duplicate product names (case-insensitive)
    const duplicate = await dbGet("SELECT sku, name FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [prodName]);
    if (duplicate && String(duplicate.sku) !== sku) {
      return res.status(400).json({ error: `A product named "${prodName}" already exists in the inventory!` });
    }

    let existing = await dbGet("SELECT * FROM products WHERE sku = ?", [sku]);
    if (!existing) {
      await dbRun(
        "INSERT INTO products (sku, name, category, hsn, \"costPrice\", \"sellingPrice\", \"gstSlab\", \"discountPercent\", stock, \"reorderLevel\", unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [sku, prodName, p.category || 'General', p.hsn || '', p.costPrice || p.purchasePrice || 0, p.sellingPrice || 0, p.gstSlab || p.gstRate || 0, p.discountPercent || 0, p.stock || 0, p.reorderLevel || 0, p.unit || 'pcs']
      );
    } else {
      await dbRun(
        "UPDATE products SET name=?, category=?, hsn=?, \"costPrice\"=?, \"sellingPrice\"=?, \"gstSlab\"=?, \"discountPercent\"=?, stock=?, \"reorderLevel\"=?, unit=? WHERE sku=?",
        [prodName, p.category || 'General', p.hsn || '', p.costPrice || p.purchasePrice || 0, p.sellingPrice || 0, p.gstSlab || p.gstRate || 0, p.discountPercent || 0, p.stock || 0, p.reorderLevel || 0, p.unit || 'pcs', sku]
      );
    }
    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to save product");
  }
});

app.post('/api/delete-product', authenticateToken, async (req, res) => {
  const { sku } = req.body;
  if (!sku) return res.status(400).json({ error: "Product SKU required" });

  try {
    await dbRun("DELETE FROM products WHERE sku = ?", [String(sku)]);
    res.json({ success: true });
  } catch (err) {
    handleDatabaseError(err, res, "Failed to delete product");
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
  console.log(` Database: ${DATABASE_URL ? 'Cloud PostgreSQL (Supabase)' : 'GULATISTORE.db'}`);
  console.log(`=======================================================`);
});
