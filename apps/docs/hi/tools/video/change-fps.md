---
description: "किसी वीडियो की फ्रेम दर बदलें।"
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 2873a7624335
---

# Change FPS {#change-fps}

किसी वीडियो की फ्रेम दर को 1 और 120 fps के बीच के किसी लक्ष्य मान पर बदलें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | लक्ष्य फ्रेम दर (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- फ्रेम दर घटाने से फ्रेम हटते हैं और फ़ाइल आकार कम होता है। इसे बढ़ाने से अंतर भरने के लिए फ्रेम डुप्लिकेट होते हैं, लेकिन असली गति का विवरण नहीं जुड़ता।
- सामान्य लक्ष्य मान: 24 (cinema), 30 (web/broadcast), 60 (सहज प्लेबैक)।
- ऑडियो ट्रैक अपनी मूल sample rate पर सुरक्षित रहता है।
