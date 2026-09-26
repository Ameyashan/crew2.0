import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { selectAll } from "@/lib/jobs/paging";
import { loadTracker } from "@/lib/jobs/tracker";
import { compDisplay, diversifyByCompany } from "@/lib/jobs/format";
import type { TrackerJob } from "@/lib/jobs/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// The daily jobs email: for each user tracking companies, the roles that
// opened at those companies since their last email (title- and
// location-filtered exactly like the tracker page), sent via Resend. No LLM —
// it reads the same data as /app/jobs. Idempotent per day: the cutoff is the
// last jobs_email_log row, so a re-run finds nothing new and sends nothing.
const MAX_EMAIL_JOBS = 12;
const PER_COMPANY_CAP = 4;
// A user whose emails have lapsed (cron outage, new opt-in) shouldn't get a
// months-deep backlog: the "new since" window never looks back further than
// this many days.
const MAX_WINDOW_DAYS = 7;

function digestHtml(items: TrackerJob[], total: number, companyCount: number): string {
  const cards = items
    .map((it) => {
      const comp = compDisplay(it.compensation);
      const meta = [it.location, comp.listed ? comp.label : null]
        .filter(Boolean)
        .map((s) => escapeHtml(String(s)))
        .join(" &nbsp;·&nbsp; ");
      return `
      <a href="${SITE_URL}/app/jobs/${it.job_id}" style="display:block;text-decoration:none;background:#fffdf8;border:1px solid #e8e2d4;border-radius:12px;padding:16px 20px;margin-bottom:10px;">
        <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.1em;color:#8a8272;">${escapeHtml(it.company)}</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.3;color:#2b2820;margin-top:6px;">${escapeHtml(it.title)}</div>
        ${meta ? `<div style="font-family:system-ui,sans-serif;font-size:12.5px;color:#6f6a5c;margin-top:6px;">${meta}</div>` : ""}
      </a>`;
    })
    .join("");

  const more =
    total > items.length
      ? `<p style="font-family:system-ui,sans-serif;font-size:13px;color:#6f6a5c;">+ ${total - items.length} more on your tracker.</p>`
      : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f4ec;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#2b2820;margin-bottom:4px;">New at the companies you track</div>
    <p style="font-family:system-ui,sans-serif;font-size:13.5px;color:#6f6a5c;margin:0 0 22px;">${total} new role${total === 1 ? "" : "s"} across your ${companyCount} tracked compan${companyCount === 1 ? "y" : "ies"} since your last digest.</p>
    ${cards}
    ${more}
    <p style="font-family:system-ui,sans-serif;font-size:13px;color:#6f6a5c;margin-top:20px;">
      <a href="${SITE_URL}/app/jobs" style="color:#2b2820;">Open your tracker</a>
      &nbsp;·&nbsp;
      <a href="${SITE_URL}/app/jobs/preferences" style="color:#8a8272;">email preferences</a>
    </p>
  </div>
</body></html>`;
}

function digestText(items: TrackerJob[], total: number): string {
  const lines = items.map((it) => {
    const comp = compDisplay(it.compensation);
    const meta = [it.location, comp.listed ? comp.label : null].filter(Boolean).join(" · ");
    return `${it.title} — ${it.company}${meta ? ` (${meta})` : ""}\n${SITE_URL}/app/jobs/${it.job_id}`;
  });
  return `${total} new role${total === 1 ? "" : "s"} at the companies you track.\n\n${lines.join("\n\n")}\n\nYour tracker: ${SITE_URL}/app/jobs`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  // Fail CLOSED like daily-digest: no secret configured means no endpoint.
  if (!expected) {
    return Response.json({ error: "cron secret not configured" }, { status: 503 });
  }
  if (auth !== `Bearer ${expected}` && req.headers.get("x-cron-secret") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    // Nothing would send anyway; make the misconfiguration loud in cron logs.
    return Response.json({ error: "RESEND_API_KEY not set" }, { status: 503 });
  }

  const sb = supabaseAdmin();

  // Everyone tracking at least one company; the email follows the tracker.
  const follows = await selectAll<{ user_id: string }>((from, to) =>
    sb.from("followed_companies").select("user_id").order("user_id").range(from, to),
  );
  const users = [...new Set(follows.map((r) => r.user_id))];

  // One pass for the opt-out flags; no preferences row = default (on).
  const { data: prefRows } = await sb.from("job_preferences").select("user_id, daily_email");
  const optedOut = new Set((prefRows ?? []).filter((r) => r.daily_email === false).map((r) => r.user_id as string));

  const results: Array<Record<string, unknown>> = [];
  for (const uid of users) {
    try {
      if (optedOut.has(uid)) {
        results.push({ user_id: uid, skipped: "opted_out" });
        continue;
      }

      // "New since" = last email actually sent, floored to a bounded window.
      const { data: lastLog } = await sb
        .from("jobs_email_log")
        .select("sent_at")
        .eq("user_id", uid)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const floor = Date.now() - MAX_WINDOW_DAYS * 86_400_000;
      const lastSent = lastLog?.sent_at ? Date.parse(lastLog.sent_at) : NaN;
      const newSince = Number.isFinite(lastSent) ? Math.max(lastSent, floor) : Date.now() - 86_400_000;

      const tracker = await loadTracker(sb, uid, { newSince });
      const all = tracker.new_jobs;
      const items = diversifyByCompany(all, PER_COMPANY_CAP).slice(0, MAX_EMAIL_JOBS);

      if (!items.length) {
        results.push({ user_id: uid, skipped: "no_new_roles" });
        continue;
      }

      const { data: authUser, error: uErr } = await sb.auth.admin.getUserById(uid);
      const to = authUser?.user?.email;
      if (uErr || !to) {
        results.push({ user_id: uid, skipped: "no_email_address" });
        continue;
      }

      const subject = `${all.length} new role${all.length === 1 ? "" : "s"} at companies you track`;
      const sent = await sendEmail({
        to,
        subject,
        html: digestHtml(items, all.length, tracker.companies.length),
        text: digestText(items, all.length),
      });
      if (!sent.ok) {
        results.push({ user_id: uid, error: sent.error });
        continue;
      }

      const { error: logErr } = await sb.from("jobs_email_log").insert({
        user_id: uid,
        match_count: all.length,
        job_ids: items.map((i) => i.job_id),
      });
      // A missing log row would re-send tomorrow — loud, but not fatal today.
      if (logErr) console.error("[jobs-email] log insert failed", logErr);

      results.push({ user_id: uid, sent: all.length });
    } catch (e) {
      results.push({ user_id: uid, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return Response.json({ ok: true, count: results.length, results });
}
