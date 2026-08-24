---
description: "Schemat bazy danych PostgreSQL, tabele, migracje i procedury tworzenia kopii zapasowych w SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: a5a489e038ba
i18n_hash_version: 2
---

# Baza danych {#database}

SnapOtter używa PostgreSQL 17 z [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) do trwałego przechowywania danych. Schemat jest zdefiniowany w `apps/api/src/db/schema.ts`.

Połączenie konfiguruje się za pomocą zmiennej środowiskowej `DATABASE_URL` (domyślnie `postgres://snapotter:snapotter@postgres:5432/snapotter`). W Docker Compose kontener Postgres przechowuje swoje dane w nazwanym wolumenie `SnapOtter-pgdata`. Żądania są obsługiwane przez rolę, która może wyłącznie odczytywać i zapisywać wiersze, co opisano poniżej w sekcji [Role o najmniejszych uprawnieniach](#least-privilege-roles).

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

Trwała biblioteka plików. Zapisana edycja jest domyślnie wstawiana jako niezależny wiersz główny („zapisz jako nowy": `version` 1, `parentId` null, więc oryginał pozostaje na liście) albo jako wersja powiązana z rodzicem, gdy nadpisujesz oryginał (`parentId` ustawiony, `version` zwiększony, zastępując go). Kolumna `toolChain` zapisuje zastosowane narzędzia.

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

### user_preferences {#user-preferences}

Stan interfejsu dla poszczególnych użytkowników, kluczowany nazwą preferencji. Przechowuje przypięte narzędzia strony głównej, zapisywane przez `PUT /api/v1/preferences`.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `userId` | text | Klucz obcy do users, kasowanie kaskadowe. Razem z `key` tworzy klucz główny |
| `key` | text | Nazwa preferencji. Razem z `userId` tworzy klucz główny |
| `value` | jsonb | Zawartość preferencji |
| `updatedAt` | timestamp | Ostatni zapis |

## Migracje {#migrations}

Drizzle zajmuje się migracjami schematu. Pliki migracji znajdują się w `apps/api/drizzle/`. Podczas developmentu:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

W środowisku produkcyjnym oczekujące migracje są stosowane automatycznie przy uruchomieniu.

## Role o najmniejszych uprawnieniach {#least-privilege-roles}

Dwie role, dwa zadania. `DATABASE_URL` obsługuje żądania i ma uprawnienia `SELECT`, `INSERT`, `UPDATE`, `DELETE` do tabel aplikacji oraz `USAGE` i `SELECT` do ich sekwencji. To cała lista. Nie może utworzyć ani usunąć tabeli, zainstalować rozszerzenia, wykonać `TRUNCATE`, odczytać `pg_authid`, utworzyć bazy danych, zmienić roli ani sięgnąć do schematu `drizzle`, w którym przechowywana jest historia migracji.

`DATABASE_MIGRATION_URL` to ta uprzywilejowana. Wykonuje migracje i nadaje uprawnienia roli wykonawczej podczas uruchamiania, a potem zamyka połączenie, zanim zostanie obsłużone jakiekolwiek żądanie.

Compose i obraz all-in-one są już tak skonfigurowane, łącznie z istniejącymi instalacjami. Przy uruchomieniu SnapOtter tworzy rolę wykonawczą, jeśli jej brakuje, nadaje jej uprawnienia, wykonuje migracje, a następnie rozciąga uprawnienia na tabele, które istniały wcześniej. Aktualizacja nie wymaga ręcznego SQL-a.

Pozostawienie pustej zmiennej `DATABASE_MIGRATION_URL` uruchamia tryb jednorolowy, w którym `DATABASE_URL` wykonuje oba zadania dokładnie tak jak przed podziałem. Jest to konfiguracja wspierana, a nie wycofywana. Na zarządzanym Postgresie to właściwy wybór, ponieważ tworzenie ról często nie leży w Twojej gestii.

### Zewnętrzny i zarządzany Postgres {#external-and-managed-postgres}

Na RDS, Supabase, Cloud SQL lub dowolnym klastrze, który prowadzisz samodzielnie, podział jest opcjonalny. Rolę wykonawczą tworzysz raz:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Następnie przekaż SnapOtterowi oba ciągi połączenia, wskazujące ten sam host, port i bazę danych:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Na tym poprzestań. SnapOtter sam nadaje uprawnienia i nadaje je ponownie po każdej migracji, więc tabela dodana w przyszłym wydaniu zostanie objęta bez uruchamiania SQL-a przez kogokolwiek.

Rola wskazana w `DATABASE_MIGRATION_URL` musi być właścicielem tabel SnapOttera, ponieważ uprawnienia do tabeli może nadawać wyłącznie jej właściciel. W istniejącej instalacji oznacza to rolę, na której dotąd działał SnapOtter, a nie nową, utworzoną specjalnie w tym celu. Jeśli wskażesz nową rolę, która nie jest niczego właścicielem, uruchomienie zakończy się błędem mówiącym dokładnie o tym. Potrzebuje ona także uprawnienia `CREATEROLE`, aby tworzyć i utrzymywać rolę wykonawczą, oraz prawa do utworzenia schematu `drizzle`.

Podanie tej samej roli w obu adresach URL wyłącza podział, a SnapOtter zapisuje to w dzienniku, zamiast udawać, że jest inaczej. Jeśli Twój dostawca nie daje Ci roli, która jednocześnie jest właścicielem tabel i ma uprawnienie `CREATEROLE`, uruchom tryb jednorolowy.

### Dlaczego bit superużytkownika pozostaje nietknięty {#why-the-superuser-bit-is-left-alone}

SnapOtter nigdy sam nie odbiera roli uprawnienia `SUPERUSER`. W instalacji utworzonej przed podziałem `snapotter` jest jedynym superużytkownikiem klastra, a jego degradacja pozostawiłaby klaster bez żadnego, co da się naprawić tylko w trybie jednoużytkownikowym przy zatrzymanym serwerze. Ochronę daje zamiast tego przeniesienie długotrwałego połączenia na rolę o ograniczonych uprawnieniach. Superużytkownik jest w sieci przez kilka sekund uruchamiania, a potem znika.

Nowe instalacje all-in-one nigdy nie mają tego problemu. Otrzymują trzy role: `postgres` (superużytkownik startowy, nieobecny w żadnym ciągu połączenia używanym przez SnapOttera), `snapotter` (`NOSUPERUSER`, właściciel danych, łączy się tylko przy uruchamianiu) oraz `snapotter_app` (tylko wiersze, obsługuje żądania).

Aby mimo wszystko zdegradować starszą rolę `snapotter`, najpierw utwórz drugiego superużytkownika i zaloguj się na niego, aby potwierdzić, że działa. Następnie `ALTER ROLE snapotter NOSUPERUSER`.

## Utwórz kopię zapasową i przywróć {#backup-and-restore}

Relacyjna baza danych znajduje się w woluminie `SnapOtter-pgdata` kontenera Postgres, a nie w wolumenie `/data` aplikacji.

**Logiczna kopia zapasowa z walidacją (zalecane)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Oba polecenia łączą się jako `snapotter`, czyli właściciel, i tak powinno pozostać. Rola wykonawcza nie widzi schematu `drizzle`, więc zrzut wykonany na tej roli byłby niekompletny. `--no-owner` sprawia, że właścicielem przywróconych obiektów zostaje ten, kto uruchamia przywracanie, więc uruchomienie go jako właściciel umieszcza własność tam, gdzie oczekują tego nadane uprawnienia. Jedna pułapka na świeżym klastrze: `pg_dump` przenosi uprawnienia, ale nie role, które w nich występują, więc utwórz `snapotter_app` przed przywracaniem, w przeciwnym razie `--exit-on-error` zatrzyma się na pierwszym `GRANT`. Niezależnie od tego SnapOtter ponownie nada uprawnienia przy kolejnym uruchomieniu.

Ten zrzut bazy danych nie zawiera zapisanych obiektów biblioteki w `/data/files` ani trwałego stanu BullMQ w Redis. Utwórz kopię zapasową i przywróć te dane, stosując skoordynowaną procedurę w [Bezpieczeństwo i wzmacnianie](/pl/guide/security#backup-and-recovery).

**Migawka zimnego woluminu**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Nie kopiuj aktywnego katalogu danych PostgreSQL za pomocą `tar`. Twórz przedrostki nazw woluminów według projektu, więc rozpoznaj identyfikatory zamontowanych woluminów z `docker inspect` lub platformy pamięci masowej, zamiast przyjmować dosłowną etykietę `SnapOtter-pgdata`.

### Migracja z 1.x (SQLite) {#migrating-from-1-x-sqlite}

Aktualizacja z SnapOtter 1.x ma własny przewodnik: zobacz [Aktualizacja z 1.x do 2.0](./upgrading). W skrócie, użyj ponownie istniejącego wolumenu `/data`, a 2.0 automatycznie wykryje i zaimportuje `/data/snapotter.db` przy pierwszym uruchomieniu (lub ustaw `SQLITE_MIGRATE_PATH`, aby wskazać go jawnie). Najpierw utwórz kopię zapasową całego wolumenu `/data`, a nie tylko `snapotter.db`: 1.x używa trybu SQLite WAL, więc zatrzymany kontener często pozostawia większość swoich danych w `snapotter.db-wal` obok niemal pustego `snapotter.db`.
