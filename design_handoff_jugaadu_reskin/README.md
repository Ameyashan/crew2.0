# Handoff: Jugaadu UI Reskin (crew2.0)

## Overview
A full UI redesign for the Jugaadu job-hunt agent app (jugaadu.app / crew2.0 repo). The functionality already exists in the app — this handoff is a **reskin plus a handful of new UX states**: a try-before-sign-in Desk, a blurred-results sign-in gate, screenshot attachments on the composer, a thin-Story degradation path, and a run-history detail view.

## About the Design Files
`Jugaadu Prototype.dc.html` is a **design reference created in HTML** — a prototype showing intended look and behavior, NOT production code to copy. (`support.js` is only the prototype's preview runtime — ignore it entirely.) The task is to **recreate the design in the crew2.0 codebase's existing environment**: Next.js 16 App Router, React 19, Tailwind v4 (`@theme` tokens in `src/app/globals.css`), Supabase auth/data, lucide-react icons. Reuse existing routes, data fetching, and business logic; change presentation.

The prototype is a single-file component: template markup at the top (`<x-dc>…</x-dc>`, all styles inline) and a logic class below (`<script data-dc-script>`). Read the inline styles for exact values; read the logic class for state transitions and copy strings.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, shadows, copy, and interaction states are final. Recreate pixel-perfectly using Tailwind utilities/tokens. Exception: fake data (names, companies, ATS numbers, drafts) is placeholder — wire to real data.

## Design Tokens
Replace the legacy `--color-cream/clay` tokens in `globals.css` with these (Tailwind v4 `@theme`):

Colors:
- `paper` #faf8f3 — app background
- `card` #ffffff — card surfaces
- `card-warm` #fdfcf8 — inset/nested cards
- `ink` #211e19 — primary text, solid buttons
- `ink-soft` #3a352c — secondary text, button hover bg
- `muted` #8b8171 — body-secondary text
- `muted-2` #6f6656 — mid-emphasis text
- `faint` #b0a692 — captions, placeholders
- `faint-2` #a89e8c / #a49a88 — timestamps, Hindi accent
- `line` #e3ddd0 — default borders; `line-soft` #e8e2d5 (cards); `line-row` #eae4d7 (row dividers); `line-inset` #eee7d6
- `chip` #f2eee4 — neutral chip bg; `hover-wash` #f7f4ec
- `green` #3d7a4f on `green-bg` #e9f1e9 — success/DONE
- `amber` #8a6d2f on `amber-bg` #f4ecda, panel bg `amber-wash` #fdf6e8, border `amber-line` #ecdfc0 — warnings/NEEDS YOU/thin-Story
- `gold` #d9a13c — active step spinner ring
- `red` #a03d2e — destructive/negative
- dashed borders: #ddd5c4, #cfc6b2

Typography (fonts: Newsreader is already `--font-newsreader`; **add IBM Plex Mono** as the mono font — the prototype's labels depend on it):
- Display serif: Newsreader — headlines 34/30/26/24px w400, letter-spacing -0.01em; card titles 20/17px; body-serif 15–17px (composer input, draft bodies, story entries)
- Sans: system-ui — UI text 12–14.5px; w500 for emphasis
- Mono labels: IBM Plex Mono — 9.5–11px w500, letter-spacing .08–.12em, UPPERCASE section labels and chips

Radii: cards 14px; modals/large cards 16px; inner panels 10–12px; buttons 8–9px; pills/avatars 99px.

Shadows: resting card `0 2px 10px rgba(60,50,30,.05)`; elevated `0 3px 16px rgba(60,50,30,.07)`; popover `0 6px 24px rgba(60,50,30,.12)`; modal/gate `0 16px 48px rgba(60,50,30,.2)`; Google chooser `0 8px 32px rgba(0,0,0,.14)`.

Animations (already in globals.css as fadeUp; keep): `fadeUp .3–.4s ease` on screen/panel entry; `pulse` on live indicators.

## Screens / Views

### 1. Top bar (app shell)
Wordmark "Jugaadu" (Newsreader 21px w500) + small Hindi accent "जुगाडू". Right side:
- **Signed out**: only a solid `ink` "Sign in" pill (13px w500, padding 9×16).
- **Signed in**: nav pills Desk / Jobs / Story / People (13px, active = ink bg + paper text, inactive = muted text, radius 99px, padding 8×12); optional pulsing "● crew running" green chip linking to the active run; 30px avatar circle → popover (name, email, "SIGNED IN WITH GOOGLE" mono label, Sign out).

### 2. Desk (signed-out = landing; signed-in = home)
Centered column. Headline: signed-out "A crew of agents for your job hunt."; signed-in first-time "Welcome, {firstName}."; after a run "What should the crew get done?" Italic serif tagline under first-time headline.
**Composer** (640px card, radius 14): serif textarea (17px) placeholder "Paste a job link or a screenshot, log what you shipped, or just say it…"; bottom row = "+" attach button (28px circle) + three suggestion pills ("Apply to a role", "Just a resume", "Find the right person") + 34px ink circular submit ↑.
- **Screenshot attach**: "+" opens popover (322px) with 3 sample screenshots (job posting / hiring manager LinkedIn / recruiter DM); also paste (⌘V) and drag-drop onto the composer (border turns #8a6d2f + amber shadow). Attached file shows as a chip above the textarea: 46×34 thumbnail, mono filename, meta line, × to remove. One attachment at a time.
- **Thin-Story nudge** (signed in, empty Story, dismissible): amber pill row under composer — "Your Story is empty — the crew is working from guesses." + ink "Add your resume" pill + ×.
- First-time: 3-card grid "Things your crew can do" with agent chips.
- **Earlier runs**: clickable rows (title, outcome chips, timestamp, →; hover wash) → Run detail (screen 9).

### 3. Google OAuth (sign-in)
Google-styled account chooser card (400px, #dadce0 border, system font, Google G logo): "Choose an account / to continue to Jugaadu", two account rows with colored initial avatars, last row "← Not now — take me back" (returns to wherever the user was, preserving any run). Picking an account → brief loading state (avatar, "Setting up your Desk, {first}…", mono "SIGNED IN WITH GOOGLE") → onboarding. In production this is the real Supabase Google OAuth redirect; recreate the loading state on return.

### 4. Onboarding (3 steps, 600px card)
Step dots (18×4 bars), "STEP n OF 3" mono label. 1: value prop + four agent chips. 2: "Give the crew your story." resume dropzone (dashed 1.5px, turns green with "✓ filename / 12 entries extracted") + **"Skip for now"** link — skipping is what produces the thin-Story state. 3: goal picker (3 options, serif). Finish → if the user signed in from a blur-gated run, **return to that run** (now unlocked); else Desk.

### 5. Run view
Title serif 26px + status chip (RUNNING amber-pulse ring / NEEDS YOU amber / DONE green). Sub-line: `from "{intent}" · crew assembled automatically` + screenshot chip if the run was seeded from one. Steps list: ✓ green circles for done, pulsing gold ring for active; each step = title 14.5 w500 + mono AGENT chip + muted sub.
Panels below (in order, as flow progresses): resume pull panel (editable entry list, "why" italic reasons, add/remove, confirm CTA) → resume output (ATS score card, gains list, PDF/DOCX download tiles) → people panel (3 ranked candidate cards; selected = 1.5px ink border; WHO/WHY/EMAIL cards left, drafts right with Email/LinkedIn/X tabs, angle pills, handoff → "did it go out?" confirm → sent state).
- **Signed-out blur gate**: when outputs exist and user is signed out — steps stay readable, all output panels get `blur(9px)` + `pointer-events:none`, overlay card (410px, shadow `.2`): mono chip "CREW FINISHED · YOU'RE SIGNED OUT", serif "The work is done. It's waiting behind the blur.", flow-specific summary line, Google sign-in button, footnote "Free — this run is saved to your account the moment you're in." Signed-out runs auto-advance past the pull-review step (~2.2s) so the teaser completes on its own.
- **Thin-Story state** (Story empty): pull panel shows only 2 generic entries + amber THIN STORY banner with "Add resume" button; resume step reads "Resume woven — but your Story is thin · ATS 71, no baseline"; ATS card header "BUILT FROM A THIN STORY", score 71, delta "passable, not sharp" (amber), one negative gain line in red; people panel gets amber ⚠ line "Drafts are running generic…". "Add resume" anywhere ingests the resume and re-weaves (brief re-run of the resume step, panel refreshes with full data).

### 6. Jobs
Job feed + detail: company mono label, posted time, visa chip (green/amber/red), fit score box, WHAT THE ROLE IS / WHY IT MATTERS TO YOU (amber card, → bullets), footer CTA row "Not for me / Interested — run the crew →".

### 7. Story
Timeline of entries (serif raw text, status states pending/proposed/polished), inline edit, quick-add input.

### 8. People
Tracker table: PERSON / COMPANY / LAST TOUCH / NEXT / STATUS mono headers, status chips (REPLIED green, SENT amber, HELD neutral).

### 9. Past run detail
Back link, title + DONE chip, `from "{intent}" · {when}`, all-✓ step list, "WHAT CAME OF IT" card (outcome rows with status chips), download tiles when files exist.

## Interactions & Behavior
- Buttons: ink solid → #3a352c hover; outline pills → border #b0a692 + ink text hover; rows → #f7f4ec hover wash.
- Screen/panel entries animate fadeUp; live indicators pulse.
- Composer submit routes by intent/attachment kind: job screenshot → apply flow; hiring-manager/recruiter screenshot → find/reach flow, pre-selecting the right person.
- Sign out → signed-out Desk (clears session view).
- Minimum hit targets 34px; text never below 11px.

## State Management (maps to existing app state)
- `signedIn` (Supabase session), `story.isEmpty` (thin-Story flag), `storyNudgeDismissed` (persist per user), `pendingRun` (run started signed-out; persist through OAuth redirect + onboarding, then unlock in place), composer `attachment`, run state machine (parse → pull → resume → people → emails → drafts → sent) — already exists in app; the blur gate is purely presentational on top of it.

## Assets
- `public/jugaadu-logo.svg` / `jugaadu-mark.svg` already in repo — keep using them for the wordmark if preferred over plain text.
- Google "G" logo: standard multi-path SVG (in the prototype source).
- No other imagery; screenshot thumbnails come from user uploads (fallback: hatched placeholder — repeating-linear-gradient -45°, #f2eee4/#faf8f3 4px stripes).

## Files
- `Jugaadu Prototype.dc.html` — the full design reference (template + logic + all copy strings)
- `support.js` — prototype preview runtime; **ignore**

## Suggested implementation phases (Claude Code, plan mode)
1. Tokens: add the palette + IBM Plex Mono to `globals.css` `@theme`; map/remove legacy cream/clay tokens.
2. App shell: top bar, nav pills, account popover, signed-out variant.
3. Desk + composer (screenshot attach, suggestion pills, thin-Story nudge, first-time cards, run history rows).
4. Run view: steps, panels, blur gate, thin-Story states.
5. Jobs / Story / People / run-history detail.
Commit and visually diff after each phase.
