---
description: "Налаштуйте єдиний вхід SAML 2.0 для SnapOtter. Покрокові інструкції для Okta, Azure AD / Entra ID, Google Workspace та інших постачальників ідентифікації SAML."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: add37313b42d
---

# SAML SSO {#saml-sso}

SnapOtter підтримує SAML 2.0 для єдиного входу. Користувачі можуть входити через зовнішнього постачальника ідентифікації (Okta, Azure AD / Entra ID, Google Workspace чи будь-який стандартний IdP SAML 2.0) замість локальної автентифікації за іменем користувача та паролем.

::: tip Функція для підприємств
SAML SSO потребує ліцензії **team** чи **enterprise** із функцією `saml_sso`. Якщо `SAML_ENABLED=true` встановлено без дійсної ліцензії, маршрути SAML тихо пропускаються, а в журнал записується попередження.
:::

## Передумови {#prerequisites}

- Запущений інстанс SnapOtter, доступний за публічним URL
- `EXTERNAL_URL` встановлено на цей публічний URL (наприклад, `https://photos.example.com`)
- Ключ ліцензії team чи enterprise із функцією `saml_sso`
- Адміністративний доступ до вашого постачальника ідентифікації SAML

## Швидкий старт {#quick-start}

Додайте ці змінні середовища до вашого `docker-compose.yml`:

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

Перезапустіть контейнер. На сторінці входу з'являється кнопка "Sign in with SAML" (або мітка, встановлена `SAML_PROVIDER_NAME`).

## Довідник з налаштувань {#configuration-reference}

| Змінна | За замовчуванням | Опис |
|---|---|---|
| `SAML_ENABLED` | `false` | Увімкнути вхід SAML. |
| `SAML_IDP_SSO_URL` | | URL ендпоінта SSO IdP. **Обов'язково**, коли SAML увімкнено. |
| `SAML_IDP_CERTIFICATE` | | Сертифікат підпису X.509 IdP у форматі PEM (сам текст сертифіката, а не шлях до файлу). **Обов'язково**, коли SAML увімкнено. |
| `EXTERNAL_URL` | | Публічний URL, за яким доступний SnapOtter. **Обов'язково**, коли SAML увімкнено. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI, що надсилається до IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL служби Assertion Consumer Service (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Автоматично створювати локальний обліковий запис користувача під час першого входу SAML. |
| `SAML_AUTO_LINK_USERS` | `false` | Пов'язати ідентичність SAML з наявним локальним користувачем, якщо адреса електронної пошти збігається. |
| `SAML_DEFAULT_ROLE` | `user` | Роль, що призначається автоматично створеним користувачам SAML. Одна з `admin`, `editor` чи `user`. |
| `SAML_PROVIDER_NAME` | | Відображувана мітка для кнопки входу SAML на фронтенді (наприклад, "Okta", "Azure AD"). Якщо порожнє, кнопка показує "SAML". |
| `SAML_USERNAME_ATTRIBUTE` | | Атрибут твердження SAML, що використовується як ім'я користувача. Якщо порожнє, повертається до локальної частини електронної пошти, потім до NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Атрибут твердження SAML, що використовується як адреса електронної пошти користувача. |

Сервер відмовляється запускатися, якщо `SAML_ENABLED=true` і будь-яка з трьох обов'язкових змінних (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) відсутня.

::: details Примітки з безпеки
Обидва `wantAuthnResponseSigned` та `wantAssertionsSigned` жорстко закодовані на `true`. SnapOtter відхиляє непідписані чи неправильно підписані відповіді SAML. Твердження від довіреного IdP розглядаються як такі, що мають підтверджену електронну пошту.

Підтримується лише вхід, ініційований SP. SnapOtter не підтримує вхід, ініційований IdP (небажаний), чи Single Logout (SLO). Вихід зі SnapOtter не виводить користувача з IdP.
:::

## Метадані SP та URL {#sp-metadata-and-urls}

Вашому IdP потрібні три значення від SnapOtter:

| Поле | Значення |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Наприклад, якщо `EXTERNAL_URL` дорівнює `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Ендпоінт метаданих: `https://photos.example.com/api/auth/saml/metadata` (повертає XML)

Деякі IdP можуть імпортувати URL метаданих SP безпосередньо, що автоматично заповнює ACS URL та Entity ID.

## Налаштування постачальника {#provider-setup}

### Okta {#okta}

