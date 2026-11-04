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
| `IDLE_TIMEOUT` | 401 | The session sat idle past the idle timeout and was ended. Sign in again. |
| `IP_NOT_ALLOWED` | 403 | The caller's IP address is not on the instance allowlist. Call from an allowed address or ask an admin to add yours. |
| `ESCALATION_DENIED` | 403 | The action would grant or manage more authority than the caller has, such as assigning a role above their own. Ask a user with the higher role to do it. |
| `INVALID_PASSWORD` | 401 | The current password sent to the change-password call is wrong. Ask the user to re-enter it. |
| `PASSWORD_CHANGED` | 409 | The password was changed elsewhere while this request ran, so nothing was written. Sign in again. |
| `OIDC_NO_PASSWORD` | 400 | The account signs in through an identity provider and has no local password to change or reset. Manage the password at the provider. |

The first-run admin account is `admin` with the password `admin` unless `DEFAULT_USERNAME` or `DEFAULT_PASSWORD` changed it. Unless `SKIP_MUST_CHANGE_PASSWORD` is set, that account gets `MUST_CHANGE_PASSWORD` on every call until the password changes.

## Multi-factor authentication {#mfa-codes}

| `code` | Status | What to do |
|--------|--------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | The instance requires MFA and this account has not enrolled. Enroll through `POST /api/auth/mfa/enroll`, then sign in again. |
| `MFA_POLICY_UNAVAILABLE` | 503 | The server could not read the MFA policy during sign-in. Retry after a moment. |
| `MFA_EXPIRED` | 401 | The MFA challenge token is expired, already used, or unknown. Start sign-in again. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Too many wrong codes on one challenge, so it was cancelled. Start sign-in again. |
| `MFA_NOT_CONFIGURED` | 401 | The challenge refers to an account that no longer has MFA set up. Start sign-in again. |
| `INVALID_CODE` | 401 | The TOTP or recovery code is wrong, or was already used. Ask for a fresh code. |
| `NO_PENDING_ENROLLMENT` | 400 | There is no enrollment to confirm. Call `POST /api/auth/mfa/enroll` first. |
| `MFA_ALREADY_ENABLED` | 409 | The account already has MFA on. Disable it first if you need to enroll a new device. |
| `MFA_NOT_ENABLED` | 400 | The account does not have MFA on, so there is nothing to disable or reset. |
| `FEATURE_NOT_LICENSED` | 403 | The feature needs an enterprise license that this instance does not have. The same code covers the `mfaPolicy` and `ssoEnforcement` settings. |
| `DECRYPTION_FAILED` | 500 | A stored secret (an MFA secret, a setting, a webhook header) could not be decrypted. The encryption key no longer matches. An operator has to restore `DATA_ENCRYPTION_KEY` or `DATA_ENCRYPTION_KEY_PREVIOUS`. |

## Users, roles, and teams {#user-codes}

| `code` | Status | What to do |
|--------|--------|------------|
| `USER_LIMIT_REACHED` | 403 | The instance is at its `MAX_USERS` limit. Remove a user or raise the limit. |
| `UNKNOWN_ROLE` | 400 | The role named in the request does not exist. List roles and use a valid one. |
| `UNKNOWN_TEAM` | 400 | The team named in the request does not exist. List teams and use a valid one. |
| `SELF_DEMOTE` | 400 | An admin cannot remove their own admin role. Ask another admin to do it. |
| `SELF_DELETE` | 400 | A user cannot delete their own account. Ask another admin to do it. |
| `LAST_ADMIN` | 400 or 409 | The change would leave the instance without an admin. Promote another admin first. User update and delete answer 400; the GDPR purge routes answer 409. |

## Settings and configuration {#settings-codes}

| `code` | Status | What to do |
|--------|--------|------------|
| `UNKNOWN_SETTING` | 400 | The setting key does not exist. Check the key against the settings list. |
| `READONLY_SETTING` | 400 | The setting cannot be written through this route. Change it with an environment variable instead. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | The value needs something else configured first, such as `ssoEnforcement` without an OIDC or SAML provider. `setting` names the row and `validationErrors` says what is missing. |
| `INVALID_CIDR` | 400 | An IP allowlist entry is not a valid address or CIDR range. The message lists the bad entries. |
| `SELF_LOCKOUT` | 400 | The allowlist would block the caller's own IP. Add your address before saving. |

## Tools and files {#tool-codes}

| `code` | Status | What to do |
|--------|--------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | The tool needs an AI feature bundle that is not installed. The body names it in `feature`, `featureName`, and `estimatedSize`. Install it from Settings, AI Features, then retry. |
| `FEATURE_INCOMPATIBLE` | 501 | The installed OCR pack cannot serve the requested quality or language. `compatibilityReason` says why. Pick another quality or update the pack. |
| `ENGINE_UNAVAILABLE` | 503 | A required engine (FFmpeg, qpdf, a decoder, or the barcode reader) could not start or ran out of resources. Retry; if it keeps happening, an operator has to check the engine paths and server memory. |
| `INPUT_MISSING` | 410 | A queued input file is gone from storage. Upload it again. |
| `ANALYSIS_EXPIRED` | 410 | The passport-photo analysis has expired. Analyze the photo again, then generate. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | The stored cutout for the background effects has expired. Remove the background again. |
| `NOT_ANIMATED` | 400 | The GIF background tool only takes animated images. Use the still-image background tool instead. |
| `TOO_MANY_FRAMES` | 400 | The animation is over the `GIF_BG_MAX_FRAMES` limit. Trim it or ask an operator to raise the limit. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium is not installed, so HTML to image cannot run. An operator has to install it. |
| `BROWSER_CRASHED` | 503 | The screenshot browser is disabled or restarting after a crash. Retry after a moment. |
| `STORAGE_QUOTA_EXCEEDED` | 413 | Saving would pass the user's library quota. Delete files or ask an admin to raise the quota. A file over the upload size limit answers 413 `PAYLOAD_TOO_LARGE` instead. |

## Jobs {#job-codes}

A job that fails reports its reason on the job itself, not in the HTTP error. Read `error.code` and `error.message` from `GET /api/v1/jobs/{jobId}`. See [Progress Tracking](/api/rest#progress-tracking).

| `code` | Where | What to do |
|--------|-------|------------|
| `CANCELED` | The failed job and its progress frame | The job was cancelled before it finished. Submit it again if you still want the result. |

Some tool failures also set a code on the job, such as `ENGINE_UNAVAILABLE` or `INPUT_MISSING` above. They mean the same thing there as in a direct response.

## Codes the API keeps to itself {#internal-codes}

Some codes are only logged or reported to the operator, and never reach a client as the `code` field. These are the OIDC discovery and logout-URL faults, the per-source decryption faults (the response carries `DECRYPTION_FAILED` instead), and a few storage and cleanup faults. A client only ever sees the status-derived code or one of the codes above.
