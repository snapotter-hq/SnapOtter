---
description: "base64 data URI के साथ एक छोटा low-quality image placeholder जनरेट करें।"
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: c12b5df79b78
---

# LQIP Placeholder {#lqip-placeholder}

किसी स्रोत छवि से एक छोटा low-quality image placeholder (LQIP) जनरेट करें। तत्काल एम्बेडिंग के लिए एक छोटी placeholder फ़ाइल के साथ एक base64 data URI, उपयोग के लिए तैयार HTML `<img>` टैग और CSS `background-image` स्निपेट लौटाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

एक image फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | नहीं | `16` | लक्ष्य चौड़ाई पिक्सेल में (4-64) |
| blur | number | नहीं | `2` | blur रणनीति के लिए Blur त्रिज्या (0-20) |
| strategy | string | नहीं | `"blur"` | Placeholder रणनीति: `blur`, `pixelate`, या `solid` |
| format | string | नहीं | `"webp"` | आउटपुट प्रारूप: `webp`, `png`, या `jpeg` |
| quality | integer | नहीं | `50` | आउटपुट गुणवत्ता (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Notes {#notes}

- `dataUri` फ़ील्ड में पूर्ण data URI होता है, जो किसी अतिरिक्त अनुरोध के बिना `src` विशेषताओं या CSS में उपयोग के लिए तैयार है।
- `html` और `css` फ़ील्ड सामान्य उपयोग मामलों के लिए कॉपी-पेस्ट स्निपेट प्रदान करते हैं।
- `blur` रणनीति एक नरम, धुँधला थंबनेल उत्पन्न करती है। `pixelate` रणनीति एक ब्लॉकी मोज़ेक बनाती है। `solid` रणनीति एक एकल औसत रंग लौटाती है।
- सामान्य placeholder आकार 200-500 बाइट होते हैं, जो उन्हें सीधे HTML में इनलाइन करने के लिए उपयुक्त बनाता है।
- स्रोत छवि के aspect ratio को संरक्षित करने के लिए ऊँचाई स्वचालित रूप से गणना की जाती है।
- HEIC, RAW, PSD और SVG इनपुट प्रसंस्करण से पहले स्वचालित रूप से डिकोड किए जाते हैं।
