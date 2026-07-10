---
description: "ตั้งค่า SAML 2.0 Single Sign-On สำหรับ SnapOtter คู่มือทีละขั้นตอนสำหรับ Okta, Azure AD / Entra ID, Google Workspace และผู้ให้บริการข้อมูลประจำตัว SAML อื่น ๆ"
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: c6a0d84adefa
---

# SAML SSO {#saml-sso}

SnapOtter รองรับ SAML 2.0 สำหรับ single sign-on ผู้ใช้สามารถเข้าสู่ระบบผ่านผู้ให้บริการข้อมูลประจำตัวภายนอก (Okta, Azure AD / Entra ID, Google Workspace หรือ SAML 2.0 IdP มาตรฐานใด ๆ) แทนการยืนยันตัวตนด้วยชื่อผู้ใช้/รหัสผ่านในเครื่อง

::: tip ฟีเจอร์ระดับองค์กร
SAML SSO ต้องมีไลเซนส์ **team** หรือ **enterprise** พร้อมฟีเจอร์ `saml_sso` หากตั้งค่า `SAML_ENABLED=true` โดยไม่มีไลเซนส์ที่ถูกต้อง เส้นทาง SAML จะถูกข้ามไปอย่างเงียบ ๆ และมีการบันทึกคำเตือน
:::

## สิ่งที่ต้องมีก่อน {#prerequisites}

- instance ของ SnapOtter ที่กำลังทำงานและเข้าถึงได้ที่ URL สาธารณะ
- `EXTERNAL_URL` ตั้งค่าเป็น URL สาธารณะนั้น (เช่น `https://photos.example.com`)
- คีย์ไลเซนส์ team หรือ enterprise พร้อมฟีเจอร์ `saml_sso`
- สิทธิ์ผู้ดูแลระบบสำหรับผู้ให้บริการข้อมูลประจำตัว SAML ของคุณ

## เริ่มต้นอย่างรวดเร็ว {#quick-start}

เพิ่มตัวแปรสภาพแวดล้อมเหล่านี้ลงใน `docker-compose.yml` ของคุณ:

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

รีสตาร์ทคอนเทนเนอร์ ปุ่ม "Sign in with SAML" (หรือป้ายที่ตั้งโดย `SAML_PROVIDER_NAME`) จะปรากฏบนหน้าเข้าสู่ระบบ

## เอกสารอ้างอิงการกำหนดค่า {#configuration-reference}

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `SAML_ENABLED` | `false` | เปิดใช้งานการเข้าสู่ระบบ SAML |
| `SAML_IDP_SSO_URL` | | URL endpoint SSO ของ IdP **จำเป็น** เมื่อเปิดใช้งาน SAML |
| `SAML_IDP_CERTIFICATE` | | ใบรับรองเซ็นชื่อ X.509 ของ IdP ในรูปแบบ PEM (ตัวข้อความใบรับรองเอง ไม่ใช่ path ของไฟล์) **จำเป็น** เมื่อเปิดใช้งาน SAML |
| `EXTERNAL_URL` | | URL สาธารณะที่เข้าถึง SnapOtter ได้ **จำเป็น** เมื่อเปิดใช้งาน SAML |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI ที่ส่งไปยัง IdP |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL ของ Assertion Consumer Service (ACS) |
| `SAML_AUTO_CREATE_USERS` | `true` | สร้างบัญชีผู้ใช้ในเครื่องโดยอัตโนมัติเมื่อเข้าสู่ระบบ SAML ครั้งแรก |
| `SAML_AUTO_LINK_USERS` | `false` | เชื่อมโยงข้อมูลประจำตัว SAML กับผู้ใช้ในเครื่องที่มีอยู่หากที่อยู่อีเมลตรงกัน |
| `SAML_DEFAULT_ROLE` | `user` | บทบาทที่กำหนดให้ผู้ใช้ SAML ที่สร้างอัตโนมัติ หนึ่งใน `admin`, `editor` หรือ `user` |
| `SAML_PROVIDER_NAME` | | ป้ายที่แสดงสำหรับปุ่มเข้าสู่ระบบ SAML บน frontend (เช่น "Okta", "Azure AD") หากว่างเปล่า ปุ่มจะแสดง "SAML" |
| `SAML_USERNAME_ATTRIBUTE` | | แอตทริบิวต์ assertion ของ SAML ที่ใช้เป็นชื่อผู้ใช้ หากว่างเปล่า จะ fallback ไปที่ส่วน local-part ของอีเมล แล้วจึงเป็น NameID |
| `SAML_EMAIL_ATTRIBUTE` | `email` | แอตทริบิวต์ assertion ของ SAML ที่ใช้เป็นที่อยู่อีเมลของผู้ใช้ |

