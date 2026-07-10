-- Per-agent run volume, error rate and spend (last 30 days), from agent_runs.
select agent_type,
       count(*)                                        as runs,
       count(*) filter (where outcome = 'error')       as errors,
       round(avg(latency_ms))                          as avg_latency_ms,
       round(sum(cost_usd)::numeric, 4)                as cost_usd
from agent_runs
where created_at >= now() - interval '30 days'
group by agent_type
order by runs desc;
