---
description: "透過指定位置與尺寸的區域來裁切圖片。"
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: 702781822ff4
---

# 裁切 {#crop}

透過位置與大小定義矩形區域來裁切圖片。支援像素與百分比兩種單位。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/crop`

接受包含圖片檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| left | number | 是 | - | 裁切區域的 X 偏移（自左邊緣起算） |
| top | number | 是 | - | 裁切區域的 Y 偏移（自上邊緣起算） |
| width | number | 是 | - | 裁切區域的寬度 |
| height | number | 是 | - | 裁切區域的高度 |
| unit | string | 否 | `"px"` | 數值的單位：`px` 或 `percent` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

使用百分比值裁切：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## 備註 {#notes}

- 裁切區域必須落在圖片邊界之內。若區域超出圖片，請求將會失敗。
- 使用 `percent` 單位時，數值代表圖片尺寸的百分比（例如 `left: 10` 表示距左邊緣 10%）。
- 輸出格式與輸入格式相符。
- 裁切前會自動套用 EXIF 方向，因此座標對應到視覺上正確的方向。
