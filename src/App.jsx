import React, { useMemo, useState } from "react";

// --- Simple parsing of previous block lines ---
// Expected rough format:
// Day 1 – Lower
// Squat 3x6 @ RPE7 60kg
// Deadlift 3x5 @ RPE8
//
const lineRx = /^(.*?)(?:\s+(\d+)x(\d+))?(?:\s*@\s*RPE\s*([0-9.]+))?(?:\s+([0-9.]+)\s*kg)?\s*$/i;

function parseBlock(text) {
  const days = [];
  let current = null;
  const lines = (text || "").split(/\r?\n/);
  for (const raw of lines) {
    const s = raw.trim();
    if (!s) continue;
    if (/^day\s*\d+/i.test(s) || /—|-/.test(s) && s.toLowerCase().includes("day")) {
      current = { title: s, items: [] };
      days.push(current);
      continue;
    }
    if (current == null) {
      current = { title: "Day 1", items: [] };
      days.push(current);
    }
    const m = s.match(lineRx);
    if (!m) continue;
    const name = (m[1] || "").trim();
    if (!name) continue;
    const sets = m[2] ? parseInt(m[2], 10) : null;
    const reps = m[3] ? parseInt(m[3], 10) : null;
    const rpe  = m[4] ? parseFloat(m[4]) : null;
    const load = m[5] ? parseFloat(m[5]) : null;
    current.items.push({ name, sets, reps, rpe, load, raw: s });
  }
  return days;
}

// Alt exercise suggestions (very small map to start)
const ALT_MAP = {
  "back squat": ["front squat", "goblet squat", "hack squat (machine)"],
  "squat": ["front squat", "goblet squat", "leg press"],
  "deadlift": ["trap bar deadlift", "RDL", "semi-sumo deadlift"],
  "bench": ["DB bench", "incline DB press", "machine chest press"],
  "overhead press": ["DB shoulder press", "seated machine press"],
  "lunge": ["split squat", "reverse lunge", "leg press single-leg"],
  "row": ["chest-supported row", "seated cable row", "single-arm DB row"]
};

function suggestAlts(name) {
  const key = Object.keys(ALT_MAP).find(k => name.toLowerCase().includes(k));
  return key ? ALT_MAP[key] : ["variation of " + name, "machine alternative", "unilateral version"];
}

// Apply simple progression rules to an item
function progressItem(item, difficulty) {
  let { sets, reps, load, rpe } = item;
  sets = sets ?? 3;
  reps = reps ?? 6;
  // caps
  const minSets = 2, maxSets = 6;
  const minReps = 3, maxReps = 12;

  if (difficulty === "easy") {
    if (isFinite(load)) {
      load = +(load * 1.05).toFixed(1);
    } else if (reps < maxReps) {
      reps += 1;
    } else if (sets < maxSets) {
      sets += 1;
    }
    if (rpe != null) rpe = Math.min(9, (rpe + 0.5));
  } else if (difficulty === "hard") {
    if (isFinite(load)) {
      load = +(load * 0.95).toFixed(1);
    } else if (sets > minSets) {
      sets -= 1;
    }
    // keep reps same, maybe lower RPE target slightly
    if (rpe != null) rpe = Math.max(6, (rpe - 0.5));
  } else { // just-right
    if (isFinite(load)) load = +(load * 1.02).toFixed(1);
    // slight nudge only
  }
  return { ...item, sets, reps, load, rpe };
}

function formatItem(item) {
  const parts = [`${item.name}`, `${item.sets}x${item.reps}`];
  if (item.rpe != null) parts.push(`@ RPE${item.rpe.toFixed(1).replace(/\.0$/,'')}`);
  if (isFinite(item.load)) parts.push(`${item.load}kg`);
  return parts.join(" ");
}

