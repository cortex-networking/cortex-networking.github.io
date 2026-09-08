# cortexnetworking.com

Static site for Cortex Networking, LLC. Served by GitHub Pages from `main`. No build step.

Edit `index.html` / `styles.css`, open a PR, merge. Design tokens come from the Pattern Recognition design system (`design-tokens.css`); do not hardcode colors or spacing.

## Domain and DNS

Registered at Squarespace Domains (2-year term from 2026-09-07). DNS points the apex at GitHub Pages (four A + four AAAA records) and `www` at `cortex-networking.github.io`. HTTPS enforcement is toggled in the repo's Pages settings once GitHub issues the certificate.

## Files

- `index.html`, `styles.css` — the site
- `404.html` — not-found page (GitHub Pages serves it automatically)
- `favicon.svg`, `og.png` — icon and social share image (`og.png` is rendered from the same mark; regenerate with Playwright if the headline changes)
- `robots.txt`, `sitemap.xml`, `CNAME`, `.nojekyll`
