---
description: "SnapOtter에서 사용자, 기본 및 커스텀 역할, 권한, API 키, 팀, 세션, 감사 로그를 관리합니다."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 85b83db3a06d
---

# 사용자, 역할 및 권한 {#users-roles-permissions}

SnapOtter는 기본 역할 3개, 세분화된 권한 17개, 그리고 선택적 도구별 접근 제어가 가능한 커스텀 역할을 제공합니다. 이 페이지는 전체 인가 모델, API 키 스코프, 팀 관리, 감사 로깅을 다룹니다.

::: tip 관련 페이지
[OIDC / SSO](/ko/guide/oidc) | [SAML SSO](/ko/guide/saml) | [SCIM 프로비저닝](/ko/guide/scim) | [보안 및 하드닝](/ko/guide/security)
:::

## 사용자 {#users}

### 사용자 생성 {#creating-users}

관리자는 관리자 패널이나 `POST /api/auth/register` 엔드포인트를 통해 사용자를 생성할 수 있습니다. 각 사용자는 사용자 이름, 역할, 팀 배정, 그리고 선택적 이메일 주소를 가집니다.

### 기본 관리자 {#default-admin}

첫 시작 시 SnapOtter는 기본 관리자 계정을 생성합니다. 자격 증명은 환경 변수에서 옵니다:

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | 초기 관리자 계정의 사용자 이름 |
| `DEFAULT_PASSWORD` | `admin` | 초기 관리자 계정의 비밀번호 |

기본 관리자는 첫 로그인 시 비밀번호를 변경해야 합니다.

### 인증 제공자 {#authentication-providers}

사용자는 여러 방법으로 인증할 수 있습니다:

- **로컬** - SnapOtter 데이터베이스에 저장된 사용자 이름과 비밀번호
- **OIDC** - 모든 OpenID Connect 제공자([OIDC / SSO](/ko/guide/oidc) 참고)
- **SAML** - SAML 2.0 ID 제공자([SAML SSO](/ko/guide/saml) 참고)
- **SCIM** - ID 제공자로부터의 자동 프로비저닝([SCIM 프로비저닝](/ko/guide/scim) 참고)

### 인증 비활성화 {#disabling-authentication}

인증을 완전히 비활성화하려면 `AUTH_ENABLED=false`을 설정하세요. 이 모드에서는 `admin` 역할을 가진 가상의 익명 사용자가 모든 요청에 사용됩니다. 로그인이 필요하지 않습니다.

::: warning 
인증을 비활성화하면 인스턴스에 접근할 수 있는 누구에게나 전체 관리자 권한이 부여됩니다. 신뢰할 수 있는 환경에서만 사용하세요.
:::

## 기본 역할 {#built-in-roles}

SnapOtter에는 기본 역할 3개가 포함됩니다. 이들은 수정하거나 삭제할 수 없습니다.

### Admin {#admin}

17개 권한 전부. 인스턴스에 대한 완전한 제어.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7개 권한. 모든 도구를 사용하고 모든 파일과 파이프라인을 관리할 수 있으나 관리자 기능에는 접근할 수 없습니다.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5개 권한. 도구를 사용하고 자신의 리소스를 관리할 수 있습니다.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## 권한 참조 {#permissions-reference}

| Permission | Description |
|---|---|
| `tools:use` | 모든 처리 도구 사용 |
| `files:own` | 자신의 파일 조회 및 관리 |
| `files:all` | 모든 사용자의 파일 조회 및 관리 |
| `apikeys:own` | 자신의 API 키 생성 및 관리 |
| `apikeys:all` | 모든 사용자의 API 키 조회 |
| `pipelines:own` | 자신의 파이프라인 생성 및 관리 |
| `pipelines:all` | 모든 사용자의 파이프라인 조회 및 관리 |
| `settings:read` | 인스턴스 설정 조회 |
| `settings:write` | 인스턴스 설정 수정 |
| `users:manage` | 사용자 계정 생성, 업데이트, 삭제 |
| `teams:manage` | 팀 생성, 업데이트, 삭제 |
| `features:manage` | AI 기능 번들 설치 및 관리 |
| `system:health` | 상태 및 준비 엔드포인트 접근 |
| `audit:read` | 감사 로그 조회 및 역할 목록 조회 |
| `compliance:manage` | GDPR 라이프사이클 및 규정 준수 기능 관리 |
| `webhooks:manage` | 아웃바운드 웹훅 구성 |
| `security:manage` | 보안 설정 관리(IP 허용 목록, SSO 강제) |

## 커스텀 역할 {#custom-roles}

`security:manage` 권한을 가진 관리자는 관리자 패널이나 역할 API를 통해 커스텀 역할을 생성할 수 있습니다. 역할 목록 조회에는 `audit:read`이 필요합니다.

### 커스텀 역할 생성 {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

역할 이름은 2~30자여야 하며, 하이픈과 밑줄을 포함한 소문자 영숫자여야 합니다.

### 관리자 전용 예약 권한 {#admin-reserved-permissions}

세 개의 권한은 기본 역할에 예약되어 있어 커스텀 역할에 할당할 수 없습니다:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

역할 API는 이 권한들을 포함하는 모든 요청을 거부합니다. 기본 `admin` 역할만 이들에 접근할 수 있습니다.

### 도구 수준 권한 {#tool-level-permissions}

커스텀 역할은 선택적으로 사용자가 접근할 수 있는 도구를 제한할 수 있습니다. 두 가지 모드를 사용할 수 있습니다:

