---
description: "छवियों में एक पूर्वानुमेय, नियंत्रित क्रम में बॉर्डर, पैडिंग, गोल कोने, और ड्रॉप शैडो जोड़ें।"
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: a21d8e52d047
---

# Border & Frame {#border-frame}

छवियों में बॉर्डर, पैडिंग, गोल कोने, और ड्रॉप शैडो जोड़ें। यह टूल प्रभावों को क्रम में लागू करता है: पैडिंग, बॉर्डर, कॉर्नर त्रिज्या, फिर छाया।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | number | No | 10 | पिक्सेल में बॉर्डर मोटाई (0 से 2000) |
| borderColor | string | No | `"#000000"` | hex के रूप में बॉर्डर रंग (उदा. `#FF0000`) |
| padding | number | No | 0 | पिक्सेल में छवि और बॉर्डर के बीच आंतरिक पैडिंग (0 से 200) |
| paddingColor | string | No | `"#FFFFFF"` | hex के रूप में पैडिंग फिल रंग |
| cornerRadius | number | No | 0 | पिक्सेल में कॉर्नर त्रिज्या (0 से 2000) |
| shadow | boolean | No | `false` | ड्रॉप शैडो जोड़ना है या नहीं |
| shadowBlur | number | No | 15 | छाया ब्लर त्रिज्या (1 से 200) |
| shadowOffsetX | number | No | 0 | छाया क्षैतिज ऑफसेट (-50 से 50) |
| shadowOffsetY | number | No | 5 | छाया ऊर्ध्वाधर ऑफसेट (-50 से 50) |
| shadowColor | string | No | `"#000000"` | hex के रूप में छाया रंग |
| shadowOpacity | number | No | 40 | छाया अपारदर्शिता प्रतिशत (0 से 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notes {#notes}

- मानक `createToolRoute` फ़ैक्ट्री का उपयोग करता है। multipart अपलोड के ज़रिए एक ही छवि फ़ाइल स्वीकार करता है।
- HEIC, RAW, PSD, और SVG इनपुट प्रारूपों का समर्थन करता है (स्वचालित रूप से डिकोड किए गए)।
- प्रोसेसिंग क्रम: पहले पैडिंग जोड़ी जाती है, फिर बॉर्डर चारों ओर लपेटता है, फिर कॉर्नर त्रिज्या लागू की जाती है, फिर छाया कंपोज़िट की जाती है।
- जब `cornerRadius` या `shadow` सक्षम होता है, तो पारदर्शिता संरक्षित करने के लिए आउटपुट को PNG पर बाध्य किया जाता है (इनपुट प्रारूप की परवाह किए बिना)। अल्फा का समर्थन करने वाले प्रारूप (PNG, WebP, AVIF) अपना मूल प्रारूप बनाए रखते हैं।
- छाया आकार-जागरूक होती है: यह आयताकार छाया बनाने के बजाय गोल कोनों का अनुसरण करती है।
- `borderWidth` को 0 पर सेट करना और केवल `cornerRadius` + `shadow` का उपयोग करना एक फ़्रेमरहित गोल छाया प्रभाव बनाता है।
