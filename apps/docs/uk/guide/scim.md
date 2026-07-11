---
description: "Налаштуйте провізіонінг SCIM 2.0 для синхронізації користувачів і груп з вашого постачальника ідентифікації до SnapOtter. Охоплює Okta, Azure AD / Entra ID та власні інтеграції."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 8b95a7ec2ac6
---

# Провізіонінг SCIM {#scim-provisioning}

SnapOtter реалізує SCIM 2.0 (System for Cross-domain Identity Management) для автоматизованого провізіонінгу користувачів і груп. Ваш постачальник ідентифікації може створювати, оновлювати, деактивувати та повторно активувати облікові записи користувачів і синхронізувати членство у групах автоматично.

::: tip Функція enterprise
Провізіонінг SCIM потребує ліцензії **enterprise** з функцією `scim`. Він недоступний у плані team. Без цієї функції всі кінцеві точки SCIM (крім discovery) повертають 403.
:::

## Передумови {#prerequisites}

- Запущений екземпляр SnapOtter, доступний за публічним URL
- Ключ ліцензії enterprise з функцією `scim`
- Доступ адміністратора до SnapOtter (для створення чи відкликання токена SCIM потрібен дозвіл `users:manage`)
- Доступ адміністратора до налаштувань провізіонінгу вашого постачальника ідентифікації

## Швидкий старт {#quick-start}

1. Створіть токен SCIM Bearer:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Відповідь містить токен. Збережіть його негайно; отримати його повторно неможливо.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. У вашому постачальнику ідентифікації налаштуйте провізіонінг SCIM з такими параметрами:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authentication**: Bearer token (вставте токен із кроку 1)

## Автентифікація {#authentication}

Кінцеві точки SCIM використовують окремий токен Bearer, відмінний від сесій користувачів та ключів API.

### Створення токена {#generating-a-token}

`POST /api/v1/enterprise/scim/token` створює новий токен SCIM. Ця кінцева точка потребує дійсної сесії з дозволом `users:manage`.

Токен повертається у відкритому вигляді рівно один раз. SnapOtter зберігає лише хеш scrypt. Якщо ви втратите токен, відкличте його та створіть новий.

Одночасно активний лише один токен SCIM. Створення нового токена замінює попередній.

### Відкликання токена {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` відкликає поточний токен SCIM. Ця кінцева точка також потребує `users:manage`.

### Обмеження частоти запитів {#rate-limiting}

Кінцеві точки SCIM обмежені 1000 запитами за хвилину на токен. Перевищення цього ліміту повертає HTTP 429.

## Підтримувані ресурси {#supported-resources}

| Ресурс SCIM | Концепція SnapOtter | Create | Read | Update | Delete |
|---|---|---|---|---|---|
| User | Обліковий запис користувача | Так | Так | Так | М'яке видалення |
| Group | Team | Так | Так | Так | Так |

::: warning 
Групи SCIM зіставляються з **teams** SnapOtter, а не з ролями. SCIM не може встановлювати роль користувача. Усім користувачам, створеним через SCIM, призначається роль `user`. Щоб змінити роль користувача, скористайтеся адмін-інтерфейсом SnapOtter.
:::

## Операції з користувачами {#user-operations}

### Створення користувача {#create-user}

`POST /api/v1/scim/v2/Users`

Створює новий обліковий запис користувача з `authProvider`, встановленим у `scim`, та роллю `user`. Користувача призначено до команди Default. Якщо `active` дорівнює `false`, роль натомість встановлюється у `disabled`.

Обов'язкові атрибути: `userName`. Необов'язкові: `externalId`, `emails`, `active` (за замовчуванням `true`).

### Список і фільтрація користувачів {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Повертає посторінковий список користувачів. Підтримує параметри запиту `startIndex` та `count` (максимум 200 результатів на сторінку).

Фільтрація підтримує лише `eq` (дорівнює) за такими атрибутами:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Інші оператори фільтрації та атрибути повертають HTTP 400.

### Отримання користувача {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Повертає одного користувача за його ідентифікатором користувача SnapOtter.

### Заміна користувача {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Замінює атрибути користувача. Підтримує `userName`, `externalId`, `emails` та `active`. Зміни імені користувача перевіряються на конфлікти (409, якщо нове ім'я користувача вже зайняте іншим користувачем).

### Часткове оновлення користувача {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Часткове оновлення за допомогою SCIM PatchOp. Підтримувані операції:

| Операція | Шляхи |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Те саме, що й `replace` |
| `remove` | `externalId`, `emails` |

