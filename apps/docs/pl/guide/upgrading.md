---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 27c0170930b5
i18n_hash_version: 2
---
# Aktualizacja z 1.x do 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x przechowywał wszystko w jednym pliku SQLite i działał jako jeden kontener. SnapOtter 2.0 używa PostgreSQL i Redis. Ten przewodnik opisuje przeniesienie instalacji 1.x do 2.0 bez utraty danych.

W skrócie: należy użyć ponownie istniejącego woluminu `/data`, a wersja 2.0 automatycznie zaimportuje bazę danych 1.x przy pierwszym uruchomieniu. Przeniesione zostaną użytkownicy, zapisane pliki, ustawienia, klucze API i potoki. Stara baza danych nie jest nigdy modyfikowana, więc zawsze można wrócić do poprzedniej wersji.

::: tip Uwaga dla użytkowników 1.x
Wielu z Was ufa SnapOtter od pierwszego dnia, a Wasze opinie ukształtowały to wydanie. Wersja 2.0 zmienia wiele pod maską, a ten przewodnik ma sprawić, żeby przejście nie kosztowało niczego, co jest dla Was ważne. Konta, pliki, ustawienia, klucze API i potoki zostają przeniesione, a stara baza danych pozostaje nietknięta. Dziękujemy za aktualizację razem z nami.
:::

## Zanim zaczniesz: wykonaj kopię zapasową całego woluminu `/data` {#before-you-start-back-up-the-whole-data-volume}

Należy to zrobić najpierw, za każdym razem. Kopię zapasową trzeba wykonać dla **całego** woluminu `/data`, a nie tylko pliku `snapotter.db`.

