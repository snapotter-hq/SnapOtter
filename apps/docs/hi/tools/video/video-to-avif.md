---
description: "किसी वीडियो क्लिप को एनिमेटेड AVIF छवि में कन्वर्ट करें।"
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 59151e9a6401
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

समायोज्य फ्रेम दर, चौड़ाई, गुणवत्ता और क्लिप रेंज के साथ किसी वीडियो क्लिप को एनिमेटेड AVIF छवि में कन्वर्ट करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | आउटपुट फ्रेम दर (1-30) |
| width | integer | No | `480` | पिक्सेल में आउटपुट चौड़ाई (64-1280)। ऊँचाई आनुपातिक रूप से स्केल होती है |
| startS | number | No | `0` | क्लिप कहाँ से शुरू होती है, सेकंड में |
| durationS | number | No | `5` | सेकंड में क्लिप की लंबाई (अधिकतम 60) |
| quality | integer | No | `50` | AVIF गुणवत्ता (1-100) |
| loop | boolean | No | `true` | एनिमेशन को लूप करें |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1 एन्कोडिंग GIF या WebP से धीमी है, इसलिए यह टूल आमतौर पर `202` के साथ एक जॉब लौटाता है, जिसकी प्रगति आप SSE के ज़रिए `/api/v1/jobs/{jobId}/progress` पर देख सकते हैं। छोटी क्लिप sync विंडो के भीतर पूरी होकर सीधे परिणाम लौटा सकती है:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- एनिमेटेड AVIF रॉयल्टी-मुक्त है और समान दृश्य गुणवत्ता पर आमतौर पर एनिमेटेड WebP या GIF से छोटा होता है।
- मौजूदा ब्राउज़र एनिमेटेड AVIF चलाते हैं। कुछ डेस्कटॉप इमेज व्यूअर केवल पहला फ्रेम दिखाते हैं।
- ऑडियो ट्रैक हटा दिया जाता है।
