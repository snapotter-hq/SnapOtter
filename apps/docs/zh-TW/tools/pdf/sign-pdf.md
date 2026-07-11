---
description: "使用正規化的頁面放置位置，將上傳的簽名影像蓋印到 PDF 上。"
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: b8a04f4e0c63
---

# 簽署 PDF {#sign-pdf}

將一個或多個上傳的簽名 PNG 影像蓋印到 PDF 的任何頁面上。此路由使用自訂的 multipart 合約，因為它需要 PDF、一個或多個簽名影像以及放置座標。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

接受 multipart 表單資料。PDF 以 `file` 傳送；簽名以 `sig0`、`sig1` 等方式傳送；放置位置則以 `placements` JSON 欄位傳送。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 要簽署的 PDF 檔案 |
| sig0 | file | 是 | - | 第一張簽名影像。額外的影像使用 `sig1`、`sig2` 等 |
| placements | JSON string | 是 | - | 放置物件的陣列：`{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | 否 | - | 用於透過 SSE 追蹤進度的選填 UUID |
| fileId | string | 否 | - | 選填的檔案庫 ID，用於將簽署結果儲存為新版本 |

## 放置座標 {#placement-coordinates}

| 欄位 | 類型 | 說明 |
|-------|------|-------------|
| sig | integer | 簽名影像索引。`0` 對應到 `sig0` |
| page | integer | 以零為起始的 PDF 頁面索引 |
| x | number | 以頁面比例表示的左側位置 |
| y | number | 以頁面比例表示的頂端位置 |
| w | number | 以頁面比例表示的簽名寬度 |
| h | number | 以頁面比例表示的簽名高度 |

座標使用左上角為原點。數值可能略微超出頁面邊緣；PDF 渲染器會將最終的蓋印裁切至頁面範圍。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

若請求無法在同步等待視窗內完成，API 會回傳：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

連線到 `/api/v1/jobs/<jobId>/progress`，並在工作完成時下載結果。

## 注意事項 {#notes}

- 接受的 PDF 輸入格式：`.pdf`。
- 簽名影像必須是有效的影像檔，通常是具有透明度的 PNG。
- 最多接受 100 張簽名影像與 100 個放置位置。
- `sign-pdf` 是一個自訂路由，不使用標準工具的 `settings` JSON 欄位。
