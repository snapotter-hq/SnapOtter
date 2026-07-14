---
description: "内蔵の Tesseract またはオプションの高精度 RapidOCR ランタイムを使用して、スキャンされた PDF からテキストをローカルに抽出します。"
i18n_output_hash: da2186c9a4cd
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

PDF を外部サービスに送信せずに、スキャンした PDF ドキュメントからページごとにテキストを抽出します。組み込みの `fast` 層は、Tesseract を使用します。オプションの `balanced` 層と `best` 層は、固定された PP-OCR ONNX モデルで RapidOCR を使用します。


<!-- korean-ocr-contract:start -->
::: info 韓国語 OCR の互換性
高速 OCR は `auto`、`en`、`de`、`es`、`fr`、`zh`、`ja` に対応しますが、韓国語 (`ko`) には対応しません。韓国語には高精度 OCR パックと `balanced` または `best` が必要です。パックは公式 Linux amd64/arm64 コンテナで動作し、NVIDIA ホストでも OCR は CPU 上で実行されます。非対応システムでは明示的な互換性エラーを返し、暗黙に `fast` へ切り替えません。韓国語で `fast` または旧 `tesseract` エイリアスを指定すると、キュー投入前に `FEATURE_INCOMPATIBLE` と `fast-korean-unsupported` で拒否されます。
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

PDF ファイルと、任意の JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | はい | - | PDF ファイル (マルチパート)、最大 512 の MiB エンコード。オペレータのアップロード制限の下限は引き続き適用されます |
| quality | string | いいえ | 動的 | OCR 品質レベル: `fast`、`balanced`、または `best` |
| language | string | No | `"auto"` | ドキュメントの言語: `auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| pages | string | No | `"all"` | ページ選択。例: `"all"`、`"1-3"`、`"1,3,5"` |
| enhance | boolean | いいえ | ティアに依存 | 認識前に局所的なコントラストを改善します。高速ではそれを直接適用します。 Balanced および Best は、調整されたスコアによって結果が改善された場合にのみバリアントを保持します。デフォルトは、`best` の場合は `true`、`fast`/`balanced` の場合は `false` です。 |
| engine | string | いいえ | - | 非推奨の互換性エイリアス。代わりに `quality` を使用してください。 `tesseract` は `fast` にマップされます。従来の `paddleocr` 値は `balanced` にマップされますが、PaddlePaddle はロードされません |

`quality` と `engine` を省略すると、SnapOtter は `best`、`balanced`、`fast` の順で利用可能な最上位の層を選びます。韓国語では `fast` を選択せず、`best`、次に `balanced` を使用し、どちらもなければ高精度ランタイムのインストールまたは互換性エラーを返します。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
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
- `fast` が組み込まれており、公式イメージに約 25 個の MiB を追加します。 `balanced` および `best` には、オプションの正確な OCR パックが必要です (ターゲットに応じて、約 208 ～ 234 の MiB をダウンロードし、409 ～ 488 の MiB をインストールします)。
- アキュレート パックは、Linux amd64 および arm64 をサポートし、NVIDIA ホストを含​​む CPU 上で ONNX Runtime を使用します。
- 明示的に要求された層がサイレントにダウングレードされることはありません。 `balanced` または `best` が使用できない場合、API は、`FEATURE_NOT_INSTALLED` または `FEATURE_INCOMPATIBLE` を使用して `501` を返します。
- PDF ページは、OCR の前に高解像度でラスタライズされます。 `best` は、より高精度の中型 PP-OCRv6 モデルを実行し、方向と拡張のバリアントをスコア付けして、速度を犠牲にして認識を向上させます。
- `auto` 言語設定により、サポートされているスクリプト セット全体での認識が可能になります。明示的なヒントにより、既知のドキュメント言語の結果を向上させることができます。
- 範囲指定（`"1-3"`）、カンマ区切りのリスト（`"1,3,5"`）、または全ページを対象とする `"all"` を使って特定のページを対象にできます。
- リクエストは最大 50 ページを処理できます。ラスター化されたスクラッチ データは 512 MiB に制限され、集計 UTF-8 OCR 応答は 1,000,000 バイトに制限されます。制限を超えるジョブは部分的なテキストを返さずに失敗します。
- すでに選択可能なテキストを含む PDF については、代わりに高速な [PDF to Text](./pdf-to-text) ツールの使用を検討してください。
