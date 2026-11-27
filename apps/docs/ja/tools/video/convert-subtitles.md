---
description: "SRT、WebVTT、ASS の間で字幕ファイルを変換します。"
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 278586618c53
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

字幕ファイルを SRT、WebVTT、ASS の間で変換します。タイミングとテキストは引き継がれますが、ASS の位置指定とエフェクトは引き継がれません。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

字幕ファイル1つ(`.srt`、`.vtt`、または `.ass`)と、任意の JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | 出力フォーマット: `srt`、`vtt`、または `ass` |
| `encoding` | string | `"auto"` | 入力のテキストエンコーディング: `auto`、`utf-8`、`windows-1252`、`windows-1250`、`windows-1251`、`windows-1256`、`iso-8859-2`、`gb18030`、`big5`、`shift_jis`、または `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- ASS から変換する場合、タイミング、台詞のテキスト、および変換先が保持できる基本的な書式は維持されます。SRT では斜体、太字、色、フォントサイズがタグとして維持され、WebVTT では斜体、太字、下線が維持されます。画面上の位置指定、アニメーション、その他の ASS エフェクトは削除されます。
- 出力は常に UTF-8 です。`encoding` が `auto` の場合、有効な UTF-8 のファイルはそのまま読み込まれ、それ以外は Windows-1252(古い西ヨーロッパ言語の SRT ファイルでよく使われるエンコーディング)として読み込まれます。アクセント付き文字や非ラテン文字が文字化けする場合は、`encoding` をファイルの実際のエンコーディングに設定してください(たとえば簡体字中国語なら `gb18030`、キリル文字なら `windows-1251`)。
- 字幕のアップロードは、デフォルトで 1 MB が上限です。上限の引き上げや解除は `MAX_SUBTITLE_SIZE_MB` で行えます。
