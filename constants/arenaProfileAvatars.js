const ARENA_PROFILE_AVATARS = Object.freeze([
  {
    code: "NOVA_GOAT",
    label: "노바 고트",
    description: "GOAT Arena의 보랏빛 개척자",
    imageSrc: "/images/arena-avatars/nova-goat.svg",
  },
  {
    code: "COMET_FOX",
    label: "코멧 폭스",
    description: "빠르게 해답을 추적하는 전략가",
    imageSrc: "/images/arena-avatars/comet-fox.svg",
  },
  {
    code: "ORBIT_OWL",
    label: "오비트 아울",
    description: "끝까지 수를 읽는 관찰자",
    imageSrc: "/images/arena-avatars/orbit-owl.svg",
  },
  {
    code: "NEON_TIGER",
    label: "네온 타이거",
    description: "정면 승부를 즐기는 도전자",
    imageSrc: "/images/arena-avatars/neon-tiger.svg",
  },
  {
    code: "COSMIC_BEAR",
    label: "코스믹 베어",
    description: "흔들리지 않는 묵직한 수비수",
    imageSrc: "/images/arena-avatars/cosmic-bear.svg",
  },
  {
    code: "PIXEL_RABBIT",
    label: "픽셀 래빗",
    description: "한발 먼저 움직이는 해결사",
    imageSrc: "/images/arena-avatars/pixel-rabbit.svg",
  },
]);

const ARENA_PROFILE_AVATAR_CODES = Object.freeze(
  ARENA_PROFILE_AVATARS.map((avatar) => avatar.code)
);
const DEFAULT_ARENA_PROFILE_AVATAR_CODE = "NOVA_GOAT";

function getArenaProfileAvatar(code) {
  return (
    ARENA_PROFILE_AVATARS.find(
      (avatar) => avatar.code === String(code || "").toUpperCase()
    ) || ARENA_PROFILE_AVATARS[0]
  );
}

module.exports = {
  ARENA_PROFILE_AVATARS,
  ARENA_PROFILE_AVATAR_CODES,
  DEFAULT_ARENA_PROFILE_AVATAR_CODE,
  getArenaProfileAvatar,
};
