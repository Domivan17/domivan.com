# domivan.com

Static pages for domivan.com: the legal pages the app stores need, linked from both apps
(`src/lib/legal.ts`).

| URL | File |
| --- | --- |
| https://domivan.com/ | `index.html` |
| https://domivan.com/terms | `terms.html` (travellers, Domivan app) |
| https://domivan.com/transporter-terms | `transporter-terms.html` (Domivan Driver app) |
| https://domivan.com/privacy | `privacy.html` (both apps) |
| https://domivan.com/delete-account | `delete-account.html` (Google Play account deletion URL) |

All texts are **drafts**: fill in the highlighted `[PLACEHOLDERS]` (KvK, address, VAT,
support email, refund rules) and have a lawyer review them before launch.

## Hosting

This repo is private, so GitHub Pages can't serve it on the free plan. The site is plain
HTML with no build step, so any static host works. Default: a public repo
`Domivan17/domivan.com` holding the contents of this folder, with GitHub Pages on.

1. Create the public repo and copy this folder's files into its root (keep `CNAME`).
2. Repo Settings > Pages: deploy from branch `main`, folder `/`. Custom domain `domivan.com`,
   then tick Enforce HTTPS once the certificate is issued.
3. GoDaddy DNS for domivan.com: remove the default `@` A record (parked page) and add
   - `A @ 185.199.108.153`, `A @ 185.199.109.153`, `A @ 185.199.110.153`, `A @ 185.199.111.153`
   - `CNAME www domivan17.github.io`

   Leave MX and TXT records alone (email).

Pages serves `terms.html` at `/terms`, so the app links work without the `.html`.

## Home page and languages

The home page (`index.html`) and the Join Transporters sign-up page (`join.html`) exist in English and in Romanian, Polish, Bulgarian, Hungarian
and Spanish (`ro/`, `pl/`, `bg/`, `hu/`, `es/`). Don't edit those files by hand: change the copy
in `scripts/build-site.py` or the layout in `scripts/site-template.html`, then run
`python3 scripts/build-site.py`. Styles are in `landing.css`; the legal pages keep `style.css`.

The night map (`img/europe-night.webp`) is drawn by `scripts/make-night-map.py` from GeoNames
city populations (CC BY 4.0) and Natural Earth coastlines (public domain).

## Booking on the website (`/book`)

https://domivan.com/book is the Domivan client app built for the web: the same New trip,
sign-in (email code) and pay flow, on the same Supabase project and Stripe account. Don't edit
`book/`, `404.html` or `.nojekyll` by hand; rebuild them with `npm run build-web` after app
changes, then publish this folder as usual.

- Payment uses Stripe's Payment Element (cards, Apple Pay / Google Pay where the browser
  supports them, plus other methods the Stripe account has on). Bank redirects come back to
  `/book/order/<id>`.
- Addresses are looked up with OpenStreetMap Nominatim (free, no key, light use only). Switch to
  a paid geocoder before heavy traffic.
- `404.html` is a copy of the app so reloads on `/book/...` work on GitHub Pages; any other
  missing page goes to the home page. `.nojekyll` stops Pages from hiding the `_expo` folder.
- The booking screens are in English for now, like the apps.

## Join Transporters (`/join`)

https://domivan.com/join is the transporter sign-up: one question per frame (country, company
details, licence, fleet, van classes, routes, insurance, inspection, contact). Copy is in
`scripts/join_strings.py`, layout and logic in `scripts/join-template.html`; both are built by
`build-site.py`. Applications go to the Supabase table `transporter_applications`
(migration `20261017000000_transporter_applications.sql`): anyone can insert, nobody can read
through the API. Review them in the Supabase dashboard and set `status`.
