---
description: "AI 驅動的雜訊與顆粒移除，提供多層級品質選項。"
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: e784e38b05d1
---

# 雜訊移除 {#noise-removal}

AI 驅動的雜訊與顆粒移除，提供多層級品質選項，使用 Python sidecar（SCUNet 模型）。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**處理方式：** 非同步（傳回 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 以取得狀態）

**模型套件包：** `upscale-enhance`（5-6 GB）

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| tier | string | 否 | `"balanced"` | 品質層級：`quick`、`balanced`、`quality`、`maximum` |
| strength | number | 否 | `50` | 降噪強度（0-100） |
| detailPreservation | number | 否 | `50` | 要保留多少細節（0-100）。數值越高保留越多紋理 |
| colorNoise | number | 否 | `30` | 色彩雜訊抑制強度（0-100） |
| format | string | 否 | `"original"` | 輸出格式：`original`、`png`、`jpeg`、`webp`、`avif`、`jxl` |
| quality | number | 否 | `90` | 輸出編碼品質（1-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## 注意事項 {#notes}

- 需要安裝 `upscale-enhance` 模型套件包（5-6 GB）。
- 品質層級以速度換取品質：`quick` 最快且採用基本降噪，`maximum` 使用最徹底的多重處理方式。
- 對於有紋理的主體（布料、頭髮、樹葉），`detailPreservation` 參數至關重要。數值越高越能避免降噪器抹平細微細節。
- 當 `format` 設為 `"original"` 時，輸出格式會與輸入檔案格式相符。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
