---
description: "動画のぼかしたコピーでバーを埋めます。"
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: c8ddd78019fa
---

# Blur Pad {#blur-pad}

単色のバーの代わりに、ぼかしてスケールした動画のコピーでパディング領域を埋めることで、動画を目標のアスペクト比に合わせます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | 目標のアスペクト比: `16:9`、`9:16`、`1:1`、`4:3`、`3:4` |
| blur | number | No | `20` | 背景のガウスぼかしシグマ（2〜50） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- ぼかしの値を大きくすると、より柔らかく抽象的な背景になります。値を小さくすると、より多くのディテールが見えたままになります。
- 動画がすでに目標のアスペクト比に一致している場合、ファイルは変更されずに返されます。
- 単色パディングにする場合は、代わりに Aspect Pad ツールを使用してください。
