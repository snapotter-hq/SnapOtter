---
description: "AI 搭載の OCR を使って PDF ドキュメントからテキストを抽出します。"
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: d39e66166498
---

# PDF OCR {#pdf-ocr}

AI 搭載の光学文字認識を使って PDF ドキュメントからテキストを抽出します。複数の品質ティアと言語に対応しています。OCR 機能バンドルのインストールが必要です。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

PDF ファイルと、任意の JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | OCR 品質ティア: `fast`、`balanced`、`best` |
| language | string | No | `"auto"` | ドキュメントの言語: `auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| pages | string | No | `"all"` | ページ選択。例: `"all"`、`"1-3"`、`"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

`202 Accepted` を返します。進捗は `/api/v1/jobs/{jobId}/progress` の SSE で追跡できます。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 受け付ける入力形式: `.pdf`。
- これは **OCR 機能バンドル** のインストールが必要な AI ツールです。バンドルがインストールされていない場合、API は `501 Not Implemented` を返します。
- `fast` 品質ティアはより軽量なモデルを使って高速に処理します。`best` は速度を犠牲にしてより高精度なモデルを使用します。
- `auto` の言語設定は、ドキュメントの言語を自動的に検出しようとします。
- 範囲指定（`"1-3"`）、カンマ区切りのリスト（`"1,3,5"`）、または全ページを対象とする `"all"` を使って特定のページを対象にできます。
- すでに選択可能なテキストを含む PDF については、代わりに高速な [PDF to Text](./pdf-to-text) ツールの使用を検討してください。
