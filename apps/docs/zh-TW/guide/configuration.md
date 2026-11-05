---
description: "SnapOtter 所有環境變數及其預設值。可設定驗證、儲存空間、AI 模型、分析等項目。"
i18n_source_hash: caa895c0ba16
i18n_provenance: machine
i18n_output_hash: 83deec188fce
i18n_hash_version: 2
---

# 設定 {#configuration}

所有設定皆透過環境變數完成。每個變數都有合理的預設值，因此不設定任何變數，SnapOtter 也能開箱即用。

## 環境變數 {#environment-variables}

### 伺服器 {#server}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PORT` | `1349` | 伺服器監聽的連接埠。 |
| `BASE_PATH` | （空） | 對外公開的部署路徑，例如 `/snapotter`。留空或設為 `/` 時，於網域根路徑提供服務。於執行階段套用，無需重新建置映像檔。 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每個 IP 每分鐘的請求數上限。設為 0 可停用速率限制。 |
| `CORS_ORIGIN` | （空） | 以逗號分隔的 CORS 允許來源，留空則僅允許同源。 |
| `LOG_LEVEL` | `info` | 日誌詳細程度。可選值：`fatal`、`error`、`warn`、`info`、`debug`、`trace`。 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | 哪些對等端可透過 `X-Forwarded-For` 設定用戶端 IP。預設值只信任私有網路中的對等端，因此位於 Docker 網路或區域網路的反向代理會被信任，而公開用戶端偽造的標頭則不會。只有在您掌控的代理伺服器位於公開位址前端時，才設定 `true`。 |

### 驗證 {#authentication}

下列兩個布林值只接受 `true` 與 `false`。其他任何值，包括 `1`、`yes` 或 `on`，都會驗證失敗，伺服器在開始監聽之前就會結束。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 是否要求登入。設為 `false` 時完全不使用帳號，每個請求都擁有管理員權限，因此請僅在受信任的網路中使用。 |
| `DEFAULT_USERNAME` | `admin` | 初始管理員帳號的使用者名稱。僅在首次執行時使用。 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理員帳號的密碼。首次登入後請立即變更。 |
| `MAX_USERS` | `0`（無限制） | 已註冊使用者帳號的數量上限。設為 0 表示無限制。 |
| `SESSION_DURATION_HOURS` | `168` | 登入工作階段的有效時間，單位為小時（預設為 7 天）。 |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | 設為 `true` 可略過首次登入時強制變更密碼的提示。 |

