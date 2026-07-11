---
description: "AI 驅動的偵測與更正，處理相機閃光燈造成的紅眼。"
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: a2e5e426a371
---

# 紅眼移除 {#red-eye-removal}

AI 驅動的偵測與更正，處理相機閃光燈造成的紅眼。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**處理方式：** 非同步（傳回 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 以取得狀態）

**模型套件包：** `face-detection`（200-300 MB）

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| sensitivity | number | 否 | `50` | 紅眼偵測靈敏度（0-100）。數值越高越能偵測到較細微的紅眼 |
| strength | number | 否 | `70` | 更正強度（0-100）。中和紅色的積極程度 |
| format | string | 否 | - | 輸出格式（選用覆寫值） |
| quality | number | 否 | `90` | 輸出品質（1-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## 注意事項 {#notes}

- 需要安裝 `face-detection` 模型套件包（200-300 MB）。
- 會先偵測臉部，接著在每張臉部中定位眼睛區域，最後辨識並更正紅眼像素。
- `facesDetected` 計數表示找到多少張臉；`eyesCorrected` 是完成紅眼更正的個別眼睛總數。
- 輸出一律為 PNG，以達到最佳品質保留。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
