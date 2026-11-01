/**
 * [BASE · 공용] 부재 상태별 표시 색
 *
 * 렌더러(A)가 부재 색을 섞을 때와, 화면(C)의 범례가 같은 값을 쓰도록 한곳에 둡니다.
 * 색을 바꾸고 싶으면 통합 담당에게 요청하세요.
 */

export const STATE_COLORS = {
  intact: { color: null, label: '정상' }, // null = 재료 고유색
  selected: { color: '#ffb347', label: '선택' },
  damaged: { color: '#e0702f', label: '손상' },
  falling: { color: '#c4473b', label: '낙하' },
  settled: { color: '#6e7882', label: '정지(잔해)' },
};

export const HOVER_COLOR = '#6f9dff';
