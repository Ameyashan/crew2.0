# Jugaadu Visual Reskin — Implementation Plan

## Context

The Jugaadu app's functionality is done; it needs a new look. `design_handoff_jugaadu_reskin/Jugaadu Prototype.dc.html` (a static HTML design reference — not code to copy, inline styles carry the exact spec) plus its `README.md` define the target: a warm, minimal paper aesthetic (soft cards, thin borders, subtle shadows, Newsreader serif + IBM Plex Mono labels) replacing the current "paper-craft/stamp" look (hard offset shadows, double borders, JetBrains Mono). This is a presentation-only reskin — all routes, Supabase queries, auth logic, agent runs, and business logic stay as they are, with one explicitly-scoped exception (the signed-out Desk, below).

Two facts drive the plan's shape:

1. **Colors/typography today are JS-object-driven, not CSS-token-driven.** `src/components/paper/palette.ts` (`PAPER_L`/`PAPER_D`) + `src/components/paper/use-paper-theme.ts` (`usePaperTheme() → {p, t, setTweak}`, persisted to `localStorage["crew.theme.v1"]`) are consumed via inline `style={{background: p.card}}` across ~15 files, not Tailwind classes. `src/components/paper/primitives.tsx` (`PaperCard`, `InkButton`, `PageHead`, etc.) bakes in the *old* aesthetic (hard offset shadows, double borders) — repointing palette values alone won't produce the new look; primitives themselves must be rewritten.
2. **The app shell is a 252px left sidebar** (`src/components/paper/sidebar.tsx`'s `SidebarV3`, nav = compose/jobs/today/resume/people/history/settings + a "Coming soon" agent-teaser rail) — the new design is a top bar with 4 nav pills (Desk/Jobs/Story/People) + account popover. This is a structural rebuild, not just paint.

### Decisions already made (do not revisit)
- **Dark mode**: drop entirely — remove the dark/light toggle and density/motion/variant/foreground tweaks from Settings; keep the functional `followup_days` setting.
- **Today & Settings**: reskin in place with new tokens, drop from the 4-pill nav, reachable via the account popover ("Settings" link) or direct URL.
- **History**: repurpose `/app/history` as a reskinned "view all runs" + per-run detail page, linked from a "view all" affordance on Desk; drop from the main nav.
- **Coming-soon rail / changelog link**: drop entirely from the new top bar (matches the prototype's actual chrome).
- **Primitives migration**: gradual, file-by-file. Add new token-based primitives in Phase 1 alongside the untouched old ones; each phase migrates only the files it's already touching. Old and new styles briefly coexist across pages between phases — expected and fine.
- **Signed-out Desk + blur gate**: include it, but as its own explicitly-reviewed sub-step inside Phase 4, since it requires loosening the current hard server-side auth redirect (`src/app/app/layout.tsx` does `redirect("/")` for any signed-out request today) and adding `pendingRun` persistence across the OAuth + onboarding redirect. This is flagged separately because it's the one piece of this project that is not purely presentational.

---

## Screen ↔ Route Mapping

| Prototype screen | Route / component | Notes |
|---|---|---|
| 1. Top bar | `src/app/app/app-shell.tsx` + new `src/components/paper/top-bar.tsx` (replaces `SidebarV3` as the desktop chrome) | Structural rebuild: sidebar → top bar |
| 2. Desk | `src/app/app/compose/page.tsx` (`ComposeV3`, first-time grid, earlier-runs rows) | Reskin in place |
| 3. Google OAuth chooser | **No production counterpart — do not build a fake chooser.** Real OAuth via `signInWithGoogle()` (`src/lib/supabase-browser.ts`) + `src/app/auth/callback/route.ts`. Only recreate the post-redirect "Setting up your Desk…" loading state. | |
| 4. Onboarding (3 steps) | `src/app/onboarding/page.tsx` | Already structurally 3-step; reskin in place |
| 5. Run view (steps/panels/blur gate/thin-Story) | `src/app/app/compose/page.tsx` — `RunCard`, `AgentChecklistV3`/`AgentRowV3`, `PackageV3`/`PersonPackage`/`JobPackage`, `ResumeModal`/`AtsBadge`, `EmailOptions`/`TierBadge`, `AnotherAngle`/`SteerDraft` | Blur gate + thin-Story are net-new states |
| 6. Jobs (feed + detail) | `src/app/app/jobs/page.tsx`, `src/app/app/jobs/[id]/page.tsx` (+ `jobs/preferences/page.tsx`) | Direct reskin |
| 7. Story | `src/app/app/resume/page.tsx` (despite the route name, this is the "Story" feature) | Direct reskin; thin-Story flag derived here too |
| 8. People | `src/app/app/people/page.tsx` | Direct reskin |
| 9. Past run detail | `src/app/app/history/page.tsx` (repurposed) | Existing `composeRuns`/`resumeRuns` fetch covers this |
| — (no prototype screen) | `src/app/app/today/page.tsx`, `src/app/app/settings/page.tsx` | Reskin in place, drop from nav |

No prototype screen is left unmapped.

---

## Phase 1 — Design tokens

**Files touched:** `src/app/globals.css`, `src/app/layout.tsx`, `src/components/paper/fonts.ts`, new `src/components/paper/tokens.ts`, new `src/components/paper/primitives2.tsx` (name TBD at implementation time — a parallel file to the existing `primitives.tsx`, not a replacement of it yet).

1. **`globals.css`**: add the new color set as CSS custom properties, prefixed to avoid collision with the legacy block (e.g. new `--color-ink` cannot reuse that bare name — legacy `--color-ink: #1a1f1c` already exists — use a distinct prefix). Leave the legacy `--color-cream*/ink/clay/line` block completely untouched (it's isolated to `(legacy)` routes + `.row-active`); add one clarifying comment marking the split. Add the `pulse` keyframe (`0%,100%{opacity:1}50%{opacity:.35}`) — distinct from the existing `pulseDot` (which also scales); keep `pulseDot`/`shimmer` as-is since other not-yet-migrated files still use them. Keep `fadeUp` (already matches the prototype).
2. **Fonts**: add `IBM_Plex_Mono` in `layout.tsx` via `next/font/google` (weights 400/500, its own `variable`), following the exact pattern already used for `Newsreader` — check `node_modules/next/dist/docs/` for this Next.js version's `next/font/google` API/deprecations first, per AGENTS.md. Add-only; do not remove any existing font declarations (other pages still depend on them). Add a new export in `fonts.ts` alongside the existing `PAPER_FONTS`.
3. **Tokens module**: create `src/components/paper/tokens.ts` exporting a flat, dark-mode-free token object (plain hex constants — no hook, no `localStorage`, no dark variant, since dark mode is being dropped) covering every color in the README's Design Tokens section.
4. **Primitives**: add new, separately-named primitives (soft card look — thin 1px borders, `border-radius` per the 14/16/10-12/8-9/99px scale, shadow scale from the README, no hard offset shadows) consuming the new token object. Leave `primitives.tsx`/`palette.ts`/`use-paper-theme.ts` completely untouched — nothing imports the new files yet.

**New UI states:** none (foundation only).

**Visual verification:** every existing page (`/app/compose`, `/app/jobs`, `/app/resume`, `/app/people`, `/app/settings`, `/(legacy)/compose`) should render byte-identical to before this phase — nothing consumes the new tokens/primitives yet. Confirm IBM Plex Mono loads in devtools. Confirm legacy routes untouched.

---

## Phase 2 — App shell (top bar)

**Files touched:** `src/app/app/app-shell.tsx` (drop the `252px 1fr` sidebar grid, become a single column with a top bar), new `src/components/paper/top-bar.tsx`, `src/components/paper/sidebar.tsx` (retire as desktop chrome; keep only if still needed for a mobile drawer — decide during implementation based on whether pill-wrap is usable at min-supported width).

- Top bar: wordmark ("Jugaadu" + optional Hindi accent, reuse `public/jugaadu-logo.svg`/`jugaadu-mark.svg` if preferred), nav pills (Desk/Jobs/Story/People only — Today/Settings/History drop from the pill row per the decisions above), "● crew running" pulsing chip (reuse `useRuns()` from `src/lib/runs-store.ts` and the exact `activeRuns`/`runsTarget` logic already in `sidebar.tsx`), account popover (name/email/"SIGNED IN WITH GOOGLE" label/Sign out/Settings link — reuse the existing name-resolution `useEffect` from `sidebar.tsx` verbatim), signed-out variant (wordmark + solid "Sign in" pill only, no nav pills).
- No new wiring: this phase re-points existing data (`useRuns()`, the existing profile-name fetch, existing `usePathname`-based active-route detection) at new markup.
- Mobile: no prototype spec exists. Try nav-pill wrap/scroll under the wordmark first (simplest); fall back to keeping the existing drawer mechanics (backdrop, transform, scroll-lock) feeding the new pill list only if wrapping proves unusable.

**Visual verification:** click through all 4 pills, confirm active-pill styling and correct route highlighting; open the account popover, confirm real session name/email and a working Settings link; start a run and confirm the pulsing chip appears from every route and navigates correctly; sign out and confirm the bar collapses to wordmark + Sign in; confirm Today/Settings/History are gone from the pill row; test at mobile width.

---

## Phase 3 — Desk + composer

**Files touched:** `src/app/app/compose/page.tsx` (`ComposeV3` ~L65, `PasteFieldV3` ~L330, `RunCard` ~L171), `src/app/app/history/page.tsx` (reuse its `composeRuns`/`resumeRuns` fetch + `hydrateRun` pattern for Desk's "earlier runs" — don't duplicate the fetch, share it), `src/app/app/resume/page.tsx` (read-only, to confirm the entries shape for thin-Story derivation).

- **Screenshot attach**: `PasteFieldV3` already has `screenshot`/`setScreenshot` state, file-type/size validation, and an attached-file chip — build the missing pieces on top: attach popover (322px, 3 sample-screenshot rows), paste (⌘V) and drag-drop handlers (amber border+shadow on drag-over) that funnel into the existing `setScreenshot(...)` call. Restyle the existing chip (46×34 thumbnail, mono filename/meta, × remove) — no new validation logic.
- **Suggestion pills**: restyle in place if they exist already (check near the existing `crewMode` logic); otherwise add as simple `setInput(...)` triggers.
- **Thin-Story nudge**: new derived boolean `storyIsEmpty` (from Story/entries data — confirmed no existing "isEmpty"/"thin" concept anywhere, so this is newly derived, e.g. `entries.length === 0`), plus a new `storyNudgeDismissed` localStorage flag (a dismissal preference, not business logic).
- **First-time 3-card grid**: gate on `composeRuns.length === 0 && resumeRuns.length === 0` (or equivalent "no runs yet" check).
- **Earlier runs**: reuse `history/page.tsx`'s existing fetch, render the first few as rows linking into the repurposed history page (Phase 5).

**Visual verification:** fresh Desk (no runs) shows the 3-card grid, no earlier-runs section; attach popover/paste/drag-drop all produce the same validated `screenshot` object as the existing file-picker path; submitting screenshot-only still routes the same as today (functionally unchanged); dismissing the thin-Story nudge persists across reload but not across a different account; completing a run adds a new earlier-runs row.

---

## Phase 4 — Run view

**Files touched:** `src/app/app/compose/page.tsx` (`AgentChecklistV3`/`AgentRowV3` ~L832/1000, `PackageV3`/`PersonPackage`/`JobPackage` ~L1289/1335/1523, `ResumeModal`/`AtsBadge` ~L1998/2137, `EmailOptions`/`TierBadge` ~L2225/2218, `AnotherAngle`/`SteerDraft` ~L1121/1186), new `src/lib/use-signed-in.ts` (extracted from the existing `useSignedIn()` pattern already implemented locally in `src/app/page.tsx` ~L58-72 — don't write new session-check logic, lift the existing one into a shared hook), `src/app/app/layout.tsx` + `src/app/auth/callback/route.ts` (only for the signed-out sub-step below).

- **Status chip relabel**: the existing 4-state machine (`parsing`/`working`/`done`/`error`) already maps 1:1 to RUNNING(amber pulse)/RUNNING/DONE(green)/NEEDS-YOU(amber) — pure rename/recolor, zero logic change.
- **Thin-Story states**: pull-review panel's 2-generic-entries + amber "THIN STORY" banner, ATS card's "BUILT FROM A THIN STORY" variant (score 71, amber delta, one red negative-gain line), people panel's amber ⚠ generic-drafts line — all driven by the single `storyIsEmpty` flag from Phase 3, threaded down as a prop.
- **Signed-out blur gate (its own reviewed sub-step, confirm before merging further)**: today `src/app/app/layout.tsx` hard-redirects every signed-out request to `/` before any `/app/*` page renders — there is no path today for a signed-out user to reach the Desk or a run at all. This sub-step: (a) loosen the gate so an anonymous GET can reach `/app/compose` (and only that route) while every other `/app/*` route and all writes stay gated exactly as today; (b) add `pendingRun` persistence (e.g. `sessionStorage` carrying enough to reconstruct the run) surviving the OAuth redirect through onboarding back to the same run; (c) build the blur gate itself as a CSS wrapper (`filter: blur(9px); pointer-events: none` on the output-panel container) plus an absolutely-positioned overlay card with a real, focusable sign-in `<button>`/`<a>` (not a styled `<div>`) — this part is purely presentational once (a)/(b) exist. Land and review (a)+(b) before building on top of them.

**Visual verification:** run a full compose flow signed-in end-to-end — confirm chip colors/labels match the prototype with no change in *when* transitions happen; toggle a test profile with 0 entries and confirm all thin-Story states appear together; for the signed-out sub-step — verify a signed-out user can start a run on `/app/compose` and no other `/app/*` route, verify the blur+overlay renders over completed panels, verify signing in from the overlay returns to the same unlocked run (not a fresh Desk).

---

## Phase 5 — Jobs / Story / People / run-history detail (+ Today/Settings/Onboarding)

**Files touched:** `src/app/app/jobs/page.tsx`, `src/app/app/jobs/[id]/page.tsx`, `src/app/app/jobs/preferences/page.tsx`, `src/app/app/resume/page.tsx` (Story), `src/app/app/people/page.tsx`, `src/app/app/history/page.tsx` (repurposed "view all" + per-run detail: back link, title+DONE chip, `from "{intent}" · {when}`, all-✓ steps, "WHAT CAME OF IT" card, download tiles), `src/app/app/today/page.tsx`, `src/app/app/settings/page.tsx` (remove dark-mode/density/motion/variant controls, keep `followup_days` working), `src/app/onboarding/page.tsx` (step dots, agent chips, resume dropzone, goal picker, "Skip for now" → thin-Story path).

**Final cleanup (only once every consumer is confirmed migrated):** grep for zero remaining imports of `usePaperTheme`/`PAPER_FONTS`/`palette.ts` (known consumers to double check: `src/app/page.tsx`, `src/app/changelog/page.tsx`, `_stub.tsx`, `src/components/landing/HowItWorks.tsx`, `src/components/resume/ChangeList.tsx`) before deleting `palette.ts`, `use-paper-theme.ts`, the old `primitives.tsx`, `sidebar.tsx` (if not repurposed for mobile), and the `crew.theme.v1` localStorage key.

**Visual verification:** browse jobs feed → detail → back, visa-chip colors unchanged, just restyled; Story quick-add/edit/approve still saves the same way; People tracker statuses render correctly; History "view all" → a past run's detail shows correct outcomes/downloads; onboarding end-to-end including "Skip for now" produces the same `storyIsEmpty === true` verified in Phase 4; Settings has no dark-mode/density controls left, `followup_days` still saves; final grep confirms no orphaned old-system imports before deleting files.

---

## Verification approach (every phase)

Run the dev server (`npm run dev`), click through the routes each phase touches, and screenshot-compare against the prototype HTML for fidelity (colors/spacing/copy) and against the pre-phase app for functional regressions (nothing that worked before should stop working). Each phase ends with an explicit stop for review before the next begins.
