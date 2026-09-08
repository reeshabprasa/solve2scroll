import "./style.css";
import { formatTime, type Reward } from "../core/state";
const page = document.body.dataset.page;
const app = document.querySelector<HTMLElement>("#app")!;
const site =
  new URLSearchParams(location.search).get("site") === "tiktok"
    ? "tiktok"
    : "instagram";
const siteName = site === "tiktok" ? "TikTok" : "Instagram";
const brand =
  '<header><span class="mark" aria-hidden="true">&lt;/&gt;</span><span>Solve2Scroll</span><span class="edition">01 / FOCUS</span></header>';
const solve =
  '<a class="button primary" href="https://leetcode.com/problemset/" target="_blank" rel="noreferrer">Open LeetCode <span aria-hidden="true">↗</span></a>';
const balance =
  '<div class="pool"><span class="eyebrow">YOUR SCREENTIME POOL</span><div class="balance" id="balance">0:00</div><span class="muted" id="pool-caption">Saved minutes. Yours to spend.</span></div>';
const status =
  '<p class="status" id="status" role="status">Connecting to your pool…</p><button class="text-button" id="retry" hidden>Retry verification</button>';
if (page === "popup") {
  app.innerHTML = `${brand}<section>${balance}<div class="sites"><span>◎ Instagram</span><span>♪ TikTok</span><span class="pill" id="access">Locked</span></div>${solve}${status}<div class="section-title"><h2>Recent solves</h2><span>+20 MIN EACH</span></div><ul id="history"><li class="empty">Your first solve starts here.</li></ul></section><footer>One solve. A little scroll. A better balance.</footer>`;
} else if (page === "blocked") {
  app.innerHTML = `${brand}<section class="hero"><div class="eyebrow">A MOMENT FOR YOURSELF</div><h1 id="headline">A little problem.<br>A little progress.</h1><p class="intro" id="intro">${siteName} can wait. Solve a LeetCode problem to earn your next 20 minutes of scrolling.</p><div class="formula"><span>&lt;/&gt;<small>ONE ACCEPTED SOLVE</small></span><b>→</b><span>20<small>MINUTES TO SCROLL</small></span></div>${balance}<div class="actions">${solve}<button class="button secondary" id="continue" disabled>Continue to ${siteName} →</button></div>${status}<p class="fine">Old favorites count, too. Submit a fresh Accepted solution.<br>Your minutes add up and never expire.</p></section><footer>LESS AUTOPILOT. MORE INTENTION.</footer>`;
} else {
  app.innerHTML = `${brand}<section class="hero"><span class="eyebrow">WELCOME TO A BETTER BALANCE</span><h1>Earn your scroll.</h1><p class="intro">Turn one good habit into time for another thing you enjoy.</p><div class="steps"><article><span>01</span><h2>Solve something.</h2><p>Submit any problem on LeetCode. A fresh Accepted submission earns 20 minutes — even if you’ve solved it before.</p></article><article><span>02</span><h2>Build your pool.</h2><p>Minutes collect with no cap or expiration. Your pool starts at zero and stays saved in this browser profile.</p></article><article><span>03</span><h2>Scroll intentionally.</h2><p>Instagram and TikTok share your time. The countdown pauses when you switch away. At zero, it’s time for another solve.</p></article></div>${solve}<details><summary>A few things to know</summary><p>Pin Solve2Scroll from your browser’s extensions menu. Refresh any LeetCode tabs that were open before installation so submission detection can connect.</p><p>Website access lets us detect new LeetCode submissions and block Instagram and TikTok. Storage saves your balance. Idle detection pauses for a locked computer. Alarms restore interrupted verification.</p><p>No passwords, source code, analytics, or browsing history are collected. Only submission IDs, problem names, reward times, and your balance stay on this device. Requests go directly to LeetCode using your existing login.</p><p>This covers desktop Chrome websites, not mobile apps or incognito. Disabling or uninstalling the extension bypasses blocking. Uninstalling removes saved time. Keep the extracted extension folder in one place when updating.</p></details></section><footer>YOUR TIME, WITH INTENTION.</footer>`;
}
interface View {
  ok: boolean;
  balanceMs: number;
  history: Reward[];
  status: string;
  spending: boolean;
  pendingCount: number;
  hasRetry: boolean;
  error?: string;
}
async function refresh() {
  if (page === "welcome") return;
  try {
    const data = (await chrome.runtime.sendMessage({
      type: "snapshot",
    })) as View;
    if (!data.ok) throw new Error(data.error);
    document.querySelector("#balance")!.textContent = formatTime(
      data.balanceMs,
    );
    document.querySelector("#status")!.textContent = data.status;
    (document.querySelector("#retry") as HTMLButtonElement).hidden =
      !data.hasRetry;
    document.querySelector("#pool-caption")!.textContent = data.spending
      ? "Counting while you scroll."
      : "Saved minutes. Yours to spend.";
    const access = document.querySelector("#access");
    if (access) {
      access.textContent = data.balanceMs > 0 ? "Unlocked" : "Locked";
      access.classList.toggle("open", data.balanceMs > 0);
    }
    const cont = document.querySelector<HTMLButtonElement>("#continue");
    if (cont) cont.disabled = data.balanceMs <= 0;
    if (page === "blocked") {
      document.querySelector("#headline")!.innerHTML =
        data.balanceMs > 0
          ? "Time well earned."
          : "A little problem.<br>A little progress.";
      document.querySelector("#intro")!.textContent =
        data.balanceMs > 0
          ? `Your pool is ready. Continue to ${siteName} when you want to start using it.`
          : `${siteName} can wait. Solve a LeetCode problem to earn your next 20 minutes of scrolling.`;
    }
    const history = document.querySelector("#history");
    if (history) {
      history.replaceChildren();
      if (!data.history.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "Your first solve starts here.";
        history.append(li);
      }
      for (const item of data.history.slice(0, 5)) {
        const li = document.createElement("li"),
          link = document.createElement("a"),
          reward = document.createElement("span");
        link.href = `https://leetcode.com/submissions/detail/${item.id}/`;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = item.slug.replaceAll("-", " ");
        link.title = new Date(item.at).toLocaleString();
        reward.textContent = "+20 min";
        li.append(link, reward);
        history.append(li);
      }
    }
  } catch {
    document.querySelector("#status")!.textContent =
      "Could not connect. Reload the extension from the extensions page.";
  }
}
document.querySelector("#retry")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "retry" });
  await refresh();
});
document.querySelector("#continue")?.addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "continue", site });
  if (!result.ok) document.querySelector("#status")!.textContent = result.error;
});
void refresh();
if (page !== "welcome") setInterval(() => void refresh(), 1000);
