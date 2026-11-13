// End-to-end API test for W1 (checkout + concurrency), W3 (integrity), seller, admin, and catalogue flows.
// Usage: start the API, load schema.sql + setup.sql, then `npm test`.
// Env: API=http://localhost:4000/api  PRODUCT_ID=1  [ADMIN_EMAIL, ADMIN_PASSWORD]
const API = process.env.API || 'http://localhost:4000/api';
const PID = Number(process.env.PRODUCT_ID || 1);
const sfx = Date.now();
let failed = 0;

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failed++;
}

const reg = async (tag, extra = {}) => {
  const r = await call('POST', '/auth/register', null, {
    full_name: tag,
    email: `${tag}${sfx}@t.dev`,
    password: 'secret1',
    ...extra
  });
  return r.body.token;
};

const stock = async tok => (await call('GET', '/seller/listings', tok)).body.find(l => l.product_id === PID).stock_qty;

// --- 1. Registration & Auth validations
const badPhone = await call('POST', '/auth/register', null, {
  full_name: 'Bad Phone User',
  email: `bad_phone_${sfx}@t.dev`,
  phone: '123', // invalid phone format
  password: 'secret1'
});
check('invalid phone format rejected (400)', badPhone.status === 400);

const badPwd = await call('POST', '/auth/register', null, {
  full_name: 'Short Pwd User',
  email: `bad_pwd_${sfx}@t.dev`,
  password: '123' // < 6 chars
});
check('short password rejected (400)', badPwd.status === 400);

const badSeller = await call('POST', '/auth/register', null, {
  full_name: 'Incomplete Seller',
  email: `bad_seller_${sfx}@t.dev`,
  password: 'secret1',
  store_name: `StoreBad-${sfx}` // missing gst_no
});
check('incomplete seller registration rejected (400)', badSeller.status === 400);

const s1 = await reg('seller1', { store_name: `Store1-${sfx}`, gst_no: ('29' + sfx).slice(0, 15).padEnd(15, '0') });
const s2 = await reg('seller2', { store_name: `Store2-${sfx}`, gst_no: ('30' + sfx).slice(0, 15).padEnd(15, '0') });
const c1 = await reg('cust1');
const c2 = await reg('cust2');

const dupEmail = await call('POST', '/auth/register', null, {
  full_name: 'Duplicate Email User',
  email: `cust1${sfx}@t.dev`, // already registered
  password: 'secret1'
});
check('duplicate email rejected (409)', dupEmail.status === 409);

const badLogin = await call('POST', '/auth/login', null, {
  email: `cust1${sfx}@t.dev`,
  password: 'wrongpassword'
});
check('wrong password rejected (401)', badLogin.status === 401);

// --- 2. Seller + authorization
const badPriceListing = await call('POST', '/seller/listings', s1, { product_id: PID, price: -50, stock_qty: 10 });
check('negative price listing rejected (400)', badPriceListing.status === 400);

const badStockListing = await call('POST', '/seller/listings', s1, { product_id: PID, price: 100, stock_qty: -5 });
check('negative stock listing rejected (400)', badStockListing.status === 400);

const lst = await call('POST', '/seller/listings', s1, { product_id: PID, price: 1000, stock_qty: 1 });
check('seller creates listing', lst.status === 201, JSON.stringify(lst.body));
check('customer blocked from seller API (403)', (await call('GET', '/seller/listings', c1)).status === 403);
check('no token -> 401', (await call('GET', '/cart')).status === 401);
const L = lst.body.listing_id;

// --- 3. Cart validations
const badCart = await call('PUT', '/cart', c1, { listing_id: L, quantity: 0 });
check('cart quantity <= 0 rejected (400)', badCart.status === 400);

await call('PUT', '/cart', c1, { listing_id: L, quantity: 2 });
const delCart = await call('DELETE', `/cart/${L}`, c1);
check('delete item from cart (204)', delCart.status === 204);

// --- 4. Address management
const badPinAddr = await call('POST', '/addresses', c1, {
  line1: '1 Main St', city: 'Hyderabad', state: 'TS', pincode: '500'
});
check('invalid pincode rejected (400)', badPinAddr.status === 400);

