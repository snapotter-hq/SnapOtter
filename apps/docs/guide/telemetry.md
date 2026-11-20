---
description: What anonymous usage data SnapOtter collects, when it is sent, how the first-run choice works, and how to turn instance-wide product analytics off.
---

# What SnapOtter collects {#what-snapotter-collects}

Anonymous Product Analytics is set for the whole instance by an administrator. A new instance asks on first run and sends nothing until someone answers. Change it any time under Settings > System > Privacy.

When analytics is on, SnapOtter sends PostHog which tools and pipelines run, how long they take, whether they succeed, error codes, and file counts, along with the instance's anonymous id, its version, CPU architecture, operating system, install type, and whether it has a GPU. Crash reports go to Sentry with file names, paths, emails, and quoted values stripped out. It never sends your files, their names or paths, their contents, OCR output or extracted text, image metadata, or your account identity. PostHog and Sentry are the only two places it sends anything, and with analytics off it sends nothing to either.

## First-run choice {#first-run-choice}

The first time an administrator opens a new instance, SnapOtter asks: "Send anonymous usage stats and crash reports? Your files are never sent." The two answers carry equal weight and neither is pre-selected. Closing the prompt without answering keeps analytics off and asks again on the next visit. Only an administrator sees it. With `AUTH_ENABLED=false` there are no accounts and the local user acts as the administrator, so whoever opens the app answers it. The desktop app asks the same way.

An instance that was already running before this prompt existed isn't asked. It keeps the analytics setting it had: on unless an administrator or `SNAPOTTER_ANALYTICS_DEFAULT=off` turned it off.

## Events we send (when enabled) {#events-we-send-when-enabled}

- tool_used: tool id, status, duration, category, whether it is an AI tool, an error code on failure, and the step name for a tool that reports one stage on its own (Passport Photo's analyze step).
- pipeline_executed: step count, tool ids, batch flag, file count, duration, status.
- ai_bundle_action: bundle id, action (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, or `imported`), duration, and on a failed install a failure category from a fixed list (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, or `other`). Installer output, paths, and error messages are never sent.
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

Admins: Settings > System > Privacy, flip "Anonymous Product Analytics" off. It stops immediately, instance-wide. To build an image that can never emit, set the `SNAPOTTER_ANALYTICS=off` build arg. `SNAPOTTER_TELEMETRY=off` in the server's environment does the same at runtime and wins over any answer stored in the app.

To answer the first-run question in advance, add `SNAPOTTER_ANALYTICS_DEFAULT=off` (or `on`) to the server's environment before its first boot, and nobody is asked. With Docker Compose, put it under the app service's `environment:`, because setting it in `.env` alone doesn't reach the container.
