---
description: "PDF दस्तावेज़ मेटाडेटा पढ़ें और लिखें।"
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 042cd80a1ad4
---

# PDF Metadata {#pdf-metadata}

PDF दस्तावेज़ मेटाडेटा फ़ील्ड जैसे शीर्षक, लेखक, विषय और कीवर्ड पढ़ें और अपडेट करें। जब कोई सेटिंग प्रदान नहीं की जाती, तो मौजूदा मेटाडेटा बिना संशोधन के लौटाया जाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

एक PDF फ़ाइल और एक वैकल्पिक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | दस्तावेज़ शीर्षक (अधिकतम 500 अक्षर) |
| author | string | No | - | दस्तावेज़ लेखक (अधिकतम 500 अक्षर) |
| subject | string | No | - | दस्तावेज़ विषय (अधिकतम 500 अक्षर) |
| keywords | string | No | - | दस्तावेज़ कीवर्ड (अधिकतम 500 अक्षर) |

सभी पैरामीटर वैकल्पिक हैं। छोड़े गए फ़ील्ड अपरिवर्तित रहते हैं।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pdf`।
- यह एक फ़ास्ट (सिंक्रोनस) टूल है जो परिणाम सीधे लौटाता है।
- रिस्पॉन्स में `metadata` फ़ील्ड में किसी भी अपडेट के बाद परिणामी मेटाडेटा होता है।
- मेटाडेटा को संशोधित किए बिना पढ़ने के लिए, `settings` फ़ील्ड छोड़ दें या एक खाली ऑब्जेक्ट भेजें।
- प्रत्येक मेटाडेटा फ़ील्ड 500 अक्षरों तक सीमित है।
