import { useEffect, useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";
import { PasswordField } from "../components/PasswordField";

const tabs = [
  ["content", "Content"],
  ["coupons", "Coupons"],
  ["seo", "SEO"],
  ["delivery", "Delivery"],
  ["orders", "Orders"],
  ["sizeCharts", "Size"],
  ["categories", "Categories"],
  ["payments", "Razorpay"],
  ["tracking", "Tracking"],
  ["publish", "Publish"],
  ["advanced", "Advanced"],
];

const advancedGroups = [
  {
    key: "email",
    title: "Email SMTP",
    test: "email",
    fields: [["smtpHost", "SMTP Host"], ["smtpPort", "SMTP Port", "number"], ["smtpUser", "SMTP User"], ["smtpPass", "SMTP Password", "password"], ["smtpFrom", "From Email"]],
  },
  {
    key: "otp",
    title: "SMS / OTP",
    test: "otp",
    fields: [["otpProvider", "Provider"], ["otpSenderId", "Sender ID"]],
  },
  {
    key: "storage",
    title: "Storage / Images",
    test: "storage",
    fields: [["imageProvider", "Provider"], ["cloudinaryCloudName", "Cloudinary Cloud Name"], ["cloudinaryApiKey", "Cloudinary API Key"], ["cloudinaryApiSecret", "Cloudinary API Secret", "password"]],
  },
  {
    key: "shipping",
    title: "Shipping & Tax",
    fields: [["freeShippingThreshold", "Free Shipping Threshold", "number"], ["flatShippingFee", "Flat Shipping Fee", "number"], ["gstPercent", "GST Percent", "number"], ["codExtraFee", "COD Extra Fee", "number"]],
  },
  {
    key: "store",
    title: "Store Info",
    fields: [["storeName", "Store Name"], ["supportEmail", "Support Email"], ["supportPhone", "Support Phone"], ["address", "Address", "textarea"], ["logoUrl", "Logo URL"], ["currency", "Currency"]],
  },
  {
    key: "domain",
    title: "Domain / CORS",
    fields: [["allowedOrigins", "Allowed Origins"]],
  },
];

const emptyBanner = () => ({
  id: crypto.randomUUID(),
  title: "New season collection",
  subtitle: "Fresh styles for little wardrobes.",
  image: "/uploads/103_Pink-103.jpg",
  ctaText: "Shop now",
  ctaLink: "/shop",
  enabled: true,
});

const emptyCoupon = () => ({
  id: crypto.randomUUID(),
  code: "WELCOME10",
  type: "percent",
  value: 10,
  minOrder: 999,
  active: true,
});

const emptySizeChart = () => ({
  id: crypto.randomUUID(),
  name: "Kids standard size chart",
  sizes: "2-3Y: Chest 22in, Length 16in\n4-5Y: Chest 24in, Length 18in",
});

const emptyCategory = () => ({
  id: crypto.randomUUID(),
  title: "Girls' Clothing",
  param: "Girls' Clothing",
  image: "/uploads/1_1.jpg",
  active: true,
});

export function AdminSettings() {
  const { loading, data, error, reload } = useAsync(() => adminApi.settings(), []);
  const [active, setActive] = useState("content");
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (data?.settings) setDraft(data.settings);
  }, [data]);

  async function save(group, override) {
    setBusy(group);
    setMessage("");
    try {
      await adminApi.saveSettings({ [group]: override || draft[group] });
      await reload();
      setMessage(`${label(group)} saved. Changes are ready for the website.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  }

  async function test(integration) {
    setBusy(integration);
    setMessage("");
    try {
      const result = await adminApi.testIntegration(integration);
      await reload();
      setMessage(result.message);
    } catch (err) {
      await reload();
      setMessage(err.message);
    } finally {
      setBusy("");
    }
  }

  function update(group, key, value) {
    setDraft((current) => ({
      ...current,
      [group]: {
        ...(current[group] || {}),
        [key]: value,
      },
    }));
  }

  function updateList(group, index, key, value) {
    setDraft((current) => {
      const items = [...(current[group]?.items || current[group]?.banners || [])];
      items[index] = { ...items[index], [key]: value };
      const listKey = group === "content" ? "banners" : "items";
      return { ...current, [group]: { ...(current[group] || {}), [listKey]: items } };
    });
  }

  function addItem(group) {
    const factory = group === "content" ? emptyBanner : group === "coupons" ? emptyCoupon : group === "sizeCharts" ? emptySizeChart : emptyCategory;
    setDraft((current) => {
      const listKey = group === "content" ? "banners" : "items";
      return {
        ...current,
        [group]: {
          ...(current[group] || {}),
          [listKey]: [...(current[group]?.[listKey] || []), factory()],
        },
      };
    });
  }

  function removeItem(group, index) {
    setDraft((current) => {
      const listKey = group === "content" ? "banners" : "items";
      return {
        ...current,
        [group]: {
          ...(current[group] || {}),
          [listKey]: (current[group]?.[listKey] || []).filter((_, itemIndex) => itemIndex !== index),
        },
      };
    });
  }

  async function uploadContentImage(event, applyUrl) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("content-upload");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const result = await adminApi.uploadContentImage(formData);
      applyUrl(result.url);
      setMessage("Image uploaded. Save content to publish it.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  function preview() {
    const next = { ...(draft.publish || {}), lastPreviewAt: new Date().toISOString(), status: "previewed" };
    update("publish", "lastPreviewAt", next.lastPreviewAt);
    update("publish", "status", "previewed");
    save("publish", next);
  }

  function publish() {
    const next = { ...(draft.publish || {}), lastPublishedAt: new Date().toISOString(), status: "live" };
    update("publish", "lastPublishedAt", next.lastPublishedAt);
    update("publish", "status", "live");
    save("publish", next);
  }

  if (loading) return <Loading label="Loading dynamic controls..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="admin-page dynamic-control">
      <section className="admin-hero-panel compact">
        <div>
          <p className="eyebrow">Admin control center</p>
          <h1>Dynamic Website Control</h1>
          <p>Manage content, coupons, SEO, delivery, orders, size charts, categories, payments, tracking, and one-click publishing.</p>
        </div>
        <div className="admin-quick-actions">
          <button className="secondary-action" disabled={Boolean(busy)} onClick={() => save(active)}>Save Draft</button>
          <button className="secondary-action" disabled={Boolean(busy)} onClick={preview}>Preview</button>
          <button disabled={Boolean(busy)} onClick={publish}>Publish Live</button>
        </div>
      </section>

      {message && <p className="success-text">{message}</p>}

      <div className="settings-tabs">
        {tabs.map(([key, title]) => (
          <button className={active === key ? "active" : ""} key={key} onClick={() => setActive(key)}>{title}</button>
        ))}
      </div>

      {active === "content" && (
        <SettingsPanel title="Banner Management" action={<button className="secondary-action" onClick={() => addItem("content")}>Add Banner</button>}>
          {(draft.content?.banners || []).map((banner, index) => (
            <div className="dynamic-row banner-row" key={banner.id || index}>
              <img src={banner.image} alt={banner.title} />
              <div className="settings-fields">
                <Field label="Title" value={banner.title} onChange={(value) => updateList("content", index, "title", value)} />
                <Field label="Subtitle" type="textarea" value={banner.subtitle} onChange={(value) => updateList("content", index, "subtitle", value)} />
                <Field label="Image URL" value={banner.image} onChange={(value) => updateList("content", index, "image", value)} />
                <label className="upload-drop compact-upload">Upload/replace banner image<input type="file" accept="image/*" onChange={(event) => uploadContentImage(event, (url) => updateList("content", index, "image", url))} /></label>
                <Field label="CTA Text" value={banner.ctaText} onChange={(value) => updateList("content", index, "ctaText", value)} />
                <Field label="CTA Link" value={banner.ctaLink} onChange={(value) => updateList("content", index, "ctaLink", value)} />
                <Field label="Show on website" type="checkbox" value={banner.enabled} onChange={(value) => updateList("content", index, "enabled", value)} />
              </div>
              <button className="secondary-action danger" onClick={() => removeItem("content", index)}>Delete</button>
            </div>
          ))}
          <div className="settings-card">
            <h2>Editable Website Text</h2>
            <div className="settings-fields">
              {[
                ["heroTitle"], ["heroSubtitle", "textarea"], ["heroCtaText"], ["heroCtaLink"],
                ["announcement"], ["footerTagline", "textarea"], ["aboutTitle"], ["aboutContent", "textarea"],
                ["aboutImage"], ["contactTitle"], ["contactPhone"], ["contactEmail"], ["contactAddress", "textarea"],
                ["contactWhatsapp"], ["contactMapLink"], ["contactBusinessHours"],
                ["contactInstagram"], ["contactFacebook"], ["authPromoImage"], ["authCouponCode"], ["authCouponText"],
              ].map(([key, type = "text"]) => (
                <Field key={key} label={nice(key)} type={type} value={draft.content?.[key] || ""} onChange={(value) => update("content", key, value)} />
              ))}
              <label className="upload-drop compact-upload">Upload About Us image<input type="file" accept="image/*" onChange={(event) => uploadContentImage(event, (url) => update("content", "aboutImage", url))} /></label>
              <label className="upload-drop compact-upload">Upload Login promo image<input type="file" accept="image/*" onChange={(event) => uploadContentImage(event, (url) => update("content", "authPromoImage", url))} /></label>
            </div>
            <button disabled={Boolean(busy)} onClick={() => save("content")}>Save content</button>
          </div>
          <div className="settings-card">
            <h2>Store Logo</h2>
            {draft.store?.logoUrl && <img className="settings-logo-preview" src={draft.store.logoUrl} alt="Current Salty Pumpkin logo" />}
            <Field label="Logo URL" value={draft.store?.logoUrl || ""} onChange={(value) => update("store", "logoUrl", value)} />
            <label className="upload-drop compact-upload">Upload/replace logo<input type="file" accept="image/*" onChange={(event) => uploadContentImage(event, (url) => update("store", "logoUrl", url))} /></label>
            <button disabled={Boolean(busy)} onClick={() => save("store")}>Save logo</button>
          </div>
        </SettingsPanel>
      )}

      {active === "coupons" && (
        <SettingsPanel title="Coupon Code Management" action={<button className="secondary-action" onClick={() => addItem("coupons")}>Add Coupon</button>}>
          {(draft.coupons?.items || []).map((coupon, index) => (
            <div className="dynamic-row compact-row" key={coupon.id || index}>
              <Field label="Code" value={coupon.code} onChange={(value) => updateList("coupons", index, "code", value.toUpperCase())} />
              <Field label="Type" value={coupon.type} onChange={(value) => updateList("coupons", index, "type", value)} />
              <Field label="Value" type="number" value={coupon.value} onChange={(value) => updateList("coupons", index, "value", value)} />
              <Field label="Min Order" type="number" value={coupon.minOrder} onChange={(value) => updateList("coupons", index, "minOrder", value)} />
              <Field label="Active" type="checkbox" value={coupon.active} onChange={(value) => updateList("coupons", index, "active", value)} />
              <button className="secondary-action danger" onClick={() => removeItem("coupons", index)}>Delete</button>
            </div>
          ))}
          <button disabled={Boolean(busy)} onClick={() => save("coupons")}>Save coupons</button>
        </SettingsPanel>
      )}

      {active === "seo" && (
        <SettingsPanel title="Advanced SEO Management">
          <div className="settings-fields two-col">
            <Field label="Page title" value={draft.seo?.title || ""} onChange={(value) => update("seo", "title", value)} />
            <Field label="Canonical URL" value={draft.seo?.canonicalUrl || ""} onChange={(value) => update("seo", "canonicalUrl", value)} />
            <Field label="Description" type="textarea" value={draft.seo?.description || ""} onChange={(value) => update("seo", "description", value)} />
            <Field label="Keywords" type="textarea" value={draft.seo?.keywords || ""} onChange={(value) => update("seo", "keywords", value)} />
          </div>
          <button disabled={Boolean(busy)} onClick={() => save("seo")}>Save SEO</button>
        </SettingsPanel>
      )}

      {active === "delivery" && (
        <SettingsPanel title="Delivery API & Real-Time Tracking">
          <div className="settings-fields two-col">
            <Field label="Delivery API enabled" type="checkbox" value={draft.delivery?.enabled} onChange={(value) => update("delivery", "enabled", value)} />
            <Field label="Provider" value={draft.delivery?.deliveryProvider || draft.delivery?.providerName || ""} onChange={(value) => update("delivery", "deliveryProvider", value)} />
            <Field label="Provider Name" value={draft.delivery?.providerName || ""} onChange={(value) => update("delivery", "providerName", value)} />
            <Field label="API Base URL" value={draft.delivery?.deliveryApiBaseUrl || ""} onChange={(value) => update("delivery", "deliveryApiBaseUrl", value)} />
            <Field label="API Key" type="password" value={draft.delivery?.deliveryApiKey || draft.delivery?.apiKey || ""} onChange={(value) => update("delivery", "deliveryApiKey", value)} />
            <Field label="Tracking URL Template" value={draft.delivery?.trackingUrlTemplate || ""} onChange={(value) => update("delivery", "trackingUrlTemplate", value)} />
          </div>
          <button className="secondary-action" disabled={Boolean(busy)} onClick={() => test("delivery")}>Test delivery</button>
          <button disabled={Boolean(busy)} onClick={() => save("delivery")}>Save delivery</button>
        </SettingsPanel>
      )}

      {active === "orders" && (
        <SettingsPanel title="Orders, Delivery Tracking, Refunds & Invoices">
          <div className="admin-action-grid">
            <button className="secondary-action" onClick={() => downloadSampleInvoice()}>Download sample invoice</button>
            <button className="secondary-action" onClick={() => setMessage("Tracking refresh action is ready. Connect delivery API settings for live status checks.")}>Refresh tracking</button>
            <button className="secondary-action" onClick={() => setMessage("Refund queue is available through Razorpay payment/refund APIs.")}>Manage refunds</button>
          </div>
          <p className="muted">Orders store courier, AWB/tracking number, delivery status, payment status, refund state, and invoice download support. Backend endpoints are included for payment verification, delivery webhooks, refunds, and invoice generation.</p>
        </SettingsPanel>
      )}

      {active === "sizeCharts" && (
        <SettingsPanel title="Dynamic Size Chart Management" action={<button className="secondary-action" onClick={() => addItem("sizeCharts")}>Add Chart</button>}>
          {(draft.sizeCharts?.items || []).map((chart, index) => (
            <div className="dynamic-row size-row" key={chart.id || index}>
              <Field label="Chart Name" value={chart.name} onChange={(value) => updateList("sizeCharts", index, "name", value)} />
              <Field label="Measurements" type="textarea" value={chart.sizes} onChange={(value) => updateList("sizeCharts", index, "sizes", value)} />
              <button className="secondary-action danger" onClick={() => removeItem("sizeCharts", index)}>Delete</button>
            </div>
          ))}
          <button disabled={Boolean(busy)} onClick={() => save("sizeCharts")}>Save size charts</button>
        </SettingsPanel>
      )}

      {active === "categories" && (
        <SettingsPanel title="Category Management With Preview" action={<button className="secondary-action" onClick={() => addItem("categories")}>Add Category</button>}>
          {(draft.categories?.items || []).map((category, index) => (
            <div className="dynamic-row banner-row" key={category.id || index}>
              <img src={category.image} alt={category.title} />
              <div className="settings-fields">
                <Field label="Title" value={category.title} onChange={(value) => updateList("categories", index, "title", value)} />
                <Field label="Shop Param" value={category.param} onChange={(value) => updateList("categories", index, "param", value)} />
                <Field label="Image URL" value={category.image} onChange={(value) => updateList("categories", index, "image", value)} />
                <Field label="Active" type="checkbox" value={category.active} onChange={(value) => updateList("categories", index, "active", value)} />
              </div>
              <button className="secondary-action danger" onClick={() => removeItem("categories", index)}>Delete</button>
            </div>
          ))}
          <button disabled={Boolean(busy)} onClick={() => save("categories")}>Save categories</button>
        </SettingsPanel>
      )}

      {active === "payments" && (
        <SettingsPanel title="Razorpay Payment Configuration">
          <p className="muted">Razorpay Key ID, Key Secret, and Webhook Secret are loaded only from backend environment variables.</p>
          <div className="settings-fields two-col">
            <Field label="Razorpay enabled" type="checkbox" value={draft.payments?.enabled} onChange={(value) => update("payments", "enabled", value)} />
            <Field label="COD enabled" type="checkbox" value={draft.payments?.codEnabled} onChange={(value) => update("payments", "codEnabled", value)} />
          </div>
          <button className="secondary-action" disabled={Boolean(busy)} onClick={() => test("payments")}>Test Razorpay</button>
          <button disabled={Boolean(busy)} onClick={() => save("payments")}>Save payments</button>
        </SettingsPanel>
      )}

      {active === "tracking" && (
        <SettingsPanel title="Tracking & Analytics Integration">
          <div className="settings-fields two-col">
            <Field label="Enable tracking" type="checkbox" value={draft.tracking?.enabled} onChange={(value) => update("tracking", "enabled", value)} />
            <Field label="Google Tag Manager" value={draft.tracking?.gtmId || draft.analytics?.gtmId || ""} onChange={(value) => update("tracking", "gtmId", value)} />
            <Field label="Meta Pixel" value={draft.tracking?.metaPixelId || draft.analytics?.metaPixelId || ""} onChange={(value) => update("tracking", "metaPixelId", value)} />
            <Field label="GA4 Measurement ID" value={draft.tracking?.ga4Id || draft.analytics?.ga4MeasurementId || ""} onChange={(value) => update("tracking", "ga4Id", value)} />
            <Field label="Meta CAPI token" type="password" value={draft.tracking?.metaConversionsToken || ""} onChange={(value) => update("tracking", "metaConversionsToken", value)} />
            <Field label="Meta Conversions API" type="checkbox" value={draft.tracking?.metaConversionsApi} onChange={(value) => update("tracking", "metaConversionsApi", value)} />
            <Field label="Preserve WordPress events" type="checkbox" value={draft.tracking?.preserveWordPressEvents} onChange={(value) => update("tracking", "preserveWordPressEvents", value)} />
            <Field label="Virtual pageviews" type="checkbox" value={draft.tracking?.virtualPageviews} onChange={(value) => update("tracking", "virtualPageviews", value)} />
          </div>
          <button disabled={Boolean(busy)} onClick={() => save("tracking")}>Save tracking</button>
        </SettingsPanel>
      )}

      {active === "publish" && (
        <SettingsPanel title="Preview Before Publish & One-Click Live Update">
          <div className="admin-action-grid">
            <button className="secondary-action" disabled={Boolean(busy)} onClick={() => save("publish", { ...(draft.publish || {}), lastDraftAt: new Date().toISOString(), status: "draft" })}>Save Draft</button>
            <button className="secondary-action" disabled={Boolean(busy)} onClick={preview}>Preview Draft</button>
            <button disabled={Boolean(busy)} onClick={publish}>Publish Live</button>
          </div>
          <p className="muted">Last preview: {draft.publish?.lastPreviewAt || "Not previewed yet"}</p>
          <p className="muted">Last publish: {draft.publish?.lastPublishedAt || "Not published yet"}</p>
          <p className="muted">Status: {draft.publish?.status || "draft"}</p>
        </SettingsPanel>
      )}

      {active === "advanced" && (
        <div className="settings-grid">
          {advancedGroups.map((group) => (
            <section className="settings-card" key={group.key}>
              <div className="settings-card-head">
                <div>
                  <h2>{group.title}</h2>
                  <span className={data.configured?.[group.key] ? "badge-ok" : "badge-missing"}>
                    {data.configured?.[group.key] ? "Configured" : "Not configured"}
                  </span>
                </div>
                {group.test && <button className="secondary-action" disabled={Boolean(busy)} onClick={() => test(group.test)}>Test</button>}
              </div>
              <div className="settings-fields">
                {group.fields.map(([key, fieldLabel, type = "text"]) => (
                  <Field key={key} label={fieldLabel} type={type} value={draft[group.key]?.[key] ?? ""} onChange={(value) => update(group.key, key, value)} />
                ))}
              </div>
              <button disabled={Boolean(busy)} onClick={() => save(group.key)}>{busy === group.key ? "Saving..." : "Save"}</button>
            </section>
          ))}
        </div>
      )}

      <section className="panel">
        <h2>Audit log</h2>
        {(data.audit || []).map((entry) => (
          <p className="muted" key={entry.id}>{entry.createdAt}: {entry.user} changed {entry.groups.join(", ")}</p>
        ))}
      </section>
    </div>
  );
}

function SettingsPanel({ title, action, children }) {
  return (
    <section className="settings-card dynamic-panel">
      <div className="settings-card-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, type = "text", value, onChange }) {
  if (type === "checkbox") {
    return (
      <label className="check-row">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
    );
  }
  if (type === "textarea") {
    return (
      <label>{label}
        <textarea value={value || ""} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  }
  if (type === "password") {
    return <PasswordField label={label} value={value || ""} onChange={onChange} />;
  }
  return (
    <label>{label}
      <input type={type} value={value ?? ""} onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)} />
    </label>
  );
}

function downloadSampleInvoice() {
  const text = [
    "Salty Pumpkin - Sample Invoice",
    `Generated: ${new Date().toLocaleString("en-IN")}`,
    "Order: Demo dynamic invoice",
    "Payment: Razorpay/COD status aware",
    "Delivery: Tracking link is generated from delivery settings",
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sample-invoice.txt";
  link.click();
  URL.revokeObjectURL(url);
}

function nice(value) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function label(group) {
  return tabs.find(([key]) => key === group)?.[1] || advancedGroups.find((item) => item.key === group)?.title || group;
}
