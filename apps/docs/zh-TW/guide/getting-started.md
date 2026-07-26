---
description: "用一道 Docker 指令安裝 SnapOtter。包含 Docker Compose 設定、從原始碼建置，以及完整功能總覽。"
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: c2b2ed21e05f
i18n_hash_version: 2
---

# 快速上手 {#getting-started}

::: tip 安裝前先試用
在 [demo.snapotter.com](https://demo.snapotter.com) 探索完整 UI，無需註冊或安裝。
:::

## 快速開始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

這個單一容器運行它所需的一切：在沒有設定 `DATABASE_URL` 的情況下，它在環回介面（嵌入模式）上啟動自己的 PostgreSQL 和 Redis，並將所有資料保存在 `SnapOtter-data` 卷中。這是在家庭實驗室上嘗試 SnapOtter 或自架網站的最快方法。對於生產，請使用[規範的 Docker Compose 堆疊](#docker-compose)，它將 PostgreSQL 和 Redis 保留在自己的容器中。嵌入模式以 root 身份運行（預設），並在您設定 `DATABASE_URL` 後自動關閉。

要安裝在 Raspberry Pi、舊筆電或小型 VPS 上？請參閱[低資源環境部署](/zh-TW/guide/low-resource)，取得調校過的逐步教學，並了解受限硬體能有什麼表現。

首次登入時會要求你變更密碼。

::: tip 匿名產品分析
SnapOtter 預設包含匿名產品分析。若要關閉它，請開啟 **Settings → System → Privacy** 並關閉 **Anonymous Product Analytics**。它會立即對整個執行個體停止。

你也可以設定環境變數 `SNAPOTTER_TELEMETRY=0`（`false` 和 `off` 也適用）以停用執行個體的所有遙測，無需重新建置。

錯誤監控由 [Sentry](https://sentry.io) 提供，它透過開源計畫贊助 SnapOtter。

關於所收集內容的詳細資訊，請參閱 [SnapOtter 收集的內容](/zh-TW/guide/telemetry)。
:::

::: tip NVIDIA CUDA 加速
添加 `--gpus all` 以實現 NVIDIA CUDA 加速的背景移除、放大、臉部增強和恢復。 OCR 仍然基於 CPU，並且在有或沒有 GPU 存取的情況下在相同映像中工作：

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

需要 [NVIDIA 容器工具包](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。當 CUDA 不可用時自動回退到 CPU。目前，AI 推理不支援透過 VA-API、Quick Sync 或 OpenCL 進行 Intel/AMD iGPU 加速。請參閱 [Docker 標籤](/zh-TW/guide/docker-tags) 以了解基準。如果 AI 工具在 CPU 上運作（儘管 `--gpus all`），請參閱[驗證 GPU 加速](/zh-TW/guide/deployment#verify-gpu-acceleration)。
:::

::: details 也在 GHCR 上
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

兩個登錄檔在每次發行時都會發布相同的映像檔。
:::

## Docker 編寫 {#docker-compose}

使用每個版本維護和測試的生產文件，而不是從此頁面複製縮寫的 Compose 範例：

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.1.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

規範的 [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.1.0/docker/docker-compose.yml) 包括所有四個運行時卷、運行狀況檢查、資源限制、持久性 Redis 配置、固定資料庫/快取映像以及當前容器強化。首次登入後立即變更預設管理員密碼。對於可重現的部署，請將 SnapOtter 應用程式映像固定到您驗證的發布標籤或摘要，而不是遵循 `latest`。

有關所有環境變量，請參閱[配置](/zh-TW/guide/configuration)；有關機密、網路策略和備份指南，請參閱[安全性和強化](/zh-TW/guide/security)。

## 從原始碼建置 {#build-from-source}

**先決條件：** Node.js 22.22+、pnpm 9+、Docker（用於 Postgres + Redis）、Python 3.11+（用於 AI 功能）、Git。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 前端：[http://localhost:1351](http://localhost:1351)
- 後端：[http://localhost:13490](http://localhost:13490)

## 你可以做什麼 {#what-you-can-do}

### 檔案處理（200+ 工具） {#file-processing-200-tools}

| 模態 | 數量 | 範例工具 |
|----------|-------|---------------|
| **影像** | 107 | 調整大小、裁切、壓縮、轉換、去背、放大、OCR、浮水印、拼貼、上色、GIF 工具、格式預設 |
| **影片** | 57 | 修剪、裁切、壓縮、轉換、合併、擷取音訊、自動字幕、影片轉 GIF、調整大小、穩定化、格式預設 |
| **音訊** | 27 | 修剪、合併、轉換、正規化、雜訊抑制、轉錄、音高變換、淡入淡出、鈴聲製作、格式預設 |
| **PDF / 文件** | 29 | 合併、分割、壓縮、OCR、浮水印、遮蔽、Word 轉 PDF、Excel 轉 PDF、旋轉、保護、修復 |
| **檔案** | 23 | CSV 轉 JSON、JSON 轉 XML、合併 CSV、分割 CSV、建立 ZIP、解壓縮 ZIP、圖表製作、YAML/JSON |

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
