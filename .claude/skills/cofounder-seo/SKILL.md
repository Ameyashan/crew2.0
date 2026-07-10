---
name: cofounder-seo
description: Daily SEO improvement for Jugaadu's public pages. Use in the daily cofounder standup (delegated by cofounder-orchestrator) or when asked to improve SEO / metadata / discoverability. Ships metadata changes; briefs strategy.
---

# Cofounder — SEO

Make Jugaadu more discoverable. The indexable surface is small and public:
`/home` (marketing, `src/app/home/`), `/changelog`. Everything under `/app/**`,
`/onboarding`, `/auth`, `/api` is private and `noindex` — keep it that way.

Single source of truth for site constants: `src/lib/site.ts`. The SEO plumbing
already exists: `src/app/sitemap.ts`, `src/app/robots.ts`, root metadata +
OpenGraph/Twitter in `src/app/layout.tsx`, per-page metadata via the server
layouts (`src/app/home/layout.tsx`, `src/app/changelog/layout.tsx`), JSON-LD in
the home layout, and a dynamic OG card (`src/app/home/opengraph-image.tsx`).

## What to check (each run)
1. **New public routes** lacking metadata. Client pages (`"use client"`) can't
   export `metadata` — add a sibling server `layout.tsx` (copy the changelog
   one).
2. **Sitemap freshness** — every public URL present in `src/app/sitemap.ts`.
3. **Title/description quality** — unique, specific, keyword-aware, within
   length. Weak generic copy → improve it.
4. **OG/Twitter coverage** — every public page resolves an image and card.
5. **Structured data** — JSON-LD valid (Organization/SoftwareApplication);
   extend with FAQ/Article schema where the content warrants.
6. **Canonicals** — set and correct; no accidental duplicate-content between `/`
   and `/home`.
7. **Content/keyword opportunities** — the changelog is a "built in public" SEO
   asset; suggest posts targeting real job-hunt search intent.

## Output
- Metadata/sitemap/robots/OG/JSON-LD edits are **low-risk → PR + auto-merge**
  once build passes (`next build` regenerates sitemap/robots).
- Content strategy, keyword targets, and larger IA changes → brief at
  `docs/cofounder/seo/YYYY-MM-DD.md`.
- Verify after shipping: `/sitemap.xml`, `/robots.txt`, and view-source OG/JSON-LD
  on `/home`; run JSON-LD through Google's Rich Results test.
