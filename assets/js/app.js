/* พิทักษ์รักรังสิต - shared layout + renderers */

function renderHeader(active, basePath=''){
  const admin = getAdminProfile();
  const links = [
    { key:'home', href: basePath+'index.html', label:'nav_home' },
    { key:'timeline', href: basePath+'timeline.html', label:'nav_timeline' },
    { key:'shopping', href: basePath+'shopping.html', label:'nav_shopping' },
  ];
  if(admin){
    links.push({ key:'stock', href: basePath+'stock.html', label:'nav_stock' });
    links.push({ key:'finance', href: basePath+'finance.html', label:'nav_finance' });
  }
  const linkHtml = links.map(l => `<a href="${l.href}" class="${active===l.key?'active':''}" data-i18n="${l.label}"></a>`).join('');
  const loginItem = admin
    ? `<button class="menu-item menu-login" id="menu-logout" data-i18n="nav_logout"></button>`
    : `<a class="menu-login" href="${basePath}login.html" data-i18n="nav_login"></a>`;

  document.getElementById('site-header').innerHTML = `
  <div class="header-row">
    <a class="brand" href="${basePath}index.html">
      <svg class="brand-mark" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="8" width="10" height="26" rx="2" fill="#34456E"/>
        <rect x="17" y="6" width="10" height="28" rx="2" fill="#D6567F"/>
        <rect x="28" y="10" width="8" height="24" rx="2" fill="#7C90B3"/>
      </svg>
      <span class="brand-name" data-i18n="site_name"></span>
    </a>
    <div class="nav-right">
      <div class="lang-toggle">
        <button data-lang="th" onclick="setLang('th')">TH</button>
        <button data-lang="en" onclick="setLang('en')">EN</button>
      </div>
      <button class="menu-btn" id="menu-toggle" aria-label="Menu"><span></span><span></span><span></span></button>
      <nav class="menu-panel" id="menu-panel">
        ${linkHtml}
        <hr class="menu-divider">
        ${loginItem}
      </nav>
    </div>
  </div>`;

  const btn = document.getElementById('menu-toggle');
  const panel = document.getElementById('menu-panel');
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); panel.classList.toggle('open'); });
  document.addEventListener('click', (e)=>{ if(!panel.contains(e.target) && e.target!==btn) panel.classList.remove('open'); });

  const logoutBtn = document.getElementById('menu-logout');
  if(logoutBtn){
    logoutBtn.addEventListener('click', async ()=>{
      await apiPost('logout', {});
      clearAdminSession();
      window.location.href = basePath + 'index.html';
    });
  }
}

function renderFooter(){
  const el = document.getElementById('site-footer');
  if(el) el.innerHTML = `<div class="wrap">© ${new Date().getFullYear()} ชุมนุมพิทักษ์รักรังสิต · ร.ร.สวนกุหลาบวิทยาลัย รังสิต</div>`;
}

/* ---------------- Small shared helpers ---------------- */
function confirmDelete(){
  return window.confirm(t('confirm_delete'));
}
const SPINE_COLORS = ['#34456E','#D6567F','#7C90B3','#3E8577','#212D4A'];
function renderShelf(containerId, entries, opts={}){
  const el = document.getElementById(containerId);
  if(!entries || entries.length === 0){
    el.innerHTML = `<div class="empty-state" data-i18n="empty_timeline"></div>`;
    applyLang();
    return;
  }
  el.innerHTML = `<div class="shelf">${entries.map((e,i)=>{
    const done = String(e.status).toLowerCase() === 'done';
    const color = SPINE_COLORS[i % SPINE_COLORS.length];
    const stampLabel = done ? t('status_done') : t('status_pending');
    return `
    <div class="spine-row">
      <div class="spine" style="background:${color}"></div>
      <div class="spine-body" data-batch="${e.id}">
        <div class="spine-meta" style="display:flex; align-items:center; gap:12px;">
          ${e.photo ? `<img class="spine-thumb" src="${e.photo}">` : ''}
          <div>
            <div class="date">${e.date || ''}</div>
            <div class="desc">${e.summary || ''}</div>
          </div>
        </div>
        <div class="stamp ${done?'done':'pending'}">${stampLabel}</div>
      </div>
    </div>
    <div class="batch-items" id="batch-${e.id}"></div>`;
  }).join('')}</div>`;

  if(opts.expandable){
    el.querySelectorAll('.spine-body').forEach(row=>{
      row.addEventListener('click', async ()=>{
        const id = row.dataset.batch;
        const panel = document.getElementById('batch-'+id);
        const wasOpen = panel.classList.contains('open');
        el.querySelectorAll('.batch-items').forEach(p=>p.classList.remove('open'));
        if(wasOpen) return;
        panel.classList.add('open');
        panel.innerHTML = `<div class="empty-state">...</div>`;
        const res = await apiGet('getTimelineItems', { timelineId: id });
        const items = (res && res.data) || [];
        if(items.length === 0){
          panel.innerHTML = `<div class="empty-state" data-i18n="empty_batch_items"></div>`;
        } else {
          panel.innerHTML = items.map(it => `
            <div class="batch-item-row">
              <span>${it.title || ''}</span>
              <span class="outcome">${it.outcome === 'sold' ? t('outcome_sold') : t('outcome_donated')} ${it.destinationOrAmount || ''}</span>
            </div>`).join('');
        }
        applyLang();
      });
    });
  }
  applyLang();
}

/* ---------------- Shopping grid ---------------- */
function renderShopGrid(containerId, items, onOrder){
  const el = document.getElementById(containerId);
  if(!items || items.length === 0){
    el.innerHTML = `<div class="empty-state" data-i18n="empty_shopping"></div>`;
    applyLang();
    return;
  }
  el.innerHTML = `<div class="grid">${items.map(it=>{
    const remaining = Number(it.quantity||0) - Number(it.soldCount||0) - Number(it.reservedCount||0);
    const soldOut = remaining <= 0;
    return `
    <div class="book-card">
      <div class="thumb ${it.photo ? '' : 'empty'}">
        ${it.photo ? `<img src="${it.photo}" alt="${it.title||''}">` : 'no photo'}
      </div>
      <div class="info">
        <div class="title">${it.title || it.category || ''}</div>
        <div class="price">฿${it.price || 0}</div>
        ${soldOut
          ? `<span class="sold" data-i18n="sold_out"></span>`
          : `<span class="qty-badge">${t('left_count',{n:remaining})}</span><button class="btn btn-primary btn-sm" data-id="${it.id}">${t('order_btn')}</button>`}
      </div>
    </div>`;
  }).join('')}</div>`;
  if(onOrder){
    el.querySelectorAll('button[data-id]').forEach(b=>{
      b.addEventListener('click', ()=> onOrder(b.dataset.id));
    });
  }
  applyLang();
}
