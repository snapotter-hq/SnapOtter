---
description: "OpenID Connect के साथ Single Sign-On सेटअप करें। Keycloak, Authentik, Google, और अन्य OIDC providers के लिए चरण-दर-चरण गाइड।"
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 02d341718711
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter single sign-on के लिए OpenID Connect (OIDC) का समर्थन करता है। Users स्थानीय username/password authentication के बजाय (या उसके साथ-साथ) Keycloak, Authentik, या Google जैसे किसी बाहरी identity provider से login कर सकते हैं।

::: tip यह भी देखें
[SAML SSO](/hi/guide/saml) | [SCIM Provisioning](/hi/guide/scim) | [Users, Roles और Permissions](/hi/guide/users-roles)
:::

## Quick start {#quick-start}

अपने `docker-compose.yml` में ये environment variables जोड़ें:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

आपके provider के लिए redirect URI हमेशा यही होता है:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

उदाहरण के लिए, यदि `EXTERNAL_URL` `https://photos.example.com` है, तो अपने provider का redirect URI `https://photos.example.com/api/auth/oidc/callback` के रूप में configure करें।

## Configuration reference {#configuration-reference}

| Variable | Default | Description |
|---|---|---|
| `OIDC_ENABLED` | `false` | OIDC login सक्षम करें। login page पर एक "Sign in with SSO" बटन दिखाई देता है। |
| `OIDC_ISSUER_URL` | | Provider का issuer URL। OIDC Discovery (`/.well-known/openid-configuration`) का समर्थन करना चाहिए। |
| `OIDC_CLIENT_ID` | | आपके provider के साथ पंजीकृत OAuth client ID। |
| `OIDC_CLIENT_SECRET` | | OAuth client secret। |
| `OIDC_SCOPES` | `openid profile email` | अनुरोध करने के लिए scopes की space-separated सूची। |
| `OIDC_AUTO_CREATE_USERS` | `true` | पहली OIDC login पर स्वतः एक स्थानीय user account बनाएँ। |
| `OIDC_DEFAULT_ROLE` | `user` | स्वतः बनाए गए OIDC users को सौंपी गई role। `admin`, `editor`, या `user` में से एक। |
| `OIDC_AUTO_LINK_USERS` | `false` | यदि email पता मेल खाता है तो किसी OIDC पहचान को मौजूदा स्थानीय user से जोड़ें। |
| `OIDC_PROVIDER_NAME` | | login बटन पर दिखाया गया display नाम (उदा. "Keycloak", "Google")। यदि खाली हो, तो बटन "SSO" कहता है। |
| `OIDC_CLOCK_TOLERANCE` | `30` | token validation के लिए सेकंड में clock skew सहनशीलता। |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | नए accounts के लिए username के रूप में उपयोग किया जाने वाला ID token claim। |
| `EXTERNAL_URL` | | वह सार्वजनिक URL जहाँ SnapOtter पहुँच योग्य है। सही redirect URI बनाने के लिए OIDC के लिए आवश्यक। |
| `COOKIE_SECRET` | स्वतः-जनरेटेड | session cookies पर हस्ताक्षर करने के लिए secret। अनेक replicas चलाते समय इसे स्पष्ट रूप से सेट करें। |

## Provider guides {#provider-guides}

### Keycloak {#keycloak}

1. एक नया realm बनाएँ (या किसी मौजूदा का उपयोग करें)।
2. **Clients** पर जाएँ और एक नया client बनाएँ:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. client के **Settings** टैब के अंतर्गत, **Valid redirect URIs** को अपने callback URL पर सेट करें (उदा. `https://photos.example.com/api/auth/oidc/callback`)।
4. **Credentials** टैब से **Client secret** कॉपी करें।
5. `OIDC_ISSUER_URL` को `https://keycloak.example.com/realms/your-realm` पर सेट करें।

### Authentik {#authentik}

1. admin interface में, **Applications > Providers** पर जाएँ और एक नया **OAuth2/OpenID Provider** बनाएँ।
   - **Client type**: Confidential
   - **Redirect URIs**: आपका callback URL
   - **Signing key**: कोई मौजूदा key चुनें या एक बनाएँ
2. एक **Application** बनाएँ और उसे provider से लिंक करें।
3. provider settings से **Client ID** और **Client Secret** कॉपी करें।
4. `OIDC_ISSUER_URL` को `https://authentik.example.com/application/o/snapotter/` पर सेट करें (अंत का slash मायने रखता है)।

### Google {#google}

