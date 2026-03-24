# Settings Phase 1 — Admin Control Panel

Inspired by Stirling-PDF's settings system, this phase adds five features to the existing settings dialog to make Stirling-Image feel like a serious self-hosted product.

## Decisions

- Extend existing settings dialog (no separate admin panel route)
- Teams are organizational labels only — no per-team permissions
- Tool disabling and feature flags require server restart
- Temp file management is minimal (max age + startup cleanup)
- Custom branding is app name + logo (no favicon, no custom theme colors)

## 1. Teams Management

**New "Teams" tab in settings dialog.**

Simple CRUD for teams. Users are assigned to teams from the existing People section.

### Database

New `teams` table:

| Column | Type | Notes |
|---|---|---|
| id | text | Primary key (UUID) |
| name | text | Unique, not null |
| createdAt | integer (timestamp) | Auto-set |

Migration steps (single Drizzle migration file):
1. Create `teams` table
2. Insert a "Default" team with a known UUID
3. Collect all distinct `users.team` string values; for each non-"Default" value, insert a new team row
4. Update `users.team` from the string value to the corresponding team UUID
5. Keep `users.team` as a plain `text` column (no DB-level FK — SQLite doesn't support adding FK constraints via ALTER TABLE). Enforce the relationship at the application level.

Note: The existing `0003_add_team_to_users.sql` migration added the `team` column as free text. This new migration extends that by creating the `teams` table and converting values.

### Team Name Validation

- 1-50 characters
- Trimmed (no leading/trailing whitespace)
- Unique (case-insensitive)
- The "Default" team cannot be deleted (it's the fallback for new users)

### API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/v1/teams | auth | List all teams with member count |
| POST | /api/v1/teams | admin | Create team (body: `{ name }`) |
| PUT | /api/v1/teams/:id | admin | Rename team (body: `{ name }`) |
| DELETE | /api/v1/teams/:id | admin | Delete team (fails if team has members or is "Default") |

### UI

- Table with columns: Team Name, Total Members, actions (three-dot menu: Rename, Delete)
- "+ Create New Team" button
- Delete blocked with message if team has assigned members or is the Default team
- People section's team assignment dropdown pulls from teams table

## 2. Tool Disabling

**New "Tools" tab in settings dialog.**

Admin can globally disable specific tools. Disabled tools are hidden from all users.

### Settings Key

`disabledTools` — JSON array of tool IDs. Default: `"[]"`

### Behavior

- On save, shows "Restart required for changes to take effect" banner
- On API startup, server reads `disabledTools` and skips registering those tool routes (server-side enforcement)
- Frontend also filters disabled tools from the tool panel for immediate visual feedback after save, but API routes remain active until restart
- Pipelines containing disabled tools: step renders but shows "tool unavailable" badge

### UI

- Searchable list of all registered tools
- Each tool has a toggle (on = enabled, off = disabled)
- Search/filter bar at top
- Tools grouped by category for easier scanning
- "Restart required" banner appears after any change is saved

## 3. Feature Flags

**Added to existing "System Settings" section.**

Single toggle controlling visibility of experimental tools.

### Settings Key

`enableExperimentalTools` — `"true"` or `"false"`. Default: `"false"`

### Tool Registry Change

Reuse the existing `alpha?: boolean` field on the `Tool` type in `packages/shared/src/types.ts`. Rename it to `experimental?: boolean` for clarity (update all references). Tools marked experimental are hidden unless the flag is enabled.

### Behavior

- Works independently of tool disabling (a tool can be both experimental AND manually disabled)
- On save, shows "Restart required" banner
- When flag is off, experimental tools are excluded from: tool panel, fullscreen grid, pipeline step picker

### UI

- Single toggle row in System Settings: "Enable Experimental Tools" with description "Show tools that are still in development. These may be unstable."

## 4. Temp File Management

**Added to existing "System Settings" section under "File Management" sub-heading.**

Admin controls how long processed files persist and whether to clean on startup.

### Settings Keys

| Key | Default | Description |
|---|---|---|
| tempFileMaxAgeHours | "24" | Hours before temp files are eligible for cleanup |
| startupCleanup | "true" | Whether to run cleanup on server boot |

### Behavior

- The cleanup function re-reads `tempFileMaxAgeHours` from the settings DB on every cycle (not cached at startup). If the setting is not set, falls back to the `FILE_MAX_AGE_HOURS` env var (default 24). DB setting takes precedence over env var.
- On startup, if `startupCleanup` is true, cleanup runs asynchronously (does not block server startup — matches current behavior where `startCleanupCron()` is non-blocking)
- Changes take effect on next cleanup cycle (no restart required)

### UI

- Number input: "Max File Age (hours)" with description "How long processed files are kept before automatic cleanup"
- Toggle: "Startup Cleanup" with description "Clean up old temporary files when the server starts"

## 5. Custom Branding — Logo Upload

**Added to existing "System Settings" section, below App Name.**

Admin uploads a custom logo displayed in the sidebar/navbar.

### API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/v1/settings/logo | admin | Upload logo (PNG/SVG/JPEG, max 500KB) |
| GET | /api/v1/settings/logo | public | Serve custom logo (404 if none) |
| DELETE | /api/v1/settings/logo | admin | Remove custom logo |

### Settings Key

`customLogo` — `"true"` or `"false"`. Default: `"false"`

### Behavior

- All uploaded logos are converted to PNG and stored to `data/branding/logo.png` (SVGs are rasterized, JPEGs are re-encoded)
- Server resizes to max 128x128 via Sharp on upload
- `GET /api/v1/settings/logo` serves with `Content-Type: image/png`. This route must be added to `PUBLIC_PATHS` in `auth.ts` so the logo is accessible on the login page.
- Sidebar/navbar checks `customLogo` on mount — if true, loads from logo endpoint; otherwise uses built-in SVG
- No restart required — logo change is immediate

### UI

- Logo upload area with drag-and-drop, preview thumbnail
- "Remove" button to revert to default logo
- Accepts PNG, SVG, JPEG. Max 500KB.
- Shows current logo preview if one is set

## 6. Settings Dialog Navigation

### Current Sections
General, System Settings, Security, People, API Keys, About

### New Sections
General, System Settings, Security, People, **Teams**, API Keys, **Tools**, About

### Section Contents

| Section | What's new |
|---|---|
| System Settings | Feature flags toggle, temp file management controls, logo upload area (all added to existing section) |
| Teams | Entirely new — team CRUD table |
| Tools | Entirely new — tool enable/disable list |

### Frontend Type Changes

- Add `"teams" | "tools"` to the `Section` type union in `settings-dialog.tsx`
- Add corresponding entries to `NAV_ITEMS` array

### i18n

Add translation keys to `packages/shared/src/i18n/en.ts` under `settings` for the new sections (teams, tools) and their UI strings.

## Summary

| Feature | UI Location | New DB/API | Restart Required |
|---|---|---|---|
| Teams CRUD | New "Teams" tab | `teams` table, 4 CRUD routes | No |
| Tool disabling | New "Tools" tab | `disabledTools` setting key | Yes |
| Feature flags | System Settings | `enableExperimentalTools` setting key | Yes |
| Temp file management | System Settings | 2 setting keys | No |
| Logo upload | System Settings | 3 routes, `customLogo` key, `data/branding/` | No |