Oto dlaczego ma to znaczenie. Wersja 1.x uruchamia SQLite w trybie WAL, więc zatrzymany kontener 1.x zwykle zostawia większość zatwierdzonych danych w `snapotter.db-wal` obok niemal pustego `snapotter.db`. Skopiowanie samego `snapotter.db` daje pustą bazę danych i po cichu gubi wszystko. Wolumin zawiera razem `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` oraz katalog `files/` i muszą być przenoszone jako komplet.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Najpierw zaktualizuj do 1.17.2 {#upgrade-to-1-17-2-first}

Instalację 1.x należy zaktualizować do najnowszego wydania 1.x (1.17.2) przed przejściem na 2.0. Pozwala to wersji 1.x wykonać własne końcowe migracje schematu, dzięki czemu 2.0 importuje ze znanego, kompletnego schematu. Aktualizacja ze starszej wersji 1.x bezpośrednio do 2.0 nie jest obsługiwana.

## Sprawdź nazwę woluminu {#check-your-volume-name}

Importer widzi dane tylko wtedy, gdy stos 2.0 montuje ten sam wolumin, którego używała instalacja 1.x. Nazwy woluminów Docker rozróżniają wielkość liter, a starsze fragmenty README używały małych liter `snapotter-data`, podczas gdy pliki Compose używają `SnapOtter-data`. Należy sprawdzić, który z nich jest używany:

```bash
docker volume ls | grep -i snapotter
```

Dokładnie tej nazwy należy użyć w konfiguracji 2.0.

## Ścieżka A: pojedynczy kontener (najszybsza) {#path-a-single-container-quickest}

Jeśli SnapOtter działa z pojedynczym `docker run`, można to zachować. Wersja 2.0 uruchamia wbudowane PostgreSQL i Redis wewnątrz kontenera, gdy nie ustawiono `DATABASE_URL` ani `REDIS_URL`, a przy pierwszym uruchomieniu automatycznie wykrywa i importuje `/data/snapotter.db`.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

W logach należy wypatrywać linii podobnej do:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

To wszystko. Można zalogować się istniejącymi danymi uwierzytelniającymi.

## Ścieżka B: Compose (zalecana dla produkcji) {#path-b-compose-recommended-for-production}

Stos Compose 2.0 uruchamia trzy usługi (aplikacja, Postgres, Redis). Dla usługi aplikacji należy użyć ponownie woluminu `/data` z wersji 1.x. Aplikacja automatycznie wykrywa `/data/snapotter.db` i importuje go do Postgres przy pierwszym uruchomieniu.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Jeśli wolisz wskazać starą bazę danych jawnie, należy ustawić `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Jawna ścieżka zawsze ma pierwszeństwo przed automatycznym wykrywaniem.

## Podgląd importu (opcjonalnie) {#preview-the-import-first-optional}

Aby zobaczyć dokładnie, co zostałoby zaimportowane, nic przy tym nie zapisując, należy uruchomić próbę (dry run) na pliku bazy danych:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Wypisuje liczbę wierszy w każdej tabeli, liczbę znalezionych na dysku plików zapisanej biblioteki oraz statusy zadań, które zostaną znormalizowane. Nie wymaga działającego Postgres.

## Co zostaje przeniesione, a co nie {#what-carries-over-and-what-does-not}

Przenoszone:

- Użytkownicy i możliwość logowania. Skróty haseł pozostają bez zmian, więc ta sama nazwa użytkownika i to samo hasło działają.
- Zespoły, ustawienia (w tym tożsamość instancji), role, klucze API (nadal działają) i zapisane potoki.
- Rekordy historii zadań.
- Zapisana biblioteka plików, zarówno rekordy, jak i same pliki, ponieważ `/data/files` jest zachowany na woluminie.

Nieprzenoszone:

- Sesje logowania. Po aktualizacji każdy loguje się jeszcze raz. Dane uwierzytelniające się nie zmieniają, więc to jedno ponowne logowanie i nic więcej.
- Pliki wejściowe i wyjściowe starych zadań przetwarzania. Znajdowały się w tymczasowej przestrzeni roboczej i zostały usunięte z założenia. Rekordy historii zadań pozostają.
- Flagi zgody na analitykę dla poszczególnych użytkowników z 1.x, które nie mają odpowiednika w 2.0 (analityka w 2.0 jest ustawieniem na poziomie instancji).

## Wyłączanie importu {#turning-the-import-off}

Jeśli celowo ma powstać świeża baza danych mimo obecności `snapotter.db` na woluminie, należy ustawić `SQLITE_MIGRATE_PATH=off`.

## Jeśli w instancji 2.0 są już dane {#if-you-already-have-data-in-the-2-0-instance}

Importer działa tylko na pustej bazie danych. Jeśli wersja 2.0 została uruchomiona od zera (z utworzeniem danych), a dopiero później zamontowano stary `snapotter.db`, 2.0 go wykryje, ale nie zaimportuje, ponieważ scalenie dwóch zestawów danych może powodować kolizje identyfikatorów. W logach pojawi się ostrzeżenie. Aby zaimportować dane 1.x, potrzebna jest pusta instancja:

- Jeśli instancja 2.0 zawiera tylko domyślnego administratora (nie była naprawdę używana), należy zatrzymać stos, usunąć wolumin Postgres (`SnapOtter-pgdata`) i uruchomić ponownie z obecnym starym `/data`. Import przebiegnie czysto. Usuwa to tylko jednorazowe dane Postgres, a nie bazę danych 1.x.
- Jeśli instancja 2.0 zawiera prawdziwe dane, które mają zostać zachowane, dwóch zestawów danych nie da się automatycznie scalić. Należy wyeksportować potrzebne dane i zaimportować dane 1.x do osobnego, świeżego wdrożenia.

## Wycofanie zmian {#rolling-back}

Aktualizacja nigdy nie modyfikuje ani nie usuwa Twojego `snapotter.db` z wersji 1.x. Jeśli konieczny jest powrót do 1.x, należy wdrożyć ponownie obraz 1.x na tym samym woluminie. Wszystko, co zostało utworzone w 2.0 po aktualizacji, znajduje się w Postgres i nie będzie w bazie danych 1.x, więc jeśli powrót jest planowany, należy to zrobić szybko.