1. [Google Cloud Console](https://console.cloud.google.com/) पर जाएँ।
2. एक project बनाएँ (या किसी मौजूदा को चुनें)।
3. **APIs & Services > OAuth consent screen** पर जाएँ और उसे configure करें।
4. **APIs & Services > Credentials** पर जाएँ और एक **OAuth 2.0 Client ID** बनाएँ:
   - **Application type**: Web application
   - **Authorized redirect URIs**: आपका callback URL
5. **Client ID** और **Client secret** कॉपी करें।
6. `OIDC_ISSUER_URL` को `https://accounts.google.com` पर सेट करें।
7. `OIDC_USERNAME_CLAIM` को `email` पर सेट करें (Google `preferred_username` प्रदान नहीं करता)।

## User provisioning {#user-provisioning}

### Auto-create {#auto-create}

जब `OIDC_AUTO_CREATE_USERS` `true` हो (डिफ़ॉल्ट), तो जब कोई पहली बार OIDC के माध्यम से login करता है तब एक स्थानीय user account बनाया जाता है। username `OIDC_USERNAME_CLAIM` द्वारा निर्दिष्ट claim से लिया जाता है, और role `OIDC_DEFAULT_ROLE` पर सेट होती है।

यदि username टकराव होता है, तो एक संख्यात्मक suffix जोड़ा जाता है (उदा. `jane` `jane_2` बन जाता है)।

### Auto-link {#auto-link}

जब `OIDC_AUTO_LINK_USERS` `true` हो, तो यदि email पते मेल खाते हैं तो SnapOtter किसी OIDC पहचान को मौजूदा स्थानीय account से जोड़ देता है। यह तब उपयोगी है जब आपके पास पहले से बनाए गए user accounts हैं और आप चाहते हैं कि वे अपना data खोए बिना SSO का उपयोग शुरू करें।

::: warning 
auto-link केवल तभी सक्षम करें जब आप अपने OIDC provider पर email पतों को सत्यापित करने के लिए भरोसा करते हों। एक असत्यापित email किसी को दूसरे user के account पर कब्ज़ा करने की अनुमति दे सकता है।
:::

### स्थानीय login को अक्षम करना {#disabling-local-login}

OIDC स्थानीय username/password login को अक्षम नहीं करता। दोनों विधियाँ उपलब्ध रहती हैं। यदि OIDC provider पहुँच से बाहर हो तो Admins अब भी स्थानीय credentials से login कर सकते हैं।

## Self-signed certificates {#self-signed-certificates}

यदि आपका OIDC provider एक self-signed या निजी CA certificate का उपयोग करता है, तो CA bundle को container में mount करें और `NODE_EXTRA_CA_CERTS` को उस पर इंगित करें:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
`NODE_TLS_REJECT_UNAUTHORIZED=0` सेट न करें। यह सभी TLS verification को अक्षम कर देता है और एक सुरक्षा जोखिम है।
:::

## Troubleshooting {#troubleshooting}

### Redirect URI mismatch {#redirect-uri-mismatch}

सबसे आम त्रुटि। आपका provider जो अपेक्षा करता है और SnapOtter जो भेजता है, उनके बीच इन अंतरों की जाँच करें:

- `http` बनाम `https` - scheme बिल्कुल मेल खाना चाहिए
- अंत का slash - कुछ providers इस बारे में सख्त होते हैं
- Port number - यदि यह non-standard हो तो port शामिल करें
- Path - `/api/auth/oidc/callback` होना चाहिए

`EXTERNAL_URL` को दोबारा जाँचें। यह उस URL से मेल खाना चाहिए जो users अपने browser में टाइप करते हैं।

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

OIDC provider एक ऐसे certificate का उपयोग कर रहा है जिस पर Node.js भरोसा नहीं करता। ऊपर [Self-signed certificates](#self-signed-certificates) देखें।

### Clock skew त्रुटियाँ {#clock-skew-errors}

यदि आपके server की घड़ी और OIDC provider की घड़ी असंगत हैं, तो token validation विफल हो सकती है। `OIDC_CLOCK_TOLERANCE` बढ़ाएँ (डिफ़ॉल्ट 30 सेकंड है)। एक बेहतर समाधान दोनों मशीनों पर NTP चलाना है।

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter startup पर और login के दौरान provider का discovery document लाता है। जाँचें:

- Docker container के भीतर से DNS resolution (`docker exec snapotter nslookup auth.example.com`)
- container और provider के बीच Firewall नियम
- `OIDC_ISSUER_URL` मान - यह server से पहुँच योग्य होना चाहिए, केवल आपके browser से नहीं

### Missing claims {#missing-claims}

यदि login के बाद usernames या emails खाली हैं, तो हो सकता है आपका provider अपेक्षित claims न लौटा रहा हो। सत्यापित करें:

- `OIDC_SCOPES` में configure किए गए scopes में `profile` और `email` शामिल हैं
- provider को ID token में `OIDC_USERNAME_CLAIM` द्वारा निर्दिष्ट claim शामिल करने के लिए configure किया गया है
- कुछ providers को claims जारी करने के लिए स्पष्ट mapper/scope configuration की आवश्यकता होती है
