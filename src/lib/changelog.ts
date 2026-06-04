// Builds a human-friendly changelog out of the repo's GitHub commit history.
//
// There's no conventional-commit discipline here — messages are plain English
// sentences ("Make the landing page responsive", "Fix job-application crew").
// So instead of parsing `feat:`/`fix:` prefixes we categorise by the leading
// verb, strip any "scope:" prefix, drop merge/CI noise, and group what's left
// into dated "editions" the changelog page renders as newspaper issues.

const REPO = "Ameyashan/crew2.0";
const GITHUB_API = `https://api.github.com/repos/${REPO}/commits`;

export type ChangeKind = "new" | "improved" | "fixed" | "housekeeping" | "docs";

export type ChangeEntry = {
  sha: string;
  short: string;
  title: string;
  kind: ChangeKind;
  url: string;
  author: string;
  date: string; // ISO
};

export type Edition = {
  /** YYYY-MM-DD of the release day. */
  date: string;
  /** Pretty header, e.g. "Thursday, June 4 2026". */
  label: string;
  entries: ChangeEntry[];
};

export type Changelog = {
  editions: Edition[];
  /** Total user-facing changes across all editions. */
  total: number;
  /** Set when we couldn't reach GitHub and returned nothing. */
  error?: string;
};

export const KIND_META: Record<
  ChangeKind,
  { label: string; glyph: string; tone: "marigold" | "leaf" | "stamp" | "tea" }
> = {
  new: { label: "New", glyph: "✦", tone: "marigold" },
  improved: { label: "Improved", glyph: "↑", tone: "leaf" },
  fixed: { label: "Fixed", glyph: "✕", tone: "stamp" },
  housekeeping: { label: "Under the hood", glyph: "⚙", tone: "tea" },
  docs: { label: "Docs", glyph: "✎", tone: "tea" },
};

// Leading verbs → category. Checked against the first real word of the message.
const VERB_KIND: Record<string, ChangeKind> = {
  add: "new",
  added: "new",
  introduce: "new",
  create: "new",
  new: "new",
  ship: "new",
  launch: "new",
  wire: "new",
  fix: "fixed",
  fixed: "fixed",
  correct: "fixed",
  resolve: "fixed",
  patch: "fixed",
  repair: "fixed",
  prevent: "fixed",
  stop: "fixed",
  make: "improved",
  improve: "improved",
  update: "improved",
  enhance: "improved",
  refine: "improved",
  polish: "improved",
  tweak: "improved",
  redesign: "improved",
  rework: "improved",
  show: "improved",
  surface: "improved",
  run: "improved",
  refactor: "housekeeping",
  chore: "housekeeping",
  bump: "housekeeping",
  upgrade: "housekeeping",
  remove: "housekeeping",
  drop: "housekeeping",
  clean: "housekeeping",
  cleanup: "housekeeping",
  rename: "housekeeping",
  move: "housekeeping",
  import: "housekeeping",
  doc: "docs",
  docs: "docs",
  document: "docs",
  readme: "docs",
};

function isNoise(subject: string): boolean {
  const s = subject.trim().toLowerCase();
  return (
    s.startsWith("merge ") ||
    s.startsWith("revert ") ||
    s.startsWith("wip") ||
    s.startsWith("fixup") ||
    s === "" ||
    s.startsWith("bump version") ||
    s.startsWith("ci:") ||
    s.startsWith("ci ")
  );
}

function classify(subject: string): { kind: ChangeKind; title: string } {
  // Drop a leading "scope:" qualifier ("compose: fix ...") so we read the verb.
  const withoutScope = subject.replace(/^[a-z][\w/ -]{0,24}:\s*/, "");
  const firstWord = withoutScope.trim().split(/[\s,]+/)[0]?.toLowerCase() ?? "";
  const kind = VERB_KIND[firstWord] ?? "improved";
  // Title-case the first letter so entries read cleanly regardless of source.
  const title = withoutScope.charAt(0).toUpperCase() + withoutScope.slice(1);
  return { kind, title };
}

function editionLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
  };
  author: { login?: string } | null;
};

export async function getChangelog(limit = 100): Promise<Changelog> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "jugaadu-changelog",
  };
  // A token isn't required for public repos, but lifts the 60/hr rate limit.
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  let commits: GitHubCommit[];
  try {
    const res = await fetch(`${GITHUB_API}?per_page=${limit}`, {
      headers,
      // Cache for 30 min so we don't hammer GitHub on every page view.
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      return { editions: [], total: 0, error: `GitHub responded ${res.status}` };
    }
    commits = (await res.json()) as GitHubCommit[];
  } catch (e) {
    return {
      editions: [],
      total: 0,
      error: e instanceof Error ? e.message : "Could not reach GitHub",
    };
  }

  const byDate = new Map<string, Edition>();
  let total = 0;

  for (const c of commits) {
    const subject = (c.commit?.message ?? "").split("\n")[0];
    if (isNoise(subject)) continue;

    const iso = c.commit?.author?.date;
    if (!iso) continue;
    const date = new Date(iso);
    const dayKey = iso.slice(0, 10);

    const { kind, title } = classify(subject);
    const entry: ChangeEntry = {
      sha: c.sha,
      short: c.sha.slice(0, 7),
      title,
      kind,
      url: c.html_url,
      author: c.author?.login || c.commit?.author?.name || "the crew",
      date: iso,
    };

    let edition = byDate.get(dayKey);
    if (!edition) {
      edition = { date: dayKey, label: editionLabel(date), entries: [] };
      byDate.set(dayKey, edition);
    }
    edition.entries.push(entry);
    total += 1;
  }

  const editions = [...byDate.values()].sort((a, b) =>
    a.date < b.date ? 1 : -1,
  );

  return { editions, total };
}
