import {
  credit,
  initialState,
  registerSubmission,
  settle,
  socialSite,
  type State,
  type Usage,
} from "./core/state";
import {
  fetchVerdict,
  submissionId,
  submitSlug,
  type Verdict,
} from "./core/leetcode";

let state: State;
let usage: Usage | null = null;
let blocking: boolean | undefined;
const verifying = new Set<string>();
const boot = (async () => {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const saved = (await chrome.storage.local.get("state")) as { state?: State };
  state = saved.state ?? initialState();
  if (state.version !== 1) throw new Error("Unsupported storage version.");
  usage =
    ((await chrome.storage.session.get("usage")) as { usage?: Usage }).usage ??
    null;
  if (usage && Date.now() - usage.at > 5000) usage = null;
  await chrome.storage.local.set({ state });
  await chrome.alarms.create("recovery", { periodInMinutes: 0.5 });
  await enforce();
})();
let tail: Promise<unknown> = boot;
function serial<T>(task: () => Promise<T> | T): Promise<T> {
  const next = tail.then(task);
  tail = next.catch((error) => console.error("Solve2Scroll:", error));
  return next;
}
async function save() {
  await chrome.storage.local.set({ state });
  await chrome.storage.session.set({ usage });
}
function checkpoint(now = Date.now()) {
  settle(state, usage, now);
  if (usage) usage.at = now;
}
async function enforce() {
  const blocked = state.balanceMs <= 0;
  if (blocking !== blocked) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: blocked ? ["initial_block"] : [],
      disableRulesetIds: blocked ? [] : ["initial_block"],
    });
    blocking = blocked;
  }
  await chrome.action.setBadgeText({
    text: blocked ? "LOCK" : String(Math.ceil(state.balanceMs / 60000)),
  });
  await chrome.action.setBadgeBackgroundColor({
    color: blocked ? "#34473e" : "#27654b",
  });
  if (blocked) {
    usage = null;
    const tabs = await chrome.tabs.query({
      url: ["*://*.instagram.com/*", "*://*.tiktok.com/*"],
    });
    await Promise.allSettled(
      tabs
        .filter((t) => t.id !== undefined)
        .map((t) =>
          chrome.tabs.update(t.id!, {
            url: chrome.runtime.getURL(
              `blocked.html?site=${socialSite(t.url)}`,
            ),
          }),
        ),
    );
  }
}
function snapshot() {
  return {
    balanceMs: state.balanceMs,
    history: state.history,
    status: state.status,
    pendingCount: Object.keys(state.pending).length,
    hasRetry: Object.values(state.pending).some((p) => !!p.error),
    spending: !!usage,
  };
}
async function pause() {
  checkpoint();
  usage = null;
  await save();
  await enforce();
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const slug = submitSlug(details.url, details.method);
    if (!slug || details.tabId < 0 || details.frameId !== 0) return;
    void serial(async () => {
      const now = Date.now();
      state.attempts = state.attempts.filter((a) => now - a.at < 60000);
      state.attempts.push({
        requestId: details.requestId,
        tabId: details.tabId,
        documentId: details.documentId,
        slug,
        at: now,
      });
      await save();
    });
    return undefined;
  },
  { urls: ["https://leetcode.com/problems/*/submit/"] },
);

