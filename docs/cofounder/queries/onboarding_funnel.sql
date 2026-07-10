-- Activation funnel over the last 30 days: blur-gate → sign in / sign up →
-- onboarding → first completed run → resume export. Counts distinct events.
select event, count(*) as n
from product_events
where created_at >= now() - interval '30 days'
  and event in (
    'blur_gate_hit','blur_gate_signin_click',
    'sign_in','signup','onboarding_complete',
    'run_completed','resume_export'
  )
group by event
order by n desc;
