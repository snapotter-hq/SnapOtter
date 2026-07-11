---
description: "सभी लोकल ML टूल के साथ AI इंजन संदर्भ। बैकग्राउंड हटाना, अपस्केलिंग, OCR, फेस डिटेक्शन, फोटो रिस्टोरेशन, और बहुत कुछ।"
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: f892a5e5bfe5
---

# AI इंजन संदर्भ {#ai-engine-reference}

`@snapotter/ai` पैकेज सभी ML ऑपरेशन के लिए Node.js को एक **स्थायी Python साइडकार** से जोड़ता है। फास्ट वार्म-स्टार्ट प्रदर्शन के लिए डिस्पैचर प्रोसेस अनुरोधों के बीच जीवित रहती है। स्टार्टअप पर NVIDIA CUDA स्वतः पहचाना जाता है और उपलब्ध होने पर उपयोग किया जाता है; अन्यथा AI टूल CPU पर चलते हैं।

VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU त्वरण आज AI इन्फेरेंस के लिए समर्थित नहीं है। किसी कंटेनर में `/dev/dri` को मैप करना इन Python साइडकार टूल को तेज़ नहीं करता जब तक कोई CUDA-सक्षम NVIDIA GPU उपलब्ध न हो।

चार मोडैलिटी (image, audio, video, document) में 19 Python साइडकार AI टूल, साथ ही वैकल्पिक AI क्षमताओं वाले 2 टूल। सभी मॉडल लोकल रूप से चलते हैं; प्रारंभिक मॉडल डाउनलोड के बाद इंटरनेट की आवश्यकता नहीं।

## आर्किटेक्चर {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

एक अलग "docs" डिस्पैचर प्रोफ़ाइल AI अनुमति सूची को दस्तावेज़-प्रसंस्करण स्क्रिप्ट (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) से बदल देती है और भारी ML आयातों को छोड़ देती है।

**टाइमआउट:** 300 s डिफ़ॉल्ट; OCR और BiRefNet बैकग्राउंड हटाने को 600 s मिलते हैं।

## फ़ीचर बंडल {#feature-bundles}

AI मॉडल साझा डिपेंडेंसी स्टैक द्वारा पैकेज किए जाते हैं, प्रति टूल एक आर्काइव नहीं। एक फ़ीचर बंडल कई टूल को सक्षम कर सकता है जब वे एक ही मॉडल परिवार, Python wheels, या नेटिव लाइब्रेरी का उपयोग करते हैं। इससे रिलीज़ Docker इमेज छोटी रहती है और एक ही बैकग्राउंड मैटिंग, फेस डिटेक्शन, OCR, रिस्टोरेशन, और स्पीच मॉडल की डुप्लिकेट प्रतियाँ संग्रहीत करने से बचा जाता है।

Docker इमेज एप्लिकेशन के साथ-साथ सामान्य रनटाइम भेजती है। बड़े मॉडल आर्काइव माँग पर स्थायी `/data/ai` वॉल्यूम में डाउनलोड किए जाते हैं, फिर हर उस टूल द्वारा पुनः उपयोग किए जाते हैं जिसे उनकी आवश्यकता होती है। यदि कोई बंडल पहले से इंस्टॉल है क्योंकि किसी अन्य टूल को उसकी आवश्यकता थी, तो एक नया आश्रित टूल सक्षम करना उस बंडल को दोबारा डाउनलोड नहीं करता।

प्रत्येक AI टूल को चलने से पहले एक या अधिक फ़ीचर बंडल की आवश्यकता होती है। एडमिन UI `POST /api/v1/admin/tools/:toolId/features/install` के माध्यम से टूल के हिसाब से इंस्टॉल करता है, जो पूरी बंडल सूची को हल करता है, पहले से इंस्टॉल बंडल छोड़ देता है, और केवल छूटे हुए डाउनलोड को कतारबद्ध करता है। उदाहरण के लिए, किसी ताज़ा इंस्टेंस पर Passport Photo सक्षम करना `background-removal` और `face-detection` को कतारबद्ध करता है; Background Removal पहले से इंस्टॉल होने के बाद इसे सक्षम करना केवल `face-detection` को कतारबद्ध करता है।

