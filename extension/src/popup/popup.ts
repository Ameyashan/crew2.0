import { sendBg } from "../shared/messages";

const $ = (id: string) => document.getElementById(id)!;

const APP = __API_BASE__;

function show(connected: boolean) {
  ($("dot") as HTMLElement).classList.toggle("on", connected);
  $("status").textContent = connected ? "Connected" : "Not connected";
  $("connect-section").style.display = connected ? "none" : "block";
  $("connected-section").style.display = connected ? "block" : "none";
}

function fail(msg: string) {
  $("error").textContent = msg;
}

async function refresh() {
  try {
    const s = await sendBg<{ ok: boolean; connected?: boolean }>({ type: "getStatus" });
    show(Boolean(s.connected));
  } catch {
    show(false);
  }
  // Offer manual "mark as submitted" while an application is armed — the escape
  // hatch when an ATS success page slips past detection.
  try {
    const a = await sendBg<{ ok: true; armed: { applicationId: string } | null }>({
      type: "getArmed",
    });
    $("mark").style.display = a.armed ? "inline-block" : "none";
    $("mark").dataset.appId = a.armed?.applicationId ?? "";
  } catch {}
}

$("settings-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: `${APP}/app/settings/extension` });
});

$("save-code").addEventListener("click", async () => {
  fail("");
  const token = ($("code") as HTMLInputElement).value.trim();
  if (!token) return;
  const r = await sendBg<{ ok: boolean; error?: string }>({ type: "setToken", token });
  if (!r.ok) return fail(r.error ?? "Couldn't connect.");
  ($("code") as HTMLInputElement).value = "";
  refresh();
});

$("disconnect").addEventListener("click", async () => {
  await sendBg({ type: "disconnect" });
  refresh();
});

$("fill").addEventListener("click", async () => {
  fail("");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "jugaadu/fill" });
    window.close();
  } catch {
    fail("Open a Greenhouse, Ashby, or Lever application page first.");
  }
});

$("mark").addEventListener("click", async () => {
  const appId = $("mark").dataset.appId;
  if (!appId) return;
  const r = await sendBg<{ ok: boolean }>({ type: "markSubmitted", applicationId: appId });
  if (r.ok) {
    $("mark").style.display = "none";
    $("status").textContent = "Marked submitted ✓";
  } else {
    fail("Couldn't mark it — try again.");
  }
});

refresh();
