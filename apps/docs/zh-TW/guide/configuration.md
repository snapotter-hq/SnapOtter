---
description: "所有 SnapOtter 環境變數及其預設值。設定驗證、儲存、AI 模型、分析等。"
i18n_source_hash: a694a81ef7e0
i18n_provenance: human
i18n_output_hash: ebd5b8275d42
i18n_hash_version: 2
---

# 設定 {#configuration}

所有設定皆透過環境變數完成。每個變數都有合理的預設值，因此 SnapOtter 無需設定任何變數即可開箱即用。

## 環境變數 {#environment-variables}

### 伺服器 {#server}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PORT` | `1349` | 伺服器監聽的連接埠。 |
| `BASE_PATH` | （空） | 公開部署路徑，例如 `/snapotter`。留空或設為 `/` 時會提供在網域根目錄。於執行階段套用，不需重新建置映像檔。 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每個 IP 每分鐘的最大請求數。設為 0 可停用速率限制。 |
| `CORS_ORIGIN` | （空） | CORS 允許來源的逗號分隔清單，留空則僅限同源。 |
| `LOG_LEVEL` | `info` | 日誌詳細程度。可為下列其中之一：`fatal`、`error`、`warn`、`info`、`debug`、`trace`。 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | 允許哪些對端透過 `X-Forwarded-For` 設定用戶端 IP。預設值只相信來自私有網路的對端，因此 Docker 網路或區域網路中的反向代理會被信任，而公開用戶端偽造的標頭則不會。只有當你自己掌控的代理以公開位址位於前方時，才設為 `true`。 |

### 驗證 {#authentication}

下方兩個布林值只接受 `true` 與 `false`。其他任何值，例如 `1`、`yes` 或 `on`，都會驗證失敗，伺服器會在開始監聽之前結束。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 要求登入。設為 `false` 可在完全沒有帳號的情況下執行，此時每個請求都具有 admin 權限，因此請僅限於可信任的網路。 |
| `DEFAULT_USERNAME` | `admin` | 初始 admin 帳號的使用者名稱。僅於首次執行時使用。 |
| `DEFAULT_PASSWORD` | `admin` | 初始 admin 帳號的密碼。請於首次登入後變更。 |
| `MAX_USERS` | `0`（無上限） | 註冊使用者帳號的最大數量。設為 0 為無上限。 |
| `SESSION_DURATION_HOURS` | `168` | 登入工作階段的存活時間（小時）（預設為 7 天）。 |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | 設為 `true` 可略過首次登入時強制變更密碼的提示。 |

