---
description: "ตั้งค่า Single Sign-On ด้วย OpenID Connect คู่มือทีละขั้นตอนสำหรับ Keycloak, Authentik, Google และผู้ให้บริการ OIDC อื่น ๆ"
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: cf303e97a8f0
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter รองรับ OpenID Connect (OIDC) สำหรับ single sign-on ผู้ใช้สามารถเข้าสู่ระบบด้วยผู้ให้บริการข้อมูลประจำตัวภายนอกอย่าง Keycloak, Authentik หรือ Google แทน (หรือควบคู่ไปกับ) การยืนยันตัวตนด้วยชื่อผู้ใช้/รหัสผ่านในเครื่อง

::: tip ดูเพิ่มเติม
[SAML SSO](/th/guide/saml) | [SCIM Provisioning](/th/guide/scim) | [ผู้ใช้ บทบาท และสิทธิ์](/th/guide/users-roles)
:::

## เริ่มต้นอย่างรวดเร็ว {#quick-start}

เพิ่มตัวแปรสภาพแวดล้อมเหล่านี้ลงใน `docker-compose.yml` ของคุณ:

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

redirect URI สำหรับผู้ให้บริการของคุณจะเป็นแบบนี้เสมอ:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

ตัวอย่างเช่น หาก `EXTERNAL_URL` คือ `https://photos.example.com` ให้กำหนด redirect URI ของผู้ให้บริการเป็น `https://photos.example.com/api/auth/oidc/callback`

## เอกสารอ้างอิงการกำหนดค่า {#configuration-reference}

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `OIDC_ENABLED` | `false` | เปิดใช้งานการเข้าสู่ระบบ OIDC ปุ่ม "Sign in with SSO" จะปรากฏบนหน้าเข้าสู่ระบบ |
| `OIDC_ISSUER_URL` | | URL ผู้ออก (issuer) ของผู้ให้บริการ ต้องรองรับ OIDC Discovery (`/.well-known/openid-configuration`) |
| `OIDC_CLIENT_ID` | | OAuth client ID ที่ลงทะเบียนกับผู้ให้บริการของคุณ |
| `OIDC_CLIENT_SECRET` | | OAuth client secret |
| `OIDC_SCOPES` | `openid profile email` | รายการ scope ที่คั่นด้วยช่องว่างเพื่อร้องขอ |
| `OIDC_AUTO_CREATE_USERS` | `true` | สร้างบัญชีผู้ใช้ในเครื่องโดยอัตโนมัติเมื่อเข้าสู่ระบบ OIDC ครั้งแรก |
| `OIDC_DEFAULT_ROLE` | `user` | บทบาทที่กำหนดให้ผู้ใช้ OIDC ที่สร้างอัตโนมัติ หนึ่งใน `admin`, `editor` หรือ `user` |
| `OIDC_AUTO_LINK_USERS` | `false` | เชื่อมโยงข้อมูลประจำตัว OIDC กับผู้ใช้ในเครื่องที่มีอยู่หากที่อยู่อีเมลตรงกัน |
| `OIDC_PROVIDER_NAME` | | ชื่อที่แสดงบนปุ่มเข้าสู่ระบบ (เช่น "Keycloak", "Google") หากว่างเปล่า ปุ่มจะแสดง "SSO" |
| `OIDC_CLOCK_TOLERANCE` | `30` | ความคลาดเคลื่อนของนาฬิกาที่ยอมรับได้เป็นวินาทีสำหรับการตรวจสอบ token |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | claim ของ ID token ที่ใช้เป็นชื่อผู้ใช้สำหรับบัญชีใหม่ |
| `EXTERNAL_URL` | | URL สาธารณะที่เข้าถึง SnapOtter ได้ จำเป็นสำหรับ OIDC เพื่อสร้าง redirect URI ที่ถูกต้อง |
| `COOKIE_SECRET` | สร้างอัตโนมัติ | secret สำหรับเซ็นชื่อคุกกี้เซสชัน ตั้งค่านี้อย่างชัดเจนเมื่อรันหลาย replica |

