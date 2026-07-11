---
description: "किसी वीडियो को घुमाएँ या पलटें।"
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 52dca075a5e7
---

# Rotate Video {#rotate-video}

किसी वीडियो को 90, 180, या 270 डिग्री घुमाएँ, या उसे क्षैतिज या ऊर्ध्वाधर रूप से पलटें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | लागू करने के लिए रूपांतरण: `cw90`, `ccw90`, `180`, `hflip`, `vflip` |

### Transform Values {#transform-values}

- **cw90** - 90 डिग्री दक्षिणावर्त घुमाएँ
- **ccw90** - 90 डिग्री वामावर्त घुमाएँ
- **180** - 180 डिग्री घुमाएँ
- **hflip** - क्षैतिज रूप से पलटें (मिरर)
- **vflip** - ऊर्ध्वाधर रूप से पलटें

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 90 या 270 डिग्री के घुमाव वीडियो की चौड़ाई और ऊँचाई को आपस में बदल देते हैं।
- पलटने की क्रियाएँ (hflip, vflip) वीडियो आयामों को नहीं बदलतीं।
