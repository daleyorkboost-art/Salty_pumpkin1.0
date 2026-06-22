import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { authApi } from "../services/api";
import { syncCurrentFirebaseCustomerData } from "../services/firebaseAuth";

const WishlistContext = createContext(null);
const guestKey = "salty_guest_wishlist";

function readGuest() {
  try {
    return JSON.parse(localStorage.getItem(guestKey) || "[]");
  } catch {
    return [];
  }
}

export function WishlistProvider({ children }) {
  const { user, updateUser } = useAuth();
  const userId = user?.id;
  const userWishlist = user?.wishlist;
  const [ids, setIds] = useState(() => readGuest());

  useEffect(() => {
    let active = true;
    if (!userId) {
      setIds(readGuest());
      return () => {
        active = false;
      };
    }
    const guestIds = readGuest();
    const request = guestIds.length
      ? authApi.syncCustomerData({ wishlist: guestIds })
      : authApi.wishlist();
    request
      .then((data) => {
        if (!active) return;
        const next = data.ids || data.user?.wishlist || [];
        setIds(next);
        localStorage.removeItem(guestKey);
      })
      .catch(() => {
        if (active) setIds(userWishlist || guestIds);
      });
    return () => {
      active = false;
    };
  }, [userId, userWishlist]);

  async function toggle(product) {
    const id = product._id;
    const active = ids.includes(id);
    const next = active ? ids.filter((item) => item !== id) : [...new Set([...ids, id])];
    setIds(next);
    if (!user) {
      localStorage.setItem(guestKey, JSON.stringify(next));
      return;
    }
    try {
      const data = active ? await authApi.removeWishlist(id) : await authApi.addWishlist(id);
      setIds(data.ids || next);
      if (data.user) {
        updateUser(data.user);
        await syncCurrentFirebaseCustomerData(data.user);
      }
    } catch {
      setIds(ids);
    }
  }

  return (
    <WishlistContext.Provider value={{ ids, count: ids.length, has: (id) => ids.includes(id), toggle }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
