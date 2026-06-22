import { useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";

const pageSize = 25;

export function AdminOrders() {
  const { loading, data, error, reload } = useAsync(() => adminApi.orders(), []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [tracking, setTracking] = useState("");
  const [shipmentBusy, setShipmentBusy] = useState(false);
  const [shipmentMessage, setShipmentMessage] = useState("");
  const orders = data?.orders || [];

  const filtered = orders.filter((order) => {
    const haystack = `${order._id} ${order.user} ${order.shippingAddress?.name || ""} ${order.shippingAddress?.phone || ""}`.toLowerCase();
    const statusOk = status === "all" || order.status === status;
    const paymentOk = payment === "all" || order.paymentStatus === payment || order.paymentMethod === payment;
    return haystack.includes(query.toLowerCase()) && statusOk && paymentOk;
  });
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const kpi = buildKpi(orders);

  async function changeStatus(id, nextStatus) {
    await adminApi.updateOrder(id, nextStatus);
    await reload();
  }

  async function openDetail(id) {
    const data = await adminApi.order(id);
    setDetail(data.order);
    setTracking(data.order.delivery?.trackingNumber || "");
  }

  async function saveTracking() {
    const data = await adminApi.updateTracking(detail._id, { trackingNumber: tracking, status: detail.status });
    setDetail(data.order);
    await reload();
  }

  async function createShipment() {
    setShipmentBusy(true);
    setShipmentMessage("");
    try {
      const data = await adminApi.createShipment(detail._id);
      setDetail(data.order);
      setTracking(data.order.trackingNumber || data.order.waybill || "");
      setShipmentMessage("Delhivery shipment created.");
      await reload();
    } catch (err) {
      setShipmentMessage(err.message);
    } finally {
      setShipmentBusy(false);
    }
  }

  async function refreshShipment() {
    setShipmentBusy(true);
    setShipmentMessage("");
    try {
      const data = await adminApi.refreshShipment(detail._id);
      setDetail(data.order);
      setTracking(data.order.trackingNumber || data.order.waybill || "");
      setShipmentMessage("Shipment status refreshed.");
      await reload();
    } catch (err) {
      setShipmentMessage(err.message);
    } finally {
      setShipmentBusy(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["Order", "User", "Customer", "Phone", "Total", "Status", "Payment", "Created"],
      ...filtered.map((order) => [
        order._id,
        order.user,
        order.shippingAddress?.name || "",
        order.shippingAddress?.phone || "",
        order.total || order.amount || 0,
        order.status,
        order.paymentStatus || order.paymentMethod || "",
        order.createdAt || "",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "salty-pumpkin-orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-page">
      <section className="admin-hero-panel compact">
        <div>
          <p className="eyebrow">Fulfillment</p>
          <h1>Orders Management</h1>
          <p className="muted">Manage purchases, payment states, delivery progress, and reports.</p>
        </div>
        <button onClick={exportCsv}>Export CSV</button>
      </section>

      <div className="stat-grid">
        <Stat label="Total revenue" value={`Rs. ${kpi.revenue.toLocaleString("en-IN")}`} />
        <Stat label="Orders" value={kpi.count} />
        <Stat label="Pending" value={kpi.pending} />
        <Stat label="Delivered" value={kpi.delivered} />
      </div>

      <div className="admin-toolbar admin-card">
        <input
          placeholder="Search order, customer, phone"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={payment} onChange={(event) => setPayment(event.target.value)}>
          <option value="all">All payments</option>
          <option value="pending">Payment pending</option>
          <option value="paid">Paid</option>
          <option value="cod">COD</option>
          <option value="razorpay">Razorpay</option>
        </select>
        <span>Showing {visible.length} of {filtered.length}</span>
      </div>

      {loading && <Loading label="Loading orders..." />}
      {error && <ErrorState message={error} />}
      <div className="admin-card no-pad table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Update</th><th>Details</th></tr></thead>
          <tbody>
            {visible.map((order) => (
              <tr key={order._id}>
                <td><strong>{order._id}</strong><br /><span className="muted">{formatDate(order.createdAt)}</span></td>
                <td>{order.shippingAddress?.name || order.user}<br /><span className="muted">{order.shippingAddress?.phone || order.user}</span></td>
                <td>{order.items?.length || 0}</td>
                <td>Rs. {Number(order.total || order.amount || 0).toLocaleString("en-IN")}</td>
                <td>{order.paymentStatus || order.paymentMethod || "pending"}</td>
                <td><span className={`order-badge ${order.status}`}>{order.status}</span></td>
                <td>
                  <select value={order.status} onChange={(event) => changeStatus(order._id, event.target.value)}>
                    <option>confirmed</option>
                    <option>packed</option>
                    <option>shipped</option>
                    <option>delivered</option>
                    <option>cancelled</option>
                  </select>
                </td>
                <td><button className="secondary-action" onClick={() => openDetail(order._id)}>View Details</button></td>
              </tr>
            ))}
            {!visible.length && !loading && <tr><td colSpan="8">No orders match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button className="secondary-action" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button className="secondary-action" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
      </div>
      {detail && (
        <div className="modal-backdrop">
          <div className="admin-modal wide-modal">
            <button className="secondary-action" onClick={() => setDetail(null)}>Close</button>
            <h2>{detail.orderNumber || detail._id}</h2>
            <div className="modal-grid">
              <section><h3>Items</h3>{(detail.items || []).map((item) => <p key={`${item.productId}-${item.variantSku}`}>{item.name} x {item.qty} - Rs. {Number(item.price * item.qty || 0).toLocaleString("en-IN")}</p>)}</section>
              <section><h3>Shipping address</h3><p>{Object.values(detail.shippingAddress || {}).filter(Boolean).join(", ")}</p></section>
              <section>
                <h3>Payment</h3>
                <p>Status: {detail.paymentStatus || "pending"}</p>
                <p>Method: {detail.paymentMethod}</p>
                <p>Payment ID: {detail.paymentId || "-"}</p>
                <p>Razorpay Order ID: {detail.razorpayOrderId || "-"}</p>
                <p>Transaction Amount: Rs. {Number(detail.transactionAmount || detail.total || 0).toLocaleString("en-IN")}</p>
                <p>Transaction Date: {formatDateTime(detail.paymentTimestamp || detail.updatedAt || detail.createdAt)}</p>
              </section>
              <section>
                <h3>Delhivery shipment</h3>
                <p>Status: <strong>{detail.shipmentStatus || "pending"}</strong></p>
                <p>Tracking number: <strong>{detail.trackingNumber || "-"}</strong></p>
                <p>Waybill: <strong>{detail.waybill || "-"}</strong></p>
                <p>Shipment ID: <strong>{detail.shipmentId || "-"}</strong></p>
                <p>Courier: <strong>{detail.courierPartner || "Delhivery"}</strong></p>
                <p>Estimated delivery: <strong>{detail.estimatedDeliveryDate || "-"}</strong></p>
                <p>Last sync: <strong>{formatDateTime(detail.shipmentLastSyncTime)}</strong></p>
                {detail.shipmentError && <p className="form-error">{detail.shipmentError}</p>}
                {shipmentMessage && <p className="muted">{shipmentMessage}</p>}
                {!detail.waybill && <button disabled={shipmentBusy} onClick={createShipment}>{shipmentBusy ? "Working..." : "Create / retry shipment"}</button>}
                {detail.waybill && <button disabled={shipmentBusy} onClick={refreshShipment}>{shipmentBusy ? "Refreshing..." : "Refresh Delhivery status"}</button>}
              </section>
              <section><h3>Manual tracking override</h3><input value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="Tracking number / AWB" /><button onClick={saveTracking}>Update tracking</button></section>
              <section><h3>Shipment timeline</h3>{(detail.shipmentTimeline || detail.timeline || [{ status: detail.status, createdAt: detail.createdAt }]).map((item, index) => <p key={index}>{item.label || item.status} - {[item.location, formatDateTime(item.createdAt)].filter(Boolean).join(" - ")}</p>)}</section>
            </div>
            <div className="table-actions"><a className="primary-action" href={`/api/admin/orders/${detail._id}/invoice`} target="_blank" rel="noreferrer">Download PDF Invoice</a><button className="secondary-action" onClick={() => window.print()}>Print</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>;
}

function buildKpi(orders) {
  return orders.reduce(
    (acc, order) => ({
      revenue: acc.revenue + Number(order.total || order.amount || 0),
      count: acc.count + 1,
      pending: acc.pending + (order.status === "confirmed" || order.status === "packed" ? 1 : 0),
      delivered: acc.delivered + (order.status === "delivered" ? 1 : 0),
    }),
    { revenue: 0, count: 0, pending: 0, delivered: 0 },
  );
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN");
}
