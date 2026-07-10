---
description: "पट्टियों को वीडियो की धुंधली कॉपी से भरें।"
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: e15418836ea7
---

# Blur Pad {#blur-pad}

ठोस-रंग की पट्टियों के बजाय पैडिंग क्षेत्र को वीडियो की धुंधली, स्केल की गई कॉपी से भरकर किसी वीडियो को एक लक्षित आस्पेक्ट रेशियो में फिट करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | लक्षित आस्पेक्ट रेशियो: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | बैकग्राउंड के लिए Gaussian blur sigma (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- उच्च blur मान एक नरम, अधिक अमूर्त बैकग्राउंड बनाते हैं। कम मान अधिक विवरण दृश्यमान रखते हैं।
- यदि वीडियो पहले से ही लक्षित आस्पेक्ट रेशियो से मेल खाता है, तो फ़ाइल अपरिवर्तित लौटाई जाती है।
- ठोस-रंग की पैडिंग के लिए, इसके बजाय Aspect Pad टूल का उपयोग करें।
