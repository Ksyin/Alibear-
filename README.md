# Alibear Automation

A Vercel storefront using Firebase Realtime Database and Authentication, Cloudinary product images and server-side Paystack payments. Project source files are kept in the repository root; the Vercel configuration routes root-level function files to `/api/...`.

## Store pages

- Home: `/` or `/index.html`
- Shop and product details: `/products.html` and `/product.html?id=...`
- Offers: `/deals.html`
- How it works: `/how-it-works.html`
- App: `/app-page.html`
- About: `/about.html`
- Journal: `/blog.html` (news and blog are combined)
- Contact: `/contact.html`
- Customer account: `/account.html`
- Account-first checkout: `/checkout.html`
- Store dashboard: `/admin.html`

## Project layout

Everything is in the repo root, no subfolders: HTML pages, `style.css` and browser JS (static), plus the serverless handlers (`bootstrap-admin.js`, `cloudinary-sign.js`, `contact-message.js`, `link-order.js`, `paystack-*.js`, shared `_lib.js`) that `vercel.json` routes to `/api/<name>`.

## Deploy (GitHub → Vercel, no Vercel settings needed)

All settings live in the repo: `config.js` (Paystack, Cloudinary, admin emails, Resend) and `firebase-service-account.json` (Firebase Admin key). Keep the repo **private**. Vercel env vars, if you ever set them, override `config.js`.

1. Fill the empty values in `config.js` (at least `PAYSTACK_SECRET_KEY` for checkout, Cloudinary key and secret for image uploads).
2. Push to GitHub. In Vercel import the repo, framework **Other**, no build command, no output directory.
3. Open `https://your-site/api/status` to confirm Firebase and the settings load.
4. Firebase Console > Authentication: enable Email/Password and add your domain and `*.vercel.app` under Settings > Authorized domains.
5. Publish `firebase.database.rules.json` in Realtime Database > Rules.
6. Paystack Dashboard > Settings > Webhooks: `https://your-domain/api/paystack-webhook`.

The Firebase web-app configuration in `firebase-client.js` is public application configuration. Restrict its API key to the deployed site domains in Google Cloud/Firebase settings.

## Accounts and administration

The dashboard supports email sign-up, sign-in and password reset. Email verification is optional and never blocks login. The **first account created becomes the store owner**; afterwards only emails listed in `ADMIN_EMAILS` (Vercel env, comma-separated) can become administrators. Everyone else is a shopper account (`/account.html`, `/checkout.html`) and gets a clear message on the admin page. Verification emails need your domain under Firebase Console > Authentication > Settings > Authorized domains; until then sign-up still works.

If Firebase reports invalid credentials, confirm the email and password or use the password-reset option. If the email is already registered, switch to sign-in and use the verification resend option if the account is not verified. Dashboard administration also requires the deployed Vercel API functions and `FIREBASE_SERVICE_ACCOUNT_JSON`; a static localhost server can display the login page but cannot grant admin access.

Customers create or sign in to an account from the checkout page before proceeding to Paystack. The same email address is used to connect the paid order to the account. Email verification is required to link an order from the account page.

## Payments and receipts

The Paystack secret is read only on the server from `PAYSTACK_SECRET_KEY`; do not add either Paystack key to browser code or commit a live secret. Checkout totals are recalculated from Firebase product prices by the server. Payment is marked paid only after the server verifies the transaction reference, amount, KES currency and customer email with Paystack.

The server sends a receipt after successful verification when a verified Resend sender is configured. Receipt delivery status is saved with the order; a successful payment remains paid if email delivery is unavailable or fails. Never test a live charge without authorization for the specific amount and payment method.

## Store management

The dashboard manages products, journal posts, enquiries and editable storefront text. Product and journal photos are uploaded to Cloudinary through short-lived server signatures; JPG, PNG and WebP images up to 8 MB are accepted. The starter catalogue uses Unsplash images and is not automatically migrated to Cloudinary.

## Local checks

Use a static server for storefront development. Firebase privileged APIs and Paystack checkout require Vercel Functions and their environment settings. `npm install` installs the Firebase Admin SDK used by server handlers.
