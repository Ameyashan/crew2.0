-- Signups per day (last 30 days), from first-party product_events.
-- Run read-only via the Supabase MCP execute_sql when available.
select date_trunc('day', created_at)::date as day,
       count(*) as signups
from product_events
where event = 'signup'
  and created_at >= now() - interval '30 days'
group by 1
order by 1 desc;