| बंडल | आकार | साझा डिपेंडेंसी समूह | इसका उपयोग करने वाले टूल |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet बैकग्राउंड मैटिंग | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe फेस डिटेक्शन और लैंडमार्क | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa इनपेंटिंग/आउटपेंटिंग और DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, डीनॉइज़िंग | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | स्क्रैच रिपेयर और रिस्टोरेशन पाइपलाइन | restore-photo |
| `ocr` | 5-6 GB | PaddleOCR / Tesseract OCR स्टैक | ocr, ocr-pdf |
| `transcription` | ~600 MB | faster-whisper स्पीच-टू-टेक्स्ट मॉडल | transcribe-audio, auto-subtitles |

क्रॉस-बंडल डिपेंडेंसी वाले टूल:

| टूल | आवश्यक बंडल | क्यों |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | बैकग्राउंड हटाता है, फिर पासपोर्ट और ID फोटो नियमों के अनुसार क्रॉप को फ्रेम करने के लिए फेस लैंडमार्क का उपयोग करता है। |
| `enhance-faces` | `upscale-enhance`, `face-detection` | चयनित फेस क्षेत्रों पर GFPGAN या CodeFormer एन्हांसमेंट चलाने से पहले फेस का पता लगाता है। |

कोई टूल केवल तभी उपलब्ध होता है जब उसके सभी आवश्यक बंडल इंस्टॉल हों। आंशिक इंस्टॉल मान्य हैं और वृद्धिशील रूप से संभाले जाते हैं: इंस्टॉल किए गए बंडल पुनः उपयोग किए जाते हैं, छूटे हुए बंडल डाउनलोड के रूप में दिखाए जाते हैं, और कतारबद्ध इंस्टॉल एक बार में एक चलते हैं ताकि साझा Python वातावरण समवर्ती रूप से संशोधित न हो।

---

## बैकग्राउंड हटाना {#background-removal}

**टूल रूट:** `remove-background`  
**मॉडल:** BiRefNet (डिफ़ॉल्ट) या U2-Net वेरिएंट के साथ rembg

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `model` | string | - | मॉडल वेरिएंट (वैकल्पिक ओवरराइड) |
| `backgroundType` | string | `"transparent"` | इनमें से एक: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | ठोस बैकग्राउंड के लिए Hex रंग |
| `gradientColor1` | string | - | पहला ग्रेडिएंट रंग |
| `gradientColor2` | string | - | दूसरा ग्रेडिएंट रंग |
| `gradientAngle` | number | - | डिग्री में ग्रेडिएंट कोण |
| `blurEnabled` | boolean | - | बैकग्राउंड ब्लर प्रभाव सक्षम करें |
| `blurIntensity` | number (0-100) | - | ब्लर तीव्रता |
| `shadowEnabled` | boolean | - | विषय पर ड्रॉप शैडो सक्षम करें |
| `shadowOpacity` | number (0-100) | - | शैडो अपारदर्शिता |
| `outputFormat` | string | - | आउटपुट प्रारूप: `png`, `webp`, या `avif` |
| `edgeRefine` | integer (0-3) | - | एज रिफाइनमेंट स्तर |
| `decontaminate` | boolean | - | किनारों से रंग रिसाव हटाएँ |

## बैकग्राउंड बदलना {#background-replace}

**टूल रूट:** `background-replace`  
**मॉडल:** rembg / BiRefNet (remove-background के साथ साझा)

बैकग्राउंड हटाता है और उसे ठोस रंग या ग्रेडिएंट से बदल देता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | बैकग्राउंड मोड |
| `color` | string | `"#ffffff"` | बैकग्राउंड hex रंग (जब `backgroundType` `color` हो) |
| `gradientColor1` | string | - | पहला ग्रेडिएंट hex रंग |
| `gradientColor2` | string | - | दूसरा ग्रेडिएंट hex रंग |
| `gradientAngle` | integer (0-360) | `180` | डिग्री में ग्रेडिएंट कोण |
| `feather` | integer (0-20) | `0` | एज फेदरिंग त्रिज्या |
| `format` | `"png"` \| `"webp"` | `"png"` | आउटपुट प्रारूप |

## बैकग्राउंड ब्लर {#blur-background}

**टूल रूट:** `blur-background`  
**मॉडल:** rembg / BiRefNet (remove-background के साथ साझा)

विषय को शार्प रखते हुए बैकग्राउंड को ब्लर करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | ब्लर तीव्रता |
| `feather` | integer (0-20) | `0` | एज फेदरिंग त्रिज्या |
| `format` | `"png"` \| `"webp"` | `"png"` | आउटपुट प्रारूप |

