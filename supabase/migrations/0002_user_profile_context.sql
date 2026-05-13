-- Adds an optional free-form context paste (LLM-generated self-summary about
-- career goals, objectives, communication style) to user_profile. Used as
-- additional sender context when drafting outreach. A structured/extracted
-- version is stored alongside for more reliable downstream use.

alter table user_profile
  add column if not exists context_prompt text,
  add column if not exists context_structured jsonb;
