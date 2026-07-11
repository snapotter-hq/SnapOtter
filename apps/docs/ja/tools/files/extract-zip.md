---
description: "ボム保護付きで ZIP アーカイブから安全にファイルを展開します。"
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 04e2a826e325
---

# Extract ZIP {#extract-zip}

ZIP アーカイブから安全にファイルを展開します。単一ファイルのアーカイブは含まれるファイルを直接返し、複数ファイルのアーカイブは展開された内容をフラットな ZIP で返します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

ZIP ファイルを含む multipart フォームデータを受け付けます。settings フィールドは不要です。

## Parameters {#parameters}

このツールには設定可能なパラメータはありません。展開する `.zip` ファイルをアップロードします。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- 入力として受け付けるのは `.zip` ファイルのみです。
- アーカイブに単一のファイルが含まれる場合、そのファイルは直接返されます（ZIP でラップされません）。
- アーカイブに複数のファイルが含まれる場合、すべてのファイルをルートレベルに展開したフラットな ZIP が返されます（ネストされたディレクトリ構造はフラット化されます）。
- 組み込みのボム保護により、リソース枯渇を防ぐため、圧縮率やファイル数が過大なアーカイブは拒否されます。
