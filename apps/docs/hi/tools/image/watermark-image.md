---
description: "कॉन्फ़िगर करने योग्य स्थिति, अपारदर्शिता, और स्केल के साथ एक लोगो या छवि को वॉटरमार्क के रूप में ओवरले करें।"
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 197b4c889768
---

# Image Watermark {#image-watermark}

एक बेस छवि पर एक लोगो या द्वितीयक छवि को वॉटरमार्क के रूप में ओवरले करें। वॉटरमार्क को बेस छवि की चौड़ाई के सापेक्ष स्केल किया जाता है और किसी कोने या केंद्र पर स्थित किया जाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

**दो** image फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ multipart फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | वॉटरमार्क स्थान: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | वॉटरमार्क अपारदर्शिता प्रतिशत (0 से 100) |
| scale | number | No | `25` | मुख्य छवि चौड़ाई के प्रतिशत के रूप में वॉटरमार्क चौड़ाई (1 से 100) |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | मुख्य/बेस छवि |
| watermark | Yes | वॉटरमार्क/लोगो छवि |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notes {#notes}

- दोनों छवियों को मान्य और डिकोड किया जाता है (HEIC, RAW, PSD, SVG समर्थित)।
- वॉटरमार्क को समानुपातिक रूप से आकार बदला जाता है ताकि इसकी चौड़ाई मुख्य छवि चौड़ाई के `scale`% के बराबर हो।
- अपारदर्शिता को `dest-in` ब्लेंडिंग के साथ कंपोजिट किए गए अल्फ़ा मास्क के माध्यम से लागू किया जाता है।
- कोने की स्थितियाँ छवि किनारे से 20px पैडिंग का उपयोग करती हैं।
- यदि वॉटरमार्क छवि में पारदर्शिता है (उदा., एक PNG लोगो), तो कंपोजिटिंग के दौरान इसे संरक्षित किया जाता है।
- प्रोसेसिंग से पहले दोनों छवियों पर EXIF ओरिएंटेशन स्वचालित रूप से लागू होता है।
