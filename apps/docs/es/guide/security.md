---
description: "Guía de endurecimiento de seguridad de SnapOtter. Seguridad de contenedores, aislamiento de red, secretos de Docker, despliegue en Kubernetes y artefactos de cumplimiento."
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 1cc62f8ed68a
i18n_hash_version: 2
---

# Seguridad y endurecimiento {#security-hardening}

SnapOtter procesa los archivos íntegramente en su infraestructura. De forma predeterminada envía analítica de producto anónima y sin contenido, además de informes de fallos, para ayudar a mejorar el proyecto. Nunca envía sus archivos, nombres de archivo, contenido de archivos, resultados de OCR, metadatos de imagen ni texto de documentos. Los comentarios opcionales solo se envían después de que un usuario los remita, solo cuando la analítica está habilitada, y los campos de contacto se incluyen únicamente con consentimiento explícito de contacto. Un administrador puede desactivar la analítica y la captura de comentarios con un clic en Settings > System > Privacy, sin necesidad de recompilar. El procesamiento de archivos siempre permanece dentro de su contenedor.

El contenedor se ejecuta como un usuario dedicado sin privilegios de root (`snapotter`) con todas las capacidades de Linux eliminadas, salvo el conjunto mínimo necesario. Para la política completa de divulgación de vulnerabilidades y la arquitectura de seguridad, consulte [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) en GitHub.

## Endurecimiento del contenedor {#container-hardening}

Los archivos de Compose canónicos para [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) y [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) son la fuente de verdad. No copie un ejemplo abreviado en producción; despliegue el archivo de la etiqueta de versión que haya verificado.

Ambos stacks aplican los siguientes controles:

- Los límites de memoria, swap, CPU y PID contienen el procesamiento nativo descontrolado.
- Cada servicio elimina todas las capacidades de Linux. La aplicación añade de nuevo únicamente `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` para la propiedad de los volúmenes, el abandono de identidad unidireccional con `gosu` y el reenvío ordenado de señales. PostgreSQL y Redis reciben solo el subconjunto que necesitan sus entrypoints oficiales.
- `security_opt: [no-new-privileges:true]` impide que los procesos de los contenedores de la aplicación, PostgreSQL y Redis obtengan privilegios adicionales. Esto sigue siendo compatible con `gosu`: el entrypoint comienza como root, prepara los volúmenes y solo después cambia al usuario dedicado `snapotter`.
- Las entradas de imagen de PostgreSQL y Redis están fijadas por digest. La aplicación también debería fijarse a una etiqueta de versión o un digest verificados en lugar de `latest`.
- Las comprobaciones de estado, la rotación acotada de registros JSON, el AOF duradero de Redis y la política de reinicio se definen de forma centralizada en los archivos canónicos.

Para un despliegue expuesto a internet, enlace el puerto 1349 a loopback y termine TLS en un proxy inverso mantenido. Genere credenciales únicas de PostgreSQL y Redis, almacene los secretos en archivos protegidos o en un gestor de secretos, y cambie la contraseña inicial del administrador de inmediato.

### Por qué `read_only` no está definido {#why-read-only-is-not-set}

`read_only: true` no está definido porque el remapeo de PUID/PGID escribe en `/etc/passwd` y `/etc/group` durante el arranque. Si utiliza la opción `--user` de Docker o `runAsUser` de Kubernetes en lugar de PUID/PGID, puede habilitar con seguridad un sistema de archivos raíz de solo lectura.

## Aislamiento de red {#network-isolation}

El procesamiento de archivos es local, pero una instalación predeterminada **no es un sistema sin tráfico de salida**. La analítica de producto anónima usa PostHog y los informes de fallos usan Sentry cuando la telemetría está habilitada. Defina `SNAPOTTER_TELEMETRY=0` (o desactive la analítica en Settings > System > Privacy) para desactivar ambos. SnapOtter nunca incluye archivos cargados, nombres de archivo, resultados de OCR, texto de documentos ni otros contenidos de archivos en esos eventos.

