function makeButton(label, click) {
    const b = document.createElement('button');
    b.className = 'button';
    b.textContent = label;
    b.onclick = click;
    return b;
}
function showPersonal(local = false) {
    const sub = $('#subpage');
    sub.innerHTML = '<div class="subhead"><h2>Personal</h2><div class="subtools"></div></div><div class="subtabs"><button data-mode="shared">Tài khoản FiiO</button><button data-mode="mine">Trên máy</button></div><div class="subcards" id="sectionCards"></div>';
    sub.querySelector('[data-mode="shared"]').onclick = () => showPersonal();
    sub.querySelector('[data-mode="mine"]').onclick = () => showPersonal(true);
    if (!local) { showAccountLibrary(); return; }
    sub.querySelector('[data-mode="mine"]').classList.add('active');
    sub.querySelector('.subtools').append(makeButton('Nhập EQ', () => $('#file').click()),
        makeButton('Lưu preset hiện tại', () => $('#saveLocal').click()),
        makeButton('Quản lý preset', () => send('local-presets-open')));
    const presets = JSON.parse(localStorage.getItem('ja11-local-presets') || '[]');
    const cards = $('#sectionCards');
    if (!presets.length) cards.textContent = 'Chưa có preset trên máy.';
    presets.forEach((p,i) => {
        const card = document.createElement('article');
        card.className = 'subcard';
        const name = document.createElement('h3');
        name.setAttribute('translate','no'); name.textContent = p.name;
        const actions = document.createElement('div');
        actions.className = 'local-preset-actions';
        actions.append(makeButton('Mở trong EQ', () => openDraft(p, p.name)),
            makeButton('Xóa', () => {
                presets.splice(i,1);
                persistLocalPresets(JSON.stringify(presets));
                renderLocal(); showPersonal(true);
            }));
        card.append(name, actions);
        cards.append(card);
    });
}
function openDraft(snapshot, name) {
    checkpoint(); loadSnapshot(snapshot); setActive('User 1');
    $('#dirty').textContent = name + ' · bản nháp';
    showStudioSection('home');
}
function showStudioSection(name) {
    document.querySelectorAll('.eqnav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $('.workspace').hidden = name !== 'home';
    $('#subpage').hidden = name === 'home';
    if (name === 'personal') showPersonal();
    if (name === 'handpick') showHandpick();
    if (name === 'about') showAbout();
    const content = name === 'home' ? $('.workspace') : $('#subpage');
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
        content.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'ease-out'});

}
document.querySelectorAll('.eqnav [data-view]').forEach(b => b.onclick = () => showStudioSection(b.dataset.view));

