---
description: "सभी लोकल ML टूल्स के साथ AI इंजन संदर्भ। बैकग्राउंड हटाना, अपस्केलिंग, OCR, चेहरा पहचान, फोटो पुनर्स्थापन, और बहुत कुछ।"
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: b3bf5f6a40d1
---

# AI इंजन संदर्भ {#ai-engine-reference}

`@snapotter/ai` पैकेज सभी ML ऑपरेशनों के लिए Node.js को एक **स्थायी Python साइडकार** से जोड़ता है। तेज़ वार्म-स्टार्ट प्रदर्शन के लिए डिस्पैचर प्रक्रिया अनुरोधों के बीच सक्रिय रहती है। NVIDIA CUDA स्टार्टअप पर स्वतः पहचाना जाता है और उपलब्ध होने पर उपयोग किया जाता है; अन्यथा AI टूल्स CPU पर चलते हैं।

AI इन्फरेंस के लिए VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU त्वरण आज समर्थित नहीं है। किसी कंटेनर में `/dev/dri` को मैप करने से ये Python साइडकार टूल्स तब तक त्वरित नहीं होते जब तक कोई CUDA-सक्षम NVIDIA GPU उपलब्ध न हो।

चार मोडैलिटी (image, audio, video, document) में 19 Python साइडकार AI टूल्स, साथ ही वैकल्पिक AI क्षमताओं वाले 2 टूल। सभी मॉडल लोकल चलते हैं - प्रारंभिक मॉडल डाउनलोड के बाद इंटरनेट की आवश्यकता नहीं।

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

एक अलग "docs" डिस्पैचर प्रोफ़ाइल AI allowlist को दस्तावेज़-प्रोसेसिंग स्क्रिप्ट्स (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) से बदल देती है और भारी ML आयातों को छोड़ देती है।

**टाइमआउट:** डिफ़ॉल्ट 300 s; OCR और BiRefNet बैकग्राउंड हटाने को 600 s मिलते हैं।

## फ़ीचर बंडल {#feature-bundles}

प्रत्येक AI टूल को उपयोग से पहले एक मॉडल बंडल इंस्टॉल करने की आवश्यकता होती है। बंडल एडमिन UI या `install_feature.py` के माध्यम से मांग पर इंस्टॉल किए जाते हैं।

| बंडल | आकार | टूल्स |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

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
| `outputFormat` | string | - | आउटपुट फ़ॉर्मेट: `png`, `webp`, या `avif` |
| `edgeRefine` | integer (0-3) | - | किनारा परिष्करण स्तर |
| `decontaminate` | boolean | - | किनारों से रंग रिसाव हटाएँ |

## बैकग्राउंड बदलना {#background-replace}

**टूल रूट:** `background-replace`  
**मॉडल:** rembg / BiRefNet (remove-background के साथ साझा)

बैकग्राउंड हटाता है और उसे एक ठोस रंग या ग्रेडिएंट से बदल देता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | बैकग्राउंड मोड |
| `color` | string | `"#ffffff"` | बैकग्राउंड hex रंग (जब `backgroundType` `color` हो) |
| `gradientColor1` | string | - | पहला ग्रेडिएंट hex रंग |
| `gradientColor2` | string | - | दूसरा ग्रेडिएंट hex रंग |
| `gradientAngle` | integer (0-360) | `180` | डिग्री में ग्रेडिएंट कोण |
| `feather` | integer (0-20) | `0` | किनारा फेदरिंग त्रिज्या |
| `format` | `"png"` \| `"webp"` | `"png"` | आउटपुट फ़ॉर्मेट |

## बैकग्राउंड ब्लर {#blur-background}

**टूल रूट:** `blur-background`  
**मॉडल:** rembg / BiRefNet (remove-background के साथ साझा)

विषय को तीक्ष्ण रखते हुए बैकग्राउंड को ब्लर करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | ब्लर तीव्रता |
| `feather` | integer (0-20) | `0` | किनारा फेदरिंग त्रिज्या |
| `format` | `"png"` \| `"webp"` | `"png"` | आउटपुट फ़ॉर्मेट |

## इमेज अपस्केलिंग {#image-upscaling}

