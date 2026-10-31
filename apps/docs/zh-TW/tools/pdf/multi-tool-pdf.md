---
description: "在單一編輯器或透過 API 重新排序、旋轉、刪除 PDF 頁面，並從其他 PDF 拉取頁面。"
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 3dcc751c4e0c
i18n_hash_version: 2
---

# PDF 多功能工具 {#multi-tool-pdf}

透過明確的頁面計劃組合 PDF：重新排序、複製、旋轉或刪除頁面，並從其他 PDF 拉取頁面，所有操作皆在單一請求中完成。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

接受包含一個或多個 PDF 檔案及一個 JSON `settings` 欄位的 multipart 表單資料。
每個請求最多支援 20 個輸入文件與 1,200 個輸出頁面。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 描述 |
|-----------|------|----------|-------------|
| items | array | 是 | 按輸出順序排列的輸出頁面計劃。每個項目為 `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`。`doc` 以上傳順序索引上傳的檔案（從 0 開始）；`page` 是該文件中以 1 為基準的頁碼。 |
| pageCounts | array | 是 | 每個上傳文件的實際頁數，順序相同。計劃中的頁面超出其文件頁數時，會以 400 拒絕。 |

## 請求範例 {#example-request}

取第一份文件的第 3 頁與第 1 頁，再取第二份文件的第 1 頁與第 2 頁，將第一個輸出頁面旋轉 90° 順時針：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## 回應範例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## 注意事項 {#notes}

- 同一頁面可以在 `items` 中出現多次以複製它。
- 未出現在 `items` 中的頁面將從輸出中省略。
- `rot` 記錄複製頁面上的新顯示方向（與任何現有旋轉組合）；頁面內容不會被修改。
- 旋轉按每個輸出副本套用，因此副本可以有不同的旋轉。
- 輸出為新的扁平文件；來源書籤與文件層級的中繼資料不會保留。
- 處理需要 qpdf 二進位檔案，該檔案包含在官方 Docker 映像中。
