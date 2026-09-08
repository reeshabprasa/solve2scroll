# Solve2Scroll v0.1.0

Earn 20 minutes of Instagram and TikTok for each new Accepted LeetCode submission. Repeat solutions count; saved minutes never expire.

- Shared pool with focused-tab accounting and persistent storage.
- Automatic submission verification and duplicate prevention.
- Site blocking at zero, including already-open tabs.
- Popup, countdown, blocked page, and first-run guide.
- Local-only data, no backend or analytics.

## Install

Download **solve2scroll-v0.1.0.zip**, extract it to a permanent folder, open **chrome://extensions**, enable **Developer mode**, and choose **Load unpacked**. Select the extracted folder containing `manifest.json`, pin the extension, and refresh existing LeetCode tabs.

Use the release asset rather than the source-code ZIP. Chrome 120+ required. Native mobile apps and incognito are not covered. Keep the same folder when updating to retain saved time.

A real Accepted submission with the installed extension added 20 minutes in a live Chromium-based browser. Automated extension tests also cover the pipeline using sanitized fixtures. See the repository’s validation notes for coverage and manual checks.
