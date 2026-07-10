---
description: "أعدّ الدخول الموحّد عبر SAML 2.0 لـ SnapOtter. أدلة تفصيلية خطوة بخطوة لـ Okta وAzure AD / Entra ID وGoogle Workspace ومزودي هوية SAML الآخرين."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: fd0b07fe2fe4
---

# SAML SSO {#saml-sso}

تدعم SnapOtter بروتوكول SAML 2.0 للدخول الموحّد. يمكن للمستخدمين تسجيل الدخول عبر مزوّد هوية خارجي (Okta أو Azure AD / Entra ID أو Google Workspace أو أي مزوّد هوية SAML 2.0 قياسي) بدلاً من مصادقة اسم المستخدم/كلمة المرور المحلية.

::: tip ميزة للمؤسسات
يتطلب SAML SSO ترخيص **team** أو **enterprise** مع ميزة `saml_sso`. إذا ضُبط `SAML_ENABLED=true` من دون ترخيص صالح، فإن مسارات SAML تُتخطى بصمت ويُسجَّل تحذير.
:::

## المتطلبات الأساسية {#prerequisites}

- نسخة SnapOtter قيد التشغيل يمكن الوصول إليها على عنوان URL عام
- ضبط `EXTERNAL_URL` على عنوان URL العام هذا (مثل `https://photos.example.com`)
- مفتاح ترخيص team أو enterprise مع ميزة `saml_sso`
- وصول المسؤول إلى مزوّد هوية SAML الخاص بك

## بداية سريعة {#quick-start}

أضف متغيرات البيئة هذه إلى `docker-compose.yml`:

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

أعد تشغيل الحاوية. يظهر زر "تسجيل الدخول عبر SAML" (أو التسمية المضبوطة بواسطة `SAML_PROVIDER_NAME`) على صفحة تسجيل الدخول.

