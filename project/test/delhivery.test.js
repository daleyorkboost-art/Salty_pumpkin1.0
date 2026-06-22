"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const delhivery = require("../lib/delhivery");

test("normalizes Delhivery statuses used by customer and admin views", () => {
  assert.equal(delhivery.normalizeStatus("In Transit"), "in_transit");
  assert.equal(delhivery.normalizeStatus("Out for Delivery"), "out_for_delivery");
  assert.equal(delhivery.normalizeStatus("RTO In Transit"), "rto");
  assert.equal(delhivery.normalizeStatus("Delivered"), "delivered");
});

test("parses serviceability and COD support", () => {
  const result = delhivery.parseServiceability(
    { delivery_codes: [{ postal_code: { pin: 201301, repl: "Y", cod: "Y", pre_paid: "Y", district: "Gautam Buddha Nagar" } }] },
    "201301"
  );
  assert.equal(result.serviceable, true);
  assert.equal(result.codAvailable, true);
  assert.equal(result.district, "Gautam Buddha Nagar");
});

test("builds shipment payload without exposing the API token", () => {
  const payload = delhivery.shipmentPayload(
    {
      _id: "order-1",
      orderNumber: "SP-100",
      total: 1499,
      paymentMethod: "cod",
      shippingAddress: { name: "Customer", phone: "9876543210", line1: "Street", city: "Noida", state: "UP", pincode: "201301" },
      items: [{ name: "Dress", qty: 1 }],
    },
    { pickupLocation: "Salty Pumpkin", defaultWeightGrams: 500, shippingMode: "Surface" }
  );
  assert.equal(payload.shipments[0].payment_mode, "COD");
  assert.equal(payload.shipments[0].cod_amount, "1499");
  assert.equal(payload.pickup_location.name, "Salty Pumpkin");
  assert.equal(JSON.stringify(payload).includes("token"), false);
});

test("parses tracking timeline", () => {
  const result = delhivery.parseTracking({
    ShipmentData: [{
      Shipment: {
        Status: { Status: "In Transit" },
        ExpectedDeliveryDate: "2026-06-18",
        Scans: [{ ScanDetail: { Scan: "Picked Up", ScannedLocation: "Delhi", ScanDateTime: "2026-06-15T10:00:00" } }],
      },
    }],
  });
  assert.equal(result.shipmentStatus, "in_transit");
  assert.equal(result.timeline[0].status, "picked_up");
  assert.equal(result.estimatedDeliveryDate, "2026-06-18");
});
