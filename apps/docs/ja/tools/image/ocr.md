---
description: "AI による光学式文字認識で画像からテキストを抽出します。"
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 26f22dbdf9c3
---

# OCR / テキスト抽出 {#ocr-text-extraction}

AI による光学式文字認識（OCR）で画像からテキストを抽出します。複数の言語と品質ティアに対応しています。

## API エンドポイント {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**処理:** 同期的な JSON レスポンス。`clientJobId` が指定された場合、進捗も SSE 経由で報告されます。

**モデルバンドル:** `ocr`（5～6 GB）

## パラメーター {#parameters}

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 画像ファイル（マルチパート） |
| quality | string | No | `"balanced"` | 品質ティア: `fast`（Tesseract）, `balanced`（PaddleOCR v5）, `best`（PaddleOCR VL） |
| language | string | No | `"auto"` | 言語ヒント: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | OCR 精度向上のために画像を前処理する |
| engine | string | No | - | 非推奨。代わりに `quality` を使用してください。`tesseract` を `fast` に、`paddleocr` を `balanced` にマッピングします |

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
  "engine": "paddleocr-vl"
}
```

### 進捗（SSE、オプション） {#progress-sse-optional}

`clientJobId` フォームフィールドが指定された場合、進捗イベントがストリーミングされます。

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## 注意事項 {#notes}

- `ocr` モデルバンドル（5～6 GB）のインストールが必要です。
- OCR は画像のダウンロード URL ではなく、抽出したテキストを直接返します。
- フォールバックチェーンを使用します。上位の品質ティアがクラッシュした場合（例: PaddleOCR のセグメンテーション違反）、自動的に一段下のティアで再試行します。
- クラッシュせずに空のテキストが返された場合も、次のティアにフォールバックします。
- 品質ティアはエンジンにマッピングされます。`fast` = Tesseract、`balanced` = PaddleOCR v5、`best` = PaddleOCR VL。
- HEIC/HEIF、RAW、TGA、PSD、EXR、HDR の入力フォーマットを自動デコードでサポートします。
