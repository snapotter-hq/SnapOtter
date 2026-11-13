---
description: "以單一指令透過 Docker 安裝 SnapOtter。包含 Docker Compose 設定、從原始碼建置，以及完整的功能概覽。"
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: 64dfd1c79f25
i18n_hash_version: 2
---

# 快速入門 {#getting-started}

::: tip 安裝前先試用
在 [demo.snapotter.com](https://demo.snapotter.com) 探索完整的使用者介面，無須註冊或安裝。
:::

## 快速開始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

這個單一容器包含執行所需的一切：未設定 `DATABASE_URL` 時，它會在 loopback 介面上啟動自己的 PostgreSQL 與 Redis（內嵌模式），並將所有資料保存在 `SnapOtter-data` 磁碟區中。這是試用 SnapOtter 或在家用伺服器自行架設最快的方式。正式環境請使用[標準 Docker Compose 堆疊](#docker-compose)，它會把 PostgreSQL 與 Redis 放在各自的容器中。內嵌模式以 root 身分執行（預設），一旦設定 `DATABASE_URL` 就會自動關閉。

要安裝在 Raspberry Pi、舊筆電或小型 VPS 上嗎？請參閱[低資源環境設定](/zh-TW/guide/low-resource)，了解調校後的操作步驟，以及在受限硬體上的預期表現。

首次登入時，系統會要求您變更密碼。

::: tip 匿名產品分析
SnapOtter 預設包含匿名產品分析。若要關閉，請開啟 **設定 → 系統 → 隱私權**，並關閉 **匿名產品分析**。整個執行個體會立即停止收集。

您也可以設定環境變數 `SNAPOTTER_TELEMETRY=0`（`false` 與 `off` 同樣有效），無須重新建置即可停用該執行個體的所有遙測。

錯誤監控由 [Sentry](https://sentry.io) 提供，Sentry 透過其開源計畫贊助 SnapOtter。

關於收集內容的詳細資訊，請參閱 [SnapOtter 收集哪些資料](/zh-TW/guide/telemetry)。
:::

::: tip NVIDIA CUDA 加速
加上 `--gpus all`，即可使用 NVIDIA CUDA 加速的去背、放大、臉部增強與修復。OCR 仍然使用 CPU，無論是否有 GPU 存取權，都可在同一個映像檔中運作：

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

需要 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。CUDA 無法使用時會自動退回 CPU。目前 AI 推論不支援透過 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 內顯加速。效能基準請參閱 [Docker 映像檔標籤](/zh-TW/guide/docker-tags)。如果已使用 `--gpus all`，AI 工具卻仍在 CPU 上執行，請參閱[驗證 GPU 加速](/zh-TW/guide/deployment#verify-gpu-acceleration)。
:::

::: details 也可從 GHCR 取得
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

兩個登錄庫在每次發行時都會發布相同的映像檔。
:::

## Docker Compose {#docker-compose}

請使用隨每次發行維護並測試過的正式環境檔案，而不要複製本頁中簡化的 Compose 範例：

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

標準的 [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) 包含全部四個執行階段磁碟區、健康檢查、資源限制、持久化的 Redis 設定、固定版本的資料庫與快取映像檔，以及目前的容器強化設定。首次登入後請立即變更預設的管理員密碼。若要取得可重現的部署，請將 SnapOtter 應用程式映像檔固定在您驗證過的發行標籤或摘要，而不是追蹤 `latest`。

所有環境變數請參閱[設定](/zh-TW/guide/configuration)，機密、網路原則與備份指引請參閱[安全性與強化](/zh-TW/guide/security)。

## 從原始碼建置 {#build-from-source}

**先決條件：** Node.js 22.22+、pnpm 9+、Docker（用於 Postgres 與 Redis）、Python 3.11+（用於 AI 功能）、Git。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 前端：[http://localhost:1351](http://localhost:1351)
- 後端：[http://localhost:13490](http://localhost:13490)

## 您可以做什麼 {#what-you-can-do}

### 檔案處理（200+ 種工具） {#file-processing-200-tools}

| 類型 | 數量 | 範例工具 |
|----------|-------|---------------|
| **圖片** | 112 | 調整大小、裁切、壓縮、轉換、去背、放大、OCR、浮水印、拼貼、上色、GIF 工具、格式預設 |
| **影片** | 57 | 剪輯、裁切、壓縮、轉換、合併、擷取音訊、自動字幕、影片轉 GIF、調整大小、防震、格式預設 |
| **音訊** | 27 | 剪輯、合併、轉換、正規化、降噪、轉錄、變調、淡入淡出、鈴聲製作、格式預設 |
| **PDF / 文件** | 35 | 合併、分割、壓縮、OCR、浮水印、塗黑、Word 轉 PDF、Excel 轉 PDF、旋轉、保護、修復 |
| **檔案** | 23 | CSV 轉 JSON、JSON 轉 XML、合併 CSV、分割 CSV、建立 ZIP、解壓縮 ZIP、圖表製作、YAML/JSON |

### 管線 {#pipelines}

將工具串接成多步驟工作流程，並套用到單張圖片或整批檔案：

1. 在側邊欄開啟 **管線**。
2. 加入步驟（任何工具、任何設定）。
3. 對單一檔案執行，或一次對整批檔案執行。
4. 儲存管線以便日後重複使用。

管線預設允許 20 個步驟。設定 `MAX_PIPELINE_STEPS=0` 可取消此上限。

### 檔案庫 {#file-library}

您處理過的每個檔案都可以儲存到 **檔案** 庫。SnapOtter 會追蹤完整的版本歷程，讓您能追溯從原始上傳到最終輸出的每個處理步驟。

儲存是明確的動作：您儲存到檔案庫的結果會保留到您刪除為止，而處理後未儲存的結果會在 72 小時後自動清除（可透過 `FILE_MAX_AGE_HOURS` 設定）。

### REST API 與 API 金鑰 {#rest-api-api-keys}

每個工具都可透過 HTTP 存取：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

請在 **設定 → API 金鑰** 下產生 API 金鑰。所有端點請參閱 [REST API 參考文件](/zh-TW/api/rest)，或造訪 [http://localhost:1349/api/docs](http://localhost:1349/api/docs) 使用互動式參考文件。

### 多使用者與團隊 {#multi-user-teams}

啟用多位使用者，並搭配角色型存取控制：

- **管理員**：完整存取權，可管理使用者、團隊、設定，以及所有檔案、管線與 API 金鑰
- **使用者**：使用工具，管理自己的檔案、管線與 API 金鑰

在 **設定 → 團隊** 下建立團隊，以將使用者分組。

設定 `AUTH_ENABLED=true`（或設定 `false`，供單人或自用且無須登入的情境）。

## 在手機上使用 {#use-it-from-your-phone}

SnapOtter 可在行動瀏覽器中使用，也可以安裝成應用程式。在手機上開啟您的執行個體，然後：

- **iPhone / iPad（Safari）：** 點選分享，再點選 **加入主畫面**。
- **Android（Chrome）：** 開啟瀏覽器選單，點選 **安裝應用程式**。

安裝後的應用程式會在獨立視窗中開啟，直接進入您的執行個體。

有一點要注意：瀏覽器只會在 HTTPS 下提供安裝提示。區域網路上的純 HTTP 位址在瀏覽器分頁中仍可正常使用；若要真正安裝，請將執行個體放在附有憑證的反向代理後面（請參閱[部署指南](/zh-TW/guide/deployment)）。

在手機與平板上，圖片工具會在上傳按鈕旁顯示 **拍照** 按鈕。拍下收據或白板，就會直接送進工具。
