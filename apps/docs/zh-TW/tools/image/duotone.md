---
description: "以自訂陰影與高光色套用雙色調效果。"
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 835ec2132cf0
---

# 雙色調 {#duotone}

為圖片套用雙色調效果。圖片會先轉為灰階，然後映射到陰影色（暗調）與高光色（亮調）之間的漸層。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/duotone`

接受包含圖片檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| shadow | string | 否 | `"#1e3a8a"` | 陰影十六進位色（套用於暗調） |
| highlight | string | 否 | `"#fbbf24"` | 高光十六進位色（套用於亮調） |
| intensity | integer | 否 | `100` | 效果強度（0-100）；0 回傳原圖，100 套用完整雙色調 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## 備註 {#notes}

- 輸出格式與輸入格式相符。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
- `intensity` 小於 100 時，會將雙色調結果與原圖混合，以呈現更細膩的效果。
- 常見的雙色調組合包含海軍藍／金色、藍綠色／珊瑚色，以及紫色／粉紅色。
