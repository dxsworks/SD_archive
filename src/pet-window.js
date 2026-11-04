// 펫 창 가로 (월드 단위). 보통 4.0단위이고, 몸보다 훨씬 넓게 움직이는 학생만 그 학생 창을 넓힌다.
// 메인 프로세스(main.js)와 검사 도구(tools/pet-page.js)가 같이 쓰도록 Electron 없이 Node만 씀.
// 펫 페이지는 창 크기를 그대로 받아 카메라를 정하므로(pet.js setViewShift: 높이로 배율, 가로는 창 비율) 여기만 바꾸면 된다
// 2026-11-02 사용자 "아야네만 창 넓히기": 수영복 아야네는 무장·전투를 헬기를 타고 하는데, 펫이 옆을 보면(전투 중 뛰기·그 직후)
// 헬기 몸통·꼬리가 옆으로 놓여 창 옆으로 한쪽 최대 약 250px 나갔음(앞을 볼 땐 0~43px) → 6.55단위(보통 862 → 1410px).
// 캔버스는 캐릭터 둘레만 그려서(tight-canvas.js) 다른 학생 GPU는 그대로
// 2026-11-04 사용자 "두 학생만 넓히기": 체리노(온천)·이로하는 무장·전투를 전차를 타고 하는데, 전차가 옆으로 놓이면(전투 중 뛴 뒤)
// 도저 날·포신이 창 옆으로 한쪽 최대 약 150px 나갔음 → 5.7단위(보통 862 → 1228px)
const path = require('path');

const VIEW_WIDTH = 4.0;
const WIDE_WINDOW = { 'Ayane (Swimsuit).glb': 6.55, 'Cherino (Hot Spring).glb': 5.7, 'Iroha.glb': 5.7 };

// 그 학생 창의 가로 px: 창 크기 프리셋의 가로(보통 862)에 넓힌 비율을 곱한다
const windowWidth = (model, w) => Math.round((w * (WIDE_WINDOW[path.basename(model ?? '')] ?? VIEW_WIDTH)) / VIEW_WIDTH);

module.exports = { WIDE_WINDOW, windowWidth };
