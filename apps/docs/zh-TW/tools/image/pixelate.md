---
description: "對整張圖片或特定區域套用馬賽克效果。"
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 322d111eaa4e
---

# 馬賽克 {#pixelate}

對整張圖片或特定矩形區域套用馬賽克效果。適用於遮蔽敏感內容，例如臉孔、車牌或個人資訊。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

接受 multipart 表單資料，包含一個圖片檔案與一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| blockSize | integer | 否 | `12` | 像素方塊大小（2-128）；數值越大馬賽克越粗 |
| region | object | 否 | - | 將馬賽克限制在一個矩形內（見下方） |

### Region 物件 {#region-object}

| 欄位 | 類型 | 必填 | 說明 |
|-------|------|----------|-------------|
| left | integer | 是 | 左側位移（像素，>= 0） |
| top | integer | 是 | 頂部位移（像素，>= 0） |
| width | integer | 是 | 區域寬度（像素，>= 1） |
| height | integer | 是 | 區域高度（像素，>= 1） |

## 範例請求 {#example-request}

將整張圖片馬賽克化：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

將特定區域馬賽克化：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## 注意事項 {#notes}

- 當省略 `region` 時，整張圖片都會被馬賽克化。
- 區域座標以像素為單位，相對於圖片的左上角。區域必須落在圖片邊界內。
- 輸出格式與輸入格式相符。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
