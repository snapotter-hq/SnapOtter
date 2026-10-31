---
description: "SnapOtter 的發行說明與版本歷史。查看每個版本的新增、改進與修正內容。"
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: 85b5a84afe5c
---

# 變更日誌 {#changelog}

## v2.2.0 {#v2-2-0}

2.2 的大部分內容都在強化安全性。持有委派 `users:manage` 角色的非管理員原本可以接管整個執行個體，而且每個工具端點都被發現少了權限檢查。如果你有多個使用者，請升級。

其餘則是自架環境的長尾問題：開始了卻永遠不會完成的下載、才加入第二個檔案就壞掉的預設集、Postgres 還在啟動時就不斷重啟的容器。此外還多了兩個新工具。文件與網站現在已翻譯成 21 種語言，介面也終於通過 WCAG AA 對比度標準。

> [!IMPORTANT]
> 如果你曾透過自訂角色將 `users:manage` 授予非管理員，該角色在 2.0.0 到 2.1.0 上可以接管管理員帳號。詳情請見「安全性」。

### 安全性 {#v2-2-0-security}

- **透過委派 `users:manage` 角色造成的權限提升（GHSA-9xgh-95qh-2x7h）。** 透過自訂角色持有 `users:manage` 的非管理員，可以重設或刪除權限更高的帳號（內建管理員也包括在內），進而接管整個執行個體。密碼重設與帳號刪除現在會驗證呼叫者對目標的權限層級，因此委派角色無法踰越自身層級。受影響版本：2.0.0 到 2.1.0。由李春來（Chunlai Li）回報。(#616)
- **每個工具端點現在都有權限檢查。** 工具存取原本是逐一路由強制執行，因此 45 個手寫路由都必須記得呼叫同一個檢查，而它們全都沒做。沒有 `tools:use` 的角色仍可執行 image-to-pdf、erase-object、upscale、sign-pdf 等工具。這項檢查現在集中於一個以比對到的路由為依據的 preHandler，因此涵蓋子路徑以及日後新增的任何路由。(#646)
- **Docker 安裝的速率限制可被繞過。** 映像檔原本隨附 `TRUST_PROXY=true`，因此用戶端 IP 取自請求標頭，偽造的 `X-Forwarded-For` 就能繞過登入限制器。現在預設值是一份私有網路信任清單。(#649)
- **設定寫入會依每一項設定分別檢查**，而不是只在入口檢查一次；設定匯入現在也具備交易性，因此被拒絕的鍵不會留下只套用一半的設定。(#618)
- **檔案庫的檔名無法逃出儲存根目錄。** 精心構造的儲存名稱（惡意的 1.x SQLite 匯入會原樣複製）原本可以讀取或刪除檔案目錄以外的檔案。只有在操作員匯入攻擊者提供的 1.x SQLite 資料庫後才可能觸及，那也是唯一能讓儲存名稱被自行指定的路徑。由 @Alpastx 回報。(GHSA-55w2-8cqf-w969, #600)
- **取消作業會強制檢查擁有權**，因此已驗證的使用者再也無法用 id 取消他人的作業。由 @Alpastx 回報。(GHSA-wqxf-gj2p-689x, #599)
- **對整個 2.0 程式樹的重新稽核揪出了仍存在的問題**：擷取到的 SAML 判斷提示可以被重放、MFA 挑戰在任意次數的錯誤驗證碼後仍然有效、每次請求的 API 金鑰查詢都是全表掃描、`MAX_WORKSPACE_SIZE_GB` 是無效設定，而且 SVG 淨化器放行了未加引號的 `javascript:` href。(#620)
- **修補了九個已揭露的 CVE**：fast-uri、svgo、sharp 與 tar 的間接相依 (#619)，以及 Pillow 12.3.0 (#517)。arm64 上的 RAW 解碼現在會從原始碼建置 LibRaw 0.22.2，而不再連結未修補的系統版本。(#649)

### 新功能 {#v2-2-0-new-features}

- **圓角裁切**：圓角方形與 iOS 風格的超橢圓遮罩，附圓角半徑控制項。為 favicon 與應用程式圖示而打造。(#602)
- **移除 GIF 背景**：逐格去除動畫 GIF、WebP 或 APNG 的背景，取回透明動畫。(#502)
- **物件橡皮擦的套索與高品質模式**：拖曳自由形狀的圈選範圍，而不必逐像素塗抹；並可選擇安裝擴散式修補套件包，讓大面積填補更乾淨。(#503, #566)
- **另存新檔，或直接覆寫。** 以往編輯檔案庫中的檔案會默默取代原始檔。現在每次編輯都由你選擇，而預設會保留原始檔。(#564, #577)
- **調整大小中的長寬比預設集。** 選擇 1:1、4:3 或 16:9，兩個維度就會保持鎖定，且不會放大。(#530)
- **雙層 OCR**：快速層已內建於映像檔，可離線執行且無需下載；更準確的運行時則隨需安裝。(#519)
- **隨處輸入即可搜尋。** 在儀表板或首頁開始打字，就會直接進入搜尋框。(#644)
- **文件與網站支援 21 種語言**：文件網站、行銷頁面與 API 參考現在都已翻譯，與應用程式介面一致。新增的低資源部署指南涵蓋 Raspberry Pi 與 2 GB 機器。(#548)
- **更清楚的工具名稱**：18 個容易混淆的名稱現在會自我說明，因此「Compress」變成「Compress Image」。工具 id 與路由維持不變，因此不會有任何書籤失效。(#520)

### 改進 {#v2-2-0-improvements}

- **整個介面符合 WCAG AA 對比度**：調色盤經過重新調整，鮮豔的橘色保留在填充區塊，文字與標籤則改用兼具無障礙性的墨色權杖；全部 57 個焦點指示器現在都通過 3:1 的非文字對比門檻。(#567, #574)
- **放大與去背不再看起來像卡住**：推論期間進度列會持續前進，而不是停在 30%；兩個工具現在也會提醒，僅有 CPU 的主機速度會慢得多。(#605, #608)
- **逾時訊息會指出真正的原因**，並將僅有 CPU 的主機納入考量，而不是把問題推給上傳。(#596)
- **SnapOtter 啟動時會等待 Postgres 與 Redis**，而不是陷入不斷重啟的迴圈，Compose 與一體式映像檔皆然。在這之前，某個 Proxmox LXC 安裝曾重啟 76 次。(#537, #595)
- **下載能撐過反向代理**：SnapOtter 會要求 nginx 與相容的代理不要緩衝檔案回應，這正是自架環境下載會開始卻永遠不完成的一般原因。(#604, #607)
- **壓縮 PDF 能落在接近目標大小的範圍**，而當目標無法達成時，也會誠實說明。(#522)
- **行動版工具控制項保持可觸及**，因為應用程式外殼現在會依動態視埠調整大小。(#559)
- **轉換音訊提供取樣率設定。** (#561)
- **管理員可以放寬密碼長度下限**，在受信任的區域網路執行個體上最低可設為 1。(#543)
- **MFA 改為自助式**，原則造成的鎖定問題已修補，OIDC 或 SAML 登入會收到真正的 MFA 挑戰，而不是直接遭到封鎖。(#531, #536)
- **光禿禿的 `Error: Error` 現在會說明原因。** Sharp 編碼失敗、AI sidecar 結束、文件 sidecar 輸出非 JSON，以及去背失敗，以往送達時原因都已被抹除。(#532, #534, #535, #538, #612)
- **說明對話框已翻譯。** 它的快速鍵標籤與入門文字原本寫死為英文，而 21 個語系檔案裡早已有完成的翻譯卻未被使用。(#647)

### 錯誤修正 {#v2-2-0-bug-fixes}

- **iPhone 的 HEIC 檔案遭到拒絕**，在送達能處理它們的解碼器之前就被判定為無法讀取。(#631)
- **轉換預設集在處理第二個檔案時失敗**：jpg-to-pdf 與其 image-to-pdf 系列工具，加上 pdf-to-png、pdf-to-jpg 與 pdf-to-tiff，只要上傳兩個檔案就全都傳回 `Tool not found`。(#633, #643)
- **PDF 轉換預設集失去了下載按鈕。** (#629)
- **無限制的處理逾時沒有被遵守**，而停滯的進度串流現在會恢復，不再讓介面一直等待。(#638)
- **已儲存檔案比記錄長度還短時，下載會卡住而不是失敗。** (#617)
- **PDF 頁面工具在短文件與加密檔案上失敗**：移除頁面預設使用只有六頁以上的文件才有的頁面範圍，而受密碼保護的 PDF 在工作程式內以難以理解的錯誤失敗。(#594)
- **PDF 轉文字對掃描版 PDF 會默默傳回空檔案。** 現在會引導你改用 OCR，並以 UTF-8 提供文字。(#603)
- **PDF 轉 Word 會遺失彩色文字區塊**，並將它們拆散到頁面各處。(#500)
- **物件橡皮擦會留下殘影**，並在高解析度影像中把小物件弄糊。(#501)
- **影片穩定化在沒有 faststart 時會寫出無法播放的輸出。** (#593)
- **影像編輯器修正**：旋轉、翻轉、調整大小、色階、曲線、濾鏡與圖層鎖定。(#597)
- **簽署 PDF 會顯示空白畫布**，而不是回報 PDF 載入失敗的原因。(#545)
- **檔案庫會記錄 0x0 的尺寸**，並略過 HEIC、RAW 與 PSD 上傳的預覽。(#636, #637)
- **安裝一個以上的 AI 套件包**會讓共用的 virtualenv 出現多個版本，並悄悄弄壞三個工具。(#649)
- **以品質 1 到 4 轉換為 JXL 會傳回 500**，而缺少 ffmpeg 會被回報成上傳檔案損毀。(#649)
- **短暫的 Postgres 中斷會讓已完成的工作擱淺**，輸出留在磁碟上卻沒有任何資料列指向它。現在有對帳程式會接手這些工作，而不是任其被丟棄。(#649)
- **Redis 端點變更位址時會卡死所有消費者**，而健康檢查仍回應 200。(#649)
- **網站與文件修正**：在地化連結不再丟失 `#` 片段或把 `zh-CN` 轉成小寫，文件導覽列在平板上會留在視埠內，而且兩個網站都不再從你的瀏覽器呼叫 GitHub API。(#516, #562, #570, #560)

### 升級注意事項 {#v2-2-0-upgrade-notes}

沒有需要移轉的項目，但有兩個隨附的預設值變更了：

- **`TRUST_PROXY` 現在預設為 `loopback,linklocal,uniquelocal`**，而不再信任每一個對端。Docker bridge 與 Compose 網路都落在這個範圍內，因此大多數設定無需變更。如果你的反向代理是從公開位址連到 SnapOtter，請明確設定 `TRUST_PROXY`，否則速率限制與稽核記錄會把每個請求都歸因於代理。
- **`MAX_AI_JOBS_PER_USER` 預設為 5**，也就是每位使用者同時進行的單檔 AI 作業上限。批次與管線的 AI 執行仍不設上限。

新增的選用旋鈕：`DB_STARTUP_TIMEOUT_MS`、`SUBPROCESS_MEMORY_LIMIT_MB`（預設關閉）與 `GIF_BG_MAX_FRAMES`。

### 致謝 {#v2-2-0-acknowledgements}

這次發行有相當大一部分，是從別人回報的錯誤開始的。

程式碼與貢獻：

- **@mvanhorn** ❤️：把 remove-background 的逾時失敗改寫成能說明該怎麼處理的訊息，而不是光禿禿的逾時。(#518, #494)
- **@EuanTop** ❤️：讓同步路由傳回標準的工具結果契約，藉此恢復 PDF 轉換預設集頁面上的下載動作。(#629, #623)
- **@harshjainnn** ❤️：診斷出開始卻永遠不完成的下載問題，並提出修復所依據的 socket 重設方向。(#617, #590)

安全性揭露：

- **李春來（Chunlai Li）** ❤️（[@laijunyue](https://github.com/laijunyue)）：私下揭露了透過委派 `users:manage` 角色的權限提升問題，並附上完整的來源到匯點分析與可運作的攻擊鏈。(GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️（Alpesh Bhagwatkar）：揭露了作業取消功能的已驗證 IDOR，以及惡意 1.x SQLite 匯入後可觸及的檔案庫儲存檔名路徑遍歷，並各自附上可運作的概念驗證。(#599, #600)

錯誤回報：

- **@riz467** ❤️：真實的 iPhone HEIC 檔案在驗證階段遭拒，並在回報中釐清了根本原因。(#622)
- **@coupej** ❤️：PDF 預設集頁面永遠卡住，以及 jpg-to-pdf 只要加入第二個檔案就失敗。兩個截然不同的錯誤，被正確地區分開來。(#623, #627)
- **@linuxuser1** ❤️：`PROCESSING_TIMEOUT_S=0` 文件上寫的是無限制，實際上卻上限為五分鐘。(#630)
- **@bezibaerchen** ❤️：轉換音訊隱藏了它自己的說明所承諾的取樣率設定。(#558)
- **@hell-toupee** ❤️：準確 OCR 套件包因 `libpaddle` 錯誤而無法安裝。(#505)
- **@Michael1260** ❤️ 與 **@And-CSH** ❤️：各自獨立確認了該 OCR 安裝失敗，並確立手動解壓縮可行而應用程式內安裝程式不行，從而把錯誤定位到安裝程式。(#505)
- **@TomErnst1972** ❤️：啟用要求 MFA 的原則後，管理員被鎖在自己的執行個體之外。(#515)
- **@thokich** ❤️：物件擦除產生模糊、無法使用的填補結果，這促成了 HD 修補的改寫以及選用的高品質套件包。(#141)
- **@Hennie-git** ❤️：某個 Proxmox LXC 安裝對尚不接受連線的 Postgres 重啟了 76 次。（community-scripts/ProxmoxVE#15796）
- **MickLesk** ❤️（Proxmox VE community-scripts）：即時分流了該回報，並提出啟動修正所依據的診斷。(#537)

功能需求與意見回饋：

- **@LECOQQ** ❤️：要求在家庭伺服器安裝中放寬密碼複雜度。(#136)
- **@killervette42** ❤️：要求提供 Unraid Community App，現已發佈到 Unraid CA 商店。(#96)
- **@alienatedsec** ❤️：指出「GPU 退回 CPU」的修正被埋在已關閉的 issue 裡、難以發現，這也是它現在被寫進部署文件的原因。(#490, #587)
- **@neilp316** ❤️：確認了 RTX 5060 上的 Blackwell GPU 失敗，並整理出可行的 CUDA 12.8 升級路徑。(#120)
- **@Roiki11** ❤️：主張在跨機器的 AI 運算上，以路徑參照的共享儲存取代 HTTP 檔案傳輸。(#189)

同樣感謝透過 Discord 與電子郵件回報以下問題、但我們未記錄姓名的社群成員：超橢圓裁切的需求 (#602)、開始卻永遠不完成的 image-to-PDF 下載 (#604, #607)、刪除頁面工具卡住 (#594)、pdf-to-text 遺漏阿拉伯文 (#603)，以及 ONNX GPU 備援背後的診斷 (#490)。

[GitHub 上的完整差異](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
