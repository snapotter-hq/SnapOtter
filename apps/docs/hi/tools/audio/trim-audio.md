---
description: "प्रारंभ और समाप्ति समय निर्दिष्ट करके किसी ऑडियो फ़ाइल से एक खंड काटें।"
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 3b2a9633270a
---

# Trim Audio {#trim-audio}

सेकंड में प्रारंभ और समाप्ति समय निर्दिष्ट करके किसी ऑडियो फ़ाइल से एक खंड काटें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

एक ऑडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | सेकंड में प्रारंभ समय (न्यूनतम 0) |
| endS | number | Yes | - | सेकंड में समाप्ति समय (प्रारंभ के बाद होना चाहिए) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- समय सेकंड में निर्दिष्ट किए जाते हैं और इनमें दशमलव शामिल हो सकते हैं (जैसे `10.5`)।
- `endS` मान `startS` से अधिक होना चाहिए।
- यदि `endS` ऑडियो अवधि से अधिक है, तो फ़ाइल अंत तक ट्रिम की जाती है।
- आउटपुट आमतौर पर इनपुट कंटेनर को बनाए रखता है। AAC इनपुट को M4A के रूप में लिखा जाता है, और असमर्थित decode-only इनपुट MP3 पर वापस चले जाते हैं।
