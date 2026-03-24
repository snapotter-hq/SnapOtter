# Files Page — Design Spec

## Overview

A persistent file manager for Stirling Image, modeled after Stirling-PDF's Files tab. Users can upload images, browse recent files, view file details with image metadata, and re-open files for further processing. Files processed through any tool automatically save the result as a new version, building a version chain (V1 → V2 → V3...) with tool attribution.

### Scope

- **In scope:** Recent files view, file upload, file details panel, version tracking, search, bulk select/delete/download, "Open File" navigation
- **Out of scope:** Google Drive integration (placeholder shown as "Coming Soon"), file sharing, folder organization

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Persistence | Server-persisted with SQLite metadata + disk storage | Survives restarts, enables version history |
| Version tracking | Auto-save on tool processing | Matches Stirling-PDF; makes Files page useful |
| "Open File" behavior | Navigate to home page with file pre-loaded | Most flexible — user can pick any tool |
| Auth | Required when auth is enabled; works without auth in single-user mode | Files are per-user when auth is on, shared when off |

---

## 1. Database Schema

New table `user_files` in the existing SQLite database:

```sql
CREATE TABLE user_files (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT,                           -- FK to users.id (nullable for no-auth mode)
  original_name TEXT NOT NULL,            -- Original filename as uploaded
  stored_name TEXT NOT NULL,              -- UUID-based name on disk
  mime_type TEXT NOT NULL,                -- e.g. "image/jpeg"
  size INTEGER NOT NULL,                  -- File size in bytes
  width INTEGER,                          -- Image width in px
  height INTEGER,                         -- Image height in px
  version INTEGER NOT NULL DEFAULT 1,     -- Version number
  parent_id TEXT,                         -- FK to user_files.id (previous version)
  tool_chain TEXT,                        -- JSON array of tool IDs applied, e.g. ["resize", "compress"]
  created_at INTEGER NOT NULL,            -- Unix timestamp (ms)
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_id) REFERENCES user_files(id)
);

CREATE INDEX idx_user_files_user_id ON user_files(user_id);
CREATE INDEX idx_user_files_created_at ON user_files(created_at);
CREATE INDEX idx_user_files_parent_id ON user_files(parent_id);
```

### Drizzle ORM Definition

