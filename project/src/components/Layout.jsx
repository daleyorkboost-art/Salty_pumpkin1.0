import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { trackEvent } from "../services/tracking";
import { useWishlist } from "../context/WishlistContext";
import { useAsync } from "../hooks/useAsync";
import { catalogApi } from "../services/api";

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const { count } = useCart();
  const wishlist = useWishlist();
  const { data } = useAsync(() => catalogApi.settings().catch(() => ({ settings: {} })), []);
  const settings = data?.settings || {};
  const logoUrl = settings.store?.logoUrl || "/salty-pumpkin-logo.svg";
  const content = settings.content || {};
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!logoUrl) return;
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = logoUrl;
  }, [logoUrl]);
  const navigate = useNavigate();

  async function signOut() {
    try {
      await logout();
    } finally {
      navigate("/");
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/shop?search=${encodeURIComponent(query)}` : "/shop");
  }

  return (
    <div className="app-shell">
      <div className="announcement-bar">{content.announcement || "Free Shipping on Orders Above Rs. 999"}</div>
      <header className="site-header">
        <div className="header-utility">
          <form className="header-search" onSubmit={submitSearch}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search products" />
          </form>
          <NavLink to="/wishlist">Wishlist ({wishlist.count})</NavLink>
          <NavLink to="/cart">Cart ({count})</NavLink>
          {user ? (
            <>
              <NavLink className="account-link" to="/account">
                {user.photoURL && <img src={user.photoURL} alt="" />}Account
              </NavLink>
              <button className="link-button" onClick={signOut}>Logout</button>
            </>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>
              <NavLink to="/login?mode=register">Register</NavLink>
            </>
          )}
        </div>
        <Link className="brand" to="/">{logoUrl ? <img src={logoUrl} alt="Salty Pumpkin" /> : "Salty Pumpkin"}</Link>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/shop">Shop</NavLink>
          <NavLink to="/product-category/boys-clothing">Boys</NavLink>
          <NavLink to="/product-category/girls-clothing">Girls</NavLink>
          <NavLink to="/shop?category=New%20Arrivals">New Arrivals</NavLink>
          <NavLink to="/about">About Us</NavLink>
          <NavLink to="/contact">Contact Us</NavLink>
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div>
          <Link className="footer-brand" to="/">{logoUrl ? <img src={logoUrl} alt="Salty Pumpkin" /> : <strong>Salty Pumpkin</strong>}</Link>
          <p>Get updates on new arrivals and offers.</p>
          <div className="newsletter-row"><input placeholder="Enter your email" /><button onClick={() => trackEvent("lead", { source: "footer_newsletter" })}>Subscribe</button></div>
        </div>
        <div className="footer-links">
          <h3>Shop</h3>
          <Link to="/shop">All Products</Link>
          <Link to="/product-category/boys-clothing">Boys</Link>
          <Link to="/product-category/girls-clothing">Girls</Link>
          <Link to="/shop?category=New%20Arrivals">New Arrivals</Link>
        </div>
        <div className="footer-links">
          <h3>Quick Links</h3>
          <Link to="/about">About Us</Link>
          <Link to="/contact">Contact Us</Link>
          <Link to="/privacy-policy">Privacy Policy</Link>
          <Link to="/terms-and-conditions">Terms & Conditions</Link>
        </div>
        <div className="footer-links">
          <h3>Customer Support</h3>
          <Link to="/order-tracking">Order Tracking</Link>
          <Link to="/support">24x7 Support</Link>
          <Link to="/shipping-policy">Shipping</Link>
          <Link to="/returns-policy">Returns & Refunds</Link>
          <div className="social-row">
            {content.contactInstagram && <a href={content.contactInstagram} target="_blank" rel="noreferrer">Instagram</a>}
            {content.contactFacebook && <a href={content.contactFacebook} target="_blank" rel="noreferrer">Facebook</a>}
            {content.contactWhatsapp && <a href={`https://wa.me/${String(content.contactWhatsapp).replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
