"use strict";

function kstSeasonKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("경기 시각을 확인할 수 없습니다.");
    error.status = 400;
    error.code = "INVALID_ARENA_TIME";
    throw error;
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).format(date);
}

module.exports = { kstSeasonKey };
