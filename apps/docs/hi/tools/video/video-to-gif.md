---
description: "किसी वीडियो क्लिप को एनिमेटेड GIF में बदलें।"
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 847f6bb8a4b4
---

# Video to GIF {#video-to-gif}

समायोज्य फ्रेम दर, चौड़ाई, आरंभ समय, और अवधि के साथ किसी वीडियो क्लिप को एनिमेटेड GIF में बदलें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है। यह एक async endpoint है - यह तुरंत `202 Accepted` लौटाता है और प्रगति `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से स्ट्रीम की जाती है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | आउटपुट फ्रेम दर (1-30) |
| width | integer | No | `480` | पिक्सेल में आउटपुट चौड़ाई (64-1280)। ऊँचाई आनुपातिक रूप से स्केल होती है |
| startS | number | No | `0` | सेकंड में आरंभ समय (>= 0 होना चाहिए) |
| durationS | number | No | `5` | सेकंड में अवधि (0 से अधिक, अधिकतम 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- कम `fps` और `width` मान छोटी GIF फ़ाइलें बनाते हैं। 12 fps पर एक 480px-चौड़ी GIF आम तौर पर एक अच्छा संतुलन है।
- अधिकतम अवधि 60 सेकंड है। लंबी क्लिप बहुत बड़ी फ़ाइलें बनाती हैं।
- जॉब पूरा होने तक `GET /api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति अपडेट उपलब्ध रहते हैं।
