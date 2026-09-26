"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII, SHADOWS } from "@/components/paper/tokens";
import { InkButton2 } from "@/components/paper/primitives2";
import { CompanyLogo } from "@/components/paper/CompanyLogo";
import { ApplicationDetailsCard, type ApplicationDetailsPatch } from "@/components/paper/ApplicationDetailsCard";
import { SECTORS } from "@/lib/jobs/catalog/sectors";
import { TRACK_LIMIT } from "@/lib/jobs/tracker-match";
import { track } from "@/lib/analytics/client";
import { useIsMobile } from "@/lib/use-is-mobile";
import type { UserProfile } from "@/lib/profile";
import type {
  PreferencesDTO,
  TrackedCompany,
  TrackerCompanyOption,
  TrackerPreset,
} from "@/lib/jobs/types";

// Tracker setup: application details → roles & location → companies → done.
// Shown the first time someone opens Jobs (nothing tracked yet), and again
// from the tracker's "Edit" buttons starting at the relevant step.

export type SetupStep = 0 | 1 | 2 | 3;

const STEP_LABELS = ["Your details", "Roles", "Companies"];

const LOCATION_OPTIONS = [
  { id: "nyc", label: "New York" },
  { id: "sf", label: "SF / Bay Area" },
  { id: "boston", label: "Boston" },
  { id: "seattle", label: "Seattle" },
  { id: "la", label: "Los Angeles" },
  { id: "remote", label: "Remote" },
  { id: "anywhere", label: "Anywhere" },
];

interface Picked {
  company_id: string;
  name: string;
}

function Chip({ label, active, onClick }: { label: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        fontFamily: PAPER_FONTS_V2.mono,
        fontSize: 12.5,
        background: active ? TOKENS.ink : "transparent",
        color: active ? TOKENS.paper : TOKENS.ink,
        border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
        borderRadius: RADII.pill,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: TOKENS.card,
        border: `1px solid ${TOKENS.lineSoft}`,
        borderRadius: RADII.card,
        boxShadow: SHADOWS.card,
        padding: "20px 22px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const eyebrow: CSSProperties = {
  fontFamily: PAPER_FONTS_V2.mono,
  fontSize: 10.5,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: TOKENS.muted,
};

const hint: CSSProperties = {
  margin: "6px 0 12px",
  fontFamily: PAPER_FONTS_V2.serif,
  fontStyle: "italic",
  fontSize: 13.5,
  lineHeight: 1.5,
  color: TOKENS.inkSoft,
};

const linkButton: CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  fontFamily: PAPER_FONTS_V2.mono,
  fontSize: 12,
  color: TOKENS.muted,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
};

