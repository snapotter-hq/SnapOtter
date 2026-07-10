---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: 885333ebeddf
---
# Aktualizacja z 1.x do 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x przechowywał wszystko w pojedynczym pliku SQLite i działał jako jeden kontener. SnapOtter 2.0 używa PostgreSQL i Redis. Ten przewodnik prowadzi przez przeniesienie instalacji 1.x do 2.0 bez utraty danych.

W skrócie: użyj ponownie istniejącego woluminu `/data`, a 2.0 automatycznie zaimportuje Twoją bazę danych 1.x przy pierwszym uruchomieniu. Twoi użytkownicy, zapisane pliki, ustawienia, klucze API i potoki zostaną przeniesione. Stara baza danych nigdy nie jest modyfikowana, więc zawsze możesz cofnąć zmiany.

::: tip Uwaga dla naszych użytkowników 1.x
Wielu z Was zaufało SnapOtter od pierwszego dnia, a Wasze opinie ukształtowały to wydanie. 2.0 zmienia wiele pod maską, a ten przewodnik istnieje po to, by przenosiny nie kosztowały Was niczego, na czym Wam zależy. Wasze konta, pliki, ustawienia, klucze API i potoki są przenoszone, a Wasza stara baza danych nigdy nie jest ruszana. Dziękujemy, że aktualizujecie razem z nami.
:::

## Zanim zaczniesz: wykonaj kopię zapasową całego woluminu `/data` {#before-you-start-back-up-the-whole-data-volume}

Zrób to najpierw, za każdym razem. Wykonaj kopię zapasową **całego** woluminu `/data`, a nie tylko pliku `snapotter.db`.

