---
description: "25種類以上のテンプレート、調整可能な間隔と角丸、セルごとのパンとズームで複数の画像をグリッドコラージュに組み合わせます。"
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: 7996d8d33ce4
---

# コラージュとグリッド {#collage-grid}

25種類以上のテンプレートを使って複数の画像を美しいグリッドコラージュに組み合わせます。2〜9枚の画像レイアウトに対応し、間隔、角丸半径、背景色、セルごとのパン/ズームをカスタマイズできます。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/collage`

## パラメータ {#parameters}

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| templateId | string | はい | - | テンプレートレイアウトID（例: `2-h-equal`、`3-left-large`、`4-grid`、`9-grid`） |
| cells | array | いいえ | - | `imageIndex`、`panX`、`panY`、`zoom`、`objectFit` を含むセルごとの設定配列 |
| cells[].imageIndex | integer | はい | - | このセルに配置する画像のインデックス（0始まり） |
| cells[].panX | number | いいえ | 0 | 水平方向のパンオフセット（-100〜100） |
| cells[].panY | number | いいえ | 0 | 垂直方向のパンオフセット（-100〜100） |
| cells[].zoom | number | いいえ | 1 | ズームレベル（1〜10） |
| cells[].objectFit | string | いいえ | `"cover"` | 画像がセルを満たす方法: `cover` または `contain` |
| gap | number | いいえ | 8 | セル間の間隔（ピクセル、0〜500） |
| cornerRadius | number | いいえ | 0 | 各セルの角丸半径（ピクセル、0〜500） |
| backgroundColor | string | いいえ | `"#FFFFFF"` | 16進数または `"transparent"` の背景色 |
| aspectRatio | string | いいえ | `"free"` | キャンバスのアスペクト比: `free`、`1:1`、`4:3`、`3:2`、`16:9`、`9:16`、`4:5` |
| outputFormat | string | いいえ | `"png"` | 出力形式: `png`、`jpeg`、`webp`、`avif`、`jxl` |
| quality | number | いいえ | 90 | 出力品質（1〜100） |

## 利用可能なテンプレート {#available-templates}

| テンプレートID | 画像数 | レイアウト |
|-------------|--------|--------|
| `2-h-equal` | 2 | 等幅2列 |
| `2-v-equal` | 2 | 等幅2行 |
| `2-h-left-large` | 2 | 左2/3、右1/3 |
| `2-h-right-large` | 2 | 左1/3、右2/3 |
| `3-left-large` | 3 | 左に大、右に2つ縦積み |
| `3-right-large` | 3 | 左に2つ縦積み、右に大 |
| `3-top-large` | 3 | 上に大、下に2列 |
| `3-h-equal` | 3 | 等幅3列 |
| `3-v-equal` | 3 | 等幅3行 |
| `4-grid` | 4 | 2x2グリッド |
| `4-left-large` | 4 | 左に大、右に3つ縦積み |
| `4-top-large` | 4 | 上に大、下に3列 |
| `4-bottom-large` | 4 | 上に3列、下に大 |
| `5-top2-bottom3` | 5 | 上に2つ、下に3つ |
| `5-top3-bottom2` | 5 | 上に3つ、下に2つ |
| `5-left-large` | 5 | 左に大、右に4つ縦積み |
| `5-center-large` | 5 | 中央に大、四隅に4つ |
| `6-grid-2x3` | 6 | 2列 x 3行 |
| `6-grid-3x2` | 6 | 3列 x 2行 |
| `6-top-large` | 6 | 上に大、下に5列 |
| `7-mosaic` | 7 | モザイクレイアウト |
| `8-mosaic` | 8 | モザイクレイアウト |
| `9-grid` | 9 | 3x3グリッド |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## レスポンス例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## 補足 {#notes}

- multipartリクエストで複数の画像ファイルをアップロードします。画像はアップロード順にテンプレートのセルへ割り当てられます。
- テンプレートが対応する数より多くの画像をアップロードした場合、余分な画像は無視されます。
- HEIC、RAW、PSD、SVG の入力形式に対応します（自動でデコードされます）。
- キャンバスの基準サイズは長辺2400pxで、選択したアスペクト比に応じてスケーリングされます。
- `aspectRatio` が `"free"` の場合、キャンバスはデフォルトで4:3（2400x1800）になります。
- セルごとの `panX`/`panY` 値はセル内の切り抜き位置をずらします。100 は一方の端いっぱいまで、-100 は反対側に移動します。
- `"transparent"` の背景色は、`png`、`webp`、`avif` の出力形式でのみ保持されます。