El resto del tráfico saliente depende de las funciones: la instalación de bundles y modelos de IA descarga entradas de versión firmadas; la importación por URL obtiene una URL pública solicitada por el usuario; y las integraciones configuradas explícitamente, como OIDC, SAML, OpenTelemetry, webhooks, almacenamiento compatible con S3 u otras similares, se comunican con los destinos elegidos por el administrador. Las descargas de modelos en tiempo de ejecución están desactivadas de forma predeterminada. Defina `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` solo para aceptar explícitamente las descargas de respaldo automáticas. Una [importación de bundle sin conexión](/es/guide/deployment) puede aprovisionar las funciones de IA sin tráfico de salida para modelos en tiempo de ejecución.

**Recomendaciones de firewall:**

| Escenario | Regla de salida |
|---|---|
| Aislado de la red (air-gapped) | Defina `SNAPOTTER_TELEMETRY=0` y `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, use la importación de bundles de IA sin conexión, desactive la importación por URL y las integraciones externas, y después bloquee el tráfico de salida |
| Telemetría predeterminada | Permita los endpoints de PostHog y Sentry que figuran en los registros de su navegador o red; desactive la telemetría si su política no los permite |
| Bundles de IA necesarios | Durante la instalación, permita HTTPS hacia `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; después bloquee esos hosts |
| Integraciones externas | Permita solo los destinos exactos de OIDC/SAML/OTLP/webhook/almacenamiento de objetos configurados por el administrador |

Los archivos de los bundles se sirven desde el almacenamiento Xet de Hugging Face, que transfiere en paralelo a través de los endpoints `*.xethub.hf.co` y es lo que hace rápidas las descargas de bundles de varios GB. Si su firewall permite `huggingface.co` pero bloquea `*.xethub.hf.co`, las instalaciones siguen funcionando pero recurren a una descarga de un solo flujo más lenta, así que incluya los hosts de Xet en la lista de permitidos para mantener la vía rápida. Las instalaciones totalmente sin conexión pueden omitir todo esto y usar en su lugar la [importación de bundles sin conexión](/es/guide/deployment).