| Mode | Behavior | License requirement |
|---|---|---|
| `category` | 모달리티(image, video, audio, document, file)별 제한 | 없음(무료) |
| `tool` | 개별 도구 ID별 제한 | `per_tool_permissions` 엔터프라이즈 기능 필요 |

`tool` 모드가 설정되었으나 엔터프라이즈 기능을 사용할 수 없는 경우, SnapOtter는 우아하게 저하되어 모든 도구에 대한 접근을 허용합니다.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### 커스텀 역할 삭제 {#deleting-a-custom-role}

커스텀 역할이 삭제되면, 그 역할에 배정된 모든 사용자가 자동으로 `user` 역할로 재배정됩니다.

## 팀 {#teams}

팀은 스토리지 및 보존 관리를 위해 사용자를 그룹화합니다. 첫 시작 시 `Default` 팀이 생성됩니다.

| Field | Type | Description |
|---|---|---|
| `name` | string | 고유한 팀 이름(1~50자) |
| `storageQuota` | number | 팀별 스토리지 한도(바이트 단위, 엔터프라이즈 없이 작동) |
| `retentionHours` | number | 이 시간(시간 단위) 이후 출력 자동 삭제(`team_retention_overrides` 필요, 엔터프라이즈) |
| `legalHold` | boolean | 팀 구성원 파일의 자동 삭제 방지(`legal_hold` 필요, 엔터프라이즈) |

::: info 
`Default` 팀은 삭제할 수 없습니다. 여전히 구성원이 있는 팀은 삭제할 수 없습니다. 먼저 구성원을 재배정하세요.
:::

## API 키 {#api-keys}

사용자는 프로그래매틱 접근을 위해 API 키를 생성할 수 있습니다. 각 키는 `si_` 접두사를 사용하며 생성 시 단 한 번만 표시됩니다.

### 스코프 권한 {#scoped-permissions}

API 키는 선택적으로 `permissions` 배열을 가질 수 있습니다. 설정되면, 요청에 대한 유효 권한은 사용자 역할 권한과 키의 스코프 권한의 **교집합**입니다. 즉, API 키는 사용자 자신의 권한을 넘어 상승할 수 없습니다.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### 만료 {#expiration}

키는 선택적 `expiresAt` 타임스탬프를 받습니다. 만료된 키는 인증 시점에 거부됩니다.

## 감사 로그 {#audit-log}

SnapOtter는 보안 관련 이벤트를 `audit_log` 데이터베이스 테이블에 저장된 구조화된 감사 로그에 기록합니다.

### 감사 로그 조회 {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

`audit:read` 권한이 필요합니다. 페이지네이션(`page`, `limit`)과 필터(`action`, `ip`, `from`, `to`)를 지원합니다.

### 도구 작업 감사 {#tool-operation-auditing}

::: warning 
`TOOL_EXECUTED` 이벤트는 기본적으로 로깅되지 **않습니다**. 두 경로 중 하나를 통해 옵트인됩니다:

1. `auditToolOperations` 관리자 설정을 `true`으로 설정합니다.
2. `audit_export` 기능(팀 및 엔터프라이즈 플랜 모두에서 사용 가능)이 포함된 활성 라이선스를 보유합니다.

이 중 하나가 없으면 개별 도구 실행은 감사 로그에 기록되지 않습니다.
:::

### 내보내기 {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

`audit:read` 권한과 `audit_export` 엔터프라이즈 기능(팀 및 엔터프라이즈 플랜 모두에서 사용 가능)이 필요합니다. CSV 및 JSON 형식을 지원하며, `action`, `actorId`, `targetType`, `targetId`, `from`, `to`로 필터링합니다.

### 변조 방지 서명 {#tamper-resistant-signing}

활성화되면 각 감사 로그 항목은 `DATA_ENCRYPTION_KEY`에서 파생된 HMAC로 서명됩니다. 이를 위해서는:

1. 환경에 `DATA_ENCRYPTION_KEY`을 설정합니다.
2. `tamperResistantAudit` 관리자 설정을 활성화합니다.
3. `tamper_resistant_audit` 기능이 포함된 엔터프라이즈 라이선스가 필요합니다.

### 보존 {#retention}

오래된 항목을 자동으로 정리하려면 `AUDIT_RETENTION_DAYS`을 설정하세요. 기본값은 `0`이며, 이는 항목이 무기한 보관됨을 의미합니다.

### 이벤트 참조 {#event-reference}

| Event | Category |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Authentication |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Authentication |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Authentication |
| `LOGOUT` | Authentication |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | User management |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | User management |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Roles |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API keys |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Settings |
| `FILE_UPLOADED`, `FILE_DELETED` | Files |
| `TOOL_EXECUTED` | Tools (opt-in) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Compliance |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Compliance |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuration |

## 세션 관리 {#session-management}

세션은 쿠키 기반이며 `SESSION_DURATION_HOURS`(기본값: 168시간 / 7일)으로 제어됩니다.

### 역할 변경은 세션을 무효화합니다 {#role-changes-invalidate-sessions}

관리자가 사용자의 역할을 변경하면, 그 사용자의 모든 활성 세션이 삭제됩니다. 사용자는 새 권한을 적용받으려면 다시 로그인해야 합니다.

### 안전장치 {#safety-guards}

- **마지막 관리자 보호**: 마지막으로 남은 관리자는 더 낮은 역할로 강등될 수 없습니다. 시도하면 API가 오류를 반환합니다.
- **자기 삭제 방지**: 관리자는 API를 통해 자신의 계정을 삭제할 수 없습니다.
