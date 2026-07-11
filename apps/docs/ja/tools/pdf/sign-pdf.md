---
description: "正規化されたページ配置を使って、アップロードした署名画像を PDF にスタンプします。"
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: 8d6a9400d5ed
---

# Sign PDF {#sign-pdf}

アップロードした 1 つ以上の署名 PNG 画像を、PDF の任意のページにスタンプします。このルートは、PDF、1 つ以上の署名画像、配置座標を必要とするため、カスタム multipart コントラクトを使用します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

multipart フォームデータを受け付けます。PDF は `file` として送信し、署名は `sig0`、`sig1` のように送信し、配置は `placements` JSON フィールドで送信します。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 署名する PDF ファイル |
| sig0 | file | Yes | - | 最初の署名画像。追加の画像は `sig1`、`sig2` のように使用します |
| placements | JSON string | Yes | - | 配置オブジェクトの配列: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | SSE による進捗追跡用の任意の UUID |
| fileId | string | No | - | 署名済みの結果を新しいバージョンとして保存する任意のファイルライブラリ ID |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | 署名画像のインデックス。`0` は `sig0` に対応します |
| page | integer | 0 始まりの PDF ページインデックス |
| x | number | ページに対する割合での左位置 |
| y | number | ページに対する割合での上位置 |
| w | number | ページに対する割合での署名の幅 |
| h | number | ページに対する割合での署名の高さ |

座標は左上を原点とします。値はページの端をわずかにはみ出しても構いません。PDF レンダラーが最終的なスタンプをページにクリップします。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

同期待機ウィンドウ内にリクエストが完了できない場合、API は次を返します:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`/api/v1/jobs/<jobId>/progress` に接続し、ジョブが完了したら結果をダウンロードしてください。

## Notes {#notes}

- 受け付ける PDF 入力形式: `.pdf`。
- 署名画像は有効な画像ファイルである必要があり、通常は透過付きの PNG です。
- 最大 100 個の署名画像と 100 個の配置を受け付けます。
- `sign-pdf` はカスタムルートであり、標準ツールの `settings` JSON フィールドを使用しません。
