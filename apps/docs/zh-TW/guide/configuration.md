---
description: "所有 SnapOtter 環境變數及其預設值。設定驗證、儲存、AI 模型、分析等。"
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: e2ec72107c68
---

# 設定 {#configuration}

所有設定皆透過環境變數完成。每個變數都有合理的預設值，因此 SnapOtter 無需設定任何變數即可開箱即用。

## 環境變數 {#environment-variables}

### 伺服器 {#server}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PORT` | `1349` | 伺服器監聽的連接埠。 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每個 IP 每分鐘的最大請求數。設為 0 可停用速率限制。 |
| `CORS_ORIGIN` | （空） | CORS 允許來源的逗號分隔清單，留空則僅限同源。 |
| `LOG_LEVEL` | `info` | 日誌詳細程度。可為下列其中之一：`fatal`、`error`、`warn`、`info`、`debug`、`trace`。 |
| `TRUST_PROXY` | `true` | 信任來自反向代理的 `X-Forwarded-For` 標頭。若不在代理後方，請設為 `false`。 |

### 驗證 {#authentication}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `AUTH_ENABLED` | `false` | 設為 `true` 以要求登入。Docker 映像檔預設為 `true`。 |
| `DEFAULT_USERNAME` | `admin` | 初始 admin 帳號的使用者名稱。僅於首次執行時使用。 |
| `DEFAULT_PASSWORD` | `admin` | 初始 admin 帳號的密碼。請於首次登入後變更。 |
| `MAX_USERS` | `0`（無上限） | 註冊使用者帳號的最大數量。設為 0 為無上限。 |
| `SESSION_DURATION_HOURS` | `168` | 登入工作階段的存活時間（小時）（預設為 7 天）。 |
| `SKIP_MUST_CHANGE_PASSWORD` | - | 設為任何非空值即可略過首次登入時強制變更密碼的提示 |

### 儲存 {#storage}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` 或 `s3`。S3/MinIO 需要具備 s3_storage 功能的授權。 |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | PostgreSQL 連線字串。 |
| `REDIS_URL` | `redis://redis:6379` | Redis 連線字串（用於 BullMQ 工作佇列）。 |
| `WORKSPACE_PATH` | `./tmp/workspace` | 處理期間暫存檔案的目錄。會自動清理。 |
| `FILES_STORAGE_PATH` | `./data/files` | 持久化使用者檔案（已上傳影像、已儲存結果）的目錄。 |

### 內嵌模式 {#embedded-mode}

以未設定 `DATABASE_URL` 與 `REDIS_URL` 的方式執行映像檔，它會在容器內啟動自己的 PostgreSQL 17 與 Redis，繫結至 loopback，所有資料位於 `/data` 磁碟區。這重現了單一指令的 `docker run` 體驗，適用於快速上手、homelab 與從 1.x 升級。這是一條便利路徑，而非正式環境部署：正式環境請執行具獨立 PostgreSQL 與 Redis 的 3 容器 Compose 堆疊。內嵌模式需要以 root 執行容器，且與任意 UID 的執行環境（OpenShift、Kubernetes `runAsNonRoot`）不相容；在那些環境請使用 Compose。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `EMBEDDED` | `auto` | 當 `DATABASE_URL` 與 `REDIS_URL` 皆未設定時自動啟用。設為 `0` 可停用它（此時若未設定外部 `DATABASE_URL`/`REDIS_URL`，app 會快速失敗，而非默默啟動容器內資料庫）。 |
| `REDIS_MAXMEMORY` | `512mb` | 內嵌 Redis 的記憶體上限（僅限內嵌模式）。在記憶體受限的主機（例如 Raspberry Pi）上請調低它。 |

從 1.x 升級：將你的舊 `snapotter.db` 放在磁碟區中的 `/data/snapotter.db`，內嵌模式會在首次啟動時將它匯入內嵌的 PostgreSQL。匯入僅執行一次；後續啟動會略過。

遙測注意事項：內嵌模式與其他任何設定一樣，會繼承映像檔的分析預設值。已發布的映像檔預設開啟分析；以 `--build-arg SNAPOTTER_ANALYTICS=off` 建置，或使用 app 內的管理員退出選項，即可停用它。

### 處理限制 {#processing-limits}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | 每次上傳的最大檔案大小（MB）。設為 0 為無上限。 |
| `MAX_BATCH_SIZE` | `100` | 單一批次請求中的最大檔案數。設為 0 為無上限。 |
| `CONCURRENT_JOBS` | `0`（自動） | 平行執行的批次工作數。設為 0 可根據可用 CPU 核心自動偵測。 |
| `MAX_MEGAPIXELS` | `0`（無上限） | 允許的最大影像解析度（百萬像素）。設為 0 為無上限。 |
| `MAX_WORKER_THREADS` | `0`（自動） | 影像處理的最大工作執行緒。設為 0 可根據可用 CPU 核心自動偵測。 |
| `PROCESSING_TIMEOUT_S` | `0`（無限制） | 每個請求的最大處理時間（秒）。設為 0 為無逾時。 |
| `MAX_PIPELINE_STEPS` | `20` | 管線中的最大步驟數。設為 0 為無限制。 |
| `MAX_CANVAS_PIXELS` | `0`（無限制） | 輸出影像的最大畫布尺寸（像素）。設為 0 為無限制。 |
| `MAX_SVG_SIZE_MB` | `0`（無上限） | 最大 SVG 檔案大小（MB）。設為 0 為無上限。 |
| `MAX_SPLIT_GRID` | `100` | 影像分割工具的最大格線維度。 |
| `MAX_PDF_PAGES` | `0`（無上限） | PDF 轉影像時的最大 PDF 頁數。設為 0 為無上限。 |

### 清理 {#cleanup}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 未儲存的處理結果（原始上傳與工具輸出）在自動刪除前保留多久。你明確儲存至 Files 資料庫的檔案不受影響，會保留至你刪除它們為止。 |
| `CLEANUP_INTERVAL_MINUTES` | `60` | 清理工作的執行頻率。 |

### 外觀 {#appearance}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 新工作階段的預設主題。`light` 或 `dark`。 |
| `DEFAULT_LOCALE` | `en` | 預設介面語言。 |
| `DEFAULT_TOOL_VIEW` | `sidebar` | 預設工具版面。`sidebar` 或 `fullscreen`。 |

### Docker 權限 {#docker-permissions}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PUID` | `999` | 以此 UID 執行容器程序。設為與你的主機使用者相符以供 bind mount 使用（`id -u`）。 |
| `PGID` | `999` | 以此 GID 執行容器程序。設為與你的主機群組相符以供 bind mount 使用（`id -g`）。 |

## Docker 範例 {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## 磁碟區 {#volumes}

Docker Compose 堆疊使用四個磁碟區：

- `/data`（app）- AI 模型、Python venv 與使用者檔案。掛載此磁碟區以在重新啟動後保留已上傳的檔案與已安裝的 AI 套件包。
- `/tmp/workspace`（app）- 處理中檔案的暫存空間。這可以是暫時性的，但掛載它可避免填滿容器的可寫入層。
- `SnapOtter-pgdata`（postgres）- PostgreSQL 資料目錄。這保存所有關聯式資料（使用者、設定、管線、工作、稽核日誌）。透過 `pg_dump` 或磁碟區快照備份。
- `SnapOtter-redisdata`（redis）- 用於持久化工作佇列的 Redis append-only 檔案。