เซิร์ฟเวอร์จะปฏิเสธการเริ่มทำงานหาก `SAML_ENABLED=true` และตัวแปรที่จำเป็นสามตัว (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) ตัวใดตัวหนึ่งขาดหายไป

::: details หมายเหตุด้านความปลอดภัย
ทั้ง `wantAuthnResponseSigned` และ `wantAssertionsSigned` ถูกกำหนดค่าตายตัวเป็น `true` SnapOtter ปฏิเสธการตอบกลับ SAML ที่ไม่ได้เซ็นชื่อหรือเซ็นชื่อไม่ถูกต้อง assertion จาก IdP ที่เชื่อถือได้จะถือว่าอีเมลได้รับการยืนยันแล้ว

รองรับเฉพาะการเข้าสู่ระบบที่ริเริ่มโดย SP เท่านั้น SnapOtter ไม่รองรับการเข้าสู่ระบบที่ริเริ่มโดย IdP (ไม่ได้ร้องขอ) หรือ Single Logout (SLO) การออกจากระบบของ SnapOtter จะไม่ทำให้ผู้ใช้ออกจากระบบของ IdP
:::

## SP metadata และ URL {#sp-metadata-and-urls}

IdP ของคุณต้องการค่าสามค่าจาก SnapOtter:

| ฟิลด์ | ค่า |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

ตัวอย่างเช่น หาก `EXTERNAL_URL` คือ `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Metadata endpoint: `https://photos.example.com/api/auth/saml/metadata` (คืนค่า XML)

IdP บางรายสามารถนำเข้า SP metadata URL ได้โดยตรง ซึ่งจะเติม ACS URL และ Entity ID โดยอัตโนมัติ

## การตั้งค่าผู้ให้บริการ {#provider-setup}

### Okta {#okta}

