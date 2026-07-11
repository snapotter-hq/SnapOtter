---
description: Manage users, built-in and custom roles, permissions, API keys, teams, sessions, and the audit log in SnapOtter.
---

# Users, Roles & Permissions {#users-roles-permissions}

SnapOtter ships three built-in roles, 17 granular permissions, and support for custom roles with optional per-tool access control. This page covers the full authorization model, API key scoping, team management, and audit logging.

::: tip Related pages
[OIDC / SSO](/guide/oidc) | [SAML SSO](/guide/saml) | [SCIM Provisioning](/guide/scim) | [Security & Hardening](/guide/security)
:::

## Users {#users}

### Creating users {#creating-users}

Admins can create users through the admin panel or the `POST /api/auth/register` endpoint. Each user has a username, role, team assignment, and an optional email address.

### Default admin {#default-admin}

On first startup SnapOtter creates a default admin account. The credentials come from environment variables:

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Username for the initial admin account |
| `DEFAULT_PASSWORD` | `admin` | Password for the initial admin account |

The default admin is required to change their password on first login.

### Authentication providers {#authentication-providers}

Users can authenticate through several methods:

- **Local** - username and password stored in the SnapOtter database
- **OIDC** - any OpenID Connect provider (see [OIDC / SSO](/guide/oidc))
- **SAML** - SAML 2.0 identity providers (see [SAML SSO](/guide/saml))
- **SCIM** - automated provisioning from an identity provider (see [SCIM Provisioning](/guide/scim))

### Disabling authentication {#disabling-authentication}

Set `AUTH_ENABLED=false` to disable authentication entirely. In this mode a synthetic anonymous user with the `admin` role is used for all requests. No login is required.

::: warning
Disabling authentication grants full admin access to anyone who can reach the instance. Only use this in trusted environments.
:::

## Built-in roles {#built-in-roles}

SnapOtter includes three built-in roles. They cannot be modified or deleted.

### Admin {#admin}

All 17 permissions. Full control over the instance.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 permissions. Can use all tools and manage all files and pipelines, but cannot access admin functions.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 permissions. Can use tools and manage their own resources.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Permissions reference {#permissions-reference}

| Permission | Description |
|---|---|
| `tools:use` | Use any processing tool |
| `files:own` | View and manage own files |
| `files:all` | View and manage all users' files |
| `apikeys:own` | Create and manage own API keys |
| `apikeys:all` | View all users' API keys |
| `pipelines:own` | Create and manage own pipelines |
| `pipelines:all` | View and manage all users' pipelines |
| `settings:read` | View instance settings |
| `settings:write` | Modify instance settings |
| `users:manage` | Create, update, and delete user accounts |
| `teams:manage` | Create, update, and delete teams |
| `features:manage` | Install and manage AI feature bundles |
| `system:health` | Access health and readiness endpoints |
| `audit:read` | View the audit log and list roles |
| `compliance:manage` | Manage GDPR lifecycle and compliance features |
| `webhooks:manage` | Configure outbound webhooks |
| `security:manage` | Manage security settings (IP allowlist, SSO enforcement) |

## Custom roles {#custom-roles}

Admins with the `security:manage` permission can create custom roles through the admin panel or the roles API. Listing roles requires `audit:read`.

### Creating a custom role {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Role names must be 2-30 characters, lowercase alphanumeric with hyphens and underscores.

### Admin-reserved permissions {#admin-reserved-permissions}

Three permissions are reserved for built-in roles and cannot be assigned to custom roles:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

The roles API rejects any request that includes these permissions. Only the built-in `admin` role has access to them.

### Tool-level permissions {#tool-level-permissions}

Custom roles can optionally restrict which tools users may access. Two modes are available:

| Mode | Behavior | License requirement |
|---|---|---|
| `category` | Restrict by modality (image, video, audio, document, file) | None (free) |
| `tool` | Restrict by individual tool ID | Requires the `per_tool_permissions` enterprise feature |

When `tool` mode is set but the enterprise feature is not available, SnapOtter degrades gracefully and allows access to all tools.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### Deleting a custom role {#deleting-a-custom-role}

When a custom role is deleted, all users assigned to it are automatically reassigned to the `user` role.

## Teams {#teams}

Teams group users for storage and retention management. A `Default` team is created on first startup.

| Field | Type | Description |
|---|---|---|
| `name` | string | Unique team name (1-50 characters) |
| `storageQuota` | number | Per-team storage limit in bytes (works without enterprise) |
| `retentionHours` | number | Auto-delete outputs after this many hours (requires `team_retention_overrides`, enterprise) |
| `legalHold` | boolean | Prevent automatic deletion of team members' files (requires `legal_hold`, enterprise) |

::: info
The `Default` team cannot be deleted. Teams that still have members cannot be deleted. Reassign members first.
:::

## API keys {#api-keys}

Users can generate API keys for programmatic access. Each key uses the `si_` prefix and is shown only once at creation time.

### Scoped permissions {#scoped-permissions}

API keys can optionally carry a `permissions` array. When set, the effective permissions for a request are the **intersection** of the user's role permissions and the key's scoped permissions. This means an API key can never escalate beyond the user's own permissions.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### Expiration {#expiration}

Keys accept an optional `expiresAt` timestamp. Expired keys are rejected at authentication time.

## Audit log {#audit-log}

SnapOtter records security-relevant events in a structured audit log stored in the `audit_log` database table.

### Viewing the audit log {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Requires the `audit:read` permission. Supports pagination (`page`, `limit`) and filters (`action`, `ip`, `from`, `to`).

### Tool operation auditing {#tool-operation-auditing}

::: warning
`TOOL_EXECUTED` events are **not** logged by default. They are opt-in through either of two paths:

1. Set the `auditToolOperations` admin setting to `true`.
2. Hold an active license with the `audit_export` feature (available on both team and enterprise plans).

Without one of these, individual tool executions are not recorded in the audit log.
:::

### Exporting {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Requires the `audit:read` permission and the `audit_export` enterprise feature (available on both team and enterprise plans). Supports CSV and JSON formats, filtered by `action`, `actorId`, `targetType`, `targetId`, `from`, and `to`.

### Tamper-resistant signing {#tamper-resistant-signing}

When enabled, each audit log entry is signed with an HMAC derived from `DATA_ENCRYPTION_KEY`. This requires:

1. Setting `DATA_ENCRYPTION_KEY` in your environment.
2. Enabling the `tamperResistantAudit` admin setting.
3. An enterprise license with the `tamper_resistant_audit` feature.

### Retention {#retention}

Set `AUDIT_RETENTION_DAYS` to automatically purge old entries. The default is `0`, which means entries are kept indefinitely.

### Event reference {#event-reference}

| Event | Category |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Authentication |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Authentication |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Authentication |
| `LOGOUT` | Authentication |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | User management |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | User management |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Roles |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API keys |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Settings |
| `FILE_UPLOADED`, `FILE_DELETED` | Files |
| `TOOL_EXECUTED` | Tools (opt-in) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Compliance |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Compliance |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuration |

## Session management {#session-management}

Sessions are cookie-based, controlled by `SESSION_DURATION_HOURS` (default: 168 hours / 7 days).

### Role changes invalidate sessions {#role-changes-invalidate-sessions}

When an admin changes a user's role, all of that user's active sessions are deleted. The user must log in again to pick up their new permissions.

### Safety guards {#safety-guards}

- **Last-admin protection**: the last remaining admin cannot be demoted to a lower role. The API returns an error if you try.
- **Self-delete prevention**: admins cannot delete their own account through the API.
