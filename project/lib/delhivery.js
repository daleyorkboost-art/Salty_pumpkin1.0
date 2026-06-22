"use strict";

const DEFAULT_BASE_URL = "https://track.delhivery.com";

function configured(env = process.env) {
  return Boolean(env.DELHIVERY_API_TOKEN);
}

function config(env = process.env) {
  return {
    token: env.DELHIVERY_API_TOKEN || "",
    baseUrl: String(env.DELHIVERY_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    pickupLocation: env.DELHIVERY_PICKUP_LOCATION || "",
    originPincode: String(env.DELHIVERY_ORIGIN_PINCODE || "").replace(/\D/g, "").slice(0, 6),
    defaultWeightGrams: Math.max(1, Number(env.DELHIVERY_DEFAULT_WEIGHT_GRAMS || 500)),
    shippingMode: env.DELHIVERY_SHIPPING_MODE || "Surface",
  };
}

async function request(path, options = {}, dependencies = {}) {
  const settings = config(dependencies.env);
  if (!settings.token) throw new Error("Delhivery API token is not configured.");
  const fetchImpl = dependencies.fetch || global.fetch;
  const response = await fetchImpl(`${settings.baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Token ${settings.token}`,
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body.detail || body.error || body.message || text || `Delhivery request failed (${response.status}).`;
    throw new Error(String(message).slice(0, 300));
  }
  return body;
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return "pending";
  if (status.includes("rto") || status.includes("return")) return "rto";
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("deliver") && !status.includes("out for")) return "delivered";
  if (status.includes("out for delivery") || status === "ofd") return "out_for_delivery";
  if (status.includes("transit") || status.includes("dispatched") || status.includes("manifest")) return "in_transit";
  if (status.includes("picked") || status.includes("pickup")) return "picked_up";
  if (status.includes("pending") || status.includes("not picked")) return "pending";
  return status.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "pending";
}

function parseServiceability(body, pincode) {
  const postalCode = body?.delivery_codes?.[0]?.postal_code || {};
  const cod = postalCode.cod;
  const prepaid = postalCode.pre_paid;
  const serviceable = Boolean(
    body?.delivery_codes?.length &&
      !["N", "NO", "0", "FALSE"].includes(String(postalCode.repl || prepaid || postalCode.pickup || "").toUpperCase())
  );
  return {
    pincode,
    serviceable,
    codAvailable: serviceable && !["N", "NO", "0", "FALSE"].includes(String(cod || "").toUpperCase()),
    prepaidAvailable: serviceable && !["N", "NO", "0", "FALSE"].includes(String(prepaid || "").toUpperCase()),
    estimatedDeliveryDays: Number(postalCode.estimated_delivery_days || postalCode.tat || 0) || null,
    district: postalCode.district || "",
    state: postalCode.state_code || postalCode.state || "",
    city: postalCode.city || "",
    raw: postalCode,
  };
}

async function checkServiceability(pincode, dependencies = {}) {
  const pin = String(pincode || "").replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(pin)) throw new Error("Enter a valid 6-digit PIN code.");
  const body = await request(`/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pin)}`, {}, dependencies);
  return parseServiceability(body, pin);
}

async function calculateShipping({ destinationPincode, paymentMode, weightGrams }, dependencies = {}) {
  const settings = config(dependencies.env);
  if (!/^\d{6}$/.test(settings.originPincode)) return null;
  const destination = String(destinationPincode || "").replace(/\D/g, "").slice(0, 6);
  const params = new URLSearchParams({
    md: settings.shippingMode === "Express" ? "E" : "S",
    ss: "Delivered",
    d_pin: destination,
    o_pin: settings.originPincode,
    cgm: String(Math.max(1, Number(weightGrams || settings.defaultWeightGrams))),
    pt: paymentMode === "COD" ? "COD" : "Pre-paid",
  });
  const body = await request(`/api/kinko/v1/invoice/charges/?${params}`, {}, dependencies);
  const row = Array.isArray(body) ? body[0] : body;
  const amount = Number(row?.total_amount ?? row?.total ?? row?.charge ?? row?.gross_amount);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : null;
}

