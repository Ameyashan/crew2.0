import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveUserId } from "@/lib/auth";
import { Timeline, type TimelineItem } from "@/components/Timeline";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PersonPage({ params }: Props) {
  const userId = await resolveUserId();
  if (!userId) redirect("/");
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: person } = await sb
    .from("people")
    .select("id, name, role, company, email, email_confidence, email_source, links, notes")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (!person) return notFound();

  const { data: events } = await sb
    .from("interactions")
    .select(
      "id, agent_type, interaction_type, channel, created_at, draft:drafts(subject, body)"
    )
    .eq("person_id", id)
    .order("created_at", { ascending: false });

  const items: TimelineItem[] = (events ?? []).map((e) => {
    const draft = (Array.isArray(e.draft) ? e.draft[0] : e.draft) as
      | { subject?: string | null; body?: string | null }
      | null;
    return {
      id: e.id as string,
      agent_type: e.agent_type as string,
      kind: e.interaction_type as string,
      channel: (e.channel as string) ?? null,
      at: e.created_at as string,
      title: titleFor(e.interaction_type as string, e.agent_type as string),
      body: draft?.body ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl" style={{ fontFamily: "var(--font-newsreader)" }}>
          {person.name}
        </h1>
        <p className="text-sm text-[color:var(--color-ink-muted)]">
          {[person.role, person.company].filter(Boolean).join(" · ") || "—"}
        </p>
        <div className="flex flex-wrap gap-3 pt-2 text-xs">
          {person.email && (
            <span className="font-mono text-[color:var(--color-ink-muted)]">
              {person.email}
            </span>
          )}
          {Object.entries((person.links as Record<string, string>) ?? {}).map(([k, v]) => (
            <a
              key={k}
              href={v}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--color-clay)] hover:underline"
            >
              {k}
            </a>
          ))}
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-wide text-[color:var(--color-ink-muted)]">
          Timeline
        </h2>
        <Timeline items={items} />
      </section>
    </div>
  );
}

function titleFor(kind: string, agent: string): string {
  const verb =
    kind === "drafted"
      ? "Drafted"
      : kind === "sent"
        ? "Sent"
        : kind === "replied"
          ? "Replied"
          : kind === "no_reply"
            ? "Marked no reply"
            : kind === "followed_up"
              ? "Followed up"
              : kind === "clicked"
                ? "Link clicked"
                : kind;
  return `${verb} · ${agent.replace("_", " ")}`;
}
