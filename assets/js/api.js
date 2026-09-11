/* พิทักษ์รักรังสิต - API wrapper
   ตั้งค่า SCRIPT_URL ให้เป็น URL ของ Google Apps Script Web App ที่ deploy แล้ว
   (ดูวิธีทำใน apps-script/README ที่แนบมาให้)                                */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyIq3K-ba6M7EilpqIrWJ6YAfEV0wasd4TBc28B6BWCdKgk3pRLCeA9xh9U9JKN0PSCQg/exec";

function isConnected(){
  return SCRIPT_URL && SCRIPT_URL.indexOf("PASTE_") !== 0;
}

function showToast(msg){
  let el = document.querySelector('.toast');
  if(!el){ el = document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.style.display='none'; }, 3500);
}

function handleAuthFailure_(res){
  if(res && res.ok === false && res.error === 'not authorized' && getAdminToken()){
    clearAdminSession();
    showToast(t('login_denied'));
    setTimeout(()=>{ window.location.href = 'login.html'; }, 1200);
  }
  return res;
}

/* Reads: doGet(e) with ?action=... on the Apps Script side */
async function apiGet(action, params={}){
  if(!isConnected()){ showToast(t('connect_needed')); return { ok:false, data: [] }; }
  const token = getAdminToken();
  const qs = new URLSearchParams({ action, ...(token ? { token } : {}), ...params }).toString();
  try{
    const res = await fetch(`${SCRIPT_URL}?${qs}`);
    return handleAuthFailure_(await res.json());
  }catch(err){
    console.error(err); showToast(t('error_generic')); return { ok:false, data: [] };
  }
}

/* Writes: doPost(e): Apps Script Web Apps only accept POST as text/plain
   to avoid CORS preflight, so we JSON.stringify the whole payload as the body. */
async function apiPost(action, payload={}){
  if(!isConnected()){ showToast(t('connect_needed')); return { ok:false }; }
  const token = getAdminToken();
  try{
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, ...payload })
    });
    return handleAuthFailure_(await res.json());
  }catch(err){
    console.error(err); showToast(t('error_generic')); return { ok:false };
  }
}

/* ---------------- Image upload (compresses client-side, stores in Google Drive) ---------------- */
function compressImageFile_(file, maxDim=1400, quality=0.82){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDim || height > maxDim){
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale); height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ mimeType: 'image/jpeg', base64: dataUrl.split(',')[1] });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Uploads a <input type="file"> photo and returns its public URL, or '' if no file chosen. */
async function uploadPhotoIfAny(fileInputEl){
  const file = fileInputEl && fileInputEl.files && fileInputEl.files[0];
  if(!file) return '';
  showToast(t('uploading'));
  try{
    const { mimeType, base64 } = await compressImageFile_(file);
    const res = await apiPost('uploadImage', { filename: file.name, mimeType, data: base64 });
    if(res && res.ok && res.url) return res.url;
    showToast(t('upload_error'));
    return '';
  }catch(err){
    console.error(err); showToast(t('upload_error')); return '';
  }
}

/* Shows a proper "saved" or "error: <detail>" toast based on the actual response,
   instead of blindly claiming success. Returns true/false so callers can branch on it. */
function reportSaveResult(res, successMsg){
  if(res && res.ok){
    showToast(successMsg || t('saved'));
    return true;
  }
  const detail = (res && res.error) ? (' (' + res.error + ')') : '';
  showToast(t('error_generic') + detail);
  return false;
}

/* ---------------- Admin session (shared staff password) ---------------- */
function getAdminToken(){ return sessionStorage.getItem('bd_admin_token') || null; }
function getAdminProfile(){
  const raw = sessionStorage.getItem('bd_admin_profile');
  return raw ? JSON.parse(raw) : null;
}
function setAdminSession(token, profile){
  sessionStorage.setItem('bd_admin_token', token);
  sessionStorage.setItem('bd_admin_profile', JSON.stringify(profile));
}
function clearAdminSession(){
  sessionStorage.removeItem('bd_admin_token');
  sessionStorage.removeItem('bd_admin_profile');
}
function requireAdmin(redirectTo='login.html'){
  if(!getAdminToken()){ window.location.href = redirectTo; }
}
