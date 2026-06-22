import { useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";

export function AdminRefunds() {
  const { loading, data, error, reload } = useAsync(() => adminApi.refunds(), []);
  const [form, setForm] = useState({ orderId: "", paymentId: "", amount: "", notes: "" });
  const refunds = data?.refunds || [];

  async function submit(event) {
    event.preventDefault();
    await adminApi.createRefund(form);
    setForm({ orderId: "", paymentId: "", amount: "", notes: "" });
    await reload();
  }

  async function update(id, status) {
    await adminApi.updateRefund(id, { status });
    await reload();
  }

  return (
    <div className="admin-page">
      <section className="admin-hero-panel compact"><div><p className="eyebrow">Payments</p><h1>Refunds</h1><p>Approve, reject, track, and create full or partial Razorpay refunds.</p></div></section>
      <form className="admin-card inline-form" onSubmit={submit}>
        <input placeholder="Order ID" value={form.orderId} onChange={(event) => setForm({ ...form, orderId: event.target.value })} />
        <input placeholder="Payment ID" value={form.paymentId} onChange={(event) => setForm({ ...form, paymentId: event.target.value })} />
        <input placeholder="Amount in Rs." type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        <input placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        <button>Create refund</button>
      </form>
      {loading && <Loading label="Loading refunds..." />}
      {error && <ErrorState message={error} />}
      <div className="admin-card no-pad table-wrap"><table><thead><tr><th>Refund</th><th>Order</th><th>Payment</th><th>Amount</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead><tbody>{refunds.map((refund) => <tr key={refund.id}><td>{refund.id}</td><td>{refund.orderId}</td><td>{refund.paymentId}</td><td>Rs. {(Number(refund.amount || 0) / 100).toLocaleString("en-IN")}</td><td>{refund.refundStatus || refund.status}</td><td>{refund.notes}</td><td className="table-actions"><button className="secondary-action" onClick={() => update(refund.id, "approved")}>Approve</button><button className="secondary-action danger" onClick={() => update(refund.id, "rejected")}>Reject</button></td></tr>)}</tbody></table></div>
    </div>
  );
}
