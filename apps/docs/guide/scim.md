---
description: Set up SCIM 2.0 provisioning to sync users and groups from your identity provider to SnapOtter. Covers Okta, Azure AD / Entra ID, and custom integrations.
---

# SCIM Provisioning

SnapOtter implements SCIM 2.0 (System for Cross-domain Identity Management) for automated user and group provisioning. Your identity provider can create, update, deactivate, and reactivate user accounts and sync group memberships automatically.

::: tip Enterprise feature
SCIM provisioning requires an **enterprise** license with the `scim` feature. It is not available on the team plan. Without the feature, all SCIM endpoints (except discovery) return 403.
:::

## Prerequisites

- A running SnapOtter instance reachable at a public URL
- An enterprise license key with the `scim` feature
- Admin access to SnapOtter (the `users:manage` permission is required to generate a SCIM token)
- Admin access to your identity provider's provisioning settings

## Quick start

1. Generate a SCIM bearer token:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

The response contains the token. Save it immediately; it cannot be retrieved again.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token -- it cannot be retrieved again"
}
```

2. In your identity provider, configure SCIM provisioning with:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authentication**: Bearer token (paste the token from step 1)

## Authentication

SCIM endpoints use a dedicated Bearer token, separate from user sessions and API keys.

### Generating a token

`POST /api/v1/enterprise/scim/token` generates a new SCIM token. This endpoint requires a valid session with the `users:manage` permission.

The token is returned in plaintext exactly once. SnapOtter stores only a scrypt hash. If you lose the token, revoke it and generate a new one.

Only one SCIM token is active at a time. Generating a new token replaces the previous one.

### Revoking a token

`DELETE /api/v1/enterprise/scim/token` revokes the current SCIM token. This endpoint also requires `users:manage`.

### Rate limiting

SCIM endpoints are rate-limited to 1000 requests per minute per token. Exceeding this limit returns HTTP 429.

## Supported resources

| SCIM resource | SnapOtter concept | Create | Read | Update | Delete |
|---|---|---|---|---|---|
| User | User account | Yes | Yes | Yes | Soft delete |
| Group | Team | Yes | Yes | Yes | Yes |

::: warning
SCIM Groups map to SnapOtter **teams**, not roles. SCIM cannot set a user's role. All users created via SCIM are assigned the `user` role. To change a user's role, use the SnapOtter admin UI.
:::

## User operations

### Create user

`POST /api/v1/scim/v2/Users`

Creates a new user account with `authProvider` set to `scim` and the `user` role. The user is assigned to the Default team. If `active` is `false`, the role is set to `disabled` instead.

Required attributes: `userName`. Optional: `externalId`, `emails`, `active` (default `true`).

### List and filter users

`GET /api/v1/scim/v2/Users`

Returns a paginated list of users. Supports `startIndex` and `count` query parameters (maximum 200 results per page).

Filtering supports `eq` (equals) only, on these attributes:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Other filter operators and attributes return HTTP 400.

### Get user

`GET /api/v1/scim/v2/Users/:id`

Returns a single user by their SnapOtter user ID.

### Replace user

`PUT /api/v1/scim/v2/Users/:id`

Replaces the user's attributes. Supports `userName`, `externalId`, `emails`, and `active`. Username changes are checked for conflicts (409 if the new username is taken by another user).

### Patch user

`PATCH /api/v1/scim/v2/Users/:id`

Partial update using SCIM PatchOp. Supported operations:

| Operation | Paths |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Same as `replace` |
| `remove` | `externalId`, `emails` |

The `name.formatted` and `displayName` paths are accepted for compatibility but have no persistent effect (SnapOtter does not store a separate display name).

Valueless `replace` operations (where the value is an object without a `path`) are also supported, with keys `userName`, `externalId`, `emails`, and `active`.

### Deactivate user (soft delete)

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter does not hard-delete users via SCIM. Instead, DELETE performs a soft deactivation:

1. The user's role is changed from its current value (e.g. `editor`) to `disabled:editor`, preserving the original role.
2. The user's password is cleared.
3. All active sessions are revoked.
4. All API keys are revoked.

The user can no longer log in or use any API keys. Their data (files, history) is retained.

### Reactivate user

To reactivate a previously deactivated user, send a `PUT` or `PATCH` request with `active: true`. SnapOtter restores the original role from before deactivation (e.g. `disabled:editor` becomes `editor` again). If the original role cannot be determined, it falls back to `user`.

::: details Example: deactivate and reactivate via PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Group operations

SCIM Groups map to SnapOtter teams. Creating a group creates a team. Group membership controls which team a user belongs to.

### Create group

`POST /api/v1/scim/v2/Groups`

Required: `displayName`. Optional: `members` (array of `{ value: userId }`).

### List and filter groups

`GET /api/v1/scim/v2/Groups`

Filtering supports `displayName eq "..."` only. Paginated with `startIndex` and `count` (maximum 200 results per page).

### Get group

`GET /api/v1/scim/v2/Groups/:id`

### Replace group

`PUT /api/v1/scim/v2/Groups/:id`

Replaces the group name and full membership list. Existing members not in the new list are moved to the Default team.

### Patch group

`PATCH /api/v1/scim/v2/Groups/:id`

Supports these operations:

| Operation | Path | Effect |
|---|---|---|
| `add` | `members` | Adds users to the team |
| `remove` | `members[value eq "userId"]` | Moves the user to the Default team |
| `replace` | `displayName` | Renames the team |
| `replace` | `members` | Replaces all members (removed members move to the Default team) |

### Delete group

`DELETE /api/v1/scim/v2/Groups/:id`

Deletes the team. All members of the deleted team are moved to the Default team. Users are not deactivated or deleted.

## IdP setup

### Okta

1. In the Okta admin console, open your SnapOtter application (or create one).
2. Go to the **Provisioning** tab and click **Configure API Integration**.
3. Check **Enable API Integration** and enter:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: The SCIM bearer token generated above
4. Click **Test API Credentials**, then **Save**.
5. Under **Provisioning > To App**, enable:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. Under **Push Groups**, configure which Okta groups to sync as SnapOtter teams.

### Azure AD / Entra ID

1. In the Azure portal, go to your SnapOtter enterprise application.
2. Go to **Provisioning** and set **Provisioning Mode** to **Automatic**.
3. Under **Admin Credentials**, enter:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: The SCIM bearer token generated above
4. Click **Test Connection**, then **Save**.
5. Under **Mappings**, configure the user and group attribute mappings. The defaults typically work, but verify that `userName` maps to `userPrincipalName` or `mail` as desired.
6. Set **Provisioning Status** to **On** and save.

Azure provisions users and groups on a fixed sync cycle (typically every 40 minutes).

## Discovery endpoints

These three endpoints are available without authentication and describe the SCIM server's capabilities:

| Endpoint | Description |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Server capabilities and supported features |
| `GET /api/v1/scim/v2/Schemas` | User and Group schema definitions |
| `GET /api/v1/scim/v2/ResourceTypes` | Available resource types (User, Group) |

The `ServiceProviderConfig` advertises these capabilities:

| Feature | Supported |
|---|---|
| Patch | Yes |
| Bulk | No |
| Filter | Yes (max 200 results, `eq` operator only) |
| Change password | No |
| Sort | No |
| ETag | No |

## Limitations

- **Filtering**: Only the `eq` operator is supported. Complex filters, `and`/`or` operators, `co` (contains), and `sw` (starts with) are not implemented.
- **Bulk operations**: Not supported.
- **Sort and ETag**: Not supported.
- **Roles**: SCIM cannot assign SnapOtter roles. All provisioned users get the `user` role.
- **MAX_USERS**: The `MAX_USERS` environment variable limit is not enforced on SCIM user creation. If you need to cap user counts, manage assignments in your IdP.
- **One token**: Only one SCIM token can be active at a time. If multiple IdPs need SCIM access, they must share the token.
- **Groups are teams**: SCIM Groups correspond to teams, not roles or permission groups.

## Troubleshooting

### 403 "SCIM provisioning requires an enterprise license with the scim feature"

Your license does not include the `scim` feature, or no license is configured. SCIM requires an enterprise plan license. Verify `SNAPOTTER_LICENSE_KEY` is set and the license includes the `scim` feature.

### 401 "Bearer token required"

The SCIM request did not include an `Authorization: Bearer <token>` header. Check your IdP's provisioning configuration.

### 401 "Invalid token"

The token does not match the stored hash. This happens if the token was revoked and regenerated. Update the token in your IdP's provisioning settings.

### 401 "SCIM not configured"

No SCIM token has been generated yet. Use the `POST /api/v1/enterprise/scim/token` endpoint to create one.

### 409 "User already exists" / "userName already taken"

A user with the same username already exists. This can happen when an IdP retries a failed create. Check for duplicate usernames in the SnapOtter admin panel.

### 429 "SCIM rate limit exceeded"

The IdP is sending more than 1000 requests per minute. This typically happens during a large initial sync. Most IdPs automatically retry after the rate limit window resets. If the problem persists, check your IdP's provisioning sync interval.

### Users deprovisioned but not removed from the UI

SCIM DELETE is a soft deactivation. Deactivated users still appear in the admin user list with a disabled status. This is by design so their data is preserved. Their role shows as `disabled:<original-role>`.
