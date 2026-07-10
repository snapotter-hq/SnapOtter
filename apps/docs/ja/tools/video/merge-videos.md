---
description: "複数の動画クリップを1つのファイルに結合します。"
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 3280dff80b5e
---

# Merge Videos {#merge-videos}

複数の動画クリップを単一の MP4 ファイルに結合します。すべての入力は、最初の動画の解像度と 30 fps に正規化されます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

2つ以上の動画ファイルを含む multipart フォームデータを受け付けます。これは非同期エンドポイントで、即座に `202 Accepted` を返し、進捗は `GET /api/v1/jobs/{jobId}/progress` の SSE でストリーミングされます。

## Parameters {#parameters}

このツールに設定パラメータはありません。2〜10 個の動画ファイルを複数の `file` パートとしてアップロードします。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- クリップはアップロードされた順に連結されます。
- すべてのクリップは、最初のクリップの解像度、フレームレート（30 fps）、コーデック（H.264）に合わせて再エンコードされます。一致しない入力は自動的に正規化されます。
- 1リクエストあたり 2〜10 個の動画ファイルを受け付けます。
- ジョブが完了するまで、進捗の更新は `GET /api/v1/jobs/{jobId}/progress` の SSE で確認できます。
