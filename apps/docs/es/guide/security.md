---
description: "Guía de fortalecimiento de seguridad para SnapOtter. Seguridad de contenedores, aislamiento de red, secretos de Docker, despliegue en Kubernetes y artefactos de cumplimiento."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 1cc16fd75817
i18n_hash_version: 2
---

# Seguridad y fortalecimiento {#security-hardening}

SnapOtter procesa los archivos íntegramente en tu infraestructura. Envía por defecto analítica de producto e informes de fallos anónimos y sin contenido para ayudar a mejorar el proyecto. Nunca envía tus archivos, nombres de archivo, contenido de archivos, salida de OCR, metadatos de imagen ni texto de documentos. Los comentarios opcionales se envían solo después de que un usuario los envíe, solo cuando la analítica está habilitada, y los campos de contacto se incluyen solo con consentimiento de contacto explícito. Un administrador puede desactivar la captura de analítica y comentarios con un solo clic en Ajustes > Sistema > Privacidad, sin necesidad de recompilar. El procesamiento de archivos siempre permanece dentro de tu contenedor.

El contenedor se ejecuta como un usuario dedicado sin root (`snapotter`) con todas las capacidades de Linux eliminadas excepto el conjunto mínimo requerido. Para la política completa de divulgación de vulnerabilidades y la arquitectura de seguridad, consulta [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) en GitHub.

## Endurecimiento del contenedor {#container-hardening}

Los archivos canónicos de composición [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) y [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) son la fuente de la verdad. No copie un ejemplo abreviado en producción; implemente el archivo desde la etiqueta de lanzamiento que verificó.

Ambas pilas aplican los siguientes controles:

- Los límites de memoria, intercambio, CPU y PID contienen procesamiento nativo fuera de control.
- Cada servicio elimina todas las capacidades de Linux. La aplicación vuelve a agregar solo `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` para la propiedad del volumen, la caída de identidad unidireccional `gosu` y el reenvío elegante de señales. PostgreSQL y Redis reciben solo el subconjunto que necesitan sus puntos de entrada oficiales.
- `security_opt: [no-new-privileges:true]` evita que los procesos en los contenedores de aplicaciones, PostgreSQL y Redis obtengan privilegios adicionales. Esto sigue siendo compatible con `gosu`: el punto de entrada comienza como raíz, prepara los volúmenes y solo llega al usuario dedicado `snapotter`.
- Las entradas de imágenes de PostgreSQL y Redis están fijadas mediante resumen. La aplicación también debe fijarse en una etiqueta de lanzamiento verificada o en un resumen en lugar de `latest`.
- Las comprobaciones de estado, la rotación de registros JSON limitada, el Redis AOF duradero y la política de reinicio se definen de forma centralizada en los archivos canónicos.

Para una implementación orientada a Internet, vincule el puerto 1349 al bucle invertido y finalice TLS en un proxy inverso mantenido. Genere credenciales únicas de PostgreSQL y Redis, almacene secretos en archivos protegidos o en un administrador de secretos y cambie la contraseña inicial del administrador de inmediato.

### Por qué `read_only` no está configurado como {#why-read-only-is-not-set}

`read_only: true` no está configurado porque la reasignación de PUID/PGID escribe en `/etc/passwd` y `/etc/group` al inicio. Si utiliza el indicador `--user` de Docker o Kubernetes `runAsUser` en lugar de PUID/PGID, puede habilitar de forma segura un sistema de archivos raíz de solo lectura.

## Aislamiento de red {#network-isolation}

El procesamiento de archivos es local, pero una instalación predeterminada **no es un sistema libre de salida**. Los análisis anónimos de productos utilizan PostHog y los informes de fallos utilizan Sentry cuando la telemetría está habilitada. Configure `SNAPOTTER_TELEMETRY=0` (o deshabilite los análisis en Configuración > Sistema > Privacidad) para desactivar ambos. SnapOtter nunca incluye archivos cargados, nombres de archivos, resultados de OCR, texto de documentos u otros contenidos de archivos en esos eventos.

