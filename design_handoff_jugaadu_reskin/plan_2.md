# Jugaadu Reskin — Prototype Fidelity Pass

## Context

All 5 phases of `design_handoff_jugaadu_reskin/plan.md` were implemented and merged (PRs #66–#70), yet the app visibly doesn't match `design_handoff_jugaadu_reskin/Jugaadu Prototype.dc.html`. A full audit (entire prototype read line-by-line; every app page audited against it) found **three root causes** — this is much more than color values:

1. **The compose page (Desk + run view) is a hybrid.** Phase 3/4 bolted new-token "islands" (nudge pill, first-time grid, earlier-runs, attach popover, blur gate) onto the **old paper-craft layout**: the page still paints `background: p.paper` = `#f1e7d2` tan, headline is DM Serif "Who are you reaching out to?", the composer is a square `PaperCard` with `1.5px` ink border + `4px 4px 0 #e8a019` hard marigold shadow, JetBrains-mono textarea, red "Go ⌘↵" stamp button, and the run view is an agent-tile grid + legacy package cards — none of which is the prototype's design.
2. **Phase 5 pages (Jobs, People, History, Today, Settings, Resume, Onboarding) got new token colors but a different layout language** — each file says `// verbatim port of Crew prototype v3`: eyebrow + `clamp(40px,4.8vw,64px)` hero headlines with italic **red** spans, two-pane dossiers, 6-card onboarding. That's an older internal prototype, not the handoff prototype (plain 26–34px Newsreader headings, no red accents, tracker table, 3-step card).
3. **Several prototype screens/states were never built**: the Story timeline page (the "Story" nav tab shows a resume-tailoring form), the run view's pull-review panel, the handoff → "did it go out?" → sent state, the post-OAuth "Setting up your Desk…" loading state, the prototype People table, jobs-detail "WHY IT MATTERS TO YOU" amber card + "Not for me / Interested" CTA row, and the signed-out Desk as the landing experience (the root `/` still serves the old marigold/stamp marketing site).

Plus small global gaps: `html,body` background is still legacy `#f1e7d2` (globals.css:65); the prototype's global `::placeholder{color:#bdb4a3;font-style:italic}` is missing; the top bar's **active nav pill is inverted** (impl: paper-on-ink; prototype logic `navOn = {color:'#211e19', bg:'#f2eee4'}` — ink text on chip bg, inactive `#6f6656`).

**Source of truth: the prototype HTML** (inline styles + logic-class values). Where the handoff README prose contradicts it (e.g. it says active pill = "ink bg + paper text"), the prototype wins — the user asked to "exactly match the prototype".

Foundation is already correct and stays: `tokens.ts` / `--color-jg-*` values all match the spec; IBM Plex Mono is loaded; `PAPER_FONTS_V2` is right; top-bar structure, thin-Story flag, blur-gate logic, pendingRun persistence all exist and are reused.

## Scope decisions taken (flag if you disagree — each is revisitable)

The session is non-interactive, so these three scope calls were made in favor of *exact prototype match* (the user's stated goal):

1. **Story becomes a real feature.** The prototype's Story page (timeline of entries, quick-add, polish states) and the run view's "Pulling these from your Story" panel need an entries data model that doesn't exist. Build it: `story_entries` table + CRUD/polish API + prototype UI. `/app/resume` becomes Story; resume *tailoring* moves fully into the Desk-run flow ("Just a resume" → run view with ATS card + downloads), and tailor history stays on the History page. (Fallback if this is too much: keep the tailoring page and only restyle it — but then the Story screens still won't exist.)
2. **`/` becomes the signed-out Desk.** `src/proxy.ts` currently sends only signed-in visitors to `/app/compose`; change it to redirect everyone, so signed-out visitors get the prototype's try-before-sign-in Desk (blur gate already works). The old marketing page stays reachable at `/home`, untouched.
3. **Onboarding is rebuilt as the prototype's 3-step 600px card.** LinkedIn / writing samples / job interests / cadence drop out of onboarding (all remain editable in Settings and Jobs → preferences); "Skip for now" produces the thin-Story state, as designed.

Deliberate deviations kept (functional, visually consistent): Settings link in the account popover; "needs you"/RECONNECTING crew-chip variants; real data everywhere the prototype shows fake data.

---

## Phase A — Global foundation + top bar (small, first)

**Files:** `src/app/globals.css`, `src/components/paper/top-bar.tsx`, new auth-loading UI (see below).

- `globals.css`: `html,body` → `background:#faf8f3; color:#211e19`. (The `(legacy)` layout doesn't paint its own bg — this warms legacy internal pages slightly; acceptable, they're slated for deletion.) Add `::placeholder { color:#bdb4a3; font-style:italic }` (prototype line 19).
- Top bar (prototype lines 25–59): active pill → `color:#211e19; background:#f2eee4`, inactive → `color:#6f6656`, weight 400 both; container padding → `20px 44px 0` (keep the mobile clamp for small widths); crew chip `margin-left:10px`, drop the letter-spacing; sign-in pill already matches.
- **Post-OAuth loading state** (prototype lines 89–95): centered 44px avatar circle, `Setting up your Desk, {first}…` Newsreader 20px, pulsing mono `SIGNED IN WITH GOOGLE` `#b0a692`. Render as a brief client interstitial after the OAuth callback lands (e.g. the onboarding page's session-resolution moment and the Desk's post-redirect hydration), reusing `avatarBg`/`avatarInitial` from `top-bar-logic.ts`.

## Phase B — Desk rebuild (`src/app/app/compose/page.tsx`)

Rebuild the Desk chrome to prototype lines 156–281, replacing the legacy shell (delete `PageHead`/`PaperCard`/`InkButton`/`usePaperTheme` usage from this page):

- Page ground `#faf8f3`; centered column (`padding:48px 44px 32px`), lower sections `max-width:1060px; padding:0 44px 44px`.
- **Headline** Newsreader `34px/1.25, -.01em`, three variants: signed-out `A crew of agents for your job hunt.`; first-time `Welcome, {firstName}.` + italic tagline `You say what you want. The crew does the boring half.` (17px, `#8b8171`); returning `What should the crew get done?` (reuse `isFirstTime()` from desk-logic + session name already fetched for the top bar).
- **Composer** 640px white card, `1px #e3ddd0`, radius 14, shadow `0 2px 10px rgba(60,50,30,.05)`, padding `20px 22px 16px`; serif 17px textarea `rows=2`, placeholder exactly `Paste a job link or a screenshot, log what you shipped, or just say it…`; drag-over → border `#8a6d2f` + `0 2px 16px rgba(138,109,47,.18)`; bottom row = existing 28px "+" attach (keep) + the three suggestion pills (already match) + **34px ink circle `↑` submit** (replaces "Go ⌘↵"; keep ⌘/Ctrl+Enter). Remove the "linkedin · x · greenhouse…" corner label and the duplicate legacy dashed "+ attach screenshot" control — one attach system.
- Attach popover / screenshot chip: already token-built; fix copy to prototype (`Drop an image on the box, paste it (⌘V), or try a sample:` etc.) and thumbnail radius 5.
- First-time grid: fix section label copy to `Things your crew can do — tap one to see it`; add hover (border `#b0a692` + `0 2px 12px rgba(60,50,30,.07)`).
- Earlier runs: add the missing `#f7f4ec` hover wash; timestamp `#a89e8c`; replace the off-token error-chip bg `#f6e9e6` with amber-family tokens.
- Keep intact: run store, `classifyKind`, agent selection, `?seed=` from People, screenshot validation.

## Phase C — Run view rebuild (`compose/page.tsx` run section)

To prototype lines 534–799. Presentation only — the run-store state machine, steer, Hunter verdicts, Gmail links, shortlist data all stay.

- **Header**: title Newsreader 26px + status chip (labels/colors already right in `run-view-logic.ts`); sub-line `from "{intent}" · crew assembled automatically` + screenshot chip with the 12×9 hatch swatch.
- **Steps list** replaces the `AgentRowV3` tile grid: vertical rows (`border-top #eae4d7`, padding `15px 0`), done = 20px `#3d7a4f` circle with ✓, active = 20px ring `2px solid #d9a13c` pulsing; step title 14.5px/500 + mono agent chip (`TRACKER` / `RESUME` / `PERSON KHOJI` / `EMAIL WALLAH` / `OUTREACH` — map from existing agents) + muted sub. Active titles like `Weaving your resume…`, `Finding who could say yes…`.
- **Pull-review panel** (lines 570–614; depends on Phase E): amber-line card `RESUME AGENT · NEEDS YOUR EYES` / `Pulling these from your Story`; entry rows on `#fdfcf8` with italic `why:` lines and ✕ remove; dashed "Also in your Story — tap to include" rows; add-input; `{n} entries → 1 page` + `Looks right — generate resume →`. Pauses the resume step for signed-in users; signed-out runs auto-advance (~2.2s) per prototype. Thin-Story variant: 2 generic entries (`THIN_STORY_ENTRIES` — currently dead code, wire it) + THIN STORY banner.
- **Resume output card** (lines 616–660): mono header `ATS SCORE · VS YOUR UPLOADED RESUME` / thin `…BUILT FROM A THIN STORY`; 22px Newsreader score + delta (green `↑ from {n}` / amber `passable, not sharp`); 8px progress bar `#f2eee4` track, `linear-gradient(90deg,#ddd5c4 60%,#3d7a4f)` fill; gains list (green `+n` / red `−` line); PDF/DOCX download tiles (`1 page · for humans` / `editable · for portals`); resume-flow dashed offer `Find the person →`.
- **People panel** (lines 662–767): `Who to reach out to` 20px serif; candidate cards grid (floating mono badge, selected = `1.5px solid #211e19` + shadow, badge inverts to ink); left column `WHO {PRONOUN} IS` card, `WHY {PRONOUN}'LL CARE ABOUT YOU` amber card (`#fdfcf8`/`#ecdfc0`, `→` bullets), `EMAIL` card (mono address, verified/guess chip, `{n} more patterns if this bounces ▸` alternates with `GUESS` chips — wire to existing `EmailOptions` data); right drafts card with **underline tabs** Email / LinkedIn / X (active `2px` ink underline), meta line, serif `15px/1.75` body, **angle pills** `warmer` / `shorter` / `lead with metrics` (inline pills replacing the dropdown; wire to the existing steer/redraft presets), `Edit` outline + `Open in {Gmail|LinkedIn|X} →` ink CTA.
- **Handoff → sent state** (lines 753–762, 787–798): after opening a channel, dashed row `Opened {chan} in a new tab. Did it go out?` + green `Sent ✓` / neutral `Not yet`; confirming → sent row (`✓ Sent to {first} via {chan}…`, `follow-up auto-queued…` sub, `← Back to the Desk`) — wire to the existing `/api/draft/[id]/sent` + followups so the person lands in People.
- **Blur gate overlay** (lines 770–783): fix to prototype — chip becomes **amber** `CREW FINISHED · YOU'RE SIGNED OUT` (`#8a6d2f` on `#f4ecda`; today it's green + lowercase), card 410px `border #e3ddd0` padding `34px 38px 28px`, headline 24px, **outline Google button** `Continue with Google` with the multicolor G (today: solid ink "Sign in with Google"), footnote 11px.

## Phase D — Jobs feed + detail

**Files:** `src/app/app/jobs/page.tsx`, `src/app/app/jobs/[id]/page.tsx` (prototype lines 423–505).

- Feed: replace eyebrow/clamp-hero/red-span header with Newsreader 30px `Today's jobs, picked for you` + 14px muted sub (italic goal from preferences); filter pill row (visa filters + `Remote-friendly` + `Comp listed`, active = ink bg/paper text, plus the 1×18 divider) mapped onto existing feed filters; job cards `padding 20px 24px` radius 14 with company mono 11 `#8b8171` + `posted {time}`, 20px serif title, `loc · comp` line, italic serif "why" line, **FIT box** (17px mono number + 8.5px `FIT` label; tiers ≥85 `#3d7a4f`/`#bcd6c2`, ≥75 `#8a6d2f`/`#e6d5ab`, else `#8b8171`/`#ddd5c4`), **visa chip** (`SPONSORS VISA` green for `likely_sponsors`, `VISA · TBD` amber for `unclear`/null; red `NO SPONSORSHIP` style included for future data); footer note `Refreshes every morning · fit re-ranks as your Story grows`. Keep Refresh / Edit-preferences as quiet pill affordances.
- Detail: `← All jobs`; company row + visa chip; 28px title; loc line with amber `↗` source link; larger fit box; 2-col `WHAT THE ROLE IS` (white card) / `WHY IT MATTERS TO YOU` (amber card, `→` bullets — from existing reasons); footer CTA card `Not for me` (red hover) / `Interested — run the crew →` → starts the compose run (existing outreach route).

## Phase E — Story feature + page

**Files:** new migration `supabase/migrations/0012_story_entries.sql`, new `src/app/api/story/...` routes, rewrite `src/app/app/resume/page.tsx` as Story (prototype lines 338–421), touch `src/components/paper/desk-logic.ts` (`deriveStoryIsEmpty`), onboarding + resume-upload seeding.

- **Data**: `story_entries(id, user_id, raw text, bullet text null, status 'pending'|'proposed'|'polished'|'raw', tags text[], created_at, updated_at)` + RLS matching existing tables. CRUD routes + a polish endpoint that turns `raw` → proposed `bullet` via the existing `src/lib/claude.ts` helper (same pattern as other agent routes). Seed: on resume upload (onboarding or Settings), extract entries from `resume_text` into Story (the prototype's "12 entries extracted").
- **UI**: 820px column; `Your Story` 30px + `Timeline / By theme` segmented toggle (`#f2eee4` track, white active); quick-add card (16px serif textarea, `Add to Story` ink button); entry rows: 17px serif raw + `edit` + date; pending pulse line `resume agent is polishing this…`; proposed `RESUME-READY VERSION` card (`#fdfcf8`/`#ecdfc0`) with `Approve` / `Keep it raw`; polished `↳ {bullet}`; mono tag chips; edit card with Save/Cancel/red delete; By-theme grouping from tags.
- `deriveStoryIsEmpty` → entries count (keep `resume_text` fallback so existing accounts don't suddenly flip thin).
- Tailoring functionality relocates to the Desk-run flow (Phase C's pull panel + ATS card + downloads); History keeps tailor history. `Log:` composer inputs and the "Log" first-time card route to Story quick-add.

## Phase F — People, History, Onboarding, Today/Settings

- **People** (`people/page.tsx`, prototype lines 507–532): replace the two-pane dossier with the tracker table — grid `2.2fr 1fr 1.1fr 1.3fr auto`, mono headers `PERSON / COMPANY / LAST TOUCH / NEXT / STATUS`, rows: serif 15 name + role sub, company, last touch, `next` colored by kind (`you: …` ink / `auto follow-up · Fri` muted / `closed` faint), status chips (`REPLIED` green, `SENT`/`AWAITING REPLY` amber, held/no-reply neutral) — derive from existing interactions + followups; rows needing action get `#fdfcf8` bg; footer note. Row click opens the existing dossier (kept, restyled to prototype card language) so delete / timeline / "reach out again" survive.
- **History** (`history/page.tsx`, prototype lines 283–336): align detail exactly — `← Back to Desk`, 26px title + `DONE` chip, `from "{intent}" · {when}`, all-✓ step rows with agent chips, `WHAT CAME OF IT` card (outcome rows `#fdfcf8`/`#eee7d6` + chips), download tiles; list rows match Desk earlier-runs styling; drop the clamp-hero/eyebrow header.
- **Onboarding** (`onboarding/page.tsx`, prototype lines 100–154): 600px card, radius 16, shadow `0 4px 24px rgba(60,50,30,.07)`, header `Jugaadu` + Hindi + mono `STEP n OF 3`; step 1 `You bring the ambition. The crew does the boring half.` + 4 agent chips (`resume` / `person khoji` / `email wallah` / `outreach`); step 2 `Give the crew your story.` dropzone (`1.5px dashed #cfc6b2` → green `✓ {filename}` / `{n} entries extracted into your Story…`) + `Skip for now`; step 3 goal picker (2 preset rows + italic `or write your own…` → inline input) saving to the existing goals/context field; footer 18×4 dots + `Next →` / `Open the Desk →`. Keep `onboardingDonePatch`, pendingRun return-to-run.
- **Today / Settings** (no prototype screens): keep all functionality; align typography to the prototype language — 30px serif headings, mono labels, no red italic hero spans.

## Phase G — Cleanup

- `compose/page.tsx`: remove now-unused `usePaperTheme` / `PAPER_FONTS` / `primitives.tsx` imports; delete orphaned `src/components/paper/sidebar.tsx`; fix the stale "nothing consumes these yet" comments in `globals.css` / `tokens.ts` / `primitives2.tsx` / `fonts.ts`; prefer `RADII`/`SHADOWS` imports over duplicated literals where files are already being touched.
- `src/proxy.ts`: root redirect for everyone → `/app/compose` (decision 2). Landing/changelog/`_stub`/`HowItWorks` keep the legacy system for now (out of prototype scope) — so `palette.ts`/`use-paper-theme.ts` stay until those pages are retired.
- Update the logic tests (`desk-logic.test.ts`, `run-view-logic.test.ts`, `top-bar-logic.test.ts`, `phase5-logic.test.ts`) for changed labels/copy; add coverage for new Story helpers.

## Verification

- `npm run build` + `node --test` on the logic modules after each phase.
- `npm run dev` and walk each screen side-by-side with the prototype HTML opened in a browser: signed-out `/` (Desk + Sign in pill) → run a flow anonymously → blur gate (amber chip, Google outline button) → sign in → "Setting up your Desk…" → 3-step onboarding (including Skip for now → thin-Story) → first-time Desk (Welcome + 3 cards) → apply flow end-to-end (steps list, pull panel, ATS card, people panel tabs/angles, handoff → Sent ✓ → person lands in People) → Jobs feed/detail → Story quick-add/edit/approve → People table → History detail → Settings (`followup_days` still saves) → Today.
- Spot-check computed colors in devtools against the prototype hexes: page `#faf8f3`, ink `#211e19`, active pill `#f2eee4`, chips `#3d7a4f`/`#e9f1e9` + `#8a6d2f`/`#f4ecda`, gold ring `#d9a13c`, red `#a03d2e`, placeholder `#bdb4a3` italic.
- Regression: legacy `(legacy)/*` routes still render; existing runs in history still open; `?seed=` from People still seeds the composer.

Each phase lands as its own commit on `claude/jugaadu-design-prototype-match-vkl4yu`.
