import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { feedItemFromJoin, COMPANY_EMBED, type FeedJoinRow } from "@/lib/jobs/serialize";
import {
  loadScanPrefs,
  matchesLocations,
  matchesSize,
  matchesStaffingPref,
  matchesVisaNeed,
  postedThreshold,
} from "@/lib/jobs/scan";
import { compDisplay, diversifyByCompany, postedAgo } from "@/lib/jobs/format";
import type { FeedItem } from "@/lib/jobs/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// The daily jobs email: for each onboarded user, the strong matches scored
// since their last email, rendered as a short digest and sent via Resend.
// Scheduled in vercel.json AFTER the jobs-scan cron so the day's scan has
// landed before we summarize it. Idempotent per day: the cutoff is the last
// jobs_email_log row, so a re-run finds nothing new and sends nothing.
//
// Mirrors the feed's read-side rules (src/app/api/jobs/feed/route.ts): same
// fit bar, same preference re-check, same per-company spread — the email
// should never advertise a job the feed would hide.
const MIN_SCORE = 50;
const MAX_EMAIL_JOBS = 10;
const PER_COMPANY_CAP = 3;
// A user whose emails have lapsed (cron outage, new opt-in) shouldn't get a
// months-deep backlog: the "new since" window never looks back further than
// this many days.
const MAX_WINDOW_DAYS = 7;

const SELECT = `id, score, reasons, status, scored_at, jobs!inner(id, company_id, title, company, location_raw, city, region, country, remote_type, compensation, posted_date, posted_date_approx, url, visa_confidence, visa_evidence, company_size, is_active, ${COMPANY_EMBED})`;

