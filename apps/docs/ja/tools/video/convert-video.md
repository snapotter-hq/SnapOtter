---
description: "動画を MP4、MOV、WebM、AVI、MKV 間で変換します。"
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: dcac29f235f7
---

# Convert Video {#convert-video}

設定可能な品質プリセットで、動画を MP4、MOV、WebM、AVI、MKV フォーマット間で変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。これは非同期エンドポイントで、即座に `202 Accepted` を返し、進捗は `GET /api/v1/jobs/{jobId}/progress` の SSE でストリーミングされます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | 出力フォーマット: `mp4`、`mov`、`webm`、`avi`、`mkv` |
| quality | string | No | `"balanced"` | 品質プリセット: `high`、`balanced`、`small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `high` 品質プリセットは最良の視覚的忠実度を生み出しますが、ファイルは大きくなります。`small` プリセットは最小のファイルサイズを目指して積極的に圧縮します。
- WebM 出力は VP9 エンコードを使用します。MP4 と MOV は H.264 を使用します。AVI と MKV はレガシーまたはアーカイブ用途向けに利用できます。
- ジョブが完了するまで、進捗の更新は `GET /api/v1/jobs/{jobId}/progress` の SSE で確認できます。
