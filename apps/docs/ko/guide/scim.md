---
description: "SCIM 2.0 프로비저닝을 설정하여 사용자와 그룹을 아이덴티티 공급자에서 SnapOtter로 동기화합니다. Okta, Azure AD / Entra ID, 사용자 지정 통합을 다룹니다."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: c1a55eda8da8
---

# SCIM 프로비저닝 {#scim-provisioning}

SnapOtter는 자동화된 사용자 및 그룹 프로비저닝을 위해 SCIM 2.0(System for Cross-domain Identity Management)을 구현합니다. 아이덴티티 공급자가 사용자 계정을 생성, 업데이트, 비활성화, 재활성화하고 그룹 멤버십을 자동으로 동기화할 수 있습니다.

::: tip 엔터프라이즈 기능
SCIM 프로비저닝에는 `scim` 기능이 포함된 **엔터프라이즈** 라이선스가 필요합니다. team 플랜에서는 사용할 수 없습니다. 이 기능이 없으면 모든 SCIM 엔드포인트(디스커버리 제외)는 403을 반환합니다.
:::

## 사전 요구 사항 {#prerequisites}

- 공개 URL에서 접근할 수 있는 실행 중인 SnapOtter 인스턴스
- `scim` 기능이 포함된 엔터프라이즈 라이선스 키
- SnapOtter에 대한 관리자 접근 권한(SCIM 토큰을 생성하거나 취소하려면 `users:manage` 권한이 필요합니다)
- 아이덴티티 공급자의 프로비저닝 설정에 대한 관리자 접근 권한

## 빠른 시작 {#quick-start}

1. SCIM 베어러 토큰을 생성합니다:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

응답에 토큰이 포함되어 있습니다. 즉시 저장하세요. 다시 조회할 수 없습니다.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. 아이덴티티 공급자에서 다음 값으로 SCIM 프로비저닝을 구성합니다:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **인증**: 베어러 토큰(1단계에서 생성한 토큰을 붙여넣기)

## 인증 {#authentication}

SCIM 엔드포인트는 사용자 세션 및 API 키와는 별도인 전용 베어러 토큰을 사용합니다.

### 토큰 생성 {#generating-a-token}

`POST /api/v1/enterprise/scim/token` 는 새 SCIM 토큰을 생성합니다. 이 엔드포인트에는 `users:manage` 권한이 있는 유효한 세션이 필요합니다.

토큰은 정확히 한 번만 평문으로 반환됩니다. SnapOtter는 scrypt 해시만 저장합니다. 토큰을 분실하면 취소하고 새로 생성하세요.

한 번에 하나의 SCIM 토큰만 활성화됩니다. 새 토큰을 생성하면 이전 토큰이 대체됩니다.

### 토큰 취소 {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` 는 현재 SCIM 토큰을 취소합니다. 이 엔드포인트에도 `users:manage` 권한이 필요합니다.

### 속도 제한 {#rate-limiting}

SCIM 엔드포인트는 토큰당 분당 1000개 요청으로 속도가 제한됩니다. 이 한도를 초과하면 HTTP 429를 반환합니다.

## 지원되는 리소스 {#supported-resources}

| SCIM 리소스 | SnapOtter 개념 | 생성 | 읽기 | 업데이트 | 삭제 |
|---|---|---|---|---|---|
| User | 사용자 계정 | 예 | 예 | 예 | 소프트 삭제 |
| Group | 팀 | 예 | 예 | 예 | 예 |

::: warning 
SCIM 그룹은 역할이 아니라 SnapOtter **팀**에 매핑됩니다. SCIM은 사용자의 역할을 설정할 수 없습니다. SCIM을 통해 생성된 모든 사용자에게는 `user` 역할이 할당됩니다. 사용자의 역할을 변경하려면 SnapOtter 관리자 UI를 사용하세요.
:::

## 사용자 작업 {#user-operations}

### 사용자 생성 {#create-user}

`POST /api/v1/scim/v2/Users`

`authProvider` 를 `scim` 로 설정하고 `user` 역할을 부여한 새 사용자 계정을 생성합니다. 사용자는 Default 팀에 할당됩니다. `active` 가 `false` 이면 역할이 대신 `disabled` 로 설정됩니다.

필수 속성: `userName`. 선택 속성: `externalId`, `emails`, `active`(기본값 `true`).

### 사용자 목록 조회 및 필터링 {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

사용자의 페이지네이션된 목록을 반환합니다. `startIndex` 및 `count` 쿼리 파라미터를 지원합니다(페이지당 최대 200개 결과).

필터링은 다음 속성에 대해 `eq`(같음)만 지원합니다:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

