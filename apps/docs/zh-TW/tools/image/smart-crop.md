---
description: "主體、臉部與熵感知裁切，使用 Sharp 與 AI 臉部偵測智慧地取景。"
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 84b65e84b154
---

# 智慧裁切 {#smart-crop}

智慧主體感知、臉部感知或修剪式裁切。使用 Sharp 的 attention/entropy 策略以及 AI 臉部偵測進行智慧取景。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**處理方式：** 非同步（回傳 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 以取得狀態）

**模型套件：** `face-detection`（200-300 MB）- 僅在 `face` 模式下需要

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 影像檔案（multipart） |
| mode | string | 否 | `"subject"` | 裁切模式：`subject`、`face`、`trim`。（舊值 `attention` 與 `content` 分別對應到 `subject` 與 `trim`） |
| strategy | string | 否 | `"attention"` | 主體模式的策略：`attention` 或 `entropy` |
| width | integer | 否 | - | 目標寬度（像素） |
| height | integer | 否 | - | 目標高度（像素） |
| padding | integer | 否 | `0` | 主體周圍的內距百分比（0-50） |
| facePreset | string | 否 | `"head-shoulders"` | 臉部取景預設：`closeup`、`head-shoulders`、`upper-body`、`half-body` |
| sensitivity | number | 否 | `0.5` | 臉部偵測靈敏度（0-1） |
| threshold | integer | 否 | `30` | 修剪模式用於背景偵測的閾值（0-255） |
| padToSquare | boolean | 否 | `false` | 將修剪後的結果補滿成正方形 |
| padColor | string | 否 | `"#ffffff"` | 內距的背景顏色 |
| targetSize | integer | 否 | - | 補滿後輸出的目標大小（像素） |
| quality | integer | 否 | - | 輸出品質（1-100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## 模式 {#modes}

### 主體模式 {#subject-mode}
使用 Sharp 的 attention 或 entropy 策略找出視覺上最有趣的區域，並圍繞該區域裁切。

### 臉部模式 {#face-mode}
使用 AI 偵測臉部，然後依指定的 `facePreset` 圍繞偵測到的臉部取景裁切。若未偵測到任何臉部，則回退到主體模式（attention 策略）。

### 修剪模式 {#trim-mode}
移除影像中均勻的邊框/背景。可選擇將結果以指定的背景顏色與目標大小補滿成正方形。

## 注意事項 {#notes}

- 此工具使用 `createToolRoute` 工廠並搭配 `executionHint: "long"`，因此會回傳 202 並附帶 SSE 進度。
- 臉部模式需要 `face-detection` 模型套件（200-300 MB）。
- 主體與修剪模式無需任何 AI 模型套件即可運作。
- `facePreset` 決定裁切對偵測到的臉部取景的緊密程度：`closeup` 最緊，`half-body` 最寬。
- 若未指定寬度/高度，則預設為 1080x1080。
