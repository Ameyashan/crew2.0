-- App is service-role only on the server (lib/supabase.ts uses
-- SUPABASE_SERVICE_ROLE_KEY via supabaseAdmin), which bypasses RLS.
-- Enabling RLS with no policies locks the anon key out of every table —
-- exactly what we want until per-user policies are added.

alter table public.people              enable row level security;
alter table public.drafts              enable row level security;
alter table public.interactions        enable row level security;
alter table public.followups           enable row level security;
alter table public.voice_samples       enable row level security;
alter table public.agent_runs          enable row level security;
alter table public.daily_digests       enable row level security;
alter table public.user_profile        enable row level security;
alter table public.resume_generations  enable row level security;
alter table public.job_applications    enable row level security;
alter table public.replies             enable row level security;
