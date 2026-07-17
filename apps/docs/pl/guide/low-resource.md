---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: efa60ae10299
---
# Konfiguracje o ograniczonych zasobach {#low-resource-setups}

SnapOtter dobrze działa na małym sprzęcie: Raspberry Pi 4 lub 5, starym laptopie czy VPS-ie z 2 GB. Ta strona to praktyczny przewodnik dla takich maszyn: czego się spodziewać, gotowa do wklejenia konfiguracja z rozsądnymi limitami i które funkcje pominąć. Pełne dane z testów wydajności stojące za tymi liczbami znajdziesz w [Wymaganiach sprzętowych](/pl/guide/deployment#hardware-requirements).

Na początek dwa twarde ograniczenia:

- **Tylko 64 bity.** Obraz jest budowany dla `linux/amd64` i `linux/arm64`. 32-bitowy ARM (`armv7`/`armhf`) nie jest obsługiwany, więc Pi pierwszej generacji i rodzina Pi Zero odpadają.
- **Próg pamięci 2 GB.** 512 MB nie uruchomi stosu, a 1 GB zawodzi przy partiach wielu plików. 2 GB i 2 rdzenie to najmniejsza konfiguracja, która działa komfortowo.

## Co działa dobrze na małym sprzęcie {#what-runs-well}

Każde narzędzie niekorzystające z AI działa na maszynie 2 GB / 2 rdzenie: całe sekcje Obraz i Pliki, narzędzia PDF oraz operacje wideo i audio kopiujące strumień (przycinanie, wyciszanie, remux kontenera). Większość kończy się w mniej niż sekundę.

Wyjątkiem są dwa rodzaje obciążeń:

- **Ponowne kodowanie wideo** (konwersja między kodekami) jest ograniczone przez CPU. Klip 1080p, który na szybkim procesorze desktopowym zajmuje ~40 s, na procesorze klasy Pi może zająć kilka minut. Operacje kopiowania strumienia pozostają natychmiastowe.
- **Narzędzia AI** potrzebują RAM-u (zalecane 4 GB) i dysku (większe pakiety mają po 4-5 GB), a te ciężkie (skalowanie w górę, przywracanie zdjęć, usuwanie tła) nie są praktyczne na procesorach klasy Pi. Lekkie AI, takie jak wykrywanie twarzy i OCR, jest użyteczne, jeśli masz na nie pamięć.

Żadne z nich nie jest instalowane ani uruchamiane, dopóki go nie używasz: bez zainstalowanych pakietów AI aplikacja w spoczynku zajmuje około 360 MB, a pakiety AI są pobierane dopiero wtedy, gdy administrator je włączy.

## Przewodnik dla Raspberry Pi / starego laptopa {#walkthrough}

To standardowa instalacja Compose z [Pierwszych kroków](/pl/guide/getting-started) plus limity zasobów i zachowawcze ograniczenia. Zakłada 64-bitowy system operacyjny (na Pi: Raspberry Pi OS 64-bit lub Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Uwagi dla maszyn klasy Pi:

- **Wybierz dysk SSD na USB zamiast karty SD** na wolumen danych i Postgres. Przestrzenie robocze zadań generują realne operacje dyskowe, a karty SD są powolne i szybko się zużywają.
- **Kontener wszystko-w-jednym też tutaj działa** (wbudowane Postgres i Redis, gdy `DATABASE_URL`/`REDIS_URL` nie są ustawione), a na hoście z małą ilością pamięci warto obniżyć limit wbudowanego Redisa przez `REDIS_MAXMEMORY` (zobacz [Konfigurację](/pl/guide/configuration)). Compose daje dokładniejszą kontrolę nad poszczególnymi usługami i dlatego ten przewodnik z niego korzysta.
- **Dodaj swap na urządzeniach z 2 GB.** Dzięki temu okazjonalny skok (duży PDF, partia bez ustawionego limitu) nie skończy się zabiciem procesu z powodu braku pamięci. zram to opcja przyjazna kartom SD.
- Obraz arm64 działa wyłącznie na CPU; na płytkach ARM nie ma CUDA.

## Parametry do dostrojenia {#tuning-knobs}

Wszystkie limity to zmienne środowiskowe, w pełni udokumentowane w [Konfiguracji](/pl/guide/configuration). `0` oznacza brak limitu lub tryb automatyczny. Na małym sprzęcie znaczenie mają te:

| Zmienna | Sugestia dla małej maszyny | Co chroni |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Ile zadań działa równolegle. Automatyczne wykrywanie używa liczby rdzeni CPU minus jeden, co jest w porządku na dużych maszynach, a zbyt zachłanne na maszynie z 2 rdzeniami pod presją pamięci. |
| `MAX_WORKER_THREADS` | `2` | Pula wątków przetwarzania obrazów. |
| `MAX_BATCH_SIZE` | `5` | To przy partiach maszynom z 1-2 GB najpierw kończy się pamięć. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Zapobiega zajęciu całej przestrzeni roboczej przez jeden ogromny plik. |
| `MAX_MEGAPIXELS` | `50` | Dekodowanie obrazu 100+ MP kosztuje RAM niezależnie od rozmiaru pliku. |
| `MAX_VIDEO_DURATION_S` | `300` | Długie transkodowania monopolizują mały procesor na minuty, a nawet godziny. |
| `PROCESSING_TIMEOUT_S` | `600` | Twardy sufit, dzięki któremu zadanie, które wymknęło się spod kontroli, w końcu zwolni maszynę. |

Te limity dotyczą tego, co serwer przyjmuje, więc ustaw je pod to, czego faktycznie używasz, a nie możliwie najniżej. Jeśli nigdy nie dotykasz wideo, limit `MAX_VIDEO_DURATION_S` nic nie kosztuje; jeśli codziennie skanujesz dokumenty, nie ograniczaj `MAX_PDF_PAGES`.

## Co pominąć {#what-to-skip}

- **Ciężkie pakiety AI.** Skalowanie w górę, przywracanie zdjęć i usuwanie tła chcą GPU albo szybkiego procesora z wieloma rdzeniami, a każdy pakiet kosztuje 4-5 GB dysku. Na małej maszynie po prostu ich nie instaluj; narzędzia, którym brakuje pakietu, pokazują monit o instalację zamiast się uruchamiać.
- **Ponowne kodowanie wideo jako rutynowe obciążenie.** Okazjonalne transkodowania są w porządku (są po prostu wolne); stała kolejka transkodowania potrzebuje rdzeni CPU, nie Pi.
- **Ogólnie nieużywane narzędzia.** Administrator może wyłączyć poszczególne narzędzia w Ustawieniach, co usuwa je z interfejsu i przestaje rejestrować ich trasy API. Samo w sobie nie oszczędza to pamięci, ale chroni współdzieloną małą instancję przed użyciem jej do tego jednego obciążenia, którego sprzęt nie udźwignie.

Jeśli później przeniesiesz instancję na większy sprzęt, usuń limity (ustaw je z powrotem na `0`), a ten sam wolumen danych przejdzie razem z nią.
