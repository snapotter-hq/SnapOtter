---
description: "PDF のすべてのページにページ番号を追加します。"
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: cda54868c793
---

# PDF Page Numbers {#pdf-page-numbers}

PDF のすべてのページに「Page N of M」形式のページ番号を追加します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bc"` | ページ番号の配置: `bl`、`bc`、`br`、`tl`、`tc`、`tr` |
| fontSize | integer | No | `10` | フォントサイズ（ポイント単位、6〜24） |

### Position Values {#position-values}

- `tl` 左上、`tc` 中央上、`tr` 右上
- `bl` 左下、`bc` 中央下、`br` 右下

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- ページ番号は「Page 1 of 10」の形式でレンダリングされます。
- 番号は、既存のタイトルページや表紙を含むすべてのページに追加されます。
- デフォルトの位置 `"bc"` は、各ページの中央下に番号を配置します。
