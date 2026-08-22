---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: baabbfa6c423
i18n_hash_version: 2
---
# 계정 복구 {#account-recovery}

SnapOtter에서 로그인할 수 없게 된 경우(대부분 더 이상 충족할 수 없는 MFA 정책
때문), 데이터베이스 클라이언트 없이 컨테이너 내부에서 복구할 수 있습니다. 복구 명령은
오프라인으로 동작하며 컨테이너에 대한 셸 접근이 필요한데, 이는 이미 인스턴스에 대한
완전한 제어 권한을 의미합니다.

## 어떤 벽에 막힌 걸까요? {#which-wall-am-i-hitting}

SnapOtter의 로그인은 두 개의 독립적인 MFA 관문을 적용합니다. 먼저 진단하세요:

```bash
docker exec -it snapotter snapotter-admin status
```

이 명령은 현재 MFA 정책과 어떤 사용자가 TOTP를 등록했는지 출력합니다.

- **"로그인하기 전에 MFA 등록이 필요합니다"(그리고 앱을 설정한 적이 없는 경우):**
  정책은 MFA를 요구하지만 등록이 되어 있지 않은 상태입니다. 정책을 완화하세요.
- **생성할 수 없는 코드를 입력하라고 요구받는 경우**(휴대폰과 복구 코드를 모두
  잃어버린 경우): 계정이 등록되어 있는 상태입니다. 해당 등록을 해제하세요.

## MFA 정책 완화 {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

이 명령은 정책을 `optional`(으)로 되돌립니다. 다음 로그인 시 재시작 없이 적용됩니다.
항상 `optional`만 설정하므로, 적용을 다시 켤 수는 없습니다.

## 특정 사용자의 TOTP 등록 해제 {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

정책이 여전히 해당 사용자에게 MFA를 요구한다면, 다음에는 등록 벽에 막히게 되므로
`reset-mfa-policy`도 실행한 뒤 로그인하고 설정에서 다시 등록하세요.

## 이전 이미지와 대체 방법 {#older-images-and-fallbacks}

`snapotter-admin` 래퍼가 존재하기 전에 빌드된 이미지에서는 스크립트를
직접 호출하세요:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

어떤 버전에서든 최후의 수단으로 데이터베이스에서 정책을 설정하세요. 올인원
이미지에서는 Postgres가 컨테이너 내부에서 실행됩니다:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

멀티 컨테이너 설정에서는 `psql`을(를) 대신 사용자의 `DATABASE_URL`(으)로 지정하세요.

## MFA가 아니라 SSO에서 막혔나요? {#locked-out-of-sso-not-mfa}

강제된 SSO 로그인이 실패하는 경우, 대신 비상용 로컬 계정을 사용하세요:
SSO를 강제하기 전에 설정 > 보안에서 `ssoBreakGlassUsername`을(를) 로컬 관리자로 설정하고,
해당 계정의 비밀번호로 로그인하세요.
