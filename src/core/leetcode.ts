export function submissionId(value: unknown): string | null {
  const id =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value;
  return typeof id === "string" && /^[1-9]\d{0,19}$/.test(id) ? id : null;
}
export function submitSlug(raw: string, method: string): string | null {
  try {
    const u = new URL(raw, "https://leetcode.com");
    return u.origin === "https://leetcode.com" &&
      method.toUpperCase() === "POST"
      ? (/^\/problems\/([a-z0-9-]+)\/submit\/$/.exec(u.pathname)?.[1] ?? null)
      : null;
  } catch {
    return null;
  }
}
export type Verdict = "accepted" | "rejected" | "pending";
export function judgeResult(value: unknown, id: string): Verdict {
  if (!value || typeof value !== "object")
    throw new Error("Unexpected LeetCode response.");
  const r = value as Record<string, unknown>;
  if (r.state === "PENDING" || r.state === "STARTED") return "pending";
  if (
    r.state !== "SUCCESS" ||
    submissionId(r.submission_id) !== id ||
    typeof r.status_code !== "number"
  )
    throw new Error("LeetCode result could not be verified.");
  if (
    r.status_code === 10 &&
    r.status_msg === "Accepted" &&
    r.run_success === true &&
    r.finished === true
  )
    return "accepted";
  if (r.status_code === 10) throw new Error("Incomplete Accepted result.");
  return "rejected";
}
export function checkPath(id: string): string {
  if (!submissionId(id)) throw new Error("Invalid submission ID.");
  return `/submissions/detail/${id}/v2/check/`;
}
export async function fetchVerdict(id: string): Promise<Verdict> {
  const response = await fetch(`https://leetcode.com${checkPath(id)}`, {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `LeetCode returned ${response.status}. Open LeetCode and check that you are signed in.`,
    );
  return judgeResult(await response.json(), id);
}
