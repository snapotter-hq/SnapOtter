---
description: "動画の明るさ、コントラスト、彩度、ガンマを調整します。"
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: abe3d6452ec2
---

# Video Color {#video-color}

動画の明るさ、コントラスト、彩度、ガンマ補正を調整します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | 明るさの調整（-1 〜 1） |
| contrast | number | No | `1` | コントラストの倍率（0-4） |
| saturation | number | No | `1` | 彩度の倍率（0-3）。グレースケールにするには 0 に設定します |
| gamma | number | No | `1` | ガンマ補正（0.1-10） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- すべての値がデフォルト（明るさ 0、コントラスト 1、彩度 1、ガンマ 1）の場合、変更は生じません。
- 彩度を `0` に設定すると、動画がグレースケールに変換されます。
- 1 未満のガンマ値はシャドウを明るくし、1 を超える値はシャドウを暗くします。
