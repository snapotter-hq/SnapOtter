---
description: "Настройте единый вход через OpenID Connect. Пошаговые руководства для Keycloak, Authentik, Google и других провайдеров OIDC."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 30c887791088
---

# OIDC / Единый вход {#oidc-single-sign-on}

SnapOtter поддерживает OpenID Connect (OIDC) для единого входа. Пользователи могут входить с помощью внешнего поставщика удостоверений, такого как Keycloak, Authentik или Google, вместо (или наряду с) локальной аутентификации по имени пользователя и паролю.

::: tip См. также
[SAML SSO](/ru/guide/saml) | [Провижининг SCIM](/ru/guide/scim) | [Пользователи, роли и права доступа](/ru/guide/users-roles)
:::

## Быстрый старт {#quick-start}

Добавьте эти переменные окружения в ваш `docker-compose.yml`:

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

URI перенаправления для вашего провайдера всегда:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Например, если `EXTERNAL_URL` равен `https://photos.example.com`, настройте URI перенаправления вашего провайдера как `https://photos.example.com/api/auth/oidc/callback`.

## Справочник конфигурации {#configuration-reference}

| Переменная | По умолчанию | Описание |
|---|---|---|
| `OIDC_ENABLED` | `false` | Включить вход через OIDC. На странице входа появляется кнопка «Sign in with SSO». |
| `OIDC_ISSUER_URL` | | URL издателя провайдера. Должен поддерживать OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | Идентификатор клиента OAuth, зарегистрированный у вашего провайдера. |
| `OIDC_CLIENT_SECRET` | | Секрет клиента OAuth. |
| `OIDC_SCOPES` | `openid profile email` | Список областей для запроса, разделённых пробелами. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Автоматически создавать локальную учётную запись пользователя при первом входе через OIDC. |
| `OIDC_DEFAULT_ROLE` | `user` | Роль, назначаемая автоматически создаваемым пользователям OIDC. Одна из `admin`, `editor` или `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Связать удостоверение OIDC с существующим локальным пользователем, если адрес электронной почты совпадает. |
| `OIDC_PROVIDER_NAME` | | Отображаемое имя на кнопке входа (например, «Keycloak», «Google»). Если пусто, на кнопке написано «SSO». |
| `OIDC_CLOCK_TOLERANCE` | `30` | Допустимое расхождение часов в секундах при проверке токена. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Клейм ID-токена, используемый как имя пользователя для новых учётных записей. |
| `EXTERNAL_URL` | | Публичный URL, по которому доступен SnapOtter. Требуется для OIDC, чтобы построить корректный URI перенаправления. |
| `COOKIE_SECRET` | генерируется автоматически | Секрет для подписи сессионных cookie. Задавайте его явно при запуске нескольких реплик. |

## Руководства по провайдерам {#provider-guides}

### Keycloak {#keycloak}

1. Создайте новый realm (или используйте существующий).
2. Перейдите в **Clients** и создайте новый клиент:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. На вкладке **Settings** клиента задайте **Valid redirect URIs** равным вашему callback URL (например, `https://photos.example.com/api/auth/oidc/callback`).
4. Скопируйте **Client secret** с вкладки **Credentials**.
5. Задайте `OIDC_ISSUER_URL` равным `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. В интерфейсе администратора перейдите в **Applications > Providers** и создайте новый **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: Ваш callback URL
   - **Signing key**: Выберите существующий ключ или создайте новый
2. Создайте **Application** и свяжите его с провайдером.
3. Скопируйте **Client ID** и **Client Secret** из настроек провайдера.
4. Задайте `OIDC_ISSUER_URL` равным `https://authentik.example.com/application/o/snapotter/` (завершающая косая черта важна).

### Google {#google}

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/).
2. Создайте проект (или выберите существующий).
3. Перейдите в **APIs & Services > OAuth consent screen** и настройте его.
4. Перейдите в **APIs & Services > Credentials** и создайте **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Ваш callback URL
5. Скопируйте **Client ID** и **Client secret**.
6. Задайте `OIDC_ISSUER_URL` равным `https://accounts.google.com`.
7. Задайте `OIDC_USERNAME_CLAIM` равным `email` (Google не предоставляет `preferred_username`).

