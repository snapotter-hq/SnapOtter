---
description: "समायोज्य स्ट्रेंथ, रंग, और स्थिति के साथ एक विग्नेट प्रभाव जोड़ें।"
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: bae6049a2d7c
---

# Vignette {#vignette}

एक विग्नेट प्रभाव जोड़ें जो छवि के किनारों को गहरा करता है या टिंट करता है। समायोज्य स्ट्रेंथ, रंग, रेडियस, सॉफ़्टनेस, राउंडनेस, और केंद्र स्थिति का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

एक image फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | विग्नेट अपारदर्शिता (0.1-1) |
| color | string | No | `"#000000"` | विग्नेट हेक्स रंग |
| radius | integer | No | `70` | आधे-विकर्ण के प्रतिशत के रूप में बाहरी रेडियस (0-100) |
| softness | integer | No | `50` | फ़ेदर सॉफ़्टनेस (0-100); उच्च मान अधिक क्रमिक फ़ेड उत्पन्न करते हैं |
| roundness | integer | No | `100` | आकार: 100 = वृत्त, 0 = छवि आस्पेक्ट रेशियो से मेल खाने वाला दीर्घवृत्त |
| centerX | integer | No | `50` | प्रतिशत के रूप में क्षैतिज केंद्र स्थिति (0-100) |
| centerY | integer | No | `50` | प्रतिशत के रूप में लंबवत केंद्र स्थिति (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notes {#notes}

- छोटा `radius` छवि का अधिक भाग गहरा करता है; बड़ा रेडियस विग्नेट को अत्यधिक किनारों तक सीमित करता है।
- रचनात्मक विग्नेट प्रभावों के लिए गैर-काले `color` (उदा., सफ़ेद या सेपिया टोन) का उपयोग करें।
- `centerX` और `centerY` को समायोजित करने से आप स्पष्ट क्षेत्र को केंद्र से हटकर रख सकते हैं, जो फ़्रेम के बीच में न होने वाले किसी सब्जेक्ट पर फ़ोकस लाने के लिए उपयोगी है।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है। HEIC, RAW, PSD, और SVG इनपुट प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किए जाते हैं।
