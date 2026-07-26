---
description: "SnapOtter 的 PostgreSQL 資料庫結構、資料表、遷移，以及備份程序。"
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 867212c1ca88
i18n_hash_version: 2
---

# 資料庫 {#database}

SnapOtter 使用 PostgreSQL 17 搭配 [Drizzle ORM](https://orm.drizzle.team/)（pg-core／node-postgres）來持久化資料。結構定義於 `apps/api/src/db/schema.ts`。

連線透過 `DATABASE_URL` 環境變數設定（預設為 `postgres://snapotter:snapotter@postgres:5432/snapotter`）。在 Docker Compose 中，Postgres 容器把資料儲存在 `SnapOtter-pgdata` 具名磁碟區。

## 資料表 {#tables}

### users {#users}

儲存使用者帳號。首次執行時，會自動從 `DEFAULT_USERNAME` 與 `DEFAULT_PASSWORD` 建立。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `username` | varchar | 唯一、必填 |
| `passwordHash` | varchar | scrypt 雜湊 |
| `role` | varchar | `admin`、`editor` 或 `user` |
| `mustChangePassword` | boolean | 強制重設密碼旗標 |
| `createdAt` | timestamp | 建立時間 |
| `updatedAt` | timestamp | 最後更新時間 |

### sessions {#sessions}

有效的登入工作階段。每一列把一個工作階段權杖繫結到一位使用者。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | varchar | 主鍵（工作階段權杖） |
| `userId` | uuid | 指向 `users.id` 的外鍵 |
| `expiresAt` | timestamp | 到期時間 |
| `createdAt` | timestamp | 建立時間 |

### teams {#teams}

用於組織使用者的群組。管理員可以把使用者指派到團隊。

| 欄位 | 型別 | 描述 |
|--------|------|-------------|
| `id` | uuid | 主鍵 |
| `name` | varchar（唯一，最多 50 個字元） | 團隊名稱 |
| `createdAt` | timestamp | 建立時間 |

### api_keys {#api-keys}

供程式化存取使用的 API 金鑰。原始金鑰只在建立時顯示一次；僅儲存其雜湊值。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `userId` | uuid | 指向 `users.id` 的外鍵 |
| `keyHash` | varchar | 金鑰的 scrypt 雜湊 |
| `name` | varchar | 使用者提供的標籤 |
| `createdAt` | timestamp | 建立時間 |
| `lastUsedAt` | timestamp | 每次通過驗證的請求時更新 |

金鑰以 `si_` 為前綴，後接 96 個十六進位字元（48 個隨機位元組）。

### pipelines {#pipelines}

使用者在 UI 中建立的已儲存工具鏈。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `name` | varchar | 管線名稱 |
| `description` | varchar | 選填的描述 |
| `steps` | jsonb | `{ toolId, settings }` 物件的陣列 |
| `createdAt` | timestamp | 建立時間 |

### user_files {#user-files}

持久化檔案庫。預設情況下，已儲存的編輯會作為一個獨立的根列插入（「另存為新檔」：`version` 為 1、`parentId` 為 null，因此原始檔案仍會保留在清單中）；而當你覆寫原始檔案時，則作為一個與父列連結的版本（設定 `parentId`、遞增 `version`，並取代它）。`toolChain` 欄位會記錄所套用的工具。

| 欄位 | 型別 | 描述 |
|--------|------|-------------|
| `id` | uuid | 主鍵 |
| `userId` | uuid | 指向 users 的外鍵（CASCADE DELETE） |
| `originalName` | varchar | 原始上傳檔名 |
| `storedName` | varchar | 磁碟上的檔名 |
| `mimeType` | varchar | MIME 類型 |
| `size` | integer | 檔案大小（位元組） |
| `width` | integer | 影像寬度（px） |
| `height` | integer | 影像高度（px） |
| `version` | integer | 版本編號（1 = 原始） |
| `parentId` | uuid 或 null | 指向 user_files 的外鍵（父版本） |
| `toolChain` | jsonb | 依序套用以產生此版本的工具 ID |
| `createdAt` | timestamp | 建立時間 |

### jobs {#jobs}

追蹤處理工作，以進行進度回報與清理。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `type` | varchar | 工具或管線識別碼 |
| `status` | varchar | `queued`、`processing`、`completed` 或 `failed` |
| `progress` | real | 0.0-1.0 的比例 |
| `inputFiles` | jsonb | 輸入檔案路徑的陣列 |
| `outputPath` | varchar | 結果檔案的路徑 |
| `settings` | jsonb | 使用的工具設定 |
| `error` | varchar | 失敗時的錯誤訊息 |
| `createdAt` | timestamp | 建立時間 |
| `completedAt` | timestamp | 完成時間 |

### settings {#settings}

供管理員可從 UI 變更的伺服器層級設定的鍵值儲存區。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `key` | varchar | 主鍵 |
| `value` | varchar | 設定值 |
| `updatedAt` | timestamp | 最後更新時間 |

### roles {#roles}

具有細緻權限的自訂角色。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `name` | varchar | 唯一角色名稱 |
| `description` | varchar | 選填的描述 |
| `permissions` | jsonb | 權限字串的陣列 |
| `createdAt` | timestamp | 建立時間 |

### audit_log {#audit-log}

與安全性相關的動作記錄。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `userId` | uuid | 指向 users 的外鍵 |
| `action` | varchar | 動作類型 |
| `details` | jsonb | 動作特定的資料 |
| `createdAt` | timestamp | 動作時間 |

### user_preferences {#user-preferences}

依偏好設定名稱存放的個別使用者介面狀態。首頁的已釘選工具透過 `PUT /api/v1/preferences` 寫入此處。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `userId` | text | 指向 users 的外鍵，連帶刪除。與 `key` 共同構成主鍵 |
| `key` | text | 偏好設定名稱。與 `userId` 共同構成主鍵 |
| `value` | jsonb | 偏好設定內容 |
| `updatedAt` | timestamp | 最後寫入時間 |

## 遷移 {#migrations}

Drizzle 處理結構遷移。遷移檔案位於 `apps/api/drizzle/`。在開發期間：

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

在生產環境中，待處理的遷移會在啟動時自動套用。

## 備份與還原{#backup-and-restore}

關聯式資料庫位於 Postgres 容器的 `SnapOtter-pgdata` 卷中，而不是應用程式的 `/data` 卷中。

**帶有驗證的邏輯備份（建議）**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

此資料庫轉儲不包含以 `/data/files` 保存的庫物件或 Redis 中持久的 BullMQ 狀態。使用[安全性與強化](/zh-TW/guide/security#backup-and-recovery) 中的協調程序備份和還原這些內容。

**冷捲快照**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

不要使用 `tar` 複製即時 PostgreSQL 資料目錄。按項目編寫磁碟區名稱前綴，因此從 `docker inspect` 或您的儲存平台解析已安裝的磁碟區 ID，而不是假設文字標籤 `SnapOtter-pgdata`。

### 從 1.x（SQLite）遷移 {#migrating-from-1-x-sqlite}

從 SnapOtter 1.x 升級有其專屬指南：見[從 1.x 升級到 2.0](./upgrading)。簡而言之，重複使用你既有的 `/data` 磁碟區，2.0 會在首次開機時自動偵測並匯入 `/data/snapotter.db`（或設定 `SQLITE_MIGRATE_PATH` 明確指向它）。請先備份整個 `/data` 磁碟區，而不只是 `snapotter.db`：1.x 使用 SQLite 的 WAL 模式，所以一個已停止的容器往往會把它大部分的資料留在 `snapotter.db-wal` 中，旁邊只有一個幾乎空白的 `snapotter.db`。
