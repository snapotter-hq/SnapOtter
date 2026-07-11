---
description: "Configura el inicio de sesión único con OpenID Connect. Guías paso a paso para Keycloak, Authentik, Google y otros proveedores OIDC."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: ed919192ab76
---

# OIDC / Inicio de sesión único {#oidc-single-sign-on}

SnapOtter admite OpenID Connect (OIDC) para el inicio de sesión único. Los usuarios pueden iniciar sesión con un proveedor de identidad externo como Keycloak, Authentik o Google en lugar de (o junto a) la autenticación local con usuario y contraseña.

::: tip Consulta también
[SAML SSO](/es/guide/saml) | [Aprovisionamiento SCIM](/es/guide/scim) | [Usuarios, roles y permisos](/es/guide/users-roles)
:::

## Inicio rápido {#quick-start}

Añade estas variables de entorno a tu `docker-compose.yml`:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

La URI de redirección para tu proveedor es siempre:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Por ejemplo, si `EXTERNAL_URL` es `https://photos.example.com`, configura la URI de redirección de tu proveedor como `https://photos.example.com/api/auth/oidc/callback`.

## Referencia de configuración {#configuration-reference}

| Variable | Predeterminado | Descripción |
|---|---|---|
| `OIDC_ENABLED` | `false` | Habilita el inicio de sesión OIDC. Aparece un botón "Iniciar sesión con SSO" en la página de inicio de sesión. |
| `OIDC_ISSUER_URL` | | URL del emisor del proveedor. Debe admitir OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | ID de cliente OAuth registrado en tu proveedor. |
| `OIDC_CLIENT_SECRET` | | Secreto de cliente OAuth. |
| `OIDC_SCOPES` | `openid profile email` | Lista de scopes a solicitar separados por espacios. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Crea automáticamente una cuenta de usuario local en el primer inicio de sesión OIDC. |
| `OIDC_DEFAULT_ROLE` | `user` | Rol asignado a los usuarios OIDC creados automáticamente. Uno de `admin`, `editor` o `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Vincula una identidad OIDC a un usuario local existente si la dirección de correo electrónico coincide. |
| `OIDC_PROVIDER_NAME` | | Nombre visible que se muestra en el botón de inicio de sesión (p. ej. "Keycloak", "Google"). Si está vacío, el botón muestra "SSO". |
| `OIDC_CLOCK_TOLERANCE` | `30` | Tolerancia de desfase de reloj en segundos para la validación de tokens. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Claim del token de ID usado como nombre de usuario para las cuentas nuevas. |
| `EXTERNAL_URL` | | La URL pública donde SnapOtter es accesible. Necesaria para que OIDC construya la URI de redirección correcta. |
| `COOKIE_SECRET` | autogenerado | Secreto para firmar las cookies de sesión. Defínelo explícitamente al ejecutar varias réplicas. |

## Guías de proveedores {#provider-guides}

### Keycloak {#keycloak}

1. Crea un realm nuevo (o usa uno existente).
2. Ve a **Clients** y crea un cliente nuevo:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidencial)
   - **Authentication flow**: Standard flow (Authorization Code)
3. En la pestaña **Settings** del cliente, define **Valid redirect URIs** con tu URL de callback (p. ej. `https://photos.example.com/api/auth/oidc/callback`).
4. Copia el **Client secret** de la pestaña **Credentials**.
5. Define `OIDC_ISSUER_URL` como `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. En la interfaz de administración, ve a **Applications > Providers** y crea un nuevo **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: Tu URL de callback
   - **Signing key**: Selecciona una clave existente o crea una
2. Crea una **Application** y vincúlala al proveedor.
3. Copia el **Client ID** y el **Client Secret** de los ajustes del proveedor.
4. Define `OIDC_ISSUER_URL` como `https://authentik.example.com/application/o/snapotter/` (la barra final importa).

### Google {#google}

