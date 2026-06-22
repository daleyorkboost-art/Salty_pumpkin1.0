import { Link, useLocation } from "react-router-dom";

export function PaymentFailed() {
  const location = useLocation();
  const cancelled = location.state?.status === "cancelled";
  return (
    <section className="section page-section narrow">
      <p className="eyebrow">{cancelled ? "Payment cancelled" : "Payment failed"}</p>
      <h1>{cancelled ? "Your payment was cancelled" : "We could not complete the payment"}</h1>
      <div className="summary-box">
        <p>{location.state?.message || "Your payment was cancelled or declined. No successful payment was captured."}</p>
        <div className="hero-actions">
          <Link className="primary-action" to="/checkout">Try payment again</Link>
          <Link className="secondary-action" to="/cart">Back to cart</Link>
        </div>
      </div>
    </section>
  );
}