## इमेज अपस्केलिंग {#image-upscaling}

**टूल रूट:** `upscale`  
**मॉडल:** RealESRGAN (अनुपलब्ध होने पर Lanczos फ़ॉलबैक के साथ)

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `scale` | number | `2` | अपस्केल कारक |
| `model` | string | `"auto"` | मॉडल वेरिएंट |
| `faceEnhance` | boolean | `false` | GFPGAN फेस एन्हांसमेंट पास लागू करें |
| `denoise` | number | `0` | डीनॉइज़िंग शक्ति |
| `format` | string | `"auto"` | आउटपुट प्रारूप ओवरराइड |
| `quality` | number | `95` | आउटपुट गुणवत्ता (1-100) |

## OCR / टेक्स्ट निष्कर्षण {#ocr-text-extraction}

**टूल रूट:** `ocr`  
**मॉडल:** Tesseract (फास्ट), PaddleOCR PP-OCRv5 (संतुलित), PaddleOCR-VL 1.5 (सर्वश्रेष्ठ)

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | प्रसंस्करण स्तर |
| `language` | string | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | OCR सटीकता सुधारने के लिए इमेज को पूर्व-संसाधित करें |
| `engine` | string | - | अप्रचलित। `tesseract` को `fast`, `paddleocr` को `balanced` पर मैप करता है |

बाउंडिंग बॉक्स, कॉन्फ़िडेंस स्कोर, और निकाले गए टेक्स्ट ब्लॉक के साथ संरचित परिणाम लौटाता है।

## PDF OCR {#pdf-ocr}

**टूल रूट:** `ocr-pdf`  
**मॉडल:** इमेज OCR जैसी ही स्तर प्रणाली

AI-संचालित OCR का उपयोग करके स्कैन किए गए PDF दस्तावेज़ों से पृष्ठ दर पृष्ठ टेक्स्ट निकालता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | प्रसंस्करण स्तर |
| `language` | string | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | पृष्ठ चयन: `"all"`, `"1-3"`, `"1,3,5"` |

## फेस / PII ब्लर {#face-pii-blur}

**टूल रूट:** `blur-faces`  
**मॉडल:** MediaPipe फेस डिटेक्शन

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | गॉसियन ब्लर त्रिज्या |
| `sensitivity` | number (0-1) | `0.5` | डिटेक्शन कॉन्फ़िडेंस थ्रेशोल्ड |

## फेस एन्हांसमेंट {#face-enhancement}

**टूल रूट:** `enhance-faces`  
**मॉडल:** GFPGAN, CodeFormer

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | एन्हांसमेंट मॉडल |
| `strength` | number (0-1) | `0.8` | एन्हांसमेंट शक्ति |
| `sensitivity` | number (0-1) | `0.5` | फेस डिटेक्शन थ्रेशोल्ड |
| `onlyCenterFace` | boolean | `false` | केवल सबसे केंद्रीय फेस को एन्हांस करें |

## AI कलराइज़ेशन {#ai-colorization}

**टूल रूट:** `colorize`  
**मॉडल:** DDColor (OpenCV DNN फ़ॉलबैक के साथ)

ब्लैक-एंड-व्हाइट या ग्रेस्केल फोटो को पूर्ण रंग में बदलता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | रंग संतृप्ति शक्ति |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | मॉडल वेरिएंट |

## नॉइज़ हटाना {#noise-removal}

**टूल रूट:** `noise-removal`  
**मॉडल:** SCUNet (स्तरीय डीनॉइज़िंग पाइपलाइन)

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | प्रसंस्करण स्तर |
| `strength` | number (0-100) | `50` | डीनॉइज़िंग शक्ति |
| `detailPreservation` | number (0-100) | `50` | कितना विवरण संरक्षित करना है; अधिक होने पर अधिक टेक्सचर बना रहता है |
| `colorNoise` | number (0-100) | `30` | कलर नॉइज़ कमी शक्ति |
| `format` | string | `"original"` | आउटपुट प्रारूप: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | आउटपुट एन्कोडिंग गुणवत्ता |

## रेड आई हटाना {#red-eye-removal}

**टूल रूट:** `red-eye-removal`

