---
description: "画像内の QR コード、バーコード、2D コードをスキャンし、注釈付きの出力を生成します。"
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 58678814c98b
---

# Barcode Reader {#barcode-reader}

アップロードされた画像であらゆる種類のバーコードと QR コードをスキャンします。検出された各コードについて、デコードされたテキスト、バーコードの種類、位置データを返します。また、検出されたコードの周囲に色付きのバウンディングボックスを描いた注釈付き画像も生成します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

画像ファイルとオプションの JSON `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | No | `true` | 読み取りが難しいバーコード向けにアグレッシブなスキャンモードを有効にします (低速ですがより徹底的) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Example Response {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | 元のファイル名 |
| barcodes | array | 検出されたバーコードオブジェクトの配列 |
| annotatedUrl | string or null | 注釈付き画像のダウンロード URL (バーコードが見つからない場合は null) |
| previewUrl | string or null | annotatedUrl と同じ (フロントエンドプレビュー互換性のため) |

### Barcode Object {#barcode-object}

| Field | Type | Description |
|-------|------|-------------|
| type | string | バーコード形式 (QRCode、EAN-13、Code128、DataMatrix、PDF417 など) |
| text | string | バーコードのデコードされたコンテンツ |
| position | object | topLeft、topRight、bottomLeft、bottomRight の座標を持つバウンディングボックス |

## Supported Barcode Types {#supported-barcode-types}

1D バーコード: Code128、Code39、Code93、Codabar、EAN-8、EAN-13、ITF、UPC-A、UPC-E

2D バーコード: QRCode、DataMatrix、PDF417、Aztec、MaxiCode

## Notes {#notes}

- バーコード検出には zxing-wasm ライブラリを使用します。
- 注釈付き画像は、検出された各バーコードに色付きのポリゴンバウンディングボックスと番号付きラベルを重ねて表示します。
- 1 枚の画像で最大 255 個のバーコードを検出できます。
- バーコードが見つからない場合、`barcodes` は空の配列になり、`annotatedUrl` は null になります。
- `tryHarder` モードは処理時間を犠牲にしてより徹底的なスキャンを実行します。クリーンでよく整列したバーコードを高速に処理するには無効にしてください。
- 注釈付き出力は常に PNG 形式です。
- HEIC、RAW、PSD、SVG の入力はスキャン前に自動的にデコードされます。
- 処理前に EXIF の向きが自動的に適用されます。
