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

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
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
    setRegEditId(member.id)
