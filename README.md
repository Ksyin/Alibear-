# AurumHome

A Vercel storefront with Firebase Realtime Database content, Firebase Authentication, Cloudinary product uploads and server-side M-Pesa checkout handlers. All project source files are in the repository root. Root-level Node.js handlers are routed to the public `/api/...` endpoints by `vercel.json`; there are no source subdirectories.

## Store pages

- Home: `/` or `/index.html`
- Shop: `/products.html` and individual `/product.html?id=...` pages
- Offers: `/deals.html`
- How it works: `/how-it-works.html`
- App: `/app-page.html`
- About: `/about.html`
- Journal (news and blog combined): `/blog.html`
- Contact: `/contact.html`
- Customer account: `/account.html`
- Owner dashboard: `/admin` or `/admin.html`

`/news.html` redirects to the combined journal. The owner dashboard is not linked in the public storefront navigation.

## Vercel setup

1. Import this project into Vercel and configure the repository root as the deployment root. `vercel.json` explicitly builds the root-level browser assets as static files and the root-level server handlers as Vercel Functions. `_lib.js` is included as a server-side dependency and is not published as a static asset.
2. Set the environment variables shown in `.env.example` in Vercel Project Settings. Keep the Firebase service-account JSON, Cloudinary API secret, Daraja secrets and email-provider key in Vercel environment secrets only.
3. Use a newly rotated Cloudinary API secret. The previously shared secret must not be reused.
4. Start with Daraja sandbox credentials. Configure `DARAJA_CALLBACK_URL` as the deployed `/api/daraja-callback` URL. Use production credentials only after the sandbox payment flow has been tested.
5. Publish `firebase.database.rules.json` in Firebase Console > Realtime Database > Rules.
6. Create the owner account with the authorized email, verify it, then sign in at `/admin`. The bootstrap API grants the admin claim only to that configured, email-verified address.

The browser Firebase configuration in `firebase-client.js` is public application configuration, not a server credential. Restrict its API key to the deployed site domains in Google Cloud/Firebase settings.

## Store management

The dashboard lets the verified owner manage products, journal posts, enquiries and editable storefront text. Product and journal images are uploaded to Cloudinary through short-lived server signatures; image files are limited to JPG, PNG or WebP and 8 MB.

The initial sample catalogue uses Unsplash images. New images uploaded in the dashboard are stored in Cloudinary; existing demo images are not automatically migrated.

## Payments, accounts and email

The server handlers recalculate checkout totals from the Firebase product catalogue, create a pending order and request an M-Pesa STK push. A customer can create an account after payment confirmation, verify their email and link the paid order using the same checkout email. Do not treat checkout as production-ready until Firebase Admin credentials, database rules and Daraja callback settings are deployed and tested.

Receipt emails are intentionally disabled until a verified custom-domain sender and Resend API key are configured. A Gmail address is not accepted as the Resend sender. The dashboard reports the email status for each order.

## Local checks

Use a static server for local storefront development. Firebase privileged APIs and M-Pesa checkout require Vercel Functions plus the corresponding environment settings. `npm install` installs the Firebase Admin SDK used by the root-level functions. Dependencies are installed by the deployment platform and are not committed as a nested project directory.
