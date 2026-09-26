// Pure helpers for the job page's "Who to reach out to" card (contacts.ts).
// Relative imports only (node --test).

export type JobContactKind = "hiring_manager" | "recruiter" | "peer" | "connection";
export type JobContactSource = "web" | "apollo" | "connections";

export interface JobContact {
  key: string;
  kind: JobContactKind;
  name: string;
  role: string | null;
  linkedin: string | null;
  why: string | null;
  sources: JobContactSource[];
  connected: boolean; // one of the user's imported LinkedIn connections
  note: string | null; // ≤300-char LinkedIn connection note
}

export interface JobContactsDTO {
  contacts: JobContact[];
  generated_at: string;
  apollo: "used" | "unavailable" | "no_domain";
  connections_imported: boolean;
}

const LEVEL_WORDS = new Set([
  "senior", "sr", "staff", "principal", "lead", "junior", "jr", "associate", "intern", "entry",
  "level", "i", "ii", "iii", "iv", "v", "vp", "avp", "mid", "new", "grad", "graduate",
]);

// "Senior Software Engineer II, Payments (Remote)" → "software engineer" — the
// title family Apollo's title search matches managers against.
export function roleCore(title: string): string {
  const head = title
    .replace(/\(.*?\)/g, " ")
    .split(/[,|–—-]| - /)[0]
    .toLowerCase()
    .replace(/[^a-z0-9 &/+]+/g, " ");
  const words = head.split(/\s+/).filter((w) => w && !LEVEL_WORDS.has(w));
  return words.slice(0, 4).join(" ").trim();
}

export const nameKey = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

export const linkedinKey = (u: string | null | undefined): string | null => {
  const m = (u ?? "").match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1].toLowerCase().replace(/\/$/, "") : null;
};

// Merge contacts from several sources: the same person (by LinkedIn handle,
// else by full name) collapses into one entry that remembers every source.
// Earlier entries win on fields; order is preserved.
export function mergeContacts(lists: JobContact[][]): JobContact[] {
  const out: JobContact[] = [];
  const byKey = new Map<string, JobContact>();
  for (const list of lists) {
    for (const c of list) {
      const keys = [linkedinKey(c.linkedin), nameKey(c.name)].filter(Boolean) as string[];
      const hit = keys.map((k) => byKey.get(k)).find(Boolean);
      if (hit) {
        hit.sources = [...new Set([...hit.sources, ...c.sources])];
        hit.connected = hit.connected || c.connected;
        hit.linkedin = hit.linkedin ?? c.linkedin;
        hit.role = hit.role ?? c.role;
        hit.why = hit.why ?? c.why;
        for (const k of keys) byKey.set(k, hit);
        continue;
      }
      const copy = { ...c, sources: [...c.sources] };
      out.push(copy);
      for (const k of keys) byKey.set(k, copy);
    }
  }
  return out;
}

// Order for the card: people you know first, then hiring managers, recruiters,
// peers.
const KIND_ORDER: Record<JobContactKind, number> = { connection: 0, hiring_manager: 1, recruiter: 2, peer: 3 };
export function sortContacts(list: JobContact[]): JobContact[] {
  return [...list].sort((a, b) => Number(b.connected) - Number(a.connected) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

// LinkedIn caps connection-request notes at 300 characters.
export const CONTACT_NOTE_MAX = 300;

// Hard LinkedIn limit: cut at the last sentence/word boundary under the cap.
export function clampNote(s: string, max = CONTACT_NOTE_MAX): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return `${cut.slice(0, word > 0 ? word : max - 1).replace(/[,;:\s]+$/, "")}…`;
}
