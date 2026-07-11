---
description: "AI 驅動的護照與證件照產生器，具備臉部偵測、背景移除與列印排版拼貼功能。"
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 864ffda88a64
---

# 護照照片 {#passport-photo}

AI 驅動的護照與證件照產生器。採用兩階段工作流程：分析（臉部偵測 + 背景移除），接著產生（裁切、調整大小並拼貼以供列印）。

## API 端點 {#api-endpoints}

此工具使用兩階段流程，分析與產生各自使用獨立的端點。

**模型套件包：** `background-removal` 與 `face-detection`

---

### 階段 1：分析 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

偵測臉部特徵點並移除背景。傳回特徵點資料與預覽，供前端顯示裁切預覽。

#### 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| clientJobId | string | 否 | - | 選用的作業 ID，用於透過 SSE 追蹤進度 |

#### 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### 回應（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### 進度（SSE，選用） {#progress-sse-optional}

若提供 `clientJobId`，則會串流傳送進度（臉部偵測為 0-30%，背景移除為 30-95%）。

#### 錯誤：未偵測到臉部（422） {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### 階段 2：產生 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

裁切、調整大小，並選擇性地將照片拼貼至列印版面上。使用階段 1 的快取圖片（不重新執行 AI）。

#### 參數（JSON 主體） {#parameters-json-body}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| jobId | string | 是 | - | 來自階段 1 的作業 ID |
| filename | string | 是 | - | 來自階段 1 的原始檔名 |
| countryCode | string | 是 | - | 護照規格的國家代碼（例如 `US`、`GB`、`IN`） |
| documentType | string | 否 | `"passport"` | 文件類型（來自國家規格） |
| bgColor | string | 否 | `"#FFFFFF"` | 背景色十六進位值 |
| printLayout | string | 否 | `"none"` | 列印紙張版面：`none`、`4x6`、`a4` |
| maxFileSizeKb | number | 否 | `0` | 檔案大小上限限制（KB，0 = 無限制） |
| dpi | number | 否 | `300` | 輸出 DPI（72-1200） |
| customWidthMm | number | 否 | - | 自訂照片寬度（mm，覆寫國家規格） |
| customHeightMm | number | 否 | - | 自訂照片高度（mm，覆寫國家規格） |
| zoom | number | 否 | `1` | 縮放係數（0.5-3）。大於 1 的數值裁切得更緊 |
| adjustX | number | 否 | `0` | 水平位置調整 |
| adjustY | number | 否 | `0` | 垂直位置調整 |
| landmarks | object | 是 | - | 來自階段 1 回應的特徵點物件 |
| imageWidth | number | 是 | - | 來自階段 1 回應的圖片寬度 |
| imageHeight | number | 是 | - | 來自階段 1 回應的圖片高度 |

#### 範例請求 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### 回應（200 OK） {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### 基礎路由 {#base-route}

`POST /api/v1/tools/image/passport-photo`

傳回引導以使用正確的子端點。

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## 注意事項 {#notes}

- 需要安裝 `background-removal` 與 `face-detection` 模型套件包。
- 階段 1 執行 AI（臉部特徵點 + 背景移除）並快取結果。階段 2 為純 Sharp 圖片處理（快速，不需 AI）。
- 特徵點以正規化座標傳回（0-1 範圍，相對於圖片尺寸）。
- 分析回應中的 `preview` 欄位為 base64 編碼的 PNG（最大寬度 800px），供快速顯示。
- 國家規格包含依據官方護照照片要求的文件尺寸、頭部高度比例與眼線定位。
- `printLayout` 選項會在 4x6\" 或 A4 紙上產生拼貼版面，照片之間有 2mm 的間距。
- 設定 `maxFileSizeKb` 時，輸出會反覆壓縮以符合大小限制。
