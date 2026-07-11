---
description: "कई छवियों को 25+ टेम्पलेट, समायोज्य गैप और कोने, और प्रति-सेल पैन तथा ज़ूम के साथ ग्रिड कोलाज में संयोजित करें।"
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: d72696145235
---

# Collage / Grid {#collage-grid}

कई छवियों को 25+ टेम्पलेट के साथ सुंदर ग्रिड कोलाज में संयोजित करें। अनुकूलन योग्य गैप, कोने की त्रिज्या, पृष्ठभूमि रंग, और प्रति-सेल पैन/ज़ूम नियंत्रण के साथ 2-9 छवि लेआउट का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | Yes | - | टेम्पलेट लेआउट ID (उदा. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | No | - | प्रति-सेल सेटिंग्स सरणी, जिसमें `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` शामिल हैं |
| cells[].imageIndex | integer | Yes | - | इस सेल में रखी जाने वाली छवि का सूचकांक (0-आधारित) |
| cells[].panX | number | No | 0 | क्षैतिज पैन ऑफ़सेट (-100 से 100) |
| cells[].panY | number | No | 0 | ऊर्ध्वाधर पैन ऑफ़सेट (-100 से 100) |
| cells[].zoom | number | No | 1 | ज़ूम स्तर (1 से 10) |
| cells[].objectFit | string | No | `"cover"` | छवि सेल को कैसे भरती है: `cover` या `contain` |
| gap | number | No | 8 | सेलों के बीच का गैप पिक्सेल में (0 से 500) |
| cornerRadius | number | No | 0 | प्रत्येक सेल के लिए कोने की त्रिज्या पिक्सेल में (0 से 500) |
| backgroundColor | string | No | `"#FFFFFF"` | हेक्स के रूप में पृष्ठभूमि रंग या `"transparent"` |
| aspectRatio | string | No | `"free"` | कैनवास पहलू अनुपात: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | No | `"png"` | आउटपुट फ़ॉर्मेट: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | आउटपुट गुणवत्ता (1 से 100) |

## Available Templates {#available-templates}

| Template ID | Images | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | दो बराबर कॉलम |
| `2-v-equal` | 2 | दो बराबर पंक्तियाँ |
| `2-h-left-large` | 2 | बायाँ 2/3, दायाँ 1/3 |
| `2-h-right-large` | 2 | बायाँ 1/3, दायाँ 2/3 |
| `3-left-large` | 3 | बड़ा बायाँ, दायीं ओर दो ढेर में |
| `3-right-large` | 3 | बायीं ओर दो ढेर में, बड़ा दायाँ |
| `3-top-large` | 3 | बड़ा ऊपर, नीचे दो कॉलम |
| `3-h-equal` | 3 | तीन बराबर कॉलम |
| `3-v-equal` | 3 | तीन बराबर पंक्तियाँ |
| `4-grid` | 4 | 2x2 ग्रिड |
| `4-left-large` | 4 | बड़ा बायाँ, दायीं ओर तीन ढेर में |
| `4-top-large` | 4 | बड़ा ऊपर, नीचे तीन कॉलम |
| `4-bottom-large` | 4 | ऊपर तीन कॉलम, बड़ा नीचे |
| `5-top2-bottom3` | 5 | दो ऊपर, तीन नीचे |
| `5-top3-bottom2` | 5 | तीन ऊपर, दो नीचे |
| `5-left-large` | 5 | बड़ा बायाँ, दायीं ओर चार ढेर में |
| `5-center-large` | 5 | बड़ा केंद्र, चार कोने |
| `6-grid-2x3` | 6 | 2 कॉलम x 3 पंक्तियाँ |
| `6-grid-3x2` | 6 | 3 कॉलम x 2 पंक्तियाँ |
| `6-top-large` | 6 | बड़ा ऊपर, नीचे पाँच कॉलम |
| `7-mosaic` | 7 | मोज़ेक लेआउट |
| `8-mosaic` | 8 | मोज़ेक लेआउट |
| `9-grid` | 9 | 3x3 ग्रिड |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notes {#notes}

- मल्टीपार्ट अनुरोध में कई छवि फ़ाइलें अपलोड करें। छवियाँ अपलोड क्रम में टेम्पलेट सेलों को असाइन की जाती हैं।
- यदि टेम्पलेट के समर्थन से अधिक छवियाँ अपलोड की जाती हैं, तो अतिरिक्त छवियों को अनदेखा कर दिया जाता है।
- HEIC, RAW, PSD, और SVG इनपुट फ़ॉर्मेट का समर्थन करता है (स्वचालित रूप से डिकोड किए जाते हैं)।
- कैनवास का आधार आकार सबसे लंबी भुजा पर 2400px होता है, जो चुने गए पहलू अनुपात के अनुसार स्केल किया जाता है।
- जब `aspectRatio` `"free"` होता है, तो कैनवास डिफ़ॉल्ट रूप से 4:3 (2400x1800) होता है।
- प्रति-सेल `panX`/`panY` मान सेल के भीतर क्रॉप विंडो को स्थानांतरित करते हैं। 100 का मान पूरी तरह एक किनारे की ओर ले जाता है, -100 दूसरे की ओर।
- `"transparent"` पृष्ठभूमि रंग केवल `png`, `webp`, या `avif` आउटपुट फ़ॉर्मेट के साथ संरक्षित रहता है।
