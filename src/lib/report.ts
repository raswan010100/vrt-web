export interface ReportData {
  url: string;
  viewport: { width: number; height: number; name: string };
  threshold: number;
  diffPercentage: number;
  diffPixels: number;
  totalPixels: number;
  sizeMismatch: boolean;
  passed: boolean;
  timestamp: string;
  duration: number;
  images: {
    baseline: string;
    current: string;
    diff: string;
  };
}

export function generateReportHTML(data: ReportData): string {
  const status = data.passed ? '✅ PASSED' : '❌ FAILED';
  const statusColor = data.passed ? '#22d47a' : '#f04f5c';
  const generatedAt = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VRT Report — ${data.url}</title>
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

    /* header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 20px; padding-bottom: 32px; border-bottom: 1px solid var(--border); margin-bottom: 36px; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 44px; height: 44px; background: linear-gradient(135deg,#7c6ff7,#5b8ef0); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    h1 { font-size: 22px; font-weight: 700; background: linear-gradient(135deg,#fff 30%,#a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .meta { font-size: 12px; color: var(--muted); text-align: right; }
    .meta strong { color: var(--text); }

    /* summary */
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 36px; }
    .card { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 20px 24px; }
    .card-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: 700; letter-spacing: -1px; }
    .card.status { border-color: ${data.passed ? 'rgba(34,212,122,0.25)' : 'rgba(240,79,92,0.25)'}; background: ${data.passed ? 'rgba(34,212,122,0.06)' : 'rgba(240,79,92,0.06)'}; }
    .card.status .card-value { color: ${statusColor}; font-size: 20px; }
    .card-sub { font-size: 12px; color: var(--muted); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }

    /* diff bar */
    .diff-bar-wrap { margin-bottom: 36px; }
    .diff-bar-track { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
    .diff-bar-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg,#22d47a,#f04f5c); width: ${Math.min(data.diffPercentage * 20, 100)}%; }
    .diff-bar-label { font-size: 13px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }

    /* image section */
    .section-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 16px; }
    .tabs { border-bottom: 1px solid var(--border); display: flex; gap: 0; margin-bottom: 0; }
    .tab-btn { padding: 10px 18px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--muted); font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all .2s; }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { color: var(--accent2); border-bottom-color: var(--accent2); }
    .tab-panel { display: none; padding: 20px; background: var(--bg3); border: 1px solid var(--border); border-top: none; border-radius: 0 0 14px 14px; }
    .tab-panel.active { display: block; }
    .tab-panel img { width: 100%; border-radius: 8px; border: 1px solid var(--border); display: block; }
    .img-wrap { border-radius: 14px 14px 0 0; overflow: hidden; border: 1px solid var(--border); border-bottom: none; }

    /* compare slider */
    .compare-slider { position: relative; overflow: hidden; border-radius: 8px; cursor: col-resize; user-select: none; border: 1px solid var(--border); }
    .compare-baseline, .compare-current { position: absolute; top:0; left:0; width:100%; height:100%; }
    .compare-baseline img, .compare-current img { width:100%; display:block; border:none; border-radius:0; }
    .compare-current { clip-path: inset(0 50% 0 0); }
    .compare-handle { position:absolute; top:0; left:50%; height:100%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; pointer-events:none; }
    .handle-line { width:2px; height:100%; background:rgba(255,255,255,.8); }
    .handle-circle { position:absolute; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; background:#fff; color:#333; font-size:14px; display:flex; align-items:center; justify-content:center; font-weight:700; box-shadow:0 2px 12px rgba(0,0,0,.4); }
    .compare-hint { text-align:center; font-size:12px; color:var(--muted); padding:8px; }

    /* info footer */
    .info { margin-top: 36px; padding: 20px 24px; background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; font-size: 13px; color: var(--muted); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .info-item strong { color: var(--text); display: block; }
    .info-item code { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent2); }

    ::-webkit-scrollbar { width:6px; height:6px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border2); border-radius:3px; }
  </style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <div class="logo">
      <div class="logo-icon">🔍</div>
      <div>
        <h1>Visual Regression Report</h1>
        <div style="font-size:13px;color:#8888a8;margin-top:2px">Playwright + pixelmatch</div>
      </div>
    </div>
    <div class="meta">
      <div>Generated: <strong>${generatedAt}</strong></div>
      <div style="margin-top:4px">Duration: <strong>${data.duration < 1000 ? data.duration + 'ms' : (data.duration / 1000).toFixed(1) + 's'}</strong></div>
    </div>
  </div>

  <div class="summary">
    <div class="card status">
      <div class="card-label">Status</div>
      <div class="card-value">${status}</div>
      <div class="card-sub">threshold: ${data.threshold}%</div>
    </div>
    <div class="card">
      <div class="card-label">Diff Percentage</div>
      <div class="card-value" style="color:${statusColor}">${data.diffPercentage.toFixed(3)}%</div>
      <div class="card-sub">${data.diffPixels.toLocaleString()} pixels berbeda</div>
    </div>
    <div class="card">
      <div class="card-label">Total Pixels</div>
      <div class="card-value">${(data.totalPixels / 1000).toFixed(0)}K</div>
      <div class="card-sub">${data.viewport.width} × ${data.viewport.height} px</div>
    </div>
    <div class="card">
      <div class="card-label">Viewport</div>
      <div class="card-value" style="font-size:20px">${data.viewport.name}</div>
      <div class="card-sub">${data.viewport.width} × ${data.viewport.height}</div>
    </div>
  </div>

  <div class="diff-bar-wrap">
    <div class="diff-bar-label">${data.diffPercentage.toFixed(3)}% diff dari ${data.totalPixels.toLocaleString()} total pixel</div>
    <div class="diff-bar-track"><div class="diff-bar-fill"></div></div>
  </div>

  <div class="section-title">Perbandingan Screenshot</div>
  <div class="img-wrap">
    <div class="tabs">
      <button class="tab-btn active" onclick="show('baseline',this)">Baseline</button>
      <button class="tab-btn" onclick="show('current',this)">Current</button>
      <button class="tab-btn" onclick="show('diff',this)">Diff</button>
      <button class="tab-btn" onclick="show('compare',this)">Compare ⟷</button>
    </div>
  </div>
  <div id="baseline" class="tab-panel active"><img src="${data.images.baseline}" alt="Baseline" /></div>
  <div id="current"  class="tab-panel"><img src="${data.images.current}" alt="Current" /></div>
  <div id="diff"     class="tab-panel"><img src="${data.images.diff}" alt="Diff" /></div>
  <div id="compare"  class="tab-panel">
    <div class="compare-slider" id="slider">
      <div class="compare-baseline"><img src="${data.images.baseline}" alt="Baseline" /></div>
      <div class="compare-current"><img src="${data.images.current}" alt="Current" /></div>
      <div class="compare-handle">
        <div class="handle-line"></div>
        <div class="handle-circle">⟷</div>
      </div>
    </div>
    <p class="compare-hint">← Drag untuk membandingkan →</p>
  </div>

  <div class="info">
    <div class="info-item"><strong>URL</strong><code>${data.url}</code></div>
    <div class="info-item"><strong>Waktu Test</strong><code>${new Date(data.timestamp).toLocaleString('id-ID')}</code></div>
    <div class="info-item"><strong>Viewport</strong><code>${data.viewport.width}×${data.viewport.height} (${data.viewport.name})</code></div>
    <div class="info-item"><strong>Size Mismatch</strong><code>${data.sizeMismatch ? 'Ya — gambar di-pad otomatis' : 'Tidak'}</code></div>
  </div>

