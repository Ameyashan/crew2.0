-- Role targeting for the job feed.
--
-- Sectors only ever picked which COMPANIES to scan; nothing constrained the
-- ROLE. A Business Analyst who picked "E-commerce" got every open Product/Eng
-- role at retail companies because candidate selection applies no title filter
-- and the scorer, given a thin profile, falls back to "general desirability".
--
-- These two columns let the user say whether they want roles like their current
-- title or a different role (and, if different, which). The scorer reads them as
-- the primary relevance axis, and the feed hides clearly-weak matches.
alter table public.job_preferences
  add column if not exists role_mode   text                      -- 'current' | 'different' | null (unset)
    check (role_mode is null or role_mode in ('current','different')),
  add column if not exists target_roles text[] not null default '{}';  -- desired role titles when role_mode='different'
