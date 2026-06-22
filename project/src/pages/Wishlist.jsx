import { ProductCard } from "../components/ProductCard";
import { ErrorState, Loading } from "../components/Status";
import { useWishlist } from "../context/WishlistContext";
import { useAsync } from "../hooks/useAsync";
import { catalogApi } from "../services/api";

export function Wishlist() {
  const { ids } = useWishlist();
  const { loading, data, error } = useAsync(() => catalogApi.products(), []);
  const products = (data?.products || []).filter((product) => ids.includes(product._id));
  return (
    <section className="section page-section">
      <p className="eyebrow">Saved items</p>
      <h1>Wishlist</h1>
      {loading && <Loading label="Loading wishlist..." />}
      {error && <ErrorState message={error} />}
      {!loading && !products.length && <p className="muted">Your wishlist is empty.</p>}
      <div className="product-grid reference-products">{products.map((product) => <ProductCard key={product._id} product={product} />)}</div>
    </section>
  );
}
