'use client';

import { useState, useRef } from 'react';
import {
  generateReportHTML,
  type JourneyReportData,
  type CheckpointResult,
  type ActionStep,
  type AssertionInput,
} from '@/lib/report';

// ── Constants & types ──────────────────────────────────────────────────────

const VIEWPORT_PRESETS = [
  { name: 'Desktop', label: 'Desktop', width: 1440, height: 900 },
  { name: 'Tablet', label: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', label: 'Mobile', width: 390, height: 844 },
  { name: 'Custom', label: 'Custom', width: 0, height: 0 },
] as const;

interface CheckpointUI {
  id: string;
  name: string;
  steps: ActionStep[];
  hide: string; // satu selector per baris
  assertions: AssertionInput[];
  baseline: string | null;
}

function newCheckpoint(n: number): CheckpointUI {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    name: n === 1 ? 'Halaman awal (sebelum aksi)' : `Checkpoint ${n}`,
    steps: [],
    hide: '',
    assertions: [],
    baseline: null,
  };
}

const parseHide = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const cleanSteps = (steps: ActionStep[]) => steps.filter((s) => s.action === 'wait' || s.selector.trim() !== '');

const card = { background: 'var(--bg2)', border: '1px solid var(--border)' };
const inputStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
};

// ── Step editor (langkah sebelum checkpoint) ───────────────────────────────

function StepEditor({ steps, onChange }: { steps: ActionStep[]; onChange: (s: ActionStep[]) => void }) {
  const upd = (i: number, patch: Partial<ActionStep>) => onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const rm = (i: number) => onChange(steps.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const t = i + dir;
    if (t < 0 || t >= steps.length) return;
    const next = [...steps];
    [next[i], next[t]] = [next[t], next[i]];
    onChange(next);
  };
  return (
    <div>
      {steps.length > 0 && (
        <div className="space-y-2 mb-2">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
              <span className="text-xs px-1" style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>{i + 1}</span>
              <select value={step.action} onChange={(e) => upd(i, { action: e.target.value as ActionStep['action'] })}
                className="rounded-lg px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="fill">Isi field</option>
                <option value="click">Klik</option>
                <option value="wait">Tunggu</option>
              </select>
              {step.action !== 'wait' && (
                <input type="text" value={step.selector} onChange={(e) => upd(i, { selector: e.target.value })}
                  placeholder="//input[@id='email'] atau #email"
                  className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
                  style={{ ...inputStyle, minWidth: 130, fontFamily: "'JetBrains Mono', monospace" }} />
              )}
              {step.action !== 'click' && (
                <input type={step.action === 'wait' ? 'number' : 'text'} value={step.value} onChange={(e) => upd(i, { value: e.target.value })}
                  placeholder={step.action === 'wait' ? 'ms (mis. 2000)' : 'nilai / teks'}
                  className="rounded-lg px-3 py-1.5 text-xs outline-none"
                  style={{ ...inputStyle, width: step.action === 'wait' ? 130 : 150 }} />
              )}
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 rounded-lg text-xs" style={{ ...inputStyle, color: 'var(--muted)', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="px-2 py-1 rounded-lg text-xs" style={{ ...inputStyle, color: 'var(--muted)', opacity: i === steps.length - 1 ? 0.3 : 1 }}>↓</button>
                <button type="button" onClick={() => rm(i)} className="px-2 py-1 rounded-lg text-xs" style={{ color: '#f04f5c', background: 'rgba(240,79,92,0.08)', border: '1px solid rgba(240,79,92,0.15)' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => onChange([...steps, { action: 'fill', selector: '', value: '' }])}
        className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'rgba(124,111,247,0.12)', color: '#a78bfa', border: '1px dashed rgba(124,111,247,0.3)' }}>
        + Langkah
      </button>
    </div>
  );
}

// ── Assertion editor ───────────────────────────────────────────────────────

function AssertionEditor({ items, onChange }: { items: AssertionInput[]; onChange: (a: AssertionInput[]) => void }) {
  const upd = (i: number, patch: Partial<AssertionInput>) => onChange(items.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const rm = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div>
      {items.length > 0 && (
        <div className="space-y-2 mb-2">
          {items.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input type="text" value={a.selector} onChange={(e) => upd(i, { selector: e.target.value })}
                placeholder="selector (CSS/XPath)" className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ ...inputStyle, minWidth: 130, fontFamily: "'JetBrains Mono', monospace" }} />
              <input type="text" value={a.expected} onChange={(e) => upd(i, { expected: e.target.value })}
                placeholder="teks yang diharapkan" className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none" style={{ ...inputStyle, minWidth: 130 }} />
              <button type="button" onClick={() => rm(i)} className="px-2 py-1 rounded-lg text-xs" style={{ color: '#f04f5c', background: 'rgba(240,79,92,0.08)', border: '1px solid rgba(240,79,92,0.15)' }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => onChange([...items, { selector: '', expected: '' }])}
        className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'rgba(124,111,247,0.12)', color: '#a78bfa', border: '1px dashed rgba(124,111,247,0.3)' }}>
        + Cek konten
      </button>
    </div>
  );
}

