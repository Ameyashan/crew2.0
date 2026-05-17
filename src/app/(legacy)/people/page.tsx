import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PeoplePageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const { q } = await searchParams;
  const sb = supabaseAdmin();
  let query = sb
    .from("people")
    .select("id, name, role, company, updated_at")
    .eq("user_id", USER_ID)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `name.ilike.${term},company.ilike.${term},role.ilike.${term},notes.ilike.${term}`
    );
  }
  const { data: people } = await query;

  const ids = (people ?? []).map((p) => p.id);
  const lastByPerson = new Map<string, string>();
  if (ids.length) {
    const { data: lastRows } = await sb
      .from("interactions")
      .select("person_id, created_at")
      .in("person_id", ids)
      .order("created_at", { ascending: false });
    for (const row of lastRows ?? []) {
      const pid = row.person_id as string;
      if (!lastByPerson.has(pid)) lastByPerson.set(pid, row.created_at as string);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-newsreader)" }}>
        People
      </h1>

      <form action="" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name, company, role, notes…"
          className="w-full rounded-lg border border-[color:var(--color-line)] bg-white/40 px-4 py-2 text-sm outline-none focus:border-[color:var(--color-clay)]"
        />
      </form>

      {(people ?? []).length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-muted)] italic">
          No one here yet. Draft something on the Compose page.
        </p>
      ) : (
        <div className="rounded-lg border border-[color:var(--color-line)] divide-y divide-[color:var(--color-line)] bg-white/40">
          {(people ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/people/${p.id}`}
              className="flex items-baseline justify-between px-4 py-3 hover:bg-[color:var(--color-cream-50)]"
            >
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-[color:var(--color-ink-muted)]">
                  {[p.role, p.company].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="text-xs text-[color:var(--color-ink-muted)]">
                {lastByPerson.get(p.id) ? formatDate(lastByPerson.get(p.id)!) : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
