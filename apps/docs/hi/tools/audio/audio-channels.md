---
description: "mono और stereo के बीच रूपांतरण करें या बाएँ और दाएँ चैनल स्वैप करें।"
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: 59a7e1872bd3
---

# Audio Channels {#audio-channels}

audio को mono और stereo लेआउट के बीच रूपांतरित करें, या किसी stereo फ़ाइल के बाएँ और दाएँ चैनल स्वैप करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Yes | - | चैनल ऑपरेशन: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- `stereo-to-mono` दोनों चैनलों को एक ही mono ट्रैक में मिला देता है।
- `mono-to-stereo` mono चैनल को बाएँ और दाएँ दोनों में डुप्लिकेट कर देता है।
- `swap` किसी stereo फ़ाइल के बाएँ और दाएँ चैनल आपस में बदल देता है।
- आउटपुट आमतौर पर इनपुट container रखता है। AAC इनपुट M4A के रूप में लिखा जाता है, और असमर्थित डिकोड-ओनली इनपुट MP3 पर वापस चले जाते हैं।
