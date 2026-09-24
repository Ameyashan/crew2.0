# Jugaadu Chrome extension

Fills job application forms on Greenhouse, Ashby, and Lever with the tailored
resume + drafted answers the Jugaadu crew already produced for that job, and
records the real submission back into `job_applications` (status `submitted`).
Autofill-with-review: the human always clicks Submit.

## Dev loop

```bash
npm run ext:build          # dev build → extension/dist (API = http://localhost:3000)
npm run ext:watch          # rebuild on change
npm run ext:build -- --prod  # prod build (API = https://jugaadu.app, localhost stripped)
```

1. `npm run dev` (the web app) and `npm run ext:build`.
2. chrome://extensions → Developer mode → Load unpacked → `extension/dist`.
3. Sign in to the app, go to `/app/settings/extension`, click **Connect
   extension**. The page pushes the token via `externally_connectable`; if the
   handshake can't reach the extension, paste the shown one-time code in the
   popup instead.
4. Open a Greenhouse/Ashby/Lever application page for a job you've composed —
   the panel appears and fills on request (or via the popup's "Fill this page").

The `key` in manifest.json pins the extension id to
`hgmpacoefpcpjimjgfigflalgggebbdf` (set `NEXT_PUBLIC_EXTENSION_ID` to this so
the connect page can message it). It is a public key only — no private key is
needed for unpacked loading.

## How it talks to the app

All API calls happen in the background service worker with a `jga_…` bearer
token (`/api/ext/*`, see `src/lib/ext-auth.ts` in the app). Content scripts
never fetch the API — they'd be CORS-blocked under the ATS page's origin — and
message the worker instead. The token can only read the application package,
draft answers for essay boxes the run hasn't answered yet (`/api/ext/answers`,
saved back onto the application), and mark applications submitted.
