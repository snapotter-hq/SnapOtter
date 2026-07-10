---
description: "以純色、透明或模糊背景將圖片填補至目標長寬比。"
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 72e3f92dca06
---

# 圖片填補 {#image-pad}

在圖片周圍加上純色、透明或模糊背景，將其填補至目標長寬比。適合在不裁切的情況下，將圖片套入社群媒體或列印所需的固定長寬比。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

接受包含一個圖片檔案的 multipart 表單資料，以及一個 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| target | string | 否 | `"1:1"` | 目標長寬比：`16:9`、`9:16`、`1:1`、`4:3`、`3:4` 或 `custom` |
| ratioW | integer | 否 | `1` | 自訂比例寬度（1-100，當 target 為 `custom` 時使用） |
| ratioH | integer | 否 | `1` | 自訂比例高度（1-100，當 target 為 `custom` 時使用） |
| background | string | 否 | `"color"` | 背景模式：`color`、`transparent` 或 `blur` |
| color | string | 否 | `"#ffffff"` | 背景十六進位色碼（當 background 為 `color` 時） |
| padding | integer | 否 | `0` | 額外內距，以畫布的百分比表示（0-50） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## 注意事項 {#notes}

- `blur` 背景模式會建立原始圖片的模糊副本作為填補內容，產生視覺上一致的結果。
- 使用 `transparent` 背景時，輸出會轉換為 PNG 以保留 alpha 通道。
- 除非涉及透明度，否則輸出格式會與輸入格式相同。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
- 將 `target` 設為 `custom`，並提供 `ratioW` 與 `ratioH` 以指定任意長寬比（例如 `ratioW: 3, ratioH: 2` 表示 3:2）。
