import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, firestore, googleProvider } from "../firebase-config";
import { authApi, clearSession, getStoredSession, orderApi, saveSession } from "./api";

function providerName(firebaseUser) {
  return firebaseUser.providerData?.[0]?.providerId || "password";
}

function profilePayload(firebaseUser, details = {}) {
  return {
    uid: firebaseUser.uid,
    name: details.name || firebaseUser.displayName || "",
    email: firebaseUser.email || details.email || "",
    phone: details.phone || firebaseUser.phoneNumber || "",
    photoURL: firebaseUser.photoURL || "",
    provider: details.provider || providerName(firebaseUser),
  };
}

function uniqueAddresses(addresses) {
  const values = new Map();
  addresses.forEach((address) => {
    if (!address || typeof address !== "object") return;
    const key = address.id || [address.line1, address.city, address.pincode, address.phone].map((value) => String(value || "").trim().toLowerCase()).join("|");
    if (key.replace(/\|/g, "")) values.set(key, address);
  });
  return [...values.values()].slice(0, 20);
}

function readLocalCustomerData() {
  const stored = getStoredSession()?.user || {};
  let guestWishlist = [];
  try {
    guestWishlist = JSON.parse(localStorage.getItem("salty_guest_wishlist") || "[]");
  } catch {
    guestWishlist = [];
  }
  return {
    wishlist: [...new Set([...(stored.wishlist || []), ...guestWishlist])],
    addresses: uniqueAddresses(stored.addresses || []),
    profile: { name: stored.name || "", phone: stored.phone || "" },
  };
}

async function readFirestoreCustomerData(firebaseUser) {
  try {
    const snapshot = await getDoc(doc(firestore, "users", firebaseUser.uid));
    return snapshot.exists() ? snapshot.data() : {};
  } catch {
    return {};
  }
}

async function syncFirestoreProfile(firebaseUser, backendUser, orders = [], existing = {}, details = {}) {
  const ref = doc(firestore, "users", firebaseUser.uid);
  const base = profilePayload(firebaseUser, details);
  await setDoc(ref, {
    ...base,
    name: backendUser.name || base.name,
    phone: backendUser.phone || base.phone,
    role: existing.role === "admin" || backendUser.role === "admin" ? "admin" : "customer",
    addresses: uniqueAddresses(backendUser.addresses || []),
    wishlist: [...new Set(backendUser.wishlist || [])],
    orderHistory: orders.slice(0, 50).map((order) => ({
      id: order._id,
      orderNumber: order.orderNumber || "",
      status: order.status || "",
      total: Number(order.total || 0),
      createdAt: order.createdAt || "",
    })),
    createdAt: existing.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  }, { merge: true });
}

async function syncProfileSafely(firebaseUser, backendUser, orders, existing, details = {}) {
  try {
    await syncFirestoreProfile(firebaseUser, backendUser, orders, existing, details);
  } catch (error) {
    console.warn("[auth] Firestore profile sync is temporarily unavailable.", error?.code || "");
  }
}

async function bridgeSession(firebaseUser, details = {}) {
  const idToken = await firebaseUser.getIdToken();
  const session = await authApi.firebaseSession({ idToken });
  let next = { token: session.token, user: session.user };
  saveSession(next);
  const [cloud, local] = await Promise.all([readFirestoreCustomerData(firebaseUser), Promise.resolve(readLocalCustomerData())]);
  try {
    const synced = await authApi.syncCustomerData({
      wishlist: [...new Set([...(cloud.wishlist || []), ...local.wishlist])],
      addresses: uniqueAddresses([...(cloud.addresses || []), ...local.addresses]),
      profile: local.profile,
    });
    next = { ...next, user: synced.user };
    saveSession(next);
  } catch {
    // The existing backend session remains valid even if migration is temporarily unavailable.
  }
  const orders = await orderApi.mine().then((data) => data.orders || []).catch(() => []);
  await syncProfileSafely(firebaseUser, next.user, orders, cloud, details);
  return next;
}

export async function firebaseEmailLogin({ email, password }) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return bridgeSession(credential.user);
}

export async function firebaseRegister({ name, email, phone, password }) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  return bridgeSession(credential.user, { name: name.trim(), phone: phone.trim() });
}

export async function firebaseGoogleLogin() {
  const credential = await signInWithPopup(auth, googleProvider);
  return bridgeSession(credential.user);
}

export async function firebaseForgotPassword(email) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function firebaseLogout() {
  clearSession();
  await signOut(auth);
}

export async function updateFirebaseProfile(details) {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return null;
  const nextName = details.name?.trim() || firebaseUser.displayName || "";
  if (nextName !== firebaseUser.displayName) await updateProfile(firebaseUser, { displayName: nextName });
  await setDoc(doc(firestore, "users", firebaseUser.uid), {
    name: nextName,
    phone: details.phone?.trim() || "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { name: nextName, phone: details.phone?.trim() || "" };
}

export async function syncCurrentFirebaseCustomerData(user, orders) {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser || !user) return;
  const payload = {
    name: user.name || firebaseUser.displayName || "",
    phone: user.phone || firebaseUser.phoneNumber || "",
    addresses: uniqueAddresses(user.addresses || []),
    wishlist: [...new Set(user.wishlist || [])],
    updatedAt: serverTimestamp(),
  };
  if (Array.isArray(orders)) {
    payload.orderHistory = orders.slice(0, 50).map((order) => ({
      id: order._id,
      orderNumber: order.orderNumber || "",
      status: order.status || "",
      total: Number(order.total || 0),
      createdAt: order.createdAt || "",
    }));
  }
  try {
    await setDoc(doc(firestore, "users", firebaseUser.uid), payload, { merge: true });
  } catch {
    // Backend data remains authoritative while Firestore is unavailable.
  }
}

export async function restoreFirebaseSession(firebaseUser) {
  return bridgeSession(firebaseUser);
}

export async function firebasePhoneLogin(sessionData) {
  if (!sessionData.customToken) {
    const next = { token: sessionData.token, user: sessionData.user };
    saveSession(next);
    return next;
  }
  const credential = await signInWithCustomToken(auth, sessionData.customToken);
  return bridgeSession(credential.user, { phone: sessionData.user.phone, provider: "phone" });
}

export function friendlyFirebaseError(error) {
  const messages = {
    "auth/email-already-in-use": "An account already exists with this email. Please sign in instead.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/missing-password": "Please enter your password.",
    "auth/operation-not-allowed": "Email sign-in is temporarily unavailable. Please use Google sign-in or try again later.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled. Please try again.",
    "auth/popup-blocked": "Please allow the Google sign-in popup and try again.",
    "auth/unauthorized-domain": "Google sign-in is not enabled for this website domain yet.",
    "auth/cancelled-popup-request": "Another Google sign-in window is already open.",
    "auth/too-many-requests": "Too many attempts. Please wait a little and try again.",
    "auth/user-disabled": "This account is currently unavailable. Please contact support.",
    "auth/weak-password": "Use a password with at least 6 characters.",
  };
  return messages[error?.code] || "We could not complete that request. Please try again.";
}