**टूल रूट:** `upscale`  
**मॉडल:** RealESRGAN (अनुपलब्ध होने पर Lanczos फ़ॉलबैक के साथ)

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `scale` | number | `2` | अपस्केल कारक |
| `model` | string | `"auto"` | मॉडल वेरिएंट |
| `faceEnhance` | boolean | `false` | GFPGAN चेहरा संवर्धन पास लागू करें |
| `denoise` | number | `0` | डीनॉइज़िंग शक्ति |
| `format` | string | `"auto"` | आउटपुट फ़ॉर्मेट ओवरराइड |
| `quality` | number | `95` | आउटपुट गुणवत्ता (1-100) |

## OCR / टेक्स्ट निष्कर्षण {#ocr-text-extraction}

**टूल रूट:** `ocr`  
**मॉडल:** Tesseract (तेज़), PaddleOCR PP-OCRv5 (संतुलित), PaddleOCR-VL 1.5 (सर्वोत्तम)

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | प्रोसेसिंग स्तर |
| `language` | string | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | OCR सटीकता सुधारने के लिए इमेज को प्री-प्रोसेस करें |
| `engine` | string | - | अप्रचलित। `tesseract` को `fast` और `paddleocr` को `balanced` पर मैप करता है |

बाउंडिंग बॉक्स, विश्वास स्कोर, और निकाले गए टेक्स्ट ब्लॉक के साथ संरचित परिणाम लौटाता है।

## PDF OCR {#pdf-ocr}

**टूल रूट:** `ocr-pdf`  
**मॉडल:** इमेज OCR के समान स्तर प्रणाली

AI-संचालित OCR का उपयोग करके स्कैन किए गए PDF दस्तावेज़ों से पृष्ठ दर पृष्ठ टेक्स्ट निकालता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | प्रोसेसिंग स्तर |
| `language` | string | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | पृष्ठ चयन: `"all"`, `"1-3"`, `"1,3,5"` |

## चेहरा / PII ब्लर {#face-pii-blur}

**टूल रूट:** `blur-faces`  
**मॉडल:** MediaPipe चेहरा पहचान

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | गॉसियन ब्लर त्रिज्या |
| `sensitivity` | number (0-1) | `0.5` | पहचान विश्वास सीमा |

## चेहरा संवर्धन {#face-enhancement}

**टूल रूट:** `enhance-faces`  
**मॉडल:** GFPGAN, CodeFormer

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | संवर्धन मॉडल |
| `strength` | number (0-1) | `0.8` | संवर्धन शक्ति |
| `sensitivity` | number (0-1) | `0.5` | चेहरा पहचान सीमा |
| `onlyCenterFace` | boolean | `false` | केवल सबसे केंद्रीय चेहरे को संवर्धित करें |

## AI रंगीकरण {#ai-colorization}

**टूल रूट:** `colorize`  
**मॉडल:** DDColor (OpenCV DNN फ़ॉलबैक के साथ)

श्वेत-श्याम या ग्रेस्केल तस्वीरों को पूर्ण रंग में परिवर्तित करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | रंग संतृप्ति शक्ति |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | मॉडल वेरिएंट |

## नॉइज़ हटाना {#noise-removal}

**टूल रूट:** `noise-removal`  
**मॉडल:** SCUNet (स्तरित डीनॉइज़िंग पाइपलाइन)

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | प्रोसेसिंग स्तर |
| `strength` | number (0-100) | `50` | डीनॉइज़िंग शक्ति |
| `detailPreservation` | number (0-100) | `50` | कितना विवरण संरक्षित करना है; अधिक होने पर अधिक बनावट बनी रहती है |
| `colorNoise` | number (0-100) | `30` | रंग नॉइज़ न्यूनीकरण शक्ति |
| `format` | string | `"original"` | आउटपुट फ़ॉर्मेट: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | आउटपुट एन्कोडिंग गुणवत्ता |

## लाल आँख हटाना {#red-eye-removal}

**टूल रूट:** `red-eye-removal`

चेहरे के लैंडमार्क पहचानता है, आँख क्षेत्रों का पता लगाता है, और लाल-चैनल अति-संतृप्ति को ठीक करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | लाल पिक्सेल पहचान सीमा |
| `strength` | number (0-100) | `70` | सुधार शक्ति |
| `format` | string | - | आउटपुट फ़ॉर्मेट ओवरराइड (वैकल्पिक) |
| `quality` | number (1-100) | `90` | आउटपुट गुणवत्ता |

