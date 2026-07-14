---
description: "Instala SnapOtter con Docker en un solo comando. Incluye la configuración de Docker Compose, la compilación desde el código fuente y una descripción completa de las funciones."
i18n_output_hash: d513d36ca8ba
i18n_source_hash: 24724b5595b2
i18n_provenance: human
---

# Primeros pasos {#getting-started}

::: tip Pruébalo antes de instalar
Explora la interfaz completa en [demo.snapotter.com](https://demo.snapotter.com), sin necesidad de registro ni instalación.
:::

## Inicio rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Este único contenedor ejecuta todo lo que necesita: sin `DATABASE_URL` definido, inicia su propio PostgreSQL y Redis en la interfaz de loopback (modo embebido) y mantiene todos los datos en el volumen `SnapOtter-data`. Es la forma más rápida de probar SnapOtter o de autoalojarlo en un homelab. Para producción, ejecuta la pila de [Docker Compose](#docker-compose) que aparece abajo, que mantiene PostgreSQL y Redis en sus propios contenedores. El modo embebido se ejecuta como root (el valor por defecto) y se desactiva automáticamente en cuanto defines `DATABASE_URL`.

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

Requiere el [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Recurre a la CPU automáticamente cuando CUDA no está disponible. La aceleración por iGPU de Intel/AMD mediante VA-API, Quick Sync u OpenCL no es compatible con la inferencia de IA por ahora. Consulta [Etiquetas de Docker](/es/guide/docker-tags) para las pruebas de rendimiento.
:::

::: details También en GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Ambos registros publican la misma imagen en cada versión.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Consulta [Configuración](/es/guide/configuration) para todas las variables de entorno.

## Compilar desde el código fuente {#build-from-source}

**Requisitos previos:** Node.js 22+, pnpm 9+, Docker (para Postgres + Redis), Python 3.10+ (para funciones de IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Qué puedes hacer {#what-you-can-do}

### Procesamiento de archivos (200+ herramientas) {#file-processing-200-tools}

| Modalidad | Recuento | Herramientas de ejemplo |
|----------|-------|---------------|
| **Imagen** | 105 | Redimensionar, Recortar, Comprimir, Convertir, Eliminar fondo, Escalar, OCR, Marca de agua, Collage, Colorizar, Herramientas GIF, ajustes de formato predefinidos |
| **Vídeo** | 57 | Recortar, Recortar marco, Comprimir, Convertir, Combinar, Extraer audio, Subtítulos automáticos, Vídeo a GIF, Redimensionar, Estabilizar, ajustes de formato predefinidos |
| **Audio** | 27 | Recortar, Combinar, Convertir, Normalizar, Reducción de ruido, Transcribir, Cambio de tono, Fundido, Creador de tonos de llamada, ajustes de formato predefinidos |
| **PDF / Documento** | 42 | Combinar, Dividir, Comprimir, OCR, Marca de agua, Redactar, Word a PDF, Excel a PDF, Rotar, Proteger, Reparar |
| **Archivos** | 10 | CSV a JSON, JSON a XML, Combinar CSVs, Dividir CSV, Crear ZIP, Extraer ZIP, Creador de gráficos, YAML/JSON |

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
