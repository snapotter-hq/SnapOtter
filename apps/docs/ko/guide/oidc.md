---
description: "OpenID Connect로 싱글 사인온을 설정하세요. Keycloak, Authentik, Google 및 기타 OIDC 공급자에 대한 단계별 가이드입니다."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: cb2481dcd32f
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter는 싱글 사인온을 위해 OpenID Connect(OIDC)를 지원합니다. 사용자는 로컬 사용자 이름/비밀번호 인증 대신(또는 이와 함께) Keycloak, Authentik, Google과 같은 외부 ID 공급자로 로그인할 수 있습니다.

::: tip 함께 참고하기
[SAML SSO](/ko/guide/saml) | [SCIM Provisioning](/ko/guide/scim) | [Users, Roles & Permissions](/ko/guide/users-roles)
:::

## Quick start {#quick-start}

`docker-compose.yml`에 다음 환경 변수를 추가하세요:

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

공급자의 리디렉션 URI는 항상 다음과 같습니다:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

예를 들어 `EXTERNAL_URL`가 `https://photos.example.com`라면, 공급자의 리디렉션 URI를 `https://photos.example.com/api/auth/oidc/callback`으로 구성하세요.

## Configuration reference {#configuration-reference}

| Variable | Default | Description |
|---|---|---|
| `OIDC_ENABLED` | `false` | OIDC 로그인을 활성화합니다. 로그인 페이지에 "Sign in with SSO" 버튼이 나타납니다. |
| `OIDC_ISSUER_URL` | | 공급자의 issuer URL. OIDC Discovery(`/.well-known/openid-configuration`)를 지원해야 합니다. |
| `OIDC_CLIENT_ID` | | 공급자에 등록된 OAuth 클라이언트 ID. |
| `OIDC_CLIENT_SECRET` | | OAuth 클라이언트 시크릿. |
| `OIDC_SCOPES` | `openid profile email` | 요청할 스코프의 공백으로 구분된 목록. |
| `OIDC_AUTO_CREATE_USERS` | `true` | 첫 OIDC 로그인 시 로컬 사용자 계정을 자동으로 생성합니다. |
| `OIDC_DEFAULT_ROLE` | `user` | 자동 생성된 OIDC 사용자에게 할당되는 역할. `admin`, `editor`, `user` 중 하나. |
| `OIDC_AUTO_LINK_USERS` | `false` | 이메일 주소가 일치하면 OIDC ID를 기존 로컬 사용자에 연결합니다. |
| `OIDC_PROVIDER_NAME` | | 로그인 버튼에 표시되는 이름(예: "Keycloak", "Google"). 비어 있으면 버튼에 "SSO"라고 표시됩니다. |
| `OIDC_CLOCK_TOLERANCE` | `30` | 토큰 검증을 위한 시계 오차 허용 범위(초 단위). |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | 새 계정의 사용자 이름으로 사용되는 ID 토큰 클레임. |
| `EXTERNAL_URL` | | SnapOtter에 접근할 수 있는 공개 URL. OIDC가 올바른 리디렉션 URI를 구성하려면 필요합니다. |
| `COOKIE_SECRET` | auto-generated | 세션 쿠키 서명을 위한 시크릿. 여러 레플리카를 실행할 때 명시적으로 설정하세요. |

## Provider guides {#provider-guides}

### Keycloak {#keycloak}

1. 새 realm을 생성합니다(또는 기존 realm 사용).
2. **Clients**로 이동하여 새 클라이언트를 생성합니다:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. 클라이언트의 **Settings** 탭에서 **Valid redirect URIs**를 콜백 URL로 설정합니다(예: `https://photos.example.com/api/auth/oidc/callback`).
4. **Credentials** 탭에서 **Client secret**을 복사합니다.
5. `OIDC_ISSUER_URL`을 `https://keycloak.example.com/realms/your-realm`로 설정합니다.

### Authentik {#authentik}

1. 관리자 인터페이스에서 **Applications > Providers**로 이동하여 새 **OAuth2/OpenID Provider**를 생성합니다.
   - **Client type**: Confidential
   - **Redirect URIs**: 콜백 URL
   - **Signing key**: 기존 키를 선택하거나 새로 생성
2. **Application**을 생성하고 공급자에 연결합니다.
3. 공급자 설정에서 **Client ID**와 **Client Secret**을 복사합니다.
4. `OIDC_ISSUER_URL`을 `https://authentik.example.com/application/o/snapotter/`으로 설정합니다(끝의 슬래시가 중요합니다).

### Google {#google}

