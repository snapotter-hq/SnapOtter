---
description: "अंतर्निहित Tesseract या वैकल्पिक उच्च-सटीकता RapidOCR रनटाइम के साथ स्थानीय रूप से स्कैन किए गए पीडीएफ से टेक्स्ट निकालें।"
i18n_output_hash: e35b10d659bd
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

किसी बाहरी सेवा को PDF भेजे बिना स्कैन किए गए PDF दस्तावेज़ों से पेज दर पेज टेक्स्ट निकालें। अंतर्निहित `fast` टियर Tesseract का उपयोग करता है। वैकल्पिक `balanced` और `best` टियर पिन किए गए PP-OCR ONNX मॉडल के साथ RapidOCR का उपयोग करते हैं।


<!-- korean-ocr-contract:start -->
::: info कोरियाई OCR संगतता
तेज़ OCR `auto`, `en`, `de`, `es`, `fr`, `zh` और `ja` का समर्थन करता है, लेकिन कोरियाई (`ko`) का नहीं। कोरियाई के लिए सटीक OCR पैक और `balanced` या `best` आवश्यक है। पैक आधिकारिक Linux amd64 और arm64 कंटेनरों पर चलता है; NVIDIA होस्ट पर भी OCR CPU पर ही चलता है। असमर्थित सिस्टम स्पष्ट संगतता त्रुटि लौटाते हैं और चुपचाप `fast` पर वापस नहीं जाते। कोरियाई के साथ `fast` या पुराने `tesseract` नाम को कतार में डालने से पहले `FEATURE_INCOMPATIBLE` और `fast-korean-unsupported` के साथ अस्वीकार किया जाता है।
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

एक PDF फ़ाइल और एक वैकल्पिक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | हाँ | - | PDF फ़ाइल (मल्टीपार्ट), 512 तक MiB एन्कोडेड; कम ऑपरेटर अपलोड सीमा अभी भी लागू है |
| quality | string | नहीं | गतिशील | OCR गुणवत्ता स्तर: `fast`, `balanced`, या `best` |
| language | string | No | `"auto"` | दस्तावेज़ भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | पृष्ठ चयन, उदा. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | नहीं | स्तर पर निर्भर | पहचान से पहले स्थानीय कंट्रास्ट में सुधार करें। फास्ट इसे सीधे लागू करता है; बैलेंस्ड और बेस्ट वेरिएंट को तभी बरकरार रखते हैं जब कैलिब्रेटेड स्कोरिंग से परिणाम में सुधार होता है। `best` के लिए डिफ़ॉल्ट `true` और `fast`/`balanced` के लिए `false` |
| engine | string | नहीं | - | अस्वीकृत अनुकूलता उपनाम. इसके बजाय `quality` का उपयोग करें। `tesseract` से `fast` मानचित्र; लीगेसी `paddleocr` मान `balanced` पर मैप होता है लेकिन PaddlePaddle लोड नहीं होता है |

जब `quality` और `engine` नहीं दिए जाते, SnapOtter इस क्रम में सर्वोत्तम उपलब्ध टियर चुनता है: `best`, `balanced`, `fast`। कोरियाई के लिए `fast` कभी नहीं चुना जाता; `best`, फिर `balanced` उपयोग होता है, अन्यथा सटीक रनटाइम का इंस्टॉलेशन या संगतता त्रुटि लौटती है।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

`202 Accepted` लौटाता है। `/api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति ट्रैक करें।

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pdf`।
- `fast` बनाया गया है और आधिकारिक छवि में लगभग 25 MiB जोड़ता है। `balanced` और `best` को वैकल्पिक सटीक OCR पैक (लक्ष्य के आधार पर डाउनलोड करने के लिए लगभग 208-234 MiB और 409-488 MiB इंस्टॉल) की आवश्यकता होती है।
- सटीक पैक Linux amd64 और arm64 का समर्थन करता है और NVIDIA होस्ट सहित CPU पर ONNX Runtime का उपयोग करता है।
- स्पष्ट रूप से अनुरोधित स्तर को कभी भी चुपचाप डाउनग्रेड नहीं किया जाता है। यदि `balanced` या `best` अनुपलब्ध है, तो API `FEATURE_NOT_INSTALLED` या `FEATURE_INCOMPATIBLE` के साथ `501` लौटाता है।
- PDF पृष्ठों को OCR से पहले उच्च रिज़ॉल्यूशन पर रैस्टराइज़ किया जाता है। `best` उच्च-सटीकता माध्यम PP-OCRv6 मॉडल चलाता है और गति की कीमत पर पहचान में सुधार करते हुए ओरिएंटेशन और एन्हांसमेंट वेरिएंट स्कोर करता है।
- `auto` भाषा सेटिंग समर्थित स्क्रिप्ट सेट में पहचान को सक्षम बनाती है; एक स्पष्ट संकेत किसी ज्ञात दस्तावेज़ भाषा के परिणामों में सुधार कर सकता है।
- आप रेंज (`"1-3"`), कॉमा-सेपरेटेड सूचियों (`"1,3,5"`), या हर पृष्ठ के लिए `"all"` का उपयोग करके विशिष्ट पृष्ठों को लक्षित कर सकते हैं।
- एक अनुरोध अधिकतम 50 पृष्ठों पर संसाधित हो सकता है। रैस्टराइज़्ड स्क्रैच डेटा को 512 MiB पर कैप किया गया है और कुल UTF-8 OCR प्रतिक्रिया को 1,000,000 बाइट्स पर कैप किया गया है; आंशिक पाठ लौटाने के बजाय सीमा से अधिक कार्य विफल हो जाते हैं।
- ऐसी PDF के लिए जिनमें पहले से चयन योग्य टेक्स्ट है, इसके बजाय तेज़ [PDF to Text](./pdf-to-text) टूल का उपयोग करने पर विचार करें।
