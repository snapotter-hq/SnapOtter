---
description: "以 AI 外延繪製擴展影像畫布，可朝任意方向延伸並填補新區域以與原圖相符。"
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 3726ad265b7a
---

# AI Canvas Expand {#ai-canvas-expand}

以 AI 驅動的填補（外延繪製）擴展影像畫布。可朝任意方向延伸影像，並以與現有影像相符的 AI 生成內容填補新區域。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**處理方式：** 非同步（回傳 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 取得狀態）

**模型套件：** `object-eraser-colorize`（1-2 GB）

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 影像檔案（multipart） |
| extendTop | integer | No | `0` | 頂部延伸的像素數 |
| extendRight | integer | No | `0` | 右側延伸的像素數 |
| extendBottom | integer | No | `0` | 底部延伸的像素數 |
| extendLeft | integer | No | `0` | 左側延伸的像素數 |
| tier | string | No | `"balanced"` | 品質等級：`fast`、`balanced`、`high` |
| format | string | No | `"auto"` | 輸出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| quality | integer | No | `95` | 輸出品質（1-100） |

至少要有一個延伸方向大於 0。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notes {#notes}

- 需要安裝 `object-eraser-colorize` 模型套件（1-2 GB）。
- 使用基於 LaMa 的外延繪製，為擴展區域生成內容。
- `tier` 參數在速度與品質之間取捨：`fast` 能快速產生結果但可能有瑕疵，`high` 耗時較久但能產生更平滑、更連貫的填補。
- 延伸值以像素為單位。最終影像尺寸為：原始寬度 + extendLeft + extendRight，乘以 原始高度 + extendTop + extendBottom。
- 對於無法在瀏覽器預覽的輸出格式（HEIC、JXL、TIFF），會在主要輸出旁一併產生 WebP 預覽。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 及 HDR 輸入格式。
