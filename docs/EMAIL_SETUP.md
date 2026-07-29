# Gmail 이메일 발송 설정

Matths 서버는 문의 알림과 비밀번호 재설정 인증코드를 Gmail SMTP로
발송합니다. 발송 전용 Gmail 계정과 16자리 앱 비밀번호를 사용합니다.
Google 계정의 일반 비밀번호는 서버에 저장하지 않습니다.

## 1. Gmail 앱 비밀번호 발급

1. 발송에 사용할 Google 계정에서 2단계 인증을 켭니다.
2. [Google 앱 비밀번호](https://myaccount.google.com/apppasswords)로
   이동합니다.
3. 앱 이름을 `Matths Server`로 입력하고 앱 비밀번호를 생성합니다.
4. 화면에 한 번 표시되는 16자리 비밀번호를 복사합니다.

앱 비밀번호 메뉴가 보이지 않으면 조직 관리 계정, 고급 보호 계정,
보안 키만 사용하는 2단계 인증 계정인지 확인해야 합니다.

## 2. 서버 환경변수 설정

`config.env`에 다음 값을 추가합니다.

```env
ADMIN_EMAIL=admin@lsbproduction.com
EMAIL_FROM_NAME=Matths
EMAIL_FROM_ADDRESS=admin@lsbproduction.com
GMAIL_USER=matths.sender@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
```

- `GMAIL_USER`: 실제로 로그인할 Gmail 주소
- `GMAIL_APP_PASSWORD`: 공백을 제외한 16자리 앱 비밀번호
- `ADMIN_EMAIL`: 사용자 문의를 받을 주소이며 Outlook 주소여도 됩니다.
- `EMAIL_FROM_ADDRESS`: 수신자에게 보일 발신 주소입니다.

`EMAIL_FROM_ADDRESS=admin@lsbproduction.com`을 사용하려면 해당 주소를
Gmail의 **다른 주소에서 메일 보내기**에 추가하고 소유권 확인을 끝내야
합니다. 확인하지 않은 주소를 지정하면 Gmail이 `GMAIL_USER` 주소로
다시 쓰거나 발송을 거부할 수 있습니다. 가장 안정적인 운영 방식은
`admin@lsbproduction.com` 도메인 메일함의 SMTP를 직접 사용하거나,
현재 Gmail 계정에 이 주소를 검증된 발신 별칭으로 등록하는 것입니다.

기존 `EMAIL_API_KEY`, `EMAIL_API_URL`, `EMAIL_FROM` 값은 더 이상
사용하지 않으므로 삭제해도 됩니다.

## 3. 연결 확인

서버를 실행하기 전에 다음 명령으로 Gmail 인증과 SMTP 연결을
확인합니다.

```bash
npm run email:verify
```

연결 성공 후 서버를 다시 시작합니다.

```bash
npm run email:verify
node server.js
```

실제 이메일이 보이지 않으면 수신 계정의 스팸함과 Gmail 계정의
보안 알림을 함께 확인합니다.

## 4. 이메일 문구 수정

기능별 문구는 `content/email` 아래에 있습니다.

- `content/email/auth.js`
- `content/email/support.js`
- `content/email/account.js`
- `content/email/community.js`
- `content/email/nickname.js`
- `content/email/moderation.js`
- `content/email/privateMock.js`

각 파일의 용도는 `content/email/README.md`에서 확인할 수 있습니다.
