---
description: "किसी वीडियो की चमक, कंट्रास्ट, संतृप्ति, और गामा समायोजित करें।"
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 7e83651a667d
---

# Video Color {#video-color}

किसी वीडियो पर चमक, कंट्रास्ट, संतृप्ति, और गामा सुधार समायोजित करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | चमक समायोजन (-1 से 1) |
| contrast | number | No | `1` | कंट्रास्ट गुणक (0-4) |
| saturation | number | No | `1` | संतृप्ति गुणक (0-3)। ग्रेस्केल के लिए 0 सेट करें |
| gamma | number | No | `1` | गामा सुधार (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- सभी मान अपने डिफ़ॉल्ट पर (brightness 0, contrast 1, saturation 1, gamma 1) कोई परिवर्तन नहीं करते।
- संतृप्ति को `0` सेट करने से वीडियो ग्रेस्केल में बदल जाता है।
- 1 से नीचे के गामा मान छायाओं को उजला करते हैं, जबकि 1 से ऊपर के मान उन्हें गहरा करते हैं।