// ── Result card (per checkpoint) ───────────────────────────────────────────

function ResultCard({ r, idx, threshold }: { r: CheckpointResult; idx: number; threshold: number }) {
  const [tab, setTab] = useState<'baseline' | 'current' | 'diff' | 'compare'>('baseline');
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const assertPassed = r.assertionResults.every((a) => a.passed);
  const passed = r.passed && assertPassed;

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!dragging.current || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(((clientX - rect.left) / rect.width) * 100, 100));
    const cur = sliderRef.current.querySelector<HTMLElement>('.cmp-current');
    const handle = sliderRef.current.querySelector<HTMLElement>('.cmp-handle');
    if (cur) cur.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    if (handle) handle.style.left = `${pct}%`;
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={card}>
      <div className="p-5 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(124,111,247,0.15)', color: '#a78bfa' }}>{idx + 1}</span>
          <div>
            <div className="font-semibold" style={{ color: 'var(--text)' }}>{r.name || `Checkpoint ${idx + 1}`}</div>
            <div className="text-xs" style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>
              {r.diffPercentage.toFixed(3)}% diff
              {r.assertionResults.length > 0 && ` · konten ${r.assertionResults.filter((a) => a.passed).length}/${r.assertionResults.length}`}
            </div>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ color: passed ? '#22d47a' : '#f04f5c', background: passed ? 'rgba(34,212,122,0.1)' : 'rgba(240,79,92,0.1)', border: `1px solid ${passed ? 'rgba(34,212,122,0.25)' : 'rgba(240,79,92,0.25)'}` }}>
          {passed ? '✅ PASSED' : '❌ FAILED'}
        </span>
      </div>

      {r.assertionResults.length > 0 && (
        <div className="p-4 space-y-2" style={{ borderBottom: '1px solid var(--border)' }}>
          {r.assertionResults.map((a, i) => (
            <div key={i} className="flex gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: a.passed ? 'rgba(34,212,122,0.04)' : 'rgba(240,79,92,0.04)', border: `1px solid ${a.passed ? 'rgba(34,212,122,0.2)' : 'rgba(240,79,92,0.25)'}` }}>
              <span>{a.passed ? '✅' : '❌'}</span>
              <div className="min-w-0">
                <div style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{a.selector}</div>
                <div style={{ color: 'var(--muted)', marginTop: 2 }}>Diharapkan: <strong style={{ color: 'var(--text)' }}>&quot;{a.expected}&quot;</strong></div>
                <div style={{ color: '#6a6a85', marginTop: 1 }}>{a.found ? <>Aktual: &quot;{(a.actual ?? '').slice(0, 120)}&quot;</> : 'Elemen tidak ditemukan'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex" style={{ borderBottom: '1px solid var(--border)', padding: '0 4px' }}>
        {(['baseline', 'current', 'diff', 'compare'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-2.5 text-sm font-medium"
            style={{ color: tab === t ? '#a78bfa' : 'var(--muted)', borderBottom: tab === t ? '2px solid #a78bfa' : '2px solid transparent', background: 'none', border: 'none', cursor: 'pointer' }}>
            {t === 'compare' ? 'Compare ⟷' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--bg3)', padding: 16 }}>
        {tab !== 'compare' && <img src={r.images[tab]} alt={tab} className="w-full rounded-lg" style={{ border: '1px solid var(--border)', display: 'block' }} />}
        {tab === 'compare' && (
          <>
            <div ref={sliderRef} className="rounded-lg overflow-hidden relative cursor-col-resize select-none"
              style={{ border: '1px solid var(--border)', paddingBottom: '56.25%', height: 0 }}
              onMouseDown={() => (dragging.current = true)} onMouseMove={move} onMouseUp={() => (dragging.current = false)} onMouseLeave={() => (dragging.current = false)}
              onTouchStart={() => (dragging.current = true)} onTouchMove={move} onTouchEnd={() => (dragging.current = false)}>
              <div className="absolute inset-0"><img src={r.images.baseline} alt="Baseline" className="w-full h-full object-contain" /></div>
              <div className="cmp-current absolute inset-0" style={{ clipPath: 'inset(0 50% 0 0)' }}><img src={r.images.current} alt="Current" className="w-full h-full object-contain" /></div>
              <div className="cmp-handle absolute top-0 h-full flex flex-col items-center pointer-events-none" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                <div className="w-0.5 h-full" style={{ background: 'rgba(255,255,255,0.85)' }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white flex items-center justify-center text-sm font-bold text-gray-700" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>⟷</div>
              </div>
            </div>
            <p className="text-center text-xs mt-2" style={{ color: 'var(--muted)' }}>← Drag untuk membandingkan →</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<'form' | 'loading' | 'result'>('form');
  const [result, setResult] = useState<JourneyReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'capture' | 'test'>('');
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('');

  const [url, setUrl] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customW, setCustomW] = useState(1280);
  const [customH, setCustomH] = useState(800);
  const [threshold, setThreshold] = useState(0.1);
  const [checkpoints, setCheckpoints] = useState<CheckpointUI[]>([newCheckpoint(1)]);

  const preset = VIEWPORT_PRESETS[selectedPreset];
  const viewport = preset.name === 'Custom' ? { name: 'Custom', width: customW, height: customH } : { name: preset.name, width: preset.width, height: preset.height };

  const updateCp = (id: string, patch: Partial<CheckpointUI>) => setCheckpoints((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCp = (id: string) => setCheckpoints((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  const addCp = () => setCheckpoints((prev) => [...prev, newCheckpoint(prev.length + 1)]);

  // ── Baseline per checkpoint ────────────────────────────────────────────────

  /** Capture baseline 1 checkpoint: jalankan journey s/d checkpoint ini, ambil shot terakhir. */
  async function captureOne(id: string) {
    const v = validateBasics();
    if (v) { setError(v); return; }
    const idx = checkpoints.findIndex((c) => c.id === id);
    if (idx < 0) return;
    setCapturingId(id);
    setError(null);
    try {
      const slice = checkpoints.slice(0, idx + 1);
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          width: viewport.width,
          height: viewport.height,
          checkpoints: slice.map((c) => ({ name: c.name, steps: cleanSteps(c.steps), hideSelectors: parseHide(c.hide) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal capture baseline.');
      const shot = data.shots[idx];
      if (shot) updateCp(id, { baseline: shot });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal capture baseline checkpoint.');
    } finally {
      setCapturingId(null);
    }
  }

  /** Upload baseline manual dari file lokal. */
  function uploadOne(id: string, file: File) {
    if (!file.type.startsWith('image/')) { setError('File baseline harus berupa gambar (PNG/JPG).'); return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => updateCp(id, { baseline: e.target?.result as string });
    reader.readAsDataURL(file);
  }

  const clearOne = (id: string) => updateCp(id, { baseline: null });

  function validateBasics(): string | null {
    if (!url.trim() || !url.startsWith('http')) return 'URL harus dimulai dengan http:// atau https://';
    if (viewport.width < 1 || viewport.height < 1) return 'Ukuran viewport tidak valid.';
    if (checkpoints.length === 0) return 'Minimal harus ada 1 checkpoint.';
    return null;
  }

  async function captureBaselines() {
    const v = validateBasics();
    if (v) { setError(v); return; }
    setBusy('capture');
    setError(null);
    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          width: viewport.width,
          height: viewport.height,
          checkpoints: checkpoints.map((c) => ({ name: c.name, steps: cleanSteps(c.steps), hideSelectors: parseHide(c.hide) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal capture baseline.');
      setCheckpoints((prev) => prev.map((c, i) => ({ ...c, baseline: data.shots[i] ?? c.baseline })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal capture baseline.');
    } finally {
      setBusy('');
    }
  }

  async function runTest() {
    const v = validateBasics();
    if (v) { setError(v); return; }
    if (checkpoints.some((c) => !c.baseline)) {
      setError('Semua checkpoint harus punya baseline. Klik "Capture Baseline Journey" dulu.');
      return;
    }
    setBusy('test');
    setStep('loading');
    setError(null);
    setLoadingMsg('Menjalankan journey & membandingkan tiap checkpoint...');
    try {
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          width: viewport.width,
          height: viewport.height,
          threshold,
          viewportName: viewport.name,
          checkpoints: checkpoints.map((c) => ({
            name: c.name,
            steps: cleanSteps(c.steps),
            hideSelectors: parseHide(c.hide),
            assertions: c.assertions.filter((a) => a.selector.trim() && a.expected.trim()),
            baseline: c.baseline,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menjalankan test.');
      setResult(data as JourneyReportData);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan test.');
      setStep('form');
    } finally {
      setBusy('');
    }
  }

  function downloadReport() {
    if (!result) return;
    const html = generateReportHTML(result);
    const blob = new Blob([html], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vrt-journey-${Date.now()}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ── Export / Import konfigurasi journey ────────────────────────────────────

  function exportConfig() {
    const config = {
      type: 'vrt-journey-config',
      version: 1,
      url,
      selectedPreset,
      customW,
      customH,
      threshold,
      checkpoints: checkpoints.map((c) => ({
        name: c.name,
        steps: c.steps,
        hide: c.hide,
        assertions: c.assertions,
        baseline: c.baseline,
      })),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vrt-config-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importConfig(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const cfg = JSON.parse(e.target?.result as string);
        if (!cfg || !Array.isArray(cfg.checkpoints)) throw new Error('Format file tidak dikenali.');
        if (typeof cfg.url === 'string') setUrl(cfg.url);
        if (Number.isInteger(cfg.selectedPreset) && cfg.selectedPreset >= 0 && cfg.selectedPreset < VIEWPORT_PRESETS.length) setSelectedPreset(cfg.selectedPreset);
        if (typeof cfg.customW === 'number') setCustomW(cfg.customW);
        if (typeof cfg.customH === 'number') setCustomH(cfg.customH);
        if (typeof cfg.threshold === 'number') setThreshold(cfg.threshold);
        setCheckpoints(
          cfg.checkpoints.map((c: Partial<CheckpointUI>, i: number) => ({
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
            name: c.name ?? `Checkpoint ${i + 1}`,
            steps: Array.isArray(c.steps) ? c.steps : [],
            hide: typeof c.hide === 'string' ? c.hide : '',
            assertions: Array.isArray(c.assertions) ? c.assertions : [],
            baseline: typeof c.baseline === 'string' ? c.baseline : null,
          }))
        );
        setStep('form');
        setResult(null);
      } catch (err) {
        setError(err instanceof Error ? `Gagal import: ${err.message}` : 'Gagal import file.');
      }
    };
    reader.readAsText(file);
  }

  const baselinesReady = checkpoints.every((c) => c.baseline);
  const cpPassed = (r: CheckpointResult) => r.passed && r.assertionResults.every((a) => a.passed);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 800px 500px at 20% 0%, rgba(124,111,247,0.07) 0%, transparent 70%)' }} />
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg,#7c6ff7,#5b8ef0)', boxShadow: '0 4px 16px rgba(124,111,247,0.4)' }}>🔍</div>
              <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg,#fff 30%,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Visual Regression — Journey</h1>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={exportConfig}
                className="text-sm px-3 py-2 rounded-xl font-medium" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                ⬇ Export
              </button>
              <label className="text-sm px-3 py-2 rounded-xl font-medium cursor-pointer" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                ⬆ Import
                <input type="file" accept="application/json,.json" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importConfig(f); e.target.value = ''; }} />
              </label>
            </div>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Uji UI bertahap dalam satu sesi: sebelum login → sesudah login → halaman berikutnya. State login terbawa antar-checkpoint. Pakai <strong style={{ color: '#a78bfa' }}>Export/Import</strong> agar konfigurasi & baseline tidak hilang saat server restart.
          </p>
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm mb-6" style={{ background: 'rgba(240,79,92,0.08)', border: '1px solid rgba(240,79,92,0.25)', color: '#f04f5c' }}>⚠️ {error}</div>
        )}

        {step === 'form' && (
          <div className="space-y-6">
            {/* URL */}
            <div className="rounded-2xl p-6" style={card}>
              <label className="block text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>1. URL Awal</label>
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
            </div>

            {/* Viewport */}
            <div className="rounded-2xl p-6" style={card}>
              <label className="block text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>2. Ukuran Layar (Viewport)</label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {VIEWPORT_PRESETS.map((p, i) => (
                  <button key={p.name} type="button" onClick={() => setSelectedPreset(i)} className="rounded-xl py-3 text-sm font-medium"
                    style={{ background: selectedPreset === i ? 'linear-gradient(135deg,#7c6ff7,#5b8ef0)' : 'rgba(255,255,255,0.04)', border: selectedPreset === i ? '1px solid transparent' : '1px solid var(--border)', color: selectedPreset === i ? '#fff' : 'var(--muted)' }}>
                    {p.label}
                    {p.name !== 'Custom' && <div className="text-xs mt-0.5" style={{ opacity: 0.75, fontFamily: 'monospace' }}>{p.width}×{p.height}</div>}
                  </button>
                ))}
              </div>
              {preset.name === 'Custom' && (
                <div className="flex gap-3">
                  <div className="flex-1"><div className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>Width</div>
                    <input type="number" value={customW} onChange={(e) => setCustomW(Number(e.target.value))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ ...inputStyle, fontFamily: 'monospace' }} /></div>
                  <div className="flex-1"><div className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>Height</div>
                    <input type="number" value={customH} onChange={(e) => setCustomH(Number(e.target.value))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ ...inputStyle, fontFamily: 'monospace' }} /></div>
                </div>
              )}
            </div>

            {/* Threshold */}
            <div className="rounded-2xl p-6" style={card}>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>3. Threshold</label>
                <span className="text-sm font-mono" style={{ color: '#7c6ff7' }}>{threshold.toFixed(2)}%</span>
              </div>
              <input type="range" min={0} max={5} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-violet-500" />
            </div>

            {/* Checkpoints */}
            <div className="rounded-2xl p-6" style={card}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>4. Checkpoint Journey</label>
                <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>{checkpoints.length} checkpoint</span>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                Tiap checkpoint = 1 screenshot+perbandingan. <strong style={{ color: '#a78bfa' }}>Langkah</strong> dijalankan SEBELUM checkpoint-nya. Contoh: Checkpoint 1 (tanpa langkah) = halaman awal · Checkpoint 2 (langkah: isi user, isi pass, klik login) = setelah login.
              </p>

              <div className="space-y-4">
                {checkpoints.map((c, idx) => (
                  <div key={c.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-lg inline-flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(124,111,247,0.15)', color: '#a78bfa' }}>{idx + 1}</span>
                      <input type="text" value={c.name} onChange={(e) => updateCp(c.id, { name: e.target.value })} placeholder="Nama checkpoint"
                        className="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium outline-none" style={inputStyle} />
                      <button type="button" onClick={() => removeCp(c.id)} disabled={checkpoints.length === 1}
                        className="px-2 py-1 rounded-lg text-xs" style={{ color: '#f04f5c', background: 'rgba(240,79,92,0.08)', border: '1px solid rgba(240,79,92,0.15)', opacity: checkpoints.length === 1 ? 0.3 : 1 }}>✕</button>
                    </div>

                    <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Langkah sebelum checkpoint ini {idx === 0 && '(biasanya kosong — halaman awal)'}</div>
                    <StepEditor steps={c.steps} onChange={(s) => updateCp(c.id, { steps: s })} />

                    <div className="text-xs font-medium mt-3 mb-1.5" style={{ color: 'var(--muted)' }}>Sembunyikan elemen (opsional, 1 selector per baris)</div>
                    <textarea value={c.hide} onChange={(e) => updateCp(c.id, { hide: e.target.value })} rows={2} placeholder=".timestamp&#10;//div[@class='iklan']"
                      className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", resize: 'vertical' }} />

                    <div className="text-xs font-medium mt-3 mb-1.5" style={{ color: 'var(--muted)' }}>Cek konten (opsional)</div>
                    <AssertionEditor items={c.assertions} onChange={(a) => updateCp(c.id, { assertions: a })} />

                    <div className="text-xs font-medium mt-3 mb-1.5" style={{ color: 'var(--muted)' }}>Baseline</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => captureOne(c.id)} disabled={capturingId !== null || busy !== ''}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'rgba(124,111,247,0.12)', color: '#a78bfa', border: '1px solid rgba(124,111,247,0.25)', cursor: capturingId || busy ? 'not-allowed' : 'pointer', opacity: capturingId === c.id ? 0.7 : 1 }}>
                        {capturingId === c.id ? '⏳ Capturing...' : '📸 Capture'}
                      </button>
                      <label className="text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                        📁 Upload
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadOne(c.id, f); e.target.value = ''; }} />
                      </label>
                      {c.baseline && (
                        <button type="button" onClick={() => clearOne(c.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'rgba(240,79,92,0.08)', color: '#f04f5c', border: '1px solid rgba(240,79,92,0.2)' }}>
                          ✕ Hapus
                        </button>
                      )}
                      <span className="text-xs ml-auto" style={{ color: c.baseline ? '#22d47a' : 'var(--muted)' }}>
                        {c.baseline ? 'baseline ✓' : 'belum ada baseline'}
                      </span>
                    </div>
                    {c.baseline && (
                      <img src={c.baseline} alt="baseline" className="w-full rounded-lg mt-2" style={{ border: '1px solid var(--border)', maxHeight: 180, objectFit: 'contain', objectPosition: 'top', background: '#0a0a14' }} />
                    )}
                  </div>
                ))}
              </div>

              <button type="button" onClick={addCp} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(124,111,247,0.12)', color: '#a78bfa', border: '1px dashed rgba(124,111,247,0.3)' }}>
                + Tambah Checkpoint
              </button>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={captureBaselines} disabled={busy !== '' || capturingId !== null}
                className="flex-1 py-4 rounded-2xl text-base font-semibold" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', cursor: busy || capturingId ? 'not-allowed' : 'pointer' }}>
                {busy === 'capture' ? '⏳ Meng-capture journey...' : '📸 Capture Semua Baseline'}
              </button>
              <button type="button" onClick={runTest} disabled={busy !== '' || capturingId !== null || !baselinesReady}
                className="flex-1 py-4 rounded-2xl text-base font-semibold text-white" style={{ background: baselinesReady ? 'linear-gradient(135deg,#7c6ff7,#5b8ef0)' : 'rgba(124,111,247,0.3)', boxShadow: baselinesReady ? '0 4px 24px rgba(124,111,247,0.4)' : 'none', cursor: busy || !baselinesReady ? 'not-allowed' : 'pointer' }}>
                🚀 Jalankan Test Journey
              </button>
            </div>
            {!baselinesReady && <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>Capture baseline dulu sebelum menjalankan test.</p>}
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 animate-pulse" style={{ background: 'rgba(124,111,247,0.12)', border: '1px solid rgba(124,111,247,0.2)' }}>🔍</div>
            <div className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Sedang Memproses...</div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>{loadingMsg}</div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-6">
            <div className="rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4"
              style={{ background: result.results.every(cpPassed) ? 'rgba(34,212,122,0.06)' : 'rgba(240,79,92,0.06)', border: `1px solid ${result.results.every(cpPassed) ? 'rgba(34,212,122,0.25)' : 'rgba(240,79,92,0.25)'}` }}>
              <div>
                <div className="text-2xl font-bold mb-1" style={{ color: result.results.every(cpPassed) ? '#22d47a' : '#f04f5c' }}>
                  {result.results.every(cpPassed) ? '✅ PASSED' : '❌ FAILED'}
                </div>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>
                  {result.results.filter(cpPassed).length}/{result.results.length} checkpoint lolos
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={downloadReport} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#7c6ff7,#5b8ef0)', boxShadow: '0 2px 12px rgba(124,111,247,0.35)' }}>⬇ Download Report</button>
                <button onClick={() => { setStep('form'); setResult(null); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)' }}>↩ Kembali</button>
              </div>
            </div>

            {result.results.map((r, idx) => <ResultCard key={idx} r={r} idx={idx} threshold={result.threshold} />)}
          </div>
        )}
      </div>
    </div>
  );
}
