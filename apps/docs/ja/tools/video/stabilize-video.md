---
description: "2パスの手ブレ補正でカメラの揺れを低減します。"
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 1ec1838c9e4c
---

# Stabilize Video {#stabilize-video}

FFmpeg の 2パス vidstab 手ブレ補正を使用して、手持ち撮影映像のカメラの揺れを低減します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。これは非同期エンドポイントで、即座に `202 Accepted` を返し、進捗は `GET /api/v1/jobs/{jobId}/progress` の SSE でストリーミングされます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | スムージングウィンドウのサイズ（フレーム単位、5-60）。値が大きいほど動きが滑らかになります |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 手ブレ補正は2パス処理です。1パス目でカメラの動きを解析し、2パス目で補正を適用します。これにはシングルパスのツールのおよそ2倍の時間がかかります。
- スムージングの値が高いほど揺れは多く除去されますが、端にわずかなズームクロップが生じる場合があります。
- ジョブが完了するまで、進捗の更新は `GET /api/v1/jobs/{jobId}/progress` の SSE で確認できます。
