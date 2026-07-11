---
description: "Настройте единый вход SAML 2.0 для SnapOtter. Пошаговые руководства для Okta, Azure AD / Entra ID, Google Workspace и других поставщиков удостоверений SAML."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: ddacfded782b
---

# SAML SSO {#saml-sso}

SnapOtter поддерживает SAML 2.0 для единого входа. Пользователи могут входить через внешнего поставщика удостоверений (Okta, Azure AD / Entra ID, Google Workspace или любой стандартный IdP SAML 2.0) вместо локальной аутентификации по имени пользователя и паролю.

::: tip Корпоративная функция
SAML SSO требует лицензии **team** или **enterprise** с функцией `saml_sso`. Если `SAML_ENABLED=true` задан без действительной лицензии, маршруты SAML молча пропускаются и записывается предупреждение.
:::

## Предварительные требования {#prerequisites}

- Работающий экземпляр SnapOtter, доступный по публичному URL
- `EXTERNAL_URL` установлен в этот публичный URL (например, `https://photos.example.com`)
- Лицензионный ключ team или enterprise с функцией `saml_sso`
- Доступ администратора к вашему поставщику удостоверений SAML

## Быстрый старт {#quick-start}

Добавьте эти переменные окружения в ваш `docker-compose.yml`:

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

Перезапустите контейнер. На странице входа появляется кнопка «Sign in with SAML» (или метка, заданная в `SAML_PROVIDER_NAME`).

## Справочник конфигурации {#configuration-reference}

