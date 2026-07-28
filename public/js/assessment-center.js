window.addEventListener(
  "pageshow",
  (event) => {
    /*
     * 브라우저 뒤로가기로 평가 센터가 BFCache에서 복원되면
     * 서버의 최신 응시 상태를 다시 받아 버튼을 즉시 갱신합니다.
     */
    if (event.persisted) {
      window.location.reload();
    }
  }
);
