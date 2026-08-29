---
description: "Налаштуйте єдиний вхід за допомогою OpenID Connect. Покрокові інструкції для Keycloak, Authentik, Google, Microsoft Entra ID (Azure AD), Okta та інших постачальників OIDC."
i18n_source_hash: 438fff2ba4c6
i18n_provenance: human
i18n_output_hash: e4ed1e4c58ab
---

# OIDC / Єдиний вхід {#oidc-single-sign-on}

SnapOtter підтримує OpenID Connect (OIDC) для єдиного входу. Користувачі можуть входити через зовнішнього постачальника ідентифікації, такого як Keycloak, Authentik, Google чи Microsoft Entra ID, замість (або разом із) локальної автентифікації за іменем користувача та паролем.

::: tip Дивіться також
[SAML SSO](/uk/guide/saml) | [Провізіювання SCIM](/uk/guide/scim) | [Користувачі, ролі та дозволи](/uk/guide/users-roles)
:::

## Швидкий старт {#quick-start}

Додайте ці змінні середовища до вашого `docker-compose.yml`:

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

URI перенаправлення для вашого постачальника завжди:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Наприклад, якщо `EXTERNAL_URL` дорівнює `https://photos.example.com`, налаштуйте URI перенаправлення вашого постачальника як `https://photos.example.com/api/auth/oidc/callback`.

## Довідник з налаштувань {#configuration-reference}

| Змінна | За замовчуванням | Опис |
|---|---|---|
| `OIDC_ENABLED` | `false` | Увімкнути вхід OIDC. На сторінці входу з'являється кнопка "Sign in with SSO". |
| `OIDC_ISSUER_URL` | | URL емітента постачальника. Має підтримувати OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | ID клієнта OAuth, зареєстрований у вашого постачальника. |
| `OIDC_CLIENT_SECRET` | | Секрет клієнта OAuth. |
| `OIDC_SCOPES` | `openid profile email` | Розділений пробілами список областей дії для запиту. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Автоматично створювати локальний обліковий запис користувача під час першого входу OIDC. |
| `OIDC_DEFAULT_ROLE` | `user` | Роль, що призначається автоматично створеним користувачам OIDC. Одна з `admin`, `editor` чи `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Пов'язати ідентичність OIDC з наявним локальним користувачем, якщо адреса електронної пошти збігається. |
| `OIDC_PROVIDER_NAME` | | Відображуване ім'я на кнопці входу (наприклад, "Keycloak", "Google"). Якщо порожнє, кнопка показує "SSO". |
| `OIDC_CLOCK_TOLERANCE` | `30` | Допуск відхилення годинника в секундах для перевірки токенів. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Претензія ID-токена, що використовується як ім'я користувача для нових облікових записів. |
| `EXTERNAL_URL` | | Публічний URL, за яким доступний SnapOtter. Потрібен для OIDC, щоб побудувати правильний URI перенаправлення. |
| `COOKIE_SECRET` | генерується автоматично | Секрет для підписування сесійних cookie. Встановіть його явно під час запуску кількох реплік. |

## Інструкції для постачальників {#provider-guides}

### Keycloak {#keycloak}

1. Створіть новий realm (або використайте наявний).
2. Перейдіть до **Clients** і створіть нового клієнта:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. На вкладці **Settings** клієнта встановіть **Valid redirect URIs** на ваш URL зворотного виклику (наприклад, `https://photos.example.com/api/auth/oidc/callback`).
4. Скопіюйте **Client secret** із вкладки **Credentials**.
5. Встановіть `OIDC_ISSUER_URL` на `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. В адміністративному інтерфейсі перейдіть до **Applications > Providers** і створіть новий **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: Ваш URL зворотного виклику
   - **Signing key**: Виберіть наявний ключ або створіть новий
2. Створіть **Application** і пов'яжіть його з постачальником.
3. Скопіюйте **Client ID** та **Client Secret** із налаштувань постачальника.
4. Встановіть `OIDC_ISSUER_URL` на `https://authentik.example.com/application/o/snapotter/` (кінцева коса риска має значення).

### Google {#google}

