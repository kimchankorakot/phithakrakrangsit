/**
 * พิทักษ์รักษ์รังสิต — Backend (Google Apps Script)
 * -----------------------------------------------------------------
 * วิธีติดตั้ง: ดู apps-script/README.md
 *
 * ต้องตั้งค่า Script Property (Project Settings > Script properties):
 *   ADMIN_PASSWORD  = รหัสผ่านที่เจ้าหน้าที่ทุกคนใช้เข้าสู่ระบบหลังบ้านร่วมกัน (ตั้งเองเป็นข้อความอะไรก็ได้)
 *
 * ชีตที่สคริปต์นี้สร้าง/ใช้อัตโนมัติ:
 *   Drives        : id | itemType | dateStart | dateEnd | location | hours | createdAt
 *   Stock         : id | photo | title | category | quantity | sellable | price | soldCount | reservedCount | action | donateDestination | donateDate | createdAt
 *   Orders        : id | itemId | qty | name | contact | address | slip | price | status | createdAt
 *   Finance       : id | date | type | donor | amount | destination | note | itemId | slip | createdAt
 *   Timeline      : id | date | photo | summary | status | createdAt
 *   TimelineItems : id | timelineId | title | outcome | destinationOrAmount | createdAt
 *   Sessions      : token | createdAt
 *
 * รูปภาพที่อัปโหลดจะถูกเก็บใน Google Drive โฟลเดอร์ชื่อ "พิทักษ์รักษ์รังสิต - รูปภาพ"
 * (สคริปต์สร้างโฟลเดอร์นี้ให้อัตโนมัติในไดรฟ์ของบัญชีที่ deploy Web App — ดู "Execute as" ในขั้นตอน deploy)
 *
 * ระบบล็อกอินนี้ใช้รหัสผ่านเดียวร่วมกันสำหรับเจ้าหน้าที่ทุกคน (ง่าย ไม่ต้องสร้าง Google Client ID
 * หรือเข้า Google Cloud Console เลย) จึงไม่แยกว่าใครเป็นคนทำรายการ — เหมาะกับชุมนุมขนาดเล็กที่ไว้ใจกันอยู่แล้ว
 */

const SHEETS = {
  DRIVES: { name: 'Drives', cols: ['id','itemType','dateStart','dateEnd','location','hours','createdAt'] },
  STOCK: { name: 'Stock', cols: ['id','photo','title','category','quantity','sellable','price','soldCount','reservedCount','action','donateDestination','donateDate','createdAt'] },
  ORDERS: { name: 'Orders', cols: ['id','itemId','qty','name','contact','address','slip','price','status','createdAt'] },
  FINANCE: { name: 'Finance', cols: ['id','date','type','donor','amount','destination','note','itemId','slip','createdAt'] },
  TIMELINE: { name: 'Timeline', cols: ['id','date','photo','summary','status','createdAt'] },
  TIMELINE_ITEMS: { name: 'TimelineItems', cols: ['id','timelineId','title','outcome','destinationOrAmount','createdAt'] },
  SESSIONS: { name: 'Sessions', cols: ['token','createdAt'] },
};

function getSheet_(key){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = SHEETS[key];
  let sh = ss.getSheetByName(cfg.name);
  if(!sh){
    sh = ss.insertSheet(cfg.name);
    sh.appendRow(cfg.cols);
  }
  return sh;
}

function readAll_(key){
  const cfg = SHEETS[key];
  const sh = getSheet_(key);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return [];
  const header = values[0];
  return values.slice(1).filter(r => r.some(c => c !== '')).map(row=>{
    const obj = {};
    header.forEach((h,i)=> obj[h] = row[i]);
    return obj;
  });
}

function appendRow_(key, obj){
  const cfg = SHEETS[key];
  const sh = getSheet_(key);
  const row = cfg.cols.map(c => obj[c] !== undefined ? obj[c] : '');
  sh.appendRow(row);
}

function updateWhere_(key, matchField, matchValue, patch){
  const cfg = SHEETS[key];
  const sh = getSheet_(key);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const colIndex = {}; header.forEach((h,i)=> colIndex[h]=i);
  for(let r=1; r<values.length; r++){
    if(String(values[r][colIndex[matchField]]) === String(matchValue)){
      Object.keys(patch).forEach(k=>{
        if(colIndex[k] !== undefined){
          sh.getRange(r+1, colIndex[k]+1).setValue(patch[k]);
        }
      });
      return true;
    }
  }
  return false;
}