फेस लैंडमार्क का पता लगाता है, आँख क्षेत्रों को खोजता है, और रेड-चैनल ओवरसैचुरेशन को ठीक करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | रेड पिक्सेल डिटेक्शन थ्रेशोल्ड |
| `strength` | number (0-100) | `70` | सुधार शक्ति |
| `format` | string | - | आउटपुट प्रारूप ओवरराइड (वैकल्पिक) |
| `quality` | number (1-100) | `90` | आउटपुट गुणवत्ता |

## फोटो रिस्टोरेशन {#photo-restoration}

**टूल रूट:** `restore-photo`

पुरानी या क्षतिग्रस्त फोटो के लिए बहु-चरण पाइपलाइन: स्क्रैच/फटने का पता लगाना और मरम्मत, फेस एन्हांसमेंट, डीनॉइज़िंग, और वैकल्पिक कलराइज़ेशन।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | स्क्रैच, फटने का पता लगाएँ और मरम्मत करें |
| `faceEnhancement` | boolean | `true` | फेस एन्हांसमेंट पास लागू करें |
| `fidelity` | number (0-1) | `0.7` | फेस एन्हांसमेंट शक्ति (अधिक = अधिक संरक्षी) |
| `denoise` | boolean | `true` | डीनॉइज़िंग पास लागू करें |
| `denoiseStrength` | number (0-100) | `25` | डीनॉइज़िंग शक्ति |
| `colorize` | boolean | `false` | रिस्टोरेशन के बाद कलराइज़ करें |
| `colorizeStrength` | number (0-100) | `85` | कलराइज़ेशन तीव्रता |

## पासपोर्ट फोटो {#passport-photo}

**टूल रूट:** `passport-photo`  
**मॉडल:** MediaPipe फेस लैंडमार्क + BiRefNet बैकग्राउंड हटाना

दो-चरण वर्कफ़्लो: विश्लेषण (फेस का पता लगाना + बैकग्राउंड हटाना) फिर जनरेट (क्रॉप, आकार बदलना, टाइल)। 6 क्षेत्रों में 37+ देशों का समर्थन करता है।

### चरण 1: विश्लेषण {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

एक इमेज फ़ाइल (multipart) स्वीकार करता है। फेस लैंडमार्क डेटा, एक base64 प्रीव्यू, और इमेज आयाम लौटाता है।

### चरण 2: जनरेट {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

