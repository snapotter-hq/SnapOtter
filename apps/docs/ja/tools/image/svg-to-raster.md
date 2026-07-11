---
description: "SVGファイルをカスタム解像度とDPIでPNG、JPEG、WebP、AVIF、TIFF、GIF、HEIF、JXLに変換します。バッチ対応。"
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: 43e1f6049aa4
---

# SVG to Raster {#svg-to-raster}

SVGファイルを、カスタム解像度とDPIでラスター画像フォーマット（PNG、JPEG、WebP、AVIF、TIFF、GIF、HEIF、JXL）に変換します。複数のSVGのバッチ変換にも対応します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | 目標の幅（ピクセル、1〜65536）。片方の寸法のみ設定した場合はアスペクト比を維持します。 |
| height | integer | No | - | 目標の高さ（ピクセル、1〜65536）。片方の寸法のみ設定した場合はアスペクト比を維持します。 |
| dpi | integer | No | 300 | レンダリングDPI。ラスタライズの基準となる密度を制御します（36〜2400） |
| quality | number | No | 90 | 非可逆フォーマットの出力品質（1〜100） |
| backgroundColor | string | No | `"#00000000"` | 背景色（16進、6文字または8文字。8文字はアルファを含む） |
| outputFormat | string | No | `"png"` | 出力フォーマット: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Batch Endpoint {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

1回のリクエストで複数のSVGファイルを変換します。ZIPアーカイブを返します。

### Additional Batch Parameters {#additional-batch-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | 進捗追跡用にクライアントが指定する任意のジョブID（最大128文字） |

### Batch Example Request {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batch Response {#batch-response}

バッチエンドポイントは、以下のヘッダーとともにZIPファイルを直接ストリーミングします:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notes {#notes}

- SVGおよびSVGZファイルのみを受け付けます（拡張子だけでなく内容も検証します）。SVGZは自動的に展開されます。
- SVGの内容は、XSSや外部リソースの読み込みを防ぐため、レンダリング前にサニタイズされます。
- `dpi`設定は、SVGをラスタライズする密度を制御します。DPIを高くすると、同じSVGビューポートからより大きなピクセル寸法が生成されます。
- `width`と`height`の両方を指定した場合、画像は`fit: inside`を使用してリサイズされます（範囲内でアスペクト比を維持します）。
- ブラウザがネイティブに表示できないフォーマット（TIFF、HEIF）については、レスポンスに`previewUrl`が含まれます。プレビューは1200pxのWebPサムネイルです。
- デフォルトの背景`#00000000`は完全に透明です。白い背景（透過をサポートしないJPEG出力で便利）にするには`#FFFFFF`に設定してください。
- バッチ処理は`MAX_BATCH_SIZE`サーバー設定に従い、パフォーマンスのため並行ワーカーを使用します。
- バッチ操作の進捗は`/api/v1/jobs/:jobId/progress`のSSEで追跡できます。
