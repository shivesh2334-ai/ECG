import { useState, useRef, useEffect } from "react";

// ─── Font injection ──────────────────────────────────────────
const injectFonts = () => {
  const el = document.createElement("style");
  el.textContent = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap');
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes slideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes scanLine { 0%{left:-100%} 100%{left:100%} }`;
  document.head.appendChild(el);
};

// ─── API ─────────────────────────────────────────────────────
const MODEL = "claude-sonnet-4-20250514";

async function callClaude(system, userText, imageB64, mime) {
  const content = [];
  if (imageB64) content.push({ type: "image", source: { type: "base64", media_type: mime, data: imageB64 } });
  content.push({ type: "text", text: userText });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "";
}

function parseJSON(text) {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch {}
  return null;
}

// ─── System Prompts ───────────────────────────────────────────
const SYS_TRIAGE = `You are an emergency cardiologist performing rapid ECG triage. Be fast and decisive.
Respond ONLY with valid compact JSON (no markdown, no extra text):
{"imageQuality":"good|poor|unreadable","stemiPresent":true|false,"stemiType":"anterior|inferior|lateral|posterior|RV|none","lifeThreatening":true|false,"threatType":"VF|VT|CHB|AF_rapid|SVT|WPW|none","emergencyAction":"string (max 10 words)","triageNote":"string (max 25 words)"}`;

const SYS_WAVEFORM = `You are a systematic cardiologist performing structured ECG measurement.
Respond ONLY with valid compact JSON (no markdown, no extra text):
{"rate":72,"rateType":"string","rhythm":"string","regularity":"regular|irregular","pWaves":"present|absent|unclear","pr_ms":160,"qrs_ms":90,"qtc_ms":420,"axis":"normal|LAD|RAD|extreme","qrsMorphology":"string","lbbb":false,"rbbb":false,"wpw":false,"stChanges":[{"lead":"string","type":"elevation|depression|none","mm":0}],"tWaves":"string","notable":["string"]}`;

const SYS_SYNTHESIS = `You are a senior consultant cardiologist writing a final ECG report.
Respond ONLY with valid compact JSON (no markdown, no extra text):
{"primaryImpression":"string","confidence":"high|moderate|low","differentials":[{"dx":"string","likelihood":"likely|possible|unlikely","basis":"string (max 12 words)"}],"cannotExclude":["string"],"urgency":"routine|urgent|emergent","management":["string (max 12 words each)"],"narrative":"2-3 sentence clinical summary","pearl":"string (max 25 words)"}`;

// ─── Pipeline step definitions ────────────────────────────────
const PIPELINE = [
  { id: "triage",    label: "Emergency Triage",   icon: "⚡", color: "#FF4444", desc: "STEMI screen · life-threatening arrhythmia · image quality" },
  { id: "waveform",  label: "Waveform Analysis",  icon: "∿",  color: "#00E5A0", desc: "Rate · rhythm · axis · intervals · ST & T morphology" },
  { id: "synthesis", label: "Clinical Synthesis", icon: "✦",  color: "#4A9EFF", desc: "Impression · differentials · management priority" },
];

// ─── SVG ECG trace ────────────────────────────────────────────
const ECGTrace = ({ color = "#00E5A0", width = 120, height = 36 }) => (
  <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    <polyline
      points={`0,${height/2} ${width*0.1},${height/2} ${width*0.18},${height*0.15} ${width*0.25},${height*0.85} ${width*0.32},${height/2} ${width*0.38},${height/2} ${width*0.42},${height*0.2} ${width*0.46},${height*0.8} ${width*0.5},${height/2} ${width*0.7},${height/2} ${width*0.78},${height*0.2} ${width*0.82},${height*0.8} ${width*0.86},${height/2} ${width},${height/2}`}
      fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

// ─── Urgency colours ──────────────────────────────────────────
const urgencyMap = { routine: "#00E5A0", urgent: "#FFB800", emergent: "#FF4444" };

// ─── Main App ─────────────────────────────────────────────────
export default function ECGAnalyser() {
  useEffect(injectFonts, []);

  const [patient, setPatient] = useState({
    age: "", sex: "M", symptoms: "", duration: "", bp: "",
    medications: "", priorECG: "", scenario: "Emergency"
  });
  const [image, setImage] = useState(null);
  const [steps, setSteps] = useState(PIPELINE.map(s => ({ ...s, status: "idle", result: null })));
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("upload");
  const fileRef = useRef();

  const upd = (idx, patch) => setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  const updPatient = (k, v) => setPatient(p => ({ ...p, [k]: v }));

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => setImage({ b64: e.target.result.split(",")[1], mime: file.type, url: e.target.result });
    reader.readAsDataURL(file);
  };

  const ctx = () =>
    `Patient: ${patient.age}yr ${patient.sex} | Symptoms: ${patient.symptoms || "unspecified"} | Duration: ${patient.duration || "unknown"} | BP: ${patient.bp || "unknown"} | Medications: ${patient.medications || "none stated"} | Prior ECG context: ${patient.priorECG || "not available"} | Setting: ${patient.scenario}`;

  const analyse = async () => {
    if (!image) { setError("Upload an ECG image to begin."); return; }
    setError(""); setRunning(true); setReport(null);
    setSteps(PIPELINE.map(s => ({ ...s, status: "idle", result: null })));
    const c = ctx();
    let t = null, w = null;
    try {
      // Step 1
      upd(0, { status: "running" });
      const tr = await callClaude(SYS_TRIAGE, `${c}\n\nPerform emergency triage on this ECG.`, image.b64, image.mime);
      t = parseJSON(tr);
      upd(0, { status: "done", result: t });

      // Step 2
      upd(1, { status: "running" });
      const wr = await callClaude(SYS_WAVEFORM, `${c}\n\nTriage result: ${JSON.stringify(t)}\n\nPerform detailed waveform analysis of this ECG.`, image.b64, image.mime);
      w = parseJSON(wr);
      upd(1, { status: "done", result: w });

      // Step 3
      upd(2, { status: "running" });
      const sr = await callClaude(SYS_SYNTHESIS, `${c}\n\nTriage: ${JSON.stringify(t)}\n\nWaveform: ${JSON.stringify(w)}\n\nWrite the final clinical ECG report.`, image.b64, image.mime);
      const s = parseJSON(sr);
      upd(2, { status: "done", result: s });

      setReport({ triage: t, waveform: w, synthesis: s });
    } catch (e) {
      setError("Analysis error: " + e.message);
      setSteps(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s));
    } finally {
      setRunning(false);
    }
  };

  const S = styles;

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <ECGTrace color="#00E5A0" width={100} height={30} />
          <div>
            <div style={S.appTitle}>ECG · AI ANALYSER</div>
            <div style={S.appSub}>EMC Digitals · Clinical Decision Support Stack v1.0</div>
          </div>
        </div>
        <div style={S.headerRight}>
          <div style={S.modelBadge}>claude-sonnet-4</div>
          <div style={S.pipelineBadge}>3-Stage Pipeline</div>
        </div>
      </header>

      <div style={S.body}>
        {/* ── Left Input Panel ── */}
        <aside style={S.aside}>
          {/* Tabs */}
          <div style={S.tabs}>
            {["upload", "patient"].map(t => (
              <button key={t} style={{ ...S.tab, ...(activeTab === t ? S.tabActive : {}) }}
                onClick={() => setActiveTab(t)}>
                {t === "upload" ? "📡 ECG Image" : "🩺 Patient Context"}
              </button>
            ))}
          </div>

          {activeTab === "upload" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Drop zone */}
              <div
                style={{ ...S.dropzone, ...(image ? S.dzFilled : {}) }}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current.click()}
              >
                {image ? (
                  <img src={image.url} alt="ECG" style={S.ecgImg} />
                ) : (
                  <div style={S.dzEmpty}>
                    <div style={S.dzIcon}>
                      <ECGTrace color="#1A2E45" width={80} height={28} />
                    </div>
                    <div style={S.dzText}>Drop ECG image here</div>
                    <div style={S.dzSub}>or click to browse</div>
                    <div style={S.dzFormats}>JPEG · PNG · WEBP · GIF</div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />
              {image && (
                <button style={S.clearBtn} onClick={() => setImage(null)}>✕ Remove image</button>
              )}

              {/* Quick tips */}
              <div style={S.tipsBox}>
                <div style={S.tipsTitle}>📋 For best results</div>
                {["Use full 12-lead ECG print", "Ensure all leads visible", "Avoid glare / angle distortion", "Include lead labels if possible"].map((t, i) => (
                  <div key={i} style={S.tipItem}>◆ {t}</div>
                ))}
              </div>
            </div>
          ) : (
            <div style={S.form}>
              {[
                { label: "Age (years)", key: "age", type: "number", placeholder: "e.g. 58" },
                { label: "Blood pressure", key: "bp", type: "text", placeholder: "e.g. 90/60 mmHg" },
                { label: "Presenting symptoms", key: "symptoms", type: "text", placeholder: "chest pain, palpitations, syncope..." },
                { label: "Duration of symptoms", key: "duration", type: "text", placeholder: "e.g. 2 hours, onset at rest" },
                { label: "Relevant medications", key: "medications", type: "text", placeholder: "amiodarone, digoxin, antidepressants..." },
                { label: "Prior ECG / history", key: "priorECG", type: "text", placeholder: "known LBBB, prior MI, WPW..." },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key} style={S.formGroup}>
                  <label style={S.formLabel}>{label}</label>
                  <input style={S.formInput} type={type} placeholder={placeholder}
                    value={patient[key]} onChange={e => updPatient(key, e.target.value)} />
                </div>
              ))}
              <div style={S.formGroup}>
                <label style={S.formLabel}>Sex</label>
                <select style={S.formInput} value={patient.sex} onChange={e => updPatient("sex", e.target.value)}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div style={S.formGroup}>
                <label style={S.formLabel}>Clinical setting</label>
                <select style={S.formInput} value={patient.scenario} onChange={e => updPatient("scenario", e.target.value)}>
                  {["Emergency", "CCU", "ICU", "OPD", "Pre-operative", "Routine screening", "Post-procedure"].map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Analyse button */}
          {error && <div style={S.errorBox}>{error}</div>}
          <button style={{ ...S.analyseBtn, opacity: running ? 0.65 : 1 }}
            onClick={analyse} disabled={running}>
            {running ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #060A14", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Analysing ECG…
              </span>
            ) : "⚡ Run ECG Analysis"}
          </button>
          <div style={S.disclaimer}>For clinical decision support only · Not a substitute for physician judgement</div>
        </aside>

        {/* ── Main Analysis Panel ── */}
        <main style={S.main}>
          {/* Pipeline */}
          <div style={S.pipelineCard}>
            <div style={S.sectionTitle}>Analysis Pipeline</div>
            <div style={S.pipeline}>
              {steps.map((step, i) => {
                const isRunning = step.status === "running";
                const isDone = step.status === "done";
                return (
                  <div key={step.id} style={{ ...S.pipeStep, ...(isRunning ? { borderColor: step.color + "40", backgroundColor: step.color + "06" } : isDone ? { borderColor: step.color + "30" } : {}) }}>
                    {/* Connector */}
                    {i < steps.length - 1 && <div style={S.connector} />}

                    <div style={S.pipeStepInner}>
                      {/* Number/status dot */}
                      <div style={{ ...S.dot, backgroundColor: isDone ? step.color : isRunning ? step.color + "30" : "#0D1E30", border: `1px solid ${isDone || isRunning ? step.color : "#1A2535"}` }}>
                        {isRunning ? <span style={{ animation: "pulse 1s ease-in-out infinite", color: step.color, fontWeight: 700, fontSize: 13 }}>◌</span>
                          : isDone ? <span style={{ color: "#060A14", fontWeight: 700 }}>✓</span>
                          : <span style={{ color: "#2A3A4A", fontWeight: 700, fontSize: 12 }}>{i + 1}</span>}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ ...S.pipeLabel, color: isDone ? "#E8F0F8" : isRunning ? step.color : "#3D5570" }}>
                          {step.icon} {step.label}
                        </div>
                        <div style={S.pipeDesc}>{step.desc}</div>
                      </div>

                      <div style={{ ...S.pipeStatus, color: isDone ? "#00E5A0" : isRunning ? step.color : "#1A2535" }}>
                        {isDone ? "● Complete" : isRunning ? "● Processing" : "○ Pending"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Report */}
          {report ? (
            <ReportPanel report={report} />
          ) : (
            <div style={S.idlePanel}>
              <div style={{ opacity: 0.12 }}><ECGTrace color="#00E5A0" width={160} height={50} /></div>
              <div style={S.idleTitle}>Awaiting ECG Input</div>
              <div style={S.idleText}>Upload a 12-lead ECG image and optionally fill patient context, then click Analyse to run the 3-stage AI pipeline</div>
              <div style={S.idleStages}>
                {PIPELINE.map(p => (
                  <div key={p.id} style={S.idleStage}>
                    <span style={{ color: p.color }}>{p.icon}</span>
                    <span>{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <footer style={S.footer}>
        <div>⚠ NOT FOR INDEPENDENT CLINICAL DECISIONS · Always verify with attending physician · EMC Digitals AI Clinical Stack · Powered by Anthropic Claude</div>
      </footer>
    </div>
  );
}

// ─── Report Panel ─────────────────────────────────────────────
function ReportPanel({ report }) {
  const { triage, waveform, synthesis } = report;
  const uc = urgencyMap[synthesis?.urgency] || "#00E5A0";
  const S = styles;

  return (
    <div style={{ ...S.reportPanel, animation: "slideIn 0.4s ease" }}>
      {/* Emergency Banner */}
      {triage?.lifeThreatening && (
        <div style={S.emergBanner}>
          🚨 EMERGENCY · {triage.emergencyAction?.toUpperCase()}
        </div>
      )}

      {/* Header row */}
      <div style={S.reportHeader}>
        <div style={S.sectionTitle}>Clinical ECG Report</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ ...S.urgBadge, borderColor: uc, color: uc, backgroundColor: uc + "10" }}>
            {(synthesis?.urgency || "—").toUpperCase()}
          </div>
          <div style={{ ...S.confBadge, color: synthesis?.confidence === "high" ? "#00E5A0" : "#FFB800" }}>
            {synthesis?.confidence?.toUpperCase() || "—"} CONFIDENCE
          </div>
        </div>
      </div>

      {/* Primary Impression */}
      <div style={S.impressionCard}>
        <div style={S.impressionLabel}>Primary Impression</div>
        <div style={S.impressionText}>{synthesis?.primaryImpression || "Awaiting synthesis…"}</div>
      </div>

      {/* Measurements */}
      {waveform && (
        <div>
          <div style={S.subHeading}>Measurements</div>
          <div style={S.measureGrid}>
            {[
              { label: "Heart Rate",   val: waveform.rate ? `${waveform.rate}` : "—",        unit: "bpm" },
              { label: "Rhythm",       val: waveform.rhythm || "—",                           unit: "" },
              { label: "Axis",         val: waveform.axis || "—",                             unit: "" },
              { label: "PR Interval",  val: waveform.pr_ms ? `${waveform.pr_ms}` : "—",       unit: "ms" },
              { label: "QRS Duration", val: waveform.qrs_ms ? `${waveform.qrs_ms}` : "—",     unit: "ms" },
              { label: "QTc",          val: waveform.qtc_ms ? `${waveform.qtc_ms}` : "—",     unit: "ms" },
            ].map(({ label, val, unit }) => (
              <div key={label} style={S.mCell}>
                <div style={S.mLabel}>{label}</div>
                <div style={S.mVal}>{val}</div>
                {unit && <div style={S.mUnit}>{unit}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flags row */}
      {waveform && (waveform.lbbb || waveform.rbbb || waveform.wpw) && (
        <div style={S.flagsRow}>
          {waveform.lbbb && <div style={{ ...S.flag, color: "#FF4444", borderColor: "#FF444430", backgroundColor: "#FF444410" }}>LBBB</div>}
          {waveform.rbbb && <div style={{ ...S.flag, color: "#FFB800", borderColor: "#FFB80030", backgroundColor: "#FFB80010" }}>RBBB</div>}
          {waveform.wpw  && <div style={{ ...S.flag, color: "#FF4444", borderColor: "#FF444430", backgroundColor: "#FF444410" }}>WPW</div>}
        </div>
      )}

      {/* ST Changes */}
      {waveform?.stChanges?.some(s => s.type !== "none") && (
        <div>
          <div style={S.subHeading}>ST Changes</div>
          <div style={S.stGrid}>
            {waveform.stChanges.filter(s => s.type !== "none").map((st, i) => (
              <div key={i} style={{ ...S.stCell, borderColor: st.type === "elevation" ? "#FF444440" : "#FFB80040" }}>
                <div style={S.stLead}>{st.lead}</div>
                <div style={{ ...S.stType, color: st.type === "elevation" ? "#FF6060" : "#FFB800" }}>
                  {st.type === "elevation" ? "↑ Elevation" : "↓ Depression"}
                </div>
                <div style={{ fontSize: 13, color: "#8896A6", marginTop: 2 }}>{st.mm} mm</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings */}
      {synthesis?.findings?.length > 0 && (
        <div>
          <div style={S.subHeading}>Key Findings</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {synthesis.findings.map((f, i) => (
              <div key={i} style={{ fontSize: 14, color: "#C5D0DC", lineHeight: 1.5, paddingLeft: 12, borderLeft: `2px solid ${uc}30` }}>
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {synthesis?.recommendations?.length > 0 && (
        <div>
          <div style={S.subHeading}>Recommendations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {synthesis.recommendations.map((r, i) => (
              <div key={i} style={{ fontSize: 14, color: "#C5D0DC", lineHeight: 1.5, paddingLeft: 12, borderLeft: "2px solid #00E5A030" }}>
                {r}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const base = { fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };

const styles = {
  root: { ...base, minHeight: "100vh", backgroundColor: "#060A14", color: "#E0E7EF", display: "flex", flexDirection: "column" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 28px", borderBottom: "1px solid #111A28" },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  appTitle: { ...mono, fontSize: 15, fontWeight: 700, color: "#00E5A0", letterSpacing: 1.2, textTransform: "uppercase" },
  appSub: { fontSize: 11, color: "#4A5A6A", marginTop: 2 },
  headerRight: { display: "flex", gap: 8, alignItems: "center" },
  modelBadge: { ...mono, fontSize: 11, color: "#8896A6", padding: "4px 10px", border: "1px solid #1A2535", borderRadius: 6, backgroundColor: "#0A1420" },
  pipelineBadge: { ...mono, fontSize: 11, color: "#00E5A0", padding: "4px 10px", border: "1px solid #00E5A020", borderRadius: 6, backgroundColor: "#00E5A008" },
  body: { display: "flex", flex: 1, overflow: "hidden" },
  aside: { width: 360, borderRight: "1px solid #111A28", padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  tabs: { display: "flex", gap: 4, marginBottom: 4 },
  tab: { ...base, ...mono, fontSize: 11, padding: "6px 14px", borderRadius: 6, border: "1px solid #1A2535", backgroundColor: "transparent", color: "#8896A6", cursor: "pointer" },
  tabActive: { backgroundColor: "#00E5A010", borderColor: "#00E5A030", color: "#00E5A0" },
  dropzone: { border: "1.5px dashed #1A2535", borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" },
  dzFilled: { borderColor: "#00E5A040", padding: 8 },
  dzEmpty: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  dzIcon: { fontSize: 28, opacity: 0.4 },
  dzText: { fontSize: 14, fontWeight: 600, color: "#C5D0DC" },
  dzSub: { fontSize: 12, color: "#4A5A6A" },
  dzFormats: { ...mono, fontSize: 10, color: "#3A4A5A", marginTop: 4 },
  ecgImg: { width: "100%", borderRadius: 8, maxHeight: 200, objectFit: "contain" },
  clearBtn: { ...base, fontSize: 11, color: "#FF6060", background: "none", border: "none", cursor: "pointer", marginTop: 6 },
  tipsBox: { backgroundColor: "#0A1420", borderRadius: 10, padding: 14, border: "1px solid #111A28" },
  tipsTitle: { fontSize: 12, fontWeight: 600, color: "#8896A6", marginBottom: 8 },
  tipItem: { fontSize: 12, color: "#4A5A6A", lineHeight: 1.8 },
  form: { display: "flex", flexDirection: "column", gap: 10 },
  formGroup: { display: "flex", flexDirection: "column", gap: 4 },
  formLabel: { fontSize: 11, fontWeight: 600, color: "#4A5A6A", textTransform: "uppercase", letterSpacing: 0.5 },
  formInput: { ...base, ...mono, fontSize: 13, padding: "8px 12px", backgroundColor: "#0A1420", border: "1px solid #1A2535", borderRadius: 8, color: "#E0E7EF", outline: "none" },
  errorBox: { fontSize: 13, color: "#FF6060", padding: "10px 14px", borderRadius: 8, border: "1px solid #FF606030", backgroundColor: "#FF606008" },
  analyseBtn: { ...base, ...mono, fontSize: 13, fontWeight: 700, padding: "12px 0", borderRadius: 10, border: "none", backgroundColor: "#00E5A0", color: "#060A14", cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase", width: "100%" },
  disclaimer: { fontSize: 10, color: "#3A4A5A", textAlign: "center" },
  main: { flex: 1, padding: 24, overflowY: "auto" },
  pipelineCard: { marginBottom: 20 },
  sectionTitle: { ...mono, fontSize: 12, fontWeight: 700, color: "#4A5A6A", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  pipeline: { display: "flex", gap: 12 },
  pipeStep: { flex: 1, position: "relative", padding: 16, border: "1px solid #1A2535", borderRadius: 12, backgroundColor: "#0A1420", transition: "all 0.3s" },
  pipeStepInner: { display: "flex", gap: 12, alignItems: "flex-start" },
  connector: { position: "absolute", top: "50%", right: -12, width: 12, height: 1, backgroundColor: "#1A2535" },
  dot: { width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 },
  pipeLabel: { fontSize: 13, fontWeight: 600, color: "#C5D0DC", marginBottom: 2 },
  pipeDesc: { fontSize: 11, color: "#4A5A6A", lineHeight: 1.4 },
  pipeStatus: { ...mono, fontSize: 10, marginTop: 6, color: "#4A5A6A" },
  footer: { textAlign: "center", padding: "12px 0", fontSize: 10, color: "#2A3A4A", borderTop: "1px solid #111A28" },
  idlePanel: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, padding: 40 },
  idleTitle: { ...mono, fontSize: 18, fontWeight: 700, color: "#1A2535", textTransform: "uppercase", letterSpacing: 2 },
  idleText: { fontSize: 14, color: "#3A4A5A", textAlign: "center", maxWidth: 420, lineHeight: 1.6 },
  idleStages: { display: "flex", gap: 24, marginTop: 8 },
  idleStage: { ...mono, fontSize: 11, color: "#2A3A4A", display: "flex", alignItems: "center", gap: 6 },
  reportPanel: { display: "flex", flexDirection: "column", gap: 20, flex: 1 },
  emergBanner: { ...mono, fontSize: 13, fontWeight: 700, color: "#FF4444", padding: "12px 16px", borderRadius: 10, border: "1px solid #FF444030", backgroundColor: "#FF444008", textAlign: "center", letterSpacing: 0.5 },
  reportHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  urgBadge: { ...mono, fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "1px solid", letterSpacing: 0.5 },
  confBadge: { ...mono, fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "1px solid #1A2535", backgroundColor: "#0A1420", letterSpacing: 0.5 },
  impressionCard: { padding: 16, borderRadius: 12, border: "1px solid #1A2535", backgroundColor: "#0A1420" },
  impressionLabel: { ...mono, fontSize: 10, fontWeight: 600, color: "#4A5A6A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  impressionText: { fontSize: 15, fontWeight: 500, color: "#E0E7EF", lineHeight: 1.6 },
  subHeading: { ...mono, fontSize: 11, fontWeight: 700, color: "#4A5A6A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  measureGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 },
  mCell: { padding: "10px 12px", borderRadius: 8, border: "1px solid #1A2535", backgroundColor: "#0A1420", textAlign: "center" },
  mLabel: { fontSize: 10, color: "#4A5A6A", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 },
  mVal: { ...mono, fontSize: 18, fontWeight: 700, color: "#E0E7EF" },
  mUnit: { ...mono, fontSize: 10, color: "#4A5A6A", marginTop: 2 },
  flagsRow: { display: "flex", gap: 8 },
  flag: { ...mono, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6, border: "1px solid", letterSpacing: 0.5 },
  stGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 },
  stCell: { padding: "8px 10px", borderRadius: 8, border: "1px solid", backgroundColor: "#0A1420", textAlign: "center" },
  stLead: { ...mono, fontSize: 13, fontWeight: 700, color: "#E0E7EF", marginBottom: 2 },
  stType: { fontSize: 11, fontWeight: 600 },
};
