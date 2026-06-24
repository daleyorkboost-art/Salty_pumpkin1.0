import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase-config";
import { authApi, clearSession, getStoredSession, saveSession } from "../services/api";
import {
  firebaseEmailLogin,
  firebaseForgotPassword,
  firebaseGoogleLogin,
  firebaseLogout,
  firebasePhoneLogin,
  firebaseRegister,
  restoreFirebaseSession,
  syncCurrentFirebaseCustomerData,
  updateFirebaseProfile,
} from "../services/firebaseAuth";

const AuthContext = createContext(null);

function backendSession(data) {
  const next = { token: data.token, user: data.user };
  saveSession(next);
  return next;
}

function shouldUseBackendAuth(error) {
  return [
    "auth/invalid-credential",
    "auth/network-request-failed",
    "auth/operation-not-allowed",
    "auth/user-not-found",
    "auth/too-many-requests",
  ].includes(error?.code);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession());
  const [loading, setLoading] = useState(() => Boolean(getStoredSession()?.token));

  useEffect(() => {
    let active = true;
    const restoreTimeout = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 10000);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        let next = null;
        if (firebaseUser) {
          next = await restoreFirebaseSession(firebaseUser);
        } else if (getStoredSession()?.token) {
          const data = await authApi.me();
          next = { token: getStoredSession().token, user: data.user };
          saveSession(next);
        }
        if (!active) return;
        setSession(next);
      } catch {
        if (!active) return;
        clearSession();
        setSession(null);
      } finally {
        window.clearTimeout(restoreTimeout);
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      window.clearTimeout(restoreTimeout);
      unsubscribe();
    };
  }, []);

  async function login(credentials) {
    try {
      const next = await firebaseEmailLogin(credentials);
      setSession(next);
      return next;
    } catch (firebaseError) {
      // Preserve backend-created accounts during Firebase rollout or outages.
      try {
        const data = await authApi.login(credentials);
        if (data.token && data.user) {
          const next = backendSession(data);
          setSession(next);
          return next;
        }
      } catch (backendError) {
        if (shouldUseBackendAuth(firebaseError)) throw backendError;
      }
      throw firebaseError;
    }
  }

  async function register(details) {
    try {
      const next = await firebaseRegister(details);
      setSession(next);
      return next;
    } catch (firebaseError) {
      if (!shouldUseBackendAuth(firebaseError)) throw firebaseError;
      const data = await authApi.register(details);
      const next = backendSession(data);
      setSession(next);
      return next;
    }
  }

  async function googleLogin() {
    const next = await firebaseGoogleLogin();
    setSession(next);
    return next;
  }

  async function phoneLogin(sessionData) {
    const next = await firebasePhoneLogin(sessionData);
    setSession(next);
    return next;
  }

  async function otpLogin(sessionData) {
    const next = backendSession(sessionData);
    setSession(next);
    return next;
  }

  async function forgotPassword(email) {
    try {
      await firebaseForgotPassword(email);
    } catch (firebaseError) {
      if (!shouldUseBackendAuth(firebaseError)) throw firebaseError;
      await authApi.forgotPassword({ email });
    }
  }

  async function logout() {
    setSession(null);
    await firebaseLogout();
  }

  function updateUser(user) {
    const next = { ...session, user };
    setSession(next);
    saveSession(next);
  }

  async function updateProfile(details) {
    await updateFirebaseProfile(details);
    const data = await authApi.updateProfile(details);
    updateUser(data.user);
    await syncCurrentFirebaseCustomerData(data.user);
    return data.user;
  }

  const value = {
    user: session?.user || null,
    token: session?.token || "",
    isAdmin: session?.user?.role === "admin",
    loading,
    login,
    register,
    googleLogin,
    phoneLogin,
    otpLogin,
    forgotPassword,
    logout,
    updateUser,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
