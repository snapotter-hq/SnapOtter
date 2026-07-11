---
description: "PDF 内のすべての色をグレースケールに変換します。"
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 0466287cba05
---

# Grayscale PDF {#grayscale-pdf}

PDF 内のすべての色をグレースケールに変換し、ドキュメントの白黒バージョンを生成します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

PDF ファイルを含む multipart フォームデータを受け付けます。`settings` フィールドは不要です。

## Parameters {#parameters}

このツールに設定パラメータはありません。PDF ファイルをそのままアップロードしてください。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- すべての色空間（RGB、CMYK）が、埋め込み画像、ベクターグラフィック、テキストを含めてグレースケールに変換されます。
- グレースケールデータは 1 ピクセルあたりのバイト数が少なくて済むため、出力ファイルは元よりも小さくなることが多いです。
