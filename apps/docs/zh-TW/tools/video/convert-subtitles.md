---
description: "在 SRT、WebVTT 和 ASS 之間轉換字幕檔案。"
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 96a1817be5bb
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

在 SRT、WebVTT 和 ASS 之間轉換字幕檔案。時間軸與文字會保留，但 ASS 的定位與特效不會保留。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

接受包含一個字幕檔案（`.srt`、`.vtt` 或 `.ass`）以及選用 JSON `settings` 欄位的 multipart 表單資料。

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | 輸出格式：`srt`、`vtt` 或 `ass` |
| `encoding` | string | `"auto"` | 輸入的文字編碼：`auto`、`utf-8`、`windows-1252`、`windows-1250`、`windows-1251`、`windows-1256`、`iso-8859-2`、`gb18030`、`big5`、`shift_jis` 或 `euc-kr` |

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

- 從 ASS 轉換時，會保留時間軸、對白文字，以及目標格式能夠承載的基本格式：SRT 以標籤形式保留斜體、粗體、顏色與字型大小，WebVTT 則保留斜體、粗體與底線。畫面定位、動畫與其他 ASS 特效會被捨棄。
- 輸出一律為 UTF-8。當 `encoding` 設為 `auto` 時，有效的 UTF-8 檔案會直接讀取，其他檔案則以 Windows-1252 讀取（舊式西歐 SRT 檔案常用的編碼）。如果帶重音符號或非拉丁字元顯示為亂碼，請將 `encoding` 設為檔案實際的編碼（例如簡體中文用 `gb18030`，西里爾文用 `windows-1251`）。
- 字幕上傳預設上限為 1 MB。可透過 `MAX_SUBTITLE_SIZE_MB` 調高或取消此上限。
