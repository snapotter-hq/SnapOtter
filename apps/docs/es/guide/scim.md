---
description: "Configura el aprovisionamiento SCIM 2.0 para sincronizar usuarios y grupos desde tu proveedor de identidad hacia SnapOtter. Cubre Okta, Azure AD / Entra ID e integraciones personalizadas."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 3058636bdbc1
---

# Aprovisionamiento SCIM {#scim-provisioning}

SnapOtter implementa SCIM 2.0 (System for Cross-domain Identity Management) para el aprovisionamiento automatizado de usuarios y grupos. Tu proveedor de identidad puede crear, actualizar, desactivar y reactivar cuentas de usuario y sincronizar la pertenencia a grupos automáticamente.

::: tip Función enterprise
El aprovisionamiento SCIM requiere una licencia **enterprise** con la función `scim`. No está disponible en el plan team. Sin la función, todos los endpoints SCIM (excepto discovery) devuelven 403.
:::

## Requisitos previos {#prerequisites}

- Una instancia de SnapOtter en ejecución accesible en una URL pública
- Una clave de licencia enterprise con la función `scim`
- Acceso de administrador a SnapOtter (se requiere el permiso `users:manage` para generar o revocar un token SCIM)
- Acceso de administrador a la configuración de aprovisionamiento de tu proveedor de identidad

## Inicio rápido {#quick-start}

1. Genera un token bearer de SCIM:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

La respuesta contiene el token. Guárdalo de inmediato; no se puede recuperar de nuevo.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. En tu proveedor de identidad, configura el aprovisionamiento SCIM con:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Autenticación**: token bearer (pega el token del paso 1)

## Autenticación {#authentication}

Los endpoints SCIM usan un token Bearer dedicado, independiente de las sesiones de usuario y de las claves de API.

### Generar un token {#generating-a-token}

`POST /api/v1/enterprise/scim/token` genera un nuevo token SCIM. Este endpoint requiere una sesión válida con el permiso `users:manage`.

El token se devuelve en texto plano exactamente una vez. SnapOtter almacena solo un hash scrypt. Si pierdes el token, revócalo y genera uno nuevo.

Solo hay un token SCIM activo a la vez. Generar un token nuevo reemplaza al anterior.

### Revocar un token {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` revoca el token SCIM actual. Este endpoint también requiere `users:manage`.

### Limitación de tasa {#rate-limiting}

Los endpoints SCIM están limitados a 1000 solicitudes por minuto por token. Superar este límite devuelve HTTP 429.

## Recursos admitidos {#supported-resources}

| Recurso SCIM | Concepto de SnapOtter | Crear | Leer | Actualizar | Eliminar |
|---|---|---|---|---|---|
| User | Cuenta de usuario | Sí | Sí | Sí | Eliminación lógica |
| Group | Equipo | Sí | Sí | Sí | Sí |

::: warning 
Los Groups de SCIM se corresponden con los **equipos** de SnapOtter, no con roles. SCIM no puede establecer el rol de un usuario. Todos los usuarios creados vía SCIM reciben el rol `user`. Para cambiar el rol de un usuario, usa la interfaz de administración de SnapOtter.
:::

## Operaciones de usuario {#user-operations}

### Crear usuario {#create-user}

`POST /api/v1/scim/v2/Users`

Crea una nueva cuenta de usuario con `authProvider` establecido en `scim` y el rol `user`. El usuario se asigna al equipo Default. Si `active` es `false`, el rol se establece en `disabled` en su lugar.

Atributos obligatorios: `userName`. Opcionales: `externalId`, `emails`, `active` (por defecto `true`).

### Listar y filtrar usuarios {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Devuelve una lista paginada de usuarios. Admite los parámetros de consulta `startIndex` y `count` (máximo 200 resultados por página).

El filtrado admite solo `eq` (igual), sobre estos atributos:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Otros operadores de filtro y atributos devuelven HTTP 400.

