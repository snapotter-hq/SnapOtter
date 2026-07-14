---
description: "組み込みの Tesseract またはオプションの高精度 RapidOCR ランタイムを使用して、画像からテキストをローカルに抽出します。"
i18n_output_hash: 360daff93230
i18n_source_hash: 01c6fa6aebe7
i18n_provenance: human
---

# OCR / テキスト抽出 {#ocr-text-extraction}

画像を外部サービスに送信せずに、画像からテキストを抽出します。組み込みの `fast` 層は、Tesseract を使用します。オプションの `balanced` 層と `best` 層は、固定された PP-OCR ONNX モデルで RapidOCR を使用します。


<!-- korean-ocr-contract:start -->
::: info 韓国語 OCR の互換性
高速 OCR は `auto`、`en`、`de`、`es`、`fr`、`zh`、`ja` に対応しますが、韓国語 (`ko`) には対応しません。韓国語には高精度 OCR パックと `balanced` または `best` が必要です。パックは公式 Linux amd64/arm64 コンテナで動作し、NVIDIA ホストでも OCR は CPU 上で実行されます。非対応システムでは明示的な互換性エラーを返し、暗黙に `fast` へ切り替えません。韓国語で `fast` または旧 `tesseract` エイリアスを指定すると、キュー投入前に `FEATURE_INCOMPATIBLE` と `fast-korean-unsupported` で拒否されます。
:::
<!-- korean-ocr-contract:end -->
## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**処理:** OCR が同期ウィンドウ内で終了すると、JSON とともに `200` を返します。長いジョブは `202` を返します。ジョブの SSE 進行ストリームをその終了イベントまで追跡します。その `result` には同じ OCR フィールドが含まれます。

**正確な OCR パック:** オプションの `ocr` ランタイム (ターゲットに応じて、約 208 ～ 234 の MiB をダウンロードし、409 ～ 488 の MiB をインストールします)。 `fast` にはこのパックは必要ありません。インストーラーは、署名付きインデックスによって制限される正確なサイズを検証します。

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | はい | - | 画像ファイル (マルチパート)、最大 512 MiB エンコードおよび 40 メガピクセルのデコード。オペレータのアップロード制限の下限は引き続き適用されます |
| quality | string | いいえ | 動的 | 品質レベル: `fast` (Tesseract)、`balanced` (小型 PP-OCRv6 モデルを備えた RapidOCR)、または `best` (校正されたバリアント スコアリングを備えた高精度の中型 PP-OCRv6 モデル) |
| language | string | No | `"auto"` | 言語ヒント: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | いいえ | ティアに依存 | 認識前に局所的なコントラストを改善します。高速ではそれを直接適用します。 Balanced および Best は、調整されたスコアによって結果が改善された場合にのみバリアントを保持します。デフォルトは、`best` の場合は `true`、`fast`/`balanced` の場合は `false` です。 |
| engine | string | いいえ | - | 非推奨の互換性エイリアス。代わりに `quality` を使用してください。 `tesseract` は `fast` にマップされます。従来の `paddleocr` 値は `balanced` にマップされますが、PaddlePaddle はロードされません |

`quality` と `engine` を省略すると、SnapOtter は `best`、`balanced`、`fast` の順で利用可能な最上位の層を選びます。韓国語では `fast` を選択せず、`best`、次に `balanced` を使用し、どちらもなければ高精度ランタイムのインストールまたは互換性エラーを返します。

## リクエスト例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## レスポンス（200 OK） {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "rapidocr-onnx",
  "requestedQuality": "best",
  "actualQuality": "best",
  "device": "cpu",
  "provider": "CPUExecutionProvider",
  "degraded": false,
  "warnings": [],
  "runtimeVersion": "2.1.0",
  "modelVersion": "PP-OCRv6-best-v1-medium"
}
```

### 進捗（SSE、オプション） {#progress-sse-optional}

`clientJobId` フォーム フィールドが提供されている場合、進行状況イベントがストリーミングされます。 `202` 応答は、クライアントが端末の `complete` または `failed` イベントが発生するまでストリームを開いたままにしておく必要があることを意味します。

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## 注意事項 {#notes}

- `fast` は、サポートされている SnapOtter イメージで常に使用できます。 `balanced` および `best` には、オプションの正確な OCR パックが必要です。
- 内蔵の Tesseract は、公式イメージに約 25 個の MiB を追加します。正確なパックはイメージに焼き付けられるのではなく、`/data/ai` に保存されます。
- 公式 Linux amd64 および arm64 コンテナー用に正確なパックが公開されています。 NVIDIA ホストを含​​む ONNX Runtime の CPU プロバイダーを意図的に使用するため、CUDA ライブラリや GPU の互換性に依存しません。 ソースおよびビルド済みの bare-metal インストールは、独自の互換性のあるランタイムを提供しない限り、高速 OCR を使用します。
- OCR は画像のダウンロード URL ではなく、抽出したテキストを直接返します。
- SnapOtter は、明示的に要求された層を尊重します。 `balanced` または `best` が使用できない場合、API は、`FEATURE_NOT_INSTALLED` または `FEATURE_INCOMPATIBLE` を含む `501` を返します。リクエストを黙って別の層にダウングレードすることはありません。
- 成功した空の結果は空の結果のままになります。実行時にエラーが発生した場合は、低品質のエンジンで再試行するのではなく、エラーが返されます。
- 応答では、`requestedQuality` と `actualQuality` の両方に加えて、エンジン、デバイス、プロバイダー、ランタイムとモデルのバージョン、および警告が報告されます。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力フォーマットを自動デコードでサポートします。
- オーバーサイズのエンコードされた入力は、`413` を返します。 40 メガピクセルを超える画像と、制限された出力制限を超える OCR 応答は、部分的に処理される代わりに拒否されます。
