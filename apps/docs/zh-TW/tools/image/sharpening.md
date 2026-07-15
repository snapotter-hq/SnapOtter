---
description: "使用自適應、遮色片銳利化或高通方法銳利化影像，並可選用降噪。"
i18n_source_hash: 66dce4068899
i18n_provenance: human
i18n_output_hash: a37165c2f0bd
---

# 銳利化影像 {#sharpening}

進階銳利化工具，提供三種方法：自適應（智慧邊緣感知）、遮色片銳利化（傳統的半徑/強度）與高通（強調紋理）。內建降噪功能，可防止銳利化產生瑕疵。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

接受包含影像檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| method | string | 否 | `"adaptive"` | 銳利化演算法：`adaptive`、`unsharp-mask`、`high-pass` |
| sigma | number | 否 | `1.0` | 自適應：高斯 sigma（0.5 至 10） |
| m1 | number | 否 | `1.0` | 自適應：平坦區域銳利化（0 至 10） |
| m2 | number | 否 | `3.0` | 自適應：鋸齒區域銳利化（0 至 20） |
| x1 | number | 否 | `2.0` | 自適應：平坦/鋸齒閾值（0 至 10） |
| y2 | number | 否 | `12` | 自適應：最大平坦銳利化（0 至 50） |
| y3 | number | 否 | `20` | 自適應：最大鋸齒銳利化（0 至 50） |
| amount | number | 否 | `100` | 遮色片銳利化：銳利化強度（0 至 1000） |
| radius | number | 否 | `1.0` | 遮色片銳利化：模糊半徑（像素）（0.1 至 5） |
| threshold | number | 否 | `0` | 遮色片銳利化：進行銳利化的最小亮度差（0 至 255） |
| strength | number | 否 | `50` | 高通：濾鏡強度（0 至 100） |
| kernelSize | number | 否 | `3` | 高通：卷積核大小（3 或 5） |
| denoise | string | 否 | `"off"` | 銳利化前的降噪：`off`、`light`、`medium`、`strong` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

使用遮色片銳利化並搭配閾值以保護平滑區域：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## 注意事項 {#notes}

- 只會使用與所選方法相關的參數。例如，當 `method` 為 `adaptive` 時，`amount`、`radius` 與 `threshold` 會被忽略。
- 自適應方法使用 Sharp 內建的自適應銳利化，可設定平坦/鋸齒區域的行為。
- `denoise` 選項會在銳利化前套用降噪，以防止雜訊/顆粒被放大。
- 高通銳利化透過從原始影像中減去模糊版本來擷取細節，再混合回原圖。
- 輸出格式與輸入格式相同。HEIC、RAW、PSD 與 SVG 輸入會在處理前自動解碼。