다른 필터 연산자와 속성은 HTTP 400을 반환합니다.

### 사용자 조회 {#get-user}

`GET /api/v1/scim/v2/Users/:id`

SnapOtter 사용자 ID로 단일 사용자를 반환합니다.

### 사용자 교체 {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

사용자의 속성을 교체합니다. `userName`, `externalId`, `emails`, `active` 를 지원합니다. 사용자 이름 변경 시 충돌 여부를 확인합니다(새 사용자 이름이 다른 사용자가 사용 중이면 409).

### 사용자 패치 {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

SCIM PatchOp를 사용한 부분 업데이트. 지원되는 작업:

| 작업 | 경로 |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | `replace` 와 동일 |
| `remove` | `externalId`, `emails` |

`name.formatted` 및 `displayName` 경로는 호환성을 위해 허용되지만 영속적인 효과는 없습니다(SnapOtter는 별도의 표시 이름을 저장하지 않습니다).

값이 없는 `replace` 작업(값이 `path` 없이 객체인 경우)도 `userName`, `externalId`, `emails`, `active` 키와 함께 지원됩니다.

### 사용자 비활성화(소프트 삭제) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter는 SCIM을 통해 사용자를 하드 삭제하지 않습니다. 대신 DELETE는 소프트 비활성화를 수행합니다:

1. 사용자의 역할이 현재 값(예: `editor`)에서 `disabled:editor` 으로 변경되어 원래 역할을 보존합니다.
2. 사용자의 비밀번호가 지워집니다.
3. 모든 활성 세션이 취소됩니다.
4. 모든 API 키가 취소됩니다.

사용자는 더 이상 로그인하거나 어떤 API 키도 사용할 수 없습니다. 사용자의 데이터(파일, 기록)는 유지됩니다.

### 사용자 재활성화 {#reactivate-user}

이전에 비활성화된 사용자를 재활성화하려면 `active: true` 값과 함께 `PUT` 또는 `PATCH` 요청을 보냅니다. SnapOtter는 비활성화 이전의 원래 역할을 복원합니다(예: `disabled:editor` 가 다시 `editor` 이 됩니다). 원래 역할을 확인할 수 없으면 `user` 로 대체됩니다.

::: details 예시: PATCH를 통한 비활성화 및 재활성화
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

## 그룹 작업 {#group-operations}

SCIM 그룹은 SnapOtter 팀에 매핑됩니다. 그룹을 생성하면 팀이 생성됩니다. 그룹 멤버십은 사용자가 속한 팀을 제어합니다.

### 그룹 생성 {#create-group}

`POST /api/v1/scim/v2/Groups`

필수: `displayName`. 선택: `members`(`{ value: userId }` 의 배열).

### 그룹 목록 조회 및 필터링 {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

필터링은 `displayName eq "..."` 만 지원합니다. `startIndex` 및 `count` 로 페이지네이션됩니다(페이지당 최대 200개 결과).

### 그룹 조회 {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### 그룹 교체 {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

그룹 이름과 전체 멤버십 목록을 교체합니다. 새 목록에 없는 기존 멤버는 Default 팀으로 이동됩니다.

### 그룹 패치 {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

다음 작업을 지원합니다:

| 작업 | 경로 | 효과 |
|---|---|---|
| `add` | `members` | 사용자를 팀에 추가 |
| `remove` | `members[value eq "userId"]` | 사용자를 Default 팀으로 이동 |
| `replace` | `displayName` | 팀 이름 변경 |
| `replace` | `members` | 모든 멤버 교체(제거된 멤버는 Default 팀으로 이동) |

### 그룹 삭제 {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

팀을 삭제합니다. 삭제된 팀의 모든 멤버는 Default 팀으로 이동됩니다. 사용자는 비활성화되거나 삭제되지 않습니다.

## IdP 설정 {#idp-setup}

### Okta {#okta}

1. Okta 관리자 콘솔에서 SnapOtter 애플리케이션을 엽니다(또는 새로 생성합니다).
2. **Provisioning** 탭으로 이동하여 **Configure API Integration**을 클릭합니다.
3. **Enable API Integration**을 체크하고 다음을 입력합니다:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: 위에서 생성한 SCIM 베어러 토큰
4. **Test API Credentials**를 클릭한 다음 **Save**를 클릭합니다.
5. **Provisioning > To App**에서 다음을 활성화합니다:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. **Push Groups**에서 어떤 Okta 그룹을 SnapOtter 팀으로 동기화할지 구성합니다.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Azure 포털에서 SnapOtter 엔터프라이즈 애플리케이션으로 이동합니다.
2. **Provisioning**으로 이동하여 **Provisioning Mode**를 **Automatic**으로 설정합니다.
3. **Admin Credentials**에서 다음을 입력합니다:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: 위에서 생성한 SCIM 베어러 토큰
4. **Test Connection**을 클릭한 다음 **Save**를 클릭합니다.
5. **Mappings**에서 사용자 및 그룹 속성 매핑을 구성합니다. 기본값이 대개 잘 작동하지만, `userName` 가 원하는 대로 `userPrincipalName` 또는 `mail` 로 매핑되는지 확인하세요.
6. **Provisioning Status**를 **On**으로 설정하고 저장합니다.