let handRequest = 0, handPage = 1, handQuery = '', handTimer;
const pendingSaves = new Map();
function showHandpick() {
    $('#subpage').innerHTML = '<div class="subhead"><h2>Handpick · JA11</h2><form class="subtools" id="handForm"><input class="search" id="handQuery" aria-label="Tìm Handpick" placeholder="Tìm preset hoặc mã chia sẻ"><button class="button">Tìm</button></form></div><div class="subcards" id="handResults" aria-live="polite"></div><div class="hand-footer"><button class="button ghost" id="handOfficial">Mở Handpick chính thức ↗</button><div id="handPages"></div></div>';
    $('#handQuery').value = handQuery;
    $('#handOfficial').onclick = () => send('open-handpick');
    $('#handForm').onsubmit = event => {
        event.preventDefault(); handQuery = $('#handQuery').value.trim(); fetchHandpick(1);
    };
    fetchHandpick(handPage);
}
function fetchHandpick(page) {
    handPage = page;
    $('#handResults').textContent = 'Đang tải Handpick…';
    $('#handPages').replaceChildren();
    const request = ++handRequest;
    clearTimeout(handTimer);
    handTimer = setTimeout(() => receiveHandpick({action:'handpick',request,error:true}), 30000);
    send('handpick-list',{request, query:handQuery, page});
}
function receiveHandpick(m) {
    if (m.action === 'handpickSaved') {
        const key = m.request + ':' + m.id;
        const button = pendingSaves.get(key);
        if (!button) return;
        pendingSaves.delete(key);
        button.disabled = !!m.ok;
        button.textContent = m.ok ? 'Đã lưu vào tài khoản' : 'Thử lưu lại';
        toast(m.ok ? 'Đã lưu vào tài khoản FiiO' : 'FiiO chưa xác nhận đã lưu.');
        return;
    }
    const cards = $('#handResults');
    if (m.request !== handRequest || !cards) return;
    clearTimeout(handTimer); cards.replaceChildren();
    if (m.error) {
        cards.append('Không tải được Handpick từ FiiO. ', makeButton('Thử lại', () => fetchHandpick(handPage)));
        return;
    }
    if (!m.rows.length) cards.textContent = handQuery ? 'Không tìm thấy preset phù hợp.' : 'FiiO chưa có preset cho JA11 ở trang này.';
    for (const row of m.rows) {
        const snapshot = fiioSnapshot(row);
        if (!snapshot) continue;
        const card = document.createElement('article');
        card.className = 'subcard';
        const name = document.createElement('h3'), author = document.createElement('p');
        name.setAttribute('translate','no'); name.textContent = row.name;
        author.textContent = [row.author,'5 band'].filter(Boolean).join(' · ');
        const actions = document.createElement('div'); actions.className = 'hand-actions';
        actions.append(makeButton('Mở trong EQ', () => openDraft(snapshot,row.name)));
        const save = makeButton('Lưu vào tài khoản', () => {
            if (accountState !== 'ready') { openFiioLogin(); return; }
            save.disabled = true; save.textContent = 'Đang lưu…';
            const key = m.request + ':' + row.id;
            pendingSaves.set(key, save);
            setTimeout(() => {
                if (!pendingSaves.delete(key)) return;
                save.textContent = 'Kiểm tra trong Personal';
                toast('Chưa nhận được xác nhận từ FiiO. Mở Personal và đồng bộ để kiểm tra.');
            }, 30000);
            send('handpick-save',{request:m.request,id:row.id});
        });
        actions.append(save); card.append(name,author,actions); cards.append(card);
    }
    const pages = Math.max(1, Math.ceil(m.total / 9));
    const prev = makeButton('‹ Trước', () => fetchHandpick(handPage-1));
    const next = makeButton('Sau ›', () => fetchHandpick(handPage+1));
    prev.disabled = handPage <= 1; next.disabled = handPage >= pages;
    $('#handPages').replaceChildren(prev,'  '+handPage+' / '+pages+'  ', next);
}


