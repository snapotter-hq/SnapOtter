---
description: "Schemat bazy danych PostgreSQL, tabele, migracje i procedury tworzenia kopii zapasowych dla SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: e30652f35103
i18n_hash_version: 2
---

# Baza danych {#database}

SnapOtter używa PostgreSQL 17 z [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) do trwałego przechowywania danych. Schemat jest zdefiniowany w `apps/api/src/db/schema.ts`.

Połączenie konfiguruje się zmienną środowiskową `DATABASE_URL` (domyślnie `postgres://snapotter:snapotter@postgres:5432/snapotter`). W Docker Compose kontener Postgres przechowuje dane w nazwanym wolumenie `SnapOtter-pgdata`. Żądania są obsługiwane przez rolę, która może wyłącznie odczytywać i zapisywać wiersze, co opisano poniżej w sekcji [Role o najmniejszych uprawnieniach](#least-privilege-roles).

## Tabele {#tables}

### users {#users}

Przechowuje konta użytkowników. Tworzona automatycznie przy pierwszym uruchomieniu na podstawie `DEFAULT_USERNAME` i `DEFAULT_PASSWORD`.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `username` | varchar | Unikalna, wymagana |
| `passwordHash` | varchar | Skrót scrypt |
| `role` | varchar | `admin`, `editor` lub `user` |
| `mustChangePassword` | boolean | Flaga wymuszonego resetu hasła |
| `createdAt` | timestamp | Czas utworzenia |
| `updatedAt` | timestamp | Czas ostatniej aktualizacji |

### sessions {#sessions}

Aktywne sesje logowania. Każdy wiersz łączy token sesji z użytkownikiem.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | varchar | Klucz główny (token sesji) |
| `userId` | uuid | Klucz obcy do `users.id` |
| `expiresAt` | timestamp | Czas wygaśnięcia |
| `createdAt` | timestamp | Czas utworzenia |

### teams {#teams}

Grupy do organizowania użytkowników. Administratorzy mogą przypisywać użytkowników do zespołów.

| Kolumna | Typ | Opis |
|--------|------|-------------|
| `id` | uuid | Klucz główny |
| `name` | varchar (unikalna, maks. 50 znaków) | Nazwa zespołu |
| `createdAt` | timestamp | Czas utworzenia |

### api_keys {#api-keys}

Klucze API do dostępu programistycznego. Surowy klucz jest pokazywany jednorazowo przy tworzeniu; przechowywany jest tylko jego skrót.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `userId` | uuid | Klucz obcy do `users.id` |
| `keyHash` | varchar | Skrót scrypt klucza |
| `name` | varchar | Etykieta podana przez użytkownika |
| `createdAt` | timestamp | Czas utworzenia |
| `lastUsedAt` | timestamp | Aktualizowana przy każdym uwierzytelnionym żądaniu |

Klucze mają prefiks `si_`, po którym następuje 96 znaków szesnastkowych (48 losowych bajtów).

### pipelines {#pipelines}

Zapisane łańcuchy narzędzi tworzone przez użytkowników w interfejsie.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `name` | varchar | Nazwa potoku |
| `description` | varchar | Opcjonalny opis |
| `steps` | jsonb | Tablica obiektów `{ toolId, settings }` |
| `createdAt` | timestamp | Czas utworzenia |

### user_files {#user-files}

Trwała biblioteka plików. Zapisana edycja jest domyślnie wstawiana jako niezależny wiersz główny ("zapisz jako nowy": `version` 1, `parentId` null, więc oryginał pozostaje na liście) lub jako wersja powiązana z rodzicem, gdy nadpisywany jest oryginał (`parentId` ustawione, `version` zwiększone, co zastępuje oryginał). Kolumna `toolChain` rejestruje zastosowane narzędzia.

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
| `parentId` | uuid lub null | Klucz obcy do user_files (wersja nadrzędna) |
| `toolChain` | jsonb | Identyfikatory narzędzi zastosowanych po kolei do utworzenia tej wersji |
| `createdAt` | timestamp | Czas utworzenia |

### jobs {#jobs}

Śledzi zadania przetwarzania na potrzeby raportowania postępu i czyszczenia.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid | Klucz główny |
| `type` | varchar | Identyfikator narzędzia lub potoku |
| `status` | varchar | `queued`, `processing`, `completed` lub `failed` |
| `progress` | real | Ułamek 0.0-1.0 |
| `inputFiles` | jsonb | Tablica ścieżek plików wejściowych |
| `outputPath` | varchar | Ścieżka do pliku wynikowego |
| `settings` | jsonb | Użyte ustawienia narzędzia |
| `error` | varchar | Komunikat błędu w razie niepowodzenia |
| `createdAt` | timestamp | Czas utworzenia |
| `completedAt` | timestamp | Czas zakończenia |

### settings {#settings}

Magazyn klucz-wartość dla ustawień całego serwera, które administratorzy mogą zmieniać w interfejsie.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `key` | varchar | Klucz główny |
| `value` | varchar | Wartość ustawienia |
| `updatedAt` | timestamp | Czas ostatniej aktualizacji |

### roles {#roles}

Role niestandardowe ze szczegółowymi uprawnieniami.

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

Stan interfejsu dla poszczególnych użytkowników, indeksowany nazwą preferencji. Obsługuje przypięte narzędzia na pulpicie przez `PUT /api/v1/preferences`.

| Kolumna | Typ | Uwagi |
|---|---|---|
| `userId` | text | Klucz obcy do users, usuwany kaskadowo. Klucz główny razem z `key` |
| `key` | text | Nazwa preferencji. Klucz główny razem z `userId` |
| `value` | jsonb | Dane preferencji |
| `updatedAt` | timestamp | Ostatni zapis |

## Migracje {#migrations}

Migracjami schematu zajmuje się Drizzle. Pliki migracji znajdują się w `apps/api/drizzle/`. Podczas programowania:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

W produkcji oczekujące migracje są stosowane automatycznie przy uruchomieniu.

## Role o najmniejszych uprawnieniach {#least-privilege-roles}

Dwie role, dwa zadania. `DATABASE_URL` obsługuje żądania i ma uprawnienia `SELECT`, `INSERT`, `UPDATE`, `DELETE` do tabel aplikacji oraz `USAGE` i `SELECT` do ich sekwencji. To cała lista. Rola nie może tworzyć ani usuwać tabel, instalować rozszerzeń, `TRUNCATE`, odczytywać `pg_authid`, tworzyć baz danych, zmieniać ról ani dotykać schematu `drizzle`, w którym znajduje się historia migracji.

`DATABASE_MIGRATION_URL` jest rolą uprzywilejowaną. Uruchamia migracje i nadaje uprawnienia roli uruchomieniowej podczas rozruchu, a następnie zamyka się, zanim obsłużone zostanie jakiekolwiek żądanie.

Podział jest dostępny od SnapOtter 2.3.0. Od tej wersji pliki Compose w repozytorium i obraz all-in-one są tak skonfigurowane, także dla istniejących instalacji: przy rozruchu SnapOtter tworzy rolę uruchomieniową, jeśli jej brakuje, nadaje jej uprawnienia, wykonuje migracje, a następnie przenosi uprawnienia na tabele, które istniały wcześniej. Aktualizacja nie wymaga ręcznego SQL.

Obraz 2.2.0 czyta tylko ciąg połączenia roli uruchomieniowej i nigdy nie tworzy drugiej roli, więc po przekazaniu mu podziału nigdy się nie uruchomi: log aplikacji pokazuje niepowodzenie uwierzytelniania hasłem dla tej roli, a log Postgres informuje, że rola nie istnieje. Przed przełączeniem pliku Compose na podział należy zaktualizować obraz do wersji 2.3.0 lub nowszej.

Pozostawienie `DATABASE_MIGRATION_URL` pustego uruchamia aplikację z jedną rolą, a `DATABASE_URL` pełni obie funkcje dokładnie tak jak przed podziałem. Jest to wspierana konfiguracja, a nie przestarzała. To właściwe rozwiązanie w zarządzanym Postgres, gdzie tworzenie ról często nie leży w gestii użytkownika.

### Zewnętrzny i zarządzany Postgres {#external-and-managed-postgres}

W RDS, Supabase, Cloud SQL lub w dowolnym klastrze prowadzonym samodzielnie podział jest opcjonalny. Rolę uruchomieniową tworzy się jednorazowo:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Następnie należy przekazać SnapOtter oba ciągi połączenia, wskazujące ten sam host, port i bazę danych:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Na tym koniec. SnapOtter sam nadaje uprawnienia i stosuje je ponownie po każdej migracji, więc tabela dodana w przyszłym wydaniu jest objęta bez uruchamiania dla niej SQL.

Rola w `DATABASE_MIGRATION_URL` musi być właścicielem tabel SnapOtter, ponieważ tylko właściciel tabeli może nadawać do niej uprawnienia. W istniejącej instalacji oznacza to rolę, jako którą dotąd działał SnapOtter, a nie świeżo utworzoną w tym celu. Wskazanie nowej roli, która nie jest właścicielem niczego, powoduje błąd rozruchu z komunikatem mówiącym dokładnie o tym. Potrzebuje ona także `CREATEROLE`, aby tworzyć i utrzymywać rolę uruchomieniową, oraz prawa do utworzenia schematu `drizzle`.

Wpisanie tej samej roli w obu adresach URL wyłącza podział, a SnapOtter zapisuje to w logu zamiast udawać coś innego. Jeśli dostawca nie daje roli, która może jednocześnie być właścicielem tabel i mieć `CREATEROLE`, należy uruchomić aplikację z jedną rolą.

### Dlaczego bit superużytkownika pozostaje nietknięty {#why-the-superuser-bit-is-left-alone}

SnapOtter nigdy sam nie odbiera `SUPERUSER` żadnej roli. W instalacji utworzonej przed podziałem `snapotter` jest jedynym superużytkownikiem klastra, a jego degradacja pozostawiłaby klaster bez żadnego, co można naprawić tylko w trybie jednoużytkownikowym przy zatrzymanym serwerze. Ochronę zapewnia przeniesienie długotrwałego połączenia na rolę z ograniczeniami. Superużytkownik jest w użyciu przez kilka sekund rozruchu, a potem znika.

Nowe instalacje all-in-one nigdy nie mają tego problemu. Dostają trzy role: `postgres` (superużytkownik bootstrap, nieobecny w żadnym ciągu połączenia używanym przez SnapOtter), `snapotter` (`NOSUPERUSER`, jest właścicielem danych, łączy się tylko przy rozruchu) oraz `snapotter_app` (tylko wiersze, obsługuje żądania).

Aby mimo to zdegradować starszą rolę `snapotter`, należy najpierw utworzyć drugiego superużytkownika i zalogować się jako on, aby potwierdzić, że działa. Następnie `ALTER ROLE snapotter NOSUPERUSER`.

## Kopia zapasowa i przywracanie {#backup-and-restore}

Baza relacyjna znajduje się w wolumenie `SnapOtter-pgdata` kontenera Postgres, a nie w wolumenie `/data` aplikacji.

**Logiczna kopia zapasowa z walidacją (zalecana)**

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

Oba polecenia łączą się jako `snapotter`, właściciel, i powinny tak pozostać. Rola uruchomieniowa nie widzi schematu `drizzle`, więc zrzut wykonany jako ta rola byłby niekompletny. `--no-owner` pozostawia przywrócone obiekty we władaniu osoby wykonującej przywracanie, więc uruchomienie go jako właściciel ustawia własność tam, gdzie oczekują jej uprawnienia. Jedna pułapka w świeżym klastrze: `pg_dump` zawiera uprawnienia, ale nie role, których dotyczą, więc przed przywracaniem należy utworzyć `snapotter_app`, bo inaczej `--exit-on-error` zatrzyma się na pierwszym `GRANT`. SnapOtter i tak ponownie nadaje uprawnienia przy następnym rozruchu.

Ten zrzut bazy danych nie zawiera zapisanych obiektów biblioteki w `/data/files` ani trwałego stanu BullMQ w Redis. Ich kopię zapasową i przywracanie wykonuje się według skoordynowanej procedury opisanej w [Bezpieczeństwo i utwardzanie](/pl/guide/security#backup-and-recovery).

**Zimna migawka wolumenu**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Nie kopiować działającego katalogu danych PostgreSQL za pomocą `tar`. Compose dodaje do nazw wolumenów prefiks projektu, więc identyfikatory zamontowanych wolumenów należy ustalić z `docker inspect` lub z platformy przechowywania danych, zamiast zakładać dosłowną etykietę `SnapOtter-pgdata`.

### Migracja z wersji 1.x (SQLite) {#migrating-from-1-x-sqlite}

Aktualizacja z SnapOtter 1.x ma własny przewodnik: zobacz [Aktualizacja z 1.x do 2.0](./upgrading). W skrócie: użyć ponownie istniejącego wolumenu `/data`, a wersja 2.0 automatycznie wykryje i zaimportuje `/data/snapotter.db` przy pierwszym rozruchu (lub ustawić `SQLITE_MIGRATE_PATH`, aby wskazać go jawnie). Najpierw wykonać kopię zapasową całego wolumenu `/data`, a nie tylko `snapotter.db`: wersja 1.x używa trybu WAL SQLite, więc zatrzymany kontener często zostawia większość danych w `snapotter.db-wal` obok niemal pustego `snapotter.db`.
