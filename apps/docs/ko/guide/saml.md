---
description: "SnapOtter에 SAML 2.0 싱글 사인온을 설정하세요. Okta, Azure AD / Entra ID, Google Workspace 및 기타 SAML ID 공급자에 대한 단계별 가이드입니다."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 5a68f1258299
---

# SAML SSO {#saml-sso}

SnapOtter는 싱글 사인온을 위해 SAML 2.0을 지원합니다. 사용자는 로컬 사용자 이름/비밀번호 인증 대신 외부 ID 공급자(Okta, Azure AD / Entra ID, Google Workspace 또는 표준 SAML 2.0 IdP)를 통해 로그인할 수 있습니다.

::: tip 엔터프라이즈 기능
SAML SSO에는 `saml_sso` 기능을 포함하는 **team** 또는 **enterprise** 라이선스가 필요합니다. 유효한 라이선스 없이 `SAML_ENABLED=true`가 설정되면, SAML 라우트가 조용히 건너뛰어지고 경고가 로깅됩니다.
:::

## Prerequisites {#prerequisites}

- 공개 URL로 접근할 수 있는 실행 중인 SnapOtter 인스턴스
- 해당 공개 URL로 설정된 `EXTERNAL_URL`(예: `https://photos.example.com`)
- `saml_sso` 기능이 포함된 team 또는 enterprise 라이선스 키
- SAML ID 공급자에 대한 관리자 접근 권한

## Quick start {#quick-start}

`docker-compose.yml`에 다음 환경 변수를 추가하세요:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

컨테이너를 재시작하세요. 로그인 페이지에 "Sign in with SAML" 버튼(또는 `SAML_PROVIDER_NAME`로 설정한 레이블)이 나타납니다.

## Configuration reference {#configuration-reference}

| Variable | Default | Description |
|---|---|---|
| `SAML_ENABLED` | `false` | SAML 로그인을 활성화합니다. |
| `SAML_IDP_SSO_URL` | | IdP의 SSO 엔드포인트 URL. SAML이 활성화되면 **필수**. |
| `SAML_IDP_CERTIFICATE` | | PEM 형식의 IdP X.509 서명 인증서(파일 경로가 아니라 인증서 텍스트 자체). SAML이 활성화되면 **필수**. |
| `EXTERNAL_URL` | | SnapOtter에 접근할 수 있는 공개 URL. SAML이 활성화되면 **필수**. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | IdP로 전송되는 SP Entity ID / Audience URI. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion Consumer Service(ACS) URL. |
| `SAML_AUTO_CREATE_USERS` | `true` | 첫 SAML 로그인 시 로컬 사용자 계정을 자동으로 생성합니다. |
| `SAML_AUTO_LINK_USERS` | `false` | 이메일 주소가 일치하면 SAML ID를 기존 로컬 사용자에 연결합니다. |
| `SAML_DEFAULT_ROLE` | `user` | 자동 생성된 SAML 사용자에게 할당되는 역할. `admin`, `editor`, `user` 중 하나. |
| `SAML_PROVIDER_NAME` | | 프런트엔드의 SAML 로그인 버튼에 표시되는 레이블(예: "Okta", "Azure AD"). 비어 있으면 버튼에 "SAML"이라고 표시됩니다. |
| `SAML_USERNAME_ATTRIBUTE` | | 사용자 이름으로 사용되는 SAML assertion 속성. 비어 있으면 이메일의 local-part로, 그다음 NameID로 대체됩니다. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | 사용자의 이메일 주소로 사용되는 SAML assertion 속성. |

