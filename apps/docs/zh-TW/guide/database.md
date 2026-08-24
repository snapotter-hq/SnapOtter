---
description: "SnapOtter 的 PostgreSQL 資料庫結構、資料表、遷移，以及備份程序。"
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 867212c1ca88
i18n_hash_version: 2
---

# 資料庫 {#database}

SnapOtter 使用 PostgreSQL 17 搭配 [Drizzle ORM](https://orm.drizzle.team/)（pg-core／node-postgres）來持久化資料。結構定義於 `apps/api/src/db/schema.ts`。

連線透過 `DATABASE_URL` 環境變數設定（預設為 `postgres://snapotter:snapotter@postgres:5432/snapotter`）。在 Docker Compose 中，Postgres 容器把資料儲存在 `SnapOtter-pgdata` 具名磁碟區。 請求由一個只能讀寫資料列的角色提供服務，詳見下方的[最小權限角色](#least-privilege-roles)。

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

## 最小權限角色 {#least-privilege-roles}

兩個角色，兩種職責。`DATABASE_URL` 負責提供請求服務，對應用程式的資料表持有 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 權限，以及對其序列的 `USAGE` 與 `SELECT` 權限。清單就只有這些。它無法建立或刪除資料表、安裝擴充功能、執行 `TRUNCATE`、讀取 `pg_authid`、建立資料庫、變更角色，也無法碰觸存放遷移歷史的 `drizzle` 結構描述。

`DATABASE_MIGRATION_URL` 才是具特權的那一個。它會在開機期間執行遷移，並把權限授予執行階段角色，然後在任何一個請求被服務之前就關閉連線。

Compose 與一體式映像檔已經是這樣接線的，既有的安裝也包含在內。開機時，SnapOtter 會在執行階段角色不存在時建立它、授予權限、執行遷移，接著把授權補到先前就已存在的資料表上。升級不需要手動執行任何 SQL。

把 `DATABASE_MIGRATION_URL` 留空則會以單一角色模式執行，由 `DATABASE_URL` 同時擔起兩種職責，和拆分之前完全一樣。這是受支援的設定，不是被淘汰的設定。在受管理的 Postgres 上，這才是正確答案，因為建立角色往往輪不到你來做。

### 外部與受管理的 Postgres {#external-and-managed-postgres}

在 RDS、Supabase、Cloud SQL，或任何你自行維運的叢集上，這種拆分屬於選用。先建立一次執行階段角色：

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

接著把兩組連線字串都交給 SnapOtter，並指向同一個主機、連接埠與資料庫：

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

到此為止。SnapOtter 會自行套用授權，並在每次遷移之後重新套用，因此未來版本新增的資料表也會被涵蓋，不需要任何人為它執行 SQL。

`DATABASE_MIGRATION_URL` 中的角色必須擁有 SnapOtter 的資料表，因為只有資料表的擁有者才能對它授權。在既有的安裝上，這代表你一直用來執行 SnapOtter 的那個角色，而不是為此新建的角色。若把它指向一個什麼都不擁有的新角色，開機就會失敗，並回報正是這個原因的錯誤。它同時需要 `CREATEROLE` 才能建立與維護執行階段角色，也需要建立 `drizzle` 結構描述的權限。

如果兩個 URL 指定同一個角色，拆分就會關閉，而 SnapOtter 會在記錄中明講，不會假裝沒事。如果你的供應商沒有任何角色能同時擁有資料表並持有 `CREATEROLE`，就以單一角色模式執行。

### 為什麼不去動超級使用者旗標 {#why-the-superuser-bit-is-left-alone}

SnapOtter 絕不會自行從角色上移除 `SUPERUSER`。在拆分之前建立的安裝上，`snapotter` 是叢集唯一的超級使用者，把它降級會讓叢集一個超級使用者都不剩，只能停掉伺服器、透過單一使用者模式才救得回來。改把長期連線移到受限角色上，才是換來保護的做法。超級使用者只在開機那幾秒出現在連線上，之後就消失了。

全新的一體式安裝從來沒有這個問題。它們會拿到三個角色：`postgres`（啟動用的超級使用者，不出現在 SnapOtter 使用的任何連線字串中）、`snapotter`（`NOSUPERUSER`，擁有資料，只在開機時連線），以及 `snapotter_app`（只碰資料列，負責提供請求服務）。

若仍要把較舊的 `snapotter` 降級，請先建立第二個超級使用者，並以它登入確認可用。接著執行 `ALTER ROLE snapotter NOSUPERUSER`。

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

這兩個指令都以擁有者 `snapotter` 的身分連線，也應該繼續這樣做。執行階段角色看不到 `drizzle` 結構描述，因此以該角色取得的轉儲會不完整。`--no-owner` 會讓還原出來的物件歸執行還原的人所有，所以由擁有者來執行，才能讓所有權落在授權所預期的位置。在全新叢集上有一點要注意：`pg_dump` 會帶走授權，卻不會帶走授權所指名的角色，所以請在還原之前先建立 `snapotter_app`，否則 `--exit-on-error` 會在第一個 `GRANT` 就停下來。無論如何，SnapOtter 都會在下次開機時重新套用授權。

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
