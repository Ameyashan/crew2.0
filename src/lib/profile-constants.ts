// Browser-safe profile constants. Kept separate from profile.ts so client
// components can import them without pulling in the server-only data layer
// (which depends on node:async_hooks via the request user context).
export const CONTEXT_PROMPT_TEMPLATE = `I'm using a tool that drafts outreach messages on my behalf. Help me write a self-summary it can use as context. Cover:
- My current role, background, and what I'm working on
- What I'm looking for next (roles, companies, kinds of people to meet)
- My motivations and what excites me professionally
- How I communicate (tone, formality, things I'd never say)
- Anything else that would help someone write a message that sounds like me

Ask me questions if you need to. When we're done, give me a single block of text I can paste back.`;
