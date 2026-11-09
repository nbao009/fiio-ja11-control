// Runs only inside the official portal. FiiO restores and owns its session.
(async () => {
    if (window.ja11Account) { await window.ja11Account.refresh(); return; }
    const post = (studioAccount, fields = {}) => chrome.webview.postMessage({studioAccount, ...fields});
    let store;
    for (let attempt = 0; attempt < 150 && !store; attempt++) {
        store = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('userStore');
        if (!store) await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (typeof store?.getUserPeqList !== 'function') { post('error'); return; }

    // A superseded request must never publish another user's rows after logout.
    let revision = 0;
    let identity = store.userId;
    let loginPending = false;
    new MutationObserver(() => {
        if (!loginPending) return;
        const messages = [...document.querySelectorAll('.el-message--error .el-message__content')];
        const message = messages.at(-1)?.textContent?.trim();
        if (message) {
            loginPending = false;
            const kind = /验证码|captcha|verification code|verify code|mã xác minh/i.test(message) ? 'captcha' :
                /password|密码|mật khẩu/i.test(message) ? 'password' :
                /username|user name|account|用户名|账号|账户|tài khoản/i.test(message) ? 'account' : 'credentials';
            post('loginError', {message, kind});
        }
    }).observe(document.body,{subtree:true,childList:true});
    async function refresh() {
        const request = ++revision;
        const owner = store.userId;
        if (!store.isLogged) {
            post(store.getAccessToken ? 'error' : 'signedOut');
            return;
        }
        post('syncing');
        try {
            const rows = await store.getUserPeqList();
            if (revision !== request || store.userId !== owner) return;
            if (!Array.isArray(rows)) throw new Error();
            const presets = rows.filter(isJa11Preset).map(studioPreset);
            post('library', {name:String(store.getUserName || 'Tài khoản FiiO'), presets});
        } catch { if (revision === request && store.userId === owner) post('error'); }
    }

    function studioPreset(row) {
        let bands = row.eqParamsJson;
        if (typeof bands === 'string') {
            try { bands = JSON.parse(bands); } catch { bands = []; }
        }
        return {
            name:String(row.styleName || 'Preset FiiO'), deviceType:row.deviceType, masterGain:row.masterGain,
            bands:Array.isArray(bands) ? bands.filter(Boolean).map(({filterType, frequency, gain, qValue}) =>
                ({filterType, frequency, gain, qValue})) : []
        };
    }

    function isJa11Preset(row) {
        if (Number(row?.deviceType) !== 109) return false;
        const preset = studioPreset(row);
        return Number.isFinite(preset.masterGain) && preset.masterGain >= -12 && preset.masterGain <= 12 &&
            preset.bands.length === 5 && preset.bands.every(b =>
                [0,1,2].includes(b.filterType) && Number.isInteger(b.frequency) &&
                b.frequency >= 20 && b.frequency <= 20000 &&
                Number.isFinite(b.gain) && b.gain >= -12 && b.gain <= 12 &&
                Number.isFinite(b.qValue) && b.qValue >= .1 && b.qValue <= 10);
    }

    // The checked portal release exports the same signed/encrypted client used by
    // Handpick. If the portal changes, open its official page instead of guessing exports.
    async function handpickClient() {
        const entry = document.querySelector('script[type="module"][src]')?.src;
        if (entry !== location.origin + '/static/js/index-hbp1qL_Z.js') throw new Error();
        return import(entry);
    }
    let latestQuery = 0;
    let records = new Map();
    async function handpick({request, query, page}) {
        latestQuery = request;
        try {
            const api = await handpickClient();
            const result = query
                ? await api.bq({searchValue:query, deviceType:109})
                : await api.bp({deviceType:[109], pageNumber:page, pageSize:9, totalRow:-1});
            if (result.code !== 200) throw new Error();
            const list = query ? result.data : result.data.records;
            if (!Array.isArray(list)) throw new Error();
            const total = query ? list.length : result.data.totalRow;
            const pageRows = (query ? list.slice((page-1)*9,page*9) : list).filter(isJa11Preset);
            if (request !== latestQuery) return;
            records = new Map(pageRows.map(row => [String(row.id),row]));
            post('handpick', {request, total, rows:pageRows.map(row => ({
                ...studioPreset(row), id:String(row.id), author:String(row.peqUserName || '')}))});
        } catch { if (request === latestQuery) post('handpick',{request,error:true}); }
    }
    async function saveHandpick({id, request}) {
        const owner = store.userId;
        const row = records.get(id);
        try {
            if (!store.isLogged || !row || latestQuery !== request) throw new Error();
            const api = await handpickClient();
            if (store.userId !== owner) throw new Error();
            const result = await api.bo({userId:owner, peqList:[{
                ...row, customOrNot:false, shareOrNot:false, userId:owner, id:0
            }]});
            if (result.code !== 200 || result.data?.[0]?.successOrNot !== true) throw new Error();
            post('handpickSaved',{id, request, ok:true});
            if (store.userId === owner) await refresh();
        } catch { post('handpickSaved',{id, request, ok:false}); }
    }
    async function saveCustom({request, name, snapshot}) {
        const owner = store.userId;
        try {
            if (!store.isLogged || typeof name !== 'string' || !name.trim() ||
                !Array.isArray(snapshot?.bands) || snapshot.bands.length !== 5) throw new Error();
            const bands = snapshot.bands.map((band, position) => ({
                position, filterType:({PK:0,LSC:1,HSC:2})[band.type],
                frequency:band.freq, gain:band.gain, qValue:band.q
            }));
            if (bands.some(b => b.filterType === undefined || !Number.isInteger(b.frequency) ||
                b.frequency < 20 || b.frequency > 20000 || !Number.isFinite(b.gain) ||
                b.gain < -12 || b.gain > 12 || !Number.isFinite(b.qValue) ||
                b.qValue < 0.1 || b.qValue > 10) || !Number.isFinite(snapshot.masterGain) ||
                snapshot.masterGain < -12 || snapshot.masterGain > 12) throw new Error();
            const result = await store.updatePeqList([{
                styleName:name.trim().slice(0, 80), description:'', userId:owner,
                customOrNot:true, shareOrNot:false, id:-1, deviceType:109,
                masterGain:snapshot.masterGain, eqParamsJson:bands
            }]);
            if (store.userId !== owner || result?.[0]?.successOrNot !== true) throw new Error();
            post('customSaved',{request,ok:true});
            await refresh();
        } catch { post('customSaved',{request,ok:false}); }
    }
    let deviceStore, savingRequest = 0, pendingApply = false;
    const deviceReplies = new Map();
    const deviceToast = document.createElement('div');
    deviceToast.style.cssText = 'position:fixed;z-index:2147483647;top:58px;left:50%;transform:translateX(-50%);max-width:min(92vw,440px);padding:10px 16px;border-radius:10px;background:var(--el-bg-color-overlay,#22282e);color:var(--el-text-color-primary,#fff);box-shadow:0 8px 28px #0005;font:12px sans-serif;display:none;text-align:center';
    document.body.append(deviceToast);
    let deviceToastTimer;
    function showDeviceToast(message) {
        deviceToast.textContent = message;
        deviceToast.style.display = 'block';
        clearTimeout(deviceToastTimer);
        deviceToastTimer = setTimeout(() => deviceToast.style.display = 'none', 3200);
    }
    new MutationObserver(() => {
        if (!deviceStore) return;
        document.querySelectorAll('.el-message, .el-notification, [role="alert"]').forEach(message => {
            if (/Operation failed early:\s*The device is not connected/i.test(message.textContent || '')) message.remove();
        });
    }).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
    function deviceSnapshot() {
        return {masterGain:deviceStore.eqGlobalGain,bands:deviceStore.eqBands.map(b => ({
            type:['PK','LSC','HSC'][b.filterType],freq:b.frequency,gain:b.gain,q:b.qValue
        }))};
    }
    function saveToJa11() {
        const request = ++savingRequest;
        const snapshot = deviceSnapshot();
        return new Promise((resolve,reject) => {
            const timer = setTimeout(() => { deviceReplies.delete(request); reject(new Error('JA11 không phản hồi.')); }, 20000);
            deviceReplies.set(request, result => {
                clearTimeout(timer);
                result.ok ? resolve() : reject(new Error(result.message || 'Không lưu được vào JA11.'));
            });
            post('deviceSave',{request,snapshot});
        });
    }
    function resolveDevice(result) {
        const reply = deviceReplies.get(result.request);
        if (result.outcome?.ok) {
            showDeviceToast(result.outcome.verified ? 'Đã áp dụng thành công. Đã đọc lại DAC để kiểm tra.' :
                'Đã lưu vào JA11. Bấm Đọc lại DAC để kiểm tra.');
        } else showDeviceToast('Không lưu được vào JA11: ' + (result.outcome?.message || 'Hãy thử lại.'));
        if (reply) {deviceReplies.delete(result.request); reply(result.outcome);}
    }
    let portalFilterStarted = false, portalFilterFrame = 0;
    function filterPortalCards() {
        portalFilterFrame = 0;
        for (const card of document.querySelectorAll('.eq-bands-card-item:not(.empty-card)')) {
            let row;
            for (const element of [card, ...card.querySelectorAll('*')].slice(0, 18)) {
                for (let component = element.__vueParentComponent; component; component = component.parent) {
                    if (component.props?.peqBand) { row = component.props.peqBand; break; }
                }
                if (row) break;
            }
            if (row) card.style.display = isJa11Preset(row) ? '' : 'none';
        }
    }
    function startPortalFilter() {
        if (portalFilterStarted) return;
        portalFilterStarted = true;
        new MutationObserver(() => {
            if (!portalFilterFrame) portalFilterFrame = requestAnimationFrame(filterPortalCards);
        }).observe(document.body,{subtree:true,childList:true});
        filterPortalCards();
    }
    function attachDevice(result) {
        if (!result?.ok || !result.state?.bands || result.state.bands.length !== 5) return false;
        deviceStore = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('deviceStore');
        if (!deviceStore) return false;
        const state = result.state;
        deviceStore.productName = 'JadeAudio JA11';
        deviceStore.deviceType = 109;
        deviceStore.eqCount = 5;
        deviceStore.eqGainRange = {min:-12,max:12};
        deviceStore.eqQValueRange = {min:.1,max:10};
        deviceStore.eqSwitch = state.preset === 4 ? 0 : 1;
        deviceStore.eqPre = {label:state.preset === 3 ? 'USER1' :
            ['common.eqOptions.vocal','common.eqOptions.classic','common.eqOptions.bass','','common.eqOptions.closeEq'][state.preset],
            value:state.preset,category:'general'};
        deviceStore.eqGlobalGain = state.masterGain;
        deviceStore.eqBands = state.bands.map((b,position) => ({position,
            filterType:({PK:0,LSC:1,HSC:2})[b.type],frequency:b.freq,gain:b.gain,qValue:b.q}));
        // The official editor checks this flag before enabling its controls.
        deviceStore.adapter = {isConnected:() => true};
        deviceStore.setEqPreByCtrl = async option => {deviceStore.eqPre=option; pendingApply=option.value===3;};
        deviceStore.setEqBandItemByCtrl = async (index,band) => {deviceStore.eqBands[index]={...band,position:index};};
        deviceStore.setEqGlobalGainByCtrl = async gain => {
            deviceStore.eqGlobalGain=gain;
            if (pendingApply) {pendingApply=false; await saveToJa11();}
        };
        deviceStore.setSaveEqToDeviceByCtrl = saveToJa11;
        deviceStore.getEqCountByCtrl = async () => (deviceStore.eqCount=5);
        deviceStore.getEqPreByCtrl = async () => deviceStore.eqPre.value;
        deviceStore.getEqBandsByCtrl = async () => deviceStore.eqBands;
        deviceStore.getEqGlobalGainByCtrl = async () => deviceStore.eqGlobalGain;
        deviceStore.setEqSwitchByCtrl = async value => {deviceStore.eqSwitch=value;};
        startPortalFilter();
        return true;
    }
    store.$subscribe(() => {
        if (store.userId === identity) return;
        identity = store.userId;
        refresh();
    }, {detached:true});
    let captchaRequest = null;
    window.ja11Account = {
        refresh, handpick, saveHandpick, saveCustom, attachDevice, resolveDevice,
        getLoginCaptcha(refresh = false) {
            if (captchaRequest) return captchaRequest;
            captchaRequest = this.readLoginCaptcha(refresh).finally(() => { captchaRequest = null; });
            return captchaRequest;
        },
        async readLoginCaptcha(refresh) {
            this.login();
            let previousCaptchaUrl = null;
            for(let i=0;i<60;i++) {
                const dialog=document.querySelector('.el-dialog:has(img.pic-captcha)');
                const passwordRadio=[...document.querySelectorAll('.el-dialog .el-radio')].find(el=>el.textContent?.includes('Password')||el.textContent?.includes('密码'));
                passwordRadio?.click();
                const img=dialog?.querySelector('img.pic-captcha');
                if (img?.src && refresh) {
                    refresh = false;
                    previousCaptchaUrl = img.src;
                    img.click();
                    await new Promise(resolve=>setTimeout(resolve,150));
                    continue;
                }
                if (previousCaptchaUrl && img?.src === previousCaptchaUrl) {
                    await new Promise(resolve=>setTimeout(resolve,150));
                    continue;
                }
                if(img?.src && img.complete && img.naturalWidth > 0 && dialog?.querySelector('input[type="password"]')) {
                    try {
                        const sourceUrl = img.src;
                        const blob=await (await fetch(sourceUrl)).blob();
                        if (blob.size < 500 || img.src !== sourceUrl) { await new Promise(resolve=>setTimeout(resolve,150)); continue; }
                        const captcha=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob)});
                        post('loginCaptcha',{captcha});
                        return true;
                    } catch { post('loginCaptcha',{error:'Không đọc được ảnh CAPTCHA từ FiiO.'}); return false; }
                }
                await new Promise(resolve=>setTimeout(resolve,150));
            }
            const images=[...document.querySelectorAll('img')].filter(el=>/captcha/i.test(el.className+' '+el.alt));
            post('loginCaptcha',{error:`FiiO: avatar=${!!document.querySelector('.el-avatar')}, dialog=${document.querySelectorAll('.el-dialog').length}, captcha=${images.length}, password=${!!document.querySelector('input[type="password"]')}, logged=${!!store.isLogged}`});
            return false;
        },
        async submitLogin({username,password,captcha}) {
            const dialog=document.querySelector('.el-dialog:has(img.pic-captcha)');
            if(!dialog) return {ok:false,message:'Form FiiO chưa sẵn sàng.'};
            const inputs=[...dialog.querySelectorAll('.el-form-item input:not([type="radio"]):not([type="checkbox"])')];
            const passwordInput=dialog.querySelector('input[type="password"]');
            const textInputs=inputs.filter(el=>el.type==='text');
            if(!passwordInput||textInputs.length<2) return {ok:false,message:'FiiO đã thay đổi form đăng nhập.'};
            const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
            for(const [input,value] of [[textInputs[0],username],[textInputs[1],captcha],[passwordInput,password]]) {
                setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
            }
            const consent=dialog.querySelector('.user-agreement-checked');
            if(consent && !consent.classList.contains('is-checked')) consent.click();
            const submit=dialog.querySelector('.el-dialog__footer button');
            if(!submit) return {ok:false,message:'Không tìm thấy nút đăng nhập FiiO.'};
            loginPending = true;
            submit.click();
            return {ok:true,message:'Đang xác minh với FiiO…'};
        },
        login() {
            if (store.isLogged) { refresh(); return; }
            if (!document.querySelector('.loginDialog .el-overlay:not([style*="display: none"])'))
                document.querySelector('.el-avatar')?.click();
        },
        logout() { store.clearUserInfo(); }
    };
    await refresh();
})();
