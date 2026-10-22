# AurumHome – Smart Home Store

This is a static Vercel storefront. All pages, styles and scripts are stored directly in the project root; the project has no nested asset folders.

## Store pages

- Home: `/` or `/index.html`
- Shop: `/products.html`
- Offers: `/deals.html`
- How it works: `/how-it-works.html`
- App: `/app-page.html`
- About: `/about.html`
- Journal: `/blog.html`
- News: `/news.html`
- Contact: `/contact.html`
- Store dashboard: `/admin` or `/admin.html`

Vercel's `cleanUrls` setting keeps the `/admin` address working. Products, posts and enquiries can also be managed at `/admin.html`.

## Store data and dashboard

The example products, journal stories and news entries are in `data.js`. Store changes and customer messages are saved in the current browser's local storage, so they are not shared with other browsers or devices. Connect a database and a server-side authentication provider before using this as a production multi-user store.

The dashboard's default demonstration password is `admin123` in `admin.js`; replace it before deployment. This static password check is a convenience for a local demo, not secure production authentication.

Product and post photos can be added from the dashboard as image URLs or uploaded files. The home page includes a promotional image slideshow, a scrolling store announcement and links to the separate shop pages. The cart is shared between pages within the same browser tab.
