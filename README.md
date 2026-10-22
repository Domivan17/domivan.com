# domivan.com

Static pages for domivan.com: the home page, Join Transporters, and the legal pages the app
stores need, linked from both apps (`src/lib/legal.ts`).

| URL | File |
| --- | --- |
| https://domivan.com/ | `index.html` |
| https://domivan.com/terms | `terms.html` (travellers, DomiVan app) |
| https://domivan.com/transporter-terms | `transporter-terms.html` (DomiVan Driver app) |
| https://domivan.com/privacy | `privacy.html` (both apps) |
| https://domivan.com/delete-account | `delete-account.html` (Google Play account deletion URL) |

All texts are **drafts**: fill in the highlighted `[PLACEHOLDERS]` (KvK, address, VAT,
support email, refund rules) and have a lawyer review them before launch.

## Hosting

This repo is private, so GitHub Pages can't serve it on the free plan. The site is plain
HTML (built ahead of time by `scripts/build-site.py`), so any static host works. Default: a public repo
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

The home page (`index.html`) and the Join Transporters sign-up page (`join.html`) exist in English and in Romanian, Polish, Bulgarian, Hungarian,
Spanish, French, German, Dutch and Portuguese (`ro/`, `pl/`, `bg/`, `hu/`, `es/`, `fr/`, `de/`, `nl/`, `pt/`),
the same ten languages as the apps. The legal texts are English only; each language
also gets a copy inside its own header (`ro/terms.html`, ...), so a visitor who opens the terms
from a Romanian page stays in Romanian, and those copies point search engines to the English
page (canonical). Don't edit the
generated `.html` files by hand: change the copy in `scripts/build-site.py` (home),
`scripts/join_strings.py` (Join), `scripts/account_strings.py` (Log in / Create account),
`scripts/book_strings.py` (booking steps), `scripts/invite_strings.py` (invite links) or
`scripts/trips_strings.py` (My trips), the
legal texts in `scripts/legal/*.html`, or the layout in `scripts/layout-template.html` (header and
background shared by every page), `scripts/site-template.html`, `scripts/join-template.html` and
`scripts/legal-template.html`; then run `python3 scripts/build-site.py`. Styles for every page are in
`landing.css`; the page script is `site.js` and the background animation is `hero-net.js`
(both hand-written, no build step).

The night map (`img/europe-night.webp`) is drawn by `scripts/make-night-map.py` from GeoNames
city populations (CC BY 4.0) and Natural Earth coastlines (public domain).

## Background: Connected Europe

`hero-net.js` tilts the night map into a holographic table (a grid running off to a horizon)
and runs a live network over it: the routes draw themselves at first, then gold trips run from
the home countries to the west (some blue ones back east), with arrival rings, short pillars of
light on the home cities and a slow scan band. Desktop mice tilt it slightly. It is one canvas
and one animation loop, started once per visit; it pauses while the tab is hidden, caps the
pixel ratio at 2, and with reduced motion shows one still frame. Its lights stay off the copy
(a lit route that crosses a line of text or the store badges fades there) and dim under glass
and panels: it measures them again when `site.js` slides a page or the
account card in (`dvNet.relayout()`), when something on the page changes size, on resize and
as the page scrolls over the fixed map. No glow or outline is drawn along coastlines or borders.
Tuning knobs (camera, speeds, colours) are listed at the top of each section of the script.

## The app's menu and the panels

The site works like the DomiVan client app: its menu floats at the bottom (New trip, My trips,
Profile, the open one in gold), and everything else slides in as a panel over the page, which
stays where it is. On computers the panel is a frame on the right, between the header and the
menu, with the page dimmed behind it; on phones it fills the screen under the header and the
night map shows behind it, as in the app. Steps inside a panel slide sideways; the back arrow,
Back and Forward walk them; the cross, Escape, a click beside the panel or Back from its first
view close it. With reduced motion turned on, panels and steps fade instead.

