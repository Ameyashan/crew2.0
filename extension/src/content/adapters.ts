// Per-ATS knowledge. Everything else (fill, panel, submit arming) is generic.

export interface Adapter {
  name: "greenhouse" | "ashby" | "lever";
  // The URL to use when matching against the user's compose runs.
  jobUrl(): string;
  // A confirmation page reached by full navigation (Lever /thanks); SPA
  // confirmations are covered by confirmationVisible().
  isConfirmationPage(): boolean;
  confirmationVisible(): boolean;
  findForm(): HTMLElement | null;
  findResumeInput(form: HTMLElement): HTMLInputElement | null;
  // For postings whose form lives on a sibling page (Lever /apply).
  applicationHref(): string | null;
}

// The <form> that actually carries the application: the one with the most
// fillable controls (and at least a handful, so cookie banners and search boxes
// never win).
function biggestForm(min = 3): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestCount = 0;
  for (const form of document.querySelectorAll("form")) {
    const count = form.querySelectorAll("input, textarea, select").length;
    if (count > bestCount) {
      best = form;
      bestCount = count;
    }
  }
  return bestCount >= min ? best : null;
}

function resumeFileInput(form: HTMLElement): HTMLInputElement | null {
  const files = [...form.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  if (!files.length) return null;
  const scored = files.find((f) => {
    const ctx = `${f.name} ${f.id} ${f.closest("[id]")?.id ?? ""} ${
      f.closest("label,div,fieldset")?.textContent?.slice(0, 200) ?? ""
    }`;
    return /resume|résumé|\bcv\b/i.test(ctx) && !/cover/i.test(ctx);
  });
  return scored ?? files[0];
}

function bodyTextMatches(re: RegExp): boolean {
  return re.test(document.body?.innerText?.slice(0, 5000) ?? "");
}

const greenhouse: Adapter = {
  name: "greenhouse",
  jobUrl: () => location.href,
  isConfirmationPage: () => false,
  confirmationVisible: () =>
    Boolean(document.querySelector("#application_confirmation")) ||
    bodyTextMatches(/thank you for applying|application (was |has been )?submitted/i),
  findForm: () =>
    (document.querySelector<HTMLElement>("#application_form") ??
      document.querySelector<HTMLElement>("#application-form") ??
      biggestForm()),
  findResumeInput: resumeFileInput,
  applicationHref: () => null,
};

const ashby: Adapter = {
  name: "ashby",
  // The form lives at /{org}/{id}/application; package matching strips that
  // suffix server-side, so the raw href is fine.
  jobUrl: () => location.href,
  isConfirmationPage: () => false,
  confirmationVisible: () =>
    bodyTextMatches(/application (was |has been )?submitted|thank you for applying/i),
  findForm: () => biggestForm(),
  findResumeInput: resumeFileInput,
  applicationHref: () => {
    if (/\/application\/?$/.test(location.pathname)) return null;
    // Posting page: the SPA's Application tab.
    return `${location.origin}${location.pathname.replace(/\/$/, "")}/application`;
  },
};

const lever: Adapter = {
  name: "lever",
  jobUrl: () => location.href,
  isConfirmationPage: () => /\/thanks\/?$/.test(location.pathname),
  confirmationVisible: () => /\/thanks\/?$/.test(location.pathname),
  findForm: () =>
    (document.querySelector<HTMLElement>("#application-form") ??
      document.querySelector<HTMLElement>('form[action*="/apply"]') ??
      biggestForm()),
  findResumeInput: (form) =>
    form.querySelector<HTMLInputElement>('input[name="resume"]') ?? resumeFileInput(form),
  applicationHref: () => {
    if (/\/(apply|thanks)\/?$/.test(location.pathname)) return null;
    return `${location.origin}${location.pathname.replace(/\/$/, "")}/apply`;
  },
};

export function pickAdapter(): Adapter | null {
  const host = location.hostname;
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") return greenhouse;
  if (host === "jobs.ashbyhq.com") return ashby;
  if (host === "jobs.lever.co") return lever;
  return null;
}
