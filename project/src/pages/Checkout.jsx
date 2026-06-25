import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { catalogApi, orderApi, paymentApi } from "../services/api";
import { trackEvent } from "../services/tracking";
import { AddressFields } from "../components/AddressFields";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../services/api";
import { syncCurrentFirebaseCustomerData } from "../services/firebaseAuth";
import { useAsync } from "../hooks/useAsync";

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay checkout")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

function withTimeout(promise, milliseconds, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => window.clearTimeout(timeout));
}

function emptyAddress(user) {
  return {
    name: user?.name || "",
    phone: user?.phone || "",
    line1: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
    country: "India",
    label: "",
    isDefault: false,
  };
}

function paymentError(status, message, details = {}) {
  const error = new Error(message);
  error.paymentStatus = status;
  error.paymentDetails = details;
  return error;
}

export function Checkout() {
  const { items, total, clear } = useCart();
  const { user, updateUser } = useAuth();
  const savedAddresses = [...(user?.addresses || [])].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const defaultAddress = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id || "new");
  const [shipping, setShipping] = useState(defaultAddress || emptyAddress(user));
  const [editingAddress, setEditingAddress] = useState(!defaultAddress);
  const [saveAddress, setSaveAddress] = useState(!savedAddresses.length);
  const [makeDefault, setMakeDefault] = useState(!savedAddresses.length);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [serviceability, setServiceability] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const navigate = useNavigate();
  const { data: settingsData } = useAsync(() => catalogApi.settings().catch(() => ({ settings: {} })), []);
  const activeCoupon = (settingsData?.settings?.coupons?.items || []).find((coupon) => coupon.active !== false);

  useEffect(() => {
    if (
      !items.length ||
      !shipping.name ||
      !shipping.phone ||
      !shipping.line1 ||
      !shipping.city ||
      !shipping.state ||
      !/^\d{6}$/.test(shipping.pincode || "")
    ) {
      setQuote(null);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      try {
        setQuote(await orderApi.quote({ items, shippingAddress: shipping, paymentMethod }));
      } catch (err) {
        setQuote({ error: err.message });
      } finally {
        setQuoteLoading(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [items, paymentMethod, shipping]);

  async function submit(event) {
    event.preventDefault();
    setPlacing(true);
    setError("");
    let paymentSession = null;
    try {
      await trackEvent("begin_checkout", {
        ecommerce: {
          currency: "INR",
          value: total,
          items: items.map((item) => ({
            item_id: item.sku || item._id,
            item_name: item.name,
            item_category: item.parentCategory || item.category,
            item_category2: item.childCategory || item.category,
            price: Number(item.price || 0),
            quantity: item.qty,
          })),
        },
      });
      if (saveAddress) {
        const addressPayload = { ...shipping, isDefault: makeDefault || shipping.isDefault };
        const addressData = selectedAddressId === "new"
          ? await authApi.addAddress(addressPayload)
          : await authApi.updateAddress(selectedAddressId, addressPayload);
        updateUser(addressData.user);
        await syncCurrentFirebaseCustomerData(addressData.user);
      }
      let finalOrder;
      if (paymentMethod === "online") {
        paymentSession = await withTimeout(
          paymentApi.createOrder({ items, shippingAddress: shipping, paymentMethod: "online" }),
          15000,
          "Payment initialization timed out. Please check your connection and try again.",
        );
        await withTimeout(
          loadRazorpay(),
          12000,
          "Razorpay checkout took too long to load. Please try again.",
        );
        finalOrder = await new Promise((resolve, reject) => {
          const checkout = new window.Razorpay({
            key: paymentSession.key,
            amount: paymentSession.amount,
            currency: paymentSession.currency || "INR",
            name: "Salty Pumpkin",
            description: paymentSession.orderNumber || "Order payment",
            order_id: paymentSession.id,
            prefill: { name: shipping.name, contact: shipping.phone },
            handler: async (response) => {
              try {
                const verified = await paymentApi.verify({
                  ...response,
                  checkoutId: paymentSession.checkoutId,
                });
                resolve(verified.order);
              } catch (err) {
                reject(paymentError("failed", err.message, response));
              }
            },
            retry: { enabled: true },
            modal: {
              ondismiss: () => reject(paymentError("cancelled", "Payment was cancelled")),
            },
          });
          checkout.on("payment.failed", (response) => {
            reject(paymentError("failed", response.error?.description || "Payment failed", response.error?.metadata));
          });
          try {
            checkout.open();
          } catch {
            reject(paymentError("failed", "Razorpay checkout could not be opened."));
          }
        });
      } else {
        const data = await orderApi.create({
          items,
          shippingAddress: shipping,
          paymentMethod: "cod",
        });
        finalOrder = data.order;
      }
      await trackEvent("purchase", {
        transaction_id: finalOrder.orderNumber || finalOrder._id,
        ecommerce: { currency: "INR", value: finalOrder.total || total, payment_type: paymentMethod },
      });
      clear();
      navigate(`/order-success/${finalOrder._id}`);
    } catch (err) {
      if (paymentSession && paymentMethod === "online") {
        const details = err.paymentDetails || {};
        try {
          const body = {
            checkoutId: paymentSession.checkoutId,
            reason: err.message,
            paymentId: details.payment_id || details.razorpay_payment_id || "",
            razorpayOrderId: details.order_id || details.razorpay_order_id || paymentSession.id,
          };
          if (err.paymentStatus === "cancelled") {
            await paymentApi.cancelled(body);
          } else {
            await paymentApi.failed(body);
          }
        } catch {
          // Do not hide the customer-facing failure state.
        }
        navigate("/payment-failed", {
          state: { message: err.message, status: err.paymentStatus || "failed" },
        });
        return;
      }
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <section className="section page-section checkout-page">
      <p className="breadcrumb">Home / Checkout</p>
      <h1>Checkout</h1>
      <div className="checkout-grid">
      <form className="form-card checkout-form" onSubmit={submit}>
        <p className="eyebrow">Billing & shipping</p>
        <h2>Shipping details</h2>
        {error && <div className="form-error">{error}</div>}
        {savedAddresses.length > 0 && (
          <label>Saved address
            <select value={selectedAddressId} onChange={(event) => {
              const id = event.target.value;
              setSelectedAddressId(id);
              const selected = savedAddresses.find((address) => address.id === id);
              setShipping(selected || emptyAddress(user));
              setEditingAddress(id === "new");
              setSaveAddress(id === "new");
              setMakeDefault(Boolean(selected?.isDefault || id === "new"));
            }}>
              {savedAddresses.map((address, index) => <option value={address.id} key={address.id}>{address.isDefault ? "Default - " : ""}{address.label || `Address ${index + 1}`} - {address.line1}, {address.city}</option>)}
              <option value="new">Add new address</option>
            </select>
          </label>
        )}
        {selectedAddressId !== "new" && !editingAddress && (
          <div className="selected-address-card">
            <strong>{shipping.label || "Selected address"}</strong>
            <span>{[shipping.line1, shipping.city, shipping.state, shipping.pincode].filter(Boolean).join(", ")}</span>
            <small>{shipping.name} {shipping.phone ? `- ${shipping.phone}` : ""}</small>
            <button type="button" className="secondary-action" onClick={() => { setEditingAddress(true); setSaveAddress(true); }}>Edit Address</button>
          </div>
        )}
        {editingAddress && (
          <>
            <label>Address label<input value={shipping.label || ""} onChange={(event) => setShipping({ ...shipping, label: event.target.value })} placeholder="Home, Work, Grandparents" /></label>
            <AddressFields value={shipping} onChange={setShipping} onServiceability={setServiceability} />
            <label className="check-row"><input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} />{selectedAddressId === "new" ? "Save this address" : "Update selected address"}</label>
            {saveAddress && <label className="check-row"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} />Use as my default address</label>}
          </>
        )}
        <label>Payment method
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="cod">Cash on delivery</option>
            <option value="online">Online payment</option>
          </select>
        </label>
        {quote?.error && <div className="form-error">{quote.error}</div>}
        <button disabled={
          placing ||
          !items.length ||
          serviceability?.available === false ||
          (paymentMethod === "cod" && serviceability?.codAvailable === false) ||
          Boolean(quote?.error)
        }>
          {placing ? "Starting secure checkout..." : paymentMethod === "online" ? "Proceed to Payment" : "Place COD Order"}
        </button>
      </form>
      <aside className="summary-box checkout-summary">
        <h2>Order summary</h2>
        {items.map((item) => <p key={item.cartKey || item._id}>{item.name} x {item.qty}</p>)}
        <label>Coupon<input placeholder={activeCoupon?.code || "Enter coupon code"} /></label>
        <div className="price-breakdown">
          <p><span>Subtotal</span><strong>Rs. {Number(quote?.subtotal ?? total).toLocaleString("en-IN")}</strong></p>
          <p><span>Shipping</span><strong>{quoteLoading ? "Checking..." : `Rs. ${Number(quote?.shippingFee || 0).toLocaleString("en-IN")}`}</strong></p>
          {Number(quote?.codExtraFee || 0) > 0 && <p><span>COD fee</span><strong>Rs. {Number(quote.codExtraFee).toLocaleString("en-IN")}</strong></p>}
          {Number(quote?.gst || 0) > 0 && <p><span>Tax</span><strong>Rs. {Number(quote.gst).toLocaleString("en-IN")}</strong></p>}
          <p className="total-row"><span>Total</span><strong>Rs. {Number(quote?.total ?? total).toLocaleString("en-IN")}</strong></p>
        </div>
        <div className="secure-note">Secure checkout · COD and Razorpay ready · Free shipping over Rs. 999</div>
      </aside>
      </div>
    </section>
  );
}
