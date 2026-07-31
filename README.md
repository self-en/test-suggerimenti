# test-suggerimenti

This repository was scaffolded by the **self-en** branch-preview platform. It's a
minimal Node/Express starter that already satisfies the platform's deploy
contract, so you get a live preview for every branch with no extra setup.

## How previews work

- Push any branch → GitHub Actions (`.github/workflows/ci.yml`) builds a Docker
  image and pushes it to `ghcr.io/self-en/test-suggerimenti/test-suggerimenti`, tagged with the
  immutable `sha-<short>` of the commit.
- The platform's ArgoCD `ApplicationSet` notices the branch and deploys the Helm
  chart in `chart/`, giving the branch its own preview at
  `http://<branch>-<repo-hash>.self-en.local/` and its own database.
- Delete the branch → the preview and its database are cleaned up automatically.

## Layout

- `server.js` / `package.json` — the app (edit these).
- `Dockerfile` — how the image is built.
- `chart/` — the Helm chart the platform deploys (Deployment + Service +
  HTTPRoute + a PreSync hook that creates this branch's database). You rarely
  need to touch this.
- `.github/workflows/ci.yml` — builds and pushes the per-branch image.

## Run locally

```bash
npm install
npm start   # http://localhost:3000
```
