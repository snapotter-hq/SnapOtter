---
description: "複数の画像を1枚のスプライトシートグリッドに結合し、フレームのメタデータを付与します。"
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: febba953c6c4
---

# Sprite Sheet {#sprite-sheet}

複数の画像を1枚のスプライトシートグリッドに結合します。各画像は最初の画像の寸法に合わせてリサイズされ、グリッドに配置されます。フレームごとの座標メタデータとともにスプライトシート画像を返します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

2枚以上の画像ファイルとJSON形式の`settings`フィールドを含むmultipartフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | グリッドの列数（1〜16） |
| padding | integer | No | `0` | セル間の余白（ピクセル、0〜64） |
| background | string | No | `"#ffffff"` | 背景の16進カラー |
| format | string | No | `"png"` | 出力フォーマット: `png`, `webp`, または`jpeg` |
| quality | integer | No | `90` | 出力品質（1〜100） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notes {#notes}

- 2〜64枚の画像を受け付けます。すべての画像は、最初にアップロードした画像の寸法に合わせてリサイズされます。
- `frames`配列は、出力内の各フレームの正確なピクセル座標を提供し、CSSスプライト定義やゲームエンジンのフレームマップに利用できます。
- 行数は、画像数と`columns`の値から自動的に計算されます。
- セル間に間隔を設けるには`padding`パラメータを使用します。`background`の色は、余白領域や末尾の空セルに表示されます。
- HEIC、RAW、PSD、SVGの入力は処理前に自動的にデコードされます。
