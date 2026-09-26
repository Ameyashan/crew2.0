"use client";

// "People you know at <company>": the user's own LinkedIn connections who work
// there (imported in Settings). A warm path in beats a cold one, so this sits
// next to every tracked company and job. `renderAction` lets callers attach a
// per-person action (the warm-intro draft); `footer` adds a row under the list.

import { useEffect, useState, type ReactNode } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import type { Connection } from "@/lib/connections/store";

interface AtResponse {
  total: number;
  people: Connection[];
  imported: boolean;
  error?: string;
}

const eyebrow = {
  fontFamily: PAPER_FONTS_V2.mono,
  fontWeight: 500,
  fontSize: 10,
  lineHeight: 1,
  letterSpacing: ".08em",
  color: TOKENS.faint,
} as const;

export function PeopleYouKnow({
  companyId,
  company,
  renderAction,
  footer,
  max = 6,
}: {
  companyId: string | null;
  company: string;
  renderAction?: (person: Connection) => ReactNode;
  footer?: ReactNode;
  max?: number;
}) {
  const [data, setData] = useState<AtResponse | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    const qs = companyId
      ? `company_id=${encodeURIComponent(companyId)}&company=${encodeURIComponent(company)}`
      : `company=${encodeURIComponent(company)}`;
    fetch(`/api/connections/at?${qs}`)
      .then((r) => r.json())
      .then((j: AtResponse) => alive && setData(j))
      .catch(() => alive && setData({ total: 0, people: [], imported: false, error: "failed" }));
    return () => {
      alive = false;
    };
  }, [companyId, company]);

  if (!data || data.error) return null;

  const shown = showAll ? data.people : data.people.slice(0, max);
  return (
    <div
      style={{
        background: TOKENS.card,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        padding: "18px 22px",
      }}
    >
      <div style={{ ...eyebrow, marginBottom: 12 }}>
        {data.total ? `YOU KNOW ${data.total} ${data.total === 1 ? "PERSON" : "PEOPLE"} HERE` : "PEOPLE YOU KNOW HERE"}
      </div>

      {!data.imported ? (
        <p style={{ margin: 0, fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1.6, color: TOKENS.muted }}>
          A warm intro beats a cold application.{" "}
          <a href="/app/settings#connections" style={{ color: TOKENS.amber, textDecoration: "none" }}>
            Import your LinkedIn connections →
          </a>{" "}
          to see who you know at {company}.
        </p>
      ) : !data.total ? (
        <p style={{ margin: 0, fontFamily: "system-ui, sans-serif", fontSize: 13, lineHeight: 1.6, color: TOKENS.muted }}>
          None of your LinkedIn connections list {company} as their company.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {shown.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 0",
                borderTop: i === 0 ? "none" : `1px solid ${TOKENS.lineRow}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13.5, color: TOKENS.ink }}>
                  {p.linkedin_url ? (
                    <a href={p.linkedin_url} target="_blank" rel="noreferrer" style={{ color: TOKENS.ink, textDecoration: "none" }}>
                      {p.full_name} <span style={{ color: TOKENS.faint }}>↗</span>
                    </a>
                  ) : (
                    p.full_name
                  )}
                </div>
                {p.position && (
                  <div
                    style={{
                      fontFamily: "system-ui, sans-serif",
                      fontSize: 12,
                      color: TOKENS.muted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.position}
                  </div>
                )}
              </div>
              {renderAction?.(p)}
            </div>
          ))}
          {data.people.length > max && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              style={{
                alignSelf: "flex-start",
                marginTop: 6,
                background: "transparent",
                border: "none",
                padding: 0,
                fontFamily: "system-ui, sans-serif",
                fontSize: 12,
                color: TOKENS.amber,
                cursor: "pointer",
              }}
            >
              {showAll ? "Show fewer" : `Show all ${data.people.length}`}
            </button>
          )}
        </div>
      )}
      {footer && <div style={{ marginTop: 14 }}>{footer}</div>}
    </div>
  );
}
