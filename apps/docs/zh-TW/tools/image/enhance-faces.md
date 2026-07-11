---
description: "使用 GFPGAN 與 CodeFormer AI 模型修復並銳化圖片中模糊或低品質的臉部。"
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: fc67e4f3ddbd
---

# 臉部增強 {#face-enhancement}

使用 AI 模型（GFPGAN/CodeFormer）修復並增強圖片中的臉部。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**處理方式：** 非同步（回傳 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 取得狀態）

**模型套件：** `upscale-enhance`（5-6 GB）與 `face-detection`（200-300 MB）

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| model | string | 否 | `"auto"` | 要使用的模型：`auto`、`gfpgan`、`codeformer` |
| strength | number | 否 | `0.8` | 增強強度（0-1）。數值越高，增強效果越強 |
| onlyCenterFace | boolean | 否 | `false` | 僅增強最居中／最顯著的臉部 |
| sensitivity | number | 否 | `0.5` | 臉部偵測靈敏度（0-1） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## 回應 {#response}

### 初始回應（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進度（SSE，位於 `/api/v1/jobs/{jobId}/progress`） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## 備註 {#notes}

- 同時需要 `upscale-enhance` 模型套件（5-6 GB）與 `face-detection` 模型套件（200-300 MB）。
- GFPGAN 產生較激進的增強；CodeFormer 較能保留身分特徵。`auto` 會為輸入選擇最合適的模型。
- 輸出一律為 PNG 格式以達到最高品質。
- 會在全解析度輸出旁一併產生 WebP 預覽，以加快前端顯示。
- `strength` 參數會將增強後的臉部與原圖混合。使用較低數值（0.3-0.5）以獲得細微改善，較高數值（0.7-1.0）以獲得更強的修復。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
