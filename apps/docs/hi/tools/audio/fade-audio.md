---
description: "audio में fade-in और fade-out प्रभाव जोड़ें।"
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 3775ce833fa5
---

# Fade Audio {#fade-audio}

किसी audio फ़ाइल के आरंभ और अंत में fade-in और fade-out प्रभाव जोड़ें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

एक audio फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | सेकंड में fade-in अवधि (0 से 30) |
| fadeOutS | number | No | `1` | सेकंड में fade-out अवधि (0 से 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- उस fade दिशा को छोड़ने के लिए किसी भी मान को `0` पर सेट करें। कम से कम एक 0 से अधिक होना चाहिए।
- यदि fade अवधि audio की लंबाई से अधिक हो जाती है तो इसे audio लंबाई तक सीमित कर दिया जाता है।
- आउटपुट आमतौर पर इनपुट container रखता है। AAC इनपुट M4A के रूप में लिखा जाता है, और असमर्थित डिकोड-ओनली इनपुट MP3 पर वापस चले जाते हैं।
