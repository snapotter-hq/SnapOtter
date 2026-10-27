---
description: "AI 驅動的背景移除，並可選用效果（模糊、陰影、漸層、自訂背景）。"
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: e086b28b44d9
---

# 移除背景 {#remove-background}

AI 驅動的背景移除，並可選用效果（模糊、陰影、漸層、自訂背景）。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**處理方式：** 非同步（傳回 202，透過 SSE 輪詢 `/api/v1/jobs/{jobId}/progress` 以取得狀態）

**模型套件包：** `background-removal`（4-5 GB）

## 參數 {#parameters}

階段 1 會移除背景，並快取透明 PNG 遮罩與原始影像。背景替換、模糊、陰影與輸出格式轉換會在[階段 2（`/api/v1/tools/image/remove-background/effects`）](#effects-endpoint-phase-2)（或將 `remove-background` 作為管線步驟或批次工作執行時）套用；將這些欄位傳給階段 1 會傳回 400。

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| model | string | 否 | - | 要使用的 AI 模型變體 |
| edgeRefine | integer | 否 | - | 邊緣細化等級（0-3） |
| decontaminate | boolean | 否 | - | 移除邊緣的色彩滲色 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### 最終結果（透過 SSE） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## 效果端點（階段 2） {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

重新套用背景效果，而不重新執行 AI 模型。使用階段 1 的快取遮罩與原圖。

### 參數 {#parameters-1}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| settings | JSON | 是 | - | 包含效果設定的 JSON（見下方） |
| backgroundImage | file | 當 `backgroundType` 為 `image` 時必填 | - | 自訂背景圖片 |

#### Settings JSON 欄位 {#settings-json-fields}

| 欄位 | 類型 | 必填 | 預設值 | 說明 |
|-------|------|----------|---------|-------------|
| jobId | string | 是 | - | 來自階段 1 的作業 ID |
| filename | string | 是 | - | 來自階段 1 的原始檔名 |
| backgroundType | string | 否 | `"transparent"` | 下列其中之一：`transparent`、`color`、`gradient`、`blur`、`image` |
| backgroundColor | string | 當 `backgroundType` 為 `color` 時必填 | - | 十六進位顏色：`#RRGGBB` 或 `#RGB`（`#` 可省略） |
| gradientColor1 | string | 當 `backgroundType` 為 `gradient` 時必填 | - | 第一個漸層顏色，與 `backgroundColor` 一樣使用十六進位格式 |
| gradientColor2 | string | 當 `backgroundType` 為 `gradient` 時必填 | - | 第二個漸層顏色，與 `backgroundColor` 一樣使用十六進位格式 |
| gradientAngle | number | 否 | - | 漸層角度（度） |
| blurEnabled | boolean | 否 | - | 模糊主體後方的原始背景（`backgroundType: "blur"` 會隱含啟用） |
| blurIntensity | number | 否 | - | 模糊強度（0-100） |
| shadowEnabled | boolean | 否 | - | 對主體啟用投影 |
| shadowOpacity | number | 否 | `35` | 陰影不透明度（0-100），當 `shadowEnabled` 為 true 時使用 |
| outputFormat | string | 否 | `"png"` | 輸出格式：`png`、`webp` 或 `avif` |

### 範例請求 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### 回應（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### 錯誤：去背已過期（410） {#error-background-removal-expired-410}

效果端點會使用階段 1 為 `jobId` 儲存的遮罩與原始檔。已儲存的輸出會在經過一段時間後被清理，因此如果兩次呼叫之間相隔太久，它們就不在了。請以同一張影像重新執行階段 1，並使用它傳回的 `jobId`。

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

無法指向已儲存檔案的 `jobId` 或 `filename`（含有路徑分隔符、`..` 或空字串）會回應 400。

## 注意事項 {#notes}

- 需要安裝 `background-removal` 模型套件包（4-5 GB）。
- 階段 1 會快取透明遮罩與原始圖片，讓階段 2（效果）可以立即重新套用不同背景，而不重新執行 AI 模型。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
- 處理前會自動更正 EXIF 旋轉。
