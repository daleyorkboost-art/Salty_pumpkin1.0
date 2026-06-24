import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { authApi, orderApi } from "../services/api";
import { AddressFields } from "../components/AddressFields";
import { syncCurrentFirebaseCustomerData } from "../services/firebaseAuth";
import { useWishlist } from "../context/WishlistContext";
import { useNavigate } from "react-router-dom";

export function Account() {
  const { user, updateUser, updateProfile, logout } = useAuth();
  const wishlist = useWishlist();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ name: user.name || "", phone: user.phone || "" });
  const emptyAddress = { name: "", phone: "", line1: "", city: "", district: "", state: "", pincode: "", country: "India", label: "", isDefault: false };
  const [address, setAddress] = useState(emptyAddress);
  const [editingId, setEditingId] = useState("");
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const { loading, data, error } = useAsync(() => orderApi.mine(), []);
  const orders = useMemo(() => data?.orders || [], [data]);

  useEffect(() => {
    if (!loading) syncCurrentFirebaseCustomerData(user, orders);
  }, [loading, orders, user]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await updateProfile(profile);
      setMessage("Profile updated.");
    } finally {
      setSaving(false);
    }
  }

  async function addAddress(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const data = editingId ? await authApi.updateAddress(editingId, address) : await authApi.addAddress(address);
      updateUser(data.user);
      await syncCurrentFirebaseCustomerData(data.user, orders);
      setAddress(emptyAddress);
      setEditingId("");
      setAddressFormOpen(false);
      setMessage(editingId ? "Address updated." : "Address saved.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAddress(id) {
    setSaving(true);
    setMessage("");
    try {
      const data = await authApi.deleteAddress(id);
      updateUser(data.user);
      await syncCurrentFirebaseCustomerData(data.user, orders);
      setMessage("Address removed.");
    } finally {
      setSaving(false);
    }
  }

  async function setDefaultAddress(id) {
    setSaving(true);
    setMessage("");
    try {
      const data = await authApi.setDefaultAddress(id);
      updateUser(data.user);
      await syncCurrentFirebaseCustomerData(data.user, orders);
      setMessage("Default address updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section page-section account-dashboard">
      <div className="account-dashboard-head">
        <div><p className="eyebrow">Customer dashboard</p><h1>Welcome, {user.name || user.email || user.phone}</h1></div>
        <button className="secondary-action" onClick={async () => { await logout(); navigate("/"); }}>Logout</button>
      </div>
      <nav className="account-dashboard-nav" aria-label="Account sections">
        <a href="#profile">Profile Information</a>
        <a href="#addresses">Saved Addresses</a>
        <Link to="/wishlist">Wishlist ({wishlist.count})</Link>
        <a href="#orders">Order History</a>
      </nav>
      <div className="account-summary-grid">
        <article><span>Profile</span><strong>{user.name ? "Complete" : "Needs details"}</strong></article>
        <article><span>Saved Addresses</span><strong>{(user.addresses || []).length}</strong></article>
        <article><span>Wishlist</span><strong>{wishlist.count}</strong><Link to="/wishlist">View items</Link></article>
        <article><span>Orders</span><strong>{loading ? "..." : orders.length}</strong></article>
      </div>
      <div className="dashboard-grid">
      <aside className="profile-panel" id="profile">
        <p className="eyebrow">Account</p>
        <h1>{user.name || user.email || user.phone}</h1>
        <p>{user.email || user.phone}</p>
        <span className="role-badge">{user.role}</span>
        {message && <p className="success-text">{message}</p>}
        <form className="stack" onSubmit={saveProfile}>
          <label>Name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
          <label>Phone<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
          <button disabled={saving}>{saving ? "Saving..." : "Save profile"}</button>
        </form>
      </aside>
      <div className="panel">
        <h2 id="orders">Order History</h2>
        {loading && <div className="dashboard-skeleton" aria-label="Loading order history"><span /><span /><span /></div>}
        {error && <ErrorState message={error} />}
        {!loading && !orders.length && <p className="muted">No orders yet.</p>}
        <div className="stack">
          {orders.map((order) => (
            <Link className="order-row" to={`/account/orders/${order._id}`} key={order._id}>
              <span>{order.orderNumber || order._id}<br /><small>{order.trackingNumber ? `Tracking: ${order.trackingNumber}` : "Shipment pending"}</small></span>
              <span>{order.shipmentStatus || order.status}</span>
              <strong>Rs. {Number(order.total || 0).toLocaleString("en-IN")}</strong>
            </Link>
          ))}
        </div>
        <h2 id="addresses">Saved Addresses</h2>
        <button type="button" className="secondary-action" onClick={() => { setEditingId(""); setAddress(emptyAddress); setAddressFormOpen(true); }}>Add Address</button>
        <div className="stack">
          {(user.addresses || []).map((item) => (
            <div className={`order-row address-row ${item.isDefault ? "default-address" : ""}`} key={item.id}>
              <span><strong>{item.label || "Saved address"}</strong><br />{[item.line1, item.city, item.state, item.pincode].filter(Boolean).join(", ")}<br /><small>{item.name} {item.phone ? `- ${item.phone}` : ""}</small></span>
              <span>{item.pincode}{item.isDefault ? " - Default" : ""}</span>
              <button type="button" onClick={() => { setEditingId(item.id); setAddress(item); setAddressFormOpen(true); }}>Edit</button>
              {!item.isDefault && <button type="button" onClick={() => setDefaultAddress(item.id)} disabled={saving}>Set default</button>}
              <button type="button" onClick={() => deleteAddress(item.id)} disabled={saving}>Remove</button>
            </div>
          ))}
          {!(user.addresses || []).length && <p className="empty-state">No saved addresses yet.</p>}
        </div>
        {addressFormOpen && <form className="form-card" onSubmit={addAddress}>
          <h2>{editingId ? "Edit address" : "Add address"}</h2>
          <label>Address label<input value={address.label || ""} onChange={(event) => setAddress({ ...address, label: event.target.value })} placeholder="Home, Work, Grandparents" /></label>
          <AddressFields value={address} onChange={setAddress} />
          <label className="check-row"><input type="checkbox" checked={Boolean(address.isDefault)} onChange={(event) => setAddress({ ...address, isDefault: event.target.checked })} />Set as default address</label>
          <button disabled={saving}>{saving ? "Saving..." : editingId ? "Update address" : "Save address"}</button>
          <button className="secondary-action" type="button" onClick={() => { setEditingId(""); setAddress(emptyAddress); setAddressFormOpen(false); }}>Cancel</button>
        </form>}
      </div>
      </div>
    </section>
  );
}
