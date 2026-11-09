let accountRows = null;
let accountState = 'starting';
let accountName = '';
let accountMessage = 'Đang kiểm tra phiên FiiO…';

let signedOutTimer;
function updateFiioAccount(update) {
    if (update.state === 'syncing' && accountState === 'ready') return;
    if (update.state === 'signedOut' && loginDialog?.open && !update.delayed) {
        clearTimeout(signedOutTimer);
        signedOutTimer = setTimeout(() => {
            if (loginDialog.open && accountState !== 'ready') updateFiioAccount({...update, delayed:true});
        }, 2000);
        return;
    }
    clearTimeout(signedOutTimer);
    const ready = update.action === 'fiio-presets';
    accountRows = ready ? update.presets : null;
    accountName = ready ? update.name : '';
    accountState = ready ? 'ready' : update.state;
    accountMessage = ready ? accountRows.length + ' preset trong thư viện FiiO' : update.message;
    if (ready && typeof loginDialog !== 'undefined' && loginDialog.open) { clearTimeout(loginErrorTimer); $('#fiioPassword').value = ''; loginDialog.close(); }
    const button = $('#fiioAccount');
    button.classList.toggle('signed-in', ready);
    button.querySelector('span').setAttribute('translate', ready ? 'no' : 'yes');
    button.querySelector('span').textContent = ready ? accountName :
        accountState === 'syncing' ? 'Đang đồng bộ…' : 'Đăng nhập FiiO';
    button.title = accountMessage;
    if (accountState !== 'ready' && accountState !== 'syncing') closeAccountMenu();
    if (!$('#subpage').hidden && $('#subpage [data-mode="shared"].active')) showAccountLibrary();
}

const accountButton = $('#fiioAccount');
const accountWrap = document.createElement('div');
accountWrap.className = 'account-menu-wrap';
accountButton.before(accountWrap);
accountWrap.append(accountButton);
const accountMenu = document.createElement('div');
accountMenu.className = 'account-menu';
accountMenu.id = 'accountMenu';
accountMenu.hidden = true;
const logoutButton = document.createElement('button');
logoutButton.type = 'button';
logoutButton.textContent = 'Đăng xuất';
logoutButton.onclick = () => { closeAccountMenu(); send('fiio-logout'); };
accountMenu.append(logoutButton);
accountWrap.append(accountMenu);
accountButton.setAttribute('aria-expanded', 'false');
accountButton.setAttribute('aria-controls', 'accountMenu');
function closeAccountMenu() {
    accountMenu.hidden = true;
    accountButton.setAttribute('aria-expanded', 'false');
}
document.addEventListener('pointerdown', e => {
    if (!accountWrap.contains(e.target)) closeAccountMenu();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !accountMenu.hidden) { closeAccountMenu(); accountButton.focus(); }
});
accountButton.onclick = () => {
    if (accountState === 'ready' || accountState === 'syncing') {
        accountMenu.hidden = !accountMenu.hidden;
        accountButton.setAttribute('aria-expanded', String(!accountMenu.hidden));
        if (!accountMenu.hidden) logoutButton.focus();
    } else openFiioLogin();
};
if (window.chrome?.webview) send('fiio-start');


function fiioSnapshot(row) {
    const valid = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
    if (Number(row.deviceType) !== 109 || !valid(row.masterGain, -12, 12) || row.bands.length !== 5) return null;
    const bands = [];
    for (const band of row.bands) {
        if (![0, 1, 2].includes(band.filterType) ||
            !Number.isInteger(band.frequency) || !valid(band.frequency, 20, 20000) ||
            !valid(band.gain, -12, 12) || !valid(band.qValue, 0.1, 10)) return null;
        bands.push({type:['PK','LSC','HSC'][band.filterType], freq:band.frequency, gain:band.gain, q:band.qValue});
    }
    return {masterGain:row.masterGain, bands};
}