चरण 1 के परिणामों के साथ-साथ जनरेशन सेटिंग्स वाला एक JSON बॉडी स्वीकार करता है:

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `jobId` | string | (आवश्यक) | चरण 1 से Job ID |
| `filename` | string | (आवश्यक) | चरण 1 से मूल फ़ाइल नाम |
| `countryCode` | string | (आवश्यक) | ISO देश कोड (जैसे, `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | दस्तावेज़ प्रकार |
| `bgColor` | string | `"#FFFFFF"` | बैकग्राउंड रंग hex |
| `printLayout` | string | `"none"` | प्रिंट लेआउट: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | KB में अधिकतम फ़ाइल आकार (0 = कोई सीमा नहीं) |
| `dpi` | number (72-1200) | `300` | आउटपुट DPI |
| `customWidthMm` | number | - | mm में कस्टम चौड़ाई (देश स्पेक को ओवरराइड करती है) |
| `customHeightMm` | number | - | mm में कस्टम ऊँचाई (देश स्पेक को ओवरराइड करती है) |
| `zoom` | number (0.5-3) | `1` | ज़ूम कारक |
| `adjustX` | number | `0` | क्षैतिज स्थिति समायोजन |
| `adjustY` | number | `0` | ऊर्ध्वाधर स्थिति समायोजन |
| `landmarks` | object | (आवश्यक) | चरण 1 से लैंडमार्क |
| `imageWidth` | number | (आवश्यक) | चरण 1 से इमेज चौड़ाई |
| `imageHeight` | number | (आवश्यक) | चरण 1 से इमेज ऊँचाई |

## ऑब्जेक्ट मिटाना (इनपेंटिंग) {#object-erasing-inpainting}

**टूल रूट:** `erase-object`  
**मॉडल:** ONNX Runtime के माध्यम से LaMa

मास्क को एक **दूसरे फ़ाइल भाग** (fieldname `mask`) के रूप में भेजा जाता है, base64 के रूप में नहीं। मास्क में सफेद पिक्सेल मिटाने वाले क्षेत्रों को इंगित करते हैं। `format` और `quality` सेटिंग्स शीर्ष-स्तरीय फ़ॉर्म फ़ील्ड के रूप में भेजी जाती हैं।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `file` | file | (आवश्यक) | स्रोत इमेज (multipart) |
| `mask` | file | (आवश्यक) | मास्क इमेज (multipart, fieldname `mask`, सफेद = मिटाएँ) |
| `format` | string | `"auto"` | आउटपुट प्रारूप: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | आउटपुट गुणवत्ता |

NVIDIA GPU उपलब्ध होने पर CUDA-त्वरित।

## AI कैनवास विस्तार {#ai-canvas-expand}

**टूल रूट:** `ai-canvas-expand`  
**मॉडल:** LaMa-आधारित आउटपेंटिंग

किसी इमेज के कैनवास को किसी भी दिशा में विस्तारित करता है और नए क्षेत्रों को AI-जनित सामग्री से भरता है जो मौजूदा इमेज से मेल खाती है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | शीर्ष पर विस्तारित करने के लिए पिक्सेल |
| `extendRight` | integer | `0` | दाईं ओर विस्तारित करने के लिए पिक्सेल |
| `extendBottom` | integer | `0` | नीचे विस्तारित करने के लिए पिक्सेल |
| `extendLeft` | integer | `0` | बाईं ओर विस्तारित करने के लिए पिक्सेल |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | गुणवत्ता स्तर |
| `format` | string | `"auto"` | आउटपुट प्रारूप: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | आउटपुट गुणवत्ता |

कम से कम एक विस्तार दिशा 0 से अधिक होनी चाहिए।

## स्मार्ट क्रॉप {#smart-crop}

**टूल रूट:** `smart-crop`  
**मॉडल:** MediaPipe फेस डिटेक्शन (केवल फेस मोड)

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | क्रॉप रणनीति: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | विषय मोड के लिए रणनीति |
| `width` | integer | - | आउटपुट चौड़ाई |
| `height` | integer | - | आउटपुट ऊँचाई |
| `padding` | integer (0-50) | `0` | विषय के चारों ओर पैडिंग प्रतिशत |
| `facePreset` | string | `"head-shoulders"` | `mode=face` होने पर प्रीसेट फ्रेमिंग |
| `sensitivity` | number (0-1) | `0.5` | फेस डिटेक्शन थ्रेशोल्ड |
| `threshold` | integer (0-255) | `30` | बैकग्राउंड डिटेक्शन थ्रेशोल्ड (ट्रिम मोड) |
| `padToSquare` | boolean | `false` | ट्रिम किए गए परिणाम को वर्ग में पैड करें |
| `padColor` | string | `"#ffffff"` | वर्ग पैडिंग के लिए बैकग्राउंड रंग |
| `targetSize` | integer | - | पैड किए गए आउटपुट के लिए लक्ष्य आकार (पिक्सेल) |
| `quality` | integer (1-100) | - | आउटपुट गुणवत्ता |

लेगेसी `mode` मान `attention` और `content` स्वीकार किए जाते हैं और क्रमशः `subject` और `trim` पर मैप किए जाते हैं।

**फेस प्रीसेट:**

| प्रीसेट | किसके लिए सर्वश्रेष्ठ |
|--------|---------|
| `closeup` | हेडशॉट |
| `head-shoulders` | प्रोफ़ाइल फोटो |
| `upper-body` | LinkedIn / औपचारिक |
| `half-body` | पूरा ऊपरी शरीर |

## ऑडियो ट्रांसक्राइब {#transcribe-audio}

**टूल रूट:** `transcribe-audio`  
**मॉडल:** faster-whisper

स्पीच को टेक्स्ट में बदलता है। सादा टेक्स्ट, SRT, और VTT आउटपुट प्रारूपों का समर्थन करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | आउटपुट प्रारूप |

## ऑटो सबटाइटल {#auto-subtitles}

**टूल रूट:** `auto-subtitles`  
**मॉडल:** faster-whisper (वीडियो से ऑडियो निकालता है, फिर ट्रांसक्राइब करता है)

किसी वीडियो के ऑडियो ट्रैक से सबटाइटल फ़ाइलें जनरेट करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | आउटपुट सबटाइटल प्रारूप |

## PNG ट्रांसपेरेंसी फिक्सर {#png-transparency-fixer}

**टूल रूट:** `transparency-fixer`  
**मॉडल:** BiRefNet HR-मैटिंग (2048x2048 रिज़ॉल्यूशन)

"नकली पारदर्शी" PNG को ठीक करता है जहाँ बैकग्राउंड हटा दिया गया था लेकिन फ्रिंजिंग, हेलो, या अर्ध-पारदर्शी आर्टिफैक्ट पीछे छूट गए। साफ अल्फा चैनल उत्पन्न करने के लिए BiRefNet के उच्च-रिज़ॉल्यूशन मैटिंग मॉडल का उपयोग करता है, फिर किनारों के साथ रंग संदूषण हटाने के लिए कॉन्फ़िगर करने योग्य डिफ्रिंज प्रसंस्करण लागू करता है।

**OOM फ़ॉलबैक शृंखला:** यदि BiRefNet HR-मैटिंग उपलब्ध मेमोरी से अधिक हो जाती है, तो टूल स्वतः `birefnet-general` पर, फिर `u2net` पर फ़ॉलबैक करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | रंग संदूषण हटाने के लिए एज डिफ्रिंज शक्ति |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | आउटपुट इमेज प्रारूप |
| `removeWatermark` | boolean | `false` | वॉटरमार्क हटाने की पूर्व-प्रसंस्करण लागू करें (median filter) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## वैकल्पिक AI क्षमताओं वाले टूल {#tools-with-optional-ai-capabilities}

निम्नलिखित टूल Python साइडकार टूल नहीं हैं लेकिन कुछ विकल्प सक्षम होने पर AI फ़ीचर का उपयोग करते हैं।

### इमेज एन्हांसमेंट {#image-enhancement}

**टूल रूट:** `image-enhancement`  
**इंजन:** विश्लेषण-आधारित (Sharp हिस्टोग्राम और सांख्यिकी)

इमेज का विश्लेषण करता है और एक्सपोज़र, कंट्रास्ट, व्हाइट बैलेंस, सैचुरेशन, शार्पनेस, और नॉइज़ के लिए स्वचालित सुधार लागू करता है। दृश्य-विशिष्ट मोड का समर्थन करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | सुधारों को ट्यून करने के लिए दृश्य मोड |
| `intensity` | number (0-100) | `50` | कुल सुधार शक्ति |
| `corrections.exposure` | boolean | `true` | एक्सपोज़र सुधार लागू करें |
| `corrections.contrast` | boolean | `true` | कंट्रास्ट सुधार लागू करें |
| `corrections.whiteBalance` | boolean | `true` | व्हाइट बैलेंस सुधार लागू करें |
| `corrections.saturation` | boolean | `true` | सैचुरेशन सुधार लागू करें |
| `corrections.sharpness` | boolean | `true` | शार्पनेस सुधार लागू करें |
| `corrections.denoise` | boolean | `true` | डीनॉइज़िंग लागू करें |
| `deepEnhance` | boolean | `false` | SCUNet के माध्यम से AI नॉइज़ हटाना सक्षम करें (`upscale-enhance` बंडल की आवश्यकता है) |

एक अतिरिक्त विश्लेषण एंडपॉइंट `POST /api/v1/tools/image/image-enhancement/analyze` पर उपलब्ध है जो पहचाने गए सुधार लागू किए बिना लौटाता है।

### सामग्री-जागरूक आकार बदलना (सीम कार्विंग) {#content-aware-resize-seam-carving}

**टूल रूट:** `content-aware-resize`  
**इंजन:** Go `caire` बाइनरी (Python नहीं; कोई GPU लाभ नहीं)

कम-ऊर्जा सीम हटाकर इमेज का बुद्धिमानी से आकार बदलता है, महत्वपूर्ण सामग्री को संरक्षित करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `width` | number | - | लक्ष्य चौड़ाई |
| `height` | number | - | लक्ष्य ऊँचाई |
| `protectFaces` | boolean | `false` | पहचाने गए फेस क्षेत्रों की रक्षा करें (`face-detection` बंडल की आवश्यकता है) |
| `blurRadius` | number (0-20) | `4` | ऊर्जा गणना के लिए पूर्व-ब्लर |
| `sobelThreshold` | number (1-20) | `2` | एज संवेदनशीलता थ्रेशोल्ड |
| `square` | boolean | `false` | वर्गाकार आउटपुट बाध्य करें |
