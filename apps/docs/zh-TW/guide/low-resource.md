---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: d23efa46bf73
---
# 低資源環境部署 {#low-resource-setups}

SnapOtter 在小型硬體上運作良好：Raspberry Pi 4 或 5、一台舊筆電，或一台 2 GB 的 VPS。本頁是針對這些機器的實用指南：該有什麼預期、一套可直接複製貼上且帶有合理上限的設定，以及哪些功能應該略過。這些數字背後完整的效能測試資料見[硬體需求](/zh-TW/guide/deployment#hardware-requirements)。

先說兩個硬性限制：

- **僅限 64 位元。**映像檔只為 `linux/amd64` 和 `linux/arm64` 建置。不支援 32 位元 ARM（`armv7`/`armhf`），因此第一代 Pi 和 Pi Zero 系列不在支援範圍內。
- **記憶體下限 2 GB。**512 MB 無法啟動整個堆疊，1 GB 在多檔案批次時會失敗。2 GB 加 2 核心是能舒適運作的最小組態。

## 小型硬體上哪些功能運作良好 {#what-runs-well}

所有非 AI 工具都能在 2 GB / 2 核心的機器上運作：整個「影像」與「檔案」區塊、PDF 工具，以及串流複製類的影片和音訊操作（剪輯、靜音、更換容器）。大多數在一秒內完成。

有兩類工作負載是例外：

- **影片重新編碼**（在不同編解碼器之間轉換）受 CPU 限制。一段在高速桌面 CPU 上約 40 秒完成的 1080p 影片，在 Pi 等級的 CPU 上可能需要數分鐘。串流複製操作仍然是即時的。
- **AI 工具**需要記憶體（建議 4 GB）和磁碟空間（較大的套件組每個 4-5 GB），其中重型工具（放大、照片修復、背景移除）在 Pi 等級的 CPU 上並不實用。臉部偵測和 OCR 這類輕量 AI 在記憶體足夠時仍可使用。

這兩類負載在你用到之前既不會安裝也不會執行：未安裝任何 AI 套件組時，應用程式閒置時的記憶體佔用約 360 MB，而 AI 套件組只有在管理員啟用時才會下載。

## Raspberry Pi / 舊筆電實作教學 {#walkthrough}

這就是[快速上手](/zh-TW/guide/getting-started)中的標準 Compose 安裝，外加資源限制和保守的上限。它假設使用 64 位元作業系統（在 Pi 上：Raspberry Pi OS 64 位元或 Ubuntu Server arm64）。

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi 等級機器的注意事項：

- **資料磁碟區和 Postgres 優先使用 USB SSD 而非 SD 卡。**工作區會產生實際的磁碟 IO，而 SD 卡既慢又容易耗損。
- **一體式單一容器在這裡同樣適用**（未設定 `DATABASE_URL`/`REDIS_URL` 時使用嵌入式 Postgres 和 Redis），在記憶體受限的主機上，應透過 `REDIS_MAXMEMORY` 調低其嵌入式 Redis 的記憶體上限（見[設定](/zh-TW/guide/configuration)）。Compose 提供更細緻的逐服務控制，這也是本教學採用它的原因。
- **在 2 GB 裝置上加入 swap。**它能避免偶發的記憶體尖峰（一個大型 PDF、一個你忘了設上限的批次）以記憶體不足強制終止收場。zram 是對 SD 卡較友善的選擇。
- arm64 映像檔僅支援 CPU；ARM 板上沒有 CUDA。

## 調校參數 {#tuning-knobs}

所有上限都是環境變數，完整說明見[設定](/zh-TW/guide/configuration)。`0` 表示不限制或自動。在小型硬體上重要的有這些：

| 變數 | 小型機器建議值 | 它保護什麼 |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | 平行執行的工作數。自動偵測使用 CPU 核心數減一，在大機器上沒問題，但在記憶體吃緊的 2 核心機器上過於積極。 |
| `MAX_WORKER_THREADS` | `2` | 影像處理執行緒集區。 |
| `MAX_BATCH_SIZE` | `5` | 批次處理是 1-2 GB 機器最先耗盡記憶體的地方。 |
| `MAX_UPLOAD_SIZE_MB` | `100` | 防止單一巨大檔案佔滿整個工作區。 |
| `MAX_MEGAPIXELS` | `50` | 解碼一張 100+ MP 的影像無論檔案大小都要消耗記憶體。 |
| `MAX_VIDEO_DURATION_S` | `300` | 長時間轉檔會把小型 CPU 獨佔數分鐘到數小時。 |
| `PROCESSING_TIMEOUT_S` | `600` | 硬性上限，確保失控的工作最終會釋放機器。 |

這些上限規範的是伺服器接受什麼，所以請依你實際的用途設定，而不是越小越好。如果你從不處理影片，設定 `MAX_VIDEO_DURATION_S` 上限毫無代價；如果你每天掃描文件，就不要限制 `MAX_PDF_PAGES`。

## 應該略過什麼 {#what-to-skip}

- **重型 AI 套件組。**放大、照片修復和背景移除需要 GPU 或高速多核心 CPU，而且每個套件組要佔 4-5 GB 磁碟空間。在小型機器上，乾脆不要安裝它們；缺少對應套件組的工具會顯示安裝提示，而不會執行。
- **把影片重新編碼當作例行負載。**偶爾轉檔沒有問題（只是慢）；持續的轉檔佇列需要的是 CPU 核心，而不是一台 Pi。
- **整體而言，用不到的工具。**管理員可以在 Settings 中關閉個別工具，這會將它們從 UI 中移除並停止註冊其 API 路由。這本身不會節省記憶體，但能避免一台共用的小型執行個體被拿去跑硬體唯一扛不住的那種負載。

如果之後把執行個體移到更強的硬體上，移除這些上限（改回 `0`），同一個資料磁碟區可以直接沿用。