function showAccountLibrary() {
    const cards = $('#sectionCards');
    cards.replaceChildren();
    document.querySelectorAll('#subpage [data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === 'shared'));
    const controls = document.createElement('div');
    controls.className = 'account-library-bar';
    const summary = document.createElement('small');
    summary.textContent = accountMessage;
    controls.append(summary);
    function addAction(label, command) {
        const button = document.createElement('button');
        button.className = 'button';
        button.textContent = label;
        button.onclick = () => command === 'fiio-account' ? openFiioLogin() : send(command);
        controls.append(button);
    }
    if (accountState === 'ready') addAction('Quản lý EQ tài khoản ↗', 'fiio-manage');
    if (accountState === 'ready' || accountState === 'error') addAction('Đồng bộ lại', 'fiio-refresh');
    if (accountState === 'signedOut' || accountState === 'error' || accountState === 'starting')
        addAction('Đăng nhập FiiO', 'fiio-account');
    cards.append(controls);
    if (accountRows === null) return;
    if (!accountRows.length) {
        const notice = document.createElement('p');
        notice.textContent = 'Chưa có preset phù hợp với JA11 trong tài khoản.';
        cards.append(notice);
    }
    for (const row of accountRows) {
        const snapshot = fiioSnapshot(row);
        if (!snapshot) continue;
        const card = document.createElement('article');
        card.className = 'subcard';
        const title = document.createElement('h3');
        title.setAttribute('translate','no'); title.textContent = row.name;
        const note = document.createElement('p');
        note.textContent = '5 band · ' + snapshot.masterGain + ' dB';
        card.append(title, note);
        if (snapshot) {
            const open = document.createElement('button');
            open.className = 'button';
            open.textContent = 'Mở trong EQ';
            open.onclick = () => {
                checkpoint();
                loadSnapshot(snapshot);
                setActive('User 1');
                $('#dirty').textContent = row.name + ' · bản nháp từ FiiO';
                window.showStudioSection('home');
            };
            card.append(open);
        }
        cards.append(card);
    }
}

const loginDialog = document.createElement('dialog');
loginDialog.id = 'fiioLogin';
loginDialog.innerHTML = `<form id="fiioLoginForm"><div class="login-head"><div><small>FIIO ACCOUNT</small><h2>Đăng nhập FiiO</h2></div><button class="button ghost" type="button" id="closeFiioLogin" aria-label="Đóng">×</button></div><label>Tên người dùng<input id="fiioUser" autocomplete="username" required placeholder="Nhập tên người dùng"></label><label>Mật khẩu<input id="fiioPassword" type="password" autocomplete="current-password" required></label><label>Mã xác minh<div class="captcha-row"><input id="fiioCaptcha" required maxlength="32" autocomplete="off" aria-label="Mã xác minh"><span class="captcha-image is-loading"><span class="captcha-dots" aria-hidden="true"><i></i><i></i><i></i></span><img id="fiioCaptchaImage" alt="Ảnh xác minh FiiO" hidden></span><button type="button" class="button ghost" id="reloadFiioCaptcha" title="Lấy ảnh mới" aria-label="Lấy ảnh mới">↻</button></div></label><button class="button primary" id="submitFiioLogin" type="submit">Đăng nhập</button><p id="fiioLoginStatus" class="login-note" role="status"></p><p class="login-register">Bạn chưa có tài khoản? <button type="button" id="fiioRegister">Đăng ký trên web ↗</button></p><p class="login-register"><button type="button" id="fiioForgotPassword">Quên mật khẩu? ↗</button></p></form>`;
document.body.append(loginDialog);
let captchaRetryTimer, captchaStartTimer;
function setCaptchaLoading() {
    const image = $('#fiioCaptchaImage');
    image.hidden = true;
    image.removeAttribute('src');
    image.parentElement.classList.add('is-loading');
}
function openFiioLogin() {
    if (!loginDialog.open) loginDialog.showModal();
    loginFailureMessage = '';
    $('#fiioLoginStatus').textContent = 'Đang lấy mã xác minh…';
    setCaptchaLoading();
    clearTimeout(captchaStartTimer);
    captchaStartTimer = setTimeout(() => { if (loginDialog.open) requestFiioCaptcha(false); }, 750);
    $('#fiioUser').focus();
}
function requestFiioCaptcha(refresh) {
    clearTimeout(captchaRetryTimer);
    send(refresh ? 'fiio-login-refresh' : 'fiio-login-start');
    captchaRetryTimer = setTimeout(() => {
        if (!loginDialog.open || !$('#fiioCaptchaImage').hidden) return;
        requestFiioCaptcha(false);
    }, 3000);
}
let loginErrorTimer, loginFailureMessage = '';
function receiveFiioLogin(result) {
    if (!loginDialog.open) return;
    if (result.loginFailed) {
        const kind = result.kind || 'credentials';
        loginFailureMessage = kind === 'captcha' ? 'Mã xác minh không đúng.' :
            kind === 'password' || kind === 'account' || kind === 'credentials' ?
                'Tên người dùng hoặc mật khẩu không đúng.' :
                (result.message || 'Đăng nhập FiiO thất bại.');
        $('#fiioUser').classList.toggle('login-invalid', kind !== 'captcha');
        $('#fiioPassword').classList.toggle('login-invalid', kind !== 'captcha');
        $('#fiioCaptcha').classList.toggle('login-invalid', kind === 'captcha');
        $('#fiioLoginStatus').textContent = loginFailureMessage;
        $('#fiioCaptcha').value = '';
        setCaptchaLoading();
        requestFiioCaptcha(true);
    } else if (result.message && !(result.ok && result.message === 'Đang xác minh với FiiO…')) {
        clearTimeout(loginErrorTimer);
        loginErrorTimer = setTimeout(() => {
            if (loginDialog.open && accountState !== 'ready' && !$('#fiioCaptchaImage').hidden) $('#fiioLoginStatus').textContent = result.message;
        }, result.ok ? 0 : 2000);
    }
    if (result.captcha && /^data:image\/(bmp|png|jpeg|webp|gif);base64,/.test(result.captcha)) {
        clearTimeout(captchaRetryTimer);
        clearTimeout(loginErrorTimer);
        const image = $('#fiioCaptchaImage');
        image.onload = () => {
            image.hidden = false;
            image.parentElement.classList.remove('is-loading');
            $('#fiioLoginStatus').textContent = loginFailureMessage;
        };
        image.onerror = () => {
            setCaptchaLoading();
            requestFiioCaptcha(false);
        };
        image.src = result.captcha;
    }
    if (!result.ok) $('#fiioCaptcha').value = '';
    $('#submitFiioLogin').disabled = false;
}
$('#fiioRegister').onclick = () => send('fiio-register');
$('#fiioForgotPassword').onclick = () => send('fiio-forgot-password');
$('#closeFiioLogin').onclick = () => { clearTimeout(loginErrorTimer); clearTimeout(captchaRetryTimer); clearTimeout(captchaStartTimer); loginDialog.close(); };
$('#reloadFiioCaptcha').onclick = () => { $('#fiioLoginStatus').textContent = 'Đang lấy mã xác minh…'; setCaptchaLoading(); clearTimeout(captchaStartTimer); requestFiioCaptcha(true); };
$('#fiioLoginForm').onsubmit = event => {
    event.preventDefault();
    $('#submitFiioLogin').disabled = true;
    loginFailureMessage = '';
    document.querySelectorAll('#fiioLogin input').forEach(input => input.classList.remove('login-invalid'));
    $('#fiioLoginStatus').textContent = 'Đang xác minh…';
    send('fiio-login-submit', {username:$('#fiioUser').value.trim(),password:$('#fiioPassword').value,captcha:$('#fiioCaptcha').value.trim()});
};

let customSaveRequest = 0;
const saveLocalClick = $('#saveLocal').onclick;
const confirmPresetClick = $('#confirmModal').onclick;
$('#saveLocal').onclick = () => {
    $('#modal').dataset.destination = 'local';
    $('#modal h3').textContent = 'Lưu preset cục bộ';
    $('#confirmModal').textContent = 'Lưu preset';
    saveLocalClick();
};
$('#saveFiio').onclick = () => {
    if (accountState !== 'ready') { openFiioLogin(); return; }
    $('#modal').dataset.destination = 'fiio';
    $('#modal h3').textContent = 'Lưu EQ lên tài khoản FiiO';
    $('#confirmModal').textContent = 'Lưu lên FiiO';
    $('#modal').classList.add('show');
    $('#presetName').focus();
};
$('#confirmModal').onclick = () => {
    if ($('#modal').dataset.destination !== 'fiio') { confirmPresetClick(); return; }
    const name = $('#presetName').value.trim();
    if (!name) return;
    $('#confirmModal').disabled = true;
    send('fiio-save-custom', {request:++customSaveRequest, name,
        snapshot:JSON.parse(JSON.stringify(model))});
};
function receiveCustomSaved(result) {
    if (result.request !== customSaveRequest) return;
    $('#confirmModal').disabled = false;
    if (result.ok) {
        $('#modal').classList.remove('show');
        $('#presetName').value = '';
        toast('Đã lưu EQ lên tài khoản FiiO');
    } else toast('FiiO chưa xác nhận đã lưu EQ. Thử lại nhé.');
}
