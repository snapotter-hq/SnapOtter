---
description: "SnapOtter 的發行說明與版本歷史。查看每個版本的新增、改進與修正內容。"
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 5e0ee35120c9
---

# 變更日誌 {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 將影像工具箱升級為完整的檔案處理套件：橫跨五種模態（Image、Video、Audio、PDF 與 Files）的 200+ 種工具，以 Postgres 17 與 Redis 支援的工作佇列重新打造，並提供單一指令的 `docker run`。這是一次重大發行；從 1.x 升級前請先閱讀「重大變更」。

### 新功能 {#new-features}

- **四種全新工具模態**：Video、Audio、PDF 與 Files 加入 Image 行列，使工具目錄達到 200+ 種。
- **持久化背景工作**：以 Redis 為後端的佇列（BullMQ）將每個工具都當作可追蹤的工作執行，並提供即時的 SSE 進度。
- **一體式單容器模式**：一個 `docker run` 即可啟動內建 Postgres 與 Redis 的完整執行個體。
- **隨需 AI 套件包**：背景移除、OCR、轉錄、放大、臉部偵測與強化、物件橡皮擦、上色與相片修復皆可從 UI 安裝。GPU 加速會依框架逐一偵測。
- **Sign PDF**：在瀏覽器中繪製、輸入或上傳簽名並放置到 PDF 上。
- **Automate**：串接工具的視覺化流程建構器，內含九個預建範本。
- **83 個一鍵轉換預設**：具備模糊搜尋的專用 JPG-to-PNG、MP4-to-GIF 等轉換器。
- **以圖層為基礎的影像編輯器**：位於 `/editor` 的 Konva 驅動編輯器，具備筆刷、形狀、調整、濾鏡與曲線。
- **Files 資料庫**：儲存任何結果並將其作為另一個工具的輸入重複使用。
- 已釘選的工具、畫布內縮放與平移、21 種語言，以及企業級功能（OIDC/SSO、SAML、SCIM、S3 儲存、逐工具權限、稽核匯出、分散式追蹤）。

### 改進 {#improvements}

