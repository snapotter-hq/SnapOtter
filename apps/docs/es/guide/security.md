---
description: Guía de refuerzo de seguridad para SnapOtter. Seguridad de contenedores, aislamiento de red, secretos de Docker, despliegue en Kubernetes y artefactos de cumplimiento.
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 7e22bc458c06
---

# Seguridad y refuerzo {#security-hardening}

SnapOtter procesa los archivos íntegramente en tu infraestructura. Por defecto envía datos analíticos de producto anónimos y sin contenido, además de informes de fallos, para ayudar a mejorar el proyecto. Nunca envía tus archivos, nombres de archivo, contenido de archivos, salida de OCR, metadatos de imagen ni texto de documentos. El feedback opcional se envía solo después de que un usuario lo remite, solo cuando la analítica está habilitada, y los campos de contacto se incluyen únicamente con el consentimiento explícito de contacto. Un administrador puede desactivar la analítica y la captura de feedback con un clic en Settings > System > Privacy, sin necesidad de reconstruir. El procesamiento de archivos siempre permanece dentro de tu contenedor.

El contenedor se ejecuta como un usuario no root dedicado (`snapotter`) con todas las capacidades de Linux descartadas excepto el conjunto mínimo necesario. Para la política completa de divulgación de vulnerabilidades y la arquitectura de seguridad, consulta [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) en GitHub.

## Refuerzo del contenedor {#container-hardening}

El [docker-compose.yml por defecto](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) incluye refuerzo de seguridad para producción. Aquí tienes un desglose de cada opción y por qué importa:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
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
      start_period: 15s

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
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### Por qué no se establece `no-new-privileges` {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` se omite intencionadamente. El entrypoint arranca como root para corregir la propiedad del volumen y luego baja al usuario `snapotter` mediante [gosu](https://github.com/tianon/gosu), que requiere setuid. Una vez completada la reducción de privilegios, el proceso se ejecuta como `snapotter` con todas las capacidades eliminadas excepto las cinco enumeradas arriba.

Si usas Kubernetes o el flag `--user` de Docker para ejecutar directamente como no root (evitando gosu), es seguro habilitar `no-new-privileges`.

### Por qué no se establece `read_only` {#why-read-only-is-not-set}

`read_only: true` no se establece porque el remapeo de PUID/PGID escribe en `/etc/passwd` y `/etc/group` al arrancar. Si usas el flag `--user` de Docker o `runAsUser` de Kubernetes en lugar de PUID/PGID, puedes habilitar con seguridad un sistema de archivos raíz de solo lectura.

## Aislamiento de red {#network-isolation}

Durante el funcionamiento normal, el contenedor no realiza **ninguna conexión de red saliente**. Todo el procesamiento de archivos ocurre localmente usando bibliotecas incluidas.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

La única excepción son las **descargas de modelos de IA**: cuando un usuario instala un paquete de funciones de IA a través de la interfaz, el contenedor descarga archivos de modelo desde GitHub Releases y PyPI. Estas descargas ocurren una vez por paquete y se almacenan en el volumen `/data`.

**Recomendaciones de firewall:**

| Escenario | Regla de salida |
|---|---|
| Air-gapped (sin IA) | Bloquea todo el tráfico saliente del contenedor |
| Se necesitan paquetes de IA | Permite HTTPS a `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` durante la instalación, luego bloquea |
| Después de instalar la IA | Bloquea todo el tráfico saliente: los modelos se almacenan en caché localmente |

