---
description: "Instale SnapOtter con Docker en un solo comando. Incluye la configuración con Docker Compose, la compilación desde el código fuente y una descripción completa de las funciones."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: a185348bc23d
i18n_hash_version: 2
---

# Primeros pasos {#getting-started}

::: tip Pruébelo antes de instalarlo
Explore la interfaz completa en [demo.snapotter.com](https://demo.snapotter.com), sin registro ni instalación.
:::

## Inicio rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Este único contenedor ejecuta todo lo que necesita: sin `DATABASE_URL` definido, inicia su propio PostgreSQL y Redis en la interfaz loopback (modo integrado) y guarda todos los datos en el volumen `SnapOtter-data`. Es la forma más rápida de probar SnapOtter o de alojarlo usted mismo en un homelab. Para producción, utilice el [stack canónico de Docker Compose](#docker-compose), que mantiene PostgreSQL y Redis en sus propios contenedores. El modo integrado se ejecuta como root (el valor predeterminado) y se desactiva automáticamente en cuanto define `DATABASE_URL`.

¿Va a instalarlo en una Raspberry Pi, un portátil antiguo o un VPS pequeño? Consulte [Configuraciones de bajos recursos](/es/guide/low-resource) para una guía ajustada y lo que cabe esperar de un hardware limitado.

Se le pedirá que cambie su contraseña en el primer inicio de sesión.

::: tip Analítica de producto anónima
SnapOtter incluye analítica de producto anónima de forma predeterminada. Para desactivarla, abra **Settings → System → Privacy** y desactive **Anonymous Product Analytics**. Se detiene de inmediato para toda la instancia.

También puede definir la variable de entorno `SNAPOTTER_TELEMETRY=0` (`false` y `off` también funcionan) para desactivar toda la telemetría de la instancia sin necesidad de recompilar.

La supervisión de errores la proporciona [Sentry](https://sentry.io), que patrocina SnapOtter a través de su programa de código abierto.

Para obtener detalles sobre lo que se recopila, consulte [Qué recopila SnapOtter](/es/guide/telemetry).
:::

::: tip Aceleración NVIDIA CUDA
Añada `--gpus all` para la eliminación de fondo, la ampliación, la mejora de rostros y la restauración aceleradas con NVIDIA CUDA. El OCR sigue usando la CPU y funciona en la misma imagen con o sin acceso a la GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requiere el [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Recurre a la CPU automáticamente cuando CUDA no está disponible. La aceleración con iGPU de Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible actualmente con la inferencia de IA. Consulte [Etiquetas de Docker](/es/guide/docker-tags) para ver los benchmarks. Si las herramientas de IA se ejecutan en la CPU a pesar de `--gpus all`, consulte [Verificar la aceleración por GPU](/es/guide/deployment#verify-gpu-acceleration).
:::

::: details También en GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Ambos registros publican la misma imagen en cada versión.
:::

## Docker Compose {#docker-compose}

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

El [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) canónico incluye los cuatro volúmenes de runtime, comprobaciones de estado, límites de recursos, una configuración de Redis duradera, imágenes de base de datos y caché fijadas y el endurecimiento actual de los contenedores. Cambie la contraseña de administrador predeterminada inmediatamente después del primer inicio de sesión. Para un despliegue reproducible, fije la imagen de la aplicación SnapOtter a la etiqueta de versión o al digest que haya verificado, en lugar de seguir `latest`.

Consulte [Configuración](/es/guide/configuration) para ver todas las variables de entorno y [Seguridad y endurecimiento](/es/guide/security) para obtener orientación sobre secretos, política de red y copias de seguridad.

## Compilar desde el código fuente {#build-from-source}

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
| **Vídeo** | 57 | Cortar, Recortar encuadre, Comprimir, Convertir, Unir, Extraer audio, Subtítulos automáticos, Vídeo a GIF, Redimensionar, Estabilizar, preajustes de formato |
| **Audio** | 27 | Cortar, Unir, Convertir, Normalizar, Reducción de ruido, Transcribir, Cambio de tono, Fundido, Creador de tonos de llamada, preajustes de formato |
| **PDF / Documento** | 35 | Unir, Dividir, Comprimir, OCR, Marca de agua, Censurar, Word a PDF, Excel a PDF, Rotar, Proteger, Reparar |
| **Archivos** | 23 | CSV a JSON, JSON a XML, Unir CSV, Dividir CSV, Crear ZIP, Extraer ZIP, Creador de gráficos, YAML/JSON |

### Pipelines {#pipelines}

Encadene herramientas en flujos de trabajo de varios pasos y aplíquelos a una imagen o a un lote completo:

1. Abra **Pipelines** en la barra lateral.
2. Añada pasos (cualquier herramienta, cualquier ajuste).
3. Ejecute sobre un solo archivo o sobre un lote completo a la vez.
4. Guarde el pipeline para reutilizarlo más adelante.

Los pipelines admiten 20 pasos de forma predeterminada. Defina `MAX_PIPELINE_STEPS=0` para que el límite sea ilimitado.

### Biblioteca de archivos {#file-library}

Cada archivo que procese puede guardarse en su biblioteca de **Files**. SnapOtter registra el historial completo de versiones para que pueda rastrear cada paso de procesamiento, desde la carga original hasta el resultado final.

El guardado es explícito: los resultados que guarda en la biblioteca se conservan hasta que los elimine, mientras que los resultados que procesa y deja sin guardar se borran automáticamente tras 72 horas (configurable mediante `FILE_MAX_AGE_HOURS`).

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

Defina `AUTH_ENABLED=true` (o `false` para uso individual o personal sin inicio de sesión).

## Úselo desde su teléfono {#use-it-from-your-phone}

SnapOtter funciona en navegadores móviles y puede instalarlo como una aplicación. Abra su instancia en el teléfono y después:

- **iPhone / iPad (Safari):** toque Compartir y luego **Añadir a pantalla de inicio**.
- **Android (Chrome):** abra el menú del navegador y toque **Instalar aplicación**.

La aplicación instalada se abre en su propia ventana, directamente en su instancia.

Una salvedad: los navegadores solo ofrecen la instalación a través de HTTPS. Una dirección HTTP simple en su LAN sigue funcionando bien en una pestaña del navegador; para la instalación real, coloque la instancia detrás de un proxy inverso con un certificado (consulte la [guía de despliegue](/es/guide/deployment)).

En teléfonos y tabletas, las herramientas de imagen muestran un botón **Tomar foto** junto al botón de carga. Fotografíe un recibo o una pizarra y llegará directamente a la herramienta.