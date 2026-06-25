"use strict";

/**
 * Salty Pumpkin — Node backend (hardened for production on Hostinger).
 *
 * Serves the pre-built React SPA from ./public and exposes the JSON API the
 * SPA expects. All API response shapes are unchanged from the original build
 * so the existing (un-rebuilt) frontend bundle keeps working as-is.
 *
 * Security model:
 *   - Auth tokens are signed JWTs (cannot be forged offline).
 *   - /api/admin/* requires a signed admin session.
 *   - Razorpay credentials stay in backend environment variables and payment
 *     signatures are always verified before an order is marked successful.
 *   - helmet, compression, rate limiting, locked-down CORS and security
 *     headers are applied.
 *
 * Storage is a small JSON file layer (lib/store.js) that survives restarts.
 * Swap it for MongoDB/Postgres before serving high traffic.
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const Razorpay = require("razorpay");
const readXlsxFile = require("read-excel-file/node");
const { cert, getApps: getFirebaseAdminApps, initializeApp: initializeFirebaseAdminApp } = require("firebase-admin/app");
const { getAuth: getFirebaseAdminAuth } = require("firebase-admin/auth");
require("dotenv").config();

const store = require("./lib/store");
const config = require("./lib/config");
const delhivery = require("./lib/delhivery");

const app = express();
function firebaseAdminOptions() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount) return { projectId: "salty-pumpkin" };
  try {
    return { credential: cert(JSON.parse(serviceAccount)), projectId: "salty-pumpkin" };
  } catch {
    console.warn("[auth] FIREBASE_SERVICE_ACCOUNT_JSON is invalid. Phone users cannot receive Firebase custom tokens.");
    return { projectId: "salty-pumpkin" };
  }
}
const firebaseAdminApp = getFirebaseAdminApps().length
  ? getFirebaseAdminApps()[0]
  : initializeFirebaseAdminApp(firebaseAdminOptions());
app.set("trust proxy", 1); // Hostinger terminates TLS at a proxy
const redirectFile = path.join(store.dataDir, "redirects.json");
const uploadsDir = path.join(__dirname, "public", "uploads");
const diskUploadStorage = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const base = path
      .basename(file.originalname || "product", ext)
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "product";
    cb(null, `${base}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
  },
});
const upload = multer({
  storage: diskUploadStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 80 },
  fileFilter(req, file, cb) {
    cb(null, /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype));
  },
});
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    cb(null, /\.(xlsx|csv)$/i.test(file.originalname || ""));
  },
});
const customerMediaUpload = multer({
  storage: diskUploadStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 6 },
  fileFilter(req, file, cb) {
    cb(null, /^(image\/(png|jpe?g|webp|gif)|video\/(mp4|webm|quicktime))$/i.test(file.mimetype));
  },
});

const AGE_GROUPS = [
  "18-24M",
  "2-3Y",
  "3-4Y",
  "4-5Y",
  "5-6Y",
  "6-7Y",
  "7-8Y",
  "8-9Y",
  "9-10Y",
  "10-11Y",
  "11-12Y",
  "12-13Y",
  "13-14Y",
  "14-15Y",
  "15-16Y",
];
const CATEGORY_TREE = {
  Boys: ["T-Shirts", "Shirts", "Shorts", "Jeans", "Ethnic Wear", "Jackets", "Co-Ords"],
  Girls: ["Dresses", "Tops", "Skirts", "Shorts", "Ethnic Wear", "Jumpsuits", "Co-Ords"],
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const NODE_ENV = process.env.NODE_ENV || "development";

function fallbackJwtSecret() {
  const secretPath = path.join(store.dataDir, ".jwt-secret");
  try {
    const existing = require("fs").readFileSync(secretPath, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // Create the fallback below.
  }
  const generated = crypto.randomBytes(48).toString("hex");
  try {
    require("fs").writeFileSync(secretPath, generated, { mode: 0o600 });
    return generated;
  } catch {
    return generated;
  }
}

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = fallbackJwtSecret();
  console.warn(
    "[auth] JWT_SECRET is not set. A strong fallback secret was generated in the data directory. " +
      "Set JWT_SECRET in Hostinger for best production hygiene."
  );
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Operators define exactly who is an admin. The server never infers admin
// status from a loose email/phone pattern.
const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const adminPhones = (process.env.ADMIN_PHONES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (adminEmails.length === 0 && adminPhones.length === 0) {
  console.warn(
    "[auth] No ADMIN_EMAILS / ADMIN_PHONES configured. No users will receive admin role until these env vars are set."
  );
}

function getRazorpayCredentials() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  };
}
function paymentsConfigured() {
  const credentials = getRazorpayCredentials();
  return Boolean(credentials.keyId && credentials.keySecret);
}

function razorpayClient() {
  const { keyId, keySecret } = getRazorpayCredentials();
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}
if (!paymentsConfigured()) {
  console.warn(
    "[payments] Razorpay is disabled because RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured."
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resolveRole({ email, phone }) {
  const e = (email || "").toLowerCase();
  const p = phone || "";
  return adminEmails.includes(e) || adminPhones.includes(p) ? "admin" : "user";
}

function createToken(user) {
  // Sign the user claims so the token cannot be forged or tampered with.
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function getUserFromToken(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    delete payload.iat;
    delete payload.exp;
    const storedUser = store.getUsers().find((user) => user.id === payload.id);
    if (storedUser) return publicUser(storedUser);
    return payload;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getUserFromToken(req);
  if (!user) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  next();
}

// Length-safe constant-time comparison (prevents the RangeError crash that the
// original timingSafeEqual call threw on mismatched-length signatures).
function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const { keySecret } = getRazorpayCredentials();
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqualHex(expected, signature);
}

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex");
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

// Fields the server always controls — applied AFTER spreading the request body
// so a client can never set them (e.g. forging paymentStatus: "paid").
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function publicOrderTracking(order) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    shipmentStatus: order.shipmentStatus,
    courierPartner: order.courierPartner,
    trackingNumber: order.trackingNumber || order.waybill || "",
    waybill: order.waybill || order.trackingNumber || "",
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    shipmentTimeline: order.shipmentTimeline || order.timeline || [],
    shipmentError: order.shipmentError || "",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const [, salt, hash] = stored.split(":");
  const candidate = hashPassword(password, salt).split(":")[2];
  return safeEqualHex(candidate, hash);
}

function findUserByEmail(email) {
  const lower = String(email || "").toLowerCase();
  return store.getUsers().find((user) => user.email === lower);
}

function upsertBootstrapAdmin(email, name, password) {
  const users = store.getUsers();
  const lower = String(email || "").toLowerCase();
  let user = users.find((item) => item.email === lower);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email: lower,
      phone: "",
      name: name || lower.split("@")[0],
      role: resolveRole({ email: lower }),
      passwordHash: hashPassword(password),
      addresses: [],
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    store.saveUsers();
  } else if (resolveRole({ email: lower }) === "admin" && user.role !== "admin") {
    user.role = "admin";
    store.saveUsers();
  }
  return user;
}

function readVariantStock(product, requestItem) {
  if (!requestItem.variantSku && !requestItem.size && !requestItem.colour) {
    return { variant: null, stock: Number(product.stock ?? 999999) };
  }
  const variant = (product.variants || []).find((item) => {
    const skuOk = !requestItem.variantSku || item.sku === requestItem.variantSku;
    const sizeOk = !requestItem.size || item.size === requestItem.size;
    const colourOk = !requestItem.colour || item.colour === requestItem.colour;
    return skuOk && sizeOk && colourOk;
  });
  return { variant, stock: Number(variant?.stock ?? 0) };
}

function normalizeShippingAddress(input = {}) {
  return {
    name: String(input.name || "").trim(),
    phone: String(input.phone || "").replace(/\D/g, "").slice(-10),
    line1: String(input.line1 || input.address || "").trim(),
    city: String(input.city || "").trim(),
    district: String(input.district || "").trim(),
    state: String(input.state || "").trim(),
    pincode: String(input.pincode || input.pinCode || "").replace(/\D/g, "").slice(0, 6),
    country: String(input.country || "India").trim() || "India",
  };
}

function validateShippingAddress(address) {
  if (!address.name || !address.line1 || !address.city || !address.state) {
    return "Complete the name, address, city, and state before checkout.";
  }
  if (!/^\d{10}$/.test(address.phone)) return "Enter a valid 10-digit mobile number.";
  if (!/^\d{6}$/.test(address.pincode)) return "Enter a valid 6-digit PIN code.";
  return "";
}

function computeOrderFromCatalog(req, body = req.body || {}) {
  const requestedItems = Array.isArray(body.items) ? body.items : [];
  if (requestedItems.length === 0) return { error: "Cart is empty" };
  const shippingAddress = normalizeShippingAddress(body.shippingAddress);
  const addressError = validateShippingAddress(shippingAddress);
  if (addressError) return { error: addressError };
  const products = store.getProducts();
  const resolvedItems = [];
  let subtotal = 0;

  for (const item of requestedItems) {
    const product = products.find(
      (candidate) =>
        candidate._id === item._id ||
        candidate._id === item.productId ||
        candidate.id === item.id ||
        candidate.slug === item.slug
    );
    if (!product || product.isPublished === false) return { error: `Product unavailable: ${item.name || item._id}` };
    const qty = Math.max(1, Number(item.qty || item.quantity || 1));
    const { variant, stock } = readVariantStock(product, item);
    if (stock < qty) return { error: `Insufficient stock for ${product.name}` };
    const unitPrice = Number(product.price || 0);
    subtotal += unitPrice * qty;
    resolvedItems.push({
      productId: product._id,
      slug: product.slug,
      name: product.name,
      image: product.images?.[0] || "",
      qty,
      price: unitPrice,
      size: item.size || variant?.size || "",
      colour: item.colour || variant?.colour || "",
      variantSku: item.variantSku || variant?.sku || "",
    });
  }

  const shipping = config.getConfig("shipping");
  const freeThreshold = Number(shipping.freeShippingThreshold || 0);
  const flatShippingFee = Number(shipping.flatShippingFee || 0);
  const codExtraFee = body.paymentMethod === "cod" ? Number(shipping.codExtraFee || 0) : 0;
  const gstPercent = Number(shipping.gstPercent || 0);
  const shippingFee = freeThreshold > 0 && subtotal >= freeThreshold ? 0 : flatShippingFee;
  const gst = Math.round((subtotal * gstPercent) / 100);
  const total = subtotal + shippingFee + codExtraFee + gst;
  const orderNumber = `SP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  return {
    order: {
      _id: crypto.randomUUID(),
      orderNumber,
      user: req.user.id,
      items: resolvedItems,
      subtotal,
      shippingFee,
      codExtraFee,
      gst,
      gstPercent,
      total,
      amount: total,
      shippingAddress,
      paymentMethod: body.paymentMethod || "cod",
      status: "confirmed",
      paymentStatus: "pending",
      createdAt: new Date().toISOString(),
    },
  };
}

function orderWeightGrams(order) {
  const fallback = delhivery.config().defaultWeightGrams;
  return Math.max(
    fallback,
    (order.items || []).reduce(
      (sum, item) => sum + Math.max(1, Number(item.qty || 1)) * Math.max(1, Number(item.weightGrams || fallback)),
      0
    )
  );
}

function applyPricingSnapshot(order, pricing = {}) {
  if (!Number.isFinite(Number(pricing.shippingFee))) return;
  order.shippingFee = Math.max(0, Number(pricing.shippingFee));
  order.total = Number(order.subtotal || 0) + Number(order.shippingFee || 0) + Number(order.codExtraFee || 0) + Number(order.gst || 0);
  order.amount = order.total;
}

async function prepareOrderDelivery(order, pricingSnapshot) {
  order.shipmentWeightGrams = orderWeightGrams(order);
  if (pricingSnapshot) {
    applyPricingSnapshot(order, pricingSnapshot);
    return;
  }
  if (!delhivery.configured()) {
    order.serviceabilityStatus = "not_configured";
    return;
  }
  try {
    const serviceability = await delhivery.checkServiceability(order.shippingAddress.pincode);
    order.serviceability = serviceability;
    order.serviceabilityStatus = serviceability.serviceable ? "serviceable" : "unserviceable";
    if (!serviceability.serviceable) {
      const error = new Error("Delivery is not available for this PIN code.");
      error.code = "UNSERVICEABLE_PINCODE";
      throw error;
    }
    if (order.paymentMethod === "cod" && !serviceability.codAvailable) {
      const error = new Error("Cash on Delivery is not available for this PIN code. Please choose online payment.");
      error.code = "COD_UNAVAILABLE";
      throw error;
    }
    const charge = await delhivery.calculateShipping({
      destinationPincode: order.shippingAddress.pincode,
      paymentMode: order.paymentMethod === "cod" ? "COD" : "Pre-paid",
      weightGrams: order.shipmentWeightGrams,
    });
    if (charge !== null) applyPricingSnapshot(order, { shippingFee: charge });
  } catch (err) {
    if (["UNSERVICEABLE_PINCODE", "COD_UNAVAILABLE"].includes(err.code)) throw err;
    order.serviceabilityStatus = "pending";
    order.shippingApiError = err.message;
    console.error(`[delhivery] Serviceability/rate check failed for ${order.orderNumber}: ${err.message}`);
  }
}

function appendShipmentTimeline(order, item) {
  const timeline = Array.isArray(order.shipmentTimeline) ? order.shipmentTimeline : [];
  const fingerprint = `${item.status}|${item.createdAt}|${item.location || ""}`;
  if (!timeline.some((entry) => `${entry.status}|${entry.createdAt}|${entry.location || ""}` === fingerprint)) {
    timeline.push(item);
  }
  order.shipmentTimeline = timeline.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function syncShipmentFields(order, shipment) {
  const now = new Date().toISOString();
  order.trackingNumber = shipment.trackingNumber || shipment.waybill || order.trackingNumber || "";
  order.shipmentId = shipment.shipmentId || order.shipmentId || "";
  order.waybill = shipment.waybill || order.waybill || order.trackingNumber || "";
  order.courierPartner = shipment.courierPartner || "Delhivery";
  order.shipmentStatus = shipment.shipmentStatus || order.shipmentStatus || "pending";
  order.estimatedDeliveryDate = shipment.estimatedDeliveryDate || order.estimatedDeliveryDate || "";
  order.shipmentLastSyncTime = now;
  order.shipmentError = "";
  order.delivery = {
    ...(order.delivery || {}),
    provider: order.courierPartner,
    trackingNumber: order.trackingNumber,
    waybill: order.waybill,
    shipmentId: order.shipmentId,
    status: order.shipmentStatus,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    updatedAt: now,
  };
  if (["picked_up", "in_transit", "out_for_delivery", "delivered", "cancelled", "rto"].includes(order.shipmentStatus)) {
    order.status = order.shipmentStatus;
  }
  for (const item of shipment.timeline || []) appendShipmentTimeline(order, item);
  if (!(shipment.timeline || []).length) {
    appendShipmentTimeline(order, {
      status: order.shipmentStatus,
      label: shipment.rawStatus || "Shipment created",
      location: "",
      createdAt: now,
    });
  }
  order.updatedAt = now;
}

async function createDelhiveryShipment(order) {
  if (!delhivery.configured()) {
    order.shipmentStatus = "pending";
    order.shipmentError = "Delhivery is not configured.";
    store.saveOrders();
    return { success: false, pending: true, message: order.shipmentError };
  }
  try {
    const shipment = await delhivery.createShipment(order);
    syncShipmentFields(order, shipment);
    store.saveOrders();
    return { success: true, shipment };
  } catch (err) {
    order.shipmentStatus = "pending";
    order.courierPartner = "Delhivery";
    order.shipmentError = err.message;
    order.shipmentLastSyncTime = new Date().toISOString();
    store.saveOrders();
    console.error(`[delhivery] Shipment creation failed for ${order.orderNumber}: ${err.message}`);
    return { success: false, pending: true, message: err.message };
  }
}

async function refreshDelhiveryShipment(order) {
  const waybill = order.waybill || order.trackingNumber || order.delivery?.trackingNumber;
  if (!waybill) throw new Error("This order does not have a Delhivery waybill yet.");
  const shipment = await delhivery.trackShipment(waybill);
  syncShipmentFields(order, shipment);
  store.saveOrders();
  return shipment;
}

function decrementStock(order) {
  const products = store.getProducts();
  order.items.forEach((item) => {
    const product = products.find((candidate) => candidate._id === item.productId);
    if (!product) return;
    if (item.variantSku || item.size || item.colour) {
      const variant = (product.variants || []).find((candidate) => {
        const skuOk = !item.variantSku || candidate.sku === item.variantSku;
        const sizeOk = !item.size || candidate.size === item.size;
        const colourOk = !item.colour || candidate.colour === item.colour;
        return skuOk && sizeOk && colourOk;
      });
      if (variant) variant.stock = Math.max(0, Number(variant.stock || 0) - item.qty);
    }
    product.stock = Math.max(0, Number(product.stock || 0) - item.qty);
  });
  store.saveProducts();
}

function restoreStock(order) {
  if (order.stockRestored) return;
  const products = store.getProducts();
  order.items.forEach((item) => {
    const product = products.find((candidate) => candidate._id === item.productId);
    if (!product) return;
    if (item.variantSku || item.size || item.colour) {
      const variant = (product.variants || []).find((candidate) => {
        const skuOk = !item.variantSku || candidate.sku === item.variantSku;
        const sizeOk = !item.size || candidate.size === item.size;
        const colourOk = !item.colour || candidate.colour === item.colour;
        return skuOk && sizeOk && colourOk;
      });
      if (variant) variant.stock = Number(variant.stock || 0) + item.qty;
    }
    product.stock = Number(product.stock || 0) + item.qty;
  });
  order.stockRestored = true;
  store.saveProducts();
}

function slugify(value) {
  return String(value || "product")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueSlug(name, products, currentId) {
  const base = slugify(name);
  const taken = new Set(
    products
      .filter((product) => product._id !== currentId && product.id !== currentId)
      .map((product) => product.slug)
  );
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (value === null || value === undefined) return [];
  return String(value)
    .split(/[,\n|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickField(input, names) {
  for (const name of names) {
    if (input[name] !== undefined && input[name] !== null && input[name] !== "") return input[name];
    const match = Object.keys(input).find((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (match && input[match] !== undefined && input[match] !== null && input[match] !== "") return input[match];
  }
  return "";
}

function normalizeImages(images) {
  if (Array.isArray(images)) return images.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof images === "string") {
    return images
      .split(/[,\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function uploadedMedia() {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    return fs
      .readdirSync(uploadsDir)
      .filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file))
      .map((file) => {
        const base = path.basename(file, path.extname(file));
        const code = base.split(/[-_\s.]+/).find((part) => /\d/.test(part)) || base;
        return { filename: file, code, url: `/uploads/${file}` };
      });
  } catch {
    return [];
  }
}

function resolveImageCode(code, media = uploadedMedia()) {
  const wanted = String(code || "").trim();
  if (!wanted) return "";
  const normalized = wanted.toLowerCase().replace(/\.[a-z0-9]+$/i, "");
  const match = media.find((item) => {
    const filename = item.filename.toLowerCase();
    const base = path.basename(item.filename, path.extname(item.filename)).toLowerCase();
    return item.code.toLowerCase() === normalized || base === normalized || base.startsWith(`${normalized}-`) || base.startsWith(`${normalized}_`) || filename.includes(normalized);
  });
  return match?.url || "";
}

function imagePriorityScore(image, modelReference = "") {
  const text = `${image} ${modelReference}`.toLowerCase();
  if (modelReference && image.toLowerCase().includes(String(modelReference).toLowerCase())) return -30;
  if (/(model|child|kid|wear|worn|front|look)/i.test(text)) return -20;
  if (/(flat|back|detail|close|fabric|tag)/i.test(text)) return 10;
  return 0;
}

function uniqueValues(values) {
  return [...new Set(values.map(String).map((item) => item.trim()).filter(Boolean))];
}

function resolveProductImages(input) {
  const media = uploadedMedia();
  const imageCodes = parseList(pickField(input, ["imageCodes", "imageCode", "imagesCode", "image code", "image codes"]));
  const modelImageCode = String(pickField(input, ["modelImageCode", "featuredImageCode", "primaryImageCode", "model image code", "featured image code"]) || "").trim();
  const directImages = normalizeImages(input.images || input.imageUrls || input.imageURL || input.image);
  const missingImageCodes = [];
  const mapped = imageCodes.map((code) => {
    const url = resolveImageCode(code, media);
    if (!url) missingImageCodes.push(code);
    return url;
  }).filter(Boolean);
  const modelUrl = modelImageCode ? resolveImageCode(modelImageCode, media) : "";
  if (modelImageCode && !modelUrl) missingImageCodes.push(modelImageCode);
  const images = uniqueValues([modelUrl, ...mapped, ...directImages])
    .sort((a, b) => imagePriorityScore(a, modelImageCode) - imagePriorityScore(b, modelImageCode));
  return { images, imageCodes, modelImageCode, missingImageCodes: uniqueValues(missingImageCodes) };
}

function normalizeCategory(input) {
  const rawParent = String(pickField(input, ["parentCategory", "parent category", "gender", "department"]) || "").trim();
  const rawChild = String(pickField(input, ["childCategory", "child category", "subcategory", "sub category", "category"]) || "").trim();
  const legacyCategory = String(input.category || "").trim();
  let parentCategory = Object.keys(CATEGORY_TREE).find((item) => item.toLowerCase() === rawParent.toLowerCase()) || "";
  let childCategory = rawChild;

  if (!parentCategory) {
    parentCategory = Object.keys(CATEGORY_TREE).find((parent) =>
      [rawChild, legacyCategory, ...(input.tags || [])].join(" ").toLowerCase().includes(parent.toLowerCase())
    ) || "";
  }
  if (!parentCategory) parentCategory = /boy/i.test(legacyCategory) ? "Boys" : /girl/i.test(legacyCategory) ? "Girls" : "Girls";

  const allowed = CATEGORY_TREE[parentCategory] || [];
  const matchedChild = allowed.find((item) => item.toLowerCase() === childCategory.toLowerCase());
  if (matchedChild) childCategory = matchedChild;
  if (!childCategory || !allowed.includes(childCategory)) {
    childCategory = allowed.find((item) => item.toLowerCase() === legacyCategory.toLowerCase()) || allowed[0] || "Kidswear";
  }
  return { parentCategory, childCategory, category: childCategory };
}

function normalizeColorImages(input, defaultImages) {
  let raw = input.colorImages || input.colorWiseImages || input.galleryByColor || {};
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  const media = uploadedMedia();
  const result = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    Object.entries(raw).forEach(([color, value]) => {
      const codesOrUrls = parseList(value);
      const missing = [];
      const resolved = codesOrUrls.map((item) => {
        if (/^(https?:)?\/\//i.test(item) || item.startsWith("/uploads/")) return item;
        const url = resolveImageCode(item, media);
        if (!url) missing.push(item);
        return url;
      }).filter(Boolean);
      result[color] = uniqueValues(resolved.length ? resolved : defaultImages).sort((a, b) => imagePriorityScore(a) - imagePriorityScore(b));
    });
  }
  Object.keys(input).forEach((key) => {
    const match = key.match(/^(.+?)\s*(?:images|image codes|gallery)$/i);
    if (!match) return;
    const color = match[1].trim();
    if (!color || /^(product|image|model|featured|primary)$/i.test(color)) return;
    const resolved = parseList(input[key]).map((item) => resolveImageCode(item, media) || item).filter(Boolean);
    if (resolved.length) result[color] = uniqueValues(resolved).sort((a, b) => imagePriorityScore(a) - imagePriorityScore(b));
  });
  return result;
}

function normalizeVariants(input, sku, price) {
  const incoming = Array.isArray(input.variants) ? input.variants : [];
  const colors = uniqueValues([
    ...parseList(input.colors || input.colours || input.color || input.colour),
    ...incoming.map((variant) => variant.color || variant.colour).filter(Boolean),
  ]);
  const ageGroups = uniqueValues([
    ...parseList(input.ageGroups || input.sizes || input.size || input.ageGroup),
    ...incoming.map((variant) => variant.ageGroup || variant.size).filter(Boolean),
  ]).filter((item) => AGE_GROUPS.includes(item));
  const finalColors = colors.length ? colors : uniqueValues(incoming.map((variant) => variant.color || variant.colour).filter(Boolean));
  const finalAgeGroups = ageGroups.length ? ageGroups : uniqueValues(incoming.map((variant) => variant.ageGroup || variant.size).filter(Boolean)).filter(Boolean);
  const sourceStock = Number(input.stock || 0);

  const generated = [];
  if (finalColors.length && finalAgeGroups.length) {
    finalColors.forEach((color) => {
      finalAgeGroups.forEach((ageGroup) => {
        const existing = incoming.find((variant) =>
          String(variant.color || variant.colour || "").toLowerCase() === color.toLowerCase() &&
          String(variant.ageGroup || variant.size || "").toLowerCase() === ageGroup.toLowerCase()
        );
        generated.push({
          ageGroup,
          size: ageGroup,
          color,
          colour: color,
          stock: Number(existing?.stock ?? sourceStock),
          sku: String(existing?.sku || `${sku}_${ageGroup}`).trim(),
          priceOverride: existing?.priceOverride !== undefined && existing?.priceOverride !== "" ? Number(existing.priceOverride) : undefined,
        });
      });
    });
  } else {
    incoming.forEach((variant, index) => {
      const ageGroup = variant.ageGroup || variant.size || "";
      const color = variant.color || variant.colour || "";
      generated.push({
        ...variant,
        ageGroup,
        size: ageGroup,
        color,
        colour: color,
        stock: Number(variant.stock || 0),
        sku: String(variant.sku || `${sku}_${ageGroup || index + 1}`).trim(),
        priceOverride: variant.priceOverride !== undefined && variant.priceOverride !== "" ? Number(variant.priceOverride) : undefined,
      });
    });
  }
  const seen = new Set();
  const variants = generated.filter((variant) => {
    const key = `${variant.color}|${variant.ageGroup}|${variant.sku}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return variant.ageGroup || variant.color || variant.sku;
  });
  return {
    variants,
    colors: uniqueValues([...finalColors, ...variants.map((variant) => variant.color).filter(Boolean)]),
    ageGroups: uniqueValues([...finalAgeGroups, ...variants.map((variant) => variant.ageGroup).filter(Boolean)]),
    stock: variants.length ? variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0) : Number(input.stock || 0),
  };
}

function normalizeProduct(input, products, currentId) {
  const name = String(input.name || "").trim();
  if (!name) return null;
  const now = new Date().toISOString();
  const id = currentId || `PRD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const price = Number(input.price || 0);
  const sku = String(input.sku || pickField(input, ["productCode", "styleCode", "code"]) || id).trim();
  const productNumber = String(
    input.productNumber ||
    pickField(input, ["product number", "productNumber", "productNo", "product code"]) ||
    sku
  ).trim();
  const tags = Array.isArray(input.tags)
    ? input.tags
    : parseList(input.tags);
  const category = normalizeCategory({ ...input, tags });
  const imageInfo = resolveProductImages(input);
  const variantInfo = normalizeVariants(input, sku, price);
  const colorImages = normalizeColorImages(input, imageInfo.images);
  return {
    ...input,
    _id: id,
    name,
    slug: uniqueSlug(input.slug || name, products, id),
    sku,
    productNumber,
    ...category,
    price,
    mrp: Number(input.mrp || price),
    stock: variantInfo.stock,
    images: imageInfo.images,
    imageCodes: imageInfo.imageCodes,
    modelImageCode: imageInfo.modelImageCode,
    missingImageCodes: imageInfo.missingImageCodes,
    colorImages,
    colors: variantInfo.colors,
    ageGroups: variantInfo.ageGroups,
    variants: variantInfo.variants,
    tags,
    isPublished: input.isPublished !== undefined ? String(input.isPublished).toLowerCase() !== "false" : true,
    updatedAt: now,
    createdAt: input.createdAt || now,
    importWarnings: imageInfo.missingImageCodes.length ? [`Missing image codes: ${imageInfo.missingImageCodes.join(", ")}`] : [],
  };
}

function duplicateProductIdentifier(products, product, currentId = "") {
  const productNumber = String(product.productNumber || "").trim().toLowerCase();
  const sku = String(product.sku || "").trim().toLowerCase();
  return products.find((item) => {
    if (item._id === currentId || item.id === currentId) return false;
    const existingNumber = String(item.productNumber || item.sku || "").trim().toLowerCase();
    const existingSku = String(item.sku || "").trim().toLowerCase();
    return (productNumber && existingNumber === productNumber) || (sku && existingSku === sku);
  });
}

function isNewArrivalProduct(product) {
  if (product.newArrival === true || product.isNew === true) return true;
  if ((product.tags || []).some((tag) => /new\s*arrival/i.test(String(tag)))) return true;
  const createdAt = Date.parse(product.createdAt || "");
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 120 * 24 * 60 * 60 * 1000;
}

function matchesProductCategory(product, category) {
  const wanted = normalizeCategoryKey(category);
  if (!wanted || wanted === "all") return true;
  if (wanted === "new arrivals" || wanted === "new-arrivals") return isNewArrivalProduct(product);
  return [product.category, product.parentCategory, product.childCategory]
    .some((value) => normalizeCategoryKey(value) === wanted);
}

function normalizeCategoryKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/&/g, " and ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  if (["boys clothing", "boy clothing", "boys clothes", "boys"].includes(normalized)) return "boys";
  if (["girls clothing", "girl clothing", "girls clothes", "girls"].includes(normalized)) return "girls";
  return normalized;
}

function normalizeSavedAddresses(addresses = []) {
  const normalized = addresses
    .filter((address) => address && typeof address === "object")
    .map((address) => ({
      ...address,
      id: address.id || crypto.randomUUID(),
      ...normalizeShippingAddress(address),
      label: String(address.label || "").trim(),
      isDefault: Boolean(address.isDefault),
    }))
    .slice(0, 20);
  if (normalized.length && !normalized.some((address) => address.isDefault)) {
    normalized[0].isDefault = true;
  }
  let foundDefault = false;
  normalized.forEach((address) => {
    if (address.isDefault && !foundDefault) {
      foundDefault = true;
      return;
    }
    address.isDefault = false;
  });
  return normalized.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

function customerSummary(user) {
  const orders = store.getOrders().filter((order) => order.user === user.id);
  const totalSpent = orders.reduce((sum, order) => sum + Number(order.total || order.amount || 0), 0);
  return {
    ...publicUser(user),
    status: user.status || "active",
    orderCount: orders.length,
    totalSpent,
    lastOrderAt: orders[0]?.createdAt || "",
  };
}

function writeInvoicePdf(res, order, user) {
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const invoiceId = `INV-${order.orderNumber || order._id}`;
  const storeInfo = config.getConfig("store");
  const shippingConfig = config.getConfig("shipping");
  const gstPercent = Number(order.gstPercent ?? shippingConfig.gstPercent ?? 0);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${invoiceId}.pdf`);
  doc.pipe(res);
  doc.fontSize(22).fillColor("#df3f63").text(storeInfo.storeName || "Salty Pumpkin", { continued: false });
  doc.moveDown(0.3).fontSize(10).fillColor("#555").text("SAURYAINSTA FASHIONS PRIVATE LIMITED");
  doc.text(storeInfo.address || "Premium kidswear India");
  if (storeInfo.gstNumber) doc.text(`GSTIN: ${storeInfo.gstNumber}`);
  doc.moveDown();
  doc.fontSize(16).fillColor("#111").text(gstPercent > 0 || storeInfo.gstNumber ? "GST Tax Invoice" : "Tax Invoice");
  doc.fontSize(10).fillColor("#555").text(`Invoice: ${invoiceId}`);
  doc.text(`Date: ${new Date(order.createdAt || Date.now()).toLocaleDateString("en-IN")}`);
  doc.text(`Order: ${order.orderNumber || order._id}`);
  doc.moveDown();
  doc.fontSize(12).fillColor("#111").text("Customer Details");
  doc.fontSize(10).fillColor("#555").text(user?.name || order.shippingAddress?.name || order.user || "Customer");
  doc.text(user?.email || "");
  doc.text(order.shippingAddress?.phone || user?.phone || "");
  doc.moveDown();
  doc.fontSize(12).fillColor("#111").text("Shipping Address");
  doc.fontSize(10).fillColor("#555").text([
    order.shippingAddress?.line1,
    order.shippingAddress?.city,
    order.shippingAddress?.state,
    order.shippingAddress?.pincode,
  ].filter(Boolean).join(", ") || "Not provided");
  doc.moveDown();
  doc.fontSize(12).fillColor("#111").text("Items");
  doc.moveDown(0.4);
  (order.items || []).forEach((item) => {
    doc.fontSize(10).fillColor("#222").text(`${item.name} x ${item.qty}`, { continued: true });
    doc.text(`Rs. ${Number(item.price * item.qty || 0).toLocaleString("en-IN")}`, { align: "right" });
  });
  doc.moveDown();
  [
    ["Subtotal", order.subtotal],
    [`GST/Tax${gstPercent > 0 ? ` (${gstPercent}%)` : ""}`, order.gst],
    ["Shipping", order.shippingFee],
    ["COD Fee", order.codExtraFee],
    ["Discount", order.discount || 0],
    ["Grand Total", order.total || order.amount],
  ].forEach(([label, value]) => {
    doc.fontSize(label === "Grand Total" ? 12 : 10).fillColor(label === "Grand Total" ? "#111" : "#555");
    doc.text(label, { continued: true });
    doc.text(`Rs. ${Number(value || 0).toLocaleString("en-IN")}`, { align: "right" });
  });
  doc.moveDown();
  doc.fontSize(10).fillColor("#555").text(`Payment Method: ${order.paymentMethod || "cod"}`);
  doc.text(`Payment Status: ${order.paymentStatus || "pending"}`);
  if (order.paymentId) doc.text(`Razorpay Payment ID: ${order.paymentId}`);
  doc.moveDown().text("Thank you for shopping with Salty Pumpkin.");
  doc.end();
}

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(
  helmet({
    // CSP is left off so the pre-built SPA (Google Fonts, Razorpay checkout,
    // Unsplash images, GA4/GTM/Meta Pixel) is not broken. Add a tailored CSP
    // after verifying every external origin the UI needs.
    contentSecurityPolicy: false,
    // Firebase Google popup authentication needs to retain a reference to the
    // cross-origin popup until sign-in completes.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  })
);
app.use(compression());

app.use((req, res, next) => {
  const allowedOrigins = String(config.get("domain.allowedOrigins") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0) {
    next();
    return;
  }
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })(req, res, next);
});

// Razorpay webhook needs the raw body for signature verification, so skip JSON
// parsing only for that exact route.
app.use((req, res, next) => {
  if (req.originalUrl === "/api/payments/webhook") {
    next();
    return;
  }
  express.json({ limit: "25mb" })(req, res, next);
});

// Throttle auth endpoints to blunt brute-force / OTP abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});
app.use("/api/auth", authLimiter);
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP requests. Please try again later." },
});
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many verification attempts. Please try again later." },
});
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many messages were sent. Please try again later." },
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  try {
    const redirects = JSON.parse(fs.readFileSync(redirectFile, "utf8"));
    const currentPath = req.path.replace(/\/+$/, "") || "/";
    const match = Array.isArray(redirects)
      ? redirects.find((item) => {
        const oldPath = String(item.oldUrl || item.old || "").replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "") || "/";
        return oldPath === currentPath;
      })
      : null;
    if (match?.newUrl || match?.new) {
      res.redirect(Number(match.status) === 302 ? 302 : 301, match.newUrl || match.new);
      return;
    }
  } catch {
    // Redirect map is optional.
  }
  next();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    uptime: process.uptime(),
    env: NODE_ENV,
    persistent: store.isPersistent(),
    paymentsConfigured: paymentsConfigured(),
    delhiveryConfigured: delhivery.configured(),
  });
});

app.get("/api/storefront/settings", (req, res) => {
  const settings = config.publicSettings();
  res.json({
    success: true,
    settings: {
      content: settings.content,
      coupons: settings.coupons,
      categories: settings.categories,
      sizeCharts: settings.sizeCharts,
      filters: settings.filters,
      seo: settings.seo,
      tracking: settings.tracking,
      analytics: settings.analytics,
      store: settings.store,
      publish: settings.publish,
    },
  });
});

app.get("/api/location/pincode/:pincode", async (req, res) => {
  const pincode = String(req.params.pincode || "").trim();
  if (!/^\d{6}$/.test(pincode)) {
    res.status(400).json({ success: false, message: "Enter a valid 6-digit PIN code." });
    return;
  }
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    if (!response.ok) throw new Error(`PIN service returned ${response.status}`);
    const payload = await response.json();
    const office = payload?.[0]?.PostOffice?.[0];
    if (!office) {
      res.status(404).json({ success: false, message: "PIN code not found." });
      return;
    }
    res.json({
      success: true,
      location: {
        city: office.Block || office.Name || office.Division || "",
        district: office.District || "",
        state: office.State || "",
        pincode,
        country: "India",
      },
    });
  } catch (err) {
    console.warn(`[location] PIN lookup failed: ${err.message}`);
    res.status(502).json({ success: false, message: "PIN lookup is temporarily unavailable. Enter the address manually." });
  }
});

app.get("/api/delivery/serviceability/:pincode", async (req, res) => {
  const pincode = String(req.params.pincode || "").replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(pincode)) {
    res.status(400).json({ success: false, message: "Enter a valid 6-digit PIN code." });
    return;
  }
  if (!delhivery.configured()) {
    res.status(503).json({ success: false, available: false, message: "Delivery validation is temporarily unavailable." });
    return;
  }
  try {
    const serviceability = await delhivery.checkServiceability(pincode);
    res.json({
      success: true,
      available: serviceability.serviceable,
      ...serviceability,
      message: serviceability.serviceable
        ? "Delivery is available for this PIN code."
        : "We do not currently deliver to this PIN code.",
    });
  } catch (err) {
    console.error(`[delhivery] Serviceability check failed for ${pincode}: ${err.message}`);
    res.status(502).json({ success: false, available: false, message: "Could not verify delivery right now. Please try again." });
  }
});

app.post("/api/contact", contactLimiter, (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").replace(/\D/g, "").slice(-10);
  const subject = String(req.body.subject || "General enquiry").trim();
  const message = String(req.body.message || "").trim();
  const contentSettings = config.publicSettings().content || {};
  if (!name || !message || (!email && !phone)) {
    res.status(400).json({
      success: false,
      message: "Enter your name, message, and either an email address or phone number.",
    });
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Enter a valid email address." });
    return;
  }
  const contactMessage = {
    id: crypto.randomUUID(),
    name,
    email,
    phone,
    subject,
    message: message.slice(0, 5000),
    notifyPhone: contentSettings.contactNotifyPhone || "",
    status: "new",
    createdAt: new Date().toISOString(),
  };
  store.getContactMessages().unshift(contactMessage);
  store.saveContactMessages();
  res.status(201).json({
    success: true,
    reference: contactMessage.id,
    message: "Thanks. Your message has been sent to the Salty Pumpkin team.",
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post("/api/auth/firebase-session", async (req, res) => {
  const idToken = String(req.body.idToken || "");
  if (!idToken) {
    res.status(400).json({ success: false, message: "Sign-in could not be verified." });
    return;
  }
  try {
    const decoded = await getFirebaseAdminAuth(firebaseAdminApp).verifyIdToken(idToken);
    const email = String(decoded.email || "").trim().toLowerCase();
    const users = store.getUsers();
    const phone = decoded.phone_number || "";
    let user = users.find((item) => item.firebaseUid === decoded.uid || (email && item.email === email));
    const phoneUser = findUserByPhone(phone);
    if (user && phoneUser && phoneUser !== user) user = mergeCustomerUsers(user, phoneUser);
    if (!user && phoneUser) user = phoneUser;
    if (!user) {
      user = {
        id: decoded.uid,
        firebaseUid: decoded.uid,
        email,
        phone,
        name: decoded.name || email.split("@")[0] || "Salty Pumpkin Customer",
        photoURL: decoded.picture || "",
        provider: decoded.firebase?.sign_in_provider || "password",
        role: "customer",
        passwordHash: "",
        addresses: [],
        wishlist: [],
        createdAt: new Date().toISOString(),
      };
      users.push(user);
    } else {
      user.firebaseUid = decoded.uid;
      user.email = email || user.email || "";
      user.phone = phone || user.phone || "";
      user.name = decoded.name || user.name || email.split("@")[0] || "Salty Pumpkin Customer";
      user.photoURL = decoded.picture || user.photoURL || "";
      const signInProvider = decoded.firebase?.sign_in_provider || "";
      user.provider = signInProvider === "custom" && user.provider === "phone" ? "phone" : signInProvider || user.provider || "password";
      user.role = user.role === "admin" ? "admin" : "customer";
      user.lastLoginAt = new Date().toISOString();
    }
    store.saveUsers();
    const safeUser = publicUser(user);
    res.json({ success: true, user: safeUser, token: createToken(safeUser) });
  } catch (err) {
    console.warn(`[auth] Firebase session verification failed: ${err.message}`);
    res.status(401).json({ success: false, message: "Sign-in could not be verified. Please try again." });
  }
});

function normalizePhone(countryCode, phone) {
  const code = String(countryCode || "+91").replace(/[^\d+]/g, "");
  const local = String(phone || "").replace(/\D/g, "");
  const normalizedCode = code.startsWith("+") ? code : `+${code}`;
  if (!/^\+\d{1,4}$/.test(normalizedCode) || !/^\d{7,12}$/.test(local)) return null;
  return { countryCode: normalizedCode, local, e164: `${normalizedCode}${local}`, providerPhone: `${normalizedCode.replace("+", "")}${local}` };
}

function normalizeCustomerPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 10 ? digits.slice(-10) : `+${digits}`;
}

function mergeCustomerUsers(primary, duplicate) {
  if (!primary || !duplicate || primary === duplicate) return primary;
  primary.email = primary.email || duplicate.email || "";
  primary.phone = primary.phone || duplicate.phone || "";
  primary.name = primary.name && primary.name !== "Salty Pumpkin Customer" ? primary.name : duplicate.name || primary.name;
  primary.firebaseUid = primary.firebaseUid || duplicate.firebaseUid || "";
  primary.addresses = normalizeSavedAddresses([...(primary.addresses || []), ...(duplicate.addresses || [])]);
  primary.wishlist = [...new Set([...(primary.wishlist || []), ...(duplicate.wishlist || [])])];
  primary.mergedUserIds = [...new Set([...(primary.mergedUserIds || []), duplicate.id])];
  store.getOrders().forEach((order) => {
    if (order.user === duplicate.id) order.user = primary.id;
  });
  const users = store.getUsers();
  const duplicateIndex = users.indexOf(duplicate);
  if (duplicateIndex >= 0) users.splice(duplicateIndex, 1);
  store.saveOrders();
  return primary;
}

function findUserByPhone(value) {
  const wanted = normalizeCustomerPhone(value);
  if (!wanted) return null;
  return store.getUsers().find((user) => normalizeCustomerPhone(user.phone) === wanted);
}

function normalizeEmail(email) {
  const lower = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : "";
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function storeEmailOtp(email) {
  const otps = store.getOtps();
  const existingIndex = otps.findIndex((item) => item.type === "email" && item.email === email);
  const existing = existingIndex >= 0 ? otps[existingIndex] : null;
  const now = Date.now();
  if (existing?.cooldownUntil > now) {
    return { error: "Please wait before requesting another OTP.", status: 429, retryAfter: Math.ceil((existing.cooldownUntil - now) / 1000) };
  }
  if (existing?.resendCount >= 4 && existing?.resendWindowUntil > now) {
    return { error: "Maximum resend attempts reached. Please try again later.", status: 429 };
  }
  const otp = generateOtp();
  const record = {
    type: "email",
    email,
    otpHash: hashPassword(otp),
    expiresAt: now + 10 * 60 * 1000,
    cooldownUntil: now + 30 * 1000,
    resendCount: existing?.resendWindowUntil > now ? Number(existing.resendCount || 0) + 1 : 1,
    resendWindowUntil: existing?.resendWindowUntil > now ? existing.resendWindowUntil : now + 60 * 60 * 1000,
    verifyAttempts: 0,
    createdAt: new Date().toISOString(),
  };
  if (existingIndex === -1) otps.push(record);
  else otps[existingIndex] = record;
  store.saveOtps();
  console.log(`[auth] Email login OTP for ${email}: ${otp}`);
  return { success: true, retryAfter: 30, expiresIn: 600 };
}

app.post("/api/auth/send-otp", otpSendLimiter, async (req, res) => {
  const phoneData = normalizePhone(req.body.countryCode, req.body.phone);
  if (!phoneData) {
    res.status(400).json({ success: false, message: "Enter a valid mobile number." });
    return;
  }
  const apiKey = process.env.TWOFACTOR_API_KEY || "";
  const templateId = process.env.TWOFACTOR_TEMPLATE_ID || "OTP1";
  const otpApiBase = process.env.TWOFACTOR_API_BASE_URL || "https://2factor.in/API/V1";
  if (!apiKey) {
    res.status(503).json({ success: false, message: "Phone OTP is temporarily unavailable." });
    return;
  }
  const otps = store.getOtps();
  const existingIndex = otps.findIndex((item) => item.phone === phoneData.e164);
  const existing = existingIndex >= 0 ? otps[existingIndex] : null;
  const now = Date.now();
  if (existing?.cooldownUntil > now) {
    res.status(429).json({
      success: false,
      message: "Please wait before requesting another OTP.",
      retryAfter: Math.ceil((existing.cooldownUntil - now) / 1000),
    });
    return;
  }
  if (existing?.resendCount >= 4 && existing?.resendWindowUntil > now) {
    res.status(429).json({ success: false, message: "Maximum resend attempts reached. Please try again later." });
    return;
  }
  try {
    const response = await fetch(`${otpApiBase.replace(/\/+$/, "")}/${encodeURIComponent(apiKey)}/SMS/${encodeURIComponent(phoneData.providerPhone)}/AUTOGEN/${encodeURIComponent(templateId)}`);
    const payload = await response.json();
    if (!response.ok || payload.Status !== "Success" || !payload.Details) {
      throw new Error(payload.Details || "2Factor rejected the OTP request");
    }
    const record = {
      phone: phoneData.e164,
      providerPhone: phoneData.providerPhone,
      sessionId: payload.Details,
      expiresAt: now + 10 * 60 * 1000,
      cooldownUntil: now + 30 * 1000,
      resendCount: existing?.resendWindowUntil > now ? Number(existing.resendCount || 0) + 1 : 1,
      resendWindowUntil: existing?.resendWindowUntil > now ? existing.resendWindowUntil : now + 60 * 60 * 1000,
      verifyAttempts: 0,
      createdAt: new Date().toISOString(),
    };
    if (existingIndex === -1) otps.push(record);
    else otps[existingIndex] = record;
    store.saveOtps();
    res.json({ success: true, message: "OTP sent successfully.", retryAfter: 30, expiresIn: 600 });
  } catch (err) {
    console.warn(`[otp] 2Factor send failed: ${err.message}`);
    res.status(502).json({ success: false, message: "Could not send OTP. Please try again." });
  }
});

app.post("/api/auth/verify-otp", otpVerifyLimiter, async (req, res) => {
  const phoneData = normalizePhone(req.body.countryCode, req.body.phone);
  const otp = String(req.body.otp || "");
  if (!phoneData || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ success: false, message: "Enter the valid 6-digit OTP." });
    return;
  }
  const otps = store.getOtps();
  const record = otps.find((item) => item.phone === phoneData.e164);
  if (!record || record.expiresAt < Date.now()) {
    if (record) {
      otps.splice(otps.indexOf(record), 1);
      store.saveOtps();
    }
    res.status(401).json({ success: false, message: "OTP expired. Please request a new one." });
    return;
  }
  record.verifyAttempts = Number(record.verifyAttempts || 0) + 1;
  if (record.verifyAttempts > 5) {
    otps.splice(otps.indexOf(record), 1);
    store.saveOtps();
    res.status(429).json({ success: false, message: "Maximum verification attempts reached. Request a new OTP." });
    return;
  }
  store.saveOtps();
  const apiKey = process.env.TWOFACTOR_API_KEY || "";
  const otpApiBase = process.env.TWOFACTOR_API_BASE_URL || "https://2factor.in/API/V1";
  if (!apiKey) {
    res.status(503).json({ success: false, message: "Phone OTP is temporarily unavailable." });
    return;
  }
  try {
    const response = await fetch(`${otpApiBase.replace(/\/+$/, "")}/${encodeURIComponent(apiKey)}/SMS/VERIFY/${encodeURIComponent(record.sessionId)}/${otp}`);
    const payload = await response.json();
    if (!response.ok || payload.Status !== "Success") {
      res.status(401).json({ success: false, message: "The OTP is incorrect or expired." });
      return;
    }
  } catch (err) {
    console.warn(`[otp] 2Factor verify failed: ${err.message}`);
    res.status(502).json({ success: false, message: "Could not verify OTP. Please try again." });
    return;
  }
  const users = store.getUsers();
  let user = findUserByPhone(phoneData.e164);
  let customToken = "";
  let firebaseUid = user?.firebaseUid || `phone_${crypto.createHash("sha256").update(phoneData.e164).digest("hex").slice(0, 28)}`;
  try {
    const firebaseAuth = getFirebaseAdminAuth(firebaseAdminApp);
    try {
      const firebaseUser = await firebaseAuth.getUserByPhoneNumber(phoneData.e164);
      firebaseUid = firebaseUser.uid;
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
      const firebaseUser = await firebaseAuth.createUser({ uid: firebaseUid, phoneNumber: phoneData.e164, displayName: user?.name || "Salty Pumpkin Customer" });
      firebaseUid = firebaseUser.uid;
    }
    customToken = await firebaseAuth.createCustomToken(firebaseUid);
  } catch (err) {
    console.warn(`[auth] Firebase phone custom token unavailable: ${err.message}`);
  }
  if (!user) {
    user = {
      id: firebaseUid,
      firebaseUid,
      email: "",
      phone: phoneData.e164,
      name: "Salty Pumpkin Customer",
      provider: "phone",
      role: "customer",
      passwordHash: "",
      addresses: [],
      wishlist: [],
      createdAt: new Date().toISOString(),
    };
    users.push(user);
  } else {
    user.firebaseUid = user.firebaseUid || firebaseUid;
    user.provider = "phone";
    user.role = user.role === "admin" ? "admin" : "customer";
    user.lastLoginAt = new Date().toISOString();
  }
  store.saveUsers();
  otps.splice(otps.indexOf(record), 1);
  store.saveOtps();
  res.json({ success: true, message: "Phone verified successfully.", user: publicUser(user), token: createToken(publicUser(user)), customToken });
});

app.post("/api/auth/send-email-otp", otpSendLimiter, (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) {
    res.status(400).json({ success: false, message: "Enter a valid email address." });
    return;
  }
  const result = storeEmailOtp(email);
  if (result.error) {
    res.status(result.status || 400).json({ success: false, message: result.error, retryAfter: result.retryAfter });
    return;
  }
  res.json({ success: true, message: "OTP sent successfully.", retryAfter: result.retryAfter, expiresIn: result.expiresIn });
});

app.post("/api/auth/verify-email-otp", otpVerifyLimiter, (req, res) => {
  const email = normalizeEmail(req.body.email);
  const otp = String(req.body.otp || "");
  if (!email || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ success: false, message: "Enter the valid 6-digit OTP." });
    return;
  }
  const otps = store.getOtps();
  const record = otps.find((item) => item.type === "email" && item.email === email);
  if (!record || record.expiresAt < Date.now()) {
    if (record) {
      otps.splice(otps.indexOf(record), 1);
      store.saveOtps();
    }
    res.status(401).json({ success: false, message: "OTP expired. Please request a new one." });
    return;
  }
  record.verifyAttempts = Number(record.verifyAttempts || 0) + 1;
  if (record.verifyAttempts > 5) {
    otps.splice(otps.indexOf(record), 1);
    store.saveOtps();
    res.status(429).json({ success: false, message: "Maximum verification attempts reached. Request a new OTP." });
    return;
  }
  if (!verifyPassword(otp, record.otpHash)) {
    store.saveOtps();
    res.status(401).json({ success: false, message: "The OTP is incorrect or expired." });
    return;
  }
  let user = findUserByEmail(email);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email,
      phone: "",
      name: email.split("@")[0],
      provider: "email_otp",
      role: resolveRole({ email }),
      passwordHash: "",
      addresses: [],
      wishlist: [],
      createdAt: new Date().toISOString(),
    };
    store.getUsers().push(user);
  } else {
    user.provider = user.provider || "email_otp";
    user.role = resolveRole({ email, phone: user.phone }) === "admin" ? "admin" : user.role || "customer";
    user.lastLoginAt = new Date().toISOString();
  }
  otps.splice(otps.indexOf(record), 1);
  store.saveOtps();
  store.saveUsers();
  res.json({ success: true, message: "Email verified successfully.", user: publicUser(user), token: createToken(publicUser(user)) });
});

app.post("/api/auth/register", (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") || String(password || "").length < 6) {
    res.status(400).json({ success: false, message: "Enter a valid email and a 6+ character password" });
    return;
  }
  const lower = email.toLowerCase();
  const existingEmailUser = findUserByEmail(lower);
  const existingPhoneUser = findUserByPhone(phone);
  if (existingEmailUser && (!existingPhoneUser || existingEmailUser === existingPhoneUser)) {
    res.status(409).json({ success: false, message: "Email already registered" });
    return;
  }
  if (existingPhoneUser) {
    existingPhoneUser.email = existingPhoneUser.email || lower;
    existingPhoneUser.name = name || existingPhoneUser.name || lower.split("@")[0];
    existingPhoneUser.passwordHash = hashPassword(password);
    existingPhoneUser.role = resolveRole({ email: lower, phone: existingPhoneUser.phone }) === "admin" ? "admin" : existingPhoneUser.role || "customer";
    existingPhoneUser.updatedAt = new Date().toISOString();
    store.saveUsers();
    res.status(200).json({ success: true, user: publicUser(existingPhoneUser), token: createToken(publicUser(existingPhoneUser)) });
    return;
  }
  const user = {
    id: crypto.randomUUID(),
    email: lower,
    phone: phone || "",
    name: name || lower.split("@")[0],
    role: "customer",
    passwordHash: hashPassword(password),
    addresses: [],
    createdAt: new Date().toISOString(),
  };
  store.getUsers().push(user);
  store.saveUsers();
  res.status(201).json({ success: true, user: publicUser(user), token: createToken(publicUser(user)) });
});

app.post("/api/auth/email-login", (req, res) => {
  const { email, password, name } = req.body;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") || String(password || "").length < 4) {
    res.status(400).json({ success: false, message: "Enter a valid email and password" });
    return;
  }
  const lower = email.toLowerCase();
  let user = findUserByEmail(lower);
  if (!user && resolveRole({ email: lower }) === "admin") {
    user = upsertBootstrapAdmin(lower, name, password);
  }
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ success: false, message: "Invalid email or password" });
    return;
  }
  user.role = resolveRole({ email: lower, phone: user.phone }) === "admin" ? "admin" : user.role || "user";
  store.saveUsers();
  res.json({ success: true, user: publicUser(user), token: createToken(publicUser(user)) });
});

app.post("/api/auth/forgot-password", (req, res) => {
  const user = findUserByEmail(req.body.email);
  if (user) {
    const resets = store.getPasswordResets();
    const token = crypto.randomBytes(24).toString("hex");
    resets.unshift({
      token,
      userId: user.id,
      expiresAt: Date.now() + 30 * 60 * 1000,
      createdAt: new Date().toISOString(),
    });
    store.savePasswordResets();
    console.log(`[auth] Password reset token for ${user.email}: ${token}`);
  }
  res.json({ success: true, message: "If that email exists, reset instructions have been generated." });
});

app.post("/api/auth/reset-password", (req, res) => {
  const { token, password } = req.body;
  if (!token || String(password || "").length < 6) {
    res.status(400).json({ success: false, message: "Invalid reset token or password" });
    return;
  }
  const resets = store.getPasswordResets();
  const record = resets.find((item) => item.token === token);
  if (!record || record.expiresAt < Date.now()) {
    res.status(400).json({ success: false, message: "Reset token expired" });
    return;
  }
  const user = store.getUsers().find((item) => item.id === record.userId);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  user.passwordHash = hashPassword(password);
  resets.splice(resets.indexOf(record), 1);
  store.saveUsers();
  store.savePasswordResets();
  res.json({ success: true, message: "Password reset successfully" });
});

app.post("/api/auth/google-login", (req, res) => {
  const email = (req.body.email || "google.customer@saltypumpkin.com").toLowerCase();
  const users = store.getUsers();
  let user = users.find((item) => item.email === email);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email,
      phone: "",
      name: req.body.name || "Google Customer",
      role: "customer",
      provider: "google",
      passwordHash: "",
      addresses: [],
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    store.saveUsers();
  }
  res.json({ success: true, user: publicUser(user), token: createToken(publicUser(user)) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.post("/api/auth/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

app.put("/api/auth/profile", requireAuth, (req, res) => {
  const users = store.getUsers();
  const user = users.find((item) => item.id === req.user.id);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  user.name = String(req.body.name || user.name || "").trim();
  const nextPhone = String(req.body.phone || user.phone || "").trim();
  const duplicatePhoneUser = findUserByPhone(nextPhone);
  const mergedUser = duplicatePhoneUser && duplicatePhoneUser !== user ? mergeCustomerUsers(user, duplicatePhoneUser) : user;
  mergedUser.phone = nextPhone;
  user.updatedAt = new Date().toISOString();
  store.saveUsers();
  res.json({ success: true, user: publicUser(mergedUser) });
});

app.post("/api/auth/sync-customer-data", requireAuth, (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.user.id);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  const requestedWishlist = Array.isArray(req.body.wishlist) ? req.body.wishlist.map(String) : [];
  const validProductIds = new Set(store.getProducts().map((product) => product._id));
  user.wishlist = [...new Set([...(user.wishlist || []), ...requestedWishlist])].filter((id) => validProductIds.has(id));

  const requestedAddresses = Array.isArray(req.body.addresses) ? req.body.addresses : [];
  const addressMap = new Map();
  [...(user.addresses || []), ...requestedAddresses].forEach((address) => {
    if (!address || typeof address !== "object") return;
    const key = address.id || [address.line1, address.city, address.pincode, address.phone].map((value) => String(value || "").trim().toLowerCase()).join("|");
    if (!key.replace(/\|/g, "")) return;
    addressMap.set(key, { ...address, id: address.id || crypto.randomUUID() });
  });
  user.addresses = normalizeSavedAddresses([...addressMap.values()]);

  if (!user.name && req.body.profile?.name) user.name = String(req.body.profile.name).trim();
  if (!user.phone && req.body.profile?.phone) user.phone = String(req.body.profile.phone).trim();
  user.updatedAt = new Date().toISOString();
  store.saveUsers();
  res.json({ success: true, user: publicUser(user), ids: user.wishlist });
});

app.post("/api/auth/addresses", requireAuth, (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.user.id);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  const normalized = normalizeShippingAddress(req.body);
  const addressError = validateShippingAddress(normalized);
  if (addressError) {
    res.status(400).json({ success: false, message: addressError });
    return;
  }
  const address = {
    id: crypto.randomUUID(),
    ...normalized,
    label: String(req.body.label || "").trim(),
    isDefault: Boolean(req.body.isDefault),
  };
  user.addresses = Array.isArray(user.addresses) ? user.addresses : [];
  user.addresses.push(address);
  if (address.isDefault) {
    user.addresses.forEach((item) => {
      if (item.id !== address.id) item.isDefault = false;
    });
  }
  user.addresses = normalizeSavedAddresses(user.addresses);
  store.saveUsers();
  res.status(201).json({
    success: true,
    address: user.addresses.find((item) => item.id === address.id),
    user: publicUser(user),
  });
});

app.put("/api/auth/addresses/:addressId", requireAuth, (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.user.id);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  user.addresses = Array.isArray(user.addresses) ? user.addresses : [];
  const index = user.addresses.findIndex((address) => address.id === req.params.addressId);
  if (index === -1) {
    res.status(404).json({ success: false, message: "Address not found" });
    return;
  }
  const normalized = normalizeShippingAddress({ ...user.addresses[index], ...req.body });
  const addressError = validateShippingAddress(normalized);
  if (addressError) {
    res.status(400).json({ success: false, message: addressError });
    return;
  }
  user.addresses[index] = {
    ...user.addresses[index],
    ...normalized,
    label: String(req.body.label ?? user.addresses[index].label ?? "").trim(),
    isDefault: req.body.isDefault !== undefined ? Boolean(req.body.isDefault) : Boolean(user.addresses[index].isDefault),
    id: req.params.addressId,
  };
  if (user.addresses[index].isDefault) {
    user.addresses.forEach((item, itemIndex) => {
      if (itemIndex !== index) item.isDefault = false;
    });
  }
  user.addresses = normalizeSavedAddresses(user.addresses);
  store.saveUsers();
  res.json({
    success: true,
    address: user.addresses.find((item) => item.id === req.params.addressId),
    user: publicUser(user),
  });
});

app.delete("/api/auth/addresses/:addressId", requireAuth, (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.user.id);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  user.addresses = (user.addresses || []).filter((address) => address.id !== req.params.addressId);
  user.addresses = normalizeSavedAddresses(user.addresses);
  store.saveUsers();
  res.json({ success: true, id: req.params.addressId, user: publicUser(user) });
});

app.put("/api/auth/addresses/:addressId/default", requireAuth, (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.user.id);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  const address = (user.addresses || []).find((item) => item.id === req.params.addressId);
  if (!address) {
    res.status(404).json({ success: false, message: "Address not found" });
    return;
  }
  user.addresses = normalizeSavedAddresses(
    user.addresses.map((item) => ({ ...item, isDefault: item.id === req.params.addressId }))
  );
  store.saveUsers();
  res.json({
    success: true,
    address: user.addresses.find((item) => item.id === req.params.addressId),
    user: publicUser(user),
  });
});

app.get("/api/auth/wishlist", requireAuth, (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.user.id);
  const ids = Array.isArray(user?.wishlist) ? user.wishlist : [];
  const products = ids.map((id) => store.getProducts().find((product) => product._id === id)).filter(Boolean);
  res.json({ success: true, ids, products });
});

app.put("/api/auth/wishlist/:productId", requireAuth, (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.user.id);
  const product = store.getProducts().find((item) => item._id === req.params.productId);
  if (!user || !product) {
    res.status(404).json({ success: false, message: "User or product not found" });
    return;
  }
  user.wishlist = Array.isArray(user.wishlist) ? user.wishlist : [];
  if (!user.wishlist.includes(product._id)) user.wishlist.push(product._id);
  store.saveUsers();
  res.json({ success: true, ids: user.wishlist, user: publicUser(user) });
});

app.delete("/api/auth/wishlist/:productId", requireAuth, (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.user.id);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return;
  }
  user.wishlist = (user.wishlist || []).filter((id) => id !== req.params.productId);
  store.saveUsers();
  res.json({ success: true, ids: user.wishlist, user: publicUser(user) });
});

// ---------------------------------------------------------------------------
// Products (public)
// ---------------------------------------------------------------------------
app.get("/api/products", (req, res) => {
  const { category, search } = req.query;
  let products = store.getProducts().filter((product) => product.isPublished !== false);
  if (category && category !== "All") {
    products = products.filter((product) => matchesProductCategory(product, category));
  }
  if (search) {
    const query = String(search).toLowerCase();
    products = products.filter((p) =>
      [
        p.name,
        p.description,
        p.productNumber,
        p.sku,
        p.category,
        p.parentCategory,
        p.childCategory,
        ...(p.tags || []),
        ...(p.colors || []),
        ...(p.ageGroups || []),
      ].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }
  products = products.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  res.json({ success: true, products, items: products, total: products.length });
});

app.get("/api/products/category/:category", (req, res) => {
  const products = store
    .getProducts()
    .filter(
      (p) =>
        p.isPublished !== false &&
        matchesProductCategory(p, req.params.category)
    );
  res.json({ success: true, products, items: products, total: products.length });
});

app.get("/api/products/:slug", (req, res) => {
  const product = store.getProducts().find((item) => item.slug === req.params.slug);
  if (!product) {
    res.status(404).json({ success: false, message: "Product not found" });
    return;
  }
  res.json({ success: true, product });
});

app.get("/api/products/:slug/reviews", (req, res) => {
  const product = store.getProducts().find((item) => item.slug === req.params.slug);
  if (!product) {
    res.status(404).json({ success: false, message: "Product not found" });
    return;
  }
  const reviews = store
    .getReviews()
    .filter((review) => review.productId === product._id && review.status !== "rejected")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : 0;
  res.json({ success: true, reviews, average, total: reviews.length });
});

app.post("/api/products/:slug/reviews", requireAuth, customerMediaUpload.array("media", 6), (req, res) => {
  const product = store.getProducts().find((item) => item.slug === req.params.slug);
  if (!product) {
    res.status(404).json({ success: false, message: "Product not found" });
    return;
  }
  const rating = Number(req.body.rating || 0);
  const text = String(req.body.text || "").trim();
  if (!Number.isFinite(rating) || rating < 1 || rating > 5 || text.length < 3) {
    res.status(400).json({ success: false, message: "Add a rating from 1 to 5 and a short review." });
    return;
  }
  const review = {
    id: crypto.randomUUID(),
    productId: product._id,
    productSlug: product.slug,
    customerId: req.user.id,
    customerName: req.user.name || "Verified customer",
    rating,
    text: text.slice(0, 1200),
    media: (req.files || []).map((file) => ({
      url: `/uploads/${file.filename}`,
      type: file.mimetype.startsWith("video/") ? "video" : "image",
      name: file.originalname,
    })),
    status: "approved",
    createdAt: new Date().toISOString(),
  };
  store.getReviews().unshift(review);
  store.saveReviews();
  res.status(201).json({ success: true, review });
});

// ---------------------------------------------------------------------------
// Orders (authenticated)
// ---------------------------------------------------------------------------
app.post("/api/orders/quote", requireAuth, async (req, res) => {
  const { order, error } = computeOrderFromCatalog(req);
  if (error) {
    res.status(400).json({ success: false, message: error });
    return;
  }
  try {
    await prepareOrderDelivery(order);
    res.json({
      success: true,
      serviceability: order.serviceability || null,
      serviceabilityStatus: order.serviceabilityStatus,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      codExtraFee: order.codExtraFee,
      gst: order.gst,
      total: order.total,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, code: err.code });
  }
});

app.post("/api/orders", requireAuth, async (req, res) => {
  if (req.body.paymentMethod === "online") {
    res.status(400).json({
      success: false,
      message: "Online orders must be created through secure payment verification.",
    });
    return;
  }
  const { order, error } = computeOrderFromCatalog(req);
  if (error) {
    res.status(400).json({ success: false, message: error });
    return;
  }
  try {
    await prepareOrderDelivery(order);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, code: err.code });
    return;
  }
  order.shipmentStatus = "pending";
  order.courierPartner = "Delhivery";
  store.getOrders().unshift(order);
  store.saveOrders();
  decrementStock(order);
  const fulfillment = await createDelhiveryShipment(order);
  res.status(201).json({ success: true, order, fulfillment });
});

app.get("/api/orders/my", requireAuth, (req, res) => {
  const orders = store.getOrders().filter((order) => order.user === req.user.id);
  res.json({ success: true, orders, items: orders, total: orders.length });
});

app.post("/api/orders/track", (req, res) => {
  const lookup = String(req.body.lookup || req.body.orderNumber || req.body.trackingNumber || "").trim().toLowerCase();
  const contact = String(req.body.contact || "").trim().toLowerCase();
  if (!lookup) {
    res.status(400).json({ success: false, message: "Enter an order number, AWB, or tracking number." });
    return;
  }
  const order = store.getOrders().find((item) => {
    const ids = [item._id, item.orderNumber, item.trackingNumber, item.waybill].map((value) => String(value || "").toLowerCase());
    const contactValues = [item.shippingAddress?.email, item.shippingAddress?.phone, item.customerEmail, item.customerPhone].map((value) => String(value || "").toLowerCase());
    const contactOk = !contact || contactValues.some((value) => value && value.includes(contact));
    return ids.includes(lookup) && contactOk;
  });
  if (!order) {
    res.status(404).json({ success: false, message: "We could not find an order with those details." });
    return;
  }
  res.json({ success: true, order: publicOrderTracking(order) });
});

app.get("/api/orders/:orderId", requireAuth, (req, res) => {
  const order = store
    .getOrders()
    .find((item) => item._id === req.params.orderId && item.user === req.user.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  res.json({ success: true, order });
});

app.post("/api/orders/:orderId/request", requireAuth, customerMediaUpload.array("media", 4), (req, res) => {
  const order = store
    .getOrders()
    .find((item) => item._id === req.params.orderId && item.user === req.user.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  const type = String(req.body.type || "").toLowerCase();
  if (!["return", "exchange", "cancel"].includes(type)) {
    res.status(400).json({ success: false, message: "Choose return, exchange, or cancellation." });
    return;
  }
  if (["delivered", "cancelled", "payment_cancelled"].includes(order.status) && type === "cancel") {
    res.status(409).json({ success: false, message: "This order can no longer be cancelled." });
    return;
  }
  const request = {
    id: crypto.randomUUID(),
    type,
    reason: String(req.body.reason || "").trim().slice(0, 1200),
    status: type === "cancel" ? "submitted" : "pending_review",
    media: (req.files || []).map((file) => ({
      url: `/uploads/${file.filename}`,
      type: file.mimetype.startsWith("video/") ? "video" : "image",
      name: file.originalname,
    })),
    createdAt: new Date().toISOString(),
  };
  order.customerRequests = [request, ...(order.customerRequests || [])];
  if (type === "cancel") {
    const previousStatus = order.status;
    order.status = "cancelled";
    order.paymentStatus = order.paymentStatus === "paid" ? "refund_pending" : order.paymentStatus;
    if (previousStatus !== "cancelled") restoreStock(order);
  }
  order.updatedAt = new Date().toISOString();
  store.saveOrders();
  res.status(201).json({ success: true, order, request });
});

app.post("/api/orders/:orderId/tracking/refresh", requireAuth, async (req, res) => {
  const order = store
    .getOrders()
    .find((item) => item._id === req.params.orderId && item.user === req.user.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  try {
    await refreshDelhiveryShipment(order);
    res.json({ success: true, order });
  } catch (err) {
    order.shipmentError = err.message;
    order.shipmentLastSyncTime = new Date().toISOString();
    store.saveOrders();
    res.status(502).json({ success: false, message: "Tracking could not be refreshed right now.", order });
  }
});

app.get("/api/orders/:orderId/invoice", requireAuth, (req, res) => {
  const order = store
    .getOrders()
    .find((item) => item._id === req.params.orderId && item.user === req.user.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  writeInvoicePdf(res, order, req.user);
});

// ---------------------------------------------------------------------------
// Payments (authenticated)
// ---------------------------------------------------------------------------
function findCustomerPaymentTransaction(body, userId) {
  const razorpayOrderId = body.razorpayOrderId || body.razorpay_order_id || "";
  const checkoutId = body.checkoutId || "";
  return store.getTransactions().find(
    (item) =>
      item.customer === userId &&
      ((razorpayOrderId && item.razorpayOrderId === razorpayOrderId) ||
        (checkoutId && item.checkoutId === checkoutId))
  );
}

app.post("/api/payments/create-order", requireAuth, async (req, res) => {
  const { keyId } = getRazorpayCredentials();
  if (!paymentsConfigured()) {
    res.status(503).json({
      success: false,
      message: "Online payment is unavailable because Razorpay keys are missing.",
    });
    return;
  }
  const { order: checkoutOrder, error } = computeOrderFromCatalog(req, {
    ...req.body,
    paymentMethod: "online",
  });
  if (error) {
    res.status(400).json({ success: false, message: error });
    return;
  }
  try {
    await prepareOrderDelivery(checkoutOrder);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, code: err.code });
    return;
  }
  const amount = Math.round(Number(checkoutOrder.total || 0) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    res.status(400).json({ success: false, message: "Order amount must be greater than zero." });
    return;
  }
  let order;
  try {
    const body = await razorpayClient().orders.create({
      amount,
      currency: req.body.currency || "INR",
      receipt: checkoutOrder.orderNumber,
      notes: { checkoutId: checkoutOrder._id, customerId: req.user.id },
    });
    order = { ...body, success: true, key: keyId };
  } catch (err) {
    console.error(`[payments] Razorpay order creation failed: ${err.message}`);
    res.status(502).json({
      success: false,
      message: "Razorpay could not create the payment order. Please try again.",
    });
    return;
  }
  store.getTransactions().unshift({
    id: order.id,
    checkoutId: checkoutOrder._id,
    orderId: "",
    orderNumber: checkoutOrder.orderNumber,
    customer: req.user.id,
    amount,
    transactionAmount: checkoutOrder.total,
    currency: order.currency || "INR",
    method: "online",
    paymentMethod: "online",
    status: "pending",
    paymentStatus: "pending",
    provider: "razorpay",
    razorpayOrderId: order.id,
    checkout: {
      items: req.body.items,
      shippingAddress: checkoutOrder.shippingAddress,
      paymentMethod: "online",
      pricing: { shippingFee: checkoutOrder.shippingFee },
    },
    createdAt: new Date().toISOString(),
  });
  store.saveTransactions();
  res.json({ ...order, checkoutId: checkoutOrder._id, orderNumber: checkoutOrder.orderNumber });
});

app.post("/api/payments/verify", requireAuth, async (req, res) => {
  if (!paymentsConfigured()) {
    res.status(503).json({
      success: false,
      verified: false,
      message: "Payment verification is unavailable because Razorpay keys are missing.",
    });
    return;
  }
  if (
    !req.body.razorpay_order_id ||
    !req.body.razorpay_payment_id ||
    !req.body.razorpay_signature
  ) {
    res.status(400).json({ success: false, verified: false, message: "Incomplete Razorpay payment response." });
    return;
  }
  const transaction = store.getTransactions().find(
    (item) =>
      item.razorpayOrderId === req.body.razorpay_order_id &&
      item.customer === req.user.id
  );
  if (!transaction) {
    res.status(404).json({ success: false, verified: false, message: "Payment session not found." });
    return;
  }
  if (transaction.paymentStatus === "success" && transaction.orderId) {
    const existingOrder = store.getOrders().find((item) => item._id === transaction.orderId);
    if (existingOrder) {
      res.json({ success: true, verified: true, duplicate: true, order: existingOrder });
      return;
    }
  }
  const verified = verifyRazorpaySignature(
    req.body.razorpay_order_id,
    req.body.razorpay_payment_id,
    req.body.razorpay_signature
  );

  if (!verified) {
    transaction.paymentId = req.body.razorpay_payment_id;
    transaction.status = "failed";
    transaction.paymentStatus = "failed";
    transaction.reason = "Payment signature verification failed";
    transaction.updatedAt = new Date().toISOString();
    store.saveTransactions();
    res.status(400).json({ success: false, verified: false, message: "Payment verification failed" });
    return;
  }

  const duplicatePayment = store.getOrders().find(
    (item) => item.paymentId === req.body.razorpay_payment_id
  );
  if (duplicatePayment) {
    if (duplicatePayment.user === req.user.id) {
      transaction.orderId = duplicatePayment._id;
      transaction.status = "success";
      transaction.paymentStatus = "success";
      store.saveTransactions();
      res.json({ success: true, verified: true, duplicate: true, order: duplicatePayment });
      return;
    }
    res.status(409).json({ success: false, verified: false, message: "This payment was already used." });
    return;
  }

  const { order: placedOrder, error } = computeOrderFromCatalog(req, transaction.checkout || {});
  if (error) {
    transaction.status = "failed";
    transaction.paymentStatus = "failed";
    transaction.reason = error;
    transaction.updatedAt = new Date().toISOString();
    store.saveTransactions();
    res.status(409).json({ success: false, verified: false, message: error });
    return;
  }
  await prepareOrderDelivery(placedOrder, transaction.checkout?.pricing);
  const verifiedAmount = Math.round(Number(placedOrder.total || 0) * 100);
  if (verifiedAmount !== Number(transaction.amount)) {
    transaction.status = "failed";
    transaction.paymentStatus = "failed";
    transaction.reason = "Order amount changed before verification.";
    transaction.updatedAt = new Date().toISOString();
    store.saveTransactions();
    res.status(409).json({
      success: false,
      verified: false,
      message: "The cart total changed. Please restart checkout.",
    });
    return;
  }

  const paymentTimestamp = new Date().toISOString();
  placedOrder._id = transaction.checkoutId || placedOrder._id;
  placedOrder.orderNumber = transaction.orderNumber || placedOrder.orderNumber;
  placedOrder.paymentMethod = "online";
  placedOrder.paymentStatus = "paid";
  placedOrder.status = "confirmed";
  placedOrder.razorpayOrderId = req.body.razorpay_order_id;
  placedOrder.paymentId = req.body.razorpay_payment_id;
  placedOrder.razorpaySignature = req.body.razorpay_signature;
  placedOrder.transactionAmount = placedOrder.total;
  placedOrder.paymentTimestamp = paymentTimestamp;
  placedOrder.updatedAt = paymentTimestamp;
  placedOrder.shipmentStatus = "pending";
  placedOrder.courierPartner = "Delhivery";

  store.getOrders().unshift(placedOrder);
  store.saveOrders();
  decrementStock(placedOrder);
  const fulfillment = await createDelhiveryShipment(placedOrder);
  transaction.orderId = placedOrder._id;
  transaction.paymentId = req.body.razorpay_payment_id;
  transaction.razorpaySignature = req.body.razorpay_signature;
  transaction.status = "success";
  transaction.paymentStatus = "success";
  transaction.transactionAmount = placedOrder.total;
  transaction.paymentTimestamp = paymentTimestamp;
  transaction.updatedAt = paymentTimestamp;
  store.saveTransactions();
  res.json({ success: true, verified: true, order: placedOrder, fulfillment });
});

app.post("/api/payments/failed", requireAuth, (req, res) => {
  const order = store
    .getOrders()
    .find((item) => item._id === req.body.orderId && item.user === req.user.id);
  const transaction = findCustomerPaymentTransaction(req.body, req.user.id);
  if (!order && !transaction) {
    res.status(404).json({ success: false, message: "Payment session not found" });
    return;
  }
  if (order && ["success", "paid"].includes(order.paymentStatus)) {
    res.status(409).json({ success: false, message: "A successful payment cannot be marked as failed." });
    return;
  }
  if (order) {
    order.paymentStatus = "failed";
    order.status = "payment_failed";
    order.paymentFailureReason = req.body.reason || "Payment failed";
    order.paymentId = req.body.paymentId || order.paymentId || "";
    order.updatedAt = new Date().toISOString();
    restoreStock(order);
    store.saveOrders();
  }
  if (transaction) {
    transaction.paymentId = req.body.paymentId || transaction.paymentId || "";
    transaction.status = "failed";
    transaction.paymentStatus = "failed";
    transaction.reason = req.body.reason || "Payment failed";
    transaction.updatedAt = new Date().toISOString();
  }
  store.saveTransactions();
  res.json({ success: true, order: order || null });
});

app.post("/api/payments/cancelled", requireAuth, (req, res) => {
  const order = store
    .getOrders()
    .find((item) => item._id === req.body.orderId && item.user === req.user.id);
  const transaction = findCustomerPaymentTransaction(req.body, req.user.id);
  if (!order && !transaction) {
    res.status(404).json({ success: false, message: "Payment session not found" });
    return;
  }
  if (order && ["success", "paid"].includes(order.paymentStatus)) {
    res.status(409).json({ success: false, message: "A successful payment cannot be cancelled." });
    return;
  }
  const reason = req.body.reason || "Payment cancelled by customer";
  if (order) {
    order.paymentStatus = "cancelled";
    order.status = "payment_cancelled";
    order.paymentFailureReason = reason;
    order.updatedAt = new Date().toISOString();
    restoreStock(order);
    store.saveOrders();
  }
  if (transaction) {
    transaction.status = "cancelled";
    transaction.paymentStatus = "cancelled";
    transaction.reason = reason;
    transaction.updatedAt = new Date().toISOString();
  }
  store.saveTransactions();
  res.json({ success: true, order: order || null });
});

app.post("/api/payments/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const { webhookSecret } = getRazorpayCredentials();
  const signature = req.headers["x-razorpay-signature"];
  const bodyText = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : JSON.stringify(req.body || {});

  if (!webhookSecret) {
    res.status(503).json({ success: false, message: "Razorpay webhook secret is not configured." });
    return;
  }
  if (!signature) {
    res.status(400).json({ success: false, message: "Missing webhook signature" });
    return;
  }
  const expected = crypto.createHmac("sha256", webhookSecret).update(bodyText).digest("hex");
  if (!safeEqualHex(expected, signature)) {
    res.status(400).json({ success: false, message: "Invalid webhook signature" });
    return;
  }

  let payload = {};
  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = {};
  }

  const payment = payload?.payload?.payment?.entity;
  const webhookPaymentStatus =
    payment?.status === "captured"
      ? "paid"
      : payment?.status === "failed"
        ? "failed"
        : "pending";
  const order = payment?.order_id
    ? store.getOrders().find((item) => item.razorpayOrderId === payment.order_id)
    : null;
  if (order && !["success", "paid"].includes(order.paymentStatus)) {
    order.paymentStatus = webhookPaymentStatus;
    order.status =
      webhookPaymentStatus === "paid"
        ? "confirmed"
        : webhookPaymentStatus === "failed"
          ? "payment_failed"
          : order.status;
    order.paymentId = payment.id || order.paymentId || "";
    order.paymentFailureReason = payment.error_description || order.paymentFailureReason || "";
    order.updatedAt = new Date().toISOString();
    store.saveOrders();
  }
  const pendingTransaction = payment?.order_id
    ? store.getTransactions().find((item) => item.razorpayOrderId === payment.order_id)
    : null;
  if (pendingTransaction && pendingTransaction.paymentStatus !== "success") {
    pendingTransaction.paymentId = payment?.id || pendingTransaction.paymentId || "";
    pendingTransaction.providerStatus = payment?.status || "received";
    pendingTransaction.webhookVerifiedAt = new Date().toISOString();
    pendingTransaction.updatedAt = new Date().toISOString();
    if (webhookPaymentStatus === "failed") {
      pendingTransaction.status = "failed";
      pendingTransaction.paymentStatus = "failed";
      pendingTransaction.reason = payment?.error_description || "Razorpay reported a failed payment.";
    }
  }

  store.getTransactions().unshift({
    id: payment?.id || `webhook_${Date.now()}`,
    orderId: order?._id || "",
    razorpayOrderId: payment?.order_id || "",
    paymentId: payment?.id || "",
    event: payload.event || "razorpay.webhook",
    provider: "razorpay",
    status: payment?.status || "received",
    paymentStatus: webhookPaymentStatus,
    createdAt: new Date().toISOString(),
  });
  store.saveTransactions();
  res.json({ success: true });
});

app.post("/api/payments/refund", requireAuth, async (req, res) => {
  try {
    const refund = await createRefundRecord(req.body, req.user);
    res.json({ success: true, refund });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message || "Refund failed" });
  }
});

async function createRefundRecord(body, user) {
  const amount = Math.round(Number(body.amount || 0) * 100);
  if (!paymentsConfigured()) {
    throw new Error("Refund is unavailable because Razorpay keys are missing.");
  }
  if (!body.paymentId) {
    throw new Error("Razorpay payment ID is required for a refund.");
  }
  const providerRefund = await razorpayClient().payments.refund(body.paymentId, amount ? { amount } : {});
  const status = providerRefund.status || "processed";
  const order = store.getOrders().find((item) => item._id === body.orderId);
  if (order) {
    order.paymentStatus = "refunded";
    order.refundStatus = status;
    order.updatedAt = new Date().toISOString();
    store.saveOrders();
  }
  const refund = {
    id: providerRefund?.id || `rfnd_${Date.now()}`,
    orderId: body.orderId || "",
    paymentId: body.paymentId || "",
    amount,
    refundStatus: status,
    status: "refunded",
    providerStatus: status,
    notes: body.notes || "",
    requestedBy: user?.id || "admin",
    createdAt: new Date().toISOString(),
  };
  store.getTransactions().unshift(refund);
  store.saveTransactions();
  return refund;
}

// ---------------------------------------------------------------------------
// Delivery / tracking webhooks
//   These are server-to-server callbacks. Protect them with a shared secret
//   when the partner supports it (DELIVERY_API_KEY).
// ---------------------------------------------------------------------------
app.post("/api/delivery/webhook", (req, res) => {
  const expectedKey = process.env.DELHIVERY_WEBHOOK_SECRET || config.get("delivery.deliveryApiKey");
  if (expectedKey) {
    const provided = req.headers["x-delivery-key"] || req.query.key;
    if (provided !== expectedKey) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
  }
  const order = store.getOrders().find((item) => item._id === req.body.orderId);
  if (order) {
    syncShipmentFields(order, {
      courierPartner: req.body.provider || "Delhivery",
      trackingNumber: req.body.trackingNumber || req.body.waybill,
      waybill: req.body.waybill || req.body.trackingNumber,
      shipmentId: req.body.shipmentId,
      shipmentStatus: delhivery.normalizeStatus(req.body.status || "in_transit"),
      rawStatus: req.body.status,
      estimatedDeliveryDate: req.body.estimatedDeliveryDate,
      timeline: req.body.timeline,
    });
    store.saveOrders();
  }
  res.json({ success: true, order });
});

app.post("/api/tracking/meta-conversions", async (req, res) => {
  const tracking = config.getConfig("tracking");
  const analytics = config.getConfig("analytics");
  const pixelId = tracking.metaPixelId || analytics.metaPixelId;
  const accessToken = tracking.metaConversionsToken || analytics.metaConversionsToken;
  const eventName = req.body.event_name || req.body.event || "CustomEvent";
  const eventId = req.body.event_id || `srv_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  if (!tracking.metaConversionsApi || !pixelId || !accessToken) {
    res.json({ success: true, queued: false, event: eventName, event_id: eventId, reason: "Meta CAPI disabled or not configured" });
    return;
  }
  const userData = req.body.user_data || {};
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: req.body.event_source_url || req.headers.referer || "",
        user_data: {
          client_ip_address: clientIp(req),
          client_user_agent: req.headers["user-agent"] || "",
          em: sha256(userData.email || req.user?.email),
          ph: sha256(userData.phone || req.user?.phone),
        },
        custom_data: req.body.custom_data || {},
      },
    ],
  };
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    store.getTransactions().unshift({
      id: eventId,
      provider: "meta_capi",
      event: eventName,
      status: response.ok ? "sent" : "failed",
      response: body,
      createdAt: new Date().toISOString(),
    });
    store.saveTransactions();
    res.status(response.ok ? 200 : 502).json({ success: response.ok, event: eventName, event_id: eventId, response: body });
  } catch (err) {
    res.status(502).json({ success: false, event: eventName, event_id: eventId, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
app.use("/api/admin", requireAuth, requireAdmin);

app.get("/api/admin/contact-messages", (req, res) => {
  const messages = store.getContactMessages().slice(0, 200);
  res.json({ success: true, messages, items: messages, total: messages.length });
});

app.get("/api/admin/transactions", (req, res) => {
  const transactions = store.getTransactions();
  res.json({ success: true, items: transactions, transactions, total: transactions.length });
});

app.get("/api/admin/payments/dashboard", (req, res) => {
  const orders = store.getOrders();
  const transactions = store.getTransactions();
  const counts = {
    pending: orders.filter((order) => order.paymentStatus === "pending").length,
    success: orders.filter((order) => order.paymentStatus === "success").length,
    failed: orders.filter((order) => order.paymentStatus === "failed").length,
    cancelled: orders.filter((order) => order.paymentStatus === "cancelled").length,
    refunded: orders.filter((order) => order.paymentStatus === "refunded").length,
  };
  const revenue = orders
    .filter((order) => order.paymentStatus === "success")
    .reduce((sum, order) => sum + Number(order.total || order.amount || 0), 0);
  res.json({
    success: true,
    counts,
    revenue,
    transactions: transactions.slice(0, 10),
    paymentsConfigured: paymentsConfigured(),
  });
});

app.get("/api/admin/customers", (req, res) => {
  const customers = store.getUsers().map(customerSummary);
  res.json({ success: true, customers, items: customers, total: customers.length });
});

app.get("/api/admin/customers/:id", (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.params.id);
  if (!user) {
    res.status(404).json({ success: false, message: "Customer not found" });
    return;
  }
  const orders = store.getOrders().filter((order) => order.user === user.id);
  res.json({ success: true, customer: customerSummary(user), orders });
});

app.put("/api/admin/customers/:id/status", (req, res) => {
  const user = store.getUsers().find((item) => item.id === req.params.id);
  if (!user) {
    res.status(404).json({ success: false, message: "Customer not found" });
    return;
  }
  user.status = req.body.status === "banned" ? "banned" : "active";
  user.updatedAt = new Date().toISOString();
  store.saveUsers();
  res.json({ success: true, customer: customerSummary(user) });
});

app.get("/api/admin/dashboard", (req, res) => {
  const orders = store.getOrders();
  const revenue = orders.reduce((sum, o) => sum + Number(o.total || o.amount || 0), 0);
  res.json({
    success: true,
    stats: {
      revenue,
      activeOrders: orders.length,
      products: store.getProducts().length,
      customers: new Set(orders.map((o) => o.user)).size,
    },
    orders: orders.slice(0, 5),
  });
});

function settingsResponse() {
  const settings = config.publicSettings();
  const configured = {};
  Object.keys(settings).forEach((group) => {
    configured[group] = config.groupConfigured(group);
  });
  return { settings, configured, audit: store.getSettingsAudit().slice(0, 25) };
}

function readinessPayload() {
  const publicConfig = config.publicSettings();
  const checklist = {
    payments: config.groupConfigured("payments"),
    storeInfo: config.groupConfigured("store"),
    delivery: config.groupConfigured("delivery"),
    email: config.groupConfigured("email"),
    otp: config.groupConfigured("otp"),
    storage: config.groupConfigured("storage"),
  };
  return {
    success: true,
    checklist,
    tests: store.getSettings()?.tests || {},
    configured: settingsResponse().configured,
    readyToTakeOrders: Boolean(
      checklist.payments &&
        checklist.storeInfo &&
        checklist.delivery &&
        (publicConfig.payments.codEnabled || paymentsConfigured())
    ),
  };
}

app.get("/api/admin/settings", (req, res) => {
  res.json({ success: true, ...settingsResponse() });
});

app.put("/api/admin/settings", (req, res) => {
  try {
    config.saveSettingsPatch(req.body?.settings || req.body || {}, req.user);
    res.json({ success: true, ...settingsResponse() });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post("/api/admin/settings/test/:integration", async (req, res) => {
  const integration = req.params.integration;
  const result = await testIntegration(integration);
  const current = store.getSettings();
  store.replaceSettings({
    ...current,
    tests: {
      ...(current.tests || {}),
      [integration]: {
        status: result.status,
        message: result.message,
        testedAt: new Date().toISOString(),
      },
    },
  });
  config.invalidate();
  res.status(result.success ? 200 : 400).json(result);
});

app.get("/api/admin/readiness", (req, res) => {
  res.json(readinessPayload());
});

async function testIntegration(integration) {
  try {
    if (integration === "payments") return await testPayments();
    if (integration === "delivery") return await testDelivery();
    if (integration === "email") return testConfigured("email", "SMTP settings are configured.");
    if (integration === "storage") return testConfigured("storage", "Image storage settings are configured.");
    if (integration === "otp") return testConfigured("otp", "OTP settings are configured.");
    return { success: false, status: "failed", message: "Unknown integration" };
  } catch (err) {
    return { success: false, status: "failed", message: err.message || "Connection test failed" };
  }
}

function testConfigured(group, message) {
  if (!config.groupConfigured(group)) {
    return { success: false, status: "failed", message: "Not configured" };
  }
  return { success: true, status: "connected", message };
}

async function testPayments() {
  const { keyId, keySecret } = getRazorpayCredentials();
  if (!keyId || !keySecret) {
    return { success: false, status: "failed", message: "Razorpay key id and secret are required" };
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: 100,
      currency: "INR",
      receipt: `settings_test_${Date.now()}`,
      notes: { source: "salty-pumpkin-admin-settings-test" },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    return { success: false, status: "failed", message: `Razorpay test failed: ${body.slice(0, 180)}` };
  }
  return { success: true, status: "connected", message: "Razorpay test order created successfully" };
}

async function testDelivery() {
  const delivery = config.getConfig("delivery");
  if (delivery.deliveryProvider === "manual") {
    return { success: true, status: "connected", message: "Manual fulfilment selected" };
  }
  if (!delivery.deliveryApiBaseUrl || !delivery.deliveryApiKey) {
    return { success: false, status: "failed", message: "Delivery API URL and key are required" };
  }
  const response = await fetch(delivery.deliveryApiBaseUrl, {
    headers: { "x-delivery-key": delivery.deliveryApiKey },
  });
  return response.ok
    ? { success: true, status: "connected", message: "Delivery provider responded successfully" }
    : { success: false, status: "failed", message: `Delivery provider returned ${response.status}` };
}

app.get("/api/admin/products", (req, res) => {
  const products = store
    .getProducts()
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  res.json({ success: true, items: products, products, total: products.length });
});

app.get("/api/admin/products/export.csv", (req, res) => {
  const headers = [
    "name", "productNumber", "sku", "parentCategory", "childCategory", "category", "description",
    "price", "mrp", "stock", "colors", "ageGroups", "imageCodes", "modelImageCode", "images",
    "tags", "sizeChartId", "isPublished",
  ];
  const rows = store.getProducts().map((product) => ({
    ...product,
    colors: (product.colors || []).join(", "),
    ageGroups: (product.ageGroups || []).join(", "),
    imageCodes: (product.imageCodes || []).join(", "),
    images: (product.images || []).join(", "),
    tags: (product.tags || []).join(", "),
  }));
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=salty-pumpkin-products-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(csv);
});

app.get("/api/admin/products/by-sku/:sku", (req, res) => {
  const wanted = decodeURIComponent(req.params.sku || "").trim().toLowerCase();
  const product = store.getProducts().find((item) =>
    [item.productNumber, item.sku]
      .some((value) => String(value || "").trim().toLowerCase() === wanted)
  );
  if (!product) {
    res.status(404).json({ success: false, message: "No product found with that exact SKU/product number." });
    return;
  }
  res.json({ success: true, product });
});

app.get("/api/admin/categories", (req, res) => {
  res.json({ success: true, categories: CATEGORY_TREE, ageGroups: AGE_GROUPS });
});

app.get("/api/admin/media", (req, res) => {
  const items = uploadedMedia().sort((a, b) => b.filename.localeCompare(a.filename));
  res.json({ success: true, items, media: items, total: items.length });
});

app.get("/api/admin/import-logs", (req, res) => {
  const logs = store.getImportLogs().slice(0, 50);
  res.json({ success: true, logs, items: logs, total: logs.length });
});

app.post("/api/admin/products", (req, res) => {
  const products = store.getProducts();
  const product = normalizeProduct(req.body || {}, products);
  if (!product) {
    res.status(400).json({ success: false, message: "Product name is required" });
    return;
  }
  const duplicate = duplicateProductIdentifier(products, product);
  if (duplicate) {
    res.status(409).json({
      success: false,
      message: `Product number or SKU already exists on "${duplicate.name}".`,
    });
    return;
  }
  products.unshift(product);
  store.saveProducts();
  res.status(201).json({ success: true, product, total: products.length });
});

function importProducts(incoming, source = "bulk") {
  if (incoming.length === 0) {
    return { ok: false, status: 400, payload: { success: false, message: "Provide a products array" } };
  }
  if (incoming.length > 1000) {
    return { ok: false, status: 413, payload: { success: false, message: "Bulk import limit is 1000 products per request" } };
  }
  const products = store.getProducts();
  const created = [];
  const skipped = [];
  const missingImages = [];
  const existingSkus = new Set(products.map((product) => String(product.sku || "").toLowerCase()).filter(Boolean));
  const existingProductNumbers = new Set(
    products.map((product) => String(product.productNumber || product.sku || "").toLowerCase()).filter(Boolean)
  );
  incoming.forEach((item, index) => {
    const product = normalizeProduct(item, products.concat(created));
    if (!product) {
      skipped.push({ index, reason: "Missing name" });
      return;
    }
    const skuKey = String(product.sku || "").toLowerCase();
    const productNumberKey = String(product.productNumber || "").toLowerCase();
    if ((skuKey && existingSkus.has(skuKey)) || (productNumberKey && existingProductNumbers.has(productNumberKey))) {
      skipped.push({
        index,
        sku: product.sku,
        productNumber: product.productNumber,
        name: product.name,
        reason: "Duplicate product number or SKU",
      });
      return;
    }
    existingSkus.add(skuKey);
    existingProductNumbers.add(productNumberKey);
    if (product.missingImageCodes?.length) {
      missingImages.push({ index, sku: product.sku, name: product.name, missingImageCodes: product.missingImageCodes });
    }
    created.push(product);
  });
  products.unshift(...created);
  store.saveProducts();
  const log = {
    id: `import_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    source,
    createdCount: created.length,
    skippedCount: skipped.length,
    missingImageCount: missingImages.reduce((sum, item) => sum + item.missingImageCodes.length, 0),
    skipped,
    missingImages,
    createdAt: new Date().toISOString(),
  };
  store.getImportLogs().unshift(log);
  store.saveImportLogs();
  return {
    ok: true,
    status: 201,
    payload: {
    success: true,
    created,
    skipped,
      missingImages,
      importLog: log,
    createdCount: created.length,
    skippedCount: skipped.length,
    total: products.length,
    },
  };
}

function rowsToObjects(rows) {
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow || []).map((value) => String(value || "").trim());
  return dataRows
    .filter((row) => row.some((value) => String(value ?? "").trim() !== ""))
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) item[header] = row[index] ?? "";
      });
      return item;
    });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rowsToObjects(rows);
}

async function parseProductImportFile(file) {
  const name = String(file.originalname || "").toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(file.buffer.toString("utf8"));
  if (!name.endsWith(".xlsx")) {
    throw new Error("Only .xlsx and .csv product imports are supported.");
  }
  const rows = await readXlsxFile(file.buffer);
  return rowsToObjects(rows);
}

app.post("/api/admin/products/bulk", (req, res) => {
  const incoming = Array.isArray(req.body?.products) ? req.body.products : [];
  const result = importProducts(incoming, "bulk-json-csv");
  res.status(result.status).json(result.payload);
});

app.post("/api/admin/products/import", importUpload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "Upload an Excel or CSV file" });
    return;
  }
  try {
    const products = await parseProductImportFile(req.file);
    const result = importProducts(products, req.file.originalname || "excel");
    res.status(result.status).json(result.payload);
  } catch (err) {
    res.status(400).json({ success: false, message: `Could not read import file: ${err.message}` });
  }
});

app.put("/api/admin/products/:id", (req, res) => {
  const products = store.getProducts();
  const index = products.findIndex(
    (product) => product._id === req.params.id || product.id === req.params.id
  );
  if (index === -1) {
    res.status(404).json({ success: false, message: "Product not found" });
    return;
  }
  const { _id, id, createdAt, ...patch } = req.body || {};
  const merged = { ...products[index], ...patch };
  const normalized = normalizeProduct(merged, products, products[index]._id);
  if (!normalized) {
    res.status(400).json({ success: false, message: "Product name is required" });
    return;
  }
  const duplicate = duplicateProductIdentifier(products, normalized, products[index]._id);
  if (duplicate) {
    res.status(409).json({
      success: false,
      message: `Product number or SKU already exists on "${duplicate.name}".`,
    });
    return;
  }
  products[index] = normalized;
  products[index].createdAt = createdAt || products[index].createdAt;
  store.saveProducts();
  res.json({ success: true, product: products[index] });
});

app.delete("/api/admin/products/:id", (req, res) => {
  const products = store.getProducts();
  const index = products.findIndex(
    (product) => product._id === req.params.id || product.id === req.params.id
  );
  if (index !== -1) {
    products.splice(index, 1);
    store.saveProducts();
  }
  res.json({ success: true, id: req.params.id });
});

app.post("/api/admin/products/upload", upload.array("images", 12), (req, res) => {
  const images = (req.files || []).map((file) => `/uploads/${file.filename}`);
  res.json({ success: true, images, files: images.map((url) => ({ url })) });
});

app.post("/api/admin/content/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "Upload a valid image file." });
    return;
  }
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

app.get("/api/admin/orders", (req, res) => {
  const orders = store.getOrders();
  res.json({ success: true, items: orders, orders, total: orders.length });
});

app.get("/api/admin/orders/:id", (req, res) => {
  const order = store.getOrders().find((item) => item._id === req.params.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  res.json({ success: true, order });
});

app.get("/api/admin/orders/:id/invoice", (req, res) => {
  const order = store.getOrders().find((item) => item._id === req.params.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  const user = store.getUsers().find((item) => item.id === order.user) || {};
  writeInvoicePdf(res, order, publicUser(user));
});

app.put("/api/admin/orders/:id/status", (req, res) => {
  const order = store.getOrders().find((item) => item._id === req.params.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  const previousStatus = order.status;
  order.status = req.body.status || order.status;
  if (order.status === "cancelled" && previousStatus !== "cancelled") {
    restoreStock(order);
  }
  order.updatedAt = new Date().toISOString();
  store.saveOrders();
  res.json({ success: true, order });
});

app.put("/api/admin/orders/:id/tracking", (req, res) => {
  const order = store.getOrders().find((item) => item._id === req.params.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  order.delivery = {
    ...(order.delivery || {}),
    trackingNumber: req.body.trackingNumber || order.delivery?.trackingNumber || "",
    provider: req.body.provider || order.delivery?.provider || "",
    status: req.body.status || order.delivery?.status || order.status,
    updatedAt: new Date().toISOString(),
  };
  order.trackingNumber = order.delivery.trackingNumber;
  order.waybill = req.body.waybill || order.waybill || order.trackingNumber;
  order.shipmentId = req.body.shipmentId || order.shipmentId || "";
  order.courierPartner = req.body.provider || order.courierPartner || "Delhivery";
  order.shipmentStatus = delhivery.normalizeStatus(req.body.status || order.shipmentStatus || order.status);
  order.shipmentLastSyncTime = new Date().toISOString();
  order.timeline = [...(order.timeline || []), { status: order.delivery.status, note: "Tracking updated", createdAt: new Date().toISOString() }];
  store.saveOrders();
  res.json({ success: true, order });
});

app.post("/api/admin/orders/:id/shipment/create", async (req, res) => {
  const order = store.getOrders().find((item) => item._id === req.params.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  if (order.waybill || order.trackingNumber) {
    res.status(409).json({ success: false, message: "A shipment already exists for this order.", order });
    return;
  }
  const result = await createDelhiveryShipment(order);
  res.status(result.success ? 200 : 502).json({ ...result, order });
});

app.post("/api/admin/orders/:id/shipment/refresh", async (req, res) => {
  const order = store.getOrders().find((item) => item._id === req.params.id);
  if (!order) {
    res.status(404).json({ success: false, message: "Order not found" });
    return;
  }
  try {
    const shipment = await refreshDelhiveryShipment(order);
    res.json({ success: true, order, shipment });
  } catch (err) {
    order.shipmentError = err.message;
    order.shipmentLastSyncTime = new Date().toISOString();
    store.saveOrders();
    res.status(502).json({ success: false, message: err.message, order });
  }
});

app.get("/api/admin/refunds", (req, res) => {
  const refunds = store.getTransactions().filter((item) => item.id?.startsWith("rfnd_") || item.refundStatus);
  res.json({ success: true, refunds, items: refunds, total: refunds.length });
});

app.post("/api/admin/refunds", async (req, res) => {
  try {
    const refund = await createRefundRecord(req.body, req.user);
    res.status(201).json({ success: true, refund });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message || "Refund failed" });
  }
});

app.put("/api/admin/refunds/:id", (req, res) => {
  const refund = store.getTransactions().find((item) => item.id === req.params.id);
  if (!refund) {
    res.status(404).json({ success: false, message: "Refund not found" });
    return;
  }
  refund.refundStatus = req.body.status || refund.refundStatus || refund.status;
  refund.status = refund.refundStatus;
  refund.notes = req.body.notes ?? refund.notes;
  refund.updatedAt = new Date().toISOString();
  store.saveTransactions();
  res.json({ success: true, refund });
});

// ---------------------------------------------------------------------------
// Static SPA + fallbacks
// ---------------------------------------------------------------------------
const clientDistPath = path.join(__dirname, "public");

app.use(
  express.static(clientDistPath, {
    setHeaders(res, filePath) {
      // Content-hashed assets are immutable → cache aggressively.
      // index.html must never be cached so new deploys are picked up.
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API route not found" });
});

app.use((req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

// Error handler (must be last, 4 args).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${NODE_ENV}, persistent=${store.isPersistent()})`);
});

const shipmentSyncTimer = setInterval(async () => {
  if (!delhivery.configured()) return;
  const active = store.getOrders().filter(
    (order) =>
      (order.waybill || order.trackingNumber) &&
      !["delivered", "cancelled", "rto"].includes(order.shipmentStatus)
  );
  for (const order of active.slice(0, 50)) {
    try {
      await refreshDelhiveryShipment(order);
    } catch (err) {
      order.shipmentError = err.message;
      order.shipmentLastSyncTime = new Date().toISOString();
      store.saveOrders();
      console.error(`[delhivery] Scheduled tracking sync failed for ${order.orderNumber}: ${err.message}`);
    }
  }
}, Math.max(5, Number(process.env.DELHIVERY_SYNC_INTERVAL_MINUTES || 30)) * 60 * 1000);
shipmentSyncTimer.unref();

module.exports = app;
