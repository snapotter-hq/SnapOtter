---
description: "SnapOtter में योगदान कैसे करें। बग रिपोर्ट, फ़ीचर अनुरोध, पुल रिक्वेस्ट और CLA आवश्यकताएँ।"
i18n_source_hash: 528802503035
i18n_provenance: human
i18n_output_hash: cf867a422a1c
---

# योगदान {#contributing}

योगदान में आपकी रुचि के लिए धन्यवाद। यह गाइड बताती है कि आप कैसे भाग ले सकते हैं, हम क्या स्वीकार करते हैं और शुरुआत कैसे करें।

## योगदान के तरीके {#ways-to-contribute}

### इशू (किसी सेटअप की आवश्यकता नहीं) {#issues-no-setup-required}

- **बग रिपोर्ट** - कुछ टूट गया है? पुनरुत्पादन के चरणों के साथ एक [बग रिपोर्ट](https://github.com/snapotter-hq/snapotter/issues/new?template=bug_report.yml) खोलें।
- **फ़ीचर अनुरोध** - कोई विचार है? एक [चर्चा](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) शुरू करें ताकि समुदाय अपनी राय दे सके और उसे अपवोट कर सके।
- **अनुवाद इशू** - कोई गलत या अनुपलब्ध अनुवाद दिखा? एक [अनुवाद इशू](https://github.com/snapotter-hq/snapotter/issues/new?template=translation.yml) खोलें।
- **दस्तावेज़ीकरण इशू** - डॉक्स में कुछ गड़बड़ है? एक [दस्तावेज़ीकरण इशू](https://github.com/snapotter-hq/snapotter/issues/new?template=documentation.yml) खोलें।

### कोड (CLA आवश्यक) {#code-requires-cla}

हम इनके लिए पुल रिक्वेस्ट स्वीकार करते हैं:

| प्रकार | प्रक्रिया |
|------|---------|
| बग फ़िक्स | सीधे एक PR खोलें (यदि कोई इशू मौजूद है तो उसे लिंक करें) |
| नए अनुवाद | सीधे एक PR खोलें ([अनुवाद गाइड](/hi/guide/translations) देखें) |
| दस्तावेज़ीकरण सुधार | सीधे एक PR खोलें |
| टेस्ट कवरेज सुधार | सीधे एक PR खोलें |
| नए टूल या फ़ीचर | पहले एक [चर्चा](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) शुरू करें; कोड लिखने से पहले एक मेंटेनर स्वीकृत विचारों को एक ट्रैक किए गए इशू में बदल देता है |
| रीफ़ैक्टर या आर्किटेक्चर बदलाव | पहले एक [चर्चा](https://github.com/snapotter-hq/snapotter/discussions/new?category=ideas) शुरू करें और कोड लिखने से पहले मेंटेनर की मंज़ूरी की प्रतीक्षा करें |

### हम क्या स्वीकार नहीं करेंगे {#what-we-will-not-accept}

- CI/CD वर्कफ़्लो, रिलीज़ कॉन्फ़िग या लिंटर/कंपाइलर कॉन्फ़िग में बदलाव
- हस्ताक्षरित [Contributor License Agreement](#contributor-license-agreement) के बिना PR
- 400 से अधिक लाइनों के बदलाव वाले PR (बड़े काम को छोटे PR में बाँटें)
- ऐसे फ़ीचर जिन पर पहले चर्चा और स्वीकृति नहीं हुई
- पूर्व चर्चा के बिना `packages/ai/` में बदलाव

## Contributor License Agreement {#contributor-license-agreement}

आपका पहला PR मर्ज करने से पहले, आपको हमारा [Individual CLA](https://github.com/snapotter-hq/snapotter/blob/main/CLA.md) हस्ताक्षरित करना होगा। यह एक बार की आवश्यकता है।

**क्यों:** SnapOtter दोहरे-लाइसेंस वाला है (AGPLv3 + कमर्शियल)। CLA हमें आपके योगदान को दोनों लाइसेंसों के तहत वितरित करने का अधिकार देता है। आप अपने काम के पूर्ण कॉपीराइट स्वामित्व को बनाए रखते हैं।

**कैसे:** जब आप अपना पहला PR खोलेंगे, तो CLA Assistant बॉट एक लिंक के साथ टिप्पणी करेगा। उस पर क्लिक करें, समझौते की समीक्षा करें और अपने GitHub खाते से हस्ताक्षर करें। इसमें 30 सेकंड लगते हैं।

यदि आप अपने नियोक्ता की ओर से योगदान कर रहे हैं और आपका नियोक्ता आपके काम पर IP अधिकार रखता है, तो सबमिट करने से पहले एक Corporate CLA की व्यवस्था करने के लिए contact@snapotter.com से संपर्क करें।

## शुरुआत करना {#getting-started}

### पूर्वापेक्षाएँ {#prerequisites}

- Node.js 22+
- pnpm 9+
- Python 3.11+ (केवल AI टूल के लिए)
- Docker (वैकल्पिक, पूर्ण इंटीग्रेशन टेस्टिंग के लिए)

### सेटअप {#setup}

```bash
# Fork and clone
git clone https://github.com/<your-username>/snapotter.git
cd snapotter

# Start Postgres + Redis for local dev
docker compose -f docker-compose.dev.yml up -d

# Install dependencies
pnpm install

# Start dev servers (web on :1349, API on :13490)
pnpm dev
```

### चेक चलाना {#running-checks}

PR सबमिट करने से पहले, सुनिश्चित करें कि सभी चेक स्थानीय रूप से पास होते हैं:

```bash
pnpm lint          # Biome lint + format check
pnpm typecheck     # TypeScript across monorepo
pnpm test          # Vitest unit + integration tests
```

## पुल रिक्वेस्ट प्रक्रिया {#pull-request-process}

1. रेपो को फ़ोर्क करें और `main` (`feat/my-feature` या `fix/issue-123`) से एक ब्रांच बनाएँ
2. [conventional commits](https://www.conventionalcommits.org/) का उपयोग करते हुए केंद्रित, समीक्षा-योग्य कमिट में अपने बदलाव करें
3. अपने बदलावों के लिए टेस्ट जोड़ें या अपडेट करें
4. स्थानीय रूप से `pnpm lint && pnpm typecheck && pnpm test` चलाएँ
5. `main` के विरुद्ध एक PR खोलें और टेम्पलेट भरें
6. यदि संकेत दिया जाए तो CLA पर हस्ताक्षर करें
7. CI के पास होने और एक मेंटेनर की समीक्षा की प्रतीक्षा करें

### समीक्षा से अपेक्षाएँ {#review-expectations}

- हमारा लक्ष्य 7 दिनों के भीतर PR पर प्रतिक्रिया देना है
- छोटे, केंद्रित PR की समीक्षा तेज़ी से होती है
- यदि 7 दिनों में आपको कोई जवाब न मिले, तो थ्रेड पर पिंग करते हुए एक टिप्पणी छोड़ें
- हम बदलावों का अनुरोध कर सकते हैं, एक अलग तरीका सुझा सकते हैं, या यदि PR परियोजना की दिशा से मेल नहीं खाता तो उसे बंद कर सकते हैं

### आपके PR के मर्ज होने के बाद {#after-your-pr-is-merged}

आपका योगदान अगली रिलीज़ में शामिल किया जाएगा और चेंजलॉग में श्रेय दिया जाएगा।

## अच्छे पहले इशू {#good-first-issues}

कुछ काम करने के लिए ढूँढ रहे हैं? शुरुआती-अनुकूल कार्यों के लिए हमारे [good first issues](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) देखें, या बड़े कामों के लिए [help wanted](https://github.com/snapotter-hq/snapotter/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) देखें जहाँ हमें समुदाय की मदद की सराहना होगी।

## कोड शैली {#code-style}

- Biome फ़ॉर्मेटिंग और लिंटिंग संभालता है (डबल कोट्स, सेमीकोलन, 2-स्पेस इंडेंट)
- प्री-कमिट हुक स्वचालित रूप से स्टेज की गई फ़ाइलों पर `biome check --write` चलाता है
- यदि लिंटर शिकायत करता है, तो कोड ठीक करें (Biome कॉन्फ़िग में बदलाव न करें)
- हर जगह ES modules (`import`/`export`)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

पूर्ण आर्किटेक्चर विवरण के लिए, [Developer Guide](/hi/guide/developer) देखें।

## सुरक्षा {#security}

**सुरक्षा कमज़ोरियों के लिए कोई सार्वजनिक PR या इशू न खोलें।** उन्हें [GitHub Security Advisories](https://github.com/snapotter-hq/snapotter/security/advisories/new) के माध्यम से या contact@snapotter.com पर ईमेल करके निजी तौर पर रिपोर्ट करें। पूर्ण विवरण के लिए [SECURITY.md](https://github.com/snapotter-hq/snapotter/blob/main/SECURITY.md) देखें।

## प्रश्न? {#questions}

- [Documentation](https://docs.snapotter.com/)
- [Discord](https://discord.gg/hr3s7HPUsr)
- [GitHub Discussions](https://github.com/snapotter-hq/snapotter/discussions)
