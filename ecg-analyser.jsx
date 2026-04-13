import { useState, useRef, useEffect } from "react";

// ─── Inject fonts + keyframes ─────────────────────────────────
const injectStyles = () => {
  const el = document.createElement("style");
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap');
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes slideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes emergPulse { 0%,100%{background:#FF525215} 50%{background:#FF524425} }
  `;
  document.head.appendChild(el);
};

// ─── Load jsPDF + autoTable from CDN ─────────────────────────
const loadJsPDF = () => new Promise((resolve, reject) => {
  if (window.jspdf?.jsPDF) { resolve(); return; }
  const s1 = document.createElement("script");
  s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  s1.onload = () => {
    const s2 = document.createElement("script");
    s2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js";
    s2.onload = resolve;
    s2.onerror = reject;
    document.head.appendChild(s2);
  };
  s1.onerror = reject;
  document.head.appendChild(s1);
});

// ─── PDF generation ───────────────────────────────────────────
async function generatePDF(report, patient, imageUrl) {
  await loadJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210, H = 297, M = 14, CW = W - M * 2;
  let y = 0;

  // Palette
  const NAVY   = [5, 8, 20];
  const GREEN  = [0, 200, 140];
  const RED    = [220, 60, 60];
  const AMBER  = [200, 140, 0];
  const BLUE   = [60, 120, 220];
  const LGREY  = [238, 244, 250];
  const MGREY  = [140, 165, 185];
  const DARK   = [20, 35, 55];

  // ── Header band ──────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 28, "F");

  // Left: branding
  doc.setTextColor(...GREEN);
  doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("EMC DIGITALS", M, 10);
  doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
  doc.setTextColor(...MGREY);
  doc.text("AI Clinical Decision Stack  |  Powered by Anthropic Claude", M, 15.5);

  // Centre: report title
  doc.setTextColor(235, 245, 255);
  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text("ECG ANALYSIS REPORT", W / 2, 12, { align: "center" });
  doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
  doc.setTextColor(...MGREY);
  doc.text("claude-sonnet-4  |  3-Stage AI Pipeline", W / 2, 18, { align: "center" });

  // Right: date/time
  const now = new Date();
  doc.setTextColor(...MGREY);
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text(now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), W - M, 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), W - M, 15.5, { align: "right" });

  y = 32;

  // ── Patient demographics band ────────────────────────────────
  doc.setFillColor(...LGREY);
  doc.rect(0, y, W, 14, "F");
  const ptFields = [
    ["Patient", `${patient.age || "?"}yr  ${patient.sex === "M" ? "Male" : "Female"}`],
    ["Setting", patient.scenario || "—"],
    ["Symptoms", (patient.symptoms || "Unspecified").substring(0, 24)],
    ["BP", patient.bp || "—"],
    ["Medications", (patient.medications || "None stated").substring(0, 22)],
  ];
  let px = M;
  const colW = CW / ptFields.length;
  ptFields.forEach(([label, value]) => {
    doc.setTextColor(...MGREY); doc.setFontSize(5.5); doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), px, y + 5);
    doc.setTextColor(...DARK); doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    doc.text(String(value), px, y + 10.5);
    px += colW;
  });
  y += 18;

  // ── Urgency + emergency row ───────────────────────────────────
  const urgency = report.synthesis?.urgency || "routine";
  const urgColor = urgency === "emergent" ? RED : urgency === "urgent" ? AMBER : GREEN;
  const urgBg = urgColor.map(v => Math.min(255, v + 185));

  doc.setFillColor(...urgBg);
  doc.roundedRect(M, y, 44, 9, 1.5, 1.5, "F");
  doc.setDrawColor(...urgColor);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, 44, 9, 1.5, 1.5, "S");
  doc.setTextColor(...urgColor);
  doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
  doc.text(urgency.toUpperCase(), M + 22, y + 6, { align: "center" });

  doc.setTextColor(...MGREY); doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
  doc.text(`Confidence: ${(report.synthesis?.confidence || "—").toUpperCase()}`, M + 48, y + 5.5);

  if (report.triage?.lifeThreatening) {
    doc.setFillColor(255, 225, 225);
    doc.roundedRect(M + 90, y - 1, CW - 90, 11, 1.5, 1.5, "F");
    doc.setDrawColor(...RED);
    doc.roundedRect(M + 90, y - 1, CW - 90, 11, 1.5, 1.5, "S");
    doc.setTextColor(...RED); doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text(`!! EMERGENCY: ${(report.triage.emergencyAction || "").substring(0, 36)}`, M + 94, y + 6.5);
  }
  y += 14;

  // ── ECG image thumbnail (if available) ─────────────────────
  if (imageUrl) {
    try {
      const imgX = W - M - 55, imgY = 32, imgW = 55, imgH = 32;
      doc.addImage(imageUrl, "JPEG", imgX, imgY, imgW, imgH);
      doc.setDrawColor(...MGREY); doc.setLineWidth(0.3);
      doc.rect(imgX, imgY, imgW, imgH);
      doc.setTextColor(...MGREY); doc.setFontSize(5.5);
      doc.text("ECG IMAGE", imgX + imgW / 2, imgY + imgH + 3, { align: "center" });
    } catch (_) { /* skip if image fails */ }
  }

  // ── Helpers ───────────────────────────────────────────────────
  const checkBreak = (needed = 20) => {
    if (y + needed > H - 22) { doc.addPage(); y = 14; }
  };

  const sectionHead = (title, color = NAVY) => {
    checkBreak(12);
    doc.setFillColor(...color);
    doc.rect(M, y, 2.5, 6, "F");
    doc.setTextColor(...color); doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), M + 5, y + 4.5);
    doc.setDrawColor(...LGREY); doc.setLineWidth(0.3);
    doc.line(M + 5 + doc.getTextWidth(title.toUpperCase()) + 2, y + 2.5, W - M, y + 2.5);
    y += 8;
  };

  // ── Primary impression ────────────────────────────────────────
  sectionHead("Primary Impression", GREEN);
  const impText = report.synthesis?.primaryImpression || "—";
  const impLines = doc.splitTextToSize(impText, CW - 12);
  const impH = Math.max(14, impLines.length * 5.5 + 7);
  doc.setFillColor(240, 252, 246);
  doc.rect(M, y, CW, impH, "F");
  doc.setFillColor(...GREEN);
  doc.rect(M, y, 2.5, impH, "F");
  doc.setTextColor(...DARK); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text(impLines, M + 7, y + 7);
  y += impH + 6;

  // ── Measurements table ────────────────────────────────────────
  const wf = report.waveform;
  if (wf) {
    checkBreak(30);
    sectionHead("Measurements", DARK);
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      tableWidth: CW,
      head: [["Heart Rate", "Rhythm", "P Waves", "PR Interval", "QRS Duration", "QTc"]],
      body: [[
        wf.rate ? `${wf.rate} bpm` : "—",
        wf.rhythm || "—",
        wf.pWaves || "—",
        wf.pr_ms ? `${wf.pr_ms} ms` : "—",
        wf.qrs_ms ? `${wf.qrs_ms} ms` : "—",
        wf.qtc_ms ? `${wf.qtc_ms} ms` : "—",
      ]],
      headStyles: { fillColor: NAVY, textColor: [0, 200, 140], fontStyle: "bold", fontSize: 6.5, halign: "center" },
      bodyStyles: { textColor: DARK, fontSize: 10, fontStyle: "bold", halign: "center", cellPadding: 4 },
      theme: "grid",
      styles: { lineColor: [220, 230, 240], lineWidth: 0.3 },
    });
    y = doc.lastAutoTable.finalY + 5;

    // Second row: axis, regularity, morphology, bundle branch
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      tableWidth: CW,
      head: [["Axis", "Regularity", "QRS Morphology", "Rate Type"]],
      body: [[
        wf.axis || "—",
        wf.regularity || "—",
        (wf.qrsMorphology || "—").substring(0, 28),
        wf.rateType || "—",
      ]],
      headStyles: { fillColor: [20, 35, 65], textColor: [140, 165, 185], fontStyle: "bold", fontSize: 6.5, halign: "center" },
      bodyStyles: { textColor: DARK, fontSize: 8.5, halign: "center", cellPadding: 3 },
      theme: "grid",
      styles: { lineColor: [220, 230, 240], lineWidth: 0.3 },
    });
    y = doc.lastAutoTable.finalY + 5;
  }

  // Flags (LBBB / RBBB / WPW)
  if (wf && (wf.lbbb || wf.rbbb || wf.wpw)) {
    checkBreak(12);
    const flags = [wf.lbbb && "LBBB", wf.rbbb && "RBBB", wf.wpw && "WPW / Pre-excitation"].filter(Boolean);
    doc.setFillColor(255, 235, 235);
    doc.rect(M, y, CW, 9, "F");
    doc.setDrawColor(...RED); doc.setLineWidth(0.4);
    doc.rect(M, y, CW, 9, "S");
    doc.setTextColor(...RED); doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(`  !! CONDUCTION FLAGS:  ${flags.join("   |   ")}`, M + 3, y + 6);
    y += 13;
  }

  // ── ST Changes ───────────────────────────────────────────────
  const sigST = wf?.stChanges?.filter(s => s.type !== "none") || [];
  if (sigST.length > 0) {
    checkBreak(28);
    sectionHead("ST Changes", RED);
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      head: [["Lead", "Type", "Magnitude", "Clinical Significance"]],
      body: sigST.map(s => [
        s.lead,
        s.type.toUpperCase(),
        s.mm > 0 ? `${s.mm} mm` : "< 1 mm",
        s.type === "elevation" ? "Possible injury pattern" : "Ischaemia / repolarisation",
      ]),
      headStyles: { fillColor: [55, 10, 10], textColor: [255, 140, 140], fontStyle: "bold", fontSize: 6.5 },
      bodyStyles: { textColor: DARK, fontSize: 8.5 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 22 }, 1: { fontStyle: "bold", cellWidth: 32 }, 2: { cellWidth: 28 } },
      didParseCell: d => {
        if (d.section === "body" && d.column.index === 1)
          d.cell.styles.textColor = d.cell.raw === "ELEVATION" ? RED : AMBER;
      },
      theme: "striped",
      styles: { lineColor: [220, 230, 240], lineWidth: 0.3 },
    });
    y = doc.lastAutoTable.finalY + 5;
  }

  // ── Notable findings ─────────────────────────────────────────
  if (wf?.notable?.filter(n => n)?.length > 0) {
    checkBreak(15);
    sectionHead("Notable Findings", DARK);
    wf.notable.filter(n => n).forEach(n => {
      checkBreak(6);
      doc.setTextColor(...DARK); doc.setFontSize(8); doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(`*  ${n}`, CW - 6);
      doc.text(lines, M + 4, y);
      y += lines.length * 4.5 + 1.5;
    });
    y += 3;
  }

  // ── Differentials ─────────────────────────────────────────────
  if (report.synthesis?.differentials?.length > 0) {
    checkBreak(30);
    sectionHead("Differential Diagnosis", BLUE);
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      head: [["Diagnosis", "Likelihood", "Supporting Evidence"]],
      body: report.synthesis.differentials.map(d => [d.dx, d.likelihood.toUpperCase(), d.basis || "—"]),
      headStyles: { fillColor: [8, 18, 50], textColor: [100, 160, 255], fontStyle: "bold", fontSize: 6.5 },
      bodyStyles: { textColor: DARK, fontSize: 8.5 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 58 },
        1: { halign: "center", fontStyle: "bold", cellWidth: 28 },
        2: { },
      },
      didParseCell: d => {
        if (d.section === "body" && d.column.index === 1) {
          d.cell.styles.textColor = d.cell.raw === "LIKELY" ? GREEN : d.cell.raw === "POSSIBLE" ? AMBER : MGREY;
        }
      },
      theme: "striped",
      styles: { lineColor: [220, 230, 240], lineWidth: 0.3 },
    });
    y = doc.lastAutoTable.finalY + 5;
  }

  // ── Cannot exclude ────────────────────────────────────────────
  if (report.synthesis?.cannotExclude?.filter(c => c)?.length > 0) {
    checkBreak(15);
    sectionHead("Cannot Exclude", AMBER);
    doc.setFillColor(255, 248, 225);
    const ceItems = report.synthesis.cannotExclude.filter(c => c);
    const ceH = ceItems.length * 6 + 6;
    doc.rect(M, y, CW, ceH, "F");
    doc.setDrawColor(...AMBER); doc.setLineWidth(0.3);
    doc.rect(M, y, CW, ceH, "S");
    ceItems.forEach((c, i) => {
      doc.setTextColor(...AMBER); doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.text(`!!  ${c}`, M + 5, y + 5 + i * 6);
    });
    y += ceH + 5;
  }

  // ── Management priority ───────────────────────────────────────
  if (report.synthesis?.management?.filter(m => m)?.length > 0) {
    checkBreak(20);
    sectionHead("Management Priority", BLUE);
    report.synthesis.management.filter(m => m).forEach((m, i) => {
      checkBreak(7);
      doc.setFillColor(i % 2 === 0 ? [240, 245, 255] : [255, 255, 255]);
      const lines = doc.splitTextToSize(m, CW - 18);
      const rowH = lines.length * 4.5 + 5;
      doc.rect(M, y, CW, rowH, "F");
      doc.setFillColor(...BLUE);
      doc.rect(M, y, 7, rowH, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont("helvetica", "bold");
      doc.text(String(i + 1), M + 3.5, y + rowH / 2 + 2.5, { align: "center" });
      doc.setTextColor(...DARK); doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
      doc.text(lines, M + 10, y + 5);
      y += rowH + 1.5;
    });
    y += 4;
  }

  // ── Report narrative ─────────────────────────────────────────
  if (report.synthesis?.narrative) {
    checkBreak(25);
    sectionHead("Report Narrative", DARK);
    const narLines = doc.splitTextToSize(report.synthesis.narrative, CW - 12);
    const narH = narLines.length * 5.2 + 9;
    doc.setFillColor(238, 244, 255);
    doc.rect(M, y, CW, narH, "F");
    doc.setFillColor(...BLUE);
    doc.rect(M, y, 3, narH, "F");
    doc.setTextColor(50, 80, 130); doc.setFontSize(8.5); doc.setFont("helvetica", "italic");
    doc.text(narLines, M + 7, y + 7);
    y += narH + 5;
  }

  // ── Clinical pearl ────────────────────────────────────────────
  if (report.synthesis?.pearl) {
    checkBreak(20);
    sectionHead("Clinical Pearl", GREEN);
    const pearlLines = doc.splitTextToSize(`[PEARL]  ${report.synthesis.pearl}`, CW - 12);
    const pearlH = pearlLines.length * 5.2 + 9;
    doc.setFillColor(232, 252, 244);
    doc.rect(M, y, CW, pearlH, "F");
    doc.setDrawColor(...GREEN); doc.setLineWidth(0.4);
    doc.rect(M, y, CW, pearlH, "S");
    doc.setTextColor(0, 120, 80); doc.setFontSize(8.5); doc.setFont("helvetica", "italic");
    doc.text(pearlLines, M + 7, y + 7);
    y += pearlH + 5;
  }

  // ── Triage note ───────────────────────────────────────────────
  if (report.triage?.triageNote) {
    checkBreak(10);
    doc.setTextColor(...MGREY); doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text(`Triage note: ${report.triage.triageNote}`, M, y);
    y += 6;
  }

  // ── Pipeline summary table (last section) ───────────────────
  checkBreak(40);
  sectionHead("Analysis Pipeline Summary", DARK);
  doc.autoTable({
    startY: y,
    margin: { left: M, right: M },
    head: [["Stage", "Status", "Key Findings"]],
    body: [
      ["Emergency Triage", "Complete",
       report.triage ? `STEMI: ${report.triage.stemiPresent ? "PRESENT ("+report.triage.stemiType+")" : "Not detected"}  |  Life-threatening: ${report.triage.lifeThreatening ? "YES" : "No"}` : "—"],
      ["Waveform Analysis", "Complete",
       wf ? `Rate ${wf.rate || "?"}bpm  |  ${wf.rhythm || "—"}  |  PR ${wf.pr_ms || "?"}ms  |  QRS ${wf.qrs_ms || "?"}ms  |  QTc ${wf.qtc_ms || "?"}ms` : "—"],
      ["Clinical Synthesis", "Complete",
       report.synthesis ? `${report.synthesis.primaryImpression || "—"}  [${report.synthesis.urgency?.toUpperCase() || "—"}]` : "—"],
    ],
    headStyles: { fillColor: NAVY, textColor: [200, 210, 220], fontStyle: "bold", fontSize: 6.5 },
    bodyStyles: { textColor: DARK, fontSize: 7 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 1: { cellWidth: 20, halign: "center" } },
    didParseCell: d => {
      if (d.section === "body" && d.column.index === 1) {
        d.cell.styles.textColor = GREEN; d.cell.styles.fontStyle = "bold";
      }
    },
    theme: "grid",
    styles: { lineColor: [200, 215, 230], lineWidth: 0.3 },
  });

  // ── Footer on every page ──────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...NAVY);
    doc.rect(0, H - 13, W, 13, "F");
    doc.setTextColor(...MGREY); doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
    doc.text("!! For clinical decision support only. Not a substitute for physician judgement. Always verify with attending physician.", M, H - 7);
    doc.setTextColor(60, 90, 120); doc.setFontSize(5.5);
    doc.text(`EMC Digitals AI Clinical Stack  |  Page ${i} of ${totalPages}`, W - M, H - 7, { align: "right" });
    // Green top-border stripe on every page after first
    if (i > 1) {
      doc.setFillColor(...GREEN);
      doc.rect(0, 0, W, 2, "F");
    }
  }

  const ts = now.toISOString().slice(0, 10);
  doc.save(`ECG_Report_${ts}.pdf`);
}

// ─── API ──────────────────────────────────────────────────────
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
  if (!res.ok) throw new Error(`API ${res.status}`);
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
const SYS_TRIAGE = `You are an emergency cardiologist. Rapid STEMI triage only. Respond ONLY with valid JSON:
{"imageQuality":"good|poor|unreadable","stemiPresent":false,"stemiType":"anterior|inferior|lateral|posterior|RV|none","lifeThreatening":false,"threatType":"VF|VT|CHB|AF_rapid|SVT|WPW|none","emergencyAction":"string","triageNote":"string"}`;

const SYS_WAVEFORM = `You are a systematic cardiologist. Detailed ECG measurement. Respond ONLY with valid JSON:
{"rate":72,"rateType":"string","rhythm":"string","regularity":"regular|irregular","pWaves":"present|absent|unclear","pr_ms":160,"qrs_ms":90,"qtc_ms":420,"axis":"normal|LAD|RAD|extreme","qrsMorphology":"string","lbbb":false,"rbbb":false,"wpw":false,"stChanges":[{"lead":"V1","type":"elevation|depression|none","mm":0}],"tWaves":"string","notable":["string"]}`;

const SYS_SYNTHESIS = `You are a senior consultant cardiologist. Final ECG report. Respond ONLY with valid JSON:
{"primaryImpression":"string","confidence":"high|moderate|low","differentials":[{"dx":"string","likelihood":"likely|possible|unlikely","basis":"string"}],"cannotExclude":["string"],"urgency":"routine|urgent|emergent","management":["string"],"narrative":"2-3 sentence summary","pearl":"string"}`;

const PIPELINE = [
  { id: "triage",    label: "Emergency Triage",   icon: "⚡", color: "#FF5252", desc: "STEMI screen · life-threatening arrhythmia · image quality" },
  { id: "waveform",  label: "Waveform Analysis",  icon: "∿",  color: "#00E5A0", desc: "Rate · rhythm · axis · PR · QRS · QTc · ST morphology" },
  { id: "synthesis", label: "Clinical Synthesis", icon: "✦",  color: "#448AFF", desc: "Primary impression · differentials · management" },
];

const C = {
  bg: "#05080F", card: "#090E1A", border: "#101D2E",
  green: "#00E5A0", red: "#FF5252", amber: "#FFB300", blue: "#448AFF",
  tp: "#E2EBF5", ts: "#5A7A96", tm: "#1E2E3E",
};

const ECGLine = ({ color = C.green, w = 110, h = 32 }) => (
  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
    <polyline
      points={`0,${h/2} ${w*.1},${h/2} ${w*.17},${h*.12} ${w*.24},${h*.88} ${w*.3},${h/2} ${w*.37},${h/2} ${w*.41},${h*.18} ${w*.45},${h*.82} ${w*.49},${h/2} ${w*.65},${h/2} ${w*.72},${h*.15} ${w*.76},${h*.85} ${w*.8},${h/2} ${w},${h/2}`}
      fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const Spinner = ({ color, size = 13 }) => (
  <span style={{ display: "inline-block", width: size, height: size, border: `2px solid ${color}30`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
);

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  useEffect(injectStyles, []);
  const [tab, setTab] = useState("upload");
  const [image, setImage] = useState(null);
  const [patient, setPatient] = useState({ age: "", sex: "M", symptoms: "", duration: "", bp: "", medications: "", priorECG: "", scenario: "Emergency" });
  const [steps, setSteps] = useState(PIPELINE.map(s => ({ ...s, status: "idle", result: null })));
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  const upd = (i, p) => setSteps(prev => prev.map((s, j) => j === i ? { ...s, ...p } : s));
  const updP = (k, v) => setPatient(p => ({ ...p, [k]: v }));

  const handleFile = f => {
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = e => setImage({ b64: e.target.result.split(",")[1], mime: f.type, url: e.target.result });
    r.readAsDataURL(f);
  };

  const ctx = () =>
    `Patient: ${patient.age || "?"}yr ${patient.sex} | Symptoms: ${patient.symptoms || "unspecified"} | Duration: ${patient.duration || "unknown"} | BP: ${patient.bp || "unknown"} | Medications: ${patient.medications || "none"} | Prior ECG: ${patient.priorECG || "N/A"} | Setting: ${patient.scenario}`;

  const analyse = async () => {
    if (!image) { setError("Please upload an ECG image."); return; }
    setError(""); setRunning(true); setReport(null);
    setSteps(PIPELINE.map(s => ({ ...s, status: "idle", result: null })));
    const c = ctx(); let t = null, w = null;
    try {
      upd(0, { status: "running" });
      t = parseJSON(await callClaude(SYS_TRIAGE, `${c}\n\nTriage this ECG.`, image.b64, image.mime));
      upd(0, { status: "done", result: t });

      upd(1, { status: "running" });
      w = parseJSON(await callClaude(SYS_WAVEFORM, `${c}\nTriage:${JSON.stringify(t)}\n\nDetailed waveform analysis.`, image.b64, image.mime));
      upd(1, { status: "done", result: w });

      upd(2, { status: "running" });
      const s = parseJSON(await callClaude(SYS_SYNTHESIS, `${c}\nTriage:${JSON.stringify(t)}\nWaveform:${JSON.stringify(w)}\n\nFinal clinical report.`, image.b64, image.mime));
      upd(2, { status: "done", result: s });

      setReport({ triage: t, waveform: w, synthesis: s });
    } catch (e) {
      setError("Error: " + e.message);
      setSteps(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s));
    } finally { setRunning(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.tp, fontFamily: "'DM Sans',system-ui,sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 22px", borderBottom: `1px solid ${C.border}`, background: "#070B14", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ECGLine color={C.green} w={100} h={28} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.13em" }}>ECG · AI ANALYSER</div>
            <div style={{ fontSize: 9, color: C.tm, letterSpacing: "0.07em", marginTop: 1 }}>EMC Digitals · Clinical Decision Stack v1.0</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {[["claude-sonnet-4", C.green], ["3-Stage Pipeline", C.blue], ["PDF Export", C.amber]].map(([t, c]) => (
            <div key={t} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: c, border: `1px solid ${c}30`, padding: "3px 10px", borderRadius: 20 }}>{t}</div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Left aside */}
        <div style={{ width: 300, minWidth: 300, borderRight: `1px solid ${C.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", background: "#07090F" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
            {[["upload", "📡 ECG Image"], ["patient", "🩺 Patient"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ flex: 1, background: "none", border: "none", padding: "9px 0", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", cursor: "pointer", color: tab === id ? C.green : C.ts, borderBottom: tab === id ? `2px solid ${C.green}` : "2px solid transparent" }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "upload" ? (
            <>
              <div
                style={{ border: `1px dashed ${image ? C.border : C.tm}`, borderRadius: 9, minHeight: 150, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current.click()}>
                {image
                  ? <img src={image.url} alt="ECG" style={{ width: "100%", display: "block" }} />
                  : <div style={{ textAlign: "center", padding: 20 }}>
                    <div style={{ marginBottom: 10, opacity: 0.4 }}><ECGLine color={C.green} w={80} h={26} /></div>
                    <div style={{ fontSize: 13, color: C.ts }}>Drop ECG image here</div>
                    <div style={{ fontSize: 10, color: C.tm, marginTop: 4 }}>or click to browse</div>
                    <div style={{ fontSize: 9, color: C.tm, marginTop: 10, letterSpacing: "0.08em" }}>JPEG · PNG · WEBP</div>
                  </div>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              {image && <button style={{ background: "none", border: "none", color: C.tm, fontSize: 10, cursor: "pointer", textAlign: "right" }} onClick={() => setImage(null)}>✕ Remove</button>}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 13px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: C.tm, marginBottom: 8 }}>📋 FOR BEST RESULTS</div>
                {["Full 12-lead ECG print", "All leads clearly visible", "No glare or angle distortion", "Lead labels present if possible"].map((t, i) => (
                  <div key={i} style={{ fontSize: 10, color: C.ts, marginBottom: 4, lineHeight: 1.4 }}>◆ {t}</div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Age (years)", key: "age", type: "number", ph: "e.g. 58" },
                { label: "Blood pressure", key: "bp", type: "text", ph: "e.g. 90/60 mmHg" },
                { label: "Symptoms", key: "symptoms", type: "text", ph: "chest pain, syncope, palpitations…" },
                { label: "Duration", key: "duration", type: "text", ph: "e.g. 2 hours" },
                { label: "Medications", key: "medications", type: "text", ph: "amiodarone, digoxin, TCAs…" },
                { label: "Prior ECG / history", key: "priorECG", type: "text", ph: "known LBBB, prior MI…" },
              ].map(({ label, key, type, ph }) => (
                <div key={key}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: C.ts, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <input style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.tp, padding: "8px 11px", fontSize: 12, width: "100%", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
                    type={type} placeholder={ph} value={patient[key]} onChange={e => updP(key, e.target.value)} />
                </div>
              ))}
              {[
                { label: "Sex", key: "sex", opts: ["M", "F"] },
                { label: "Clinical setting", key: "scenario", opts: ["Emergency", "CCU", "ICU", "OPD", "Pre-operative", "Routine screening"] },
              ].map(({ label, key, opts }) => (
                <div key={key}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: C.ts, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <select style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.tp, padding: "8px 11px", fontSize: 12, width: "100%", fontFamily: "inherit", outline: "none" }}
                    value={patient[key]} onChange={e => updP(key, e.target.value)}>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ background: "#FF525215", border: `1px solid ${C.red}40`, borderRadius: 7, padding: "9px 13px", fontSize: 11, color: "#FF8080", lineHeight: 1.5 }}>{error}</div>}

          <button onClick={analyse} disabled={running}
            style={{ background: running ? C.ts : C.green, color: C.bg, border: "none", borderRadius: 8, padding: "12px 0", width: "100%", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", cursor: running ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: running ? 0.7 : 1 }}>
            {running ? <><Spinner color={C.bg} /> Analysing ECG…</> : "⚡ Run ECG Analysis"}
          </button>
          <div style={{ fontSize: 8, color: C.tm, textAlign: "center", lineHeight: 1.6 }}>For clinical decision support only · Not a substitute for physician judgement</div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 18, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Pipeline */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.13em", color: C.ts, textTransform: "uppercase", marginBottom: 12 }}>Analysis Pipeline</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {steps.map((step, i) => {
                const isR = step.status === "running", isD = step.status === "done";
                return (
                  <div key={step.id} style={{ border: `1px solid ${isR ? step.color + "50" : isD ? step.color + "25" : C.border}`, borderRadius: 8, padding: "11px 13px", background: isR ? step.color + "07" : "transparent", transition: "all 0.3s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${isR || isD ? step.color : C.border}`, background: isD ? step.color : isR ? step.color + "20" : C.bg, flexShrink: 0 }}>
                        {isR ? <Spinner color={step.color} /> : isD ? <span style={{ color: C.bg, fontWeight: 800, fontSize: 13 }}>✓</span> : <span style={{ color: C.tm, fontWeight: 700, fontSize: 11 }}>{i + 1}</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isD ? C.tp : isR ? step.color : C.ts, marginBottom: 2 }}>{step.icon} {step.label}</div>
                        <div style={{ fontSize: 9, color: C.tm, letterSpacing: "0.03em" }}>{step.desc}</div>
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: isD ? C.green : isR ? step.color : C.tm }}>
                        {isD ? "● Complete" : isR ? "● Processing" : "○ Pending"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {report
            ? <Report report={report} patient={patient} image={image} />
            : (
              <div style={{ flex: 1, border: `1px dashed ${C.border}`, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40 }}>
                <div style={{ opacity: 0.1 }}><ECGLine color={C.green} w={160} h={50} /></div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ts }}>Awaiting ECG Input</div>
                <div style={{ fontSize: 11, color: C.tm, textAlign: "center", maxWidth: 300, lineHeight: 1.7 }}>Upload a 12-lead ECG image, fill patient context, then run the 3-stage AI pipeline. The full clinical report with PDF export will appear here.</div>
                <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                  {PIPELINE.map(p => (
                    <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ color: p.color, fontSize: 16 }}>{p.icon}</span>
                      <span style={{ fontSize: 9, color: C.tm, letterSpacing: "0.05em" }}>{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "7px 22px", fontSize: 8, color: C.tm, textAlign: "center" }}>
        ⚠ NOT FOR INDEPENDENT CLINICAL DECISIONS · Verify with attending physician · EMC Digitals AI Clinical Stack · Powered by Anthropic Claude
      </div>
    </div>
  );
}

// ─── Report Panel ─────────────────────────────────────────────
function Report({ report, patient, image }) {
  const { triage, waveform: wf, synthesis: sy } = report;
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDone, setPdfDone] = useState(false);
  const uc = { routine: C.green, urgent: C.amber, emergent: C.red }[sy?.urgency] || C.green;

  const handlePDF = async () => {
    setPdfLoading(true); setPdfDone(false);
    try {
      await generatePDF(report, patient, image?.url);
      setPdfDone(true);
      setTimeout(() => setPdfDone(false), 3000);
    } catch (e) {
      alert("PDF generation failed: " + e.message);
    } finally { setPdfLoading(false); }
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 22, display: "flex", flexDirection: "column", gap: 16, animation: "slideIn 0.4s ease" }}>

      {triage?.lifeThreatening && (
        <div style={{ background: "#FF525215", border: `1px solid ${C.red}`, borderRadius: 8, padding: "11px 15px", color: "#FF7070", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", animation: "emergPulse 2s ease-in-out infinite" }}>
          🚨 EMERGENCY · {triage.emergencyAction?.toUpperCase()}
        </div>
      )}

      {/* Header row with PDF button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.13em", color: C.ts, textTransform: "uppercase" }}>Clinical ECG Report</div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", border: `1px solid ${uc}`, color: uc, background: `${uc}10`, padding: "3px 11px", borderRadius: 20 }}>{(sy?.urgency || "—").toUpperCase()}</div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: sy?.confidence === "high" ? C.green : C.amber }}>{sy?.confidence?.toUpperCase() || "—"} CONFIDENCE</div>
        </div>

        {/* PDF Download Button */}
        <button onClick={handlePDF} disabled={pdfLoading}
          style={{ display: "flex", alignItems: "center", gap: 8, background: pdfDone ? C.green : C.amber, color: "#05080F", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", cursor: pdfLoading ? "wait" : "pointer", fontFamily: "inherit", transition: "background 0.3s", opacity: pdfLoading ? 0.75 : 1 }}>
          {pdfLoading
            ? <><Spinner color="#05080F" size={12} /> Generating PDF…</>
            : pdfDone
              ? <>✓ Downloaded!</>
              : <>↓ Download PDF Report</>}
        </button>
      </div>

      {/* Primary impression */}
      <div style={{ background: C.bg, borderRadius: 8, padding: "13px 16px", borderLeft: `3px solid ${C.green}` }}>
        <div style={{ fontSize: 8, letterSpacing: "0.12em", color: C.ts, textTransform: "uppercase", marginBottom: 7 }}>Primary Impression</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tp, lineHeight: 1.4 }}>{sy?.primaryImpression || "—"}</div>
      </div>

      {/* Measurements grid */}
      {wf && (
        <>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: C.ts, textTransform: "uppercase" }}>Measurements</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              ["Heart Rate", wf.rate ? `${wf.rate}` : "—", "bpm"],
              ["Rhythm", wf.rhythm || "—", ""],
              ["Axis", wf.axis || "—", ""],
              ["PR Interval", wf.pr_ms ? `${wf.pr_ms}` : "—", "ms"],
              ["QRS Duration", wf.qrs_ms ? `${wf.qrs_ms}` : "—", "ms"],
              ["QTc", wf.qtc_ms ? `${wf.qtc_ms}` : "—", "ms"],
            ].map(([label, val, unit]) => (
              <div key={label} style={{ background: C.bg, borderRadius: 8, padding: "11px 13px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                <div style={{ fontSize: 8, letterSpacing: "0.09em", color: C.tm, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.green, fontFamily: "'JetBrains Mono',monospace" }}>{val}</div>
                {unit && <div style={{ fontSize: 8, color: C.tm, marginTop: 2 }}>{unit}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Flags */}
      {wf && (wf.lbbb || wf.rbbb || wf.wpw) && (
        <div style={{ display: "flex", gap: 7 }}>
          {[[wf.lbbb, "LBBB", C.red], [wf.rbbb, "RBBB", C.amber], [wf.wpw, "WPW", C.red]].filter(f => f[0]).map(([, label, color]) => (
            <div key={label} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color, border: `1px solid ${color}40`, background: `${color}10`, padding: "4px 12px", borderRadius: 6 }}>{label}</div>
          ))}
        </div>
      )}

      {/* ST Changes */}
      {wf?.stChanges?.some(s => s.type !== "none") && (
        <>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: C.ts, textTransform: "uppercase" }}>ST Changes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {wf.stChanges.filter(s => s.type !== "none").map((st, i) => {
              const sc = st.type === "elevation" ? C.red : C.amber;
              return (
                <div key={i} style={{ border: `1px solid ${sc}40`, borderRadius: 8, padding: "9px 13px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tp, fontFamily: "'JetBrains Mono',monospace", marginBottom: 3 }}>{st.lead}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: sc }}>{st.type === "elevation" ? "▲" : "▼"} {st.type}</div>
                  {st.mm > 0 && <div style={{ fontSize: 9, color: C.tm, marginTop: 2 }}>{st.mm} mm</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Notable findings */}
      {wf?.notable?.length > 0 && (
        <>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: C.ts, textTransform: "uppercase" }}>Notable Findings</div>
          {wf.notable.map((n, i) => <div key={i} style={{ fontSize: 12, color: C.ts, lineHeight: 1.5 }}>◆ {n}</div>)}
        </>
      )}

      {/* Differentials */}
      {sy?.differentials?.length > 0 && (
        <>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: C.ts, textTransform: "uppercase" }}>Differential Diagnosis</div>
          {sy.differentials.map((d, i) => {
            const lc = { likely: C.green, possible: C.amber, unlikely: C.ts }[d.likelihood] || C.ts;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, borderRadius: 8, padding: "11px 13px", border: `1px solid ${C.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.tp, marginBottom: 2 }}>{d.dx}</div>
                  <div style={{ fontSize: 10, color: C.tm }}>{d.basis}</div>
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: lc, border: `1px solid ${lc}40`, background: `${lc}10`, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", textTransform: "uppercase" }}>{d.likelihood}</div>
              </div>
            );
          })}
        </>
      )}

      {/* Cannot exclude */}
      {sy?.cannotExclude?.length > 0 && (
        <>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: C.amber, textTransform: "uppercase" }}>⚠ Cannot Exclude</div>
          {sy.cannotExclude.map((c, i) => <div key={i} style={{ fontSize: 12, color: C.amber, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>⚠ {c}</div>)}
        </>
      )}

      {/* Management */}
      {sy?.management?.length > 0 && (
        <>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: C.blue, textTransform: "uppercase" }}>Management Priority</div>
          {sy.management.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: C.tp, lineHeight: 1.5 }}>
              <span style={{ color: C.blue, fontWeight: 700, minWidth: 18 }}>{i + 1}.</span>{m}
            </div>
          ))}
        </>
      )}

      {/* Narrative */}
      {sy?.narrative && (
        <div style={{ background: "#05080F", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${C.blue}` }}>
          <div style={{ fontSize: 8, letterSpacing: "0.1em", color: C.tm, textTransform: "uppercase", marginBottom: 7 }}>Report Narrative</div>
          <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.8 }}>{sy.narrative}</div>
        </div>
      )}

      {/* Pearl */}
      {sy?.pearl && (
        <div style={{ display: "flex", gap: 10, background: `${C.green}07`, border: `1px solid ${C.green}20`, borderRadius: 8, padding: "13px 16px", alignItems: "flex-start" }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
          <div style={{ fontSize: 12, color: "#7ACCA0", lineHeight: 1.7, fontStyle: "italic" }}>{sy.pearl}</div>
        </div>
      )}

      {triage?.triageNote && (
        <div style={{ fontSize: 10, color: C.tm, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          <span style={{ color: "#FF7070" }}>⚡ Triage note:</span> {triage.triageNote}
        </div>
      )}

      {/* Bottom PDF button (repeat for convenience) */}
      <button onClick={handlePDF} disabled={pdfLoading}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", color: C.amber, border: `1px solid ${C.amber}50`, borderRadius: 8, padding: "10px 0", width: "100%", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", cursor: pdfLoading ? "wait" : "pointer", fontFamily: "inherit", opacity: pdfLoading ? 0.75 : 1 }}>
        {pdfLoading ? <><Spinner color={C.amber} size={12} /> Generating PDF…</> : <>↓ Download PDF Report</>}
      </button>
    </div>
  );
}
