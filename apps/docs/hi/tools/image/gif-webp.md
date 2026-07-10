---
description: "सभी फ़्रेमों को संरक्षित करते हुए animated GIF को WebP में और इसके विपरीत बदलें।"
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: a999ed39e3fa
---

# GIF/WebP Converter {#gif-webp-converter}

सभी फ़्रेमों और एनिमेशन समय को संरक्षित करते हुए animated GIF फ़ाइलों को WebP में और इसके विपरीत बदलें। WebP एनिमेशन आमतौर पर समकक्ष GIFs की तुलना में 25-35% छोटे होते हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

GIF या WebP फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | integer | नहीं | `80` | WebP एन्कोडिंग के लिए आउटपुट गुणवत्ता (1-100) |
| lossless | boolean | नहीं | `false` | lossless WebP संपीड़न का उपयोग करें |
| resizePercent | integer | नहीं | `100` | आउटपुट को प्रतिशत के अनुसार स्केल करें (10-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Notes {#notes}

- केवल `.gif` और `.webp` फ़ाइलें स्वीकार की जाती हैं। इस टूल द्वारा अन्य छवि प्रारूप समर्थित नहीं हैं।
- रूपांतरण दिशा स्वचालित है: GIF इनपुट WebP आउटपुट उत्पन्न करता है, और WebP इनपुट GIF आउटपुट उत्पन्न करता है।
- `quality` और `lossless` विकल्प केवल WebP में एन्कोड करते समय लागू होते हैं। GIF में बदलते समय, आउटपुट मानक GIF पैलेट का उपयोग करता है।
- बड़े एनिमेशन के आयाम (और फ़ाइल आकार) कम करने के लिए `resizePercent` का उपयोग करें।
