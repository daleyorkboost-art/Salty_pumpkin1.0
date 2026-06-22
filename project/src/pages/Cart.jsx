import { Link } from "react-router-dom";
import { EmptyState } from "../components/Status";
import { useCart } from "../context/CartContext";

export function Cart() {
  const { items, total, remove, updateQty } = useCart();

  if (!items.length) {
    return <EmptyState title="Your cart is empty"><Link className="primary-action" to="/shop">Start shopping</Link></EmptyState>;
  }

  return (
    <section className="section page-section cart-page">
      <p className="breadcrumb">Home / Cart</p>
      <h1>Your Cart</h1>
      <div className="cart-layout">
        <div className="cart-table">
          <div className="cart-head"><span>Product</span><span>Price</span><span>Quantity</span><span>Subtotal</span></div>
          {items.map((item) => (
            <div className="cart-row" key={item.cartKey || item._id}>
              <button className="remove-x" onClick={() => remove(item.cartKey || item._id)}>×</button>
              <img src={item.images?.[0]} alt={item.name} />
              <strong>{item.name}<small>{[item.size, item.colour || item.color].filter(Boolean).join(" / ")}</small></strong>
              <span>Rs. {Number(item.price).toLocaleString("en-IN")}</span>
              <input type="number" min="1" value={item.qty} onChange={(event) => updateQty(item.cartKey || item._id, event.target.value)} />
              <strong>Rs. {(item.price * item.qty).toLocaleString("en-IN")}</strong>
            </div>
          ))}
          <div className="cart-buttons">
            <Link className="secondary-action" to="/shop">Continue Shopping</Link>
            <button className="secondary-action">Update Cart</button>
          </div>
        </div>
        <aside className="cart-summary">
          <h2>Cart Totals</h2>
          <p><span>Subtotal</span><strong>Rs. {total.toLocaleString("en-IN")}</strong></p>
          <p><span>Shipping</span><strong>Free</strong></p>
          <label>Coupon<input placeholder="WELCOME10" /></label>
          <p className="grand-total"><span>Total</span><strong>Rs. {total.toLocaleString("en-IN")}</strong></p>
          <Link className="primary-action wide" to="/checkout">Proceed to Checkout</Link>
        </aside>
      </div>
    </section>
  );
}