1. У консолі адміністратора Okta перейдіть до **Applications > Create App Integration**.
2. Виберіть **SAML 2.0** і натисніть **Next**.
3. Встановіть назву (наприклад, "SnapOtter") і натисніть **Next**.
4. Налаштуйте параметри SAML:
   - **Single sign-on URL**: Ваш ACS URL (наприклад, `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Ваш Entity ID (наприклад, `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. У розділі **Attribute Statements** додайте `email`, зіставлений з `user.email`.
6. Натисніть **Next**, потім **Finish**.
7. Перейдіть на вкладку **Sign On**, натисніть **View SAML setup instructions** і скопіюйте:
   - **Identity Provider Single Sign-On URL** у `SAML_IDP_SSO_URL`
   - **X.509 Certificate** у `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. У порталі Azure перейдіть до **Microsoft Entra ID > Enterprise applications > New application**.
2. Натисніть **Create your own application**, назвіть його "SnapOtter" і виберіть **Integrate any other application you don't find in the gallery**.
3. Перейдіть до **Single sign-on > SAML** і натисніть **Edit** у секції **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Ваш Entity ID (наприклад, `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Ваш ACS URL (наприклад, `https://photos.example.com/api/auth/saml/callback`)
4. У розділі **SAML Certificates** завантажте **Certificate (Base64)**.
5. У розділі **Set up SnapOtter** скопіюйте **Login URL**.
6. Встановіть `SAML_IDP_SSO_URL` на Login URL, а `SAML_IDP_CERTIFICATE` на вміст завантаженого сертифіката.
7. Призначте користувачів чи групи застосунку в розділі **Users and groups**.

### Google Workspace {#google-workspace}

1. У консолі адміністратора Google перейдіть до **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Назвіть застосунок "SnapOtter" і натисніть **Continue**.
3. На сторінці **Google Identity Provider details** скопіюйте **SSO URL** і завантажте **Certificate**. Натисніть **Continue**.
4. Налаштуйте деталі постачальника послуг:
   - **ACS URL**: Ваш ACS URL (наприклад, `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Ваш Entity ID (наприклад, `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Натисніть **Continue**, потім **Finish**.
6. Увімкніть застосунок (**ON**) для ваших організаційних підрозділів.
7. Встановіть `SAML_IDP_SSO_URL` на SSO URL із кроку 3, а `SAML_IDP_CERTIFICATE` на вміст завантаженого сертифіката.

### Загальний IdP SAML 2.0 {#generic-saml-2-0-idp}

Для будь-якого постачальника ідентифікації, сумісного з SAML 2.0:

1. Створіть новий застосунок/постачальника послуг SAML у вашому IdP.
2. Встановіть **ACS URL** на `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Встановіть **Entity ID** / **Audience** на `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Налаштуйте IdP надсилати електронну пошту користувача в атрибуті з іменем `email` (або встановіть `SAML_EMAIL_ATTRIBUTE` відповідно до імені атрибута вашого IdP).
5. Скопіюйте **IdP SSO URL** та **сертифікат підпису** в `SAML_IDP_SSO_URL` та `SAML_IDP_CERTIFICATE`.

## Провізіювання користувачів {#user-provisioning}

### Автоматичне створення {#auto-create}

Коли `SAML_AUTO_CREATE_USERS` дорівнює `true` (за замовчуванням), локальний обліковий запис користувача створюється під час першого входу через SAML. Роль встановлюється на `SAML_DEFAULT_ROLE`.

Ім'я користувача виводиться в такому порядку:

1. Значення атрибута твердження, вказаного в `SAML_USERNAME_ATTRIBUTE` (якщо встановлено й присутнє)
2. Локальна частина адреси електронної пошти (усе перед `@`)
3. SAML NameID

Якщо виникає колізія імен користувачів, додається числовий суфікс (наприклад, `jane` стає `jane_2`).

### Автоматичне пов'язування {#auto-link}

Коли `SAML_AUTO_LINK_USERS` дорівнює `true`, SnapOtter пов'язує ідентичність SAML з наявним локальним обліковим записом, якщо адреси електронної пошти збігаються. Це корисно, коли ви маєте попередньо створені облікові записи користувачів і хочете, щоб вони почали використовувати SSO без втрати даних.

::: warning 
Вмикайте автоматичне пов'язування лише якщо ви довіряєте вашому IdP SAML у перевірці адрес електронної пошти. Неперевірена електронна пошта від неправильно налаштованого IdP може дозволити комусь захопити обліковий запис іншого користувача.
:::

### Зіставлення атрибутів {#attribute-mapping}

| Поле SnapOtter | Джерело | Налаштування |
|---|---|---|
| Email | Атрибут твердження | `SAML_EMAIL_ATTRIBUTE` (за замовчуванням: `email`) |
| Ім'я користувача | Атрибут твердження, email чи NameID | `SAML_USERNAME_ATTRIBUTE` (див. порядок виведення вище) |
| External ID | NameID | Завжди SAML NameID, не налаштовується |

## Примусове застосування SSO {#sso-enforcement}

Якщо ви хочете вимагати від усіх користувачів входити через SAML (або OIDC) і заблокувати локальний вхід за паролем, увімкніть примусове застосування SSO:

1. Переконайтеся, що функція для підприємств `sso_enforcement` ліцензована (доступна на планах team та enterprise).
2. У **Admin Settings > Security** увімкніть перемикач **SSO Enforcement**.
3. Встановіть **break-glass username**: це один локальний обліковий запис, який усе одно може входити з паролем, для екстреного доступу, якщо IdP недоступний.

Коли примусове застосування SSO активне, будь-яка спроба локального входу (окрім користувача break-glass) повертає помилку 403 із повідомленням "Local password login is disabled. Please use SSO."

::: tip 
Завжди налаштовуйте break-glass username перед увімкненням примусового застосування SSO. Без нього ви можете втратити доступ до SnapOtter, якщо ваш IdP вийде з ладу.
:::

## Використання SAML разом з OIDC {#using-saml-alongside-oidc}

SAML та OIDC можна ввімкнути одночасно. Коли обидва активні, на сторінці входу показуються окремі кнопки для кожного постачальника (з мітками `SAML_PROVIDER_NAME` та `OIDC_PROVIDER_NAME`). Користувачі можуть входити будь-яким методом.

Обидва постачальники незалежно поділяють ті самі налаштування автоматичного створення, автоматичного пов'язування та примусового застосування SSO: кожен має власні змінні `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` та `*_DEFAULT_ROLE`.

## Усунення несправностей {#troubleshooting}

### Не вдалося перевірити твердження {#assertion-validation-failed}

Підпис відповіді SAML чи підпис твердження не вдалося перевірити. Перевірте:

- Сертифікат у `SAML_IDP_CERTIFICATE` збігається з поточним сертифікатом підпису у вашому IdP (сертифікати ротуються, тож перевірте термін дії)
- Сертифікат у форматі PEM (починається з `-----BEGIN CERTIFICATE-----`)
- Сертифікат є повним текстом, а не шляхом до файлу
- ACS URL та Entity ID, налаштовані у вашому IdP, точно збігаються зі значеннями SnapOtter (схема, хост, порт, шлях)

### Відсутні атрибути {#missing-attributes}

Якщо імена користувачів чи електронні пошти порожні після входу, ваш IdP може не надсилати очікувані атрибути. Перевірте:

- Ваш IdP налаштований випускати атрибут `email` (або те, на що встановлено `SAML_EMAIL_ATTRIBUTE`)
- Якщо використовується `SAML_USERNAME_ATTRIBUTE`, переконайтеся, що цей атрибут включено до твердження
- Деякі IdP потребують явної конфігурації зіставлення атрибутів перед випуском претензій

### Відхилення годинника {#clock-skew}

Твердження SAML включають умови міток часу (`NotBefore`, `NotOnOrAfter`). Якщо годинник вашого сервера й годинник IdP не синхронізовані, перевірка твердження не вдається. Запустіть NTP на обох машинах, щоб узгодити годинники.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Це попередження з'являється в журналах сервера, коли `SAML_ENABLED=true`, але ліцензія не включає функцію `saml_sso`. Перевірте ваш ключ ліцензії та план. Функція `saml_sso` доступна на планах team та enterprise.

### Вхід перенаправляє назад з помилкою {#login-redirects-back-with-error}

Якщо натискання кнопки входу SAML перенаправляє назад на сторінку входу з помилкою, перевірте журнали сервера для деталей. Поширені причини:

- IdP SSO URL недоступний із сервера
- IdP відхилив запит автентифікації (перевірте журнали аудиту IdP)
- IdP повернув непідписану відповідь (SnapOtter вимагає, щоб і відповідь, і твердження були підписані)
