const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const dbPath = 'expense_manager.db';
let db;

// Encryption configuration
const ENCRYPTION_KEY = crypto.scryptSync('HomeExpenseManager2025SecureKey', 'salt', 32);
const IV_LENGTH = 16;

// Encrypt data
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt data
function decrypt(text) {
  if (!text) return text;
  const parts = text.split(':');
  if (parts.length !== 2) return text;
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Encrypt database file
function encryptDatabaseFile(buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

// Decrypt database file
function decryptDatabaseFile(buffer) {
  const iv = buffer.slice(0, IV_LENGTH);
  const encryptedData = buffer.slice(IV_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(dbPath)) {
    try {
      const encryptedBuffer = fs.readFileSync(dbPath);
      const buffer = decryptDatabaseFile(encryptedBuffer);
      db = new SQL.Database(buffer);
      console.log('Database loaded and decrypted successfully');
    } catch (error) {
      console.log('Creating new database (decryption failed or new database)');
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      userid TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      is_system INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      is_system INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      category_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      unit_id INTEGER,
      is_system INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (unit_id) REFERENCES units(id)
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      balance REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      category_id INTEGER,
      item_id INTEGER,
      item_ids TEXT,
      price REAL NOT NULL,
      quantity REAL NOT NULL,
      remark TEXT,
      total REAL NOT NULL,
      account_id INTEGER,
      transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_multi_item INTEGER DEFAULT 0,
      is_credit INTEGER DEFAULT 0,
      credit_status TEXT DEFAULT 'paid',
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);
  
  // Migration: Add columns to transactions table
  try {
    const tableInfo = db.exec("PRAGMA table_info(transactions)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('is_credit')) {
        db.run('ALTER TABLE transactions ADD COLUMN is_credit INTEGER DEFAULT 0');
        console.log('Migration: Added is_credit column to transactions table');
      }
      if (!columns.includes('credit_status')) {
        db.run("ALTER TABLE transactions ADD COLUMN credit_status TEXT DEFAULT 'paid'");
        console.log('Migration: Added credit_status column to transactions table');
      }
      if (!columns.includes('transaction_code')) {
        db.run("ALTER TABLE transactions ADD COLUMN transaction_code TEXT");
        console.log('Migration: Added transaction_code column to transactions table');
      }
    }
  } catch (err) {
    console.log('Transaction migration check completed:', err.message);
  }

  // Migration: Make category_id and account_id nullable for Transfer transactions
  try {
    // Check if we need to migrate by looking at the table schema
    const tableInfo = db.exec("PRAGMA table_info(transactions)");
    if (tableInfo.length > 0) {
      const categoryCol = tableInfo[0].values.find(row => row[1] === 'category_id');
      // If category_id has notnull = 1, we need to recreate the table
      if (categoryCol && categoryCol[3] === 1) {
        console.log('Migration: Recreating transactions table to allow NULL category_id and account_id...');

        // Create new table with nullable columns
        db.run(`
          CREATE TABLE IF NOT EXISTS transactions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            category_id INTEGER,
            item_id INTEGER,
            item_ids TEXT,
            price REAL NOT NULL,
            quantity REAL NOT NULL,
            remark TEXT,
            total REAL NOT NULL,
            account_id INTEGER,
            transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_multi_item INTEGER DEFAULT 0,
            is_credit INTEGER DEFAULT 0,
            credit_status TEXT DEFAULT 'paid',
            transaction_code TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (category_id) REFERENCES categories(id),
            FOREIGN KEY (item_id) REFERENCES items(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
          )
        `);

        // Copy data from old table to new table
        db.run(`
          INSERT INTO transactions_new
          SELECT id, user_id, type, category_id, item_id, item_ids, price, quantity, remark, total, account_id, transaction_date, is_multi_item, is_credit, credit_status, transaction_code
          FROM transactions
        `);

        // Drop old table
        db.run('DROP TABLE transactions');

        // Rename new table
        db.run('ALTER TABLE transactions_new RENAME TO transactions');

        console.log('Migration: Transactions table recreated successfully');
      }
    }
  } catch (err) {
    console.log('Nullable columns migration:', err.message);
  }

  // Migration: Add from_account_id and to_account_id columns for transfers
  try {
    const tableInfo = db.exec("PRAGMA table_info(transactions)");
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1]);
      if (!columns.includes('from_account_id')) {
        db.run('ALTER TABLE transactions ADD COLUMN from_account_id INTEGER');
        console.log('Migration: Added from_account_id column to transactions table');
      }
      if (!columns.includes('to_account_id')) {
        db.run('ALTER TABLE transactions ADD COLUMN to_account_id INTEGER');
        console.log('Migration: Added to_account_id column to transactions table');
      }
    }
  } catch (err) {
    console.log('Transfer columns migration:', err.message);
  }

  // Migration: Add columns to categories table
  try {
    const catInfo = db.exec("PRAGMA table_info(categories)");
    if (catInfo.length > 0) {
      const catColumns = catInfo[0].values.map(row => row[1]);
      if (!catColumns.includes('is_enabled')) {
        db.run('ALTER TABLE categories ADD COLUMN is_enabled INTEGER DEFAULT 1');
        console.log('Migration: Added is_enabled column to categories table');
      }
      if (!catColumns.includes('category_code')) {
        db.run("ALTER TABLE categories ADD COLUMN category_code TEXT");
        console.log('Migration: Added category_code column to categories table');
      }
    }
  } catch (err) {
    console.log('Category migration check completed:', err.message);
  }
  
  // Migration: Add columns to items table
  try {
    const itemInfo = db.exec("PRAGMA table_info(items)");
    if (itemInfo.length > 0) {
      const itemColumns = itemInfo[0].values.map(row => row[1]);
      if (!itemColumns.includes('item_code')) {
        db.run("ALTER TABLE items ADD COLUMN item_code TEXT");
        console.log('Migration: Added item_code column to items table');
      }
      if (!itemColumns.includes('is_enabled')) {
        db.run('ALTER TABLE items ADD COLUMN is_enabled INTEGER DEFAULT 1');
        console.log('Migration: Added is_enabled column to items table');
      }
    }
  } catch (err) {
    console.log('Item migration check completed:', err.message);
  }
  
  // Migration: Add columns to units table
  try {
    const unitInfo = db.exec("PRAGMA table_info(units)");
    if (unitInfo.length > 0) {
      const unitColumns = unitInfo[0].values.map(row => row[1]);
      if (!unitColumns.includes('unit_code')) {
        db.run("ALTER TABLE units ADD COLUMN unit_code TEXT");
        console.log('Migration: Added unit_code column to units table');
      }
      if (!unitColumns.includes('is_enabled')) {
        db.run('ALTER TABLE units ADD COLUMN is_enabled INTEGER DEFAULT 1');
        console.log('Migration: Added is_enabled column to units table');
      }
    }
  } catch (err) {
    console.log('Unit migration check completed:', err.message);
  }
  
  // Generate codes for existing records without codes
  generateMissingCodes();
  
  // Insert system units if not exists
  insertSystemData();
  
  saveDatabase();
}

// Code generation helper functions
function generateCategoryCode() {
  const result = db.exec("SELECT category_code FROM categories WHERE category_code IS NOT NULL ORDER BY category_code DESC LIMIT 1");
  if (result.length > 0 && result[0].values.length > 0) {
    const lastCode = result[0].values[0][0];
    const num = parseInt(lastCode.replace('CID', '')) + 1;
    return 'CID' + num.toString().padStart(4, '0');
  }
  return 'CID0001';
}

function generateItemCode(categoryCode) {
  const result = db.exec(`SELECT item_code FROM items WHERE item_code LIKE '${categoryCode}%' ORDER BY item_code DESC LIMIT 1`);
  if (result.length > 0 && result[0].values.length > 0) {
    const lastCode = result[0].values[0][0];
    const itemPart = lastCode.substring(7); // Get IIDxxxx part
    const num = parseInt(itemPart.replace('IID', '')) + 1;
    return categoryCode + 'IID' + num.toString().padStart(4, '0');
  }
  return categoryCode + 'IID0001';
}

function generateUnitCode() {
  const result = db.exec("SELECT unit_code FROM units WHERE unit_code IS NOT NULL ORDER BY unit_code DESC LIMIT 1");
  if (result.length > 0 && result[0].values.length > 0) {
    const lastCode = result[0].values[0][0];
    const num = parseInt(lastCode.replace('UID', '')) + 1;
    return 'UID' + num.toString().padStart(4, '0');
  }
  return 'UID0001';
}

function generateTransactionCode() {
  const now = new Date();
  const dateStr = now.getDate().toString().padStart(2, '0') +
                  (now.getMonth() + 1).toString().padStart(2, '0') +
                  now.getFullYear() +
                  ':' +
                  now.getHours().toString().padStart(2, '0') +
                  ':' +
                  now.getMinutes().toString().padStart(2, '0');
  
  // Get count of transactions for today with same minute
  const pattern = dateStr + '%';
  const result = db.exec(`SELECT COUNT(*) FROM transactions WHERE transaction_code LIKE '${pattern}'`);
  const count = result.length > 0 ? result[0].values[0][0] + 1 : 1;
  
  return dateStr + count.toString().padStart(2, '0');
}

