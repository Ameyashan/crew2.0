// Verify a board guess against the live board: it must be up, have enough
// postings, and plausibly belong to THIS company. The ownership test differs
// by ATS:
//   * Greenhouse / Lever / Ashby — board display name or posting text
//     (probe.ts: probeBoard).
//   * SmartRecruiters — every posting carries the company's display name.
//   * Workday / Oracle / Eightfold / iCIMS — tenant names are opaque or
//     collide across employers ("hdpc" is Goldman Sachs, "pfg" is two
//     companies), so the tenant must be the company's name or the board's own
//     text must name it (probe.ts: workdayBelongsTo).
// Large employers must clear LARGE_MIN_JOBS either way.
//
// Relative imports only: shared by the server resolver (universe/resolve.ts)
// and scripts/ run under plain Node.

import { LARGE_MIN_JOBS, probeBoard, sameCompanyName, workdayBelongsTo, type ProbeAts } from "./probe.ts";
import { parseWorkdaySlug, workdayEvidence } from "../sources/workday.ts";
import { oracleEvidence, oracleTenant } from "../sources/oracle.ts";
import { smartRecruitersEvidence } from "../sources/smartrecruiters.ts";
import { eightfoldEvidence, parseEightfoldSlug } from "../sources/eightfold.ts";
import { icimsEvidence, icimsTenant } from "../sources/icims.ts";
import type { Ats } from "@/lib/jobs/types";

export interface BoardAttempt {
  ats: Ats;
  slug: string;
}

export async function verifyBoard(
  a: BoardAttempt,
  row: { name: string; size_bucket: string | null },
): Promise<number | null> {
  const minJobs = row.size_bucket === "large" ? LARGE_MIN_JOBS : 1;
  let n: number | null = null;
  try {
    switch (a.ats) {
      case "workday": {
        const ev = await workdayEvidence(a.slug);
        const tenant = parseWorkdaySlug(a.slug)?.tenant ?? "";
        n = ev && workdayBelongsTo(tenant, ev.text, row.name) ? ev.total : null;
        break;
      }
      case "oracle": {
        const ev = await oracleEvidence(a.slug);
        n = ev && workdayBelongsTo(oracleTenant(a.slug), ev.text, row.name) ? ev.total : null;
        break;
      }
      case "eightfold": {
        const ev = await eightfoldEvidence(a.slug);
        const s = parseEightfoldSlug(a.slug);
        const owned =
          ev &&
          s &&
          (workdayBelongsTo(s.tenant, ev.text, row.name) ||
            workdayBelongsTo(s.domain.split(".")[0], ev.text, row.name));
        n = owned ? ev.total : null;
        break;
      }
      case "icims": {
        const ev = await icimsEvidence(a.slug);
        n = ev && workdayBelongsTo(icimsTenant(a.slug), ev.text, row.name) ? ev.total : null;
        break;
      }
      case "smartrecruiters": {
        const ev = await smartRecruitersEvidence(a.slug);
        const owned =
          ev && (sameCompanyName(ev.companyName, row.name) || workdayBelongsTo(a.slug, ev.companyName, row.name));
        n = owned ? ev.total : null;
        break;
      }
      default:
        n = await probeBoard(a.ats as ProbeAts, a.slug, row.name);
    }
  } catch {
    n = null;
  }
  return n && n >= minJobs ? n : null;
}
