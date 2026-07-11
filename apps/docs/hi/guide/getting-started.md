---
description: "SnapOtter को एक ही कमांड में Docker के साथ इंस्टॉल करें। इसमें Docker Compose सेटअप, सोर्स से बिल्ड करना, और एक पूर्ण फ़ीचर अवलोकन शामिल है।"
i18n_source_hash: 4536d4558b8e
i18n_provenance: machine
i18n_output_hash: bc1ecfa22bef
---

# Getting Started {#getting-started}

::: tip इंस्टॉल करने से पहले आज़माएँ
[demo.snapotter.com](https://demo.snapotter.com) पर पूरा UI एक्सप्लोर करें, कोई साइनअप या इंस्टॉल आवश्यक नहीं।
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

यह एकल कंटेनर वह सब कुछ चलाता है जिसकी उसे ज़रूरत है: बिना कोई `DATABASE_URL` सेट किए, यह लूपबैक इंटरफ़ेस पर अपना खुद का PostgreSQL और Redis शुरू करता है (एंबेडेड मोड) और सारा डेटा `SnapOtter-data` वॉल्यूम में रखता है। यह SnapOtter को आज़माने या किसी homelab पर सेल्फ़-होस्ट करने का सबसे तेज़ तरीका है। प्रोडक्शन के लिए, नीचे दिया गया [Docker Compose](#docker-compose) स्टैक चलाएँ, जो PostgreSQL और Redis को उनके अपने कंटेनरों में रखता है। एंबेडेड मोड root के रूप में चलता है (डिफ़ॉल्ट) और जैसे ही आप `DATABASE_URL` सेट करते हैं, यह स्वचालित रूप से बंद हो जाता है।

पहले लॉगिन पर आपसे अपना पासवर्ड बदलने को कहा जाएगा।

::: tip अनाम उत्पाद एनालिटिक्स
SnapOtter में डिफ़ॉल्ट रूप से अनाम उत्पाद एनालिटिक्स शामिल है। इसे बंद करने के लिए, **Settings → System → Privacy** खोलें और **Anonymous Product Analytics** को बंद कर दें। यह पूरे इंस्टेंस के लिए तुरंत रुक जाता है।

आप किसी रीबिल्ड के बिना इंस्टेंस के लिए सभी टेलीमेट्री अक्षम करने के लिए एनवायरनमेंट वेरिएबल `SNAPOTTER_TELEMETRY=0` भी सेट कर सकते हैं (`false` और `off` भी काम करते हैं)।

त्रुटि मॉनिटरिंग [Sentry](https://sentry.io) द्वारा संचालित है, जो अपने ओपन-सोर्स प्रोग्राम के माध्यम से SnapOtter को प्रायोजित करता है।

क्या संग्रहीत किया जाता है इसके विवरण के लिए, [SnapOtter क्या संग्रहीत करता है](/hi/guide/telemetry) देखें।
:::

::: tip NVIDIA CUDA त्वरण
NVIDIA CUDA-त्वरित बैकग्राउंड हटाने, अपस्केलिंग, OCR, फ़ेस एन्हांसमेंट, और रीस्टोरेशन के लिए `--gpus all` जोड़ें:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) आवश्यक है। CUDA अनुपलब्ध होने पर स्वचालित रूप से CPU पर फ़ॉलबैक करता है। VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU त्वरण आज AI इन्फ़रेंस के लिए सपोर्ट नहीं किया जाता। बेंचमार्क के लिए [Docker Tags](/hi/guide/docker-tags) देखें।
:::

::: details GHCR पर भी
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

दोनों रजिस्ट्री हर रिलीज़ पर वही इमेज प्रकाशित करती हैं।
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

सभी एनवायरनमेंट वेरिएबल के लिए [Configuration](/hi/guide/configuration) देखें।

## Build from Source {#build-from-source}

**पूर्वापेक्षाएँ:** Node.js 22+, pnpm 9+, Docker (Postgres + Redis के लिए), Python 3.10+ (AI फ़ीचर के लिए), Git।

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- फ़्रंटएंड: [http://localhost:1349](http://localhost:1349)
- बैकएंड: [http://localhost:13490](http://localhost:13490)

## What You Can Do {#what-you-can-do}

### File Processing (200+ Tools) {#file-processing-200-tools}

| मोडैलिटी | संख्या | उदाहरण टूल |
|----------|-------|---------------|
| **Image** | 105 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, format presets |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, format presets |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, format presets |
| **PDF / Document** | 42 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Files** | 10 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

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
