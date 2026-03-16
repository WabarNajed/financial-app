import { useState, useMemo, useCallback, useRef } from "react";

function useXLSX() {
  const [ready, setReady] = useState(!!window.XLSX);
  if (!window.XLSX && !window._xlsxLoading) {
    window._xlsxLoading = true;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }
  return ready;
}

function parseBank(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const out = [];
  let balance = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawDate = r[0],
      desc = String(r[1] || ""),
      type = String(r[2] || "");
    let credit = parseFloat(r[3]) || 0;
    let debit = parseFloat(r[4]) || 0;
    if (debit < 0) debit = Math.abs(debit);
    const rawBal = parseFloat(r[5]);
    if (!rawDate && !credit && !debit) continue;
    let date = "";
    if (rawDate) {
      try {
        const d = new Date((rawDate - 25569) * 86400 * 1000);
        date = isNaN(d) ? String(rawDate) : d.toISOString().slice(0, 10);
      } catch {
        date = String(rawDate);
      }
    }
    balance = isNaN(rawBal) ? balance + credit - debit : rawBal;
    const side = credit > 0 ? "CR" : debit > 0 ? "DR" : "CR";
    out.push({ date, credit, debit, balance, side, desc, type, amount: credit - debit });
  }
  return out;
}

function parseGL(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] && !r[2]) continue;
    let date = "";
    const rawDate = r[0];
    if (rawDate) {
      try {
        const d = new Date((rawDate - 25569) * 86400 * 1000);
        date = isNaN(d) ? String(rawDate) : d.toISOString().slice(0, 10);
      } catch {
        date = String(rawDate);
      }
    }
    const amount = parseFloat(r[4]) || parseFloat(r[5]) || 0;
    const glAcct = String(r[6] || r[5] || "");
    const direction =
      glAcct.includes("Out") || glAcct.includes("11025002") || amount < 0 ? "OUT" : "IN";
    out.push({
      date,
      je: String(r[1] || r[2] || ""),
      je_type: String(r[3] || ""),
      posting_key: String(r[2] || ""),
      gl_account: glAcct,
      gl_name: String(r[7] || glAcct),
      amount,
      direction,
    });
  }
  return out;
}

function runMatch(bank, gl) {
  const usedBank = new Set();
  const results = [];
  const bankCR = bank.filter((b) => b.side === "CR");
  const bankDR = bank.filter((b) => b.side === "DR");
  for (const g of gl) {
    const pool = g.direction === "OUT" ? bankDR : bankCR;
    const gAmt = Math.abs(g.amount);
    let best = null,
      bestScore = -1;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (usedBank.has(b)) continue;
      const bAmt = g.direction === "OUT" ? b.debit : b.credit;
      const diff = Math.abs(gAmt - bAmt);
      const pct = gAmt > 0 ? diff / gAmt : 1;
      const days = Math.abs((new Date(g.date) - new Date(b.date)) / 86400000);
      const score = 100 - pct * 200 - days * 3;
      if (score > bestScore) {
        bestScore = score;
        best = { b, diff, days, score };
      }
    }
    if (best && best.diff < 1 && best.days <= 1) {
      usedBank.add(best.b);
      results.push({
        status: "Matched",
        gl: g,
        bank: best.b,
        diff: best.diff,
        days: best.days,
        score: best.score,
      });
    } else if (best && best.score > 50) {
      usedBank.add(best.b);
      results.push({
        status: "Near Match",
        gl: g,
        bank: best.b,
        diff: best.diff,
        days: best.days,
        score: best.score,
      });
    } else {
      results.push({
        status: "Unmatched GL",
        gl: g,
        bank: null,
        diff: null,
        days: null,
        score: 0,
      });
    }
  }
  for (const b of bank) {
    if (!usedBank.has(b))
      results.push({
        status: "Unmatched Bank",
        gl: null,
        bank: b,
        diff: null,
        days: null,
        score: 0,
      });
  }
  return results;
}

const C = {
  bg: "#f7f8fb",
  white: "#ffffff",
  ink: "#0f1117",
  slate: "#3d4560",
  mid: "#6b7694",
  light: "#a8b0c8",
  rule: "#dde2ef",
  pale: "#f0f2f8",
  cream: "#f7f8fb",
  azure: "#1a3a7c",
  azure2: "#2651a8",
  azure4: "#d4dff5",
  emerald: "#0d5c3a",
  emerald3: "#d0f0e4",
  crimson2: "#c0202e",
  crimson3: "#fce8ea",
  amber2: "#d46a00",
  amber3: "#fff3e0",
};

const SAR_LABEL = {
  Matched: "مطابق",
  "Near Match": "قريب",
  "Unmatched GL": "GL غير مطابق",
  "Unmatched Bank": "بنك غير مطابق",
};

const fmt = (n, d = 2) =>
  n == null
    ? "—"
    : Math.abs(n).toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });

function Badge({ status }) {
  const m = {
    Matched: { bg: C.emerald3, color: C.emerald },
    "Near Match": { bg: C.amber3, color: C.amber2 },
    "Unmatched GL": { bg: C.crimson3, color: C.crimson2 },
    "Unmatched Bank": { bg: C.azure4, color: C.azure },
  };
  const s = m[status] || { bg: C.pale, color: C.mid };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        background: s.bg,
        color: s.color,
        borderRadius: 2,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "currentColor",
          display: "inline-block",
        }}
      />
      {SAR_LABEL[status] || status}
    </span>
  );
}

function KPI({ ar, en, value, sub, color, bar }) {
  return (
    <div
      style={{
        background: C.white,
        padding: "16px 14px",
        flex: 1,
        minWidth: 0,
        borderLeft: `1px solid ${C.rule}`,
      }}
    >
      <div style={{ fontSize: 10, color: C.mid, marginBottom: 2 }}>{ar}</div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 8,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: C.light,
          marginBottom: 6,
        }}
      >
        {en}
      </div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 18,
          fontWeight: 600,
          color: color || C.ink,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: C.light, marginTop: 3 }}>{sub}</div>}
      {bar != null && (
        <div style={{ height: 2, background: C.pale, marginTop: 8 }}>
          <div
            style={{
              height: 2,
              width: Math.min(bar, 100) + "%",
              background: color || C.azure2,
              transition: "width 1.2s",
            }}
          />
        </div>
      )}
    </div>
  );
}