## Провижининг пользователей {#user-provisioning}

### Автоматическое создание {#auto-create}

Когда `OIDC_AUTO_CREATE_USERS` равен `true` (по умолчанию), локальная учётная запись пользователя создаётся при первом входе кого-либо через OIDC. Имя пользователя берётся из клейма, указанного в `OIDC_USERNAME_CLAIM`, а роль устанавливается в `OIDC_DEFAULT_ROLE`.

Если возникает конфликт имён пользователей, добавляется числовой суффикс (например, `jane` становится `jane_2`).

### Автоматическое связывание {#auto-link}

Когда `OIDC_AUTO_LINK_USERS` равен `true`, SnapOtter связывает удостоверение OIDC с существующей локальной учётной записью, если адреса электронной почты совпадают. Это полезно, когда у вас есть заранее созданные учётные записи пользователей и вы хотите, чтобы они начали использовать SSO без потери своих данных.

::: warning 
Включайте автоматическое связывание, только если вы доверяете своему провайдеру OIDC в проверке адресов электронной почты. Непроверенный адрес электронной почты может позволить кому-либо захватить учётную запись другого пользователя.
:::

### Отключение локального входа {#disabling-local-login}

OIDC не отключает локальный вход по имени пользователя и паролю. Оба метода остаются доступными. Администраторы по-прежнему могут входить с локальными учётными данными, если провайдер OIDC недоступен.

## Самоподписанные сертификаты {#self-signed-certificates}

Если ваш провайдер OIDC использует самоподписанный сертификат или сертификат частного CA, смонтируйте набор сертификатов CA в контейнер и укажите на него `NODE_EXTRA_CA_CERTS`:

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
Не задавайте `NODE_TLS_REJECT_UNAUTHORIZED=0`. Это отключает всю проверку TLS и представляет угрозу безопасности.
:::

## Устранение неполадок {#troubleshooting}

### Несоответствие URI перенаправления {#redirect-uri-mismatch}

Самая частая ошибка. Проверьте эти различия между тем, что ожидает ваш провайдер, и тем, что отправляет SnapOtter:

- `http` против `https` - схема должна совпадать в точности
- Завершающая косая черта - некоторые провайдеры строги к этому
- Номер порта - включите порт, если он нестандартный
- Путь - должен быть `/api/auth/oidc/callback`

Ещё раз проверьте `EXTERNAL_URL`. Он должен совпадать с URL, который пользователи вводят в браузере.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

Провайдер OIDC использует сертификат, которому Node.js не доверяет. См. [Самоподписанные сертификаты](#self-signed-certificates) выше.

### Ошибки расхождения часов {#clock-skew-errors}

Если часы вашего сервера и провайдера OIDC не синхронизированы, проверка токена может завершиться неудачей. Увеличьте `OIDC_CLOCK_TOLERANCE` (по умолчанию 30 секунд). Лучшее решение - запустить NTP на обеих машинах.

### «OIDC provider unreachable» {#oidc-provider-unreachable}

SnapOtter получает документ обнаружения провайдера при запуске и во время входа. Проверьте:

- Разрешение DNS изнутри контейнера Docker (`docker exec snapotter nslookup auth.example.com`)
- Правила брандмауэра между контейнером и провайдером
- Значение `OIDC_ISSUER_URL` - оно должно быть доступно с сервера, а не только из вашего браузера

### Отсутствующие клеймы {#missing-claims}

Если имена пользователей или адреса электронной почты пусты после входа, ваш провайдер может не возвращать ожидаемые клеймы. Проверьте:

- Области, настроенные в `OIDC_SCOPES`, включают `profile` и `email`
- Провайдер настроен на включение клейма, указанного в `OIDC_USERNAME_CLAIM`, в ID-токен
- Некоторые провайдеры требуют явной настройки маппера/области для передачи клеймов