function digestHtml(items: FeedItem[], total: number): string {
  const cards = items
    .map((it) => {
      const comp = compDisplay(it.compensation);
      const posted = postedAgo(it.posted_date, it.posted_date_approx);
      const meta = [it.location, comp.listed ? comp.label : null, posted ? `posted ${posted}` : null]
        .filter(Boolean)
        .map((s) => escapeHtml(String(s)))
        .join(" &nbsp;·&nbsp; ");
      return `
      <a href="${SITE_URL}/app/jobs/${it.job_id}" style="display:block;text-decoration:none;background:#fffdf8;border:1px solid #e8e2d4;border-radius:12px;padding:18px 20px;margin-bottom:12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.1em;color:#8a8272;">${escapeHtml(it.company)}</div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.3;color:#2b2820;margin-top:6px;">${escapeHtml(it.title)}</div>
            ${meta ? `<div style="font-family:system-ui,sans-serif;font-size:12.5px;color:#6f6a5c;margin-top:6px;">${meta}</div>` : ""}
            ${it.reasons ? `<div style="font-family:Georgia,serif;font-style:italic;font-size:13.5px;color:#6f6a5c;margin-top:8px;">${escapeHtml(it.reasons)}</div>` : ""}
          </td>
          <td width="52" valign="top" align="right">
            <div style="border:1px solid #cfc7b4;border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-family:ui-monospace,Menlo,monospace;font-size:16px;color:#2b2820;">${it.score}</div>
              <div style="font-family:ui-monospace,Menlo,monospace;font-size:8px;letter-spacing:.1em;color:#8a8272;margin-top:2px;">FIT</div>
            </div>
          </td>
        </tr></table>
      </a>`;
    })
    .join("");

  const more =
    total > items.length
      ? `<p style="font-family:system-ui,sans-serif;font-size:13px;color:#6f6a5c;">+ ${total - items.length} more in your feed.</p>`
      : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f4ec;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#2b2820;margin-bottom:4px;">Today&rsquo;s jobs, picked for you</div>
    <p style="font-family:system-ui,sans-serif;font-size:13.5px;color:#6f6a5c;margin:0 0 22px;">${total} new match${total === 1 ? "" : "es"} since your last digest, ranked against your Story.</p>
    ${cards}
    ${more}
    <p style="font-family:system-ui,sans-serif;font-size:13px;color:#6f6a5c;margin-top:20px;">
      <a href="${SITE_URL}/app/jobs" style="color:#2b2820;">Open your full feed</a>
      &nbsp;·&nbsp;
      <a href="${SITE_URL}/app/jobs/preferences" style="color:#8a8272;">email preferences</a>
    </p>
  </div>
</body></html>`;
}

function digestText(items: FeedItem[], total: number): string {
  const lines = items.map((it) => {
    const comp = compDisplay(it.compensation);
    const meta = [it.location, comp.listed ? comp.label : null].filter(Boolean).join(" · ");
    return `[${it.score}] ${it.title} — ${it.company}${meta ? ` (${meta})` : ""}\n${SITE_URL}/app/jobs/${it.job_id}`;
  });
  return `${total} new match${total === 1 ? "" : "es"} since your last digest.\n\n${lines.join("\n\n")}\n\nFull feed: ${SITE_URL}/app/jobs`;
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

  const { data: profiles, error: pErr } = await sb
    .from("user_profile")
    .select("user_id")
    .not("onboarded_at", "is", null);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  // One pass for the opt-out flags; users without a preferences row have no
  // scan running and therefore nothing to email.
  const { data: prefRows } = await sb.from("job_preferences").select("user_id, daily_email");
  const emailPref = new Map((prefRows ?? []).map((r) => [r.user_id as string, r.daily_email !== false]));

  const results: Array<Record<string, unknown>> = [];
  for (const { user_id } of profiles ?? []) {
    const uid = user_id as string;
    try {
      if (!emailPref.has(uid)) {
        results.push({ user_id: uid, skipped: "no_preferences" });
        continue;
      }
      if (emailPref.get(uid) === false) {
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
      const cutoff = new Date(
        Number.isFinite(lastSent) ? Math.max(lastSent, floor) : Date.now() - 86_400_000,
      ).toISOString();

      const [{ data: matchData, error: mErr }, { prefs, follows }] = await Promise.all([
        sb
          .from("job_matches")
          .select(SELECT)
          .eq("user_id", uid)
          .eq("status", "new")
          .gte("score", MIN_SCORE)
          .gt("scored_at", cutoff)
          .eq("jobs.is_active", true)
          .order("score", { ascending: false })
          .limit(120),
        loadScanPrefs(sb, uid),
      ]);
      if (mErr) throw new Error(mErr.message);

      // Same preference re-check the feed applies at read time.
      const threshold = postedThreshold(prefs.posted_within);
      const followed = new Set(follows);
      const rows = ((matchData ?? []) as unknown as FeedJoinRow[]).filter((row) => {
        const j = row.jobs;
        if (!j) return false;
        if (!matchesLocations(j, prefs.locations)) return false;
        if (!matchesSize(j, prefs.company_sizes)) return false;
        if (!matchesVisaNeed(j, prefs.visa_required)) return false;
        if (!matchesStaffingPref(j, prefs.include_staffing, followed)) return false;
        if (threshold && j.posted_date && j.posted_date < threshold) return false;
        return true;
      });
      const all = rows.map(feedItemFromJoin).filter((x): x is FeedItem => x !== null);
      const items = diversifyByCompany(all, PER_COMPANY_CAP).slice(0, MAX_EMAIL_JOBS);

      if (!items.length) {
        results.push({ user_id: uid, skipped: "no_new_matches" });
        continue;
      }

      const { data: authUser, error: uErr } = await sb.auth.admin.getUserById(uid);
      const to = authUser?.user?.email;
      if (uErr || !to) {
        results.push({ user_id: uid, skipped: "no_email_address" });
        continue;
      }

      const subject = `${all.length} new job match${all.length === 1 ? "" : "es"} picked for you`;
      const sent = await sendEmail({
        to,
        subject,
        html: digestHtml(items, all.length),
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