| Address | Panel | Opened by |
| --- | --- | --- |
| `#login` | Log in / Create account, or Profile once signed in | Profile in the menu, the header button |
| `#login/details`, `/invoices`, `/invite`, `/language`, `/help`, `/delete` | Profile's steps | Profile |
| `#login/terms`, `#login/privacy` | a legal page under Profile | Profile |
| `#trips`, `#trips/<id>` | My trips, one trip | My trips in the menu, Profile |
| `#join` | Join Transporters (the form of `/join`) | the Transporters buttons |
| `#terms`, `#transporter-terms`, `#privacy`, `#delete-account` | a legal page | the footer links |

New trip is Book your trip on the home page (from another page it goes home). Join Transporters
and the legal pages stay real pages too (`/join`, `/terms`, ... in every language), for links,
search engines, the apps and the stores: opened directly they show as before; clicked on the site
they open as panels, with their own page's content (fetched once, in the page's language). Help
shows the home page's questions. Profile › Language opens the same page in another language,
back on Profile.

Pages: every page shares one header and the fixed night map. A language link fetches the page in
that language and slides it in (Back slides the other way), so the header and the background
(and its animation) never reload; it keeps the address bar, title, language and Back/Forward
working, and falls back to a normal page load if anything fails (and for `/book`, which is the app).

## Log in / Create account

Profile (and the header button) opens the account card in the panel (address `#login`). Google
and Apple come first, then email with a one-time code. It talks to the same
Supabase project as the app (`/auth/v1`, publishable key in `site.js`) and stores the session
the way supabase-js does, so `/book` sees the same sign-in.

On phones (the one-column layout, up to 860 px wide) the home page opens like the app: below the
header there is only the "Western Europe ⇄ Eastern Europe" label, then the account card on Log in
(no back arrow), then the App Store and Google Play badges, and no menu yet (the app's first
screen has none either). The headline and the lead are hidden there (the headline stays for
screen readers). Once signed in, the card slides on to Book your trip and the menu comes; logging
out brings the account card back. A panel opened meanwhile (Join Transporters, a legal page)
borrows the card and gives it back when it closes. Computers and tablets in the two-column layout
keep Book your trip first, with the menu. With `DRIVER_APP.live` (`site.js`) on, the Transporters
buttons take iPhones and iPads to the DomiVan Driver app in the App Store and Android phones to it
on Google Play; it is off until both store pages are public (on 2026-10-21 both answered 404), so
every button opens Join Transporters.

Supabase setup it needs (Authentication in the dashboard):

- URL Configuration: add `https://domivan.com/**` (and `https://www.domivan.com/**`) to the
  Redirect URLs, so Google and Apple can come back to the page you started on.
- Providers: turn on Google and Apple. Until they're on, the buttons say so and point to email.
- Email: the sign-in emails must show the code (`{{ .Token }}`), as the app already needs.
- Email: set the minimum interval between emails to one address to 30 seconds (Supabase's
  default is 60). The card offers a new code after 30 s; with the default, a resend before
  60 s is refused and the card counts down the seconds Supabase asks for instead.
- Privacy Policy: before turning on Google and Apple, add that signing in with them shares the
  name and email of that account, and list Google and Apple as sign-in providers (the lawyer's
  wording; the policy now only mentions one-time codes).

## Profile and My trips

Signed in, the panel is the account, like the app's Profile: the name and email, tiles for My
trips, Invoices and Help, then Account (Personal details; Invite code during the 7 days after
signing up, before the first booking, `referral_window()`), Website (Language, Terms, Privacy),
Log out and Delete account. Most of its words are the client app's own (`APP_TEXTS` in
`scripts/panel_strings.py`, read from `src/i18n/<lang>.json`). The header button opens Profile, and
closes it again when it already shows Profile. A link to `#trips` opened signed out shows Log in
first and then My trips.

- Personal details: name, phone and the invoice details (company, VAT number, billing address),
  saved to the visitor's own `profiles` row (the columns the app may change too).
- Invoices: every invoice and credit note of the account, newest first (a PDF in a new tab, as in
  a trip).