```typescript
export const userFiles = sqliteTable("user_files", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  version: integer("version").notNull().default(1),
  parentId: text("parent_id"),
  toolChain: text("tool_chain"),  // JSON string: ["resize", "compress"]
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

---

## 2. File Storage

- **Storage directory:** `{DATA_DIR}/files/` (configurable via `FILES_STORAGE_PATH` env var, default: `/data/files/`)
- **File naming:** `{uuid}.{ext}` — avoids collisions, the original name is in the DB
- **No subdirectories per user** — a flat directory with UUID names is simpler and avoids path traversal issues
- **Cleanup:** Files deleted from the DB also have their disk file removed. No cron needed — deletion is explicit.

---

## 3. API Routes

All routes prefixed with `/api/v1/files`. Auth required when auth is enabled.

### 3.1 List Files (Recent)

```
GET /api/v1/files?search=&limit=50&offset=0
```

Returns the latest version of each file group (grouped by root parent), sorted by `created_at` DESC.

**Response:**
```json
{
  "files": [
    {
      "id": "uuid",
      "originalName": "beach_sunset.jpg",
      "mimeType": "image/jpeg",
      "size": 2400000,
      "width": 1920,
      "height": 1080,
      "version": 3,
      "toolChain": ["resize", "compress"],
      "createdAt": "2026-03-24T21:15:00Z"
    }
  ],
  "total": 42
}
```

### 3.2 Upload Files

```
POST /api/v1/files/upload
Content-Type: multipart/form-data
Body: file (one or more image files)
```

Validates each file (magic bytes, supported format), extracts dimensions via Sharp, stores to disk, creates DB record with version=1.

**Response:**
```json
{
  "files": [
    { "id": "uuid", "originalName": "photo.jpg", "size": 2400000, "version": 1 }
  ]
}
```

### 3.3 Get File Details

```
GET /api/v1/files/:id
```

Returns full metadata for a single file, including all versions in the chain.

**Response:**
```json
{
  "id": "uuid",
  "originalName": "beach_sunset.jpg",
  "mimeType": "image/jpeg",
  "size": 2400000,
  "width": 1920,
  "height": 1080,
  "version": 3,
  "toolChain": ["resize", "compress"],
  "createdAt": "2026-03-24T21:15:00Z",
  "versions": [
    { "id": "uuid-v1", "version": 1, "size": 5000000, "toolChain": [], "createdAt": "..." },
    { "id": "uuid-v2", "version": 2, "size": 3000000, "toolChain": ["resize"], "createdAt": "..." },
    { "id": "uuid-v3", "version": 3, "size": 2400000, "toolChain": ["resize", "compress"], "createdAt": "..." }
  ]
}
```

### 3.4 Download File

```
GET /api/v1/files/:id/download
```

Streams the file from disk with `Content-Disposition: attachment`.

### 3.5 Get File Thumbnail

```
GET /api/v1/files/:id/thumbnail
```

Returns a 300px-wide JPEG thumbnail (generated on-the-fly via Sharp, can be cached later).

### 3.6 Delete Files

```
DELETE /api/v1/files
Body: { "ids": ["uuid1", "uuid2"] }
```

Deletes specified files from DB and disk. When deleting a file that has child versions, deletes the entire chain.

### 3.7 Save Tool Result (internal — called by tool-factory)

```
POST /api/v1/files/save-result
Body: { parentId?: string, toolId: string, buffer: <binary>, filename: string }
```

This is an internal route called by the tool processing pipeline. It:
1. Looks up the parent file (if parentId provided)
2. Computes the new version number (parent.version + 1)
3. Builds the tool chain (parent.toolChain + [toolId])
4. Stores the file to disk
5. Creates the DB record
6. Returns the new file record

---

## 4. Tool Processing Integration

The tool-factory needs a small addition: after successfully processing a file, if the input file came from the Files store (identified by a `fileId` parameter in the request), save the result as a new version.

**Flow:**
1. User clicks "Open File" on Files page → navigates to home with file loaded
2. The file-store entry carries a `fileId` (the user_files.id from the server)
3. User picks a tool, adjusts settings, clicks Process
4. Tool processes the file as normal
5. After success, the response includes the new `fileId` of the saved version
6. The file-store entry updates its `fileId` to the new version

**Changes to tool-factory.ts:**
- Accept optional `fileId` field in multipart body
- After processing, call the save-result logic internally (not an HTTP call — direct function call)
- Return `fileId` in the response alongside existing `jobId` and `downloadUrl`

---

## 5. Frontend

### 5.1 New Files Page (`apps/web/src/pages/files-page.tsx`)

Three-panel layout inside `AppLayout`:

- **Left panel (180px):** "My Files" heading, nav items (Recent, Upload Files, Google Drive disabled)
- **Center panel (flex):** Search bar, toolbar (select all, delete, download), scrollable file list
- **Right panel (240px):** Thumbnail preview, File Details card, "Open File" button. Hidden when no file selected.

### 5.2 Components

```
apps/web/src/components/files/
├── files-nav.tsx          # Left nav (Recent, Upload, Drive placeholder)
├── file-list.tsx          # Center: search + toolbar + file rows
├── file-list-item.tsx     # Single file row (checkbox, name, size, date, version, tools)
├── file-details.tsx       # Right panel (thumbnail, metadata, Open File)
├── file-upload-area.tsx   # Dropzone for the Upload Files tab
```

### 5.3 Files Store (`apps/web/src/stores/files-page-store.ts`)

Separate Zustand store for the Files page (distinct from the existing `file-store.ts` which manages tool processing state):

```typescript
interface FilesPageState {
  // Data
  files: UserFile[];
  selectedFileId: string | null;
  selectedFileIds: Set<string>;  // for bulk operations
  total: number;

  // UI state
  activeTab: "recent" | "upload";
  searchQuery: string;
  loading: boolean;

  // Actions
  fetchFiles: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  deleteFiles: (ids: string[]) => Promise<void>;
  selectFile: (id: string) => void;
  toggleFileSelection: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  setSearchQuery: (query: string) => void;
  setActiveTab: (tab: "recent" | "upload") => void;
}
```

### 5.4 "Open File" Flow

When user clicks "Open File":
1. Fetch the file blob from `GET /api/v1/files/:id/download`
2. Create a `File` object from the blob
3. Add it to the existing `file-store` with the `fileId` attached
4. Navigate to `/` (home page)
5. Home page sees the file in the store and shows the tool selection + preview

### 5.5 Routing

Add to `App.tsx`:
```typescript
<Route path="/files" element={<FilesPage />} />
```

Re-add Files to sidebar and mobile nav (reverting the earlier removal).

### 5.6 Mobile Layout

On mobile, the three-panel layout collapses:
- Left nav becomes tabs at the top (Recent | Upload)
- File list takes full width
- File details shows as a bottom sheet when a file is tapped
- "Open File" button is prominent in the bottom sheet

---

## 6. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FILES_STORAGE_PATH` | `/data/files` | Directory for persistent file storage |
| `MAX_STORED_FILES` | `500` | Maximum files per user (0 = unlimited) |

---

## 7. Error Handling

- **Upload validation:** Same as existing file validation (magic bytes, format, size limit)
- **Storage full:** Return 507 if disk write fails
- **File not found:** Return 404 if file ID doesn't exist or belongs to another user
- **Auth:** Return 401 if auth is enabled and user is not authenticated