</div>
<script>
  function show(id, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
    if (id === 'compare') initSlider();
  }
  let sliderReady = false;
  function initSlider() {
    if (sliderReady) return;
    sliderReady = true;
    const slider = document.getElementById('slider');
    const current = slider.querySelector('.compare-current');
    const handle = slider.querySelector('.compare-handle');
    const img = slider.querySelector('.compare-baseline img');
    function setHeight() {
      const ratio = img.naturalHeight / img.naturalWidth;
      slider.style.paddingBottom = (ratio * 100) + '%';
      slider.style.height = '0';
    }
    img.complete ? setHeight() : img.onload = setHeight;
    let drag = false;
    function move(e) {
      const rect = slider.getBoundingClientRect();
      const x = Math.max(0, Math.min((e.touches ? e.touches[0].clientX : e.clientX) - rect.left, rect.width));
      const pct = (x / rect.width) * 100;
      current.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      handle.style.left = pct + '%';
    }
    slider.addEventListener('mousedown', e => { drag = true; move(e); });
    slider.addEventListener('touchstart', e => { drag = true; move(e); });
    window.addEventListener('mousemove', e => drag && move(e));
    window.addEventListener('touchmove', e => drag && move(e));
    window.addEventListener('mouseup', () => drag = false);
    window.addEventListener('touchend', () => drag = false);
  }
</script>
</body>
</html>`;
}
