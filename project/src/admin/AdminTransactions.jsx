import { useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";

export function AdminTransactions() {
  const { loading, data, error } = useAsync(() => Promise.all([adminApi.transactions(), adminApi.paymentDashboard()]), []);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const transactionData = data?.[0] || {};
  const dashboard = data?.[1] || {};
  const transactions = (transactionData.transactions || []).filter((item) =>
    `${item.id || ""} ${item.orderId || ""} ${item.paymentId || ""} ${item.status || ""}`.toLowerCase().includes(query.toLowerCase())
  );

  function exportCsv() {
    const csv = [["Transaction", "Order", "Method", "Status", "Customer", "Amount", "Created"], ...transactions.map((item) => [item.id, item.orderId, item.paymentMethod || item.method, item.paymentStatus || item.status, item.customer, item.amount, item.createdAt])].map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "salty-pumpkin-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-page">
      <section className="admin-hero-panel compact"><div><p className="eyebrow">Payments</p><h1>Transactions</h1><p>Review Razorpay, COD, failed payment, webhook, and refund records.</p></div><button onClick={exportCsv}>Export CSV</button></section>
      <div className="stat-grid">
        {["pending", "success", "failed", "cancelled", "refunded"].map((key) => (
          <article className="stat-card" key={key}><span>{key}</span><strong>{dashboard.counts?.[key] || 0}</strong></article>
        ))}
        <article className="stat-card"><span>Payment revenue</span><strong>Rs. {Number(dashboard.revenue || 0).toLocaleString("en-IN")}</strong></article>
      </div>
      <div className="admin-toolbar admin-card"><input placeholder="Search transaction/order/payment" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{transactions.length} records</span></div>
      {loading && <Loading label="Loading transactions..." />}
      {error && <ErrorState message={error} />}
      <div className="admin-card no-pad table-wrap"><table><thead><tr><th>Transaction</th><th>Order</th><th>Method</th><th>Status</th><th>Customer</th><th>Amount</th><th>Created</th><th></th></tr></thead><tbody>{transactions.map((item) => <tr key={`${item.id}-${item.createdAt}`}><td>{item.id}</td><td>{item.orderId || "-"}</td><td>{item.paymentMethod || item.method || "-"}</td><td>{item.paymentStatus || item.status}</td><td>{item.customer || "-"}</td><td>Rs. {(Number(item.amount || 0) / 100).toLocaleString("en-IN")}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString("en-IN") : "-"}</td><td><button className="secondary-action" onClick={() => setSelected(item)}>Details</button></td></tr>)}</tbody></table></div>
      {selected && <div className="modal-backdrop"><div className="admin-modal"><button className="secondary-action" onClick={() => setSelected(null)}>Close</button><h2>Transaction detail</h2><pre>{JSON.stringify(selected, null, 2)}</pre></div></div>}
    </div>
  );
}
