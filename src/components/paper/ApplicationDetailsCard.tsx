"use client";

import { useState, type CSSProperties } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import type { UserProfile } from "@/lib/profile";

export type ApplicationDetailsPatch = Partial<
  Pick<UserProfile, "email" | "phone" | "location" | "github_url" | "portfolio_url" | "needs_sponsorship">
>;

const ROWS = [
  { key: "email", label: "Email", placeholder: "you@example.com", type: "email" },
  { key: "phone", label: "Phone", placeholder: "+1 555 555 5555", type: "tel" },
  { key: "location", label: "Location", placeholder: "City, State, Country", type: "text" },
  { key: "github_url", label: "GitHub", placeholder: "https://github.com/you", type: "url" },
  { key: "portfolio_url", label: "Portfolio / website", placeholder: "https://you.dev", type: "url" },
] as const;

type FieldKey = (typeof ROWS)[number]["key"];

// Contact + logistics fields the Chrome extension autofills into ATS forms.
// Kept as one save so a half-edited card never partially lands. Used on the
// Settings page and as step 1 of the Jobs tracker setup.
//
// State initializes from `profile`; callers re-key this component when the
// profile loads so a late load remounts with real values.
//
// With `onSaved` (the setup wizard) the button always works: it saves when
// something changed, then calls onSaved either way — it's the step's
// "continue" too.
export function ApplicationDetailsCard({
  profile,
  saveProfile,
  isMobile,
  onSaved,
  saveLabel = "Save details",
  showExtensionLink = true,
  style,
}: {
  profile: Partial<UserProfile> | null;
  saveProfile: (patch: ApplicationDetailsPatch) => Promise<void>;
  isMobile: boolean;
  onSaved?: () => void;
  saveLabel?: string;
  showExtensionLink?: boolean;
  style?: CSSProperties;
}) {
  const [fields, setFields] = useState<Record<FieldKey, string>>(() => ({
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    location: profile?.location ?? "",
    github_url: profile?.github_url ?? "",
    portfolio_url: profile?.portfolio_url ?? "",
  }));
  const [needsSponsorship, setNeedsSponsorship] = useState<boolean | null>(() =>
    typeof profile?.needs_sponsorship === "boolean" ? profile.needs_sponsorship : null,
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function setField(key: FieldKey, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (dirty) {
        await saveProfile({
          email: fields.email.trim() || null,
          phone: fields.phone.trim() || null,
          location: fields.location.trim() || null,
          github_url: fields.github_url.trim() || null,
          portfolio_url: fields.portfolio_url.trim() || null,
          needs_sponsorship: needsSponsorship,
        });
        setDirty(false);
      }
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 12px",
    background: TOKENS.card,
    color: TOKENS.ink,
    border: `1px solid ${TOKENS.line}`,
    borderRadius: RADII.panelTight,
    fontFamily: PAPER_FONTS_V2.sans,
    fontSize: 13.5,
    outline: "none",
  };
  const labelStyle: CSSProperties = {
    fontFamily: PAPER_FONTS_V2.mono,
    fontSize: 11,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: TOKENS.muted,
    marginBottom: 4,
    display: "block",
  };

  const canSave = !saving && (dirty || !!onSaved);

  return (
    <div
      style={{
        background: TOKENS.card,
        color: TOKENS.ink,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: SHADOWS.card,
        padding: "20px 22px",
        ...style,
      }}
    >
      <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 20, marginBottom: 4, color: TOKENS.ink }}>
        Application details
      </div>
      <p
        style={{
          margin: "0 0 14px",
          fontFamily: PAPER_FONTS_V2.serif,
          fontStyle: "italic",
          fontSize: 14,
          color: TOKENS.muted,
        }}
      >
        What the Jugaadu extension fills into job application forms. Only what you enter here is used — never
        guessed.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        {ROWS.map((row) => (
          <div key={row.key}>
            <label style={labelStyle}>{row.label}</label>
            <input
              type={row.type}
              value={fields[row.key]}
              onChange={(e) => setField(row.key, e.target.value)}
              placeholder={row.placeholder}
              style={inputStyle}
            />
          </div>
        ))}
        <div>
          <label style={labelStyle}>Need visa sponsorship?</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { v: true, label: "Yes" },
              { v: false, label: "No" },
            ].map((opt) => {
              const active = needsSponsorship === opt.v;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    setNeedsSponsorship(active ? null : opt.v);
                    setDirty(true);
                  }}
                  style={{
                    padding: "7px 14px",
                    fontFamily: PAPER_FONTS_V2.mono,
                    fontSize: 13,
                    borderRadius: RADII.pill,
                    background: active ? TOKENS.ink : "transparent",
                    color: active ? TOKENS.paper : TOKENS.ink,
                    border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
                    cursor: "pointer",
                    transition: "background .15s, border-color .15s",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          style={{
            background: TOKENS.ink,
            color: TOKENS.paper,
            border: "1px solid transparent",
            borderRadius: RADII.buttonTight,
            padding: "7px 14px",
            fontFamily: PAPER_FONTS_V2.sans,
            fontSize: 13,
            fontWeight: 500,
            cursor: canSave ? "pointer" : "not-allowed",
            opacity: canSave ? 1 : 0.45,
            transition: "background .15s, border-color .15s",
          }}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
        {showExtensionLink && (
          <a
            href="/app/settings/extension"
            style={{
              fontFamily: PAPER_FONTS_V2.mono,
              fontSize: 12,
              color: TOKENS.muted,
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Connect the Chrome extension →
          </a>
        )}
      </div>
    </div>
  );
}