## مرجع الإعداد {#configuration-reference}

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `SAML_ENABLED` | `false` | تفعيل تسجيل الدخول عبر SAML. |
| `SAML_IDP_SSO_URL` | | عنوان URL لنقطة نهاية SSO لمزوّد الهوية. **مطلوب** عند تفعيل SAML. |
| `SAML_IDP_CERTIFICATE` | | شهادة توقيع X.509 لمزوّد الهوية بصيغة PEM (نص الشهادة نفسه، وليس مسار ملف). **مطلوب** عند تفعيل SAML. |
| `EXTERNAL_URL` | | عنوان URL العام حيث يمكن الوصول إلى SnapOtter. **مطلوب** عند تفعيل SAML. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | معرّف كيان مزوّد الخدمة / عنوان URI للجمهور المُرسَل إلى مزوّد الهوية. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | عنوان URL لخدمة استهلاك التأكيد (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | إنشاء حساب مستخدم محلي تلقائيًا عند أول تسجيل دخول عبر SAML. |
| `SAML_AUTO_LINK_USERS` | `false` | ربط هوية SAML بمستخدم محلي موجود إذا تطابق عنوان البريد الإلكتروني. |
| `SAML_DEFAULT_ROLE` | `user` | الدور المخصَّص لمستخدمي SAML المُنشأين تلقائيًا. واحد من `admin` أو `editor` أو `user`. |
| `SAML_PROVIDER_NAME` | | تسمية العرض لزر تسجيل الدخول عبر SAML على الواجهة الأمامية (مثل "Okta" أو "Azure AD"). إذا كانت فارغة، يقول الزر "SAML". |
| `SAML_USERNAME_ATTRIBUTE` | | سمة تأكيد SAML المستخدمة كاسم مستخدم. إذا كانت فارغة، يعود إلى الجزء المحلي من البريد الإلكتروني، ثم NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | سمة تأكيد SAML المستخدمة كعنوان بريد إلكتروني للمستخدم. |

يرفض الخادم البدء إذا كان `SAML_ENABLED=true` وكان أي من المتغيرات الثلاثة المطلوبة (`SAML_IDP_SSO_URL`، `SAML_IDP_CERTIFICATE`، `EXTERNAL_URL`) مفقودًا.

::: details ملاحظات أمنية
كلٌّ من `wantAuthnResponseSigned` و`wantAssertionsSigned` مضبوط بشكل ثابت على `true`. ترفض SnapOtter استجابات SAML غير الموقَّعة أو الموقَّعة بشكل غير سليم. تُعامَل التأكيدات من مزوّد هوية موثوق كبريد إلكتروني موثَّق.

يُدعم تسجيل الدخول الذي يبدأه مزوّد الخدمة فقط. لا تدعم SnapOtter تسجيل الدخول الذي يبدأه مزوّد الهوية (غير المطلوب) أو تسجيل الخروج الموحّد (SLO). لا يؤدي تسجيل الخروج من SnapOtter إلى تسجيل خروج المستخدم من مزوّد الهوية.
:::

## بيانات وصف مزوّد الخدمة وعناوين URL {#sp-metadata-and-urls}

يحتاج مزوّد الهوية إلى ثلاث قيم من SnapOtter:

| الحقل | القيمة |
|---|---|
| **عنوان URL لـ ACS** (خدمة استهلاك التأكيد) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **معرّف الكيان** / **عنوان URI للجمهور** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **بيانات وصف مزوّد الخدمة** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

على سبيل المثال، إذا كان `EXTERNAL_URL` يساوي `https://photos.example.com`:

- عنوان URL لـ ACS: `https://photos.example.com/api/auth/saml/callback`
- معرّف الكيان: `https://photos.example.com/api/auth/saml/metadata`
- نقطة نهاية بيانات الوصف: `https://photos.example.com/api/auth/saml/metadata` (تُرجع XML)

يمكن لبعض مزودي الهوية استيراد عنوان URL لبيانات وصف مزوّد الخدمة مباشرةً، مما يملأ تلقائيًا عنوان URL لـ ACS ومعرّف الكيان.

## إعداد المزوّد {#provider-setup}

### Okta {#okta}

1. في وحدة تحكم مسؤول Okta، انتقل إلى **Applications > Create App Integration**.
2. اختر **SAML 2.0** وانقر **Next**.
3. اضبط اسمًا (مثل "SnapOtter") وانقر **Next**.
4. اضبط إعدادات SAML:
   - **Single sign-on URL**: عنوان URL لـ ACS الخاص بك (مثل `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: معرّف الكيان الخاص بك (مثل `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. ضمن **Attribute Statements**، أضف `email` مربوطًا بـ `user.email`.
6. انقر **Next**، ثم **Finish**.
7. انتقل إلى علامة تبويب **Sign On**، وانقر **View SAML setup instructions**، وانسخ:
   - **Identity Provider Single Sign-On URL** إلى `SAML_IDP_SSO_URL`
   - **X.509 Certificate** إلى `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. في بوابة Azure، انتقل إلى **Microsoft Entra ID > Enterprise applications > New application**.
2. انقر **Create your own application**، وسمِّها "SnapOtter"، واختر **Integrate any other application you don't find in the gallery**.
3. انتقل إلى **Single sign-on > SAML** وانقر **Edit** على قسم **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: معرّف الكيان الخاص بك (مثل `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: عنوان URL لـ ACS الخاص بك (مثل `https://photos.example.com/api/auth/saml/callback`)
4. ضمن **SAML Certificates**، نزّل **Certificate (Base64)**.
5. ضمن **Set up SnapOtter**، انسخ **Login URL**.
6. اضبط `SAML_IDP_SSO_URL` على Login URL و`SAML_IDP_CERTIFICATE` على محتويات الشهادة المنزَّلة.
7. عيّن مستخدمين أو مجموعات للتطبيق ضمن **Users and groups**.

### Google Workspace {#google-workspace}

1. في وحدة تحكم مسؤول Google، انتقل إلى **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. سمِّ التطبيق "SnapOtter" وانقر **Continue**.
3. في صفحة **Google Identity Provider details**، انسخ **SSO URL** ونزّل **Certificate**. انقر **Continue**.
4. اضبط تفاصيل مزوّد الخدمة:
   - **ACS URL**: عنوان URL لـ ACS الخاص بك (مثل `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: معرّف الكيان الخاص بك (مثل `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. انقر **Continue**، ثم **Finish**.
6. شغّل التطبيق **ON** لوحداتك التنظيمية.
7. اضبط `SAML_IDP_SSO_URL` على SSO URL من الخطوة 3 و`SAML_IDP_CERTIFICATE` على محتويات الشهادة المنزَّلة.

### مزوّد هوية SAML 2.0 عام {#generic-saml-2-0-idp}

لأي مزوّد هوية متوافق مع SAML 2.0:

1. أنشئ تطبيق/مزوّد خدمة SAML جديدًا في مزوّد الهوية الخاص بك.
2. اضبط **عنوان URL لـ ACS** على `${EXTERNAL_URL}/api/auth/saml/callback`.
3. اضبط **معرّف الكيان** / **الجمهور** على `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. اضبط مزوّد الهوية لإرسال البريد الإلكتروني للمستخدم في سمة باسم `email` (أو اضبط `SAML_EMAIL_ATTRIBUTE` ليطابق اسم سمة مزوّد الهوية الخاص بك).
5. انسخ **عنوان URL لـ SSO لمزوّد الهوية** و**شهادة التوقيع** إلى `SAML_IDP_SSO_URL` و`SAML_IDP_CERTIFICATE`.

## توفير المستخدمين {#user-provisioning}

### الإنشاء التلقائي {#auto-create}

عندما يكون `SAML_AUTO_CREATE_USERS` يساوي `true` (الافتراضي)، يُنشأ حساب مستخدم محلي أول مرة يسجّل فيها شخص الدخول عبر SAML. يُضبط الدور على `SAML_DEFAULT_ROLE`.

يُشتق اسم المستخدم بهذا الترتيب:

1. قيمة سمة التأكيد المحددة بواسطة `SAML_USERNAME_ATTRIBUTE` (إذا كانت مضبوطة وموجودة)
2. الجزء المحلي من عنوان البريد الإلكتروني (كل ما قبل `@`)
3. NameID لـ SAML

إذا حدث تعارض في اسم المستخدم، يُضاف لاحقة رقمية (مثلاً يصبح `jane` هو `jane_2`).

### الربط التلقائي {#auto-link}

عندما يكون `SAML_AUTO_LINK_USERS` يساوي `true`، تربط SnapOtter هوية SAML بحساب محلي موجود إذا تطابقت عناوين البريد الإلكتروني. هذا مفيد عندما يكون لديك حسابات مستخدمين مُنشأة مسبقًا وتريدها أن تبدأ باستخدام SSO من دون فقدان بياناتها.

::: warning 
فعّل الربط التلقائي فقط إذا كنت تثق في أن مزوّد هوية SAML الخاص بك يتحقق من عناوين البريد الإلكتروني. قد يسمح بريد إلكتروني غير موثَّق من مزوّد هوية مُهيَّأ بشكل خاطئ لشخص ما بالاستيلاء على حساب مستخدم آخر.
:::

### تعيين السمات {#attribute-mapping}

| حقل SnapOtter | المصدر | الإعداد |
|---|---|---|
| البريد الإلكتروني | سمة التأكيد | `SAML_EMAIL_ATTRIBUTE` (الافتراضي: `email`) |
| اسم المستخدم | سمة التأكيد أو البريد الإلكتروني أو NameID | `SAML_USERNAME_ATTRIBUTE` (انظر ترتيب الاشتقاق أعلاه) |
| المعرّف الخارجي | NameID | دائمًا NameID لـ SAML، غير قابل للضبط |

## فرض SSO {#sso-enforcement}

إذا كنت تريد إلزام جميع المستخدمين بتسجيل الدخول عبر SAML (أو OIDC) وحظر تسجيل الدخول بكلمة المرور المحلية، فعّل فرض SSO:

1. تأكد من ترخيص ميزة `sso_enforcement` للمؤسسات (متاحة على خطتَي team وenterprise).
2. في **Admin Settings > Security**، فعّل مفتاح **SSO Enforcement**.
3. اضبط **اسم مستخدم break-glass**: هذا هو الحساب المحلي الوحيد الذي لا يزال بإمكانه تسجيل الدخول بكلمة مرور، للوصول الطارئ إذا تعذّر الوصول إلى مزوّد الهوية.

عندما يكون فرض SSO نشطًا، فإن أي محاولة تسجيل دخول محلي (باستثناء مستخدم break-glass) تُرجع خطأ 403 مع الرسالة "Local password login is disabled. Please use SSO."

::: tip 
اضبط دائمًا اسم مستخدم break-glass قبل تفعيل فرض SSO. من دونه، قد تُحظَر من الوصول إلى SnapOtter إذا تعطّل مزوّد الهوية الخاص بك.
:::

## استخدام SAML إلى جانب OIDC {#using-saml-alongside-oidc}

يمكن تفعيل SAML وOIDC في آنٍ واحد. عندما يكون كلاهما نشطًا، تعرض صفحة تسجيل الدخول أزرارًا منفصلة لكل مزوّد (مُسمّاة بواسطة `SAML_PROVIDER_NAME` و`OIDC_PROVIDER_NAME`). يمكن للمستخدمين تسجيل الدخول بأي من الطريقتين.

يشترك المزوّدان في إعدادات الإنشاء التلقائي والربط التلقائي وفرض SSO نفسها بشكل مستقل: لكلٍّ منهما متغيراته الخاصة `*_AUTO_CREATE_USERS` و`*_AUTO_LINK_USERS` و`*_DEFAULT_ROLE`.

## استكشاف الأخطاء وإصلاحها {#troubleshooting}

### فشل التحقق من صحة التأكيد {#assertion-validation-failed}

تعذّر التحقق من توقيع استجابة SAML أو توقيع التأكيد. تحقق من:

- أن الشهادة في `SAML_IDP_CERTIFICATE` تطابق شهادة التوقيع الحالية في مزوّد الهوية الخاص بك (تدور الشهادات، لذا تحقق من انتهاء الصلاحية)
- أن الشهادة بصيغة PEM (تبدأ بـ `-----BEGIN CERTIFICATE-----`)
- أن الشهادة هي النص الكامل، وليست مسار ملف
- أن عنوان URL لـ ACS ومعرّف الكيان المضبوطين في مزوّد الهوية الخاص بك يطابقان قيم SnapOtter تمامًا (المخطط والمضيف والمنفذ والمسار)

### سمات مفقودة {#missing-attributes}

إذا كانت أسماء المستخدمين أو عناوين البريد الإلكتروني فارغة بعد تسجيل الدخول، فقد لا يرسل مزوّد الهوية الخاص بك السمات المتوقعة. تحقق من:

- أن مزوّد الهوية الخاص بك مضبوط لإطلاق سمة `email` (أو أيًّا كان ما ضُبط عليه `SAML_EMAIL_ATTRIBUTE`)
- إذا كنت تستخدم `SAML_USERNAME_ATTRIBUTE`، فتحقق من أن تلك السمة مضمَّنة في التأكيد
- يتطلب بعض مزودي الهوية إعداد تعيين سمات صريحًا قبل إطلاق المطالبات

### انحراف الساعة {#clock-skew}

تتضمن تأكيدات SAML شروط الطابع الزمني (`NotBefore`، `NotOnOrAfter`). إذا كانت ساعة خادمك وساعة مزوّد الهوية غير متزامنتين، يفشل التحقق من صحة التأكيد. شغّل NTP على كلا الجهازين لإبقاء الساعات متوائمة.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

يظهر هذا التحذير في سجلات الخادم عندما يكون `SAML_ENABLED=true` لكن الترخيص لا يتضمن ميزة `saml_sso`. تحقق من مفتاح ترخيصك وخطتك. ميزة `saml_sso` متاحة على خطتَي team وenterprise.

### تسجيل الدخول يعيد التوجيه مع خطأ {#login-redirects-back-with-error}

إذا كان النقر على زر تسجيل الدخول عبر SAML يعيد التوجيه إلى صفحة تسجيل الدخول مع خطأ، فتحقق من سجلات الخادم للحصول على التفاصيل. الأسباب الشائعة:

- عنوان URL لـ SSO لمزوّد الهوية غير قابل للوصول من الخادم
- رفض مزوّد الهوية طلب المصادقة (تحقق من سجلات تدقيق مزوّد الهوية)
- أرجع مزوّد الهوية استجابة غير موقَّعة (تتطلب SnapOtter توقيع كلٍّ من الاستجابة والتأكيد)
