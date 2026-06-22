import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { catalogApi } from "../services/api";

export function AdminLayout() {
  const location = useLocation();
  const { data } = useAsync(() => catalogApi.settings().catch(() => ({ settings: {} })), []);
  const logoUrl = data?.settings?.store?.logoUrl || "/salty-pumpkin-logo.svg";
  const titleMap = [
    ["products", "Products"],
    ["orders", "Orders"],
    ["customers", "Customers"],
    ["transactions", "Transactions"],
    ["refunds", "Refunds"],
    ["settings", "Settings"],
  ];
  const title = titleMap.find(([path]) => location.pathname.includes(path))?.[1] || "Dashboard";

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>{logoUrl ? <img src={logoUrl} alt="" /> : "SP"}</span>
          <div>
            <h1>Salty Pumpkin</h1>
            <p>Store admin</p>
          </div>
        </div>
        <nav className="admin-nav" aria-label="Admin navigation">
          <NavLink end to="/admin"><span>OV</span>Dashboard</NavLink>
          <NavLink to="/admin/products"><span>PR</span>Products</NavLink>
          <NavLink to="/admin/orders"><span>OR</span>Orders</NavLink>
          <NavLink to="/admin/customers"><span>CU</span>Customers</NavLink>
          <NavLink to="/admin/transactions"><span>TX</span>Transactions</NavLink>
          <NavLink to="/admin/refunds"><span>RF</span>Refunds</NavLink>
          <NavLink to="/admin/settings"><span>ST</span>Settings</NavLink>
        </nav>
        <div className="admin-sidebar-card">
          <strong>Catalog scale ready</strong>
          <p>Bulk import, edit, publish, and manage hundreds of products from one panel.</p>
        </div>
      </aside>
      <div className="admin-content">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Admin panel</p>
            <h2>{title}</h2>
          </div>
          <div className="admin-top-actions">
            <a className="secondary-action" href="/" target="_blank" rel="noreferrer">View store</a>
            <span className="admin-avatar">A</span>
          </div>
        </header>
        <Outlet />
      </div>
    </section>
  );
}
