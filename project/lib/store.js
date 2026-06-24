"use strict";

/**
 * Tiny dependency-free JSON persistence layer.
 *
 * Replaces the original in-memory arrays so that products, orders and
 * transactions survive a Node process restart on Hostinger (the deployment
 * directory is a normal writable disk). It degrades gracefully to pure
 * in-memory mode if the data directory is not writable, so the app can
 * never crash because of storage.
 *
 * For a high-traffic or multi-instance setup, swap this module for a real
 * database (MongoDB/Postgres) — the public API (getProducts, saveOrders, ...)
 * is intentionally small so the call sites in index.js stay unchanged.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

let persistent = true;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // probe write access
  const probe = path.join(DATA_DIR, ".write-probe");
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
} catch (err) {
  persistent = false;
  console.warn(
    `[store] Data directory not writable (${DATA_DIR}). Falling back to in-memory storage. Reason: ${err.message}`
  );
}

const seedProducts = [
  {
    _id: "SP-001",
    name: "Boys Leopard Print Outfit Set - Shirt Shorts with Tie Kids",
    slug: "boys-leopard-print-outfit-set",
    price: 1299,
    mrp: 2499,
    images: ["/uploads/1_1.jpg"],
    category: "Boys' Clothing",
    variants: [{ size: "3-4Y", colour: "Brown", stock: 18 }],
    tags: ["Featured", "boys outfits"],
    isPublished: true,
  },
  {
    _id: "SP-002",
    name: "Boys Graphic Outfit Set - T-Shirt & Shorts Summer Kids",
    slug: "boys-graphic-outfit-set",
    price: 1299,
    mrp: 2499,
    images: ["/uploads/103_Pink-103.jpg"],
    category: "Boys' Clothing",
    variants: [{ size: "4-5Y", colour: "White", stock: 22 }],
    tags: ["Featured", "Shorts"],
    isPublished: true,
  },
  {
    _id: "SP-003",
    name: "Girls Floral Bow Outfit Set - T-Shirt & Denim Shorts Kids",
    slug: "girls-floral-bow-outfit-set",
    price: 1399,
    mrp: 2499,
    images: ["/uploads/133_133.jpg"],
    category: "Girls' Clothing",
    variants: [{ size: "5-6Y", colour: "Pink", stock: 16 }],
    tags: ["Featured", "girls outfits"],
    isPublished: true,
  },
  {
    _id: "SP-004",
    name: "Girls Pink Ruffle Outfit Set - Sleeveless Top & Shorts",
    slug: "girls-pink-ruffle-outfit-set",
    price: 1199,
    mrp: 2499,
    images: ["/uploads/136_136.jpg"],
    category: "Girls' Clothing",
    variants: [{ size: "2-3Y", colour: "Pink", stock: 20 }],
    tags: ["Featured", "Shorts"],
    isPublished: true,
  },
  {
    _id: "SP-005",
    name: "Boys Casual Shirt - Sage Green & Striped Asymmetrical Long Sleeve",
    slug: "boys-casual-shirt-sage-green-striped",
    price: 1499,
    mrp: 1899,
    images: ["/uploads/1_1-1.jpg"],
    category: "Shirts",
    variants: [{ size: "6-7Y", colour: "Sage", stock: 25 }],
    tags: ["Boys", "Shirts"],
    isPublished: true,
  },
  {
    _id: "SP-006",
    name: "Boys Button-Down Shirt, Long Sleeve Cotton Shirt with Pockets",
    slug: "boys-button-down-long-sleeve-shirt",
    price: 1499,
    mrp: 1899,
    images: ["/uploads/103_Pink-103-1.jpg"],
    category: "Shirts",
    variants: [{ size: "7-8Y", colour: "Blue", stock: 19 }],
    tags: ["Boys", "Shirts"],
    isPublished: true,
  },
  {
    _id: "SP-007",
    name: "Girls 2 Piece Outfit Dress - Ruffle Top & Pinafore Set for Kids",
    slug: "girls-2-piece-ruffle-pinafore-set",
    price: 1499,
    mrp: 2699,
    images: ["/uploads/133_133-1.jpg"],
    category: "Dresses",
    variants: [{ size: "4-5Y", colour: "Ivory", stock: 17 }],
    tags: ["Girls", "Dresses"],
    isPublished: true,
  },
  {
    _id: "SP-008",
    name: "Girls Pink Pinafore Dress - Floral Summer Dress for Kids & Toddlers",
    slug: "girls-pink-pinafore-dress-floral",
    price: 1299,
    mrp: 1699,
    images: ["/uploads/136_136-1.jpg"],
    category: "Dresses",
    variants: [{ size: "3-4Y", colour: "Pink", stock: 14 }],
    tags: ["Girls", "Dresses", "Best Seller"],
    isPublished: true,
  },
  {
    _id: "SP-009",
    name: "Children's Padded Winter Jacket with Cartoon Patch & Hood",
    slug: "childrens-padded-winter-jacket-cartoon-patch",
    price: 1199,
    mrp: 1899,
    images: ["/uploads/1_1-2.jpg"],
    category: "Jackets",
    variants: [{ size: "5-6Y", colour: "Yellow", stock: 12 }],
    tags: ["Winter", "Jackets"],
    isPublished: true,
  },
  {
    _id: "SP-010",
    name: "Girls Ribbed Dress - Soft Cotton Mini Party Frock",
    slug: "girls-ribbed-dress-soft-cotton-mini-party-frock",
    price: 1499,
    mrp: 2899,
    images: ["/uploads/103_Pink-103-2.jpg"],
    category: "Dresses",
    variants: [{ size: "6-7Y", colour: "Cream", stock: 15 }],
    tags: ["Best Seller", "Girls"],
    isPublished: true,
  },
  {
    _id: "SP-011",
    name: "Boys Wide Leg Cargo Jeans - Relaxed Fit Kids Denim Pants",
    slug: "boys-wide-leg-cargo-jeans",
    price: 1499,
    mrp: 2199,
    images: ["/uploads/133_133-2.jpg"],
    category: "Denim",
    variants: [{ size: "8-9Y", colour: "Black", stock: 21 }],
    tags: ["Boys", "Denim"],
    isPublished: true,
  },
  {
    _id: "SP-012",
    name: "Girls Winter Sweater & Pant Set with Faux Fur",
    slug: "girls-winter-sweater-pant-set-faux-fur",
    price: 1699,
    mrp: 2899,
    images: ["/uploads/136_136-2.jpg"],
    category: "Sweaters",
    variants: [{ size: "4-5Y", colour: "Beige", stock: 13 }],
    tags: ["Winter", "Girls"],
    isPublished: true,
  },
];

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readCollection(name, fallback) {
  if (!persistent) return fallback;
  try {
    const raw = fs.readFileSync(filePath(name), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readDocument(name, fallback) {
  if (!persistent) return fallback;
  try {
    const raw = fs.readFileSync(filePath(name), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeCollection(name, value) {
  if (!persistent) return;
  try {
    const tmp = filePath(name) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, filePath(name)); // atomic-ish replace
  } catch (err) {
    console.warn(`[store] Failed to persist "${name}": ${err.message}`);
  }
}

function writeDocument(name, value) {
  writeCollection(name, value);
}

// Load (or seed) collections once at boot.
let products = readCollection("products", null);
if (!products || products.length === 0) {
  products = seedProducts.slice();
  writeCollection("products", products);
}
let orders = readCollection("orders", []);
let transactions = readCollection("transactions", []);
let users = readCollection("users", []);
let passwordResets = readCollection("password-resets", []);
let otps = readCollection("otps", []);
let contactMessages = readCollection("contact-messages", []);
let reviews = readCollection("reviews", []);
let settings = readDocument("settings", {});
let settingsAudit = readCollection("settings-audit", []);
let importLogs = readCollection("import-logs", []);

module.exports = {
  isPersistent: () => persistent,
  dataDir: DATA_DIR,

  getProducts: () => products,
  saveProducts: () => writeCollection("products", products),

  getOrders: () => orders,
  saveOrders: () => writeCollection("orders", orders),

  getTransactions: () => transactions,
  saveTransactions: () => writeCollection("transactions", transactions),

  getUsers: () => users,
  saveUsers: () => writeCollection("users", users),

  getPasswordResets: () => passwordResets,
  savePasswordResets: () => writeCollection("password-resets", passwordResets),

  getOtps: () => otps,
  saveOtps: () => writeCollection("otps", otps),

  getContactMessages: () => contactMessages,
  saveContactMessages: () => writeCollection("contact-messages", contactMessages),

  getReviews: () => reviews,
  saveReviews: () => writeCollection("reviews", reviews),

  getSettings: () => settings,
  replaceSettings: (next) => {
    settings = next && typeof next === "object" ? next : {};
    writeDocument("settings", settings);
  },

  getSettingsAudit: () => settingsAudit,
  saveSettingsAudit: () => writeCollection("settings-audit", settingsAudit),

  getImportLogs: () => importLogs,
  saveImportLogs: () => writeCollection("import-logs", importLogs),
};
