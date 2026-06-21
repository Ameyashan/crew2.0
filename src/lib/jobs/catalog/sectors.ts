// Canonical interest taxonomy for the job feed (Module 0).
//
// Single source of truth shared by the preferences UI, the onboarding step, and
// the self-growing catalog resolver. `id` is what we persist (companies.sectors,
// job_preferences.interests); `label` is what the user sees. Keep ids stable —
// changing one orphans existing rows. `hint` steers the LLM resolver when it
// expands a sector into candidate companies.

export interface Sector {
  id: string;
  label: string;
  hint: string;
}

export const SECTORS: Sector[] = [
  { id: "ai_ml", label: "AI / ML", hint: "AI labs, applied ML, model/infra, AI-native products" },
  { id: "fintech", label: "Fintech", hint: "payments, banking, lending, cards, wealth, insurance" },
  { id: "devtools", label: "Dev tools", hint: "developer platforms, DevOps, APIs, IDEs, CI/CD" },
  { id: "data_infra", label: "Data & Infra", hint: "databases, data platforms, cloud infra, observability" },
  { id: "security", label: "Security", hint: "cybersecurity, compliance, identity, infra security" },
  { id: "enterprise_saas", label: "Enterprise SaaS", hint: "B2B software, productivity, vertical SaaS, workflow" },
  { id: "consumer", label: "Consumer", hint: "consumer apps, marketplaces, social, mobility, food" },
  { id: "healthcare", label: "Healthcare", hint: "health tech, bio, digital health, care delivery" },
  { id: "crypto", label: "Crypto / Web3", hint: "crypto exchanges, blockchain infra, web3 protocols" },
  { id: "climate", label: "Climate", hint: "climate tech, energy, sustainability, carbon" },
  { id: "ecommerce", label: "E-commerce", hint: "online retail, commerce platforms, DTC, logistics" },
  { id: "gaming", label: "Gaming", hint: "game studios, gaming platforms, interactive entertainment" },
];

export const SECTOR_IDS = SECTORS.map((s) => s.id);

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

export function sectorLabel(id: string): string {
  return SECTOR_BY_ID.get(id)?.label ?? id;
}

export function isSectorId(id: string): boolean {
  return SECTOR_BY_ID.has(id);
}
