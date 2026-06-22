import { useState } from "react";

export function PasswordField({ label = "Password", value, onChange, premium = false, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className={premium ? "auth-field-label" : undefined}>
      <span>{label}</span>
      <span className="password-field">
        {premium && <span className="auth-input-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Z" /></svg>
        </span>}
        <input
          {...inputProps}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {visible
              ? <><path d="m3 3 18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.5 10.5 0 0 1 12 4c5.5 0 9 8 9 8a16.2 16.2 0 0 1-2.1 3.2M6.2 6.2C4.1 7.7 3 12 3 12s3.5 8 9 8a9 9 0 0 0 3.1-.6" /></>
              : <><path d="M3 12s3.5-8 9-8 9 8 9 8-3.5 8-9 8-9-8-9-8Z" /><circle cx="12" cy="12" r="2.5" /></>}
          </svg>
        </button>
      </span>
    </label>
  );
}