const addr = async (t, extra = {}) => (await call('POST', '/addresses', t, {
  line1: '1 Main St', city: 'Hyderabad', state: 'TS', pincode: '500078', ...extra
})).body.address_id;
const a1 = await addr(c1);
const a2 = await addr(c2);
const a1_edit = await call('PUT', `/addresses/${a1}`, c1, { city: 'Secunderabad' });
check('update address', a1_edit.status === 200 && a1_edit.body.city === 'Secunderabad');

// --- 5. W1: two customers race for the last unit (sp_place_order)
await call('PUT', '/cart', c1, { listing_id: L, quantity: 1 });
await call('PUT', '/cart', c2, { listing_id: L, quantity: 1 });

const race = await Promise.all([
  call('POST', '/orders/checkout', c1, { address_id: a1, payment_method: 'UPI' }),
  call('POST', '/orders/checkout', c2, { address_id: a2, payment_method: 'UPI' })
]);
const codes = race.map(r => r.status).sort();
check('last unit: exactly one 201 and one 409', codes[0] === 201 && codes[1] === 409, codes.join(','));
check('stock is 0, never negative', (await stock(s1)) === 0);

const win = race.findIndex(r => r.status === 201);
const W = win === 0 ? c1 : c2;
const WA = win === 0 ? a1 : a2;
const o1 = race[win].body.order_id;

// --- 6. W3: cancellation restores stock exactly once (sp_cancel_item)
check('cancel item', (await call('POST', `/orders/${o1}/items/1/cancel`, W)).status === 200);
check('stock restored to 1', (await stock(s1)) === 1);
check('second cancel rejected (409)', (await call('POST', `/orders/${o1}/items/1/cancel`, W)).status === 409);
check('stock still 1 (not restored twice)', (await stock(s1)) === 1);
const other = win === 0 ? c2 : c1;
check("cannot cancel someone else's order (404)", (await call('POST', `/orders/${o1}/items/1/cancel`, other)).status === 404);

// --- 7. Coupon preview + W3 coupon & review integrity
await call('PUT', '/cart', W, { listing_id: L, quantity: 1 });
const cpPrev = await call('GET', '/orders/coupon/WELCOME10?subtotal=1000', W);
check('coupon preview calculated', cpPrev.status === 200 && cpPrev.body.discount_amount === 100);

check('unknown coupon rejected (400)', (await call('POST', '/orders/checkout', W, { address_id: WA, payment_method: 'COD', coupon_code: 'NOPE' })).status === 400);
const ck = await call('POST', '/orders/checkout', W, { address_id: WA, payment_method: 'COD' });
check('COD checkout works', ck.status === 201 && ck.body.payment_status === 'PENDING', JSON.stringify(ck.body));
const o2 = ck.body.order_id;

const badRating = await call('POST', '/reviews', W, { order_id: o2, item_no: 1, rating: 6 });
check('rating > 5 rejected (400)', badRating.status === 400);

const rv = b => call('POST', '/reviews', W, { order_id: o2, item_no: 1, rating: 5, ...b });
check('review before delivery rejected by trigger (422)', (await rv()).status === 422);
check('other seller cannot ship my item (404)', (await call('PUT', `/seller/order-items/${o2}/1`, s2, { status: 'SHIPPED' })).status === 404);
check('cannot skip to DELIVERED (409)', (await call('PUT', `/seller/order-items/${o2}/1`, s1, { status: 'DELIVERED' })).status === 409);
check('seller ships', (await call('PUT', `/seller/order-items/${o2}/1`, s1, { status: 'SHIPPED' })).status === 200);
check('seller delivers', (await call('PUT', `/seller/order-items/${o2}/1`, s1, { status: 'DELIVERED' })).status === 200);

const od = (await call('GET', `/orders/${o2}`, W)).body;
check('order rolled up to DELIVERED, COD payment SUCCESS', od.status === 'DELIVERED' && od.payment_status === 'SUCCESS', JSON.stringify(od));

const cancelDelivered = await call('POST', `/orders/${o2}/items/1/cancel`, W);
check('cancel delivered item rejected (409)', cancelDelivered.status === 409);

check('review after delivery (201)', (await rv()).status === 201);
check('duplicate review rejected (409)', (await rv()).status === 409);
check("other customer cannot review it (404)", (await call('POST', '/reviews', other, { order_id: o2, item_no: 1, rating: 4 })).status === 404);

// --- Review Deletion & Re-reviewing
const orderDetailWithRev = (await call('GET', `/orders/${o2}`, W)).body;
const revItem = orderDetailWithRev.items.find(it => it.item_no === 1);
check('order detail includes review_id', Boolean(revItem?.review_id));

