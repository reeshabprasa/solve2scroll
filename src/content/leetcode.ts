import { fetchVerdict, submissionId } from "../core/leetcode";
window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.source !== "solve2scroll" ||
    event.data.type !== "submitted"
  )
    return;
  const id = submissionId(event.data.id),
    slug = event.data.slug;
  if (!id || typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) return;
  void chrome.runtime
    .sendMessage({ type: "submission", id, slug })
    .catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    message?.type !== "verify" ||
    !submissionId(message.id)
  )
    return;
  void fetchVerdict(message.id)
    .then((verdict) => reply({ ok: true, verdict }))
    .catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
void chrome.runtime.sendMessage({ type: "leetcode-ready" }).catch(() => {});
