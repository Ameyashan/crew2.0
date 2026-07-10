-- Most recent product events (no PII — event name + ids only), for eyeballing
-- live activity and journeys. anon_id stitches signed-out sessions to a user.
select created_at, event, user_id, anon_id, path
from product_events
order by created_at desc
limit 100;
