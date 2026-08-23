// 계측 결과를 두 열짜리 표로 보여 주는 공통 코드.
//
// 예제마다 "얼마나 걸렸나, 얼마나 받았나" 를 표로 찍는다. 그 표를 만드는 코드가
// 예제마다 복사되면 단위 표기 하나 고치는 데 스무 곳을 손대야 한다.
// 표의 모양은 base.css 의 table.metrics 가 맡는다.

/** 표에 한 행을 붙인다. 라벨은 행 제목이므로 th 로 둔다. */
export function addMetricRow(tbody, label, value) {
  const row = document.createElement('tr');

  const head = document.createElement('th');
  head.scope = 'row';
  head.textContent = label;

  const cell = document.createElement('td');
  cell.textContent = value;

  row.append(head, cell);
  tbody.append(row);
  return row;
}

/**
 * 바이트를 사람이 읽는 크기로. 1024 기준이라 1 KiB 미만은 B, 1 MiB 미만은 KiB 다.
 * MB 로 적으면 십진 단위와 헷갈린다. 바이트를 가르치는 예제에서 그러면 안 된다.
 */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const value = bytes / 1024 / 1024;
  return value < 1 ? `${Math.round(bytes / 1024)} KiB` : `${value.toFixed(2)} MiB`;
}

/** 밀리초를 자리수 구분해서. 표에서 세로로 읽히게 한다. */
export function formatMs(ms) {
  return `${Math.round(ms).toLocaleString()} ms`;
}
