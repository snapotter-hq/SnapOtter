---
title: Error codes
description: The error body shape, the stable codes, and what to do about each one.
---

# Error codes {#error-codes}

Every JSON error response has the same shape:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Field | Always present | Meaning |
|-------|----------------|---------|
| `error` | Yes | A human-readable message. Safe to show to users. Do not parse it. |
| `code` | Yes | A stable, machine-readable code. Branch on this. |
| `requestId` | Yes | The server's ID for this request. Quote it when you report a problem; it matches the server log. |
| `details` | Sometimes | More context for some 4xx errors, such as the validation message. |

Messages can change between releases. Codes do not, so write client logic against `code`.

## Codes from the HTTP status {#status-codes}

When a route does not set its own code, the server derives one from the status:

| HTTP status | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Any other 4xx falls back to `BAD_REQUEST`, and any other 5xx to `INTERNAL_ERROR`.

A route can set a more specific code, and then the response carries that code instead. For example, a tool that cannot run because its AI bundle is missing returns a feature-specific code. Those codes are described with the feature that raises them.

## Authentication and access {#auth-codes}

| `code` | Status | What to do |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Send `Authorization: Bearer <token>` with a session token or an API key (`si_...`). |
| `FORBIDDEN` | 403 | The credential is valid but lacks the permission. Ask an admin for the permission. |
| `MUST_CHANGE_PASSWORD` | 403 | The account must change its password before it can call other endpoints. Call `POST /api/auth/change-password` with the session token, then retry. |
| `USER_DISABLED` | 403 | The account is disabled. An admin has to re-enable it. |
| `LOGIN_THROTTLED` | 429 | Too many failed sign-in attempts. Wait before trying again. |
| `VALIDATION_ERROR` | 400 | The request body or parameters failed validation. `details` names the problem. |

The first-run admin account is `admin` with the password `admin` unless `DEFAULT_USERNAME` or `DEFAULT_PASSWORD` changed it. Unless `SKIP_MUST_CHANGE_PASSWORD` is set, that account gets `MUST_CHANGE_PASSWORD` on every call until the password changes.

## Jobs {#job-codes}

A job that fails reports its reason on the job itself, not in the HTTP error. Read `error.code` and `error.message` from `GET /api/v1/jobs/{jobId}`. See [Progress Tracking](/api/rest#progress-tracking).

## Not yet cataloged {#not-yet-cataloged}

The codes raised by individual features (for example encryption, OIDC, SCIM, and teams) are not described on this page yet. Each one is a stable code; treat an unlisted code as opaque and handle it by its status.
