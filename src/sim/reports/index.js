/**
 * [B · 보고서] 공개 함수 — 화면(C)은 이 파일만 씁니다.
 *
 *   REPORTS                         보고서 종류 목록 (선택 상자용)
 *   buildReport(type, options)      보고서 만들기 → { title, html, csv, baseName }
 *   downloadText(name, text, mime)  파일 내려받기 (서버 없이 브라우저에서)
 *   openHtml(html)                  새 창에서 보고서 열기 (인쇄 → PDF 저장)
 */

import { analyzeLog, logCsv, renderLogReport } from './logAnalysis.js';
import { comparisonCsv, renderComparisonReport, runDesignComparison } from './designComparison.js';
import { keyMembersCsv, renderKeyMembersReport, runKeyMembers } from './keyMembers.js';

export const REPORTS = {
  log: {
    id: 'log',
    label: '① 이번 시뮬레이션 로그 분석',
    description:
      '지금 화면의 시뮬레이션 기록으로 진행 시간표 · 붕괴 원인 · 연쇄를 일으킨 부재를 분석합니다.',
  },
  compare: {
    id: 'compare',
    label: '② 설계안 비교 리포트',
    description:
      '현재 건물과 재료 · 구조 대안을 같은 지진(최대 규모 탐색 · 규모 6.5) · 60분 화재로 시험해 비교합니다. 1~3분 걸립니다.',
  },
  keymembers: {
    id: 'keymembers',
    label: '③ 핵심 부재 지도',
    description:
      '고른 층의 기둥 · 벽을 하나씩 없애 보고, 없애면 안 되는 부재를 평면도에 표시합니다.',
    needsFloor: true,
  },
};

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/**
 * @param {'log'|'compare'|'keymembers'} type
 * @param {{ spec:object, sim?:object, parts?:object[], floor?:number,
 *           onProgress?:(done:number, total:number, text:string)=>void }} o
 * @returns {Promise<{ title:string, html:string, csv:string, baseName:string }>}
 */
export async function buildReport(type, { spec, sim, parts, floor = 1, onProgress }) {
  const baseName = `collapse-lab_${spec.type}${spec.floors}F_${type}_${stamp()}`;
  if (type === 'log') {
    if (!sim) throw new Error('시뮬레이션이 없습니다.');
    const analysis = analyzeLog({
      history: sim.getHistory(),
      results: sim.getResults(),
      parts,
      spec,
    });
    return {
      title: '시뮬레이션 로그 분석',
      html: renderLogReport(analysis),
      csv: logCsv(analysis),
      baseName,
    };
  }
  if (type === 'compare') {
    const data = await runDesignComparison(spec, onProgress);
    return {
      title: '설계안 비교 리포트',
      html: renderComparisonReport(data),
      csv: comparisonCsv(data),
      baseName,
    };
  }
  if (type === 'keymembers') {
    const data = await runKeyMembers(spec, floor, onProgress);
    return {
      title: `핵심 부재 지도 (${floor}층)`,
      html: renderKeyMembersReport(data),
      csv: keyMembersCsv(data),
      baseName: baseName.replace('keymembers', `keymembers-${floor}F`),
    };
  }
  throw new Error(`알 수 없는 보고서: ${type}`);
}

export function downloadText(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function openHtml(html) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
