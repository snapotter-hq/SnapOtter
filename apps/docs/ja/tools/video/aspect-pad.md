---
description: "目標のアスペクト比に合わせるため単色のバーを追加します。"
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 67f9b193962e
---

# Aspect Pad {#aspect-pad}

単色のレターボックスまたはピラーボックスのバーを追加し、切り抜くことなく動画を目標のアスペクト比に合わせます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | 目標のアスペクト比: `16:9`、`9:16`、`1:1`、`4:3`、`3:4` |
| color | string | No | `"#000000"` | パディングバーの Hex カラー（黒の場合は例として `"#000000"`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- 動画がすでに目標のアスペクト比に一致している場合、ファイルは変更されずに返されます。
- 縦型・ポートレートのソーシャルメディア形式（TikTok、Reels、Shorts）には `9:16` を使用してください。
- 単色ではなくぼかしパディングにする場合は、Blur Pad ツールを使用してください。
