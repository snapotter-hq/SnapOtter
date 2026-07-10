---
description: "AI を使用して、被写体をシャープに保ちながら背景をぼかします。"
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 4539ec15578d
---

# Blur Background {#blur-background}

被写体をシャープに保ちながら画像の背景をぼかします。AI モデルが被写体を切り出し、元の背景にぼかしを適用して、シャープな被写体を上に合成します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| intensity | integer | No | `50` | ぼかしの強度 (1 ～ 100) |
| feather | integer | No | `0` | エッジのぼかし半径 (0 ～ 20) |
| format | string | No | `"png"` | 出力形式: `png` または `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

進捗は `GET /api/v1/jobs/{jobId}/progress` の SSE で追跡できます。ジョブが完了すると、SSE ストリームがダウンロード URL 付きの `completed` イベントを発行します。

## Notes {#notes}

- これは `202 Accepted` を返し、非同期で処理する AI 対応ツールです。SSE エンドポイントに接続して進捗の更新と最終結果を受け取ってください。
- **background-removal** 機能バンドルのインストールが必要です。バンドルが利用できない場合は `501` を返します。
- 強度の値が高いほど、より強いぼかし効果が得られます。80 を超える値は、ボケのような際立った分離を作り出します。
- HEIC、RAW、PSD、SVG の入力は処理前に自動的にデコードされます。