### Obtener usuario {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Devuelve un único usuario por su ID de usuario de SnapOtter.

### Reemplazar usuario {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Reemplaza los atributos del usuario. Admite `userName`, `externalId`, `emails` y `active`. Los cambios de nombre de usuario se comprueban en busca de conflictos (409 si otro usuario ya usa el nuevo nombre de usuario).

### Aplicar patch a un usuario {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Actualización parcial mediante SCIM PatchOp. Operaciones admitidas:

| Operación | Rutas |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Igual que `replace` |
| `remove` | `externalId`, `emails` |

Las rutas `name.formatted` y `displayName` se aceptan por compatibilidad, pero no tienen efecto persistente (SnapOtter no almacena un nombre para mostrar por separado).

Las operaciones `replace` sin valor (donde el valor es un objeto sin un `path`) también se admiten, con las claves `userName`, `externalId`, `emails` y `active`.

### Desactivar usuario (eliminación lógica) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter no elimina usuarios de forma definitiva vía SCIM. En su lugar, DELETE realiza una desactivación lógica:

1. El rol del usuario se cambia de su valor actual (p. ej. `editor`) a `disabled:editor`, preservando el rol original.
2. Se borra la contraseña del usuario.
3. Se revocan todas las sesiones activas.
4. Se revocan todas las claves de API.

El usuario ya no puede iniciar sesión ni usar ninguna clave de API. Sus datos (archivos, historial) se conservan.

### Reactivar usuario {#reactivate-user}

Para reactivar un usuario previamente desactivado, envía una solicitud `PUT` o `PATCH` con `active: true`. SnapOtter restaura el rol original de antes de la desactivación (p. ej. `disabled:editor` vuelve a ser `editor`). Si no se puede determinar el rol original, se recurre a `user`.