Otro tráfico saliente se basa en funciones: descargas de instalación de modelos/paquetes de IA, entradas de lanzamiento firmadas; La importación de URL recupera una URL pública solicitada por el usuario; y OIDC, SAML, OpenTelemetry, webhooks, almacenamiento compatible con S3 o integraciones similares configurados explícitamente se ponen en contacto con los destinos elegidos por el administrador. Las descargas de modelos en tiempo de ejecución están deshabilitadas de forma predeterminada. Establezca `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` solo para habilitar explícitamente las descargas automáticas de respaldo. Una [importación de paquete sin conexión](/es/guide/deployment) puede aprovisionar funciones de IA sin salida del modelo de tiempo de ejecución.

**Recomendaciones de cortafuegos:**

|Guión|regla de salida|
|---|---|
|Espacio de aire|Configure `SNAPOTTER_TELEMETRY=0` y `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, use la importación de paquetes de IA sin conexión, deshabilite la importación de URL y las integraciones externas, luego bloquee la salida|
|Telemetría predeterminada|Permitir los puntos finales de PostHog y Sentry enumerados en los registros de su navegador/red; deshabilitar la telemetría si la política no lo permite|
|Se necesitan paquetes de IA|Durante la instalación, permita HTTPS a `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; luego bloquea esos hosts|
|Integraciones externas|Permitir solo los destinos OIDC/SAML/OTLP/webhook/almacenamiento de objetos exactos configurados por el administrador|

Los archivos de paquetes se sirven desde el almacenamiento Xet de Hugging Face, que se transfiere a través de los puntos finales `*.xethub.hf.co` en paralelo y es lo que acelera las descargas de paquetes de varios GB. Si su firewall permite `huggingface.co` pero bloquea `*.xethub.hf.co`, las instalaciones aún se realizan correctamente pero recurren a una descarga de flujo único más lenta, por lo que debe incluir los hosts Xet en la lista de permitidos para permanecer en la ruta rápida. Las instalaciones completamente fuera de línea pueden omitir todo esto y usar [Importación de paquete sin conexión](/es/guide/deployment) en su lugar.