Azure는 고정된 동기화 주기(일반적으로 40분마다)로 사용자와 그룹을 프로비저닝합니다.

## 디스커버리 엔드포인트 {#discovery-endpoints}

다음 세 엔드포인트는 인증 없이 사용할 수 있으며 SCIM 서버의 기능을 설명합니다:

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | 서버 기능 및 지원되는 특성 |
| `GET /api/v1/scim/v2/Schemas` | User 및 Group 스키마 정의 |
| `GET /api/v1/scim/v2/ResourceTypes` | 사용 가능한 리소스 유형(User, Group) |

`ServiceProviderConfig` 는 다음 기능을 알립니다:

| 특성 | 지원 여부 |
|---|---|
| Patch | 예 |
| Bulk | 아니오 |
| Filter | 예(최대 200개 결과, `eq` 연산자만) |
| Change password | 아니오 |
| Sort | 아니오 |
| ETag | 아니오 |

## 제한 사항 {#limitations}

- **필터링**: `eq` 연산자만 지원됩니다. 복합 필터, `and`/`or` 연산자, `co`(포함), `sw`(로 시작)는 구현되지 않았습니다.
- **벌크 작업**: 지원되지 않습니다.
- **Sort 및 ETag**: 지원되지 않습니다.
- **역할**: SCIM은 SnapOtter 역할을 할당할 수 없습니다. 프로비저닝된 모든 사용자는 `user` 역할을 받습니다.
- **MAX_USERS**: `MAX_USERS` 환경 변수 한도는 SCIM 사용자 생성에 적용되지 않습니다. 사용자 수를 제한하려면 IdP에서 할당을 관리하세요.
- **단일 토큰**: 한 번에 하나의 SCIM 토큰만 활성화할 수 있습니다. 여러 IdP가 SCIM 접근이 필요한 경우 토큰을 공유해야 합니다.
- **그룹은 팀**: SCIM 그룹은 역할이나 권한 그룹이 아니라 팀에 대응됩니다.

## 문제 해결 {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

라이선스에 `scim` 기능이 포함되어 있지 않거나 라이선스가 구성되지 않았습니다. SCIM에는 엔터프라이즈 플랜 라이선스가 필요합니다. `SNAPOTTER_LICENSE_KEY` 가 설정되어 있고 라이선스에 `scim` 기능이 포함되어 있는지 확인하세요.

### 401 "Bearer token required" {#_401-bearer-token-required}

SCIM 요청에 `Authorization: Bearer <token>` 헤더가 포함되지 않았습니다. IdP의 프로비저닝 구성을 확인하세요.

### 401 "Invalid token" {#_401-invalid-token}

토큰이 저장된 해시와 일치하지 않습니다. 토큰이 취소되고 다시 생성된 경우 발생합니다. IdP의 프로비저닝 설정에서 토큰을 업데이트하세요.

### 401 "SCIM not configured" {#_401-scim-not-configured}

아직 SCIM 토큰이 생성되지 않았습니다. `POST /api/v1/enterprise/scim/token` 엔드포인트를 사용해 토큰을 생성하세요.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

동일한 사용자 이름을 가진 사용자가 이미 존재합니다. IdP가 실패한 생성을 재시도할 때 발생할 수 있습니다. SnapOtter 관리자 패널에서 중복된 사용자 이름을 확인하세요.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP가 분당 1000개를 초과하는 요청을 보내고 있습니다. 일반적으로 대규모 초기 동기화 중에 발생합니다. 대부분의 IdP는 속도 제한 창이 재설정된 후 자동으로 재시도합니다. 문제가 지속되면 IdP의 프로비저닝 동기화 간격을 확인하세요.

### 사용자가 프로비저닝 해제되었지만 UI에서 제거되지 않음 {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE는 소프트 비활성화입니다. 비활성화된 사용자는 여전히 비활성 상태로 관리자 사용자 목록에 표시됩니다. 이는 데이터를 보존하기 위한 의도된 설계입니다. 해당 사용자의 역할은 `disabled:<original-role>` 로 표시됩니다.