- Invite code: `apply_referral_code`, as an invite link does.
- Delete account: the app's question, then `delete-account`, which waits while a trip, payout,
  refund or invoice is still to come and says which (the apps' words); after it, this browser is
  signed out.

- My trips: upcoming trips (soonest first), then past ones, each with its status, route, pickup
  time and price. Trips whose payment never went through are left out, except the one just booked.
- One trip: status, route, pickup, passengers, bags, van class, the price paid and the note, then
  what happens next; the transporter (name, company, van and a Call button) from 24 hours before
  pickup, as in the app (`trip_contact`); the pickup code; Report a problem from pickup until the
  transporter is paid (`report_trip_problem`); invoices and credit notes (PDF in a new tab through a
  link that works for five minutes); and Cancel while no transporter has accepted (`cancel-order`,
  full refund). An open trip is read again every minute.
- It reads trips through `my_trips()` as the signed-in client, which returns only the client's own
  amounts, never the transporter's payout. Signed-in users cannot read the amount columns of
  `orders` directly (`20261018210000_private_amounts.sql`).

## Booking on the home page

Book your trip does the whole booking in place: See price slides in the price step, Pay the
payment step, and paying the booked step, all inside the card (the page never changes, and the
card keeps its size). Back and the card's back arrow go one step back.

- Address suggestions while typing, as in the apps: Photon (komoot), with Nominatim when Photon
  finds nothing; both OpenStreetMap based, free, no key. Picking one keeps that exact place.
- The price step shows each van class with its price (Standard, Large, Luxury; a class without
  room for the passengers is greyed out), a note for the transporter and Pay. The prices come
  from a copy of `supabase/functions/_shared/pricing.ts` in `site.js` (`RATES`, `VAN`): change
  both together. The server prices the order again (`create-order`), and that is what is paid.
- Signed out, Pay reads "Log in to pay": the panel opens on Log in, and once signed in it closes
  with Book your trip already on the payment step. Google and Apple leave the page,
  so the trip waits in `sessionStorage` (`domivan-trip`) and comes back with the visitor.
- Payment: `create-order` (as the signed-in visitor) creates the order and its PaymentIntent,
  then Stripe's Payment Element opens in the card (Stripe.js from js.stripe.com, test key in
  `site.js`, in the page's language). Cards finish in place; bank redirects come back to the same
  page with `?booked=<order>`, which shows the booked step (or the price step if it failed).
- Booked: the trip in short, My trips (in the same card, the new trip at the top) and Book another trip.
- Switching Stripe to live means the live publishable key in `site.js` too.

## The web app (`/book`)

https://domivan.com/book is the DomiVan client app built for the web: the same New trip,
sign-in (email code) and pay flow, on the same Supabase project and Stripe account. Don't edit
`book/`, `404.html` or `.nojekyll` by hand; rebuild them with `npm run build-web` after app
changes, then publish this folder as usual.

- Payment uses Stripe's Payment Element (cards, Apple Pay / Google Pay where the browser
  supports them, plus other methods the Stripe account has on). Bank redirects come back to
  `/book/order/<id>`.
- Addresses are looked up with OpenStreetMap Nominatim (free, no key, light use only). Switch to
  a paid geocoder before heavy traffic.
- `404.html` is a copy of the app so reloads on `/book/...` work on GitHub Pages; invite links
  (`/r/CODE`) go to the home page with the code and any other missing page goes to the home
  page. `.nojekyll` stops Pages from hiding the `_expo` folder.
- The booking screens are in English for now, like the apps.

## Join Transporters (`/join`)

https://domivan.com/join is the transporter sign-up: one question per frame (country, company
details, licence, fleet, van classes, routes, insurance, contact). On the site it opens as a panel
(`#join`). "Where do you drive to?" offers 16 countries (`JOIN_DESTINATIONS` in `build-site.py`):
Germany, the Netherlands, Belgium, France, the UK, Spain, Italy and Switzerland, and since
2026-10-21 Austria, Czechia, Denmark, Sweden, Ireland, Portugal, Luxembourg and Greece. The
database takes the same list (`20261022160000_join_destinations.sql`): go live with that migration
before the pages, or an application naming a new country is refused. Once sent, the form shows the
DomiVan Driver app's store buttons ("coming soon" until `DRIVER_APP.live`).

