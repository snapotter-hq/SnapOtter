---
description: "在 MP3、WAV、OGG、FLAC 與 M4A 格式之間轉換音訊。"
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: b364a00de332
---

# 轉換音訊 {#convert-audio}

在常見格式之間轉換音訊檔案，包含 MP3、WAV、OGG、FLAC 與 M4A，並可設定輸出位元率與取樣率。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 輸出格式：`mp3`、`wav`、`ogg`、`flac`、`m4a` |
| bitrateKbps | integer | No | `192` | 輸出位元率（kbps）（32 至 320） |
| sampleRate | integer | No | 原始取樣率 | 輸出取樣率（Hz）：`8000`、`16000`、`22050`、`32000`、`44100`、`48000` 或 `96000`。省略則保留原始取樣率 |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## 附註 {#notes}

- 支援的輸入格式包含 MP3、WAV、OGG、FLAC、AAC、M4A、WMA、AIFF 與 OPUS。
- 位元率只適用於有損格式（MP3、OGG、M4A）。像 WAV 與 FLAC 這類無損格式會忽略此設定。
- MP3 輸出支援最高 48000 Hz 的取樣率。96000 Hz 選項只適用於 WAV、OGG、FLAC 與 M4A。
- MP3 位元率的上限取決於取樣率：8000 Hz 時最高 64 kbps，16000 或 22050 Hz 時最高 160 kbps。超過上限的請求會被拒絕，而不會被默默調低。
- 輸出檔名會保留原始名稱並換上新的副檔名。
