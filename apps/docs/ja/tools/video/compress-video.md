---
description: "品質を制御しながら動画ファイルサイズを縮小します。"
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: b34f153fd508
---

# Compress Video {#compress-video}

設定可能な圧縮強度とオプションの解像度ダウンスケールを使用して、動画ファイルサイズを縮小します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。これは非同期エンドポイントで、即座に `202 Accepted` を返し、進捗は `GET /api/v1/jobs/{jobId}/progress` の SSE でストリーミングされます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | 圧縮強度: `light`、`balanced`、`strong` |
| resolution | string | No | `"original"` | 出力解像度: `original`、`1080p`、`720p`、`480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `light` プリセットはほぼ元のままの品質を保ちます。`strong` プリセットは視覚的な忠実度を犠牲にして積極的にファイルサイズを削減します。
- 解像度のダウンスケール（例: 4K から 720p）は圧縮と組み合わさり、大幅なサイズ削減につながります。
- ジョブが完了するまで、進捗の更新は `GET /api/v1/jobs/{jobId}/progress` の SSE で確認できます。
