// "Who to reach out to" for one job (career-ops modes/contacto.md, on our
// stack). On request only — it spends a Claude web search, a notes call, and
// up to APOLLO_REVEAL_CAP Apollo credits — and cached per user + job
// (job_contacts, 0035) so reopening the page is free.
//
// Sources, merged into one list (contacts-logic.ts):
//   1. the user's own LinkedIn connections at the company (step 2),
//   2. Claude + web_search: likely hiring manager, recruiter, a peer,
//   3. Apollo people search (free) for managers + recruiters at the employer's
//      domain, revealing the top few (1 credit each) for name + LinkedIn.
// Then one batched call writes a ≤300-char LinkedIn note per person, tuned to
// who they are. "Draft outreach" on a person hands off to the existing Compose
// person pipeline (research → email → drafts) with the job as context.
//
// MUST run inside withUser() (profile, Story and agent-run logging need it).

import { sourceJobContacts, writeContactNotes, type ContactNoteInput } from "@/lib/claude";
import { searchPeopleApollo, revealPersonApollo, type ApolloPersonHit } from "@/lib/apollo";
import { connectionsAt, connectionsSummary, employerNames } from "@/lib/connections/store";
import { getProfile, senderContextFromProfile } from "@/lib/profile";
import { listStoryEntries } from "@/lib/story";
import { jdText } from "@/lib/jobs/util";
import { jobLocation } from "@/lib/jobs/serialize";
import {
  mergeContacts,
  nameKey,
  linkedinKey,
  roleCore,
  sortContacts,
  type JobContact,
  type JobContactsDTO,
} from "@/lib/jobs/contacts-logic";
import type { SupabaseClient } from "@supabase/supabase-js";

export const APOLLO_REVEAL_CAP = 3;
// A refresh is allowed once the cached result is this old.
export const CONTACTS_REFRESH_MS = 60 * 60 * 1000;
const MAX_CONTACTS = 10;

