# AurumHome – Smart Home Store

This is a static storefront designed for Vercel. All site files are kept directly in the project root; there are no nested asset folders.

- Store: `https://YOUR-DOMAIN/`
- Admin: `https://YOUR-DOMAIN/admin` (change the default password in `admin.js` before deployment)
- Product data and image URLs: `data.js`; products can also be added from the admin page.

Product images can be remote URLs or uploaded through `/admin`. Store and admin data are saved in the current browser using local storage. For shared, multi-user data, connect a database such as Supabase, Vercel KV, or Firebase.
