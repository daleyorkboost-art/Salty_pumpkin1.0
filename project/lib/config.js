"use strict";

const crypto = require("crypto");
const store = require("./store");

const secretFields = new Set([
  "payments.razorpayKeySecret",
  "payments.razorpayWebhookSecret",
  "payments.webhookSecret",
  "email.smtpPass",
  "otp.otpApiKey",
  "storage.cloudinaryApiSecret",
  "analytics.metaConversionsToken",
  "tracking.metaConversionsToken",
  "delivery.deliveryApiKey",
  "delivery.apiKey",
]);

const defaults = {
  payments: {
    razorpayKeyId: "",
    razorpayKeySecret: "",
    razorpayWebhookSecret: "",
    webhookSecret: "",
    enabled: false,
    codEnabled: true,
  },
  content: {
    heroTitle: "Stylish kids clothing for every tiny adventure.",
    heroSubtitle: "Discover comfortable, fashion-forward outfits for babies, boys, and girls.",
    heroCtaText: "Shop now",
    heroCtaLink: "/shop",
    announcement: "New arrivals are live now.",
    footerTagline: "Premium, comfortable clothing for curious children.",
    aboutTitle: "About Salty Pumpkin",
    aboutContent: `At Salty Pumpkin, we believe childhood should be filled with comfort, confidence, creativity, and style. We are a modern kidswear brand dedicated to bringing high-quality, fashionable, and affordable clothing for children who love to explore, play, and express themselves.

Our collections are thoughtfully designed to combine comfort, durability, and trend-forward fashion, ensuring that every outfit looks great while allowing kids to move freely throughout their day. From everyday essentials to special occasion outfits, we create clothing that parents trust and children love to wear.

We understand that growing children need clothing that keeps up with their active lifestyles. That's why we focus on premium fabrics, comfortable fits, vibrant designs, and exceptional craftsmanship in every piece we offer.

Our Mission
To provide stylish, comfortable, and high-quality kidswear that empowers children to feel confident while making shopping easy and enjoyable for parents.

What Makes Us Different
- Premium Quality Fabrics
- Comfortable & Kid-Friendly Designs
- Trendy Styles for Every Season
- Affordable Fashion Without Compromise
- Safe & Secure Shopping Experience
- Fast Delivery & Reliable Customer Support

Our Promise
Every product at Salty Pumpkin is carefully selected with attention to quality, comfort, and style. We are committed to creating a delightful shopping experience and helping families find clothing that celebrates the joy of childhood.

Whether it's a casual day out, a family gathering, a birthday celebration, or everyday adventures, Salty Pumpkin is here to dress your little ones in styles they'll love and comfort they'll enjoy all day long.

Growing With Every Child
Fashion is more than clothing - it's a way for children to express their personality, imagination, and confidence. At Salty Pumpkin, we are proud to be a part of their journey, bringing collections that inspire smiles, create memories, and make every day a little more colorful.

Salty Pumpkin - Where Comfort Meets Style for Every Little Adventure.`,
    aboutImage: "/uploads/103_Pink-103.jpg",
    contactTitle: "We are here to help.",
    contactPhone: "",
    contactEmail: "help@saltypumpkin.in",
    contactAddress: "Salty Pumpkin Atelier, Sector 62, Noida, Uttar Pradesh, 201309",
    contactWhatsapp: "",
    contactNotifyPhone: "",
    contactMapLink: "",
    contactBusinessHours: "Monday to Saturday, 10:00 AM - 7:00 PM IST",
    contactInstagram: "",
    contactFacebook: "",
    banners: [
      {
        id: "banner-home-1",
        title: "New season collection",
        subtitle: "Fresh styles for little wardrobes.",
        image: "/uploads/103_Pink-103.jpg",
        ctaText: "Shop now",
        ctaLink: "/shop",
        enabled: true,
      },
    ],
  },
  coupons: {
    items: [{ id: "coupon-welcome", code: "WELCOME10", type: "percent", value: 10, minOrder: 999, active: true }],
  },
  seo: {
    title: "Salty Pumpkin - Premium Kidswear India",
    description: "Shop premium kids clothing, outfits, dresses, shirts, jackets, and co-ords from Salty Pumpkin.",
    keywords: "kidswear, boys clothing, girls clothing, kids fashion India, Salty Pumpkin",
    canonicalUrl: "https://www.saltypumpkin.in/",
  },
  email: {
    smtpHost: "",
    smtpPort: "",
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
  },
  otp: {
    otpProvider: "demo",
    otpApiKey: "",
    otpSenderId: "",
  },
  storage: {
    imageProvider: "local",
    cloudinaryCloudName: "",
    cloudinaryApiKey: "",
    cloudinaryApiSecret: "",
  },
  shipping: {
    freeShippingThreshold: 0,
    flatShippingFee: 0,
    gstPercent: 0,
    codExtraFee: 0,
  },
  analytics: {
    ga4MeasurementId: "G-1KYL0HZGWC",
    gtmId: "GTM-NH8QVC28",
    metaPixelId: "1142652131080335",
    metaConversionsToken: "",
  },
  tracking: {
    gtmId: "GTM-NH8QVC28",
    metaPixelId: "1142652131080335",
    ga4Id: "G-1KYL0HZGWC",
    metaConversionsToken: "",
    enabled: true,
    metaConversionsApi: false,
    preserveWordPressEvents: true,
    virtualPageviews: true,
  },
  store: {
    storeName: "Salty Pumpkin",
    supportEmail: "",
    supportPhone: "",
    address: "",
    logoUrl: "/salty-pumpkin-logo.svg",
    currency: "INR",
    gstNumber: "",
  },
  filters: {
    shopBy: "All, Boys, Girls",
    categories: "",
    priceRanges: "All, Rs. 0 - 999, Rs. 1000 - 1999, Rs. 2000+",
    ageGroups: "",
  },
  domain: {
    allowedOrigins: "",
  },
  delivery: {
    deliveryProvider: "manual",
    deliveryApiKey: "",
    deliveryApiBaseUrl: "",
    enabled: false,
    providerName: "Manual fulfilment",
    apiKey: "",
    trackingUrlTemplate: "",
  },
  sizeCharts: {
    items: [
      {
        id: "size-standard",
        name: "Kids standard size chart",
        sizes: "2-3Y: Chest 22in, Length 16in\n4-5Y: Chest 24in, Length 18in",
      },
    ],
  },
  categories: {
    items: [
      {
        id: "cat-boys",
        title: "Boys' Clothing",
        param: "Boys' Clothing",
        image: "/uploads/1_1.jpg",
        active: true,
      },
      {
        id: "cat-girls",
        title: "Girls' Clothing",
        param: "Girls' Clothing",
        image: "/uploads/103_Pink-103.jpg",
        active: true,
      },
    ],
  },
  publish: {
    lastDraftAt: "",
    lastPreviewAt: "",
    lastPublishedAt: "",
    status: "draft",
  },
  tests: {},
};