function showAbout() {
    const sub = $('#subpage');
    sub.innerHTML = '<div class="subhead"><h2>About · JA11 Control</h2></div><h3>Thiết bị</h3><dl class="about-data"></dl><div class="about-credit"><span class="about-credit-label">Phát triển bởi</span><p id="developerCredit" translate="no"></p><div class="about-social" aria-label="Mạng xã hội"><button type="button" data-social="facebook" disabled title="Facebook · Sắp có liên kết" aria-label="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 21v-8h3l.5-4H14V7c0-1.1.3-2 2-2h1.7V1.4C17.4 1.1 16.4 1 15 1c-3 0-5 1.8-5 5v3H7v4h3v8z"/></svg></button><button type="button" data-social="tiktok" disabled title="TikTok · Sắp có liên kết" aria-label="TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 2c.2 2.5 1.5 4 4 4.2V10a8 8 0 0 1-4-1.1v6.8a6 6 0 1 1-6-6h.7v3.8H9a2.2 2.2 0 1 0 2.2 2.2V2z"/></svg></button><button type="button" data-social="github" disabled title="GitHub · Sắp có liên kết" aria-label="GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 1 .1 1.7.7 2.9.5.1-.7.4-1.2.7-1.5-2.2-.3-4.5-1.1-4.5-5a4 4 0 0 1 1-2.7 3.7 3.7 0 0 1 .1-2.7s.8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.2.4 2.2.1 2.7a4 4 0 0 1 1 2.7c0 3.9-2.3 4.7-4.5 5 .4.4.8 1 .8 2.1V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/></svg></button></div></div>';
    const data = [
        ['DAC', 'FiiO / JadeAudio JA11'],
        ['Trạng thái', $('#status').textContent],
        ['Firmware', deviceState.firmware || '—'],
        ['USB Audio', deviceState.uac === undefined ? '—' : deviceState.uac === 0 ? '1.0' : '2.0'],
        ['Sample rate', $('#rateChip').textContent.replace('Sample rate ', '')],
        ['Preset', $('#presetChip').textContent.replace('Preset ', '')],
        ['Mic in line', deviceState.mic === undefined ? '—' : deviceState.mic ? 'Bật' : 'Tắt'],
        ['Global gain', deviceState.masterGain === undefined ? '—' : deviceState.masterGain + ' dB'],
        ['PEQ', deviceState.bands ? deviceState.bands.length + ' band' : '—']
    ];
    for (const [key,value] of data) {
        const term = document.createElement('dt'), detail = document.createElement('dd');
        term.textContent = key; detail.textContent = value;
        sub.querySelector('dl').append(term,detail);
    }
    $('#developerCredit').textContent = 'Nbao';
    const socialLinks = {facebook:'https://www.facebook.com/bao0808', tiktok:'https://www.tiktok.com/@_baoisme', github:'https://github.com/nbao009'};
    sub.querySelectorAll('[data-social]').forEach(button => {
        const url = socialLinks[button.dataset.social];
        if (!url) return;
        button.disabled = false;
        button.removeAttribute('title');
        button.onclick = () => send('open-social', button.dataset.social);
    });
}


function syncUacMenu() {
    const select = $('#uac'), button = $('#uacButton');
    button.disabled = select.disabled;
    button.textContent = (select.selectedIndex < 0 ? '—' : select.value) + ' ▾';
    document.querySelectorAll('[data-uac]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.uac === select.value)));
    if(select.disabled) closeUacMenu();
}
function closeUacMenu() {
    $('#uacOptions').hidden = true;
    $('#uacButton').setAttribute('aria-expanded','false');
}
$('#uacButton').onclick = () => {
    const open = $('#uacOptions').hidden;
    $('#uacOptions').hidden = !open;
    $('#uacButton').setAttribute('aria-expanded',String(open));
    if(open) $('#uacOptions button').focus();
};
document.querySelectorAll('[data-uac]').forEach(button => button.onclick = () => {
    const select = $('#uac');
    if(select.disabled) return;
    closeUacMenu(); $('#uacButton').focus();
    if(select.value === button.dataset.uac) return;
    select.value = button.dataset.uac;
    select.dispatchEvent(new Event('change'));
    syncUacMenu();
});
document.addEventListener('click',event => { if(!event.target.closest('.uac-picker')) closeUacMenu(); });
$('#uacOptions').onkeydown = event => {
    if(event.key === 'Escape') {closeUacMenu();$('#uacButton').focus();}
    if(event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = [...document.querySelectorAll('[data-uac]')];
        buttons[(buttons.indexOf(document.activeElement)+1)%buttons.length].focus();
    }
};
new MutationObserver(syncUacMenu).observe($('#uac'),{attributes:true,attributeFilter:['disabled']});
syncUacMenu();

if (window.chrome?.webview) send('local-presets-load');

window.addEventListener('focus', () => {
    if (!window.chrome?.webview || $('#subpage').hidden || !$('#subpage [data-mode="mine"].active')) return;
    send('local-presets-load');
});
