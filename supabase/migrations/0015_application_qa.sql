-- Supplemental application questions + drafted answers ("Sawaal Jawaab").
-- Many applications ask for more than a resume: free-text essay questions like
-- "Why <company>?" or "Tell us about a project you're proud of." The apply run
-- now detects those questions; the answers are drafted on demand. Both live in
-- one jsonb blob on the application row so the /app/compose card and
-- /app/history detail view can rebuild them without a join.
--
-- Shape (see ApplicationQA in src/lib/db/schema.ts):
--   {
--     "questions": string[],                          -- detected essay questions
--     "answers": [{ "question": string,               -- drafted answers
--                   "body": string,
--                   "model": string }]
--   }

alter table job_applications
  add column if not exists application_qa jsonb;
