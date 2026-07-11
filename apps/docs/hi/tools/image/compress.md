---
description: "गुणवत्ता स्तर के अनुसार या किसी लक्षित फ़ाइल आकार तक छवि फ़ाइल आकार कम करें।"
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: 1f185a4e5191
---

# Compress {#compress}

गुणवत्ता स्तर या किलोबाइट में लक्षित फ़ाइल आकार निर्दिष्ट करके छवि फ़ाइल आकार कम करें। यह टूल आकार लक्ष्यों को सटीक रूप से प्राप्त करने के लिए पुनरावर्ती द्विआधारी खोज का उपयोग करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compress`

एक छवि फ़ाइल और एक JSON `settings` फ़ील्ड के साथ मल्टीपार्ट फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | संपीड़न मोड: `quality` या `targetSize` |
| quality | number | No | `80` | गुणवत्ता स्तर (1-100)। तब उपयोग किया जाता है जब मोड `quality` हो। |
| targetSizeKb | number | No | - | किलोबाइट में लक्षित फ़ाइल आकार। तब उपयोग किया जाता है जब मोड `targetSize` हो। |

## Example Request {#example-request}

गुणवत्ता 60 पर संपीड़ित करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

200 KB के लक्षित आकार पर संपीड़ित करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notes {#notes}

- `quality` मोड में, कम मान अधिक संपीड़न कलाकृतियों के साथ छोटी फ़ाइलें उत्पन्न करते हैं। वेब उपयोग के लिए 80 का मान एक अच्छा डिफ़ॉल्ट है।
- `targetSize` मोड में, इंजन लक्ष्य से अधिक हुए बिना उसके यथासंभव निकट पहुँचने के लिए पुनरावर्ती संपीड़न करता है।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है। संपीड़न फ़ॉर्मेट की मूल एन्कोडिंग पर लागू होता है (उदा. JPEG फ़ाइलों के लिए JPEG गुणवत्ता, WebP फ़ाइलों के लिए WebP गुणवत्ता)।
- यदि डिफ़ॉल्ट गुणवत्ता (80) स्वीकार्य है, तो आप `quality` पैरामीटर को पूरी तरह छोड़ सकते हैं।
