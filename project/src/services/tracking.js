import { api, catalogApi } from "./api";

let settingsPromise = null;
let installedGtm = "";

function eventId(name) {
  return `${name}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function dataLayer() {
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function installGtm(gtmId) {
  if (!gtmId || installedGtm === gtmId || isLocalHost()) return;
  installedGtm = gtmId;
  dataLayer().push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(script);
  const noscript = document.createElement("noscript");
  const frame = document.createElement("iframe");
  frame.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmId)}`;
  frame.height = "0";
  frame.width = "0";
  frame.style.display = "none";
  frame.style.visibility = "hidden";
  noscript.appendChild(frame);
  document.body.prepend(noscript);
}

export async function trackingSettings() {
  if (!settingsPromise) {
    settingsPromise = catalogApi.settings().then((result) => result.settings?.tracking || {});
  }
  return settingsPromise;
}

export async function initTracking() {
  const settings = await trackingSettings();
  if (settings.enabled === false) return settings;
  installGtm(settings.gtmId);
  dataLayer().push({
    event: "tracking_ready",
    ga4_id: settings.ga4Id,
    meta_pixel_id: settings.metaPixelId,
    preserve_wordpress_events: settings.preserveWordPressEvents !== false,
  });
  return settings;
}

export async function trackEvent(name, payload = {}) {
  const settings = await trackingSettings();
  if (settings.enabled === false || isLocalHost()) return null;
  const id = payload.event_id || eventId(name);
  dataLayer().push({
    event: name,
    event_id: id,
    page_location: window.location.href,
    page_path: window.location.pathname + window.location.search,
    ...payload,
  });
  if (settings.metaConversionsApi) {
    try {
      await api("/tracking/meta-conversions", {
        method: "POST",
        body: {
          event_name: name,
          event_id: id,
          event_source_url: window.location.href,
          user_data: payload.user_data || {},
          custom_data: payload.custom_data || payload.ecommerce || {},
        },
      });
    } catch {
      // Tracking must never block checkout or navigation.
    }
  }
  return id;
}

export function productPayload(product, quantity = 1) {
  return {
    ecommerce: {
      currency: "INR",
      value: Number(product?.price || 0) * quantity,
      items: [
        {
          item_id: product?.sku || product?._id,
          item_name: product?.name,
          item_category: product?.parentCategory || product?.category,
          item_category2: product?.childCategory || product?.category,
          price: Number(product?.price || 0),
          quantity,
        },
      ],
    },
  };
}