Oto dlaczego to ma znaczenie. 1.x uruchamia SQLite w trybie WAL, więc zatrzymany kontener 1.x rutynowo pozostawia większość zatwierdzonych danych w `snapotter.db-wal`, obok niemal pustego `snapotter.db`. Skopiowanie tylko `snapotter.db` przechwytuje pustą bazę danych i po cichu traci wszystko. Wolumin przenosi razem `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` oraz Twój katalog `files/`, i muszą one wędrować jako komplet.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Najpierw zaktualizuj do 1.17.2 {#upgrade-to-1-17-2-first}

Zaktualizuj swoją instalację 1.x do najnowszego wydania 1.x (1.17.2), zanim przejdziesz do 2.0. Dzięki temu 1.x uruchomi własne końcowe migracje schematu, tak że 2.0 importuje ze znanego, kompletnego schematu. Aktualizacja ze starszej wersji 1.x bezpośrednio do 2.0 nie jest obsługiwana.

## Sprawdź nazwę swojego woluminu {#check-your-volume-name}

Importer widzi Twoje dane tylko wtedy, gdy stos 2.0 montuje ten sam wolumin, którego używała Twoja instalacja 1.x. Nazwy woluminów Docker rozróżniają wielkość liter, a starsze fragmenty README używały małych liter `snapotter-data`, podczas gdy pliki Compose używają `SnapOtter-data`. Potwierdź, którą masz:

```bash
docker volume ls | grep -i snapotter
```

Użyj dokładnie tej nazwy w swojej konfiguracji 2.0.

## Ścieżka A: pojedynczy kontener (najszybsza) {#path-a-single-container-quickest}

Jeśli uruchamiasz SnapOtter jednym `docker run`, rób to nadal. 2.0 uruchamia wbudowany PostgreSQL i Redis wewnątrz kontenera, gdy nie ustawisz `DATABASE_URL` ani `REDIS_URL`, oraz automatycznie wykrywa i importuje `/data/snapotter.db` przy pierwszym uruchomieniu.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Obserwuj logi w poszukiwaniu wiersza w rodzaju:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

To wszystko. Zaloguj się przy użyciu swoich dotychczasowych danych uwierzytelniających.

## Ścieżka B: Compose (zalecana dla produkcji) {#path-b-compose-recommended-for-production}

Stos Compose w 2.0 uruchamia trzy usługi (aplikacja, Postgres, Redis). Użyj ponownie woluminu `/data` z 1.x dla usługi aplikacji. Aplikacja automatycznie wykrywa `/data/snapotter.db` i importuje go do Postgres przy pierwszym uruchomieniu.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Jeśli wolisz jawnie wskazać starą bazę danych, ustaw `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Jawna ścieżka zawsze ma pierwszeństwo przed automatycznym wykrywaniem.

## Najpierw podejrzyj import (opcjonalnie) {#preview-the-import-first-optional}

Aby zobaczyć dokładnie, co zostałoby zaimportowane, bez zapisywania czegokolwiek, uruchom próbny przebieg wobec pliku bazy danych:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Wypisuje liczbę wierszy na tabelę, ile plików biblioteki zapisanych plików znaleziono na dysku oraz wszelkie statusy zadań, które znormalizuje. Nie potrzebuje działającego Postgres.

## Co jest przenoszone, a co nie {#what-carries-over-and-what-does-not}

Przenoszone:

- Użytkownicy i możliwość logowania. Skróty haseł pozostają niezmienione, więc ta sama nazwa użytkownika i hasło działają.
- Zespoły, ustawienia (w tym tożsamość Twojej instancji), role, klucze API (nadal działają) i zapisane potoki.
- Rekordy historii zadań.
- Twoja biblioteka zapisanych plików, zarówno rekordy, jak i faktyczne pliki, ponieważ `/data/files` jest zachowywany na woluminie.

Nieprzenoszone:

- Sesje logowania. Wszyscy logują się raz po aktualizacji. Dane uwierzytelniające pozostają niezmienione, więc to pojedyncze ponowne logowanie, nic więcej.
- Pliki wejściowe i wyjściowe starych zadań przetwarzania. Znajdowały się one w tymczasowej przestrzeni roboczej i zniknęły z założenia. Rekordy historii zadań pozostają.
- Flagi zgody na analitykę per użytkownik z 1.x, które nie mają odpowiednika w 2.0 (analityka w 2.0 to ustawienie na poziomie instancji).

## Wyłączanie importu {#turning-the-import-off}

Jeśli celowo chcesz świeżą bazę danych, mimo że na woluminie obecny jest `snapotter.db`, ustaw `SQLITE_MIGRATE_PATH=off`.

## Jeśli masz już dane w instancji 2.0 {#if-you-already-have-data-in-the-2-0-instance}

Importer uruchamia się tylko do pustej bazy danych. Jeśli uruchomiłeś 2.0 od zera (tworząc dane), a później zamontowałeś stary `snapotter.db`, 2.0 go wykryje, ale nie zaimportuje, ponieważ scalanie dwóch zestawów danych może kolidować na identyfikatorach. Zobaczysz ostrzeżenie w logach. Aby zaimportować dane 1.x, potrzebujesz pustej instancji:

- Jeśli instancja 2.0 zawiera tylko domyślnego administratora (tak naprawdę jej nie używałeś), zatrzymaj stos, usuń wolumin Postgres (`SnapOtter-pgdata`) i uruchom ponownie z obecnym starym `/data`. Zaimportuje się czysto. To wymazuje tylko jednorazowe dane Postgres, a nie Twoją bazę danych 1.x.
- Jeśli instancja 2.0 zawiera prawdziwe dane, które chcesz zachować, dwóch zestawów danych nie da się automatycznie scalić. Wyeksportuj to, czego potrzebujesz, i zaimportuj dane 1.x do osobnego, świeżego wdrożenia.

## Cofanie zmian {#rolling-back}

Aktualizacja nigdy nie modyfikuje ani nie usuwa Twojego `snapotter.db` z 1.x. Jeśli musisz wrócić do 1.x, wdróż ponownie obraz 1.x wobec tego samego woluminu. Wszystko, co utworzyłeś w 2.0 po aktualizacji, znajduje się w Postgres i nie będzie w bazie danych 1.x, więc cofnij zmiany bezzwłocznie, jeśli masz to zrobić.
