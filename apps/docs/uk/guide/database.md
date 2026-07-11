---
description: "Схема бази даних PostgreSQL, таблиці, міграції та процедури резервного копіювання для SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 8b7453bf7c82
---

# База даних {#database}

SnapOtter використовує PostgreSQL 17 з [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) для збереження даних. Схему визначено у `apps/api/src/db/schema.ts`.

З'єднання налаштовується через змінну середовища `DATABASE_URL` (за замовчуванням `postgres://snapotter:snapotter@postgres:5432/snapotter`). У Docker Compose контейнер Postgres зберігає свої дані в іменованому томі `SnapOtter-pgdata`.

## Таблиці {#tables}

### users {#users}

Зберігає облікові записи користувачів. Створюється автоматично під час першого запуску з `DEFAULT_USERNAME` та `DEFAULT_PASSWORD`.

| Стовпець | Тип | Примітки |
|---|---|---|
| `id` | uuid | Первинний ключ |
| `username` | varchar | Унікальний, обов'язковий |
| `passwordHash` | varchar | scrypt-хеш |
| `role` | varchar | `admin`, `editor` або `user` |
| `mustChangePassword` | boolean | Прапорець примусового скидання пароля |
| `createdAt` | timestamp | Час створення |
| `updatedAt` | timestamp | Час останнього оновлення |

### sessions {#sessions}

Активні сесії входу. Кожен рядок пов'язує токен сесії з користувачем.

| Стовпець | Тип | Примітки |
|---|---|---|
| `id` | varchar | Первинний ключ (токен сесії) |
| `userId` | uuid | Зовнішній ключ на `users.id` |
| `expiresAt` | timestamp | Час закінчення терміну дії |
| `createdAt` | timestamp | Час створення |

### teams {#teams}

Групи для організації користувачів. Адміністратори можуть призначати користувачів до команд.

| Стовпець | Тип | Опис |
|--------|------|-------------|
| `id` | uuid | Первинний ключ |
| `name` | varchar (унікальний, макс. 50 символів) | Назва команди |
| `createdAt` | timestamp | Час створення |

### api_keys {#api-keys}

API-ключі для програмного доступу. Необроблений ключ показується один раз під час створення; зберігається лише хеш.

| Стовпець | Тип | Примітки |
|---|---|---|
| `id` | uuid | Первинний ключ |
| `userId` | uuid | Зовнішній ключ на `users.id` |
| `keyHash` | varchar | scrypt-хеш ключа |
| `name` | varchar | Мітка, надана користувачем |
| `createdAt` | timestamp | Час створення |
| `lastUsedAt` | timestamp | Оновлюється під час кожного автентифікованого запиту |

Ключі мають префікс `si_`, за яким слідують 96 шістнадцяткових символів (48 випадкових байтів).

### pipelines {#pipelines}

Збережені ланцюжки інструментів, які користувачі створюють в інтерфейсі.

| Стовпець | Тип | Примітки |
|---|---|---|
| `id` | uuid | Первинний ключ |
| `name` | varchar | Назва конвеєра |
| `description` | varchar | Необов'язковий опис |
| `steps` | jsonb | Масив об'єктів `{ toolId, settings }` |
| `createdAt` | timestamp | Час створення |

### user_files {#user-files}

Постійна бібліотека файлів із відстеженням ланцюжка версій. Кожен крок обробки, що зберігає результат, створює новий рядок, пов'язаний зі своїм батьківським через `parentId`, утворюючи дерево версій.

| Стовпець | Тип | Опис |
|--------|------|-------------|
| `id` | uuid | Первинний ключ |
| `userId` | uuid | Зовнішній ключ на users (CASCADE DELETE) |
| `originalName` | varchar | Оригінальна назва завантаженого файлу |
| `storedName` | varchar | Назва файлу на диску |
| `mimeType` | varchar | MIME-тип |
| `size` | integer | Розмір файлу в байтах |
| `width` | integer | Ширина зображення в пікселях |
| `height` | integer | Висота зображення в пікселях |
| `version` | integer | Номер версії (1 = оригінал) |
| `parentId` | uuid або null | Зовнішній ключ на user_files (батьківська версія) |
| `toolChain` | jsonb | Ідентифікатори інструментів, застосовані по порядку для створення цієї версії |
| `createdAt` | timestamp | Час створення |

### jobs {#jobs}

Відстежує завдання обробки для звітування про прогрес та очищення.

| Стовпець | Тип | Примітки |
|---|---|---|
| `id` | uuid | Первинний ключ |
| `type` | varchar | Ідентифікатор інструмента чи конвеєра |
| `status` | varchar | `queued`, `processing`, `completed` або `failed` |
| `progress` | real | Частка 0.0-1.0 |
| `inputFiles` | jsonb | Масив шляхів до вхідних файлів |
| `outputPath` | varchar | Шлях до файлу результату |
| `settings` | jsonb | Використані налаштування інструмента |
| `error` | varchar | Повідомлення про помилку у разі невдачі |
| `createdAt` | timestamp | Час створення |
| `completedAt` | timestamp | Час завершення |

### settings {#settings}

Сховище ключ-значення для загальносерверних налаштувань, які адміністратори можуть змінювати з інтерфейсу.

| Стовпець | Тип | Примітки |
|---|---|---|
| `key` | varchar | Первинний ключ |
| `value` | varchar | Значення налаштування |
| `updatedAt` | timestamp | Час останнього оновлення |

### roles {#roles}

Кастомні ролі з деталізованими дозволами.

| Стовпець | Тип | Примітки |
|---|---|---|
| `id` | uuid | Первинний ключ |
| `name` | varchar | Унікальна назва ролі |
| `description` | varchar | Необов'язковий опис |
| `permissions` | jsonb | Масив рядків дозволів |
| `createdAt` | timestamp | Час створення |

### audit_log {#audit-log}

Журнал дій, релевантних для безпеки.

| Стовпець | Тип | Примітки |
|---|---|---|
| `id` | uuid | Первинний ключ |
| `userId` | uuid | Зовнішній ключ на users |
| `action` | varchar | Тип дії |
| `details` | jsonb | Дані, специфічні для дії |
| `createdAt` | timestamp | Час дії |

## Міграції {#migrations}

Drizzle відповідає за міграції схеми. Файли міграцій знаходяться у `apps/api/drizzle/`. Під час розробки:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

У продакшені відкладені міграції застосовуються автоматично під час запуску.

## Резервне копіювання та відновлення {#backup-and-restore}

Реляційна база даних знаходиться в томі `SnapOtter-pgdata` контейнера Postgres, а не в томі `/data` застосунку.

**Варіант 1: pg_dump (рекомендовано)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Варіант 2: Знімок тому**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Міграція з 1.x (SQLite) {#migrating-from-1-x-sqlite}

Оновлення з SnapOtter 1.x має власний посібник: див. [Оновлення з 1.x до 2.0](./upgrading). Коротко: повторно використайте свій наявний том `/data`, і 2.0 автоматично виявить та імпортує `/data/snapotter.db` під час першого запуску (або встановіть `SQLITE_MIGRATE_PATH`, щоб явно вказати на нього). Спершу зробіть резервну копію всього тому `/data`, а не лише `snapotter.db`: 1.x використовує режим SQLite WAL, тож зупинений контейнер часто залишає більшість своїх даних у `snapotter.db-wal` поруч із майже порожнім `snapotter.db`.
