export const REWARD_MS = 20 * 60 * 1000;
export const MAX_HEARTBEAT_GAP_MS = 5000;
export interface Reward {
  id: string;
  slug: string;
  at: number;
}
export interface Pending {
  id: string;
  slug: string;
  tabId: number;
  createdAt: number;
  attempts: number;
  nextAt: number;
  error?: string;
}
export interface Attempt {
  requestId: string;
  tabId: number;
  documentId?: string;
  slug: string;
  at: number;
}
export interface State {
  version: 1;
  balanceMs: number;
  processed: Record<string, true>;
  pending: Record<string, Pending>;
  attempts: Attempt[];
  history: Reward[];
  status: string;
}
export interface Usage {
  tabId: number;
  documentId?: string;
  at: number;
}
export const initialState = (): State => ({
  version: 1,
  balanceMs: 0,
  processed: {},
  pending: {},
  attempts: [],
  history: [],
  status: "Ready for your next Accepted submission.",
});
export function socialSite(raw?: string): "instagram" | "tiktok" | null {
  try {
    const u = new URL(raw!);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    for (const name of ["instagram", "tiktok"] as const)
      if (u.hostname === `${name}.com` || u.hostname.endsWith(`.${name}.com`))
        return name;
  } catch {
    /* Not a URL. */
  }
  return null;
}
export function settle(state: State, usage: Usage | null, now: number): void {
  if (!usage) return;
  const elapsed = now - usage.at;
  // A suspended browser must not turn sleep into screen time.
  if (elapsed >= 0 && elapsed <= MAX_HEARTBEAT_GAP_MS)
    state.balanceMs = Math.max(0, state.balanceMs - elapsed);
}
export function credit(state: State, id: string, now: number): boolean {
  const pending = state.pending[id];
  if (!pending || state.processed[id]) return false;
  state.processed[id] = true;
  state.balanceMs += REWARD_MS;
  state.history = [{ id, slug: pending.slug, at: now }, ...state.history].slice(
    0,
    30,
  );
  delete state.pending[id];
  state.status = "Accepted! 20 minutes added to your pool.";
  return true;
}
export function registerSubmission(
  state: State,
  id: string,
  slug: string,
  tabId: number,
  documentId: string | undefined,
  now: number,
): boolean {
  if (state.processed[id] || state.pending[id]) return false;
  state.attempts = state.attempts.filter((a) => now - a.at <= 60000);
  const index = state.attempts.findIndex(
    (a) =>
      a.tabId === tabId &&
      a.slug === slug &&
      (!a.documentId || a.documentId === documentId),
  );
  if (index < 0) return false;
  state.attempts.splice(index, 1);
  state.pending[id] = {
    id,
    slug,
    tabId,
    createdAt: now,
    attempts: 0,
    nextAt: now,
  };
  state.status = "Submission detected. Waiting for LeetCode’s judge…";
  return true;
}
export function formatTime(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000),
    minutes = Math.floor(seconds / 60);
  return `${minutes.toLocaleString()}:${String(seconds % 60).padStart(2, "0")}`;
}
