import { useState } from "react";
import { useAsync } from "../hooks/useAsync";
import { catalogApi, contactApi, orderApi } from "../services/api";

const defaultAboutContent = `At Salty Pumpkin, we believe childhood should be filled with comfort, confidence, creativity, and style. We are a modern kidswear brand dedicated to bringing high-quality, fashionable, and affordable clothing for children who love to explore, play, and express themselves.

Our collections are thoughtfully designed to combine comfort, durability, and trend-forward fashion, ensuring that every outfit looks great while allowing kids to move freely throughout their day. From everyday essentials to special occasion outfits, we create clothing that parents trust and children love to wear.

We understand that growing children need clothing that keeps up with their active lifestyles. That's why we focus on premium fabrics, comfortable fits, vibrant designs, and exceptional craftsmanship in every piece we offer.

Our Mission
To provide stylish, comfortable, and high-quality kidswear that empowers children to feel confident while making shopping easy and enjoyable for parents.

What Makes Us Different
- Premium Quality Fabrics
- Comfortable & Kid-Friendly Designs
- Trendy Styles for Every Season
- Affordable Fashion Without Compromise
- Safe & Secure Shopping Experience
- Fast Delivery & Reliable Customer Support

Our Promise
Every product at Salty Pumpkin is carefully selected with attention to quality, comfort, and style. We are committed to creating a delightful shopping experience and helping families find clothing that celebrates the joy of childhood.

Whether it's a casual day out, a family gathering, a birthday celebration, or everyday adventures, Salty Pumpkin is here to dress your little ones in styles they'll love and comfort they'll enjoy all day long.

Growing With Every Child
Fashion is more than clothing - it's a way for children to express their personality, imagination, and confidence. At Salty Pumpkin, we are proud to be a part of their journey, bringing collections that inspire smiles, create memories, and make every day a little more colorful.

Salty Pumpkin - Where Comfort Meets Style for Every Little Adventure.`;

const terms = [
  ["General Information", "These Terms and Conditions govern your use of the Salty Pumpkin website and purchases made through it. By accessing or placing an order, you accept these terms in full."],
  ["Products and Pricing", "Products are subject to availability. Prices are listed in INR and may change without notice, though confirmed orders are not affected by later price changes."],
  ["Orders and Payment", "Order confirmation means we have received your request. Final acceptance occurs when the order is packed or dispatched. Payments are processed through secure partners or COD where enabled."],
  ["Shipping and Delivery", "Orders are packed with care and handed to delivery partners within the stated processing window. Delivery timelines vary by pincode and courier availability."],
  ["Returns and Refunds", "Returns are accepted within 7 days for unused, unwashed items in original packaging with tags intact. Sale and customised items may be non-returnable."],
  ["Intellectual Property", "Brand name, product photography, copy, and design are owned by SAURYAINSTA FASHIONS PRIVATE LIMITED and may not be copied without permission."],
  ["Governing Law", "These terms are governed by Indian law and disputes are subject to courts in Noida, Uttar Pradesh."],
];

const shippingFaqs = [
  ["How long does delivery take?", "Orders are usually processed within 1-2 business days. Most major-city deliveries arrive within 3-7 business days after dispatch."],
  ["How can I track my order?", "Once shipped, tracking details are shared by email/SMS when available. You can also check your account order page."],
  ["Do you offer express shipping?", "Express shipping may be available for selected pincodes and products. Eligible options appear at checkout."],
  ["What if my order is delayed?", "Courier delays can happen during sales, weather events, address issues, or regional restrictions. Contact support if tracking does not update."],
];

const privacyItems = [
  ["Information we collect", "We collect account, contact, order, payment status, and delivery details needed to process purchases, support customers, and protect the store."],
  ["How we use information", "Customer information is used for checkout, order updates, support, fraud prevention, analytics, and legal compliance."],
  ["Sharing", "We share only the information required by payment, shipping, analytics, and support providers that help operate the store."],
  ["Retention", "Order and account records are retained as needed for customer support, accounting, tax, and legal obligations."],
];

