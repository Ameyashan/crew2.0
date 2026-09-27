"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { PAPER_FONTS_V2 } from "@/components/paper/fonts";
import { TOKENS, RADII } from "@/components/paper/tokens";
import {
  GOAL_SIZES,
  GOAL_SIZE_LABEL,
  REMOTE_PREFS,
  REMOTE_LABEL,
  SENIORITY,
  SENIORITY_LABEL,
  validateGoalSpec,
  type GoalSpec,
} from "@/lib/goal/goal-logic";
import { formToSpecInput, goalChips, specToForm, toggleIn, type GoalForm } from "./goal-view-logic";

const label: CSSProperties = {
  fontFamily: PAPER_FONTS_V2.mono,
  fontSize: 10.5,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: TOKENS.faint,
  marginBottom: 6,
};

const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${TOKENS.line}`,
  borderRadius: RADII.buttonTight,
  padding: "9px 11px",
  background: TOKENS.card,
  color: TOKENS.ink,
  fontFamily: PAPER_FONTS_V2.sans,
  fontSize: 13.5,
  outline: "none",
};

function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        display: "inline-block",
        fontFamily: PAPER_FONTS_V2.sans,
        fontSize: 12,
        lineHeight: 1,
        padding: "7px 11px",
        borderRadius: RADII.pill,
        border: `1px solid ${active ? TOKENS.ink : TOKENS.line}`,
        background: active ? TOKENS.ink : onClick ? TOKENS.card : TOKENS.chip,
        color: active ? TOKENS.paper : TOKENS.ink,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </span>
  );
}

function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <div style={label}>{name}</div>
      {children}
    </div>
  );
}

function Row({ name, value }: { name: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 10, fontFamily: PAPER_FONTS_V2.sans, fontSize: 13, lineHeight: 1.55 }}>
      <span style={{ color: TOKENS.faint2, minWidth: 92, flex: "none" }}>{name}</span>
      <span style={{ color: TOKENS.inkSoft }}>{value}</span>
    </div>
  );
}

function Button({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        fontFamily: PAPER_FONTS_V2.sans,
        fontSize: 13,
        fontWeight: primary ? 500 : 400,
        lineHeight: 1,
        padding: "11px 16px",
        borderRadius: RADII.button,
        border: primary ? "none" : `1px solid ${TOKENS.line}`,
        background: primary ? TOKENS.ink : TOKENS.card,
        color: primary ? TOKENS.paper : TOKENS.ink,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// The goal as a card: read view with Lock / Edit, or an edit form. Used for a
// coach proposal (primary action "Lock in goal") and for the locked goal on
// the goal page (primary action "Save goal").
export function GoalProposalCard({
  goal,
  onLock,
  onKeepChatting,
  lockLabel = "Lock in goal",
  busy = false,
  error = null,
  startEditing = false,
  compact = false,
  readOnly = false,
}: {
  goal: GoalSpec;
  onLock: (goal: GoalSpec, edited: boolean) => void;
  onKeepChatting?: () => void;
  lockLabel?: string;
  busy?: boolean;
  error?: string | null;
  startEditing?: boolean;
  compact?: boolean;
  // Read view shows only Edit (the goal is already locked); saving happens
  // from the edit form.
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [form, setForm] = useState<GoalForm>(() => specToForm(goal));
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof GoalForm>(k: K, v: GoalForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  function saveEdits() {
    const v = validateGoalSpec(formToSpecInput(form, goal));
    if (!v.ok) {
      setFormError(v.errors.join("; "));
      return;
    }
    setFormError(null);
    onLock(v.goal, true);
  }

  const shell: CSSProperties = {
    border: `1px solid ${TOKENS.ink}`,
    borderRadius: RADII.card,
    background: TOKENS.cardWarm,
    padding: compact ? "16px 16px 14px" : "20px 22px 18px",
  };

  if (!editing) {
    const chips = goalChips(goal);
    return (
      <div style={shell}>
        <div style={{ ...label, marginBottom: 8 }}>Your goal</div>
        <div style={{ fontFamily: PAPER_FONTS_V2.serif, fontSize: compact ? 17 : 19, lineHeight: 1.4, color: TOKENS.ink }}>
          {goal.summary}
        </div>
        {chips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0 4px" }}>
            {chips.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
          <Row name="Roles" value={goal.target_roles.join(", ")} />
          <Row name="Level" value={goal.seniority.map((s) => SENIORITY_LABEL[s]).join(", ")} />
          <Row name="Company size" value={goal.company_sizes.map((s) => GOAL_SIZE_LABEL[s]).join(", ")} />
          <Row name="Companies" value={goal.target_companies.join(", ")} />
          <Row name="Must-haves" value={goal.must_haves.join("; ")} />
          <Row name="Dealbreakers" value={goal.dealbreakers.join("; ")} />
          <Row name="Timeline" value={goal.timeline ?? ""} />
        </div>
        {error && (
          <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.red, marginTop: 12 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          {!readOnly && (
            <Button primary onClick={() => onLock(goal, false)} disabled={busy}>
              {busy ? "Saving…" : lockLabel}
            </Button>
          )}
          <Button onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </Button>
          {onKeepChatting && (
            <Button onClick={onKeepChatting} disabled={busy}>
              Keep chatting
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field name="Goal in one sentence">
          <textarea
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            rows={2}
            style={{ ...input, fontFamily: PAPER_FONTS_V2.serif, fontSize: 15, resize: "vertical" }}
          />
        </Field>
        <Field name="Target roles (comma-separated)">
          <input value={form.target_roles} onChange={(e) => set("target_roles", e.target.value)} style={input} />
        </Field>
        <Field name="Level">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SENIORITY.map((s) => (
              <Chip key={s} active={form.seniority.includes(s)} onClick={() => set("seniority", toggleIn(form.seniority, s))}>
                {SENIORITY_LABEL[s]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field name="Pay floor (USD / year)">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={form.comp_floor}
              onChange={(e) => set("comp_floor", e.target.value)}
              placeholder="e.g. 200k"
              style={{ ...input, width: 140 }}
            />
            <Chip active={form.comp_basis === "base"} onClick={() => set("comp_basis", "base")}>
              Base
            </Chip>
            <Chip active={form.comp_basis === "total"} onClick={() => set("comp_basis", "total")}>
              Total comp
            </Chip>
          </div>
        </Field>
        <Field name="Industries / company types (comma-separated)">
          <input
            value={form.industries}
            onChange={(e) => set("industries", e.target.value)}
            placeholder="e.g. hedge funds, investment banks, fintech startups"
            style={input}
          />
        </Field>
        <Field name="Company size">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {GOAL_SIZES.map((s) => (
              <Chip key={s} active={form.company_sizes.includes(s)} onClick={() => set("company_sizes", toggleIn(form.company_sizes, s))}>
                {GOAL_SIZE_LABEL[s]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field name="Locations (comma-separated)">
          <input value={form.locations} onChange={(e) => set("locations", e.target.value)} placeholder="e.g. New York" style={input} />
        </Field>
        <Field name="Remote">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {REMOTE_PREFS.map((r) => (
              <Chip key={r} active={form.remote === r} onClick={() => set("remote", form.remote === r ? "" : r)}>
                {REMOTE_LABEL[r]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field name="Visa sponsorship">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Chip active={form.visa === "yes"} onClick={() => set("visa", form.visa === "yes" ? "" : "yes")}>
              I need sponsorship
            </Chip>
            <Chip active={form.visa === "no"} onClick={() => set("visa", form.visa === "no" ? "" : "no")}>
              I don&apos;t
            </Chip>
          </div>
        </Field>
        <Field name="Priority companies (comma-separated)">
          <input value={form.target_companies} onChange={(e) => set("target_companies", e.target.value)} style={input} />
        </Field>
        <Field name="Must-haves (separate with ;)">
          <input value={form.must_haves} onChange={(e) => set("must_haves", e.target.value)} style={input} />
        </Field>
        <Field name="Dealbreakers (separate with ;)">
          <input value={form.dealbreakers} onChange={(e) => set("dealbreakers", e.target.value)} style={input} />
        </Field>
        <Field name="Card label">
          <input value={form.short_label} onChange={(e) => set("short_label", e.target.value)} maxLength={48} style={input} />
        </Field>
      </div>
      {(formError || error) && (
        <div style={{ fontFamily: PAPER_FONTS_V2.mono, fontSize: 11, color: TOKENS.red, marginTop: 12 }}>
          {formError || error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <Button primary onClick={saveEdits} disabled={busy}>
          {busy ? "Saving…" : lockLabel}
        </Button>
        <Button
          onClick={() => {
            setForm(specToForm(goal));
            setFormError(null);
            setEditing(false);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
