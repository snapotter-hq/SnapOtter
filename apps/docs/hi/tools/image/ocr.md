---
description: "अंतर्निहित Tesseract या वैकल्पिक उच्च-सटीकता RapidOCR रनटाइम के साथ स्थानीय रूप से छवियों से पाठ निकालें।"
i18n_output_hash: 79d324d33cc9
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Text Extraction {#ocr-text-extraction}

किसी बाहरी सेवा को छवि भेजे बिना छवियों से पाठ निकालें। अंतर्निर्मित `fast` टियर Tesseract का उपयोग करता है। वैकल्पिक `balanced` और `best` टियर पिन किए गए PP-OCR ONNX मॉडल के साथ RapidOCR का उपयोग करते हैं।


<!-- korean-ocr-contract:start -->
::: info कोरियाई OCR संगतता
तेज़ OCR `auto`, `en`, `de`, `es`, `fr`, `zh` और `ja` का समर्थन करता है, लेकिन कोरियाई (`ko`) का नहीं। कोरियाई के लिए सटीक OCR पैक और `balanced` या `best` आवश्यक है। पैक आधिकारिक Linux amd64 और arm64 कंटेनरों पर चलता है; NVIDIA होस्ट पर भी OCR CPU पर ही चलता है। असमर्थित सिस्टम स्पष्ट संगतता त्रुटि लौटाते हैं और चुपचाप `fast` पर वापस नहीं जाते। कोरियाई के साथ `fast` या पुराने `tesseract` नाम को कतार में डालने से पहले `FEATURE_INCOMPATIBLE` और `fast-korean-unsupported` के साथ अस्वीकार किया जाता है।
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**प्रसंस्करण:** OCR हमेशा असिंक्रोनस रूप से चलता है। सत्यापन और कतार में जोड़े जाने के बाद, एंडपॉइंट तुरंत `jobId` के साथ `202 Accepted` लौटाता है। कार्य की SSE प्रगति स्ट्रीम को अंतिम `complete` या `failed` इवेंट तक फ़ॉलो करें; सफल इवेंट के `result` में OCR फ़ील्ड होते हैं।

**सटीक OCR पैक:** वैकल्पिक `ocr` रनटाइम (लक्ष्य के आधार पर डाउनलोड करने के लिए लगभग 208-234 MiB और 409-488 MiB इंस्टॉल किया गया)। `fast` को इस पैक की आवश्यकता नहीं है; इंस्टॉलर हस्ताक्षरित सूचकांक द्वारा बंधे सटीक आकारों की पुष्टि करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | हाँ | - | छवि फ़ाइल (मल्टीपार्ट), 512 MiB तक एन्कोडेड और 40 मेगापिक्सेल डिकोडेड; कम ऑपरेटर अपलोड सीमा अभी भी लागू है |
| quality | string | नहीं | गतिशील | गुणवत्ता स्तर: `fast` (Tesseract), `balanced` (छोटे PP-OCRv6 मॉडल के साथ RapidOCR), या `best` (कैलिब्रेटेड वेरिएंट स्कोरिंग के साथ उच्च सटीकता वाले मध्यम PP-OCRv6 मॉडल) |
| language | string | No | `"auto"` | भाषा संकेत: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | नहीं | स्तर पर निर्भर | पहचान से पहले स्थानीय कंट्रास्ट में सुधार करें। फास्ट इसे सीधे लागू करता है; बैलेंस्ड और बेस्ट वेरिएंट को तभी बरकरार रखते हैं जब कैलिब्रेटेड स्कोरिंग से परिणाम में सुधार होता है। `best` के लिए डिफ़ॉल्ट `true` और `fast`/`balanced` के लिए `false` |
| engine | string | नहीं | - | अस्वीकृत अनुकूलता उपनाम. इसके बजाय `quality` का उपयोग करें। `tesseract` से `fast` मानचित्र; लीगेसी `paddleocr` मान `balanced` पर मैप होता है लेकिन PaddlePaddle लोड नहीं होता है |

जब `quality` और `engine` नहीं दिए जाते, SnapOtter इस क्रम में सर्वोत्तम उपलब्ध टियर चुनता है: `best`, `balanced`, `fast`। कोरियाई के लिए `fast` कभी नहीं चुना जाता; `best`, फिर `balanced` उपयोग होता है, अन्यथा सटीक रनटाइम का इंस्टॉलेशन या संगतता त्रुटि लौटती है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## स्वीकृत प्रतिक्रिया (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### प्रगति और परिणाम (SSE) {#progress-sse-optional}

`202` प्रतिक्रिया से मिले `jobId` (या दिए गए `clientJobId`) के साथ `GET /api/v1/jobs/{jobId}/progress` से जुड़ें। अंतिम `complete` या `failed` इवेंट तक स्ट्रीम खुली रखें। सफल अंतिम फ़्रेम के `result` में OCR आउटपुट होता है:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

प्रसंस्करण विफलताएँ अंतिम `failed` इवेंट के `error` फ़ील्ड में आती हैं; कतार में जोड़े जाने के बाद वे HTTP `422` के रूप में नहीं लौटतीं।

## Notes {#notes}

- `fast` हमेशा समर्थित SnapOtter छवियों में उपलब्ध है। `balanced` और `best` को वैकल्पिक सटीक OCR पैक की आवश्यकता होती है।
- बिल्ट-इन Tesseract आधिकारिक छवि में लगभग 25 MiB जोड़ता है। सटीक पैक `/data/ai` में संग्रहीत है, छवि में बेक नहीं किया गया है।
- सटीक पैक आधिकारिक Linux amd64 और arm64 कंटेनरों के लिए प्रकाशित किया गया है। यह जानबूझकर NVIDIA होस्ट सहित ONNX Runtime के CPU प्रदाता का उपयोग करता है, इसलिए यह CUDA लाइब्रेरी या GPU संगतता पर निर्भर नहीं करता है। स्रोत और पूर्वनिर्मित bare-metal इंस्टॉल फास्ट OCR का उपयोग करते हैं जब तक कि वे अपना स्वयं का संगत रनटाइम प्रदान नहीं करते हैं।
- सफल अंतिम `result` में `text` के अंदर निकाला गया टेक्स्ट और `downloadUrl` में डाउनलोड करने योग्य `.txt` आर्टिफैक्ट, दोनों होते हैं।
- SnapOtter स्पष्ट रूप से अनुरोधित स्तर का सम्मान करता है। यदि `balanced` या `best` अनुपलब्ध है, तो API `FEATURE_NOT_INSTALLED` या `FEATURE_INCOMPATIBLE` के साथ `501` लौटाता है; यह कभी भी चुपचाप अनुरोध को दूसरे स्तर पर डाउनग्रेड नहीं करता है।
- एक सफल खाली परिणाम एक खाली परिणाम ही रहता है। रनटाइम विफलताएँ निम्न-गुणवत्ता वाले इंजन के साथ पुनः प्रयास करने के बजाय एक त्रुटि लौटाती हैं।
- सफल अंतिम `result`, `requestedQuality` और `actualQuality` के साथ इंजन, डिवाइस, प्रदाता, रनटाइम और मॉडल संस्करण तथा सभी चेतावनियों की रिपोर्ट करता है।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR और HDR इनपुट प्रारूपों का समर्थन करता है।
- बड़े आकार के एन्कोडेड इनपुट `413` लौटाते हैं। 40 मेगापिक्सेल से अधिक की छवियाँ और उनकी निर्धारित आउटपुट सीमा से अधिक OCR प्रतिक्रियाओं को आंशिक रूप से संसाधित करने के बजाय अस्वीकार कर दिया जाता है।
