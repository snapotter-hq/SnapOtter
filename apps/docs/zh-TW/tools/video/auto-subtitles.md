---
description: "使用 AI 從影片音軌產生字幕檔案。"
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 40a2fcb5205c
---

# 自動字幕 {#auto-subtitles}

使用 AI 驅動的語音辨識（faster-whisper）從影片的音軌產生字幕檔案。支援自動偵測與 10 種明確指定的語言。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

接受包含影片檔案與 JSON `settings` 欄位的 multipart 表單資料。這是一個非同步端點，它會立即回傳 `202 Accepted`，並透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 串流進度。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| language | string | 否 | `"auto"` | 語音語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| format | string | 否 | `"srt"` | 輸出字幕格式：`srt`、`vtt` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## 注意事項 {#notes}

- 這是一個需要安裝 **transcription** 功能套件包的 AI 工具。若未安裝該套件包，API 會回傳 `501 Feature Not Installed`，並附上透過管理員 UI 安裝的說明。
- `auto` 語言選項使用 whisper 內建的語言偵測。明確指定語言可提升準確度與速度。
- SRT 是支援最廣泛的字幕格式。VTT（WebVTT）是網頁影片播放器的標準。
- 進度更新會透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 提供，直到工作完成為止。
