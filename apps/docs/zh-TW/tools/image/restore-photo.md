---
description: "使用 AI 流程修復舊照片上的刮痕、撕裂與損傷，進行修復、臉部增強與上色。"
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: bd38a38e0f20
---

# 照片修復 {#photo-restoration}

使用多步驟 AI 流程修復舊照片上的刮痕、撕裂與損傷。結合刮痕修復、臉部增強、降噪與選用的上色。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**處理方式：** 非同步（傳回 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 以取得狀態）

**模型套件包：** `photo-restoration`（4-5 GB）

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| scratchRemoval | boolean | 否 | `true` | 移除刮痕與表面損傷 |
| faceEnhancement | boolean | 否 | `true` | 增強修復照片中的臉部 |
| fidelity | number | 否 | `0.7` | 臉部增強保真度（0-1）。數值越高越能保留原始特徵 |
| denoise | boolean | 否 | `true` | 對修復結果套用降噪 |
| denoiseStrength | number | 否 | `25` | 降噪強度（0-100） |
| colorize | boolean | 否 | `false` | 為修復照片上色（適用於灰階圖片） |
| colorizeStrength | number | 否 | `85` | 上色強度（0-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
```

## 回應 {#response}

### 初始回應（202 Accepted） {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進度（SSE 於 `/api/v1/jobs/{jobId}/progress`） {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

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
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## 注意事項 {#notes}

- 需要安裝 `photo-restoration` 模型套件包（4-5 GB）。
- 此流程會依序執行多個 AI 步驟：刮痕修復、臉部增強（GFPGAN）、降噪，以及選用的上色。
- 結果中的 `steps` 陣列會顯示實際執行了哪些處理步驟。
- `scratchCoverage` 是估計有刮痕損傷的圖片面積百分比。
- `fidelity` 控制臉部增強相對於保留原始外觀的強度。數值越低增強越積極；數值越高則越保守。
- `colorize` 選項會自動偵測圖片是否為灰階。結果中的 `isGrayscale` 旗標會確認此偵測。
- 輸出格式會自動與輸入格式相符。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR、HDR 與 AVIF 輸入格式。