`SAML_ENABLED=true`이면서 세 가지 필수 변수(`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) 중 하나라도 누락되면 서버가 시작을 거부합니다.

::: details 보안 참고 사항
`wantAuthnResponseSigned`와 `wantAssertionsSigned`는 모두 `true`로 하드코딩되어 있습니다. SnapOtter는 서명되지 않았거나 부적절하게 서명된 SAML 응답을 거부합니다. 신뢰할 수 있는 IdP의 assertion은 이메일이 검증된 것으로 취급됩니다.

SP-initiated 로그인만 지원됩니다. SnapOtter는 IdP-initiated(요청하지 않은) 로그인이나 Single Logout(SLO)을 지원하지 않습니다. SnapOtter에서 로그아웃해도 IdP에서 사용자가 로그아웃되지는 않습니다.
:::

## SP metadata and URLs {#sp-metadata-and-urls}

IdP는 SnapOtter로부터 세 가지 값이 필요합니다:

| Field | Value |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

예를 들어 `EXTERNAL_URL`가 `https://photos.example.com`라면:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Metadata endpoint: `https://photos.example.com/api/auth/saml/metadata` (XML을 반환)

일부 IdP는 SP metadata URL을 직접 가져올 수 있으며, 이는 ACS URL과 Entity ID를 자동으로 채웁니다.

## Provider setup {#provider-setup}

### Okta {#okta}

1. Okta 관리자 콘솔에서 **Applications > Create App Integration**으로 이동합니다.
2. **SAML 2.0**을 선택하고 **Next**를 클릭합니다.
3. 이름을 설정하고(예: "SnapOtter") **Next**를 클릭합니다.
4. SAML 설정을 구성합니다:
   - **Single sign-on URL**: ACS URL(예: `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Entity ID(예: `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. **Attribute Statements**에서 `email`을 `user.email`에 매핑하여 추가합니다.
6. **Next**를 클릭한 다음 **Finish**를 클릭합니다.
7. **Sign On** 탭으로 이동하여 **View SAML setup instructions**를 클릭하고 다음을 복사합니다:
   - **Identity Provider Single Sign-On URL**을 `SAML_IDP_SSO_URL`로
   - **X.509 Certificate**를 `SAML_IDP_CERTIFICATE`으로

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Azure 포털에서 **Microsoft Entra ID > Enterprise applications > New application**으로 이동합니다.
2. **Create your own application**을 클릭하고 "SnapOtter"라고 이름을 지정한 다음 **Integrate any other application you don't find in the gallery**를 선택합니다.
3. **Single sign-on > SAML**로 이동하여 **Basic SAML Configuration** 섹션에서 **Edit**를 클릭합니다:
   - **Identifier (Entity ID)**: Entity ID(예: `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: ACS URL(예: `https://photos.example.com/api/auth/saml/callback`)
4. **SAML Certificates**에서 **Certificate (Base64)**를 다운로드합니다.
5. **Set up SnapOtter**에서 **Login URL**을 복사합니다.
6. `SAML_IDP_SSO_URL`을 Login URL로, `SAML_IDP_CERTIFICATE`를 다운로드한 인증서 내용으로 설정합니다.
7. **Users and groups**에서 사용자 또는 그룹을 애플리케이션에 할당합니다.

### Google Workspace {#google-workspace}

1. Google 관리 콘솔에서 **Apps > Web and mobile apps > Add app > Add custom SAML app**으로 이동합니다.
2. 앱 이름을 "SnapOtter"로 지정하고 **Continue**를 클릭합니다.
3. **Google Identity Provider details** 페이지에서 **SSO URL**을 복사하고 **Certificate**를 다운로드합니다. **Continue**를 클릭합니다.
4. Service Provider 세부 정보를 구성합니다:
   - **ACS URL**: ACS URL(예: `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Entity ID(예: `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. **Continue**를 클릭한 다음 **Finish**를 클릭합니다.
6. 조직 단위에 대해 앱을 **ON**으로 전환합니다.
7. `SAML_IDP_SSO_URL`을 3단계의 SSO URL로, `SAML_IDP_CERTIFICATE`을 다운로드한 인증서 내용으로 설정합니다.

### Generic SAML 2.0 IdP {#generic-saml-2-0-idp}

모든 SAML 2.0 호환 ID 공급자에 대해:

1. IdP에서 새 SAML 애플리케이션/서비스 공급자를 생성합니다.
2. **ACS URL**을 `${EXTERNAL_URL}/api/auth/saml/callback`로 설정합니다.
3. **Entity ID** / **Audience**를 `${EXTERNAL_URL}/api/auth/saml/metadata`으로 설정합니다.
4. `email`이라는 속성으로 사용자의 이메일을 보내도록 IdP를 구성합니다(또는 IdP의 속성 이름과 일치하도록 `SAML_EMAIL_ATTRIBUTE`를 설정).
5. **IdP SSO URL**과 **signing certificate**를 `SAML_IDP_SSO_URL`과 `SAML_IDP_CERTIFICATE`에 복사합니다.

## User provisioning {#user-provisioning}

### Auto-create {#auto-create}

`SAML_AUTO_CREATE_USERS`가 `true`일 때(기본값), 누군가 SAML로 처음 로그인하면 로컬 사용자 계정이 생성됩니다. 역할은 `SAML_DEFAULT_ROLE`로 설정됩니다.

사용자 이름은 다음 순서로 결정됩니다:

1. `SAML_USERNAME_ATTRIBUTE`로 지정된 assertion 속성의 값(설정되어 있고 존재하는 경우)
2. 이메일 주소의 local-part(`@` 앞의 모든 부분)
3. SAML NameID

사용자 이름 충돌이 발생하면 숫자 접미사가 추가됩니다(예: `jane`이 `jane_2`이 됨).

### Auto-link {#auto-link}

`SAML_AUTO_LINK_USERS`가 `true`일 때, SnapOtter는 이메일 주소가 일치하면 SAML ID를 기존 로컬 계정에 연결합니다. 사용자 계정을 미리 생성해 두고, 데이터를 잃지 않으면서 SSO를 사용하기 시작하도록 하려는 경우에 유용합니다.

::: warning 
SAML IdP가 이메일 주소를 검증한다고 신뢰하는 경우에만 auto-link를 활성화하세요. 잘못 구성된 IdP의 검증되지 않은 이메일은 누군가가 다른 사용자의 계정을 탈취하도록 허용할 수 있습니다.
:::

### Attribute mapping {#attribute-mapping}

| SnapOtter field | Source | Configuration |
|---|---|---|
| Email | Assertion attribute | `SAML_EMAIL_ATTRIBUTE` (default: `email`) |
| Username | Assertion attribute, email, or NameID | `SAML_USERNAME_ATTRIBUTE` (위의 결정 순서 참고) |
| External ID | NameID | 항상 SAML NameID, 구성 불가 |

## SSO enforcement {#sso-enforcement}

모든 사용자가 SAML(또는 OIDC)을 통해 로그인하도록 요구하고 로컬 비밀번호 로그인을 차단하려면 SSO enforcement를 활성화하세요:

1. `sso_enforcement` 엔터프라이즈 기능에 라이선스가 있는지 확인합니다(team 및 enterprise 플랜에서 사용 가능).
2. **Admin Settings > Security**에서 **SSO Enforcement**를 켭니다.
3. **break-glass username**을 설정합니다: 이것은 IdP에 접근할 수 없을 때 긴급 접근을 위해 여전히 비밀번호로 로그인할 수 있는 하나의 로컬 계정입니다.

SSO enforcement가 활성화되면, break-glass 사용자를 제외한 모든 로컬 로그인 시도는 "Local password login is disabled. Please use SSO." 메시지와 함께 403 오류를 반환합니다.

::: tip 
SSO enforcement를 활성화하기 전에 항상 break-glass username을 구성하세요. 그렇지 않으면 IdP가 다운될 경우 SnapOtter에서 잠길 수 있습니다.
:::

## Using SAML alongside OIDC {#using-saml-alongside-oidc}

SAML과 OIDC를 동시에 활성화할 수 있습니다. 둘 다 활성화되면, 로그인 페이지에 각 공급자에 대한 별도의 버튼이 표시됩니다(`SAML_PROVIDER_NAME`과 `OIDC_PROVIDER_NAME`로 레이블 지정됨). 사용자는 어느 방식으로든 로그인할 수 있습니다.

두 공급자는 auto-create, auto-link, SSO enforcement 설정을 각각 독립적으로 공유합니다: 각각 고유한 `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS`, `*_DEFAULT_ROLE` 변수를 가집니다.

## Troubleshooting {#troubleshooting}

### Assertion validation failed {#assertion-validation-failed}

SAML 응답 서명 또는 assertion 서명을 검증할 수 없습니다. 다음을 확인하세요:

- `SAML_IDP_CERTIFICATE`의 인증서가 IdP의 현재 서명 인증서와 일치하는지(인증서는 교체되므로 만료 여부를 확인하세요)
- 인증서가 PEM 형식인지(`-----BEGIN CERTIFICATE-----`로 시작)
- 인증서가 파일 경로가 아니라 전체 텍스트인지
- IdP에 구성된 ACS URL과 Entity ID가 SnapOtter의 값과 정확히 일치하는지(스킴, 호스트, 포트, 경로)

### Missing attributes {#missing-attributes}

로그인 후 사용자 이름이나 이메일이 비어 있다면, IdP가 기대하는 속성을 보내지 않을 수 있습니다. 다음을 확인하세요:

- IdP가 `email` 속성(또는 `SAML_EMAIL_ATTRIBUTE`에 설정된 값)을 릴리스하도록 구성되어 있는지
- `SAML_USERNAME_ATTRIBUTE`을 사용하는 경우, 해당 속성이 assertion에 포함되어 있는지 확인
- 일부 IdP는 클레임을 릴리스하기 전에 명시적인 속성 매핑 구성이 필요합니다

### Clock skew {#clock-skew}

SAML assertion에는 타임스탬프 조건(`NotBefore`, `NotOnOrAfter`)이 포함됩니다. 서버 시계와 IdP 시계가 동기화되지 않으면 assertion 검증이 실패합니다. 시계를 맞추기 위해 두 머신 모두에서 NTP를 실행하세요.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

이 경고는 `SAML_ENABLED=true`이지만 라이선스에 `saml_sso` 기능이 포함되지 않은 경우 서버 로그에 나타납니다. 라이선스 키와 플랜을 확인하세요. `saml_sso` 기능은 team 및 enterprise 플랜에서 사용할 수 있습니다.

### Login redirects back with error {#login-redirects-back-with-error}

SAML 로그인 버튼을 클릭하면 오류와 함께 로그인 페이지로 다시 리디렉션되는 경우, 자세한 내용은 서버 로그를 확인하세요. 흔한 원인은 다음과 같습니다:

- IdP SSO URL에 서버에서 접근할 수 없음
- IdP가 인증 요청을 거부함(IdP의 감사 로그를 확인하세요)
- IdP가 서명되지 않은 응답을 반환함(SnapOtter는 응답과 assertion 모두 서명되어야 합니다)