// Templates per style
const TEMPLATES = {
  "Strength only": [
    { title: "Day 1 – Lower", items: ["Back Squat 4x6 @ RPE7", "RDL 3x8 @ RPE7", "Leg Press 3x12"] },
    { title: "Day 2 – Upper", items: ["Bench Press 4x6 @ RPE7", "Row 3x10 @ RPE7", "Lat Pulldown 3x12"] },
    { title: "Day 3 – Full Body", items: ["Deadlift 3x5 @ RPE8", "DB Press 3x8 @ RPE7", "Split Squat 3x10"] }
  ],
  "Hybrid": [
    { title: "Day 1 – Full Strength", items: ["Back Squat 4x5 @ RPE7", "Bench Press 4x6 @ RPE7", "Row 3x10"] },
    { title: "Day 2 – Conditioning/Intervals", items: ["Bike/Run intervals 6x2 min @ hard", "Core circuit 3 rounds"] },
    { title: "Day 3 – Upper Strength", items: ["OHP 4x5 @ RPE7", "Pull-ups 3xAMRAP", "DB Row 3x10"] },
    { title: "Day 4 – Metcon / HYROX-style", items: ["Sled push 4x25m", "Farmer carry 4x40m", "Burpee broad jumps 3x10"] },
    { title: "Day 5 – Long Run", items: ["Easy run 45–60 min"] }
  ],
  "HYROX": [
    { title: "Day 1 – Strength", items: ["Back Squat 4x5 @ RPE7", "Bench Press 4x6 @ RPE7", "Row 3x10"] },
    { title: "Day 2 – HYROX Engine", items: ["SkiErg 4x1km @ threshold", "Walking lunges 4x20", "Wall balls 4x20"] },
    { title: "Day 3 – Strength", items: ["Deadlift 3x5 @ RPE8", "DB Press 3x8 @ RPE7", "Split Squat 3x10"] },
    { title: "Day 4 – HYROX Simulation", items: ["Run + stations circuit x 2–3 rounds"] },
    { title: "Day 5 – Long Run", items: ["Easy run 60–75 min"] }
  ],
  "Strength + running": [
    { title: "Day 1 – Lower Strength", items: ["Back Squat 4x6 @ RPE7", "RDL 3x8", "Calf Raise 3x15"] },
    { title: "Day 2 – Run Intervals", items: ["6x400m @ fast, 200m easy"] },
    { title: "Day 3 – Upper Strength", items: ["Bench Press 4x6 @ RPE7", "Row 3x10", "Face Pull 3x15"] },
    { title: "Day 4 – Long Run", items: ["Easy run 45–60 min"] }
  ]
};

function templateToText(style) {
  const blocks = TEMPLATES[style] || [];
  const out = [];
  for (const day of blocks) {
    out.push(day.title);
    for (const it of day.items) out.push(it);
    out.push("");
  }
  return out.join("\n").trim();
}

