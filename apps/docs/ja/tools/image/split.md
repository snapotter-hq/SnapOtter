---
description: "1枚の画像を行と列またはピクセルサイズでグリッドタイルに分割し、ZIPアーカイブとして返します。"
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: ed25c8d33ed5
---

# 画像分割 {#image-splitting}

1枚の画像を、列/行数または特定のピクセル寸法でグリッドタイルに分割します。すべてのタイルを含むZIPアーカイブを返します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | 分割する列数（1〜100） |
| rows | integer | No | 3 | 分割する行数（1〜100） |
| tileWidth | integer | No | - | タイルの幅（ピクセル、最小10）。`tileWidth`と`tileHeight`の両方が設定されている場合、`columns`より優先されます。 |
| tileHeight | integer | No | - | タイルの高さ（ピクセル、最小10）。`tileWidth`と`tileHeight`の両方が設定されている場合、`rows`より優先されます。 |
| outputFormat | string | No | `"original"` | タイルの出力フォーマット: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | 非可逆フォーマットの出力品質（1〜100） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Example Response {#example-response}

レスポンスは`Content-Type: application/zip`とともにZIPファイルとして直接ストリーミングされます。ファイル名は`split-<jobId>.zip`のパターンに従います。

ZIP内の各タイルは`<originalBaseName>_r<row>_c<col>.<ext>`という名前になります（例: `photo_r1_c1.png`, `photo_r2_c3.webp`）。

## Notes {#notes}

- 単一の画像ファイルを受け付けます。
- HEIC、RAW、PSD、SVGの入力フォーマットに対応します（自動的にデコードされます）。
- `tileWidth`と`tileHeight`の両方が指定された場合、`columns`/`rows`より優先されます。グリッド寸法は`ceil(imageWidth / tileWidth)`および`ceil(imageHeight / tileHeight)`として計算されます。
- 画像の寸法が均等に割り切れない場合、端のタイル（最右列、最下行）は指定したタイルサイズより小さくなることがあります。
- グリッドの最大サイズは100x100（10,000タイル）に制限されています。
- レスポンスはZIPを直接ストリーミングするため、JSONレスポンスボディはありません。curlでファイルを保存するには`--output`を使用してください。