| Переменная | По умолчанию | Описание |
|---|---|---|
| `SAML_ENABLED` | `false` | Включить вход через SAML. |
| `SAML_IDP_SSO_URL` | | URL конечной точки SSO у IdP. **Обязательно**, когда SAML включён. |
| `SAML_IDP_CERTIFICATE` | | Сертификат подписи X.509 у IdP в формате PEM (сам текст сертификата, а не путь к файлу). **Обязательно**, когда SAML включён. |
| `EXTERNAL_URL` | | Публичный URL, по которому доступен SnapOtter. **Обязательно**, когда SAML включён. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI, отправляемый IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL Assertion Consumer Service (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Автоматически создавать локальную учётную запись пользователя при первом входе через SAML. |
| `SAML_AUTO_LINK_USERS` | `false` | Связать удостоверение SAML с существующим локальным пользователем, если адрес электронной почты совпадает. |
| `SAML_DEFAULT_ROLE` | `user` | Роль, назначаемая автоматически создаваемым пользователям SAML. Одна из `admin`, `editor` или `user`. |
| `SAML_PROVIDER_NAME` | | Отображаемая метка для кнопки входа SAML на фронтенде (например, «Okta», «Azure AD»). Если пусто, на кнопке написано «SAML». |
| `SAML_USERNAME_ATTRIBUTE` | | Атрибут утверждения SAML, используемый как имя пользователя. Если пусто, используется локальная часть email, затем NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Атрибут утверждения SAML, используемый как адрес электронной почты пользователя. |

Сервер отказывается запускаться, если `SAML_ENABLED=true` и отсутствует любая из трёх обязательных переменных (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`).

::: details Замечания по безопасности
И `wantAuthnResponseSigned`, и `wantAssertionsSigned` жёстко заданы как `true`. SnapOtter отклоняет неподписанные или неправильно подписанные ответы SAML. Утверждения от доверенного IdP считаются подтверждёнными по электронной почте.

Поддерживается только вход, инициированный SP. SnapOtter не поддерживает вход, инициированный IdP (незапрошенный), или единый выход (SLO). Выход из SnapOtter не выполняет выход пользователя из IdP.
:::

## Метаданные и URL SP {#sp-metadata-and-urls}

Вашему IdP нужны три значения от SnapOtter:

| Поле | Значение |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Например, если `EXTERNAL_URL` равен `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Конечная точка метаданных: `https://photos.example.com/api/auth/saml/metadata` (возвращает XML)

Некоторые IdP могут импортировать URL метаданных SP напрямую, что автоматически заполняет ACS URL и Entity ID.

## Настройка провайдера {#provider-setup}

### Okta {#okta}

1. В административной консоли Okta перейдите в **Applications > Create App Integration**.
2. Выберите **SAML 2.0** и нажмите **Next**.
3. Задайте имя (например, «SnapOtter») и нажмите **Next**.
4. Настройте параметры SAML:
   - **Single sign-on URL**: Ваш ACS URL (например, `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Ваш Entity ID (например, `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. В разделе **Attribute Statements** добавьте `email`, сопоставленный с `user.email`.
6. Нажмите **Next**, затем **Finish**.
7. Перейдите на вкладку **Sign On**, нажмите **View SAML setup instructions** и скопируйте:
   - **Identity Provider Single Sign-On URL** в `SAML_IDP_SSO_URL`
   - **X.509 Certificate** в `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. В портале Azure перейдите в **Microsoft Entra ID > Enterprise applications > New application**.
2. Нажмите **Create your own application**, назовите его «SnapOtter» и выберите **Integrate any other application you don't find in the gallery**.
3. Перейдите в **Single sign-on > SAML** и нажмите **Edit** в разделе **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Ваш Entity ID (например, `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Ваш ACS URL (например, `https://photos.example.com/api/auth/saml/callback`)
4. В разделе **SAML Certificates** скачайте **Certificate (Base64)**.
5. В разделе **Set up SnapOtter** скопируйте **Login URL**.
6. Задайте `SAML_IDP_SSO_URL` равным Login URL, а `SAML_IDP_CERTIFICATE` равным содержимому скачанного сертификата.
7. Назначьте пользователей или группы приложению в разделе **Users and groups**.

### Google Workspace {#google-workspace}

1. В консоли администратора Google перейдите в **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Назовите приложение «SnapOtter» и нажмите **Continue**.
3. На странице **Google Identity Provider details** скопируйте **SSO URL** и скачайте **Certificate**. Нажмите **Continue**.
4. Настройте параметры поставщика услуг:
   - **ACS URL**: Ваш ACS URL (например, `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Ваш Entity ID (например, `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Нажмите **Continue**, затем **Finish**.
6. Включите приложение (**ON**) для ваших организационных подразделений.
7. Задайте `SAML_IDP_SSO_URL` равным SSO URL из шага 3, а `SAML_IDP_CERTIFICATE` равным содержимому скачанного сертификата.

### Универсальный IdP SAML 2.0 {#generic-saml-2-0-idp}

Для любого поставщика удостоверений, совместимого с SAML 2.0:

1. Создайте новое приложение SAML / поставщика услуг в вашем IdP.
2. Задайте **ACS URL** равным `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Задайте **Entity ID** / **Audience** равным `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Настройте IdP на отправку электронной почты пользователя в атрибуте с именем `email` (или задайте `SAML_EMAIL_ATTRIBUTE` в соответствии с именем атрибута вашего IdP).
5. Скопируйте **IdP SSO URL** и **сертификат подписи** в `SAML_IDP_SSO_URL` и `SAML_IDP_CERTIFICATE`.

## Провижининг пользователей {#user-provisioning}

### Автоматическое создание {#auto-create}

Когда `SAML_AUTO_CREATE_USERS` равен `true` (по умолчанию), локальная учётная запись пользователя создаётся при первом входе кого-либо через SAML. Роль устанавливается в `SAML_DEFAULT_ROLE`.

Имя пользователя выводится в следующем порядке:

1. Значение атрибута утверждения, указанного в `SAML_USERNAME_ATTRIBUTE` (если задано и присутствует)
2. Локальная часть адреса электронной почты (всё до `@`)
3. SAML NameID

Если возникает конфликт имён пользователей, добавляется числовой суффикс (например, `jane` становится `jane_2`).

### Автоматическое связывание {#auto-link}

Когда `SAML_AUTO_LINK_USERS` равен `true`, SnapOtter связывает удостоверение SAML с существующей локальной учётной записью, если адреса электронной почты совпадают. Это полезно, когда у вас есть заранее созданные учётные записи пользователей и вы хотите, чтобы они начали использовать SSO без потери своих данных.

::: warning 
Включайте автоматическое связывание, только если вы доверяете своему IdP SAML в проверке адресов электронной почты. Непроверенный адрес электронной почты от неправильно настроенного IdP может позволить кому-либо захватить учётную запись другого пользователя.
:::

### Сопоставление атрибутов {#attribute-mapping}

| Поле SnapOtter | Источник | Конфигурация |
|---|---|---|
| Email | Атрибут утверждения | `SAML_EMAIL_ATTRIBUTE` (по умолчанию: `email`) |
| Username | Атрибут утверждения, email или NameID | `SAML_USERNAME_ATTRIBUTE` (см. порядок вывода выше) |
| External ID | NameID | Всегда SAML NameID, не настраивается |

## Принудительное применение SSO {#sso-enforcement}

Если вы хотите обязать всех пользователей входить через SAML (или OIDC) и заблокировать локальный вход по паролю, включите принудительное применение SSO:

1. Убедитесь, что корпоративная функция `sso_enforcement` лицензирована (доступна в планах team и enterprise).
2. В **Admin Settings > Security** включите **SSO Enforcement**.
3. Задайте **break-glass username**: это единственная локальная учётная запись, которая всё ещё может входить с паролем для экстренного доступа, если IdP недоступен.

Когда принудительное применение SSO активно, любая попытка локального входа (кроме break-glass пользователя) возвращает ошибку 403 с сообщением «Local password login is disabled. Please use SSO.»

::: tip 
Всегда настраивайте break-glass username перед включением принудительного применения SSO. Без него вы можете быть заблокированы в SnapOtter, если ваш IdP выйдет из строя.
:::

## Использование SAML вместе с OIDC {#using-saml-alongside-oidc}

SAML и OIDC можно включить одновременно. Когда оба активны, страница входа показывает отдельные кнопки для каждого провайдера (с метками из `SAML_PROVIDER_NAME` и `OIDC_PROVIDER_NAME`). Пользователи могут входить любым методом.

Оба провайдера независимо используют одни и те же настройки автоматического создания, автоматического связывания и принудительного применения SSO: у каждого есть собственные переменные `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` и `*_DEFAULT_ROLE`.

## Устранение неполадок {#troubleshooting}

### Проверка утверждения не удалась {#assertion-validation-failed}

Подпись ответа SAML или подпись утверждения не удалось проверить. Проверьте:

- Сертификат в `SAML_IDP_CERTIFICATE` совпадает с текущим сертификатом подписи в вашем IdP (сертификаты ротируются, поэтому проверьте срок действия)
- Сертификат в формате PEM (начинается с `-----BEGIN CERTIFICATE-----`)
- Сертификат представляет собой полный текст, а не путь к файлу
- ACS URL и Entity ID, настроенные в вашем IdP, точно совпадают со значениями SnapOtter (схема, хост, порт, путь)

### Отсутствующие атрибуты {#missing-attributes}

Если имена пользователей или адреса электронной почты пусты после входа, ваш IdP может не отправлять ожидаемые атрибуты. Проверьте:

- Ваш IdP настроен на передачу атрибута `email` (или того, что задано в `SAML_EMAIL_ATTRIBUTE`)
- Если используется `SAML_USERNAME_ATTRIBUTE`, убедитесь, что этот атрибут включён в утверждение
- Некоторые IdP требуют явной настройки сопоставления атрибутов перед передачей клеймов

### Расхождение часов {#clock-skew}

Утверждения SAML включают временные условия (`NotBefore`, `NotOnOrAfter`). Если часы вашего сервера и часы IdP не синхронизированы, проверка утверждения завершается неудачей. Запустите NTP на обеих машинах, чтобы синхронизировать часы.

### «SAML is enabled via env but saml_sso enterprise feature is not licensed» {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Это предупреждение появляется в логах сервера, когда `SAML_ENABLED=true`, но лицензия не включает функцию `saml_sso`. Проверьте ваш лицензионный ключ и план. Функция `saml_sso` доступна в планах team и enterprise.

### Вход перенаправляет обратно с ошибкой {#login-redirects-back-with-error}

Если нажатие кнопки входа SAML перенаправляет обратно на страницу входа с ошибкой, проверьте логи сервера для деталей. Частые причины:

- IdP SSO URL недоступен с сервера
- IdP отклонил запрос аутентификации (проверьте журналы аудита IdP)
- IdP вернул неподписанный ответ (SnapOtter требует, чтобы и ответ, и утверждение были подписаны)
