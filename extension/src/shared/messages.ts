// Typed contracts for chrome.runtime messaging between the content script /
// popup and the background service worker. Everything crossing this boundary is
// JSON-serialized — binary (the resume PDF) travels base64-encoded.

export interface PackageProfile {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  needs_sponsorship: boolean | null;
}

export interface PackageAnswer {
  question: string;
  body: string;
}

export type PackageResponse =
  | {
      status: "ok";
      application_id: string | null;
      profile: PackageProfile;
      resume: { generation_id: string; filename: string } | null;
      answers: PackageAnswer[];
      job: { title: string | null; company: string | null };
      submitted: boolean;
    }
  | { status: "no_run"; compose_url: string }
  | { status: "no_profile"; settings_url: string }
  | { status: "disconnected" }
  | { status: "error"; message: string };

export type BgRequest =
  | { type: "getStatus" }
  | { type: "setToken"; token: string }
  | { type: "disconnect" }
  | { type: "getPackage"; url: string }
  | { type: "getResumePdf"; generationId: string }
  | { type: "markSubmitted"; applicationId: string }
  | { type: "armSubmit"; applicationId: string }
  | { type: "getArmed" }
  | { type: "clearArmed" };

export type BgResponse =
  | { ok: boolean; connected?: boolean; error?: string }
  | PackageResponse
  | { ok: true; b64: string; filename: string }
  | { ok: true; armed: { applicationId: string; armedAt: number } | null };

export function sendBg<T = BgResponse>(msg: BgRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(resp as T);
    });
  });
}
