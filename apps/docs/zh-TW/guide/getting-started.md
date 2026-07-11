---
description: "用一道 Docker 指令安裝 SnapOtter。包含 Docker Compose 設定、從原始碼建置，以及完整功能總覽。"
i18n_source_hash: 4536d4558b8e
i18n_provenance: machine
i18n_output_hash: 4e12779bd211
---

# 快速上手 {#getting-started}

::: tip 安裝前先試用
在 [demo.snapotter.com](https://demo.snapotter.com) 探索完整 UI，無需註冊或安裝。
:::

## 快速開始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

這個單一容器會執行它所需的一切：在未設定 `DATABASE_URL` 的情況下，它會在 loopback 介面上啟動自己的 PostgreSQL 和 Redis（嵌入模式），並將所有資料保存在 `SnapOtter-data` 磁碟區中。這是試用 SnapOtter 或在家用實驗室自我託管的最快方式。就正式環境而言，請執行下方的 [Docker Compose](#docker-compose) 堆疊，它會將 PostgreSQL 和 Redis 保留在各自的容器中。嵌入模式以 root（預設值）執行，並在你設定 `DATABASE_URL` 後自動關閉。

首次登入時會要求你變更密碼。

::: tip 匿名產品分析
SnapOtter 預設包含匿名產品分析。若要關閉它，請開啟 **Settings → System → Privacy** 並關閉 **Anonymous Product Analytics**。它會立即對整個執行個體停止。

你也可以設定環境變數 `SNAPOTTER_TELEMETRY=0`（`false` 和 `off` 也適用）以停用執行個體的所有遙測，無需重新建置。

錯誤監控由 [Sentry](https://sentry.io) 提供，它透過開源計畫贊助 SnapOtter。

關於所收集內容的詳細資訊，請參閱 [SnapOtter 收集的內容](/zh-TW/guide/telemetry)。
:::

::: tip NVIDIA CUDA 加速
加上 `--gpus all` 以取得 NVIDIA CUDA 加速的去背、放大、OCR、臉部強化與修復：

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

需要 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。當 CUDA 不可用時會自動回退至 CPU。目前不支援透過 VA-API、Quick Sync 或 OpenCL 進行 Intel/AMD iGPU 加速的 AI 推論。效能測試請參閱 [Docker Tags](/zh-TW/guide/docker-tags)。
:::

::: details 也在 GHCR 上
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

兩個登錄檔在每次發行時都會發布相同的映像檔。
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

關於所有環境變數，請參閱 [Configuration](/zh-TW/guide/configuration)。

## 從原始碼建置 {#build-from-source}

**先決條件：** Node.js 22+、pnpm 9+、Docker（用於 Postgres + Redis）、Python 3.10+（用於 AI 功能）、Git。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 前端：[http://localhost:1349](http://localhost:1349)
- 後端：[http://localhost:13490](http://localhost:13490)

## 你可以做什麼 {#what-you-can-do}

### 檔案處理（200+ 工具） {#file-processing-200-tools}

| 模態 | 數量 | 範例工具 |
|----------|-------|---------------|
| **影像** | 105 | 調整大小、裁切、壓縮、轉換、去背、放大、OCR、浮水印、拼貼、上色、GIF 工具、格式預設 |
| **影片** | 57 | 修剪、裁切、壓縮、轉換、合併、擷取音訊、自動字幕、影片轉 GIF、調整大小、穩定化、格式預設 |
| **音訊** | 27 | 修剪、合併、轉換、正規化、雜訊抑制、轉錄、音高變換、淡入淡出、鈴聲製作、格式預設 |
| **PDF / 文件** | 42 | 合併、分割、壓縮、OCR、浮水印、遮蔽、Word 轉 PDF、Excel 轉 PDF、旋轉、保護、修復 |
| **檔案** | 10 | CSV 轉 JSON、JSON 轉 XML、合併 CSV、分割 CSV、建立 ZIP、解壓縮 ZIP、圖表製作、YAML/JSON |

### 管線 {#pipelines}

將工具串連成多步驟工作流程，並套用到一張影像或整個批次：

1. 在側邊欄開啟 **Pipelines**。
2. 新增步驟（任何工具、任何設定）。
3. 對單一檔案執行，或一次對整個批次執行。
4. 儲存管線以供日後重用。

管線預設允許 20 個步驟。設定 `MAX_PIPELINE_STEPS=0` 可讓限制變為無限制。

### 檔案庫 {#file-library}

你處理的每個檔案都能儲存到你的 **Files** 檔案庫。SnapOtter 會追蹤完整的版本歷史，讓你能從原始上傳到最終輸出追溯每一個處理步驟。

儲存是明確的：你儲存到檔案庫的結果會保留，直到你刪除它們；而你處理後未儲存的結果會在 72 小時後自動清除（可透過 `FILE_MAX_AGE_HOURS` 設定）。

### REST API 與 API 金鑰 {#rest-api-api-keys}

每個工具都可透過 HTTP 存取：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

在 **Settings → API Keys** 底下產生 API 金鑰。所有端點請參閱 [REST API 參考](/zh-TW/api/rest)，或造訪 [http://localhost:1349/api/docs](http://localhost:1349/api/docs) 以取得互動式參考。

### 多使用者與團隊 {#multi-user-teams}

啟用多位使用者並搭配以角色為基礎的存取控制：

- **管理員**：完整存取 — 管理使用者、團隊、設定，以及所有檔案/管線/API 金鑰
- **使用者**：使用工具、管理自己的檔案/管線/API 金鑰

在 **Settings → Teams** 底下建立團隊以將使用者分組。

設定 `AUTH_ENABLED=true`（或 `false` 用於單一使用者/自用而不需登入）。
