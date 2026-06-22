import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { orderApi } from "../services/api";

export function OrderDetail() {
  const { id } = useParams();
  const { loading, data, error, reload } = useAsync(() => orderApi.detail(id), [id]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const order = data?.order;

  if (loading) return <Loading label="Loading order..." />;
  if (error) return <ErrorState message={error} action={<Link to="/account">Back to account</Link>} />;

  async function refreshTracking() {
    setRefreshing(true);
    setRefreshError("");
    try {
      await orderApi.refreshTracking(id);
      await reload();
    } catch (err) {
      setRefreshError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="section page-section narrow">
      <p className="eyebrow">Order</p>
      <h1>{order.orderNumber || order._id}</h1>
      <div className="summary-box">
        <p>Status: <strong>{formatStatus(order.status)}</strong></p>
        <p>Payment status: <strong>{formatStatus(order.paymentStatus)}</strong></p>
        <p>Order number: <strong>{order.orderNumber || order._id}</strong></p>
        <p>Payment reference ID: <strong>{order.paymentId || (order.paymentMethod === "cod" ? "Cash on delivery" : "Pending")}</strong></p>
        <p>Shipping: <strong>Rs. {Number(order.shippingFee || 0).toLocaleString("en-IN")}</strong></p>
        <p>Total: <strong>Rs. {Number(order.total || 0).toLocaleString("en-IN")}</strong></p>
      </div>
      <div className="summary-box tracking-card">
        <div className="tracking-head">
          <div><p className="eyebrow">Shipment tracking</p><h2>{formatStatus(order.shipmentStatus || "pending")}</h2></div>
          {(order.waybill || order.trackingNumber) && <button className="secondary-action" disabled={refreshing} onClick={refreshTracking}>{refreshing ? "Refreshing..." : "Refresh shipment"}</button>}
        </div>
        <p>Tracking number: <strong>{order.trackingNumber || order.waybill || "Shipment creation pending"}</strong></p>
        <p>Courier: <strong>{order.courierPartner || "Delhivery"}</strong></p>
        <p>Estimated delivery: <strong>{formatDate(order.estimatedDeliveryDate) || "Updating soon"}</strong></p>
        {order.shipmentError && <p className="muted">Courier update: {order.shipmentError}</p>}
        {refreshError && <div className="form-error">{refreshError}</div>}
        {(order.waybill || order.trackingNumber) && (
          <a className="primary-action" href={`https://www.delhivery.com/track/package/${encodeURIComponent(order.waybill || order.trackingNumber)}`} target="_blank" rel="noreferrer">
            Track shipment
          </a>
        )}
        <div className="shipment-timeline">
          {(order.shipmentTimeline || []).map((item, index) => (
            <div className="shipment-event" key={`${item.createdAt}-${index}`}>
              <span />
              <div><strong>{item.label || formatStatus(item.status)}</strong><p>{[item.location, formatDateTime(item.createdAt)].filter(Boolean).join(" · ")}</p></div>
            </div>
          ))}
          {!order.shipmentTimeline?.length && <p className="muted">Shipment updates will appear here after pickup is scheduled.</p>}
        </div>
      </div>
      <div className="stack">
        {order.items?.map((item) => <div className="order-row" key={item._id || item.name}><span>{item.name}</span><span>Qty {item.qty}</span></div>)}
      </div>
    </section>
  );
}

function formatStatus(value) {
  return String(value || "pending").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("en-IN");
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("en-IN");
}
