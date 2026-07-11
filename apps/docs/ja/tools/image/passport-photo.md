---
description: "顔検出、背景除去、印刷シートの並べ配置を備えた AI パスポート・証明写真ジェネレーター。"
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 2b0c1ea5ec9f
---

# パスポート写真 {#passport-photo}

AI によるパスポート・証明写真ジェネレーター。2 フェーズのワークフローで、解析（顔検出 + 背景除去）してから生成（切り抜き、リサイズ、印刷用の並べ配置）を行います。

## API エンドポイント {#api-endpoints}

このツールは、解析と生成で別々のエンドポイントを使う 2 フェーズのフローを採用しています。

**モデルバンドル:** `background-removal` および `face-detection`

---

### フェーズ 1: 解析 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

顔のランドマークを検出し、背景を除去します。フロントエンドが切り抜きプレビューを表示するために、ランドマークデータとプレビューを返します。

#### パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（マルチパート） |
| clientJobId | string | No | - | SSE 経由での進捗追跡用の任意のジョブ ID |

#### リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### レスポンス（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### 進捗（SSE、オプション） {#progress-sse-optional}

`clientJobId` が指定された場合、進捗がストリーミングされます（顔検出が 0～30%、背景除去が 30～95%）。

#### エラー: 顔が検出されない（422） {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### フェーズ 2: 生成 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

写真を切り抜き、リサイズし、任意で印刷シート上に並べて配置します。フェーズ 1 のキャッシュ画像を使用します（AI の再実行なし）。

#### パラメーター（JSON ボディ） {#parameters-json-body}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| jobId | string | Yes | - | フェーズ 1 のジョブ ID |
| filename | string | Yes | - | フェーズ 1 の元のファイル名 |
| countryCode | string | Yes | - | パスポート仕様の国コード（例: `US`, `GB`, `IN`） |
| documentType | string | No | `"passport"` | 書類タイプ（国別仕様による） |
| bgColor | string | No | `"#FFFFFF"` | 背景色（16 進） |
| printLayout | string | No | `"none"` | 印刷用紙のレイアウト: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | 最大ファイルサイズ制約（KB、0 = 制限なし） |
| dpi | number | No | `300` | 出力 DPI（72～1200） |
| customWidthMm | number | No | - | カスタム写真幅（mm、国別仕様を上書き） |
| customHeightMm | number | No | - | カスタム写真高さ（mm、国別仕様を上書き） |
| zoom | number | No | `1` | ズーム倍率（0.5～3）。1 より大きい値でより狭く切り抜く |
| adjustX | number | No | `0` | 水平方向の位置調整 |
| adjustY | number | No | `0` | 垂直方向の位置調整 |
| landmarks | object | Yes | - | フェーズ 1 レスポンスのランドマークオブジェクト |
| imageWidth | number | Yes | - | フェーズ 1 レスポンスの画像幅 |
| imageHeight | number | Yes | - | フェーズ 1 レスポンスの画像高さ |

#### リクエスト例 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### レスポンス（200 OK） {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### ベースルート {#base-route}

`POST /api/v1/tools/image/passport-photo`

正しいサブエンドポイントを使用するための案内を返します。

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## 注意事項 {#notes}

- `background-removal` および `face-detection` モデルバンドルのインストールが必要です。
- フェーズ 1 は AI（顔のランドマーク + 背景除去）を実行し、結果をキャッシュします。フェーズ 2 は純粋な Sharp による画像操作です（高速、AI 不要）。
- ランドマークは正規化された座標（画像寸法に対する 0～1 の範囲）として返されます。
- 解析レスポンスの `preview` フィールドは、高速表示のための base64 エンコードされた PNG（最大幅 800px）です。
- 国別仕様には、公式のパスポート写真要件に基づく書類寸法、頭部の高さ比率、目線の位置が含まれます。
- `printLayout` オプションは、4x6 インチまたは A4 用紙上に、写真間 2mm の余白を空けて並べたシートを生成します。
- `maxFileSizeKb` が設定されている場合、サイズ制限に収まるよう出力が反復的に圧縮されます。
