// Background service worker: holds the bearer token and makes every API call.
// Content scripts can't fetch the Jugaadu API themselves (their fetches run
// under the ATS page's origin and get CORS-blocked) — SW fetches to hosts in
// host_permissions are exempt.
import type { BgRequest, PackageResponse } from "./shared/messages";

const API = __API_BASE__;

interface ArmedState {
  applicationId: string;
  armedAt: number;
}

async function getToken(): Promise<string | null> {
  const { token } = (await chrome.storage.local.get("token")) as { token?: string };
  return typeof token === "string" && token ? token : null;
}

async function api(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await getToken();
  if (!token) return null;
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` },
  });
}

// ── Connect handshake from /app/settings/extension ──────────────────────────
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "jugaadu/connect" && typeof msg.token === "string") {
    chrome.storage.local.set({ token: msg.token }).then(() => sendResponse({ ok: true }));
    return true; // async sendResponse
  }
  sendResponse({ ok: false });
  return undefined;
});

// ── Requests from the content script and popup ───────────────────────────────
chrome.runtime.onMessage.addListener((msg: BgRequest, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true; // all handlers respond asynchronously
});

async function handle(msg: BgRequest): Promise<unknown> {
  switch (msg.type) {
    case "getStatus": {
      return { ok: true, connected: Boolean(await getToken()) };
    }

    case "setToken": {
      const token = msg.token.trim();
      if (!token.startsWith("jga_")) return { ok: false, error: "That doesn't look like a Jugaadu code." };
      await chrome.storage.local.set({ token });
      // Validate immediately so the popup can show a real verdict.
      const res = await api(`/api/ext/package?url=${encodeURIComponent("https://example.com/probe")}`);
      if (res && res.status === 401) {
        await chrome.storage.local.remove("token");
        return { ok: false, error: "Code rejected — mint a fresh one in Jugaadu settings." };
      }
      return { ok: true };
    }

    case "disconnect": {
      await chrome.storage.local.remove(["token", "armed"]);
      return { ok: true };
    }

    case "getPackage": {
      const res = await api(`/api/ext/package?url=${encodeURIComponent(msg.url)}`);
      if (!res) return { status: "disconnected" } satisfies PackageResponse;
      if (res.status === 401) {
        await chrome.storage.local.remove("token");
        return { status: "disconnected" } satisfies PackageResponse;
      }
      if (!res.ok) return { status: "error", message: `package: ${res.status}` } satisfies PackageResponse;
      return (await res.json()) as PackageResponse;
    }

    case "getResumePdf": {
      const res = await api(`/api/ext/resume-pdf?generation_id=${encodeURIComponent(msg.generationId)}`);
      if (!res?.ok) return { ok: false, error: `resume pdf: ${res?.status ?? "no token"}` };
      const buf = await res.arrayBuffer();
      const disp = res.headers.get("content-disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disp)?.[1] ?? "resume.pdf";
      let bin = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return { ok: true, b64: btoa(bin), filename };
    }

    case "markSubmitted": {
      const res = await api("/api/ext/submitted", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ application_id: msg.applicationId }),
      });
      if (res?.ok) await chrome.storage.local.remove("armed");
      return { ok: Boolean(res?.ok) };
    }

    // Armed state lives here (not page memory) so Lever's full-navigation
    // /thanks page can still see what the /apply page armed.
    case "armSubmit": {
      await chrome.storage.local.set({
        armed: { applicationId: msg.applicationId, armedAt: Date.now() },
      });
      return { ok: true };
    }

    case "getArmed": {
      const { armed } = (await chrome.storage.local.get("armed")) as { armed?: ArmedState };
      // Stale arms (>15 min) are abandoned applications, not submissions.
      if (armed && Date.now() - armed.armedAt > 15 * 60 * 1000) {
        await chrome.storage.local.remove("armed");
        return { ok: true, armed: null };
      }
      return { ok: true, armed: armed ?? null };
    }

    case "clearArmed": {
      await chrome.storage.local.remove("armed");
      return { ok: true };
    }
  }
}