### 儲存 {#storage}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` 或 `s3`。S3 與 MinIO 需要具備 s3_storage 功能的授權，以及下方的 `S3_*` 變數。 |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL 連線字串，也是每個請求提供服務時所用的連線。在 2.3.0 及以上版本，請一併設定 `DATABASE_MIGRATION_URL`，此連線就會成為最低權限的執行階段角色，僅持有應用程式資料表的 DML 權限，其他皆無。Compose 堆疊會將它指向自己的 `postgres` 服務；將它（連同 `REDIS_URL`）留空即可使用內嵌模式。 |
| `DATABASE_MIGRATION_URL` | （空） | 自 2.3.0 起提供；2.2.0 映像檔會忽略它，並需要以 `DATABASE_URL` 指名資料庫擁有者。具特殊權限的連線，僅在開機時用來執行遷移並授予執行階段角色，隨後在第一個請求之前關閉。留空時 SnapOtter 以單一角色執行，由 `DATABASE_URL` 同時負責這兩項工作。參見[最低權限角色](/zh-TW/guide/database#least-privilege-roles)。 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 連線字串（用於 BullMQ 工作佇列）。Compose 會將它指向自己的 `redis` 服務。 |
| `WORKSPACE_PATH` | `./tmp/workspace` | 處理期間暫存檔案的目錄。會自動清理。映像檔會設為 `/tmp/workspace`。 |
| `FILES_STORAGE_PATH` | `./data/files` | 持久化使用者檔案（已上傳影像、已儲存結果）的目錄。映像檔會設為 `/data/files`。 |

### S3 物件儲存 {#s3-object-storage}

僅在 `STORAGE_MODE=s3` 時才會讀取。三個必填項只要漏掉任何一個，啟動就會失敗，並指出你漏掉的變數名稱。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `S3_BUCKET` | （空） | 存放上傳檔案與輸出的儲存桶。必填。 |
| `S3_ACCESS_KEY_ID` | （空） | 存取金鑰。必填。在容器中也可以改用 `S3_ACCESS_KEY_ID_FILE` 掛載它。 |
| `S3_SECRET_ACCESS_KEY` | （空） | 祕密金鑰。必填。同樣的檔案慣例：`S3_SECRET_ACCESS_KEY_FILE`。 |
| `S3_REGION` | `us-east-1` | 儲存桶所在區域。 |
| `S3_ENDPOINT` | （空） | 供 MinIO、R2、Backblaze 及其他 S3 相容儲存使用的自訂端點。留空表示 AWS。 |
| `S3_FORCE_PATH_STYLE` | `false` | 對 MinIO 以及其他需要 `endpoint/bucket/key` 而非虛擬主機定址的儲存，請設為 `true`。 |
| `S3_PREFIX` | （空） | 金鑰前綴，可讓一個儲存桶容納多個執行個體。 |

### 靜態資料加密 {#encryption-at-rest}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | （空） | 64 個十六進位字元（32 位元組）。用來加密資料庫中儲存的機敏設定。不是 64 個十六進位字元的值會在啟動時被拒絕。 |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | （空） | 你正在輪替掉的舊金鑰，格式相同。輪替期間請同時設定兩者，讓既有資料列仍可解密，之後再移除這一個。 |

### 內嵌模式 {#embedded-mode}

以未設定 `DATABASE_URL` 與 `REDIS_URL` 的方式執行映像檔，它會在容器內啟動自己的 PostgreSQL 17 與 Redis，繫結至 loopback，所有資料位於 `/data` 磁碟區。這重現了單一指令的 `docker run` 體驗，適用於快速上手、homelab 與從 1.x 升級。這是一條便利路徑，而非正式環境部署：正式環境請執行具獨立 PostgreSQL 與 Redis 的 3 容器 Compose 堆疊。內嵌模式需要以 root 執行容器，且與任意 UID 的執行環境（OpenShift、Kubernetes `runAsNonRoot`）不相容；在那些環境請使用 Compose。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `EMBEDDED` | `auto` | 當 `DATABASE_URL` 與 `REDIS_URL` 皆未設定時自動啟用。設為 `0` 可停用它（此時若未設定外部 `DATABASE_URL`/`REDIS_URL`，app 會快速失敗，而非默默啟動容器內資料庫）。 |
| `REDIS_MAXMEMORY` | `512mb` | 內嵌 Redis 的記憶體上限（僅限內嵌模式）。在記憶體受限的主機（例如 Raspberry Pi）上請調低它。 |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | 開機時等待內嵌 Redis 回應 `PING` 的秒數，逾時即放棄。逾時時容器會停止並記錄原因，而不是卡住。可設 1 到 999999 的整數秒；沒有無上限值，因為這項上限存在的目的正是避免無止境地等待。只有在慢速主機觸發此問題時才調高。 |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | 同上，但針對內嵌 PostgreSQL。計時從首次開機的 `initdb` 完成後開始，因此涵蓋的是伺服器啟動與當機復原，而非初始資料庫建立。 |

從 1.x 升級：將你的舊 `snapotter.db` 放在磁碟區中的 `/data/snapotter.db`，內嵌模式會在首次啟動時將它匯入內嵌的 PostgreSQL。匯入僅執行一次；後續啟動會略過。

遙測注意事項：內嵌模式與其他任何設定一樣，會繼承映像檔的分析預設值。已發布的映像檔預設開啟分析；以 `--build-arg SNAPOTTER_ANALYTICS=off` 建置，或使用 app 內的管理員退出選項，即可停用它。

### 處理限制 {#processing-limits}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0`（無上限） | 每次上傳的最大檔案大小（MB）。設為 0 為無上限。已發布的映像檔出廠即為 `0`；從原始碼建置則是從 100 開始。 |
| `MAX_BATCH_SIZE` | `0`（無上限） | 單一批次請求中的最大檔案數。設為 0 為無上限。已發布的映像檔出廠即為 `0`；從原始碼建置則是從 100 開始。 |
| `CONCURRENT_JOBS` | `0`（自動） | 平行執行的批次工作數。設為 0 可根據可用 CPU 核心自動偵測。 |
| `MAX_MEGAPIXELS` | `0`（無上限） | 允許的最大影像解析度（百萬像素）。設為 0 為無上限。 |
| `MAX_WORKER_THREADS` | `0`（自動） | 影像處理的最大工作執行緒。設為 0 可根據可用 CPU 核心自動偵測。 |
| `PROCESSING_TIMEOUT_S` | `0`（無限制） | 每個請求的最大處理時間（秒）。設為 0 為無逾時。 |
| `MAX_PIPELINE_STEPS` | `20` | 管線中的最大步驟數。設為 0 為無限制。 |
| `MAX_CANVAS_PIXELS` | `0`（無限制） | 輸出影像的最大畫布尺寸（像素）。設為 0 為無限制。 |
| `MAX_SVG_SIZE_MB` | `50` | 淨化處理之前可接受的最大 SVG 大小（MB）。這裡的 `0` 與前後各列的含義不同：它不是把上限調高，而是完全移除解析前的大小限制，因此這一項請保持設定。 |
| `MAX_PDF_PAGES` | `0`（無上限） | PDF 轉影像時的最大 PDF 頁數。設為 0 為無上限。 |

### 引擎 {#engines}

SnapOtter 會在容器內的 `$PATH` 中尋找每個處理用二進位檔，因此除非你掛載自己建置的版本，這些設定都會保持空白。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `FFMPEG_PATH` | （空白） | 影片與音訊工具所使用的 `ffmpeg` 二進位檔路徑。 |
| `FFPROBE_PATH` | （空白） | `ffprobe` 的路徑，會在媒體檔案被處理前讀取它們。請指向與 `FFMPEG_PATH` 相同的建置版本。 |
| `QPDF_PATH` | （空白） | `qpdf` 的路徑，供 PDF 工具使用，也用於檢查上傳的 PDF。 |
| `SOFFICE_PATH` | （空白） | LibreOffice 的 `soffice` 路徑，用於辦公室文件轉換。 |
| `PDFCPU_PATH` | （空白） | `pdfcpu` 的路徑，供部分 PDF 工具使用。 |
| `SNAPOTTER_HW_ACCEL` | （空白） | 硬體影片編碼器系列，`nvenc` 或 `vaapi`。空白時以軟體編碼。 |

`SNAPOTTER_HW_ACCEL` 需要一個以該編碼器系列建置的 ffmpeg，而映像檔內的 ffmpeg 兩者都沒有。使用映像檔自帶的二進位檔時，此設定會退回軟體編碼，並在啟動日誌中說明。若要使用它，請掛載你自己的 ffmpeg 建置版本，將 `FFMPEG_PATH` 與 `FFPROBE_PATH` 指向它，並將 GPU 裝置提供給容器。若使用 `nvenc`，還需設定 `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`：映像檔只會要求 `compute,utility`，少了 `video`，NVIDIA 執行階段就不會掛載編碼程式庫，因此編碼器會列出來，但每次編碼都會失敗。若路徑覆寫指向不存在的檔案或無法執行的檔案，也會在啟動日誌中指名，而每個需要該二進位檔的作業都會失敗，直到你修正路徑或取消設定。

已發佈的 Compose 檔案會從 `.env` 傳入全部六個變數，因此只要在那裡設定就夠了。

### 清理 {#cleanup}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 未儲存的處理結果（原始上傳與工具輸出）在自動刪除前保留多久。你明確儲存至 Files 資料庫的檔案不受影響，會保留至你刪除它們為止。 |
| `CLEANUP_INTERVAL_MINUTES` | `60` | 清理工作的執行頻率。 |

### 外觀 {#appearance}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 新工作階段的預設主題。`light`、`dark` 或 `system`。 |
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
      POSTGRES_PASSWORD: snapotter     # 非本機部署請變更此值
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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