function DropZone({ label, onFile, file, color }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);
  return (
    <div
      onClick={() => ref.current.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      }}
      style={{
        border: `2px dashed ${drag || file ? color : C.rule}`,
        borderRadius: 8,
        padding: "28px 20px",
        textAlign: "center",
        cursor: "pointer",
        background: file ? `${color}08` : C.white,
        flex: 1,
      }}
    >
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      <div style={{ fontSize: 28, marginBottom: 8 }}>{file ? "✅" : "📂"}</div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: file ? color : C.slate,
          marginBottom: 4,
        }}
      >
        {file ? file.name : label}
      </div>
      <div style={{ fontSize: 10, color: C.light }}>
        {file ? "اضغط لتغيير الملف" : "اسحب الملف هنا أو اضغط للاختيار"}
      </div>
    </div>
  );
}

function Tbl({ cols, rows, onRow, maxH = "400px", rowBg }) {
  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: maxH,
        border: `1px solid ${C.rule}`,
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={i}
                style={{
                  background: C.ink,
                  color: "rgba(255,255,255,.7)",
                  fontFamily: "monospace",
                  fontSize: 9,
                  fontWeight: 400,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  padding: "9px 12px",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  position: "sticky",
                  top: 0,
                  zIndex: 3,
                }}
              >
                {c.ar}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const bg = rowBg ? rowBg(r) : i % 2 === 0 ? C.white : C.cream;
            return (
              <tr
                key={i}
                onClick={() => onRow && onRow(r)}
                style={{
                  borderBottom: `1px solid ${C.rule}`,
                  cursor: onRow ? "pointer" : "default",
                  background: bg,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.pale)}
                onMouseLeave={(e) => (e.currentTarget.style.background = bg)}
              >
                {cols.map((c, j) => (
                  <td
                    key={j}
                    style={{
                      padding: "7px 12px",
                      fontFamily: c.mono ? "monospace" : "sans-serif",
                      fontSize: c.small ? 10 : 11,
                      color: c.color || C.slate,
                      whiteSpace: "nowrap",
                      maxWidth: c.maxW || 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: c.num ? "left" : "right",
                    }}
                  >
                    {c.render ? c.render(r) : r[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: C.light,
            fontFamily: "monospace",
            fontSize: 11,
          }}
        >
          لا توجد بيانات
        </div>
      )}
    </div>
  );
}

function Modal({ item, onClose }) {
  if (!item) return null;
  const { status, gl, bank, diff, days, score } = item;
  const F = ({ en, ar, val, color }) => (
    <div
      style={{
        display: "flex",
        padding: "5px 0",
        borderBottom: `1px solid ${C.pale}`,
      }}
    >
      <span style={{ fontSize: 10, color: C.mid, width: 130, flexShrink: 0 }}>
        {en}
        <br />
        <span style={{ fontSize: 9, color: C.light }}>{ar}</span>
      </span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 10,
          color: color || C.ink,
          direction: "ltr",
          textAlign: "left",
          wordBreak: "break-all",
        }}
      >
        {val || "—"}
      </span>
    </div>
  );
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,17,23,.5)",
        backdropFilter: "blur(4px)",
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.white,
          width: 700,
          maxWidth: "95vw",
          maxHeight: "85vh",
          overflowY: "auto",
          borderTop: `3px solid ${C.azure}`,
          boxShadow: "0 24px 64px rgba(0,0,0,.22)",
        }}
      >
        <div
          style={{
            padding: "16px 22px",
            borderBottom: `1px solid ${C.rule}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            position: "sticky",
            top: 0,
            background: C.white,
            zIndex: 5,
          }}
        >
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              border: `1px solid ${C.rule}`,
              background: "none",
              cursor: "pointer",
              fontSize: 14,
              color: C.mid,
            }}
          >
            ✕
          </button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>تفاصيل المطابقة</div>
            <div style={{ fontSize: 11, color: C.mid, fontStyle: "italic" }}>
              {gl ? `Journal ${gl.je}` : bank ? `Bank ${bank.date}` : ""}
            </div>
          </div>
          <div style={{ marginRight: "auto" }}>
            <Badge status={status} />
          </div>
        </div>
        <div style={{ padding: "16px 22px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ border: `1px solid ${C.rule}`, padding: 14 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: C.light,
                  marginBottom: 10,
                }}
              >
                SAP GENERAL LEDGER
              </div>
              {gl ? (
                <>
                  <F en="Journal Entry" ar="رقم القيد" val={gl.je} color={C.azure2} />
                  <F en="Date" ar="التاريخ" val={gl.date} />
                  <F
                    en="Amount"
                    ar="المبلغ"
                    val={fmt(gl.amount) + " SAR"}
                    color={gl.amount < 0 ? C.crimson2 : C.emerald}
                  />
                  <F en="Direction" ar="الاتجاه" val={gl.direction} />
                  <F en="Account" ar="الحساب" val={gl.gl_account} />
                </>
              ) : (
                <div style={{ fontSize: 11, color: C.light, padding: "8px 0" }}>
                  لا يوجد قيد GL مقابل
                </div>
              )}
            </div>
            <div style={{ border: `1px solid ${C.rule}`, padding: 14 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: C.light,
                  marginBottom: 10,
                }}
              >
                BANK STATEMENT
              </div>
              {bank ? (
                <>
                  <F en="Date" ar="التاريخ" val={bank.date} />
                  <F
                    en="Credit"
                    ar="الدائن"
                    val={bank.credit > 0 ? fmt(bank.credit) + " SAR" : "—"}
                    color={C.emerald}
                  />
                  <F
                    en="Debit"
                    ar="المدين"
                    val={bank.debit > 0 ? fmt(bank.debit) + " SAR" : "—"}
                    color={C.crimson2}
                  />
                  <F en="Type" ar="النوع" val={bank.type} />
                </>
              ) : (
                <div style={{ fontSize: 11, color: C.light, padding: "8px 0" }}>
                  لا توجد حركة بنكية مقابلة
                </div>
              )}
            </div>
          </div>
          {bank?.desc && (
            <div
              style={{
                background: C.pale,
                border: `1px solid ${C.rule}`,
                padding: "10px 12px",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: C.light,
                  marginBottom: 6,
                }}
              >
                DESCRIPTION
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: C.slate,
                  direction: "ltr",
                  textAlign: "left",
                  lineHeight: 1.7,
                  wordBreak: "break-all",
                }}
              >
                {bank.desc}
              </div>
            </div>
          )}
          {diff != null && (
            <div style={{ display: "flex", border: `1px solid ${C.rule}` }}>
              {[
                {
                  l: "Amount Diff",
                  v: fmt(diff) + " SAR",
                  c: diff > 0.05 ? C.amber2 : C.emerald,
                },
                {
                  l: "Days Apart",
                  v: days + "d",
                  c: days > 1 ? C.amber2 : C.emerald,
                },
                {
                  l: "Match Score",
                  v: score.toFixed(1) + "%",
                  c: score > 80 ? C.emerald : C.amber2,
                },
              ].map((m) => (
                <div
                  key={m.l}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    borderLeft: `1px solid ${C.rule}`,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 9,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      color: C.light,
                      marginBottom: 6,
                    }}
                  >
                    {m.l}
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 16,
                      fontWeight: 600,
                      color: m.c,
                    }}
                  >
                    {m.v}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const xlsxReady = useXLSX();
  const [bankFile, setBankFile] = useState(null);
  const [glFile, setGlFile] = useState(null);
  const [bankData, setBankData] = useState(null);
  const [glData, setGlData] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState("upload");
  const [modal, setModal] = useState(null);
  const [fSt, setFSt] = useState("ALL");
  const [fQ, setFQ] = useState("");
  const [bQ, setBQ] = useState("");
  const [glQ, setGlQ] = useState("");
  const [tol, setTol] = useState({ amt: 1, days: 1 });

  const readFile = (f) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.onerror = rej;
      r.readAsArrayBuffer(f);
    });

  const runRecon = useCallback(async () => {
    if (!xlsxReady || !bankFile || !glFile) return;
    setLoading(true);
    setError("");
    try {
      const [bBuf, gBuf] = await Promise.all([readFile(bankFile), readFile(glFile)]);
      const bank = parseBank(
        window.XLSX.read(bBuf, { type: "array", cellDates: false })
      );
      const gl = parseGL(
        window.XLSX.read(gBuf, { type: "array", cellDates: false })
      );
      if (!bank.length) throw new Error("ملف البنك فارغ أو التنسيق غير مدعوم");
      if (!gl.length) throw new Error("ملف GL فارغ أو التنسيق غير مدعوم");
      const res = runMatch(bank, gl);
      setBankData(bank);
      setGlData(gl);
      setResults(res);
      setPage("overview");
    } catch (e) {
      setError(e.message || "خطأ في قراءة الملفات");
    }
    setLoading(false);
  }, [xlsxReady, bankFile, glFile]);

  const stats = useMemo(() => {
    if (!results) return null;
    const matched = results.filter((r) => r.status === "Matched").length;
    const near = results.filter((r) => r.status === "Near Match").length;
    const ungl = results.filter((r) => r.status === "Unmatched GL").length;
    const unbank = results.filter((r) => r.status === "Unmatched Bank").length;
    const bankCr = bankData?.reduce((s, r) => s + r.credit, 0) || 0;
    const bankDr = bankData?.reduce((s, r) => s + r.debit, 0) || 0;
    const closing = bankData?.[bankData.length - 1]?.balance || 0;
    const glIn =
      glData?.filter((r) => r.direction === "IN").reduce((s, r) => s + r.amount, 0) || 0;
    const glOut =
      glData
        ?.filter((r) => r.direction === "OUT")
        .reduce((s, r) => s + Math.abs(r.amount), 0) || 0;
    const rate = results.length
      ? ((matched + near) / (results.length - unbank)) * 100
      : 0;
    return {
      matched,
      near,
      ungl,
      unbank,
      bankCr,
      bankDr,
      closing,
      glIn,
      glOut,
      rate,
      netBank: bankCr - bankDr,
      netGL: glIn - glOut,
      diff: Math.abs(bankCr - bankDr - (glIn - glOut)),
    };
  }, [results, bankData, glData]);

  const matchRows = useMemo(() => {
    if (!results) return [];
    const q = fQ.toLowerCase();
    return results.filter(
      (r) =>
        (fSt === "ALL" || r.status === fSt) &&
        (!q || JSON.stringify(r).toLowerCase().includes(q))
    );
  }, [results, fSt, fQ]);

  const bankRows = useMemo(
    () =>
      bankData?.filter(
        (r) => !bQ || JSON.stringify(r).toLowerCase().includes(bQ.toLowerCase())
      ) || [],
    [bankData, bQ]
  );

  const glRows = useMemo(
    () =>
      glData?.filter(
        (r) => !glQ || JSON.stringify(r).toLowerCase().includes(glQ.toLowerCase())
      ) || [],
    [glData, glQ]
  );

  const matchBg = useCallback(
    (r) =>
      ({
        Matched: "rgba(13,92,58,.03)",
        "Near Match": "rgba(122,61,0,.04)",
        "Unmatched GL": "rgba(192,32,46,.04)",
        "Unmatched Bank": "rgba(38,81,168,.04)",
      })[r.status] || C.white,
    []
  );

  function exportCSV(type) {
    let rows = results || [];
    if (type === "matched") rows = rows.filter((r) => r.status === "Matched");
    if (type === "exceptions") rows = rows.filter((r) => r.status !== "Matched");
    const flat = rows.map((r) => ({
      status: r.status,
      gl_je: r.gl?.je || "",
      gl_date: r.gl?.date || "",
      gl_amount: r.gl?.amount ?? "",
      gl_direction: r.gl?.direction || "",
      bank_date: r.bank?.date || "",
      bank_credit: r.bank?.credit ?? "",
      bank_debit: r.bank?.debit ?? "",
      diff: r.diff ?? "",
      days: r.days ?? "",
      score: r.score ?? "",
    }));
    if (!flat.length) return;
    const keys = Object.keys(flat[0]);
    const csv = [
      keys.join(","),
      ...flat.map((r) =>
        keys
          .map((k) => {
            const v = String(r[k] ?? "");
            return v.includes(",") ? `"${v}"` : v;
          })
          .join(",")
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv" })
    );
    a.download = `recon_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const PAGES = results
    ? ["upload", "overview", "match", "bank", "gl", "exceptions", "export"]
    : ["upload"];
  const PLABELS = {
    upload: "رفع ملفات",
    overview: "نظرة عامة",
    match: "المطابقة",
    bank: "البنك",
    gl: "الأستاذ",
    exceptions: "استثناءات",
    export: "تصدير",
  };
  const IS = {
    fontFamily: "monospace",
    fontSize: 11,
    background: C.pale,
    border: `1px solid ${C.rule}`,
    color: C.ink,
    padding: "6px 10px",
    outline: "none",
    borderRadius: 2,
  };
  const FB = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    padding: "10px 14px",
    background: C.pale,
    border: `1px solid ${C.rule}`,
  };

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: "sans-serif",
        background: C.bg,
        minHeight: "100vh",
        color: C.ink,
        fontSize: 13,
      }}
    >
      <header
        style={{
          background: C.ink,
          display: "flex",
          alignItems: "center",
          padding: "0 22px",
          borderBottom: `3px solid ${C.azure2}`,
          position: "sticky",
          top: 0,
          zIndex: 200,
          minHeight: 52,
          gap: 14,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
          مطابقة البنك
          <span
            style={{
              display: "block",
              fontSize: 9,
              fontFamily: "monospace",
              fontWeight: 400,
              color: "rgba(255,255,255,.4)",
              letterSpacing: 3,
            }}
          >
            BANK RECONCILIATION SYSTEM
          </span>
        </div>
        <div
          style={{
            width: 1,
            background: "rgba(255,255,255,.12)",
            alignSelf: "stretch",
            margin: "10px 0",
          }}
        />
        <div style={{ flex: 1, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PAGES.map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                letterSpacing: 1,
                textTransform: "uppercase",
                padding: "5px 10px",
                cursor: "pointer",
                border: "none",
                borderRadius: 2,
                background: page === p ? C.azure2 : "transparent",
                color: page === p ? "#fff" : "rgba(255,255,255,.45)",
              }}
            >
              {PLABELS[p]}
            </button>
          ))}
        </div>
        {results && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#22c55e",
              }}
            />
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                color: "rgba(255,255,255,.5)",
              }}
            >
              {results.length} RECORDS
            </span>
          </div>
        )}
      </header>

      <div style={{ padding: "22px 24px", maxWidth: 1400, margin: "0 auto" }}>
        {page === "upload" && (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.azure2,
                  marginBottom: 6,
                }}
              >
                BANK RECONCILIATION SYSTEM
              </div>
              <div
                style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginBottom: 4 }}
              >
                نظام مطابقة الحسابات البنكية
              </div>
              <div style={{ fontSize: 12, color: C.mid, fontStyle: "italic" }}>
                ارفع ملف البنك وملف الأستاذ العام — المطابقة تتم تلقائياً في المتصفح
              </div>
            </div>
            {!xlsxReady && (
              <div
                style={{
                  padding: 14,
                  background: C.amber3,
                  border: `1px solid ${C.amber2}`,
                  borderRadius: 6,
                  fontSize: 11,
                  color: C.amber2,
                  marginBottom: 16,
                }}
              >
                ⏳ جاري تحميل مكتبة Excel...
              </div>
            )}
            <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
              <DropZone
                label="ملف البنك (Bank.xlsx)"
                onFile={setBankFile}
                file={bankFile}
                color={C.emerald}
              />
              <DropZone
                label="ملف الأستاذ العام (GL.xlsx)"
                onFile={setGlFile}
                file={glFile}
                color={C.azure2}
              />
            </div>
            <div
              style={{
                background: C.white,
                border: `1px solid ${C.rule}`,
                padding: 16,
                marginBottom: 16,
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: C.mid,
                  marginBottom: 12,
                }}
              >
                MATCHING TOLERANCE · إعدادات التسامح
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 20,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: C.mid, marginBottom: 4 }}>
                    فرق المبلغ المسموح (SAR)
                  </div>
                  <input
                    type="number"
                    value={tol.amt}
                    onChange={(e) => setTol((t) => ({ ...t, amt: +e.target.value }))}
                    min={0}
                    style={{ ...IS, width: 80 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.mid, marginBottom: 4 }}>
                    فرق الأيام المسموح
                  </div>
                  <input
                    type="number"
                    value={tol.days}
                    onChange={(e) => setTol((t) => ({ ...t, days: +e.target.value }))}
                    min={0}
                    max={30}
                    style={{ ...IS, width: 60 }}
                  />
                </div>
                <div
                  style={{ flex: 1, fontSize: 10, color: C.light, lineHeight: 1.6 }}
                >
                  يعتبر المبلغ مطابقاً إذا كان الفرق &lt; {tol.amt} SAR والتاريخ فرقه
                  &lt; {tol.days} يوم
                </div>
              </div>
            </div>
            {error && (
              <div
                style={{
                  padding: 12,
                  background: C.crimson3,
                  border: `1px solid ${C.crimson2}`,
                  borderRadius: 4,
                  fontSize: 11,
                  color: C.crimson2,
                  marginBottom: 14,
                }}
              >
                ⚠️ {error}
              </div>
            )}
            <button
              onClick={runRecon}
              disabled={loading || !bankFile || !glFile || !xlsxReady}
              style={{
                width: "100%",
                padding: "14px 0",
                background:
                  !bankFile || !glFile || !xlsxReady ? C.pale : C.azure,
                color: !bankFile || !glFile || !xlsxReady ? C.mid : "#fff",
                border: "none",
                fontSize: 14,
                fontWeight: 700,
                cursor:
                  !bankFile || !glFile || !xlsxReady ? "not-allowed" : "pointer",
                borderRadius: 4,
              }}
            >
              {loading ? "⏳ جاري المطابقة..." : "🔍 ابدأ المطابقة التلقائية"}
            </button>
            {results && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: C.emerald3,
                  border: `1px solid ${C.emerald}`,
                  borderRadius: 4,
                  fontSize: 11,
                  color: C.emerald,
                  textAlign: "center",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
                onClick={() => setPage("overview")}
              >
                ✅ آخر نتيجة: {stats?.matched} مطابق — اضغط لعرض النتائج
              </div>
            )}
          </div>
        )}

        {page === "overview" && stats && (
          <>
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.azure2,
                  marginBottom: 4,
                }}
              >
                BANK RECONCILIATION RESULTS
              </div>
              <div
                style={{ fontSize: 21, fontWeight: 700, color: C.ink, marginBottom: 2 }}
              >
                نتائج المطابقة
              </div>
              <div style={{ fontSize: 12, color: C.mid }}>
                {bankFile?.name} ⇔ {glFile?.name}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 0,
                background: C.rule,
                border: `1px solid ${C.rule}`,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              <KPI
                ar="معدل المطابقة"
                en="MATCH RATE"
                value={stats.rate.toFixed(1) + "%"}
                sub={`${stats.matched + stats.near} من ${glData.length} قيد GL`}
                color={C.emerald}
                bar={stats.rate}
              />
              <KPI
                ar="الدائن البنكي"
                en="BANK CREDIT"
                value={fmt(stats.bankCr, 0)}
                sub="SAR"
                color={C.azure2}
              />
              <KPI
                ar="المدين البنكي"
                en="BANK DEBIT"
                value={fmt(stats.bankDr, 0)}
                sub="SAR"
                color={C.crimson2}
              />
              <KPI
                ar="الرصيد الختامي"
                en="CLOSING BAL"
                value={fmt(stats.closing, 0)}
                sub="SAR"
                color={C.emerald}
              />
              <KPI
                ar="الاستثناءات"
                en="EXCEPTIONS"
                value={stats.ungl + stats.unbank}
                sub={`${stats.ungl} GL · ${stats.unbank} بنك`}
                color={stats.ungl + stats.unbank > 0 ? C.crimson2 : C.emerald}
              />
            </div>
            <div
              style={{
                background: C.white,
                border: `1px solid ${C.rule}`,
                padding: "18px 22px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: C.mid,
                  marginBottom: 14,
                }}
              >
                RECONCILIATION WATERFALL · بيان التوفيق
              </div>
              {[
                {
                  en: "Bank Credit",
                  ar: "الدائن البنكي",
                  v: fmt(stats.bankCr) + " SAR",
                  c: C.emerald,
                },
                {
                  en: "Less: Bank Debit",
                  ar: "ناقص المدين",
                  v: "(" + fmt(stats.bankDr) + ") SAR",
                  c: C.crimson2,
                  indent: true,
                },
                {
                  en: "Net Bank Movement",
                  ar: "صافي البنك",
                  v: fmt(stats.netBank) + " SAR",
                  c: C.ink,
                },
                {
                  en: "GL Inward",
                  ar: "GL الوارد",
                  v: fmt(stats.glIn) + " SAR",
                  c: C.emerald,
                },
                {
                  en: "GL Outward",
                  ar: "GL الصادر",
                  v: "(" + fmt(stats.glOut) + ") SAR",
                  c: C.crimson2,
                  indent: true,
                },
                {
                  en: "Net GL Movement",
                  ar: "صافي GL",
                  v: fmt(stats.netGL) + " SAR",
                  c: C.ink,
                },
                {
                  en: "Difference (Bank – GL)",
                  ar: "الفرق",
                  v: fmt(stats.diff) + " SAR",
                  c: stats.diff < 1 ? C.emerald : C.crimson2,
                  final: true,
                },
              ].map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 0",
                    borderBottom: `1px solid ${row.final ? C.ink : C.pale}`,
                    borderTop: row.final ? `2px solid ${C.ink}` : "none",
                    marginTop: row.final ? 6 : 0,
                  }}
                >
                  <div style={{ flex: 1, paddingRight: row.indent ? 16 : 0 }}>
                    <div style={{ fontSize: 11, color: C.slate }}>{row.en}</div>
                    <div style={{ fontSize: 10, color: C.mid }}>{row.ar}</div>
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      fontWeight: 500,
                      color: row.c,
                      direction: "ltr",
                      minWidth: 160,
                      textAlign: "left",
                    }}
                  >
                    {row.v}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 1,
                background: C.rule,
                border: `1px solid ${C.rule}`,
              }}
            >
              {[
                {
                  s: "Matched",
                  count: stats.matched,
                  color: C.emerald,
                  bg: C.emerald3,
                },
                {
                  s: "Near Match",
                  count: stats.near,
                  color: C.amber2,
                  bg: C.amber3,
                },
                {
                  s: "Unmatched GL",
                  count: stats.ungl,
                  color: C.crimson2,
                  bg: C.crimson3,
                },
                {
                  s: "Unmatched Bank",
                  count: stats.unbank,
                  color: C.azure,
                  bg: C.azure4,
                },
              ].map((s) => (
                <div
                  key={s.s}
                  onClick={() => {
                    setFSt(s.s);
                    setPage("match");
                  }}
                  style={{
                    background: C.white,
                    padding: "16px 18px",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = s.bg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = C.white)}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 28,
                      fontWeight: 700,
                      color: s.color,
                      lineHeight: 1,
                    }}
                  >
                    {s.count}
                  </div>
                  <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>
                    {SAR_LABEL[s.s]}
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 9,
                      color: s.color,
                      marginTop: 2,
                      letterSpacing: 1,
                    }}
                  >
                    {s.s.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {page === "match" && results && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.azure2,
                  marginBottom: 4,
                }}
              >
                RECONCILIATION RESULTS
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>
                نتائج المطابقة
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              {[
                {
                  s: "ALL",
                  label: `الكل (${results.length})`,
                  color: C.slate,
                },
                {
                  s: "Matched",
                  label: `مطابق (${stats.matched})`,
                  color: C.emerald,
                },
                {
                  s: "Near Match",
                  label: `قريب (${stats.near})`,
                  color: C.amber2,
                },
                {
                  s: "Unmatched GL",
                  label: `GL غير مطابق (${stats.ungl})`,
                  color: C.crimson2,
                },
                {
                  s: "Unmatched Bank",
                  label: `بنك غير مطابق (${stats.unbank})`,
                  color: C.azure,
                },
              ].map((p) => (
                <button
                  key={p.s}
                  onClick={() => setFSt(p.s)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 14px",
                    border: `1px solid ${fSt === p.s ? p.color : "transparent"}`,
                    background: fSt === p.s ? p.color + "22" : C.white,
                    color: p.color,
                    cursor: "pointer",
                    borderRadius: 20,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={FB}>
              <input
                value={fQ}
                onChange={(e) => setFQ(e.target.value)}
                placeholder="بحث — رقم القيد، المبلغ، التاريخ..."
                style={{ ...IS, minWidth: 240 }}
              />
              <div style={{ flex: 1 }} />
              <span
                style={{ fontFamily: "monospace", fontSize: 9, color: C.light }}
              >
                {matchRows.length} records
              </span>
            </div>
            <Tbl
              cols={[
                {
                  ar: "رقم القيد GL",
                  mono: true,
                  color: C.azure2,
                  render: (r) => r.gl?.je || "—",
                },
                {
                  ar: "تاريخ GL",
                  mono: true,
                  color: C.mid,
                  render: (r) => r.gl?.date || "—",
                },
                {
                  ar: "مبلغ GL",
                  mono: true,
                  num: true,
                  render: (r) =>
                    r.gl ? (
                      <span
                        style={{
                          color: r.gl.amount < 0 ? C.crimson2 : C.emerald,
                        }}
                      >
                        {fmt(r.gl.amount)}
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  ar: "الاتجاه",
                  render: (r) =>
                    r.gl ? (
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 9,
                          padding: "2px 6px",
                          background:
                            r.gl.direction === "IN" ? C.emerald3 : C.crimson3,
                          color:
                            r.gl.direction === "IN" ? C.emerald : C.crimson2,
                        }}
                      >
                        {r.gl.direction}
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  ar: "تاريخ البنك",
                  mono: true,
                  color: C.mid,
                  render: (r) => r.bank?.date || "—",
                },
                {
                  ar: "الدائن",
                  mono: true,
                  num: true,
                  render: (r) =>
                    r.bank?.credit ? (
                      <span style={{ color: C.emerald }}>
                        {fmt(r.bank.credit)}
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  ar: "المدين",
                  mono: true,
                  num: true,
                  render: (r) =>
                    r.bank?.debit ? (
                      <span style={{ color: C.crimson2 }}>
                        {fmt(r.bank.debit)}
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  ar: "الفرق",
                  mono: true,
                  num: true,
                  render: (r) =>
                    r.diff != null ? (
                      <span
                        style={{
                          color: r.diff > 0.05 ? C.amber2 : C.emerald,
                        }}
                      >
                        {fmt(r.diff)}
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  ar: "أيام",
                  mono: true,
                  render: (r) =>
                    r.days != null ? (
                      <span
                        style={{ color: r.days > 1 ? C.amber2 : C.slate }}
                      >
                        {r.days}d
                      </span>
                    ) : (
                      "—"
                    ),
                },
                {
                  ar: "الحالة",
                  render: (r) => <Badge status={r.status} />,
                },
              ]}
              rows={matchRows}
              onRow={setModal}
              rowBg={matchBg}
              maxH="calc(100vh - 320px)"
            />
          </>
        )}

        {page === "bank" && bankData && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.azure2,
                  marginBottom: 4,
                }}
              >
                BANK STATEMENT
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>
                كشف حساب البنك
              </div>
              <div style={{ fontSize: 11, color: C.mid }}>
                {bankFile?.name} · {bankData.length} حركة
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 0,
                background: C.rule,
                border: `1px solid ${C.rule}`,
                marginBottom: 0,
                flexWrap: "wrap",
              }}
            >
              <KPI
                ar="إجمالي الدائن"
                en="TOTAL CREDIT"
                value={fmt(stats.bankCr, 0)}
                sub="SAR"
                color={C.emerald}
              />
              <KPI
                ar="إجمالي المدين"
                en="TOTAL DEBIT"
                value={fmt(stats.bankDr, 0)}
                sub="SAR"
                color={C.crimson2}
              />
              <KPI
                ar="صافي الحركة"
                en="NET MOVEMENT"
                value={fmt(stats.netBank, 0)}
                sub="SAR"
                color={C.azure2}
              />
              <KPI
                ar="الرصيد الختامي"
                en="CLOSING"
                value={fmt(stats.closing, 0)}
                sub="SAR"
                color={C.emerald}
              />
            </div>
            <div style={FB}>
              <input
                value={bQ}
                onChange={(e) => setBQ(e.target.value)}
                placeholder="بحث..."
                style={{ ...IS, minWidth: 200 }}
              />
              <div style={{ flex: 1 }} />
              <span
                style={{ fontFamily: "monospace", fontSize: 9, color: C.light }}
              >
                {bankRows.length} rows
              </span>
            </div>
            <Tbl
              cols={[
                { key: "date", ar: "التاريخ", mono: true, color: C.mid },
                {
                  ar: "الدائن",
                  mono: true,
                  num: true,
                  render: (r) => (
                    <span
                      style={{
                        color: C.emerald,
                        fontWeight: r.credit > 0 ? 600 : 400,
                      }}
                    >
                      {r.credit > 0 ? fmt(r.credit) : "—"}
                    </span>
                  ),
                },
                {
                  ar: "المدين",
                  mono: true,
                  num: true,
                  render: (r) => (
                    <span
                      style={{
                        color: C.crimson2,
                        fontWeight: r.debit > 0 ? 600 : 400,
                      }}
                    >
                      {r.debit > 0 ? fmt(r.debit) : "—"}
                    </span>
                  ),
                },
                {
                  key: "balance",
                  ar: "الرصيد",
                  mono: true,
                  num: true,
                  render: (r) => fmt(r.balance),
                },
                {
                  ar: "CR/DR",
                  render: (r) => (
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 9,
                        padding: "2px 6px",
                        background:
                          r.side === "CR" ? C.emerald3 : C.crimson3,
                        color: r.side === "CR" ? C.emerald : C.crimson2,
                      }}
                    >
                      {r.side}
                    </span>
                  ),
                },
                {
                  key: "type",
                  ar: "النوع",
                  small: true,
                  color: C.mid,
                  maxW: 180,
                },
                {
                  key: "desc",
                  ar: "الوصف",
                  small: true,
                  color: C.mid,
                  maxW: 260,
                },
              ]}
              rows={bankRows}
              maxH="calc(100vh - 360px)"
            />
          </>
        )}

        {page === "gl" && glData && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.azure2,
                  marginBottom: 4,
                }}
              >
                GENERAL LEDGER
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>
                دفتر الأستاذ العام
              </div>
              <div style={{ fontSize: 11, color: C.mid }}>
                {glFile?.name} · {glData.length} قيد
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 0,
                background: C.rule,
                border: `1px solid ${C.rule}`,
                marginBottom: 0,
                flexWrap: "wrap",
              }}
            >
              <KPI
                ar="إجمالي القيود"
                en="TOTAL ENTRIES"
                value={glData.length}
                color={C.ink}
              />
              <KPI
                ar="GL الوارد"
                en="INWARD"
                value={fmt(stats.glIn, 0)}
                sub="SAR"
                color={C.emerald}
              />
              <KPI
                ar="GL الصادر"
                en="OUTWARD"
                value={fmt(stats.glOut, 0)}
                sub="SAR"
                color={C.crimson2}
              />
              <KPI
                ar="صافي GL"
                en="NET GL"
                value={fmt(stats.netGL, 0)}
                sub="SAR"
                color={stats.netGL > 0 ? C.emerald : C.crimson2}
              />
            </div>
            <div style={FB}>
              <input
                value={glQ}
                onChange={(e) => setGlQ(e.target.value)}
                placeholder="بحث..."
                style={{ ...IS, minWidth: 200 }}
              />
              <div style={{ flex: 1 }} />
              <span
                style={{ fontFamily: "monospace", fontSize: 9, color: C.light }}
              >
                {glRows.length} rows
              </span>
            </div>
            <Tbl
              cols={[
                {
                  key: "je",
                  ar: "رقم القيد",
                  mono: true,
                  color: C.azure2,
                },
                {
                  key: "date",
                  ar: "تاريخ الترحيل",
                  mono: true,
                  color: C.mid,
                },
                {
                  ar: "المبلغ",
                  mono: true,
                  num: true,
                  render: (r) => (
                    <span
                      style={{
                        color: r.amount < 0 ? C.crimson2 : C.emerald,
                        fontWeight: 500,
                      }}
                    >
                      {fmt(r.amount)}
                    </span>
                  ),
                },
                {
                  ar: "الاتجاه",
                  render: (r) => (
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 9,
                        padding: "2px 6px",
                        background:
                          r.direction === "IN" ? C.emerald3 : C.crimson3,
                        color:
                          r.direction === "IN" ? C.emerald : C.crimson2,
                      }}
                    >
                      {r.direction}
                    </span>
                  ),
                },
                {
                  key: "posting_key",
                  ar: "مفتاح الترحيل",
                  mono: true,
                  color: C.mid,
                },
                {
                  key: "gl_account",
                  ar: "الحساب",
                  small: true,
                  color: C.mid,
                  maxW: 220,
                },
                {
                  key: "je_type",
                  ar: "نوع القيد",
                  small: true,
                  color: C.light,
                  maxW: 160,
                },
              ]}
              rows={glRows}
              maxH="calc(100vh - 360px)"
            />
          </>
        )}

        {page === "exceptions" && results && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.crimson2,
                  marginBottom: 4,
                }}
              >
                EXCEPTIONS REGISTER
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>
                سجل الاستثناءات
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 0,
                background: C.rule,
                border: `1px solid ${C.rule}`,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              <KPI
                ar="بنك غير مطابق"
                en="UNMATCHED BANK"
                value={stats.unbank}
                color={C.crimson2}
              />
              <KPI
                ar="GL غير مطابق"
                en="UNMATCHED GL"
                value={stats.ungl}
                color={C.crimson2}
              />
              <KPI
                ar="مطابقات قريبة"
                en="NEAR MATCHES"
                value={stats.near}
                color={C.amber2}
              />
              <KPI
                ar="إجمالي التعرض"
                en="TOTAL EXPOSURE"
                value={fmt(
                  results
                    .filter((r) => r.status === "Unmatched Bank")
                    .reduce(
                      (s, r) => s + (r.bank?.credit || r.bank?.debit || 0),
                      0
                    ) +
                    results
                      .filter((r) => r.status === "Unmatched GL")
                      .reduce(
                        (s, r) => s + Math.abs(r.gl?.amount || 0),
                        0
                      ),
                  0
                )}
                sub="SAR"
                color={C.crimson2}
              />
            </div>
            {[
              {
                title: "حركات بنكية بدون قيد GL",
                en: "UNMATCHED BANK",
                data: results.filter((r) => r.status === "Unmatched Bank"),
              },
              {
                title: "قيود GL بدون حركة بنكية",
                en: "UNMATCHED GL",
                data: results.filter((r) => r.status === "Unmatched GL"),
              },
              {
                title: "مطابقات قريبة — تحتاج مراجعة",
                en: "NEAR MATCHES",
                data: results.filter((r) => r.status === "Near Match"),
              },
            ].map((sec) => (
              <div key={sec.en} style={{ marginBottom: 18 }}>
                <div
                  style={{
                    background: C.ink,
                    padding: "8px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}
                    >
                      {sec.title}
                    </div>
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: 8,
                        letterSpacing: 2,
                        color: "rgba(255,255,255,.4)",
                        textTransform: "uppercase",
                      }}
                    >
                      {sec.en}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      background: "rgba(255,255,255,.1)",
                      padding: "2px 10px",
                      color: "#fff",
                    }}
                  >
                    {sec.data.length} items
                  </span>
                </div>
                {sec.data.length === 0 ? (
                  <div
                    style={{
                      padding: 14,
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: C.light,
                      background: C.white,
                      border: `1px solid ${C.rule}`,
                    }}
                  >
                    ✓ لا توجد استثناءات
                  </div>
                ) : (
                  <Tbl
                    cols={[
                      {
                        ar: "رقم القيد GL",
                        mono: true,
                        color: C.azure2,
                        render: (r) => r.gl?.je || "—",
                      },
                      {
                        ar: "تاريخ GL",
                        mono: true,
                        color: C.mid,
                        render: (r) => r.gl?.date || "—",
                      },
                      {
                        ar: "مبلغ GL",
                        mono: true,
                        num: true,
                        render: (r) =>
                          r.gl ? (
                            <span
                              style={{
                                color:
                                  r.gl.amount < 0
                                    ? C.crimson2
                                    : C.emerald,
                              }}
                            >
                              {fmt(r.gl.amount)}
                            </span>
                          ) : (
                            "—"
                          ),
                      },
                      {
                        ar: "تاريخ البنك",
                        mono: true,
                        color: C.mid,
                        render: (r) => r.bank?.date || "—",
                      },
                      {
                        ar: "مبلغ البنك",
                        mono: true,
                        num: true,
                        render: (r) =>
                          r.bank ? (
                            <span style={{ color: C.emerald }}>
                              {fmt(r.bank.credit || r.bank.debit)}
                            </span>
                          ) : (
                            "—"
                          ),
                      },
                      {
                        ar: "الفرق",
                        mono: true,
                        render: (r) =>
                          r.diff != null ? fmt(r.diff) : "—",
                      },
                      {
                        ar: "الأيام",
                        render: (r) =>
                          r.days != null ? r.days + "d" : "—",
                      },
                      {
                        ar: "الحالة",
                        render: (r) => <Badge status={r.status} />,
                      },
                    ]}
                    rows={sec.data}
                    onRow={setModal}
                    maxH="220px"
                  />
                )}
              </div>
            ))}
          </>
        )}

        {page === "export" && results && (
          <>
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: C.azure2,
                  marginBottom: 4,
                }}
              >
                EXPORT & REPORTS
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>
                تصدير التقارير
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 16,
              }}
            >
              {[
                {
                  icon: "📊",
                  title: "كل النتائج (CSV)",
                  sub: "جميع سجلات المطابقة",
                  fn: () => exportCSV("all"),
                },
                {
                  icon: "✅",
                  title: "المطابقات فقط (CSV)",
                  sub: "السجلات المطابقة بالكامل",
                  fn: () => exportCSV("matched"),
                },
                {
                  icon: "⚠️",
                  title: "الاستثناءات (CSV)",
                  sub: "السجلات غير المطابقة والقريبة",
                  fn: () => exportCSV("exceptions"),
                },
              ].map((c, i) => (
                <div
                  key={i}
                  style={{
                    background: C.white,
                    border: `1px solid ${C.rule}`,
                    padding: 20,
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: C.ink,
                      marginBottom: 4,
                    }}
                  >
                    {c.title}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: C.mid,
                      marginBottom: 16,
                      lineHeight: 1.7,
                    }}
                  >
                    {c.sub}
                  </div>
                  <button
                    onClick={c.fn}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "8px 16px",
                      background: C.azure,
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      width: "100%",
                      borderRadius: 3,
                    }}
                  >
                    تحميل
                  </button>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 20,
                background: C.white,
                border: `1px solid ${C.rule}`,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: C.mid,
                  marginBottom: 12,
                }}
              >
                SESSION SUMMARY · ملخص الجلسة
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5,1fr)",
                  gap: 12,
                }}
              >
                {[
                  ["مطابق", stats.matched, C.emerald],
                  ["قريب", stats.near, C.amber2],
                  ["GL غير مطابق", stats.ungl, C.crimson2],
                  ["بنك غير مطابق", stats.unbank, C.crimson2],
                  ["الإجمالي", results.length, C.ink],
                ].map(([l, n, c]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: 22,
                        fontWeight: 700,
                        color: c,
                      }}
                    >
                      {n}
                    </div>
                    <div style={{ fontSize: 10, color: C.mid, marginTop: 2 }}>
                      {l}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <Modal item={modal} onClose={() => setModal(null)} />
    </div>
  );
}
