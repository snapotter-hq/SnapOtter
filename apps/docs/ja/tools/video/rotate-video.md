---
description: "動画を回転または反転します。"
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 363f01839a6f
---

# Rotate Video {#rotate-video}

動画を 90、180、または 270 度回転するか、水平または垂直に反転します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | 適用する変換: `cw90`、`ccw90`、`180`、`hflip`、`vflip` |

### Transform Values {#transform-values}

- **cw90** - 時計回りに 90 度回転
- **ccw90** - 反時計回りに 90 度回転
- **180** - 180 度回転
- **hflip** - 水平反転（ミラー）
- **vflip** - 垂直反転

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 90 度または 270 度の回転は、動画の幅と高さを入れ替えます。
- 反転操作（hflip、vflip）は動画の寸法を変更しません。