const otherDelRev = await call('DELETE', `/reviews/${revItem.review_id}`, other);
check("other user cannot delete my review (404)", otherDelRev.status === 404);

const delRev = await call('DELETE', `/reviews/${revItem.review_id}`, W);
check('author deletes review (204)', delRev.status === 204);

const reRev = await call('POST', '/reviews', W, { order_id: o2, item_no: 1, rating: 4, comment: 'Re-reviewed' });
check('re-review after deletion succeeds (201)', reRev.status === 201);

// --- Address Deletion
const extraAddr = await addr(c1);
const delExtraAddr = await call('DELETE', `/addresses/${extraAddr}`, c1);
check('delete unreferenced address (204)', delExtraAddr.status === 204);

const delOrderedAddr = await call('DELETE', `/addresses/${WA}`, W);
check('delete ordered address refused by FK (409)', delOrderedAddr.status === 409);

// --- Seller Listing Deletion & Deactivation
const tempLst = await call('POST', '/seller/listings', s2, { product_id: PID, price: 1500, stock_qty: 3 });
const delTempLst = await call('DELETE', `/seller/listings/${tempLst.body.listing_id}`, s2);
check('delete un-ordered listing (204)', delTempLst.status === 204);

const delOrderedLst = await call('DELETE', `/seller/listings/${L}`, s1);
check('delete ordered listing deactivates it (200, is_active=false)', delOrderedLst.status === 200 && delOrderedLst.body.is_active === false);

// --- 8. Seller analytics
const d = await call('GET', '/seller/dashboard', s1);
check('dashboard returns data and kpis', d.status === 200 && d.body.monthly_revenue.length > 0 && d.body.kpis, JSON.stringify(d.body));

// --- 9. Admin operations & Object Deletions
if (process.env.ADMIN_EMAIL) {
  const ad = (await call('POST', '/auth/login', null, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).body.token;
  check('customer blocked from admin API', (await call('GET', '/admin/sellers', c1)).status === 403);

  const summary = await call('GET', '/admin/summary', ad);
  check('admin summary works', summary.status === 200 && summary.body.total_users > 0);

  const sid = (await call('GET', '/admin/sellers?verified=false', ad)).body.find(s => s.store_name === `Store1-${sfx}`)?.seller_id;
  check('admin verifies seller', (await call('PUT', `/admin/sellers/${sid}/verify`, ad, {})).body?.is_verified === true);

  const cp = await call('POST', '/admin/coupons', ad, {
    code: `T${sfx}`.slice(0, 20), discount_pct: 10, valid_from: '2020-01-01', valid_to: '2099-01-01', max_uses: 1
  });
  check('admin creates coupon', cp.status === 201, JSON.stringify(cp.body));

  const delCp = await call('DELETE', `/admin/coupons/${cp.body.code}`, ad);
  check('admin deletes unused coupon (200)', delCp.status === 200);

  const delUsedCp = await call('DELETE', `/admin/coupons/WELCOME10`, ad);
  check('admin deleting used coupon refused by FK (409)', delUsedCp.status === 409);

  const cat = await call('POST', '/admin/categories', ad, { name: `TestCat-${sfx}` });
  check('admin creates category', cat.status === 201);

  const emptyCat = await call('POST', '/admin/categories', ad, { name: `EmptyCat-${sfx}` });
  const delEmptyCat = await call('DELETE', `/admin/categories/${emptyCat.body.category_id}`, ad);
  check('admin deletes empty category (200)', delEmptyCat.status === 200);

  const prod = await call('POST', '/admin/products', ad, {
    category_id: cat.body.category_id,
    name: `TestProd-${sfx}`,
    brand: 'TestBrand',
    description: 'Created by smoke test'
  });
  check('admin creates product', prod.status === 201);

  const delCatWithProd = await call('DELETE', `/admin/categories/${cat.body.category_id}`, ad);
  check('admin deleting category with products refused by FK (409)', delCatWithProd.status === 409);

  const delProd = await call('DELETE', `/admin/products/${prod.body.product_id}`, ad);
  check('admin deletes unlisted product (200)', delProd.status === 200);

  const delProdWithLst = await call('DELETE', `/admin/products/${PID}`, ad);
  check('admin deleting product with listings refused by FK (409)', delProdWithLst.status === 409);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
