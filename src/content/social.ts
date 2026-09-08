import { formatTime, socialSite } from "../core/state";
let inFlight = false,
  expires = 0,
  remaining = 0,
  receivedAt = 0;
let label: HTMLElement | undefined;
function conceal() {
  document.documentElement?.removeAttribute("data-solve2scroll-allowed");
  document
    .querySelectorAll("video,audio")
    .forEach((el) => (el as HTMLMediaElement).pause());
}
function blocked() {
  conceal();
  location.replace(
    chrome.runtime.getURL(`blocked.html?site=${socialSite(location.href)}`),
  );
}
function mount() {
  if (label || !document.documentElement || window.top !== window) return;
  const host = document.createElement("div");
  host.id = "solve2scroll-timer";
  host.style.cssText =
    "all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  label = document.createElement("div");
  label.style.cssText =
    "font:600 13px system-ui;color:#e8f2eb;background:#173d2e;padding:12px 16px;border:1px solid #608770;border-radius:30px;box-shadow:0 4px 24px #0003;font-variant-numeric:tabular-nums;";
  label.setAttribute("role", "timer");
  label.setAttribute("aria-label", "Remaining social browsing time");
  shadow.append(label);
  document.documentElement.append(host);
}
async function heartbeat() {
  if (inFlight) return;
  inFlight = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "heartbeat",
      visible: document.visibilityState === "visible",
    });
    if (!result?.ok) {
      conceal();
      return;
    }
    remaining = result.balanceMs;
    receivedAt = performance.now();
    if (remaining <= 0) {
      blocked();
      return;
    }
    expires = performance.now() + 2500;
    document.documentElement?.setAttribute("data-solve2scroll-allowed", "");
    mount();
    if (label) label.textContent = `Solve2Scroll · ${formatTime(remaining)}`;
  } catch {
    conceal();
  } finally {
    inFlight = false;
  }
}
document.addEventListener(
  "play",
  () => {
    if (performance.now() > expires) conceal();
  },
  true,
);
document.addEventListener("visibilitychange", () => void heartbeat());
window.addEventListener("pageshow", () => {
  conceal();
  void heartbeat();
});
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  if (performance.now() > expires) conceal();
  if (label)
    label.textContent = `Solve2Scroll · ${formatTime(remaining - (performance.now() - receivedAt))}`;
}, 200);
setInterval(() => void heartbeat(), 1000);
void heartbeat();
