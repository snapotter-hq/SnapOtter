---
description: "使用 AI 去背（BiRefNet）修正假透明 PNG 以產生真正的 alpha 通道，並附帶去邊緣清理。"
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 48d860859f01
---

# PNG 透明度修正 {#png-transparency-fixer}

一鍵修正假透明 PNG。使用 AI 去背（BiRefNet HR Matting 模型）產生真正的 alpha 透明度，並以去邊緣後處理清理邊緣。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**處理方式：** 非同步（回傳 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 以取得狀態）

**模型套件：** `background-removal`（4-5 GB）

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 影像檔案（multipart） |
| defringe | number | 否 | `30` | 去邊緣強度（0-100）。移除邊緣周圍的半透明邊緣像素 |
| outputFormat | string | 否 | `"png"` | 輸出格式：`png` 或 `webp` |
| removeWatermark | boolean | 否 | `false` | 套用浮水印移除前處理（中值濾波） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
```

## 回應 {#response}

### 初始回應（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進度（SSE 位於 `/api/v1/jobs/{jobId}/progress`） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## 注意事項 {#notes}

- 需要安裝 `background-removal` 模型套件（4-5 GB）。
- 使用 `birefnet-hr-matting` 作為高品質 alpha 去背的主要模型。若 HR 模型記憶體不足，則回退到 `birefnet-general`。
- `defringe` 選項會移除 AI 去背有時在頭髮、毛皮與細緻邊緣周圍留下的半透明邊緣像素。其運作方式為模糊 alpha 通道並將低信心像素歸零。
- `removeWatermark` 選項會套用中值濾波前處理步驟。這是基本的浮水印減弱，並非專用的浮水印移除工具。
- 只輸出 PNG 或無損 WebP（兩者皆支援 alpha 透明度）。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
