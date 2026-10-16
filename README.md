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