1. [Google Cloud Console](https://console.cloud.google.com/)로 이동합니다.
2. 프로젝트를 생성합니다(또는 기존 프로젝트 선택).
3. **APIs & Services > OAuth consent screen**으로 이동하여 구성합니다.
4. **APIs & Services > Credentials**로 이동하여 **OAuth 2.0 Client ID**를 생성합니다:
   - **Application type**: Web application
   - **Authorized redirect URIs**: 콜백 URL
5. **Client ID**와 **Client secret**을 복사합니다.
6. `OIDC_ISSUER_URL`을 `https://accounts.google.com`로 설정합니다.
7. `OIDC_USERNAME_CLAIM`을 `email`으로 설정합니다(Google은 `preferred_username`을 제공하지 않습니다).

## User provisioning {#user-provisioning}

### Auto-create {#auto-create}

`OIDC_AUTO_CREATE_USERS`가 `true`일 때(기본값), 누군가 OIDC로 처음 로그인하면 로컬 사용자 계정이 생성됩니다. 사용자 이름은 `OIDC_USERNAME_CLAIM`로 지정된 클레임에서 가져오며, 역할은 `OIDC_DEFAULT_ROLE`로 설정됩니다.

사용자 이름 충돌이 발생하면 숫자 접미사가 추가됩니다(예: `jane`이 `jane_2`이 됨).

### Auto-link {#auto-link}

`OIDC_AUTO_LINK_USERS`가 `true`일 때, SnapOtter는 이메일 주소가 일치하면 OIDC ID를 기존 로컬 계정에 연결합니다. 사용자 계정을 미리 생성해 두고, 데이터를 잃지 않으면서 SSO를 사용하기 시작하도록 하려는 경우에 유용합니다.

::: warning 
OIDC 공급자가 이메일 주소를 검증한다고 신뢰하는 경우에만 auto-link를 활성화하세요. 검증되지 않은 이메일은 누군가가 다른 사용자의 계정을 탈취하도록 허용할 수 있습니다.
:::

### Disabling local login {#disabling-local-login}

OIDC는 로컬 사용자 이름/비밀번호 로그인을 비활성화하지 않습니다. 두 방식 모두 계속 사용할 수 있습니다. OIDC 공급자에 접근할 수 없는 경우에도 관리자는 로컬 자격 증명으로 로그인할 수 있습니다.

## Self-signed certificates {#self-signed-certificates}

OIDC 공급자가 자체 서명 또는 사설 CA 인증서를 사용하는 경우, CA 번들을 컨테이너에 마운트하고 `NODE_EXTRA_CA_CERTS`이 이를 가리키도록 하세요:

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
`NODE_TLS_REJECT_UNAUTHORIZED=0`을 설정하지 마세요. 이는 모든 TLS 검증을 비활성화하며 보안 위험입니다.
:::

## Troubleshooting {#troubleshooting}

### Redirect URI mismatch {#redirect-uri-mismatch}

가장 흔한 오류입니다. 공급자가 기대하는 것과 SnapOtter가 보내는 것 사이에서 다음 차이를 확인하세요:

- `http` 대 `https` - 스킴이 정확히 일치해야 합니다
- 끝의 슬래시 - 일부 공급자는 이에 대해 엄격합니다
- 포트 번호 - 비표준인 경우 포트를 포함하세요
- 경로 - `/api/auth/oidc/callback`여야 합니다

`EXTERNAL_URL`를 다시 확인하세요. 사용자가 브라우저에 입력하는 URL과 일치해야 합니다.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

OIDC 공급자가 Node.js가 신뢰하지 않는 인증서를 사용하고 있습니다. 위의 [Self-signed certificates](#self-signed-certificates)를 참고하세요.

### Clock skew errors {#clock-skew-errors}

서버 시계와 OIDC 공급자 시계가 동기화되지 않으면 토큰 검증이 실패할 수 있습니다. `OIDC_CLOCK_TOLERANCE`을 늘리세요(기본값은 30초). 더 나은 해결책은 두 머신 모두에서 NTP를 실행하는 것입니다.

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter는 시작 시점과 로그인 중에 공급자의 discovery 문서를 가져옵니다. 다음을 확인하세요:

- Docker 컨테이너 내부에서의 DNS 확인(`docker exec snapotter nslookup auth.example.com`)
- 컨테이너와 공급자 사이의 방화벽 규칙
- `OIDC_ISSUER_URL` 값 - 브라우저뿐만 아니라 서버에서도 접근할 수 있어야 합니다

### Missing claims {#missing-claims}

로그인 후 사용자 이름이나 이메일이 비어 있다면, 공급자가 기대하는 클레임을 반환하지 않을 수 있습니다. 다음을 확인하세요:

- `OIDC_SCOPES`에 구성된 스코프에 `profile`과 `email`이 포함되어 있는지
- ID 토큰에 `OIDC_USERNAME_CLAIM`로 지정된 클레임을 포함하도록 공급자가 구성되어 있는지
- 일부 공급자는 클레임을 릴리스하기 위해 명시적인 매퍼/스코프 구성이 필요합니다
