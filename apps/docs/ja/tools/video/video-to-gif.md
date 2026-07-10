---
description: "動画クリップをアニメーション GIF に変換します。"
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: da1c75fa9071
---

# Video to GIF {#video-to-gif}

動画クリップを、フレームレート、幅、開始時刻、再生時間を設定できるアニメーション GIF に変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。これは非同期エンドポイントで、即座に `202 Accepted` を返し、進捗は `GET /api/v1/jobs/{jobId}/progress` の SSE でストリーミングされます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 出力フレームレート（1-30） |
| width | integer | No | `480` | 出力の幅（ピクセル単位、64-1280）。高さは比例してスケーリングされます |
| startS | number | No | `0` | 開始時刻（秒単位、0 以上である必要があります） |
| durationS | number | No | `5` | 再生時間（秒単位、0 より大きく、最大 60） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `fps` と `width` の値を低くすると、GIF ファイルは小さくなります。幅 480px、12 fps の GIF は通常バランスが良好です。
- 最大再生時間は 60 秒です。それより長いクリップは非常に大きなファイルを生成します。
- ジョブが完了するまで、進捗の更新は `GET /api/v1/jobs/{jobId}/progress` の SSE で確認できます。
