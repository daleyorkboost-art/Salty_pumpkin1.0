import { Link, useParams } from "react-router-dom";
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
  const { add } = useCart();
  const wishlist = useWishlist();
  const [qty, setQty] = useState(1);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedAge, setSelectedAge] = useState("");
  const [activeImage, setActiveImage] = useState("");
  const { loading, data, error } = useAsync(() => Promise.all([catalogApi.product(slug), catalogApi.products()]), [slug]);
  const product = data?.[0]?.product;
  const allProducts = data?.[1]?.products || [];
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
    Array.from({ length: qty }).forEach(() => add(cartProduct));
    trackEvent("add_to_cart", productPayload(cartProduct, qty));
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
            <div className="rating-row">5.0 stars <span>(45 reviews)</span></div>
            <p className="price">
              {product.mrp > product.price && <span>Rs. {Number(product.mrp || 0).toLocaleString("en-IN")}</span>}
              Rs. {Number(selectedVariant?.priceOverride || product.price || 0).toLocaleString("en-IN")}
            </p>
            <p>{product.description || "Adorable fashion for tiny trendsetters. Soft, comfortable, and perfect for every occasion."}</p>
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
            <Link className="secondary-action wide" to="/checkout">Buy now</Link>
            <div className="mini-actions">
              <button type="button" className="link-button" onClick={() => wishlist.toggle(product)}>{wishlist.has(product._id) ? "Remove from Wishlist" : "Add to Wishlist"}</button>
              <span>Share</span>
            </div>
          </div>
        </div>
      </section>
      <TrustStrip />
      <section className="section product-tabs">
        <article><h2>Product Details</h2><ul><li>Fabric: Premium cotton blend</li><li>Soft, breathable finish</li><li>Perfect for casual and party wear</li></ul></article>
        <article><h2>Wash Care</h2><div className="wash-icons"><span>Machine wash cold</span><span>Do not bleach</span><span>Tumble dry low</span><span>Iron low</span></div></article>
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
