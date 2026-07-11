---
description: "在 JSON 與 XML 之間雙向轉換。"
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: cec9997b2d97
---

# JSON 轉 XML {#json-to-xml}

在 JSON 與 XML 格式之間雙向轉換。上傳 JSON 檔案以取得 XML，或上傳 XML 檔案以取得 JSON。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

接受包含一個 JSON 或 XML 檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | 以縮排美化輸出 |

## Example Request {#example-request}

JSON 轉 XML：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML 轉 JSON：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- 轉換方向會依輸入檔案的副檔名自動偵測：`.json` 會產生 `.xml`，而 `.xml` 會產生 `.json`。
- `pretty` 參數對兩個方向都適用。當為 `false` 時，輸出為緊湊且不含縮排。
- 在來回轉換過程中，會盡可能保留 XML 屬性與巢狀結構。
