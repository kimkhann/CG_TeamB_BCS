/**
 * [B · Report] Public API — the UI (C) uses only this file.
 *
 *   REPORTS                         report types (for the select box)
 *   buildReport(type, options)      builds a report → { title, html, csv, baseName }
 *   downloadText(name, text, mime)  downloads a file (in the browser, no server)
 *   openHtml(html)                  opens the report in a new window (print → save as PDF)
 */

import { analyzeLog, logCsv, renderLogReport } from './logAnalysis.js';
import { comparisonCsv, renderComparisonReport, runDesignComparison } from './designComparison.js';
import { keyMembersCsv, renderKeyMembersReport, runKeyMembers } from './keyMembers.js';

export const REPORTS = {
  log: {
    id: 'log',
    label: '01 / Simulation log analysis',
    description:
      'Analyze the current run: timeline, damage causes and members that triggered progressive collapse.',
  },
  compare: {
    id: 'compare',
    label: '02 / Design comparison',
    description:
      'Compare this design and alternatives under matching earthquakes and a 60-minute fire. Allow 1–3 minutes.',
  },
  keymembers: {
    id: 'keymembers',
    label: '03 / Key member map',
    description:
      'Remove columns and walls one at a time on the chosen level to map critical members.',
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
    if (!sim) throw new Error('No simulation is available.');
    const analysis = analyzeLog({
      history: sim.getHistory(),
      results: sim.getResults(),
      parts,
      spec,
    });
    return {
      title: 'Simulation log analysis',
      html: renderLogReport(analysis),
      csv: logCsv(analysis),
      baseName,
    };
  }
  if (type === 'compare') {
    const data = await runDesignComparison(spec, onProgress);
    return {
      title: 'Design comparison',
      html: renderComparisonReport(data),
      csv: comparisonCsv(data),
      baseName,
    };
  }
  if (type === 'keymembers') {
    const data = await runKeyMembers(spec, floor, onProgress);
    return {
      title: `Key member map (L${floor})`,
      html: renderKeyMembersReport(data),
      csv: keyMembersCsv(data),
      baseName: baseName.replace('keymembers', `keymembers-${floor}F`),
    };
  }
  throw new Error(`Unknown report: ${type}`);
}

/**
 * Downloads a file. Inside a claude.ai artifact it uses the downloads capability (saved after the viewer confirms);
 * elsewhere (local, regular web) it uses a normal browser download.
 * @returns {Promise<string>} 'saved' | 'declined' | 'failed'
 */
export async function downloadText(filename, text, mime) {
  const host = typeof window !== 'undefined' ? window.claude : null;
  if (host?.use) {
    const downloads = await host.use('downloads');
    if (downloads) {
      try {
        await downloads.save({ filename, data: text });
        return 'saved';
      } catch (error) {
        return error?.code === 'declined' ? 'declined' : 'failed';
      }
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
}

/** Opening a new window only works in a regular browser (blocked inside artifacts) */
export const canOpenWindow = () => typeof window !== 'undefined' && !window.claude;

export function openHtml(html) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
