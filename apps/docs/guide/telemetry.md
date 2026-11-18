---
description: What anonymous usage data SnapOtter collects, when it is sent, and how to turn instance-wide product analytics off.
---

# What SnapOtter collects {#what-snapotter-collects}

Anonymous Product Analytics is on by default and set for the whole instance by an administrator. Turn it off under Settings > System > Privacy.

## Events we send (when enabled) {#events-we-send-when-enabled}

- tool_used: tool id, status, duration, category, whether it is an AI tool, an error code on failure.
- pipeline_executed: step count, tool ids, batch flag, file count, duration, status.
- ai_bundle_action: bundle id, action, duration.
- Frontend usage: which tool pages open, files added (counts only), tool started, downloads, saves, search (result count only), batch processed.
- Crash reports: error type, a redacted error message (file names, paths, emails, and quoted values removed), a source stack with file basenames, and for AI tools a Python traceback with file basenames only.

## What we never collect {#what-we-never-collect}

- File names or paths
- File contents
- OCR output text
- Image metadata (EXIF)
- Extracted document text
- Your account identity

PostHog sees the IP address each request comes from, as any server does. Our PostHog project discards it instead of storing it, and SnapOtter's own server events send a placeholder in its place.

## Update notices {#update-notices}

While analytics is on, the server asks PostHog every few hours which SnapOtter release is newest, using the instance's anonymous id and its version. When a newer release exists, admins see a notice with a link to the release notes. Dismiss it and it stays hidden until the next release. Nothing is installed or downloaded for you, and with analytics off the server never asks.

## Turning it off {#turning-it-off}

Admins: Settings > System > Privacy, flip "Anonymous Product Analytics" off. It stops immediately, instance-wide. To build an image that can never emit, set the `SNAPOTTER_ANALYTICS=off` build arg.

To start a new instance with analytics already off, add `SNAPOTTER_ANALYTICS_DEFAULT=off` to the server's environment before its first boot. With Docker Compose, put it under the app service's `environment:`, because setting it in `.env` alone doesn't reach the container.
