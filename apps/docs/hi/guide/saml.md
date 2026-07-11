---
description: "SnapOtter के लिए SAML 2.0 Single Sign-On सेटअप करें। Okta, Azure AD / Entra ID, Google Workspace, और अन्य SAML identity providers के लिए चरण-दर-चरण गाइड।"
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: f14eea5bfa2f
---

# SAML SSO {#saml-sso}

SnapOtter single sign-on के लिए SAML 2.0 का समर्थन करता है। Users स्थानीय username/password authentication के बजाय किसी बाहरी identity provider (Okta, Azure AD / Entra ID, Google Workspace, या किसी मानक SAML 2.0 IdP) के माध्यम से login कर सकते हैं।

::: tip Enterprise feature
SAML SSO के लिए `saml_sso` feature के साथ एक **team** या **enterprise** license आवश्यक है। यदि `SAML_ENABLED=true` बिना एक वैध license के सेट किया गया हो, तो SAML routes को चुपचाप छोड़ दिया जाता है और एक चेतावनी लॉग की जाती है।
:::

## पूर्वापेक्षाएँ {#prerequisites}

- एक सार्वजनिक URL पर पहुँच योग्य एक चालू SnapOtter instance
- `EXTERNAL_URL` उस सार्वजनिक URL पर सेट (उदा. `https://photos.example.com`)
- `saml_sso` feature के साथ एक team या enterprise license key
- आपके SAML identity provider तक Admin पहुँच

## Quick start {#quick-start}

अपने `docker-compose.yml` में ये environment variables जोड़ें:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

container को पुनः आरंभ करें। login page पर एक "Sign in with SAML" बटन (या `SAML_PROVIDER_NAME` द्वारा सेट किया गया label) दिखाई देता है।

## Configuration reference {#configuration-reference}

| Variable | Default | Description |
|---|---|---|
| `SAML_ENABLED` | `false` | SAML login सक्षम करें। |
| `SAML_IDP_SSO_URL` | | IdP का SSO endpoint URL। SAML सक्षम होने पर **आवश्यक**। |
| `SAML_IDP_CERTIFICATE` | | PEM format में IdP का X.509 signing certificate (certificate का text ही, कोई file path नहीं)। SAML सक्षम होने पर **आवश्यक**। |
| `EXTERNAL_URL` | | वह सार्वजनिक URL जहाँ SnapOtter पहुँच योग्य है। SAML सक्षम होने पर **आवश्यक**। |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | IdP को भेजा गया SP Entity ID / Audience URI। |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion Consumer Service (ACS) URL। |
| `SAML_AUTO_CREATE_USERS` | `true` | पहली SAML login पर स्वतः एक स्थानीय user account बनाएँ। |
| `SAML_AUTO_LINK_USERS` | `false` | यदि email पता मेल खाता है तो किसी SAML पहचान को मौजूदा स्थानीय user से जोड़ें। |
| `SAML_DEFAULT_ROLE` | `user` | स्वतः बनाए गए SAML users को सौंपी गई role। `admin`, `editor`, या `user` में से एक। |
| `SAML_PROVIDER_NAME` | | frontend पर SAML login बटन के लिए display label (उदा. "Okta", "Azure AD")। यदि खाली हो, तो बटन "SAML" कहता है। |
| `SAML_USERNAME_ATTRIBUTE` | | username के रूप में उपयोग किया जाने वाला SAML assertion attribute। यदि खाली हो, तो email local-part, फिर NameID पर वापस चला जाता है। |
| `SAML_EMAIL_ATTRIBUTE` | `email` | user के email पते के रूप में उपयोग किया जाने वाला SAML assertion attribute। |

यदि `SAML_ENABLED=true` और तीन आवश्यक variables (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) में से कोई भी अनुपस्थित हो, तो server आरंभ होने से मना कर देता है।

::: details Security notes
`wantAuthnResponseSigned` और `wantAssertionsSigned` दोनों `true` पर hardcoded हैं। SnapOtter बिना हस्ताक्षर वाली या अनुचित रूप से हस्ताक्षरित SAML responses को अस्वीकार कर देता है। किसी भरोसेमंद IdP से आई assertions को email-verified माना जाता है।

केवल SP-initiated login समर्थित है। SnapOtter IdP-initiated (unsolicited) login या Single Logout (SLO) का समर्थन नहीं करता। SnapOtter से logout करने पर user IdP से logout नहीं होता।
:::

## SP metadata और URLs {#sp-metadata-and-urls}

आपके IdP को SnapOtter से तीन मानों की आवश्यकता होती है:

| Field | Value |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

उदाहरण के लिए, यदि `EXTERNAL_URL` `https://photos.example.com` है:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Metadata endpoint: `https://photos.example.com/api/auth/saml/metadata` (XML लौटाता है)

कुछ IdPs SP metadata URL को सीधे import कर सकते हैं, जो ACS URL और Entity ID को स्वतः भर देता है।

## Provider setup {#provider-setup}

### Okta {#okta}

