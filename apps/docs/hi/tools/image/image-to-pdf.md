---
description: "page size, orientation और लक्ष्य फ़ाइल आकार विकल्पों के साथ एक या अधिक छवियों को एक PDF दस्तावेज़ में संयोजित करें।"
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 4d0942ce13f6
---

# Image to PDF {#image-to-pdf}

एक या अधिक छवियों को एक PDF दस्तावेज़ में संयोजित करें। कई page size, orientation, margins और गुणवत्ता समायोजन के माध्यम से वैकल्पिक फ़ाइल आकार लक्ष्यीकरण का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

एक या अधिक image फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | नहीं | `"A4"` | Page size: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | नहीं | `"portrait"` | Page orientation: `portrait` या `landscape` |
| margin | number | नहीं | `20` | Page margin points में (0-500) |
| targetSize | object | नहीं | - | लक्ष्य फ़ाइल आकार बाधा (नीचे देखें) |
| collate | boolean | नहीं | `true` | सभी छवियों को एक PDF में संयोजित करें। यदि `false`, तो प्रति छवि एक PDF बनाता है। |

### Target Size Object {#target-size-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| value | number | हाँ | लक्ष्य आकार मान |
| unit | string | हाँ | इकाई: `KB` या `MB` |

न्यूनतम लक्ष्य आकार 50 KB है।

## Example Request {#example-request}

बुनियादी multi-image PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

फ़ाइल आकार लक्ष्य के साथ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

प्रति छवि एक PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Example Response (Collated) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Example Response (Non-Collated) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Example Response (With Target Size) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Notes {#notes}

- छवियाँ पृष्ठ पर केंद्रित होती हैं और aspect ratio संरक्षित करते हुए margins के भीतर फ़िट होने के लिए स्केल की जाती हैं। छवियाँ कभी बड़ी नहीं की जातीं।
- जब `collate` `false` हो, तो प्रत्येक छवि एक अलग PDF फ़ाइल बन जाती है, और डाउनलोड एक ZIP archive होता है जिसमें सभी PDFs होते हैं।
- लक्ष्य आकार सुविधा बजट के भीतर फ़िट होने वाली सर्वोत्तम गुणवत्ता खोजने के लिए JPEG गुणवत्ता स्तरों (10-95) पर पुनरावृत्त binary search का उपयोग करती है।
- पारदर्शी छवियों को PDF में एम्बेड करने से पहले सफ़ेद में फ़्लैट कर दिया जाता है।
- समर्थित इनपुट प्रारूप: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG और अन्य।
- एम्बेड करने से पहले EXIF orientation स्वतः लागू किया जाता है।
