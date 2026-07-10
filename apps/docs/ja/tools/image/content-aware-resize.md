---
description: "重要度の低い経路に沿ってピクセルを追加または削除するシーム彫刻リサイズで、重要なコンテンツと顔を保持します。"
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 9d8d75503812
---

# コンテンツ対応リサイズ {#content-aware-resize}

視覚的重要度が最も低い経路に沿ってピクセルをインテリジェントに削除または追加するシームカービングリサイズで、重要なコンテンツを保持し、任意で顔を保護します。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**処理:** 同期（結果を直接返します）

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

## レスポンス（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## 補足 {#notes}

- このカスタムルートは現在、同期の200レスポンスを返します。
- コンテンツ対応リサイズには `caire` シームカービングライブラリを使用します。
- 寸法を縮小する（シームを削除する）のみです。画像を元のサイズより拡大することはできません。
- `protectFaces` オプションはAI顔検出を使って顔領域を高エネルギーとしてマークし、シームが顔を通過するのを防ぎます。
- `blurRadius` はエネルギーマップ計算前のスムージングを制御します。値が高いほどエネルギーマップがより均一になり、ノイズの多い画像に役立ちます。
- `sobelThreshold` はエッジがどれだけ積極的に検出されるかに影響します。値が低いほど微細なエッジがより保持されます。
- 出力は常にPNG形式です。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力形式に自動デコードで対応します。
