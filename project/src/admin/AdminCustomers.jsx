import { useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";

export function AdminCustomers() {
  const { loading, data, error, reload } = useAsync(() => adminApi.customers(), []);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const customers = (data?.customers || []).filter((customer) =>
    `${customer.name || ""} ${customer.email || ""} ${customer.phone || ""}`.toLowerCase().includes(query.toLowerCase())
  );

  async function toggle(customer) {
    await adminApi.updateCustomerStatus(customer.id, customer.status === "banned" ? "active" : "banned");
    await reload();
  }

  async function open(customer) {
    const detail = await adminApi.customer(customer.id);
    setSelected(detail);
  }

  return (
    <div className="admin-page">
      <section className="admin-hero-panel compact"><div><p className="eyebrow">CRM</p><h1>Customers</h1><p>Search customers, review order history, total spent, and ban/unban accounts.</p></div></section>
      <div className="admin-toolbar admin-card"><input placeholder="Search customers" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{customers.length} customers</span></div>
      {loading && <Loading label="Loading customers..." />}
      {error && <ErrorState message={error} />}
      <div className="admin-card no-pad table-wrap">
        <table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{customers.map((customer) => (
            <tr key={customer.id}>
              <td><strong>{customer.name || "Customer"}</strong></td><td>{customer.email || "-"}</td><td>{customer.phone || "-"}</td>
              <td>{customer.orderCount}</td><td>Rs. {Number(customer.totalSpent || 0).toLocaleString("en-IN")}</td>
              <td><span className={customer.status === "banned" ? "badge-missing" : "badge-ok"}>{customer.status}</span></td>
              <td className="table-actions"><button className="secondary-action" onClick={() => open(customer)}>Details</button><button className="secondary-action danger" onClick={() => toggle(customer)}>{customer.status === "banned" ? "Unban" : "Ban"}</button></td>
            </tr>
          ))}</tbody></table>
      </div>
      {selected && <div className="modal-backdrop"><div className="admin-modal"><button className="secondary-action" onClick={() => setSelected(null)}>Close</button><h2>{selected.customer.name || selected.customer.email}</h2><p>Total spent: Rs. {Number(selected.customer.totalSpent || 0).toLocaleString("en-IN")}</p><h3>Order history</h3>{selected.orders.map((order) => <p key={order._id}>{order.orderNumber || order._id} - Rs. {Number(order.total || 0).toLocaleString("en-IN")} - {order.status}</p>)}</div></div>}
    </div>
  );
}
