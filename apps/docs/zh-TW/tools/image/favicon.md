---
description: "從來源圖片產生所有標準的 favicon 與應用程式圖示尺寸。"
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: f41da3aba0f1
---

# Favicon 產生器 {#favicon-generator}

從來源圖片產生一整套 favicon 與應用程式圖示檔案。可產生瀏覽器、Apple 裝置與 Android 所需的所有標準尺寸，並附帶一份 web manifest 與一段 HTML 程式碼片段。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/favicon`

接受包含一個或多個圖片檔案的 multipart 表單資料，以及一個選填的 JSON `settings` 欄位。

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| background | string | 否 | - | 背景十六進位色碼（例如 `"#ffffff"`）。設定後，圖示會平整化到此顏色之上。 |
| padding | integer | 否 | `0` | 圖示內容周圍的內距百分比（0 到 40） |
| radius | integer | 否 | `0` | 圓角圖示的圓角半徑百分比（0 到 50） |
| sizes | integer[] | 否 | - | 將輸出限制為特定像素尺寸（例如 `[16, 32, 180]`）。省略則產生所有標準尺寸。 |
| themeColor | string | 否 | `"#ffffff"` | web manifest 的主題色十六進位色碼 |

## 產生的檔案 {#generated-files}

每一張輸入圖片會產生以下檔案：

| 檔案 | 尺寸 | 用途 |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | 瀏覽器分頁圖示 |
| `favicon-32x32.png` | 32x32 | 瀏覽器分頁圖示（HiDPI） |
| `favicon-48x48.png` | 48x48 | 桌面捷徑 |
| `apple-touch-icon.png` | 180x180 | iOS 主畫面 |
| `android-chrome-192x192.png` | 192x192 | Android 主畫面 |
| `android-chrome-512x512.png` | 512x512 | Android 啟動畫面 |
| `favicon.ico` | 32x32 | 傳統 ICO 格式 |
| `manifest.json` | - | 含圖示參照的 web app manifest |
| `favicon-snippet.html` | - | 可直接使用的 HTML link 標籤 |

## 範例請求 {#example-request}

含圓角與內距的單張來源圖片：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

多張來源圖片（每張都在各自的子資料夾中產生一整套）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## 範例回應 {#example-response}

回應是直接串流的 ZIP 檔案。回應標頭為：

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## 內含的 HTML 程式碼片段 {#html-snippet-included}

ZIP 中包含一個 `favicon-snippet.html` 檔案，你可以將其貼到 HTML 的 `<head>` 中：

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## 注意事項 {#notes}

- 來源圖片會使用 `cover` 縮放模式調整大小，也就是會裁切以填滿每個正方形尺寸。為求最佳效果，請使用正方形的來源圖片。
- 上傳多個檔案時，每個檔案會在 ZIP 中取得各自的子資料夾（以來源檔名命名）。
- 單一檔案上傳時，所有輸出都位於 ZIP 的根目錄，沒有子資料夾。
- 驗證或解碼失敗的檔案會被略過，並在 ZIP 中附上一個 `skipped-files.txt` 說明問題所在。
- 支援的輸入格式：JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、SVG、RAW、PSD 等。
- 縮放前會自動套用 EXIF 方向資訊。
