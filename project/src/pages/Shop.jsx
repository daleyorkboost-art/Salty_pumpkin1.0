import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ProductCard } from "../components/ProductCard";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { catalogApi } from "../services/api";

const CATEGORY_TREE = {
  Boys: ["T-Shirts", "Shirts", "Shorts", "Jeans", "Ethnic Wear", "Jackets", "Co-Ords"],
  Girls: ["Dresses", "Tops", "Skirts", "Shorts", "Ethnic Wear", "Jumpsuits", "Co-Ords"],
};
const AGE_GROUPS = ["18-24M", "2-3Y", "3-4Y", "4-5Y", "5-6Y", "6-7Y", "7-8Y", "8-9Y", "9-10Y", "10-11Y", "11-12Y", "12-13Y", "13-14Y", "14-15Y", "15-16Y"];
const NEW_ARRIVAL_CUTOFF = Date.now() - 120 * 24 * 60 * 60 * 1000;

export function Shop() {
  const location = useLocation();
  const params = useParams();
  const searchParams = new URLSearchParams(location.search);
  const queryCategory = searchParams.get("category");
  const querySearch = searchParams.get("search") || "";
  const routeCategory = normalizeRouteCategory(params.category);
  const initialCategory = queryCategory || routeCategory || "All";
  const [query, setQuery] = useState(querySearch);
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState("featured");
  const [priceRange, setPriceRange] = useState("All");
  const [ageGroup, setAgeGroup] = useState("All");
  const { loading, data, error } = useAsync(async () => {
    const [catalog, settings] = await Promise.all([
      catalogApi.products(),
      catalogApi.settings().catch(() => ({ settings: {} })),
    ]);
    return { products: catalog.products || [], settings: settings.settings || {} };
  }, []);
  const products = data?.products || [];
  const settings = data?.settings || {};
  const filters = settings.filters || {};
  const managedCategories = splitList(filters.categories);
  const categories = ["All", ...new Set([
    ...Object.keys(CATEGORY_TREE),
    ...(managedCategories.length ? managedCategories : products.flatMap((product) => [product.childCategory, product.category]).filter(Boolean)),
  ])];
  const ageValues = splitList(filters.ageGroups);
  const priceValues = splitList(filters.priceRanges);
  const shopByValues = splitList(filters.shopBy);
  useEffect(() => {
    setCategory(queryCategory || routeCategory || "All");
    setQuery(querySearch);
  }, [queryCategory, querySearch, routeCategory]);
  const filtered = products.filter((product) => {
    const normalizedCategory = normalizeCategoryKey(category);
    const isNewArrival =
      product.newArrival === true ||
      product.isNew === true ||
      (product.tags || []).some((tag) => /new\s*arrival/i.test(String(tag))) ||
      (product.createdAt && Date.parse(product.createdAt) >= NEW_ARRIVAL_CUTOFF);
    const matchesCategory =
      category === "All" ||
      (normalizedCategory === "new arrivals" && isNewArrival) ||
      [product.parentCategory, product.childCategory, product.category]
        .some((value) => normalizeCategoryKey(value) === normalizedCategory);
    const matchesQuery = !query || productSearchScore(product, query) > 0;
    const matchesPrice = priceRange === "All" || priceMatches(product.price, priceRange);
    const matchesAge = ageGroup === "All" || (product.ageGroups || []).includes(ageGroup) || (product.variants || []).some((variant) => variant.size === ageGroup || variant.ageGroup === ageGroup);
    return matchesCategory && matchesQuery && matchesPrice && matchesAge;
  }).sort((first, second) => query ? productSearchScore(second, query) - productSearchScore(first, query) : sortProducts(first, second, sort));
  const suggestions = query ? filtered.slice(0, 6).map((product) => product.name) : [];

  return (
    <section className="section page-section shop-shell">
      <div className="shop-head">
        <div>
          <p className="breadcrumb">Home / {category === "All" ? "Shop" : category}</p>
          <p className="eyebrow">Collection</p>
          <h1>{category === "All" ? "Shop kids clothing" : category}</h1>
        </div>
        <div className="toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, SKU, category" list="product-search-suggestions" />
          <datalist id="product-search-suggestions">{suggestions.map((item) => <option value={item} key={item} />)}</datalist>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products">
            <option value="featured">Sort by Featured</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
        </div>
      </div>
      {loading && <Loading label="Loading collection..." />}
      {error && <ErrorState message={error} />}
      <div className="shop-layout">
        <aside className="shop-filters">
          <h2>Filter By</h2>
          <FilterBlock title="Shop by" items={shopByValues.length ? shopByValues : ["All", "Boys", "Girls"]} active={category} onSelect={setCategory} />
          <FilterBlock title="Categories" items={categories.filter((item) => !["All", "Boys", "Girls"].includes(item))} active={category} onSelect={setCategory} />
          <FilterBlock title="Price" items={priceValues.length ? priceValues : ["All", "Rs. 0 - 999", "Rs. 1000 - 1999", "Rs. 2000+"]} active={priceRange} onSelect={setPriceRange} />
          <FilterBlock title="Age Group" items={["All", ...(ageValues.length ? ageValues : availableAgeGroups(products))]} active={ageGroup} onSelect={setAgeGroup} />
          <div className="color-dots"><span /><span /><span /><span /><span /><span /></div>
        </aside>
        <div>
          <div className="results-bar"><span>{filtered.length ? `Showing 1-${filtered.length} of ${filtered.length} results` : "Showing 0 results"}</span></div>
          <div className="product-grid reference-products">{filtered.map((product) => <ProductCard key={product._id} product={product} />)}</div>
          {!filtered.length && !loading && !error && <p className="empty-state">No published products match this collection yet.</p>}
        </div>
      </div>
    </section>
  );
}