function generateMissingCodes() {
  // Generate codes for categories without codes
  const catsWithoutCode = db.exec("SELECT id FROM categories WHERE category_code IS NULL OR category_code = ''");
  if (catsWithoutCode.length > 0) {
    catsWithoutCode[0].values.forEach(row => {
      const code = generateCategoryCode();
      db.run("UPDATE categories SET category_code = ? WHERE id = ?", [code, row[0]]);
    });
    console.log('Generated codes for existing categories');
  }
  
  // Generate codes for units without codes
  const unitsWithoutCode = db.exec("SELECT id FROM units WHERE unit_code IS NULL OR unit_code = ''");
  if (unitsWithoutCode.length > 0) {
    unitsWithoutCode[0].values.forEach(row => {
      const code = generateUnitCode();
      db.run("UPDATE units SET unit_code = ? WHERE id = ?", [code, row[0]]);
    });
    console.log('Generated codes for existing units');
  }
  
  // Generate codes for items without codes
  const itemsWithoutCode = db.exec(`
    SELECT i.id, c.category_code 
    FROM items i 
    JOIN categories c ON i.category_id = c.id 
    WHERE i.item_code IS NULL OR i.item_code = ''
  `);
  if (itemsWithoutCode.length > 0) {
    itemsWithoutCode[0].values.forEach(row => {
      const code = generateItemCode(row[1]);
      db.run("UPDATE items SET item_code = ? WHERE id = ?", [code, row[0]]);
    });
    console.log('Generated codes for existing items');
  }
  
  // Generate codes for transactions without codes
  const transWithoutCode = db.exec("SELECT id FROM transactions WHERE transaction_code IS NULL OR transaction_code = ''");
  if (transWithoutCode.length > 0) {
    transWithoutCode[0].values.forEach(row => {
      const code = generateTransactionCode();
      db.run("UPDATE transactions SET transaction_code = ? WHERE id = ?", [code, row[0]]);
    });
    console.log('Generated codes for existing transactions');
  }
}

