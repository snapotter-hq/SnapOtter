---
description: "在 YAML 與 JSON 之間雙向轉換。"
i18n_source_hash: acf8ca21ee99
i18n_provenance: human
i18n_output_hash: 53f7c91d3528
---

# YAML / JSON {#yaml-json}

在 YAML 與 JSON 格式之間雙向轉換。上傳 YAML 檔案可取得 JSON，或上傳 JSON 檔案可取得 YAML。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

接受包含 YAML 或 JSON 檔案的 multipart form data。不需要 settings 欄位。

## Parameters {#parameters}

此工具沒有可設定的參數。轉換方向由輸入檔案的副檔名決定。

## Example Request {#example-request}

YAML 轉 JSON：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON 轉 YAML：

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notes {#notes}

- 轉換方向會從輸入檔案的副檔名自動偵測：`.yaml` 或 `.yml` 會產生 `.json`，而 `.json` 會產生 `.yaml`。
- `.yaml` 與 `.yml` 兩種副檔名皆可接受。
- 在多文件的 YAML 檔案中，只會轉換第一個文件；以 `---` 分隔的其他文件會被忽略。
