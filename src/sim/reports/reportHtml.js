/**
 * [B · 보고서] 공용 도우미 — 보고서 HTML 틀, SVG 차트, CSV
 *
 * 보고서는 외부 파일 없이 열리는 HTML 한 장입니다 (글꼴 · 그림 모두 안에 포함).
 * 브라우저에서 "인쇄 → PDF로 저장"하면 PDF가 됩니다.
 */

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const pct = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const num = (v, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? '-' : Number(v).toFixed(digits);

/** 상태 · 등급 색 (인쇄에서도 구분되도록 밝기 차이를 둠) */
export const COLORS = {
  red: '#c8372d',
  orange: '#e08a1e',
  yellow: '#e9c43b',
  green: '#3f9a5b',
  blue: '#2f6fb5',
  gray: '#9aa3ad',
  ink: '#1d2430',
  muted: '#5d6773',
  grid: '#e3e7ec',
};
export const SERIES = ['#2f6fb5', '#c8372d', '#3f9a5b', '#e08a1e', '#7a4fb5', '#5d6773'];
export const CAUSE_COLORS = {
  scenario: '#2f6fb5',
  collision: '#e08a1e',
  debris: '#7a4fb5',
  support: '#c8372d',
};
export const CAUSE_LABELS = {
  scenario: '시나리오 직접 피해',
  collision: '떨어진 부재 충돌',
  debris: '쌓인 잔해 무게',
  support: '지지 상실(연쇄)',
  removed: '부재 제거',
};

/**
 * 보고서 한 장
 * @param {{ title:string, subtitle?:string, meta?:[string,string][], summary?:string[], body:string }} o
 */
export function page({ title, subtitle = '', meta = [], summary = [], body }) {
  const created = new Date().toLocaleString('ko-KR');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f6f8; color: ${COLORS.ink};
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
  header { border-bottom: 3px solid ${COLORS.ink}; padding-bottom: 14px; margin-bottom: 20px; }
  .kicker { font-size: 12px; letter-spacing: .12em; color: ${COLORS.red}; font-weight: 700; }
  h1 { font-size: 26px; margin: 4px 0 2px; }
  .subtitle { color: ${COLORS.muted}; margin: 0; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px 16px;
    margin: 14px 0 0; font-size: 13px; }
  .meta div { display: flex; gap: 8px; } .meta dt { color: ${COLORS.muted}; min-width: 72px; } .meta dd { margin: 0; font-weight: 600; }
  section { background: #fff; border: 1px solid ${COLORS.grid}; border-radius: 8px; padding: 18px 20px; margin: 0 0 16px; break-inside: avoid; }
  h2 { font-size: 17px; margin: 0 0 10px; }
  h3 { font-size: 14px; margin: 14px 0 6px; color: ${COLORS.muted}; }
  .summary { background: #fff8f3; border-color: #f3d9c6; }
  .summary li { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid ${COLORS.grid}; vertical-align: top; }
  th { background: #f4f6f8; font-weight: 600; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; color: #fff; font-size: 12px; font-weight: 600; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .kpi { border: 1px solid ${COLORS.grid}; border-radius: 6px; padding: 10px 12px; }
  .kpi b { display: block; font-size: 22px; } .kpi span { color: ${COLORS.muted}; font-size: 12px; }
  .note { color: ${COLORS.muted}; font-size: 12px; }
  svg { max-width: 100%; height: auto; display: block; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: ${COLORS.muted}; margin-top: 6px; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  footer { color: ${COLORS.muted}; font-size: 12px; margin-top: 24px; }
  @media print {
    body { background: #fff; } main { padding: 0; max-width: none; }
    section { border-color: #ccc; } .noprint { display: none; }
  }
</style>
</head>
<body>
<main>
<header>
  <div class="kicker">COLLAPSE LAB · 건물 붕괴 시뮬레이션 보고서</div>
  <h1>${esc(title)}</h1>
  <p class="subtitle">${esc(subtitle)}</p>
  <dl class="meta">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}<div><dt>작성</dt><dd>${esc(created)}</dd></div></dl>
</header>
${summary.length ? `<section class="summary"><h2>핵심 요약</h2><ul>${summary.map((s) => `<li>${s}</li>`).join('')}</ul></section>` : ''}
${body}
<footer>
  이 보고서는 교육용 단순화 모델(Collapse Lab)의 결과입니다. 실제 건물의 안전성 판정이나 설계 · 철거 결정에는
  구조기술사의 검토와 인증된 구조 해석이 필요합니다.
  <span class="noprint"> · 인쇄(Ctrl/⌘ + P) → "PDF로 저장"으로 PDF를 만들 수 있습니다.</span>
</footer>
</main>
</body>
</html>`;
}

export const section = (title, inner) => `<section><h2>${esc(title)}</h2>${inner}</section>`;

export function table(headers, rows, numeric = []) {
  const th = headers.map((h, i) => `<th${numeric.includes(i) ? ' class="n"' : ''}>${esc(h)}</th>`);
  const tr = rows.map(
    (r) =>
      `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`,
  );
  return `<table><thead><tr>${th.join('')}</tr></thead><tbody>${tr.join('')}</tbody></table>`;
}

export const kpis = (items) =>
  `<div class="kpis">${items.map(([v, label]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(label)}</span></div>`).join('')}</div>`;

export const tag = (text, color) =>
  `<span class="tag" style="background:${color}">${esc(text)}</span>`;

export const legend = (items) =>
  `<div class="legend">${items.map(([label, color]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join('')}</div>`;

/**
 * 가로 막대 차트
 * @param {{label:string, value:number, color?:string, text?:string}[]} items
 */
export function barChart(items, { max, width = 640, unit = '' } = {}) {
  const labelW = 170;
  const rowH = 26;
  const top = max ?? Math.max(1e-9, ...items.map((d) => d.value));
  const plotW = width - labelW - 170;
  const h = items.length * rowH + 8;
  const rows = items.map((d, i) => {
    const y = i * rowH + 4;
    const w = Math.max(0, (d.value / top) * plotW);
    return `<text x="${labelW - 8}" y="${y + 16}" text-anchor="end" font-size="12" fill="${COLORS.ink}">${esc(d.label)}</text>
<rect x="${labelW}" y="${y + 4}" width="${plotW}" height="16" fill="#f1f3f6" rx="3"/>
<rect x="${labelW}" y="${y + 4}" width="${w}" height="16" fill="${d.color ?? COLORS.blue}" rx="3"/>
<text x="${labelW + w + 6}" y="${y + 16}" font-size="12" fill="${COLORS.muted}">${esc(d.text ?? `${num(d.value)}${unit}`)}</text>`;
  });
  return `<svg viewBox="0 0 ${width} ${h}" role="img">${rows.join('')}</svg>`;
}

/**
 * 누적 비율 막대 (원인별 피해 등)
 * @param {{label:string, parts:{key:string, value:number}[]}[]} rows
 */
export function stackedBars(rows, colors, labels, { width = 640 } = {}) {
  const labelW = 170;
  const rowH = 28;
  const plotW = width - labelW - 10;
  const h = rows.length * rowH + 8;
  const out = rows.map((r, i) => {
    const y = i * rowH + 4;
    const sum = r.parts.reduce((s, p) => s + p.value, 0);
    if (sum <= 0) {
      return `<text x="${labelW - 8}" y="${y + 17}" text-anchor="end" font-size="12" fill="${COLORS.ink}">${esc(r.label)}</text><text x="${labelW + 4}" y="${y + 17}" font-size="12" fill="${COLORS.muted}">피해 없음</text>`;
    }
    const total = sum;
    let x = labelW;
    const segs = r.parts.map((p) => {
      const w = (p.value / total) * plotW;
      const seg = `<rect x="${x}" y="${y + 4}" width="${w}" height="18" fill="${colors[p.key]}"><title>${esc(labels[p.key])} ${pct(p.value / total)}</title></rect>${
        w > 34
          ? `<text x="${x + w / 2}" y="${y + 17}" text-anchor="middle" font-size="11" fill="#fff">${pct(p.value / total)}</text>`
          : ''
      }`;
      x += w;
      return seg;
    });
    return `<text x="${labelW - 8}" y="${y + 17}" text-anchor="end" font-size="12" fill="${COLORS.ink}">${esc(r.label)}</text>${segs.join('')}`;
  });
  return `<svg viewBox="0 0 ${width} ${h}" role="img">${out.join('')}</svg>${legend(
    Object.keys(colors).map((k) => [labels[k], colors[k]]),
  )}`;
}

/**
 * 꺾은선 차트
 * @param {{name:string, color:string, points:[number,number][]}[]} series
 */
/** 4등분 눈금이 정수로 떨어지는 보기 좋은 최댓값 */
function niceCeil(v) {
  const step = 10 ** Math.floor(Math.log10(v / 4));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * step * 4 >= v) return k * step * 4;
  return v;
}

export function lineChart(
  series,
  { width = 640, height = 220, xLabel = '', yLabel = '', yMax } = {},
) {
  const pad = { l: 46, r: 12, t: 10, b: 34 };
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const x0 = Math.min(0, ...xs);
  const x1 = Math.max(1, ...xs);
  const y1 = yMax ?? niceCeil(Math.max(4, ...ys) * 1.05);
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const sx = (x) => pad.l + ((x - x0) / (x1 - x0)) * W;
  const sy = (y) => pad.t + H - (y / y1) * H;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = sy(y1 * f);
    return `<line x1="${pad.l}" x2="${pad.l + W}" y1="${y}" y2="${y}" stroke="${COLORS.grid}"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="${COLORS.muted}">${Math.round(y1 * f)}</text>`;
  });
  const ticks = Array.from({ length: 6 }, (_, i) => x0 + ((x1 - x0) * i) / 5).map(
    (x) =>
      `<text x="${sx(x)}" y="${pad.t + H + 16}" text-anchor="middle" font-size="11" fill="${COLORS.muted}">${num(x, x1 - x0 < 10 ? 1 : 0)}</text>`,
  );
  const lines = series.map(
    (s) =>
      `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${s.points.map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')}"/>`,
  );
  return `<svg viewBox="0 0 ${width} ${height}" role="img">${grid.join('')}${ticks.join('')}${lines.join('')}
<text x="${pad.l + W / 2}" y="${height - 4}" text-anchor="middle" font-size="11" fill="${COLORS.muted}">${esc(xLabel)}</text>
<text x="12" y="${pad.t + H / 2}" font-size="11" fill="${COLORS.muted}" transform="rotate(-90 12 ${pad.t + H / 2})" text-anchor="middle">${esc(yLabel)}</text></svg>${legend(series.map((s) => [s.name, s.color]))}`;
}

/**
 * 평면도 (위에서 본 그림)
 * @param {{x:number, z:number, w:number, d:number, color:string, label?:string, outline?:boolean}[]} shapes
 */
export function planMap(shapes, { width = 640 } = {}) {
  const minX = Math.min(...shapes.map((s) => s.x - s.w / 2)) - 0.8;
  const maxX = Math.max(...shapes.map((s) => s.x + s.w / 2)) + 0.8;
  const minZ = Math.min(...shapes.map((s) => s.z - s.d / 2)) - 0.8;
  const maxZ = Math.max(...shapes.map((s) => s.z + s.d / 2)) + 0.8;
  const scale = width / (maxX - minX);
  const height = (maxZ - minZ) * scale;
  const rects = shapes.map((s) => {
    const x = (s.x - s.w / 2 - minX) * scale;
    const y = (s.z - s.d / 2 - minZ) * scale;
    const w = Math.max(2, s.w * scale);
    const h = Math.max(2, s.d * scale);
    const rect = s.outline
      ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f4f6f8" stroke="#d5dbe2"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.color}" stroke="#fff" stroke-width="1"><title>${esc(s.title ?? s.label ?? '')}</title></rect>`;
    const text = s.label
      ? `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="${Math.min(12, Math.max(9, Math.min(w, h) * 0.6 + 6))}" font-weight="700" fill="${COLORS.ink}" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(s.label)}</text>`
      : '';
    return rect + text;
  });
  return `<svg viewBox="0 0 ${width} ${height.toFixed(0)}" role="img">${rects.join('')}</svg>`;
}

/** CSV (엑셀에서 한글이 깨지지 않도록 BOM 포함) */
export function toCsv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n');
}