const returnsItems = [
  ["Return window", "Eligible products can be returned within 7 days of delivery when unused, unwashed, and returned with original tags and packaging."],
  ["Non-returnable items", "Sale, damaged-after-use, hygiene-sensitive, customised, and final-sale items may not be eligible for return."],
  ["Refunds", "Approved refunds are processed to the original payment method or store-approved refund method after inspection."],
  ["Exchanges", "Size exchanges depend on stock availability and product condition."],
];

function LegacyAbout() {
  return (
    <div className="story-page">
      <section className="story-hero">
        <div>
          <p className="eyebrow">Premium kidswear India</p>
          <h1>Salty Pumpkin Luxury</h1>
          <p>Comfort-led clothing for children, made with thoughtful fabrics, playful details, and a parent’s eye for durability.</p>
        </div>
      </section>
      <section className="story-band">
        <div>
          <p className="eyebrow">Who we are</p>
          <h2>Building a trusted kids clothing brand in India.</h2>
          <p>Salty Pumpkin creates stylish, comfortable, high-quality outfits for modern children. Every piece is designed for movement, confidence, and everyday memories.</p>
          <p>Our goal is simple: offer parents clothing that balances fashion, comfort, and reliability for school days, celebrations, and easy weekends.</p>
        </div>
        <div className="story-visual"><span>Since 2024</span></div>
      </section>
      <section className="feature-row">
        {[
          ["Quality checked", "Every product is checked for comfort, finish, and durability."],
          ["Secure payments", "Checkout is protected and payment configuration is controlled from admin settings."],
          ["Fast India shipping", "Orders are packed quickly and shipped safely across India."],
          ["Easy returns", "Customer care is built around clear, simple support."],
        ].map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
      </section>
    </div>
  );
}

export function About() {
  const { data } = useAsync(() => catalogApi.settings().catch(() => ({ settings: {} })), []);
  const content = data?.settings?.content || {};
  return (
    <div className="story-page reference-about">
      <section className="section about-reference-grid">
        <img src={content.aboutImage || "/uploads/103_Pink-103.jpg"} alt="Children wearing Salty Pumpkin outfits" />
        <div>
          <p className="breadcrumb">Home / About Us</p>
          <h1>{content.aboutTitle || "About Salty Pumpkin"}</h1>
          <AboutContent value={content.aboutContent || defaultAboutContent} />
        </div>
      </section>
      <section className="feature-row">
        {[
          ["Premium Quality", "Finest fabrics for your little ones"],
          ["Trendy Designs", "Stylish outfits for every occasion"],
          ["Loved by Parents", "Trusted by thousands of happy parents"],
        ].map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}
      </section>
    </div>
  );
}

export function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "Order Enquiry", message: "" });
  const [status, setStatus] = useState({ submitting: false, message: "", error: "" });
  const { data } = useAsync(() => catalogApi.settings().catch(() => ({ settings: {} })), []);
  const content = data?.settings?.content || {};

  async function submit(event) {
    event.preventDefault();
    setStatus({ submitting: true, message: "", error: "" });
    try {
      const result = await contactApi.send(form);
      setStatus({ submitting: false, message: `${result.message} Reference: ${result.reference}`, error: "" });
      setForm({ name: "", email: "", phone: "", subject: "Order Enquiry", message: "" });
    } catch (error) {
      setStatus({ submitting: false, message: "", error: error.message });
    }
  }

  const phoneHref = content.contactPhone ? `tel:${String(content.contactPhone).replace(/[^\d+]/g, "")}` : "";
  const whatsappHref = content.contactWhatsapp
    ? `https://wa.me/${String(content.contactWhatsapp).replace(/\D/g, "")}`
    : "";
  return (
    <section className="section page-section contact-grid">
      <div>
        <p className="eyebrow">Get in touch</p>
        <h1>{content.contactTitle || "We are here to help."}</h1>
        <p className="large-text">For orders, product questions, wholesale, or returns, send a message and the Salty Pumpkin team will get back to you.</p>
        <div className="contact-card">
          <h2>Our showroom</h2>
          <p>{content.contactAddress || "Salty Pumpkin Atelier, Sector 62, Noida, Uttar Pradesh, 201309"}</p>
          <p>Email: <a href={`mailto:${content.contactEmail || "help@saltypumpkin.in"}`}>{content.contactEmail || "help@saltypumpkin.in"}</a></p>
          {content.contactPhone && <p>Phone: <a href={phoneHref}>{content.contactPhone}</a></p>}
          {content.contactWhatsapp && <p>WhatsApp: <a href={whatsappHref} target="_blank" rel="noreferrer">{content.contactWhatsapp}</a></p>}
          <p>Hours: {content.contactBusinessHours || "Monday to Saturday, 10:00 AM - 7:00 PM IST"}</p>
          {content.contactMapLink && <a href={content.contactMapLink} target="_blank" rel="noreferrer">Open map</a>}
          <div className="contact-social-links">
            {content.contactInstagram && <a href={content.contactInstagram} target="_blank" rel="noreferrer">Instagram</a>}
            {content.contactFacebook && <a href={content.contactFacebook} target="_blank" rel="noreferrer">Facebook</a>}
          </div>
        </div>
      </div>
      <form className="form-card contact-form" onSubmit={submit}>
        {status.error && <div className="form-error">{status.error}</div>}
        {status.message && <div className="form-success">{status.message}</div>}
        <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jane Doe" /></label>
        <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="jane@example.com" /></label>
        <label>Phone<input inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="9876543210" /></label>
        <label>Subject<select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}><option>Order Enquiry</option><option>Product Information</option><option>Returns and Refunds</option><option>Wholesale</option><option>Other</option></select></label>
        <label>Message<textarea required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="How can we assist you today?" /></label>
        <button disabled={status.submitting}>{status.submitting ? "Sending..." : "Submit message"}</button>
      </form>
    </section>
  );
}

