/** Format B's generated HTML at the UI boundary. Calculations and CSV stay untouched. */
export function presentReport(html, kind) {
  if (html.includes('id="report-presentation"')) return html;
  const landscape = kind === 'compare';
  let result = html;
  result = result
    .replace(/<table>/g, '<div class="report-table"><table>')
    .replace(/<\/table>/g, '</table></div>');
  const style = `<style id="report-presentation">
    html{scroll-behavior:smooth}body{background:#edf1f5;color:#20334a;font:14px/1.75 Arial,sans-serif}
    main{max-width:1120px;margin:32px auto;padding:0 44px 48px;background:white;box-shadow:0 4px 30px #20334a0c}
    .report-tools{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid #d9e2ec;font:11px 'Courier New',monospace;color:#52657c}
    .report-tools button{border:1px solid #223b5a;background:white;padding:9px 14px;color:#223b5a;font:600 12px Arial;cursor:pointer}
    header{background:#0b2140;color:#f2f6fa;margin:0 -44px 28px;padding:36px 44px 30px;border:0}
    .kicker{font:11px 'Courier New',monospace;letter-spacing:1.5px;color:#bed7f0}
    h1{font-size:36px;line-height:1.2;letter-spacing:-1px;margin:16px 0 12px;font-weight:600}
    .subtitle{color:#b9cfe6;max-width:850px;font-size:14px}
    .meta{border-top:1px solid #435871;padding-top:18px;margin-top:24px;gap:12px 24px;font-size:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
    .meta div{display:block}.meta dt{color:#8faed0;font-size:11px}.meta dd{color:#f2f6fa;font-weight:400;overflow-wrap:anywhere}
    .report-contents{display:flex;gap:8px 20px;flex-wrap:wrap;padding:0 0 22px;margin-bottom:24px;border-bottom:1px solid #d9e2ec}
    .report-contents a{font-size:11px;text-decoration:none;color:#52657c}.report-contents a:hover{color:#ad433d}
    section{border:0;padding:0;margin:32px 0 38px;break-inside:auto;scroll-margin-top:20px}
    h2{font-size:21px;color:#223b5a;border-bottom:1px solid #d9e2ec;padding-bottom:12px;margin-bottom:20px;font-weight:600;line-height:1.4}
    .section-number{color:#b84b45;font:12px 'Courier New',monospace;margin-right:14px;vertical-align:2px}
    h3{color:#435871;font-size:15px;margin-top:24px}.summary{background:#f4f7fa;border-left:3px solid #d56559;padding:20px 24px}.summary h2{border:0;padding:0;margin:0 0 12px}.summary ul{margin:0;padding-left:20px}.summary li{margin:8px 0}
    .kpis{gap:0;border-block:1px solid #d9e2ec;margin:24px 0}.kpi{border:0;border-right:1px solid #d9e2ec;padding:18px 16px}.kpi:last-child{border-right:0}.kpi b{font:600 30px/1.2 Arial;color:#223b5a;margin-bottom:8px}.kpi span{font-size:12px;line-height:1.5}
    .report-table{overflow-x:auto;margin:16px 0}table{font-size:12px;line-height:1.6;width:100%}th{background:#eaf0f6;color:#223b5a;font-size:11px;font-weight:600}th,td{padding:11px 10px;border-bottom:1px solid #d9e2ec;min-width:65px}tbody tr:nth-child(even){background:#f8fafc}td.n,th.n{font-variant-numeric:tabular-nums;white-space:nowrap}
    .tag{border-radius:2px;font-size:11px;padding:2px 7px}.note{line-height:1.7;color:#52657c}svg{margin:16px 0;overflow:visible}footer{border-top:1px solid #d9e2ec;padding-top:20px;line-height:1.7;font-size:11px}
    @media(max-width:700px){main{margin:0;padding:0 20px 30px}header{margin:0 -20px 24px;padding:28px 20px}h1{font-size:28px}.meta{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}.report-tools{gap:12px}th,td{font-size:11px;padding:8px}.summary{padding:16px}}
    @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:14mm}
    @media print{html{scroll-behavior:auto}body{background:white;font-size:10px;color:#20334a}main{max-width:none;margin:0;padding:0;box-shadow:none}.report-tools,.report-contents{display:none}header{margin:0 0 20px;padding:0 0 18px;background:white;color:#223b5a;border-bottom:2px solid #223b5a}h1{font-size:27px}.kicker,.subtitle,.meta dt,.meta dd{color:#435871}.meta{padding-top:12px;border-color:#d9e2ec;font-size:10px}.summary{background:#f4f7fa;print-color-adjust:exact}section{margin:22px 0;break-inside:auto}h2{font-size:17px;break-after:avoid}h3{break-after:avoid}.report-table{overflow:visible}table{font-size:${landscape ? '8.5' : '10'}px;table-layout:auto}th,td{padding:6px 5px;font-size:inherit;min-width:0;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.kpis,svg{break-inside:avoid}.kpi{padding:12px}.kpi b{font-size:24px}footer{font-size:9px}.tag{print-color-adjust:exact}}
  </style>`;
  result = result.replace('</head>', `${style}</head>`);
  result = result.replace(
    '<main>',
    `<main><div class="report-tools noprint"><button onclick="window.print()">Print / Save PDF</button></div>`,
  );
  return result;
}
