import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";

const AGE_GROUPS = ["18-24M", "2-3Y", "3-4Y", "4-5Y", "5-6Y", "6-7Y", "7-8Y", "8-9Y", "9-10Y", "10-11Y", "11-12Y", "12-13Y", "13-14Y", "14-15Y", "15-16Y"];
const CATEGORY_TREE = {
  Boys: ["T-Shirts", "Shirts", "Shorts", "Jeans", "Ethnic Wear", "Jackets", "Co-Ords"],
  Girls: ["Dresses", "Tops", "Skirts", "Shorts", "Ethnic Wear", "Jumpsuits", "Co-Ords"],
};

const blank = {
  name: "",
  slug: "",
  productNumber: "",
  sku: "",
  parentCategory: "Girls",
  childCategory: "Dresses",
  category: "Dresses",
  description: "",
  price: "",
  mrp: "",
  stock: "",
  colors: "",
  images: "",
  imageCodes: "",
  modelImageCode: "",
  colorImages: "",
  tags: "",
  ageGroups: "",
  seoTitle: "",
  metaDescription: "",
  weight: "",
  length: "",
  width: "",
  height: "",
  isPublished: true,
  featured: false,
  newArrival: false,
  bestSeller: false,
  variants: [{ size: "", colour: "", stock: "", sku: "" }],
};