- 可取消執行中的處理程序。(#137)
- 透過 LibRaw 進行全解析度 RAW 解碼，包含 DNG。(#289)
- 非 root 與外部 UID 部署（TrueNAS、Unraid、OpenShift、PUID/PGID）。(#230, #127)
- 準確的 AI 安裝偵測與經過強化的安裝流程。(#214, #352)
- 隱私強化：無自動第三方外傳，並提供選用的嚴格離線模式。
- 常駐的意見回饋按鈕，即使關閉分析功能也可使用。

### 錯誤修正 {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` 再次為工具路由停用速率限制。(#271)
- 修復 Docker 映像檔內部的 AI virtualenv 路徑。(#390)
- 相容於 sharp 0.35.2+。(#362)
- 影像編輯器版面修正：尺規、填滿行為、側邊欄與畫布尺寸。(#258, #259)
- 完成義大利文翻譯。(#231, #206, #425)
- 音訊 normalize 與 loudnorm 會保留來源取樣率。
- SSRF 強化：數值 IPv6 CIDR 比對與更廣泛的 URL 預先掃描。(#287)
- 產生的 PDF 會將 SnapOtter 標記為 Producer。
- mediapipe 可在 Python 3.13 與 Debian 13 上安裝。

### 重大變更 {#breaking-changes}

2.0 以 Postgres 17 取代內建的 SQLite 資料庫，並新增 Redis 8 作為工作佇列。你的 1.x 資料會在首次啟動時自動遷移，但容器堆疊已變更，所以請先備份整個 `/data` 磁碟區（1.x 以 WAL 模式執行 SQLite，因此已提交的資料通常位於 `snapotter.db-wal`）。接著選擇單容器映像檔（內建 Postgres 與 Redis，僅限 root）或 Compose 堆疊（app 加上 Postgres 17 與 Redis 8）。請參閱[遷移指南](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md)與[升級指南](/zh-TW/guide/upgrading)。

### 升級 {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

或使用 Docker Compose：

```bash
docker compose pull && docker compose up -d
```

[GitHub 上的完整差異](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

全新的 HTML to Image 工具、WCAG 2.2 AA 無障礙支援、來自滲透測試的安全強化，以及 5 項關鍵 Docker 修正。

### 新功能 {#new-features-1}

- **HTML to Image**：將 URL 或原始 HTML 擷取為 PNG/JPEG/WebP 的螢幕截圖。支援整頁擷取、自訂檢視區與深色模式。
- **Docker _FILE 密鑰慣例**：以檔案而非純文字方式掛載敏感的環境變數。(#205)
- **企業授權與 S3 儲存**：選用的商業授權金鑰與相容於 S3 的物件儲存。
- **形狀編輯器改進**：填色/描邊透明度、RGBA 選色器、虛線樣式。
- **預先建置的發行封存檔**：可從 GitHub Releases 下載 tarball 供非 Docker 安裝使用（Proxmox、裸機、LXC）。(#202)

### 改進 {#improvements-1}

- **WCAG 2.2 AA 無障礙支援**：跳過導覽、焦點鎖定、aria-live 區域、支援減少動態效果、正確的對比度。(#209)
- **行動裝置回應式**：回應式設定、行動裝置切換分頁時的 SSE 自動重新連線。(#203, #204)
- **背景移除品質**：邊緣平滑化、色彩去污、輸出格式選擇。
- **義大利文翻譯**：由 @albanobattistella 貢獻約 145 條新字串。(#206)
- **逐工具 API 文件**：53 個文件頁面，含參數、範例與回應格式。
- **AI 模型下載**：針對 HuggingFace 的重試邏輯與指數退避。(#201)

### 錯誤修正 {#bug-fixes-1}

- 全新的 Docker 容器完全無法使用（速率限制封鎖了所有請求）。
- 臉部偵測 AI 工具（blur-faces、red-eye-removal、enhance-faces、passport-photo）在所有平台上失敗。
- HEIC 檔案在 ARM 上損毀（libheif 符號不符）。
- Upscale 與 restore-photo 的 AI 套件包在 ARM 上安裝失敗。
- OCR 在 GPU 容器上使用了錯誤的 CUDA 版本。
- 透過十六進位 IPv4 對應的 IPv6 位址繞過 SSRF 防護。（貢獻者：@tonghuaroot）
- 含輔助影像的 iPhone HEIC 解碼。(#183, #199)
- Real-ESRGAN 在 8GB GPU 上發生 CUDA OOM。(#200)
- 6 個正式環境 Sentry 錯誤與 7 個 QA 錯誤。(#208)

### 安全性 {#security}

- 處理 10 項滲透測試發現（XFF 繞過、格式錯誤的 JSON 導致當機、無界限的管線、稽核日誌 XSS、TRACE 方法等）。(#207)
- 封鎖 SSRF 十六進位 IPv6 繞過。（貢獻者：@tonghuaroot）
- Dockerfile 基底映像檔以摘要（digest）釘選。

### 升級 {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

或使用 Docker Compose：

```bash
docker compose pull && docker compose up -d
```

[GitHub 上的完整差異](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

線上示範、逐工具著陸頁，以及一批潤飾修正。

### 新功能 {#new-features-2}

- **線上示範** - [demo.snapotter.com](https://demo.snapotter.com) 讓人們無需安裝任何東西即可試用 SnapOtter。
- **工具索引頁** - 在 `/tools` 瀏覽所有 50+ 種工具，並提供搜尋與類別篩選。
- **50+ SEO 著陸頁** - 現在每個工具都有專屬的著陸頁，含常見問題、使用情境與比較表。
- **背景預覽** - 前後對比滑桿會在透明影像後方顯示棋盤格背景。
- **強式密碼產生器** - 「新增成員」表單中的一鍵按鈕。

### 錯誤修正 {#bug-fixes-2}

- HEIC/HEIF 資訊工具不再失敗（已加入預先解碼）。
- AI 模型套件包安裝會顯示更好的錯誤訊息並遵守資源限制。
- 資料庫縮圖可正確載入（先前缺少驗證標頭）。
- People 與 Teams 設定表格中的下拉選單不再被裁切。
- 大小比較百分比在非壓縮工具上已隱藏。
- 移除重複的隱私權政策連結。
- 為 AI 功能設定新增義大利文翻譯。
- 更新已重新命名的 Lucide 圖示（Wand2、Columns）。

### 基礎設施 {#infrastructure}

- OpenSSF Scorecard 從 4.3 強化至約 7.0。
- CI 測試平行化為 4 個分片並縮小固定裝置檔案。
- 41 項相依套件更新。

### 升級 {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

或使用 Docker Compose：

```bash
docker compose pull && docker compose up -d
```

[GitHub 上的完整差異](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

五個新工具、一套完整的影像編輯器、SSO 登入、20 種語言。也許本該拆成三個獨立發行，但事已至此。

### 新功能 {#new-features-3}

- **影像編輯器** - 圖層、筆刷、形狀、調整、濾鏡、曲線、鍵盤快速鍵。在你的瀏覽器中執行，於你的硬體上處理。
- **OIDC / SSO 驗證** - 使用 Google、GitHub、Okta 或任何 OpenID Connect 供應商登入。設定幾個環境變數，你的團隊即可使用既有帳號。
- **迷因產生器** - 100 個內建範本，透過 opentype.js 進行文字算繪。也可上傳你自己的影像。
- **Beautify** - 放入一張螢幕截圖，得到一張精緻的影像。裝置外框（macOS、Windows、瀏覽器）、陰影、漸層、社群媒體預設。
- **色盲模擬** - 預覽影像在紅色盲、綠色盲、藍色盲與其他色覺缺陷下的樣貌。
- **PNG 透明度修正器** - 偵測偽透明的 PNG 並以 BiRefNet HR-matting 修正。可選用透過 LaMa 修復（inpainting）移除浮水印。
- **AI 畫布擴展** - 以 AI 填補延伸影像邊界。三種品質層級（快速、平衡、品質），視你願意投入多少 GPU 時間而定。
- **20 種語言** - 阿拉伯文、中文（簡體/繁體）、捷克文、荷蘭文、法文、德文、印地文、印尼文、義大利文、日文、韓文、波蘭文、葡萄牙文、俄文、西班牙文、泰文、土耳其文、烏克蘭文、越南文。阿拉伯文支援 RTL。
- **URL 匯入** - 將 URL 貼到拖放區或從清單批次匯入。伺服器端擷取並具備 SSRF 防護。
- **多檔案橡皮擦** - 在多張影像上繪製擦除遮罩，一鍵處理全部。筆觸會逐張影像保留。
- **管線匯入/匯出** - 將工具鏈儲存為 JSON，與他人分享。
- 透過 exiftool 支援 **17 種新的相機 RAW 格式**，加上 QOI、JP2、EPS、DDS、CUR、DPX、FITS、PPM/PGM/PBM、SVGZ 與 APNG 輸入。BMP、ICO、JP2、QOI 的新輸出編碼器。AVIF、TIFF、GIF、JXL 與 PSD 匯出已從先前遺失的分支中復原。

### 改進 {#improvements-2}

- **影像強化** - 以 CLAHE + normalise + gamma 取代舊管線。新的 Deep Enhance 切換使用 AI 模型以取得更積極的結果。
- **相片修復** - 刮痕偵測改以 8 角度 Otsu 過濾重寫。LaMa 修復現在以原生解析度執行。
- **各處皆支援特殊格式** - OCR、image-to-PDF、favicon 產生器、合成、拼接與向量化現在都可解碼 HEIC、RAW、PSD。
- **Compress** - 目標大小容差從 5% 收緊至 1%。目標大小為預設模式。新增步進按鈕與 KB/MB 單位選擇器。
- **Sentry 清理** - 過濾 644 個無需處理的事件。真正的錯誤現在會正確處理。
- **GPU 偵測** - 針對存在 CUDA 但沒有 nvidia-smi 的容器提供更好的診斷。
- **停用驗證模式** - 匿名使用者會以 admin 角色種入資料庫。API 金鑰、管線與使用者檔案不再因外鍵限制而失效。
- 橫跨單元、整合與 E2E 的 **2,705+ 個新測試**。

### 錯誤修正 {#bug-fixes-3}

- CPU 上的 Upscale 不再於 NAS 機箱與低功耗硬體上逾時。
- QR code 標誌不再讓預覽永久消失。
- 修正高長人像影像的裁切溢位。
- TIFF alpha 檔案會正確強制輸出 PNG，而非產生損毀結果。
- HDR/EXR 解碼會在 CLAHE 之前轉為 8 位元，修正解碼失敗問題。
- 臉部特徵點的輸入緩衝區會在送往 Python sidecar 前轉為 PNG，修正當機問題。
- 尋找重複項目可處理混合格式批次與網路錯誤。
- Beautify 預覽即時更新。
- 拼接與向量化的進度列。
- SVGZ 由 SVG 轉點陣圖處理。
- 透過百分比編碼的 X-File-Results 標頭修正非 ASCII 檔名。

### 升級 {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

或使用 Docker Compose：

```bash
docker compose pull && docker compose up -d
```

[GitHub 上的完整差異](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

具 GPU 自動偵測的統一 Docker 映像檔。單一映像檔即可處理 CPU 與 GPU 工作負載。簡化 compose 為含日誌輪替的單一檔案。模型預先下載現在包含驗證與冒煙測試。

---

## v1.13.0 {#v1-13-0}

以角色為基礎的存取控制（RBAC）。14 項細緻權限、三個內建角色（admin、editor、user）、支援自訂角色。所有 API 路由皆進行權限檢查。前端分頁依使用者權限篩選。

---

## v1.12.0 {#v1-12-0}

PDF to Image 工具。以自訂 DPI 將 PDF 頁面轉換為 PNG、JPEG、WebP 或 TIFF。具 GPU 自動偵測的統一 Docker 映像檔。

---

## v1.11.0 {#v1-11-0}

透過 vitepress-plugin-llms 自動產生 llms.txt，提供對 AI 友善的文件。

---

## v1.10.0 {#v1-10-0}

具臉部保護的內容感知縮放（seam carving）。在保留重要內容的同時縮放影像。

---

## v1.9.0 {#v1-9-0}

Stitch / Combine 工具。將影像並排、垂直堆疊或以自訂格線接合。

---

## v1.8.0 {#v1-8-0}

Edit Metadata 工具。以細緻的移除/保留介面檢視並編輯 EXIF、IPTC 與 XMP 中繼資料。

---

## 較舊的發行 {#older-releases}

如需含修補程式發行的完整逐提交變更日誌，請參閱 [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases)。
