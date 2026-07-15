---
description: "依列數與欄數或依像素大小將一張影像切割成網格圖塊，並以 ZIP 壓縮檔回傳。"
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 8ac843918d49
---

# 分割影像 {#image-splitting}

依欄/列數或指定的像素尺寸將單一影像切割成網格圖塊。回傳包含所有圖塊的 ZIP 壓縮檔。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/split`

## 參數 {#parameters}

| 參數 | 型別 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| columns | integer | 否 | 3 | 要切割成的欄數（1 至 100） |
| rows | integer | 否 | 3 | 要切割成的列數（1 至 100） |
| tileWidth | integer | 否 | - | 圖塊寬度（像素）（最小 10）。當同時設定 `tileWidth` 與 `tileHeight` 時，會覆寫 `columns`。 |
| tileHeight | integer | 否 | - | 圖塊高度（像素）（最小 10）。當同時設定 `tileWidth` 與 `tileHeight` 時，會覆寫 `rows`。 |
| outputFormat | string | 否 | `"original"` | 圖塊的輸出格式：`original`、`png`、`jpg`、`webp`、`avif`、`jxl` |
| quality | number | 否 | 90 | 有損格式的輸出品質（1 至 100） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## 範例回應 {#example-response}

回應會直接以 ZIP 檔案串流傳輸，並帶有 `Content-Type: application/zip`。檔名遵循 `split-<jobId>.zip` 的樣式。

ZIP 內每個圖塊的命名為 `<originalBaseName>_r<row>_c<col>.<ext>`（例如 `photo_r1_c1.png`、`photo_r2_c3.webp`）。

## 注意事項 {#notes}

- 接受單一影像檔案。
- 支援 HEIC、RAW、PSD 與 SVG 輸入格式（自動解碼）。
- 當同時提供 `tileWidth` 與 `tileHeight` 時，它們的優先順序高於 `columns`/`rows`。網格尺寸計算方式為 `ceil(imageWidth / tileWidth)` 與 `ceil(imageHeight / tileHeight)`。
- 若影像尺寸無法整除，邊緣圖塊（最右欄、最底列）可能會比指定的圖塊大小小。
- 網格大小上限為 100x100（10,000 個圖塊）。
- 回應會直接串流 ZIP，因此沒有 JSON 回應主體。使用 curl 搭配 `--output` 儲存檔案。
