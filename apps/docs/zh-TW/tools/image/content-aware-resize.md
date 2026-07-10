---
description: "縫隙裁剪（seam-carving）縮放，沿低重要度路徑增減像素，以保留關鍵內容與臉部。"
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: cc485691dbad
---

# 內容感知縮放 {#content-aware-resize}

縫隙裁剪縮放，會沿視覺重要度最低的路徑智慧地移除或增加像素，以保留重要內容並可選擇性地保護臉部。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**處理方式：** 同步（直接回傳結果）

**模型套件：** 基本操作不需要。若啟用臉部保護，則使用 `face-detection` 套件（200-300 MB）。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是 | - | 圖片檔案（multipart） |
| width | number | 否 | - | 目標寬度（像素） |
| height | number | 否 | - | 目標高度（像素） |
| protectFaces | boolean | 否 | `false` | 偵測並保護臉部不被縫隙移除 |
| blurRadius | number | 否 | `4` | 用於能量計算的預處理模糊半徑（0-20） |
| sobelThreshold | number | 否 | `2` | Sobel 邊緣偵測閾值（1-20）。數值越高，演算法越激進 |
| square | boolean | 否 | `false` | 縮放為正方形（採用較短的一邊） |

必須至少指定 `width`、`height` 或 `square` 其中之一。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## 回應（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## 備註 {#notes}

- 此自訂路由目前回傳同步的 200 回應。
- 使用 `caire` 縫隙裁剪函式庫進行內容感知縮放。
- 僅會縮小尺寸（移除縫隙）。無法將圖片擴大到超過原始尺寸。
- `protectFaces` 選項使用 AI 臉部偵測將臉部區域標記為高能量，避免縫隙穿越臉部。
- `blurRadius` 控制能量圖計算前的平滑化。數值越高，能量圖越均勻，有助於處理雜訊較多的圖片。
- `sobelThreshold` 影響邊緣偵測的激進程度。數值越低，越能保留細微的邊緣。
- 輸出一律為 PNG 格式。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
