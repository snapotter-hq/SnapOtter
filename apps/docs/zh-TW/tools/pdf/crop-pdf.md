---
description: "依邊界或依區域裁切 PDF 的所有頁面。"
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: e107a634e2e9
i18n_hash_version: 2
---

# 裁切 PDF {#crop-pdf}

裁切 PDF 的所有頁面，可以每一邊使用同一個邊界、每一邊使用各自的邊界，或裁切到某個區域，例如印在紙張一角的貨運標籤。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| mode | string | 否 | `uniform` | `uniform`, `sides`或`region` |
| margin | number | 否 | `20` | `uniform` 模式：每一邊的裁切邊界，以點（point）為單位（0-2000） |
| top, right, bottom, left | number | 否 | `0` | `sides` 模式：每一邊各自的裁切邊界，以點（point）為單位（0-2000） |
| x, y | number | 否 | `0` | `region` 模式：區域距頁面左邊緣與上邊緣的偏移，以點（point）為單位 |
| width, height | number | 否 | `288`, `432` | `region` 模式：區域的大小，以點（point）為單位（4x6 in 的標籤） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

只保留每頁左上角的 4x6 in 標籤：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## 注意事項 {#notes}

- 所有數值皆以 PDF 點為單位（1 點 = 1/72 英吋）。US Letter 頁面為 612 x 792 點。
- 每種模式只讀取自己的欄位，因此只傳送 `margin` 的請求仍可正常運作。
- 區域從每頁的左上角開始量測，且必須容納在每一頁之內。邊界必須為每頁留下一部分內容。否則請求會失敗，並回傳 `400`。
- 在設定為旋轉顯示的頁面上，位置與邊緣皆以頁面顯示時的樣子為準，因此區域的左上角就是旋轉後頁面的左上角。
- 每種模式都從完整的媒體框開始量測，因此裁切已裁切過的頁面會從完整頁面重新開始。統一邊界為 `0` 時會顯示整個媒體框。