The home page's Drive with DomiVan section has "How DomiVan Driver works" (Offers, Bundle runs,
Payouts, VIT partners; `scripts/driver_strings.py`, never the platform fee) and the same store
buttons. Copy is in
`scripts/join_strings.py`, layout in `scripts/join-template.html` (built by `build-site.py`),
logic in `site.js`. Applications go to the Supabase table `transporter_applications`
(migration `20261017050000_transporter_applications.sql`): anyone can insert, nobody can read
through the API. Review them in the Supabase dashboard and set `status`.

The technical inspection question was removed. **Apply migration
`20261017210000_drop_inspection_requirement.sql` to the live project before publishing the
site**: until then the `technical_inspection` column is required, and every application sent
without it is refused.

## Invite links (`/r/CODE`)

A VIT partner's QR code and link open `https://domivan.com/r/CODE` (also `/ro/r/CODE` and the
other languages). There is no such page: `404.html` sends it to the home page in that language, or
the browser's language, with `?r=CODE`. `site.js` looks the code up (`referral_code_info`), keeps
it in `localStorage` (`domivan-referral`, 30 days), takes it out of the address bar and shows an
invite panel under the lead (on phones above the card): "Ana invited you to DomiVan. How do you
want to use DomiVan?". A code that is not valid shows a short note and is dropped. Copy is in
`scripts/invite_strings.py`.

- I want to travel: goes to Book your trip (on phones to the account card, on Create account).
  Once the visitor is logged in, now or on a later visit, the code is added to the account
  (`apply_referral_code`) and the panel says so, or why not (only in the first 7 days after
  sign-up and before the first booking, never your own code, and the first code stays).
- I'm a transporter: on phones it offers the DomiVan Driver app. The Google Play link carries the
  code (`&referrer=vit%3DCODE`), which the app reads after the install; the App Store button copies
  `domivan.com/r/CODE` for the Paste button on the app's sign-up screen. Computers go to Join
  Transporters, which shows the invite and sends the code with the application
  (`transporter_applications.referral_code`); the Driver app offers it to the same email at sign-up.
- `/book` (the web app) reads the same `domivan-referral` key.

Apply migration `20261018133700_vit_signup_code.sql` (after the VIT referral migrations) before
publishing the site. Until then Join Transporters sends the application again without the code.
Publish `404.html` with the rest of the folder.

### The DomiVan app opens them (`.well-known`)

On a phone with the DomiVan app (`eu.domivan.app`), `https://domivan.com/r/CODE` opens the app's
invite page instead of this site, as `domivan://r/CODE` does: signed in, Profile › Invite code with
the code filled in; signed out, the code waits on the phone for sign-up. Without the app (or with only
DomiVan Driver) everything above runs as before. Only `/r/` paths open the app; every other page stays
in the browser. The app side is in `app.config.ts` (`inviteLinks`) and `src/lib/app-links.ts`.

- `.well-known/assetlinks.json` (Android App Links): the package and the SHA-256 fingerprints of its
  two signing keys, Play App Signing (what Play installs) and the upload key (EAS builds installed by
  hand). Play Console › the DomiVan app › Test and release › App integrity › App signing shows both.
- `.well-known/apple-app-site-association` (iOS Universal Links): team `W6TTC4LBQY`, bundle id
  `eu.domivan.app`, components `/r/*` only. No file extension; Pages serves it as
  `application/octet-stream`, which Apple accepts (its docs ask only for HTTPS, no redirect).
- `.nojekyll` keeps Pages from hiding the dot folder (`.well-known/security.txt` is served the same way).
  Both files must be live **before** a build with them is installed: Android checks `assetlinks.json`
  at install, and iOS asks Apple's CDN for the association file then. A phone that installed too early
  may open the links in the browser until the app is updated or reinstalled.
- After publishing: `https://domivan.com/.well-known/assetlinks.json` answers 200 with
  `application/json`, Google's checker
  `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://domivan.com&relation=delegate_permission/common.handle_all_urls`
  lists `eu.domivan.app`, and `https://app-site-association.cdn-apple.com/a/v1/domivan.com` shows the
  file (Apple's CDN can take up to a day to pick up a change).
- `scripts/app-tests/app-links.test.mjs` checks that both files, `app.config.ts` and `eas.json` name the
  same app.