function shipmentPayload(order, settings = config()) {
  const address = order.shippingAddress || {};
  const quantity = (order.items || []).reduce((sum, item) => sum + Number(item.qty || 1), 0);
  const products = (order.items || []).map((item) => `${item.name} x ${item.qty || 1}`).join(", ").slice(0, 500);
  return {
    shipments: [
      {
        name: address.name,
        add: [address.line1, address.district].filter(Boolean).join(", "),
        pin: address.pincode,
        city: address.city,
        state: address.state,
        country: address.country || "India",
        phone: address.phone,
        order: order.orderNumber || order._id,
        payment_mode: order.paymentMethod === "cod" ? "COD" : "Prepaid",
        cod_amount: order.paymentMethod === "cod" ? String(order.total || order.amount || 0) : "0",
        total_amount: String(order.total || order.amount || 0),
        products_desc: products,
        quantity: String(quantity || 1),
        weight: String(order.shipmentWeightGrams || settings.defaultWeightGrams),
        shipping_mode: settings.shippingMode,
        address_type: "home",
      },
    ],
    pickup_location: { name: settings.pickupLocation },
  };
}

async function createShipment(order, dependencies = {}) {
  const settings = config(dependencies.env);
  if (!settings.pickupLocation) throw new Error("DELHIVERY_PICKUP_LOCATION is not configured.");
  const form = new URLSearchParams({ format: "json", data: JSON.stringify(shipmentPayload(order, settings)) });
  const body = await request(
    "/api/cmu/create.json",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    dependencies
  );
  const shipment = body?.packages?.[0] || {};
  const waybill = shipment.waybill || body?.upload_wbn || body?.waybill || "";
  if (body?.success === false || !waybill) {
    throw new Error(shipment.remarks?.[0] || shipment.remarks || body?.rmk || "Delhivery did not return a waybill.");
  }
  return {
    shipmentId: shipment.refnum || shipment.order || order.orderNumber || order._id,
    waybill: String(waybill),
    trackingNumber: String(waybill),
    courierPartner: "Delhivery",
    shipmentStatus: normalizeStatus(shipment.status || "pending"),
    rawStatus: shipment.status || "Pending",
  };
}

function parseTracking(body) {
  const scan = body?.ShipmentData?.[0]?.Shipment;
  if (!scan) throw new Error("No Delhivery tracking record was found.");
  const status = scan.Status || {};
  const scans = Array.isArray(scan.Scans) ? scan.Scans : [];
  return {
    shipmentStatus: normalizeStatus(status.Status || status.StatusType),
    rawStatus: status.Status || status.StatusType || "Pending",
    estimatedDeliveryDate: scan.ExpectedDeliveryDate || scan.PromisedDeliveryDate || "",
    timeline: scans.map((item) => ({
      status: normalizeStatus(item.ScanDetail?.Scan || item.ScanDetail?.Instructions),
      label: item.ScanDetail?.Scan || item.ScanDetail?.Instructions || "Shipment update",
      location: item.ScanDetail?.ScannedLocation || "",
      createdAt: item.ScanDetail?.ScanDateTime || "",
    })),
  };
}

async function trackShipment(waybill, dependencies = {}) {
  const trackingNumber = String(waybill || "").trim();
  if (!trackingNumber) throw new Error("A Delhivery waybill is required.");
  const body = await request(`/api/v1/packages/json/?waybill=${encodeURIComponent(trackingNumber)}`, {}, dependencies);
  return parseTracking(body);
}

module.exports = {
  calculateShipping,
  checkServiceability,
  config,
  configured,
  createShipment,
  normalizeStatus,
  parseServiceability,
  parseTracking,
  shipmentPayload,
  trackShipment,
};
