---
description: "पूरी इमेज या किसी विशिष्ट क्षेत्र पर पिक्सेलेशन प्रभाव लागू करें।"
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 068c54ad3f49
---

# Pixelate {#pixelate}

एक पूरी इमेज या किसी विशिष्ट आयताकार क्षेत्र पर पिक्सेलेशन प्रभाव लागू करें। चेहरे, लाइसेंस प्लेट, या व्यक्तिगत जानकारी जैसी संवेदनशील सामग्री को छिपाने के लिए उपयोगी।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

एक इमेज फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | पिक्सेल ब्लॉक आकार (2-128); बड़े मान अधिक मोटी पिक्सेलेशन उत्पन्न करते हैं |
| region | object | No | - | पिक्सेलेशन को एक आयत तक सीमित करें (नीचे देखें) |

### Region Object {#region-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| left | integer | Yes | पिक्सेल में बायाँ ऑफ़सेट (>= 0) |
| top | integer | Yes | पिक्सेल में शीर्ष ऑफ़सेट (>= 0) |
| width | integer | Yes | पिक्सेल में क्षेत्र चौड़ाई (>= 1) |
| height | integer | Yes | पिक्सेल में क्षेत्र ऊँचाई (>= 1) |

## Example Request {#example-request}

पूरी इमेज को पिक्सेलेट करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

एक विशिष्ट क्षेत्र को पिक्सेलेट करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- जब `region` को छोड़ दिया जाता है, तो पूरी इमेज को पिक्सेलेट किया जाता है।
- क्षेत्र निर्देशांक इमेज के ऊपरी-बाएँ कोने के सापेक्ष पिक्सेल में होते हैं। क्षेत्र इमेज की सीमाओं के भीतर होना चाहिए।
- आउटपुट प्रारूप इनपुट प्रारूप से मेल खाता है। HEIC, RAW, PSD और SVG इनपुट प्रोसेसिंग से पहले स्वतः डिकोड किए जाते हैं।
