---
description: "أعدّ الدخول الموحّد باستخدام OpenID Connect. أدلة تفصيلية خطوة بخطوة لـ Keycloak وAuthentik وGoogle ومزودي OIDC الآخرين."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 3bb7beb03713
---

# OIDC / الدخول الموحّد {#oidc-single-sign-on}

تدعم SnapOtter بروتوكول OpenID Connect (OIDC) للدخول الموحّد. يمكن للمستخدمين تسجيل الدخول بمزوّد هوية خارجي مثل Keycloak أو Authentik أو Google بدلاً من (أو إلى جانب) مصادقة اسم المستخدم/كلمة المرور المحلية.

::: tip انظر أيضًا
[SAML SSO](/ar/guide/saml) | [توفير SCIM](/ar/guide/scim) | [المستخدمون والأدوار والأذونات](/ar/guide/users-roles)
:::

## بداية سريعة {#quick-start}

أضف متغيرات البيئة هذه إلى `docker-compose.yml`:

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

عنوان URI لإعادة التوجيه لمزوّدك هو دائمًا:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

على سبيل المثال، إذا كان `EXTERNAL_URL` يساوي `https://photos.example.com`، فاضبط عنوان URI لإعادة التوجيه لمزوّدك على `https://photos.example.com/api/auth/oidc/callback`.