## คู่มือผู้ให้บริการ {#provider-guides}

### Keycloak {#keycloak}

1. สร้าง realm ใหม่ (หรือใช้ที่มีอยู่)
2. ไปที่ **Clients** และสร้าง client ใหม่:
   - **Client ID**: `snapotter`
   - **Client authentication**: เปิด (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. ใต้แท็บ **Settings** ของ client ให้ตั้งค่า **Valid redirect URIs** เป็น callback URL ของคุณ (เช่น `https://photos.example.com/api/auth/oidc/callback`)
4. คัดลอก **Client secret** จากแท็บ **Credentials**
5. ตั้งค่า `OIDC_ISSUER_URL` เป็น `https://keycloak.example.com/realms/your-realm`

### Authentik {#authentik}

1. ในหน้าจอผู้ดูแลระบบ ไปที่ **Applications > Providers** และสร้าง **OAuth2/OpenID Provider** ใหม่
   - **Client type**: Confidential
   - **Redirect URIs**: callback URL ของคุณ
   - **Signing key**: เลือกคีย์ที่มีอยู่หรือสร้างขึ้นใหม่
2. สร้าง **Application** และเชื่อมโยงกับ provider
3. คัดลอก **Client ID** และ **Client Secret** จากการตั้งค่า provider
4. ตั้งค่า `OIDC_ISSUER_URL` เป็น `https://authentik.example.com/application/o/snapotter/` (เครื่องหมายทับท้ายมีความสำคัญ)

### Google {#google}

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. สร้างโปรเจกต์ (หรือเลือกที่มีอยู่)
3. ไปที่ **APIs & Services > OAuth consent screen** และกำหนดค่า
4. ไปที่ **APIs & Services > Credentials** และสร้าง **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: callback URL ของคุณ
5. คัดลอก **Client ID** และ **Client secret**
6. ตั้งค่า `OIDC_ISSUER_URL` เป็น `https://accounts.google.com`
7. ตั้งค่า `OIDC_USERNAME_CLAIM` เป็น `email` (Google ไม่ให้ `preferred_username`)

## การจัดสรรผู้ใช้ {#user-provisioning}

### สร้างอัตโนมัติ {#auto-create}

เมื่อ `OIDC_AUTO_CREATE_USERS` เป็น `true` (ค่าเริ่มต้น) บัญชีผู้ใช้ในเครื่องจะถูกสร้างขึ้นในครั้งแรกที่มีคนเข้าสู่ระบบผ่าน OIDC ชื่อผู้ใช้จะดึงมาจาก claim ที่ระบุโดย `OIDC_USERNAME_CLAIM` และบทบาทจะถูกตั้งเป็น `OIDC_DEFAULT_ROLE`

หากเกิดชื่อผู้ใช้ซ้ำกัน จะมีการต่อท้ายด้วยตัวเลข (เช่น `jane` กลายเป็น `jane_2`)

### เชื่อมโยงอัตโนมัติ {#auto-link}

เมื่อ `OIDC_AUTO_LINK_USERS` เป็น `true` SnapOtter จะเชื่อมโยงข้อมูลประจำตัว OIDC กับบัญชีในเครื่องที่มีอยู่หากที่อยู่อีเมลตรงกัน สิ่งนี้มีประโยชน์เมื่อคุณมีบัญชีผู้ใช้ที่สร้างไว้ล่วงหน้าและต้องการให้พวกเขาเริ่มใช้ SSO โดยไม่สูญเสียข้อมูล

::: warning 
เปิดใช้งานการเชื่อมโยงอัตโนมัติเฉพาะเมื่อคุณไว้ใจผู้ให้บริการ OIDC ของคุณในการตรวจสอบที่อยู่อีเมล อีเมลที่ไม่ได้รับการยืนยันอาจทำให้ใครบางคนเข้ายึดบัญชีของผู้ใช้อื่นได้
:::

### การปิดการเข้าสู่ระบบในเครื่อง {#disabling-local-login}

OIDC ไม่ปิดการเข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสผ่านในเครื่อง ทั้งสองวิธียังคงใช้งานได้ ผู้ดูแลระบบยังสามารถเข้าสู่ระบบด้วยข้อมูลประจำตัวในเครื่องได้หากผู้ให้บริการ OIDC ไม่สามารถเข้าถึงได้

## ใบรับรองที่เซ็นด้วยตนเอง {#self-signed-certificates}

หากผู้ให้บริการ OIDC ของคุณใช้ใบรับรองที่เซ็นด้วยตนเองหรือใบรับรอง CA ส่วนตัว ให้ mount CA bundle เข้าไปในคอนเทนเนอร์และชี้ `NODE_EXTRA_CA_CERTS` ไปที่มัน:

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
อย่าตั้งค่า `NODE_TLS_REJECT_UNAUTHORIZED=0` สิ่งนี้จะปิดการตรวจสอบ TLS ทั้งหมดและเป็นความเสี่ยงด้านความปลอดภัย
:::

## การแก้ไขปัญหา {#troubleshooting}

### redirect URI ไม่ตรงกัน {#redirect-uri-mismatch}

ข้อผิดพลาดที่พบบ่อยที่สุด ตรวจสอบความแตกต่างเหล่านี้ระหว่างสิ่งที่ผู้ให้บริการคาดหวังกับสิ่งที่ SnapOtter ส่ง:

- `http` กับ `https` scheme ต้องตรงกันทุกประการ
- เครื่องหมายทับท้าย ผู้ให้บริการบางรายเข้มงวดเรื่องนี้
- หมายเลขพอร์ต ระบุพอร์ตหากไม่ใช่ค่ามาตรฐาน
- Path ต้องเป็น `/api/auth/oidc/callback`

ตรวจสอบ `EXTERNAL_URL` อีกครั้ง มันต้องตรงกับ URL ที่ผู้ใช้พิมพ์ในเบราว์เซอร์

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

ผู้ให้บริการ OIDC กำลังใช้ใบรับรองที่ Node.js ไม่ไว้ใจ ดู [ใบรับรองที่เซ็นด้วยตนเอง](#self-signed-certificates) ด้านบน

### ข้อผิดพลาดความคลาดเคลื่อนของนาฬิกา {#clock-skew-errors}

หากนาฬิกาเซิร์ฟเวอร์และนาฬิกาผู้ให้บริการ OIDC ไม่ตรงกัน การตรวจสอบ token อาจล้มเหลว เพิ่มค่า `OIDC_CLOCK_TOLERANCE` (ค่าเริ่มต้นคือ 30 วินาที) วิธีแก้ที่ดีกว่าคือรัน NTP บนทั้งสองเครื่อง

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter ดึงเอกสาร discovery ของผู้ให้บริการเมื่อเริ่มต้นและระหว่างการเข้าสู่ระบบ ตรวจสอบ:

- การแปลง DNS จากภายในคอนเทนเนอร์ Docker (`docker exec snapotter nslookup auth.example.com`)
- กฎไฟร์วอลล์ระหว่างคอนเทนเนอร์และผู้ให้บริการ
- ค่า `OIDC_ISSUER_URL` ต้องเข้าถึงได้จากเซิร์ฟเวอร์ ไม่ใช่แค่จากเบราว์เซอร์ของคุณ

### claim ที่ขาดหายไป {#missing-claims}

หากชื่อผู้ใช้หรืออีเมลว่างเปล่าหลังจากเข้าสู่ระบบ ผู้ให้บริการของคุณอาจไม่ได้ส่ง claim ที่คาดหวังกลับมา ตรวจสอบ:

- scope ที่กำหนดค่าใน `OIDC_SCOPES` มี `profile` และ `email`
- ผู้ให้บริการถูกกำหนดค่าให้รวม claim ที่ระบุใน `OIDC_USERNAME_CLAIM` ไว้ใน ID token
- ผู้ให้บริการบางรายต้องการการกำหนดค่า mapper/scope อย่างชัดเจนเพื่อปล่อย claim
