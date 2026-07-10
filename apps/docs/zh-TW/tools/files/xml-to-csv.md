---
description: "從 XML 擷取重複元素並匯出為 CSV 表格。"
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: caf29cc797cb
---

# XML to CSV {#xml-to-csv}

從 XML 檔案擷取重複元素並匯出為扁平的 CSV 表格。此工具會自動找出 XML 樹狀結構中第一個物件陣列，並將每個元素對應為一列。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

接受包含 XML 檔案的 multipart form data。不需要 settings 欄位。

## Parameters {#parameters}

此工具沒有可設定的參數。重複元素會從 XML 結構自動偵測。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notes {#notes}

- 僅接受 `.xml` 檔案作為輸入。
- 此工具會掃描 XML 樹狀結構，找出第一組重複的同層元素，並將其作為列。
- 每個唯一的子元素或屬性名稱都會成為一個 CSV 欄位標頭。
- 這是單向轉換。若需要 JSON/XML 雙向轉換，請使用 [JSON to XML](/zh-TW/tools/files/json-xml) 工具。
