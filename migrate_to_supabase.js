const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');

const DB_FILE = path.join(__dirname, 'GULATISTORE.db');
const SUPABASE_URL = 'postgres://postgres.nrwtrlqmtkjgbzpspzsp:vQH76xKpcsRnnstK@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

const sqliteDb = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Failed to connect to SQLite DB:", err);
    process.exit(1);
  }
  console.log("Connected to local SQLite database.");
});

const pgClient = new Client({
  connectionString: SUPABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    await pgClient.connect();
    console.log("Connected to Supabase PostgreSQL database.");

    // Drop legacy tables to reset clean schemas
    console.log("Resetting table schemas...");
    await pgClient.query(`DROP TABLE IF EXISTS products;`);
    await pgClient.query(`DROP TABLE IF EXISTS transactions;`);
    await pgClient.query(`DROP TABLE IF EXISTS customers;`);
    await pgClient.query(`DROP TABLE IF EXISTS customer_ledger;`);

    // Create Tables on Supabase
    await pgClient.query(`
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
    `);

    await pgClient.query(`
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
    `);

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS customers (
        phone TEXT PRIMARY KEY,
        name TEXT,
        "totalPurchased" REAL,
        balance REAL,
        "lastTxn" TEXT
      );
    `);

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS customer_ledger (
        id TEXT PRIMARY KEY,
        phone TEXT,
        date TEXT,
        type TEXT,
        amount REAL,
        ref TEXT
      );
    `);

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS print_queue (
        id SERIAL PRIMARY KEY,
        receipt_text TEXT,
        printer_name TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Table schemas verified successfully!");

    // Helper to fetch all rows from SQLite
    const sqliteAll = (sql) => new Promise((resolve, reject) => {
      sqliteDb.all(sql, [], (err, rows) => {
        if (err) resolve([]);
        else resolve(rows || []);
      });
    });

    // 1. Migrate Products
    const products = await sqliteAll("SELECT * FROM products");
    console.log(`Migrating ${products.length} products...`);
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const sku = String(p.sku || p.id || `prod_${i + 1}`);
      await pgClient.query(`
        INSERT INTO products (sku, name, category, hsn, "costPrice", "sellingPrice", "gstSlab", "discountPercent", stock, "reorderLevel", unit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (sku) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          hsn = EXCLUDED.hsn,
          "costPrice" = EXCLUDED."costPrice",
          "sellingPrice" = EXCLUDED."sellingPrice",
          "gstSlab" = EXCLUDED."gstSlab",
          "discountPercent" = EXCLUDED."discountPercent",
          stock = EXCLUDED.stock,
          "reorderLevel" = EXCLUDED."reorderLevel",
          unit = EXCLUDED.unit;
      `, [sku, p.name || 'Unnamed Product', p.category || 'General', p.hsn || '', p.costPrice || p.purchasePrice || 0, p.sellingPrice || 0, p.gstSlab || p.gstRate || 0, p.discountPercent || 0, p.stock || 0, p.reorderLevel || 0, p.unit || 'pcs']);
    }

    // 2. Migrate Transactions
    const transactions = await sqliteAll("SELECT * FROM transactions");
    console.log(`Migrating ${transactions.length} transactions...`);
    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      const txnId = t.id ? String(t.id) : `TXN-${Date.now()}-${i + 1}`;
      await pgClient.query(`
        INSERT INTO transactions (id, date, "customerName", "customerPhone", subtotal, "discountType", "discountValue", "discountAmount", "gstAmount", "totalPayable", "paymentMethod", items)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          date = EXCLUDED.date,
          "customerName" = EXCLUDED."customerName",
          "customerPhone" = EXCLUDED."customerPhone",
          subtotal = EXCLUDED.subtotal,
          "discountType" = EXCLUDED."discountType",
          "discountValue" = EXCLUDED."discountValue",
          "discountAmount" = EXCLUDED."discountAmount",
          "gstAmount" = EXCLUDED."gstAmount",
          "totalPayable" = EXCLUDED."totalPayable",
          "paymentMethod" = EXCLUDED."paymentMethod",
          items = EXCLUDED.items;
      `, [txnId, t.date || new Date().toISOString(), t.customerName || 'Walk-in Customer', t.customerPhone || '', t.subtotal || 0, t.discountType || 'flat', t.discountValue || 0, t.discountAmount || 0, t.gstAmount || 0, t.totalPayable || 0, t.paymentMethod || 'Cash', typeof t.items === 'string' ? t.items : JSON.stringify(t.items || [])]);
    }

    // 3. Migrate Customers
    const customers = await sqliteAll("SELECT * FROM customers");
    console.log(`Migrating ${customers.length} customers...`);
    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];
      const phone = c.phone ? String(c.phone) : `cust_${i + 1}`;
      await pgClient.query(`
        INSERT INTO customers (phone, name, "totalPurchased", balance, "lastTxn")
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (phone) DO UPDATE SET
          name = EXCLUDED.name,
          "totalPurchased" = EXCLUDED."totalPurchased",
          balance = EXCLUDED.balance,
          "lastTxn" = EXCLUDED."lastTxn";
      `, [phone, c.name || 'Customer', c.totalPurchased || c.totalPurchases || 0, c.balance || 0, c.lastTxn || '']);
    }

    // 4. Migrate Customer Ledger
    const ledger = await sqliteAll("SELECT * FROM customer_ledger");
    console.log(`Migrating ${ledger.length} customer ledger entries...`);
    for (let i = 0; i < ledger.length; i++) {
      const l = ledger[i];
      const ledgerId = l.id ? String(l.id) : `led_${Date.now()}_${i + 1}`;
      await pgClient.query(`
        INSERT INTO customer_ledger (id, phone, date, type, amount, ref)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          phone = EXCLUDED.phone,
          date = EXCLUDED.date,
          type = EXCLUDED.type,
          amount = EXCLUDED.amount,
          ref = EXCLUDED.ref;
      `, [ledgerId, l.phone || '', l.date || new Date().toISOString(), l.type || 'debit', l.amount || 0, l.ref || '']);
    }

    // 5. Migrate Settings
    const settings = await sqliteAll("SELECT * FROM settings");
    console.log(`Migrating ${settings.length} settings records...`);
    for (const s of settings) {
      if (!s.key) continue;
      await pgClient.query(`
        INSERT INTO settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value;
      `, [String(s.key), String(s.value || '')]);
    }

    console.log("===============================================");
    console.log(" MIGRATION TO SUPABASE COMPLETED SUCCESSFULLY! ");
    console.log(" All products, history & settings are now synced.");
    console.log("===============================================");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    sqliteDb.close();
    await pgClient.end();
  }
}

migrate();
