// How each supported ATS's board is addressed — shared by the two LLM board
// guessers (universe/resolve.ts, catalog/resolve.ts) so the model is told
// about every adapter we can actually fetch.

export const BOARD_FORMATS_PROMPT = `Board formats ("ats" → "slug"):
- "greenhouse" → board token from boards.greenhouse.io/<slug>, e.g. "stripe"
- "lever" → site from jobs.lever.co/<slug>, e.g. "plaid"
- "ashby" → org from jobs.ashbyhq.com/<slug>, e.g. "Ramp"
- "smartrecruiters" → company id from jobs.smartrecruiters.com/<slug>, e.g. "ServiceNow", "BoschGroup"
- "workday" → "<tenant>/<wdN>/<site>" from https://<tenant>.<wdN>.myworkdayjobs.com/<site>, e.g. "nvidia/wd5/NVIDIAExternalCareerSite"
- "oracle" → "<host>/<siteNumber>" from https://<host>/hcmUI/CandidateExperience/en/sites/<siteNumber>, where host looks like <tenant>.fa.<region>.oraclecloud.com, e.g. "jpmc.fa.oraclecloud.com/CX_1001" (Oracle Recruiting Cloud — common at banks and large enterprises)
- "eightfold" → "<tenant>/<domain>" from https://<tenant>.eightfold.ai/careers?domain=<domain>, e.g. "micron/micron.com"
- "icims" → the portal host from https://<portal>.icims.com/jobs, e.g. "careers-quest.icims.com"`;