1. ในคอนโซลผู้ดูแลระบบ Okta ไปที่ **Applications > Create App Integration**
2. เลือก **SAML 2.0** และคลิก **Next**
3. ตั้งชื่อ (เช่น "SnapOtter") และคลิก **Next**
4. กำหนดค่าการตั้งค่า SAML:
   - **Single sign-on URL**: ACS URL ของคุณ (เช่น `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Entity ID ของคุณ (เช่น `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. ใต้ **Attribute Statements** ให้เพิ่ม `email` ที่แมปไปยัง `user.email`
6. คลิก **Next** แล้ว **Finish**
7. ไปที่แท็บ **Sign On** คลิก **View SAML setup instructions** และคัดลอก:
   - **Identity Provider Single Sign-On URL** ลงใน `SAML_IDP_SSO_URL`
   - **X.509 Certificate** ลงใน `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. ในพอร์ทัล Azure ไปที่ **Microsoft Entra ID > Enterprise applications > New application**
2. คลิก **Create your own application** ตั้งชื่อว่า "SnapOtter" และเลือก **Integrate any other application you don't find in the gallery**
3. ไปที่ **Single sign-on > SAML** และคลิก **Edit** ในส่วน **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Entity ID ของคุณ (เช่น `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: ACS URL ของคุณ (เช่น `https://photos.example.com/api/auth/saml/callback`)
4. ใต้ **SAML Certificates** ดาวน์โหลด **Certificate (Base64)**
5. ใต้ **Set up SnapOtter** คัดลอก **Login URL**
6. ตั้งค่า `SAML_IDP_SSO_URL` เป็น Login URL และ `SAML_IDP_CERTIFICATE` เป็นเนื้อหาใบรับรองที่ดาวน์โหลดมา
7. กำหนดผู้ใช้หรือกลุ่มให้กับแอปพลิเคชันภายใต้ **Users and groups**

### Google Workspace {#google-workspace}

1. ในคอนโซลผู้ดูแลระบบ Google ไปที่ **Apps > Web and mobile apps > Add app > Add custom SAML app**
2. ตั้งชื่อแอปว่า "SnapOtter" และคลิก **Continue**
3. ในหน้า **Google Identity Provider details** คัดลอก **SSO URL** และดาวน์โหลด **Certificate** คลิก **Continue**
4. กำหนดค่ารายละเอียด Service Provider:
   - **ACS URL**: ACS URL ของคุณ (เช่น `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Entity ID ของคุณ (เช่น `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. คลิก **Continue** แล้ว **Finish**
6. เปิดแอป **ON** สำหรับหน่วยองค์กรของคุณ
7. ตั้งค่า `SAML_IDP_SSO_URL` เป็น SSO URL จากขั้นตอนที่ 3 และ `SAML_IDP_CERTIFICATE` เป็นเนื้อหาใบรับรองที่ดาวน์โหลดมา

### SAML 2.0 IdP ทั่วไป {#generic-saml-2-0-idp}

สำหรับผู้ให้บริการข้อมูลประจำตัวที่รองรับ SAML 2.0 ใด ๆ:

1. สร้างแอปพลิเคชัน/service provider SAML ใหม่ใน IdP ของคุณ
2. ตั้ง **ACS URL** เป็น `${EXTERNAL_URL}/api/auth/saml/callback`
3. ตั้ง **Entity ID** / **Audience** เป็น `${EXTERNAL_URL}/api/auth/saml/metadata`
4. กำหนดค่า IdP ให้ส่งอีเมลของผู้ใช้ในแอตทริบิวต์ชื่อ `email` (หรือตั้งค่า `SAML_EMAIL_ATTRIBUTE` ให้ตรงกับชื่อแอตทริบิวต์ของ IdP ของคุณ)
5. คัดลอก **IdP SSO URL** และ **ใบรับรองเซ็นชื่อ** ลงใน `SAML_IDP_SSO_URL` และ `SAML_IDP_CERTIFICATE`

## การจัดสรรผู้ใช้ {#user-provisioning}

### สร้างอัตโนมัติ {#auto-create}

เมื่อ `SAML_AUTO_CREATE_USERS` เป็น `true` (ค่าเริ่มต้น) บัญชีผู้ใช้ในเครื่องจะถูกสร้างขึ้นในครั้งแรกที่มีคนเข้าสู่ระบบผ่าน SAML บทบาทจะถูกตั้งเป็น `SAML_DEFAULT_ROLE`

ชื่อผู้ใช้จะได้มาตามลำดับนี้:

1. ค่าของแอตทริบิวต์ assertion ที่ระบุโดย `SAML_USERNAME_ATTRIBUTE` (หากตั้งค่าและมีอยู่)
2. ส่วน local-part ของที่อยู่อีเมล (ทุกอย่างก่อน `@`)
3. SAML NameID

หากเกิดชื่อผู้ใช้ซ้ำกัน จะมีการต่อท้ายด้วยตัวเลข (เช่น `jane` กลายเป็น `jane_2`)

### เชื่อมโยงอัตโนมัติ {#auto-link}

เมื่อ `SAML_AUTO_LINK_USERS` เป็น `true` SnapOtter จะเชื่อมโยงข้อมูลประจำตัว SAML กับบัญชีในเครื่องที่มีอยู่หากที่อยู่อีเมลตรงกัน สิ่งนี้มีประโยชน์เมื่อคุณมีบัญชีผู้ใช้ที่สร้างไว้ล่วงหน้าและต้องการให้พวกเขาเริ่มใช้ SSO โดยไม่สูญเสียข้อมูล

::: warning 
เปิดใช้งานการเชื่อมโยงอัตโนมัติเฉพาะเมื่อคุณไว้ใจ SAML IdP ของคุณในการตรวจสอบที่อยู่อีเมล อีเมลที่ไม่ได้รับการยืนยันจาก IdP ที่กำหนดค่าผิดพลาดอาจทำให้ใครบางคนเข้ายึดบัญชีของผู้ใช้อื่นได้
:::

### การแมปแอตทริบิวต์ {#attribute-mapping}

| ฟิลด์ของ SnapOtter | แหล่งที่มา | การกำหนดค่า |
|---|---|---|
| Email | แอตทริบิวต์ assertion | `SAML_EMAIL_ATTRIBUTE` (ค่าเริ่มต้น: `email`) |
| Username | แอตทริบิวต์ assertion, อีเมล หรือ NameID | `SAML_USERNAME_ATTRIBUTE` (ดูลำดับการได้มาด้านบน) |
| External ID | NameID | เป็น SAML NameID เสมอ ไม่สามารถกำหนดค่าได้ |

## การบังคับใช้ SSO {#sso-enforcement}

หากคุณต้องการบังคับให้ผู้ใช้ทั้งหมดเข้าสู่ระบบผ่าน SAML (หรือ OIDC) และปิดกั้นการเข้าสู่ระบบด้วยรหัสผ่านในเครื่อง ให้เปิดใช้งานการบังคับใช้ SSO:

1. ตรวจสอบให้แน่ใจว่าฟีเจอร์ระดับองค์กร `sso_enforcement` ได้รับไลเซนส์แล้ว (มีในแผน team และ enterprise)
2. ใน **Admin Settings > Security** เปิดสวิตช์ **SSO Enforcement**
3. ตั้งค่า **break-glass username**: นี่คือบัญชีในเครื่องเดียวที่ยังสามารถเข้าสู่ระบบด้วยรหัสผ่านได้ สำหรับการเข้าถึงฉุกเฉินหาก IdP ไม่สามารถเข้าถึงได้

เมื่อการบังคับใช้ SSO เปิดใช้งาน ความพยายามเข้าสู่ระบบในเครื่องใด ๆ (ยกเว้นสำหรับผู้ใช้ break-glass) จะคืนค่าข้อผิดพลาด 403 พร้อมข้อความ "Local password login is disabled. Please use SSO."

::: tip 
กำหนดค่า break-glass username เสมอก่อนเปิดใช้งานการบังคับใช้ SSO หากไม่มี คุณอาจถูกล็อกออกจาก SnapOtter หาก IdP ของคุณล่ม
:::

## การใช้ SAML ควบคู่กับ OIDC {#using-saml-alongside-oidc}

SAML และ OIDC สามารถเปิดใช้งานพร้อมกันได้ เมื่อทั้งสองใช้งานอยู่ หน้าเข้าสู่ระบบจะแสดงปุ่มแยกกันสำหรับผู้ให้บริการแต่ละราย (มีป้ายกำกับโดย `SAML_PROVIDER_NAME` และ `OIDC_PROVIDER_NAME`) ผู้ใช้สามารถเข้าสู่ระบบด้วยวิธีใดก็ได้

ทั้งสองผู้ให้บริการใช้การตั้งค่าสร้างอัตโนมัติ, เชื่อมโยงอัตโนมัติ และการบังคับใช้ SSO ร่วมกันอย่างเป็นอิสระ: แต่ละรายมีตัวแปร `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` และ `*_DEFAULT_ROLE` ของตัวเอง

## การแก้ไขปัญหา {#troubleshooting}

### การตรวจสอบ assertion ล้มเหลว {#assertion-validation-failed}

ไม่สามารถตรวจสอบลายเซ็นการตอบกลับ SAML หรือลายเซ็น assertion ได้ ตรวจสอบ:

- ใบรับรองใน `SAML_IDP_CERTIFICATE` ตรงกับใบรับรองเซ็นชื่อปัจจุบันใน IdP ของคุณ (ใบรับรองมีการหมุนเวียน จึงควรตรวจสอบวันหมดอายุ)
- ใบรับรองอยู่ในรูปแบบ PEM (ขึ้นต้นด้วย `-----BEGIN CERTIFICATE-----`)
- ใบรับรองเป็นข้อความเต็ม ไม่ใช่ path ของไฟล์
- ACS URL และ Entity ID ที่กำหนดค่าใน IdP ของคุณตรงกับค่าของ SnapOtter ทุกประการ (scheme, host, พอร์ต, path)

### แอตทริบิวต์ที่ขาดหายไป {#missing-attributes}

หากชื่อผู้ใช้หรืออีเมลว่างเปล่าหลังจากเข้าสู่ระบบ IdP ของคุณอาจไม่ได้ส่งแอตทริบิวต์ที่คาดหวัง ตรวจสอบ:

- IdP ของคุณถูกกำหนดค่าให้ปล่อยแอตทริบิวต์ `email` (หรือค่าใด ๆ ที่ `SAML_EMAIL_ATTRIBUTE` ถูกตั้งไว้)
- หากใช้ `SAML_USERNAME_ATTRIBUTE` ตรวจสอบว่าแอตทริบิวต์นั้นรวมอยู่ใน assertion
- IdP บางรายต้องการการกำหนดค่าการแมปแอตทริบิวต์อย่างชัดเจนก่อนที่จะปล่อย claim

### ความคลาดเคลื่อนของนาฬิกา {#clock-skew}

assertion ของ SAML มีเงื่อนไข timestamp (`NotBefore`, `NotOnOrAfter`) หากนาฬิกาเซิร์ฟเวอร์และนาฬิกา IdP ไม่ตรงกัน การตรวจสอบ assertion จะล้มเหลว รัน NTP บนทั้งสองเครื่องเพื่อให้นาฬิกาตรงกัน

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

คำเตือนนี้ปรากฏในบันทึกของเซิร์ฟเวอร์เมื่อ `SAML_ENABLED=true` แต่ไลเซนส์ไม่มีฟีเจอร์ `saml_sso` ตรวจสอบคีย์ไลเซนส์และแผนของคุณ ฟีเจอร์ `saml_sso` มีในแผน team และ enterprise

### การเข้าสู่ระบบเปลี่ยนเส้นทางกลับพร้อมข้อผิดพลาด {#login-redirects-back-with-error}

หากคลิกปุ่มเข้าสู่ระบบ SAML แล้วเปลี่ยนเส้นทางกลับไปยังหน้าเข้าสู่ระบบพร้อมข้อผิดพลาด ให้ตรวจสอบบันทึกของเซิร์ฟเวอร์สำหรับรายละเอียด สาเหตุที่พบบ่อย:

- IdP SSO URL ไม่สามารถเข้าถึงได้จากเซิร์ฟเวอร์
- IdP ปฏิเสธคำขอการยืนยันตัวตน (ตรวจสอบบันทึกการตรวจสอบของ IdP)
- IdP คืนค่าการตอบกลับที่ไม่ได้เซ็นชื่อ (SnapOtter ต้องการให้ทั้งการตอบกลับและ assertion ถูกเซ็นชื่อ)
