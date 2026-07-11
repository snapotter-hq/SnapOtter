---
description: "SnapOtter 會收集哪些匿名使用資料、何時傳送，以及如何關閉整個執行個體的產品分析。"
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 2f233be10af9
---

# SnapOtter 收集的資料 {#what-snapotter-collects}

匿名產品分析預設為開啟，並由管理員針對整個執行個體設定。請在 Settings > System > Privacy 下將其關閉。

## 我們傳送的事件（啟用時） {#events-we-send-when-enabled}

- tool_used：工具 id、狀態、時長、類別、是否為 AI 工具，以及失敗時的錯誤代碼。
- pipeline_executed：步驟數、工具 id、批次旗標、檔案數、時長、狀態。
- ai_bundle_action：套件包 id、動作、時長。
- 前端使用情形：開啟了哪些工具頁面、新增的檔案（僅計數）、已啟動的工具、下載、儲存、搜尋（僅結果數量）、已批次處理。
- 當機回報：錯誤類型，以及僅含檔案基本名稱的來源堆疊。

## 我們絕不收集的資料 {#what-we-never-collect}

- 檔案名稱或路徑
- 檔案內容
- OCR 輸出文字
- 影像中繼資料（EXIF）
- 擷取的文件文字
- 您的 IP 位址或帳號身分

## 關閉它 {#turning-it-off}

管理員：Settings > System > Privacy，將「Anonymous Product Analytics」關閉。它會立即停止，涵蓋整個執行個體。若要建置一個永遠無法發送的映像，請設定 `SNAPOTTER_ANALYTICS=off` build arg。
