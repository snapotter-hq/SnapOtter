---
description: "加入暈影效果，並可調整強度、顏色與位置。"
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: d4a363bf211f
---

# 暈影 {#vignette}

加入暈影效果，使影像邊緣變暗或著色。支援可調整的強度、顏色、半徑、柔和度、圓潤度與中心位置。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/vignette`

接受包含影像檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| strength | number | 否 | `0.5` | 暈影不透明度（0.1-1） |
| color | string | 否 | `"#000000"` | 暈影十六進位顏色 |
| radius | integer | 否 | `70` | 外半徑，以半對角線的百分比表示（0-100） |
| softness | integer | 否 | `50` | 羽化柔和度（0-100）；值越高產生越漸進的淡化 |
| roundness | integer | 否 | `100` | 形狀：100 = 圓形，0 = 符合影像長寬比的橢圓 |
| centerX | integer | 否 | `50` | 水平中心位置，以百分比表示（0-100） |
| centerY | integer | 否 | `50` | 垂直中心位置，以百分比表示（0-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## 注意事項 {#notes}

- 較小的 `radius` 會讓影像更大範圍變暗；較大的半徑則將暈影限制在最外圍的邊緣。
- 使用非黑色的 `color`（例如白色或褐色調）可製作創意暈影效果。
- 調整 `centerX` 與 `centerY` 可讓清晰區域偏離中心，適用於將焦點引導至不在畫面中央的主體。
- 輸出格式與輸入格式相同。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
