---
description: "Code 128、EAN-13、UPC-A、Code 39、ITF-14、Data Matrix 形式のバーコードを生成します。"
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 8c99b0662912
---

# Barcode Generator {#barcode-generator}

テキスト入力からバーコード画像を生成します。Code 128、EAN-13、UPC-A、Code 39、ITF-14、Data Matrix 形式をサポートします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

`application/json` ボディを受け付けます (マルチパートではありません)。バーコードはアップロードされたファイルではなく、指定されたテキストから生成されます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | バーコードにエンコードするテキスト (1 ～ 256 文字) |
| type | string | No | `"code128"` | バーコード形式: `code128`、`ean13`、`upca`、`code39`、`itf14`、`datamatrix` |
| scale | integer | No | `3` | 画像のスケール係数 (1 ～ 8) |
| includeText | boolean | No | `true` | バーコードの下にテキストをレンダリングするかどうか |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- 大半のツールとは異なり、このエンドポイントはマルチパートフォームデータではなく JSON ボディを受け付けます。これは、バーコードがアップロードされたファイルではなくテキストから生成されるためです。
- EAN-13 は正確に 12 桁または 13 桁の数字が必要です。UPC-A は正確に 11 桁または 12 桁の数字が必要です。チェックディジットが省略された場合は自動的に計算されます。
- Code 128 は最も柔軟な形式で、完全な ASCII 文字セットをサポートします。
- Data Matrix は、長い文字列をコンパクトな正方形にエンコードするのに適した 2D バーコードを生成します。