function deleteWhere_(key, matchField, matchValue){
  const sh = getSheet_(key);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const colIndex = {}; header.forEach((h,i)=> colIndex[h]=i);
  for(let r=1; r<values.length; r++){
    if(String(values[r][colIndex[matchField]]) === String(matchValue)){
      sh.deleteRow(r+1);
      return true;
    }
  }
  return false;
}

function findOne_(key, matchField, matchValue){
  return readAll_(key).find(r => String(r[matchField]) === String(matchValue));
}

function newId_(){ return Utilities.getUuid().slice(0,8); }
function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function today_(){ return new Date().toISOString().slice(0,10); }

/* Find today's (or given date's) timeline batch or create a new one, then attach a line item to it */
function logTimelineItem_(date, title, outcome, destinationOrAmount, photo){
  const d = date || today_();
  const batches = readAll_('TIMELINE');
  let batch = batches.find(b => b.date === d);
  let batchId;
  if(batch){
    batchId = batch.id;
  } else {
    batchId = newId_();
    appendRow_('TIMELINE', { id: batchId, date: d, photo: photo || '', summary: '', status: 'done', createdAt: new Date().toISOString() });
  }
  appendRow_('TIMELINE_ITEMS', {
    id: newId_(), timelineId: batchId, title, outcome, destinationOrAmount, createdAt: new Date().toISOString(),
  });
  const items = readAll_('TIMELINE_ITEMS').filter(i => i.timelineId === batchId);
  updateWhere_('TIMELINE', 'id', batchId, { summary: 'รายการ ' + items.length + ' ชิ้น' });
}

/* ---------------- Admin auth (shared staff password) ---------------- */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // sessions stay valid 30 days

function login_(password){
  const correct = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if(!correct || password !== correct) return null;
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0,8);
  appendRow_('SESSIONS', { token, createdAt: new Date().toISOString() });
  return token;
}
function requireAdmin_(token){
  if(!token) return false;
  const session = findOne_('SESSIONS', 'token', token);
  if(!session) return false;
  const age = Date.now() - new Date(session.createdAt).getTime();
  return age < SESSION_MAX_AGE_MS;
}

/* ---------------- Image upload (Google Drive) ---------------- */
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // ~6MB safety cap after client-side compression
const ALLOWED_IMAGE_TYPES = ['image/jpeg','image/png','image/webp'];

function getUploadFolder_(){
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('DRIVE_FOLDER_ID');
  if(existingId){
    try{ return DriveApp.getFolderById(existingId); }catch(e){ /* fall through and recreate */ }
  }
  const folder = DriveApp.createFolder('พิทักษ์รักษ์รังสิต - รูปภาพ');
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function uploadImage_(body){
  if(ALLOWED_IMAGE_TYPES.indexOf(body.mimeType) === -1){
    return json_({ ok:false, error:'unsupported file type' });
  }
  const bytes = Utilities.base64Decode(body.data);
  if(bytes.length > MAX_UPLOAD_BYTES){
    return json_({ ok:false, error:'file too large' });
  }
  const blob = Utilities.newBlob(bytes, body.mimeType, body.filename || (newId_() + '.jpg'));
  const folder = getUploadFolder_();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://lh3.googleusercontent.com/d/' + file.getId();
  return json_({ ok:true, url: url });
}

/* ---------------- doGet: reads ---------------- */
function doGet(e){
  const action = e.parameter.action;
  const publicActions = ['getDrives','getTimeline','getTimelineItems','getShopping','getStats'];
  if(publicActions.indexOf(action) === -1){
    if(!requireAdmin_(e.parameter.token)) return json_({ ok:false, error:'not authorized' });
  }
  try{
    switch(action){
      case 'getDrives': {
        const rows = readAll_('DRIVES').sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
        return json_({ ok:true, data: rows });
      }
      case 'getTimeline': {
        let rows = readAll_('TIMELINE').sort((a,b)=> new Date(b.date) - new Date(a.date));
        const limit = e.parameter.limit ? Number(e.parameter.limit) : null;
        if(limit) rows = rows.slice(0, limit);
        return json_({ ok:true, data: rows });
      }
      case 'getTimelineItems': {
        const rows = readAll_('TIMELINE_ITEMS').filter(i => i.timelineId === e.parameter.timelineId);
        return json_({ ok:true, data: rows });
      }
      case 'getShopping': {
        const rows = readAll_('STOCK').filter(r => r.sellable === true || r.sellable === 'TRUE');
        return json_({ ok:true, data: rows });
      }
      case 'getStock': {
        return json_({ ok:true, data: readAll_('STOCK') });
      }
      case 'getOrders': {
        return json_({ ok:true, data: readAll_('ORDERS').sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt)) });
      }
      case 'getFinance': {
        const rows = readAll_('FINANCE').sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
        return json_({ ok:true, data: rows });
      }
      case 'getStats': {
        const stock = readAll_('STOCK');
        const timeline = readAll_('TIMELINE');
        return json_({ ok:true, data: {
          books: stock.reduce((s,r)=> s + Number(r.quantity||0), 0),
          deliveries: timeline.filter(t=> t.status === 'done').length,
        }});
      }
      default:
        return json_({ ok:false, error: 'unknown action' });
    }
  }catch(err){
    return json_({ ok:false, error: String(err) });
  }
}