::: details Ejemplo: desactivar y reactivar vía PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Operaciones de grupo {#group-operations}

Los Groups de SCIM se corresponden con los equipos de SnapOtter. Crear un grupo crea un equipo. La pertenencia al grupo controla a qué equipo pertenece un usuario.

### Crear grupo {#create-group}

`POST /api/v1/scim/v2/Groups`

Obligatorio: `displayName`. Opcional: `members` (array de `{ value: userId }`).

### Listar y filtrar grupos {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

El filtrado admite solo `displayName eq "..."`. Paginado con `startIndex` y `count` (máximo 200 resultados por página).

### Obtener grupo {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Reemplazar grupo {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Reemplaza el nombre del grupo y la lista completa de miembros. Los miembros existentes que no estén en la nueva lista se trasladan al equipo Default.

### Aplicar patch a un grupo {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Admite estas operaciones:

| Operación | Ruta | Efecto |
|---|---|---|
| `add` | `members` | Añade usuarios al equipo |
| `remove` | `members[value eq "userId"]` | Traslada al usuario al equipo Default |
| `replace` | `displayName` | Renombra el equipo |
| `replace` | `members` | Reemplaza todos los miembros (los miembros eliminados pasan al equipo Default) |

### Eliminar grupo {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Elimina el equipo. Todos los miembros del equipo eliminado se trasladan al equipo Default. Los usuarios no se desactivan ni se eliminan.

## Configuración del IdP {#idp-setup}

### Okta {#okta}

1. En la consola de administración de Okta, abre tu aplicación de SnapOtter (o crea una).
2. Ve a la pestaña **Provisioning** y haz clic en **Configure API Integration**.
3. Marca **Enable API Integration** e introduce:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: el token bearer de SCIM generado anteriormente
4. Haz clic en **Test API Credentials** y luego en **Save**.
5. En **Provisioning > To App**, habilita:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. En **Push Groups**, configura qué grupos de Okta sincronizar como equipos de SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. En el portal de Azure, ve a tu aplicación empresarial de SnapOtter.
2. Ve a **Provisioning** y establece **Provisioning Mode** en **Automatic**.
3. En **Admin Credentials**, introduce:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: el token bearer de SCIM generado anteriormente
4. Haz clic en **Test Connection** y luego en **Save**.
5. En **Mappings**, configura las asignaciones de atributos de usuario y de grupo. Los valores por defecto suelen funcionar, pero verifica que `userName` se asigne a `userPrincipalName` o `mail` según prefieras.
6. Establece **Provisioning Status** en **On** y guarda.

Azure aprovisiona usuarios y grupos en un ciclo de sincronización fijo (normalmente cada 40 minutos).

## Endpoints de discovery {#discovery-endpoints}

Estos tres endpoints están disponibles sin autenticación y describen las capacidades del servidor SCIM:

| Endpoint | Descripción |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Capacidades del servidor y funciones admitidas |
| `GET /api/v1/scim/v2/Schemas` | Definiciones de esquema de User y Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Tipos de recurso disponibles (User, Group) |

El `ServiceProviderConfig` anuncia estas capacidades:

| Función | Admitida |
|---|---|
| Patch | Sí |
| Bulk | No |
| Filter | Sí (máx. 200 resultados, solo el operador `eq`) |
| Change password | No |
| Sort | No |
| ETag | No |

## Limitaciones {#limitations}

- **Filtrado**: solo se admite el operador `eq`. Los filtros complejos, los operadores `and`/`or`, `co` (contiene) y `sw` (empieza por) no están implementados.
- **Operaciones bulk**: no se admiten.
- **Sort y ETag**: no se admiten.
- **Roles**: SCIM no puede asignar roles de SnapOtter. Todos los usuarios aprovisionados reciben el rol `user`.
- **MAX_USERS**: el límite de la variable de entorno `MAX_USERS` no se aplica en la creación de usuarios vía SCIM. Si necesitas limitar el número de usuarios, gestiona las asignaciones en tu IdP.
- **Un solo token**: solo puede haber un token SCIM activo a la vez. Si varios IdP necesitan acceso SCIM, deben compartir el token.
- **Los grupos son equipos**: los Groups de SCIM se corresponden con equipos, no con roles ni grupos de permisos.

## Solución de problemas {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Tu licencia no incluye la función `scim`, o no hay ninguna licencia configurada. SCIM requiere una licencia de plan enterprise. Verifica que `SNAPOTTER_LICENSE_KEY` esté establecido y que la licencia incluya la función `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

La solicitud SCIM no incluía una cabecera `Authorization: Bearer <token>`. Comprueba la configuración de aprovisionamiento de tu IdP.

### 401 "Invalid token" {#_401-invalid-token}

El token no coincide con el hash almacenado. Esto ocurre si el token fue revocado y regenerado. Actualiza el token en la configuración de aprovisionamiento de tu IdP.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Aún no se ha generado ningún token SCIM. Usa el endpoint `POST /api/v1/enterprise/scim/token` para crear uno.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Ya existe un usuario con el mismo nombre de usuario. Esto puede ocurrir cuando un IdP reintenta una creación fallida. Comprueba si hay nombres de usuario duplicados en el panel de administración de SnapOtter.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

El IdP está enviando más de 1000 solicitudes por minuto. Esto suele ocurrir durante una gran sincronización inicial. La mayoría de los IdP reintentan automáticamente cuando se reinicia la ventana de límite de tasa. Si el problema persiste, comprueba el intervalo de sincronización de aprovisionamiento de tu IdP.

### Usuarios desaprovisionados pero no eliminados de la interfaz {#users-deprovisioned-but-not-removed-from-the-ui}

DELETE de SCIM es una desactivación lógica. Los usuarios desactivados siguen apareciendo en la lista de usuarios del administrador con un estado deshabilitado. Esto es intencionado para preservar sus datos. Su rol se muestra como `disabled:<original-role>`.
