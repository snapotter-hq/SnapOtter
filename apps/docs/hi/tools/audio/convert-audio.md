---
description: "MP3, WAV, OGG, FLAC, और M4A फ़ॉर्मैट के बीच audio रूपांतरित करें।"
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 3e9d339fb4f6
---

# Convert Audio {#convert-audio}

MP3, WAV, OGG, FLAC, और M4A सहित सामान्य फ़ॉर्मैट के बीच audio फ़ाइलें रूपांतरित करें, कॉन्फ़िगर करने योग्य आउटपुट bitrate के साथ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | आउटपुट फ़ॉर्मैट: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | kbps में आउटपुट bitrate (32 से 320) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## Notes {#notes}

- समर्थित इनपुट फ़ॉर्मैट में MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF, और OPUS शामिल हैं।
- Bitrate केवल lossy फ़ॉर्मैट (MP3, OGG, M4A) पर लागू होता है। WAV और FLAC जैसे lossless फ़ॉर्मैट इस सेटिंग को नज़रअंदाज़ करते हैं।
- आउटपुट फ़ाइल नाम मूल नाम को नए एक्सटेंशन के साथ रखता है।
