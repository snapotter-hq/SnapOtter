---
description: "HTML, CSS और अन्य में एम्बेड करने के लिए छवियों को base64 data URIs में बदलें।"
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: d18d54591439
---

# Image to Base64 {#image-to-base64}

एक या अधिक छवियों को base64-एन्कोडेड स्ट्रिंग और data URIs में बदलें। वैकल्पिक प्रारूप रूपांतरण, गुणवत्ता नियंत्रण और आकार बदलने का समर्थन करता है। छवियों को सीधे HTML, CSS, JSON या ईमेल टेम्पलेट्स में एम्बेड करने के लिए उपयोगी।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

एक या अधिक image फ़ाइलों और एक वैकल्पिक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | नहीं | `"original"` | एन्कोडिंग से पहले बदलें: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | नहीं | `80` | lossy प्रारूपों के लिए आउटपुट गुणवत्ता (1 से 100) |
| maxWidth | number | नहीं | `0` | अधिकतम चौड़ाई पिक्सेल में (0 = कोई आकार परिवर्तन नहीं, बड़ा नहीं करेगा) |
| maxHeight | number | नहीं | `0` | अधिकतम ऊँचाई पिक्सेल में (0 = कोई आकार परिवर्तन नहीं, बड़ा नहीं करेगा) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

एकाधिक फ़ाइलें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Example Response {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| results | array | सफलतापूर्वक बदली गई छवियाँ |
| errors | array | ऐसी छवियाँ जो संसाधित नहीं हो सकीं (फ़ाइलनाम और त्रुटि संदेश के साथ) |

### Result Object {#result-object}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | मूल फ़ाइलनाम |
| mimeType | string | एन्कोडेड आउटपुट का MIME प्रकार |
| width | number | अंतिम चौड़ाई पिक्सेल में (किसी भी आकार परिवर्तन के बाद) |
| height | number | अंतिम ऊँचाई पिक्सेल में (किसी भी आकार परिवर्तन के बाद) |
| originalSize | number | मूल फ़ाइल आकार बाइट में |
| encodedSize | number | base64 स्ट्रिंग का आकार बाइट में |
| overheadPercent | number | मूल की तुलना में प्रतिशत आकार अंतर (धनात्मक = बड़ा, ऋणात्मक = छोटा) |
| base64 | string | कच्चा base64-एन्कोडेड छवि डेटा |
| dataUri | string | `src` विशेषताओं में उपयोग के लिए तैयार पूर्ण data URI |

## Notes {#notes}

- Base64 एन्कोडिंग आमतौर पर binary फ़ाइल की तुलना में आकार में लगभग 33% वृद्धि करती है। `overheadPercent` फ़ील्ड वास्तविक अंतर दिखाता है।
- जब `outputFormat` `"original"` हो, तो HEIC/HEIF फ़ाइलें JPEG में बदल दी जाती हैं (क्योंकि browser data URIs में HEIC प्रदर्शित नहीं कर सकते)।
- `maxWidth` और `maxHeight` विकल्प `withoutEnlargement` के साथ `fit: inside` का उपयोग करके आकार बदलते हैं, इसलिए निर्दिष्ट आयामों से छोटी छवियाँ बड़ी नहीं की जातीं।
- एक ही अनुरोध में एकाधिक फ़ाइलें संसाधित की जा सकती हैं। प्रत्येक फ़ाइल स्वतंत्र रूप से संसाधित होती है, और विफलताएँ अन्य फ़ाइलों को सफल होने से नहीं रोकतीं।
- SVG फ़ाइलें बिना पुनः-एन्कोडिंग के `image/svg+xml` के रूप में पास कर दी जाती हैं (जब तक कि प्रारूप रूपांतरण का अनुरोध न किया गया हो)।
- यह एक केवल-पढ़ने योग्य endpoint है। यह कोई डाउनलोड करने योग्य फ़ाइल या `jobId` उत्पन्न नहीं करता। base64 डेटा सीधे प्रतिक्रिया body में लौटाया जाता है।
