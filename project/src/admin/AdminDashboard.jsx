import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";
import { Link } from "react-router-dom";

export function AdminDashboard() {
  const { loading, data, error } = useAsync(() => adminApi.dashboard(), []);
  const readiness = useAsync(() => adminApi.readiness(), []);
  const stats = data?.stats || {};
  const recentOrders = (data?.orders || []).slice(0, 5);
  const checklist = readiness.data?.checklist || {};

  return (
    <div className="admin-dashboard">
      <section className="admin-hero-panel">
        <div>
          <p className="eyebrow">Control room</p>
          <h1>Store overview</h1>
          <p>Track revenue, orders, catalog health, setup readiness, and the most important admin actions from one screen.</p>
        </div>
        <div className="admin-quick-actions">
          <Link className="primary-action" to="/admin/products/add">Add product</Link>
          <Link className="secondary-action" to="/admin/orders">Manage orders</Link>
        </div>
      </section>
      {loading && <Loading label="Loading admin dashboard..." />}
      {error && <ErrorState message={error} />}
      <div className="stat-grid">
        <Stat label="Revenue" value={`Rs. ${Number(stats.revenue || 0).toLocaleString("en-IN")}`} hint="Total order value" />
        <Stat label="Active orders" value={stats.activeOrders || 0} hint="Need fulfilment" />
        <Stat label="Products" value={stats.products || 0} hint="Catalog items" />
        <Stat label="Customers" value={stats.customers || 0} hint="Registered users" />
      </div>
      <section className="admin-grid-2">
        <div className={`readiness-panel ${readiness.data?.readyToTakeOrders ? "ready" : ""}`}>
          <div>
            <p className="eyebrow">Readiness</p>
            <h2>{readiness.data?.readyToTakeOrders ? "Store is ready to take orders" : "Store setup still needs attention"}</h2>
          </div>
          <div className="readiness-list">
            {Object.entries({
              payments: "Payment or COD",
              storeInfo: "Store info",
              delivery: "Delivery/manual fulfilment",
              email: "Email",
              otp: "OTP",
              storage: "Image storage",
            }).map(([key, label]) => (
              <span className={checklist[key] ? "ok" : "missing"} key={key}>
                {checklist[key] ? "Connected" : "Missing"}: {label}
              </span>
            ))}
          </div>
        </div>
        <div className="panel admin-list-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2>Latest orders</h2>
            </div>
            <Link to="/admin/orders">View all</Link>
          </div>
          {recentOrders.length ? recentOrders.map((order) => (
            <div className="admin-mini-row" key={order._id}>
              <span>{order.orderNumber || order._id}</span>
              <strong>Rs. {Number(order.total || order.amount || 0).toLocaleString("en-IN")}</strong>
              <em>{order.status}</em>
            </div>
          )) : <p className="muted">No orders yet.</p>}
        </div>
      </section>
      <section className="admin-action-grid">
        {[
          ["Products", "Add, edit, bulk import, publish, and manage inventory.", "/admin/products"],
          ["Orders", "Update fulfilment states and export order reports.", "/admin/orders"],
          ["Customers", "Search customers, view order history, and manage account status.", "/admin/customers"],
          ["Transactions", "Audit Razorpay, COD, failed payments, and webhook records.", "/admin/transactions"],
          ["Refunds", "Create, approve, reject, and track refund requests.", "/admin/refunds"],
          ["Settings", "Configure payment, shipping, email, OTP, and store details.", "/admin/settings"],
        ].map(([title, text, to]) => (
          <Link className="admin-action-card" to={to} key={title}>
            <h3>{title}</h3>
            <p>{text}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong><p>{hint}</p></div>;
}
