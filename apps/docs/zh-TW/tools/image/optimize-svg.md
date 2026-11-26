---
description: "使用 svgo 壓縮 SVG 檔案，並將結果保留為向量 SVG，可控制精度、多次處理、中繼資料和格式化。"
i18n_source_hash: 07a564ab53dd
i18n_provenance: machine
i18n_output_hash: a92f070e669f
i18n_hash_version: 2
---

# SVG 最佳化 {#optimize-svg}

移除編輯器殘留、多餘屬性和多餘的小數位數以縮小 SVG 檔案，並將結果下載為 SVG。與「網頁最佳化」不同，輸出永遠不會被點陣化。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

接受包含 `.svg` 或 `.svgz` 檔案以及 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| precision | number | 否 | `3` | 路徑資料和數字中保留的小數位數（0 到 8）。數值越低，檔案越小，曲線略為粗糙。 |
| multipass | boolean | 否 | `true` | 重複執行最佳化工具，直到輸出不再變小 |
| removeMetadata | boolean | 否 | `true` | 移除註解、`<metadata>`、空白或由編輯器產生的 `<desc>` 元素和編輯器專用資料。關閉後會保留這些內容。 |
| pretty | boolean | 否 | `false` | 為方便閱讀而縮排輸出，而不是壓縮成幾行 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## 注意事項 {#notes}

- 輸入必須是 SVG 或 SVGZ 檔案。點陣圖會被拒絕，回傳 `400`，錯誤碼為 `IMAGE_UNDECODABLE`。
- `.svgz` 輸入會先被解壓縮，輸出一律是一般的 `.svg`。
- SVG 解壓縮後限制為 10 MB。較大的檔案會被拒絕，回傳 `400`，錯誤碼為 `SVG_TOO_LARGE`。
- `viewBox` 和 `<title>` 一律會保留，因此圖形仍可縮放並保留其無障礙名稱。
- 輸入和輸出都會經過 SVG 清理器，它會移除指令碼和其他主動內容。
- 對於路徑密集的圖稿，降低 `precision` 最能節省檔案大小。請在 0 到 2 時以目視檢查結果。