## مرجع الإعداد {#configuration-reference}

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `OIDC_ENABLED` | `false` | تفعيل تسجيل الدخول عبر OIDC. يظهر زر "تسجيل الدخول عبر SSO" على صفحة تسجيل الدخول. |
| `OIDC_ISSUER_URL` | | عنوان URL لمُصدِّر المزوّد. يجب أن يدعم اكتشاف OIDC (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | معرّف عميل OAuth المسجَّل لدى مزوّدك. |
| `OIDC_CLIENT_SECRET` | | سر عميل OAuth. |
| `OIDC_SCOPES` | `openid profile email` | قائمة نطاقات مفصولة بمسافات لطلبها. |
| `OIDC_AUTO_CREATE_USERS` | `true` | إنشاء حساب مستخدم محلي تلقائيًا عند أول تسجيل دخول عبر OIDC. |
| `OIDC_DEFAULT_ROLE` | `user` | الدور المخصَّص لمستخدمي OIDC المُنشأين تلقائيًا. واحد من `admin` أو `editor` أو `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | ربط هوية OIDC بمستخدم محلي موجود إذا تطابق عنوان البريد الإلكتروني. |
| `OIDC_PROVIDER_NAME` | | الاسم المعروض على زر تسجيل الدخول (مثل "Keycloak" أو "Google"). إذا كان فارغًا، يقول الزر "SSO". |
| `OIDC_CLOCK_TOLERANCE` | `30` | تسامح انحراف الساعة بالثواني للتحقق من صحة الرمز. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | مطالبة رمز الهوية المستخدمة كاسم مستخدم للحسابات الجديدة. |
| `EXTERNAL_URL` | | عنوان URL العام حيث يمكن الوصول إلى SnapOtter. مطلوب لكي يبني OIDC عنوان URI الصحيح لإعادة التوجيه. |
| `COOKIE_SECRET` | يُنشأ تلقائيًا | سر لتوقيع ملفات تعريف ارتباط الجلسة. اضبط هذا صراحةً عند تشغيل نسخ متماثلة متعددة. |

## أدلة المزوّدين {#provider-guides}

### Keycloak {#keycloak}

1. أنشئ عالَمًا جديدًا (أو استخدم عالَمًا موجودًا).
2. انتقل إلى **Clients** وأنشئ عميلاً جديدًا:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (سري)
   - **Authentication flow**: Standard flow (Authorization Code)
3. ضمن علامة تبويب **Settings** للعميل، اضبط **Valid redirect URIs** على عنوان رد الاتصال الخاص بك (مثل `https://photos.example.com/api/auth/oidc/callback`).
4. انسخ **Client secret** من علامة تبويب **Credentials**.
5. اضبط `OIDC_ISSUER_URL` على `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. في واجهة المسؤول، انتقل إلى **Applications > Providers** وأنشئ **OAuth2/OpenID Provider** جديدًا.
   - **Client type**: Confidential
   - **Redirect URIs**: عنوان رد الاتصال الخاص بك
   - **Signing key**: اختر مفتاحًا موجودًا أو أنشئ واحدًا
2. أنشئ **Application** واربطه بالمزوّد.
3. انسخ **Client ID** و**Client Secret** من إعدادات المزوّد.
4. اضبط `OIDC_ISSUER_URL` على `https://authentik.example.com/application/o/snapotter/` (الشرطة المائلة اللاحقة مهمة).

### Google {#google}

1. انتقل إلى [Google Cloud Console](https://console.cloud.google.com/).
2. أنشئ مشروعًا (أو اختر مشروعًا موجودًا).
3. انتقل إلى **APIs & Services > OAuth consent screen** واضبطه.
4. انتقل إلى **APIs & Services > Credentials** وأنشئ **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: عنوان رد الاتصال الخاص بك
5. انسخ **Client ID** و**Client secret**.
6. اضبط `OIDC_ISSUER_URL` على `https://accounts.google.com`.
7. اضبط `OIDC_USERNAME_CLAIM` على `email` (لا توفّر Google `preferred_username`).

## توفير المستخدمين {#user-provisioning}

### الإنشاء التلقائي {#auto-create}

عندما يكون `OIDC_AUTO_CREATE_USERS` يساوي `true` (الافتراضي)، يُنشأ حساب مستخدم محلي أول مرة يسجّل فيها شخص الدخول عبر OIDC. يُؤخذ اسم المستخدم من المطالبة المحددة بواسطة `OIDC_USERNAME_CLAIM`، ويُضبط الدور على `OIDC_DEFAULT_ROLE`.

إذا حدث تعارض في اسم المستخدم، يُضاف لاحقة رقمية (مثلاً يصبح `jane` هو `jane_2`).

### الربط التلقائي {#auto-link}

عندما يكون `OIDC_AUTO_LINK_USERS` يساوي `true`، تربط SnapOtter هوية OIDC بحساب محلي موجود إذا تطابقت عناوين البريد الإلكتروني. هذا مفيد عندما يكون لديك حسابات مستخدمين مُنشأة مسبقًا وتريدها أن تبدأ باستخدام SSO من دون فقدان بياناتها.

::: warning 
فعّل الربط التلقائي فقط إذا كنت تثق في أن مزوّد OIDC يتحقق من عناوين البريد الإلكتروني. قد يسمح بريد إلكتروني غير موثَّق لشخص ما بالاستيلاء على حساب مستخدم آخر.
:::

### تعطيل تسجيل الدخول المحلي {#disabling-local-login}

لا يعطّل OIDC تسجيل الدخول المحلي باسم المستخدم/كلمة المرور. تظل كلتا الطريقتين متاحتين. لا يزال بإمكان المسؤولين تسجيل الدخول ببيانات الاعتماد المحلية إذا تعذّر الوصول إلى مزوّد OIDC.

## الشهادات الموقَّعة ذاتيًا {#self-signed-certificates}

إذا كان مزوّد OIDC الخاص بك يستخدم شهادة موقَّعة ذاتيًا أو شهادة مرجع مصادقة خاص، فركّب حزمة مرجع المصادقة داخل الحاوية ووجّه `NODE_EXTRA_CA_CERTS` إليها:

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
لا تضبط `NODE_TLS_REJECT_UNAUTHORIZED=0`. يؤدي هذا إلى تعطيل جميع عمليات التحقق من TLS ويشكّل خطرًا أمنيًا.
:::

## استكشاف الأخطاء وإصلاحها {#troubleshooting}

### عدم تطابق عنوان URI لإعادة التوجيه {#redirect-uri-mismatch}

أكثر الأخطاء شيوعًا. تحقق من هذه الاختلافات بين ما يتوقعه مزوّدك وما ترسله SnapOtter:

- `http` مقابل `https` - يجب أن يتطابق المخطط تمامًا
- الشرطة المائلة اللاحقة - بعض المزوّدين صارمون بشأن هذا
- رقم المنفذ - أدرج المنفذ إذا كان غير قياسي
- المسار - يجب أن يكون `/api/auth/oidc/callback`

تحقق مرتين من `EXTERNAL_URL`. يجب أن يتطابق مع عنوان URL الذي يكتبه المستخدمون في متصفحهم.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

يستخدم مزوّد OIDC شهادة لا يثق بها Node.js. راجع [الشهادات الموقَّعة ذاتيًا](#self-signed-certificates) أعلاه.

### أخطاء انحراف الساعة {#clock-skew-errors}

إذا كانت ساعة خادمك وساعة مزوّد OIDC غير متزامنتين، فقد يفشل التحقق من صحة الرمز. زِد `OIDC_CLOCK_TOLERANCE` (الافتراضي 30 ثانية). الحل الأفضل هو تشغيل NTP على كلا الجهازين.

### "مزوّد OIDC غير قابل للوصول" {#oidc-provider-unreachable}

تجلب SnapOtter مستند اكتشاف المزوّد عند بدء التشغيل وأثناء تسجيل الدخول. تحقق من:

- تحليل DNS من داخل حاوية Docker (`docker exec snapotter nslookup auth.example.com`)
- قواعد جدار الحماية بين الحاوية والمزوّد
- قيمة `OIDC_ISSUER_URL` - يجب أن تكون قابلة للوصول من الخادم، وليس فقط من متصفحك

### مطالبات مفقودة {#missing-claims}

إذا كانت أسماء المستخدمين أو عناوين البريد الإلكتروني فارغة بعد تسجيل الدخول، فقد لا يُرجع مزوّدك المطالبات المتوقعة. تحقق من:

- النطاقات المضبوطة في `OIDC_SCOPES` تتضمن `profile` و`email`
- أن المزوّد مضبوط لتضمين المطالبة المحددة في `OIDC_USERNAME_CLAIM` في رمز الهوية
- يتطلب بعض المزوّدين إعداد مُخطِّط/نطاق صريحًا لإطلاق المطالبات
