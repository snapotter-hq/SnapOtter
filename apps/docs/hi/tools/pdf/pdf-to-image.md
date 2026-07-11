---
description: "PDF पृष्ठों को उच्च-गुणवत्ता वाली इमेज में बदलें।"
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: d063c20b66ca
---

# PDF to Image {#pdf-to-image}

PDF पृष्ठों को उच्च-गुणवत्ता वाली रास्टर इमेज में बदलें। पृष्ठ चयन, कई आउटपुट फ़ॉर्मेट, DPI नियंत्रण और कलर मोड का समर्थन करता है। कन्वर्ज़न से पहले PDF का निरीक्षण करने के लिए info और preview सब-रूट शामिल हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | आउटपुट फ़ॉर्मेट: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | रेंडर रिज़ॉल्यूशन (36 से 2400)। उच्च DPI बड़ी, अधिक विस्तृत इमेज बनाता है। |
| quality | number | No | 85 | लॉसी फ़ॉर्मेट के लिए आउटपुट क्वालिटी (1 से 100) |
| colorMode | string | No | `"color"` | कलर मोड: `color`, `grayscale`, `bw` (श्वेत-श्याम थ्रेशोल्ड) |
| pages | string | No | `"all"` | पृष्ठ चयन: `all`, एकल पृष्ठ (`3`), रेंज (`1-5`), या कॉमा-सेपरेटेड (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

किसी भी पृष्ठ को रेंडर किए बिना PDF की पृष्ठ संख्या लौटाता है।

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

सभी पृष्ठों के निम्न-रिज़ॉल्यूशन JPEG थंबनेल base64 data URL के रूप में लौटाता है। पृष्ठ चयन UI बनाने के लिए उपयोगी।

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- PDF रेंडरिंग के लिए MuPDF का उपयोग करता है, जो सही फ़ॉन्ट रेंडरिंग और वेक्टर ग्राफ़िक्स के साथ उच्च-निष्ठा आउटपुट प्रदान करता है।
- पासवर्ड-सुरक्षित PDF समर्थित नहीं हैं और 400 त्रुटि लौटाएंगी।
- `pages` पैरामीटर लचीले सिंटैक्स का समर्थन करता है:
  - `"all"` या `""` - सभी पृष्ठ
  - `"3"` - एकल पृष्ठ
  - `"1-5"` - पृष्ठ रेंज (समावेशी)
  - `"1,3,5-8"` - मिश्रित अलग-अलग पृष्ठ और रेंज
- पृष्ठ संख्याएं 1-आधारित हैं। दस्तावेज़ की लंबाई से परे पृष्ठ निर्दिष्ट करने पर 400 त्रुटि लौटती है।
- मुख्य एंडपॉइंट हमेशा अलग-अलग पृष्ठ डाउनलोड और सभी चयनित पृष्ठों वाला एक ZIP दोनों उत्पन्न करता है।
- preview एंडपॉइंट 72 DPI पर रेंडर करता है और तेज़ थंबनेल जनरेशन के लिए 300px चौड़ाई तक स्केल करता है। थंबनेल 60% क्वालिटी पर JPEG होते हैं।
- preview एंडपॉइंट `MAX_PDF_PAGES` सर्वर कॉन्फ़िगरेशन का सम्मान करता है, जिससे यह सीमित होता है कि कितने थंबनेल उत्पन्न किए जाते हैं।
- उच्च DPI पर बड़े दस्तावेज़ों के लिए, प्रोसेसिंग समय आनुपातिक रूप से बढ़ता है। वेब उपयोग के लिए कम DPI (150) और प्रिंट के लिए उच्च DPI (300-600) का उपयोग करने पर विचार करें।
