---
description: "SnapOtter 收集哪些匿名使用資料、何時傳送、首次執行時的選擇如何運作,以及如何關閉整個執行個體的產品分析。"
i18n_source_hash: f3cfb0b3f961
i18n_provenance: machine
i18n_output_hash: 41449e31687d
i18n_hash_version: 2
---

# SnapOtter 收集的內容 {#what-snapotter-collects}

Anonymous Product Analytics 由管理員為整個執行個體設定。新的執行個體會在首次執行時詢問,在有人回答之前不會傳送任何內容。您可以隨時在 Settings > System > Privacy 中變更。

開啟分析後,SnapOtter 會向 PostHog 傳送執行了哪些工具與管線、耗時多久、是否成功、錯誤代碼與檔案數量,以及執行個體的匿名 ID、版本、CPU 架構、作業系統、安裝類型和是否有 GPU。當機報告會傳送到 Sentry,其中的檔案名稱、路徑、電子郵件與引號內的值都已被移除。它絕不會傳送您的檔案、檔案名稱或路徑、檔案內容、OCR 輸出或擷取的文字、影像中繼資料,也不會傳送您的帳號身分。它只會向 PostHog 和 Sentry 這兩個地方傳送資料,關閉分析後則不會向任何一方傳送任何內容。

## 首次執行時的選擇 {#first-run-choice}

管理員第一次開啟新的執行個體時,SnapOtter 會詢問:「要傳送匿名使用統計和當機報告嗎? 您的檔案永遠不會被傳送。」兩個答案的份量相同,且都沒有預先選取。不回答就關閉提示會讓分析維持關閉,並在下次造訪時再次詢問。只有管理員會看到它。在 `AUTH_ENABLED=false` 下沒有帳號,本機使用者即為管理員,因此誰開啟應用程式誰來回答。桌面應用程式的詢問方式相同。

在此提示出現之前就已執行的執行個體不會被詢問。它會保留原有的分析設定:除非管理員或 `SNAPOTTER_ANALYTICS_DEFAULT=off` 將其關閉,否則維持開啟。

## 我們傳送的事件(啟用時) {#events-we-send-when-enabled}

- tool_used:工具 ID、狀態、耗時、類別、是否為 AI 工具,失敗時附帶錯誤代碼,以及單獨回報某一階段的工具的步驟名稱(Passport Photo 的分析步驟)。
- pipeline_executed:步驟數、工具 ID、批次旗標、檔案數量、耗時、狀態。
- ai_bundle_action:套件 ID、動作(`install_started`、`installed`、`install_failed`、`uninstalled`、`reset_environment` 或 `imported`)、耗時,安裝失敗時另含來自固定清單的失敗類別(`oom`、`network`、`disk`、`checksum`、`cpu_unsupported`、`timeout` 或 `other`)。安裝程式輸出、路徑和錯誤訊息絕不會傳送。
- 前端使用情況:開啟了哪些工具頁面、新增的檔案(僅數量)、啟動的工具、下載、儲存、搜尋(僅結果數量)、已處理的批次。
- 當機報告:錯誤類型、經過遮蔽的錯誤訊息(已移除檔案名稱、路徑、電子郵件與引號內的值)、僅含檔案基本名稱的原始碼堆疊,以及對於 AI 工具,僅含檔案基本名稱的 Python 回溯。

## 我們絕不收集的內容 {#what-we-never-collect}

- 檔案名稱或路徑
- 檔案內容
- OCR 輸出文字
- 影像中繼資料(EXIF)
- 擷取的文件文字
- 您的帳號身分

與任何伺服器一樣,PostHog 能看到每個請求來自的 IP 位址。我們的 PostHog 專案會捨棄它而不是儲存它,SnapOtter 自己的伺服器事件則會傳送一個預留位置來取代。

## 更新通知 {#update-notices}

開啟分析期間,伺服器每隔幾小時會使用執行個體的匿名 ID 和版本向 PostHog 詢問最新的 SnapOtter 版本是哪個。有更新版本時,管理員會看到一則附有版本說明連結的通知。關閉通知後,它會一直隱藏到下一個版本。不會替您安裝或下載任何內容,關閉分析後伺服器也不會再詢問。

## 關閉方法 {#turning-it-off}

管理員:在 Settings > System > Privacy 中將 "Anonymous Product Analytics" 關閉。它會立即停止,對整個執行個體生效。若要建置一個永遠不會傳送資料的映像檔,請設定 `SNAPOTTER_ANALYTICS=off` 建置參數。在伺服器環境中設定 `SNAPOTTER_TELEMETRY=off` 可在執行階段達到同樣效果,並且優先於應用程式中儲存的任何回答。

若要事先回答首次執行的問題,請在伺服器第一次啟動之前,將 `SNAPOTTER_ANALYTICS_DEFAULT=off`(或 `on`)加入伺服器環境中,這樣就不會詢問任何人。使用 Docker Compose 時,請把它放在應用程式服務的 `environment:` 下,因為只在 `.env` 中設定不會傳到容器裡。
