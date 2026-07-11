---
description: "स्पीड बदले बिना audio pitch को सेमीटोन में बढ़ाएँ या घटाएँ।"
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 42788c7614e3
---

# Pitch Shift {#pitch-shift}

प्लेबैक स्पीड बदले बिना किसी audio फ़ाइल के pitch को कई सेमीटोन तक बढ़ाएँ या घटाएँ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| semitones | integer | No | `3` | शिफ़्ट करने के लिए सेमीटोन (-12 से 12)। शून्येतर होना चाहिए। |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- धनात्मक मान pitch बढ़ाते हैं; ऋणात्मक मान इसे घटाते हैं।
- 12 सेमीटोन का शिफ़्ट एक ऑक्टेव ऊपर के बराबर है; -12 एक ऑक्टेव नीचे के बराबर है।
- शिफ़्ट राशि की परवाह किए बिना प्लेबैक अवधि समान रहती है।
- आउटपुट आमतौर पर इनपुट container रखता है। AAC इनपुट M4A के रूप में लिखा जाता है, और असमर्थित डिकोड-ओनली इनपुट MP3 पर वापस चले जाते हैं।
