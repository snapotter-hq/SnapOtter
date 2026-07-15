---
description: "AVIF, JXL, और HEIC जैसे आधुनिक फ़ॉर्मेट सहित छवियों को फ़ॉर्मेट के बीच परिवर्तित करें।"
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: d2a3deb5118b
---

# इमेज कन्वर्ट {#convert}

छवियों को फ़ॉर्मेट के बीच परिवर्तित करें। सामान्य वेब फ़ॉर्मेट के साथ-साथ HEIC, JXL, BMP, ICO, JP2, QOI, और PSD जैसे विशेष फ़ॉर्मेट का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/convert`

एक छवि फ़ाइल और एक JSON `settings` फ़ील्ड के साथ मल्टीपार्ट फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | लक्षित फ़ॉर्मेट: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | No | - | आउटपुट गुणवत्ता (1-100)। jpg, webp, avif, heic जैसे हानिकर फ़ॉर्मेट पर लागू होती है। |

## Supported Output Formats {#supported-output-formats}

| Format | Type | Notes |
|--------|------|-------|
| jpg | Lossy | JPEG, सर्वोत्तम संगतता |
| png | Lossless | पारदर्शिता का समर्थन करता है |
| webp | Both | आधुनिक वेब फ़ॉर्मेट, अच्छा संपीड़न |
| avif | Lossy | अगली पीढ़ी का फ़ॉर्मेट, उत्कृष्ट संपीड़न |
| tiff | Both | प्रिंट/प्रकाशन वर्कफ़्लो |
| gif | Lossless | 256 रंगों तक सीमित |
| heic / heif | Lossy | Apple पारिस्थितिकी तंत्र फ़ॉर्मेट |
| jxl | Both | JPEG XL, अगली पीढ़ी का फ़ॉर्मेट |
| bmp | Lossless | असंपीड़ित बिटमैप |
| ico | Lossless | Windows आइकन फ़ॉर्मेट |
| jp2 | Lossy | JPEG 2000 |
| qoi | Lossless | Quite OK Image फ़ॉर्मेट |
| psd | Layered | Adobe Photoshop (ImageMagick आवश्यक) |
| ppm | Lossless | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vector | Encapsulated PostScript |
| tga | Lossless | Targa छवि फ़ॉर्मेट |

## Example Request {#example-request}

WebP में परिवर्तित करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

PNG में परिवर्तित करें (हानिरहित):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Notes {#notes}

- आउटपुट फ़ाइलनाम एक्सटेंशन स्वचालित रूप से लक्षित फ़ॉर्मेट से मेल खाने के लिए अद्यतन किया जाता है।
- SVG इनपुट परिवर्तन से पहले 300 DPI पर रैस्टराइज़ किए जाते हैं।
- PSD परिवर्तन के लिए सर्वर पर ImageMagick स्थापित होना आवश्यक है।
- BMP, EPS, ICO, JP2, JXL, PPM, QOI, और TGA विशेष CLI एन्कोडर का उपयोग करते हैं और Sharp प्रोसेसिंग को बायपास करते हैं।
- HEIC/HEIF एन्कोडिंग सिस्टम HEIC एन्कोडर लाइब्रेरी का उपयोग करती है।
- इनपुट फ़ॉर्मेट व्यापक हैं: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, आदि), PSD, SVG, BMP, और अधिक।
