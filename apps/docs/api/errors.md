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

A failed job keeps `error.code` only when the failure is an input error or a server fault. Other failures carry the message alone.

| `code` | Meaning | What to do |
|--------|---------|------------|
| `CANCELED` | The job was canceled by a user. It is not an HTTP status. Progress events carry `phase: failed` with this code. | Treat it as a user cancel. Do not retry it automatically. |
| `INPUT_MISSING` | The input was removed before the job ran. | Upload the file again. |
| `ENGINE_UNAVAILABLE` | A required engine could not start on the server. | Retry after an administrator repairs the install. |
| `JOB_STALLED` | Not returned to clients; it labels the server's error report. The worker lost the job's lock more times than the queue allows, usually because the server restarted or ran short of memory or CPU. The job fails with a message saying it was interrupted. | Retry. If it keeps happening, give the server more memory or lower `CONCURRENT_JOBS`. |

## Authentication and MFA {#mfa-codes}

| `code` | Status | Meaning | What to do |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | The MFA policy requires enrollment, and this instance cannot enroll the user (no enterprise license). Licensed instances return 200 with `requiresMfaEnrollment: true` and walk the user through enrollment instead. | Do not retry. An administrator has to change the policy or use the offline recovery CLI. |
| `MFA_POLICY_UNAVAILABLE` | 503 | The server could not read the MFA policy during sign-in. | Retry the sign-in shortly. |
| `INVALID_CODE` | 401 | The TOTP or recovery code is wrong. | Ask the user for a fresh code and retry. Repeated failures end in `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Too many wrong codes. The challenge is discarded. | Start the sign-in again to get a new challenge. |
| `MFA_EXPIRED` | 401 | The MFA or enrollment challenge expired or does not match. | Start the sign-in again. |
| `MFA_NOT_CONFIGURED` | 401 | The account has no TOTP secret, so a code cannot be checked. | Enroll MFA before signing in with a code. |
| `MFA_ALREADY_ENABLED` | 409 | MFA is already active on the account. | Do not enroll again. |
| `NO_PENDING_ENROLLMENT` | 400 | An enrollment confirmation arrived with no pending enrollment. | Call the enroll endpoint first. |
| `MFA_NOT_ENABLED` | 400 | The action needs MFA to be on, and it is off for this user. | Skip the action, or enable MFA first. |
| `MFA_DECRYPTION_FAILED` | 500 | The stored TOTP secret cannot be decrypted. | Operator action. This usually means the encryption key changed. Check `DATA_ENCRYPTION_KEY` and `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | A stored value (a setting, a webhook auth header, or a TOTP secret) cannot be decrypted. | Operator action, as above. Do not retry. |
| `IDLE_TIMEOUT` | 401 | The session expired after a period of inactivity. | Sign in again. |
| `INVALID_PASSWORD` | 401 | The current password is wrong on a password change. | Ask the user for the current password. |
| `PASSWORD_CHANGED` | 409 | The password changed in another session, or an administrator reset it, while this request was running. | Sign in again. |
| `OIDC_NO_PASSWORD` | 400 | A password change or reset was requested for an account created through SSO. | Direct the user to the identity provider. |

## OIDC {#oidc-codes}

OIDC failures during sign-in do not return a JSON body. The login route redirects to the login page with a generic reason, and the audit log records the code. The logout route still ends the local session when the identity provider cannot be reached.

