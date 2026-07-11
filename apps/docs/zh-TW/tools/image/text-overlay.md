---
description: "加入帶有陰影與背景框的樣式化文字覆蓋。"
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: b9dab7c8537a
---

# 文字覆蓋 {#text-overlay}

在影像上加入樣式化文字，並可選用陰影與半透明背景框。適用於照片上的標題、字幕或註解。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

接受包含影像檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| text | string | 是 | - | 要覆蓋的文字（1 至 500 個字元） |
| fontSize | number | 否 | `48` | 字型大小（像素）（8 至 200） |
| color | string | 否 | `"#FFFFFF"` | 文字顏色，以十六進位格式表示（`#RRGGBB`） |
| position | string | 否 | `"bottom"` | 垂直位置：`top`、`center`、`bottom` |
| backgroundBox | boolean | 否 | `false` | 在文字後方顯示半透明背景矩形 |
| backgroundColor | string | 否 | `"#000000"` | 背景框顏色，以十六進位格式表示（`#RRGGBB`） |
| shadow | boolean | 否 | `true` | 在文字後方套用陰影 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

搭配背景框：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## 注意事項 {#notes}

- 文字在影像內始終水平置中。
- 陰影使用 2px 偏移、3px 模糊，並以 70% 黑色不透明度呈現。
- 背景框以 70% 不透明度橫跨整個影像寬度，高度與字型大小成比例（1.8 倍）。
- 文字透過 SVG 合成算繪，因此使用系統的預設無襯線字型。
- 文字中的 XML 特殊字元會被安全地跳脫。
- 輸出格式與輸入格式相同。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
