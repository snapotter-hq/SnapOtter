---
description: "MP3, WAV, OGG, FLAC, और M4A फ़ॉर्मैट के बीच audio रूपांतरित करें।"
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 3e9d339fb4f6
---

# Convert Audio {#convert-audio}

MP3, WAV, OGG, FLAC, और M4A सहित सामान्य फ़ॉर्मैट के बीच audio फ़ाइलें रूपांतरित करें, कॉन्फ़िगर करने योग्य आउटपुट bitrate और सैंपल रेट के साथ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | आउटपुट फ़ॉर्मैट: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | No | `192` | kbps में आउटपुट bitrate (32 से 320) |
| sampleRate | integer | No | मूल रेट | Hz में आउटपुट सैंपल रेट: `8000`, `16000`, `22050`, `32000`, `44100`, `48000`, या `96000`। मूल रेट बनाए रखने के लिए छोड़ दें |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- समर्थित इनपुट फ़ॉर्मैट में MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF, और OPUS शामिल हैं।
- Bitrate केवल lossy फ़ॉर्मैट (MP3, OGG, M4A) पर लागू होता है। WAV और FLAC जैसे lossless फ़ॉर्मैट इस सेटिंग को नज़रअंदाज़ करते हैं।
- MP3 आउटपुट 48000 Hz तक के सैंपल रेट का समर्थन करता है। 96000 Hz विकल्प केवल WAV, OGG, FLAC, और M4A पर लागू होता है।
- MP3 bitrate सैंपल रेट द्वारा सीमित होता है: 8000 Hz पर अधिकतम 64 kbps और 16000 या 22050 Hz पर 160 kbps। सीमा से ऊपर के अनुरोध चुपचाप कम किए जाने के बजाय अस्वीकार कर दिए जाते हैं।
- आउटपुट फ़ाइल नाम मूल नाम को नए एक्सटेंशन के साथ रखता है।