### 儲存空間 {#storage}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` 或 `s3`。S3 與 MinIO 需要具備 s3_storage 功能的授權，並設定下方的 `S3_*` 變數。 |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL 連線字串，也是處理每個請求所用的連線。在 2.3.0 及更新版本中，同時設定 `DATABASE_MIGRATION_URL` 後，此連線會成為最小權限的執行階段角色，僅擁有應用程式資料表的 DML 權限，別無其他。Compose 堆疊會將它指向 `postgres` 服務；若要使用內嵌模式，請將它（連同 `REDIS_URL`）保持未設定。 |
| `DATABASE_MIGRATION_URL` | （空） | 特權連線，僅在啟動期間用於執行遷移並授權給執行階段角色，在處理第一個請求之前即關閉。若留空，SnapOtter 會以單一角色執行，由 `DATABASE_URL` 同時負責這兩項工作。請參閱[最小權限角色](/zh-TW/guide/database#least-privilege-roles)。 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 連線字串（供 BullMQ 工作佇列使用）。Compose 會將它指向 `redis` 服務。 |
| `WORKSPACE_PATH` | `./tmp/workspace` | 處理期間存放暫存檔案的目錄，會自動清理。映像檔將其設為 `/tmp/workspace`。 |
| `FILES_STORAGE_PATH` | `./data/files` | 存放持久性使用者檔案（上傳的圖片、儲存的結果）的目錄。映像檔將其設為 `/data/files`。 |

### S3 物件儲存 {#s3-object-storage}

僅在 `STORAGE_MODE=s3` 時才會讀取。三個必要變數中只要缺少任何一個，啟動就會失敗，並指出您遺漏的變數名稱。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `S3_BUCKET` | （空） | 存放上傳檔案與輸出結果的儲存貯體。必填。 |
| `S3_ACCESS_KEY_ID` | （空） | 存取金鑰。必填。在容器中，您也可以改用 `S3_ACCESS_KEY_ID_FILE` 掛載。 |
| `S3_SECRET_ACCESS_KEY` | （空） | 密鑰。必填。檔案慣例相同：`S3_SECRET_ACCESS_KEY_FILE`。 |
| `S3_REGION` | `us-east-1` | 儲存貯體所在區域。 |
| `S3_ENDPOINT` | （空） | MinIO、R2、Backblaze 及其他相容 S3 儲存服務的自訂端點。留空表示使用 AWS。 |
| `S3_FORCE_PATH_STYLE` | `false` | 對於 MinIO，以及其他需要 `endpoint/bucket/key` 而非虛擬主機定址的服務，請設為 `true`。 |
| `S3_PREFIX` | （空） | 金鑰前綴，讓同一個儲存貯體可容納多個執行個體。 |

### 靜態資料加密 {#encryption-at-rest}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | （空） | 64 個十六進位字元（32 位元組）。用於加密儲存在資料庫中的敏感設定。凡不是 64 個十六進位字元的值，都會在啟動時被拒絕。 |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | （空） | 您正要汰換的舊金鑰，格式相同。輪替期間請同時設定兩者，讓既有資料列仍可解密，完成後再移除此項。 |

### 內嵌模式 {#embedded-mode}

若在未設定 `DATABASE_URL` 與 `REDIS_URL` 的情況下執行映像檔，它會在容器內自行啟動 PostgreSQL 17 與 Redis，僅綁定於回送位址，所有資料都存放在 `/data` 磁碟區。這恢復了單一指令 `docker run` 的使用體驗，適合快速入門、家用實驗室，以及從 1.x 升級。這只是方便的途徑，並非正式環境的部署方式：正式環境請執行三個容器的 Compose 堆疊，使用獨立的 PostgreSQL 與 Redis。內嵌模式需要以 root 身分執行容器，與任意 UID 的執行環境（OpenShift、Kubernetes `runAsNonRoot`）不相容；這些環境請使用 Compose。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `EMBEDDED` | `auto` | 當 `DATABASE_URL` 與 `REDIS_URL` 皆未設定時自動啟用。設為 `0` 可停用（此時若未設定外部的 `DATABASE_URL`/`REDIS_URL`，應用程式會立即失敗，而不是默默啟動容器內的資料庫）。 |
| `REDIS_MAXMEMORY` | `512mb` | 內嵌 Redis 的記憶體上限（僅限內嵌模式）。在記憶體受限的主機（例如 Raspberry Pi）上可調低此值。 |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | 啟動時等待內嵌 Redis 回應 `PING` 的秒數，逾時即放棄。逾時後容器會停止並記錄原因，而不會卡住。為 1 到 999999 的整數秒；沒有無限制的值，因為無限期等待正是此上限要防止的失敗情況。只有在速度較慢的主機觸發逾時時才需要調高。 |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | 同上，適用於內嵌 PostgreSQL。計時從首次啟動的 `initdb` 完成後開始，因此涵蓋的是伺服器啟動與當機復原，而非初始資料庫的建立。 |

從 1.x 升級：將舊的 `snapotter.db` 放在磁碟區中的 `/data/snapotter.db`，內嵌模式會在首次啟動時將其匯入內嵌 PostgreSQL。匯入只會執行一次；之後的啟動會略過。

遙測說明：內嵌模式與其他設定一樣，沿用映像檔的分析預設值。已發佈的映像檔預設啟用分析；若要停用，請使用 `--build-arg SNAPOTTER_ANALYTICS=off` 建置，或使用應用程式內管理員的選擇退出功能。

### 處理限制 {#processing-limits}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0`（無限制） | 每次上傳的檔案大小上限，單位為 MB。設為 0 表示無限制。已發佈的映像檔預設為 `0`；從原始碼建置則從 100 開始。 |
| `MAX_BATCH_SIZE` | `0`（無限制） | 單一批次請求中的檔案數量上限。設為 0 表示無限制。已發佈的映像檔預設為 `0`；從原始碼建置則從 100 開始。 |
| `CONCURRENT_JOBS` | `0`（自動） | 並行執行的批次工作數量。設為 0 會依可用的 CPU 核心數自動偵測。 |
| `MAX_MEGAPIXELS` | `0`（無限制） | 允許的最大圖片解析度，單位為百萬像素。設為 0 表示無限制。 |
| `MAX_WORKER_THREADS` | `0`（自動） | 圖片處理的工作執行緒數量上限。設為 0 會依可用的 CPU 核心數自動偵測。 |
| `PROCESSING_TIMEOUT_S` | `0`（無限制） | 每個請求的最長處理時間，單位為秒。設為 0 表示不逾時。 |
| `MAX_PIPELINE_STEPS` | `20` | 管線中的步驟數量上限。設為 0 表示無限制。 |
| `MAX_CANVAS_PIXELS` | `0`（無限制） | 輸出圖片的畫布大小上限，單位為像素。設為 0 表示無限制。 |
| `MAX_SVG_SIZE_MB` | `50` | 清理前可接受的最大 SVG，單位為 MB。`0` 在這裡的行為與前後各列不同：它會完全移除解析前的大小上限，而不是調高上限，因此請保留此項的設定值。 |
| `MAX_PDF_PAGES` | `0`（無限制） | PDF 轉圖片時允許的 PDF 頁數上限。設為 0 表示無限制。 |

### 引擎 {#engines}

SnapOtter 會在容器內的 `$PATH` 上尋找每個處理用的執行檔，因此除非您掛載自行建置的版本，否則這些變數都保持為空。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `FFMPEG_PATH` | （空） | 影片與音訊工具所使用的 `ffmpeg` 執行檔路徑。 |
| `FFPROBE_PATH` | （空） | `ffprobe` 的路徑，用於在處理媒體檔案之前讀取它們。請指向與 `FFMPEG_PATH` 相同的建置版本。 |
| `QPDF_PATH` | （空） | `qpdf` 的路徑，供 PDF 工具使用，也用於檢查上傳的 PDF。 |
| `SOFFICE_PATH` | （空） | LibreOffice 的 `soffice` 路徑，用於辦公文件轉換。 |
| `PDFCPU_PATH` | （空） | `pdfcpu` 的路徑，部分 PDF 工具會使用。 |
| `SNAPOTTER_HW_ACCEL` | （空） | 硬體影片編碼器系列，`nvenc` 或 `vaapi`。留空則使用軟體編碼。 |

`SNAPOTTER_HW_ACCEL` 需要內建該編碼器系列的 ffmpeg，而映像檔中的 ffmpeg 兩者皆不具備。使用映像檔自帶的執行檔時，此設定會退回軟體編碼，並在啟動日誌中說明。若要使用它，請掛載您自行建置的 ffmpeg，將 `FFMPEG_PATH` 與 `FFPROBE_PATH` 指向它，並讓容器存取 GPU 裝置。對於 `nvenc`，還要設定 `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`：映像檔只要求 `compute,utility`，而沒有 `video` 時，NVIDIA 執行階段不會掛載編碼函式庫，因此編碼器雖會列出，但每次編碼都會失敗。若路徑覆寫指向不存在或不可執行的檔案，也會在啟動日誌中指出，而所有需要該執行檔的工作都會失敗，直到您修正路徑或取消設定為止。

已發佈的 Compose 檔案會從 `.env` 傳遞這六個變數，因此在那裡設定即可。

### 清理 {#cleanup}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 未儲存的處理結果（原始上傳檔案與工具輸出）在自動刪除前的保留時間。您明確儲存到檔案庫的檔案不受影響，會一直保留到您刪除為止。 |
| `CLEANUP_INTERVAL_MINUTES` | `60` | 清理工作的執行頻率。 |

### 外觀 {#appearance}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 新工作階段的預設主題。`light`、`dark` 或 `system`。 |
| `DEFAULT_LOCALE` | `en` | 預設介面語言。 |
| `DEFAULT_TOOL_VIEW` | `sidebar` | 預設工具版面配置。`sidebar` 或 `fullscreen`。 |

### Docker 權限 {#docker-permissions}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PUID` | `999` | 以此 UID 執行容器程序。使用綁定掛載時，請設為與主機使用者相符的值（`id -u`）。 |
| `PGID` | `999` | 以此 GID 執行容器程序。使用綁定掛載時，請設為與主機群組相符的值（`id -g`）。 |

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
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
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

- `/data`（app）- AI 模型、Python 虛擬環境與使用者檔案。掛載此磁碟區，可在重新啟動後保留上傳的檔案與已安裝的 AI 套件組合。
- `/tmp/workspace`（app）- 存放處理中檔案的暫存空間。此磁碟區可以是暫時性的，但掛載它可避免填滿容器的可寫入層。
- `SnapOtter-pgdata`（postgres）- PostgreSQL 資料目錄。其中保存所有關聯式資料（使用者、設定、管線、工作、稽核日誌）。可透過 `pg_dump` 或磁碟區快照進行備份。
- `SnapOtter-redisdata`（redis）- Redis 僅附加檔案，用於持久的工作佇列。
