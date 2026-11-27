// API yuklama testi — Noor client: POST /api/v1/orders (Yetkazish, NAQD) ko'p marta, ketma-ket va bir vaqtda.
// Token ilovaning Alice inspektoridan olinadi (capture-token.mjs) → reports/api-token.json. Token ~10 daqiqa amal qiladi.
// Ishga tushirish:  node load-api.mjs 40            (40 ta ketma-ket + 40 ta bir vaqtda)
//                   node load-api.mjs 100 --parallel-only --concurrency 20
// Foydalanuvchi qarori: buyurtmalar bekor qilinmaydi va yopilmaydi; to'lov faqat CASH.
import fs from 'node:fs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a)) || 20);
const onlyParallel = args.includes('--parallel-only');
const onlySeq = args.includes('--sequential-only');
const concurrency = Number((args[args.indexOf('--concurrency') + 1] || '').match(/^\d+$/) ? args[args.indexOf('--concurrency') + 1] : N);

const cap = JSON.parse(fs.readFileSync('reports/api-token.json', 'utf8'));
const url = cap.url; // masalan https://tback.noor.uz/api/v1/orders
const headers = { ...cap.headers, 'Content-Type': 'application/json' };
delete headers['content-length'];

// JWT muddati
const payload = JSON.parse(Buffer.from(cap.headers.Authorization.split('.')[1], 'base64url').toString());
const left = payload.exp - Math.floor(Date.now() / 1000);
if (left < 60) { console.error(`Token muddati tugagan yoki 1 daqiqadan kam qoldi (${left} s). Avval: node capture-token.mjs`); process.exit(1); }
console.log(`Token yana ${Math.floor(left / 60)} daq ${left % 60} s amal qiladi. URL: ${url}`);

const body = () => {
  const b = JSON.parse(JSON.stringify(cap.body));
  b.payment_type = 'CASH'; // faqat naqd — kartaga hech qachon
  if (b.delivery) b.delivery.time = new Date().toISOString();
  b.vendor_order_id = `load-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return JSON.stringify(b);
};
if (JSON.parse(body()).payment_type !== 'CASH') throw new Error('to\'lov CASH emas');

async function one(i) {
  const t = performance.now();
  try {
    const r = await fetch(url, { method: 'POST', headers, body: body() });
    const text = await r.text();
    const ms = Math.round(performance.now() - t);
    let id = '';
    try { const j = JSON.parse(text); id = j?.data?.id || j?.data?.order?.id || j?.id || j?.data?.order_number || ''; } catch {}
    return { i, status: r.status, ms, id: String(id), err: r.ok ? '' : text.slice(0, 200) };
  } catch (e) {
    return { i, status: 0, ms: Math.round(performance.now() - t), id: '', err: String(e.message || e).slice(0, 200) };
  }
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))] : 0; };
function report(name, res, wallMs) {
  const ok = res.filter(r => r.status >= 200 && r.status < 300);
  const ms = ok.map(r => r.ms);
  const codes = {};
  for (const r of res) codes[r.status] = (codes[r.status] || 0) + 1;
  console.log(`\n── ${name}: ${ok.length}/${res.length} muvaffaqiyatli, jami ${(wallMs / 1000).toFixed(1)} s, ${(res.length / (wallMs / 1000)).toFixed(1)} so'rov/s`);
  console.log(`   Javob vaqti (ms): o'rtacha ${ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : '-'}, p50 ${pct(ms, 50)}, p95 ${pct(ms, 95)}, eng sekin ${ms.length ? Math.max(...ms) : '-'}`);
  console.log(`   Status kodlari: ${Object.entries(codes).map(([k, v]) => `${k} — ${v}`).join(', ')}`);
  const errs = [...new Set(res.filter(r => r.err).map(r => `${r.status}: ${r.err}`))];
  errs.slice(0, 5).forEach(e => console.log(`   ✘ ${e}`));
  return { name, total: res.length, ok: ok.length, wallMs, codes, p50: pct(ms, 50), p95: pct(ms, 95), max: ms.length ? Math.max(...ms) : 0, errors: errs, results: res };
}

const out = { url, requested: N, concurrency, at: new Date().toISOString(), runs: [] };
if (!onlyParallel) {
  const res = []; const t = performance.now();
  for (let i = 1; i <= N; i++) {
    const r = await one(i); res.push(r);
    process.stdout.write(`\r   ketma-ket: ${i}/${N} (${r.status}, ${r.ms} ms)   `);
    if (r.status === 401) { console.log('\n   Token muddati tugadi — to\'xtatildi'); break; }
  }
  out.runs.push(report(`Ketma-ket ${N} ta`, res, performance.now() - t));
}
if (!onlySeq) {
  const res = []; const t = performance.now(); let next = 1;
  await Promise.all(Array.from({ length: Math.min(concurrency, N) }, async () => {
    while (next <= N) { const i = next++; res.push(await one(i)); }
  }));
  out.runs.push(report(`Bir vaqtda ${N} ta (parallel ${Math.min(concurrency, N)})`, res, performance.now() - t));
}
fs.mkdirSync('reports', { recursive: true });
const file = `reports/load-api-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${N}.json`;
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nHisobot: ${file}`);
