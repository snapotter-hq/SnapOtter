---
description: "SnapOtter 的 monorepo 結構、app 與套件架構、請求生命週期，以及資源占用。"
i18n_source_hash: 9e8f80499a37
i18n_provenance: human
i18n_output_hash: 733f35af8cb1
---

# 架構 {#architecture}

SnapOtter 是一個以 pnpm workspaces 與 Turborepo 管理的 monorepo。它以 3 容器的 Docker Compose 堆疊部署：SnapOtter app 映像檔、PostgreSQL 17 與 Redis 8。

## 專案結構 {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## 套件 {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

以 [Sharp](https://sharp.pixelplumbing.com/) 為基礎建置的核心影像處理程式庫。它處理所有非 AI 的操作：resize、crop、rotate、flip、convert、compress、strip metadata，以及色彩調整（亮度、對比、飽和度、灰階、懷舊、反轉、色版）。

此套件沒有網路相依，完全在程序內執行。

### `@snapotter/ai` {#snapotter-ai}

一個橋接層，呼叫 Python 指令碼進行 ML 操作。首次使用時，橋接層會啟動一個常駐的 Python 分派器程序，預先匯入沉重的程式庫（PIL、NumPy、MediaPipe、rembg），使後續的 AI 呼叫可略過匯入負擔。若分派器尚未就緒，橋接層會退回為每個請求產生一個全新的 Python 子程序。

**模型不會預先載入。** 每個工具指令碼會在請求時從磁碟載入其模型權重，並在請求結束時捨棄。完整的記憶體剖析請參閱[資源占用](#resource-footprint)。

支援的操作：背景移除（rembg/BiRefNet）、放大（RealESRGAN）、臉部模糊（MediaPipe）、臉部強化（GFPGAN/CodeFormer）、物件擦除（LaMa ONNX）、OCR（PaddleOCR/Tesseract）、上色（DDColor）、噪點移除、紅眼移除、相片修復、護照相片產生、透明度修正（BiRefNet HR-matting），以及內容感知縮放（Go caire 二進位檔）。

Python 指令碼位於 `packages/ai/python/`。Docker 映像檔會在建置期間預先下載所有模型權重，因此容器可完全離線運作。

### `@snapotter/shared` {#snapotter-shared}

前端與後端共用的 TypeScript 型別、常數（例如 `APP_VERSION` 與工具定義）以及 i18n 翻譯字串。

## 應用程式 {#applications}

### API（`apps/api`） {#api-apps-api}

一個 Fastify v5 伺服器，公開橫跨五種模態（image、video、audio、PDF、file）的 241 個工具路由，負責處理：
- 檔案上傳、暫存工作區管理，以及持久化檔案儲存
- 具版本鏈的使用者檔案資料庫（`user_files` 資料表）- 每個處理結果都連回其來源檔案並記錄套用了哪個工具，並為 Files 頁面自動產生縮圖
- 工具執行（將每個工具請求路由至影像引擎或 AI 橋接層）
- 管線協調（依序串接多個工具）
- 透過 BullMQ 工作佇列（pools：image、media、ai、docs、system）進行具並行控制的批次處理
- 使用者驗證、RBAC（admin/user 角色與完整權限集）、API 金鑰管理，以及速率限制
- 團隊管理 - 僅限 admin 的 CRUD；使用者透過其個人檔案上的 `team` 欄位指派至團隊
- 執行階段設定 - `settings` 資料表中的鍵值儲存，可控制 `disabledTools`、`enableExperimentalTools`、`loginAttemptLimit` 與其他運維旋鈕，無需重新部署
- 透過資料庫支援的設定進行自訂品牌與執行階段偏好設定
- 位於 `/api/docs` 的 Scalar/OpenAPI 文件
- 在正式環境中以 SPA 形式提供已建置的前端

主要相依套件：Fastify、Drizzle ORM（pg-core、node-postgres）、Sharp、BullMQ、ioredis、以及用於驗證的 Zod。

伺服器會在 SIGTERM/SIGINT 時處理平順關機：排空 HTTP 連線、停止 BullMQ workers、關閉 Python 分派器，並關閉資料庫連線。

### Web（`apps/web`） {#web-apps-web}

一個以 Vite 建置的 React 19 單頁應用程式。使用 Zustand 進行狀態管理、Tailwind CSS v4 進行樣式設計、Lucide 提供圖示。透過 REST 與 SSE（用於進度追蹤）與 API 溝通。

頁面包含工具工作區、用於管理持久化上傳與結果的 Files 頁面、自動化/管線建構器，以及管理員設定面板。

已建置的前端在正式環境中由 Fastify 後端提供，因此 Docker 容器中沒有獨立的 web 伺服器。

### Docs（`apps/docs`） {#docs-apps-docs}

即此 VitePress 網站。在推送至 `main` 時自動部署至 Cloudflare Pages。

## 請求如何流動 {#how-a-request-flows}

1. 使用者在 web UI 中選取工具並上傳檔案。
2. 前端將含檔案與設定的 multipart POST 送往 `/api/v1/tools/:section/:toolId`。
3. API 路由以 Zod 驗證輸入，然後分派處理。
4. 對於標準工具，工作會依模態排入適當的 BullMQ pool（image、media 或 docs）。程序內的 BullMQ worker 會根據 EXIF 中繼資料自動校正影像方向、執行工具的處理函式，並回傳結果。
5. 對於 AI 工具，TypeScript 橋接層會將請求送往常駐的 Python 分派器（或退回產生一個全新的子程序），等待其完成，並讀取輸出檔案。
6. 工作進度會持久化至 PostgreSQL 中的 `jobs` 資料表，因此狀態可在容器重新啟動後保留。即時更新透過位於 `/api/v1/jobs/:jobId/progress` 的 SSE 傳遞。
7. API 回傳一個 `jobId` 與 `downloadUrl`。使用者從 `/api/v1/download/:jobId/:filename` 下載處理後的檔案。

對於管線，API 會將每個步驟的輸出作為下一步的輸入，依序執行。

對於批次處理，API 會使用具逐步驟子工作的 BullMQ flows，並回傳一個含所有處理後檔案的 ZIP 檔案。

## 資源占用 {#resource-footprint}

SnapOtter 的設計以低閒置記憶體使用為目標。啟動時不會預先載入或保持任何暖機狀態。

### 閒置時 {#at-idle}

Node.js/Fastify 程序、PostgreSQL 與 Redis 都在執行。三個容器（Node.js 程序、Postgres 與 Redis）的典型閒置 RAM 為 **約 200-300 MB**。沒有 Python 程序，記憶體中也沒有模型權重。

### 什麼會啟動，以及何時啟動 {#what-starts-and-when}

| 元件 | 啟動時機 | 作用時的記憶體 |
|-----------|-------------|---------------------|
| Fastify 伺服器 + Postgres + Redis | 容器啟動 | 合計約 200-300 MB |
| BullMQ workers | 容器啟動（程序內） | 每個 pool 一個 worker（image、media、ai、docs、system） |
| Python 分派器 | 首次 AI 工具請求 | Python 直譯器 + 預先匯入的程式庫（PIL、NumPy、MediaPipe、rembg）- 無模型權重 |
| AI 模型權重 | 特定工具的請求期間 | 從磁碟載入，請求結束時釋放 |

### 模型載入 {#model-loading}

所有模型權重檔案（合計數 GB）始終位於 `/opt/models/` 的磁碟上。每個 AI 工具指令碼僅在請求期間將自己的模型載入記憶體，之後即釋放。有些指令碼會在推論後明確呼叫 `del model` 與 `torch.cuda.empty_cache()`，以確保記憶體立即歸還。

請求之間沒有模型快取。連續執行同一個 AI 工具時，每次都會重新載入模型。這使得閒置記憶體趨近於零，代價是每個 AI 請求都會有模型載入延遲。

### 首次 AI 請求的冷啟動 {#first-ai-request-cold-start}

容器啟動時 Python 分派器並未執行。首次 AI 請求會並行觸發兩件事：分派器開始在背景暖機，而請求本身則退回為一次性的 Python 子程序產生。一旦分派器發出就緒信號，所有後續 AI 請求都會直接使用它，並略過子程序產生的成本。
