---
description: "以 AI 驅動的轉錄將語音轉換為文字。"
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 4fd436ff8a68
---

# 語音轉錄 {#transcribe-audio}

使用 AI 驅動的轉錄（faster-whisper）將語音轉換為文字。支援純文字、SRT 與 VTT 輸出格式，並可自動或手動選擇語言。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

接受包含一個音訊檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| outputFormat | string | No | `"txt"` | 輸出格式：`txt`、`srt`、`vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

這是一個非同步工具。API 會立即回傳 `202 Accepted`：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

透過 `GET /api/v1/jobs/{jobId}/progress` 的 SSE 追蹤進度。當工作完成時，SSE 串流會傳遞包含 `downloadUrl` 的最終結果。

## Notes {#notes}

- 需要安裝 **transcription** 功能套件包。若套件包無法使用，會回傳 `501` 並帶有代碼 `FEATURE_NOT_INSTALLED`、缺少的 `feature`、`featureName` 以及 `estimatedSize`。
- 使用 faster-whisper 進行轉錄。語言 `auto` 會自動偵測所說的語言。
- `srt` 與 `vtt` 格式會為每個片段包含時間戳記，適合作為字幕。
- `txt` 格式會回傳不含時間戳記的純文字。
- 這是一個長時間執行的 AI 工具；處理時間取決於音訊長度與伺服器硬體。