/* ---------------- doPost: writes ---------------- */
function doPost(e){
  let body;
  try{ body = JSON.parse(e.postData.contents); }
  catch(err){ return json_({ ok:false, error:'bad json' }); }

  const action = body.action;
  const now = new Date().toISOString();

  // Actions that don't need the sheet lock (no sheet writes, or handled separately)
  if(action === 'login'){
    const token = login_(body.password);
    return token ? json_({ ok:true, token }) : json_({ ok:false, error:'wrong password' });
  }
  if(action === 'logout'){
    if(body.token) deleteWhere_('SESSIONS', 'token', body.token);
    return json_({ ok:true });
  }
  if(action === 'uploadImage'){
    // Public: customers need this too, to attach a payment slip on an order.
    try{ return uploadImage_(body); }
    catch(err){ return json_({ ok:false, error: String(err) }); }
  }

  const lock = LockService.getScriptLock();
  try{
    lock.waitLock(10000);
  }catch(e2){
    return json_({ ok:false, error: 'busy, try again' });
  }

  try{
    // Public: anyone can place an order from the shopping page
    if(action === 'createOrder'){
      const item = findOne_('STOCK', 'id', body.itemId);
      if(!item) return json_({ ok:false, error:'item not found' });
      const available = Number(item.quantity||0) - Number(item.soldCount||0) - Number(item.reservedCount||0);
      if(available <= 0) return json_({ ok:false, error:'sold_out' });
      updateWhere_('STOCK', 'id', body.itemId, { reservedCount: Number(item.reservedCount||0) + 1 });
      appendRow_('ORDERS', {
        id: newId_(), itemId: body.itemId, qty: 1, name: body.name, contact: body.contact,
        address: body.address, slip: body.slip || '', price: item.price,
        status: 'pending', createdAt: now,
      });
      return json_({ ok:true });
    }

    // Everything below requires an authorized admin
    if(!requireAdmin_(body.token)) return json_({ ok:false, error:'not authorized' });

    switch(action){
      /* ---- Drives (home page donation rounds) ---- */
      case 'addDrive': {
        appendRow_('DRIVES', {
          id: newId_(), itemType: body.itemType, dateStart: body.dateStart, dateEnd: body.dateEnd,
          location: body.location, hours: body.hours, createdAt: now,
        });
        return json_({ ok:true });
      }
      case 'updateDrive': {
        updateWhere_('DRIVES', 'id', body.driveId, {
          itemType: body.itemType, dateStart: body.dateStart, dateEnd: body.dateEnd,
          location: body.location, hours: body.hours,
        });
        return json_({ ok:true });
      }

      /* ---- Stock ---- */
      case 'addStockItem': {
        appendRow_('STOCK', {
          id: newId_(), photo: body.photo || '', title: body.title || '', category: body.category,
          quantity: body.quantity || 1, sellable: !!body.sellable, price: body.price || 0,
          soldCount: 0, reservedCount: 0, action: '', donateDestination: '', donateDate: '', createdAt: now,
        });
        return json_({ ok:true });
      }
      case 'updateStockItem': {
        const patch = { title: body.title, category: body.category, quantity: body.quantity };
        if(body.photo) patch.photo = body.photo; // only overwrite if a new photo was actually uploaded
        if(body.price !== undefined) patch.price = body.price;
        updateWhere_('STOCK', 'id', body.itemId, patch);
        return json_({ ok:true });
      }
      case 'deleteStockItem': {
        const item = findOne_('STOCK', 'id', body.itemId);
        if(item && (Number(item.soldCount||0) > 0 || item.action)){
          return json_({ ok:false, error:'has_history' });
        }
        deleteWhere_('STOCK', 'id', body.itemId);
        return json_({ ok:true });
      }
      case 'setStockAction': {
        const patch = { action: body.action };
        if(body.action === 'donate'){
          patch.donateDestination = body.destination;
          patch.donateDate = body.date;
        }
        updateWhere_('STOCK', 'id', body.itemId, patch);
        if(body.action === 'donate'){
          const item = findOne_('STOCK', 'id', body.itemId);
          updateWhere_('STOCK', 'id', body.itemId, { soldCount: item ? item.quantity : 0 });
          logTimelineItem_(body.date, item ? item.title || item.category : '', 'donated', body.destination, item ? item.photo : '');
        }
        return json_({ ok:true });
      }
      case 'recordSale': {
        const item = findOne_('STOCK', 'id', body.itemId);
        if(item){
          updateWhere_('STOCK', 'id', body.itemId, { soldCount: Number(item.soldCount||0) + Number(body.qty||1) });
          logTimelineItem_(body.date, item.title || item.category, 'sold', body.destination, item.photo);
        }
        return json_({ ok:true });
      }

      /* ---- Orders ---- */
      case 'updateOrder': {
        updateWhere_('ORDERS', 'id', body.orderId, { name: body.name, contact: body.contact, address: body.address });
        return json_({ ok:true });
      }
      case 'deleteOrder': {
        const order = findOne_('ORDERS', 'id', body.orderId);
        if(order && order.status === 'pending'){
          const item = findOne_('STOCK', 'id', order.itemId);
          if(item) updateWhere_('STOCK', 'id', order.itemId, { reservedCount: Math.max(0, Number(item.reservedCount||0) - Number(order.qty||1)) });
        }
        deleteWhere_('ORDERS', 'id', body.orderId);
        return json_({ ok:true });
      }

      /* ---- Finance part 1: order approval ---- */
      case 'approveOrder': {
        const order = findOne_('ORDERS', 'id', body.orderId);
        if(!order || order.status !== 'pending') return json_({ ok:false, error:'order not pending' });
        updateWhere_('ORDERS', 'id', body.orderId, { status: 'approved' });
        const item = findOne_('STOCK', 'id', order.itemId);
        if(item){
          updateWhere_('STOCK', 'id', order.itemId, {
            soldCount: Number(item.soldCount||0) + Number(order.qty||1),
            reservedCount: Math.max(0, Number(item.reservedCount||0) - Number(order.qty||1)),
          });
          logTimelineItem_(now.slice(0,10), item.title || item.category, 'sold', order.price, item.photo);
        }
        appendRow_('FINANCE', {
          id: newId_(), date: now.slice(0,10), type: 'order', donor: order.name, amount: order.price,
          destination: '', note: 'สั่งซื้อ: ' + (item ? item.title : order.itemId), itemId: order.itemId, slip: order.slip, createdAt: now,
        });
        return json_({ ok:true });
      }
      case 'rejectOrder': {
        const order = findOne_('ORDERS', 'id', body.orderId);
        if(order && order.status === 'pending'){
          const item = findOne_('STOCK', 'id', order.itemId);
          if(item) updateWhere_('STOCK', 'id', order.itemId, { reservedCount: Math.max(0, Number(item.reservedCount||0) - Number(order.qty||1)) });
        }
        updateWhere_('ORDERS', 'id', body.orderId, { status: 'rejected' });
        return json_({ ok:true });
      }

      /* ---- Finance part 2: other income (cash donation or weight-sale) ---- */
      case 'addOtherIncome': {
        appendRow_('FINANCE', {
          id: newId_(), date: now.slice(0,10), type: 'other', donor: body.donor, amount: body.amount,
          destination: '', note: body.note || '', itemId: body.itemId || '', slip: body.slip || '', createdAt: now,
        });
        if(body.isWeightSale && body.itemId){
          const item = findOne_('STOCK', 'id', body.itemId);
          if(item){
            updateWhere_('STOCK', 'id', body.itemId, { soldCount: item.quantity });
            logTimelineItem_(now.slice(0,10), item.title || item.category, 'sold', body.amount, item.photo);
          }
        }
        return json_({ ok:true });
      }

      /* ---- Finance part 3: post-sale donation -> shows on Timeline ---- */
      case 'addPostSaleDonation': {
        appendRow_('FINANCE', {
          id: newId_(), date: now.slice(0,10), type: 'donation', donor: body.donor, amount: body.amount,
          destination: body.destination, note: '', itemId: '', slip: '', createdAt: now,
        });
        logTimelineItem_(now.slice(0,10), 'บริจาคเงินโดย ' + body.donor, 'donated', body.destination + ' (฿' + body.amount + ')', '');
        return json_({ ok:true });
      }
      case 'deleteFinanceEntry': {
        deleteWhere_('FINANCE', 'id', body.financeId);
        return json_({ ok:true });
      }

      default:
        return json_({ ok:false, error: 'unknown action' });
    }
  }catch(err){
    return json_({ ok:false, error: String(err) });
  }finally{
    lock.releaseLock();
  }
}
