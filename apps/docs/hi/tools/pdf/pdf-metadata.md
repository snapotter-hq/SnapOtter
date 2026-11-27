---
description: "PDF दस्तावेज़ मेटाडेटा पढ़ें और लिखें।"
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: bef69b4cfe24
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

PDF दस्तावेज़ मेटाडेटा फ़ील्ड जैसे शीर्षक, लेखक, विषय और कीवर्ड पढ़ें और अपडेट करें, या दस्तावेज़ का मेटाडेटा पूरी तरह हटा दें। जब कोई सेटिंग प्रदान नहीं की जाती, तो मौजूदा मेटाडेटा बिना संशोधन के लौटाया जाता है।

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
| stripAll | boolean | No | false | पूरी Info dictionary (तिथियाँ, Creator, Producer, कस्टम कुंजियाँ), हर XMP स्ट्रीम (दस्तावेज़, पेज, इमेज) और सारा PieceInfo एप्लिकेशन डेटा हटाएँ, फिर ऊपर दिए गए फ़ील्ड लिखें |
| removeAttachments | boolean | No | false | एम्बेडेड फ़ाइलें भी हटाएँ: दस्तावेज़ की अटैचमेंट सूची, फ़ाइल अटैचमेंट एनोटेशन और संबद्ध फ़ाइलें (`/AF`)। इसके लिए `stripAll` आवश्यक है |

सभी पैरामीटर वैकल्पिक हैं। `stripAll` सेट न हो तो छोड़े गए फ़ील्ड अपरिवर्तित रहते हैं।

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
- `stripAll` के साथ, रिस्पॉन्स में `stripped` भी होता है: हटाई गई Info कुंजियाँ (`removed`), क्या दस्तावेज़ की XMP स्ट्रीम हटाई गई (`xmpRemoved`), इनपुट ने कौन सा PDF/A स्तर घोषित किया था (`pdfa`, या `null`), पेज, इमेज और अन्य ऑब्जेक्ट से कितनी XMP स्ट्रीम हटीं (`objectXmpRemoved`), कितने PieceInfo dictionary हटाए गए (`pieceInfoRemoved`), और कितनी एम्बेडेड फ़ाइलें हटाई गईं (`attachmentsRemoved`, `removeAttachments` के बिना हमेशा `0`)। XMP हटाने से PDF/A अनुरूपता टूट जाती है।
- अकेला `stripAll` एम्बेडेड फ़ाइल अटैचमेंट को बनाए रखता है, क्योंकि उन्हें हटाने से दस्तावेज़ की सामग्री बदल जाती है। उन्हें भी हटाने के लिए `removeAttachments` जोड़ें। इससे ZUGFeRD और Factur-X ई-इनवॉइस से जुड़ा XML हट जाता है और PDF/A-3 अनुरूपता टूट जाती है।
- `stripAll` के बिना `removeAttachments` भेजने पर 400 लौटता है।
