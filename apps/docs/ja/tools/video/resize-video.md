---
description: "動画を新しい解像度またはプリセットサイズにスケーリングします。"
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: 26494a9cbb1f
---

# Resize Video {#resize-video}

カスタムのピクセル寸法または標準プリセットを使用して、動画を新しい解像度にスケーリングします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | 目標の幅（ピクセル単位、16-7680） |
| height | integer | No | - | 目標の高さ（ピクセル単位、16-4320） |
| preset | string | No | `"custom"` | 解像度プリセット: `custom`、`2160p`、`1440p`、`1080p`、`720p`、`480p`、`360p` |

`preset` が `"custom"` の場合、`width` または `height` の少なくとも一方を指定する必要があります。もう一方の寸法は比例してスケーリングされます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

カスタム寸法にリサイズ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- プリセット値は標準的な高さに対応します（例: `720p` = 1280x720、`1080p` = 1920x1080）。幅はソースのアスペクト比から比例してスケーリングされます。
- 寸法は、ほとんどの動画コーデックが要求するとおり偶数に丸められます。
- サポートされる最大解像度は 7680x4320（8K UHD）です。
