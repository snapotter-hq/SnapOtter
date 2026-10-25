---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: 7a862c87bac1
i18n_hash_version: 2
---
# खाता पुनर्प्राप्ति {#account-recovery}

अगर आप SnapOtter से बाहर लॉक हो जाते हैं (अक्सर किसी ऐसी MFA नीति के कारण जिसे
आप अब पूरा नहीं कर सकते), तो आप डेटाबेस क्लाइंट के बिना कंटेनर के भीतर से ही
पुनर्प्राप्ति कर सकते हैं. पुनर्प्राप्ति कमांड ऑफ़लाइन होते हैं और इनके लिए कंटेनर तक शेल एक्सेस
चाहिए, जिसका मतलब पहले से ही इंस्टेंस पर पूरा नियंत्रण होता है.

## मैं किस दीवार से टकरा रहा हूँ? {#which-wall-am-i-hitting}

SnapOtter का लॉगिन दो स्वतंत्र MFA गेट लागू करता है. पहले निदान करें:

```bash
docker exec -it snapotter snapotter-admin status
```

यह मौजूदा MFA नीति और यह प्रिंट करता है कि किन उपयोगकर्ताओं ने TOTP में नामांकन किया है.

- **"लॉगिन से पहले MFA नामांकन आवश्यक है" (और आपने कभी कोई ऐप सेट नहीं किया):**
  नीति के लिए MFA आवश्यक है पर आपका कोई नामांकन नहीं है. नीति को ढीला करें.
- **आपसे ऐसा कोड माँगा जाता है जो आप बना नहीं सकते** (आपका फ़ोन और आपके
  पुनर्प्राप्ति कोड खो गए): आपका खाता नामांकित है. उस नामांकन को हटाएँ.

## MFA नीति को ढीला करें {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

यह नीति को वापस `optional` पर सेट कर देता है. यह बिना रीस्टार्ट के आपके अगले लॉगिन पर
लागू होता है. यह केवल `optional` ही सेट करता है, इसलिए यह प्रवर्तन को वापस चालू नहीं कर सकता.

## किसी एक उपयोगकर्ता का TOTP नामांकन हटाएँ {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

अगर नीति में अब भी उस उपयोगकर्ता के लिए MFA आवश्यक है, तो वे आगे नामांकन
दीवार से टकराएँगे, इसलिए `reset-mfa-policy` भी चलाएँ, लॉग इन करें और सेटिंग्स से फिर से नामांकन करें.

## भूला हुआ पासवर्ड रीसेट करें {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

`[password]` छोड़ दें तो CLI एक जनरेट किया गया अस्थायी पासवर्ड प्रिंट करता है. दोनों ही स्थितियों में उपयोगकर्ता के सक्रिय सेशन, API कुंजियाँ और विफल लॉगिन थ्रॉटल विंडो साफ़ हो जाते हैं, और SnapOtter उनके अगले लॉगिन पर पासवर्ड बदलने की माँग करता है.

## एडमिन खाता बूटस्ट्रैप करें {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

जब कोई भी मौजूदा एडमिन खाता साइन इन न कर सके तब इसका उपयोग करें. `[username]` डिफ़ॉल्ट रूप से `DEFAULT_USERNAME` (`admin`) होता है, और `[password]` छोड़ने पर एक अस्थायी पासवर्ड प्रिंट होता है जिसे पहले लॉगिन पर बदलना आवश्यक है.

## थ्रॉटल या निष्क्रिय किए गए उपयोगकर्ता को अनलॉक करें {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

यह Redis में `LOGIN_THROTTLED` विंडो को साफ़ करता है और यदि उपयोगकर्ता निष्क्रिय था तो खाते की भूमिका बहाल करता है.

## पुरानी इमेज और फ़ॉलबैक {#older-images-and-fallbacks}

`snapotter-admin` रैपर के अस्तित्व में आने से पहले बनी किसी इमेज पर, स्क्रिप्ट को सीधे
कॉल करें:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

किसी भी संस्करण पर अंतिम उपाय के रूप में, नीति को डेटाबेस में सेट करें. ऑल-इन-वन
इमेज पर Postgres कंटेनर के भीतर चलता है:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

मल्टी-कंटेनर सेटअप पर, इसके बजाय `psql` को अपने खुद के `DATABASE_URL` की ओर इंगित करें.

## SSO से बाहर लॉक हैं, MFA से नहीं? {#locked-out-of-sso-not-mfa}

अगर कोई प्रवर्तित SSO लॉगिन विफल हो रहा है, तो इसके बजाय ब्रेक-ग्लास लोकल खाते का उपयोग करें:
SSO लागू करने से पहले सेटिंग्स > सुरक्षा के अंतर्गत `ssoBreakGlassUsername` को किसी लोकल एडमिन पर
सेट करें, और उस खाते के पासवर्ड से लॉग इन करें.
