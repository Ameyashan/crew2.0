// Generic timeline component. Future agents (Resume, Opportunities) emit
// the same TimelineItem shape and render here without changes.

export interface TimelineItem {
  id: string;
  agent_type: string;          // 'reach_out' | 'resume' | ...
  kind: string;                // 'drafted' | 'sent' | 'replied' | ...
  channel?: string | null;
  at: string;                  // ISO timestamp
  title: string;               // short label
  body?: string | null;        // optional expandable body
}

interface Props {
  items: TimelineItem[];
}

export function Timeline({ items }: Props) {
  if (!items.length)
    return (
      <p className="text-sm italic text-[color:var(--color-ink-muted)]">
        No interactions yet.
      </p>
    );
  return (
    <ol className="relative ml-2 border-l border-[color:var(--color-line)] space-y-4">
      {items.map((it) => (
        <li key={it.id} className="relative pl-6">
          <span
            className="absolute left-[-6px] top-2 h-3 w-3 rounded-full ring-4 ring-[color:var(--color-cream)]"
            style={{ background: dotColor(it.kind) }}
            aria-hidden
          />
          <details className="group">
            <summary className="cursor-pointer list-none">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{it.title}</span>
                  {it.channel && (
                    <span className="ml-2 rounded bg-[color:var(--color-cream-200)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-ink-muted)]">
                      {channelLabel(it.channel)}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-[color:var(--color-ink-muted)]">
                  {formatWhen(it.at)}
                </span>
              </div>
            </summary>
            {it.body && (
              <pre className="mt-2 whitespace-pre-wrap rounded-md border border-[color:var(--color-line)] bg-white/60 p-3 font-sans text-sm">
                {it.body}
              </pre>
            )}
          </details>
        </li>
      ))}
    </ol>
  );
}

function channelLabel(c: string) {
  if (c === "x_dm") return "X DM";
  if (c === "linkedin") return "LinkedIn";
  if (c === "email") return "Email";
  return c;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + `, ${time}`;
}

function dotColor(kind: string): string {
  switch (kind) {
    case "sent":
      return "var(--color-clay)";
    case "replied":
      return "#2f7a4d";
    case "no_reply":
      return "#a0a0a0";
    case "followed_up":
      return "var(--color-clay-dark)";
    case "drafted":
      return "var(--color-cream-200)";
    default:
      return "var(--color-line)";
  }
}
