import { describe, it, expect } from "vitest";
import {
  credit,
  initialState,
  registerSubmission,
  settle,
  socialSite,
  formatTime,
} from "../src/core/state";
import {
  judgeResult,
  submissionId,
  submitSlug,
  checkPath,
} from "../src/core/leetcode";
import accepted from "./fixtures/accepted.json";
import submit from "./fixtures/submit.json";
function observed(state = initialState(), id = "1000000001", at = 1000) {
  state.attempts.push({
    requestId: id,
    tabId: 1,
    documentId: "doc",
    slug: "two-sum",
    at,
  });
  registerSubmission(state, id, "two-sum", 1, "doc", at);
  return state;
}
describe("reward ledger", () => {
  it("starts locked and awards exactly 20 minutes for a tracked new acceptance", () => {
    const s = observed();
    expect(s.balanceMs).toBe(0);
    expect(credit(s, "1000000001", 2000)).toBe(true);
    expect(s.balanceMs).toBe(1200000);
  });
  it("deduplicates refreshes, duplicate callbacks and retries", () => {
    const s = observed();
    credit(s, "1000000001", 2000);
    observed(s);
    expect(credit(s, "1000000001", 3000)).toBe(false);
    expect(s.balanceMs).toBe(1200000);
  });
  it("allows new Accepted submissions for the same problem indefinitely", () => {
    const s = observed();
    credit(s, "1000000001", 2000);
    observed(s, "1000000002");
    credit(s, "1000000002", 4000);
    expect(s.balanceMs).toBe(2400000);
    expect(s.history).toHaveLength(2);
  });
  it("refuses historical IDs and submissions without a matching fresh POST", () => {
    const s = initialState();
    expect(registerSubmission(s, "9", "two-sum", 1, "doc", 1000)).toBe(false);
    expect(credit(s, "9", 1000)).toBe(false);
  });
  it("correlates tab, document, problem and freshness", () => {
    const s = initialState();
    s.attempts.push({
      requestId: "1",
      tabId: 1,
      documentId: "doc",
      slug: "two-sum",
      at: 0,
    });
    expect(registerSubmission(s, "9", "two-sum", 2, "doc", 1000)).toBe(false);
    expect(registerSubmission(s, "9", "two-sum", 1, "other", 1000)).toBe(false);
    expect(registerSubmission(s, "9", "other", 1, "doc", 1000)).toBe(false);
    expect(registerSubmission(s, "9", "two-sum", 1, "doc", 61000)).toBe(false);
  });
  it("preserves ledger through serialization and keeps only recent display history", () => {
    let s = observed();
    credit(s, "1000000001", 2000);
    s = JSON.parse(JSON.stringify(s));
    expect(credit(s, "1000000001", 3000)).toBe(false);
    expect(s.balanceMs).toBe(1200000);
    for (let i = 2; i < 40; i++) {
      observed(s, String(i));
      credit(s, String(i), 4000);
    }
    expect(s.history).toHaveLength(30);
    expect(Object.keys(s.processed)).toHaveLength(39);
  });
});
describe("time accounting", () => {
  it("charges elapsed time and clamps at zero", () => {
    const s = initialState();
    s.balanceMs = 1500;
    settle(s, { tabId: 1, at: 1000 }, 2000);
    expect(s.balanceMs).toBe(500);
    settle(s, { tabId: 1, at: 2000 }, 3000);
    expect(s.balanceMs).toBe(0);
  });
  it("does not charge paused time or long sleep gaps or backwards clocks", () => {
    const s = initialState();
    s.balanceMs = 10000;
    settle(s, null, 5000);
    settle(s, { tabId: 1, at: 1000 }, 100000);
    settle(s, { tabId: 1, at: 5000 }, 1000);
    expect(s.balanceMs).toBe(10000);
  });
  it("formats unlimited balances without day wrapping", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(1)).toBe("0:01");
    expect(formatTime(1200000)).toBe("20:00");
    expect(formatTime(36000000)).toBe("600:00");
  });
});
describe("LeetCode adapter", () => {
  it("parses live sanitized Accepted and submit fixtures", () => {
    expect(submissionId(submit.submission_id)).toBe("1000000001");
    expect(judgeResult(accepted, "1000000001")).toBe("accepted");
  });
  it("requires the exact submitted ID and complete acceptance", () => {
    expect(() => judgeResult(accepted, "9")).toThrow();
    expect(() =>
      judgeResult({ ...accepted, finished: false }, "1000000001"),
    ).toThrow();
    expect(() =>
      judgeResult({ status_msg: "Accepted" }, "1000000001"),
    ).toThrow();
  });
  it("handles pending and rejected results without credit", () => {
    expect(judgeResult({ state: "PENDING" }, "1")).toBe("pending");
    expect(judgeResult({ state: "STARTED" }, "1")).toBe("pending");
    expect(
      judgeResult(
        { ...accepted, status_code: 11, status_msg: "Wrong Answer" },
        "1000000001",
      ),
    ).toBe("rejected");
  });
  it("matches only real submit URLs and never Run Code or old results", () => {
    expect(submitSlug("/problems/two-sum/submit/", "POST")).toBe("two-sum");
    for (const url of [
      "/problems/two-sum/interpret_solution/",
      "/submissions/detail/1/",
      "https://evil.com/problems/two-sum/submit/",
    ])
      expect(submitSlug(url, "POST")).toBeNull();
    expect(submitSlug("/problems/two-sum/submit/", "GET")).toBeNull();
  });
  it("rejects malformed IDs, endpoints and unexpected server payloads", () => {
    for (const id of ["../1", "0", "<script>", Number.MAX_SAFE_INTEGER + 1])
      expect(submissionId(id)).toBeNull();
    expect(() => checkPath("../1")).toThrow();
    expect(() => judgeResult("<html>Sign in</html>", "1")).toThrow();
  });
});
describe("social domains", () => {
  it("covers both sites and subdomains without matching lookalikes", () => {
    for (const u of [
      "https://instagram.com/",
      "http://www.instagram.com/a",
      "https://m.instagram.com/",
    ])
      expect(socialSite(u)).toBe("instagram");
    expect(socialSite("https://www.tiktok.com/@test")).toBe("tiktok");
    for (const u of [
      "https://notinstagram.com",
      "https://instagram.com.evil.com",
      "https://example.com/?instagram.com",
      "file://instagram.com",
      "bad",
    ])
      expect(socialSite(u)).toBeNull();
  });
});
