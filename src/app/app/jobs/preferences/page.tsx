"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS } from "@/components/paper/fonts";
import { usePaperTheme } from "@/components/paper/use-paper-theme";
import { PageHead, PaperCard, InkButton, Eyebrow } from "@/components/paper/primitives";
import type { Palette } from "@/components/paper/palette";
import { useIsMobile } from "@/lib/use-is-mobile";
import { SECTORS } from "@/lib/jobs/catalog/sectors";
import type { PreferencesDTO, PostedWithin } from "@/lib/jobs/types";

const POSTED_OPTIONS: { id: PostedWithin; label: string }[] = [
  { id: "24h", label: "Last 24h" },
  { id: "1wk", label: "Last week" },
  { id: "1mo", label: "Last month" },
  { id: "any", label: "Any time" },
];

const SIZE_OPTIONS = [
  { id: "startup", label: "Startups" },
  { id: "medium", label: "Mid-size" },
  { id: "large", label: "Large" },
];

const LOCATION_OPTIONS = [
  { id: "nyc", label: "New York" },
  { id: "sf", label: "SF / Bay Area" },
  { id: "boston", label: "Boston" },
  { id: "seattle", label: "Seattle" },
  { id: "la", label: "Los Angeles" },
  { id: "remote", label: "Remote" },
  { id: "anywhere", label: "Anywhere" },
];

function Chip({
  p,
  label,
  active,
  onClick,
}: {
  p: Palette;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        fontFamily: PAPER_FONTS.mono,
        fontSize: 13,
        background: active ? p.ink : "transparent",
        color: active ? p.paper : p.ink,
        border: `1.5px solid ${p.ink}`,
        boxShadow: active ? `2px 2px 0 ${p.marigold}` : "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Group({
  p,
  eyebrow,
  hint,
  color,
  children,
}: {
  p: Palette;
  eyebrow: string;
  hint?: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <PaperCard p={p} color={color} hardShadow style={{ marginBottom: 12 }}>
      <Eyebrow p={p} en={eyebrow} color={color} />
      {hint && (
        <p
          style={{
            margin: "6px 0 12px",
            fontFamily: PAPER_FONTS.serif,
            fontStyle: "italic",
            fontSize: 13.5,
            color: p.inkSoft,
          }}
        >
          {hint}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: hint ? 0 : 12 }}>{children}</div>
    </PaperCard>
  );
}

const DEFAULTS: PreferencesDTO = {
  interests: [],
  posted_within: "any",
  company_sizes: [],
  locations: [],
  visa_required: false,
};

export default function JobsPreferencesPage() {
  const { p } = usePaperTheme();
  const isMobile = useIsMobile();
  const router = useRouter();

  const [prefs, setPrefs] = useState<PreferencesDTO | null>(null);
  const [pins, setPins] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/jobs/preferences")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const dto: PreferencesDTO = j?.preferences ?? DEFAULTS;
        setPrefs({ ...DEFAULTS, ...dto });
        setPins(Array.isArray(dto.pins) ? dto.pins : []);
      })
      .catch(() => alive && setPrefs(DEFAULTS));
    return () => {
      alive = false;
    };
  }, []);

  function toggle(key: "interests" | "company_sizes" | "locations", id: string) {
    setPrefs((cur) => {
      if (!cur) return cur;
      const set = new Set(cur[key]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...cur, [key]: [...set] };
    });
    setSaved(false);
  }

  async function save() {
    if (!prefs) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/jobs/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.preferences) {
        setPrefs({ ...DEFAULTS, ...j.preferences });
        setPins(Array.isArray(j.preferences.pins) ? j.preferences.pins : pins);
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="scroll"
      style={{ flex: 1, overflow: "auto", padding: isMobile ? "24px 16px 64px" : "48px 56px 80px" }}
    >
      <PageHead
        p={p}
        eyebrow="Jobs · preferences"
        title="What should we"
        italic="scan for?"
        sub="Pick the sectors you care about — they decide which companies we watch. The filters below narrow what reaches your feed. Changes apply to your next refresh."
        right={
          <InkButton p={p} kind="outline" size="sm" onClick={() => router.push("/app/jobs")}>
            ← Back to feed
          </InkButton>
        }
      />

      {!prefs ? (
        <p style={{ fontFamily: PAPER_FONTS.mono, fontSize: 13, color: p.inkMute }}>Loading…</p>
      ) : (
        <>
          <Group p={p} eyebrow="Interests" color={p.stamp} hint="Sectors you want to hear about. We grow the company list to match.">
            {SECTORS.map((s) => (
              <Chip key={s.id} p={p} label={s.label} active={prefs.interests.includes(s.id)} onClick={() => toggle("interests", s.id)} />
            ))}
          </Group>

          <Group p={p} eyebrow="Posted within" color={p.marigold}>
            {POSTED_OPTIONS.map((o) => (
              <Chip
                key={o.id}
                p={p}
                label={o.label}
                active={prefs.posted_within === o.id}
                onClick={() => {
                  setPrefs({ ...prefs, posted_within: o.id });
                  setSaved(false);
                }}
              />
            ))}
          </Group>

          <Group p={p} eyebrow="Company size" color={p.leaf} hint="Leave empty for any size.">
            {SIZE_OPTIONS.map((o) => (
              <Chip key={o.id} p={p} label={o.label} active={prefs.company_sizes.includes(o.id as PreferencesDTO["company_sizes"][number])} onClick={() => toggle("company_sizes", o.id)} />
            ))}
          </Group>

          <Group p={p} eyebrow="Location" color={p.tea} hint="Pick cities, Remote, or Anywhere. Leave empty for any.">
            {LOCATION_OPTIONS.map((o) => (
              <Chip key={o.id} p={p} label={o.label} active={prefs.locations.includes(o.id)} onClick={() => toggle("locations", o.id)} />
            ))}
          </Group>

          <Group p={p} eyebrow="Visa sponsorship" color={p.stamp} hint="A soft signal — we badge likely sponsors but never hide jobs we're unsure about.">
            {[
              { v: true, label: "I need sponsorship" },
              { v: false, label: "Not needed" },
            ].map((o) => (
              <Chip
                key={o.label}
                p={p}
                label={o.label}
                active={prefs.visa_required === o.v}
                onClick={() => {
                  setPrefs({ ...prefs, visa_required: o.v });
                  setSaved(false);
                }}
              />
            ))}
          </Group>

          {pins.length > 0 && (
            <PaperCard p={p} style={{ marginBottom: 12 }}>
              <Eyebrow p={p} en="Pinned companies (from your profile)" color={p.inkMute} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {pins.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontFamily: PAPER_FONTS.mono,
                      fontSize: 11,
                      color: p.inkSoft,
                      border: `1px solid ${p.ink}24`,
                      padding: "4px 10px",
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p style={{ margin: "10px 0 0", fontFamily: PAPER_FONTS.serif, fontStyle: "italic", fontSize: 13, color: p.inkMute }}>
                We always watch these too. Edit them in Settings → Goals.
              </p>
            </PaperCard>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
            <InkButton p={p} size="lg" color={p.stamp} disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save preferences"}
            </InkButton>
            {saved && (
              <span style={{ fontFamily: PAPER_FONTS.mono, fontSize: 12, color: p.leaf }}>
                ✓ Saved · applies to your next refresh
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
