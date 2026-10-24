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

## Vercel setup

1. Import the project into Vercel with the repository root as the deployment root. `vercel.json` builds the root-level browser assets and deploys the root-level API handlers as Vercel Functions.
2. Set the variables in `.env.example` in Vercel Project Settings. Keep `FIREBASE_SERVICE_ACCOUNT_JSON`, `PAYSTACK_SECRET_KEY`, Cloudinary secrets and email-provider credentials in Vercel environment settings only.
3. Configure `PUBLIC_SITE_URL` with the exact HTTPS origin of the deployed storefront and configure `FIREBASE_DATABASE_URL` for the Realtime Database.
4. Enable Email/Password sign-in in Firebase Authentication and add the deployed domain to its authorized domains.
5. Publish `firebase.database.rules.json` in Firebase Console > Realtime Database > Rules.
6. Configure Cloudinary's API key and secret before enabling product-image uploads.
7. Configure `RESEND_FROM` with an address on a verified sending domain and add `RESEND_API_KEY` to enable order receipts.
8. In Paystack Dashboard > Settings > Webhooks, register `https://your-store-domain/api/paystack-webhook` so paid orders are confirmed even if the customer closes the checkout page before returning to the store.

The Firebase web-app configuration in `firebase-client.js` is public application configuration. Restrict its API key to the deployed site domains in Google Cloud/Firebase settings.

## Accounts and administration

The admin dashboard supports email registration, email verification, sign-in and password reset. The current bootstrap policy grants administrator access to **every email-verified account**. That gives any person who registers and verifies an email full control of the catalogue, journal and site content. Restrict the bootstrap policy before opening the dashboard publicly if that is not intended.

If Firebase reports invalid credentials, confirm the email and password or use the password-reset option. If the email is already registered, switch to sign-in and use the verification resend option if the account is not verified. Dashboard administration also requires the deployed Vercel API functions and `FIREBASE_SERVICE_ACCOUNT_JSON`; a static localhost server can display the login page but cannot grant admin access.

Customers create or sign in to an account from the checkout page before proceeding to Paystack. The same email address is used to connect the paid order to the account. Email verification is required to link an order from the account page.

## Payments and receipts

The Paystack secret is read only on the server from `PAYSTACK_SECRET_KEY`; do not add either Paystack key to browser code or commit a live secret. Checkout totals are recalculated from Firebase product prices by the server. Payment is marked paid only after the server verifies the transaction reference, amount, KES currency and customer email with Paystack.

The server sends a receipt after successful verification when a verified Resend sender is configured. Receipt delivery status is saved with the order; a successful payment remains paid if email delivery is unavailable or fails. Never test a live charge without authorization for the specific amount and payment method.

## Store management

The dashboard manages products, journal posts, enquiries and editable storefront text. Product and journal photos are uploaded to Cloudinary through short-lived server signatures; JPG, PNG and WebP images up to 8 MB are accepted. The starter catalogue uses Unsplash images and is not automatically migrated to Cloudinary.

## Local checks

Use a static server for storefront development. Firebase privileged APIs and Paystack checkout require Vercel Functions and their environment settings. `npm install` installs the Firebase Admin SDK used by server handlers.
