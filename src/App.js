import React, { useState, useEffect } from "react";

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Church Attendance Processing System for "Kairos Cell B".

Convert raw attendance input into strictly formatted church reports.

CORE PRINCIPLE: INPUT = TRUTH. Do not add, guess, or invent any attendee who was not mentioned in the input.

EXCEPTION — REGISTER-ASSISTED INFERENCE: If a known church register is supplied separately below, you ARE allowed to use it to (a) expand a typed first name into that person's full name, and (b) infer that person's role (CS/S/SS/Member) and which shepherd's group they belong to — as long as the person himself was actually mentioned in the input. This is not inventing an attendee; it is identifying a real, named attendee using known records. Never use the register to add someone who was not typed in the input at all.

FLEXIBLE NAME INPUT:
- Input may contain only first names (e.g. "Paul", "Deborah") instead of full names
- Output the name exactly as it was typed in the input — do NOT auto-expand "Paul" into "Paul Eze" yourself
- Preserve whatever name format the user typed (first name only, full name, nickname) in structuredAttendance and groups
- Do not merge or assume two different first names are the same person
- Do not invent a surname that wasn't in the input

ROLE DETECTION RULES:
- "CS." prefix = Cell Shepherd
- "S." prefix = Shepherd  
- "SS." prefix = Senior Shepherd
- No prefix, indented under a shepherd = Member under that shepherd
- Names with "Pastor", "Rev", "Bishop" = Pastor (only if listed as attendee)

GROUP STRUCTURE RULES (CRITICAL):
- A Shepherd and the names listed under them form a GROUP
- The shepherd is the GROUP LEADER
- Members listed under a shepherd (with "-" or indented) belong to that shepherd's group
- "none" under a shepherd means they have no members present
- Preserve this grouping in the output

LEADER PRESENCE RULE (CRITICAL):
- A group's leader (shepherd) is marked present: true ONLY if their own name was explicitly listed as attending in the input (with a service emoji on Sunday, or just listed for cell meeting)
- If a shepherd's name heads a group in the input ONLY as a label/owner for their members, but the shepherd's own name has no service emoji and isn't otherwise confirmed present, set their "present" field to false
- An absent leader is NOT counted in totals (CS/S/SS counts) but their members who ARE present still count normally
- Do not mark a leader absent unless there is a real signal they weren't there (e.g. their name appears with no emoji while members under them do have emojis, or they are explicitly marked absent in the input)

SUNDAY SERVICE RULES:
- 1️⃣ = Joy Service, 2️⃣ = Enlargement Service
- If a person appears in BOTH → count ONLY in 1️⃣ (Joy)
- If only one service → count in that service
- Never double count
- Detect service emoji per person

CELL MEETING RULES:
- Ignore service indicators (1️⃣ 2️⃣)
- Single attendance list
- Include offering, message, preacher, and time details

Detect whether input is SUNDAY SERVICE or CELL MEETING based on context clues like "cell meeting", "main offering", "bus offering", or presence of service indicators.

You must respond ONLY with valid JSON. No preamble, no markdown fences, no explanation outside JSON.

STRUCTUREDATTENDANCE FORMAT (CRITICAL — FOLLOW EXACTLY):
This field must be plain text built ONLY from group leader/member names and role prefixes.

Ordering rule: Cell Shepherd (CS) groups must appear FIRST, before Shepherd (S) or Senior Shepherd (SS) groups.

