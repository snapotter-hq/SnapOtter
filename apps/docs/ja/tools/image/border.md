---
description: "予測可能で制御しやすい順序で、画像にボーダー、パディング、角丸、ドロップシャドウを追加します。"
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 5356b70a6b09
---

# Border & Frame {#border-frame}

画像にボーダー、パディング、角丸、ドロップシャドウを追加します。このツールは次の順序でエフェクトを適用します: パディング、ボーダー、角の丸み、シャドウ。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | number | No | 10 | ボーダーの太さ (ピクセル) (0 ～ 2000) |
| borderColor | string | No | `"#000000"` | ボーダーの色 (16 進) (例: `#FF0000`) |
| padding | number | No | 0 | 画像とボーダーの間の内側パディング (ピクセル) (0 ～ 200) |
| paddingColor | string | No | `"#FFFFFF"` | パディングの塗りつぶし色 (16 進) |
| cornerRadius | number | No | 0 | 角の丸み (ピクセル) (0 ～ 2000) |
| shadow | boolean | No | `false` | ドロップシャドウを追加するかどうか |
| shadowBlur | number | No | 15 | シャドウのぼかし半径 (1 ～ 200) |
| shadowOffsetX | number | No | 0 | シャドウの水平オフセット (-50 ～ 50) |
| shadowOffsetY | number | No | 5 | シャドウの垂直オフセット (-50 ～ 50) |
| shadowColor | string | No | `"#000000"` | シャドウの色 (16 進) |
| shadowOpacity | number | No | 40 | シャドウの不透明度 (パーセント) (0 ～ 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notes {#notes}

- 標準の `createToolRoute` ファクトリを使用します。マルチパートアップロードで 1 つの画像ファイルを受け付けます。
- HEIC、RAW、PSD、SVG の入力形式をサポートします (自動的にデコードされます)。
- 処理順序: まずパディングが追加され、次にボーダーが周囲を囲み、その後角の丸みが適用され、最後にシャドウが合成されます。
- `cornerRadius` または `shadow` が有効な場合、透明度を保持するために出力は (入力形式に関係なく) PNG に強制されます。アルファをサポートする形式 (PNG、WebP、AVIF) は元の形式を維持します。
- シャドウは形状を認識します。長方形のシャドウを作成するのではなく、角丸に沿います。
- `borderWidth` を 0 に設定し、`cornerRadius` と `shadow` のみを使用すると、フレームなしの角丸シャドウ効果が作成されます。
