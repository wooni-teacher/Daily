// 우리 하루 — 알림 보내기 (GitHub Actions에서 5분마다 실행)
import admin from "firebase-admin";
import { planCouple } from "./plan.mjs";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.client_email) { console.error("FIREBASE_SERVICE_ACCOUNT 비밀값이 비어 있어요. README의 알림 설정을 확인해 주세요."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: process.env.FIREBASE_DB_URL });
const db = admin.database();
const ROOT = "couplePlanner/couples";
const BAD = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"];

const couples = (await db.ref(ROOT).once("value")).val() || {};
const now = Date.now();
let total = 0;
for (const [code, c] of Object.entries(couples)) {
  if (!c || !c.slots) continue;
  const { sends, state } = planCouple(c, now);
  for (const m of sends) {
    const toks = Object.entries(c.push?.[m.slot] || {}).map(([tid, t]) => ({ tid, token: t.token })).filter(t => t.token);
    if (!toks.length) continue;
    const res = await admin.messaging().sendEachForMulticast({
      tokens: toks.map(t => t.token),
      data: { title: m.title, body: m.body, tag: m.tag || "", url: "./" },
      webpush: { headers: { Urgency: "high", TTL: "3600" } }
    });
    total += res.successCount;
    const cleanup = {};
    res.responses.forEach((r, i) => { if (!r.success && BAD.includes(r.error?.code)) cleanup[`push/${m.slot}/${toks[i].tid}`] = null; });
    if (Object.keys(cleanup).length) await db.ref(`${ROOT}/${code}`).update(cleanup);
  }
  await db.ref(`${ROOT}/${code}/pushState`).set(state);
}
console.log(`알림 ${total}건 보냄 (${new Date(now).toISOString()})`);
process.exit(0);
