---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: 1f3c6ede213b
i18n_hash_version: 2
---
# Відновлення доступу до облікового запису {#account-recovery}

Якщо ви втратили доступ до SnapOtter (найчастіше через політику MFA, якій ви
більше не можете відповідати), ви можете відновити доступ зсередини контейнера без клієнта
бази даних. Команди відновлення працюють офлайн і потребують доступу до оболонки контейнера,
а це вже означає повний контроль над екземпляром.

## На яку перешкоду я наштовхнувся? {#which-wall-am-i-hitting}

Вхід у SnapOtter застосовує два незалежні бар'єри MFA. Спершу діагностуйте:

```bash
docker exec -it snapotter snapotter-admin status
```

Це виводить поточну політику MFA та те, які користувачі мають зареєстрований TOTP.

- **«MFA enrollment is required before login» (а ви ніколи не налаштовували застосунок):**
  політика вимагає MFA, але у вас немає реєстрації. Послабте політику.
- **Вас просять ввести код, який ви не можете отримати** (втратили телефон і свої
  коди відновлення): ваш обліковий запис зареєстрований. Скиньте цю реєстрацію.

## Послаблення політики MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Це повертає політику назад до `optional`. Вона застосовується під час наступного входу без
перезапуску. Вона лише коли-небудь встановлює `optional`, тож не може знову ввімкнути примусове застосування.

## Скидання реєстрації TOTP одного користувача {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Якщо політика все ще вимагає MFA для цього користувача, він наштовхнеться на бар'єр
реєстрації наступним, тож також виконайте `reset-mfa-policy`, увійдіть і зареєструйтеся заново в Налаштуваннях.

## Скидання забутого пароля {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

Якщо пропустити `[password]`, CLI виведе згенерований тимчасовий пароль. У будь-якому разі активні сесії користувача, ключі API та вікно обмеження після невдалих спроб входу очищуються, а SnapOtter вимагатиме змінити пароль під час наступного входу.

## Створення початкового облікового запису адміністратора {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

Використовуйте це, коли жоден наявний обліковий запис адміністратора не може увійти. За замовчуванням `[username]` дорівнює `DEFAULT_USERNAME` (`admin`), а якщо пропустити `[password]`, буде виведено тимчасовий пароль, який потрібно змінити під час першого входу.

## Розблокування обмеженого або вимкненого користувача {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

Це очищує вікно `LOGIN_THROTTLED` у Redis і відновлює роль облікового запису, якщо користувача було вимкнено.

## Старіші образи та резервні варіанти {#older-images-and-fallbacks}

На образі, зібраному до того, як з'явилася обгортка `snapotter-admin`, викликайте скрипт
безпосередньо:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

Як крайній захід на будь-якій версії, задайте політику в базі даних. На
образі «все в одному» Postgres працює всередині контейнера:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

На конфігурації з кількома контейнерами натомість спрямуйте `psql` на власний `DATABASE_URL`.

## Заблоковано доступ до SSO, а не MFA? {#locked-out-of-sso-not-mfa}

Якщо примусовий вхід через SSO не працює, скористайтеся натомість аварійним локальним обліковим записом:
задайте `ssoBreakGlassUsername` для локального адміністратора в Налаштування > Безпека, перш ніж ви
увімкнете примусове застосування SSO, і увійдіть з паролем цього облікового запису.