export default function App() {
  const [client, setClient] = useState("");
  const [style, setStyle] = useState("Strength only");
  const [mode, setMode] = useState("template"); // 'template' or 'progress'
  const [prevBlock, setPrevBlock] = useState("");
  const [difficulty, setDifficulty] = useState("just");
  const [enjoy, setEnjoy] = useState("neutral");
  const [disliked, setDisliked] = useState("");
  const [injuries, setInjuries] = useState("");
  const [notes, setNotes] = useState("");

  const [output, setOutput] = useState("");

  function loadTemplate() {
    setPrevBlock(templateToText(style));
  }

  function generate() {
    // If mode is template and prevBlock empty, load it first
    let source = prevBlock;
    if (mode === "template" && !source.trim()) {
      source = templateToText(style);
      setPrevBlock(source);
    }
    const days = parseBlock(source);
    const diffKey = difficulty === "easy" ? "easy" : (difficulty === "hard" ? "hard" : "just");

    // Basic injury-based flags: if knee mentioned -> avoid deep knee flexion; back -> avoid heavy spinal loading
    const injuryText = injuries.toLowerCase();
    const avoidKnee = /knee|patella|itb|quad/i.test(injuries);
    const avoidBack = /back|disc|spine|lumbar/i.test(injuries);
    const avoidShoulder = /shoulder|rotator|ac joint/i.test(injuries);

    const dislikedList = disliked.toLowerCase().split(/[,\n]+/).map(s=>s.trim()).filter(Boolean);

    const out = [];
    if (client) out.push(`Client: ${client}`);
    out.push(`Style: ${style}`);
    out.push("");

    for (const day of days) {
      out.push(day.title);
      for (const it of day.items) {
        let next = progressItem(it, diffKey);

        // dislike swap
        const isDisliked = dislikedList.some(d => d && it.name.toLowerCase().includes(d));
        const risky =
          (avoidKnee && /squat|lunge|step|split/i.test(it.name)) ||
          (avoidBack && /deadlift|good ?morning|barbell row|back squat/i.test(it.name)) ||
          (avoidShoulder && /press|overhead|ohp|snatch/i.test(it.name));

        if (isDisliked || risky) {
          const alts = suggestAlts(it.name);
          out.push(`• ${formatItem(next)}  → consider swap: ${alts.join(" / ")}`);
        } else {
          out.push(`• ${formatItem(next)}`);
        }
      }
      out.push("");
    }

    if (notes.trim()) {
      out.push("Coach notes:");
      out.push(notes.trim());
      out.push("");
    }

    out.push("Guidelines:");
    if (diffKey === "easy") out.push("- Last block felt easy → progress volume/load more aggressively this week.");
    if (diffKey === "hard") out.push("- Last block felt hard → hold volume or reduce load; prioritise form and consistency.");
    if (enjoy === "loved") out.push("- Keep favourite lifts where possible.");
    if (enjoy === "disliked") out.push("- Swap disliked lifts for close variations.");
    if (injuryText) out.push("- Respect current niggles: adjust ROM, tempo, or swap as noted.");
    setOutput(out.join("\n"));
  }

  function copyOut() {
    navigator.clipboard.writeText(output || "");
  }

  function downloadTxt() {
    const blob = new Blob([output || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (client ? client.replace(/\s+/g,"_")+"_" : "") + "next_block.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-semibold brand-heading">Coach’s Program Builder</h1>
          <span className="hidden md:inline-flex px-3 py-1 rounded-full text-xs chip border border-[color:var(--brand-soft)]">Lioness Performance</span>
        </header>

        {/* Client & style */}
        <div className="grid md:grid-cols-4 gap-3 border rounded-2xl p-4 border-[color:var(--brand-soft)]">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Client name</label>
            <input className="w-full border rounded-2xl p-2" value={client} onChange={e=>setClient(e.target.value)} placeholder="e.g., Sarah K." />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Training style</label>
            <select className="w-full border rounded-2xl p-2" value={style} onChange={e=>setStyle(e.target.value)}>
              {Object.keys(TEMPLATES).map(k => <option key={k}>{k}</option>)}
            </select>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-6 text-sm">
          <button className={`tab ${mode==='template'?'active':''}`} onClick={()=>setMode('template')}>Start from Template</button>
          <button className={`tab ${mode==='progress'?'active':''}`} onClick={()=>setMode('progress')}>Progress Previous Block</button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: inputs */}
          <div className="border rounded-2xl p-4 border-[color:var(--brand-soft)]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">{mode==='template' ? 'Template' : 'Previous block'}</h2>
              {mode==='template' && (
                <button className="text-xs underline" onClick={loadTemplate}>Load default week</button>
              )}
            </div>
            <textarea rows={12} className="w-full border rounded-2xl p-2 font-mono" value={prevBlock} onChange={e=>setPrevBlock(e.target.value)} placeholder={mode==='template' ? 'Click "Load default week" or type your own skeleton...' : 'Paste the client’s last block here...'} />

            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <div className="flex flex-wrap gap-2">
                  {['easy','just','hard'].map(k=> (
                    <label key={k} className={`px-3 py-1 border rounded-full cursor-pointer ${difficulty===k?'chip':''}`}>
                      <input type="radio" className="mr-2" checked={difficulty===k} onChange={()=>setDifficulty(k)} />{k}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Enjoyment</label>
                <div className="flex flex-wrap gap-2">
                  {[['loved','Loved'],['neutral','Neutral'],['disliked','Disliked']].map(([k,lab])=> (
                    <label key={k} className={`px-3 py-1 border rounded-full cursor-pointer ${enjoy===k?'chip':''}`}>
                      <input type="radio" className="mr-2" checked={enjoy===k} onChange={()=>setEnjoy(k)} />{lab}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium mb-1">Disliked exercises (comma/line separated)</label>
              <textarea rows={2} className="w-full border rounded-2xl p-2" value={disliked} onChange={e=>setDisliked(e.target.value)} placeholder="e.g., lunges, back squat" />
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium mb-1">Injuries / niggles</label>
              <textarea rows={2} className="w-full border rounded-2xl p-2" value={injuries} onChange={e=>setInjuries(e.target.value)} placeholder="e.g., knee pain, low back tightness" />
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium mb-1">Coach notes</label>
              <textarea rows={2} className="w-full border rounded-2xl p-2" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any extra context for this block..." />
            </div>

            <div className="mt-4">
              <button className="btn px-4 py-2 rounded-2xl" onClick={generate}>Generate Next Block</button>
            </div>
          </div>

          {/* Right: output */}
          <div className="border rounded-2xl p-4 border-[color:var(--brand-soft)]">
            <h2 className="text-lg font-semibold mb-2">Suggested next block</h2>
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 rounded-xl p-3 min-h-[300px]">{output || "Your plan will appear here after you click Generate."}</pre>
            <div className="mt-3 flex gap-3">
              <button className="px-4 py-2 rounded-2xl border" onClick={copyOut}>Copy</button>
              <button className="px-4 py-2 rounded-2xl btn" onClick={downloadTxt}>Download .txt</button>
            </div>
          </div>
        </div>

        <footer className="pt-2 text-xs text-gray-500">
          v1 progression: +5% load or +1 rep / +1 set if easy; hold or -5% load if hard; swap disliked/risky lifts for close variations.
        </footer>
      </div>
    </div>
  );
}