| `code` | Status | Meaning | What to do |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | None (redirect) | The issuer URL is `http`, but `EXTERNAL_URL` is `https`, so the client refuses discovery. | Administrator: serve the issuer over `https`, or run the instance over `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | None (redirect) | Discovery of the issuer timed out. | Check that the server can reach the issuer, then retry. |
| `OIDC_DISCOVERY_FAILED` | None (redirect) | Discovery failed for another reason. | Check the issuer URL and the server's outbound access. |
| `OIDC_END_SESSION_INVALID` | None (logout continues) | The identity provider's `end_session_endpoint` is not a valid URL. The local session is still cleared. | Administrator: fix the provider's metadata. |
| `OIDC_END_SESSION_SCHEME` | None (logout continues) | The `end_session_endpoint` uses a scheme the server does not allow. The local session is still cleared. | Administrator: fix the provider's metadata. |

## SAML {#saml-codes}

SAML failures do not set a `code`. A failed assertion redirects to the login page with `saml_auth_failed`, and the `SAML_LOGIN_FAILED` audit event records the reason.

## SCIM {#scim-codes}

SCIM routes answer with the RFC 7644 error envelope (`schemas`, `detail`, `status`, and sometimes `scimType`). They do not set `code`. Branch on the HTTP status.

## Teams, roles, and users {#team-role-codes}

Duplicate team or role names return the generic `CONFLICT`, and a missing team or role returns `NOT_FOUND`.

| `code` | Status | Meaning | What to do |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | The caller's role does not allow the change. The target sits above the caller's authority, the role is built in, or the request grants permissions the caller does not hold. | Do not retry. Ask a user with more authority. |
| `UNKNOWN_ROLE` | 400 | The role ID does not match an existing role. | Fix the role ID. List the roles to find it. |
| `UNKNOWN_TEAM` | 400 | The team ID does not match an existing team. | Fix the team ID. |
| `SELF_DEMOTE` | 400 | An admin tried to remove their own admin role. | Have another admin make the change. |
| `SELF_DELETE` | 400 | An admin tried to delete their own account. | Have another admin delete it. |
| `LAST_ADMIN` | 400 on user routes, 409 on GDPR purge routes | The change would leave no admin, or purge a team that holds every admin. | Make another user an admin first. |
| `USER_LIMIT_REACHED` | 403 | The instance is at its `MAX_USERS` limit. | Remove a user, or raise `MAX_USERS`. |

## Features and AI bundles {#feature-codes}

Tools, batch runs, and pipelines that need an optional AI bundle use these codes.

| `code` | Status | Meaning | What to do |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | The tool, or one step of a pipeline or batch, needs a bundle that is not installed. The body includes `feature` (the bundle ID) and `featureName`. | Install the bundle in Settings, then retry. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | An install or offline import was refused because the bundle's x86-64 libraries need AVX and this server's CPU doesn't have it. Nothing was downloaded or installed. The body includes `feature` (the bundle ID) and `reason` (`cpu-no-avx`). `GET /api/v1/features` reports the same bundle with `compatibility: "incompatible"` and `compatibilityReason: "cpu-no-avx"`. | Run SnapOtter on a CPU with AVX, or on arm64. Other bundles still install. |
| `FEATURE_INCOMPATIBLE` | 501 | The installed feature cannot do the requested quality or language. | Change the setting, or install a bundle that supports it. |
| `ENGINE_UNAVAILABLE` | 503 | A required engine could not start, or an OCR runtime was removed after the request was validated. | Retry after an administrator repairs or reinstalls the feature. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium is not installed, so HTML to image cannot run. | Ask an administrator to install the browser. |
| `BROWSER_CRASHED` | 503 | The screenshot browser crashed while rendering. | Retry the request. |

## Tools {#tool-codes}

| `code` | Status | Meaning | What to do |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | The uploaded input was removed before the job ran. | Upload the file again and submit the job. |
| `ANALYSIS_EXPIRED` | 410 | The passport photo analysis expired before generation. | Analyze the photo again, then generate. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | The background removal result expired before the follow-up step. | Remove the background again. |
| `NOT_ANIMATED` | 400 | Remove GIF Background received a still image. | Use Remove Background for still images. |
| `TOO_MANY_FRAMES` | 400 | The animation has more frames than the server allows (`GIF_BG_MAX_FRAMES`). | Send a shorter animation, or ask an administrator to raise the limit. |
| `TOO_MANY_PIXELS` | 400 | The animation's canvas times its frame count is over 268,402,689 pixels (16383 x 16383), the most Remove GIF Background holds in memory. | Send fewer frames or a smaller animation. |

## Files {#file-codes}

| `code` | Status | Meaning | What to do |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Saving to Files would exceed the user's storage quota. | Delete files, or ask an administrator for more space. |
| `INVALID_STORED_NAME` | 400 | The server rejected a stored file name. | Upload the file again. |

## Pipelines and batch {#pipeline-codes}

Pipeline and batch requests return the feature codes above for each step that needs a bundle. A job ID that is already in use returns `CONFLICT` with status 409. Send a new job ID.

## Settings {#settings-codes}

| `code` | Status | Meaning | What to do |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | The key is not a known setting. | Check the key name. |
| `READONLY_SETTING` | 400 | The setting cannot be changed through the API. | Change it through the environment or the admin UI. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | The new value conflicts with other settings. The body names the setting in `setting` and lists the problems in `validationErrors`. | Fix the listed settings, then retry. |
| `SETTING_DECRYPTION_FAILED` | 500 | A stored setting cannot be decrypted. | Operator action, as for `DECRYPTION_FAILED`. |

For `VALIDATION_ERROR` on a setting, `details` holds the schema issues.

## Enterprise {#enterprise-codes}

| `code` | Status | Meaning | What to do |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | The setting or policy needs an enterprise license, such as SSO enforcement or the MFA policy. | Use a licensed instance, or leave the setting off. |
| `IP_NOT_ALLOWED` | 403 | The request's IP address is not in the allowlist. | Connect from an allowed network. |
| `INVALID_CIDR` | 400 | An allowlist entry is not a valid CIDR. The message lists the bad entries. | Fix the entries and save again. |
| `SELF_LOCKOUT` | 400 | Saving the allowlist would block the caller's current IP. | Add your current IP to the list first. |

GDPR purge routes return a plain `CONFLICT` with status 409 when a user or team is under legal hold.

## Codes that clients do not receive {#internal-codes}

These codes exist in the server source for logs, telemetry, or Fastify's own errors. A client does not get them in a response body or job row, so do not write client logic against them.

| `code` | Where it goes |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Reported to error tracking by the alert evaluator. An alert webhook's auth header cannot be decrypted. |
| `SIEM_DECRYPTION_FAILED` | Reported to error tracking by SIEM forwarding. The SIEM auth header cannot be decrypted. |
| `WEBHOOK_DECRYPTION_FAILED` | Reported to error tracking. The request that hit the same failure answers with `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Reported to error tracking when a staged upload cannot be removed. |
| `USERNAME_RACE_EXHAUSTED` | Raised when SSO auto-create loses the username race on every retry. The login page shows an error instead. |
| `ERR_OUT_OF_RANGE` | Thrown by the object storage reader for an invalid byte range. |
| `ETIMEDOUT` | Set on the timeout error for a GDPR export. The export fails, and it can be requested again. |
| `FST_REQ_FILE_TOO_LARGE` | Fastify's code for an upload over the limit. Clients get a 413 with `PAYLOAD_TOO_LARGE`, or the route's own 413 message. |
| `TARGET_SIZE_EXCEEDED` | Thrown when a target-size compression misses its target. The error has no status or code, so clients get a generic failure. |
| `OCR_CACHE_PERMISSIONS` | Reported to error tracking as an operational fault when the AI data volume leaves the OCR runtime cache world-writable. The install job fails with a message that names the storage problem. |
| `OCR_RUNTIME_UNREACHABLE` | Reported to error tracking as an operational fault when the server never reached huggingface.co to download the OCR runtime. The install job fails with a message about network access, `HTTPS_PROXY`, and offline import. |
