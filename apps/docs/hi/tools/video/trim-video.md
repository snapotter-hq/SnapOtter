---
description: "आरंभ और समाप्ति समय निर्दिष्ट करके किसी वीडियो में से एक क्लिप काटें।"
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: f1a4272e3088
---

# Trim Video {#trim-video}

सेकंड में आरंभ और समाप्ति समय निर्दिष्ट करके किसी वीडियो में से एक क्लिप काटें, फ्रेम-सटीक कट के विकल्प के साथ।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | सेकंड में आरंभ समय (>= 0 होना चाहिए) |
| endS | number | Yes | - | सेकंड में समाप्ति समय (startS के बाद होना चाहिए) |
| precise | boolean | No | `false` | keyframe seek के बजाय फ्रेम-सटीक कट के लिए फिर से एन्कोड करें |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- जब `precise` `false` (डिफ़ॉल्ट) हो, तो टूल keyframe seeking का उपयोग करता है, जो तेज़ है लेकिन अनुरोधित समय से कुछ फ्रेम पहले शुरू हो सकता है।
- `precise` को `true` सेट करने से खंड को सटीक फ्रेम सीमाओं के लिए फिर से एन्कोड किया जाता है, लेकिन इसमें अधिक समय लगता है।
- `endS` मान `startS` से अधिक होना चाहिए।
