---
description: "Схема базы данных PostgreSQL, таблицы, миграции и процедуры резервного копирования для SnapOtter."
i18n_source_hash: 50d5d4f220cf
i18n_provenance: human
i18n_output_hash: 0222caf7a400
---

# База данных {#database}

SnapOtter использует PostgreSQL 17 с [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) для хранения данных. Схема определена в `apps/api/src/db/schema.ts`.

Подключение настраивается через переменную окружения `DATABASE_URL` (по умолчанию `postgres://snapotter:snapotter@postgres:5432/snapotter`). В Docker Compose контейнер Postgres хранит свои данные в именованном томе `SnapOtter-pgdata`.

## Таблицы {#tables}

### users {#users}

Хранит учётные записи пользователей. Создаётся автоматически при первом запуске из `DEFAULT_USERNAME` и `DEFAULT_PASSWORD`.

| Столбец | Тип | Примечания |
|---|---|---|
| `id` | uuid | Первичный ключ |
| `username` | varchar | Уникальный, обязательный |
| `passwordHash` | varchar | scrypt-хеш |
| `role` | varchar | `admin`, `editor` или `user` |
| `mustChangePassword` | boolean | Флаг принудительного сброса пароля |
| `createdAt` | timestamp | Время создания |
| `updatedAt` | timestamp | Время последнего обновления |

### sessions {#sessions}

Активные сессии входа. Каждая строка связывает токен сессии с пользователем.

| Столбец | Тип | Примечания |
|---|---|---|
| `id` | varchar | Первичный ключ (токен сессии) |
| `userId` | uuid | Внешний ключ к `users.id` |
| `expiresAt` | timestamp | Время истечения |
| `createdAt` | timestamp | Время создания |

### teams {#teams}

Группы для организации пользователей. Администраторы могут назначать пользователей в команды.

| Столбец | Тип | Описание |
|--------|------|-------------|
| `id` | uuid | Первичный ключ |
| `name` | varchar (уникальный, макс. 50 символов) | Название команды |
| `createdAt` | timestamp | Время создания |

### api_keys {#api-keys}

API-ключи для программного доступа. Необработанный ключ показывается один раз при создании; хранится только хеш.

| Столбец | Тип | Примечания |
|---|---|---|
| `id` | uuid | Первичный ключ |
| `userId` | uuid | Внешний ключ к `users.id` |
| `keyHash` | varchar | scrypt-хеш ключа |
| `name` | varchar | Метка, заданная пользователем |
| `createdAt` | timestamp | Время создания |
| `lastUsedAt` | timestamp | Обновляется при каждом аутентифицированном запросе |

Ключи имеют префикс `si_`, за которым следуют 96 hex-символов (48 случайных байт).

### pipelines {#pipelines}

Сохранённые цепочки инструментов, которые пользователи создают в интерфейсе.

| Столбец | Тип | Примечания |
|---|---|---|
| `id` | uuid | Первичный ключ |
| `name` | varchar | Название пайплайна |
| `description` | varchar | Необязательное описание |
| `steps` | jsonb | Массив объектов `{ toolId, settings }` |
| `createdAt` | timestamp | Время создания |

### user_files {#user-files}

Постоянная библиотека файлов. По умолчанию сохранённое изменение вставляется как независимая корневая строка («сохранить как новый»: `version` 1, `parentId` null, поэтому оригинал остаётся в списке) или как связанная с родителем версия, когда вы перезаписываете оригинал (`parentId` задан, `version` увеличивается, вытесняя его). Столбец `toolChain` записывает применённые инструменты.

| Столбец | Тип | Описание |
|--------|------|-------------|
| `id` | uuid | Первичный ключ |
| `userId` | uuid | FK к users (CASCADE DELETE) |
| `originalName` | varchar | Имя исходного загруженного файла |
| `storedName` | varchar | Имя файла на диске |
| `mimeType` | varchar | MIME-тип |
| `size` | integer | Размер файла в байтах |
| `width` | integer | Ширина изображения в px |
| `height` | integer | Высота изображения в px |
| `version` | integer | Номер версии (1 = оригинал) |
| `parentId` | uuid или null | FK к user_files (родительская версия) |
| `toolChain` | jsonb | ID инструментов, применённых по порядку для создания этой версии |
| `createdAt` | timestamp | Время создания |

### jobs {#jobs}

Отслеживает задачи обработки для отчётности о прогрессе и очистки.

| Столбец | Тип | Примечания |
|---|---|---|
| `id` | uuid | Первичный ключ |
| `type` | varchar | Идентификатор инструмента или пайплайна |
| `status` | varchar | `queued`, `processing`, `completed` или `failed` |
| `progress` | real | Доля от 0.0 до 1.0 |
| `inputFiles` | jsonb | Массив путей к входным файлам |
| `outputPath` | varchar | Путь к файлу результата |
| `settings` | jsonb | Использованные настройки инструмента |
| `error` | varchar | Сообщение об ошибке при сбое |
| `createdAt` | timestamp | Время создания |
| `completedAt` | timestamp | Время завершения |

### settings {#settings}

Хранилище «ключ-значение» для общесерверных настроек, которые администраторы могут менять из интерфейса.

| Столбец | Тип | Примечания |
|---|---|---|
| `key` | varchar | Первичный ключ |
| `value` | varchar | Значение настройки |
| `updatedAt` | timestamp | Время последнего обновления |

### roles {#roles}

Пользовательские роли с гранулярными разрешениями.

| Столбец | Тип | Примечания |
|---|---|---|
| `id` | uuid | Первичный ключ |
| `name` | varchar | Уникальное имя роли |
| `description` | varchar | Необязательное описание |
| `permissions` | jsonb | Массив строк разрешений |
| `createdAt` | timestamp | Время создания |

### audit_log {#audit-log}

Журнал действий, значимых для безопасности.

| Столбец | Тип | Примечания |
|---|---|---|
| `id` | uuid | Первичный ключ |
| `userId` | uuid | FK к users |
| `action` | varchar | Тип действия |
| `details` | jsonb | Данные, специфичные для действия |
| `createdAt` | timestamp | Время действия |

## Миграции {#migrations}

Drizzle управляет миграциями схемы. Файлы миграций находятся в `apps/api/drizzle/`. Во время разработки:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

В продакшене ожидающие миграции применяются автоматически при запуске.

## Резервное копирование и восстановление {#backup-and-restore}

Реляционная база данных находится в томе `SnapOtter-pgdata` контейнера Postgres, а не в томе `/data` приложения.

**Вариант 1: pg_dump (рекомендуется)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Вариант 2: Снимок тома**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Миграция с 1.x (SQLite) {#migrating-from-1-x-sqlite}

Обновление со SnapOtter 1.x описано в отдельном руководстве: см. [Обновление с 1.x до 2.0](./upgrading). Вкратце: переиспользуйте существующий том `/data`, и 2.0 автоматически обнаружит и импортирует `/data/snapotter.db` при первом запуске (или задайте `SQLITE_MIGRATE_PATH`, чтобы явно указать путь к нему). Сначала сделайте резервную копию всего тома `/data`, а не только `snapotter.db`: 1.x использует режим SQLite WAL, поэтому остановленный контейнер часто оставляет большую часть данных в `snapotter.db-wal` рядом с почти пустым `snapotter.db`.
