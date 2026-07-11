---
description: "2つの画像を並べて比較し、ピクセルレベルの差分の可視化と類似度スコアを表示します。"
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: 9d731a155cb3
---

# 画像比較 {#image-compare}

2つの画像をアップロードして、ピクセルレベルの差分マップと数値的な類似度パーセンテージを計算します。出力は変化した領域を赤で強調した差分画像です。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/compare`

**2つの**画像ファイルを含むmultipartフォームデータを受け付けます。設定フィールドは不要です。

## パラメータ {#parameters}

このツールに設定可能なパラメータはありません。ちょうど2つの画像ファイルをアップロードしてください。

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| file（1つ目） | file | はい | 1つ目の画像 |
| file（2つ目） | file | はい | 2つ目の画像 |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## レスポンスフィールド {#response-fields}

| フィールド | 型 | 説明 |
|-------|------|-------------|
| jobId | string | 差分画像をダウンロードするためのジョブ識別子 |
| similarity | number | 2つの画像間の類似度パーセンテージ（0〜100） |
| dimensions | object | 比較に使用した幅と高さ |
| downloadUrl | string | 生成された差分画像をダウンロードするURL |
| originalSize | number | 両方の入力画像を合わせたサイズ（バイト） |
| processedSize | number | 差分出力画像のサイズ（バイト） |

## 補足 {#notes}

- 両方の画像は比較の前に同じ寸法（各軸の最大値）にリサイズされます。
- 差分画像は変化の大きさに比例した不透明度で差分を赤く強調します。同一またはほぼ同一のピクセル（差 < 10）は元の半透明バージョンとして表示されます。
- 類似度は全ピクセルにわたる平均ピクセル差の逆数として計算され、パーセンテージで表されます。
- 類似度100%は、（比較解像度で）画像がピクセル単位で同一であることを意味します。
- 差分出力は入力形式に関わらず常にPNG形式です。
- 両方の画像は比較の前に検証・デコードされます（HEIC、RAW、PSD、SVG に対応）。
- 処理前に両方の画像でEXIFの向きが自動適用されます。
