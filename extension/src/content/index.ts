// Content-script orchestrator: fetch the per-job package, fill on request,
// arm on submit, confirm on the ATS success signal. The human always clicks
// Submit — this never submits a form.
import { sendBg, type PackageResponse } from "../shared/messages";
import { pickAdapter } from "./adapters";
import {
  attachFile,
  base64ToFile,
  fillSelects,
  fillTextControls,
  fillYesNoToggles,
  type FillReport,
} from "./fill";
import { removePanel, showPanel } from "./panel";

const adapter = pickAdapter();
let pkg: Extract<PackageResponse, { status: "ok" }> | null = null;
let armedThisPage = false;
let confirmed = false;

const SETTINGS_URL = `${__API_BASE__}/app/settings/extension`;

async function init(): Promise<void> {
  if (!adapter) return;

  if (adapter.isConfirmationPage()) {
    // Lever /thanks: a full navigation, so the armed state lives in the
    // background worker, not page memory.
    await confirmIfArmed();
    return;
  }

  const resp = await sendBg<PackageResponse>({ type: "getPackage", url: adapter.jobUrl() });
  switch (resp.status) {
    case "disconnected":
      // Stay quiet on every job page when not set up — one hint, only in the
      // top frame, only until dismissed this session.
      if (window.top === window && !sessionStorage.getItem("jga-hushed")) {
        sessionStorage.setItem("jga-hushed", "1");
        showPanel({
          title: "Jugaadu isn't connected",
          bodyHtmlSafeLines: ["Connect the extension to autofill this application."],
          actions: [{ label: "Connect", href: SETTINGS_URL }],
        });
      }
      return;
    case "no_profile":
      showPanel({
        title: "Add your application details",
        bodyHtmlSafeLines: [
          "Jugaadu needs your email and phone before it can fill a form.",
        ],
        actions: [{ label: "Open settings", href: resp.settings_url }],
      });
      return;
    case "no_run":
      showPanel({
        title: "No Jugaadu run for this job yet",
        bodyHtmlSafeLines: [
          "Run the crew on this posting first — tailored resume, hiring manager, answers.",
        ],
        actions: [{ label: "Run Jugaadu on this job", href: resp.compose_url }],
      });
      return;
    case "error":
      return;
    case "ok":
      pkg = resp;
      offerFill();
  }
}

function offerFill(): void {
  if (!pkg || !adapter) return;

  if (pkg.submitted) {
    showPanel({
      title: "Already submitted ✓",
      bodyHtmlSafeLines: ["Jugaadu has this application recorded as submitted."],
    });
    return;
  }

  // Posting page (Lever / Ashby): the form lives on a sibling page.
  const appHref = adapter.applicationHref();
  if (appHref && !adapter.findForm()) {
    showPanel({
      title: pkg.job.title ? `Ready for ${pkg.job.title}` : "Jugaadu is ready",
      bodyHtmlSafeLines: ["Your tailored application package is ready to fill."],
      actions: [{ label: "Go to application", onClick: () => location.assign(appHref) }],
    });
    return;
  }

  whenFormReady(() => {
    showPanel({
      title: pkg?.job.company ? `Ready for ${pkg.job.company}` : "Jugaadu is ready",
      bodyHtmlSafeLines: [
        "Fill this form with the resume and answers your crew tailored for this job.",
      ],
      actions: [{ label: "Fill with Jugaadu", onClick: () => void doFill() }],
    });
  });
}

// SPA forms (Ashby, new Greenhouse) mount after document_idle.
function whenFormReady(cb: () => void, timeoutMs = 30_000): void {
  if (adapter?.findForm()) return cb();
  const started = Date.now();
  const obs = new MutationObserver(() => {
    if (adapter?.findForm()) {
      obs.disconnect();
      cb();
    } else if (Date.now() - started > timeoutMs) {
      obs.disconnect();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

async function doFill(): Promise<void> {
  if (!pkg || !adapter) return;
  const form = adapter.findForm();
  if (!form) {
    showPanel({
      title: "No application form here",
      bodyHtmlSafeLines: ["Open the job's application page, then fill again."],
    });
    return;
  }

  const report: FillReport = { filled: 0, answersFilled: 0, resumeAttached: false, needsYou: [] };
  fillTextControls(form, pkg.profile, pkg.answers, report);
  fillSelects(form, pkg.profile, report);
  fillYesNoToggles(form, pkg.profile, report);

  if (pkg.resume) {
    const input = adapter.findResumeInput(form);
    if (input) {
      try {
        const r = await sendBg<{ ok: boolean; b64: string; filename: string }>({
          type: "getResumePdf",
          generationId: pkg.resume.generation_id,
        });
        if (r.ok) report.resumeAttached = attachFile(input, base64ToFile(r.b64, r.filename));
      } catch {
        // leave resumeAttached false; the summary tells the user
      }
    }
  }

  armSubmitWatch(form);

  const lines = [
    `Filled ${report.filled} field${report.filled === 1 ? "" : "s"}` +
      (report.answersFilled ? `, pasted ${report.answersFilled} answer${report.answersFilled === 1 ? "" : "s"}` : "") +
      (report.resumeAttached ? ", attached your tailored resume" : "") +
      ".",
    report.resumeAttached || !pkg.resume ? "" : "Couldn't attach the resume — upload it manually.",
    "Review everything, then click Submit yourself.",
  ].filter(Boolean);

  showPanel({
    title: "Filled by Jugaadu",
    bodyHtmlSafeLines: lines,
    listItems: report.needsYou.length ? ["Still needs you:", ...report.needsYou] : undefined,
  });
}

// Arm on submit intent, confirm on the ATS success signal — a click alone is
// not a submission (validation can fail).
function armSubmitWatch(form: HTMLElement): void {
  if (armedThisPage || !pkg?.application_id) return;
  armedThisPage = true;
  const applicationId = pkg.application_id;

  const arm = () => {
    void sendBg({ type: "armSubmit", applicationId });
    startConfirmationObserver();
  };

  form.addEventListener("submit", arm, { capture: true });
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      const btn = target?.closest?.('button, input[type="submit"]');
      if (!btn || !form.contains(btn)) return;
      const isSubmit =
        btn.getAttribute("type") === "submit" ||
        /submit/i.test((btn.textContent ?? (btn as HTMLInputElement).value ?? "").trim());
      if (isSubmit) arm();
    },
    { capture: true }
  );
}

function startConfirmationObserver(): void {
  if (!adapter || confirmed) return;
  const obs = new MutationObserver(() => {
    if (adapter?.confirmationVisible()) {
      obs.disconnect();
      void confirmIfArmed();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 15 * 60 * 1000);
}

async function confirmIfArmed(): Promise<void> {
  if (confirmed) return;
  try {
    const { armed } = await sendBg<{ ok: true; armed: { applicationId: string } | null }>({
      type: "getArmed",
    });
    if (!armed) return;
    const r = await sendBg<{ ok: boolean }>({
      type: "markSubmitted",
      applicationId: armed.applicationId,
    });
    if (r.ok) {
      confirmed = true;
      showPanel({
        title: "Submitted ✓",
        bodyHtmlSafeLines: ["Recorded in Jugaadu — the crew will pick up the follow-up from here."],
      });
    }
  } catch {
    // The popup's manual "Mark as submitted" remains the escape hatch.
  }
}

// Popup's "Fill this page".
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "jugaadu/fill") {
    removePanel();
    if (pkg) void doFill();
    else void init();
    sendResponse({ ok: true });
  }
  return undefined;
});

void init();
