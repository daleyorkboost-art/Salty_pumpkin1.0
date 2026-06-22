import { createContext, useContext, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("salty_cart") || "[]");
    } catch {
      return [];
    }
  });

  function persist(next) {
    setItems(next);
    localStorage.setItem("salty_cart", JSON.stringify(next));
  }

  function add(product) {
    const key = product.cartKey || `${product._id}:${product.variantSku || ""}:${product.size || ""}:${product.colour || product.color || ""}`;
    const existing = items.find((item) => (item.cartKey || item._id) === key);
    if (existing) {
      persist(items.map((item) => ((item.cartKey || item._id) === key ? { ...item, qty: item.qty + 1 } : item)));
      return;
    }
    persist([...items, { ...product, cartKey: key, qty: 1 }]);
  }

  function remove(id) {
    persist(items.filter((item) => (item.cartKey || item._id) !== id));
  }

  function updateQty(id, qty) {
    const nextQty = Math.max(1, Number(qty || 1));
    persist(items.map((item) => ((item.cartKey || item._id) === id ? { ...item, qty: nextQty } : item)));
  }

  function clear() {
    persist([]);
  }

  const total = items.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const value = { items, total, count, add, remove, updateQty, clear };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