export function TrackerSetup({
  initialStep,
  tracked,
  firstRun,
  onDone,
}: {
  initialStep: SetupStep;
  tracked: TrackedCompany[];
  firstRun: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [step, setStep] = useState<SetupStep>(initialStep);

  const [profile, setProfile] = useState<Partial<UserProfile> | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [prefs, setPrefs] = useState<PreferencesDTO | null>(null);
  const [picked, setPicked] = useState<Picked[]>(() => tracked.map((c) => ({ company_id: c.company_id, name: c.name })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/profile")
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/jobs/preferences")
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([p, j]) => {
      if (!alive) return;
      setProfile(p?.profile ?? null);
      setProfileLoaded(true);
      const dto: PreferencesDTO | null = j?.preferences ?? null;
      if (dto) {
        // Default the role axis: their current title when we know it,
        // otherwise ask for one.
        const role_mode = dto.role_mode ?? (dto.current_role ? "current" : "different");
        setPrefs({ ...dto, role_mode });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  async function saveProfile(patch: ApplicationDetailsPatch) {
    setError(null);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setError("Couldn't save your details — please try again.");
      throw new Error(`save failed: ${res.status}`);
    }
    setProfile((cur) => ({ ...(cur ?? {}), ...patch }));
  }

  async function savePrefs(next: PreferencesDTO): Promise<boolean> {
    setError(null);
    const res = await fetch("/api/jobs/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j?.error || "Couldn't save — please try again.");
      return false;
    }
    if (j?.preferences) setPrefs({ ...next, ...j.preferences });
    return true;
  }

  const roleReady =
    !!prefs &&
    ((prefs.role_mode === "current" && !!prefs.current_role) ||
      (prefs.role_mode === "different" && prefs.target_roles.length > 0));

  async function saveRoles() {
    if (!prefs || !roleReady) return;
    setBusy(true);
    try {
      if (await savePrefs(prefs)) setStep(2);
    } finally {
      setBusy(false);
    }
  }

  async function saveCompanies() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/tracker/companies", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_ids: picked.map((p) => p.company_id) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j?.error || "Couldn't save your companies — please try again.");
        return;
      }
      if (firstRun) setStep(3);
      else onDone();
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div style={{ marginBottom: 22 }}>
      <div style={{ ...eyebrow, marginBottom: 8 }}>{firstRun ? "Jobs · quick setup" : "Jobs · edit tracker"}</div>
      <h1
        style={{
          margin: 0,
          fontFamily: PAPER_FONTS_V2.serif,
          fontWeight: 400,
          fontSize: isMobile ? 30 : 40,
          lineHeight: 1.1,
          letterSpacing: "-.015em",
          color: TOKENS.ink,
        }}
      >
        {step === 3 ? (
          <>
            You&apos;re <span style={{ fontStyle: "italic", color: TOKENS.green }}>all set.</span>
          </>
        ) : (
          <>
            Tell us where you want to work — <span style={{ fontStyle: "italic", color: TOKENS.red }}>we&apos;ll watch.</span>
          </>
        )}
      </h1>
      {step !== 3 && (
        <p
          style={{
            margin: "12px 0 0",
            fontFamily: PAPER_FONTS_V2.serif,
            fontStyle: "italic",
            fontSize: 16.5,
            lineHeight: 1.45,
            color: TOKENS.inkSoft,
            maxWidth: 640,
          }}
        >
          Pick up to {TRACK_LIMIT} companies. We check their job boards through the day and show you every new role
          that fits, the moment it opens.
        </p>
      )}
      {step !== 3 && (
        <div style={{ display: "flex", gap: 6, marginTop: 18, flexWrap: "wrap" }}>
          {STEP_LABELS.map((label, i) => {
            const active = step === i;
            const reachable = !firstRun || i <= step;
            return (
              <button
                key={label}
                type="button"
                disabled={!reachable}
                onClick={() => reachable && setStep(i as SetupStep)}
                style={{
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 11,
                  letterSpacing: ".04em",
                  padding: "6px 11px",
                  borderRadius: RADII.pill,
                  border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
                  background: active ? TOKENS.ink : "transparent",
                  color: active ? TOKENS.paper : reachable ? TOKENS.muted2 : TOKENS.faint,
                  cursor: reachable ? "pointer" : "default",
                }}
              >
                {i + 1}. {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const errorLine = error && (
    <p style={{ margin: "12px 0 0", fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.red }}>{error}</p>
  );

  return (
    <div>
      {header}

      {step === 0 &&
        (!profileLoaded ? (
          <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading…</p>
        ) : (
          <>
            <ApplicationDetailsCard
              profile={profile}
              saveProfile={saveProfile}
              isMobile={isMobile}
              onSaved={() => setStep(1)}
              saveLabel="Save & continue"
              showExtensionLink={false}
            />
            <div style={{ display: "flex", gap: 16, marginTop: 14, alignItems: "center" }}>
              <button type="button" style={linkButton} onClick={() => setStep(1)}>
                Skip for now
              </button>
              {!firstRun && (
                <button type="button" style={linkButton} onClick={onDone}>
                  Back to tracker
                </button>
              )}
            </div>
            {errorLine}
          </>
        ))}

      {step === 1 &&
        (!prefs ? (
          <p style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 13, color: TOKENS.muted }}>Loading…</p>
        ) : (
          <>
            <Panel style={{ marginBottom: 12 }}>
              <div style={eyebrow}>Which roles</div>
              <p style={hint}>We only show roles whose title fits — otherwise you&apos;d get every opening at a big company.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Chip
                  label="Like my current title"
                  active={prefs.role_mode === "current"}
                  onClick={() => setPrefs({ ...prefs, role_mode: "current" })}
                />
                <Chip
                  label="Specific roles"
                  active={prefs.role_mode === "different"}
                  onClick={() => setPrefs({ ...prefs, role_mode: "different" })}
                />
              </div>
              {prefs.role_mode === "current" &&
                (prefs.current_role ? (
                  <p style={{ ...hint, margin: "12px 0 0" }}>
                    We&apos;ll match roles like <strong>{prefs.current_role}</strong> — read from your resume.
                  </p>
                ) : (
                  <p style={{ ...hint, margin: "12px 0 0", color: TOKENS.red }}>
                    We don&apos;t know your current title yet — pick “Specific roles” and type the ones you want.
                  </p>
                ))}
              {prefs.role_mode === "different" && (
                <RolesInput
                  roles={prefs.target_roles}
                  onChange={(target_roles) => setPrefs({ ...prefs, target_roles })}
                />
              )}
            </Panel>

            <Panel style={{ marginBottom: 12 }}>
              <div style={eyebrow}>Location</div>
              <p style={hint}>Leave empty for anywhere.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {LOCATION_OPTIONS.map((o) => (
                  <Chip
                    key={o.id}
                    label={o.label}
                    active={prefs.locations.includes(o.id)}
                    onClick={() => {
                      const set = new Set(prefs.locations);
                      if (set.has(o.id)) set.delete(o.id);
                      else set.add(o.id);
                      setPrefs({ ...prefs, locations: [...set] });
                    }}
                  />
                ))}
              </div>
            </Panel>

            <Panel style={{ marginBottom: 12 }}>
              <div style={eyebrow}>Your sector</div>
              <p style={hint}>Used for the “top companies in your sector” shortcut on the next step.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SECTORS.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.label}
                    active={prefs.interests.includes(s.id)}
                    onClick={() => {
                      const set = new Set(prefs.interests);
                      if (set.has(s.id)) set.delete(s.id);
                      else set.add(s.id);
                      setPrefs({ ...prefs, interests: [...set] });
                    }}
                  />
                ))}
              </div>
            </Panel>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
              <InkButton2 kind="solid" disabled={busy || !roleReady} onClick={saveRoles} style={{ padding: "11px 18px" }}>
                {busy ? "Saving…" : "Continue →"}
              </InkButton2>
              {!roleReady && (
                <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: TOKENS.muted }}>
                  Add at least one role to continue.
                </span>
              )}
              {!firstRun && (
                <button type="button" style={linkButton} onClick={onDone}>
                  Back to tracker
                </button>
              )}
            </div>
            {errorLine}
          </>
        ))}

      {step === 2 && (
        <>
          <CompanyPicker
            picked={picked}
            setPicked={setPicked}
            sectors={prefs?.interests ?? []}
            isMobile={isMobile}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
            <InkButton2
              kind="solid"
              disabled={busy || picked.length === 0}
              onClick={saveCompanies}
              style={{ padding: "11px 18px" }}
            >
              {busy
                ? "Saving…"
                : `Start tracking ${picked.length || ""} ${picked.length === 1 ? "company" : "companies"} →`}
            </InkButton2>
            {!firstRun && (
              <button type="button" style={linkButton} onClick={onDone}>
                Cancel
              </button>
            )}
          </div>
          {errorLine}
        </>
      )}

      {step === 3 && (
        <Panel>
          <p
            style={{
              margin: 0,
              fontFamily: PAPER_FONTS_V2.serif,
              fontSize: 18,
              lineHeight: 1.5,
              color: TOKENS.ink,
            }}
          >
            We&apos;re now tracking <strong>{picked.length}</strong>{" "}
            {picked.length === 1 ? "company" : "companies"} for you. We check their job boards every few hours, and
            anything that opened in the last 24 hours shows up at the top of your Jobs page.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "14px 0 4px" }}>
            {picked.map((p) => (
              <span
                key={p.company_id}
                style={{
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 11.5,
                  color: TOKENS.inkSoft,
                  border: `1px solid ${TOKENS.line}`,
                  borderRadius: RADII.pill,
                  padding: "4px 11px",
                }}
              >
                {p.name}
              </span>
            ))}
          </div>
          {prefs && (
            <div style={{ marginTop: 16 }}>
              <div style={eyebrow}>Morning email</div>
              <p style={hint}>A short digest of new roles at your companies. Only sent when something opened.</p>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { v: true, label: "Send it" },
                  { v: false, label: "No email" },
                ].map((o) => (
                  <Chip
                    key={o.label}
                    label={o.label}
                    active={(prefs.daily_email !== false) === o.v}
                    onClick={() => void savePrefs({ ...prefs, daily_email: o.v })}
                  />
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
            <InkButton2 kind="solid" onClick={onDone} style={{ padding: "11px 18px" }}>
              See today&apos;s roles →
            </InkButton2>
            <button type="button" style={linkButton} onClick={() => router.push("/app/settings/extension")}>
              Set up one-click apply (Chrome extension)
            </button>
          </div>
          {errorLine}
        </Panel>
      )}
    </div>
  );
}

// Comma-separated role titles, committed on blur so typing a comma mid-word
// doesn't fight the input.
function RolesInput({ roles, onChange }: { roles: string[]; onChange: (roles: string[]) => void }) {
  const [text, setText] = useState(() => roles.join(", "));
  const commit = (v: string) =>
    onChange(
      v
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
        .slice(0, 6),
    );
  return (
    <input
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      placeholder="e.g. Product Manager, Program Manager"
      style={{
        width: "100%",
        boxSizing: "border-box",
        marginTop: 12,
        border: `1px solid ${roles.length ? TOKENS.ink : TOKENS.line}`,
        borderRadius: RADII.panelTight,
        padding: "12px 14px",
        background: TOKENS.card,
        color: TOKENS.ink,
        fontFamily: PAPER_FONTS_V2.serif,
        fontSize: 15,
        outline: "none",
      }}
    />
  );
}

function CompanyPicker({
  picked,
  setPicked,
  sectors,
  isMobile,
}: {
  picked: Picked[];
  setPicked: (fn: (cur: Picked[]) => Picked[]) => void;
  sectors: string[];
  isMobile: boolean;
}) {
  const [sector, setSector] = useState<string | null>(sectors[0] ?? null);
  const [presets, setPresets] = useState<{ sector: string | null; list: TrackerPreset[] } | null>(null);
  const [presetId, setPresetId] = useState<TrackerPreset["id"] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; list: TrackerCompanyOption[] } | null>(null);
  const [noted, setNoted] = useState<Set<string>>(new Set());

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.company_id)), [picked]);
  const full = picked.length >= TRACK_LIMIT;

  useEffect(() => {
    let alive = true;
    const qs = sector ? `?sector=${encodeURIComponent(sector)}` : "";
    fetch(`/api/jobs/tracker/presets${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const list: TrackerPreset[] = Array.isArray(j?.presets) ? j.presets : [];
        setPresets({ sector, list });
        setPresetId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch(() => alive && setPresets({ sector, list: [] }));
    return () => {
      alive = false;
    };
  }, [sector]);

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/jobs/tracker/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => alive && setResults({ q, list: Array.isArray(j?.results) ? j.results : [] }))
        .catch(() => alive && setResults({ q, list: [] }));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const shownResults = q.length >= 2 && results?.q === q ? results.list : null;
  const trackable = shownResults?.filter((r) => r.company_id) ?? [];

  function add(o: { company_id: string | null; name: string }) {
    if (!o.company_id) return;
    const id = o.company_id;
    setPicked((cur) =>
      cur.some((p) => p.company_id === id) || cur.length >= TRACK_LIMIT ? cur : [...cur, { company_id: id, name: o.name }],
    );
  }
  function remove(id: string) {
    setPicked((cur) => cur.filter((p) => p.company_id !== id));
  }
  function toggle(o: TrackerCompanyOption) {
    if (!o.company_id) return;
    if (pickedIds.has(o.company_id)) remove(o.company_id);
    else add(o);
  }
  // Demand signal: someone wanted a company we can't track. Once per name.
  const noteUntrackable = useCallback(
    (name: string) => {
      const key = name.toLowerCase();
      if (noted.has(key)) return;
      setNoted((cur) => new Set(cur).add(key));
      track("tracker_company_untrackable", { name });
    },
    [noted],
  );

  const activePreset = presets?.list.find((p) => p.id === presetId) ?? null;

  return (
    <>
      <Panel style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={eyebrow}>Your companies</div>
          <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 12, color: full ? TOKENS.amber : TOKENS.muted }}>
            {picked.length} / {TRACK_LIMIT}
          </div>
        </div>
        {picked.length ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {picked.map((p) => (
              <span
                key={p.company_id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 12,
                  color: TOKENS.paper,
                  background: TOKENS.ink,
                  borderRadius: RADII.pill,
                  padding: "6px 8px 6px 12px",
                }}
              >
                {p.name}
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => remove(p.company_id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: TOKENS.paper,
                    opacity: 0.7,
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p style={{ ...hint, margin: "10px 0 0" }}>Type a company below or start from one of the lists.</p>
        )}
        {full && (
          <p style={{ ...hint, margin: "10px 0 0", color: TOKENS.amber }}>
            That&apos;s the limit of {TRACK_LIMIT} — remove one to add another.
          </p>
        )}

        <div style={{ position: "relative", marginTop: 16 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (trackable[0]) {
                add(trackable[0]);
                setQuery("");
              } else if (shownResults && q) {
                noteUntrackable(q);
              }
            }}
            placeholder="Type a company — e.g. Stripe, Databricks, Airbnb"
            aria-label="Search companies"
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: `1px solid ${TOKENS.line}`,
              borderRadius: RADII.panelTight,
              padding: "12px 14px",
              background: TOKENS.card,
              color: TOKENS.ink,
              fontFamily: PAPER_FONTS_V2.serif,
              fontSize: 15,
              outline: "none",
            }}
          />
          {shownResults && (
            <div
              style={{
                marginTop: 6,
                border: `1px solid ${TOKENS.lineSoft}`,
                borderRadius: RADII.panelTight,
                background: TOKENS.cardWarm,
                overflow: "hidden",
              }}
            >
              {shownResults.length === 0 ? (
                <UntrackableRow name={q} onNote={noteUntrackable} logWhenSettled />
              ) : (
                shownResults.map((r, i) =>
                  r.company_id ? (
                    <button
                      key={r.company_id}
                      type="button"
                      disabled={full && !pickedIds.has(r.company_id)}
                      onClick={() => {
                        toggle(r);
                        setQuery("");
                      }}
                      style={{
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 12px",
                        border: "none",
                        borderTop: i ? `1px solid ${TOKENS.lineRow}` : "none",
                        background: "transparent",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <CompanyLogo company={r.name} size={24} />
                      <span style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, color: TOKENS.ink }}>{r.name}</span>
                      {r.badge && (
                        <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, color: TOKENS.muted }}>{r.badge}</span>
                      )}
                      <span
                        style={{
                          marginLeft: "auto",
                          fontFamily: PAPER_FONTS_V2.mono,
                          fontSize: 11,
                          color: pickedIds.has(r.company_id) ? TOKENS.green : TOKENS.muted2,
                        }}
                      >
                        {pickedIds.has(r.company_id) ? "✓ added" : "＋ add"}
                      </span>
                    </button>
                  ) : (
                    <UntrackableRow key={`u-${r.name}`} name={r.name} badge={r.badge} border={i > 0} onNote={noteUntrackable} />
                  ),
                )
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <div style={eyebrow}>Or start from a list</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {(presets?.list ?? []).map((p) => (
            <Chip key={p.id} label={p.label} active={presetId === p.id} onClick={() => setPresetId(p.id)} />
          ))}
        </div>
        {presetId === "sector" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {SECTORS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSector(s.id)}
                style={{
                  fontFamily: PAPER_FONTS_V2.mono,
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: RADII.pill,
                  border: `1px solid ${sector === s.id ? TOKENS.inkSoft : TOKENS.lineSoft}`,
                  background: sector === s.id ? TOKENS.chip : "transparent",
                  color: sector === s.id ? TOKENS.ink : TOKENS.muted2,
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {!presets && <p style={{ ...hint, margin: "14px 0 0" }}>Loading…</p>}
        {presets && !sector && (
          <button
            type="button"
            style={{ ...linkButton, marginTop: 12 }}
            onClick={() => {
              setSector(SECTORS[0].id);
              setPresetId("sector");
            }}
          >
            + Top companies by sector
          </button>
        )}
        {activePreset && (
          <>
            {activePreset.companies.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 6,
                  marginTop: 14,
                }}
              >
                {activePreset.companies.map((c) => {
                  const on = !!c.company_id && pickedIds.has(c.company_id);
                  const disabled = !on && full;
                  return (
                    <button
                      key={c.company_id ?? c.name}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(c)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        border: `1px solid ${on ? TOKENS.ink : TOKENS.lineSoft}`,
                        borderRadius: RADII.panelTight,
                        background: on ? TOKENS.hoverWash : TOKENS.card,
                        textAlign: "left",
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <CompanyLogo company={c.name} size={24} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontFamily: PAPER_FONTS_V2.serif, fontSize: 14.5, color: TOKENS.ink }}>
                          {c.name}
                        </span>
                        {c.badge && (
                          <span style={{ display: "block", fontFamily: PAPER_FONTS_V2.mono, fontSize: 10, color: TOKENS.muted }}>
                            {c.badge}
                          </span>
                        )}
                      </span>
                      <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: on ? TOKENS.green : TOKENS.muted2 }}>
                        {on ? "✓" : "＋"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ ...hint, margin: "14px 0 0" }}>Nothing we can track in this list yet.</p>
            )}
            {activePreset.companies.some((c) => c.company_id && !pickedIds.has(c.company_id)) && !full && (
              <button
                type="button"
                style={{ ...linkButton, marginTop: 12 }}
                onClick={() => activePreset.companies.forEach((c) => add(c))}
              >
                Add all{picked.length + activePreset.companies.length > TRACK_LIMIT ? ` (up to ${TRACK_LIMIT})` : ""}
              </button>
            )}
          </>
        )}
      </Panel>
    </>
  );
}

// A company we know about (or a name we don't) but have no job board for.
// Clicking it records the demand; so does a search that found nothing at all,
// once the query has settled (`logWhenSettled`).
function UntrackableRow({
  name,
  badge,
  border,
  onNote,
  logWhenSettled,
}: {
  name: string;
  badge?: string | null;
  border?: boolean;
  onNote: (name: string) => void;
  logWhenSettled?: boolean;
}) {
  useEffect(() => {
    if (!logWhenSettled) return;
    const t = setTimeout(() => onNote(name), 1500);
    return () => clearTimeout(t);
  }, [name, onNote, logWhenSettled]);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNote(name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onNote(name);
      }}
      title="We'll prioritize adding companies people ask for"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderTop: border ? `1px solid ${TOKENS.lineRow}` : "none",
        cursor: "default",
      }}
    >
      <CompanyLogo company={name} size={24} />
      <span style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, color: TOKENS.muted2 }}>{name}</span>
      {badge && <span style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 10.5, color: TOKENS.faint }}>{badge}</span>}
      <span style={{ marginLeft: "auto", fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.amber, textAlign: "right" }}>
        We can&apos;t track this one yet
      </span>
    </div>
  );
}