1. Okta admin console में, **Applications > Create App Integration** पर जाएँ।
2. **SAML 2.0** चुनें और **Next** पर क्लिक करें।
3. एक नाम सेट करें (उदा. "SnapOtter") और **Next** पर क्लिक करें।
4. SAML settings configure करें:
   - **Single sign-on URL**: आपका ACS URL (उदा. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: आपका Entity ID (उदा. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. **Attribute Statements** के अंतर्गत, `email` को `user.email` पर mapped करके जोड़ें।
6. **Next**, फिर **Finish** पर क्लिक करें।
7. **Sign On** टैब पर जाएँ, **View SAML setup instructions** पर क्लिक करें, और कॉपी करें:
   - **Identity Provider Single Sign-On URL** को `SAML_IDP_SSO_URL` में
   - **X.509 Certificate** को `SAML_IDP_CERTIFICATE` में

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Azure portal में, **Microsoft Entra ID > Enterprise applications > New application** पर जाएँ।
2. **Create your own application** पर क्लिक करें, इसे "SnapOtter" नाम दें, और **Integrate any other application you don't find in the gallery** चुनें।
3. **Single sign-on > SAML** पर जाएँ और **Basic SAML Configuration** section पर **Edit** क्लिक करें:
   - **Identifier (Entity ID)**: आपका Entity ID (उदा. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: आपका ACS URL (उदा. `https://photos.example.com/api/auth/saml/callback`)
4. **SAML Certificates** के अंतर्गत, **Certificate (Base64)** डाउनलोड करें।
5. **Set up SnapOtter** के अंतर्गत, **Login URL** कॉपी करें।
6. `SAML_IDP_SSO_URL` को Login URL पर और `SAML_IDP_CERTIFICATE` को डाउनलोड किए गए certificate की सामग्री पर सेट करें।
7. **Users and groups** के अंतर्गत application को users या groups सौंपें।

### Google Workspace {#google-workspace}

1. Google Admin console में, **Apps > Web and mobile apps > Add app > Add custom SAML app** पर जाएँ।
2. app को "SnapOtter" नाम दें और **Continue** पर क्लिक करें।
3. **Google Identity Provider details** page पर, **SSO URL** कॉपी करें और **Certificate** डाउनलोड करें। **Continue** पर क्लिक करें।
4. Service Provider विवरण configure करें:
   - **ACS URL**: आपका ACS URL (उदा. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: आपका Entity ID (उदा. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. **Continue**, फिर **Finish** पर क्लिक करें।
6. अपने organizational units के लिए app को **ON** करें।
7. `SAML_IDP_SSO_URL` को step 3 के SSO URL पर और `SAML_IDP_CERTIFICATE` को डाउनलोड किए गए certificate की सामग्री पर सेट करें।

### Generic SAML 2.0 IdP {#generic-saml-2-0-idp}

किसी भी SAML 2.0 अनुरूप identity provider के लिए:

1. अपने IdP में एक नया SAML application/service provider बनाएँ।
2. **ACS URL** को `${EXTERNAL_URL}/api/auth/saml/callback` पर सेट करें।
3. **Entity ID** / **Audience** को `${EXTERNAL_URL}/api/auth/saml/metadata` पर सेट करें।
4. IdP को `email` नामक attribute में user का email भेजने के लिए configure करें (या अपने IdP के attribute नाम से मेल खाने के लिए `SAML_EMAIL_ATTRIBUTE` सेट करें)।
5. **IdP SSO URL** और **signing certificate** को `SAML_IDP_SSO_URL` और `SAML_IDP_CERTIFICATE` में कॉपी करें।

## User provisioning {#user-provisioning}

### Auto-create {#auto-create}

जब `SAML_AUTO_CREATE_USERS` `true` हो (डिफ़ॉल्ट), तो जब कोई पहली बार SAML के माध्यम से login करता है तब एक स्थानीय user account बनाया जाता है। role `SAML_DEFAULT_ROLE` पर सेट होती है।

username इस क्रम में लिया जाता है:

1. `SAML_USERNAME_ATTRIBUTE` द्वारा निर्दिष्ट assertion attribute का मान (यदि सेट और मौजूद हो)
2. email पते का local-part (`@` से पहले का सब कुछ)
3. SAML NameID

यदि username टकराव होता है, तो एक संख्यात्मक suffix जोड़ा जाता है (उदा. `jane` `jane_2` बन जाता है)।

### Auto-link {#auto-link}

जब `SAML_AUTO_LINK_USERS` `true` हो, तो यदि email पते मेल खाते हैं तो SnapOtter किसी SAML पहचान को मौजूदा स्थानीय account से जोड़ देता है। यह तब उपयोगी है जब आपके पास पहले से बनाए गए user accounts हैं और आप चाहते हैं कि वे अपना data खोए बिना SSO का उपयोग शुरू करें।

::: warning 
auto-link केवल तभी सक्षम करें जब आप अपने SAML IdP पर email पतों को सत्यापित करने के लिए भरोसा करते हों। किसी गलत configure किए गए IdP से आया एक असत्यापित email किसी को दूसरे user के account पर कब्ज़ा करने की अनुमति दे सकता है।
:::

### Attribute mapping {#attribute-mapping}

| SnapOtter field | Source | Configuration |
|---|---|---|
| Email | Assertion attribute | `SAML_EMAIL_ATTRIBUTE` (default: `email`) |
| Username | Assertion attribute, email, या NameID | `SAML_USERNAME_ATTRIBUTE` (ऊपर दिया derivation क्रम देखें) |
| External ID | NameID | हमेशा SAML NameID, configurable नहीं |

## SSO enforcement {#sso-enforcement}

यदि आप चाहते हैं कि सभी users SAML (या OIDC) के माध्यम से login करें और स्थानीय password login को रोकें, तो SSO enforcement सक्षम करें:

1. सुनिश्चित करें कि `sso_enforcement` enterprise feature licensed है (team और enterprise plans पर उपलब्ध)।
2. **Admin Settings > Security** में, **SSO Enforcement** को on टॉगल करें।
3. एक **break-glass username** सेट करें: यह वह एकमात्र स्थानीय account है जो अब भी password से login कर सकता है, IdP के पहुँच से बाहर होने पर आपातकालीन पहुँच के लिए।

जब SSO enforcement सक्रिय हो, तो किसी भी स्थानीय login प्रयास (break-glass user को छोड़कर) पर "Local password login is disabled. Please use SSO." संदेश के साथ एक 403 त्रुटि लौटती है।

::: tip 
SSO enforcement सक्षम करने से पहले हमेशा एक break-glass username configure करें। इसके बिना, यदि आपका IdP डाउन हो जाता है तो आप SnapOtter से बाहर लॉक हो सकते हैं।
:::

## OIDC के साथ SAML का उपयोग करना {#using-saml-alongside-oidc}

SAML और OIDC को एक साथ सक्षम किया जा सकता है। जब दोनों सक्रिय हों, तो login page हर provider के लिए अलग बटन दिखाता है (`SAML_PROVIDER_NAME` और `OIDC_PROVIDER_NAME` द्वारा labeled)। Users किसी भी विधि से login कर सकते हैं।

दोनों providers समान auto-create, auto-link, और SSO enforcement settings को स्वतंत्र रूप से साझा करते हैं: हर एक के अपने `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS`, और `*_DEFAULT_ROLE` variables होते हैं।

## Troubleshooting {#troubleshooting}

### Assertion validation failed {#assertion-validation-failed}

SAML response signature या assertion signature सत्यापित नहीं की जा सकी। जाँचें:

- `SAML_IDP_CERTIFICATE` में certificate आपके IdP में वर्तमान signing certificate से मेल खाता है (certificates rotate होते हैं, इसलिए expiry की जाँच करें)
- certificate PEM format में है (`-----BEGIN CERTIFICATE-----` से शुरू होता है)
- certificate पूरा text है, कोई file path नहीं
- आपके IdP में configure किए गए ACS URL और Entity ID SnapOtter के मानों से बिल्कुल मेल खाते हैं (scheme, host, port, path)

### Missing attributes {#missing-attributes}

यदि login के बाद usernames या emails खाली हैं, तो हो सकता है आपका IdP अपेक्षित attributes न भेज रहा हो। जाँचें:

- आपका IdP एक `email` attribute (या जो भी `SAML_EMAIL_ATTRIBUTE` सेट किया गया हो) जारी करने के लिए configure किया गया है
- यदि `SAML_USERNAME_ATTRIBUTE` का उपयोग कर रहे हैं, तो सत्यापित करें कि वह attribute assertion में शामिल है
- कुछ IdPs को claims जारी करने से पहले स्पष्ट attribute mapping configuration की आवश्यकता होती है

### Clock skew {#clock-skew}

SAML assertions में timestamp conditions (`NotBefore`, `NotOnOrAfter`) शामिल होती हैं। यदि आपके server की घड़ी और IdP की घड़ी असंगत हैं, तो assertion validation विफल हो जाती है। घड़ियों को संरेखित रखने के लिए दोनों मशीनों पर NTP चलाएँ।

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

यह चेतावनी server logs में तब दिखाई देती है जब `SAML_ENABLED=true` लेकिन license में `saml_sso` feature शामिल नहीं है। अपना license key और plan सत्यापित करें। `saml_sso` feature team और enterprise plans पर उपलब्ध है।

### Login redirects back with error {#login-redirects-back-with-error}

यदि SAML login बटन पर क्लिक करने से एक त्रुटि के साथ login page पर वापस redirect होता है, तो विवरण के लिए server logs जाँचें। सामान्य कारण:

- IdP SSO URL server से पहुँच से बाहर है
- IdP ने authentication अनुरोध अस्वीकार कर दिया (IdP के audit logs जाँचें)
- IdP ने एक बिना हस्ताक्षर वाला response लौटाया (SnapOtter को response और assertion दोनों के हस्ताक्षरित होने की आवश्यकता है)
