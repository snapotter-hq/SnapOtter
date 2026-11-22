---
description: "SnapOtter को Docker के साथ एक ही कमांड में इंस्टॉल करें, साइन इन करें और अपना पहला tool खोलें। इसमें GPU acceleration, छोटी मशीनें, Docker Compose और source से build शामिल हैं।"
i18n_source_hash: c2aae540add0
i18n_provenance: machine
i18n_output_hash: 8899ab6fa908
i18n_hash_version: 2
---

# शुरू करें {#getting-started}

::: tip इंस्टॉल करने से पहले आज़माएँ
[demo.snapotter.com](https://demo.snapotter.com) पर पूरा UI देखें, किसी signup या इंस्टॉलेशन की ज़रूरत नहीं।
:::

## Quick Start {#quick-start}

एक कमांड चलाएँ:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

फिर [http://localhost:1349](http://localhost:1349) खोलें और `admin` / `admin` से साइन इन करें। पहली बार login करने पर आपसे पासवर्ड बदलने को कहा जाएगा।

अब कोई tool खोलें। Sidebar से एक चुनें, या सीधे [Resize](http://localhost:1349/image/resize) पर जाएँ, कोई image डालें और नतीजा डाउनलोड करें।

बस, इंस्टॉल पूरा। यह एक container वह सब कुछ चलाता है जिसकी उसे ज़रूरत है: [`DATABASE_URL`](/hi/guide/configuration#env-database-url) सेट न होने पर यह loopback interface पर अपना PostgreSQL और Redis शुरू करता है (embedded मोड) और सारा डेटा `SnapOtter-data` volume में रखता है। SnapOtter को आज़माने या homelab पर self-host करने का यह सबसे तेज़ तरीका है। Embedded मोड root के रूप में चलता है (डिफ़ॉल्ट) और `DATABASE_URL` सेट करते ही अपने आप बंद हो जाता है। Production के लिए [Docker Compose stack](#docker-compose) का उपयोग करें, जिसमें PostgreSQL और Redis अपने अलग containers में रहते हैं।

जॉब के नतीजे डेटा वॉल्यूम में नहीं रखे जाते, इसलिए कंटेनर बदलने पर (जैसे इमेज अपग्रेड के समय) वे गायब हो जाते हैं और उनके डाउनलोड लिंक काम करना बंद कर देते हैं। डिप्लॉयमेंट गाइड का [जॉब आउटपुट सुरक्षित रखना](/hi/guide/deployment#keeping-job-output) सेक्शन बताता है कि उन्हें कैसे सुरक्षित रखें।

::: tip 4 GB या उससे कम RAM पर चलाना
Raspberry Pi, पुराने laptop, या छोटे VPS पर एक समय में एक ही job चलाएँ, ऊपर की कमांड में `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` जोड़कर image thread pool की सीमा तय करें, और भारी AI bundles छोड़ दें। [Low-Resource Setups](/hi/guide/low-resource#tuning-knobs) में बाकी वे सीमाएँ दी गई हैं जिन्हें सेट करना फ़ायदेमंद है, और यह भी कि सीमित hardware से क्या उम्मीद रखें।
:::

::: tip गुमनाम Product Analytics
SnapOtter में डिफ़ॉल्ट रूप से गुमनाम product analytics शामिल हैं। इसे बंद करने के लिए **Settings → System → Privacy** खोलें और **Anonymous Product Analytics** बंद करें। यह पूरे instance के लिए तुरंत बंद हो जाता है।

आप environment variable `SNAPOTTER_TELEMETRY=0` भी सेट कर सकते हैं (`false` और `off` भी काम करते हैं), जिससे बिना rebuild के instance की सारी telemetry बंद हो जाती है।

Error monitoring [Sentry](https://sentry.io) द्वारा संचालित है, जो अपने open-source प्रोग्राम के ज़रिए SnapOtter को स्पॉन्सर करता है।

क्या एकत्र किया जाता है, इसकी जानकारी के लिए [SnapOtter क्या एकत्र करता है](/hi/guide/telemetry) देखें।
:::

## GPU Acceleration {#gpu-acceleration}

NVIDIA GPU भारी AI tools को काफ़ी तेज़ कर देता है: upscaling (लगभग 47 गुना), face enhancement (लगभग 12 गुना), transcription, और background removal (हर एक लगभग 4 गुना)। OCR, face detection, और photo restoration CPU-आधारित ही रहते हैं, इसलिए GPU से उन्हें मदद नहीं मिलती। दोनों के लिए वही image काम करती है; `--gpus all` जोड़ें:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

इसके लिए host पर [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) आवश्यक है। CUDA न होने पर SnapOtter अपने आप CPU पर चला जाता है। VA-API, Quick Sync, या OpenCL के ज़रिए Intel/AMD iGPU acceleration फ़िलहाल AI inference के लिए समर्थित नहीं है।

- [Hardware Requirements](/hi/guide/deployment#full-ai-tools-on-nvidia-cuda) में GPU और CPU के पूरे timings हैं, और [Docker Image benchmarks](/hi/guide/docker-tags#benchmarks) में warm और cold-start के आँकड़े।
- यदि AI tools फिर भी CPU पर चलते हैं, तो [GPU acceleration सत्यापित करें](/hi/guide/deployment#verify-gpu-acceleration) देखें।
- Compose के लिए Deployment गाइड का [NVIDIA CUDA Quick Start](/hi/guide/deployment#quick-start-nvidia-cuda) उपयोग करें।

## इंस्टॉल करने के अन्य तरीके {#other-ways-to-install}

### Compose के साथ Single Container {#single-container-compose}

Quick Start वाला ही embedded-mode container, जिसे Compose फ़ाइल के रूप में लिखा गया है ताकि उसे सँभालना और बदलना आसान हो। इसे `docker-compose.yml` नाम से सेव करें और `docker compose up -d` चलाएँ:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

`docker run` कमांड की तरह, यह SnapOtter को आज़माने और छोटे इंस्टॉल के लिए है। [Configuration](/hi/guide/configuration) की हर सेटिंग `environment` के अंतर्गत जाती है।

### Docker Compose (production) {#docker-compose}

इस पेज से संक्षिप्त Compose उदाहरण कॉपी करने के बजाय, हर release के साथ बनाए रखी और परखी गई production फ़ाइल का उपयोग करें:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

[http://localhost:1349](http://localhost:1349) खोलें और `admin` / `admin` से साइन इन करें।

Canonical [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) में चारों runtime volumes, health checks, resource limits, टिकाऊ Redis कॉन्फ़िगरेशन, pinned database/cache images, और मौजूदा container hardening शामिल हैं। पहले login के तुरंत बाद डिफ़ॉल्ट admin पासवर्ड बदलें। दोहराई जा सकने वाली deployment के लिए `latest` को फ़ॉलो करने के बजाय SnapOtter application image को उस release tag या digest पर pin करें जिसे आपने सत्यापित किया है।

सभी environment variables के लिए [Configuration](/hi/guide/configuration) और secrets, network policy तथा backup संबंधी मार्गदर्शन के लिए [Security & Hardening](/hi/guide/security) देखें।

### GitHub Container Registry {#ghcr}

Docker Hub और GHCR दोनों हर release पर वही image प्रकाशित करते हैं। GHCR से pull करने के लिए image का नाम बदलें:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### Source से Build {#build-from-source}

**आवश्यकताएँ:** Node.js 22.22+, pnpm 9+, Docker (Postgres + Redis के लिए), Python 3.11+ (AI फ़ीचर्स के लिए), Git।

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## आप क्या कर सकते हैं {#what-you-can-do}

### फ़ाइल प्रोसेसिंग (200+ Tools) {#file-processing-200-tools}

| Modality | संख्या | उदाहरण Tools |
|----------|-------|---------------|
| **Image** | 112 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, format presets |
| **Video** | 63 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, format presets |
| **Audio** | 57 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, format presets |
| **PDF / Document** | 37 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Files** | 25 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipelines {#pipelines}

Tools को बहु-चरणीय workflows में जोड़ें और उन्हें एक image या पूरे batch पर लागू करें:

1. Sidebar में **Pipelines** खोलें।
2. Steps जोड़ें (कोई भी tool, कोई भी सेटिंग)।
3. एक फ़ाइल पर चलाएँ, या पूरे batch पर एक साथ।
4. बाद में दोबारा उपयोग के लिए pipeline सेव करें।

Pipelines में डिफ़ॉल्ट रूप से 20 steps की अनुमति है। सीमा हटाने के लिए [`MAX_PIPELINE_STEPS=0`](/hi/guide/configuration#env-max-pipeline-steps) सेट करें।

### File Library {#file-library}

आपकी प्रोसेस की गई हर फ़ाइल आपकी **Files** library में सेव की जा सकती है। SnapOtter पूरा version history रखता है, ताकि आप मूल upload से अंतिम output तक हर प्रोसेसिंग step का पता लगा सकें।

सेव करना स्पष्ट रूप से करना होता है: library में सेव किए गए परिणाम आपके हटाने तक रखे जाते हैं, जबकि प्रोसेस करके बिना सेव छोड़े गए परिणाम 72 घंटे बाद अपने आप साफ़ हो जाते हैं ([`FILE_MAX_AGE_HOURS`](/hi/guide/configuration#env-file-max-age-hours) से कॉन्फ़िगर किया जा सकता है)।

### REST API और API Keys {#rest-api-api-keys}

हर tool HTTP के ज़रिए उपलब्ध है:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**Settings → API Keys** में API keys बनाएँ। सभी endpoints के लिए [REST API reference](/hi/api/rest) देखें, या interactive reference के लिए [http://localhost:1349/api/docs](http://localhost:1349/api/docs) पर जाएँ।

### Multi-User और Teams {#multi-user-teams}

Role-based access control के साथ कई उपयोगकर्ताओं को सक्षम करें:

- **Admin**: पूर्ण एक्सेस, उपयोगकर्ताओं, teams, सेटिंग्स, और सभी files/pipelines/API keys का प्रबंधन
- **User**: tools का उपयोग, और अपनी files/pipelines/API keys का प्रबंधन

उपयोगकर्ताओं को समूहित करने के लिए **Settings → Teams** में teams बनाएँ।

[`AUTH_ENABLED=true`](/hi/guide/configuration#env-auth-enabled) सेट करें (या बिना login के अकेले/निजी उपयोग के लिए `false`)।

## इसे अपने फ़ोन से उपयोग करें {#use-it-from-your-phone}

SnapOtter मोबाइल ब्राउज़र में काम करता है, और आप इसे app के रूप में इंस्टॉल भी कर सकते हैं। अपने फ़ोन पर instance खोलें, फिर:

- **iPhone / iPad (Safari):** Share पर टैप करें, फिर **Add to Home Screen** चुनें।
- **Android (Chrome):** ब्राउज़र मेनू खोलें और **Install app** पर टैप करें।

इंस्टॉल किया गया app अपनी अलग विंडो में खुलता है, सीधे आपके instance पर।

एक बात ध्यान रखें: ब्राउज़र केवल HTTPS पर ही install prompt दिखाते हैं। आपके LAN पर सादा HTTP पता ब्राउज़र टैब में ठीक से काम करता है; असली इंस्टॉल के लिए instance को certificate वाले reverse proxy के पीछे रखें ([deployment guide](/hi/guide/deployment) देखें)।

फ़ोन और tablet पर, image tools में upload बटन के बगल में **Take photo** बटन दिखता है। किसी रसीद या whiteboard की फ़ोटो लें और वह सीधे tool में पहुँच जाती है।