# Salty Pumpkin

## Delhivery production setup

All Delhivery calls are made by the Express backend. Never prefix these
variables with `VITE_` and never place their values in frontend files.

Required Hostinger environment variables:

```env
DELHIVERY_API_TOKEN=your-production-token
DELHIVERY_PICKUP_LOCATION=Exact Delhivery warehouse name
DELHIVERY_ORIGIN_PINCODE=6-digit dispatch PIN
DELHIVERY_API_BASE_URL=https://track.delhivery.com
DELHIVERY_DEFAULT_WEIGHT_GRAMS=500
DELHIVERY_SHIPPING_MODE=Surface
DELHIVERY_SYNC_INTERVAL_MINUTES=30
```

`DELHIVERY_PICKUP_LOCATION` must match the pickup warehouse registered in the
Delhivery account. If shipment creation fails, the order remains successful,
the shipment is marked pending, and an admin can retry it from Orders.

Production-ready React + Node.js storefront rebuilt from the previous compiled-only bundle.

## Firebase Authentication and Firestore profiles

- Firebase client initialization is centralized in `src/firebase-config.js`.
- Email/password login, registration, Google popup login, password reset, logout, and local persistence use Firebase Authentication.
- Customer profiles are stored in Firestore at `users/{uid}`.
- The backend verifies Firebase ID tokens at `/api/auth/firebase-session` and issues the existing app JWT so orders, wishlist, checkout, and admin APIs continue to work.
- New Firebase and Google users always receive the `customer` role. Existing `admin` roles are preserved and are never inferred during registration.
- Phone OTP is sent and verified only by the Node backend. Set `TWOFACTOR_API_KEY`, `TWOFACTOR_TEMPLATE_ID`, and `FIREBASE_SERVICE_ACCOUNT_JSON` in Hostinger environment variables; never place the OTP key in frontend files.
- Verified phone users receive Firebase custom sessions and remain customers unless an admin role already existed.
- Login merges Firestore, backend, and preserved local wishlist/address data. Order history remains backed by the existing order API and is mirrored into the signed-in user's Firestore profile.

Before production launch:

