---
description: "टेक्स्ट को Base64 में एन्कोड करें या Base64 को वापस टेक्स्ट में डिकोड करें।"
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 336688903d90
i18n_hash_version: 2
---

# Base64 Encode / Decode {#base64}

Base64 पाने के लिए टेक्स्ट पेस्ट करें, या टेक्स्ट वापस पाने के लिए Base64 पेस्ट करें, फिर नतीजा कॉपी करें। टेक्स्ट आपके अपने SnapOtter सर्वर पर जाता है और कहीं और नहीं।

किसी इमेज को Base64 में बदलने के लिए इसके बजाय [Image to Base64](/hi/tools/image/image-to-base64) का उपयोग करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

multipart form data के बजाय JSON बॉडी स्वीकार करता है, और डाउनलोड के लिए फ़ाइल के बजाय कन्वर्ट किया गया टेक्स्ट लौटाता है।

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (आवश्यक) | एन्कोड करने के लिए टेक्स्ट, या डिकोड करने के लिए Base64। अधिकतम 1,000,000 अक्षर। |
| `mode` | string | (आवश्यक) | `encode` या `decode`। |
| `urlSafe` | boolean | `false` | एन्कोड करते समय URL-सुरक्षित वर्णमाला (`-` और `_`) का उपयोग करें और `=` पैडिंग हटा दें। डिकोड करते समय अनदेखा किया जाता है। |

## Example Request {#example-request}

एन्कोड:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

डिकोड:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- टेक्स्ट UTF-8 के रूप में एन्कोड होता है, इसलिए उच्चारण चिह्न वाले अक्षर, CJK और इमोजी सही-सलामत वापस आते हैं।
- डिकोडिंग स्पेस और लाइन ब्रेक को अनदेखा करती है, इसलिए 76 कॉलम पर लपेटा गया Base64 (ईमेल, PEM बॉडी) जैसा पेस्ट किया गया हो वैसा ही डिकोड हो जाता है।
- डिकोडिंग `=` पैडिंग के साथ या उसके बिना इनपुट स्वीकार करती है, मानक (`+`, `/`) या URL-सुरक्षित (`-`, `_`) वर्णमाला में, लेकिन दोनों का मिश्रण नहीं।
- जो इनपुट Base64 नहीं है वह 400 और कोड `ENCODED_TEXT_INVALID` के साथ विफल होता है। जो वैध Base64 UTF-8 टेक्स्ट के बजाय बाइनरी डेटा (इमेज, ZIP) में डिकोड होता है, वह `DECODED_DATA_NOT_TEXT` के साथ विफल होता है।
