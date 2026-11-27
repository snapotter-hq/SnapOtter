---
description: "PDF の全ページを、全辺に同じマージン、辺ごとのマージン、または指定した領域で切り抜きます。"
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: f8ce4c22e004
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

PDF の全ページを、すべての辺に同じマージンを適用する、辺ごとに別々のマージンを指定する、またはシート上の一角に印刷された配送ラベルのような領域まで切り抜きます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`、`sides`、または `region` |
| margin | number | No | `20` | `uniform` モード: すべての辺の切り抜きマージン（ポイント単位、0〜2000） |
| top, right, bottom, left | number | No | `0` | `sides` モード: 各辺の切り抜きマージン（ポイント単位、0〜2000） |
| x, y | number | No | `0` | `region` モード: ページの左端と上端からの領域のオフセット（ポイント単位） |
| width, height | number | No | `288`, `432` | `region` モード: 領域のサイズ（ポイント単位、4x6 in のラベルなど） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

各ページの左上にある 4x6 in のラベルだけを残します。

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- すべての値は PDF ポイント単位です（1 ポイント = 1/72 インチ）。US Letter のページは 612 x 792 ポイントです。
- 各モードは自身のフィールドだけを読み取るため、`margin` だけを送るリクエストも引き続き動作します。
- 領域は各ページの左上隅から測定し、すべてのページに収まっている必要があります。マージンは各ページの一部が残るように指定してください。そうでない場合、リクエストは `400` で失敗します。
- 回転して表示されるように設定されたページでは、位置と辺は表示されたとおりのページを基準にするため、領域の左上隅は回転後のページの左上になります。
- どのモードもメディアボックス全体を基準に測定するため、すでに切り抜かれたページを切り抜くと、ページ全体からやり直しになります。`0` の均一なマージンはメディアボックス全体を表示します。