async function checkPending(id: string) {
  if (verifying.has(id)) return;
  verifying.add(id);
  try {
    const pending = await serial(async () => {
      const p = state.pending[id];
      if (!p || p.nextAt > Date.now() || p.attempts >= 12) return null;
      p.attempts++;
      p.nextAt = Date.now() + Math.min(300000, 2000 * 2 ** (p.attempts - 1));
      await save();
      return { ...p };
    });
    if (!pending) return;
    let verdict: Verdict;
    try {
      // The isolated content script makes a same-origin request using the existing login.
      const tabs = await chrome.tabs.query({ url: "https://leetcode.com/*" });
      const tab = tabs.find((t) => t.id === pending.tabId) ?? tabs[0];
      if (tab?.id !== undefined) {
        const response = await chrome.tabs.sendMessage(
          tab.id,
          { type: "verify", id },
          { frameId: 0 },
        );
        if (!response?.ok)
          throw new Error(
            response?.error ?? "Refresh your LeetCode tab to reconnect.",
          );
        if (!["accepted", "rejected", "pending"].includes(response.verdict))
          throw new Error("Invalid judge result.");
        verdict = response.verdict;
      } else verdict = await fetchVerdict(id);
      await serial(async () => {
        const p = state.pending[id];
        if (!p) return;
        checkpoint();
        if (verdict === "accepted") credit(state, id, Date.now());
        else if (verdict === "rejected") {
          delete state.pending[id];
          state.status =
            "Submission was not Accepted. Keep going — your next solve earns 20 minutes.";
        } else if (p.attempts >= 12) {
          p.error =
            "Judge still pending. Retry verification when LeetCode has finished.";
          state.status = p.error;
        } else {
          delete p.error;
          state.status = "Waiting for LeetCode’s judge…";
        }
        await save();
        await enforce();
      });
    } catch (error) {
      await serial(async () => {
        const p = state.pending[id];
        if (!p) return;
        p.error =
          error instanceof Error
            ? error.message
            : "Could not verify with LeetCode.";
        state.status = `Verification paused. ${p.error}`;
        await save();
      });
    }
  } finally {
    verifying.delete(id);
    scheduleChecks();
  }
}
let checkTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleChecks() {
  clearTimeout(checkTimer);
  if (!state) return;
  const next = Math.min(
    ...Object.values(state.pending)
      .filter((p) => p.attempts < 12 && !verifying.has(p.id))
      .map((p) => p.nextAt),
  );
  if (Number.isFinite(next))
    checkTimer = setTimeout(
      () => void pump(),
      Math.max(100, next - Date.now()),
    );
}
async function pump() {
  await boot;
  const ids = await serial(() =>
    Object.values(state.pending)
      .filter((p) => p.nextAt <= Date.now() && p.attempts < 12)
      .map((p) => p.id),
  );
  await Promise.allSettled(ids.map(checkPending));
  scheduleChecks();
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const ownPage =
    sender.id === chrome.runtime.id &&
    sender.url?.startsWith(chrome.runtime.getURL(""));
  const leetcode =
    sender.id === chrome.runtime.id &&
    sender.frameId === 0 &&
    sender.url?.startsWith("https://leetcode.com/");
  const social = sender.id === chrome.runtime.id && socialSite(sender.url);
  if (!message || typeof message.type !== "string") return;
  if (message.type === "verify") return;
  const allowed =
    (ownPage && ["snapshot", "retry", "continue"].includes(message.type)) ||
    (leetcode && ["submission", "leetcode-ready"].includes(message.type)) ||
    (social && message.type === "heartbeat");
  if (!allowed) {
    reply({ ok: false, error: "Unsupported message." });
    return;
  }
  void serial(async () => {
    if (message.type === "submission") {
      const id = submissionId(message.id);
      if (
        !id ||
        typeof message.slug !== "string" ||
        !/^[a-z0-9-]+$/.test(message.slug)
      )
        throw new Error("Invalid submission.");
      registerSubmission(
        state,
        id,
        message.slug,
        sender.tab!.id!,
        sender.documentId,
        Date.now(),
      );
    } else if (message.type === "heartbeat") {
      checkpoint();
      const tab = await chrome.tabs.get(sender.tab!.id!);
      const window = await chrome.windows.get(tab.windowId);
      const locked = (await chrome.idle.queryState(60)) === "locked";
      const eligible =
        sender.frameId === 0 &&
        !!message.visible &&
        tab.active &&
        window.focused &&
        window.state !== "minimized" &&
        !locked &&
        !!socialSite(tab.url);
      // Messages from background tabs must not steal the active tab's checkpoint.
      if (eligible && state.balanceMs > 0)
        usage = {
          tabId: tab.id!,
          documentId: sender.documentId,
          at: Date.now(),
        };
      else if (sender.frameId === 0 && usage?.tabId === tab.id) usage = null;
    } else if (message.type === "retry") {
      for (const p of Object.values(state.pending)) {
        p.attempts = 0;
        p.nextAt = Date.now();
        delete p.error;
      }
      state.status = "Retrying pending submissions…";
    } else if (message.type === "continue") {
      if (!["instagram", "tiktok"].includes(message.site))
        throw new Error("Invalid destination.");
      checkpoint();
      if (state.balanceMs <= 0)
        throw new Error("Solve a LeetCode to earn time first.");
      await enforce();
      const url = `https://www.${message.site}.com/`;
      if (sender.tab?.id !== undefined)
        await chrome.tabs.update(sender.tab.id, { url });
      else await chrome.tabs.create({ url });
    }
    await save();
    await enforce();
    return { ok: true, ...snapshot() };
  })
    .then((result) => {
      reply(result);
      scheduleChecks();
    })
    .catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onActivated.addListener(() => void serial(pause));
chrome.windows.onFocusChanged.addListener(() => void serial(pause));
chrome.tabs.onRemoved.addListener((id) => {
  void serial(async () => {
    if (usage?.tabId === id) await pause();
  });
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.url || change.status === "loading")
    void serial(async () => {
      if (usage?.tabId === id) await pause();
      await enforce();
    });
});
chrome.idle.onStateChanged.addListener((value) => {
  if (value === "locked") void serial(pause);
});
chrome.runtime.onStartup.addListener(
  () =>
    void serial(async () => {
      usage = null;
      await save();
      await enforce();
    }),
);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "recovery") {
    void serial(async () => {
      if (usage && Date.now() - usage.at > 5000) usage = null;
      await enforce();
    });
    void pump();
  }
});
chrome.runtime.onInstalled.addListener((details) => {
  void serial(async () => {
    await enforce();
    if (details.reason === "install")
      await chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  });
});
void boot.then(() => pump()).catch(console.error);
