export type StepAction = 'fill' | 'click' | 'wait' | 'scroll';

export interface ActionStep {
  /** Jenis aksi: isi field, klik elemen, tunggu, atau scroll ke elemen */
  action: StepAction;
  /** CSS selector atau XPath target (tidak dipakai untuk action 'wait') */
  selector: string;
  /** Nilai: teks untuk 'fill', milidetik untuk 'wait', diabaikan untuk 'click'/'scroll' */
  value: string;
}

export interface AssertionInput {
  selector: string;
  expected: string;
}

export interface AssertionResult {
  selector: string;
  expected: string;
  actual: string | null;
  found: boolean;
  passed: boolean;
}

/** Hasil satu checkpoint dalam journey */
export interface CheckpointResult {
  name: string;
  diffPercentage: number;
  diffPixels: number;
  totalPixels: number;
  sizeMismatch: boolean;
  /** Lolos visual (diff <= threshold) */
  passed: boolean;
  assertionResults: AssertionResult[];
  images: { baseline: string; current: string; diff: string };
}

export interface JourneyReportData {
  url: string;
  viewport: { width: number; height: number; name: string };
  threshold: number;
  timestamp: string;
  duration: number;
  results: CheckpointResult[];
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

/** Status keseluruhan satu checkpoint = visual lolos DAN semua assertion lolos */
function checkpointPassed(r: CheckpointResult): boolean {
  return r.passed && r.assertionResults.every((a) => a.passed);
}

export function generateReportHTML(data: JourneyReportData): string {
  const results = data.results;
  const total = results.length;
  const passedCount = results.filter(checkpointPassed).length;
  const overallPassed = passedCount === total;
  const overallColor = overallPassed ? '#22d47a' : '#f04f5c';
  const generatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' });

  const checkpointBlocks = results
    .map((r, idx) => {
      const cpId = `cp${idx}`;
      const passed = checkpointPassed(r);
      const visualColor = r.passed ? '#22d47a' : '#f04f5c';
      const cpColor = passed ? '#22d47a' : '#f04f5c';
      const assertPassed = r.assertionResults.filter((a) => a.passed).length;

      const assertHtml =
        r.assertionResults.length === 0
          ? ''
          : `<div class="assert-summary">Cek konten: ${assertPassed}/${r.assertionResults.length} lolos</div>
             ${r.assertionResults.map((a) => `
             <div class="assert-row ${a.passed ? 'pass' : 'fail'}">
               <div class="assert-icon">${a.passed ? '✅' : '❌'}</div>
               <div class="assert-body">
                 <div class="assert-sel"><code>${esc(a.selector)}</code></div>
                 <div class="assert-detail">
                   <span>Diharapkan mengandung: <strong>"${esc(a.expected)}"</strong></span>
                   <span class="assert-actual">${a.found ? `Teks aktual: "${esc((a.actual ?? '').slice(0, 200))}"` : 'Elemen tidak ditemukan'}</span>
                 </div>
               </div>
             </div>`).join('')}`;

      return `
  <div class="checkpoint" id="${cpId}">
    <div class="cp-header">
      <div class="cp-title"><span class="cp-num">${idx + 1}</span> ${esc(r.name || 'Checkpoint ' + (idx + 1))}</div>
      <div class="cp-status" style="color:${cpColor};border-color:${cpColor}33;background:${cpColor}11">${passed ? '✅ PASSED' : '❌ FAILED'}</div>
    </div>
    <div class="cp-meta">
      <span style="color:${visualColor}">Visual: ${r.diffPercentage.toFixed(3)}% diff</span>
      <span>·</span>
      <span>${r.diffPixels.toLocaleString()} / ${r.totalPixels.toLocaleString()} pixel</span>
      ${r.sizeMismatch ? '<span>· ⚠️ ukuran berbeda</span>' : ''}
    </div>
    <div class="diff-bar-track"><div class="diff-bar-fill" style="width:${Math.min(r.diffPercentage * 20, 100)}%"></div></div>
    ${assertHtml}
    <div class="tabs">
      <button class="tab-btn active" onclick="show('${cpId}','baseline',this)">Baseline</button>
      <button class="tab-btn" onclick="show('${cpId}','current',this)">Current</button>
      <button class="tab-btn" onclick="show('${cpId}','diff',this)">Diff</button>
    </div>
    <div id="${cpId}-baseline" class="tab-panel active"><img src="${r.images.baseline}" alt="Baseline" /></div>
    <div id="${cpId}-current"  class="tab-panel"><img src="${r.images.current}" alt="Current" /></div>
    <div id="${cpId}-diff"     class="tab-panel"><img src="${r.images.diff}" alt="Diff" /></div>
  </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VRT Journey Report — ${esc(data.url)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #08080f; --bg2: #0f0f1a; --bg3: #141425;
      --border: rgba(255,255,255,0.08); --border2: rgba(255,255,255,0.14);
      --text: #e8e8f0; --muted: #8888a8; --dim: #4a4a6a;
      --green: #22d47a; --red: #f04f5c; --accent: #7c6ff7; --accent2: #a78bfa;
    }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.6; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 48px 24px 80px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 20px; padding-bottom: 32px; border-bottom: 1px solid var(--border); margin-bottom: 36px; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 44px; height: 44px; background: linear-gradient(135deg,#7c6ff7,#5b8ef0); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    h1 { font-size: 22px; font-weight: 700; background: linear-gradient(135deg,#fff 30%,#a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .meta { font-size: 12px; color: var(--muted); text-align: right; }
    .meta strong { color: var(--text); }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 36px; }
    .card { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 20px 24px; }
    .card-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: 700; letter-spacing: -1px; }
    .card.status { border-color: ${overallColor}44; background: ${overallColor}11; }
    .card.status .card-value { color: ${overallColor}; font-size: 20px; }
    .card-sub { font-size: 12px; color: var(--muted); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }

    .checkpoint { background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
    .cp-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
    .cp-title { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
    .cp-num { width: 26px; height: 26px; border-radius: 8px; background: rgba(124,111,247,0.15); color: var(--accent2); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
    .cp-status { font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 999px; border: 1px solid; }
    .cp-meta { font-size: 13px; color: var(--muted); font-family: 'JetBrains Mono', monospace; display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .diff-bar-track { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-bottom: 16px; }
    .diff-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg,#22d47a,#f04f5c); }

    .assert-summary { font-size: 12px; color: var(--muted); margin-bottom: 8px; font-family: 'JetBrains Mono', monospace; }
    .assert-row { display: flex; gap: 12px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 8px; }
    .assert-row.pass { border-color: rgba(34,212,122,0.2); }
    .assert-row.fail { border-color: rgba(240,79,92,0.25); background: rgba(240,79,92,0.04); }
    .assert-icon { font-size: 15px; }
    .assert-body { flex: 1; min-width: 0; }
    .assert-sel code { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent2); word-break: break-all; }
    .assert-detail { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; font-size: 12px; color: var(--muted); }
    .assert-detail strong { color: var(--text); }
    .assert-actual { color: var(--dim); }

    .tabs { border-bottom: 1px solid var(--border); display: flex; gap: 0; margin-top: 8px; }
    .tab-btn { padding: 10px 18px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--muted); font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { color: var(--accent2); border-bottom-color: var(--accent2); }
    .tab-panel { display: none; padding-top: 16px; }
    .tab-panel.active { display: block; }
    .tab-panel img { width: 100%; border-radius: 8px; border: 1px solid var(--border); display: block; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">🔍</div>
      <div>
        <h1>VRT Journey Report</h1>
        <div style="font-size:13px;color:#8888a8;margin-top:2px">Playwright + pixelmatch — ${total} checkpoint</div>
      </div>
    </div>
    <div class="meta">
      <div>Generated: <strong>${generatedAt}</strong></div>
      <div style="margin-top:4px">Duration: <strong>${data.duration < 1000 ? data.duration + 'ms' : (data.duration / 1000).toFixed(1) + 's'}</strong></div>
    </div>
  </div>

  <div class="summary">
    <div class="card status">
      <div class="card-label">Status Journey</div>
      <div class="card-value">${overallPassed ? '✅ PASSED' : '❌ FAILED'}</div>
      <div class="card-sub">${passedCount}/${total} checkpoint lolos</div>
    </div>
    <div class="card">
      <div class="card-label">URL</div>
      <div class="card-value" style="font-size:14px;word-break:break-all">${esc(data.url)}</div>
    </div>
    <div class="card">
      <div class="card-label">Viewport</div>
      <div class="card-value" style="font-size:20px">${data.viewport.name}</div>
      <div class="card-sub">${data.viewport.width} × ${data.viewport.height}</div>
    </div>
    <div class="card">
      <div class="card-label">Threshold</div>
      <div class="card-value" style="font-size:20px">${data.threshold}%</div>
      <div class="card-sub">${new Date(data.timestamp).toLocaleString('id-ID')}</div>
    </div>
  </div>
${checkpointBlocks}
</div>
<script>
  function show(cpId, which, btn) {
    var root = document.getElementById(cpId);
    root.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
    root.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
    document.getElementById(cpId + '-' + which).classList.add('active');
    btn.classList.add('active');
  }
</script>
</body>
</html>`;
}
