---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: c2d85458029e
---
# Configuraciones con recursos limitados {#low-resource-setups}

SnapOtter funciona bien en hardware modesto: una Raspberry Pi 4 o 5, un portátil viejo o un VPS de 2 GB. Esta página es la guía práctica para esas máquinas: qué esperar, una instalación de copiar y pegar con topes sensatos, y qué funciones conviene omitir. Los datos de benchmark completos detrás de estas cifras están en [Requisitos de hardware](/es/guide/deployment#hardware-requirements).

Dos restricciones duras de entrada:

- **Solo 64 bits.** La imagen se compila para `linux/amd64` y `linux/arm64`. ARM de 32 bits (`armv7`/`armhf`) no está soportado, así que las Pi de primera generación y la familia Pi Zero quedan fuera.
- **Mínimo de 2 GB de memoria.** Con 512 MB la pila no arranca, y con 1 GB fallan los lotes de varios archivos. 2 GB con 2 núcleos es la configuración más pequeña que funciona con holgura.

## Qué funciona bien en hardware modesto {#what-runs-well}

Todas las herramientas sin IA funcionan en una máquina de 2 GB y 2 núcleos: las secciones de Imagen y Archivos completas, las herramientas de PDF y las operaciones de vídeo y audio por copia de flujo (recortar, silenciar, cambiar de contenedor). La mayoría termina en menos de un segundo.

Dos cargas de trabajo son la excepción:

- **La recodificación de vídeo** (convertir entre códecs) está limitada por la CPU. Un clip 1080p que tarda ~40 s en una CPU de escritorio rápida puede tardar varios minutos en una CPU de clase Pi. Las operaciones por copia de flujo siguen siendo instantáneas.
- **Las herramientas de IA** necesitan RAM (4 GB recomendados) y disco (los bundles más grandes ocupan 4-5 GB cada uno), y las pesadas (ampliación, restauración de fotos, eliminación de fondo) no son prácticas en CPUs de clase Pi. La IA ligera, como la detección de caras y el OCR, es usable si tienes memoria para ella.

Nada de esto se instala ni se ejecuta a menos que lo uses: sin bundles de IA instalados, la aplicación consume en reposo unos 360 MB, y los bundles de IA solo se descargan cuando un administrador los habilita.

## Guía paso a paso: Raspberry Pi / portátil viejo {#walkthrough}

Es la instalación estándar con Compose de [Primeros pasos](/es/guide/getting-started), más límites de recursos y topes conservadores. Supone un sistema operativo de 64 bits (en una Pi: Raspberry Pi OS de 64 bits o Ubuntu Server arm64).

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

Notas para máquinas de clase Pi:

- **Prefiere un SSD USB antes que una tarjeta SD** para el volumen de datos y Postgres. Los espacios de trabajo de los jobs hacen E/S de disco real, y las tarjetas SD son lentas y se desgastan rápido.
- **El contenedor único todo en uno también funciona aquí** (PostgreSQL y Redis embebidos cuando `DATABASE_URL`/`REDIS_URL` no están definidos), y en un host con poca memoria conviene bajar el tope de su Redis embebido con `REDIS_MAXMEMORY` (consulta [Configuración](/es/guide/configuration)). Compose te da un control más fino por servicio, y por eso esta guía lo usa.
- **Añade swap en dispositivos de 2 GB.** Evita que el pico ocasional (un PDF grande, un lote que olvidaste limitar) acabe en un cierre por falta de memoria. zram es la opción que menos castiga la tarjeta SD.
- La imagen arm64 es solo CPU; no hay CUDA en placas ARM.

## Los ajustes que importan {#tuning-knobs}

Todos los topes son variables de entorno, documentadas al completo en [Configuración](/es/guide/configuration). `0` significa ilimitado o automático. Los que importan en hardware modesto:

| Variable | Sugerencia para máquinas pequeñas | Qué protege |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Cuántos jobs se ejecutan en paralelo. La autodetección usa los núcleos de CPU menos uno, lo cual va bien en máquinas grandes y es demasiado agresivo en una máquina de 2 núcleos con presión de memoria. |
| `MAX_WORKER_THREADS` | `2` | Grupo de hilos del procesamiento de imágenes. |
| `MAX_BATCH_SIZE` | `5` | Los lotes son donde las máquinas de 1-2 GB se quedan sin memoria primero. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Evita que un solo archivo enorme ocupe todo el espacio de trabajo. |
| `MAX_MEGAPIXELS` | `50` | Decodificar una imagen de más de 100 MP cuesta RAM sin importar el tamaño del archivo. |
| `MAX_VIDEO_DURATION_S` | `300` | Las transcodificaciones largas monopolizan una CPU pequeña durante minutos u horas. |
| `PROCESSING_TIMEOUT_S` | `600` | Techo duro para que un job descontrolado libere la máquina en algún momento. |

Estos topes se aplican a lo que el servidor acepta, así que ajústalos a lo que realmente usas, no lo más bajo posible. Si nunca tocas vídeo, un tope de `MAX_VIDEO_DURATION_S` no cuesta nada; si escaneas documentos a diario, no limites `MAX_PDF_PAGES`.

## Qué omitir {#what-to-skip}

- **Los bundles de IA pesados.** La ampliación, la restauración de fotos y la eliminación de fondo piden una GPU o una CPU rápida de muchos núcleos, y cada bundle cuesta 4-5 GB de disco. En una máquina pequeña, simplemente no los instales; las herramientas cuyo bundle falta muestran un aviso de instalación en lugar de ejecutarse.
- **La recodificación de vídeo como carga habitual.** Las transcodificaciones ocasionales están bien (solo son lentas); una cola de transcodificación constante pide núcleos de CPU, no una Pi.
- **Las herramientas sin uso, en general.** Un administrador puede desactivar herramientas individuales en Ajustes, lo que las quita de la interfaz y deja de registrar sus rutas de API. Eso por sí solo no ahorra memoria, pero evita que una instancia pequeña compartida se use justo para la carga que el hardware no aguanta.

Si más adelante mueves la instancia a hardware más potente, quita los topes (devuélvelos a `0`) y el mismo volumen de datos se conserva tal cual.