const envMap = {
  "payments.razorpayKeyId": "RAZORPAY_KEY_ID",
  "payments.razorpayKeySecret": "RAZORPAY_KEY_SECRET",
  "payments.razorpayWebhookSecret": "RAZORPAY_WEBHOOK_SECRET",
  "payments.webhookSecret": "RAZORPAY_WEBHOOK_SECRET",
  "analytics.metaPixelId": "META_PIXEL_ID",
  "analytics.metaConversionsToken": "META_CONVERSIONS_ACCESS_TOKEN",
  "analytics.ga4MeasurementId": "GA4_MEASUREMENT_ID",
  "analytics.gtmId": "GTM_ID",
  "tracking.metaPixelId": "META_PIXEL_ID",
  "tracking.ga4Id": "GA4_MEASUREMENT_ID",
  "tracking.gtmId": "GTM_ID",
  "tracking.metaConversionsToken": "META_CONVERSIONS_ACCESS_TOKEN",
  "delivery.deliveryApiBaseUrl": "DELIVERY_API_BASE_URL",
  "delivery.deliveryApiKey": "DELIVERY_API_KEY",
  "delivery.apiKey": "DELIVERY_API_KEY",
  "domain.allowedOrigins": "CORS_ORIGIN",
  "otp.otpApiKey": "TWOFACTOR_API_KEY",
};

let cache = null;
let cacheUntil = 0;
const ttlMs = 30 * 1000;

