import { Link } from "react-router-dom";
import { ProductCard } from "../components/ProductCard";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { catalogApi } from "../services/api";

const categories = [
  ["Boys' Clothing", "Shirts, co-ords, denim and easy outfits", "/uploads/1_1.jpg"],
  ["Girls' Clothing", "Dresses, playful sets and pretty layers", "/uploads/103_Pink-103.jpg"],
  ["Dresses", "Soft party frocks and everyday favourites", "/uploads/133_133.jpg"],
  ["Jackets", "Lightweight winter layers for little explorers", "/uploads/136_136.jpg"],
];

const promises = [
  ["Premium Quality", "Fine fabrics for your little ones"],
  ["Fast Delivery", "Quick delivery at your doorstep"],
  ["Easy Returns", "Hassle-free returns within 7 days"],
  ["Secure Payment", "100% secure payment options"],
];

export function Home() {
  const { loading, data, error } = useAsync(async () => {
    const [catalog, settings] = await Promise.all([
      catalogApi.products(),
      catalogApi.settings().catch(() => ({ settings: {} })),
    ]);
    return { catalog, settings: settings.settings || {} };
  });
  const products = data?.catalog?.products || [];
  const content = data?.settings?.content || {};
  const activeCoupon = (data?.settings?.coupons?.items || []).find((coupon) => coupon.active !== false);
  const banner = (content.banners || []).find((item) => item.enabled !== false);
  const dynamicCategories = (data?.settings?.categories?.items || [])
    .filter((item) => item.active !== false)
    .map((item) => [item.title, `Shop ${item.title}`, item.image, item.param || item.title]);
  const categoryTiles = dynamicCategories.length ? dynamicCategories : categories.map((item) => [...item, item[0]]);
  const featured = products.slice(0, 8);

  return (
    <>
      <section className="store-hero">
        <div className="store-hero-copy">
          <h1>{banner?.title || content.heroTitle || "Comfortable Style For Every Adventure"}</h1>
          <p>{banner?.subtitle || content.heroSubtitle || "Trendy Outfits For Your Little Ones"}</p>
          <div className="hero-actions">
            <Link className="primary-action" to="/product-category/girls-clothing">Shop Girls</Link>
            <Link className="secondary-action dark" to="/product-category/boys-clothing">Shop Boys</Link>
          </div>
        </div>
        <div className="store-hero-media" style={banner?.image ? { backgroundImage: `linear-gradient(90deg, rgba(254,232,220,0.4), rgba(254,232,220,0)), url("${banner.image}")` } : undefined} aria-hidden="true" />
      </section>

      <section className="section">
        <div className="reference-title">
          <span />
          <h2>Shop by Category</h2>
          <span />
        </div>
        <div className="category-grid">
          {categoryTiles.map(([title, text, image, param]) => (
            <Link className="category-tile" to={`/shop?category=${encodeURIComponent(param || title)}`} key={title}>
              <img src={image} alt="" loading="lazy" />
              <span>{title}</span>
              <p>{text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="reference-title">
          <h2>Trending This Week</h2>
        </div>
        {loading && <Loading label="Loading products..." />}
        {error && <ErrorState message={error} />}
        <div className="product-grid reference-products">{featured.slice(0, 4).map((product) => <ProductCard key={product._id} product={product} />)}</div>
      </section>

      <section className="benefit-band">
        {promises.map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
      </section>

      <section className="offer-banner">
        <div>
          <p>Limited time offer</p>
          <h2>{activeCoupon ? `Use ${activeCoupon.code} at checkout` : "Flat 20% Off on First Order"}</h2>
        </div>
        <Link className="primary-action" to="/shop">Shop Now</Link>
      </section>
    </>
  );
}
