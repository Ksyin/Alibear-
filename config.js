// All site settings live here, in the repo. Vercel only hosts the files.
// This file is server-side only: it is NOT in vercel.json "builds", so it is never served to browsers.
// Environment variables in Vercel, if set, override these values.
// Keep this repo PRIVATE: it contains secrets.
module.exports = {
  // Firebase: the service account key is read from firebase-service-account.json in this repo.
  FIREBASE_DATABASE_URL: 'https://alibearautomation-b95ab-default-rtdb.firebaseio.com',

  // Comma-separated emails that may open the admin dashboard.
  // Leave empty to let the FIRST account created on the admin page become the owner.
  ADMIN_EMAILS: '',

  // Leave empty: the site address is detected automatically (custom domain or *.vercel.app).
  PUBLIC_SITE_URL: '',

  // Paystack secret key (Paystack Dashboard > Settings > API Keys): sk_test_... or sk_live_...
  PAYSTACK_SECRET_KEY: 'sk_live_194ea9aed8efac2dc7c3f78ac9f0e1b4bd163778',
  PAYSTACK_PUBLIC_KEY: 'pk_live_b8f24e976df65f1be724cf90c5a24312a38f85d6',

  // Cloudinary (Cloudinary Dashboard > API Keys)
  CLOUDINARY_CLOUD_NAME: 'ygairs70',
  CLOUDINARY_API_KEY: '676566726953638',
  CLOUDINARY_API_SECRET: 'tS_3gw0S1R0aIJrgDDRh8pDx9cg',

  // Optional receipt emails (Resend)
  RESEND_API_KEY: '',
  RESEND_FROM: ''
};
