---
description: "PDF के हर पृष्ठ को A4, Letter, 4x6 इंच के शिपिंग लेबल या कस्टम आकार में बदलें।"
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: c2f5239b1eba
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

PDF के हर पृष्ठ का आकार बदलें। सामग्री को नए पृष्ठ में फ़िट होने के लिए स्केल करके बीच में रखा जाता है, इसलिए टेक्स्ट, वेक्टर आर्ट और बारकोड स्पष्ट बने रहते हैं। इसका उपयोग थर्मल प्रिंटर के लिए शिपिंग लेबल को 4x6 इंच के पृष्ठ में बदलने, या दस्तावेज़ को A4 और US Letter के बीच ले जाने के लिए करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | लक्षित आकार: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal`, या `custom` |
| width | number | No | `4` | कस्टम पृष्ठ की चौड़ाई, तब उपयोग होती है जब `pageSize` का मान `custom` हो |
| height | number | No | `6` | कस्टम पृष्ठ की ऊँचाई, तब उपयोग होती है जब `pageSize` का मान `custom` हो |
| unit | string | No | `"in"` | कस्टम आकार की इकाई: `in` या `mm` |
| keepOrientation | boolean | No | `false` | लक्षित आकार को चौड़ाई गुणा ऊँचाई पर थोपने के बजाय हर पृष्ठ के ओरिएंटेशन से मिलाने के लिए घुमाएं |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- पृष्ठों को फ़िट होने के लिए स्केल किया जाता है, कभी खींचा नहीं जाता। जब आस्पेक्ट रेशियो अलग हो, तो बची हुई जगह खाली छोड़ दी जाती है।
- आकार बदलने से क्रॉप नहीं होता। Letter या A4 पृष्ठ के एक चौथाई हिस्से पर छपा लेबल नए पृष्ठ का भी केवल एक चौथाई हिस्सा घेरता है।
- कस्टम आकार हर तरफ़ 0.5-200 इंच (12.7-5080 mm) के बीच होना चाहिए।
- पृष्ठ का आकार उसके क्रॉप बॉक्स से बदला जाता है, यदि उसमें हो, इसलिए क्रॉप किया गया पृष्ठ केवल क्रॉप किया हुआ हिस्सा रखता है।
