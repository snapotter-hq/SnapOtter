---
description: "將圖片旋轉任意角度並水平或垂直翻轉。"
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: 3946b7378b3f
---

# 旋轉與翻轉 {#rotate-flip}

將圖片旋轉任意角度，以及／或水平或垂直翻轉。旋轉與翻轉操作可在單一請求中結合使用。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/rotate`

接受 multipart 表單資料，包含一個圖片檔案與一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| angle | number | 否 | `0` | 旋轉角度（度，順時針）。接受任意數值。 |
| horizontal | boolean | 否 | `false` | 水平翻轉圖片（鏡像） |
| vertical | boolean | 否 | `false` | 垂直翻轉圖片 |

## 範例請求 {#example-request}

順時針旋轉 90 度：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

水平翻轉：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

同時旋轉與翻轉：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## 注意事項 {#notes}

- 會先套用旋轉，接著進行翻轉操作。
- 非 90 度的旋轉（例如 45 度）會擴大畫布以容納旋轉後的圖片，並依輸出格式填入透明或黑色。
- 常見數值：90、180、270 用於四分之一圈旋轉。
- 處理前會自動套用 EXIF 方向，因此旋轉是相對於視覺方向。
