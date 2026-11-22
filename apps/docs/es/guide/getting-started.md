---
description: "Instale SnapOtter con Docker en un solo comando, inicie sesión y abra su primera herramienta. Cubre la aceleración por GPU, las máquinas pequeñas, Docker Compose y la compilación desde el código fuente."
i18n_source_hash: c2aae540add0
i18n_provenance: machine
i18n_output_hash: c62a3f55c982
i18n_hash_version: 2
---

# Primeros pasos {#getting-started}

::: tip Pruébelo antes de instalarlo
Explore la interfaz completa en [demo.snapotter.com](https://demo.snapotter.com), sin registro ni instalación.
:::

## Inicio rápido {#quick-start}

Ejecute un solo comando:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Después abra [http://localhost:1349](http://localhost:1349) e inicie sesión con `admin` / `admin`. Se le pedirá que cambie su contraseña en el primer inicio de sesión.

Ahora abra una herramienta. Elija una en la barra lateral o vaya directamente a [Redimensionar](http://localhost:1349/image/resize), suelte una imagen y descargue el resultado.

Esa es toda la instalación. Este único contenedor ejecuta todo lo que necesita: sin [`DATABASE_URL`](/es/guide/configuration#env-database-url) definido, inicia su propio PostgreSQL y Redis en la interfaz loopback (modo integrado) y guarda todos los datos en el volumen `SnapOtter-data`. Es la forma más rápida de probar SnapOtter o de alojarlo usted mismo en un homelab. El modo integrado se ejecuta como root (el valor predeterminado) y se desactiva automáticamente en cuanto define `DATABASE_URL`. Para producción, utilice el [stack de Docker Compose](#docker-compose), que mantiene PostgreSQL y Redis en sus propios contenedores.

Los resultados de los trabajos no se guardan en el volumen de datos, así que desaparecen cuando se reemplaza el contenedor (al actualizar la imagen, por ejemplo) y sus enlaces de descarga dejan de funcionar. [Conservar la salida de los trabajos](/es/guide/deployment#keeping-job-output) en la guía de despliegue explica cómo conservarlos.

::: tip Uso con 4 GB de RAM o menos
En una Raspberry Pi, un portátil antiguo o un VPS pequeño, ejecute un trabajo a la vez y limite el grupo de hilos de imagen añadiendo `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` al comando anterior, y omita los bundles de IA pesados. [Configuraciones de bajos recursos](/es/guide/low-resource#tuning-knobs) enumera los demás límites que conviene definir y lo que cabe esperar de un hardware limitado.
:::

::: tip Analítica de producto anónima
SnapOtter incluye analítica de producto anónima de forma predeterminada. Para desactivarla, abra **Settings → System → Privacy** y desactive **Anonymous Product Analytics**. Se detiene de inmediato para toda la instancia.

También puede definir la variable de entorno `SNAPOTTER_TELEMETRY=0` (`false` y `off` también funcionan) para desactivar toda la telemetría de la instancia sin necesidad de recompilar.

La supervisión de errores la proporciona [Sentry](https://sentry.io), que patrocina SnapOtter a través de su programa de código abierto.

Para obtener detalles sobre lo que se recopila, consulte [Qué recopila SnapOtter](/es/guide/telemetry).
:::

## Aceleración por GPU {#gpu-acceleration}

Una GPU NVIDIA acelera mucho las herramientas de IA más pesadas: ampliación (unas 47 veces), mejora de rostros (unas 12 veces), transcripción y eliminación de fondo (unas 4 veces cada una). El OCR, la detección de rostros y la restauración de fotos siguen usando la CPU, así que una GPU no les ayuda. La misma imagen sirve para ambos casos; añada `--gpus all`:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requiere el [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) en el host. Sin CUDA, SnapOtter recurre a la CPU automáticamente. La aceleración con iGPU de Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible actualmente con la inferencia de IA.

- [Requisitos de hardware](/es/guide/deployment#full-ai-tools-on-nvidia-cuda) incluye todos los tiempos de GPU y CPU, y los [benchmarks de la imagen de Docker](/es/guide/docker-tags#benchmarks) los valores en caliente y en frío.
- Si las herramientas de IA siguen ejecutándose en la CPU, consulte [Verificar la aceleración por GPU](/es/guide/deployment#verify-gpu-acceleration).
- Para Compose, use el [inicio rápido de NVIDIA CUDA](/es/guide/deployment#quick-start-nvidia-cuda) de la guía de despliegue.

## Otras formas de instalar {#other-ways-to-install}

### Contenedor único con Compose {#single-container-compose}

El mismo contenedor en modo integrado que en el inicio rápido, escrito como archivo Compose para que sea más fácil de seguir y de modificar. Guárdelo como `docker-compose.yml` y ejecute `docker compose up -d`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

Igual que el comando `docker run`, esto sirve para probar SnapOtter y para instalaciones pequeñas. Todos los ajustes de [Configuración](/es/guide/configuration) van bajo `environment`.

### Docker Compose (producción) {#docker-compose}

Utilice el archivo de producción que se mantiene y prueba con cada versión, en lugar de copiar un ejemplo abreviado de Compose de esta página:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Abra [http://localhost:1349](http://localhost:1349) e inicie sesión con `admin` / `admin`.

El [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) canónico incluye los cuatro volúmenes de runtime, comprobaciones de estado, límites de recursos, una configuración de Redis duradera, imágenes de base de datos y caché fijadas y el endurecimiento actual de los contenedores. Cambie la contraseña de administrador predeterminada inmediatamente después del primer inicio de sesión. Para un despliegue reproducible, fije la imagen de la aplicación SnapOtter a la etiqueta de versión o al digest que haya verificado, en lugar de seguir `latest`.

Consulte [Configuración](/es/guide/configuration) para ver todas las variables de entorno y [Seguridad y endurecimiento](/es/guide/security) para obtener orientación sobre secretos, política de red y copias de seguridad.

### GitHub Container Registry {#ghcr}

Docker Hub y GHCR publican la misma imagen en cada versión. Para descargarla de GHCR, cambie el nombre de la imagen:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### Compilar desde el código fuente {#build-from-source}

**Requisitos previos:** Node.js 22.22+, pnpm 9+, Docker (para Postgres + Redis), Python 3.11+ (para las funciones de IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Qué puede hacer {#what-you-can-do}

### Procesamiento de archivos (más de 200 herramientas) {#file-processing-200-tools}

| Modalidad | Cantidad | Herramientas de ejemplo |
|----------|-------|---------------|
| **Imagen** | 112 | Redimensionar, Recortar, Comprimir, Convertir, Eliminar fondo, Ampliar, OCR, Marca de agua, Collage, Colorear, Herramientas de GIF, preajustes de formato |
| **Vídeo** | 63 | Cortar, Recortar encuadre, Comprimir, Convertir, Unir, Extraer audio, Subtítulos automáticos, Vídeo a GIF, Redimensionar, Estabilizar, preajustes de formato |
| **Audio** | 57 | Cortar, Unir, Convertir, Normalizar, Reducción de ruido, Transcribir, Cambio de tono, Fundido, Creador de tonos de llamada, preajustes de formato |
| **PDF / Documento** | 37 | Unir, Dividir, Comprimir, OCR, Marca de agua, Censurar, Word a PDF, Excel a PDF, Rotar, Proteger, Reparar |
| **Archivos** | 25 | CSV a JSON, JSON a XML, Unir CSV, Dividir CSV, Crear ZIP, Extraer ZIP, Creador de gráficos, YAML/JSON |

### Pipelines {#pipelines}

Encadene herramientas en flujos de trabajo de varios pasos y aplíquelos a una imagen o a un lote completo:

1. Abra **Pipelines** en la barra lateral.
2. Añada pasos (cualquier herramienta, cualquier ajuste).
3. Ejecute sobre un solo archivo o sobre un lote completo a la vez.
4. Guarde el pipeline para reutilizarlo más adelante.

Los pipelines admiten 20 pasos de forma predeterminada. Defina [`MAX_PIPELINE_STEPS=0`](/es/guide/configuration#env-max-pipeline-steps) para que el límite sea ilimitado.

### Biblioteca de archivos {#file-library}

Cada archivo que procese puede guardarse en su biblioteca de **Files**. SnapOtter registra el historial completo de versiones para que pueda rastrear cada paso de procesamiento, desde la carga original hasta el resultado final.

El guardado es explícito: los resultados que guarda en la biblioteca se conservan hasta que los elimine, mientras que los resultados que procesa y deja sin guardar se borran automáticamente tras 72 horas (configurable mediante [`FILE_MAX_AGE_HOURS`](/es/guide/configuration#env-file-max-age-hours)).

### REST API y claves de API {#rest-api-api-keys}

Todas las herramientas son accesibles mediante HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Genere claves de API en **Settings → API Keys**. Consulte la [referencia de la REST API](/es/api/rest) para ver todos los endpoints, o visite [http://localhost:1349/api/docs](http://localhost:1349/api/docs) para la referencia interactiva.

### Multiusuario y equipos {#multi-user-teams}

Habilite varios usuarios con control de acceso basado en roles:

- **Admin**: acceso completo; gestiona usuarios, equipos, ajustes y todos los archivos, pipelines y claves de API
- **User**: usa las herramientas y gestiona sus propios archivos, pipelines y claves de API

Cree equipos en **Settings → Teams** para agrupar usuarios.

Defina [`AUTH_ENABLED=true`](/es/guide/configuration#env-auth-enabled) (o `false` para uso individual o personal sin inicio de sesión).

## Úselo desde su teléfono {#use-it-from-your-phone}

SnapOtter funciona en navegadores móviles y puede instalarlo como una aplicación. Abra su instancia en el teléfono y después:

- **iPhone / iPad (Safari):** toque Compartir y luego **Añadir a pantalla de inicio**.
- **Android (Chrome):** abra el menú del navegador y toque **Instalar aplicación**.

La aplicación instalada se abre en su propia ventana, directamente en su instancia.

Una salvedad: los navegadores solo ofrecen la instalación a través de HTTPS. Una dirección HTTP simple en su LAN sigue funcionando bien en una pestaña del navegador; para la instalación real, coloque la instancia detrás de un proxy inverso con un certificado (consulte la [guía de despliegue](/es/guide/deployment)).

En teléfonos y tabletas, las herramientas de imagen muestran un botón **Tomar foto** junto al botón de carga. Fotografíe un recibo o una pizarra y llegará directamente a la herramienta.
