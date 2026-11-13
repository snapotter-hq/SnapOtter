---
description: "SnapOtter 會收集哪些匿名使用資料、何時傳送，以及如何關閉整個執行個體的產品分析。"
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: 544fc5bac74d
i18n_hash_version: 2
---

# SnapOtter 收集的資料 {#what-snapotter-collects}

匿名產品分析預設為開啟，並由管理員針對整個執行個體設定。請在 Settings > System > Privacy 下將其關閉。

## 我們傳送的事件（啟用時） {#events-we-send-when-enabled}

- tool_used：工具 id、狀態、時長、類別、是否為 AI 工具，以及失敗時的錯誤代碼。
- pipeline_executed：步驟數、工具 id、批次旗標、檔案數、時長、狀態。
- ai_bundle_action：套件包 id、動作、時長。
- 前端使用情形：開啟了哪些工具頁面、新增的檔案（僅計數）、已啟動的工具、下載、儲存、搜尋（僅結果數量）、已批次處理。
- 當機回報：錯誤類型、經過遮蔽處理的錯誤訊息（已移除檔案名稱、路徑、電子郵件地址與加引號的值）、僅含檔案基本名稱的來源堆疊，以及（AI 工具的）僅含檔案基本名稱的 Python 回溯。

## 我們絕不收集的資料 {#what-we-never-collect}

- 檔案名稱或路徑
- 檔案內容
- OCR 輸出文字
- 影像中繼資料（EXIF）
- 擷取的文件文字
- 您的帳號身分

和任何伺服器一樣，PostHog 看得到每個請求來源的 IP 位址。我們的 PostHog 專案會捨棄該位址而不儲存，SnapOtter 自己的伺服器事件則會以預留值取代它送出。

## 更新提示 {#update-notices}

分析功能開啟期間，伺服器每隔幾小時會以執行個體的匿名 ID 與目前版本向 PostHog 查詢 SnapOtter 的最新版本。有更新的版本時，管理員會看到一則附有版本說明連結的提示。關閉提示後，在下一個版本發布前不會再次出現。系統不會替你安裝或下載任何內容；分析功能關閉時，伺服器不會發出查詢。

## 關閉它 {#turning-it-off}

管理員：Settings > System > Privacy，將「Anonymous Product Analytics」關閉。它會立即停止，涵蓋整個執行個體。若要建置一個永遠無法發送的映像，請設定 `SNAPOTTER_ANALYTICS=off` build arg。

若要讓新的執行個體一開始就關閉分析，請在伺服器首次啟動前，將 `SNAPOTTER_ANALYTICS_DEFAULT=off` 加入伺服器的環境變數。使用 Docker Compose 時，請把它放在應用程式服務的 `environment:` 底下，因為只在 `.env` 中設定並不會傳到容器裡。
