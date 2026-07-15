---
description: "画像を横並び、縦積み、またはグリッド状に結合し、配置・間隔・境界線・リサイズモードを制御できます。"
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: e7e483233339
---

# 画像を結合 {#stitch-combine}

複数の画像を横並び、縦積み、またはグリッド状に結合します。配置、間隔、境界線、角丸、複数のリサイズモードに対応します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | レイアウト方向: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | directionが`grid`のときの列数（2〜100） |
| resizeMode | string | No | `"fit"` | 画像のリサイズ方法: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | 交差軸方向の配置: `start`, `center`, `end` |
| gap | number | No | 0 | 画像間の間隔（ピクセル、0〜1000） |
| border | number | No | 0 | 外周の境界線の幅（ピクセル、0〜500） |
| cornerRadius | number | No | 0 | 最終出力に適用する角丸半径（0〜500） |
| backgroundColor | string | No | `"#FFFFFF"` | 背景/境界線の色（16進、例: `#FF0000`） |
| format | string | No | `"png"` | 出力フォーマット: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | 出力品質（1〜100） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notes {#notes}

- 少なくとも2枚の画像が必要です。multipartリクエストで複数の画像ファイルをアップロードしてください。
- HEIC、RAW、PSD、SVGの入力フォーマットに対応します（自動的にデコードされます）。
- リサイズモード:
  - `fit` - 結合軸方向の最小寸法に合わせて画像をスケールします。
  - `original` - 元のサイズを維持します（端が不揃いになることがあります）。
  - `stretch` - アスペクト比を維持せず、最小寸法に合わせて強制的に揃えます。
  - `crop` - 最小寸法に合わせて画像をカバークロップします。
- `grid`モードでは、セルはすべての画像の寸法の中央値にサイズ調整されます。
- `cornerRadius`は個々の画像ではなく、最終出力全体に適用されます。
- キャンバスサイズは、メモリ枯渇を防ぐために`MAX_CANVAS_PIXELS`サーバー設定によって制限されます。
