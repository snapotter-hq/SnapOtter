---
description: "讀取並寫入 PDF 文件的中繼資料。"
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: 50d87a5d50cb
i18n_hash_version: 2
---

# PDF 中繼資料 {#pdf-metadata}

讀取並更新 PDF 文件的中繼資料欄位,例如標題、作者、主旨與關鍵字,或是完全移除文件的中繼資料。若未提供任何設定,則會回傳現有的中繼資料而不做修改。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

接受包含 PDF 檔案與選填 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| title | string | 否 | - | 文件標題(最多 500 個字元) |
| author | string | 否 | - | 文件作者(最多 500 個字元) |
| subject | string | 否 | - | 文件主旨(最多 500 個字元) |
| keywords | string | 否 | - | 文件關鍵字(最多 500 個字元) |
| stripAll | boolean | 否 | false | 移除整個 Info 字典(日期、Creator、Producer、自訂鍵)、所有 XMP 串流(文件、頁面、圖片)以及全部 PieceInfo 應用程式資料,然後寫入上方提供的任何欄位 |
| removeAttachments | boolean | 否 | false | 同時移除內嵌檔案:文件的附件清單、檔案附件註解與關聯檔案(`/AF`)。需要 `stripAll` |

所有參數皆為選填。除非設定了 `stripAll`,否則省略的欄位會維持不變。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## 注意事項 {#notes}

- 接受的輸入格式:`.pdf`。
- 這是一個快速(同步)工具,會直接回傳結果。
- 回應中的 `metadata` 欄位包含任何更新後所產生的中繼資料。
- 若要在不修改的情況下讀取中繼資料,請省略 `settings` 欄位或傳送一個空物件。
- 每個中繼資料欄位上限為 500 個字元。
- 使用 `stripAll` 時,回應還會帶有 `stripped`:被移除的 Info 鍵(`removed`)、文件 XMP 串流是否已移除(`xmpRemoved`)、輸入所宣告的 PDF/A 等級(`pdfa`,或 `null`)、從頁面、圖片與其他物件上移除的 XMP 串流數量(`objectXmpRemoved`)、移除的 PieceInfo 字典數量(`pieceInfoRemoved`),以及移除的內嵌檔案數量(`attachmentsRemoved`,未使用 `removeAttachments` 時一律為 `0`)。移除 XMP 會破壞 PDF/A 合規性。
- 單獨使用 `stripAll` 會保留內嵌檔案附件,因為移除它們會改變文件的內容。加上 `removeAttachments` 才會一併移除。這會移除 ZUGFeRD 與 Factur-X 電子發票中附帶的 XML,並破壞 PDF/A-3 合規性。
- 傳送 `removeAttachments` 而未搭配 `stripAll` 會回傳 400。
