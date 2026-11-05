// End-to-end API test for W1 (checkout + concurrency), W3 (integrity) and seller/review flows.
// Usage: start the API, load schema.sql + dev_seed.sql, then `npm test`.
// Env: API=http://localhost:4000/api  PRODUCT_ID=1  [ADMIN_EMAIL, ADMIN_PASSWORD] (admin must be set via SQL, see README)
const API = process.env.API || 'http://localhost:4000/api';
const PID = Number(process.env.PRODUCT_ID || 1);
const sfx = Date.now();
let failed = 0;

async function call(method, path, token, body) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failed++;
}
const reg = async (tag, extra = {}) => {
  const r = await call('POST', '/auth/register', null, { full_name: tag, email: `${tag}${sfx}@t.dev`, password: 'secret1', ...extra });
  return r.body.token;
};
const stock = async tok => (await call('GET', '/seller/listings', tok)).body.find(l => l.product_id === PID).stock_qty;

const s1 = await reg('seller1', { store_name: `Store1-${sfx}`, gst_no: ('29' + sfx).slice(0, 15).padEnd(15, '0') });
const s2 = await reg('seller2', { store_name: `Store2-${sfx}`, gst_no: ('30' + sfx).slice(0, 15).padEnd(15, '0') });
const c1 = await reg('cust1'), c2 = await reg('cust2');

// --- seller + authorization
const lst = await call('POST', '/seller/listings', s1, { product_id: PID, price: 1000, stock_qty: 1 });
check('seller creates listing', lst.status === 201, JSON.stringify(lst.body));
check('customer blocked from seller API (403)', (await call('GET', '/seller/listings', c1)).status === 403);
check('no token -> 401', (await call('GET', '/cart')).status === 401);
const L = lst.body.listing_id;

// --- W1: two customers race for the last unit
const addr = async t => (await call('POST', '/addresses', t, { line1: '1 Main St', city: 'Hyderabad', state: 'TS', pincode: '500078' })).body.address_id;
const a1 = await addr(c1), a2 = await addr(c2);
await call('PUT', '/cart', c1, { listing_id: L, quantity: 1 });
await call('PUT', '/cart', c2, { listing_id: L, quantity: 1 });
const race = await Promise.all([call('POST', '/orders/checkout', c1, { address_id: a1, payment_method: 'UPI' }),
                                call('POST', '/orders/checkout', c2, { address_id: a2, payment_method: 'UPI' })]);
const codes = race.map(r => r.status).sort();
check('last unit: exactly one 201 and one 409', codes[0] === 201 && codes[1] === 409, codes.join(','));
check('stock is 0, never negative', (await stock(s1)) === 0);
const win = race.findIndex(r => r.status === 201), W = win === 0 ? c1 : c2, WA = win === 0 ? a1 : a2;
const o1 = race[win].body.order_id;

// --- W3: cancellation restores stock exactly once
check('cancel item', (await call('POST', `/orders/${o1}/items/1/cancel`, W)).status === 200);
check('stock restored to 1', (await stock(s1)) === 1);
check('second cancel rejected (409)', (await call('POST', `/orders/${o1}/items/1/cancel`, W)).status === 409);
check('stock still 1 (not restored twice)', (await stock(s1)) === 1);
const other = win === 0 ? c2 : c1;
check("cannot cancel someone else's order (404)", (await call('POST', `/orders/${o1}/items/1/cancel`, other)).status === 404);

// --- W3: coupon + review integrity
await call('PUT', '/cart', W, { listing_id: L, quantity: 1 });
check('unknown coupon rejected (400)', (await call('POST', '/orders/checkout', W, { address_id: WA, payment_method: 'COD', coupon_code: 'NOPE' })).status === 400);
const ck = await call('POST', '/orders/checkout', W, { address_id: WA, payment_method: 'COD' });
check('COD checkout works', ck.status === 201 && ck.body.payment_status === 'PENDING', JSON.stringify(ck.body));
const o2 = ck.body.order_id;
const rv = b => call('POST', '/reviews', W, { order_id: o2, item_no: 1, rating: 5, ...b });
check('review before delivery rejected by trigger (422)', (await rv()).status === 422);
check('other seller cannot ship my item (404)', (await call('PUT', `/seller/order-items/${o2}/1`, s2, { status: 'SHIPPED' })).status === 404);
check('cannot skip to DELIVERED (409)', (await call('PUT', `/seller/order-items/${o2}/1`, s1, { status: 'DELIVERED' })).status === 409);
check('seller ships', (await call('PUT', `/seller/order-items/${o2}/1`, s1, { status: 'SHIPPED' })).status === 200);
check('seller delivers', (await call('PUT', `/seller/order-items/${o2}/1`, s1, { status: 'DELIVERED' })).status === 200);
const od = (await call('GET', `/orders/${o2}`, W)).body;
check('order rolled up to DELIVERED, COD payment SUCCESS', od.status === 'DELIVERED' && od.payment_status === 'SUCCESS', JSON.stringify(od));
check('review after delivery (201)', (await rv()).status === 201);
check('duplicate review rejected (409)', (await rv()).status === 409);
check("other customer cannot review it (404)", (await call('POST', '/reviews', other, { order_id: o2, item_no: 1, rating: 4 })).status === 404);

// --- analytics
const d = await call('GET', '/seller/dashboard', s1);
check('dashboard returns data', d.status === 200 && d.body.monthly_revenue.length > 0, JSON.stringify(d.body));

// --- admin (optional)
if (process.env.ADMIN_EMAIL) {
  const ad = (await call('POST', '/auth/login', null, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).body.token;
  check('customer blocked from admin API', (await call('GET', '/admin/sellers', c1)).status === 403);
  const sid = (await call('GET', '/admin/sellers?verified=false', ad)).body.find(s => s.store_name === `Store1-${sfx}`)?.seller_id;
  check('admin verifies seller', (await call('PUT', `/admin/sellers/${sid}/verify`, ad, {})).body?.is_verified === true);
  const cp = await call('POST', '/admin/coupons', ad, { code: `T${sfx}`.slice(0, 20), discount_pct: 10, valid_from: '2020-01-01', valid_to: '2099-01-01', max_uses: 1 });
  check('admin creates coupon', cp.status === 201, JSON.stringify(cp.body));
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
