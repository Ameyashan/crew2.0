// Pure merge rule for a job re-pick, split out from the server executor so it
// can be unit-tested under `node --test` (execute-apply.ts pulls Supabase and
// other server-only modules that can't load in that context).
//
// A re-pick re-drafts outreach for a different hiring-manager candidate on a
// FINISHED job run. Its result must fold INTO the run's existing package,
// keeping the résumé, candidate shortlist, and application questions the
// original run produced — never replacing the whole `output`.

export type RepickAmendment = {
  person: unknown;
  enrichment: unknown;
  drafts: unknown[];
};

// Return a NEW output object with the re-picked contact merged in. A
// dual-contact (screenshot) run — recognised by a non-null `contacts` object —
// updates its hiring_manager slot; a single-contact run replaces the top-level
// person/enrichment/drafts. Drafts are only overwritten when the re-pick
// actually produced some, so a draftless amendment leaves the prior copy intact.
export function mergeRepickOutput(
  prevOutput: unknown,
  amend: RepickAmendment,
): Record<string, unknown> {
  const output: Record<string, unknown> =
    prevOutput && typeof prevOutput === "object" ? { ...(prevOutput as Record<string, unknown>) } : {};

  const hasDrafts = Array.isArray(amend.drafts) && amend.drafts.length > 0;
  const dual = !!output.contacts && typeof output.contacts === "object";

  if (dual) {
    const contacts = { ...(output.contacts as Record<string, unknown>) };
    const prevHm =
      contacts.hiring_manager && typeof contacts.hiring_manager === "object"
        ? (contacts.hiring_manager as Record<string, unknown>)
        : {};
    contacts.hiring_manager = {
      ...prevHm,
      sameAsPoster: false,
      person: amend.person ?? prevHm.person ?? null,
      enrichment: amend.enrichment ?? prevHm.enrichment ?? null,
      drafts: hasDrafts ? amend.drafts : (prevHm.drafts ?? []),
    };
    output.contacts = contacts;
  } else {
    output.person = amend.person ?? output.person ?? null;
    output.enrichment = amend.enrichment ?? output.enrichment ?? null;
    if (hasDrafts) output.drafts = amend.drafts;
  }

  return output;
}