export function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { loading, data, error } = useAsync(() => adminApi.products(), []);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isEdit || !data?.products) return;
    const product = data.products.find((item) => item._id === id || item.id === id);
    if (!product) return;
    setForm({
      ...blank,
      ...product,
      price: product.price ?? "",
      mrp: product.mrp ?? "",
      stock: product.stock ?? "",
      images: (product.images || []).join(", "),
      imageCodes: (product.imageCodes || []).join(", "),
      modelImageCode: product.modelImageCode || "",
      colors: (product.colors || []).join(", "),
      colorImages: product.colorImages ? JSON.stringify(product.colorImages, null, 2) : "",
      tags: (product.tags || []).join(", "),
      ageGroups: (product.ageGroups || []).join(", "),
      seoTitle: product.seoTitle || product.name || "",
      metaDescription: product.metaDescription || "",
      weight: product.shipping?.weight || product.weight || "",
      length: product.shipping?.length || "",
      width: product.shipping?.width || "",
      height: product.shipping?.height || "",
      variants: product.variants?.length ? product.variants : blank.variants,
    });
  }, [data, id, isEdit]);

  function update(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "parentCategory") {
        next.childCategory = CATEGORY_TREE[value]?.[0] || "";
        next.category = next.childCategory;
      }
      if (key === "childCategory") next.category = value;
      return next;
    });
    if (key === "name" && !isEdit) {
      setForm((current) => ({
        ...current,
        name: value,
        slug: value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      }));
    }
  }

  function updateVariant(index, key, value) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, itemIndex) =>
        itemIndex === index ? { ...variant, [key]: value } : variant
      ),
    }));
  }

  function addVariant() {
    setForm((current) => ({
      ...current,
      variants: [...current.variants, { size: "", colour: "", stock: "", sku: "" }],
    }));
  }

  function generateAgeVariants() {
    setForm((current) => {
      const colors = splitList(current.colors || current.variants.map((variant) => variant.colour).filter(Boolean).join(","));
      const palette = colors.length ? colors : ["Default"];
      const variants = palette.flatMap((colour) =>
        AGE_GROUPS.map((ageGroup) => ({
          ageGroup,
          size: ageGroup,
          colour,
          color: colour,
          stock: current.stock || "",
          sku: `${current.sku || "SKU"}_${ageGroup}`,
        }))
      );
      return { ...current, ageGroups: AGE_GROUPS.join(", "), colors: palette.join(", "), variants };
    });
  }

  function removeVariant(index) {
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const payload = normalize(form);
    try {
      if (isEdit) await adminApi.updateProduct(id, payload);
      else await adminApi.createProduct(payload);
      setMessage("Product saved and visible wherever it is published.");
      navigate("/admin/products");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadImages(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("images", file));
      const result = await adminApi.uploadProductImages(formData);
      const current = splitList(form.images);
      update("images", [...current, ...(result.images || [])].join(", "));
      setMessage(`${result.images?.length || 0} image(s) uploaded.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  if (loading) return <Loading label="Loading product form..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <form className="product-editor" onSubmit={submit}>
      <div className="editor-topbar">
        <Link className="secondary-action" to="/admin/products">Back to products</Link>
        <h1>{isEdit ? "Edit Product" : "Add New Product"}</h1>
        <button disabled={saving}>{saving ? "Saving..." : "Save Product"}</button>
      </div>
      {message && <p className="success-text">{message}</p>}

      <div className="editor-grid">
        <div className="editor-main">
          <EditorSection title="Basic Information">
            <Field label="Product name" value={form.name} onChange={(value) => update("name", value)} required />
            <Field label="URL slug" value={form.slug} onChange={(value) => update("slug", value)} />
            <Field label="Description" type="textarea" value={form.description} onChange={(value) => update("description", value)} />
          </EditorSection>

          <EditorSection title="Category, Age & Tags">
            <div className="field-grid">
              <SelectField label="Parent category" value={form.parentCategory} onChange={(value) => update("parentCategory", value)} options={Object.keys(CATEGORY_TREE)} />
              <SelectField label="Child category" value={form.childCategory} onChange={(value) => update("childCategory", value)} options={CATEGORY_TREE[form.parentCategory] || []} />
              <Field label="Age groups" value={form.ageGroups} onChange={(value) => update("ageGroups", value)} placeholder="18-24M, 2-3Y" />
              <Field label="Colors" value={form.colors} onChange={(value) => update("colors", value)} placeholder="White & Blue, Pink, Red" />
              <Field label="Tags" value={form.tags} onChange={(value) => update("tags", value)} placeholder="premium, festive" />
            </div>
          </EditorSection>

          <EditorSection title="Variants">
            <div className="admin-summary">
              <strong>{form.variants.length}</strong><span>variant rows</span>
              <button className="secondary-action" type="button" onClick={generateAgeVariants}>Generate all age variants</button>
            </div>
            <div className="variant-stack">
              {form.variants.map((variant, index) => (
                <div className="variant-row" key={`${index}-${variant.sku}`}>
                  <input placeholder="Size" value={variant.size} onChange={(event) => updateVariant(index, "size", event.target.value)} />
                  <input placeholder="Colour" value={variant.colour} onChange={(event) => updateVariant(index, "colour", event.target.value)} />
                  <input placeholder="Stock" type="number" value={variant.stock} onChange={(event) => updateVariant(index, "stock", event.target.value)} />
                  <input placeholder="Variant SKU" value={variant.sku} onChange={(event) => updateVariant(index, "sku", event.target.value)} />
                  <button className="secondary-action danger" type="button" onClick={() => removeVariant(index)}>Remove</button>
                </div>
              ))}
            </div>
            <button className="secondary-action" type="button" onClick={addVariant}>Add variant</button>
          </EditorSection>

          <EditorSection title="Images">
            <label className="upload-drop">Upload product images
              <input type="file" accept="image/*" multiple onChange={uploadImages} />
              <span>{uploading ? "Uploading..." : "Drag/drop is supported by selecting multiple images. Uploaded images are added below."}</span>
            </label>
            <div className="image-preview-grid">
              {splitList(form.images).map((image) => <img key={image} src={image} alt="" />)}
            </div>
            <div className="field-grid">
              <Field label="Image codes from Excel" value={form.imageCodes} onChange={(value) => update("imageCodes", value)} placeholder="133_model, 133_flat, 133_detail" />
              <Field label="Model/featured image code" value={form.modelImageCode} onChange={(value) => update("modelImageCode", value)} placeholder="133_model" />
            </div>
            <Field label="Image URLs" type="textarea" value={form.images} onChange={(value) => update("images", value)} placeholder="Uploaded URLs appear here. You can also paste external URLs." />
            <Field label="Color-wise image gallery JSON" type="textarea" value={form.colorImages} onChange={(value) => update("colorImages", value)} placeholder={'{"White & Blue":"133_model,133_detail","Pink":"133_pink_model,133_pink_detail"}'} />
          </EditorSection>

          <EditorSection title="SEO">
            <Field label="SEO title" value={form.seoTitle} onChange={(value) => update("seoTitle", value)} />
            <Field label="Meta description" type="textarea" value={form.metaDescription} onChange={(value) => update("metaDescription", value)} />
          </EditorSection>
        </div>

        <aside className="editor-side">
          <EditorSection title="Pricing">
            <Field label="Selling price" type="number" value={form.price} onChange={(value) => update("price", value)} required />
            <Field label="MRP" type="number" value={form.mrp} onChange={(value) => update("mrp", value)} />
            <Field label="Total stock" type="number" value={form.stock} onChange={(value) => update("stock", value)} />
            <Field label="Unique product number" value={form.productNumber || form.sku} onChange={(value) => update("productNumber", value)} required />
            <Field label="SKU" value={form.sku} onChange={(value) => update("sku", value)} />
          </EditorSection>

          <EditorSection title="Status">
            {[
              ["isPublished", "Published"],
              ["featured", "Featured"],
              ["newArrival", "New arrival"],
              ["bestSeller", "Best seller"],
            ].map(([key, label]) => (
              <label className="check-row" key={key}>
                <input type="checkbox" checked={Boolean(form[key])} onChange={(event) => update(key, event.target.checked)} />
                {label}
              </label>
            ))}
          </EditorSection>

          <EditorSection title="Shipping">
            <Field label="Weight kg" type="number" value={form.weight} onChange={(value) => update("weight", value)} />
            <div className="field-grid compact">
              <Field label="L cm" type="number" value={form.length} onChange={(value) => update("length", value)} />
              <Field label="W cm" type="number" value={form.width} onChange={(value) => update("width", value)} />
              <Field label="H cm" type="number" value={form.height} onChange={(value) => update("height", value)} />
            </div>
          </EditorSection>
        </aside>
      </div>
    </form>
  );
}

function EditorSection({ title, children }) {
  return (
    <section className="editor-section">
      <h2>{title}</h2>
      <div className="editor-section-body">{children}</div>
    </section>
  );
}

function Field({ label, type = "text", value, onChange, required = false, placeholder = "" }) {
  return (
    <label>
      {label}
      {type === "textarea" ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function normalize(form) {
  let colorImages = {};
  try {
    colorImages = form.colorImages ? JSON.parse(form.colorImages) : {};
  } catch {
    colorImages = {};
  }
  return {
    ...form,
    category: form.childCategory || form.category,
    price: Number(form.price || 0),
    mrp: Number(form.mrp || form.price || 0),
    stock: Number(form.stock || 0),
    images: splitList(form.images),
    imageCodes: splitList(form.imageCodes),
    colors: splitList(form.colors),
    colorImages,
    tags: splitList(form.tags),
    ageGroups: splitList(form.ageGroups),
    variants: form.variants
      .filter((variant) => variant.size || variant.colour || variant.stock || variant.sku)
      .map((variant) => ({
        ...variant,
        ageGroup: variant.ageGroup || variant.size,
        color: variant.color || variant.colour,
        stock: Number(variant.stock || 0),
      })),
    shipping: {
      weight: Number(form.weight || 0),
      length: Number(form.length || 0),
      width: Number(form.width || 0),
      height: Number(form.height || 0),
    },
  };
}
