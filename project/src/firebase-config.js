import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC-FbsLoLjPyeV7QdbAuT8yOFc7njVV5UQ",
  authDomain: "salty-pumpkin.firebaseapp.com",
  projectId: "salty-pumpkin",
  storageBucket: "salty-pumpkin.firebasestorage.app",
  messagingSenderId: "960750091512",
  appId: "1:960750091512:web:fb488050ae6c1b3051cf0d",
  measurementId: "G-NP7EWWB52F",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const firestore = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

setPersistence(auth, browserLocalPersistence).catch(() => {
  // Firebase Auth still works with its environment default if persistence setup is unavailable.
});

let analytics = null;
function isLocalHost() {
  if (typeof window === "undefined") return true;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

if (typeof window !== "undefined" && !isLocalHost()) {
  isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  }).catch(() => {});
}

export { analytics, app, auth, firestore, googleProvider };