function normalizeRouteCategory(value) {
  if (!value) return "";
  if (value === "boys-clothing" || value === "boys") return "Boys";
  if (value === "girls-clothing" || value === "girls") return "Girls";
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function normalizeCategoryKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/&/g, " and ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  if (["boys clothing", "boy clothing", "boys clothes", "boys"].includes(normalized)) return "boys";
  if (["girls clothing", "girl clothing", "girls clothes", "girls"].includes(normalized)) return "girls";
  return normalized;
}

function priceMatches(price, range) {
  const value = Number(price || 0);
  if (range === "Rs. 0 - 999") return value <= 999;
  if (range === "Rs. 1000 - 1999") return value >= 1000 && value <= 1999;
  if (range === "Rs. 2000+") return value >= 2000;
  return true;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function availableAgeGroups(products) {
  const values = products.flatMap((product) => [
    ...(product.ageGroups || []),
    ...(product.variants || []).map((variant) => variant.ageGroup || variant.size),
  ]).filter(Boolean);
  const ordered = AGE_GROUPS.filter((age) => values.includes(age));
  return ordered.length ? ordered : AGE_GROUPS;
}

function sortProducts(first, second, sort) {
  if (sort === "price-low") return Number(first.price || 0) - Number(second.price || 0);
  if (sort === "price-high") return Number(second.price || 0) - Number(first.price || 0);
  const featuredDelta = Number(second.featured === true || second.bestSeller === true) - Number(first.featured === true || first.bestSeller === true);
  if (featuredDelta) return featuredDelta;
  return String(second.createdAt || "").localeCompare(String(first.createdAt || ""));
}

function productSearchScore(product, query) {
  return Math.max(
    fuzzyScore(product.name, query),
    fuzzyScore(product.sku, query),
    fuzzyScore(product.productNumber, query),
    fuzzyScore(product.category, query),
    fuzzyScore(product.parentCategory, query),
    fuzzyScore(product.childCategory, query),
    ...(product.tags || []).map((tag) => fuzzyScore(tag, query)),
  );
}

function fuzzyScore(value, query) {
  const text = String(value || "").toLowerCase();
  const q = String(query || "").toLowerCase().trim();
  if (!q) return 0;
  if (text.includes(q)) return 100 - Math.min(40, text.indexOf(q));
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(q))) return 74;
  const distance = Math.min(...words.map((word) => levenshtein(word.slice(0, Math.max(word.length, q.length)), q)), 99);
  return distance <= Math.max(1, Math.floor(q.length / 4)) ? 60 - distance : 0;
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let last = i - 1;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = old;
    }
  }
  return previous[b.length] || 0;
}

function FilterBlock({ title, items, active, onSelect = () => {} }) {
  return (
    <div className="filter-block">
      <h3>{title}</h3>
      {items.map((item) => (
        <button type="button" className={active === item ? "active" : ""} key={item} onClick={() => onSelect(item)}>{item}</button>
      ))}
    </div>
  );
}
