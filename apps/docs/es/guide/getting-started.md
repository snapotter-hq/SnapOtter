---
description: "Instala SnapOtter con Docker en un solo comando. Incluye la configuración de Docker Compose, la compilación desde el código fuente y una descripción completa de las funciones."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 5d9ea3a3420e
i18n_hash_version: 2
---

# Primeros pasos {#getting-started}

::: tip Pruébalo antes de instalar
Explora la interfaz completa en [demo.snapotter.com](https://demo.snapotter.com), sin necesidad de registro ni instalación.
:::

## Inicio rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Este único contenedor ejecuta todo lo que necesita: sin `DATABASE_URL` configurado, inicia su propio PostgreSQL y Redis en la interfaz loopback (modo integrado) y mantiene todos los datos en el volumen `SnapOtter-data`. Es la forma más rápida de probar SnapOtter o autohospedarse en un laboratorio doméstico. Para producción, utilice la [pila canónica de Docker Compose](#docker-compose), que mantiene PostgreSQL y Redis en sus propios contenedores. El modo integrado se ejecuta como root (el valor predeterminado) y se apaga automáticamente tan pronto como configura `DATABASE_URL`.

¿Vas a instalar en una Raspberry Pi, un portátil viejo o un VPS pequeño? Consulta [Configuraciones con recursos limitados](/es/guide/low-resource) para una guía paso a paso ajustada y para saber qué esperar de un hardware limitado.

Se te pedirá que cambies tu contraseña en el primer inicio de sesión.

::: tip Analítica Anónima de Producto
SnapOtter incluye analítica de producto anónima por defecto. Para desactivarla, abre **Ajustes → Sistema → Privacidad** y desactiva **Analítica Anónima de Producto**. Se detiene de inmediato para toda la instancia.

También puedes establecer la variable de entorno `SNAPOTTER_TELEMETRY=0` (`false` y `off` también funcionan) para deshabilitar toda la telemetría de la instancia sin recompilar.

La monitorización de errores funciona con [Sentry](https://sentry.io), que patrocina a SnapOtter a través de su programa de código abierto.

Para más detalles sobre qué se recopila, consulta [Qué recopila SnapOtter](/es/guide/telemetry).
:::

::: tip Aceleración con NVIDIA CUDA
Agregue `--gpus all` para NVIDIA eliminación de fondo, ampliación, mejora facial y restauración acelerada por CUDA. OCR permanece basado en CPU y funciona en la misma imagen con o sin acceso a GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requiere el [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Vuelve a la CPU automáticamente cuando CUDA no está disponible. La aceleración Intel/AMD iGPU a través de VA-API, Quick Sync u OpenCL no es compatible con la inferencia de IA en la actualidad. Consulte [Etiquetas Docker](/es/guide/docker-tags) para conocer los puntos de referencia. Si las herramientas de IA se ejecutan en la CPU a pesar de `--gpus all`, consulte [Verificar la aceleración de la GPU](/es/guide/deployment#verify-gpu-acceleration).
:::

::: details También en GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Ambos registros publican la misma imagen en cada versión.
:::

## Docker componer {#docker-compose}

Utilice el archivo de producción mantenido y probado con cada versión en lugar de copiar un ejemplo de Compose abreviado de esta página:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

El canónico [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) incluye los cuatro volúmenes de tiempo de ejecución, comprobaciones de estado, límites de recursos, configuración duradera de Redis, imágenes de caché/base de datos fijadas y el refuerzo del contenedor actual. Cambie la contraseña de administrador predeterminada inmediatamente después del primer inicio de sesión. Para una implementación reproducible, fije la imagen de la aplicación SnapOtter a la etiqueta de versión o resumen que verificó en lugar de seguir `latest`.

Consulte [Configuración](/es/guide/configuration) para conocer todas las variables de entorno y [Seguridad y refuerzo](/es/guide/security) para conocer secretos, políticas de red y orientación sobre copias de seguridad.

## Compilar desde el código fuente {#build-from-source}

**Requisitos previos:** Node.js 22.22+, pnpm 9+, Docker (para Postgres + Redis), Python 3.11+ (para funciones de IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Qué puedes hacer {#what-you-can-do}

### Procesamiento de archivos (200+ herramientas) {#file-processing-200-tools}

| Modalidad | Recuento | Herramientas de ejemplo |
|----------|-------|---------------|
| **Imagen** | 107 | Redimensionar, Recortar, Comprimir, Convertir, Eliminar fondo, Escalar, OCR, Marca de agua, Collage, Colorizar, Herramientas GIF, ajustes de formato predefinidos |
| **Vídeo** | 57 | Recortar, Recortar marco, Comprimir, Convertir, Combinar, Extraer audio, Subtítulos automáticos, Vídeo a GIF, Redimensionar, Estabilizar, ajustes de formato predefinidos |
| **Audio** | 27 | Recortar, Combinar, Convertir, Normalizar, Reducción de ruido, Transcribir, Cambio de tono, Fundido, Creador de tonos de llamada, ajustes de formato predefinidos |
| **PDF / Documento** | 29 | Combinar, Dividir, Comprimir, OCR, Marca de agua, Redactar, Word a PDF, Excel a PDF, Rotar, Proteger, Reparar |
| **Archivos** | 23 | CSV a JSON, JSON a XML, Combinar CSVs, Dividir CSV, Crear ZIP, Extraer ZIP, Creador de gráficos, YAML/JSON |

### Canalizaciones {#pipelines}

Encadena herramientas en flujos de trabajo de varios pasos y aplícalos a una imagen o a un lote completo:

1. Abre **Canalizaciones** en la barra lateral.
2. Añade pasos (cualquier herramienta, cualquier configuración).
3. Ejecuta sobre un solo archivo, o sobre un lote entero a la vez.
4. Guarda la canalización para reutilizarla más tarde.

Las canalizaciones permiten 20 pasos por defecto. Establece `MAX_PIPELINE_STEPS=0` para dejar el límite en ilimitado.

### Biblioteca de archivos {#file-library}

Cada archivo que proceses puede guardarse en tu biblioteca de **Archivos**. SnapOtter registra el historial de versiones completo para que puedas rastrear cada paso de procesamiento desde la subida original hasta la salida final.

Guardar es explícito: los resultados que guardas en la biblioteca se conservan hasta que los eliminas, mientras que los resultados que procesas y dejas sin guardar se eliminan automáticamente tras 72 horas (configurable mediante `FILE_MAX_AGE_HOURS`).

### API REST y claves de API {#rest-api-api-keys}

Cada herramienta es accesible mediante HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Genera claves de API en **Ajustes → Claves de API**. Consulta la [referencia de la API REST](/es/api/rest) para todos los endpoints, o visita [http://localhost:1349/api/docs](http://localhost:1349/api/docs) para la referencia interactiva.

### Multiusuario y equipos {#multi-user-teams}

Habilita varios usuarios con control de acceso basado en roles:

- **Administrador**: acceso completo, gestiona usuarios, equipos, ajustes, todos los archivos/canalizaciones/claves de API
- **Usuario**: usa herramientas, gestiona sus propios archivos/canalizaciones/claves de API

Crea equipos en **Ajustes → Equipos** para agrupar usuarios.

Establece `AUTH_ENABLED=true` (o `false` para un solo usuario/uso propio sin inicio de sesión).