1. Ve a la [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto (o selecciona uno existente).
3. Navega a **APIs & Services > OAuth consent screen** y configúralo.
4. Ve a **APIs & Services > Credentials** y crea un **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Tu URL de callback
5. Copia el **Client ID** y el **Client secret**.
6. Define `OIDC_ISSUER_URL` como `https://accounts.google.com`.
7. Define `OIDC_USERNAME_CLAIM` como `email` (Google no proporciona `preferred_username`).

## Aprovisionamiento de usuarios {#user-provisioning}

### Creación automática {#auto-create}

Cuando `OIDC_AUTO_CREATE_USERS` es `true` (el valor predeterminado), se crea una cuenta de usuario local la primera vez que alguien inicia sesión mediante OIDC. El nombre de usuario se toma del claim especificado por `OIDC_USERNAME_CLAIM`, y el rol se establece en `OIDC_DEFAULT_ROLE`.

Si se produce una colisión de nombre de usuario, se añade un sufijo numérico (p. ej. `jane` pasa a ser `jane_2`).

### Vinculación automática {#auto-link}

Cuando `OIDC_AUTO_LINK_USERS` es `true`, SnapOtter vincula una identidad OIDC a una cuenta local existente si las direcciones de correo electrónico coinciden. Esto resulta útil cuando tienes cuentas de usuario creadas de antemano y quieres que empiecen a usar SSO sin perder sus datos.

::: warning 
Habilita la vinculación automática solo si confías en que tu proveedor OIDC verifica las direcciones de correo electrónico. Un correo electrónico no verificado podría permitir que alguien se apropie de la cuenta de otro usuario.
:::

### Desactivar el inicio de sesión local {#disabling-local-login}

OIDC no desactiva el inicio de sesión local con usuario y contraseña. Ambos métodos siguen disponibles. Los administradores aún pueden iniciar sesión con credenciales locales si el proveedor OIDC es inaccesible.

## Certificados autofirmados {#self-signed-certificates}

Si tu proveedor OIDC usa un certificado autofirmado o de una CA privada, monta el paquete de CA en el contenedor y apunta `NODE_EXTRA_CA_CERTS` a él:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
No definas `NODE_TLS_REJECT_UNAUTHORIZED=0`. Esto desactiva toda la verificación TLS y supone un riesgo de seguridad.
:::

## Solución de problemas {#troubleshooting}

### Discrepancia de la URI de redirección {#redirect-uri-mismatch}

El error más común. Comprueba estas diferencias entre lo que espera tu proveedor y lo que envía SnapOtter:

- `http` frente a `https`: el esquema debe coincidir exactamente
- Barra final: algunos proveedores son estrictos con esto
- Número de puerto: incluye el puerto si no es estándar
- Ruta: debe ser `/api/auth/oidc/callback`

Revisa dos veces `EXTERNAL_URL`. Debe coincidir con la URL que los usuarios escriben en su navegador.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

El proveedor OIDC usa un certificado en el que Node.js no confía. Consulta [Certificados autofirmados](#self-signed-certificates) más arriba.

### Errores de desfase de reloj {#clock-skew-errors}

Si el reloj de tu servidor y el del proveedor OIDC están desincronizados, la validación de tokens puede fallar. Aumenta `OIDC_CLOCK_TOLERANCE` (el valor predeterminado es 30 segundos). Una solución mejor es ejecutar NTP en ambas máquinas.

### "Proveedor OIDC inaccesible" {#oidc-provider-unreachable}

SnapOtter obtiene el documento de discovery del proveedor al arrancar y durante el inicio de sesión. Comprueba:

- La resolución DNS desde dentro del contenedor Docker (`docker exec snapotter nslookup auth.example.com`)
- Las reglas del firewall entre el contenedor y el proveedor
- El valor de `OIDC_ISSUER_URL`: debe ser accesible desde el servidor, no solo desde tu navegador

### Claims ausentes {#missing-claims}

Si los nombres de usuario o los correos electrónicos están vacíos tras el inicio de sesión, es posible que tu proveedor no devuelva los claims esperados. Verifica:

- Los scopes configurados en `OIDC_SCOPES` incluyen `profile` y `email`
- El proveedor está configurado para incluir el claim especificado en `OIDC_USERNAME_CLAIM` en el token de ID
- Algunos proveedores requieren configuración explícita de mapper/scope para liberar los claims
