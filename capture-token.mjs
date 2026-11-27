// Client ilovadagi Alice inspektoridan ENG YANGI so'rovning sarlavhalarini (yangi Authorization tokeni bilan) o'qiydi
// va reports/api-token.json ga yozadi (load-api.mjs uchun). Buyurtma tanasi bu yerda tuziladi — ilova yuboradigan
// POST /api/v1/orders tanasi bilan bir xil tuzilish (Alice'da tananing matni accessibility daraxtida ko'rinmaydi).
// Faqat o'qiydi, hech narsa yaratmaydi. Talab: client ilova ochiq va tizimga kirilgan.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unesc = s => s.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function nodes() {
  const xml = adb('exec-out', 'uiautomator', 'dump', '/dev/tty');
  const out = [];
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const t = unesc((m[0].match(/ text="([^"]*)"/) || [])[1] || '');
    const d = unesc((m[0].match(/content-desc="([^"]*)"/) || [])[1] || '');
    const b = (m[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) || []).slice(1).map(Number);
    for (const v of [d, t]) if (v && v !== 'null') out.push({ v, b });
  }
  return out;
}
const tap = b => adb('shell', 'input', 'tap', String(Math.round((b[0] + b[2]) / 2)), String(Math.round((b[1] + b[3]) / 2)));
const find = re => nodes().find(n => re.test(n.v));
const [W, H] = (adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/) || [, 1440, 3120]).slice(1).map(Number);
const back = async n => { for (let i = 0; i < n; i++) { adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await sleep(700); } };

adb('shell', 'am', 'force-stop', 'com.delivery.noor');
adb('shell', 'am', 'start', '-n', 'app.buchet.go/.MainActivity'); // running app to the front, no restart
await sleep(4000);
// Alice bubble: its accessibility node spans the whole screen — tap the bubble itself (left, ~53% height)
if (!find(/Alice - Inspector/)) { adb('shell', 'input', 'tap', String(Math.round(W * 0.106)), String(Math.round(H * 0.53))); await sleep(2500); }
if (!find(/Alice - Inspector/)) throw new Error('Alice oynasi ochilmadi');
// Newest request whose host is tback.noor.uz (it carries the current token)
const item = nodes().find(n => /^(GET|POST|PUT|PATCH)\n\/api\/v1\/[^\n]*\ntback\.noor\.uz\n/.test(n.v));
if (!item) throw new Error('Alice ro\'yxatida tback.noor.uz so\'rovi yo\'q');
tap(item.b); await sleep(2000);
const req = find(/^Request(\n|$)/); if (req) { tap(req.b); await sleep(1500); }
const texts = [];
for (let s = 0; s < 6; s++) {
  for (const n of nodes()) texts.push(n.v);
  adb('shell', 'input', 'swipe', String(Math.round(W / 2)), String(Math.round(H * 0.8)), String(Math.round(W / 2)), String(Math.round(H * 0.25)), '300');
  await sleep(700);
}
const headers = {};
for (let i = 0; i < texts.length - 1; i++) {
  const m = texts[i].match(/^\s*•\s*([\w-]+):\s*$/);
  if (m && !['content-length', 'X-User-Time'].includes(m[1]) && !headers[m[1]]) headers[m[1]] = texts[i + 1].trim();
}
if (!/^Bearer \S+\.\S+\.\S+$/.test(headers.Authorization || '')) throw new Error('Authorization o\'qilmadi');
await back(3);

const me = { phone: '+998997274471', name: 'Jo`natuvchi' };
const body = {
  vendor_order_id: 'abc',
  origin: [{ id: null, location: { lat: 41.282014399248865, long: 69.25245550000001 }, order: 1, address: 'Мукимий улица, 2/1', client: me, products: { type_id: 1, description: 'Документы', items: [] } }],
  destination: [{ id: null, location: { lat: 41.30949401855469, long: 69.27958679199219 }, order: 2, address: 'Amir Temur xiyoboni', client: { phone: me.phone, name: 'Qabul qiluvchi' }, products: { type_id: 1, description: 'Документы', items: [] } }],
  is_business: true,
  payment_type: 'CASH',
  delivery: { time: new Date().toISOString(), door_to_door: false, product_paid: true, type: 'EXPRESS' },
};
const url = 'https://tback.noor.uz/api/v1/orders';
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/api-token.json', JSON.stringify({ url, headers, body, capturedAt: new Date().toISOString() }, null, 2));
const exp = JSON.parse(Buffer.from(headers.Authorization.split('.')[2 - 1], 'base64url').toString()).exp;
console.log(`OK: ${url}; token ${Math.round(exp - Date.now() / 1000)} s amal qiladi; ${body.origin[0].address} → ${body.destination[0].address}; to'lov ${body.payment_type}`);
