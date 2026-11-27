---
description: "Web ページや HTML スニペットを、デバイスエミュレーションを使用して高品質の画像としてキャプチャします。"
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 3784519e071c
i18n_hash_version: 2
---

# HTML から画像 {#html-to-image}

Web ページの URL または生の HTML コンテンツをスクリーンショット画像としてキャプチャします。デバイスエミュレーション（デスクトップ、タブレット、モバイル）、ページ全体のキャプチャ、複数の出力形式に対応しています。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

**JSON ボディ**（multipart ではない）を受け付けます。ファイルのアップロードは不要です。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| url | string | 条件付き | - | キャプチャする URL（有効な URL である必要があります） |
| html | string | 条件付き | - | レンダリングする生の HTML コンテンツ（1 から 5,000,000 文字） |
| format | string | いいえ | `"png"` | 出力形式: `jpg`、`png`、`webp` |
| quality | number | いいえ | `90` | 非可逆形式の出力品質（1 から 100） |
| fullPage | boolean | いいえ | `false` | ビューポートだけでなく、スクロール可能なページ全体をキャプチャ |
| devicePreset | string | いいえ | `"desktop"` | デバイスエミュレーション: `desktop`、`tablet`、`mobile`、`custom` |
| viewportWidth | number | いいえ | `1280` | カスタムビューポートの幅（ピクセル、320 から 3840、devicePreset が `custom` の場合に使用） |
| viewportHeight | number | いいえ | `720` | カスタムビューポートの高さ（ピクセル、320 から 2160、devicePreset が `custom` の場合に使用） |
| clientJobId | string | いいえ | - | 独自のジョブ ID。レスポンスが返る前に進捗ストリームを開けるようにします |

`url` または `html` のいずれかを指定する必要がありますが、両方を指定することはできません。

### デバイスプリセット {#device-presets}

| プリセット | 幅 | 高さ | モバイル UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | いいえ |
| `tablet` | 768 | 1024 | いいえ |
| `mobile` | 375 | 812 | はい |
| `custom` | （ユーザー指定） | （ユーザー指定） | いいえ |

## リクエスト例 {#example-request}

Web ページをキャプチャ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

HTML コンテンツをレンダリング:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### 時間のかかるページ {#slow-pages}

キャプチャはキュー化されたジョブとして実行されます。同期待機ウィンドウ内に完了した場合は、上記の結果とともに `200` が返ります。それより時間がかかる場合は、ジョブ ID とともに `202` が返ります。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

ジョブが完了するまで `progressUrl`（Server-Sent Events）を購読してください。完了イベントには、`200` のレスポンスと同じ結果オブジェクトが含まれます。ジョブは `POST /api/v1/jobs/{jobId}/cancel` でキャンセルできます。

::: warning 2.3.0 以降の変更
2.3.0 までは、このエンドポイントはキャプチャが完了するまでリクエストを保持し、常に `200` を返していました。`200` だけを処理しているスクリプトは、`202` も処理するようにしてください。
:::

## 注記 {#notes}

- サーバーに Chromium がインストールされている必要があります。ブラウザサービスが利用できない場合は HTTP 503 を返します。
- URL は SSRF 攻撃に対して検証されます（プライベート/内部ネットワークアドレスはブロックされます）。
- このエンドポイントは 1 時間あたり 120 リクエストにレート制限されています。
- このツールは URL/HTML から画像を生成するため、`originalSize` は常に 0 です。
- 出力ファイル名は `screenshot.<format>` です。
- ページの読み込みに時間がかかりすぎる場合、キャプチャは HTTP 504（ゲートウェイタイムアウト）で失敗します。
- ブラウザサービスが繰り返しクラッシュする場合、一時的に無効化され、キャプチャはコード `BROWSER_CRASHED` とともに HTTP 503 で失敗します。
- ブラウザのクラッシュ（HTTP 503）は、他のキュー化された画像ジョブと同様に、失敗を報告する前に 1 回再試行されます。ページ読み込みのタイムアウトは再試行されません。
- すでに `202` を返したキャプチャが失敗した場合、HTTP ステータスではなく進捗ストリームで失敗が通知されます。