## फोटो पुनर्स्थापन {#photo-restoration}

**टूल रूट:** `restore-photo`

पुरानी या क्षतिग्रस्त तस्वीरों के लिए बहु-चरण पाइपलाइन: खरोंच/फटन पहचान और मरम्मत, चेहरा संवर्धन, डीनॉइज़िंग, और वैकल्पिक रंगीकरण।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | खरोंच, फटन का पता लगाएँ और मरम्मत करें |
| `faceEnhancement` | boolean | `true` | चेहरा संवर्धन पास लागू करें |
| `fidelity` | number (0-1) | `0.7` | चेहरा संवर्धन शक्ति (अधिक = अधिक रूढ़िवादी) |
| `denoise` | boolean | `true` | डीनॉइज़िंग पास लागू करें |
| `denoiseStrength` | number (0-100) | `25` | डीनॉइज़िंग शक्ति |
| `colorize` | boolean | `false` | पुनर्स्थापन के बाद रंगीकरण करें |
| `colorizeStrength` | number (0-100) | `85` | रंगीकरण तीव्रता |

## पासपोर्ट फोटो {#passport-photo}

**टूल रूट:** `passport-photo`  
**मॉडल:** MediaPipe चेहरा लैंडमार्क + BiRefNet बैकग्राउंड हटाना

दो-चरण वर्कफ़्लो: विश्लेषण (चेहरा पहचानें + बैकग्राउंड हटाएँ) फिर जनरेट (क्रॉप, आकार बदलें, टाइल)। 6 क्षेत्रों में 37+ देशों का समर्थन करता है।

### चरण 1: विश्लेषण {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

एक इमेज फ़ाइल स्वीकार करता है (multipart)। चेहरा लैंडमार्क डेटा, एक base64 पूर्वावलोकन, और इमेज आयाम लौटाता है।

### चरण 2: जनरेट {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

