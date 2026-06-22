import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authApi, catalogApi } from "../services/api";
import { friendlyFirebaseError } from "../services/firebaseAuth";
import { trackEvent } from "../services/tracking";
import { PasswordField } from "../components/PasswordField";
import { useAsync } from "../hooks/useAsync";

const modeCopy = {
  login: ["Welcome Back 👋", "Sign in to access your orders, wishlist and exclusive offers."],
  register: ["Join the Salty Pumpkin family", "Create your account for faster checkout and first access to new collections."],
  forgot: ["Reset your password", "Enter your email and we will help you get back to your account."],
  phone: ["Sign in with Phone OTP", "Use your mobile number for a quick and secure sign in."],
};

const icons = {
  person: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  phone: <svg viewBox="0 0 24 24"><path d="M7.5 3h3l1.2 4-2 1.3a15 15 0 0 0 6 6l1.3-2 4 1.2v3c0 2-1.5 3.5-3.5 3.5C10 20 4 14 4 6.5 4 4.5 5.5 3 7.5 3Z" /></svg>,
  email: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>,
  otp: <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h3" /></svg>,
};

function AuthField({ label, icon, ...inputProps }) {
  return (
    <label className="auth-field-label">
      <span>{label}</span>
      <span className="auth-input-wrap">
        <span className="auth-input-icon" aria-hidden="true">{icons[icon]}</span>
        <input {...inputProps} />
      </span>
    </label>
  );
}

function OtpBoxes({ value, onChange }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || "");
  function update(index, nextValue) {
    const digit = nextValue.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    onChange(next.join(""));
    if (digit && index < 5) refs.current[index + 1]?.focus();
  }
  return (
    <label className="auth-field-label">
      <span>One-time password</span>
      <span className="otp-boxes">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => { refs.current[index] = element; }}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`OTP digit ${index + 1}`}
            value={digit}
            onChange={(event) => update(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !digit && index > 0) refs.current[index - 1]?.focus();
            }}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
              if (pasted) {
                event.preventDefault();
                onChange(pasted);
                refs.current[Math.min(pasted.length, 6) - 1]?.focus();
              }
            }}
            maxLength="1"
          />
        ))}
      </span>
    </label>
  );
}

function customerSafeError(err, mode) {
  if (mode === "phone" && err.status >= 500) return "Phone OTP is temporarily unavailable. Please use email login or try again later.";
  if (err.status >= 500) return "We could not complete that request right now. Please try again in a moment.";
  return err.message || "Please check your details and try again.";
}

