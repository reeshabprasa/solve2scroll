# Validation

## Live LeetCode protocol check — 2026-09-08

An existing solution was resubmitted in a signed-in Chromium-based browser. LeetCode returned a new submission ID and the final judge result was Accepted (1,036/1,036 test cases). DevTools confirmed the submit response and the `/v2/check/` response fields. Reduced, anonymized fixtures are in `tests/fixtures`; no credentials, submitted code, or personal identifiers are checked in.

After the protocol check, the built extension was loaded unpacked into Arc (Chromium). A second real submission was Accepted and the extension displayed **20:00** with “Accepted! 20 minutes added to your pool.” The TikTok blocked page changed to “Time well earned” and enabled Continue. Continuing opened TikTok with its live countdown; Instagram was also opened with the countdown visible. Switching away paused spending. A live navigation from another site also exposed a blocked-page accessibility issue, which was fixed and covered by a regression test.

## Automated coverage

- Unit tests: initial balance, exact rewards, repeat solves, duplicate and historical IDs, tab/document correlation, storage round-trip, elapsed-time deductions, sleep/backward-clock handling, domain matching, and strict judge parsing.
- Chromium integration: actual Manifest V3 loading, both social redirects, full submit/correlation/verification/credit flow with fixtures, Run Code and old-event rejection, worker restart, exhaustion of an existing tab, focused-tab accounting, multiple tabs, offline retry, wrong answers, repeated problems, and UI rendering.
- Integration tests load the real built extension into disposable Chrome for Testing profiles; LeetCode responses are deterministic fixtures rather than submissions to a real account.

## Manual release smoke checklist

1. Load the release unpacked in Chrome and refresh LeetCode.
2. With an empty pool, open Instagram and TikTok and confirm both redirect.
3. Submit any solution and verify one Accepted result adds 20 minutes.
4. Repeat the same problem and verify a second new submission adds another 20 minutes.
5. Browse either social site, switch away, minimize, lock/unlock, and restart Chrome; confirm spending only while viewing social pages.
6. At exhaustion, verify playback stops and both sites are blocked.
7. Update from the same unpacked folder and confirm the pool remains saved.

Physical screen locking/sleep remain manual checks; automated tests simulate accounting gaps. Real LeetCode acceptance with the installed extension was verified as described above. Chrome for Testing runs the automated browser suite; the signed-in live smoke check used Arc.
