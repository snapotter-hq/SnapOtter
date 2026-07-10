---
description: "छवियों के एक समूह को स्लाइडशो वीडियो में बदलें।"
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 9e46428ffff1
---

# Images to Video {#images-to-video}

छवियों के एक समूह को प्रति छवि समायोज्य अवधि, रिज़ॉल्यूशन, और फ्रेम दर के साथ स्लाइडशो वीडियो में बदलें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

दो या अधिक छवि फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | सेकंड में प्रति छवि प्रदर्शन अवधि (0.5-10) |
| resolution | string | No | `"720p"` | आउटपुट रिज़ॉल्यूशन: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | आउटपुट फ्रेम दर (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- प्रति अनुरोध 2-60 छवि फ़ाइलें स्वीकार करता है। छवियाँ अपलोड क्रम में वीडियो में दिखाई देती हैं।
- छवियों को आस्पेक्ट रेशियो बनाए रखते हुए लक्ष्य रिज़ॉल्यूशन में फिट करने के लिए आकार बदला और पैड किया जाता है।
- `square` रिज़ॉल्यूशन विकल्प एक 1080x1080 वीडियो बनाता है, जो सोशल मीडिया के लिए उपयोगी है।
- आउटपुट फ़ॉर्मैट हमेशा MP4 (H.264) होता है।