Шляхи `name.formatted` та `displayName` приймаються для сумісності, але не мають постійного ефекту (SnapOtter не зберігає окреме відображуване ім'я).

Операції `replace` без значення (де значення є об'єктом без `path`) також підтримуються, з ключами `userName`, `externalId`, `emails` та `active`.

### Деактивація користувача (м'яке видалення) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter не видаляє користувачів остаточно через SCIM. Натомість DELETE виконує м'яку деактивацію:

1. Роль користувача змінюється з поточного значення (наприклад, `editor`) на `disabled:editor`, зберігаючи початкову роль.
2. Пароль користувача очищується.
3. Усі активні сесії відкликаються.
4. Усі ключі API відкликаються.

Користувач більше не може входити в систему чи використовувати будь-які ключі API. Його дані (файли, історія) зберігаються.

### Повторна активація користувача {#reactivate-user}

Щоб повторно активувати раніше деактивованого користувача, надішліть запит `PUT` або `PATCH` з `active: true`. SnapOtter відновлює початкову роль, що була до деактивації (наприклад, `disabled:editor` знову стає `editor`). Якщо початкову роль визначити не вдається, відбувається повернення до `user`.

::: details Приклад: деактивація та повторна активація через PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Операції з групами {#group-operations}

Групи SCIM зіставляються з командами SnapOtter. Створення групи створює команду. Членство у групі визначає, до якої команди належить користувач.

### Створення групи {#create-group}

`POST /api/v1/scim/v2/Groups`

Обов'язково: `displayName`. Необов'язково: `members` (масив `{ value: userId }`).

### Список і фільтрація груп {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Фільтрація підтримує лише `displayName eq "..."`. Посторінково з `startIndex` та `count` (максимум 200 результатів на сторінку).

### Отримання групи {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Заміна групи {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Замінює назву групи та повний список членства. Наявні члени, яких немає в новому списку, переміщуються до команди Default.

### Часткове оновлення групи {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Підтримує такі операції:

| Операція | Шлях | Ефект |
|---|---|---|
| `add` | `members` | Додає користувачів до команди |
| `remove` | `members[value eq "userId"]` | Переміщує користувача до команди Default |
| `replace` | `displayName` | Перейменовує команду |
| `replace` | `members` | Замінює всіх членів (видалені члени переміщуються до команди Default) |

### Видалення групи {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Видаляє команду. Усі члени видаленої команди переміщуються до команди Default. Користувачі не деактивуються та не видаляються.

## Налаштування IdP {#idp-setup}

### Okta {#okta}

1. У консолі адміністратора Okta відкрийте свій застосунок SnapOtter (або створіть його).
2. Перейдіть на вкладку **Provisioning** і натисніть **Configure API Integration**.
3. Позначте **Enable API Integration** та введіть:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: токен SCIM Bearer, створений вище
4. Натисніть **Test API Credentials**, а потім **Save**.
5. У розділі **Provisioning > To App** увімкніть:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. У розділі **Push Groups** налаштуйте, які групи Okta синхронізувати як команди SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. На порталі Azure перейдіть до свого корпоративного застосунку SnapOtter.
2. Перейдіть до **Provisioning** і встановіть **Provisioning Mode** у **Automatic**.
3. У розділі **Admin Credentials** введіть:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: токен SCIM Bearer, створений вище
4. Натисніть **Test Connection**, а потім **Save**.
5. У розділі **Mappings** налаштуйте зіставлення атрибутів користувачів і груп. Значення за замовчуванням зазвичай працюють, але переконайтеся, що `userName` зіставляється з `userPrincipalName` чи `mail` за потреби.
6. Встановіть **Provisioning Status** у **On** і збережіть.

Azure провізіонує користувачів і групи за фіксованим циклом синхронізації (зазвичай кожні 40 хвилин).

## Кінцеві точки discovery {#discovery-endpoints}

Ці три кінцеві точки доступні без автентифікації та описують можливості сервера SCIM:

| Кінцева точка | Опис |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Можливості сервера та підтримувані функції |
| `GET /api/v1/scim/v2/Schemas` | Визначення схем User і Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Доступні типи ресурсів (User, Group) |

`ServiceProviderConfig` оголошує такі можливості:

| Функція | Підтримується |
|---|---|
| Patch | Так |
| Bulk | Ні |
| Filter | Так (максимум 200 результатів, лише оператор `eq`) |
| Change password | Ні |
| Sort | Ні |
| ETag | Ні |

## Обмеження {#limitations}

- **Фільтрація**: підтримується лише оператор `eq`. Складні фільтри, оператори `and`/`or`, `co` (contains) і `sw` (starts with) не реалізовано.
- **Пакетні операції**: не підтримуються.
- **Sort і ETag**: не підтримуються.
- **Ролі**: SCIM не може призначати ролі SnapOtter. Усі провізіоновані користувачі отримують роль `user`.
- **MAX_USERS**: обмеження змінної середовища `MAX_USERS` не застосовується під час створення користувачів через SCIM. Якщо вам потрібно обмежити кількість користувачів, керуйте призначеннями у своєму IdP.
- **Один токен**: одночасно активним може бути лише один токен SCIM. Якщо кільком IdP потрібен доступ через SCIM, вони мають спільно використовувати токен.
- **Групи є командами**: групи SCIM відповідають командам, а не ролям чи групам дозволів.

## Усунення несправностей {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Ваша ліцензія не включає функцію `scim`, або ліцензію не налаштовано. SCIM потребує ліцензії плану enterprise. Переконайтеся, що `SNAPOTTER_LICENSE_KEY` встановлено, а ліцензія включає функцію `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

Запит SCIM не містив заголовка `Authorization: Bearer <token>`. Перевірте конфігурацію провізіонінгу свого IdP.

### 401 "Invalid token" {#_401-invalid-token}

Токен не відповідає збереженому хешу. Це трапляється, якщо токен було відкликано та створено заново. Оновіть токен у налаштуваннях провізіонінгу свого IdP.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Токен SCIM ще не створено. Скористайтеся кінцевою точкою `POST /api/v1/enterprise/scim/token`, щоб створити його.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Користувач із таким самим іменем уже існує. Це може статися, коли IdP повторює невдале створення. Перевірте наявність дублікатів імен користувачів на панелі адміністратора SnapOtter.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP надсилає понад 1000 запитів за хвилину. Зазвичай це трапляється під час великої початкової синхронізації. Більшість IdP автоматично повторюють спроби після скидання вікна обмеження частоти. Якщо проблема не зникає, перевірте інтервал синхронізації провізіонінгу свого IdP.

### Користувачів деповізіоновано, але не видалено з інтерфейсу {#users-deprovisioned-but-not-removed-from-the-ui}

DELETE у SCIM є м'якою деактивацією. Деактивовані користувачі й далі відображаються у списку користувачів адміністратора зі статусом «вимкнено». Це зроблено навмисно, щоб зберегти їхні дані. Їхня роль відображається як `disabled:<original-role>`.
