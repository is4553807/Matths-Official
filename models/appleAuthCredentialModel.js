const mongoose = require("mongoose");

/*
 * Sign in with Apple 로 받은 폐기용 자격 증명입니다.
 *
 * 사용자 문서(User.socialAuth)에 같이 두지 않은 이유는 두 가지입니다.
 *  ① authorizationCode 와 refreshToken 은 계정 정보가 아니라 **애플 쪽 비밀**이라,
 *    사용자 조회에 딸려 나갈 수 있는 자리에 두면 언젠가 응답에 섞여 나간다.
 *  ② models/matthsModel.js 는 다른 담당자 소유라 이 작업에서 열 수 없다.
 *    appleSubject → userId 매핑을 여기에 두면 사용자 스키마를 건드리지 않고도
 *    "같은 애플 계정으로 다시 로그인" 이 성립한다(appleAuthService 주석 참조).
 *
 * 저장 값은 평문이 아니다. mobileSocialAuthGrantService 가 인증 결과를 다루는
 * 방식과 같게 AES-256-GCM 으로 봉해서 넣는다 — DB 덤프 하나로 남의 애플 계정
 * 토큰을 얻어 가는 경로를 만들지 않기 위해서다.
 */
const appleAuthCredentialSchema =
  new mongoose.Schema(
    {
      appleSubject: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        select: false,
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
      },

      /*
       * 애플 authorizationCode 는 발급 5분 뒤 만료되는 1회용 값입니다.
       * 탈퇴가 몇 달 뒤에 일어나므로 이 값만으로는 폐기할 수 없어,
       * 로그인 시점에 refreshToken 으로 바꿔 둡니다. 원본을 그래도 남기는 것은
       * 교환이 실패했을 때(설정 누락·네트워크) 사후 점검용입니다.
       */
      authorizationCode: {
        type: String,
        default: null,
        select: false,
      },
      authorizationCodeIssuedAt: {
        type: Date,
        default: null,
      },
      /*
       * authorization code 를 발급한 client_id 입니다. 네이티브 앱은 Bundle ID,
       * 웹은 Services ID 를 사용합니다. 둘을 구분하지 않으면 웹 로그인을 켠 순간
       * 기존 앱 사용자의 refresh token 교환·탈퇴 revoke 까지 Services ID 로 보내
       * invalid_client 가 됩니다. 레거시 문서는 값이 없으므로 서비스에서 Bundle ID
       * 로 폴백합니다.
       */
      appleClientId: {
        type: String,
        default: null,
        trim: true,
        maxlength: 255,
        select: false,
      },

      refreshToken: {
        type: String,
        default: null,
        select: false,
      },
      refreshTokenIssuedAt: {
        type: Date,
        default: null,
      },

      /*
       * 폐기 실패는 조용히 넘기지 않고 마지막 사유를 남깁니다. 탈퇴 흐름을
       * 애플 장애로 막아 세우지는 않되, 심사 대응 때 "폐기를 시도했고
       * 무엇이 막았는지" 를 설명할 수 있어야 합니다.
       */
      revokedAt: {
        type: Date,
        default: null,
      },
      lastRevokeError: {
        type: String,
        default: null,
        maxlength: 300,
      },
      lastRevokeAttemptedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

module.exports =
  mongoose.models.AppleAuthCredential ||
  mongoose.model(
    "AppleAuthCredential",
    appleAuthCredentialSchema
  );
