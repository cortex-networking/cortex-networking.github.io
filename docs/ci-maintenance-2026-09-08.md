# CI and deployment maintenance

Updated 2026-09-08.

- Site CI runs locked Playwright checks at desktop and mobile sizes, checks
  npm advisories, and bundles only public site assets with hashes and a commit ID.
- Repository Safety checks workflow syntax and tracked-source secrets. It does
  not scan the entire Git history.
- Existing GitHub Pages remains configured to publish from main at the root,
  with HTTPS enforcement. Required PR checks must pass before merging; merging
  site changes to main is still the production deployment boundary.
- Draft Site Release reruns tests and safety checks for the same commit, then
  creates a draft containing the verified static bundle. It does not publish
  a release or change Pages configuration.
- Actions are full-SHA pinned; dependency updates are weekly. Default tokens
  are read-only and only the draft release job can write repository contents.
- Local verification: 2 browser tests passed; workflow lint passed.