1. Перейдіть до [Google Cloud Console](https://console.cloud.google.com/).
2. Створіть проєкт (або виберіть наявний).
3. Перейдіть до **APIs & Services > OAuth consent screen** і налаштуйте його.
4. Перейдіть до **APIs & Services > Credentials** і створіть **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Ваш URL зворотного виклику
5. Скопіюйте **Client ID** та **Client secret**.
6. Встановіть `OIDC_ISSUER_URL` на `https://accounts.google.com`.
7. Встановіть `OIDC_USERNAME_CLAIM` на `email` (Google не надає `preferred_username`).

### Azure AD / Entra ID {#azure-ad-entra-id}

1. На порталі Azure перейдіть до **Microsoft Entra ID > App registrations > New registration**.
2. Назвіть застосунок "SnapOtter". У розділі **Redirect URI** виберіть платформу **Web** і введіть ваш URL зворотного виклику (наприклад, `https://photos.example.com/api/auth/oidc/callback`). Не вибирайте **Single-page application**: SnapOtter автентифікується за допомогою секрету клієнта, який Entra ID відхиляє для SPA-реєстрацій.
3. Скопіюйте **Application (client) ID** та **Directory (tenant) ID** зі сторінки **Overview**.
4. Перейдіть до **Certificates & secrets > New client secret** і одразу скопіюйте **Value** секрету. Значення показується лише один раз, а розташований поруч Secret ID не є секретом.
5. Встановіть `OIDC_ISSUER_URL` на `https://login.microsoftonline.com/<tenant-id>/v2.0`, використовуючи Directory (tenant) ID із кроку 3.
6. Залиште `OIDC_USERNAME_CLAIM` зі значенням за замовчуванням. Entra ID надає `preferred_username`, тому перевизначення `email` з інструкції для Google тут не потрібне.

Завжди використовуйте в URL емітента ID вашого tenant, а не `common` чи `organizations`. Ці багатоорендні кінцеві точки оголошують буквальний шаблон `{tenantid}` як свого емітента, що не проходить перевірку OIDC Discovery.

::: warning
Претензія `preferred_username` в Entra ID відстежує ім'я учасника-користувача (user principal name), яке змінюється, коли користувача перейменовують або переносять до іншого tenant. SnapOtter зчитує претензію лише один раз, під час першого входу, тому обліковий запис надалі зберігає своє початкове ім'я користувача. Вхід у будь-якому разі продовжує працювати: користувачів, що повертаються, зіставляють за стабільним subject токена, а не за іменем користувача.
:::

Перехід на Entra ID не вимикає вхід за паролем. Див. [Вимкнення локального входу](#disabling-local-login).

### Okta та інші постачальники {#okta-and-other-providers}

Будь-який постачальник, що підтримує OIDC Discovery, працює так само: створіть конфіденційний веб-клієнт із вашим URL зворотного виклику, а потім вкажіть в `OIDC_ISSUER_URL` емітента. Для Okta створіть застосунок із методом входу **OIDC - OpenID Connect** і типом **Web Application**, а потім використайте ваш домен Okta як емітента (наприклад, `https://your-company.okta.com`).

SnapOtter не зіставляє групи постачальника ідентифікації з ролями. Нові користувачі SSO отримують `OIDC_DEFAULT_ROLE`, адміністратори змінюють ролі в розділі **Settings > Users**, а запит претензій груп через `OIDC_SCOPES` не має ефекту.

## Провізіювання користувачів {#user-provisioning}

### Автоматичне створення {#auto-create}

Коли `OIDC_AUTO_CREATE_USERS` дорівнює `true` (за замовчуванням), локальний обліковий запис користувача створюється під час першого входу через OIDC. Ім'я користувача береться з претензії, вказаної в `OIDC_USERNAME_CLAIM`, а роль встановлюється на `OIDC_DEFAULT_ROLE`.

Якщо виникає колізія імен користувачів, додається числовий суфікс (наприклад, `jane` стає `jane_2`).

### Автоматичне пов'язування {#auto-link}

Коли `OIDC_AUTO_LINK_USERS` дорівнює `true`, SnapOtter пов'язує ідентичність OIDC з наявним локальним обліковим записом, якщо адреси електронної пошти збігаються. Це корисно, коли ви маєте попередньо створені облікові записи користувачів і хочете, щоб вони почали використовувати SSO без втрати даних.

::: warning 
Вмикайте автоматичне пов'язування лише якщо ви довіряєте вашому постачальнику OIDC у перевірці адрес електронної пошти. Неперевірена електронна пошта може дозволити комусь захопити обліковий запис іншого користувача.
:::

### Вимкнення локального входу {#disabling-local-login}

OIDC не вимикає локальний вхід за іменем користувача та паролем. Обидва методи залишаються доступними. Адміністратори все одно можуть входити з локальними обліковими даними, якщо постачальник OIDC недоступний.

## Самопідписані сертифікати {#self-signed-certificates}

Якщо ваш постачальник OIDC використовує самопідписаний або приватний CA-сертифікат, змонтуйте CA-пакет у контейнер і вкажіть на нього `NODE_EXTRA_CA_CERTS`:

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
Не встановлюйте `NODE_TLS_REJECT_UNAUTHORIZED=0`. Це вимикає всю перевірку TLS і є ризиком для безпеки.
:::

## Усунення несправностей {#troubleshooting}

### Невідповідність URI перенаправлення {#redirect-uri-mismatch}

Найпоширеніша помилка. Перевірте наявність цих відмінностей між тим, що очікує ваш постачальник, і тим, що надсилає SnapOtter:

- `http` проти `https` - схема має точно збігатися
- Кінцева коса риска - деякі постачальники суворі щодо цього
- Номер порту - включіть порт, якщо він нестандартний
- Шлях - має бути `/api/auth/oidc/callback`

Перевірте `EXTERNAL_URL`. Він має збігатися з URL, який користувачі вводять у своєму браузері.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

Постачальник OIDC використовує сертифікат, якому Node.js не довіряє. Див. [Самопідписані сертифікати](#self-signed-certificates) вище.

### Помилки відхилення годинника {#clock-skew-errors}

Якщо годинник вашого сервера й годинник постачальника OIDC не синхронізовані, перевірка токена може не вдатися. Збільште `OIDC_CLOCK_TOLERANCE` (за замовчуванням 30 секунд). Кращим рішенням є запуск NTP на обох машинах.

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter отримує документ discovery постачальника під час запуску та під час входу. Перевірте:

- Розв'язання DNS зсередини Docker-контейнера (`docker exec snapotter nslookup auth.example.com`)
- Правила брандмауера між контейнером і постачальником
- Значення `OIDC_ISSUER_URL` - воно має бути доступним із сервера, а не лише з вашого браузера

### Відсутні претензії {#missing-claims}

Якщо імена користувачів чи електронні пошти порожні після входу, ваш постачальник може не повертати очікувані претензії. Перевірте:

- Області дії, налаштовані в `OIDC_SCOPES`, включають `profile` та `email`
- Постачальник налаштований включати претензію, вказану в `OIDC_USERNAME_CLAIM`, до ID-токена
- Деякі постачальники потребують явної конфігурації mapper/scope для випуску претензій