Para la configuración del proxy inverso (Nginx, Traefik, Caddy, Cloudflare Tunnels), consulte la [Guía de implementación](/es/guide/deployment#reverse-proxy).

## Secretos de Docker {#docker-secrets}

Para los despliegues de producción, evita pasar secretos como variables de entorno en texto plano. El punto de entrada admite la convención `_FILE` de Docker: monta un secreto como archivo y establece la variable `_FILE` correspondiente a su ruta.

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

El punto de entrada detecta cuándo el contenedor ya se está ejecutando sin root (p. ej., mediante `runAsUser` de Kubernetes) y omite la reducción de privilegios de gosu automáticamente. En ese caso no puede hacer chown de los volúmenes montados por sí mismo, así que verifica que sean escribibles y sale pronto con orientación práctica si no lo son; consulta [Permisos de almacenamiento](/es/guide/deployment#storage-permissions) para configuraciones de `fsGroup` y de UID ajeno (TrueNAS, OpenShift).

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

Como `runAsUser: 999` se establece a nivel de pod, el punto de entrada omite gosu por completo. Esto permite las capacidades `allowPrivilegeEscalation: false` y `drop: [ALL]` sin conflicto.

Para el dimensionamiento de recursos, consulta [Requisitos de hardware](/es/guide/deployment#hardware-requirements).

## Copia de seguridad y recuperación {#backup-and-recovery}

La pila de producción Compose define cuatro volúmenes. Detenga el ingreso y deje que finalicen los trabajos activos antes de realizar una copia de seguridad coordinada para que PostgreSQL, Redis y el estado del archivo describan el mismo momento.

|Volumen|Contenido|Tratamiento de recuperación|
|---|---|---|
|`SnapOtter-pgdata`|Usuarios, configuraciones, canalizaciones, trabajos, metadatos de archivos y registros de auditoría de PostgreSQL|Crítico; utilice un volcado lógico a prueba de fallos para una recuperación portátil|
|`SnapOtter-data`|Objetos de biblioteca guardados, registros y estado de IA (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Haga una copia de seguridad de todo el volumen; para ahorrar espacio, omita deliberadamente todo el estado de la IA y reinstale sus paquetes|
|`SnapOtter-redisdata`|Redis AOF para un estado de cola BullMQ duradero|Haga una copia de seguridad después de pausar la aplicación y forzar `SAVE`; requerido para reanudar el trabajo en cola exactamente|
|`SnapOtter-workspace`|Claves de almacenamiento temporal de objetos (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|No realice copias de seguridad después de que todos los trabajos se hayan agotado o cancelado; nunca lo descartes mientras los trabajos estén activos|

Compose normalmente antepone los nombres de los volúmenes al nombre del proyecto. Resuelva el volumen de origen real desde el contenedor montado en lugar de asumir que un nombre para mostrar como `SnapOtter-data` es el nombre del volumen de Docker.

### Copia de seguridad de la base de datos {#database-backup}

Utilice el formato de archivo personalizado de PostgreSQL y verifique el archivo antes de considerar que la copia de seguridad está completa:

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

Pruebe cada copia de seguridad restaurándola en una pila aislada, verificando los registros de la base de datos y las sumas de verificación de los archivos e iniciando la aplicación. El `tests/qa/backup-restore-drill.sh` del repositorio automatiza esa puerta de liberación contra un `QA_IMAGE` explícito.

Si su plataforma toma instantáneas de volúmenes coherentes con las fallas, primero detenga toda la pila y tome instantáneas de todos los volúmenes críticos como un solo conjunto. Una copia sin formato del directorio de datos de PostgreSQL desde un contenedor en ejecución no es una copia de seguridad lógica compatible.

### Copia de seguridad de archivos y colas {#file-and-queue-backup}

Pause la aplicación antes de capturar volúmenes de archivos y colas. Utilice `docker inspect` para resolver el nombre del volumen real, forzar a Redis a conservar su estado actual y archivar conservando la propiedad y los permisos:

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

Reinicie Redis antes de la aplicación. Si excluye intencionalmente `/data/ai`, elimine todo el subárbol AI en lugar de conservar un registro `installed.json` sin sus modelos o entorno virtual. Mantenga los archivos de respaldo cifrados, con acceso controlado y separados del host que ejecuta SnapOtter.

## Artefactos de cumplimiento {#compliance-artifacts}

Cada versión de SnapOtter incluye los siguientes artefactos de seguridad:

| Artefacto | Formato | donde encontrarlo |
|---|---|---|
| Liberar enlace de asunto | Certificación canónica JSON + GitHub | [Lanzamiento GitHub](https://github.com/snapotter-hq/SnapOtter/releases) activo: `snapotter-v{version}-release-subjects.json` |
| Archivo SBOM | CycloneDX y SPDX JSON | Activos de lanzamiento: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Imagen SBOM | CycloneDX y SPDX JSON | Activos de lanzamiento: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Escaneos de vulnerabilidad | Trivy JSON | Liberar activos con prefijos `archive-linux-{arch}` o `image-linux-{arch}` coincidentes |
| Escaneo de vulnerabilidad | SARIF | Pestaña [Seguridad GitHub](https://github.com/snapotter-hq/SnapOtter/security) |
| Análisis estático | CodeQL (JS/TS + Python) | Pestaña [Seguridad GitHub](https://github.com/snapotter-hq/SnapOtter/security), se ejecuta semanalmente + por PR |
| Revisión de dependencia | GitHub nativo | Verificación por PR, falla en adiciones de alta gravedad |
| Auditoría de dependencia Python | pip-audit | Registro de ejecución de CI en cada pulsación |
| Política de seguridad | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) en el repositorio |
| Actualizaciones de dependencia | Dependabot | PR semanales automatizados para npm, pip, Docker, acciones |

**Ejecutando tu propio escaneo:**

Descargue el manifiesto sujeto a la versión y verifique que haya sido atestiguado por el flujo de trabajo de la versión:

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

El manifiesto registra `releaseTag`, `releaseCommit` y `workflowTriggerCommit` por separado. Verifique que `releaseCommit` sea la confirmación extraída de la etiqueta inmutable, luego verifique el resumen SHA-256 del archivo, imagen, SBOM o escaneo que consume con su entrada en `subjects`. Esta distinción es intencional: verificar una confirmación de versión recién creada no cambia la identidad de la confirmación en la credencial OIDC del flujo de trabajo.

También puedes escanear un SBOM descargado o la imagen directamente:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
La imagen SBOMs y los escaneos reflejan la imagen exacta de la arquitectura específica publicada para esa versión. El archivo SBOMs y los análisis describen el archivo prediseñado por separado. Los paquetes de modelos AI instalados después de la implementación no se incluyen en estos SBOMs porque se descargan en tiempo de ejecución.
:::
