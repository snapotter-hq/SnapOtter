---
description: "AI を使用して画像の背景を単色またはグラデーションに置き換えます。"
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: a72b7f9033a8
---

# Background Replace {#background-replace}

画像の背景を単色またはグラデーションに置き換えます。AI モデルが被写体を検出し、元の背景を除去して、選択した背景の上に被写体を合成します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

画像ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"color"` | 背景モード: `color` または `gradient` |
| color | string | No | `"#ffffff"` | 背景の 16 進カラー (backgroundType が `color` の場合) |
| gradientColor1 | string | No | - | グラデーションの 1 番目の 16 進カラー |
| gradientColor2 | string | No | - | グラデーションの 2 番目の 16 進カラー |
| gradientAngle | integer | No | `180` | グラデーションの角度 (度) (0 ～ 360) |
| feather | integer | No | `0` | エッジのぼかし半径 (0 ～ 20) |
| format | string | No | `"png"` | 出力形式: `png` または `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
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
- HEIC、RAW、PSD、SVG の入力は処理前に自動的にデコードされます。
- 被写体周辺の透明度を保持するため、出力はデフォルトで PNG になります。
