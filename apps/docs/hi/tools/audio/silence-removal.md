---
description: "किसी ऑडियो फ़ाइल से मौन (silent) खंडों को हटाएं।"
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: 98391c164b73
---

# Silence Removal {#silence-removal}

एक कॉन्फ़िगर करने योग्य थ्रेशोल्ड और न्यूनतम अवधि के आधार पर किसी ऑडियो फ़ाइल से मौन खंडों का पता लगाएं और उन्हें हटाएं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

एक ऑडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | dB में मौन थ्रेशोल्ड (-80 से -20)। इस स्तर से नीचे का ऑडियो मौन माना जाता है। |
| minSilenceS | number | No | `0.5` | हटाने के लिए सेकंड में न्यूनतम मौन अवधि (0.1 से 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- एक अधिक (कम ऋणात्मक) थ्रेशोल्ड ज़्यादा आक्रामक होता है और वास्तविक मौन के साथ-साथ शांत हिस्सों को भी हटा देता है।
- केवल लंबे विरामों को हटाने और छोटे प्राकृतिक अंतरालों को बनाए रखने के लिए `minSilenceS` बढ़ाएं।
- पॉडकास्ट रिकॉर्डिंग, व्याख्यान और वॉइस मेमो को साफ़ करने के लिए उपयोगी।
- आउटपुट आमतौर पर इनपुट कंटेनर को बनाए रखता है। AAC इनपुट को M4A के रूप में लिखा जाता है, और असमर्थित decode-only इनपुट MP3 पर वापस चले जाते हैं।
