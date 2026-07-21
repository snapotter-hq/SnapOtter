# Telemetry event dictionary

Contributor reference for every analytics event SnapOtter can emit, what each carries, and where it fires. For the user-facing summary and opt-out steps, see the published [telemetry guide](apps/docs/guide/telemetry.md). For the privacy stance, see the in-app privacy policy.

Product analytics is on by default and set instance-wide by an admin under Settings > System > Privacy. Nothing is sent when it is off.

## Source of truth

The code is authoritative; this doc is the map. A drift test (`tests/unit/shared/telemetry-doc-drift.test.ts`) asserts every event name in `ANALYTICS_EVENTS` appears here, so add a row when you add an event.

- Event names: `packages/shared/src/analytics/events.ts` (`ANALYTICS_EVENTS`)
- Server property allowlist: `apps/api/src/lib/analytics-allowlist.ts`
- Client property allowlist: the `ALLOWED` map in `apps/web/src/lib/analytics.ts`
- Feedback enum values: `packages/shared/src/analytics/feedback.ts`

## Invariants

- Every event passes a strict per-event property allowlist before it leaves the process, on both the client and the server. Anything not listed is dropped, so filenames, tool settings, and free text cannot leak.
- We never send file names, paths, contents, OCR text, EXIF, extracted document text, IP address, or account identity. The single exception is feedback contact details (email, name, company), and only when the user ticks the contact-consent box.
- `instance_id` rides events as a property, not an `identify()` call. Events stay anonymous and person-less while still rolling up per instance.
- Autocapture and session replay are off. Exceptions go to Sentry, not PostHog.
- One opt-out gate stops all egress: `analyticsEnabled()` on the server, the live `enabled` flag on the client, and a build-time bake (`SNAPOTTER_ANALYTICS=off`) that can strip it entirely.

## Server events

Emitted from `apps/api` through `trackEvent()`; properties are filtered by `analytics-allowlist.ts`.

| Event | Fires when | Key properties |
| --- | --- | --- |
| `instance_started` | Once per boot | `arch`, `os_platform`, `deploy_mode`, `gpu_present` |
| `auth_login` | A login succeeds | `method` (`password` or `oidc`) |
| `auth_login_failed` | A login attempt fails | `method` (`password` or `oidc`) |
| `tool_used` | A tool job finishes | `tool_id`, `status`, `duration_ms`, `category`, `is_ai_tool`, `is_batch`, `input_format`, `output_format`, `bytes_in`, `bytes_out`, `execution_hint`, `error_code`, `error_kind` |
| `pipeline_executed` | A pipeline run finishes | `step_count`, `tool_ids`, `is_batch`, `file_count`, `duration_ms`, `status` |
| `ai_bundle_action` | An AI bundle is installed, uninstalled, reset, or imported | `bundle_id`, `action`, `duration_ms` |

### Feedback events

Both ride `POST /api/v1/feedback` and go through `cleanFeedbackProperties()`, a cleaner separate from the allowlist above. Enum values live in `feedback.ts`.

| Event | Fires when | Key properties |
| --- | --- | --- |
| `feedback_submitted` | A user submits genuine feedback (nav button, tool result, failed job, search miss, admin installer card) | `source`, `sentiment`, `feedback_type`, `message`, `survey_id`, `prompt_variant`, `tool_id`, `search_query`, `job_status`, `error_category`, `contact_ok`, and, only with consent, `contact_email` / `contact_name` / `company` |
| `onboarding_survey_submitted` | A user completes the onboarding usage survey (`source: onboarding`) | `usage_type`, `prior_tool`, `selfhost_motivation`, `discovery_source`, `survey_id`, `prompt_variant` |

The onboarding survey is a profiling questionnaire, not feedback, so it gets its own event. Splitting the two keeps onboarding responses from swamping feedback metrics.

## Client events

Emitted from `apps/web` through `track()`; properties are filtered by the `ALLOWED` map in `analytics.ts`.

| Event | Fires when | Key properties |
| --- | --- | --- |
| `tool_opened` | A tool page opens | `tool_id`, `category`, `modality` |
| `file_added` | Files are added | `file_count` |
| `tool_started` | Processing starts | `tool_id`, `is_batch`, `file_count` |
| `batch_processed` | A batch run finishes | `tool_id`, `file_count`, `status` |
| `result_downloaded` | A result is downloaded | `tool_id` |
| `result_saved` | A result is saved to the library | `tool_id` |
| `search` | A tool search runs | `results_count`, `clicked_tool_id` |
| `tool_client_error` | The React error boundary catches a crash | `error_name` |
| `ai_bundle_prompted` | An AI install prompt is shown | `bundle_id` |
| `editor_opened` | The image editor opens | none |
| `editor_tool_used` | An editor tool is selected | `editor_tool` |
| `editor_exported` | An editor export runs | `output_format` |
| `pipeline_opened` | The Automate page opens | none |
| `pipeline_step_added` | A step is added to a pipeline | `tool_id` |
| `pipeline_saved` | A pipeline is saved | `step_count` |
| `pipeline_template_selected` | A pipeline template is picked | `template_id` |
| `sponsor_clicked` | The sponsor link is clicked | none |
| `feedback_prompt_shown` | A feedback surface becomes visible (usage survey, per-job prompt, admin install card, nav dialog, search miss) | `source`, `survey_id`, `prompt_variant` |
| `feedback_prompt_dismissed` | A feedback surface is dismissed without submitting | `source`, `survey_id`, `prompt_variant`, `dismiss_kind` (`close`, `dont_ask_again`, or `snooze`) |

### SDK-generated events

posthog-js also captures `$pageview` and `$pageleave` on route changes, plus `$web_vitals`. These skip the `track()` allowlist, so the `before_send` hook that strips query strings and fragments from URLs is the boundary for them.
