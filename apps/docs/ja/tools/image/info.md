---
description: "詳細な画像メタデータ、プロパティ、チャンネルごとのヒストグラム統計を表示します。"
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: c158254ef2ca
---

# 画像情報 {#image-info}

寸法、形式、色空間、EXIF/ICC/XMP の有無、チャンネルごとのヒストグラム統計を含む包括的な画像メタデータを返す読み取り専用の分析ツールです。処理済みの出力ファイルは生成しません。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/info`

画像ファイルを含む multipart フォームデータを受け付けます。設定フィールドは不要です。

## パラメーター {#parameters}

このツールには設定可能なパラメーターがありません。画像ファイルをアップロードするだけです。

| フィールド | 型 | 必須 | 説明 |
|-------|------|----------|-------------|
| file | file | はい | 分析する画像 |

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## レスポンス例 {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## レスポンスフィールド {#response-fields}

| フィールド | 型 | 説明 |
|-------|------|-------------|
| filename | string | サニタイズされたファイル名 |
| fileSize | number | ファイルサイズ（バイト） |
| width | number | 画像の幅（ピクセル） |
| height | number | 画像の高さ（ピクセル） |
| format | string | 検出された形式（jpeg、png、webp など） |
| channels | number | 色チャンネルの数 |
| hasAlpha | boolean | 画像にアルファチャンネルがあるかどうか |
| colorSpace | string | 色空間（srgb、cmyk など） |
| density | number または null | DPI/PPI 解像度 |
| isProgressive | boolean | JPEG がプログレッシブエンコードを使用しているかどうか |
| orientation | number または null | EXIF の向きの値（1〜8） |
| hasProfile | boolean | ICC プロファイルが埋め込まれているかどうか |
| hasExif | boolean | EXIF メタデータが存在するかどうか |
| hasIcc | boolean | ICC カラープロファイルが存在するかどうか |
| hasXmp | boolean | XMP メタデータが存在するかどうか |
| bitDepth | string または null | サンプルあたりのビット数 |
| pages | number | ページ数（TIFF、GIF などの複数ページ形式の場合） |
| histogram | array | チャンネルごとの統計（最小値、最大値、平均値、標準偏差） |

## 注記 {#notes}

- これは読み取り専用のエンドポイントです。ダウンロード可能な出力ファイルや `jobId` は生成しません。
- RAW 形式の画像（DNG、CR2、NEF、ARW など）の場合、Sharp が直接読み取れない真のセンサー寸法とメタデータフラグを抽出するために ExifTool を使用します。
- HEIC/HEIF ファイルは、Sharp が HEVC ピクセルをデコードできないため、ピクセル統計を抽出するために内部で PNG にデコードされます。
- ヒストグラムは、完全な 256 ビン分布ではなく、チャンネルごとの最小値/最大値/平均値/標準偏差を提供します。
- `density` フィールドは、存在する場合、埋め込まれた DPI メタデータを反映します。
