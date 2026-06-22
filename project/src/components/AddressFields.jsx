import { useEffect, useState } from "react";
import { deliveryApi, locationApi } from "../services/api";

const keys = ["name", "phone", "line1", "pincode", "city", "district", "state", "country"];

export function AddressFields({ value, onChange, onServiceability }) {
  const [lookup, setLookup] = useState({ loading: false, message: "" });
  const [delivery, setDelivery] = useState({ loading: false, message: "", available: null });

  useEffect(() => {
    const pincode = String(value.pincode || "");
    if (!/^\d{6}$/.test(pincode)) {
      setLookup({ loading: false, message: "" });
      return undefined;
    }
    const timer = setTimeout(async () => {
      setLookup({ loading: true, message: "Fetching city and state..." });
      setDelivery({ loading: true, message: "Checking delivery availability...", available: null });
      try {
        const [locationResult, deliveryResult] = await Promise.allSettled([
          locationApi.pincode(pincode),
          deliveryApi.serviceability(pincode),
        ]);
        if (locationResult.status === "fulfilled") {
          onChange((current) => ({ ...current, ...locationResult.value.location, pincode }));
        }
        setLookup({ loading: false, message: "Address details filled. You can edit them." });
        if (deliveryResult.status === "fulfilled") {
          const result = deliveryResult.value;
          const details = [
            result.message,
            result.estimatedDeliveryDays ? `Estimated ${result.estimatedDeliveryDays} days.` : "",
            result.available ? (result.codAvailable ? "COD available." : "Prepaid only.") : "",
          ].filter(Boolean).join(" ");
          setDelivery({ loading: false, message: details, available: result.available });
          onServiceability?.(result);
        } else {
          setDelivery({ loading: false, message: "Delivery validation is temporarily unavailable.", available: null });
          onServiceability?.(null);
        }
      } catch (err) {
        setLookup({ loading: false, message: err.message });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [value.pincode, onChange, onServiceability]);

  return (
    <>
      {keys.map((key) => (
        <label key={key}>{label(key)}
          <input
            value={value[key] || ""}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            pattern={key === "pincode" ? "[0-9]{6}" : key === "phone" ? "[0-9]{10}" : undefined}
            inputMode={key === "pincode" || key === "phone" ? "numeric" : undefined}
            autoComplete={autoComplete(key)}
            required={key !== "district"}
          />
        </label>
      ))}
      {lookup.message && <p className={lookup.loading ? "muted" : "address-lookup-message"}>{lookup.message}</p>}
      {delivery.message && (
        <p className={delivery.loading ? "muted" : delivery.available === false ? "form-error" : "delivery-available"}>
          {delivery.message}
        </p>
      )}
    </>
  );
}

function autoComplete(key) {
  const values = {
    name: "name",
    phone: "tel",
    line1: "street-address",
    pincode: "postal-code",
    city: "address-level2",
    district: "address-level3",
    state: "address-level1",
    country: "country-name",
  };
  return values[key];
}

function label(key) {
  if (key === "line1") return "Address";
  if (key === "pincode") return "PIN code";
  return key.charAt(0).toUpperCase() + key.slice(1);
}
