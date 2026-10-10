// 우리 하루 — 알림 계획 (순수 함수: 데이터와 현재 시각을 받아 보낼 알림과 저장할 상태를 돌려줌)
const pad = n => String(n).padStart(2, "0");
const KST = 9 * 3600e3;
export function kstNow(ms) {
  const d = new Date(ms + KST);
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: d.getUTCDay() };
}
const toMin = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
const wdOf = s => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const other = s => (s === "a" ? "b" : "a");
const ent = o => Object.entries(o || {});

function occursOn(e, d) {
  if (!e.date || d < e.date || (e.repeat?.until && d > e.repeat.until) || e.skip?.[d]) return false;
  const f = e.repeat?.freq || "none", wd = wdOf(d);
  if (f === "daily") return true;
  if (f === "weekdays") return wd >= 1 && wd <= 5;
  if (f === "weekly") return (e.repeat.days?.length ? e.repeat.days : [wdOf(e.date)]).includes(wd);
  return d === e.date;
}
const isDone = (e, d) => (e.repeat && e.repeat.freq && e.repeat.freq !== "none" ? !!e.doneDates?.[d] : !!e.done);

export const DEFAULT_NOTIFY = { partner: true, before: true, check: true };
export const REMIND_WINDOW = 25;   // 시작 25분 전부터 (GitHub 실행이 늦어질 수 있어 여유를 둠)
export const CHECK_AT = 21 * 60;   // 저녁 9시

/**
 * @returns {{ sends: {slot, title, body, tag}[], state: object }}
 */
export function planCouple(c, nowMs) {
  const { date: today, min: nowMin } = kstNow(nowMs);
  const st = structuredClone(c.pushState || {});
  st.sent ||= {}; st.checkDay ||= {};
  const sends = [];
  const name = s => c.slots?.[s]?.name || "상대";
  const pref = s => ({ ...DEFAULT_NOTIFY, ...(c.slots?.[s]?.notify || {}) });
  const hasSlot = s => !!c.slots?.[s];

  // 1) 상대 소식: 지난번 실행 뒤 새로 생긴 기록 (기록 id로 비교해 휴대폰 시계 차이에 영향받지 않음)
  const first = !c.pushState?.actSeen;
  const seen = st.actSeen || {};
  const acts = ent(c.activity).filter(([k]) => !seen[k]).map(([, a]) => a).sort((x, y) => x.at - y.at);
  if (!first) for (const s of ["a", "b"]) {
    if (!hasSlot(s) || !pref(s).partner) continue;
    const mine = acts.filter(a => a.by === other(s));
    if (!mine.length) continue;
    const who = name(other(s));
    if (mine.length <= 2) mine.forEach(a => sends.push({ slot: s, title: `${who}님의 소식`, body: `${who}님이 ${a.text}`, tag: "partner-" + a.at }));
    else sends.push({ slot: s, title: `${who}님의 새 소식 ${mine.length}개`, body: mine.slice(-3).map(a => a.text).join(" · "), tag: "partner" });
  }
  st.actSeen = Object.fromEntries(Object.keys(c.activity || {}).map(k => [k, 1]));
  delete st.lastAct;

  // 2) 일정 시작 전 알림
  const items = [];
  for (const [id, e] of ent(c.events)) items.push({ key: `e_${id}`, e, to: e.type === "together" ? ["a", "b"] : [e.owner] });
  for (const s of ["a", "b"]) for (const [id, e] of ent(c.private?.[s]?.events)) items.push({ key: `p${s}_${id}`, e, to: [s] });
  for (const [id, p] of ent(c.plans)) if (p.status === "confirmed") items.push({ key: `pl_${id}`, e: { ...p, endTime: "" }, to: ["a", "b"], plan: true });
  for (const it of items) {
    const e = it.e;
    if (!e.time || !occursOn(e, today) || isDone(e, today)) continue;
    const left = toMin(e.time) - nowMin;
    if (left <= 0 || left > REMIND_WINDOW) continue;
    const k = `${today}_${it.key}`;
    if (st.sent[k]) continue;
    st.sent[k] = nowMs;
    for (const s of it.to) {
      if (!hasSlot(s) || !pref(s).before) continue;
      const together = it.to.length === 2;
      sends.push({ slot: s, title: `${together ? "💞 함께 · " : ""}${left}분 뒤 시작해요`, body: `${e.time} ${e.title}${e.place ? " · " + e.place : ""}`, tag: k });
    }
  }
  for (const k of Object.keys(st.sent)) if (k.slice(0, 10) < today) delete st.sent[k];

  // 3) 저녁 체크 알림
  if (nowMin >= CHECK_AT) {
    for (const s of ["a", "b"]) {
      if (!hasSlot(s) || st.checkDay[s] === today) continue;
      st.checkDay[s] = today;
      if (!pref(s).check) continue;
      const goals = [
        ...ent(c.private?.[s]?.goals).map(([id, g]) => ({ g, logs: c.private?.[s]?.logs?.[id] })),
        ...ent(c.goals).filter(([, g]) => g.owner === s || g.owner === "both").map(([id, g]) => ({ g, logs: c.logs?.[id] }))
      ].filter(({ g }) => g.kind === "check" && !g.archived && (g.days?.length ? g.days : [0, 1, 2, 3, 4, 5, 6]).includes(wdOf(today)));
      const left = goals.filter(({ logs }) => !logs?.[`${today}_${s}`]);
      if (left.length) sends.push({ slot: s, title: `오늘 체크 안 한 목표 ${left.length}개`, body: left.map(x => "✅ " + x.g.title).join(", "), tag: "check-" + today });
    }
  }
  return { sends, state: st };
}
