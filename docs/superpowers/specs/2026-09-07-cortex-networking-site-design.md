# Cortex Networking site — design

Date: 2026-09-07. Status: approved in chat.

## Purpose
Credibility page for Cortex Networking, LLC (Puerto Rico, Act 60 export services).
Audience: clients doing due diligence, bank, decree reviewers. Not lead generation.

## Decisions
- Hosting: GitHub Pages from `main`, no build step. Squarespace Domains holds `cortexnetworking.com` and DNS only.
- Repo: `cortex-networking/cortex-networking.github.io` under a dedicated GitHub org, so no personal account appears in the URL or history.
- Privacy: no principal name anywhere on the site. Footer legal line: "Cortex Networking, LLC". No analytics, no third-party scripts, no forms.
- Contact: `mailto:hello@cortexnetworking.com`. Requires email forwarding on the domain (Squarespace Domains, free).
- Design (revised 2026-09-07 at user request): conventional professional look, not bound to Pattern Recognition tokens. Light only, navy ink + harbor-blue accent, IBM Plex Serif headings + Plex Sans body via Google Fonts, self-contained styles.css.
- Rejected: Astro/Eleventy (no content volume yet); Squarespace builder (monthly fee, no version control).

## Files
- `index.html` — the page
- `styles.css` — page styles, tokens only, no hardcoded colors
- `CNAME` — `cortexnetworking.com`
- `.nojekyll` — disable Jekyll processing

## DNS (enter in Squarespace Domains)
A @ 185.199.108.153 / 185.199.109.153 / 185.199.110.153 / 185.199.111.153
AAAA @ 2606:50c0:8000::153 / 8001::153 / 8002::153 / 8003::153
CNAME www cortex-networking.github.io

## Verification
`/wintermute` token + contrast check, W3C HTML validation, Playwright screenshots at 390px and 1280px, `curl -I https://cortexnetworking.com` after DNS.