चरण 1 परिणामों के साथ-साथ जनरेशन सेटिंग्स वाला एक JSON बॉडी स्वीकार करता है:

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `jobId` | string | (आवश्यक) | चरण 1 से जॉब ID |
| `filename` | string | (आवश्यक) | चरण 1 से मूल फ़ाइल नाम |
| `countryCode` | string | (आवश्यक) | ISO देश कोड (जैसे, `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | दस्तावेज़ प्रकार |
| `bgColor` | string | `"#FFFFFF"` | बैकग्राउंड रंग hex |
| `printLayout` | string | `"none"` | प्रिंट लेआउट: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | KB में अधिकतम फ़ाइल आकार (0 = कोई सीमा नहीं) |
| `dpi` | number (72-1200) | `300` | आउटपुट DPI |
| `customWidthMm` | number | - | mm में कस्टम चौड़ाई (देश विनिर्देश को ओवरराइड करती है) |
| `customHeightMm` | number | - | mm में कस्टम ऊँचाई (देश विनिर्देश को ओवरराइड करती है) |
| `zoom` | number (0.5-3) | `1` | ज़ूम कारक |
| `adjustX` | number | `0` | क्षैतिज स्थिति समायोजन |
| `adjustY` | number | `0` | ऊर्ध्वाधर स्थिति समायोजन |
| `landmarks` | object | (आवश्यक) | चरण 1 से लैंडमार्क |
| `imageWidth` | number | (आवश्यक) | चरण 1 से इमेज चौड़ाई |
| `imageHeight` | number | (आवश्यक) | चरण 1 से इमेज ऊँचाई |

## ऑब्जेक्ट मिटाना (इनपेंटिंग) {#object-erasing-inpainting}

**टूल रूट:** `erase-object`  
**मॉडल:** ONNX Runtime के माध्यम से LaMa

मास्क को base64 के रूप में नहीं, बल्कि एक **दूसरे फ़ाइल भाग** (fieldname `mask`) के रूप में भेजा जाता है। मास्क में सफेद पिक्सेल मिटाने वाले क्षेत्रों को इंगित करते हैं। `format` और `quality` सेटिंग्स शीर्ष-स्तरीय फ़ॉर्म फ़ील्ड के रूप में भेजी जाती हैं।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `file` | file | (आवश्यक) | स्रोत इमेज (multipart) |
| `mask` | file | (आवश्यक) | मास्क इमेज (multipart, fieldname `mask`, सफेद = मिटाएँ) |
| `format` | string | `"auto"` | आउटपुट फ़ॉर्मेट: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | आउटपुट गुणवत्ता |

NVIDIA GPU उपलब्ध होने पर CUDA-त्वरित।

## AI कैनवास विस्तार {#ai-canvas-expand}

**टूल रूट:** `ai-canvas-expand`  
**मॉडल:** LaMa-आधारित आउटपेंटिंग

एक इमेज के कैनवास को किसी भी दिशा में विस्तारित करता है और नए क्षेत्रों को मौजूदा इमेज से मेल खाने वाली AI-जनित सामग्री से भरता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | शीर्ष पर विस्तारित करने के लिए पिक्सेल |
| `extendRight` | integer | `0` | दाईं ओर विस्तारित करने के लिए पिक्सेल |
| `extendBottom` | integer | `0` | नीचे विस्तारित करने के लिए पिक्सेल |
| `extendLeft` | integer | `0` | बाईं ओर विस्तारित करने के लिए पिक्सेल |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | गुणवत्ता स्तर |
| `format` | string | `"auto"` | आउटपुट फ़ॉर्मेट: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | आउटपुट गुणवत्ता |

कम से कम एक विस्तार दिशा 0 से अधिक होनी चाहिए।

## स्मार्ट क्रॉप {#smart-crop}

**टूल रूट:** `smart-crop`  
**मॉडल:** MediaPipe चेहरा पहचान (केवल चेहरा मोड)

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | क्रॉप रणनीति: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | विषय मोड के लिए रणनीति |
| `width` | integer | - | आउटपुट चौड़ाई |
| `height` | integer | - | आउटपुट ऊँचाई |
| `padding` | integer (0-50) | `0` | विषय के चारों ओर पैडिंग प्रतिशत |
| `facePreset` | string | `"head-shoulders"` | `mode=face` होने पर प्रीसेट फ़्रेमिंग |
| `sensitivity` | number (0-1) | `0.5` | चेहरा पहचान सीमा |
| `threshold` | integer (0-255) | `30` | बैकग्राउंड पहचान सीमा (ट्रिम मोड) |
| `padToSquare` | boolean | `false` | ट्रिम किए गए परिणाम को वर्ग में पैड करें |
| `padColor` | string | `"#ffffff"` | वर्ग पैडिंग के लिए बैकग्राउंड रंग |
| `targetSize` | integer | - | पैड किए गए आउटपुट के लिए लक्ष्य आकार (पिक्सेल) |
| `quality` | integer (1-100) | - | आउटपुट गुणवत्ता |

लिगेसी `mode` मान `attention` और `content` स्वीकार किए जाते हैं और क्रमशः `subject` और `trim` पर मैप किए जाते हैं।

**चेहरा प्रीसेट:**

| प्रीसेट | सर्वोत्तम उपयोग |
|--------|---------|
| `closeup` | हेडशॉट |
| `head-shoulders` | प्रोफ़ाइल तस्वीरें |
| `upper-body` | LinkedIn / औपचारिक |
| `half-body` | पूरा ऊपरी शरीर |

## ऑडियो ट्रांसक्राइब {#transcribe-audio}

**टूल रूट:** `transcribe-audio`  
**मॉडल:** faster-whisper

भाषण को टेक्स्ट में परिवर्तित करता है। सादा टेक्स्ट, SRT, और VTT आउटपुट फ़ॉर्मेट का समर्थन करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | आउटपुट फ़ॉर्मेट |

## ऑटो सबटाइटल {#auto-subtitles}

**टूल रूट:** `auto-subtitles`  
**मॉडल:** faster-whisper (वीडियो से ऑडियो निकालता है, फिर ट्रांसक्राइब करता है)

एक वीडियो के ऑडियो ट्रैक से सबटाइटल फ़ाइलें जनरेट करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | भाषा: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | आउटपुट सबटाइटल फ़ॉर्मेट |

## PNG पारदर्शिता फिक्सर {#png-transparency-fixer}

**टूल रूट:** `transparency-fixer`  
**मॉडल:** BiRefNet HR-matting (2048x2048 रिज़ॉल्यूशन)

"नकली पारदर्शी" PNG को ठीक करता है जहाँ बैकग्राउंड हटा दिया गया था लेकिन फ़्रिंजिंग, हेलो, या अर्ध-पारदर्शी आर्टिफैक्ट पीछे छूट गए। एक साफ़ अल्फा चैनल बनाने के लिए BiRefNet के उच्च-रिज़ॉल्यूशन मैटिंग मॉडल का उपयोग करता है, फिर किनारों के साथ रंग संदूषण हटाने के लिए कॉन्फ़िगर करने योग्य डीफ्रिंज प्रोसेसिंग लागू करता है।

**OOM फ़ॉलबैक श्रृंखला:** यदि BiRefNet HR-matting उपलब्ध मेमोरी से अधिक हो जाता है, तो टूल स्वतः `birefnet-general` पर, फिर `u2net` पर फ़ॉलबैक करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | रंग संदूषण हटाने के लिए किनारा डीफ्रिंज शक्ति |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | आउटपुट इमेज फ़ॉर्मेट |
| `removeWatermark` | boolean | `false` | वॉटरमार्क हटाने की प्री-प्रोसेसिंग लागू करें (मीडियन फ़िल्टर) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## वैकल्पिक AI क्षमताओं वाले टूल्स {#tools-with-optional-ai-capabilities}

निम्नलिखित टूल Python साइडकार टूल नहीं हैं लेकिन कुछ विकल्प सक्षम होने पर AI सुविधाओं का उपयोग करते हैं।

### इमेज संवर्धन {#image-enhancement}

**टूल रूट:** `image-enhancement`  
**इंजन:** विश्लेषण-आधारित (Sharp हिस्टोग्राम और सांख्यिकी)

इमेज का विश्लेषण करता है और एक्सपोज़र, कंट्रास्ट, व्हाइट बैलेंस, संतृप्ति, तीक्ष्णता, और नॉइज़ के लिए स्वचालित सुधार लागू करता है। दृश्य-विशिष्ट मोड का समर्थन करता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | सुधारों को ट्यून करने के लिए दृश्य मोड |
| `intensity` | number (0-100) | `50` | समग्र सुधार शक्ति |
| `corrections.exposure` | boolean | `true` | एक्सपोज़र सुधार लागू करें |
| `corrections.contrast` | boolean | `true` | कंट्रास्ट सुधार लागू करें |
| `corrections.whiteBalance` | boolean | `true` | व्हाइट बैलेंस सुधार लागू करें |
| `corrections.saturation` | boolean | `true` | संतृप्ति सुधार लागू करें |
| `corrections.sharpness` | boolean | `true` | तीक्ष्णता सुधार लागू करें |
| `corrections.denoise` | boolean | `true` | डीनॉइज़िंग लागू करें |
| `deepEnhance` | boolean | `false` | SCUNet के माध्यम से AI नॉइज़ हटाना सक्षम करें (`upscale-enhance` बंडल आवश्यक) |

`POST /api/v1/tools/image/image-enhancement/analyze` पर एक अतिरिक्त विश्लेषण एंडपॉइंट उपलब्ध है जो लागू किए बिना पहचाने गए सुधार लौटाता है।

### सामग्री-सचेत आकार परिवर्तन (सीम कार्विंग) {#content-aware-resize-seam-carving}

**टूल रूट:** `content-aware-resize`  
**इंजन:** Go `caire` बाइनरी (Python नहीं - कोई GPU लाभ नहीं)

महत्वपूर्ण सामग्री को संरक्षित करते हुए, कम-ऊर्जा वाली सीम हटाकर इमेज का बुद्धिमानी से आकार बदलता है।

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `width` | number | - | लक्ष्य चौड़ाई |
| `height` | number | - | लक्ष्य ऊँचाई |
| `protectFaces` | boolean | `false` | पहचाने गए चेहरा क्षेत्रों की रक्षा करें (`face-detection` बंडल आवश्यक) |
| `blurRadius` | number (0-20) | `4` | ऊर्जा गणना के लिए प्री-ब्लर |
| `sobelThreshold` | number (1-20) | `2` | किनारा संवेदनशीलता सीमा |
| `square` | boolean | `false` | वर्गाकार आउटपुट बाध्य करें |
