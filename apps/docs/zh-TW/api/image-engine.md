---
description: "影像引擎操作參考。所有基於 Sharp 的影像處理操作及其參數。"
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: b8db3db71a01
---

# 影像引擎 {#image-engine}

`@snapotter/image-engine` 套件處理所有非 AI 的影像操作。它封裝了 [Sharp](https://sharp.pixelplumbing.com/)，並完全在程序內執行，沒有外部相依性。

## 操作 {#operations}

### resize {#resize}

將影像縮放到指定尺寸或依百分比縮放。

| 參數 | 型別 | 說明 |
|---|---|---|
| `width` | number | 目標寬度（像素） |
| `height` | number | 目標高度（像素） |
| `fit` | string | `cover`、`contain`、`fill`、`inside` 或 `outside` |
| `withoutEnlargement` | boolean | 若為 true，不會放大較小的影像 |
| `percentage` | number | 依百分比縮放，而非絕對尺寸 |

你可以設定 `width`、`height` 或兩者。若只設定其一，另一個會依維持長寬比自動計算。

### crop {#crop}

從影像中裁出一塊矩形區域。

| 參數 | 型別 | 說明 |
|---|---|---|
| `left` | number | 從左邊緣起的 X 位移 |
| `top` | number | 從上邊緣起的 Y 位移 |
| `width` | number | 裁切區域的寬度 |
| `height` | number | 裁切區域的高度 |
| `unit` | string | `px`（預設）或 `percent` |

### rotate {#rotate}

以指定角度旋轉影像。

| 參數 | 型別 | 說明 |
|---|---|---|
| `angle` | number | 旋轉角度（度，0-360） |
| `background` | string | 露出區域的填色（預設：`#000000`）。僅適用於非 90 度的角度。 |

### flip {#flip}

將影像水平、垂直或兩者鏡射。至少必須有一項為 true。

| 參數 | 型別 | 說明 |
|---|---|---|
| `horizontal` | boolean | 左右鏡射 |
| `vertical` | boolean | 上下鏡射 |

### convert {#convert}

變更影像格式。

| 參數 | 型別 | 說明 |
|---|---|---|
| `format` | string | 目標格式：`jpg`、`png`、`webp`、`avif`、`tiff`、`gif`、`jxl`、`heic`、`heif`、`bmp`、`ico`、`jp2`、`qoi` |
| `quality` | number | 壓縮品質（1-100，適用於失真格式） |

前七種格式（`jpg` 到 `jxl`）由 Sharp 在程序內編碼。其餘格式在 API 層使用外部編碼器：`heic`/`heif` 透過 heif-enc、`bmp`/`ico` 透過 ImageMagick、`jp2` 透過 opj_compress、`qoi` 透過內嵌的 TypeScript 編解碼器。

### compress {#compress}

在維持相同格式下縮小檔案大小。

| 參數 | 型別 | 說明 |
|---|---|---|
| `quality` | number | 目標品質（1-100） |
| `targetSizeBytes` | number | 選用的目標檔案大小（位元組） |
| `format` | string | 選用的格式覆寫 |

### strip-metadata {#strip-metadata}

從影像移除 EXIF、IPTC、XMP 與 ICC 中繼資料。不帶參數（或 `stripAll: true`）時會移除全部。傳入個別旗標可進行選擇性移除。

| 參數 | 型別 | 說明 |
|---|---|---|
| `stripAll` | boolean | 移除所有中繼資料（未設定任何旗標時的預設） |
| `stripExif` | boolean | 移除 EXIF 資料（若未另外設定 `stripGps`，則包含 GPS） |
| `stripGps` | boolean | 移除 GPS 位置資料 |
| `stripIcc` | boolean | 移除 ICC 色彩描述檔 |
| `stripXmp` | boolean | 移除 XMP 中繼資料 |

### 色彩調整 {#color-adjustments}

這些操作會修改影像的色彩屬性。每個都接受單一數值。

| 操作 | 參數 | 範圍 | 說明 |
|---|---|---|---|
| `brightness` | `value` | -100 到 100 | 調整亮度 |
| `contrast` | `value` | -100 到 100 | 調整對比 |
| `saturation` | `value` | -100 到 100 | 調整色彩飽和度 |

### 色彩濾鏡 {#color-filters}

這些會套用固定的色彩轉換。它們不接受任何參數。

| 操作 | 說明 |
|---|---|
| `grayscale` | 轉換為灰階 |
| `sepia` | 套用懷舊褐色調 |
| `invert` | 反轉所有顏色 |

### 色彩通道 {#color-channels}

調整個別的 RGB 色彩通道。數值為乘數，其中 100 = 不變。

| 參數 | 型別 | 說明 |
|---|---|---|
| `red` | number | 紅色通道乘數（0 到 200，100 = 不變） |
| `green` | number | 綠色通道乘數（0 到 200，100 = 不變） |
| `blue` | number | 藍色通道乘數（0 到 200，100 = 不變） |

### sharpen {#sharpen}

以單一數值控制的簡易銳利化。

| 參數 | 型別 | 說明 |
|---|---|---|
| `value` | number | 銳利化強度（0 到 100）。對應到 0.5-10 的高斯 sigma。 |

### sharpen-advanced {#sharpen-advanced}

進階銳利化，有三種可選方法與選用的降噪前處理。

| 參數 | 型別 | 說明 |
|---|---|---|
| `method` | string | `adaptive`、`unsharp-mask` 或 `high-pass` |
| `sigma` | number | 高斯模糊半徑，0.5-10（自適應） |
| `m1` | number | 平坦區域銳利化，0-10（自適應） |
| `m2` | number | 紋理區域銳利化，0-20（自適應） |
| `x1` | number | 平坦/鋸齒門檻，0-10（自適應） |
| `y2` | number | 最大提亮（光暈鉗制），0-50（自適應） |
| `y3` | number | 最大壓暗（光暈鉗制），0-50（自適應） |
| `amount` | number | 強度百分比，0-500（反遮罩銳利化） |
| `radius` | number | 模糊半徑，0.1-5.0（反遮罩銳利化） |
| `threshold` | number | 最小邊緣亮度，0-255（反遮罩銳利化） |
| `strength` | number | 混合強度，0-100（高通） |
| `kernelSize` | number | `3` 或 `5` 分別代表 3x3 / 5x5 卷積核（高通） |
| `denoise` | string | 降噪前處理：`off`、`light`、`medium` 或 `strong` |

參數依方法而異。只需提供與所選方法相關的參數。

### color-blindness {#color-blindness}

使用 3x3 色彩重組矩陣模擬色覺缺陷。

| 參數 | 型別 | 說明 |
|---|---|---|
| `type` | string | 下列其中之一：`protanopia`、`deuteranopia`、`tritanopia`、`protanomaly`、`deuteranomaly`、`tritanomaly`、`achromatopsia`、`blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

寫入或移除個別的 EXIF/IPTC 中繼資料欄位，而不移除整個區塊。

| 參數 | 型別 | 說明 |
|---|---|---|
| `artist` | string | EXIF Artist 標籤 |
| `copyright` | string | EXIF Copyright 標籤 |
| `imageDescription` | string | EXIF ImageDescription 標籤 |
| `software` | string | EXIF Software 標籤 |
| `dateTime` | string | EXIF DateTime 標籤 |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal 標籤 |
| `clearGps` | boolean | 移除所有 GPS 標籤 |
| `fieldsToRemove` | string[] | 要刪除的 EXIF 欄位名稱清單 |

所有參數皆為選用。列在 `fieldsToRemove` 中的欄位會從既有的 EXIF 區塊刪除。透過具名參數設定的欄位會被寫入（或覆寫）。像 MakerNote 這類二進位/不安全的鍵會被靜默忽略。

## 格式偵測 {#format-detection}

引擎會自動從檔案標頭偵測輸入格式，而不僅是從副檔名判斷。這表示一個實際上是 PNG 的 `.jpg` 檔案也能被正確處理。偵測採多層方法：先看魔術位元組，再以副檔名作為備援。

SnapOtter 支援 **55+ 種輸入格式**與 **13 種輸出格式**，包含來自 20+ 個品牌的 23 種相機 RAW 格式、專業格式（PSD、EPS、OpenEXR、HDR）、現代編解碼器（JPEG XL、AVIF、HEIC、QOI、JPEG 2000），以及科學/遊戲格式（FITS、DDS）。解碼盡可能由 Sharp 原生處理，並自動備援至 ImageMagick、LibRaw 與專用的 CLI 解碼器。

完整清單請見 [支援的格式](/zh-TW/guide/supported-formats) 頁面。

## 中繼資料擷取 {#metadata-extraction}

`info` 工具會回傳影像中繼資料。完整欄位參考請見 [影像資訊](/zh-TW/tools/image/info)。

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