function AboutContent({ value }) {
  return (
    <div className="about-content">
      {String(value || "").split(/\n{2,}/).filter(Boolean).map((block, index) => {
        const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
        const [first, ...rest] = lines;
        const isHeading = ["Our Mission", "What Makes Us Different", "Our Promise", "Growing With Every Child"].includes(first);
        const list = rest.filter((line) => line.startsWith("-")).map((line) => line.replace(/^-\s*/, ""));
        if (isHeading) {
          return (
            <section className="about-content-section" key={`${first}-${index}`}>
              <h2>{first}</h2>
              {list.length ? <ul>{list.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{rest.join(" ")}</p>}
            </section>
          );
        }
        return <p key={index}>{lines.join(" ")}</p>;
      })}
    </div>
  );
}

export function Terms() {
  return (
    <PolicyPage title="Terms and Conditions" intro="Welcome to Salty Pumpkin. Please read these terms before using the website or placing an order.">
      {terms.map(([title, text], index) => <PolicySection key={title} number={index + 1} title={title} text={text} />)}
    </PolicyPage>
  );
}

export function Shipping() {
  return (
    <PolicyPage title="Shipping Policy" intro="Find everything you need to know about our shipping and delivery process.">
      {shippingFaqs.map(([title, text], index) => <PolicySection key={title} number={index + 1} title={title} text={text} />)}
      <div className="contact-card">
        <h2>Legal entity</h2>
        <p>SAURYAINSTA FASHIONS PRIVATE LIMITED</p>
        <p>Support: info@saltypumpkin.in</p>
      </div>
    </PolicyPage>
  );
}

export function Privacy() {
  return (
    <PolicyPage title="Privacy Policy" intro="This policy explains how Salty Pumpkin collects, uses, and protects customer information.">
      {privacyItems.map(([title, text], index) => <PolicySection key={title} number={index + 1} title={title} text={text} />)}
    </PolicyPage>
  );
}

export function Returns() {
  return (
    <PolicyPage title="Returns and Refunds" intro="Clear rules for returns, exchanges, and refunds for Salty Pumpkin orders.">
      {returnsItems.map(([title, text], index) => <PolicySection key={title} number={index + 1} title={title} text={text} />)}
    </PolicyPage>
  );
}

export function Blog() {
  return (
    <PolicyPage title="Salty Pumpkin Blog" intro="Style notes, kidswear care tips, size guidance, and launch updates from the Salty Pumpkin team.">
      {[
        ["How to choose everyday kidswear", "Look for breathable fabrics, easy movement, gentle seams, and outfit sets that can be mixed through the week."],
        ["Party outfits that stay comfortable", "Choose soft linings, flexible waistbands, and silhouettes that photograph beautifully without feeling stiff."],
        ["Caring for cotton outfits", "Wash inside out, use mild detergent, dry in shade, and avoid harsh bleach to preserve colour and softness."],
      ].map(([title, text], index) => <PolicySection key={title} number={index + 1} title={title} text={text} />)}
    </PolicyPage>
  );
}

export function Support() {
  return (
    <PolicyPage title="24x7 Support" intro="Need help with sizing, order status, delivery, payment, returns, or bulk enquiries? We are here to help.">
      {[
        ["Order help", "Keep your order number, phone number, and email ready so support can find your order quickly."],
        ["Product and sizing", "Share the child's age, height, and preferred fit for size assistance before checkout."],
        ["Returns and exchanges", "Contact support with product photos, invoice details, and delivery date for eligible requests."],
      ].map(([title, text], index) => <PolicySection key={title} number={index + 1} title={title} text={text} />)}
    </PolicyPage>
  );
}

export function OrderTracking() {
  const [form, setForm] = useState({ lookup: "", contact: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    try {
      const data = await orderApi.track(form);
      setResult(data.order);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="section page-section contact-grid">
      <div>
        <p className="eyebrow">Track order</p>
        <h1>Track your Salty Pumpkin order.</h1>
        <p className="large-text">Enter your order number and email or phone. When courier tracking is connected in admin settings, tracking updates can be shown here.</p>
        <div className="contact-card">
          <h2>Need urgent help?</h2>
          <p>Email info@saltypumpkin.in with your order number and registered phone number.</p>
        </div>
      </div>
      <form className="form-card" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <label>Order number or AWB<input value={form.lookup} onChange={(event) => setForm({ ...form, lookup: event.target.value })} placeholder="SP-20260602-ABC123 / AWB" required /></label>
        <label>Email or phone<input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="you@example.com / 9876543210" /></label>
        <button>Check status</button>
        {result ? (
          <div className="tracking-result">
            <h2>{result.orderNumber || result._id}</h2>
            <p>Status: <strong>{formatPolicyStatus(result.shipmentStatus || result.status)}</strong></p>
            <p>Tracking number: <strong>{result.trackingNumber || "Shipment creation pending"}</strong></p>
            <p>Courier: <strong>{result.courierPartner || "Delhivery"}</strong></p>
          </div>
        ) : <p className="muted">Live carrier tracking appears after delivery integration is configured.</p>}
      </form>
    </section>
  );
}

function formatPolicyStatus(value) {
  return String(value || "pending").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function Company() {
  return <PolicyPage title="Company" intro="Salty Pumpkin is operated by SAURYAINSTA FASHIONS PRIVATE LIMITED, building comfortable and stylish kidswear for Indian families." />;
}

export function Careers() {
  return <PolicyPage title="Careers" intro="We are growing across design, operations, fulfilment, customer support, and digital commerce. Share your profile with support to be considered for future openings." />;
}

export function Brands() {
  return <PolicyPage title="Brands" intro="Salty Pumpkin focuses on premium kidswear collections, seasonal capsules, and curated essentials for babies, boys, and girls." />;
}

export function NotFound() {
  return <PolicyPage title="Page not found" intro="The page you requested does not exist." />;
}

function PolicyPage({ title, intro, children }) {
  return (
    <section className="section page-section narrow policy-page">
      <p className="eyebrow">Salty Pumpkin</p>
      <h1>{title}</h1>
      <p className="large-text">{intro}</p>
      <div className="policy-list">{children}</div>
    </section>
  );
}

function PolicySection({ number, title, text }) {
  return (
    <article className="policy-section">
      <span>{String(number).padStart(2, "0")}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}
