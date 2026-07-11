---
description: "一鍵自動增強，分析圖片並校正曝光、對比、白平衡、飽和度與銳利度。"
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 0403b8808208
---

# 圖片增強 {#image-enhancement}

具備智慧分析的一鍵自動改善。分析圖片並套用曝光、對比、白平衡、飽和度、銳利度與降噪校正。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**處理方式：** 同步（使用 `createToolRoute` factory，直接回傳結果）

**模型套件包：** 基本增強不需要任何套件包。`upscale-enhance` 套件包（5-6 GB）僅在啟用 `deepEnhance` 時使用（透過 SCUNet 進行 AI 降噪）。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| mode | string | 否 | `"auto"` | 增強模式：`auto`、`portrait`、`landscape`、`low-light`、`food`、`document` |
| intensity | number | 否 | `50` | 整體增強強度（0-100） |
| corrections | object | 否 | 全部 `true` | 要套用的選擇性校正（見下方） |
| deepEnhance | boolean | 否 | `false` | 啟用 AI 驅動的降噪（需安裝 `noise-removal` 工具） |

### Corrections 物件 {#corrections-object}

| 欄位 | 型別 | 預設值 | 說明 |
|-------|------|---------|-------------|
| exposure | boolean | `true` | 自動校正曝光 |
| contrast | boolean | `true` | 自動校正對比 |
| whiteBalance | boolean | `true` | 自動校正白平衡 |
| saturation | boolean | `true` | 自動校正飽和度 |
| sharpness | boolean | `true` | 自動銳利化 |
| denoise | boolean | `true` | 輕度降噪 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## 回應（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyze 端點 {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

分析圖片並傳回校正建議，但不實際套用。

### 參數 {#parameters-1}

| 參數 | 型別 | 必填 | 說明 |
|-----------|------|----------|-------------|
| file | file | 是 | 圖片檔案（multipart） |

### 範例請求 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### 回應（200 OK） {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## 注意事項 {#notes}

- 此工具使用同步的 `createToolRoute` factory，因此會回傳標準回應（而非 202 非同步）。
- `mode` 參數會調整校正的加權方式（例如人像模式對膚色較溫和，風景模式則提升飽和度）。
- 當啟用 `deepEnhance` 且已安裝 `noise-removal` 工具（SCUNet）時，會在標準校正後額外套用一次 AI 降噪。
- analyze 端點適合在實際套用前，預覽將會套用哪些校正。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
