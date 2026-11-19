---
description: "重要度の低い経路に沿ってピクセルを追加または削除するシーム彫刻リサイズで、重要なコンテンツと顔を保持します。"
i18n_source_hash: 16ea4c2778e1
i18n_provenance: human
i18n_output_hash: 7efd22830b4f
---

# コンテンツ対応リサイズ {#content-aware-resize}

視覚的重要度が最も低い経路に沿ってピクセルをインテリジェントに削除または追加するシームカービングリサイズで、重要なコンテンツを保持し、任意で顔を保護します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**処理:** 非同期（202 を返し、SSE 経由で `/api/v1/jobs/{jobId}/progress` をポーリングしてステータスを取得）

**モデルバンドル:** 基本操作には不要。顔の保護を有効にすると `face-detection` バンドル（200〜300 MB）を使用します。

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | はい | - | 画像ファイル（multipart） |
| width | number | いいえ | - | 目標の幅（ピクセル） |
| height | number | いいえ | - | 目標の高さ（ピクセル） |
| protectFaces | boolean | いいえ | `false` | 顔を検出してシーム削除から保護する |
| blurRadius | number | いいえ | `4` | エネルギー計算のための前処理ぼかし半径（0〜20） |
| sobelThreshold | number | いいえ | `2` | Sobelエッジ検出のしきい値（1〜20）。値が高いほどアルゴリズムがより積極的になります |
| square | boolean | いいえ | `false` | 正方形にリサイズする（短い方の寸法を使用） |

`width`、`height`、`square` のうち少なくとも1つを指定する必要があります。

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## レスポンス {#response}

### 初期レスポンス（202 Accepted） {#initial-response-202-accepted}

```json
{
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress",
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 最終結果（SSE 経由） {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
    "originalSize": 450000,
    "processedSize": 380000,
    "width": 800,
    "height": 600
  }
}
```

## 補足 {#notes}

- コンテンツ対応リサイズには `caire` シームカービングライブラリを使用します。
- 寸法を縮小する（シームを削除する）のみです。画像を元のサイズより拡大することはできません。
- `protectFaces` オプションはAI顔検出を使って顔領域を高エネルギーとしてマークし、シームが顔を通過するのを防ぎます。
- `blurRadius` はエネルギーマップ計算前のスムージングを制御します。値が高いほどエネルギーマップがより均一になり、ノイズの多い画像に役立ちます。
- `sobelThreshold` はエッジがどれだけ積極的に検出されるかに影響します。値が低いほど微細なエッジがより保持されます。
- 出力は常にPNG形式です。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力形式に自動デコードで対応します。
