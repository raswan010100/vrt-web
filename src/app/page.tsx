'use client';

import { useState, useRef, useCallback } from 'react';
import { generateReportHTML, type ReportData } from '@/lib/report';

// ── Types ────────────────────────────────────────────────────────────────────

interface TestResult extends ReportData {}

const VIEWPORT_PRESETS = [
  { name: 'Desktop', label: 'Desktop', width: 1440, height: 900 },
  { name: 'Tablet', label: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', label: 'Mobile', width: 390, height: 844 },
  { name: 'Custom', label: 'Custom', width: 0, height: 0 },
] as const;

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<'form' | 'loading' | 'result'>('form');
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'baseline' | 'current' | 'diff' | 'compare'>('baseline');
  const [loadingMsg, setLoadingMsg] = useState('Menginisialisasi browser...');

  // Form state
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [baselinePreview, setBaselinePreview] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customW, setCustomW] = useState(1280);
  const [customH, setCustomH] = useState(800);
  const [threshold, setThreshold] = useState(0.1);
  const [isDragging, setIsDragging] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [hideSelectors, setHideSelectors] = useState<string[]>([]);
  const [selectorInput, setSelectorInput] = useState('');
  const [assertions, setAssertions] = useState<{ selector: string; expected: string }[]>([]);
  const [assertSelector, setAssertSelector] = useState('');
  const [assertExpected, setAssertExpected] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compareSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingSlider = useRef(false);

  const preset = VIEWPORT_PRESETS[selectedPreset];
  const viewport = preset.name === 'Custom'
    ? { name: 'Custom', width: customW, height: customH }
    : { name: preset.name, width: preset.width, height: preset.height };

  // Status keseluruhan = visual lolos DAN semua assertion lolos
  const assertionResults = result?.assertionResults ?? [];
  const allAssertPassed = assertionResults.every((a) => a.passed);
  const overallPassed = (result?.passed ?? false) && allAssertPassed;

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (PNG, JPG, dll).');
      return;
    }
    setBaselineFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setBaselinePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Hide selectors ────────────────────────────────────────────────────────

  function addSelector() {
    const val = selectorInput.trim();
    if (!val || hideSelectors.includes(val)) return;
    setHideSelectors((prev) => [...prev, val]);
    setSelectorInput('');
  }

  function removeSelector(sel: string) {
    setHideSelectors((prev) => prev.filter((s) => s !== sel));
  }

  // ── Content assertions ────────────────────────────────────────────────────

  function addAssertion() {
    const sel = assertSelector.trim();
    const exp = assertExpected.trim();
    if (!sel || !exp) return;
    if (assertions.some((a) => a.selector === sel && a.expected === exp)) return;
    setAssertions((prev) => [...prev, { selector: sel, expected: exp }]);
    setAssertSelector('');
    setAssertExpected('');
  }

  function removeAssertion(idx: number) {
    setAssertions((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Auto screenshot ───────────────────────────────────────────────────────

  async function handleAutoScreenshot() {
    if (!url.trim()) { setError('Masukkan URL terlebih dahulu sebelum mengambil screenshot.'); return; }
    if (!url.startsWith('http')) { setError('URL harus dimulai dengan http:// atau https://'); return; }
    if (viewport.width < 1 || viewport.height < 1) { setError('Pilih ukuran viewport terlebih dahulu.'); return; }

    setIsCapturing(true);
    setError(null);

    try {
      const res = await fetch('/api/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), width: viewport.width, height: viewport.height, hideSelectors }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengambil screenshot.');

      // Convert base64 ke File object agar bisa dipakai saat submit
      const fetchRes = await fetch(data.screenshot);
      const blob = await fetchRes.blob();
      const file = new File([blob], 'auto-screenshot.png', { type: 'image/png' });

      setBaselineFile(file);
      setBaselinePreview(data.screenshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengambil screenshot otomatis.');
    } finally {
      setIsCapturing(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!baselineFile) { setError('Upload gambar baseline terlebih dahulu.'); return; }
    if (!url.trim()) { setError('Masukkan URL yang akan ditest.'); return; }
    if (!url.startsWith('http')) { setError('URL harus dimulai dengan http:// atau https://'); return; }
    if (viewport.width < 1 || viewport.height < 1) { setError('Ukuran viewport tidak valid.'); return; }

    // Auto-commit input yang belum di-"Tambah" supaya tidak terlewat saat submit.
    const effectiveHideSelectors = [...hideSelectors];
    const pendingHide = selectorInput.trim();
    if (pendingHide && !effectiveHideSelectors.includes(pendingHide)) {
      effectiveHideSelectors.push(pendingHide);
    }

    const effectiveAssertions = [...assertions];
    const pendingSel = assertSelector.trim();
    const pendingExp = assertExpected.trim();
    if (pendingSel && pendingExp &&
        !effectiveAssertions.some((a) => a.selector === pendingSel && a.expected === pendingExp)) {
      effectiveAssertions.push({ selector: pendingSel, expected: pendingExp });
    }
    // Sinkronkan ke state agar UI ikut menampilkan chip-nya.
    setHideSelectors(effectiveHideSelectors);
    setAssertions(effectiveAssertions);
    setSelectorInput('');
    setAssertSelector('');
    setAssertExpected('');

    setStep('loading');
    setError(null);

    const msgs = [
      'Menginisialisasi browser...',
      'Membuka URL target...',
      'Menunggu halaman selesai dimuat...',
      'Mengambil screenshot...',
      'Membandingkan dengan baseline...',
    ];
    let i = 0;
    setLoadingMsg(msgs[i]);
    const interval = setInterval(() => {
      i = Math.min(i + 1, msgs.length - 1);
      setLoadingMsg(msgs[i]);
    }, 2500);

    try {
      const fd = new FormData();
      fd.append('baseline', baselineFile);
      fd.append('url', url.trim());
      fd.append('width', String(viewport.width));
      fd.append('height', String(viewport.height));
      fd.append('viewportName', viewport.name);
      fd.append('threshold', String(threshold));
      fd.append('hideSelectors', JSON.stringify(effectiveHideSelectors));
      fd.append('assertions', JSON.stringify(effectiveAssertions));

      const res = await fetch('/api/test', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan pada server.');

      setResult(data as TestResult);
      setActiveTab('baseline');
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga.');
      setStep('form');
    } finally {
      clearInterval(interval);
    }
  }

  // ── Download report ───────────────────────────────────────────────────────

  function downloadReport() {
    if (!result) return;
    const html = generateReportHTML(result);
    const blob = new Blob([html], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vrt-report-${Date.now()}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ── Compare slider ────────────────────────────────────────────────────────

  function onSliderMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDraggingSlider.current || !compareSliderRef.current) return;
    const rect = compareSliderRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min((clientX - rect.left) / rect.width * 100, 100));
    const cur = compareSliderRef.current.querySelector<HTMLElement>('.compare-current');
    const handle = compareSliderRef.current.querySelector<HTMLElement>('.compare-handle');
    if (cur) cur.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    if (handle) handle.style.left = `${pct}%`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 800px 500px at 20% 0%, rgba(124,111,247,0.07) 0%, transparent 70%), radial-gradient(ellipse 600px 400px at 80% 100%, rgba(91,142,240,0.05) 0%, transparent 60%)',
      }} />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#7c6ff7,#5b8ef0)', boxShadow: '0 4px 16px rgba(124,111,247,0.4)' }}>
              🔍
            </div>
            <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg,#fff 30%,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Visual Regression Testing
            </h1>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Upload baseline screenshot, tentukan viewport, dan masukkan URL — deteksi perubahan visual secara otomatis.
          </p>
        </div>

        {/* ── FORM STEP ──────────────────────────────────────────────────── */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(240,79,92,0.08)', border: '1px solid rgba(240,79,92,0.25)', color: '#f04f5c' }}>
                ⚠️ {error}
              </div>
            )}

            {/* Upload baseline */}
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  1. Baseline Screenshot
                </label>
                {/* Tombol Screenshot Otomatis */}
                <button
                  type="button"
                  onClick={handleAutoScreenshot}
                  disabled={isCapturing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: isCapturing ? 'rgba(124,111,247,0.1)' : 'linear-gradient(135deg,#7c6ff7,#5b8ef0)',
                    color: isCapturing ? '#8888a8' : '#fff',
                    border: isCapturing ? '1px solid rgba(124,111,247,0.2)' : '1px solid transparent',
                    cursor: isCapturing ? 'not-allowed' : 'pointer',
                    boxShadow: isCapturing ? 'none' : '0 2px 12px rgba(124,111,247,0.3)',
                  }}
                >
                  {isCapturing ? (
                    <>
                      <span className="animate-spin">⏳</span> Mengambil screenshot...
                    </>
                  ) : (
                    <>📸 Screenshot Otomatis</>
                  )}
                </button>
              </div>

              {/* Info hint */}
              {!baselinePreview && (
                <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(124,111,247,0.06)', border: '1px solid rgba(124,111,247,0.12)', color: 'var(--muted)' }}>
                  💡 Isi URL & pilih viewport dulu, lalu klik <strong style={{ color: '#a78bfa' }}>Screenshot Otomatis</strong> — atau upload manual di bawah.
                </div>
              )}

              {baselinePreview ? (
                <div className="space-y-3">
                  <img src={baselinePreview} alt="Baseline preview" className="w-full rounded-xl" style={{ border: '1px solid var(--border)', maxHeight: 300, objectFit: 'contain', background: '#0a0a14' }} />
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
                    <span>📎 {baselineFile?.name}</span>
                    <button type="button" onClick={() => { setBaselineFile(null); setBaselinePreview(null); }}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'rgba(240,79,92,0.1)', color: '#f04f5c', border: '1px solid rgba(240,79,92,0.2)' }}>
                      Ganti
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl p-10 text-center cursor-pointer transition-all"
                  style={{
                    border: `2px dashed ${isDragging ? '#7c6ff7' : 'rgba(255,255,255,0.12)'}`,
                    background: isDragging ? 'rgba(124,111,247,0.06)' : 'transparent',
                  }}
                >
                  <div className="text-4xl mb-3">📁</div>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Drag & drop atau klik untuk upload manual</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>PNG, JPG, WebP — maks 20MB</div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
              )}
            </div>

            {/* URL input */}
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <label className="block text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
                2. URL yang Akan Ditest
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                onFocus={(e) => e.target.style.borderColor = '#7c6ff7'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Viewport */}
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <label className="block text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
                3. Ukuran Layar (Viewport)
              </label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {VIEWPORT_PRESETS.map((p, i) => (
                  <button key={p.name} type="button"
                    onClick={() => setSelectedPreset(i)}
                    className="rounded-xl py-3 text-sm font-medium transition-all"
                    style={{
                      background: selectedPreset === i ? 'linear-gradient(135deg,#7c6ff7,#5b8ef0)' : 'rgba(255,255,255,0.04)',
                      border: selectedPreset === i ? '1px solid transparent' : '1px solid var(--border)',
                      color: selectedPreset === i ? '#fff' : 'var(--muted)',
                      boxShadow: selectedPreset === i ? '0 2px 12px rgba(124,111,247,0.35)' : 'none',
                    }}>
                    {p.label}
                    {p.name !== 'Custom' && (
                      <div className="text-xs mt-0.5" style={{ opacity: 0.75, fontFamily: 'monospace' }}>
                        {p.width}×{p.height}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {preset.name === 'Custom' && (
                <div className="flex gap-3">
                  {[{ label: 'Width (px)', val: customW, set: setCustomW }, { label: 'Height (px)', val: customH, set: setCustomH }].map(({ label, val, set }) => (
                    <div key={label} className="flex-1">
                      <div className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>{label}</div>
                      <input type="number" value={val} min={320} max={3840}
                        onChange={(e) => set(Number(e.target.value))}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'monospace' }}
                        onFocus={(e) => e.target.style.borderColor = '#7c6ff7'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Threshold */}
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  4. Threshold
                </label>
                <span className="text-sm font-mono" style={{ color: '#7c6ff7' }}>{threshold.toFixed(2)}%</span>
              </div>
              <input type="range" min={0} max={5} step={0.05} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-violet-500" />
              <div className="flex justify-between text-xs mt-2" style={{ color: 'var(--muted)' }}>
                <span>0% — sangat ketat</span>
                <span>5% — toleran</span>
              </div>
              <div className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(124,111,247,0.08)', color: 'var(--muted)', border: '1px solid rgba(124,111,247,0.12)' }}>
                💡 Rekomendasi: <strong style={{ color: '#a78bfa' }}>0.1%</strong> untuk halaman statis · <strong style={{ color: '#a78bfa' }}>1–2%</strong> untuk halaman dengan konten dinamis
              </div>
            </div>

            {/* Hide Selectors */}
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  5. Sembunyikan Elemen Dinamis
                </label>
                <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>
                  Opsional
                </span>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                Masukkan <strong style={{ color: '#a78bfa' }}>CSS selector</strong> atau <strong style={{ color: '#a78bfa' }}>XPath</strong> elemen yang ingin disembunyikan sebelum screenshot — cocok untuk teks dinamis seperti tanggal, jam, counter, iklan, dll. <span style={{ color: 'var(--text)' }}>XPath dideteksi otomatis jika diawali</span> <code style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>/</code> <span style={{ color: 'var(--text)' }}>atau</span> <code style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>(</code>.
              </p>

              {/* Input tambah selector */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={selectorInput}
                  onChange={(e) => setSelectorInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSelector())}
                  placeholder=".timestamp  atau  //div[@class='jam']"
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#7c6ff7'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
                <button
                  type="button"
                  onClick={addSelector}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'rgba(124,111,247,0.15)', color: '#a78bfa', border: '1px solid rgba(124,111,247,0.25)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(124,111,247,0.25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(124,111,247,0.15)')}>
                  + Tambah
                </button>
              </div>

              {/* Daftar selector */}
              {hideSelectors.length > 0 ? (
                <div className="space-y-2">
                  {hideSelectors.map((sel) => (
                    <div key={sel} className="flex items-center justify-between px-3 py-2 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                      <span className="text-sm" style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>
                        {sel}
                      </span>
                      <button type="button" onClick={() => removeSelector(sel)}
                        className="text-xs px-2 py-0.5 rounded-lg transition-colors"
                        style={{ color: '#f04f5c', background: 'rgba(240,79,92,0.08)', border: '1px solid rgba(240,79,92,0.15)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(240,79,92,0.18)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(240,79,92,0.08)')}>
                        ✕ Hapus
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs py-3 text-center rounded-xl" style={{ color: 'var(--muted)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                  Belum ada selector — semua elemen akan ikut di-screenshot
                </div>
              )}
            </div>

            {/* Content Assertions */}
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  6. Cek Konten Elemen
                </label>
                <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>
                  Opsional
                </span>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                Pastikan sebuah elemen <strong style={{ color: '#a78bfa' }}>mengandung</strong> teks/data tertentu. Isi <strong style={{ color: '#a78bfa' }}>selector</strong> (CSS atau XPath) + <strong style={{ color: '#a78bfa' }}>teks yang diharapkan</strong>. Test gagal jika elemen tidak ditemukan atau teksnya tidak mengandung data tsb.
              </p>

              {/* Input tambah assertion */}
              <div className="flex flex-col md:flex-row gap-2 mb-3">
                <input
                  type="text"
                  value={assertSelector}
                  onChange={(e) => setAssertSelector(e.target.value)}
                  placeholder="Selector: .harga  /  //h1"
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}
                  onFocus={(e) => (e.target.style.borderColor = '#7c6ff7')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
                <input
                  type="text"
                  value={assertExpected}
                  onChange={(e) => setAssertExpected(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAssertion())}
                  placeholder="Teks yang diharapkan: Rp 299K"
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  onFocus={(e) => (e.target.style.borderColor = '#7c6ff7')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
                <button
                  type="button"
                  onClick={addAssertion}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap"
                  style={{ background: 'rgba(124,111,247,0.15)', color: '#a78bfa', border: '1px solid rgba(124,111,247,0.25)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(124,111,247,0.25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(124,111,247,0.15)')}>
                  + Tambah
                </button>
              </div>

              {/* Daftar assertion */}
              {assertions.length > 0 ? (
                <div className="space-y-2">
                  {assertions.map((a, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                      <div className="min-w-0 flex-1 text-sm" style={{ color: 'var(--muted)' }}>
                        <span style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>{a.selector}</span>
                        <span style={{ color: 'var(--dim)' }}> mengandung </span>
                        <span style={{ color: 'var(--text)' }}>&quot;{a.expected}&quot;</span>
                      </div>
                      <button type="button" onClick={() => removeAssertion(idx)}
                        className="text-xs px-2 py-0.5 rounded-lg transition-colors whitespace-nowrap"
                        style={{ color: '#f04f5c', background: 'rgba(240,79,92,0.08)', border: '1px solid rgba(240,79,92,0.15)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(240,79,92,0.18)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(240,79,92,0.08)')}>
                        ✕ Hapus
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs py-3 text-center rounded-xl" style={{ color: 'var(--muted)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                  Belum ada pengecekan konten
                </div>
              )}
            </div>

            {/* Submit */}
            <button type="submit"
              className="w-full py-4 rounded-2xl text-base font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#7c6ff7,#5b8ef0)', boxShadow: '0 4px 24px rgba(124,111,247,0.4)' }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}>
              🚀 Mulai Visual Regression Test
            </button>
          </form>
        )}

        {/* ── LOADING STEP ──────────────────────────────────────────────── */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 animate-pulse"
                style={{ background: 'rgba(124,111,247,0.12)', border: '1px solid rgba(124,111,247,0.2)' }}>
                🔍
              </div>
              <div className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Sedang Memproses...</div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>{loadingMsg}</div>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#7c6ff7', animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <div className="mt-8 text-xs" style={{ color: 'var(--muted)' }}>
              Mengambil screenshot dari: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{url}</span>
            </div>
          </div>
        )}

        {/* ── RESULT STEP ───────────────────────────────────────────────── */}
        {step === 'result' && result && (
          <div className="space-y-6">

            {/* Status banner */}
            <div className="rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4"
              style={{
                background: overallPassed ? 'rgba(34,212,122,0.06)' : 'rgba(240,79,92,0.06)',
                border: `1px solid ${overallPassed ? 'rgba(34,212,122,0.25)' : 'rgba(240,79,92,0.25)'}`,
              }}>
              <div>
                <div className="text-2xl font-bold mb-1" style={{ color: overallPassed ? '#22d47a' : '#f04f5c' }}>
                  {overallPassed ? '✅ PASSED' : '❌ FAILED'}
                </div>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>
                  Visual: {result.diffPercentage.toFixed(3)}% diff{result.passed ? ' ✓' : ' ✗'}
                  {assertionResults.length > 0 && (
                    <> · Konten: {assertionResults.filter((a) => a.passed).length}/{assertionResults.length} lolos{allAssertPassed ? ' ✓' : ' ✗'}</>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={downloadReport}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg,#7c6ff7,#5b8ef0)', boxShadow: '0 2px 12px rgba(124,111,247,0.35)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}>
                  ⬇ Download Report
                </button>
                <button onClick={() => { setStep('form'); setResult(null); setError(null); }}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
                  ↩ Test Ulang
                </button>
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Diff %', value: result.diffPercentage.toFixed(3) + '%', color: result.passed ? '#22d47a' : '#f04f5c' },
                { label: 'Diff Pixels', value: result.diffPixels.toLocaleString(), color: 'var(--text)' },
                { label: 'Viewport', value: result.viewport.name, color: '#a78bfa' },
                { label: 'Threshold', value: result.threshold + '%', color: 'var(--muted)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
                  <div className="text-xl font-bold" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Assertion results */}
            {assertionResults.length > 0 && (
              <div className="rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Cek Konten Elemen</h3>
                  <span className="text-xs font-mono" style={{ color: allAssertPassed ? '#22d47a' : '#f04f5c' }}>
                    {assertionResults.filter((a) => a.passed).length}/{assertionResults.length} lolos
                  </span>
                </div>
                <div className="space-y-2">
                  {assertionResults.map((a, i) => (
                    <div key={i} className="flex gap-3 px-4 py-3 rounded-xl"
                      style={{
                        background: a.passed ? 'rgba(34,212,122,0.04)' : 'rgba(240,79,92,0.04)',
                        border: `1px solid ${a.passed ? 'rgba(34,212,122,0.2)' : 'rgba(240,79,92,0.25)'}`,
                      }}>
                      <span>{a.passed ? '✅' : '❌'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm" style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{a.selector}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                          Diharapkan mengandung: <strong style={{ color: 'var(--text)' }}>&quot;{a.expected}&quot;</strong>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>
                          {a.found ? <>Teks aktual: &quot;{(a.actual ?? '').slice(0, 150)}&quot;</> : 'Elemen tidak ditemukan'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Image comparison */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>

              {/* Tabs */}
              <div className="flex border-b" style={{ borderColor: 'var(--border)', padding: '0 4px' }}>
                {(['baseline', 'current', 'diff', 'compare'] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className="px-4 py-3 text-sm font-medium capitalize transition-all"
                    style={{
                      color: activeTab === tab ? '#a78bfa' : 'var(--muted)',
                      borderBottom: activeTab === tab ? '2px solid #a78bfa' : '2px solid transparent',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}>
                    {tab === 'compare' ? 'Compare ⟷' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Tab panels */}
              <div style={{ background: 'var(--bg3)', padding: 16 }}>
                {activeTab !== 'compare' && (
                  <img
                    src={result.images[activeTab as 'baseline' | 'current' | 'diff']}
                    alt={activeTab}
                    className="w-full rounded-xl"
                    style={{ border: '1px solid var(--border)', display: 'block' }}
                  />
                )}

                {activeTab === 'compare' && (
                  <>
                    <div
                      ref={compareSliderRef}
                      className="rounded-xl overflow-hidden relative cursor-col-resize select-none"
                      style={{ border: '1px solid var(--border)', paddingBottom: '56.25%', height: 0, position: 'relative' }}
                      onMouseDown={() => (isDraggingSlider.current = true)}
                      onMouseMove={onSliderMove}
                      onMouseUp={() => (isDraggingSlider.current = false)}
                      onMouseLeave={() => (isDraggingSlider.current = false)}
                      onTouchStart={() => (isDraggingSlider.current = true)}
                      onTouchMove={onSliderMove}
                      onTouchEnd={() => (isDraggingSlider.current = false)}
                    >
                      {/* baseline (bottom) */}
                      <div className="absolute inset-0">
                        <img src={result.images.baseline} alt="Baseline" className="w-full h-full object-contain" style={{ display: 'block' }} />
                      </div>
                      {/* current (clipped on top) */}
                      <div className="compare-current absolute inset-0" style={{ clipPath: 'inset(0 50% 0 0)' }}>
                        <img src={result.images.current} alt="Current" className="w-full h-full object-contain" style={{ display: 'block' }} />
                      </div>
                      {/* handle */}
                      <div className="compare-handle absolute top-0 h-full flex flex-col items-center pointer-events-none" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                        <div className="w-0.5 h-full" style={{ background: 'rgba(255,255,255,0.85)' }} />
                        <div className="absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white flex items-center justify-center text-sm font-bold text-gray-700" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>⟷</div>
                      </div>
                    </div>
                    <p className="text-center text-xs mt-2" style={{ color: 'var(--muted)' }}>← Drag untuk membandingkan →</p>
                  </>
                )}
              </div>
            </div>

            {/* Info footer */}
            <div className="rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              {[
                { label: 'URL', value: result.url },
                { label: 'Waktu Test', value: new Date(result.timestamp).toLocaleString('id-ID') },
                { label: 'Viewport', value: `${result.viewport.width}×${result.viewport.height} (${result.viewport.name})` },
                { label: 'Durasi', value: result.duration < 1000 ? result.duration + 'ms' : (result.duration / 1000).toFixed(1) + 's' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
                  <div className="text-sm" style={{ color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{value}</div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
