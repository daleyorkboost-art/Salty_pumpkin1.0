import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useCart } from "../context/CartContext";
import { useAsync } from "../hooks/useAsync";
import { catalogApi } from "../services/api";
import { productPayload, trackEvent } from "../services/tracking";
import { useWishlist } from "../context/WishlistContext";

const fallbackImage = "/uploads/103_Pink-103.jpg";

export function ProductDetail() {
  const { slug } = useParams();
  const { add, setBuyNow } = useCart();
  const navigate = useNavigate();
  const wishlist = useWishlist();
  const [qty, setQty] = useState(1);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedAge, setSelectedAge] = useState("");
  const [activeImage, setActiveImage] = useState("");
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: "", media: [] });
  const [reviewMessage, setReviewMessage] = useState("");
  const { loading, data, error } = useAsync(() => Promise.all([
    catalogApi.product(slug),
    catalogApi.products(),
    catalogApi.settings().catch(() => ({ settings: {} })),
  ]), [slug]);
  const reviewsState = useAsync(() => catalogApi.reviews(slug), [slug, reviewMessage]);
  const product = data?.[0]?.product;
  const allProducts = data?.[1]?.products || [];
  const settings = data?.[2]?.settings || {};
  const sizeCharts = settings.sizeCharts?.items || [];
  const productSizeChart = sizeCharts.find((chart) => chart.id === product?.sizeChartId) || sizeCharts[0];
  const colors = useMemo(() => uniqueValues([...(product?.colors || []), ...(product?.variants || []).map((variant) => variant.color || variant.colour)]), [product]);
  const ageGroups = useMemo(() => uniqueValues([...(product?.ageGroups || []), ...(product?.variants || []).map((variant) => variant.ageGroup || variant.size)]), [product]);
  const gallery = useMemo(() => {
    if (!product) return [fallbackImage];
    const colorGallery = selectedColor ? product.colorImages?.[selectedColor] : null;
    const images = colorGallery?.length ? colorGallery : product.images;
    return images?.length ? images : [fallbackImage];
  }, [product, selectedColor]);
  const selectedVariant = (product?.variants || []).find((variant) => {
    const colorOk = !selectedColor || (variant.color || variant.colour) === selectedColor;
    const ageOk = !selectedAge || (variant.ageGroup || variant.size) === selectedAge;
    return colorOk && ageOk;
  });
  const stock = Number(selectedVariant?.stock ?? product?.stock ?? 0);
  const related = allProducts
    .filter((item) => item._id !== product?._id && (item.parentCategory === product?.parentCategory || item.category === product?.category))
    .slice(0, 4);

  useEffect(() => {
    if (!product) return;
    setSelectedColor((current) => current || colors[0] || "");
    setSelectedAge((current) => current || ageGroups[0] || "");
  }, [product, colors, ageGroups]);

  useEffect(() => {
    setActiveImage(gallery[0] || fallbackImage);
  }, [gallery]);

  useEffect(() => {
    if (!product) return;
    const key = "salty_recent_products";
    const current = JSON.parse(localStorage.getItem(key) || "[]").filter((item) => item.slug !== product.slug);
    localStorage.setItem(key, JSON.stringify([{ slug: product.slug, name: product.name, image: gallery[0], price: product.price }, ...current].slice(0, 8)));
    trackEvent("view_item", productPayload(product, 1));
  }, [product, gallery]);

  if (loading) return <Loading label="Loading product..." />;
  if (error) return <ErrorState message={error} action={<Link to="/shop">Back to shop</Link>} />;
  if (!product) return <ErrorState message="Product not found" action={<Link to="/shop">Back to shop</Link>} />;

  function addSelectedToCart() {
    const cartProduct = selectedCartProduct();
    Array.from({ length: qty }).forEach(() => add(cartProduct));
    trackEvent("add_to_cart", productPayload(cartProduct, qty));
  }

  function selectedCartProduct() {
    const cartProduct = {
      ...product,
      price: Number(selectedVariant?.priceOverride || product.price || 0),
      images: gallery,
      size: selectedAge,
      ageGroup: selectedAge,
      colour: selectedColor,
      color: selectedColor,
      variantSku: selectedVariant?.sku || "",
    };
    return cartProduct;
  }

  function buyNow() {
    const cartProduct = selectedCartProduct();
    setBuyNow(cartProduct, qty);
    trackEvent("begin_checkout", productPayload(cartProduct, qty));
    navigate("/checkout?mode=buy-now");
  }

  async function submitReview(event) {
    event.preventDefault();
    setReviewMessage("");
    const body = new FormData();
    body.append("rating", reviewForm.rating);
    body.append("text", reviewForm.text);
    Array.from(reviewForm.media || []).forEach((file) => body.append("media", file));
    await catalogApi.createReview(slug, body);
    setReviewForm({ rating: 5, text: "", media: [] });
    setReviewMessage("Review submitted. It will appear after admin approval.");
  }

  return (
    <>
      <section className="section product-detail-page">
        <p className="breadcrumb">Home / Shop / {product.name}</p>
        <div className="detail-layout">
          <div className="gallery-block">
            <div className="zoom-frame">
              <img className="detail-image" src={activeImage || gallery[0]} alt={product.name} />
            </div>
            <div className="thumb-row">
              {gallery.slice(0, 6).map((item, index) => (
                <button className={activeImage === item ? "active" : ""} type="button" key={`${item}-${index}`} onClick={() => setActiveImage(item)}>
                  <img src={item || fallbackImage} alt="" />
                </button>
              ))}
            </div>
          </div>
          <div className="detail-copy">
            <h1>{product.name}</h1>
            <div className="rating-row">{Number(reviewsState.data?.average || 5).toFixed(1)} stars <span>({reviewsState.data?.total || 0} reviews)</span></div>
            <p className="price">
              {product.mrp > product.price && <span>Rs. {Number(product.mrp || 0).toLocaleString("en-IN")}</span>}
              Rs. {Number(selectedVariant?.priceOverride || product.price || 0).toLocaleString("en-IN")}
            </p>
            {product.description && <p>{product.description}</p>}
            {colors.length > 0 && <OptionButtons title="Color" items={colors} active={selectedColor} onSelect={setSelectedColor} />}
            {ageGroups.length > 0 && <OptionButtons title="Age Group" items={ageGroups} active={selectedAge} onSelect={setSelectedAge} />}
            <p className={stock > 0 ? "stock-ok" : "stock-missing"}>{stock > 0 ? `${stock} in stock` : "Out of stock"}</p>
            <div className="qty-row">
              <span>Quantity</span>
              <button type="button" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
              <strong>{qty}</strong>
              <button type="button" onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <button className="primary-action wide" disabled={stock <= 0} onClick={addSelectedToCart}>Add to cart</button>
            <button className="secondary-action wide" type="button" disabled={stock <= 0} onClick={buyNow}>Buy now</button>
            <div className="mini-actions">
              <button type="button" className="link-button" onClick={() => wishlist.toggle(product)}>{wishlist.has(product._id) ? "Remove from Wishlist" : "Add to Wishlist"}</button>
              <span>Share</span>
            </div>
          </div>
        </div>
      </section>
      <TrustStrip />
      <section className="section product-tabs">
        {product.description && <article><h2>Product Details</h2><p>{product.description}</p></article>}
        {productSizeChart && <article><h2>Size Chart</h2><div className="size-chart-lines">{String(productSizeChart.sizes || "").split(/\n+/).filter(Boolean).map((line) => <span key={line}>{line}</span>)}</div></article>}
        <article><h2>Wash Care</h2><div className="wash-icons"><span>Machine wash cold</span><span>Do not bleach</span><span>Tumble dry low</span><span>Iron low</span></div></article>
      </section>
      <section className="section product-reviews">
        <div className="reference-title"><span /><h2>Customer Reviews</h2><span /></div>
        <div className="reviews-grid">
          <form className="form-card" onSubmit={submitReview}>
            {reviewMessage && <div className="form-success">{reviewMessage}</div>}
            <label>Rating
              <select value={reviewForm.rating} onChange={(event) => setReviewForm({ ...reviewForm, rating: event.target.value })}>
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
              </select>
            </label>
            <label>Review<textarea required minLength={3} value={reviewForm.text} onChange={(event) => setReviewForm({ ...reviewForm, text: event.target.value })} placeholder="Share fit, fabric, sizing, or delivery feedback" /></label>
            <label>Images or short videos<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple onChange={(event) => setReviewForm({ ...reviewForm, media: event.target.files })} /></label>
            <button>Submit review</button>
          </form>
          <div className="review-list">
            {(reviewsState.data?.reviews || []).map((review) => (
              <article className="review-card" key={review.id}>
                <strong>{review.customerName}</strong>
                <span>{review.rating} stars</span>
                <p>{review.text}</p>
                {!!review.media?.length && <div className="review-media">{review.media.map((item) => item.type === "video" ? <video key={item.url} src={item.url} controls /> : <img key={item.url} src={item.url} alt="" />)}</div>}
              </article>
            ))}
            {!reviewsState.loading && !(reviewsState.data?.reviews || []).length && <p className="empty-state">No reviews yet.</p>}
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="section">
          <div className="reference-title"><span /><h2>Related Products</h2><span /></div>
          <div className="product-grid reference-products">{related.map((item) => <RelatedCard key={item._id} product={item} />)}</div>
        </section>
      )}
    </>
  );
}

function OptionButtons({ title, items, active, onSelect }) {
  return <div className="option-group"><span>{title}</span><div className="size-buttons">{items.map((item) => <button className={active === item ? "active" : ""} type="button" key={item} onClick={() => onSelect(item)}>{item}</button>)}</div></div>;
}

function RelatedCard({ product }) {
  return (
    <Link className="product-card" to={`/shop/${product.slug}`}>
      <span className="product-image"><img loading="lazy" src={product.images?.[0] || fallbackImage} alt={product.name} /></span>
      <span className="product-copy"><h3>{product.name}</h3><p className="price">Rs. {Number(product.price || 0).toLocaleString("en-IN")}</p></span>
    </Link>
  );
}

function TrustStrip() {
  return (
    <section className="trust-strip">
      {[
        ["Premium Quality", "Fine fabrics for your little ones"],
        ["Fast Delivery", "Quick delivery at your doorstep"],
        ["Easy Returns", "Hassle-free returns within 7 days"],
        ["Secure Payment", "100% secure payment options"],
      ].map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
    </section>
  );
}

function uniqueValues(values) {
  return [...new Set(values.map(String).map((item) => item.trim()).filter(Boolean))];
}
