---
description: "加入文字浮水印，並可設定位置、不透明度、旋轉與平鋪。"
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: b5397c3765fc
---

# 文字浮水印 {#text-watermark}

在影像上加入文字浮水印覆蓋。支援置於角落/中心的單一位置，或在整張影像上平鋪重複，並可設定字型大小、顏色、不透明度與旋轉。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

接受包含影像檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| text | string | 是 | - | 浮水印文字（1 至 500 個字元） |
| fontSize | number | 否 | `48` | 字型大小（像素）（8 至 1000） |
| color | string | 否 | `"#000000"` | 文字顏色，以十六進位格式表示（`#RRGGBB`） |
| opacity | number | 否 | `50` | 文字不透明度百分比（0 至 100） |
| position | string | 否 | `"center"` | 位置：`center`、`top-left`、`top-right`、`bottom-left`、`bottom-right`、`tiled` |
| rotation | number | 否 | `0` | 文字旋轉角度（度）（-360 至 360） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

在整張影像上平鋪浮水印：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
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

- 浮水印會算繪為 SVG 文字並合成到影像上，以保留輸出品質。
- 平鋪模式會依字型大小配置文字元素的間距（水平 6 倍、垂直 4 倍間距），上限為最多 500 個元素。
- 對於角落位置，距邊緣的內距等於字型大小。
- 所使用的字型為系統的預設無襯線字型。
- 文字中的 XML 特殊字元（`&`、`<`、`>`、`"`、`'`）會被安全地跳脫。
- 輸出格式與輸入格式相同。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