function encryptionKey() {
  const raw = process.env.SECRET_ENCRYPTION_KEY || "";
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through to utf8 check
  }
  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 32) return utf8;
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptSecret(value) {
  if (!value) return "";
  const key = encryptionKey();
  if (!key) throw new Error("SECRET_ENCRYPTION_KEY is required to save secrets");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(value) {
  if (!value || typeof value !== "string") return "";
  if (!value.startsWith("enc:v1:")) return value;
  const key = encryptionKey();
  if (!key) return "";
  const [, , ivRaw, tagRaw, encryptedRaw] = value.split(":");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function getStoredValue(path) {
  const [group, key] = path.split(".");
  const value = store.getSettings()?.[group]?.[key];
  if (secretFields.has(path)) return decryptSecret(value);
  return value;
}

function get(path) {
  const stored = getStoredValue(path);
  if (stored !== undefined && stored !== null && stored !== "") return stored;
  const envName = envMap[path];
  if (envName && process.env[envName] !== undefined) return process.env[envName];
  const [group, key] = path.split(".");
  return defaults[group]?.[key];
}

function getConfig(group) {
  const now = Date.now();
  if (cache && cacheUntil > now) return group ? cache[group] || {} : cache;
  const next = {};
  Object.keys(defaults).forEach((groupName) => {
    next[groupName] = {};
    Object.keys(defaults[groupName]).forEach((key) => {
      next[groupName][key] = get(`${groupName}.${key}`);
    });
  });
  cache = next;
  cacheUntil = now + ttlMs;
  return group ? cache[group] || {} : cache;
}

function invalidate() {
  cache = null;
  cacheUntil = 0;
}

function maskSecret(value) {
  const plain = decryptSecret(value);
  if (!plain) return "";
  return `****${plain.slice(-4)}`;
}

function publicSettings() {
  const settings = store.getSettings();
  const result = {};
  Object.keys(defaults).forEach((group) => {
    result[group] = {};
    Object.keys(defaults[group]).forEach((key) => {
      const path = `${group}.${key}`;
      const stored = settings?.[group]?.[key];
      if (secretFields.has(path)) {
        result[group][key] = stored ? maskSecret(stored) : "";
      } else {
        result[group][key] = stored ?? defaults[group][key];
      }
    });
  });
  return result;
}

function saveSettingsPatch(patch, user) {
  const current = store.getSettings();
  const next = { ...current };
  const changedGroups = [];

  Object.entries(patch || {}).forEach(([group, values]) => {
    if (!defaults[group] || !values || typeof values !== "object") return;
    next[group] = { ...(next[group] || {}) };
    Object.entries(values).forEach(([key, value]) => {
      if (!(key in defaults[group])) return;
      const path = `${group}.${key}`;
      if (secretFields.has(path)) {
        if (!value || String(value).startsWith("****")) return;
        next[group][key] = encryptSecret(value);
      } else {
        next[group][key] = value;
      }
    });
    changedGroups.push(group);
  });

  store.replaceSettings(next);
  const audit = store.getSettingsAudit();
  audit.unshift({
    id: crypto.randomUUID(),
    user: user?.email || user?.phone || user?.id || "unknown",
    groups: [...new Set(changedGroups)],
    createdAt: new Date().toISOString(),
  });
  store.saveSettingsAudit();
  invalidate();
  return publicSettings();
}

function groupConfigured(group) {
  const cfg = getConfig(group);
  switch (group) {
    case "payments":
      return Boolean(cfg.codEnabled || (cfg.razorpayKeyId && cfg.razorpayKeySecret));
    case "email":
      return Boolean(cfg.smtpHost && cfg.smtpPort && cfg.smtpUser && cfg.smtpPass && cfg.smtpFrom);
    case "otp":
      return Boolean(process.env.TWOFACTOR_API_KEY);
    case "storage":
      return cfg.imageProvider === "local" || Boolean(cfg.cloudinaryCloudName && cfg.cloudinaryApiKey && cfg.cloudinaryApiSecret);
    case "delivery":
      return cfg.deliveryProvider === "manual" || Boolean(cfg.deliveryApiBaseUrl && cfg.deliveryApiKey);
    case "store":
      return Boolean(cfg.storeName && cfg.supportEmail);
    default:
      return true;
  }
}

module.exports = {
  defaults,
  secretFields,
  get,
  getConfig,
  invalidate,
  publicSettings,
  saveSettingsPatch,
  groupConfigured,
  decryptSecret,
};
