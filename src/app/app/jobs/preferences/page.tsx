"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { InkButton2 } from "@/components/paper/primitives2";
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
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: 13,
        background: active ? TOKENS.ink : "transparent",
        color: active ? TOKENS.paper : TOKENS.ink,
        border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
        borderRadius: RADII.pill,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Group({
  eyebrow,
  hint,
  color,
  children,
}: {
  eyebrow: string;
  hint?: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: TOKENS.card,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: SHADOWS.card,
        padding: "20px 22px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontFamily: PAPER_FONTS_V2.mono,
          fontSize: 10.5,
          color,
          letterSpacing: ".1em",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      {hint && (
        <p
          style={{
            margin: "6px 0 12px",
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 13.5,
            color: TOKENS.inkSoft,
          }}
        >
          {hint}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: hint ? 0 : 12 }}>{children}</div>
    </div>
  );
}

const DEFAULTS: PreferencesDTO = {
  interests: [],
  posted_within: "any",
  company_sizes: [],
  locations: [],
  visa_required: false,
  role_mode: null,
  target_roles: [],
  current_role: null,
};

export default function JobsPreferencesPage() {
  const isMobile = useIsMobile();
  const router = useRouter();

  const [prefs, setPrefs] = useState<PreferencesDTO | null>(null);
  const [pins, setPins] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
    try {
      const res = await fetch("/api/jobs/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Only claim success when the server actually accepted the save.
        throw new Error(j?.error || `save failed: ${res.status}`);
      }
      if (j?.preferences) {
        setPrefs({ ...DEFAULTS, ...j.preferences });
        setPins(Array.isArray(j.preferences.pins) ? j.preferences.pins : pins);
      }
      setSaved(true);
    } catch (e) {
      setSaveError("Couldn't save — please try again.");
      console.error("[jobs/preferences] save failed", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="scroll"
      style={{ flex: 1, overflow: "auto", padding: isMobile ? "24px 16px 64px" : "48px 56px 80px", background: TOKENS.paper }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 10.5,
              color: TOKENS.muted,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Jobs · preferences
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: PAPER_FONTS_V2.serif,
              fontWeight: 400,
              fontSize: "clamp(40px, 4.8vw, 64px)",
              lineHeight: 0.95,
              letterSpacing: "-.02em",
              color: TOKENS.ink,
              textWrap: "balance",
            }}
          >
            What should we <span style={{ fontStyle: "italic", color: TOKENS.red }}>scan for?</span>
          </h1>
          <p
            style={{
              margin: "14px 0 0",
              fontFamily: PAPER_FONTS_V2.serif,
              fontStyle: "italic",
              fontSize: 18,
              lineHeight: 1.45,
              color: TOKENS.inkSoft,
              maxWidth: 720,
            }}
          >
            Pick the sectors you care about — they decide which companies we watch. The filters below narrow what reaches your feed. Changes apply to your next refresh.
          </p>
        </div>
        <div style={{ flexShrink: 0 }}>
          <InkButton2 kind="outline" size="sm" onClick={() => router.push("/app/jobs")}>
            ← Back to feed
          </InkButton2>
        </div>
      </div>

      {!prefs ? (
        <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading…</p>
      ) : (
        <>
          <Group eyebrow="Interests" color={TOKENS.red} hint="Sectors you want to hear about. We grow the company list to match.">
            {SECTORS.map((s) => (
              <Chip key={s.id} label={s.label} active={prefs.interests.includes(s.id)} onClick={() => toggle("interests", s.id)} />
            ))}
          </Group>

          <Group
            eyebrow="Which roles"
            color={TOKENS.gold}
            hint="Sectors pick which companies we watch; this picks which roles. Otherwise you'd see every opening at those companies."
          >
            <Chip
              label="Like my current title"
              active={prefs.role_mode === "current"}
              onClick={() => {
                setPrefs({ ...prefs, role_mode: "current" });
                setSaved(false);
              }}
            />
            <Chip
              label="A different role"
              active={prefs.role_mode === "different"}
              onClick={() => {
                setPrefs({ ...prefs, role_mode: "different" });
                setSaved(false);
              }}
            />
            {/* Full-width helper row under the two chips. */}
            <div style={{ flexBasis: "100%", height: 0 }} />
            {prefs.role_mode === "current" &&
              (prefs.current_role ? (
                <p style={{ margin: "10px 0 0", fontFamily: PAPER_FONTS_V2.serif, fontStyle: "italic", fontSize: 13.5, color: TOKENS.inkSoft }}>
                  We&apos;ll match roles like <strong>{prefs.current_role}</strong> — read from your resume.
                </p>
              ) : (
                <p style={{ margin: "10px 0 0", fontFamily: PAPER_FONTS_V2.serif, fontStyle: "italic", fontSize: 13.5, color: TOKENS.red }}>
                  We don&apos;t know your current title yet.{" "}
                  <button
                    onClick={() => router.push("/app/resume")}
                    style={{ border: "none", background: "transparent", padding: 0, color: TOKENS.red, textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                  >
                    Upload your resume
                  </button>{" "}
                  so we can match your role, or pick “A different role”.
                </p>
              ))}
            {prefs.role_mode === "different" && (
              <input
                value={prefs.target_roles.join(", ")}
                onChange={(e) => {
                  const roles = e.target.value
                    .split(",")
                    .map((r) => r.trim())
                    .filter(Boolean);
                  setPrefs({ ...prefs, target_roles: roles });
                  setSaved(false);
                }}
                placeholder="e.g. Product Manager, Program Manager"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  marginTop: 10,
                  border: `1px solid ${prefs.target_roles.length ? TOKENS.ink : TOKENS.line}`,
                  borderRadius: RADII.panelTight,
                  padding: "12px 14px",
                  background: TOKENS.card,
                  color: TOKENS.ink,
                  fontFamily: PAPER_FONTS_V2.serif,
                  fontSize: 15,
                  outline: "none",
                }}
              />
            )}
          </Group>

          <Group eyebrow="Posted within" color={TOKENS.gold}>
            {POSTED_OPTIONS.map((o) => (
              <Chip
                key={o.id}
                label={o.label}
                active={prefs.posted_within === o.id}
                onClick={() => {
                  setPrefs({ ...prefs, posted_within: o.id });
                  setSaved(false);
                }}
              />
            ))}
          </Group>

          <Group eyebrow="Company size" color={TOKENS.green} hint="Leave empty for any size.">
            {SIZE_OPTIONS.map((o) => (
              <Chip key={o.id} label={o.label} active={prefs.company_sizes.includes(o.id as PreferencesDTO["company_sizes"][number])} onClick={() => toggle("company_sizes", o.id)} />
            ))}
          </Group>

          <Group eyebrow="Location" color={TOKENS.muted2} hint="Pick cities, Remote, or Anywhere. Leave empty for any.">
            {LOCATION_OPTIONS.map((o) => (
              <Chip key={o.id} label={o.label} active={prefs.locations.includes(o.id)} onClick={() => toggle("locations", o.id)} />
            ))}
          </Group>

          <Group eyebrow="Visa sponsorship" color={TOKENS.red} hint="A soft signal — we badge likely sponsors but never hide jobs we're unsure about.">
            {[
              { v: true, label: "I need sponsorship" },
              { v: false, label: "Not needed" },
            ].map((o) => (
              <Chip
                key={o.label}
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
            <div
              style={{
                background: TOKENS.card,
                border: `1px solid ${TOKENS.lineSoft}`,
                borderRadius: RADII.card,
                boxShadow: SHADOWS.card,
                padding: "20px 22px",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 10.5,
                  color: TOKENS.muted,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                }}
              >
                Pinned companies (from your profile)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {pins.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontFamily: PAPER_FONTS_V2.mono,
                      fontSize: 11,
                      color: TOKENS.inkSoft,
                      border: `1px solid ${TOKENS.line}`,
                      borderRadius: RADII.pill,
                      padding: "4px 12px",
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p style={{ margin: "10px 0 0", fontFamily: PAPER_FONTS_V2.serif, fontStyle: "italic", fontSize: 13, color: TOKENS.muted }}>
                We always watch these too. Edit them in Settings → Goals.
              </p>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
            <InkButton2 kind="solid" disabled={saving} onClick={save} style={{ padding: "12px 20px", fontSize: 15 }}>
              {saving ? "Saving…" : "Save preferences"}
            </InkButton2>
            {saved && !saveError && (
              <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.green }}>
                ✓ Saved · applies to your next refresh
              </span>
            )}
            {saveError && (
              <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.red }}>
                {saveError}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
