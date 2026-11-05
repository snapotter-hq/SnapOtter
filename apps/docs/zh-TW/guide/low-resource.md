---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: 9a540920f13d
i18n_hash_version: 2
---
# 低資源環境設定 {#low-resource-setups}

SnapOtter 在小型硬體上也能順暢執行：Raspberry Pi 4 或 5、舊筆電，或 2 GB 的 VPS。本頁是針對這類機器的實用指南：預期表現、可直接複製貼上且帶有合理上限的設定，以及哪些功能應該略過。這些數字背後的完整基準測試資料，請見[硬體需求](/zh-TW/guide/deployment#hardware-requirements)。

先說明兩項硬性限制：

- **僅支援 64 位元。** 映像檔是為 `linux/amd64` 與 `linux/arm64` 建置的。不支援 32 位元 ARM（`armv7`/`armhf`），因此第一代 Pi 與 Pi Zero 系列無法使用。
- **記憶體下限 2 GB（非 AI 工具）。** 512 MB 無法啟動整個堆疊，1 GB 在處理多檔案批次時會失敗。2 GB 搭配 2 個核心，是能從容執行非 AI 工具的最小配置。

## 小型硬體上能順暢執行的項目 {#what-runs-well}

所有非 AI 工具都能在 2 GB / 2 核心的機器上運作：整個圖片與檔案區段、PDF 工具，以及串流複製的影片與音訊操作（剪輯、靜音、容器重新封裝）。大多數都能在一秒內完成。

有兩種工作負載例外：

- **影片重新編碼**（在不同編解碼器之間轉換）受限於 CPU。在高速桌上型 CPU 上約需 40 秒的 1080p 片段，在 Pi 等級的 CPU 上可能要好幾分鐘。串流複製操作仍然是即時的。
- **AI 工具** 對每個套件組合有各自的 CPU 記憶體下限：臉部偵測與內建的快速 OCR 需要 2 GB 主機 RAM（0.5 GB 可用）；精準 OCR 需要 4 GiB 的設定有效記憶體；轉錄、物件擦除與上色、去背、放大與增強，以及照片修復需要 4 GB 主機 RAM（2 到 3 GB 可用）；高品質修補需要 8 GB 主機 RAM（6 GB 可用）。2 GB 的機器若執行 Whisper、RealESRGAN、rembg 或 LaMa，會因記憶體不足而被終止，因此 SnapOtter 在分派到 Python sidecar 之前會先檢查可用記憶體，低於套件組合下限時會立即拒絕執行。

這兩者在您使用之前都不會安裝或執行：未安裝任何 AI 套件組合時，應用程式閒置的記憶體用量約為 360 MB，而 AI 套件組合只會在管理員啟用後才下載。

## Raspberry Pi / 舊筆電操作步驟 {#walkthrough}

這是[快速入門](/zh-TW/guide/getting-started)中的標準 Compose 安裝，再加上資源限制與保守的上限。它假設使用 64 位元作業系統（Pi 上請用 Raspberry Pi OS 64 位元版或 Ubuntu Server arm64）。

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi 等級機器的注意事項：

- **資料磁碟區與 Postgres 建議使用 USB SSD，而非 SD 卡。** 工作區會進行實際的磁碟 IO，而 SD 卡不僅慢，也很容易磨損。
- **單一容器的一體式部署在這裡同樣可行**（未設定 `DATABASE_URL`/`REDIS_URL` 時使用內嵌的 Postgres 與 Redis），在記憶體受限的主機上，您應該用 `REDIS_MAXMEMORY` 降低其內嵌 Redis 的上限（請參閱[設定](/zh-TW/guide/configuration)）。Compose 能提供更細緻的各服務控制，因此本操作步驟採用它。
- **2 GB 的裝置請加上 swap。** 它能避免偶發的尖峰（較大的 PDF、忘了設上限的批次）以記憶體不足被終止收場。zram 是對 SD 卡友善的選項。
- arm64 映像檔僅支援 CPU，ARM 開發板上沒有 CUDA。

## 調校參數 {#tuning-knobs}

所有上限都是環境變數，完整說明請見[設定](/zh-TW/guide/configuration)。`0` 代表無限制或自動。在小型硬體上重要的項目如下：

| 變數 | 小型機器建議值 | 保護對象 |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | 同時平行執行的工作數量。自動偵測使用 CPU 核心數減一，這對大型機器沒問題，但對承受記憶體壓力的 2 核心機器而言太過積極。 |
| `MAX_WORKER_THREADS` | `2` | 圖片處理執行緒池。 |
| `MAX_BATCH_SIZE` | `5` | 批次是 1-2 GB 機器最先耗盡記憶體的地方。 |
| `MAX_UPLOAD_SIZE_MB` | `100` | 避免單一巨大檔案佔滿整個工作區。 |
| `MAX_MEGAPIXELS` | `50` | 無論檔案大小，解碼 100+ MP 的圖片都會消耗 RAM。 |
| `MAX_VIDEO_DURATION_S` | `300` | 長時間轉碼會讓小型 CPU 被獨佔數分鐘到數小時。 |
| `PROCESSING_TIMEOUT_S` | `600` | 硬性上限，讓失控的工作最終能釋放機器。 |

這些上限作用於伺服器接受的內容，因此請依照您實際的使用情況設定，而不是越小越好。如果您從不處理影片，設定 `MAX_VIDEO_DURATION_S` 上限不會有任何代價；如果您每天掃描文件，就不要限制 `MAX_PDF_PAGES`。

## 建議略過的項目 {#what-to-skip}

- **大型 AI 套件組合。** 放大、照片修復與去背需要 GPU 或高速多核心 CPU，而且每個套件組合會佔用 4-5 GB 磁碟空間。在小型機器上，直接不要安裝；缺少套件組合的工具會顯示安裝提示，而不是執行。
- **將影片重新編碼當作例行工作負載。** 偶爾轉碼沒問題（只是很慢）；穩定的轉碼佇列需要的是 CPU 核心，而不是 Pi。
- **一般而言不使用的工具。** 管理員可以在設定中關閉個別工具，這會讓它們從使用者介面中移除，並停止註冊其 API 路由。這本身不會節省記憶體，但可避免共用的小型執行個體被用來處理硬體無法負荷的那種工作負載。

如果您之後將執行個體搬到更大的硬體，請移除這些上限（將它們設回 `0`），同一個資料磁碟區可直接沿用。
