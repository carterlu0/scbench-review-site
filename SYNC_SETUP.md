# SCBench review site and sync

This public repository hosts the review website. The source problem catalog remains private in `carterlu0/scbench-rtl-problems`. GitHub Actions reads the private repository and commits a sanitized `data/problems.json` artifact here; browser code never receives the source-repository token.

## One-time setup

1. Create a fine-grained personal access token scoped only to `carterlu0/scbench-rtl-problems` with read-only Contents permission.
2. Add it to this repository as the Actions secret `SCBENCH_GITHUB_TOKEN`.
3. Run `Sync SCBench problems` once from the Actions page.
4. Enable GitHub Pages from `main` and the repository root.

The workflow runs every 15 minutes, supports manual `workflow_dispatch`, and accepts the `scbench-problems-updated` `repository_dispatch` event. The frontend checks the generated artifact every 60 seconds and again when the page becomes visible.

The synchronizer pins all reads to the current source `main` commit and records that commit in `data/problems.json`. If the source commit and problem data have not changed, it does not create another website commit.

## Immediate push-triggered sync

To trigger the site immediately after a source-repository push, copy `.github/workflows/source-notify-review-site.yml.example` into the private source repository, replace `REVIEW_SITE_OWNER` and `REVIEW_SITE_REPOSITORY`, and add a dispatch-capable `REVIEW_SITE_DISPATCH_TOKEN` secret there. The scheduled workflow remains the fallback.

## Local preview

The site can be previewed from the repository root with any static web server. Without `data/problems.json`, it displays the bundled snapshot and marks synchronization as unavailable.