export function Login() {
  const location = useLocation();
  const initialMode = new URLSearchParams(location.search).get("mode");
  const [mode, setMode] = useState(["register", "forgot", "phone"].includes(initialMode) ? initialMode : "login");
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const { login, register, googleLogin, forgotPassword, phoneLogin } = useAuth();
  const navigate = useNavigate();
  const { data: settingsData } = useAsync(() => catalogApi.settings().catch(() => ({ settings: {} })), []);
  const logoUrl = settingsData?.settings?.store?.logoUrl || "/salty-pumpkin-logo.svg";

  useEffect(() => {
    const requestedMode = new URLSearchParams(location.search).get("mode");
    if (["login", "register", "forgot", "phone"].includes(requestedMode)) setMode(requestedMode);
  }, [location.search]);

  useEffect(() => {
    if (cooldown <= 0 && expiresIn <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
      setExpiresIn((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown, expiresIn]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "forgot") {
        await forgotPassword(form.email);
        setNotice("Password reset instructions have been sent to your email.");
      } else {
        if (mode === "register" && form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const action = mode === "register" ? register : login;
        const session = await action(form);
        await trackEvent(mode === "register" ? "sign_up" : "login", {
          method: "email",
          user_data: { email: form.email, phone: form.phone },
        });
        const target = location.state?.from || (session.user.role === "admin" ? "/admin" : "/account");
        navigate(target, { replace: true });
      }
    } catch (err) {
      setError(err.code ? friendlyFirebaseError(err) : customerSafeError(err, mode));
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const session = await googleLogin();
      await trackEvent("login", { method: "google" });
      navigate(session.user.role === "admin" ? "/admin" : "/account", { replace: true });
    } catch (err) {
      setError(friendlyFirebaseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp() {
    setLoading(true);
    setError("");
    try {
      const data = await authApi.sendOtp({ countryCode, phone: form.phone });
      setOtpSent(true);
      setOtp("");
      setCooldown(Number(data.retryAfter || 30));
      setExpiresIn(Number(data.expiresIn || 300));
      setNotice(data.message);
    } catch (err) {
      setError(customerSafeError(err, "phone"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");
    try {
      const data = await authApi.verifyOtp({ countryCode, phone: form.phone, otp });
      const session = await phoneLogin(data);
      setNotice(data.message || "Phone verified successfully.");
      await trackEvent("login", { method: "phone", user_data: { phone: `${countryCode}${form.phone}` } });
      navigate(session.user.role === "admin" ? "/admin" : "/account", { replace: true });
    } catch (err) {
      setError(customerSafeError(err, "phone"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-shell">
        <aside className="auth-story">
          <div className="auth-story-content">
            <span className="auth-collection-pill">New collection · 2026</span>
            <p className="auth-story-kicker">Made for little moments</p>
            <h1>Playful style.<br />Everyday comfort.</h1>
            <p>Thoughtfully designed kidswear for celebrations, adventures and everything in between.</p>
            <div className="auth-season-offer"><strong>Seasonal treat</strong><span>Enjoy 20% off your first order</span></div>
          </div>
          <div className="auth-trust-row">
            <span><strong>Free shipping</strong>Above Rs. 999</span>
            <span><strong>Easy returns</strong>Within 7 days</span>
            <span><strong>Secure checkout</strong>Shop confidently</span>
          </div>
        </aside>

        <div className="auth-card-wrap">
          <form className="form-card auth-card" onSubmit={submit}>
            {logoUrl ? <img className="auth-logo" src={logoUrl} alt="Salty Pumpkin" /> : <div className="auth-wordmark">Salty Pumpkin</div>}
            <div className="auth-heading">
              <p className="eyebrow">Your Salty Pumpkin account</p>
              <h1>{modeCopy[mode][0]}</h1>
              <p>{modeCopy[mode][1]}</p>
            </div>
            <div className="segmented-control auth-tabs" role="tablist" aria-label="Authentication options">
              {[
                ["login", "Login"],
                ["register", "Register"],
                ["forgot", "Forgot Password"],
                ["phone", "Phone OTP"],
              ].map(([key, label]) => (
                <button type="button" role="tab" aria-selected={mode === key} className={mode === key ? "active" : ""} onClick={() => { setMode(key); setError(""); setNotice(""); }} key={key}>{label}</button>
              ))}
            </div>
            <div className="auth-form-content" key={mode}>
              {error && <div className="form-error" role="alert">{error}</div>}
              {notice && <div className="form-success" role="status">{notice}</div>}
              {mode === "register" && (
                <>
                  <AuthField label="Full Name" icon="person" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your full name" required />
                  <AuthField label="Phone Number" icon="phone" type="tel" inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="10-digit mobile number" pattern="[0-9]{10}" required />
                </>
              )}
              {mode === "phone" ? (
                <>
                  <label className="auth-field-label">
                    <span>Mobile number</span>
                    <span className="phone-input-row">
                      <select aria-label="Country code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
                        <option value="+91">IN +91</option>
                        <option value="+1">US +1</option>
                        <option value="+44">UK +44</option>
                        <option value="+971">AE +971</option>
                      </select>
                      <span className="auth-input-wrap">
                        <span className="auth-input-icon" aria-hidden="true">{icons.phone}</span>
                        <input type="tel" inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, "") })} placeholder="Mobile number" pattern="[0-9]{7,12}" required />
                      </span>
                    </span>
                  </label>
                  {otpSent && <OtpBoxes value={otp} onChange={setOtp} />}
                  {otpSent && <div className="otp-meta">
                    <span>{expiresIn > 0 ? `OTP expires in ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}` : "OTP expired"}</span>
                    <button type="button" className="link-button" disabled={loading || cooldown > 0} onClick={sendOtp}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}</button>
                  </div>}
                  <button className="auth-submit" type="button" disabled={loading || (otpSent && (otp.length !== 6 || expiresIn <= 0))} onClick={otpSent ? verifyOtp : sendOtp}>
                    {loading && <span className="button-spinner" aria-hidden="true" />}{loading ? "Please wait..." : otpSent ? "Verify & Sign In" : "Send OTP"}
                  </button>
                </>
              ) : (
                <>
                  <AuthField label="Email address" icon="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required />
                  {mode !== "forgot" && <PasswordField premium value={form.password} onChange={(password) => setForm({ ...form, password })} placeholder="Enter your password" minLength={6} required />}
                  {mode === "register" && <PasswordField premium label="Confirm Password" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} placeholder="Confirm your password" minLength={6} required />}
                </>
              )}
              {mode !== "phone" && (
                <button className="auth-submit" disabled={loading}>
                  {loading && <span className="button-spinner" aria-hidden="true" />}{loading ? "Please wait..." : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
                </button>
              )}
              {(mode === "login" || mode === "register") && (
                <>
                  <div className="auth-divider"><span>or continue with</span></div>
                  <button className="google-auth-button" type="button" disabled={loading} onClick={loginWithGoogle}>
                    <span aria-hidden="true">G</span> Continue with Google
                  </button>
                </>
              )}
              <p className="auth-privacy">Your information stays private and protected.</p>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