Para la configuración de proxy inverso (Nginx, Traefik, Caddy, Cloudflare Tunnels), consulta la [guía de despliegue](/es/guide/deployment#reverse-proxy).

## Secretos de Docker {#docker-secrets}

En despliegues de producción, evita pasar secretos como variables de entorno en texto plano. El entrypoint admite la convención `_FILE` de Docker: monta un secreto como archivo y establece la variable `_FILE` correspondiente con su ruta.

**Secretos admitidos:**

| Variable | Equivalente `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Ejemplo con secretos de Docker Compose:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Los secretos de Docker Compose (sin Swarm) requieren Compose v2.23 o posterior.
:::

## Despliegue en Kubernetes {#kubernetes-deployment}

El entrypoint detecta cuándo el contenedor ya se ejecuta como no root (p. ej. vía `runAsUser` de Kubernetes) y omite automáticamente la reducción de privilegios con gosu. En ese caso no puede hacer chown de los volúmenes montados por sí mismo, así que verifica que sean escribibles y sale de inmediato con orientación accionable si no lo son. Consulta [Permisos de almacenamiento](/es/guide/deployment#storage-permissions) para configuraciones con `fsGroup` y UID ajeno (TrueNAS, OpenShift).

**SecurityContext de pod recomendado:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

Dado que `runAsUser: 999` se establece a nivel de pod, el entrypoint omite gosu por completo. Esto permite las capacidades `allowPrivilegeEscalation: false` y `drop: [ALL]` sin conflicto.

Para el dimensionamiento de recursos, consulta [Requisitos de hardware](/es/guide/deployment#hardware-requirements).

## Copia de seguridad y recuperación {#backup-and-recovery}

El estado persistente se reparte entre dos volúmenes:

| Volumen | Contenido | ¿Crítico? |
|---|---|---|
| `SnapOtter-pgdata` | Base de datos PostgreSQL (usuarios, ajustes, pipelines, trabajos, registro de auditoría) | Sí |
| `/data` (volumen de la app) | Archivos subidos por usuarios, modelos de IA, venv de Python | Parcialmente (ver abajo) |

Dentro del volumen `/data`:

| Ruta | Contenido | ¿Crítico? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Archivos de usuario y resultados de procesamiento | Sí |
| `/data/ai/` | Archivos de modelo de IA descargados | No (se pueden volver a descargar) |
| `/data/venv/` | Entorno virtual de Python | No (se reconstruye al arrancar) |

### Copia de seguridad de la base de datos {#database-backup}

Usa `pg_dump` para hacer una copia de seguridad de la base de datos mientras el stack está en ejecución:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Como alternativa, detén el stack y toma una instantánea del volumen `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Copia de seguridad de los archivos de usuario {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Los modelos de IA suman hasta unos 24 GB en total entre todos los paquetes. Como se pueden volver a descargar, excluye `/data/ai/` y `/data/venv/` de las copias de seguridad para ahorrar espacio. Solo la base de datos y los archivos de usuario son críticos.

## Artefactos de cumplimiento {#compliance-artifacts}

Cada versión de SnapOtter incluye los siguientes artefactos de seguridad:

| Artefacto | Formato | Dónde encontrarlo |
|---|---|---|
| SBOM (CycloneDX) | JSON | Activo de [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Activo de [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Análisis de vulnerabilidades | Trivy JSON | Activo de [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Análisis de vulnerabilidades | SARIF | Pestaña [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Análisis estático | CodeQL (JS/TS + Python) | Pestaña [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), se ejecuta semanalmente + por PR |
| Revisión de dependencias | Nativa de GitHub | Comprobación por PR, falla ante adiciones de alta gravedad |
| Auditoría de dependencias de Python | pip-audit | Registro de ejecución de CI en cada push |
| Política de seguridad | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) en el repositorio |
| Actualizaciones de dependencias | Dependabot | PRs semanales automatizados para npm, pip, Docker, Actions |

**Ejecutar tu propio análisis:**

Descarga el SBOM de la versión y analízalo con la herramienta que prefieras:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
El SBOM y el análisis de vulnerabilidades reflejan la imagen exacta publicada para esa versión. Los paquetes de modelos de IA instalados tras el despliegue no se incluyen en el SBOM, ya que se descargan en tiempo de ejecución.
:::
