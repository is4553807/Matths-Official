# Cafe24 웹메일 SMTP 설정

Matths 서버의 시스템 메일과 운영자 직접 발송 메일은 Cafe24 웹메일 SMTP를
사용합니다. 사용자에게 운영자가 직접 보내는 메일은 처리한 운영자의 실제
`@matths.kr` 계정을 발신 주소로 사용합니다.

## 1. Cafe24 웹메일 준비

Cafe24 웹메일에서 사용할 운영자 계정을 만든 뒤 각 계정의 POP3/SMTP 사용을
허용합니다. 운영자 계정의 웹메일 비밀번호를 Matths 로그인 비밀번호와 함께
저장하거나 사용자 DB에 기록하지 않습니다.

## 2. 기본 시스템 계정

`config.env`에 고객지원 수신 주소, FAQ 문의 알림 전용 Gmail 계정, 시스템
알림을 보낼 Cafe24 기본 계정을 각각 설정합니다. 고객지원 수신 주소와 발신
계정은 서로 달라도 됩니다.

```env
ADMIN_EMAIL=admin@lsbproduction.com
PUBLIC_CONTACT_EMAIL=admin@lsbproduction.com
SUPPORT_SMTP_HOST=smtp.gmail.com
SUPPORT_SMTP_PORT=465
SUPPORT_SMTP_SECURE=true
SUPPORT_SMTP_USER=lsbproduction00@gmail.com
SUPPORT_SMTP_PASSWORD=Gmail_앱_비밀번호
SUPPORT_EMAIL_FROM_NAME=Matths
SUPPORT_EMAIL_FROM_ADDRESS=lsbproduction00@gmail.com
SMTP_HOST=smtp.cafe24.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_TLS_MIN_VERSION=TLSv1
SMTP_TLS_CIPHERS=DEFAULT@SECLEVEL=0
SMTP_TLS_ALLOW_LEGACY_SERVER_CONNECT=true
SMTP_USER=system-sender@matths.kr
SMTP_PASSWORD=카페24_웹메일_비밀번호
EMAIL_FROM_NAME=Matths
EMAIL_FROM_ADDRESS=system-sender@matths.kr
```

- `ADMIN_EMAIL`: 문의·이의신청 등 운영 알림을 받을 주소
- `PUBLIC_CONTACT_EMAIL`: 약관·개인정보 처리방침에 표시할 연락 주소
- `SUPPORT_SMTP_*`: FAQ 문의 접수 알림만 보내는 Gmail SMTP 계정. 발신자는
  `lsbproduction00@gmail.com`, 수신자는 `ADMIN_EMAIL`이며 Reply-To에는 문의한
  사용자의 이메일이 들어갑니다. Gmail 2단계 인증 후 발급한 앱 비밀번호를
  사용합니다. `SUPPORT_SMTP_PASSWORD`를 생략하면 기존 `GMAIL_APP_PASSWORD`를
  사용합니다.
- `SMTP_SECURE=false`: 587 포트에서 STARTTLS를 사용한다는 뜻
- `SMTP_TLS_*`: Node 24에서 Cafe24의 기존 TLS 서버와 암호화 연결을 유지하기
  위한 계정 한정 호환 설정. 인증서 검증은 계속 활성화됨
- `EMAIL_FROM_ADDRESS`: 기본 시스템 메일 발신 주소이며 `SMTP_USER`와 같은
  계정을 권장

## 3. 운영자별 발신 계정

운영자 직접 메일, 문의 답변, 제재 안내, 관리자 비밀번호 재설정 링크는 로그인한
운영자의 DB 이메일을 발신 주소로 사용합니다. 운영자별 SMTP 비밀번호는 서버
환경변수에만 다음 JSON 객체로 등록합니다.

```env
OPERATOR_SMTP_ACCOUNTS_JSON={"account1@matths.kr":{"user":"account1@matths.kr","password":"웹메일비밀번호"},"account2@matths.kr":{"user":"account2@matths.kr","password":"웹메일비밀번호"}}
```

각 항목에서 `host`, `port`, `secure`를 생략하면 기본 SMTP 설정을 사용합니다.
로그인 운영자의 주소가 기본 `EMAIL_FROM_ADDRESS`와 같으면 기본 SMTP 계정을
사용합니다. 일치하는 SMTP 계정이 없으면 다른 주소로 대신 보내지 않고 발송을
거절하여 처리자 추적 정보가 어긋나지 않게 합니다.

## 4. 연결 확인

```bash
npm run email:verify
npm run support-email-routing:verify
```

연결에 성공한 뒤 서버를 다시 시작합니다. 운영자별 계정도 출시 전에 실제 수신
계정으로 한 번씩 발송하여 From·Reply-To가 해당 운영자 주소인지 확인합니다.
FAQ 문의 알림은 운영자별 계정과 무관하게 Gmail 전용 계정에서만 발송됩니다.

## 5. 이메일 문구

기능별 문구는 `content/email` 아래에 있습니다.

- `content/email/auth.js`
- `content/email/support.js`
- `content/email/account.js`
- `content/email/community.js`
- `content/email/nickname.js`
- `content/email/moderation.js`
- `content/email/privateMock.js`
