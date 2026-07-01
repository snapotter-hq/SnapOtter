---
description: What anonymous usage data SnapOtter collects, when it is sent, and how to turn instance-wide product analytics off.
---

# What SnapOtter collects

Anonymous Product Analytics is on by default and set for the whole instance by an administrator. Turn it off under Settings > System > Privacy.

## Events we send (when enabled)

- tool_used: tool id, status, duration, category, whether it is an AI tool, an error code on failure.
- pipeline_executed: step count, tool ids, batch flag, file count, duration, status.
- ai_bundle_action: bundle id, action, duration.
- Frontend usage: which tool pages open, files added (counts only), tool started, downloads, saves, search (result count only), batch processed.
- Crash reports: error type and a source stack with file basenames only.

## What we never collect

- File names or paths
- File contents
- OCR output text
- Image metadata (EXIF)
- Extracted document text
- Your IP address or account identity

## Turning it off

Admins: Settings > System > Privacy, flip "Anonymous Product Analytics" off. It stops immediately, instance-wide. To build an image that can never emit, set the `SNAPOTTER_ANALYTICS=off` build arg.