interface JobRow {
  id: string;
  title: string;
  company: string;
  company_id: string | null;
  ats: string;
  raw_json: Record<string, unknown> | null;
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

export async function loadCachedContacts(sb: SupabaseClient, uid: string, jobId: string): Promise<JobContactsDTO | null> {
  const { data } = await sb.from("job_contacts").select("payload").eq("user_id", uid).eq("job_id", jobId).maybeSingle();
  return (data?.payload as JobContactsDTO | undefined) ?? null;
}

let seq = 0;
const key = (prefix: string) => `${prefix}${++seq}`;

async function fromApollo(domain: string, role: string): Promise<JobContact[]> {
  const core = roleCore(role);
  const [managers, recruiters] = await Promise.all([
    core
      ? searchPeopleApollo({ domain, titles: [core], seniorities: ["manager", "director", "head"], perPage: 5 })
      : Promise.resolve([] as ApolloPersonHit[]),
    searchPeopleApollo({ domain, titles: ["technical recruiter", "recruiter", "talent acquisition"], perPage: 5 }),
  ]);
  // Reveal (1 credit each): up to two managers, then a recruiter.
  const picks: Array<{ hit: ApolloPersonHit; kind: "hiring_manager" | "recruiter" }> = [
    ...managers.slice(0, 2).map((hit) => ({ hit, kind: "hiring_manager" as const })),
    ...recruiters.slice(0, 1).map((hit) => ({ hit, kind: "recruiter" as const })),
  ].slice(0, APOLLO_REVEAL_CAP);
  const revealed = await Promise.all(picks.map((p) => revealPersonApollo(p.hit.id)));
  const out: JobContact[] = [];
  revealed.forEach((r, i) => {
    if (!r) return;
    out.push({
      key: key("a"),
      kind: picks[i].kind,
      name: r.name,
      role: r.title ?? picks[i].hit.title,
      linkedin: r.linkedin_url,
      why: picks[i].kind === "recruiter" ? "Recruiter at the company (Apollo)" : "Manager in this function (Apollo)",
      sources: ["apollo"],
      connected: false,
      note: null,
    });
  });
  return out;
}

export async function findJobContacts(sb: SupabaseClient, uid: string, jobId: string): Promise<JobContactsDTO> {
  const { data: job, error } = await sb
    .from("jobs")
    .select("id, title, company, company_id, ats, raw_json, location_raw, city, region, country")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("not found");
  const j = job as JobRow;

  // 1. People the user knows there.
  const names = j.company_id ? (await employerNames(sb, [j.company_id])).get(j.company_id) ?? [] : [];
  const [known, summary] = await Promise.all([
    connectionsAt(sb, uid, [...names, j.company], 25),
    connectionsSummary(sb, uid),
  ]);
  const connections: JobContact[] = known.people.map((p) => ({
    key: key("c"),
    kind: "connection",
    name: p.full_name,
    role: p.position,
    linkedin: p.linkedin_url,
    why: "In your LinkedIn connections",
    sources: ["connections"],
    connected: true,
    note: null,
  }));

  // 2. Web search (hiring manager / recruiter / peer + the employer's domain).
  const web = await sourceJobContacts({
    role: j.title,
    company: j.company,
    location: jobLocation(j),
    jd_excerpt: jdText(j.ats, j.raw_json, 1200) || null,
  }).catch(() => ({ candidates: [], company_domain: null }));
  const webContacts: JobContact[] = web.candidates.map((c) => ({
    key: key("w"),
    kind: c.kind,
    name: c.name,
    role: c.role ?? null,
    linkedin: c.linkedin ?? null,
    why: c.why ?? null,
    sources: ["web"],
    connected: false,
    note: null,
  }));

  // 3. Apollo (needs the domain).
  let apollo: JobContactsDTO["apollo"] = "no_domain";
  let apolloContacts: JobContact[] = [];
  if (web.company_domain) {
    if (!process.env.APOLLO_API_KEY) apollo = "unavailable";
    else {
      apolloContacts = await fromApollo(web.company_domain, j.title).catch(() => []);
      apollo = "used";
    }
  }

  // Merge; a sourced person who is also a connection is flagged as such.
  const knownNames = new Set(connections.map((c) => nameKey(c.name)));
  const knownLinks = new Set(connections.map((c) => linkedinKey(c.linkedin)).filter(Boolean));
  const mark = (c: JobContact) => ({
    ...c,
    connected: knownNames.has(nameKey(c.name)) || (!!linkedinKey(c.linkedin) && knownLinks.has(linkedinKey(c.linkedin))),
  });
  const merged = sortContacts(
    mergeContacts([webContacts.map(mark), apolloContacts.map(mark), connections.slice(0, 3)]),
  ).slice(0, MAX_CONTACTS);

  // 4. One ≤300-char note per person.
  const profile = await getProfile().catch(() => null);
  let stories: string[] = [];
  try {
    stories = (await listStoryEntries())
      .map((e) => (e.bullet ?? e.raw ?? "").trim())
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    // Story is optional
  }
  const noteInputs: ContactNoteInput[] = merged.map((c) => ({
    key: c.key,
    kind: c.connected ? "connection" : c.kind === "connection" ? "connection" : c.kind,
    name: c.name,
    role: c.role,
    why: c.why,
  }));
  const notes = await writeContactNotes({
    job: { role: j.title, company: j.company },
    contacts: noteInputs,
    sender_context: senderContextFromProfile(profile) || undefined,
    sender_stories: stories,
    sender_first_name: profile?.full_name?.split(/\s+/)[0] ?? null,
  }).catch(() => ({}) as Record<string, string>);

  const dto: JobContactsDTO = {
    contacts: merged.map((c) => ({ ...c, note: notes[c.key] ?? null })),
    generated_at: new Date().toISOString(),
    apollo,
    connections_imported: summary.count > 0,
  };
  await sb
    .from("job_contacts")
    .upsert({ user_id: uid, job_id: jobId, payload: dto, created_at: dto.generated_at }, { onConflict: "user_id,job_id" });
  return dto;
}
