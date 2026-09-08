import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Worker,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import accepted from "../fixtures/accepted.json" with { type: "json" };
import type { State } from "../../src/core/state";
let context: BrowserContext,
  worker: Worker,
  profile: string,
  extensionId: string;
test.beforeEach(async () => {
  profile = await mkdtemp(`${tmpdir()}/solve2scroll-e2e-`);
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${resolve("dist")}`,
      `--load-extension=${resolve("dist")}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;
  await expect
    .poll(() =>
      worker.evaluate(
        async () => !!(await chrome.storage.local.get("state")).state,
      ),
    )
    .toBe(true);
});
test.afterEach(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});
async function balance() {
  return worker.evaluate(
    async () =>
      ((await chrome.storage.local.get("state")).state as State).balanceMs,
  );
}
async function openPopup() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}
// State injection is test-only: the production extension exposes no credit or reset command.
async function seed(ms: number) {
  await worker.evaluate(async (value) => {
    const { state } = (await chrome.storage.local.get("state")) as {
      state: State;
    };
    state.balanceMs = value;
    await chrome.storage.local.set({ state });
  }, ms); /* Reload worker to read the persisted seed. */
  const session = await context.newCDPSession(context.pages()[0]);
  await session.send("ServiceWorker.enable");
  await session.send("ServiceWorker.stopAllWorkers");
  await session.detach();
  const page = await openPopup();
  await expect(page.locator("#status")).not.toContainText("Connecting");
  worker =
    context.serviceWorkers().find((w) => w.url().includes(extensionId)) ??
    (await context.waitForEvent("serviceworker"));
  return page;
}
async function fakeLeetCode() {
  await context.route("https://leetcode.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/submit/"))
      return route.fulfill({ json: { submission_id: 1000000001 } });
    if (url.pathname.endsWith("/v2/check/"))
      return route.fulfill({ json: accepted });
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>LeetCode test fixture</title><button id="submit">Submit</button><button id="run">Run Code</button><script>document.querySelector('#submit').onclick=()=>fetch('/problems/two-sum/submit/',{method:'POST'});document.querySelector('#run').onclick=()=>fetch('/problems/two-sum/interpret_solution/',{method:'POST'});</script>`,
    });
  });
  const page = await context.newPage();
  await page.goto("https://leetcode.com/problems/two-sum/");
  return page;
}
test("first install blocks both domains and renders a usable blocked page", async () => {
  for (const site of ["instagram", "tiktok"]) {
    const page = await context.newPage();
    await page.goto(`https://www.${site}.com/`).catch(() => {});
    await expect(page).toHaveURL(
      new RegExp(`chrome-extension://${extensionId}/blocked.html`),
    );
    await expect(page.locator("#balance")).toHaveText("0:00");
    await expect(page.locator("#continue")).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Open LeetCode" }),
    ).toBeVisible();
  }
});
test("real extension pipeline credits new accepted submission but not run code or old result events", async () => {
  const page = await fakeLeetCode();
  await page.click("#run");
  expect(await balance()).toBe(0);
  await page.evaluate(() =>
    window.postMessage(
      {
        source: "solve2scroll",
        type: "submitted",
        id: "1000000001",
        slug: "two-sum",
      },
      location.origin,
    ),
  );
  expect(await balance()).toBe(0);
  await page.click("#submit");
  await expect.poll(balance).toBe(1200000);
  await page.evaluate(() =>
    window.postMessage(
      {
        source: "solve2scroll",
        type: "submitted",
        id: "1000000001",
        slug: "two-sum",
      },
      location.origin,
    ),
  );
  const popup = await openPopup();
  await expect(popup.locator("#balance")).toHaveText("20:00");
  await expect(popup.locator("#history li")).toHaveCount(1);
});
test("stored pool survives worker restart and blocked page Continue unlocks", async () => {
  await fakeLeetCode().then((p) => p.click("#submit"));
  await expect.poll(balance).toBe(1200000);
  await seed(1200000);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/blocked.html?site=tiktok`);
  await expect(page.locator("#continue")).toBeEnabled();
  await expect(page.locator("#balance")).toHaveText("20:00");
});
test("countdown charges a foreground social page and blocks it at exhaustion", async () => {
  await fakeLeetCode().then((p) => p.click("#submit"));
  await expect.poll(balance).toBe(1200000);
  await seed(3000);
  await context.route("https://www.instagram.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Social fixture</title><h1>Instagram fixture</h1><video></video>",
    }),
  );
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/").catch(() => {});
  await page.bringToFront();
  await expect(page).toHaveURL(new RegExp("blocked.html"), { timeout: 12000 });
  expect(await balance()).toBe(0);
});
test("foreground time pauses on another tab and two social tabs do not double charge", async () => {
  await fakeLeetCode().then((p) => p.click("#submit"));
  await expect.poll(balance).toBe(1200000);
  await context.route("https://www.instagram.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><h1>Instagram fixture</h1>",
    }),
  );
  await context.route("https://www.tiktok.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><h1>TikTok fixture</h1>",
    }),
  );
  const first = await context.newPage();
  await first.goto("https://www.instagram.com/");
  const second = await context.newPage();
  await second.goto("https://www.tiktok.com/");
  await second.bringToFront();
  await expect.poll(balance).toBeLessThan(1199000);
  const before = await balance();
  await second.waitForTimeout(2500);
  const spent = before - (await balance());
  expect(spent).toBeGreaterThan(1500);
  expect(spent).toBeLessThan(4000);
  const other = await openPopup();
  await other.bringToFront();
  await other.waitForTimeout(1200);
  const paused = await balance();
  await other.waitForTimeout(2200);
  expect(await balance()).toBe(paused);
});
test("offline verification stays pending then retries without duplicate rewards", async () => {
  const page = await fakeLeetCode();
  let offline = true;
  await context.route("https://leetcode.com/submissions/detail/**", (route) =>
    offline
      ? route.fulfill({ status: 503, body: "Unavailable" })
      : route.fulfill({ json: accepted }),
  );
  await page.click("#submit");
  const popup = await openPopup();
  await expect(popup.locator("#status")).toContainText("Verification paused");
  expect(await balance()).toBe(0);
  await expect(popup.locator("#retry")).toBeVisible();
  offline = false;
  await popup.click("#retry");
  await expect.poll(balance).toBe(1200000);
  await expect(popup.locator("#history li")).toHaveCount(1);
});
test("wrong answer never unlocks social sites", async () => {
  const page = await fakeLeetCode();
  await context.route("https://leetcode.com/submissions/detail/**", (route) =>
    route.fulfill({
      json: { ...accepted, status_code: 11, status_msg: "Wrong Answer" },
    }),
  );
  await page.click("#submit");
  const popup = await openPopup();
  await expect(popup.locator("#status")).toContainText("not Accepted");
  expect(await balance()).toBe(0);
});
test("repeat solutions with different submission IDs each earn 20 minutes", async () => {
  const page = await fakeLeetCode();
  await page.click("#submit");
  await expect.poll(balance).toBe(1200000);
  await context.route(
    "https://leetcode.com/problems/two-sum/submit/",
    (route) => route.fulfill({ json: { submission_id: 1000000002 } }),
  );
  await context.route(
    "https://leetcode.com/submissions/detail/1000000002/**",
    (route) =>
      route.fulfill({ json: { ...accepted, submission_id: "1000000002" } }),
  );
  await page.click("#submit");
  await expect.poll(balance).toBe(2400000);
  await page.reload();
  const popup = await openPopup();
  await expect(popup.locator("#balance")).toHaveText("40:00");
  await expect(popup.locator("#history li")).toHaveCount(2);
});
test("pages render without runtime or CSP errors", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const name of ["welcome", "blocked", "popup"]) {
    await page.goto(`chrome-extension://${extensionId}/${name}.html`);
    await expect(
      page.getByRole("link", { name: "Open LeetCode" }),
    ).toBeVisible();
    if (name === "popup")
      await page.setViewportSize({ width: 360, height: 640 });
    await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
test("social links from an unrelated website can reach the blocked page", async () => {
  await context.route("https://example.com/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<a href="https://www.instagram.com/">Instagram</a>',
    }),
  );
  const page = await context.newPage();
  await page.goto("https://example.com/");
  await page.getByRole("link", { name: "Instagram" }).click();
  await expect(page.locator("#continue")).toBeDisabled();
  await expect(page.locator("#balance")).toHaveText("0:00");
});

test("balance survives a complete browser restart", async () => {
  await fakeLeetCode().then((p) => p.click("#submit"));
  await expect.poll(balance).toBe(1200000);
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${resolve("dist")}`,
      `--load-extension=${resolve("dist")}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const popup = await openPopup();
  await expect(popup.locator("#balance")).toHaveText("20:00");
  expect(await balance()).toBe(1200000);
});
