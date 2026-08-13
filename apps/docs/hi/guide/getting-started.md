---
description: "SnapOtter को एक ही कमांड में Docker के साथ इंस्टॉल करें। इसमें Docker Compose सेटअप, सोर्स से बिल्ड करना, और एक पूर्ण फ़ीचर अवलोकन शामिल है।"
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 16dd84c66bc6
i18n_hash_version: 2
---

# Getting Started {#getting-started}

::: tip इंस्टॉल करने से पहले आज़माएँ
[demo.snapotter.com](https://demo.snapotter.com) पर पूरा UI एक्सप्लोर करें, कोई साइनअप या इंस्टॉल आवश्यक नहीं।
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

यह एकल कंटेनर वह सब कुछ चलाता है जिसकी उसे आवश्यकता होती है: बिना किसी `DATABASE_URL` सेट के, यह लूपबैक इंटरफ़ेस (एम्बेडेड मोड) पर अपना स्वयं का PostgreSQL और Redis शुरू करता है और सभी डेटा को `SnapOtter-data` वॉल्यूम में रखता है। यह होमलैब पर SnapOtter या सेल्फ-होस्ट आज़माने का सबसे तेज़ तरीका है। उत्पादन के लिए, [कैनोनिकल डॉकर कंपोज़ स्टैक](#docker-compose) का उपयोग करें, जो PostgreSQL और Redis को अपने कंटेनर में रखता है। एंबेडेड मोड रूट (डिफ़ॉल्ट) के रूप में चलता है और जैसे ही आप `DATABASE_URL` सेट करते हैं तो स्वचालित रूप से बंद हो जाता है।

Raspberry Pi, किसी पुराने लैपटॉप, या छोटे VPS पर इंस्टॉल कर रहे हैं? ट्यून की गई वॉकथ्रू और सीमित हार्डवेयर से क्या अपेक्षा करें, इसके लिए [कम संसाधन वाले सेटअप](/hi/guide/low-resource) देखें।

पहले लॉगिन पर आपसे अपना पासवर्ड बदलने को कहा जाएगा।

::: tip अनाम उत्पाद एनालिटिक्स
SnapOtter में डिफ़ॉल्ट रूप से अनाम उत्पाद एनालिटिक्स शामिल है। इसे बंद करने के लिए, **Settings → System → Privacy** खोलें और **Anonymous Product Analytics** को बंद कर दें। यह पूरे इंस्टेंस के लिए तुरंत रुक जाता है।

आप किसी रीबिल्ड के बिना इंस्टेंस के लिए सभी टेलीमेट्री अक्षम करने के लिए एनवायरनमेंट वेरिएबल `SNAPOTTER_TELEMETRY=0` भी सेट कर सकते हैं (`false` और `off` भी काम करते हैं)।

त्रुटि मॉनिटरिंग [Sentry](https://sentry.io) द्वारा संचालित है, जो अपने ओपन-सोर्स प्रोग्राम के माध्यम से SnapOtter को प्रायोजित करता है।

क्या संग्रहीत किया जाता है इसके विवरण के लिए, [SnapOtter क्या संग्रहीत करता है](/hi/guide/telemetry) देखें।
:::

::: tip NVIDIA CUDA त्वरण
NVIDIA CUDA-त्वरित पृष्ठभूमि हटाने, अपस्केलिंग, चेहरा निखारने और बहाली के लिए `--gpus all` जोड़ें। OCR सीपीयू-आधारित रहता है और GPU एक्सेस के साथ या उसके बिना एक ही छवि में काम करता है:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA कंटेनर टूलकिट](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) की आवश्यकता है। CUDA अनुपलब्ध होने पर स्वचालित रूप से CPU पर वापस आ जाता है। वीए-एपीआई, क्विक सिंक या ओपनसीएल के माध्यम से इंटेल/एएमडी आईजीपीयू त्वरण आज एआई अनुमान के लिए समर्थित नहीं है। बेंचमार्क के लिए [डॉकर टैग](/hi/guide/docker-tags) देखें। यदि `--gpus all` के बावजूद AI उपकरण CPU पर चलते हैं, तो [GPU त्वरण सत्यापित करें](/hi/guide/deployment#verify-gpu-acceleration) देखें।
:::

::: details GHCR पर भी
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

दोनों रजिस्ट्री हर रिलीज़ पर वही इमेज प्रकाशित करती हैं।
:::

## डॉकर कंपोज़ {#docker-compose}

इस पृष्ठ से संक्षिप्त कंपोज़ उदाहरण की प्रतिलिपि बनाने के बजाय प्रत्येक रिलीज़ के साथ बनाए और परीक्षण की गई उत्पादन फ़ाइल का उपयोग करें:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

कैनोनिकल [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) में सभी चार रनटाइम वॉल्यूम, स्वास्थ्य जांच, संसाधन सीमाएं, टिकाऊ रेडिस कॉन्फ़िगरेशन, पिन किए गए डेटाबेस/कैश छवियां और वर्तमान कंटेनर हार्डनिंग शामिल हैं। प्रथम लॉगिन के तुरंत बाद डिफ़ॉल्ट एडमिन पासवर्ड बदलें। प्रतिलिपि प्रस्तुत करने योग्य परिनियोजन के लिए, `latest` का अनुसरण करने के बजाय SnapOtter एप्लिकेशन छवि को रिलीज़ टैग पर पिन करें या आपके द्वारा सत्यापित डाइजेस्ट करें।

सभी पर्यावरण चर के लिए [कॉन्फ़िगरेशन](/hi/guide/configuration) और रहस्यों, नेटवर्क नीति और बैकअप मार्गदर्शन के लिए [सुरक्षा और हार्डनिंग](/hi/guide/security) देखें।

## Build from Source {#build-from-source}

**पूर्वापेक्षाएँ:** Node.js 22.22+, pnpm 9+, Docker (Postgres + Redis के लिए), Python 3.11+ (AI फ़ीचर के लिए), Git।

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- फ़्रंटएंड: [http://localhost:1351](http://localhost:1351)
- बैकएंड: [http://localhost:13490](http://localhost:13490)

## What You Can Do {#what-you-can-do}

### File Processing (200+ Tools) {#file-processing-200-tools}

| मोडैलिटी | संख्या | उदाहरण टूल |
|----------|-------|---------------|
| **Image** | 107 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, format presets |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, format presets |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, format presets |
| **PDF / Document** | 29 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Files** | 23 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipelines {#pipelines}

टूलों को बहु-चरणीय वर्कफ़्लो में जोड़ें और उन्हें एक इमेज या पूरे बैच पर लागू करें:

1. साइडबार में **Pipelines** खोलें।
2. चरण जोड़ें (कोई भी टूल, कोई भी सेटिंग)।
3. एक अकेली फ़ाइल पर चलाएँ, या एक साथ पूरे बैच पर।
4. बाद में पुनः उपयोग के लिए पाइपलाइन सहेजें।

पाइपलाइन डिफ़ॉल्ट रूप से 20 चरणों की अनुमति देती हैं। सीमा को असीमित करने के लिए `MAX_PIPELINE_STEPS=0` सेट करें।

### File Library {#file-library}

आप जो भी फ़ाइल प्रोसेस करते हैं उसे अपनी **Files** लाइब्रेरी में सहेजा जा सकता है। SnapOtter पूरा वर्शन इतिहास ट्रैक करता है ताकि आप मूल अपलोड से अंतिम आउटपुट तक हर प्रोसेसिंग चरण का पता लगा सकें।

सहेजना स्पष्ट है: लाइब्रेरी में सहेजे गए परिणाम तब तक रखे जाते हैं जब तक आप उन्हें हटा नहीं देते, जबकि आप जिन परिणामों को प्रोसेस करते हैं और असहेजे छोड़ देते हैं वे 72 घंटे बाद स्वचालित रूप से साफ़ कर दिए जाते हैं (`FILE_MAX_AGE_HOURS` के माध्यम से कॉन्फ़िगर करने योग्य)।

### REST API & API Keys {#rest-api-api-keys}

हर टूल HTTP के माध्यम से सुलभ है:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**Settings → API Keys** के अंतर्गत API कुंजियाँ उत्पन्न करें। सभी एंडपॉइंट के लिए [REST API reference](/hi/api/rest) देखें, या इंटरैक्टिव संदर्भ के लिए [http://localhost:1349/api/docs](http://localhost:1349/api/docs) पर जाएँ।

### Multi-User & Teams {#multi-user-teams}

रोल-आधारित एक्सेस नियंत्रण के साथ अनेक उपयोगकर्ता सक्षम करें:

- **Admin**: पूर्ण एक्सेस, उपयोगकर्ता, टीम, सेटिंग्स, सभी फ़ाइलें/पाइपलाइन/API कुंजियाँ प्रबंधित करें
- **User**: टूल उपयोग करें, अपनी फ़ाइलें/पाइपलाइन/API कुंजियाँ प्रबंधित करें

उपयोगकर्ताओं को समूहित करने के लिए **Settings → Teams** के अंतर्गत टीम बनाएँ।

`AUTH_ENABLED=true` सेट करें (या बिना लॉगिन के एकल-उपयोगकर्ता/स्व-उपयोग के लिए `false`)।

## अपने फ़ोन से इस्तेमाल करें {#use-it-from-your-phone}

SnapOtter मोबाइल ब्राउज़र में चलता है, और आप इसे ऐप की तरह इंस्टॉल कर सकते हैं। फ़ोन पर अपना इंस्टेंस खोलें, फिर:

- **iPhone / iPad (Safari)**: शेयर बटन पर टैप करें, फिर **होम स्क्रीन में जोड़ें** पर टैप करें।
- **Android (Chrome)**: ब्राउज़र मेनू खोलें और **ऐप इंस्टॉल करें** पर टैप करें।

इंस्टॉल किया गया ऐप अपनी अलग विंडो में खुलता है, सीधे आपके इंस्टेंस पर।

एक बात ध्यान रखें: ब्राउज़र इंस्टॉल का विकल्प केवल HTTPS पर ही दिखाते हैं। आपके LAN पर सादा HTTP पता ब्राउज़र टैब में ठीक चलता है; असली इंस्टॉल के लिए इंस्टेंस को सर्टिफ़िकेट वाले रिवर्स प्रॉक्सी के पीछे रखें ([डिप्लॉयमेंट गाइड](/hi/guide/deployment) देखें)।

फ़ोन और टैबलेट पर, इमेज टूल अपलोड बटन के बगल में **फ़ोटो लें** बटन दिखाते हैं। कोई रसीद या व्हाइटबोर्ड की फ़ोटो खींचें, और वह सीधे टूल में पहुँच जाती है।