For SUNDAY SERVICE, structuredAttendance must look EXACTLY like this pattern (CS groups first, "- " prefix on every member line, role prefix before leader names, "(absent)" appended to a leader's line if present is false, "none" alone on its own line when a leader has no members, bold WhatsApp-style title and total):
"*MGS - Kairos Cell B*

30,06,2026

CS. Godsway Asare 1️⃣
- Deborah Senakey 2️⃣

S. Paul Eze (absent)
- Keller Agboka 1️⃣

S. Mawuli Kudor 1️⃣
- Ayodeji Ademola 2️⃣

CS: 1
S: 1
Members: 3
First timers: 0
*Total: 5*"

For CELL MEETING, structuredAttendance must look EXACTLY like this pattern (same structure, "- " prefix on members, NO service emojis anywhere, bold title and total, no MGS prefix):
"*Kairos Cell B*

30,06,2026

CS. Godsway Asare
- Deborah Senakey

S. Paul Eze (absent)
- Keller Agboka

S. Mawuli Kudor
- Ayodeji Ademola

CS: 1
S: 1
Members: 3
First timers: 0
*Total: 5*"

Rules for structuredAttendance:
- First line: title in bold asterisks — "*MGS - {cellName}*" for Sunday Service, "*{cellName}*" for Cell Meeting
- Blank line, then today's date as DD,MM,YYYY (two-digit day, two-digit month, four-digit year, comma-separated)
- Blank line, then groups: CS groups listed before S/SS groups
- Each leader's role prefix ("CS. " or "S. " or "SS. ", nothing for Pastor or plain Member) + their name + (Sunday only) their service emoji + " (absent)" if leader present is false
- Next line(s): each member under that leader, prefixed with "- " then their name + (Sunday only) their service emoji, one per line
- If a leader has zero members, the single word "none" on the next line (no dash)
- Blank line between each leader's block
- After all groups: blank line, then "CS: X", "S: X", "Members: X", "First timers: X", "*Total: X*" (bold the total line only; use real computed numbers — absent leaders are EXCLUDED from CS/S counts and from Total)
- Do not add any other labels, headers, or commentary anywhere in this string

For SUNDAY SERVICE respond with this exact JSON structure:
{
  "type": "sunday",
  "cellName": "Kairos Cell B",
  "groups": [
    {
      "leader": { "name": "Full Name", "role": "CS|S|SS|Pastor|Member", "service": "joy|enlargement|both", "present": true },
      "members": [
        { "name": "Full Name", "role": "Member", "service": "joy|enlargement|both" }
      ]
    }
  ],
  "structuredAttendance": "follow the exact format described above",
  "joyService": { "pastors": 0, "seniorShepherds": 0, "cellShepherds": 0, "shepherds": 0, "members": 0, "firstTimers": 0, "teens": 0 },
  "enlargementService": { "pastors": 0, "seniorShepherds": 0, "cellShepherds": 0, "shepherds": 0, "members": 0, "firstTimers": 0, "teens": 0 },
  "totals": { "cs": 0, "s": 0, "members": 0, "firstTimers": 0, "total": 0 }
}

For CELL MEETING respond with this exact JSON structure:
{
  "type": "cell",
  "cellName": "Kairos Cell B",
  "groups": [
    {
      "leader": { "name": "Full Name", "role": "CS|S|SS|Pastor|Member", "present": true },
      "members": [
        { "name": "Full Name", "role": "Member" }
      ]
    }
  ],
  "structuredAttendance": "follow the exact format described above (no service emojis)",
  "totals": { "pastors": 0, "seniorShepherds": 0, "cs": 0, "s": 0, "members": 0, "firstTimers": 0, "children": 0, "total": 0 },
  "offering": { "main": "0", "bus": "0", "note": "all momo" },
  "preacher": "",
  "message": "",
  "startTime": "",
  "endTime": "",
  "mc": "Lampo MC",
  "cellShepherdName": "",
  "venue": "Eyram Hostel, Maryland"
}`;

// ─── DETERMINISTIC ATTENDANCE BUILDER (guarantees exact format every time) ──
const rolePrefix = (role) => {
  if (role === "CS") return "CS. ";
  if (role === "S") return "S. ";
  if (role === "SS") return "SS. ";
  return ""; // Pastor or Member shown plain
};

const serviceEmoji = (service) => {
  if (service === "joy") return " 1️⃣";
  if (service === "enlargement") return " 2️⃣";
  if (service === "both") return " 1️⃣2️⃣";
  return "";
};

const roleSortOrder = (role) => {
  if (role === "CS") return 0;
  if (role === "SS") return 1;
  if (role === "S") return 2;
  return 3; // Pastor / Member-led groups last
};

const buildStructuredAttendance = (data) => {
  const groups = [...(data.groups || [])].sort(
    (a, b) => roleSortOrder(a.leader?.role) - roleSortOrder(b.leader?.role)
  );
  const isSunday = data.type === "sunday";

  const titleLine = isSunday ? `*MGS - ${data.cellName}*` : `*${data.cellName}*`;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const dateLine = `${dd},${mm},${yyyy}`;

  const lines = [titleLine, "", dateLine, ""];

  let csCount = 0, sCount = 0, ssCount = 0, memberCount = 0;

  groups.forEach((g, idx) => {
    const leaderPresent = g.leader?.present !== false;
    const absentTag = leaderPresent ? "" : " (absent)";
    const leaderLine = `${rolePrefix(g.leader?.role)}${g.leader?.name || ""}${isSunday ? serviceEmoji(g.leader?.service) : ""}${absentTag}`;
    lines.push(leaderLine);

    if (leaderPresent) {
      if (g.leader?.role === "CS") csCount++;
      else if (g.leader?.role === "S") sCount++;
      else if (g.leader?.role === "SS") ssCount++;
    }

    const members = g.members || [];
    if (members.length === 0) {
      lines.push("none");
    } else {
      members.forEach(m => {
        lines.push(`- ${m.name}${isSunday ? serviceEmoji(m.service) : ""}`);
        memberCount++;
      });
    }
    if (idx < groups.length - 1) lines.push("");
  });

  lines.push("");
  const t = data.totals || {};
  const firstTimers = t.firstTimers || 0;
  const csTotal = csCount + ssCount; // CS line groups CS+SS together as in original template
  const total = csCount + ssCount + sCount + memberCount + firstTimers;

  lines.push(`CS: ${csTotal}`);
  lines.push(`S: ${sCount}`);
  lines.push(`Members: ${memberCount}`);
  lines.push(`First timers: ${firstTimers}`);
  lines.push(`Total: ${total}`);
  lines[lines.length - 1] = `*Total: ${total}*`;

  return lines.join("\n");
};


const formatSundayReport = (data) => {
  const joy = data.joyService || {};
  const enl = data.enlargementService || {};
  const joyTotal = (joy.pastors||0)+(joy.seniorShepherds||0)+(joy.cellShepherds||0)+(joy.shepherds||0)+(joy.members||0)+(joy.firstTimers||0)+(joy.teens||0);
  const enlTotal = (enl.pastors||0)+(enl.seniorShepherds||0)+(enl.cellShepherds||0)+(enl.shepherds||0)+(enl.members||0)+(enl.firstTimers||0)+(enl.teens||0);
  return `${data.cellName}

JOY SERVICE
Pastors: ${joy.pastors||0}
Senior Shepherds: ${joy.seniorShepherds||0}
Cell Shepherds: ${joy.cellShepherds||0}
Shepherds: ${joy.shepherds||0}
Members: ${joy.members||0}
First timers: ${joy.firstTimers||0}
Teens: ${joy.teens||0}
ATTENDANCE: ${joyTotal}

ENLARGEMENT
Pastors: ${enl.pastors||0}
Senior Shepherds: ${enl.seniorShepherds||0}
Cell Shepherds: ${enl.cellShepherds||0}
Shepherds: ${enl.shepherds||0}
Members: ${enl.members||0}
First timers: ${enl.firstTimers||0}
Teens: ${enl.teens||0}
ATTENDANCE: ${enlTotal}

TOTAL ATTENDANCE: ${joyTotal + enlTotal}`;
};

const formatCellReport = (data) => {
  const t = data.totals || {};
  const csLeader = (data.groups || []).find(g => g.leader?.role === "CS" && g.leader?.present !== false);
  const cellShepherdName = data.cellShepherdName || csLeader?.leader?.name || "";
  return `*Name of cell:* *${data.cellName}*
*Name of MC:* ${data.mc || "Lampo MC"}
*Name of cell shepherd:* ${cellShepherdName}
*Venue cell meeting was held:* ${data.venue || "Eyram Hostel, Maryland"}

Starting and closing time: ${data.startTime || ""} to ${data.endTime || ""}

*Attendance*: ${t.total||0}

1. Pastors: ${t.pastors||0}
2. Senior Shepherd: ${t.seniorShepherds||0}
3. Cell Shepherd: ${t.cs||0}
4. Shepherds: ${t.s||0}
5. Members: ${t.members||0}
6. First timers: ${t.firstTimers||0}
7. Children: ${t.children||0}

*Offering: ${data.offering?.note || "all momo"}*
*Main offering: ${data.offering?.main || "0"}*
*Bus offering: ${data.offering?.bus || "0"}*

* *Preacher:* ${data.preacher || ""}
* *Message:* ${data.message || ""}
* Did you have Communion?: 

  *Soul winning report:*
* Altar Call: 0
* Cell Evangelism: 0

*Spectacular event* N/A`;
};

// ─── ABSENTEE HELPER ─────────────────────────────────────────────────────────
const getAbsentees = (register, groups) => {
  const presentNames = new Set();
  (groups || []).forEach(g => {
    if (g.leader?.name) presentNames.add(g.leader.name.trim().toLowerCase());
    (g.members || []).forEach(m => {
      if (m.name) presentNames.add(m.name.trim().toLowerCase());
    });
  });
  return register.filter(r => !presentNames.has(r.name.trim().toLowerCase()));
};

// ─── RESOLVE FIRST NAMES AGAINST REGISTER ───────────────────────────────────
// If input only had a first name, try to match it to a full name in the register.
// Ambiguous matches (2+ people with the same first name) are left as-is and flagged.
const resolveNamesAgainstRegister = (parsed, register) => {
  if (!register || register.length === 0) return { parsed, ambiguous: [] };
  const ambiguous = [];

  const resolveOne = (person) => {
    const typed = (person.name || "").trim();
    if (!typed) return person;
    // Already a full name match? leave it.
    const exact = register.find(r => r.name.trim().toLowerCase() === typed.toLowerCase());
    if (exact) return { ...person, name: exact.name };

    // First-name-only match
    const firstNameMatches = register.filter(r =>
      r.name.trim().toLowerCase().split(" ")[0] === typed.toLowerCase()
    );
    if (firstNameMatches.length === 1) {
      return { ...person, name: firstNameMatches[0].name };
    }
    if (firstNameMatches.length > 1) {
      ambiguous.push({ typed, matches: firstNameMatches.map(m => m.name) });
    }
    return person; // leave as typed if no match or ambiguous
  };

  const groups = (parsed.groups || []).map(g => ({
    ...g,
    leader: resolveOne(g.leader || {}),
    members: (g.members || []).map(resolveOne),
  }));

  return { parsed: { ...parsed, groups }, ambiguous };
};


export default function App() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [register, setRegister] = useState([]);
  const [view, setView] = useState("input");
  const [copied, setCopied] = useState({});
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKeySetup, setShowKeySetup] = useState(false);
  // Register form
  const [regName, setRegName] = useState("");
  const [regRole, setRegRole] = useState("Member");
  const [regShepherd, setRegShepherd] = useState("");
  const [regEditId, setRegEditId] = useState(null);

  useEffect(() => {
    try {
      const h = localStorage.getItem("kairos_history");
      if (h) setHistory(JSON.parse(h));
      const r = localStorage.getItem("kairos_register");
      if (r) setRegister(JSON.parse(r));
      const k = localStorage.getItem("kairos_api_key");
      if (k) setApiKey(k);
      else setShowKeySetup(true);
    } catch {}
  }, []);

  const saveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      alert("That doesn't look like a valid Anthropic API key. It should start with sk-ant-");
      return;
    }
    localStorage.setItem("kairos_api_key", trimmed);
    setApiKey(trimmed);
    setShowKeySetup(false);
    setApiKeyInput("");
  };

  const saveHistory = (arr) => {
    setHistory(arr);
    try { localStorage.setItem("kairos_history", JSON.stringify(arr)); } catch {}
  };

  const deleteFromHistory = (id) => {
    const updated = history.filter(h => h.id !== id);
    saveHistory(updated);
    if (result && result.id === id) {
      setResult(null);
      setView("history");
    }
  };

  const saveRegister = (arr) => {
    setRegister(arr);
    try { localStorage.setItem("kairos_register", JSON.stringify(arr)); } catch {}
  };

  const processAttendance = async () => {
    if (!input.trim()) return;
    if (!apiKey) { setShowKeySetup(true); return; }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const registerContext = register.length > 0
        ? `\n\nKNOWN CHURCH REGISTER (use this to infer roles and shepherd groupings when the input only gives first names or omits titles like CS/S/SS):\n${register.map(r => {
            const roleLabel = r.role === "Member" ? "Member" : r.role;
            const under = r.shepherd ? ` (under ${r.shepherd})` : "";
            return `- ${r.name} — ${roleLabel}${under}`;
          }).join("\n")}\n\nWhen matching typed names against this register: if input says only a first name (e.g. "Paul"), match it to the closest full name in the register and use THAT person's role and shepherd grouping. If a first name matches more than one register entry, keep the name as typed (do not guess) and lower your confidence — do not force a role.`
        : "";

      const response = await fetch("/api/claude", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system: SYSTEM_PROMPT + registerContext,
          messages: [{ role: "user", content: input }],
        }),
      });
      const data = await response.json();
      const text = data.content?.map(i => i.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const { parsed: resolved, ambiguous } = resolveNamesAgainstRegister(parsed, register);
      if (resolved.groups && resolved.groups.length > 0) {
        resolved.structuredAttendance = buildStructuredAttendance(resolved);
      }
      const entry = {
        id: Date.now(),
        date: new Date().toLocaleDateString("en-GB"),
        type: resolved.type,
        cellName: resolved.cellName,
        data: resolved,
        input,
        ambiguous,
      };
      const updated = [entry, ...history].slice(0, 50);
      saveHistory(updated);
      setResult(entry);
      setView("result");
    } catch (err) {
      setError("Could not process attendance. Check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text, key) => {
    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        success = true;
      }
    } catch {}
    if (!success) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        success = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
    if (success) {
      setCopied(c => ({ ...c, [key]: true }));
      setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
    } else {
      setCopied(c => ({ ...c, [key]: "fail" }));
      setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2500);
    }
  };

  const addRegisterMember = () => {
    if (!regName.trim()) return;
    if (regEditId !== null) {
      const updated = register.map(r => r.id === regEditId
        ? { ...r, name: regName.trim(), role: regRole, shepherd: regShepherd.trim() }
        : r);
      saveRegister(updated);
      setRegEditId(null);
    } else {
      const newMember = { id: Date.now(), name: regName.trim(), role: regRole, shepherd: regShepherd.trim() };
      saveRegister([...register, newMember]);
    }
    setRegName(""); setRegRole("Member"); setRegShepherd("");
  };

  const deleteRegisterMember = (id) => saveRegister(register.filter(r => r.id !== id));

  const editRegisterMember = (member) => {
    setRegName(member.name);
    setRegRole(member.role);
    setRegShepherd(member.shepherd || "");
    setRegEditId(member.id);
  };

  const badge = (type) => type === "sunday"
    ? <span style={S.badgeSunday}>☀️ Sunday</span>
    : <span style={S.badgeCell}>🏠 Cell</span>;

  const roleBadge = (role) => {
    const map = {
      "CS": { bg: "#2a1a3a", color: "#c084fc" },
      "S": { bg: "#1a2a3a", color: "#60a5fa" },
      "SS": { bg: "#3a2a1a", color: "#fb923c" },
      "Pastor": { bg: "#1a3a2a", color: "#4ade80" },
      "Member": { bg: "#2a2a2a", color: "#94a3b8" },
    };
    const style = map[role] || map["Member"];
    return <span style={{ ...S.roleBadge, background: style.bg, color: style.color }}>{role}</span>;
  };

  // ─── GROUPS VIEW ────────────────────────────────────────────────────────────
  const GroupsView = ({ groups, type, register }) => {
    if (!groups || groups.length === 0) return null;
    const absentees = register.length > 0 ? getAbsentees(register, groups) : [];

    return (
      <div>
        <div style={S.cardLabel}>SHEPHERD GROUPS</div>
        {groups.map((g, i) => (
          <div key={i} style={S.groupCard}>
            <div style={S.groupLeader}>
              <div style={S.groupLeaderLeft}>
                <div style={S.groupLeaderName}>
                  {g.leader?.name || "Unknown"}
                  {g.leader?.present === false && <span style={S.absentInline}> (absent)</span>}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                  {roleBadge(g.leader?.role || "S")}
                  {type === "sunday" && g.leader?.service && (
                    <span style={S.serviceTag}>
                      {g.leader.service === "joy" ? "1️⃣ Joy" : g.leader.service === "enlargement" ? "2️⃣ Enlargement" : "1️⃣2️⃣ Both"}
                    </span>
                  )}
                </div>
              </div>
              <div style={S.memberCount}>
                {(g.members || []).length} member{(g.members || []).length !== 1 ? "s" : ""}
              </div>
            </div>
            {(g.members || []).length > 0 && (
              <div style={S.membersList}>
                {g.members.map((m, j) => (
                  <div key={j} style={S.memberRow}>
                    <span style={S.memberDot}>›</span>
                    <span style={S.memberName}>{m.name}</span>
                    {type === "sunday" && m.service && (
                      <span style={S.serviceTagSm}>
                        {m.service === "joy" ? "1️⃣" : m.service === "enlargement" ? "2️⃣" : "1️⃣2️⃣"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {(!g.members || g.members.length === 0) && (
              <div style={S.noMembers}>No members present</div>
            )}
          </div>
        ))}

        {absentees.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={S.cardLabel}>⚠️ ABSENTEES ({absentees.length})</div>
            <div style={S.absentCard}>
              {absentees.map((a, i) => (
                <div key={i} style={S.absentRow}>
                  <div>
                    <span style={S.absentName}>{a.name}</span>
                    {a.shepherd && <span style={S.absentShepherd}> · under {a.shepherd}</span>}
                  </div>
                  {roleBadge(a.role)}
                </div>
              ))}
            </div>
          </div>
        )}

        {register.length === 0 && (
          <div style={S.registerHint}>
            💡 Add members to the Register tab to enable absentee detection
          </div>
        )}
      </div>
    );
  };

  // ─── REGISTER VIEW ──────────────────────────────────────────────────────────
  const shepherds = register.filter(r => r.role === "S" || r.role === "CS" || r.role === "SS");

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  if (showKeySetup) {
    return (
      <div style={S.app}>
        <div style={S.keySetupWrap}>
          <div style={S.crossIcon2}>✝</div>
          <div style={S.keySetupTitle}>Kairos Cell B</div>
          <div style={S.keySetupSub}>Attendance System</div>
          <div style={S.keySetupCard}>
            <div style={S.cardLabel}>🔑 API KEY SETUP</div>
            <p style={S.keySetupText}>
              This app uses Claude AI to process attendance. You need a free Anthropic API key to get started.
            </p>
            <div style={S.keyStep}>1. Go to <span style={S.keyLink}>console.anthropic.com</span></div>
            <div style={S.keyStep}>2. Sign up / Log in</div>
            <div style={S.keyStep}>3. Click <b>API Keys</b> → <b>Create Key</b></div>
            <div style={S.keyStep}>4. Copy the key (starts with sk-ant-...)</div>
            <div style={S.keyStep}>5. Paste it below 👇</div>
            <input
              style={{ ...S.input, marginTop: 16 }}
              placeholder="sk-ant-..."
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              type="password"
            />
            <button style={S.btn} onClick={saveApiKey}>
              Save & Continue →
            </button>
            {apiKey && (
              <button style={S.btnOutline} onClick={() => setShowKeySetup(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerTop}>
          <div>
            <div style={S.headerTitle}>Kairos Cell B</div>
            <div style={S.headerSub}>Attendance System</div>
          </div>
          <div style={S.crossIcon}>✝</div>
        </div>
        <div style={S.tabs}>
          {[
            { key: "input", label: "📝 New" },
            { key: "result", label: "📄 Report" },
            { key: "history", label: "🗂 History" },
            { key: "register", label: "👥 Register" },
          ].map(t => (
            <button key={t.key} onClick={() => setView(t.key)}
              style={view === t.key ? S.tabActive : S.tab}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.body}>

        {/* ── INPUT ── */}
        {view === "input" && (
          <div>
            <div style={S.hint}>Paste Sunday or Cell Meeting attendance — any format works. Just first names are fine if they're in your Register.</div>
            <textarea style={S.textarea}
              placeholder={"Example with full format:\n\nCS. Godsway Asare 1️⃣\n- Deborah Senakey 2️⃣\n\nOr just first names (matched against your Register):\n\nGodsway 1️⃣\nPaul 1️⃣\nKeller 1️⃣"}
              value={input} onChange={e => setInput(e.target.value)} rows={12} />
            {error && <div style={S.error}>{error}</div>}
            <button style={loading ? S.btnDisabled : S.btn}
              onClick={processAttendance} disabled={loading}>
              {loading ? "Processing…" : "Generate Report →"}
            </button>
          </div>
        )}

        {/* ── RESULT ── */}
        {view === "result" && result && (() => {
          const reportText = result.type === "sunday" ? formatSundayReport(result.data) : formatCellReport(result.data);
          return (
            <div>
              <div style={S.resultHeader}>
                <div>
                  <div style={S.resultTitle}>{result.cellName}</div>
                  <div style={S.resultMeta}>{result.date} · {badge(result.type)}</div>
                </div>
                <div style={S.totalBadge}>{result.data.totals?.total || 0} total</div>
              </div>

              {result.ambiguous && result.ambiguous.length > 0 && (
                <div style={S.ambigBanner}>
                  ⚠️ Couldn't auto-match: {result.ambiguous.map((a, i) => (
                    <span key={i}>"{a.typed}" could be {a.matches.join(" or ")}{i < result.ambiguous.length - 1 ? "; " : ""}</span>
                  ))}
                </div>
              )}

              {/* Groups */}
              <div style={S.card}>
                <GroupsView groups={result.data.groups} type={result.type} register={register} />
              </div>

              {/* Attendance list */}
              <div style={S.card}>
                <div style={S.cardLabel}>ATTENDANCE LIST</div>
                <pre style={S.pre}>{result.data.structuredAttendance}</pre>
                <button style={S.copyBtn} onClick={() => copyText(result.data.structuredAttendance, "att")}>
                  {copied.att === true ? "✓ Copied" : copied.att === "fail" ? "✗ Try long-press select" : "Copy"}
                </button>
              </div>

              {/* Report */}
              <div style={S.card}>
                <div style={S.cardLabel}>{result.type === "sunday" ? "SERVICE BREAKDOWN" : "FULL CELL REPORT"}</div>
                <pre style={S.pre}>{reportText}</pre>
                <button style={S.copyBtn} onClick={() => copyText(reportText, "rep")}>
                  {copied.rep === true ? "✓ Copied" : copied.rep === "fail" ? "✗ Try long-press select" : "Copy"}
                </button>
              </div>

              <button style={S.btnOutline} onClick={() => { setInput(""); setView("input"); }}>
                + New Attendance
              </button>
              <button style={S.btnDanger} onClick={() => deleteFromHistory(result.id)}>
                🗑 Delete This Report
              </button>
            </div>
          );
        })()}

        {view === "result" && !result && (
          <div style={S.empty}>No report yet. Go to New to process attendance.</div>
        )}

        {/* ── HISTORY ── */}
        {view === "history" && (
          <div>
            {history.length === 0
              ? <div style={S.empty}>No reports saved yet.</div>
              : history.map(entry => (
                <div key={entry.id} style={S.historyCard}>
                  <div style={S.historyRow} onClick={() => { setResult(entry); setView("result"); }}>
                    <div>
                      <div style={S.historyName}>{entry.cellName}</div>
                      <div style={S.historyDate}>{entry.date}</div>
                    </div>
                    <div style={S.historyRight}>
                      {badge(entry.type)}
                      <div style={S.historyTotal}>{entry.data.totals?.total || 0} ppl</div>
                    </div>
                  </div>
                  <button style={S.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); deleteFromHistory(entry.id); }}>
                    🗑 Delete
                  </button>
                </div>
              ))
            }
          </div>
        )}

        {/* ── REGISTER ── */}
        {view === "register" && (
          <div>
            <div style={S.hint}>Add your full member list once. The system uses this to detect absentees automatically.</div>

            {/* Add form */}
            <div style={S.card}>
              <div style={S.cardLabel}>{regEditId ? "EDIT MEMBER" : "ADD MEMBER"}</div>
              <input style={S.input} placeholder="Full name" value={regName}
                onChange={e => setRegName(e.target.value)} />
              <select style={S.select} value={regRole} onChange={e => setRegRole(e.target.value)}>
                <option value="Pastor">Pastor</option>
                <option value="SS">Senior Shepherd (SS)</option>
                <option value="CS">Cell Shepherd (CS)</option>
                <option value="S">Shepherd (S)</option>
                <option value="Member">Member</option>
              </select>
              {(regRole === "Member") && (
                <select style={S.select} value={regShepherd} onChange={e => setRegShepherd(e.target.value)}>
                  <option value="">— Select shepherd (optional) —</option>
                  {shepherds.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                  ))}
                </select>
              )}
              <button style={S.btn} onClick={addRegisterMember}>
                {regEditId ? "Save Changes" : "+ Add to Register"}
              </button>
              {regEditId && (
                <button style={{ ...S.btnOutline, marginTop: 8 }}
                  onClick={() => { setRegEditId(null); setRegName(""); setRegRole("Member"); setRegShepherd(""); }}>
                  Cancel
                </button>
              )}
            </div>

            {/* Member list grouped by shepherd */}
            {register.length === 0
              ? <div style={S.empty}>Register is empty. Add your cell members above.</div>
              : (() => {
                  const shepherdMembers = shepherds.map(sh => ({
                    shepherd: sh,
                    members: register.filter(r => r.role === "Member" && r.shepherd === sh.name)
                  }));
                  const unassigned = register.filter(r => r.role === "Member" && !r.shepherd);
                  const leaders = register.filter(r => r.role !== "Member");

                  return (
                    <div>
                      {/* Leaders */}
                      {leaders.length > 0 && (
                        <div style={S.card}>
                          <div style={S.cardLabel}>LEADERSHIP ({leaders.length})</div>
                          {leaders.map(m => (
                            <div key={m.id} style={S.regRow}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {roleBadge(m.role)}
                                <span style={S.regName}>{m.name}</span>
                              </div>
                              <div style={S.regActions}>
                                <button style={S.iconBtn} onClick={() => editRegisterMember(m)}>✏️</button>
                                <button style={S.iconBtn} onClick={() => deleteRegisterMember(m.id)}>🗑</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Groups */}
                      {shepherdMembers.map(({ shepherd, members }) => (
                        members.length > 0 && (
                          <div key={shepherd.id} style={S.card}>
                            <div style={S.cardLabel}>
                              {shepherd.role === "CS" ? "CS. " : "S. "}{shepherd.name.toUpperCase()} — {members.length} MEMBER{members.length !== 1 ? "S" : ""}
                            </div>
                            {members.map(m => (
                              <div key={m.id} style={S.regRow}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={S.memberDot}>›</span>
                                  <span style={S.regName}>{m.name}</span>
                                </div>
                                <div style={S.regActions}>
                                  <button style={S.iconBtn} onClick={() => editRegisterMember(m)}>✏️</button>
                                  <button style={S.iconBtn} onClick={() => deleteRegisterMember(m.id)}>🗑</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ))}

                      {/* Unassigned */}
                      {unassigned.length > 0 && (
                        <div style={S.card}>
                          <div style={S.cardLabel}>UNASSIGNED MEMBERS ({unassigned.length})</div>
                          {unassigned.map(m => (
                            <div key={m.id} style={S.regRow}>
                              <span style={S.regName}>{m.name}</span>
                              <div style={S.regActions}>
                                <button style={S.iconBtn} onClick={() => editRegisterMember(m)}>✏️</button>
                                <button style={S.iconBtn} onClick={() => deleteRegisterMember(m.id)}>🗑</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={S.regTotal}>
                        {register.length} total in register
                      </div>
                    </div>
                  );
                })()
            }
            <button style={{ ...S.btnOutline, marginTop: 20, fontSize: 12, opacity: 0.6 }}
              onClick={() => setShowKeySetup(true)}>
              🔑 Change API Key
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  app: { fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#0f1117", minHeight: "100vh", color: "#e8e8e8" },
  header: { background: "linear-gradient(135deg, #1a1f2e 0%, #0f1117 100%)", borderBottom: "1px solid #2a2f3e" },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 16px 12px" },
  headerTitle: { fontSize: 20, fontWeight: 700, color: "#ffffff", letterSpacing: 0.5 },
  headerSub: { fontSize: 12, color: "#7c84a0", marginTop: 2 },
  crossIcon: { fontSize: 28, color: "#c9a84c", opacity: 0.9 },
  tabs: { display: "flex" },
  tab: { flex: 1, padding: "10px 2px", background: "none", border: "none", color: "#7c84a0", fontSize: 11, cursor: "pointer", borderBottom: "2px solid transparent" },
  tabActive: { flex: 1, padding: "10px 2px", background: "none", border: "none", color: "#c9a84c", fontSize: 11, cursor: "pointer", borderBottom: "2px solid #c9a84c", fontWeight: 700 },
  body: { padding: 16, maxWidth: 480, margin: "0 auto" },
  hint: { color: "#7c84a0", fontSize: 13, marginBottom: 12, lineHeight: 1.5 },
  textarea: { width: "100%", background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 10, color: "#e8e8e8", fontSize: 13, padding: 14, resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box", fontFamily: "monospace" },
  input: { width: "100%", background: "#0f1117", border: "1px solid #2a2f3e", borderRadius: 8, color: "#e8e8e8", fontSize: 14, padding: "10px 12px", outline: "none", boxSizing: "border-box", marginBottom: 8 },
  select: { width: "100%", background: "#0f1117", border: "1px solid #2a2f3e", borderRadius: 8, color: "#e8e8e8", fontSize: 14, padding: "10px 12px", outline: "none", boxSizing: "border-box", marginBottom: 8 },
  btn: { width: "100%", marginTop: 4, padding: "13px", background: "linear-gradient(135deg, #c9a84c, #e0c068)", color: "#0f1117", fontWeight: 700, fontSize: 15, border: "none", borderRadius: 10, cursor: "pointer" },
  btnDisabled: { width: "100%", marginTop: 4, padding: "13px", background: "#2a2f3e", color: "#7c84a0", fontWeight: 700, fontSize: 15, border: "none", borderRadius: 10, cursor: "not-allowed" },
  btnOutline: { width: "100%", marginTop: 8, padding: "11px", background: "none", color: "#c9a84c", fontWeight: 600, fontSize: 14, border: "1px solid #c9a84c", borderRadius: 10, cursor: "pointer" },
  btnDanger: { width: "100%", marginTop: 8, padding: "11px", background: "none", color: "#f87171", fontWeight: 600, fontSize: 14, border: "1px solid #5a2424", borderRadius: 10, cursor: "pointer" },
  deleteBtn: { width: "100%", marginTop: 8, padding: "7px", background: "none", color: "#f87171", fontWeight: 600, fontSize: 12, border: "1px solid #3a1a1a", borderRadius: 8, cursor: "pointer" },
  error: { color: "#e05c5c", fontSize: 13, marginTop: 8, padding: 10, background: "#2a1a1a", borderRadius: 8 },
  card: { background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 10, padding: 14, marginBottom: 12 },
  cardLabel: { fontSize: 10, fontWeight: 700, color: "#c9a84c", letterSpacing: 1.5, marginBottom: 10 },
  pre: { fontFamily: "monospace", fontSize: 13, color: "#d0d4e0", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.7 },
  copyBtn: { marginTop: 12, padding: "7px 16px", background: "#2a2f3e", color: "#c9a84c", border: "1px solid #c9a84c", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 600 },
  resultHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  resultTitle: { fontSize: 18, fontWeight: 700, color: "#fff" },
  resultMeta: { fontSize: 12, color: "#7c84a0", marginTop: 4, display: "flex", alignItems: "center", gap: 6 },
  totalBadge: { background: "#c9a84c", color: "#0f1117", fontWeight: 700, fontSize: 13, padding: "6px 12px", borderRadius: 20 },
  badgeSunday: { background: "#2a3a1a", color: "#7ecb5f", fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600 },
  badgeCell: { background: "#1a2a3a", color: "#5fb4cb", fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600 },
  roleBadge: { fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 700 },
  groupCard: { background: "#0f1117", border: "1px solid #2a2f3e", borderRadius: 8, marginBottom: 10, overflow: "hidden" },
  groupLeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 12px", background: "#1a1f2e" },
  groupLeaderLeft: { flex: 1 },
  groupLeaderName: { fontSize: 14, fontWeight: 700, color: "#fff" },
  absentInline: { fontSize: 12, fontWeight: 600, color: "#f87171" },
  memberCount: { fontSize: 11, color: "#7c84a0", marginLeft: 8, whiteSpace: "nowrap" },
  membersList: { padding: "8px 12px" },
  memberRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" },
  memberDot: { color: "#c9a84c", fontWeight: 700, fontSize: 14 },
  memberName: { fontSize: 13, color: "#d0d4e0" },
  noMembers: { padding: "8px 12px", fontSize: 12, color: "#4a5070", fontStyle: "italic" },
  serviceTag: { fontSize: 10, color: "#7c84a0", background: "#2a2f3e", padding: "2px 6px", borderRadius: 10 },
  serviceTagSm: { fontSize: 11, marginLeft: "auto" },
  absentCard: { background: "#1a1010", border: "1px solid #3a1a1a", borderRadius: 8, padding: 12 },
  absentRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #2a1a1a" },
  absentName: { fontSize: 13, color: "#f87171" },
  absentShepherd: { fontSize: 11, color: "#7c84a0" },
  registerHint: { fontSize: 12, color: "#7c84a0", textAlign: "center", padding: "10px", background: "#1a1f2e", borderRadius: 8, marginTop: 8 },
  ambigBanner: { fontSize: 12, color: "#fbbf24", background: "#2a2410", border: "1px solid #4a3a10", borderRadius: 8, padding: 10, marginBottom: 12, lineHeight: 1.5 },
  historyCard: { background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer" },
  historyRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  historyName: { fontSize: 15, fontWeight: 600, color: "#fff" },
  historyDate: { fontSize: 12, color: "#7c84a0", marginTop: 2 },
  historyRight: { textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 },
  historyTotal: { fontSize: 13, color: "#c9a84c", fontWeight: 600 },
  regRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #2a2f3e" },
  regName: { fontSize: 14, color: "#d0d4e0" },
  regActions: { display: "flex", gap: 8 },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 2 },
  regTotal: { textAlign: "center", color: "#7c84a0", fontSize: 12, marginTop: 8 },
  empty: { textAlign: "center", color: "#7c84a0", padding: "40px 20px", fontSize: 14 },
  keySetupWrap: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 },
  crossIcon2: { fontSize: 48, color: "#c9a84c", marginBottom: 12 },
  keySetupTitle: { fontSize: 26, fontWeight: 700, color: "#fff", marginBottom: 4 },
  keySetupSub: { fontSize: 14, color: "#7c84a0", marginBottom: 28 },
  keySetupCard: { background: "#1a1f2e", border: "1px solid #2a2f3e", borderRadius: 14, padding: 20, width: "100%", maxWidth: 400 },
  keySetupText: { color: "#94a3b8", fontSize: 13, lineHeight: 1.6, marginBottom: 16 },
  keyStep: { color: "#d0d4e0", fontSize: 13, padding: "4px 0", lineHeight: 1.5 },
  keyLink: { color: "#c9a84c", fontWeight: 600 },
};
