---
description: "Schemat bazy danych PostgreSQL, tabele, migracje i procedury tworzenia kopii zapasowych w SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 3c05e8b14f7d
---

# Baza danych {#database}

SnapOtter używa PostgreSQL 17 z [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) do trwałego przechowywania danych. Schemat jest zdefiniowany w `apps/api/src/db/schema.ts`.

Połączenie konfiguruje się za pomocą zmiennej środowiskowej `DATABASE_URL` (domyślnie `postgres://snapotter:snapotter@postgres:5432/snapotter`). W Docker Compose kontener Postgres przechowuje swoje dane w nazwanym wolumenie `SnapOtter-pgdata`.

## Tabele {#tables}

### users {#users}

Przechowuje konta użytkowników. Tworzone automatycznie przy pierwszym uruchomieniu na podstawie `DEFAULT_USERNAME` i `DEFAULT_PASSWORD`.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `username` | varchar | Unikalna, wymagana |
| `passwordHash` | varchar | Hash scrypt |
| `role` | varchar | `admin`, `editor` lub `user` |
| `mustChangePassword` | boolean | Flaga wymuszonego resetu hasła |
| `createdAt` | timestamp | Czas utworzenia |
| `updatedAt` | timestamp | Czas ostatniej aktualizacji |

### sessions {#sessions}

Aktywne sesje logowania. Każdy wiersz wiąże token sesji z użytkownikiem.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | varchar | Klucz główny (token sesji) |
| `userId` | uuid | Klucz obcy do `users.id` |
| `expiresAt` | timestamp | Czas wygaśnięcia |
| `createdAt` | timestamp | Czas utworzenia |

### teams {#teams}

Grupy służące do organizowania użytkowników. Administratorzy mogą przypisywać użytkowników do zespołów.

| Kolumna | Typ | Opis |
|--------|------|-------------|
| `id` | uuid | Klucz główny |
| `name` | varchar (unikalna, maks. 50 znaków) | Nazwa zespołu |
| `createdAt` | timestamp | Czas utworzenia |

### api_keys {#api-keys}

Klucze API do dostępu programowego. Surowy klucz jest pokazywany jednorazowo podczas tworzenia; przechowywany jest tylko jego hash.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `userId` | uuid | Klucz obcy do `users.id` |
| `keyHash` | varchar | Hash scrypt klucza |
| `name` | varchar | Etykieta podana przez użytkownika |
| `createdAt` | timestamp | Czas utworzenia |
| `lastUsedAt` | timestamp | Aktualizowany przy każdym uwierzytelnionym żądaniu |

Klucze mają prefiks `si_`, po którym następuje 96 znaków szesnastkowych (48 losowych bajtów).

### pipelines {#pipelines}

Zapisane łańcuchy narzędzi, które użytkownicy tworzą w interfejsie.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `name` | varchar | Nazwa potoku |
| `description` | varchar | Opcjonalny opis |
| `steps` | jsonb | Tablica obiektów `{ toolId, settings }` |
| `createdAt` | timestamp | Czas utworzenia |

### user_files {#user-files}

Trwała biblioteka plików ze śledzeniem łańcucha wersji. Każdy krok przetwarzania, który zapisuje wynik, tworzy nowy wiersz powiązany z rodzicem przez `parentId`, tworząc drzewo wersji.

| Kolumna | Typ | Opis |
|--------|------|-------------|
| `id` | uuid | Klucz główny |
| `userId` | uuid | Klucz obcy do users (CASCADE DELETE) |
| `originalName` | varchar | Oryginalna nazwa przesłanego pliku |
| `storedName` | varchar | Nazwa pliku na dysku |
| `mimeType` | varchar | Typ MIME |
| `size` | integer | Rozmiar pliku w bajtach |
| `width` | integer | Szerokość obrazu w px |
| `height` | integer | Wysokość obrazu w px |
| `version` | integer | Numer wersji (1 = oryginał) |
| `parentId` | uuid lub null | Klucz obcy do user_files (wersja rodzica) |
| `toolChain` | jsonb | Identyfikatory narzędzi zastosowane w kolejności, aby wytworzyć tę wersję |
| `createdAt` | timestamp | Czas utworzenia |

### jobs {#jobs}

Śledzi zadania przetwarzania na potrzeby raportowania postępu i porządkowania.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `type` | varchar | Identyfikator narzędzia lub potoku |
| `status` | varchar | `queued`, `processing`, `completed` lub `failed` |
| `progress` | real | Ułamek 0.0-1.0 |
| `inputFiles` | jsonb | Tablica ścieżek plików wejściowych |
| `outputPath` | varchar | Ścieżka do pliku wynikowego |
| `settings` | jsonb | Użyte ustawienia narzędzia |
| `error` | varchar | Komunikat o błędzie w razie niepowodzenia |
| `createdAt` | timestamp | Czas utworzenia |
| `completedAt` | timestamp | Czas zakończenia |

### settings {#settings}

Magazyn klucz-wartość dla ustawień obowiązujących w całym serwerze, które administratorzy mogą zmieniać z poziomu interfejsu.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `key` | varchar | Klucz główny |
| `value` | varchar | Wartość ustawienia |
| `updatedAt` | timestamp | Czas ostatniej aktualizacji |

### roles {#roles}

Role niestandardowe z uprawnieniami o dużej szczegółowości.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `name` | varchar | Unikalna nazwa roli |
| `description` | varchar | Opcjonalny opis |
| `permissions` | jsonb | Tablica ciągów uprawnień |
| `createdAt` | timestamp | Czas utworzenia |

### audit_log {#audit-log}

Dziennik działań istotnych dla bezpieczeństwa.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `userId` | uuid | Klucz obcy do users |
| `action` | varchar | Typ działania |
| `details` | jsonb | Dane specyficzne dla działania |
| `createdAt` | timestamp | Czas działania |

## Migracje {#migrations}

Drizzle zajmuje się migracjami schematu. Pliki migracji znajdują się w `apps/api/drizzle/`. Podczas developmentu:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

W środowisku produkcyjnym oczekujące migracje są stosowane automatycznie przy uruchomieniu.

## Kopia zapasowa i przywracanie {#backup-and-restore}

Relacyjna baza danych znajduje się w wolumenie `SnapOtter-pgdata` kontenera Postgres, a nie w wolumenie `/data` aplikacji.

**Opcja 1: pg_dump (zalecana)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Opcja 2: Migawka wolumenu**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migracja z 1.x (SQLite) {#migrating-from-1-x-sqlite}

Aktualizacja z SnapOtter 1.x ma własny przewodnik: zobacz [Aktualizacja z 1.x do 2.0](./upgrading). W skrócie, użyj ponownie istniejącego wolumenu `/data`, a 2.0 automatycznie wykryje i zaimportuje `/data/snapotter.db` przy pierwszym uruchomieniu (lub ustaw `SQLITE_MIGRATE_PATH`, aby wskazać go jawnie). Najpierw utwórz kopię zapasową całego wolumenu `/data`, a nie tylko `snapotter.db`: 1.x używa trybu SQLite WAL, więc zatrzymany kontener często pozostawia większość swoich danych w `snapotter.db-wal` obok niemal pustego `snapotter.db`.
