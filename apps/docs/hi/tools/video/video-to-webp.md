---
description: "किसी वीडियो क्लिप को एनिमेटेड WebP छवि में कन्वर्ट करें।"
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: bef8028f83fb
---

# Video to WebP {#video-to-webp}

समायोज्य फ्रेम दर, चौड़ाई, और गुणवत्ता के साथ किसी वीडियो क्लिप को एनिमेटेड WebP छवि में कन्वर्ट करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | आउटपुट फ्रेम दर (1-30) |
| width | integer | No | `480` | पिक्सेल में आउटपुट चौड़ाई (16-1920)। ऊँचाई आनुपातिक रूप से स्केल होती है |
| quality | integer | No | `75` | WebP संपीड़न गुणवत्ता (1-100) |
| loop | boolean | No | `true` | एनिमेशन को लूप करें |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- एनिमेटेड WebP बेहतर रंग समर्थन (24-bit बनाम 8-bit palette) के साथ GIF से छोटी फ़ाइलें बनाता है।
- कम `quality` मान दृश्य निष्ठा की कीमत पर छोटी फ़ाइलें बनाते हैं।
- ऐसे एनिमेशन के लिए `loop` को `false` सेट करें जो एक बार चलकर रुक जाने चाहिए।
