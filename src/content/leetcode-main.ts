import { submissionId, submitSlug } from "../core/leetcode";
// Observe only submit responses. Never read submitted code, cookies, or headers.
function report(slug: string, data: unknown) {
  const id = submissionId((data as { submission_id?: unknown })?.submission_id);
  if (id)
    window.postMessage(
      { source: "solve2scroll", type: "submitted", id, slug },
      location.origin,
    );
}
const originalFetch = window.fetch;
window.fetch = async function (input, init) {
  const raw = input instanceof Request ? input.url : String(input);
  const slug = submitSlug(
    raw,
    init?.method ?? (input instanceof Request ? input.method : "GET"),
  );
  const response = await originalFetch.apply(this, [input, init]);
  if (slug && response.ok)
    void response
      .clone()
      .json()
      .then((data) => report(slug, data))
      .catch(() => {});
  return response;
};
const requests = new WeakMap<XMLHttpRequest, string>();
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (
  method: string,
  url: string | URL,
  ...rest: unknown[]
) {
  const slug = submitSlug(String(url), method);
  if (slug) requests.set(this, slug);
  else requests.delete(this);
  return Reflect.apply(originalOpen, this, [method, url, ...rest]);
};
XMLHttpRequest.prototype.send = function (body) {
  const slug = requests.get(this);
  if (slug)
    this.addEventListener(
      "load",
      () => {
        if (this.status >= 200 && this.status < 300)
          try {
            report(
              slug,
              this.responseType === "json"
                ? this.response
                : JSON.parse(this.responseText),
            );
          } catch {
            /* Non-JSON response is not credit. */
          }
      },
      { once: true },
    );
  return originalSend.call(this, body);
};
