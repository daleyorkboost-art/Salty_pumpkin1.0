import { Link } from "react-router-dom";
import { useState } from "react";
import { ErrorState, Loading } from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { adminApi } from "../services/api";

const blank = { name: "", productNumber: "", sku: "", category: "Girls", price: "", mrp: "", stock: "", images: "", tags: "", isPublished: true };
const pageSize = 50;

export function AdminProducts() {
  const [form, setForm] = useState(blank);
  const [bulkText, setBulkText] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [importReport, setImportReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exactSku, setExactSku] = useState("");
  const { loading, data, error, reload } = useAsync(() => adminApi.products(), []);
  const products = data?.products || [];
  const filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.productNumber || ""} ${product.sku || ""} ${product.category || ""} ${product.tags?.join?.(" ") || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function findExactSku(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await adminApi.productBySku(exactSku);
      window.location.href = `/admin/products/${result.product._id}/edit`;
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await adminApi.createProduct(toProduct(form));
      setForm(blank);
      setMessage("Product saved and published across the website.");
      await reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkImport(event) {
    event.preventDefault();
    const parsed = parseBulkProducts(bulkText);
    if (!parsed.length) {
      setMessage("Paste JSON or CSV products before importing.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await adminApi.bulkCreateProducts(parsed);
      setBulkText("");
      setPage(1);
      setImportReport(result);
      setMessage(`Imported ${result.createdCount} products. Skipped ${result.skippedCount || 0}. Catalog now has ${result.total} products.`);
      await reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function excelImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    setImportReport(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await adminApi.importProducts(formData);
      setImportReport(result);
      setPage(1);
      setMessage(`Excel import completed: ${result.createdCount} created, ${result.skippedCount || 0} skipped.`);
      await reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function downloadProductSheet(format = "csv") {
    setBusy(true);
    setMessage("");
    try {
      const blob = format === "xlsx"
        ? await adminApi.exportProductsXlsx()
        : new Blob([await adminApi.exportProducts()], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `salty-pumpkin-products-${new Date().toISOString().slice(0, 10)}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Product ${format.toUpperCase()} sheet downloaded.`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    await adminApi.deleteProduct(id);
    await reload();
    setBusy(false);
  }

  async function togglePublished(product) {
    setBusy(true);
    await adminApi.updateProduct(product._id, { ...product, isPublished: product.isPublished === false });
    await reload();
    setBusy(false);
  }

  return (
    <div className="admin-page">
      <form className="admin-card exact-sku-search" onSubmit={findExactSku}>
        <div><p className="eyebrow">Exact product lookup</p><h2>Search by unique product number / SKU</h2></div>
        <input value={exactSku} onChange={(event) => setExactSku(event.target.value)} placeholder="Enter exact SKU/product code" required />
        <button disabled={busy}>Find and edit</button>
      </form>
      <section className="admin-hero-panel compact">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1>Products</h1>
          <p>Add individual products, import hundreds by CSV/JSON, and publish changes instantly across the storefront.</p>
        </div>
        <Link className="primary-action" to="/admin/products/add">Add full product</Link>
      </section>
      <div className="admin-summary">
        <strong>{products.length.toLocaleString("en-IN")}</strong>
        <span>total products</span>
        <strong>{products.filter((product) => product.isPublished !== false).length.toLocaleString("en-IN")}</strong>
        <span>published on website</span>
      </div>
      <section className="admin-card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Quick add</p>
            <h2>Add simple product</h2>
          </div>
          <Link to="/admin/products/add">Use full editor</Link>
        </div>
        <form className="inline-form" onSubmit={submit}>
          <input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <input placeholder="Unique product number" value={form.productNumber} onChange={(event) => setForm({ ...form, productNumber: event.target.value })} required />
          <input placeholder="SKU" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
          <input placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required />
          <input placeholder="Price" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required />
          <input placeholder="Stock" type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} />
          <input placeholder="Image URL" value={form.images} onChange={(event) => setForm({ ...form, images: event.target.value })} />
          <input placeholder="Tags comma separated" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
          <label className="check-row"><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm({ ...form, isPublished: event.target.checked })} /> Published</label>
          <button disabled={busy}>Add product</button>
        </form>
      </section>

      <form className="bulk-panel" onSubmit={bulkImport}>
        <div>
          <h2>Bulk import up to 1,000 products</h2>
          <p className="muted">Paste JSON/CSV or upload Excel. Supported headers include imageCodes, modelImageCode, parentCategory, childCategory, colors, ageGroups, stock, price, mrp, tags.</p>
        </div>
        <label className="upload-drop">Upload Excel product sheet
          <input type="file" accept=".xlsx,.csv" onChange={excelImport} disabled={busy} />
          <span>The first sheet is imported. Missing image codes are reported but do not stop the batch.</span>
        </label>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => downloadProductSheet("csv")}>Download CSV</button>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => downloadProductSheet("xlsx")}>Download XLSX</button>
        <textarea
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          placeholder={'name,productNumber,sku,parentCategory,childCategory,price,mrp,stock,colors,ageGroups,imageCodes,modelImageCode,tags\nButterfly Dress,SP-133,133,Girls,Dresses,1399,2499,8,"White & Blue,Pink,Red","18-24M,2-3Y,3-4Y","133_model,133_flat","133_model","dress,premium"'}
          rows="7"
        />
        <button disabled={busy}>Import products</button>
      </form>

      {message && <p className="success-text">{message}</p>}
      {importReport && <ImportReport report={importReport} />}
      <div className="admin-toolbar">
        <input
          placeholder="Search by product number, name, SKU, category, or tag"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <span>Showing {visible.length} of {filtered.length} matches</span>
      </div>
      {loading && <Loading label="Loading products..." />}
      {error && <ErrorState message={error} />}
      <section className="admin-card no-pad">
        <Table headers={["Name", "Product No.", "SKU", "Category", "Price", "Stock", "Status", "Actions"]}>
          {visible.map((product) => (
            <tr key={product._id}>
              <td><strong>{product.name}</strong></td>
              <td>{product.productNumber || product.sku}</td>
              <td>{product.sku}</td>
              <td>{product.category}</td>
              <td>Rs. {Number(product.price || 0).toLocaleString("en-IN")}</td>
              <td>{Number(product.stock || 0).toLocaleString("en-IN")}</td>
              <td><span className={product.isPublished === false ? "badge-missing" : "badge-ok"}>{product.isPublished === false ? "Draft" : "Published"}</span></td>
              <td className="table-actions">
                <Link className="secondary-action" to={`/admin/products/${product._id}/edit`}>Edit</Link>
                <button className="secondary-action" disabled={busy} onClick={() => togglePublished(product)}>
                  {product.isPublished === false ? "Publish" : "Unpublish"}
                </button>
                <button className="secondary-action danger" disabled={busy} onClick={() => remove(product._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </Table>
      </section>
      <div className="pagination">
        <button className="secondary-action" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button className="secondary-action" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function ImportReport({ report }) {
  const missingImages = report.missingImages || [];
  const skipped = report.skipped || [];
  if (!missingImages.length && !skipped.length) {
    return <section className="admin-card"><strong>Import report:</strong> no missing images or skipped rows.</section>;
  }
  return (
    <section className="admin-card import-report">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Import report</p>
          <h2>Review mapping results</h2>
        </div>
      </div>
      {missingImages.length > 0 && (
        <>
          <h3>Missing image codes</h3>
          <ul>{missingImages.map((item) => <li key={`${item.index}-${item.sku}`}>{item.name || item.sku}: {item.missingImageCodes.join(", ")}</li>)}</ul>
        </>
      )}
      {skipped.length > 0 && (
        <>
          <h3>Skipped rows</h3>
          <ul>{skipped.map((item) => <li key={`${item.index}-${item.reason}`}>Row {item.index + 1}: {item.reason}{item.sku ? ` (${item.sku})` : ""}</li>)}</ul>
        </>
      )}
    </section>
  );
}

function toProduct(product) {
  return {
    ...product,
    price: Number(product.price || 0),
    mrp: Number(product.mrp || product.price || 0),
    stock: Number(product.stock || 0),
    images: splitList(product.images),
    tags: splitList(product.tags),
    isPublished: product.isPublished !== false && product.isPublished !== "false",
  };
}

function splitList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBulkProducts(text) {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.startsWith("[")) return JSON.parse(clean).map(toProduct);
  const rows = clean.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(rows.shift()).map((header) => header.trim());
  return rows.map((row) => {
    const values = splitCsvLine(row);
    const product = headers.reduce((acc, header, index) => ({ ...acc, [header]: values[index] || "" }), {});
    return toProduct(product);
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function Table({ headers, children }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