// Hardcoded system data
function insertSystemData() {
  // Check if system data already exists
  const checkUnits = db.exec('SELECT COUNT(*) as count FROM units WHERE is_system = 1');
  const unitCount = checkUnits.length > 0 ? checkUnits[0].values[0][0] : 0;
  
  if (unitCount === 0) {
    // System Units
    const systemUnits = [
      'Piece', 'KG', 'Gram', 'Liter', 'ML', 'Dozen', 'Packet', 'Box', 
      'Bag', 'Bottle', 'Can', 'Bundle', 'Meter', 'Feet', 'Inch'
    ];
    
    systemUnits.forEach(unit => {
      db.run('INSERT INTO units (user_id, name, is_system) VALUES (NULL, ?, 1)', [unit]);
    });
  }
  
  const checkCategories = db.exec('SELECT COUNT(*) as count FROM categories WHERE is_system = 1');
  const categoryCount = checkCategories.length > 0 ? checkCategories[0].values[0][0] : 0;
  
  if (categoryCount === 0) {
    // System Categories - Expense (Comprehensive)
    const expenseCategories = [
      'Groceries', 'Food & Dining', 'Transportation', 'Utilities', 
      'Healthcare', 'Entertainment', 'Shopping', 'Education', 
      'Personal Care', 'Home Maintenance', 'Insurance', 'Bills',
      'Kitchen', 'Bedroom', 'Bathroom', 'Living Room', 'Dining Room',
      'Garden & Outdoor', 'Laundry', 'Office Supplies', 'Electronics',
      'Clothing & Apparel', 'Footwear', 'Jewelry & Accessories',
      'Baby & Kids', 'Pets', 'Sports & Fitness', 'Travel & Vacation',
      'Wedding & Events', 'Construction & Renovation', 'Furniture',
      'Appliances', 'Tools & Hardware', 'Automotive', 'Gifts & Donations',
      'Subscriptions', 'Taxes & Fees', 'Legal Services', 'Professional Services',
      'Religious & Spiritual', 'Hobbies & Crafts', 'Books & Stationery',
      'Music & Instruments', 'Photography', 'Art & Decor', 'Safety & Security',
      'Cleaning Supplies', 'Storage & Organization', 'Party & Celebrations'
    ];
    
    expenseCategories.forEach(cat => {
      db.run('INSERT INTO categories (user_id, type, name, is_system) VALUES (NULL, ?, ?, 1)', ['Expense', cat]);
    });
    
    // System Categories - Income (Comprehensive)
    const incomeCategories = [
      'Salary', 'Business', 'Investment', 'Freelance', 
      'Rental Income', 'Interest', 'Gift', 'Other Income',
      'Pension', 'Dividends', 'Royalties', 'Commission',
      'Consulting', 'Part-time Job', 'Side Hustle', 'Bonus',
      'Inheritance', 'Lottery & Winnings', 'Refunds', 'Cashback',
      'Government Benefits', 'Scholarships', 'Grants', 'Sponsorship'
    ];
    
    incomeCategories.forEach(cat => {
      db.run('INSERT INTO categories (user_id, type, name, is_system) VALUES (NULL, ?, ?, 1)', ['Income', cat]);
    });
  }
  
  const checkItems = db.exec('SELECT COUNT(*) as count FROM items WHERE is_system = 1');
  const itemCount = checkItems.length > 0 ? checkItems[0].values[0][0] : 0;
  
  if (itemCount === 0) {
    // Get category IDs for system items
    const categories = queryToObjects(db.exec('SELECT * FROM categories WHERE is_system = 1'));
    const units = queryToObjects(db.exec('SELECT * FROM units WHERE is_system = 1'));
    
    // Helper to find IDs
    const getCategoryId = (name) => categories.find(c => c.name === name)?.id;
    const getUnitId = (name) => units.find(u => u.name === name)?.id;
    
    // System Items - Groceries
    const groceryItems = [
      { name: 'Rice', unit: 'KG' },
      { name: 'Wheat Flour', unit: 'KG' },
      { name: 'Sugar', unit: 'KG' },
      { name: 'Salt', unit: 'KG' },
      { name: 'Cooking Oil', unit: 'Liter' },
      { name: 'Milk', unit: 'Liter' },
      { name: 'Eggs', unit: 'Dozen' },
      { name: 'Vegetables', unit: 'KG' },
      { name: 'Fruits', unit: 'KG' },
      { name: 'Bread', unit: 'Piece' },
      { name: 'Tea', unit: 'Packet' },
      { name: 'Coffee', unit: 'Packet' },
      { name: 'Butter', unit: 'Packet' },
      { name: 'Cheese', unit: 'Packet' },
      { name: 'Yogurt/Curd', unit: 'Liter' },
      { name: 'Paneer', unit: 'KG' },
      { name: 'Chicken', unit: 'KG' },
      { name: 'Fish', unit: 'KG' },
      { name: 'Mutton', unit: 'KG' },
      { name: 'Pulses/Dal', unit: 'KG' },
      { name: 'Spices', unit: 'Packet' },
      { name: 'Dry Fruits', unit: 'KG' },
      { name: 'Biscuits', unit: 'Packet' },
      { name: 'Noodles/Pasta', unit: 'Packet' },
      { name: 'Sauce/Ketchup', unit: 'Bottle' },
      { name: 'Jam', unit: 'Bottle' },
      { name: 'Honey', unit: 'Bottle' },
      { name: 'Pickles', unit: 'Bottle' },
      { name: 'Ghee', unit: 'Liter' },
      { name: 'Flour (Other)', unit: 'KG' },
      { name: 'Cereals', unit: 'Packet' },
      { name: 'Juice', unit: 'Liter' },
      { name: 'Soft Drinks', unit: 'Liter' },
      { name: 'Water Bottles', unit: 'Piece' },
      { name: 'Ice Cream', unit: 'Piece' },
      { name: 'Frozen Foods', unit: 'Packet' }
    ];
    
    const groceryCatId = getCategoryId('Groceries');
    groceryItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [groceryCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Food & Dining
    const foodItems = [
      { name: 'Restaurant', unit: 'Piece' },
      { name: 'Fast Food', unit: 'Piece' },
      { name: 'Snacks', unit: 'Piece' },
      { name: 'Beverages', unit: 'Piece' },
      { name: 'Cafe/Coffee Shop', unit: 'Piece' },
      { name: 'Street Food', unit: 'Piece' },
      { name: 'Bakery Items', unit: 'Piece' },
      { name: 'Pizza/Burger', unit: 'Piece' },
      { name: 'Chinese Food', unit: 'Piece' },
      { name: 'Breakfast Outside', unit: 'Piece' },
      { name: 'Lunch Outside', unit: 'Piece' },
      { name: 'Dinner Outside', unit: 'Piece' },
      { name: 'Food Delivery', unit: 'Piece' },
      { name: 'Desserts', unit: 'Piece' },
      { name: 'Tea/Coffee', unit: 'Piece' }
    ];
    
    const foodCatId = getCategoryId('Food & Dining');
    foodItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [foodCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Transportation
    const transportItems = [
      { name: 'Petrol', unit: 'Liter' },
      { name: 'Diesel', unit: 'Liter' },
      { name: 'CNG', unit: 'KG' },
      { name: 'Bus Fare', unit: 'Piece' },
      { name: 'Train Fare', unit: 'Piece' },
      { name: 'Metro Fare', unit: 'Piece' },
      { name: 'Auto Rickshaw', unit: 'Piece' },
      { name: 'Taxi/Cab', unit: 'Piece' },
      { name: 'Bike Taxi', unit: 'Piece' },
      { name: 'Parking Fee', unit: 'Piece' },
      { name: 'Toll Tax', unit: 'Piece' },
      { name: 'Vehicle Service', unit: 'Piece' },
      { name: 'Vehicle Repair', unit: 'Piece' },
      { name: 'Vehicle Washing', unit: 'Piece' },
      { name: 'Tire/Battery', unit: 'Piece' },
      { name: 'Vehicle Parts', unit: 'Piece' },
      { name: 'Flight Tickets', unit: 'Piece' },
      { name: 'Hotel/Accommodation', unit: 'Piece' }
    ];
    
    const transportCatId = getCategoryId('Transportation');
    transportItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [transportCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Utilities
    const utilityItems = [
      { name: 'Electricity Bill', unit: 'Piece' },
      { name: 'Water Bill', unit: 'Piece' },
      { name: 'Gas Bill', unit: 'Piece' },
      { name: 'Internet Bill', unit: 'Piece' },
      { name: 'Phone Bill', unit: 'Piece' }
    ];
    
    const utilityCatId = getCategoryId('Utilities');
    utilityItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [utilityCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Healthcare
    const healthItems = [
      { name: 'Medicine', unit: 'Piece' },
      { name: 'Doctor Consultation', unit: 'Piece' },
      { name: 'Medical Tests', unit: 'Piece' },
      { name: 'Health Supplements', unit: 'Piece' },
      { name: 'Vitamins', unit: 'Piece' },
      { name: 'Hospital Bills', unit: 'Piece' },
      { name: 'Dental Care', unit: 'Piece' },
      { name: 'Eye Care', unit: 'Piece' },
      { name: 'Physiotherapy', unit: 'Piece' },
      { name: 'X-Ray/Scan', unit: 'Piece' },
      { name: 'Blood Test', unit: 'Piece' },
      { name: 'Vaccination', unit: 'Piece' },
      { name: 'First Aid', unit: 'Piece' },
      { name: 'Medical Equipment', unit: 'Piece' }
    ];
    
    const healthCatId = getCategoryId('Healthcare');
    healthItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [healthCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Income Categories
    const salaryItems = [
      { name: 'Monthly Salary', unit: 'Piece' },
      { name: 'Bonus', unit: 'Piece' },
      { name: 'Overtime', unit: 'Piece' }
    ];
    
    const salaryCatId = getCategoryId('Salary');
    salaryItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [salaryCatId, 'Income', item.name, getUnitId(item.unit)]);
    });
    
    const businessItems = [
      { name: 'Sales', unit: 'Piece' },
      { name: 'Service Income', unit: 'Piece' },
      { name: 'Commission', unit: 'Piece' }
    ];
    
    const businessCatId = getCategoryId('Business');
    businessItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [businessCatId, 'Income', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Entertainment
    const entertainmentItems = [
      { name: 'Movie Tickets', unit: 'Piece' },
      { name: 'Concert/Events', unit: 'Piece' },
      { name: 'Streaming Services', unit: 'Piece' },
      { name: 'Gaming', unit: 'Piece' },
      { name: 'Sports Activities', unit: 'Piece' },
      { name: 'Hobbies', unit: 'Piece' },
      { name: 'Books/Magazines', unit: 'Piece' },
      { name: 'Music', unit: 'Piece' }
    ];
    
    const entertainmentCatId = getCategoryId('Entertainment');
    entertainmentItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [entertainmentCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Shopping
    const shoppingItems = [
      { name: 'Clothing', unit: 'Piece' },
      { name: 'Footwear', unit: 'Piece' },
      { name: 'Accessories', unit: 'Piece' },
      { name: 'Electronics', unit: 'Piece' },
      { name: 'Home Appliances', unit: 'Piece' },
      { name: 'Furniture', unit: 'Piece' },
      { name: 'Gifts', unit: 'Piece' },
      { name: 'Jewelry', unit: 'Piece' },
      { name: 'Bags/Luggage', unit: 'Piece' },
      { name: 'Stationery', unit: 'Piece' }
    ];
    
    const shoppingCatId = getCategoryId('Shopping');
    shoppingItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [shoppingCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Education
    const educationItems = [
      { name: 'School Fees', unit: 'Piece' },
      { name: 'College Fees', unit: 'Piece' },
      { name: 'Tuition Classes', unit: 'Piece' },
      { name: 'Books', unit: 'Piece' },
      { name: 'Stationery', unit: 'Piece' },
      { name: 'Online Courses', unit: 'Piece' },
      { name: 'Exam Fees', unit: 'Piece' },
      { name: 'Study Materials', unit: 'Piece' },
      { name: 'School Supplies', unit: 'Piece' },
      { name: 'Uniform', unit: 'Piece' }
    ];
    
    const educationCatId = getCategoryId('Education');
    educationItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [educationCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Personal Care
    const personalCareItems = [
      { name: 'Haircut/Salon', unit: 'Piece' },
      { name: 'Cosmetics', unit: 'Piece' },
      { name: 'Toiletries', unit: 'Piece' },
      { name: 'Soap/Shampoo', unit: 'Piece' },
      { name: 'Toothpaste', unit: 'Piece' },
      { name: 'Skincare', unit: 'Piece' },
      { name: 'Perfume/Deodorant', unit: 'Piece' },
      { name: 'Spa/Massage', unit: 'Piece' },
      { name: 'Grooming Products', unit: 'Piece' }
    ];
    
    const personalCareCatId = getCategoryId('Personal Care');
    personalCareItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [personalCareCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Home Maintenance
    const homeMaintenanceItems = [
      { name: 'Repairs', unit: 'Piece' },
      { name: 'Painting', unit: 'Piece' },
      { name: 'Plumbing', unit: 'Piece' },
      { name: 'Electrical Work', unit: 'Piece' },
      { name: 'Cleaning Services', unit: 'Piece' },
      { name: 'Pest Control', unit: 'Piece' },
      { name: 'Gardening', unit: 'Piece' },
      { name: 'Home Improvement', unit: 'Piece' },
      { name: 'Carpentry', unit: 'Piece' },
      { name: 'AC/Heater Maintenance', unit: 'Piece' }
    ];
    
    const homeMaintenanceCatId = getCategoryId('Home Maintenance');
    homeMaintenanceItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [homeMaintenanceCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Insurance
    const insuranceItems = [
      { name: 'Life Insurance', unit: 'Piece' },
      { name: 'Health Insurance', unit: 'Piece' },
      { name: 'Vehicle Insurance', unit: 'Piece' },
      { name: 'Home Insurance', unit: 'Piece' },
      { name: 'Travel Insurance', unit: 'Piece' },
      { name: 'Term Insurance', unit: 'Piece' }
    ];
    
    const insuranceCatId = getCategoryId('Insurance');
    insuranceItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [insuranceCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Bills
    const billsItems = [
      { name: 'Credit Card Bill', unit: 'Piece' },
      { name: 'Loan EMI', unit: 'Piece' },
      { name: 'Rent', unit: 'Piece' },
      { name: 'Society Maintenance', unit: 'Piece' },
      { name: 'Property Tax', unit: 'Piece' },
      { name: 'DTH/Cable TV', unit: 'Piece' },
      { name: 'Newspaper', unit: 'Piece' },
      { name: 'Subscription Services', unit: 'Piece' }
    ];
    
    const billsCatId = getCategoryId('Bills');
    billsItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [billsCatId, 'Expense', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Investment (Income)
    const investmentItems = [
      { name: 'Stock Dividends', unit: 'Piece' },
      { name: 'Mutual Fund Returns', unit: 'Piece' },
      { name: 'Fixed Deposit Interest', unit: 'Piece' },
      { name: 'Capital Gains', unit: 'Piece' },
      { name: 'Crypto Returns', unit: 'Piece' },
      { name: 'Bond Interest', unit: 'Piece' }
    ];
    
    const investmentCatId = getCategoryId('Investment');
    investmentItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [investmentCatId, 'Income', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Freelance (Income)
    const freelanceItems = [
      { name: 'Project Payment', unit: 'Piece' },
      { name: 'Consulting Fee', unit: 'Piece' },
      { name: 'Design Work', unit: 'Piece' },
      { name: 'Writing/Content', unit: 'Piece' },
      { name: 'Programming', unit: 'Piece' },
      { name: 'Teaching/Training', unit: 'Piece' }
    ];
    
    const freelanceCatId = getCategoryId('Freelance');
    freelanceItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [freelanceCatId, 'Income', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Rental Income
    const rentalIncomeItems = [
      { name: 'House Rent', unit: 'Piece' },
      { name: 'Shop Rent', unit: 'Piece' },
      { name: 'Property Rent', unit: 'Piece' },
      { name: 'Vehicle Rent', unit: 'Piece' },
      { name: 'Equipment Rent', unit: 'Piece' }
    ];
    
    const rentalIncomeCatId = getCategoryId('Rental Income');
    rentalIncomeItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [rentalIncomeCatId, 'Income', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Interest (Income)
    const interestItems = [
      { name: 'Savings Account Interest', unit: 'Piece' },
      { name: 'Fixed Deposit Interest', unit: 'Piece' },
      { name: 'Loan Interest Received', unit: 'Piece' },
      { name: 'PPF Interest', unit: 'Piece' }
    ];
    
    const interestCatId = getCategoryId('Interest');
    interestItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [interestCatId, 'Income', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Gift (Income)
    const giftItems = [
      { name: 'Birthday Gift', unit: 'Piece' },
      { name: 'Wedding Gift', unit: 'Piece' },
      { name: 'Festival Gift', unit: 'Piece' },
      { name: 'Cash Gift', unit: 'Piece' },
      { name: 'Prize/Award', unit: 'Piece' }
    ];
    
    const giftCatId = getCategoryId('Gift');
    giftItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [giftCatId, 'Income', item.name, getUnitId(item.unit)]);
    });
    
    // System Items - Other Income
    const otherIncomeItems = [
      { name: 'Refund', unit: 'Piece' },
      { name: 'Cashback', unit: 'Piece' },
      { name: 'Reimbursement', unit: 'Piece' },
      { name: 'Lottery/Winnings', unit: 'Piece' },
      { name: 'Miscellaneous Income', unit: 'Piece' }
    ];
    
    const otherIncomeCatId = getCategoryId('Other Income');
    otherIncomeItems.forEach(item => {
      db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
        [otherIncomeCatId, 'Income', item.name, getUnitId(item.unit)]);
    });
    
    // Kitchen Items
    const kitchenItems = [
      'Cookware Set', 'Frying Pan', 'Pressure Cooker', 'Kadai', 'Tawa', 'Saucepan', 'Stock Pot',
      'Mixing Bowls', 'Cutting Board', 'Kitchen Knives', 'Knife Set', 'Peeler', 'Grater',
      'Spatula', 'Ladle', 'Tongs', 'Whisk', 'Rolling Pin', 'Masher', 'Can Opener',
      'Blender', 'Mixer Grinder', 'Food Processor', 'Juicer', 'Toaster', 'Microwave',
      'Electric Kettle', 'Coffee Maker', 'Rice Cooker', 'Induction Cooktop', 'Gas Stove',
      'Chimney', 'Water Purifier', 'Refrigerator', 'Dishwasher', 'Dish Rack',
      'Storage Containers', 'Spice Rack', 'Kitchen Scale', 'Measuring Cups', 'Measuring Spoons',
      'Colander', 'Strainer', 'Sieve', 'Mortar Pestle', 'Garlic Press', 'Lemon Squeezer',
      'Ice Tray', 'Baking Tray', 'Cake Pan', 'Muffin Tin', 'Oven Mitts', 'Apron',
      'Kitchen Towels', 'Sponge', 'Scrubber', 'Dish Soap', 'Kitchen Cleaner'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const kitchenCatId = getCategoryId('Kitchen');
    if (kitchenCatId) {
      kitchenItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [kitchenCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Bedroom Items
    const bedroomItems = [
      'Bed Frame', 'Mattress', 'Pillow', 'Bed Sheet', 'Blanket', 'Comforter', 'Duvet',
      'Bed Cover', 'Pillow Cover', 'Mosquito Net', 'Wardrobe', 'Dresser', 'Mirror',
      'Nightstand', 'Bedside Lamp', 'Ceiling Fan', 'Air Conditioner', 'Heater',
      'Curtains', 'Curtain Rod', 'Alarm Clock', 'Shoe Rack', 'Clothes Hanger',
      'Laundry Basket', 'Storage Box', 'Carpet', 'Rug', 'Wall Clock', 'Photo Frame'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const bedroomCatId = getCategoryId('Bedroom');
    if (bedroomCatId) {
      bedroomItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [bedroomCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Bathroom Items
    const bathroomItems = [
      'Toilet Seat', 'Wash Basin', 'Bathroom Mirror', 'Shower', 'Bathtub', 'Geyser',
      'Water Heater', 'Towel Rod', 'Soap Dish', 'Toothbrush Holder', 'Toilet Brush',
      'Bathroom Mat', 'Shower Curtain', 'Toilet Paper Holder', 'Dustbin', 'Bucket',
      'Mug', 'Bathroom Tiles', 'Exhaust Fan', 'Bathroom Cabinet', 'Medicine Cabinet',
      'Shampoo', 'Conditioner', 'Body Wash', 'Hand Wash', 'Face Wash', 'Toothpaste',
      'Toothbrush', 'Mouthwash', 'Razor', 'Shaving Cream', 'Aftershave', 'Deodorant',
      'Toilet Cleaner', 'Bathroom Cleaner', 'Air Freshener', 'Plunger', 'Drain Cleaner'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const bathroomCatId = getCategoryId('Bathroom');
    if (bathroomCatId) {
      bathroomItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [bathroomCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Wedding & Events Items
    const weddingItems = [
      'Wedding Venue', 'Catering', 'Wedding Cake', 'Wedding Dress', 'Groom Suit',
      'Wedding Ring', 'Engagement Ring', 'Wedding Invitation', 'Wedding Decoration',
      'Flower Arrangement', 'Wedding Photography', 'Wedding Videography', 'DJ/Music',
      'Wedding Planner', 'Makeup Artist', 'Hair Stylist', 'Mehndi Artist', 'Pandit/Priest',
      'Wedding Car', 'Horse/Carriage', 'Fireworks', 'Wedding Gift', 'Return Gift',
      'Honeymoon Package', 'Wedding Insurance', 'Bridal Jewelry', 'Groom Accessories',
      'Bridesmaid Dress', 'Groomsmen Suit', 'Wedding Shoes', 'Wedding Veil',
      'Guest Accommodation', 'Guest Transportation', 'Wedding Tent', 'Stage Decoration'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const weddingCatId = getCategoryId('Wedding & Events');
    if (weddingCatId) {
      weddingItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [weddingCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Construction & Renovation Items
    const constructionItems = [
      'Cement', 'Sand', 'Bricks', 'Steel Rods', 'Concrete', 'Gravel', 'Stone',
      'Tiles', 'Marble', 'Granite', 'Wood', 'Plywood', 'Paint', 'Primer',
      'Putty', 'Waterproofing', 'Pipes', 'Fittings', 'Electrical Wiring', 'Switches',
      'Sockets', 'MCB', 'Distribution Box', 'Doors', 'Windows', 'Glass',
      'Locks', 'Hinges', 'Handles', 'Nails', 'Screws', 'Bolts', 'Nuts',
      'Ladder', 'Scaffolding', 'Mixer Machine', 'Crane Rental', 'JCB Rental',
      'Architect Fee', 'Engineer Fee', 'Contractor Fee', 'Labor Charges',
      'Building Permit', 'Plan Approval', 'Inspection Fee', 'Safety Equipment'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const constructionCatId = getCategoryId('Construction & Renovation');
    if (constructionCatId) {
      constructionItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [constructionCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Baby & Kids Items
    const babyKidsItems = [
      'Baby Crib', 'Baby Mattress', 'Baby Bedding', 'Baby Blanket', 'Stroller',
      'Car Seat', 'Baby Carrier', 'High Chair', 'Baby Walker', 'Playpen',
      'Baby Monitor', 'Diaper', 'Baby Wipes', 'Baby Powder', 'Baby Oil',
      'Baby Lotion', 'Baby Shampoo', 'Baby Soap', 'Baby Bottle', 'Bottle Sterilizer',
      'Breast Pump', 'Baby Formula', 'Baby Food', 'Sippy Cup', 'Baby Spoon',
      'Bib', 'Baby Clothes', 'Baby Shoes', 'Baby Socks', 'Baby Cap',
      'Toys', 'Stuffed Animals', 'Building Blocks', 'Puzzle', 'Board Games',
      'Bicycle', 'Tricycle', 'Scooter', 'School Bag', 'Lunch Box', 'Water Bottle',
      'Crayons', 'Color Pencils', 'Sketch Pens', 'Drawing Book', 'Story Books'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const babyKidsCatId = getCategoryId('Baby & Kids');
    if (babyKidsCatId) {
      babyKidsItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [babyKidsCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Furniture Items
    const furnitureItems = [
      'Sofa', 'Sofa Set', 'Recliner', 'Armchair', 'Bean Bag', 'Ottoman',
      'Coffee Table', 'Side Table', 'Console Table', 'TV Unit', 'Bookshelf',
      'Display Cabinet', 'Dining Table', 'Dining Chairs', 'Bar Stool', 'Bar Cabinet',
      'Study Table', 'Office Chair', 'Computer Desk', 'Filing Cabinet', 'Bookcase',
      'Shoe Cabinet', 'Coat Rack', 'Umbrella Stand', 'Key Holder', 'Wall Shelf',
      'Corner Shelf', 'Floating Shelf', 'Magazine Rack', 'CD/DVD Rack', 'Wine Rack',
      'Dressing Table', 'Chest of Drawers', 'Trunk', 'Storage Bench', 'Room Divider'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const furnitureCatId = getCategoryId('Furniture');
    if (furnitureCatId) {
      furnitureItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [furnitureCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Electronics Items
    const electronicsItems = [
      'Television', 'Smart TV', 'LED TV', 'Home Theater', 'Soundbar', 'Speaker',
      'Bluetooth Speaker', 'Headphones', 'Earphones', 'Laptop', 'Desktop Computer',
      'Monitor', 'Keyboard', 'Mouse', 'Webcam', 'Printer', 'Scanner', 'Router',
      'Modem', 'Hard Drive', 'Pen Drive', 'Memory Card', 'Tablet', 'iPad',
      'Smartphone', 'Mobile Charger', 'Power Bank', 'Smart Watch', 'Fitness Band',
      'Camera', 'DSLR', 'Tripod', 'Camera Lens', 'Drone', 'Action Camera',
      'Gaming Console', 'Game Controller', 'VR Headset', 'Projector', 'Screen',
      'Stabilizer', 'UPS', 'Inverter', 'Battery', 'Extension Board', 'Surge Protector'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const electronicsCatId = getCategoryId('Electronics');
    if (electronicsCatId) {
      electronicsItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [electronicsCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Appliances Items
    const appliancesItems = [
      'Washing Machine', 'Dryer', 'Iron', 'Steam Iron', 'Vacuum Cleaner',
      'Robot Vacuum', 'Air Purifier', 'Humidifier', 'Dehumidifier', 'Fan',
      'Table Fan', 'Pedestal Fan', 'Ceiling Fan', 'Exhaust Fan', 'Cooler',
      'Air Conditioner', 'Split AC', 'Window AC', 'Portable AC', 'Heater',
      'Room Heater', 'Water Heater', 'Geyser', 'Immersion Rod', 'Water Dispenser',
      'Sewing Machine', 'Embroidery Machine', 'Garment Steamer', 'Shoe Polisher'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const appliancesCatId = getCategoryId('Appliances');
    if (appliancesCatId) {
      appliancesItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [appliancesCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Garden & Outdoor Items
    const gardenItems = [
      'Plants', 'Seeds', 'Fertilizer', 'Pesticide', 'Soil', 'Compost',
      'Flower Pot', 'Planter', 'Watering Can', 'Garden Hose', 'Sprinkler',
      'Lawn Mower', 'Hedge Trimmer', 'Leaf Blower', 'Garden Rake', 'Shovel',
      'Spade', 'Trowel', 'Pruning Shears', 'Garden Gloves', 'Wheelbarrow',
      'Garden Bench', 'Outdoor Table', 'Outdoor Chair', 'Hammock', 'Swing',
      'Umbrella Stand', 'Garden Umbrella', 'BBQ Grill', 'Fire Pit', 'Outdoor Lighting',
      'Solar Lights', 'Pathway Lights', 'Fence', 'Gate', 'Garden Statue', 'Bird Feeder'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const gardenCatId = getCategoryId('Garden & Outdoor');
    if (gardenCatId) {
      gardenItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [gardenCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Sports & Fitness Items
    const sportsItems = [
      'Treadmill', 'Exercise Bike', 'Elliptical', 'Rowing Machine', 'Weight Bench',
      'Dumbbells', 'Barbell', 'Kettlebell', 'Resistance Bands', 'Yoga Mat',
      'Exercise Ball', 'Foam Roller', 'Jump Rope', 'Pull-up Bar', 'Ab Roller',
      'Cricket Bat', 'Cricket Ball', 'Cricket Pads', 'Cricket Gloves', 'Cricket Helmet',
      'Football', 'Basketball', 'Volleyball', 'Tennis Racket', 'Tennis Ball',
      'Badminton Racket', 'Shuttlecock', 'Table Tennis Paddle', 'Golf Club', 'Golf Ball',
      'Swimming Goggles', 'Swimming Cap', 'Swimsuit', 'Cycling Helmet', 'Knee Pads',
      'Elbow Pads', 'Sports Shoes', 'Running Shoes', 'Gym Bag', 'Water Bottle'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const sportsCatId = getCategoryId('Sports & Fitness');
    if (sportsCatId) {
      sportsItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [sportsCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Pets Items
    const petsItems = [
      'Pet Food', 'Pet Treats', 'Pet Bowl', 'Water Bowl', 'Pet Bed', 'Pet House',
      'Pet Cage', 'Aquarium', 'Fish Food', 'Pet Carrier', 'Pet Leash', 'Pet Collar',
      'Pet Harness', 'Pet Toys', 'Scratching Post', 'Litter Box', 'Cat Litter',
      'Pet Shampoo', 'Pet Brush', 'Pet Nail Clipper', 'Pet Medicine', 'Vet Visit',
      'Pet Vaccination', 'Pet Insurance', 'Pet Grooming', 'Pet Training', 'Pet Boarding'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const petsCatId = getCategoryId('Pets');
    if (petsCatId) {
      petsItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [petsCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Automotive Items
    const automotiveItems = [
      'Car', 'Motorcycle', 'Scooter', 'Bicycle', 'Car Insurance', 'Bike Insurance',
      'Registration', 'Road Tax', 'Pollution Check', 'Car Service', 'Bike Service',
      'Engine Oil', 'Brake Oil', 'Coolant', 'Car Wash', 'Car Polish', 'Car Wax',
      'Tire', 'Tube', 'Battery', 'Spark Plug', 'Air Filter', 'Oil Filter',
      'Brake Pad', 'Clutch Plate', 'Headlight', 'Tail Light', 'Indicator',
      'Wiper Blade', 'Car Cover', 'Bike Cover', 'Seat Cover', 'Floor Mat',
      'Car Perfume', 'Phone Holder', 'Dash Cam', 'GPS Navigator', 'Car Charger',
      'Jumper Cable', 'Tire Inflator', 'Tool Kit', 'First Aid Kit', 'Fire Extinguisher'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const automotiveCatId = getCategoryId('Automotive');
    if (automotiveCatId) {
      automotiveItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [automotiveCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Tools & Hardware Items
    const toolsItems = [
      'Hammer', 'Screwdriver Set', 'Wrench Set', 'Pliers', 'Wire Cutter',
      'Drill Machine', 'Drill Bits', 'Saw', 'Hacksaw', 'Measuring Tape',
      'Level', 'Square', 'Chisel', 'File', 'Sandpaper', 'Paint Brush',
      'Paint Roller', 'Spray Gun', 'Glue Gun', 'Soldering Iron', 'Multimeter',
      'Voltage Tester', 'Flashlight', 'Work Light', 'Safety Glasses', 'Work Gloves',
      'Tool Box', 'Tool Belt', 'Step Ladder', 'Extension Ladder', 'Workbench'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const toolsCatId = getCategoryId('Tools & Hardware');
    if (toolsCatId) {
      toolsItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [toolsCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Cleaning Supplies Items
    const cleaningItems = [
      'Broom', 'Mop', 'Bucket', 'Dustpan', 'Duster', 'Cleaning Cloth',
      'Microfiber Cloth', 'Scrub Brush', 'Toilet Brush', 'Window Squeegee',
      'Floor Cleaner', 'Glass Cleaner', 'Bathroom Cleaner', 'Kitchen Cleaner',
      'Disinfectant', 'Bleach', 'Detergent', 'Fabric Softener', 'Stain Remover',
      'Dish Soap', 'Hand Soap', 'Hand Sanitizer', 'Garbage Bags', 'Recycling Bags',
      'Paper Towels', 'Tissues', 'Wet Wipes', 'Rubber Gloves', 'Spray Bottle'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const cleaningCatId = getCategoryId('Cleaning Supplies');
    if (cleaningCatId) {
      cleaningItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [cleaningCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Living Room Items
    const livingRoomItems = [
      'Sofa Set', 'Center Table', 'TV Stand', 'Entertainment Unit', 'Bookcase',
      'Display Shelf', 'Wall Art', 'Painting', 'Photo Frame', 'Wall Clock',
      'Table Lamp', 'Floor Lamp', 'Chandelier', 'Ceiling Light', 'LED Strip',
      'Curtains', 'Blinds', 'Carpet', 'Area Rug', 'Cushion', 'Throw Pillow',
      'Throw Blanket', 'Vase', 'Artificial Plants', 'Candle Holder', 'Incense Holder'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const livingRoomCatId = getCategoryId('Living Room');
    if (livingRoomCatId) {
      livingRoomItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [livingRoomCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Travel & Vacation Items
    const travelItems = [
      'Flight Ticket', 'Train Ticket', 'Bus Ticket', 'Hotel Booking', 'Resort Booking',
      'Airbnb', 'Hostel', 'Car Rental', 'Bike Rental', 'Taxi Fare', 'Uber/Ola',
      'Travel Insurance', 'Visa Fee', 'Passport Fee', 'Tour Package', 'Guide Fee',
      'Sightseeing', 'Museum Entry', 'Theme Park', 'Adventure Activity', 'Water Sports',
      'Luggage', 'Backpack', 'Travel Bag', 'Passport Holder', 'Travel Pillow',
      'Eye Mask', 'Ear Plugs', 'Travel Adapter', 'Packing Cubes', 'Toiletry Bag'
    ].map(name => ({ name, unit: 'Piece' }));
    
    const travelCatId = getCategoryId('Travel & Vacation');
    if (travelCatId) {
      travelItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [travelCatId, 'Expense', item.name, getUnitId(item.unit)]);
      });
    }
    
    // Additional Income Items
    const pensionItems = [
      { name: 'Monthly Pension', unit: 'Piece' },
      { name: 'Pension Arrears', unit: 'Piece' },
      { name: 'Gratuity', unit: 'Piece' }
    ];
    const pensionCatId = getCategoryId('Pension');
    if (pensionCatId) {
      pensionItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [pensionCatId, 'Income', item.name, getUnitId(item.unit)]);
      });
    }
    
    const dividendsItems = [
      { name: 'Stock Dividend', unit: 'Piece' },
      { name: 'Mutual Fund Dividend', unit: 'Piece' },
      { name: 'REIT Dividend', unit: 'Piece' }
    ];
    const dividendsCatId = getCategoryId('Dividends');
    if (dividendsCatId) {
      dividendsItems.forEach(item => {
        db.run('INSERT INTO items (user_id, category_id, type, name, unit_id, is_system) VALUES (NULL, ?, ?, ?, ?, 1)', 
          [dividendsCatId, 'Income', item.name, getUnitId(item.unit)]);
      });
    }
  }
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  const encryptedBuffer = encryptDatabaseFile(buffer);
  fs.writeFileSync(dbPath, encryptedBuffer);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Serve icon.ico from root folder
app.get('/icon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'icon.ico'));
});

app.use(session({
  secret: 'home-expense-manager-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Auth routes
app.post('/api/signup', (req, res) => {
  const { username, password } = req.body;
  const userid = username.toLowerCase().replace(/\s+/g, '');
  
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, userid, password) VALUES (?, ?, ?)', [username, userid, hashedPassword]);
    saveDatabase();
    res.json({ success: true, message: 'Account created successfully' });
  } catch (error) {
    res.status(400).json({ error: 'User ID already exists' });
  }
});

app.post('/api/login', (req, res) => {
  const { userid, password } = req.body;
  
  const result = db.exec('SELECT * FROM users WHERE userid = ?', [userid]);
  
  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const columns = result[0].columns;
  const values = result[0].values[0];
  const user = {};
  columns.forEach((col, idx) => {
    user[col] = values[idx];
  });
  
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/change-password', (req, res) => {
  const { userid, oldPassword, newPassword } = req.body;

  if (!userid || !oldPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long' });
  }

  // Find user
  const result = db.exec('SELECT * FROM users WHERE userid = ?', [userid]);

  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(401).json({ error: 'Invalid User ID' });
  }

  const columns = result[0].columns;
  const values = result[0].values[0];
  const user = {};
  columns.forEach((col, idx) => {
    user[col] = values[idx];
  });

  // Verify old password
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  // Hash new password and update
  const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
  db.run('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, user.id]);

  saveDatabase();
  res.json({ success: true, message: 'Password changed successfully' });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session.userId) {
    res.json({ authenticated: true, username: req.session.username });
  } else {
    res.json({ authenticated: false });
  }
});

// Helper function to convert query results to objects
function queryToObjects(result) {
  if (!result || result.length === 0 || result[0].values.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

// Category routes
app.get('/api/categories', requireAuth, (req, res) => {
  const result = db.exec('SELECT * FROM categories WHERE user_id = ? OR is_system = 1', [req.session.userId]);
  const categories = queryToObjects(result);
  res.json(categories);
});

app.post('/api/categories', requireAuth, (req, res) => {
  const { type, name } = req.body;
  
  // Check for duplicate
  const existing = db.exec(`SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND type = ? AND (user_id = ? OR is_system = 1)`, 
    [name, type, req.session.userId]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return res.status(400).json({ error: 'Category already exists' });
  }
  
  // Generate category code
  const categoryCode = generateCategoryCode();
  
  db.run('INSERT INTO categories (user_id, type, name, is_system, category_code, is_enabled) VALUES (?, ?, ?, 0, ?, 1)', 
    [req.session.userId, type, name, categoryCode]);
  saveDatabase();
  res.json({ success: true, category_code: categoryCode });
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  const { name, is_enabled } = req.body;
  // Allow editing name and enabled status for all categories
  if (is_enabled !== undefined) {
    db.run('UPDATE categories SET is_enabled = ? WHERE id = ?', [is_enabled ? 1 : 0, req.params.id]);
  }
  if (name) {
    db.run('UPDATE categories SET name = ? WHERE id = ?', [name, req.params.id]);
  }
  saveDatabase();
  res.json({ success: true });
});

app.put('/api/categories/:id/toggle', requireAuth, (req, res) => {
  // Toggle enabled status
  db.run('UPDATE categories SET is_enabled = CASE WHEN is_enabled = 1 THEN 0 ELSE 1 END WHERE id = ?', [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  // Check if it's a system category
  const checkResult = db.exec('SELECT is_system FROM categories WHERE id = ?', [req.params.id]);
  if (checkResult.length > 0 && checkResult[0].values.length > 0 && checkResult[0].values[0][0] === 1) {
    return res.status(403).json({ error: 'Cannot delete system categories' });
  }
  db.run('DELETE FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  saveDatabase();
  res.json({ success: true });
});

// Unit routes
app.get('/api/units', requireAuth, (req, res) => {
  const result = db.exec('SELECT * FROM units WHERE user_id = ? OR is_system = 1', [req.session.userId]);
  const units = queryToObjects(result);
  res.json(units);
});

app.post('/api/units', requireAuth, (req, res) => {
  const { name } = req.body;
  
  // Check for duplicate
  const existing = db.exec(`SELECT id FROM units WHERE LOWER(name) = LOWER(?) AND (user_id = ? OR is_system = 1)`, 
    [name, req.session.userId]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return res.status(400).json({ error: 'Unit already exists' });
  }
  
  // Generate unit code
  const unitCode = generateUnitCode();
  
  db.run('INSERT INTO units (user_id, name, is_system, unit_code) VALUES (?, ?, 0, ?)', [req.session.userId, name, unitCode]);
  saveDatabase();
  res.json({ success: true, unit_code: unitCode });
});

app.delete('/api/units/:id', requireAuth, (req, res) => {
  // Check if it's a system unit
  const checkResult = db.exec('SELECT is_system FROM units WHERE id = ?', [req.params.id]);
  if (checkResult.length > 0 && checkResult[0].values.length > 0 && checkResult[0].values[0][0] === 1) {
    return res.status(403).json({ error: 'Cannot delete system units' });
  }
  db.run('DELETE FROM units WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  saveDatabase();
  res.json({ success: true });
});

app.put('/api/units/:id', requireAuth, (req, res) => {
  const { name } = req.body;
  // Allow editing name for all units (including system units)
  db.run('UPDATE units SET name = ? WHERE id = ?', [name, req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

app.put('/api/units/:id/toggle', requireAuth, (req, res) => {
  // Toggle enabled status for units
  db.run('UPDATE units SET is_enabled = CASE WHEN is_enabled = 1 THEN 0 ELSE 1 END WHERE id = ?', [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

// Item routes
app.get('/api/items', requireAuth, (req, res) => {
  const result = db.exec(`
    SELECT items.*, categories.name as category_name, units.name as unit_name 
    FROM items 
    LEFT JOIN categories ON items.category_id = categories.id
    LEFT JOIN units ON items.unit_id = units.id
    WHERE items.user_id = ? OR items.is_system = 1
  `, [req.session.userId]);
  const items = queryToObjects(result);
  res.json(items);
});

app.post('/api/items', requireAuth, (req, res) => {
  const { type, category_id, name, unit_id } = req.body;
  
  // Check for duplicate
  const existing = db.exec(`SELECT id FROM items WHERE LOWER(name) = LOWER(?) AND category_id = ? AND (user_id = ? OR is_system = 1)`, 
    [name, category_id, req.session.userId]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return res.status(400).json({ error: 'Item already exists in this category' });
  }
  
  // Get category code for item code generation
  const catResult = db.exec('SELECT category_code FROM categories WHERE id = ?', [category_id]);
  const categoryCode = catResult.length > 0 && catResult[0].values.length > 0 ? catResult[0].values[0][0] : 'CID0000';
  
  // Generate item code
  const itemCode = generateItemCode(categoryCode);
  
  db.run('INSERT INTO items (user_id, type, category_id, name, unit_id, is_system, item_code) VALUES (?, ?, ?, ?, ?, 0, ?)', 
    [req.session.userId, type, category_id, name, unit_id, itemCode]);
  saveDatabase();
  res.json({ success: true, item_code: itemCode });
});

app.put('/api/items/:id', requireAuth, (req, res) => {
  const { name } = req.body;
  // Allow editing name for all items (including system items)
  db.run('UPDATE items SET name = ? WHERE id = ?', [name, req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  // Check if it's a system item
  const checkResult = db.exec('SELECT is_system FROM items WHERE id = ?', [req.params.id]);
  if (checkResult.length > 0 && checkResult[0].values.length > 0 && checkResult[0].values[0][0] === 1) {
    return res.status(403).json({ error: 'Cannot delete system items' });
  }
  db.run('DELETE FROM items WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
  saveDatabase();
  res.json({ success: true });
});

app.put('/api/items/:id/toggle', requireAuth, (req, res) => {
  // Toggle enabled status for items
  db.run('UPDATE items SET is_enabled = CASE WHEN is_enabled = 1 THEN 0 ELSE 1 END WHERE id = ?', [req.params.id]);
  saveDatabase();
  res.json({ success: true });
});

// Account routes
app.get('/api/accounts', requireAuth, (req, res) => {
  const result = db.exec('SELECT * FROM accounts WHERE user_id = ?', [req.session.userId]);
  const accounts = queryToObjects(result);
  res.json(accounts);
});

app.post('/api/accounts', requireAuth, (req, res) => {
  const { type, name, bank_name, account_number, balance } = req.body;
  db.run('INSERT INTO accounts (user_id, type, name, bank_name, account_number, balance) VALUES (?, ?, ?, ?, ?, ?)', 
    [req.session.userId, type, name, bank_name || null, account_number || null, balance]);
  saveDatabase();
  res.json({ success: true });
});

app.put('/api/accounts/:id', requireAuth, (req, res) => {
  const { type, name, bank_name, account_number, balance } = req.body;
  db.run('UPDATE accounts SET type = ?, name = ?, bank_name = ?, account_number = ?, balance = ? WHERE id = ? AND user_id = ?', 
    [type, name, bank_name || null, account_number || null, balance, req.params.id, req.session.userId]);
  saveDatabase();
  res.json({ success: true });
});

app.delete('/api/accounts/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM accounts WHERE id = ? AND user_id = ?', 
    [req.params.id, req.session.userId]);
  saveDatabase();
  res.json({ success: true });
});

// Transaction routes
app.get('/api/transactions', requireAuth, (req, res) => {
  const result = db.exec(`
    SELECT transactions.*,
           categories.name as category_name,
           items.name as item_name,
           units.name as unit_name,
           accounts.name as account_name,
           from_acc.name as from_account_name,
           to_acc.name as to_account_name
    FROM transactions
    LEFT JOIN categories ON transactions.category_id = categories.id
    LEFT JOIN items ON transactions.item_id = items.id
    LEFT JOIN units ON items.unit_id = units.id
    LEFT JOIN accounts ON transactions.account_id = accounts.id
    LEFT JOIN accounts as from_acc ON transactions.from_account_id = from_acc.id
    LEFT JOIN accounts as to_acc ON transactions.to_account_id = to_acc.id
    WHERE transactions.user_id = ?
    ORDER BY transactions.transaction_date DESC
  `, [req.session.userId]);
  const transactions = queryToObjects(result);
  res.json(transactions);
});

app.post('/api/transactions', requireAuth, (req, res) => {
  const { type, category_id, item_id, item_ids, price, quantity, remark, total, account_id, transaction_date, is_multi_item, is_credit } = req.body;

  // Handle null/undefined values
  const safeItemId = item_id || null;
  const safeItemIds = item_ids || null;
  const safeRemark = remark || null;
  const safeIsMultiItem = is_multi_item ? 1 : 0;
  const isCredit = is_credit ? 1 : 0;
  const creditStatus = isCredit ? 'pending' : 'paid';
  const safeAccountId = account_id;

  // Check for insufficient balance on Expense transactions (not on credit)
  if (type === 'Expense' && !isCredit && safeAccountId) {
    const accountResult = db.exec('SELECT balance FROM accounts WHERE id = ? AND user_id = ?', [safeAccountId, req.session.userId]);
    if (accountResult.length > 0 && accountResult[0].values.length > 0) {
      const currentBalance = accountResult[0].values[0][0];
      if (currentBalance < total) {
        return res.status(400).json({
          error: 'Insufficient Balance',
          message: `Account balance (₹${currentBalance.toFixed(2)}) is less than transaction amount (₹${total.toFixed(2)})`
        });
      }
    }
  }

  // Generate transaction code
  const transactionCode = generateTransactionCode();

  // Use provided date or current timestamp
  if (transaction_date) {
    db.run('INSERT INTO transactions (user_id, type, category_id, item_id, item_ids, price, quantity, remark, total, account_id, transaction_date, is_multi_item, is_credit, credit_status, transaction_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.session.userId, type, category_id, safeItemId, safeItemIds, price, quantity, safeRemark, total, safeAccountId, transaction_date, safeIsMultiItem, isCredit, creditStatus, transactionCode]);
  } else {
    db.run('INSERT INTO transactions (user_id, type, category_id, item_id, item_ids, price, quantity, remark, total, account_id, is_multi_item, is_credit, credit_status, transaction_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.session.userId, type, category_id, safeItemId, safeItemIds, price, quantity, safeRemark, total, safeAccountId, safeIsMultiItem, isCredit, creditStatus, transactionCode]);
  }

  // Only update balance if not on credit
  if (!isCredit && safeAccountId) {
    const balanceChange = type === 'Income' ? total : -total;
    db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
      [balanceChange, safeAccountId, req.session.userId]);
  }

  saveDatabase();
  res.json({ success: true, transaction_code: transactionCode });
});

app.put('/api/transactions/:id/pay', requireAuth, (req, res) => {
  const { account_id } = req.body;
  const transactionId = req.params.id;
  
  // Get transaction
  const currentTrans = db.exec('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [transactionId, req.session.userId]);
  
  if (currentTrans.length === 0 || currentTrans[0].values.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  const columns = currentTrans[0].columns;
  const values = currentTrans[0].values[0];
  const transaction = {};
  columns.forEach((col, idx) => {
    transaction[col] = values[idx];
  });
  
  if (transaction.credit_status !== 'pending') {
    return res.status(400).json({ error: 'Transaction is not pending' });
  }
  
  // Update transaction
  db.run('UPDATE transactions SET account_id = ?, is_credit = 0, credit_status = ? WHERE id = ? AND user_id = ?', 
    [account_id, 'paid', transactionId, req.session.userId]);
  
  // Update account balance
  const balanceChange = transaction.type === 'Income' ? transaction.total : -transaction.total;
  db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?', 
    [balanceChange, account_id, req.session.userId]);
  
  saveDatabase();
  res.json({ success: true });
});

app.put('/api/transactions/:id', requireAuth, (req, res) => {
  const { price, quantity, remark, is_credit, account_id } = req.body;
  const transactionId = req.params.id;

  // Get current transaction to calculate balance change
  const currentTrans = db.exec('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [transactionId, req.session.userId]);

  if (currentTrans.length === 0 || currentTrans[0].values.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const columns = currentTrans[0].columns;
  const values = currentTrans[0].values[0];
  const transaction = {};
  columns.forEach((col, idx) => {
    transaction[col] = values[idx];
  });

  const newTotal = price * quantity;
  const oldTotal = transaction.total;
  const type = transaction.type;
  const safeRemark = remark || null;

  const wasOnCredit = transaction.credit_status === 'pending';
  const willBeOnCredit = is_credit === true;

  // Determine credit status changes
  if (wasOnCredit && !willBeOnCredit) {
    // Was on credit, now being paid - need to deduct from account
    if (!account_id) {
      return res.status(400).json({ error: 'Account is required when paying off credit' });
    }

    // Check account balance for Expense
    if (type === 'Expense') {
      const accResult = db.exec('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [account_id, req.session.userId]);
      if (accResult.length > 0 && accResult[0].values.length > 0) {
        const accCols = accResult[0].columns;
        const accVals = accResult[0].values[0];
        const acc = {};
        accCols.forEach((col, idx) => { acc[col] = accVals[idx]; });

        if (acc.balance < newTotal) {
          return res.status(400).json({
            error: 'Insufficient Balance',
            message: `Account "${acc.name}" has only ₹${acc.balance.toFixed(2)}, but the transaction amount is ₹${newTotal.toFixed(2)}.`
          });
        }
      }
    }

    // Update transaction
    db.run('UPDATE transactions SET price = ?, quantity = ?, remark = ?, total = ?, account_id = ?, is_credit = 0, credit_status = ? WHERE id = ? AND user_id = ?',
      [price, quantity, safeRemark, newTotal, account_id, 'paid', transactionId, req.session.userId]);

    // Deduct from account (for Expense) or add to account (for Income)
    const balanceChange = type === 'Income' ? newTotal : -newTotal;
    db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
      [balanceChange, account_id, req.session.userId]);

  } else if (!wasOnCredit && willBeOnCredit) {
    // Was paid, now changing to credit - need to reverse the balance

    // Reverse the old balance change
    if (transaction.account_id) {
      const reverseChange = type === 'Income' ? -oldTotal : oldTotal;
      db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
        [reverseChange, transaction.account_id, req.session.userId]);
    }

    // Update transaction to credit
    db.run('UPDATE transactions SET price = ?, quantity = ?, remark = ?, total = ?, account_id = NULL, is_credit = 1, credit_status = ? WHERE id = ? AND user_id = ?',
      [price, quantity, safeRemark, newTotal, 'pending', transactionId, req.session.userId]);

  } else if (!wasOnCredit && !willBeOnCredit) {
    // Was paid, still paid - adjust balance for price/quantity changes
    const targetAccountId = account_id || transaction.account_id;

    // Check if account changed
    if (account_id && account_id != transaction.account_id) {
      // Account changed - reverse old and apply to new

      // Check new account balance for Expense
      if (type === 'Expense') {
        const accResult = db.exec('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [account_id, req.session.userId]);
        if (accResult.length > 0 && accResult[0].values.length > 0) {
          const accCols = accResult[0].columns;
          const accVals = accResult[0].values[0];
          const acc = {};
          accCols.forEach((col, idx) => { acc[col] = accVals[idx]; });

          if (acc.balance < newTotal) {
            return res.status(400).json({
              error: 'Insufficient Balance',
              message: `Account "${acc.name}" has only ₹${acc.balance.toFixed(2)}, but the transaction amount is ₹${newTotal.toFixed(2)}.`
            });
          }
        }
      }

      // Reverse from old account
      const reverseChange = type === 'Income' ? -oldTotal : oldTotal;
      db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
        [reverseChange, transaction.account_id, req.session.userId]);

      // Apply to new account
      const newChange = type === 'Income' ? newTotal : -newTotal;
      db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
        [newChange, account_id, req.session.userId]);
    } else {
      // Same account - just adjust for difference
      const oldBalanceChange = type === 'Income' ? oldTotal : -oldTotal;
      const newBalanceChange = type === 'Income' ? newTotal : -newTotal;
      const balanceDifference = newBalanceChange - oldBalanceChange;

      if (balanceDifference !== 0) {
        // Check balance for Expense increase
        if (type === 'Expense' && balanceDifference < 0) {
          const accResult = db.exec('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [targetAccountId, req.session.userId]);
          if (accResult.length > 0 && accResult[0].values.length > 0) {
            const accCols = accResult[0].columns;
            const accVals = accResult[0].values[0];
            const acc = {};
            accCols.forEach((col, idx) => { acc[col] = accVals[idx]; });

            if (acc.balance < Math.abs(balanceDifference)) {
              return res.status(400).json({
                error: 'Insufficient Balance',
                message: `Account "${acc.name}" has only ₹${acc.balance.toFixed(2)}, but ₹${Math.abs(balanceDifference).toFixed(2)} more is needed.`
              });
            }
          }
        }

        db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
          [balanceDifference, targetAccountId, req.session.userId]);
      }
    }

    // Update transaction
    db.run('UPDATE transactions SET price = ?, quantity = ?, remark = ?, total = ?, account_id = ? WHERE id = ? AND user_id = ?',
      [price, quantity, safeRemark, newTotal, targetAccountId, transactionId, req.session.userId]);

  } else {
    // Was credit, still credit - just update price/quantity/remark
    db.run('UPDATE transactions SET price = ?, quantity = ?, remark = ?, total = ? WHERE id = ? AND user_id = ?',
      [price, quantity, safeRemark, newTotal, transactionId, req.session.userId]);
  }

  saveDatabase();
  res.json({ success: true });
});

app.delete('/api/transactions/:id', requireAuth, (req, res) => {
  const transactionId = req.params.id;

  // Get transaction to reverse balance change
  const currentTrans = db.exec('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [transactionId, req.session.userId]);

  if (currentTrans.length === 0 || currentTrans[0].values.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const columns = currentTrans[0].columns;
  const values = currentTrans[0].values[0];
  const transaction = {};
  columns.forEach((col, idx) => {
    transaction[col] = values[idx];
  });

  // Handle balance reversal based on transaction type
  if (transaction.type === 'Transfer') {
    // For Transfer: reverse by adding back to from_account and subtracting from to_account
    if (transaction.from_account_id) {
      db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
        [transaction.total, transaction.from_account_id, req.session.userId]);
    }
    if (transaction.to_account_id) {
      db.run('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?',
        [transaction.total, transaction.to_account_id, req.session.userId]);
    }
  } else if (transaction.credit_status !== 'pending' && transaction.account_id) {
    // Only reverse balance if transaction was not on credit (i.e., it was paid)
    // For Income: subtract from account (reverse the addition)
    // For Expense: add back to account (reverse the deduction)
    const balanceChange = transaction.type === 'Income' ? -transaction.total : transaction.total;
    db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
      [balanceChange, transaction.account_id, req.session.userId]);
  }
  // If credit_status is 'pending', no balance was changed so nothing to reverse

  // Delete transaction
  db.run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [transactionId, req.session.userId]);

  saveDatabase();
  res.json({ success: true });
});

// Transfer API endpoint
app.post('/api/transfers', requireAuth, (req, res) => {
  const { from_account_id, to_account_id, amount, remark, transaction_date } = req.body;

  if (!from_account_id || !to_account_id || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (from_account_id === to_account_id) {
    return res.status(400).json({ error: 'Source and destination accounts cannot be the same' });
  }

  if (amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }

  // Verify both accounts exist and belong to user
  const fromAccount = db.exec('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [from_account_id, req.session.userId]);
  const toAccount = db.exec('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [to_account_id, req.session.userId]);

  if (fromAccount.length === 0 || fromAccount[0].values.length === 0) {
    return res.status(404).json({ error: 'Source account not found' });
  }

  if (toAccount.length === 0 || toAccount[0].values.length === 0) {
    return res.status(404).json({ error: 'Destination account not found' });
  }

  // Get account details
  const fromCols = fromAccount[0].columns;
  const fromVals = fromAccount[0].values[0];
  const fromAcc = {};
  fromCols.forEach((col, idx) => { fromAcc[col] = fromVals[idx]; });

  const toCols = toAccount[0].columns;
  const toVals = toAccount[0].values[0];
  const toAcc = {};
  toCols.forEach((col, idx) => { toAcc[col] = toVals[idx]; });

  // Check for insufficient balance in source account
  if (fromAcc.balance < amount) {
    return res.status(400).json({
      error: 'Insufficient Balance',
      message: `Source account balance (₹${fromAcc.balance.toFixed(2)}) is less than transfer amount (₹${amount.toFixed(2)})`
    });
  }

  const transferRemark = remark || `${fromAcc.name} → ${toAcc.name}`;
  const transactionDate = transaction_date ? new Date(transaction_date).toISOString() : new Date().toISOString();
  const transactionCode = generateTransactionCode();

  // Create ONE transaction with from_account_id and to_account_id
  db.run(`INSERT INTO transactions (user_id, type, category_id, item_id, price, quantity, remark, total, account_id, from_account_id, to_account_id, transaction_date, is_credit, credit_status, is_multi_item, item_ids, transaction_code)
          VALUES (?, 'Transfer', NULL, NULL, ?, 1, ?, ?, NULL, ?, ?, ?, 0, 'paid', 0, NULL, ?)`,
    [req.session.userId, amount, transferRemark, amount, from_account_id, to_account_id, transactionDate, transactionCode]);

  // Update account balances
  db.run('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?',
    [amount, from_account_id, req.session.userId]);
  db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
    [amount, to_account_id, req.session.userId]);

  saveDatabase();
  res.json({ success: true, transaction_code: transactionCode });
});

// Update Transfer endpoint
app.put('/api/transfers/:id', requireAuth, (req, res) => {
  const transactionId = req.params.id;
  const { from_account_id, to_account_id, amount, remark } = req.body;

  if (!from_account_id || !to_account_id || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (from_account_id === to_account_id) {
    return res.status(400).json({ error: 'Source and destination accounts cannot be the same' });
  }

  // Get the original transfer transaction
  const currentTrans = db.exec('SELECT * FROM transactions WHERE id = ? AND user_id = ? AND type = ?',
    [transactionId, req.session.userId, 'Transfer']);

  if (currentTrans.length === 0 || currentTrans[0].values.length === 0) {
    return res.status(404).json({ error: 'Transfer not found' });
  }

  const columns = currentTrans[0].columns;
  const values = currentTrans[0].values[0];
  const oldTrans = {};
  columns.forEach((col, idx) => {
    oldTrans[col] = values[idx];
  });

  // Get new from account to check balance
  const fromAccResult = db.exec('SELECT * FROM accounts WHERE id = ? AND user_id = ?',
    [from_account_id, req.session.userId]);
  if (fromAccResult.length === 0 || fromAccResult[0].values.length === 0) {
    return res.status(404).json({ error: 'Source account not found' });
  }
  const fromAccCols = fromAccResult[0].columns;
  const fromAccVals = fromAccResult[0].values[0];
  const fromAcc = {};
  fromAccCols.forEach((col, idx) => { fromAcc[col] = fromAccVals[idx]; });

  // Calculate available balance after reversing old transfer
  let availableBalance = fromAcc.balance;
  if (oldTrans.from_account_id == from_account_id) {
    // Same from account - add back the old amount
    availableBalance += oldTrans.total;
  }

  if (availableBalance < amount) {
    return res.status(400).json({
      error: 'Insufficient Balance',
      message: `Account "${fromAcc.name}" has only ₹${availableBalance.toFixed(2)} available, but you are trying to transfer ₹${parseFloat(amount).toFixed(2)}.`
    });
  }

  // Reverse the old transfer balances
  db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
    [oldTrans.total, oldTrans.from_account_id, req.session.userId]);
  db.run('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?',
    [oldTrans.total, oldTrans.to_account_id, req.session.userId]);

  // Apply new transfer balances
  db.run('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?',
    [amount, from_account_id, req.session.userId]);
  db.run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?',
    [amount, to_account_id, req.session.userId]);

  // Get account names for remark
  const toAccResult = db.exec('SELECT name FROM accounts WHERE id = ? AND user_id = ?',
    [to_account_id, req.session.userId]);
  const toAccName = toAccResult.length > 0 && toAccResult[0].values.length > 0 ? toAccResult[0].values[0][0] : 'Unknown';
  const fromAccNameResult = db.exec('SELECT name FROM accounts WHERE id = ? AND user_id = ?',
    [from_account_id, req.session.userId]);
  const fromAccName = fromAccNameResult.length > 0 && fromAccNameResult[0].values.length > 0 ? fromAccNameResult[0].values[0][0] : 'Unknown';

  const transferRemark = remark || `${fromAccName} → ${toAccName}`;

  // Update the transaction
  db.run(`UPDATE transactions SET from_account_id = ?, to_account_id = ?, total = ?, price = ?, remark = ?
          WHERE id = ? AND user_id = ?`,
    [from_account_id, to_account_id, amount, amount, transferRemark, transactionId, req.session.userId]);

  saveDatabase();
  res.json({ success: true });
});

const PORT = 3000;
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Home Expense Manager V1.1 running on http://localhost:${PORT}`);
  });
});