1. Enable Email/Password and Google providers in Firebase Authentication.
2. Add the production domain to Firebase Authentication Authorized domains.
3. Create Firestore and deploy `firestore.rules`.
4. Copy the Firebase web app config into `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, and optional `VITE_FIREBASE_MEASUREMENT_ID` before building.
5. Set `GOOGLE_CLOUD_PROJECT=<your-firebase-project-id>` in Hostinger and restart the Node app.

The production website must route `/api/*` to the Node application. If the
frontend and Node backend use different domains, set `VITE_API_BASE_URL` to the
Node app origin before running `npm run build`.

## What changed

- Reconstructed a clean React source tree under `src/` with `components/`, `pages/`, `admin/`, `context/`, `hooks/`, and `services/`.
- Replaced broken/minified frontend routing with React Router browser routes for website, account, checkout, and admin pages.
- Added protected user routes and admin-only routes.
- Added Phase 1.0 admin control center:
  - encrypted settings store in `data/settings.json`
  - runtime config service in `lib/config.js`
  - admin settings API with masked secrets
  - settings audit log
  - readiness API and dashboard panel
  - grouped admin settings UI with Save and Test connection actions
- Reworked the admin product manager for large catalogs: unique product number/SKU validation, search, single add, JSON/CSV bulk import, pagination, publish/unpublish, delete, and live product counts.
- Merged reference ZIP pages and admin functionality:
  - richer About, Contact, Terms, and Shipping pages
  - dedicated admin Add/Edit Product page
  - product variants, tags, SEO fields, shipping dimensions, status flags
  - admin orders KPI cards, filters, pagination, status updates, and CSV export
- Added `/api/admin/products/bulk` for importing up to 1,000 products per request; 600-product imports are validated.
- Removed insecure admin detection. Admin role is now granted only through `ADMIN_EMAILS` or `ADMIN_PHONES`.
- Added persistent email registration, login, password reset token generation, profile updates, and default/multiple address management.
- Added production 2Factor phone OTP, PIN-code address autofill, selectable/editable saved checkout addresses, persistent guest-to-account wishlist migration, dynamic logo/banner uploads, editable About/Contact content, and exact product number/SKU lookup.
- Kept signed JWT authentication with persisted user lookup and server-side admin enforcement for `/api/admin/*`.
- Stabilized product, order, transaction, auth, profile, address, and payment API response shapes.
- Recomputed checkout totals on the server from the product catalog and rejected unpublished or out-of-stock items.
- Added live Razorpay order creation, backend signature verification, duplicate-payment prevention, and persisted pending/success/failed/cancelled payment states. The customer order and stock decrement happen only after successful backend verification. Online payment is unavailable when keys are absent; there is no demo-payment bypass.
- Added Hostinger-safe Express static serving and SPA fallback for refreshes on `/shop`, `/account`, `/admin`, and nested routes.
- Added root, `static/`, and generated `public/.htaccess` SPA fallbacks for Apache/static deployments.
- Added Vite production build output in `public/` with hashed assets.
- Added lint/build/test scripts and a Hostinger-compatible `server.js` entry alias.

## Local development

```bash
npm install
copy .env.example .env
npm run build
npm start
```

Open `http://localhost:5000`.

For an admin login and encrypted panel secrets, set the bootstrap vars in `.env`, for example:

```env
ADMIN_EMAILS=owner@yourdomain.com
JWT_SECRET=replace-with-a-long-random-secret
SECRET_ENCRYPTION_KEY=replace-with-a-64-character-hex-secret
```

Then log in with that email and any password of at least 4 characters. On the first login, the server creates that configured admin account with the password you entered. Use the same password after that.
Razorpay may be configured with backend environment variables. SMTP, OTP, Cloudinary, shipping/tax, analytics, CORS, store info, and delivery are configured from Admin -> Settings.

For live Razorpay checkout, set these only in Hostinger's Node.js environment variables:

```env
RAZORPAY_KEY_ID=rzp_live_RXCmPn807sa6Pi
RAZORPAY_KEY_SECRET=your_new_rotated_live_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

The frontend receives only the Key ID returned by the backend-created Razorpay order. The Key Secret is used only by the backend for order creation and payment signature verification. Restart the Node.js application after changing environment variables.

Security note: the previously shared live secret must be rotated in the Razorpay dashboard before launch. Do not place the replacement secret in source code, `.env.example`, frontend settings, screenshots, or support messages.

For production phone OTP login/verification, set the 2Factor API key only in Hostinger:

```env
TWOFACTOR_API_KEY=your_2factor_api_key
```

There is no frontend or demo OTP key fallback. PIN-code address lookup is proxied through the backend using the India Post PIN API.

Optional legacy redirects are loaded from `data/redirects.json` as objects shaped like:

```json
[{ "oldUrl": "/old-page", "newUrl": "/new-page", "status": 301 }]
```

## Validation

```bash
npm run lint
npm run build
npm test
```

The repaired package was validated with:

- `npm install`
- `npm run lint`
- `npm run build`
- `npm test`
- local production server checks for `/`, `/shop`, `/admin`, `/api/health`
- admin JWT check for `/api/admin/dashboard`
- normal user `403` check for `/api/admin/dashboard`
- persistent registration/login/profile/address routes
- server-side order total recomputation that ignores tampered client totals
- stock decrement only after verified online payment, with COD stock handling and cancellation restore
- Razorpay missing-key rejection, backend signature verification, and persisted payment outcome checks
- bulk import check: 600 products imported through `/api/admin/products/bulk`, visible in both admin and public `/api/products`
- Phase 1.0 settings check: admin saved Razorpay/store/delivery settings, secret persisted encrypted, settings reload returned masked secret, readiness returned true, normal user received 403 on settings route
- Reference merge check: `/about`, `/contact`, `/terms-and-conditions`, `/shipping-policy`, `/admin/products/add`, `/admin/products/:id/edit`, and `/admin/orders` refresh to the SPA; admin product create/update remains visible via public product detail endpoint

## Bulk product import

In the admin panel, open Products and paste either:

```csv
name,sku,category,price,mrp,stock,images,tags,isPublished
Cotton Shirt,SP-001,Boys,799,999,40,https://example.com/image.jpg,"summer,cotton",true
```

or a JSON array:

```json
[
  {
    "name": "Cotton Shirt",
    "sku": "SP-001",
    "category": "Boys",
    "price": 799,
    "mrp": 999,
    "stock": 40,
    "images": ["https://example.com/image.jpg"],
    "tags": ["summer", "cotton"],
    "isPublished": true
  }
]
```

Published products appear immediately on the website because admin and storefront read the same persisted product store.

## Hostinger deployment

1. Upload the project folder to Hostinger Node.js hosting.
2. Do not upload `node_modules`. Preserve `data/` when updating an existing live store because it contains products, users, orders, settings, and transactions.
3. In hPanel Node.js settings, use:
   - Application root: uploaded project folder
   - Startup file: `index.js` or `server.js`
   - Start command: `npm start`
   - Node version: 18+
4. Run Hostinger's npm install action.
5. Set only bootstrap environment variables:
   - `NODE_ENV=production`
   - `JWT_SECRET=<long random secret>`
   - `SECRET_ENCRYPTION_KEY=<32-byte secret or 64-character hex secret>`
   - `ADMIN_EMAILS=owner@yourdomain.com`
   - optional `ADMIN_PHONES=9876543210`
   - optional `MONGODB_URI` for future MongoDB phase
   - `RAZORPAY_KEY_ID=<live key ID>`
   - `RAZORPAY_KEY_SECRET=<new rotated live key secret>`
   - recommended `RAZORPAY_WEBHOOK_SECRET=<webhook signing secret>`
   - `TWOFACTOR_API_KEY=<2factor.in API key>`
   - `VITE_FIREBASE_API_KEY=<Firebase web API key>`
   - `VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com`
   - `VITE_FIREBASE_PROJECT_ID=<project-id>`
   - `VITE_FIREBASE_STORAGE_BUCKET=<project-id>.appspot.com`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID=<sender ID>`
   - `VITE_FIREBASE_APP_ID=<Firebase web app ID>`
   - optional `VITE_FIREBASE_MEASUREMENT_ID=<Analytics measurement ID>`
   - `GOOGLE_CLOUD_PROJECT=<project-id>`
   - `FIREBASE_SERVICE_ACCOUNT_JSON=<complete service-account JSON>` for phone-login Firebase custom tokens
6. Start/restart the Node.js app.

After restart, open `/api/health`. It must return JSON with `"status":"ok"`.
If Hostinger still shows `503`, open the Node.js application logs and verify
that the application root contains `index.js`, `package.json`, `public/`, and
`node_modules/` after running the npm install action.

React refresh routing is handled by Express. If serving only `public/` from Apache, generated `public/.htaccess` provides the SPA rewrite fallback.

### Hostinger 503 checklist

If Hostinger shows `503 Service Unavailable`, the Node app did not start. Check these first:

- Application root points to the folder containing `index.js`, not the parent folder.
- Startup file is `index.js` or `server.js`.
- Run Hostinger's npm install action after upload.
- Node version is 18 or newer.
- Run npm install again after replacing an older deployment. The included
  `firebase-admin` version supports Node 18; stale dependencies from an older
  upload can still prevent startup.
- Set `ADMIN_EMAILS` so an admin account can be created.
- Set `JWT_SECRET` and `SECRET_ENCRYPTION_KEY` when possible. If `JWT_SECRET` is missing, the app now creates a strong fallback secret in `data/.jwt-secret` instead of crashing.

## Production notes

- JSON file storage is stable for one Hostinger Node.js instance. For high traffic or multi-instance hosting, migrate `lib/store.js` to MongoDB/Postgres using the same API surface.
- Configure real SMTP, OTP, Cloudinary, analytics, delivery, shipping/tax, and Razorpay keys in Admin -> Settings before going live.
- Keep `data/` backed up because it contains products, users, orders, settings, and transactions.
