---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: ef20f992d897
i18n_hash_version: 2
---
# Configuraciones de bajos recursos {#low-resource-setups}

SnapOtter funciona bien en hardware pequeño: una Raspberry Pi 4 o 5, un portátil antiguo o un VPS de 2 GB. Esta página es la guía práctica para esas máquinas: qué cabe esperar, una configuración lista para copiar y pegar con límites razonables, y qué funciones conviene omitir. Los datos completos de benchmarks que respaldan estas cifras están en [Requisitos de hardware](/es/guide/deployment#hardware-requirements).

Dos restricciones firmes de entrada:

- **Solo 64 bits.** La imagen se compila para `linux/amd64` y `linux/arm64`. ARM de 32 bits (`armv7`/`armhf`) no es compatible, por lo que las Pi de primera generación y la familia Pi Zero quedan fuera.
- **Mínimo de 2 GB de memoria (herramientas sin IA).** Con 512 MB el stack no puede iniciarse, y con 1 GB falla en lotes de varios archivos. 2 GB con 2 núcleos es la configuración más pequeña que ejecuta con holgura las herramientas sin IA.

## Qué funciona bien en hardware pequeño {#what-runs-well}

Todas las herramientas sin IA funcionan en una máquina de 2 GB y 2 núcleos: las secciones completas de Imagen y Archivos, las herramientas de PDF y las operaciones de vídeo y audio con copia de flujo (cortar, silenciar, remux de contenedor). La mayoría termina en menos de un segundo.

Dos cargas de trabajo son la excepción:

- **La recodificación de vídeo** (conversión entre códecs) depende de la CPU. Un clip de 1080p que tarda unos 40 s en una CPU de escritorio rápida puede tardar varios minutos en una CPU de gama Pi. Las operaciones con copia de flujo siguen siendo instantáneas.
- **Las herramientas de IA** tienen mínimos de memoria de CPU por bundle: 2 GB de RAM del host (0.5 GB libres) para Detección de rostros y OCR rápido integrado, 4 GiB de memoria efectiva configurada para OCR preciso, 4 GB de RAM del host (2 a 3 GB libres) para Transcripción, Borrador de objetos y Colorear, Eliminación de fondo, Ampliación y mejora, y Restauración de fotos, y 8 GB de RAM del host (6 GB libres) para Inpainting de alta calidad. Una máquina de 2 GB no puede ejecutar Whisper, RealESRGAN, rembg ni LaMa sin que el sistema las termine por falta de memoria, por lo que SnapOtter comprueba la memoria libre antes de enviar el trabajo al sidecar de Python y rechaza de inmediato las ejecuciones por debajo del mínimo del bundle.

Ninguna de las dos se instala ni se ejecuta salvo que la use: sin bundles de IA instalados, la aplicación se mantiene en reposo en torno a 360 MB, y los bundles de IA solo se descargan cuando un administrador los habilita.

## Guía para Raspberry Pi / portátil antiguo {#walkthrough}

Es la instalación estándar con Compose de [Primeros pasos](/es/guide/getting-started), más límites de recursos y topes conservadores. Se asume un sistema operativo de 64 bits (en una Pi: Raspberry Pi OS de 64 bits o Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
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
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Notas para máquinas de gama Pi:

- **Prefiera un SSD USB a una tarjeta SD** para el volumen de datos y Postgres. Los espacios de trabajo de los trabajos realizan E/S de disco real, y las tarjetas SD son lentas y se desgastan rápido.
- **El contenedor único todo en uno también funciona aquí** (Postgres y Redis integrados cuando `DATABASE_URL`/`REDIS_URL` no están definidos), y en un host con memoria limitada debería reducir el tope de su Redis integrado con `REDIS_MAXMEMORY` (consulte [Configuración](/es/guide/configuration)). Compose ofrece un control más fino por servicio, y por eso esta guía lo utiliza.
- **Añada swap en dispositivos de 2 GB.** Evita que un pico ocasional (un PDF grande, un lote al que olvidó ponerle tope) termine en una terminación por falta de memoria. zram es la opción amigable con las tarjetas SD.
- La imagen arm64 es solo para CPU; no hay CUDA en placas ARM.

## Los ajustes de afinación {#tuning-knobs}

Todos los topes son variables de entorno, documentadas por completo en [Configuración](/es/guide/configuration). `0` significa ilimitado o automático. Las que importan en hardware pequeño:

| Variable | Sugerencia para equipos pequeños | Qué protege |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Cuántos trabajos se ejecutan en paralelo. La detección automática usa los núcleos de CPU menos uno, lo cual está bien en máquinas grandes y es demasiado ambicioso en un equipo de 2 núcleos con presión de memoria. |
| `MAX_WORKER_THREADS` | `2` | Pool de hilos de procesamiento de imágenes. |
| `MAX_BATCH_SIZE` | `5` | Los lotes son lo primero que agota la memoria en máquinas de 1 a 2 GB. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Evita que un único archivo enorme ocupe todo el espacio de trabajo. |
| `MAX_MEGAPIXELS` | `50` | Decodificar una imagen de más de 100 MP consume RAM sea cual sea el tamaño del archivo. |
| `MAX_VIDEO_DURATION_S` | `300` | Las transcodificaciones largas monopolizan una CPU pequeña durante minutos u horas. |
| `PROCESSING_TIMEOUT_S` | `600` | Límite máximo para que un trabajo descontrolado acabe liberando la máquina. |

Estos topes se aplican a lo que acepta el servidor, así que ajústelos a lo que realmente utiliza en lugar de hacerlos lo más pequeños posible. Si nunca usa vídeo, un tope de `MAX_VIDEO_DURATION_S` no cuesta nada; si escanea documentos a diario, no limite `MAX_PDF_PAGES`.

## Qué omitir {#what-to-skip}

- **Bundles de IA pesados.** La ampliación, la restauración de fotos y la eliminación de fondo requieren una GPU o una CPU rápida con muchos núcleos, y cada bundle ocupa de 4 a 5 GB de disco. En un equipo pequeño, simplemente no los instale; las herramientas cuyo bundle falta muestran un aviso de instalación en lugar de ejecutarse.
- **La recodificación de vídeo como carga de trabajo habitual.** Las transcodificaciones ocasionales están bien (solo son lentas); una cola constante de transcodificación necesita núcleos de CPU, no una Pi.
- **Las herramientas sin usar, en general.** Un administrador puede desactivar herramientas individuales en Settings, lo que las quita de la interfaz y deja de registrar sus rutas de API. Eso no ahorra memoria por sí solo, pero evita que una instancia pequeña compartida se use para la única carga de trabajo que el hardware no puede soportar.

Si más adelante traslada la instancia a un hardware más potente, elimine los topes (vuelva a dejarlos en `0`) y el mismo volumen de datos se conserva.