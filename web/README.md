# Tisoro screen 09 — Angular frontend

"Your Tisoro Network Induction Ceremony Is Live" with the **Share Your Ceremony And Get Featured** card, built to
the design in `\\10.10.8.200\Documentation\Tisoro\social-media-sharing\social-media-share-flow.html`.

```bash
npm install
npm start          # https://127.0.0.1:4200 against the .NET API (see ../api/README.md)
npm run start:demo # same page with an in-browser fake backend; nothing is posted
npm run build
```

## Routes

| Route | |
|---|---|
| `/ceremonies/:ceremonyId/verify-share` | Partner screen 09 (the host app links here) |
| `/admin/ceremonies/:ceremonyId` | Tisoro admin: published → requested → shared and confirmed (asks for `ADMIN_KEY`) |
| `/oauth/callback` | Sign-in popup landing page |

## Structure

- `features/share/share.page.*` — the page and platform rows
- `features/share/share-dialog.component.*` — preview, "how do you want to share?", each step-by-step flow, and
  "View sharing steps" (the same step templates rendered small)
- `features/share/flow-steps.ts` — the steps for every platform and way of sharing
- `core/platforms.ts` — per-platform wording from the design
- `core/mock/` — the demo backend (`start:demo`). In the demo, an X username containing `fail` isn't found.
- `src/styles.scss` — the design system ported from the prototype (Archivo, crimson, buttons, pills, modal)