Para la configuración del proxy inverso (Nginx, Traefik, Caddy, Cloudflare Tunnels), consulte la [guía de despliegue](/es/guide/deployment#reverse-proxy).

## Secretos de Docker {#docker-secrets}

Para despliegues de producción, evite pasar secretos como variables de entorno en texto plano. El entrypoint admite la convención `_FILE` de Docker: monte un secreto como archivo y defina la variable `_FILE` correspondiente con su ruta.

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

El entrypoint detecta cuándo el contenedor ya se ejecuta sin privilegios de root (por ejemplo, mediante `runAsUser` de Kubernetes) y omite automáticamente el cambio de privilegios con gosu. En ese caso no puede ejecutar chown sobre los volúmenes montados, por lo que verifica que sean escribibles y termina pronto con indicaciones accionables si no lo son; consulte [Permisos de almacenamiento](/es/guide/deployment#storage-permissions) para `fsGroup` y configuraciones con UID ajenos (TrueNAS, OpenShift).

**SecurityContext de Pod recomendado:**

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

Dado que `runAsUser: 999` se define a nivel de pod, el entrypoint omite gosu por completo. Esto permite las capacidades `allowPrivilegeEscalation: false` y `drop: [ALL]` sin conflicto.

Para el dimensionamiento de recursos, consulte [Requisitos de hardware](/es/guide/deployment#hardware-requirements).

## Copia de seguridad y recuperación {#backup-and-recovery}

El stack de Compose de producción define cuatro volúmenes. Detenga la entrada de tráfico y deje que terminen los trabajos activos antes de realizar una copia de seguridad coordinada, de modo que PostgreSQL, Redis y el estado de los archivos describan el mismo instante.

| Volumen | Contenido | Tratamiento de recuperación |
|---|---|---|
| `SnapOtter-pgdata` | Usuarios, ajustes, pipelines, trabajos, metadatos de archivos y registro de auditoría de PostgreSQL | Crítico; use un volcado lógico con fallo inmediato para una recuperación portable |
| `SnapOtter-data` | Objetos de la biblioteca guardada, registros y estado de IA (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Haga copia de todo el volumen; para ahorrar espacio, omita deliberadamente todo el estado de IA y reinstale sus bundles |
| `SnapOtter-redisdata` | AOF de Redis para el estado duradero de las colas de BullMQ | Haga la copia tras pausar la aplicación y forzar `SAVE`; es necesario para reanudar exactamente el trabajo en cola |
| `SnapOtter-workspace` | Claves temporales de almacenamiento de objetos (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | No haga copia después de que todos los trabajos se hayan vaciado o cancelado; nunca lo descarte mientras haya trabajos activos |

Compose normalmente añade el nombre del proyecto como prefijo a los nombres de los volúmenes. Resuelva el volumen de origen real a partir del contenedor montado en lugar de asumir que un nombre visible como `SnapOtter-data` es el nombre del volumen de Docker.

### Copia de seguridad de la base de datos {#database-backup}

Utilice el formato de archivo personalizado de PostgreSQL y verifique el archivo antes de considerar completa la copia de seguridad:

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Pruebe cada copia de seguridad restaurándola en un stack aislado, comprobando los registros de la base de datos y las sumas de verificación de los archivos, e iniciando la aplicación. El `tests/qa/backup-restore-drill.sh` del repositorio automatiza esa puerta de verificación de la versión frente a un `QA_IMAGE` explícito.

Si su plataforma realiza instantáneas de volumen consistentes ante fallos, detenga primero todo el stack y tome una instantánea de todos los volúmenes críticos como un conjunto. Una copia sin procesar del directorio de datos de PostgreSQL desde un contenedor en ejecución no es una copia de seguridad lógica admitida.

### Copia de seguridad de archivos y colas {#file-and-queue-backup}

Pause la aplicación antes de capturar los volúmenes de archivos y colas. Use `docker inspect` para resolver el nombre real del volumen, fuerce a Redis a persistir su estado actual y archive conservando la propiedad y los permisos:

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

Reinicie Redis antes que la aplicación. Si excluye intencionadamente `/data/ai`, elimine todo el subárbol de IA en lugar de conservar un registro de `installed.json` sin sus modelos ni su entorno virtual. Mantenga los archivos de copia de seguridad cifrados, con acceso controlado y separados del host que ejecuta SnapOtter.

## Artefactos de cumplimiento {#compliance-artifacts}

Cada versión de SnapOtter incluye los siguientes artefactos de seguridad:

| Artefacto | Formato | Dónde encontrarlo |
|---|---|---|
| Vinculación del sujeto de la versión | JSON canónico + atestación de GitHub | Recurso de [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM del archivo | CycloneDX y SPDX JSON | Recursos de la versión: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM de la imagen | CycloneDX y SPDX JSON | Recursos de la versión: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Análisis de vulnerabilidades | Trivy JSON | Recursos de la versión con prefijos `archive-linux-{arch}` o `image-linux-{arch}` coincidentes |
| Análisis de vulnerabilidades | SARIF | Pestaña [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Análisis estático | CodeQL (JS/TS + Python) | Pestaña [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), se ejecuta semanalmente y en cada PR |
| Revisión de dependencias | Nativo de GitHub | Comprobación por PR, falla ante adiciones de severidad alta |
| Auditoría de dependencias de Python | pip-audit | Registro de ejecución de CI en cada push |
| Política de seguridad | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) en el repositorio |
| Actualizaciones de dependencias | Dependabot | PR semanales automatizados para npm, pip, Docker y Actions |

**Cómo ejecutar su propio análisis:**

Descargue el manifiesto del sujeto de la versión y verifique que fue atestado por el workflow de la versión:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

El manifiesto registra `releaseTag`, `releaseCommit` y `workflowTriggerCommit` por separado. Verifique que `releaseCommit` sea el commit resuelto a partir de la etiqueta inmutable y, a continuación, verifique el digest SHA-256 del archivo, la imagen, el SBOM o el análisis que utilice frente a su entrada en `subjects`. Esta distinción es intencionada: extraer un commit de versión recién creado no cambia la identidad del commit en la credencial OIDC del workflow.

También puede analizar directamente un SBOM descargado o la imagen:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
Los SBOM y los análisis de la imagen reflejan la imagen exacta, específica de cada arquitectura, publicada para esa versión. Los SBOM y los análisis del archivo describen por separado el archivo precompilado. Los bundles de modelos de IA instalados después del despliegue no se incluyen en estos SBOM porque se descargan en tiempo de ejecución.
:::