// Extensive Edge Cases & "Removing Till Empty" Test Suite for KartHub
import { strict as assert } from 'assert';

const BASE = process.env.API_URL || 'http://localhost:4000/api';
const sfx = Date.now();

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function check(name, ok, extra = '') {
  totalTests++;
  if (ok) {
    passedTests++;
    console.log(`PASS  ${name}`);
  } else {
    failedTests++;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

async function call(method, path, token, body) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let resBody = null;
  const text = await res.text();
  try { resBody = JSON.parse(text); } catch { resBody = text; }
  return { status: res.status, body: resBody };
}

async function run() {
  console.log('--- STARTING EXTENSIVE EDGE CASE TEST SUITE ---\n');

  // 1. SETUP ACTORS
  // Admin login
  const adminLogin = await call('POST', '/auth/login', null, { email: 'admin@karthub.dev', password: 'secret1' });
  const adminToken = adminLogin.body?.token;
  check('Admin authentication', adminLogin.status === 200 && !!adminToken);

  // Register Seller with proper store_name & 15-character GST
  const sEmail = `edgeseller-${sfx}@karthub.dev`;
  const gstNo = ('29' + sfx).slice(0, 15).padEnd(15, '0');
  const sellerPhone = ('7' + sfx).slice(0, 10);
  const sReg = await call('POST', '/auth/register', null, {
    email: sEmail, password: 'secret1', full_name: 'Edge Seller',
    phone: sellerPhone, store_name: `EdgeStore-${sfx}`, gst_no: gstNo
  });
  const sToken = sReg.body?.token;
  check('Seller registration', sReg.status === 201 && !!sToken, JSON.stringify(sReg.body));

  // Register Customer 1
  const c1Email = `edgecust1-${sfx}@karthub.dev`;
  const phone1 = ('9' + sfx).slice(0, 10);
  const c1Reg = await call('POST', '/auth/register', null, {
    email: c1Email, password: 'secret1', full_name: 'Edge Customer 1', phone: phone1
  });
  const c1Token = c1Reg.body?.token;
  check('Customer 1 registration', c1Reg.status === 201 && !!c1Token, JSON.stringify(c1Reg.body));

  // Register Customer 2
  const c2Email = `edgecust2-${sfx}@karthub.dev`;
  const phone2 = ('8' + sfx).slice(0, 10);
  const c2Reg = await call('POST', '/auth/register', null, {
    email: c2Email, password: 'secret1', full_name: 'Edge Customer 2', phone: phone2
  });
  const c2Token = c2Reg.body?.token;
  check('Customer 2 registration', c2Reg.status === 201 && !!c2Token, JSON.stringify(c2Reg.body));

  // Create Category & 4 distinct Products for edge testing (satisfying UNIQUE(seller_id, product_id))
  const catRes = await call('POST', '/admin/categories', adminToken, { name: `EdgeCat-${sfx}` });
  const edgeCatId = catRes.body?.category_id;
  check('Admin creates test category', catRes.status === 201 && !!edgeCatId);

  const p1Res = await call('POST', '/admin/products', adminToken, {
    category_id: edgeCatId, name: `Edge Prod 1 ${sfx}`, brand: 'EdgeBrand', description: 'Item 1'
  });
  const prod1Id = p1Res.body?.product_id;

  const p2Res = await call('POST', '/admin/products', adminToken, {
    category_id: edgeCatId, name: `Edge Prod 2 ${sfx}`, brand: 'EdgeBrand', description: 'Item 2'
  });
  const prod2Id = p2Res.body?.product_id;

  const p3Res = await call('POST', '/admin/products', adminToken, {
    category_id: edgeCatId, name: `Edge Prod 3 ${sfx}`, brand: 'EdgeBrand', description: 'Item 3'
  });
  const prod3Id = p3Res.body?.product_id;

  const pLtdRes = await call('POST', '/admin/products', adminToken, {
    category_id: edgeCatId, name: `Edge Ltd Prod ${sfx}`, brand: 'EdgeBrand', description: 'Limited stock item'
  });
  const ltdProdId = pLtdRes.body?.product_id;

  check('Admin created 4 test products', !!prod1Id && !!prod2Id && !!prod3Id && !!ltdProdId);

  // ==========================================
  // SECTION 1: CART - DRAIN TO EMPTY & BOUNDARY AT ZERO
  // ==========================================
  console.log('\n--- Section 1: Cart Edge Cases & Removing Till Empty ---');

  // Seller creates 3 listings across distinct products
  const l1Res = await call('POST', '/seller/listings', sToken, { product_id: prod1Id, price: 100, stock_qty: 10 });
  const l1 = l1Res.body?.listing_id;

  const l2Res = await call('POST', '/seller/listings', sToken, { product_id: prod2Id, price: 200, stock_qty: 10 });
  const l2 = l2Res.body?.listing_id;

  const l3Res = await call('POST', '/seller/listings', sToken, { product_id: prod3Id, price: 300, stock_qty: 10 });
  const l3 = l3Res.body?.listing_id;

  check('Seller created 3 listings across distinct products', !!l1 && !!l2 && !!l3, JSON.stringify([l1Res.body, l2Res.body, l3Res.body]));

  // Add all 3 to Customer 1's cart
  await call('PUT', '/cart', c1Token, { listing_id: l1, quantity: 2 });
  await call('PUT', '/cart', c1Token, { listing_id: l2, quantity: 1 });
  await call('PUT', '/cart', c1Token, { listing_id: l3, quantity: 3 });

  let cart = (await call('GET', '/cart', c1Token)).body;
  check('Cart has 3 distinct items', Array.isArray(cart.items) && cart.items.length === 3);
  check('Cart subtotal is exact: 2*100 + 1*200 + 3*300 = 1300', cart.subtotal === 1300);

  // Test invalid cart operations
  check('PUT /cart with quantity 0 rejected (400)', (await call('PUT', '/cart', c1Token, { listing_id: l1, quantity: 0 })).status === 400);
  check('PUT /cart with negative quantity rejected (400)', (await call('PUT', '/cart', c1Token, { listing_id: l1, quantity: -5 })).status === 400);
  check('PUT /cart with float quantity rejected (400)', (await call('PUT', '/cart', c1Token, { listing_id: l1, quantity: 2.5 })).status === 400);
  check('PUT /cart with non-numeric listing_id rejected (400)', (await call('PUT', '/cart', c1Token, { listing_id: 'bad', quantity: 1 })).status === 400);

  // Now remove items one by one until cart is completely empty
  // Step A: Decrement l1 from 2 to 1
  await call('PUT', '/cart', c1Token, { listing_id: l1, quantity: 1 });
  cart = (await call('GET', '/cart', c1Token)).body;
  check('Cart item l1 updated to 1', cart.items.find(x => x.listing_id === l1)?.quantity === 1);

  // Step B: Delete item l1
  const delL1 = await call('DELETE', `/cart/${l1}`, c1Token);
  check('DELETE item l1 succeeds (204)', delL1.status === 204);
  cart = (await call('GET', '/cart', c1Token)).body;
  check('Cart now has 2 items left', cart.items.length === 2 && !cart.items.some(x => x.listing_id === l1));

  // Step C: Delete item l2
  const delL2 = await call('DELETE', `/cart/${l2}`, c1Token);
  check('DELETE item l2 succeeds (204)', delL2.status === 204);
  cart = (await call('GET', '/cart', c1Token)).body;
  check('Cart now has 1 item left', cart.items.length === 1 && cart.items[0].listing_id === l3);

  // Step D: Delete final item l3 -> CART IS COMPLETELY EMPTY
  const delL3 = await call('DELETE', `/cart/${l3}`, c1Token);
  check('DELETE final item l3 succeeds (204)', delL3.status === 204);
  cart = (await call('GET', '/cart', c1Token)).body;
  check('Cart is now completely empty (0 items)', cart.items.length === 0);
  check('Cart subtotal is 0', cart.subtotal === 0);

  // Add an address for Customer 1 to test checkout
  const addr1 = (await call('POST', '/addresses', c1Token, {
    line1: '123 Main St', city: 'Bengaluru', state: 'Karnataka', pincode: '560001'
  })).body;
  check('Customer 1 added address', !!addr1?.address_id);

  // Attempt checkout on EMPTY cart -> MUST FAIL
  const emptyCheckout = await call('POST', '/orders/checkout', c1Token, {
    address_id: addr1.address_id,
    payment_method: 'COD'
  });
  check('Checkout on EMPTY cart rejected (400: Cart is empty)', emptyCheckout.status === 400 && emptyCheckout.body?.error?.includes('Cart is empty'), JSON.stringify(emptyCheckout.body));

  // ==========================================
  // SECTION 2: STOCK - INVENTORY DEPLETION TILL 0 & RESTORATION
  // ==========================================
  console.log('\n--- Section 2: Stock Depletion Till 0 & Cancellation Restoration ---');

  // Create limited stock listing (stock = 2) for ltdProdId
  const ltdListingRes = await call('POST', '/seller/listings', sToken, {
    product_id: ltdProdId, price: 500, stock_qty: 2
  });
  const ltdListing = ltdListingRes.body?.listing_id;
  check('Limited stock listing created with stock_qty = 2', !!ltdListing, JSON.stringify(ltdListingRes.body));

  // Customer 1 adds 1 to cart
  await call('PUT', '/cart', c1Token, { listing_id: ltdListing, quantity: 1 });
  // Customer 2 adds 2 to cart
  await call('PUT', '/cart', c2Token, { listing_id: ltdListing, quantity: 2 });

  // Add address for Customer 2
  const addr2 = (await call('POST', '/addresses', c2Token, {
    line1: '456 Tech Park', city: 'Bengaluru', state: 'Karnataka', pincode: '560100'
  })).body;
  check('Customer 2 added address', !!addr2?.address_id);

  // Customer 1 checks out 1 unit -> stock should become 1
  const c1Order = await call('POST', '/orders/checkout', c1Token, { address_id: addr1.address_id, payment_method: 'COD' });
  check('Customer 1 purchases 1 unit (order placed)', c1Order.status === 201, JSON.stringify(c1Order.body));

  // Customer 2 attempts to checkout 2 units -> MUST FAIL with 409 (only 1 left)
  const c2Fail = await call('POST', '/orders/checkout', c2Token, { address_id: addr2.address_id, payment_method: 'COD' });
  check('Customer 2 checking out 2 units rejected (409: Only 1 left)', c2Fail.status === 409 && c2Fail.body?.error?.includes('Only 1 left'), JSON.stringify(c2Fail.body));

  // Customer 2 updates cart to 1 unit -> checkout succeeds -> stock becomes exactly 0
  await call('PUT', '/cart', c2Token, { listing_id: ltdListing, quantity: 1 });
  const c2Order = await call('POST', '/orders/checkout', c2Token, { address_id: addr2.address_id, payment_method: 'COD' });
  check('Customer 2 checks out 1 unit -> stock reaches exactly 0', c2Order.status === 201, JSON.stringify(c2Order.body));

  // Verify stock in listing is exactly 0
  const offersRes = await call('GET', `/products/${ltdProdId}/offers`, null);
  const ltdOffer = offersRes.body?.find(o => o.listing_id === ltdListing);
  check('Listing stock_qty is now 0 (out of stock)', ltdOffer?.stock_qty === 0);

  // Customer 1 tries to add to cart & checkout when stock is 0 -> fails with 409
  await call('PUT', '/cart', c1Token, { listing_id: ltdListing, quantity: 1 });
  const c1ZeroCheckout = await call('POST', '/orders/checkout', c1Token, { address_id: addr1.address_id, payment_method: 'COD' });
  check('Checkout when stock is 0 rejected (409: Only 0 left)', c1ZeroCheckout.status === 409 && c1ZeroCheckout.body?.error?.includes('Only 0 left'), JSON.stringify(c1ZeroCheckout.body));
  await call('DELETE', `/cart/${ltdListing}`, c1Token); // clean cart

  // Customer 1 cancels their order item -> stock should be restored from 0 to 1
  const cancelRes = await call('POST', `/orders/${c1Order.body.order_id}/items/1/cancel`, c1Token);
  check('Customer 1 cancels order item (200)', cancelRes.status === 200);

  const offersResAfterCancel = await call('GET', `/products/${ltdProdId}/offers`, null);
  const ltdOfferRestored = offersResAfterCancel.body?.find(o => o.listing_id === ltdListing);
  check('Stock successfully restored from 0 to 1 after cancellation', ltdOfferRestored?.stock_qty === 1);

  // Attempting second cancel must fail
  const doubleCancel = await call('POST', `/orders/${c1Order.body.order_id}/items/1/cancel`, c1Token);
  check('Second cancel on same item rejected (409)', doubleCancel.status === 409);

  // Stock must still be 1 (not restored twice)
  const offersResAfterDouble = await call('GET', `/products/${ltdProdId}/offers`, null);
  check('Stock remains 1 after double cancel attempt', offersResAfterDouble.body?.find(o => o.listing_id === ltdListing)?.stock_qty === 1);

  // ==========================================
  // SECTION 3: ADDRESSES - REMOVE TILL EMPTY, DEFAULT ROLLOVER & FK RESTRICT
  // ==========================================
  console.log('\n--- Section 3: Addresses Removing Till Empty & Default Rollover ---');

  // Customer 2 creates 3 additional addresses
  const aA = (await call('POST', '/addresses', c2Token, { line1: 'Villa A', city: 'Mysuru', state: 'Karnataka', pincode: '570001' })).body;
  const aB = (await call('POST', '/addresses', c2Token, { line1: 'Villa B', city: 'Hubli', state: 'Karnataka', pincode: '580001' })).body;
  const aC = (await call('POST', '/addresses', c2Token, { line1: 'Villa C', city: 'Mangaluru', state: 'Karnataka', pincode: '575001' })).body;

  let c2Addrs = (await call('GET', '/addresses', c2Token)).body;
  check('Customer 2 has 4 addresses total', c2Addrs.length === 4);

  // Change default address to aB
  const setDefB = await call('PUT', `/addresses/${aB.address_id}`, c2Token, { is_default: true });
  check('Set aB as default address (200)', setDefB.status === 200 && setDefB.body?.is_default === true);

  c2Addrs = (await call('GET', '/addresses', c2Token)).body;
  check('Only aB is marked as default', c2Addrs.find(a => a.address_id === aB.address_id)?.is_default === true &&
    c2Addrs.filter(a => a.is_default).length === 1);

  // Delete aB (which is currently default) -> should rollover default to another address!
  const delDefB = await call('DELETE', `/addresses/${aB.address_id}`, c2Token);
  check('Delete default address aB succeeds (204)', delDefB.status === 204);

  c2Addrs = (await call('GET', '/addresses', c2Token)).body;
  check('Default rolled over to another address automatically', c2Addrs.filter(a => a.is_default).length === 1);

  // Delete aA
  await call('DELETE', `/addresses/${aA.address_id}`, c2Token);
  // Delete aC
  await call('DELETE', `/addresses/${aC.address_id}`, c2Token);

  // Now only addr2 (which was used for c2Order) remains
  c2Addrs = (await call('GET', '/addresses', c2Token)).body;
  check('Customer 2 has only 1 address remaining (addr2 with order history)', c2Addrs.length === 1 && c2Addrs[0].address_id === addr2.address_id);

  // Attempt to delete addr2 (referenced by c2Order) -> MUST BE REFUSED BY FK RESTRICT (409)
  const delOrderedAddr = await call('DELETE', `/addresses/${addr2.address_id}`, c2Token);
  check('Deleting address with order history refused by FK RESTRICT (409)', delOrderedAddr.status === 409);

  // ==========================================
  // SECTION 4: REVIEWS - ADD, DELETE TILL 0, AND PRODUCT RATING RECALCULATION
  // ==========================================
  console.log('\n--- Section 4: Reviews - Add, Delete Till 0 & Rating Recalculation ---');

  // Let seller ship and deliver c2Order (which ordered ltdListing / ltdProdId)
  await call('PUT', `/seller/order-items/${c2Order.body.order_id}/1`, sToken, { status: 'SHIPPED' });
  await call('PUT', `/seller/order-items/${c2Order.body.order_id}/1`, sToken, { status: 'DELIVERED' });

  // Check product rating before any reviews
  let prodInfo = (await call('GET', `/products/${ltdProdId}`, null)).body;
  check('Product initially has 0 reviews and null rating', Number(prodInfo.reviews) === 0 && prodInfo.avg_rating === null, JSON.stringify(prodInfo));

  // Customer 2 reviews with 5 stars
  const rev1 = await call('POST', '/reviews', c2Token, {
    order_id: c2Order.body.order_id,
    item_no: 1,
    rating: 5,
    comment: 'Exceptional build quality!'
  });
  check('Customer 2 creates 5-star review (201)', rev1.status === 201);
  const rev1Id = rev1.body?.review_id;

  // Product rating should now be 5.00 with 1 review
  prodInfo = (await call('GET', `/products/${ltdProdId}`, null)).body;
  check('Product rating is now 5.00 with 1 review', Number(prodInfo.avg_rating) === 5 && Number(prodInfo.reviews) === 1, JSON.stringify(prodInfo));

  // Attempt duplicate review on same order item -> MUST FAIL (409)
  const dupRev = await call('POST', '/reviews', c2Token, {
    order_id: c2Order.body.order_id,
    item_no: 1,
    rating: 4
  });
  check('Duplicate review on same order item rejected (409)', dupRev.status === 409);

  // Other customer cannot delete Customer 2's review
  const unauthorizedDel = await call('DELETE', `/reviews/${rev1Id}`, c1Token);
  check('Other customer deleting review rejected (404)', unauthorizedDel.status === 404);

  // Customer 2 deletes their review -> COUNT OF REVIEWS REACHES ZERO
  const delRev = await call('DELETE', `/reviews/${rev1Id}`, c2Token);
  check('Customer 2 deletes their review (204)', delRev.status === 204);

  // Check that product rating recalculated back to 0 reviews and null avg_rating!
  prodInfo = (await call('GET', `/products/${ltdProdId}`, null)).body;
  check('Product rating recalculated to null and reviews = 0 after deleting review', Number(prodInfo.reviews) === 0 && prodInfo.avg_rating === null, JSON.stringify(prodInfo));

  // Customer 2 can now re-review the item with rating 4
  const reRev = await call('POST', '/reviews', c2Token, {
    order_id: c2Order.body.order_id,
    item_no: 1,
    rating: 4,
    comment: 'Updated review after re-evaluating'
  });
  check('Re-reviewing after deletion succeeds (201)', reRev.status === 201);

  prodInfo = (await call('GET', `/products/${ltdProdId}`, null)).body;
  check('Product rating recalculated to 4.00 with 1 review', Number(prodInfo.avg_rating) === 4 && Number(prodInfo.reviews) === 1, JSON.stringify(prodInfo));

  // ==========================================
  // SECTION 5: COUPONS - EXHAUSTION TILL 0 REMAINING & REVIVAL
  // ==========================================
  console.log('\n--- Section 5: Coupons - Exhaustion Till 0 & Cancellation Revival ---');

  const cpCode = `EDGE${sfx}`.slice(0, 20);
  const cpRes = await call('POST', '/admin/coupons', adminToken, {
    code: cpCode,
    discount_pct: 20,
    min_order_value: 100,
    valid_from: '2020-01-01',
    valid_to: '2099-01-01',
    max_uses: 1 // only 1 single use allowed
  });
  check('Admin created coupon with max_uses = 1', cpRes.status === 201);

  // Preview coupon with subtotal below min_order_value (e.g. 50) -> fails
  const cpPreviewLow = await call('GET', `/orders/coupon/${cpCode}?subtotal=50`, c1Token);
  check('Coupon preview below min_order_value rejected (400)', cpPreviewLow.status === 400);

  // Customer 1 uses the 1 and only coupon use
  await call('PUT', '/cart', c1Token, { listing_id: l1, quantity: 2 }); // 2 * 100 = 200
  const orderWithCp = await call('POST', '/orders/checkout', c1Token, {
    address_id: addr1.address_id,
    payment_method: 'COD',
    coupon_code: cpCode
  });
  check('Order placed using the coupon (201)', orderWithCp.status === 201);

  // Customer 2 tries to use the same coupon -> MUST FAIL (0 uses remaining, 400)
  await call('PUT', '/cart', c2Token, { listing_id: l1, quantity: 2 });
  const cpExhausted = await call('POST', '/orders/checkout', c2Token, {
    address_id: addr2.address_id,
    payment_method: 'COD',
    coupon_code: cpCode
  });
  check('Coupon usage when 0 uses remaining rejected (400: usage limit reached)', cpExhausted.status === 400 && cpExhausted.body?.error?.includes('usage limit reached'));

  // Cancel orderWithCp -> coupon usage MUST BE RESTORED (revived)!
  await call('POST', `/orders/${orderWithCp.body.order_id}/items/1/cancel`, c1Token);
  check('Order with coupon cancelled', true);

  // Customer 2 now tries checkout with the revived coupon -> MUST SUCCEED!
  const cpRevived = await call('POST', '/orders/checkout', c2Token, {
    address_id: addr2.address_id,
    payment_method: 'COD',
    coupon_code: cpCode
  });
  check('Coupon revived after cancellation can be used again (201)', cpRevived.status === 201);

  // Attempt to delete coupon that is used in cpRevived -> MUST FAIL (409 FK RESTRICT)
  const delUsedCp = await call('DELETE', `/admin/coupons/${cpCode}`, adminToken);
  check('Deleting coupon with order history refused by FK RESTRICT (409)', delUsedCp.status === 409);

  // Delete an unused coupon -> succeeds
  const unusedCp = `UNUSED${sfx}`.slice(0, 20);
  await call('POST', '/admin/coupons', adminToken, {
    code: unusedCp, discount_pct: 10, valid_from: '2020-01-01', valid_to: '2099-01-01', max_uses: 5
  });
  const delUnusedCp = await call('DELETE', `/admin/coupons/${unusedCp}`, adminToken);
  check('Deleting unused coupon succeeds (200)', delUnusedCp.status === 200);

  // ==========================================
  // SECTION 6: SELLER LISTINGS - REMOVE TILL EMPTY (PERMANENT DELETE VS DEACTIVATION)
  // ==========================================
  console.log('\n--- Section 6: Seller Listings - Remove Till Empty ---');

  // Seller has l1, l2, l3, ltdListing
  // l2 and l3 were never ordered! They should be permanently deleted (204)
  const delL2Seller = await call('DELETE', `/seller/listings/${l2}`, sToken);
  check('Seller deleting un-ordered listing l2 permanently deleted (204)', delL2Seller.status === 204);

  const delL3Seller = await call('DELETE', `/seller/listings/${l3}`, sToken);
  check('Seller deleting un-ordered listing l3 permanently deleted (204)', delL3Seller.status === 204);

  // l1 has past orders (c1 placed order, c2 placed order). Deleting l1 MUST DEACTIVATE IT (200, is_active=false)
  const delL1Seller = await call('DELETE', `/seller/listings/${l1}`, sToken);
  check('Seller deleting ordered listing l1 deactivates it (200, is_active=false)', delL1Seller.status === 200 && delL1Seller.body?.is_active === false);

  // ltdListing also has orders -> deactivates
  const delLtdSeller = await call('DELETE', `/seller/listings/${ltdListing}`, sToken);
  check('Seller deleting ordered ltdListing deactivates it (200, is_active=false)', delLtdSeller.status === 200 && delLtdSeller.body?.is_active === false);

  // Active listings for seller is now exactly 0
  const sellerListings = (await call('GET', '/seller/listings', sToken)).body;
  const activeCount = Array.isArray(sellerListings) ? sellerListings.filter(l => l.is_active).length : -1;
  check('Seller now has 0 active listings (all removed or deactivated)', activeCount === 0);

  // Deactivated listings no longer appear in public active offers for the product
  const publicOffers = (await call('GET', `/products/${prod1Id}/offers`, null)).body;
  check('Public offers for product is now 0 active listings', Array.isArray(publicOffers) && publicOffers.filter(o => o.stock_qty > 0 && o.is_active !== false).length === 0);

  // ==========================================
  // SECTION 7: CATEGORIES & PRODUCTS - DELETION CONSTRAINTS
  // ==========================================
  console.log('\n--- Section 7: Categories & Products Deletion Constraints ---');

  // Try to delete category EdgeCat (contains prod1, prod2, etc.) -> MUST FAIL (409 FK RESTRICT)
  const delCatWithProd = await call('DELETE', `/admin/categories/${edgeCatId}`, adminToken);
  check('Deleting category with products refused by FK RESTRICT (409)', delCatWithProd.status === 409);

  // Try to delete prod1 (has listings l1) -> MUST FAIL (409 FK RESTRICT)
  const delProdWithLst = await call('DELETE', `/admin/products/${prod1Id}`, adminToken);
  check('Deleting product with listings refused by FK RESTRICT (409)', delProdWithLst.status === 409);

  // Create an unlisted product and delete it -> succeeds (200)
  const unlistedProd = (await call('POST', '/admin/products', adminToken, {
    category_id: edgeCatId, name: `Unlisted-${sfx}`, brand: 'TempBrand'
  })).body;
  const delUnlisted = await call('DELETE', `/admin/products/${unlistedProd.product_id}`, adminToken);
  check('Deleting unlisted product succeeds (200)', delUnlisted.status === 200);

  // Create an empty category and delete it -> succeeds (200)
  const emptyCat = (await call('POST', '/admin/categories', adminToken, { name: `EmptyCat-${sfx}` })).body;
  const delEmptyCat = await call('DELETE', `/admin/categories/${emptyCat.category_id}`, adminToken);
  check('Deleting empty category succeeds (200)', delEmptyCat.status === 200);

  console.log(`\n==============================================`);
  console.log(`EXTENSIVE EDGE CASE TESTS SUMMARY:`);
  console.log(`Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log(`==============================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error in edge cases test runner:', err);
  process.exit(1);
});
