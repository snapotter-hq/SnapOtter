---
description: "कस्टम शैडो और हाइलाइट रंगों के साथ दो-रंग वाला ड्युओटोन प्रभाव लागू करें।"
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: c8ec17d98c42
---

# Duotone {#duotone}

किसी छवि पर दो-रंग वाला ड्युओटोन प्रभाव लागू करें। छवि को ग्रेस्केल में परिवर्तित किया जाता है, फिर शैडो रंग (गहरे टोन) और हाइलाइट रंग (चमकीले टोन) के बीच एक ग्रेडिएंट में मैप किया जाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/duotone`

एक छवि फ़ाइल और एक JSON `settings` फ़ील्ड के साथ मल्टीपार्ट फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| shadow | string | No | `"#1e3a8a"` | शैडो हेक्स रंग (गहरे टोन पर लागू) |
| highlight | string | No | `"#fbbf24"` | हाइलाइट हेक्स रंग (चमकीले टोन पर लागू) |
| intensity | integer | No | `100` | प्रभाव तीव्रता (0-100); 0 मूल लौटाता है, 100 पूर्ण ड्युओटोन लागू करता है |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notes {#notes}

- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है। HEIC, RAW, PSD, और SVG इनपुट प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किए जाते हैं।
- 100 से कम की `intensity` ड्युओटोन परिणाम को मूल छवि के साथ मिश्रित करती है, जिससे सूक्ष्म प्रभाव संभव होते हैं।
- लोकप्रिय ड्युओटोन संयोजनों में navy/gold, teal/coral, और purple/pink शामिल हैं।
