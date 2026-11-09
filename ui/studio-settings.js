const themeRoot = document.documentElement;
const defaultSettings = {theme:'dark',language:'vi',accent:'#ff526b',curve:'#ff526b',background:'',
    wallpaper:'',dim:65,blur:0,zoom:100,developer:'Nbao',x:50,y:50};
let studioSettings = {...defaultSettings}, settingsReady = false, settingsTimer, colorTarget = 'accent';
const wallpaperLayer = document.createElement('div');
wallpaperLayer.id = 'studioWallpaper';
document.body.prepend(wallpaperLayer);
function setTheme(theme) { studioSettings.theme = theme; applySettings(); queueSettings(); }
function applySettings() {
    const s = studioSettings, root = themeRoot.style;
    themeRoot.dataset.theme = s.theme;
    themeRoot.lang = s.language;
    $('#languageButton').textContent = s.language === 'vi' ? 'Tiếng Việt ▾' : 'English ▾';
    wallpaperLayer.style.backgroundPosition = s.x+'% '+s.y+'%';
    root.setProperty('--accent',s.accent); root.setProperty('--lime',s.accent);
    root.setProperty('--action-bg',s.accent); root.setProperty('--red',s.accent);
    const rgb = s.accent.match(/\w\w/g).map(x => parseInt(x,16));
    const linear = rgb.map(value => { const channel=value/255; return channel<=.04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4; });
    const luminance = linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
    const darkText = luminance > .179;
    root.setProperty('--action-text',darkText ? '#162015' : '#ffffff');
    root.setProperty('--handle-text',darkText ? '#121816' : '#ffffff');
    root.setProperty('--handle-text-edge',darkText ? 'rgb(255 255 255 / 40%)' : 'rgb(0 0 0 / 38%)');
    const panelLuminance = s.theme === 'light' ? 1 : .012;
    const contrast = (Math.max(luminance,panelLuminance)+.05)/(Math.min(luminance,panelLuminance)+.05);
    root.setProperty('--accent-label',contrast < 4.5 ? (s.theme === 'light' ? '#202820' : '#eef1f2') : s.accent);
    root.setProperty('--tint','color-mix(in srgb, '+s.accent+' 15%, var(--panel))');
    if (s.background) root.removeProperty('--bg'); else root.removeProperty('--bg');
    wallpaperLayer.style.backgroundImage = s.wallpaper ? 'url("'+s.wallpaper+'")' : '';
    wallpaperLayer.style.opacity = 1-s.dim/100;
    wallpaperLayer.style.filter = 'blur('+s.blur+'px)';
    wallpaperLayer.style.transform = 'scale('+s.zoom/100+')';
    $('#wallpaperPreview').style.backgroundImage = wallpaperLayer.style.backgroundImage;
    $('#language').value = s.language;
    $('#developerName').value = s.developer;
    $('#toggleTheme').innerHTML = s.theme === 'dark'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>';
    $('#toggleTheme').title = s.language === 'vi' ? 'Đổi giao diện sáng / tối' : 'Switch light / dark theme';
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.themeChoice === s.theme)));
    for (const [id,key] of [['wallDim','dim'],['wallBlur','blur'],['wallZoom','zoom'],['wallX','x'],['wallY','y']]) {
        $('#'+id).value = s[key];
        const field = $('#'+id).nextElementSibling;
        if (field?.classList.contains('wall-value')) {
            field.querySelector('button').textContent = s[key] + (key === 'blur' ? ' px' : '%');
            const input = field.querySelector('input');
            if (document.activeElement !== input) input.value = s[key];
        } else if(field?.tagName === 'OUTPUT') field.value = s[key] + (key === 'blur' ? ' px' : '%');
    }
    $('#clearWallpaper').disabled = !s.wallpaper;
    if (window.localizeStudio) localizeStudio();
}
function queueSettings() {
    if (!settingsReady) return;

    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => send('settings-save',studioSettings),220);
}
function receiveSettings(m) {
    if (m.action === 'studio-settings') {
        // Host serializer uses the record's PascalCase names for reads.
        const values = Object.fromEntries(Object.entries(m.settings).map(([k,v])=>[k[0].toLowerCase()+k.slice(1),v]));
        studioSettings = {...defaultSettings,...values};
        studioSettings.curve = studioSettings.accent;
        settingsReady = true;
        $('#settingsStatus').textContent = m.settingsPath;
        applySettings(); syncPicker();
    } else if (!m.ok) toast('Không lưu được cài đặt. '+(m.message || ''));
}
$('#settings').onclick = () => { syncPicker(); $('#preferences').showModal(); };
function closePreferences() {
    const dialog = $('#preferences');
    if(dialog.classList.contains('closing')) return;
    dialog.classList.add('closing');
    setTimeout(()=>{dialog.close();dialog.classList.remove('closing');},matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150);
}
$('#closeSettings').onclick = closePreferences;
$('#preferences').addEventListener('cancel',e=>{e.preventDefault();closePreferences();});
$('#toggleTheme').onclick = () => setTheme(studioSettings.theme === 'dark' ? 'light' : 'dark');
document.querySelectorAll('[data-theme-choice]').forEach(b => b.onclick = () => setTheme(b.dataset.themeChoice));
$('#language').onchange = e => { studioSettings.language = e.target.value; applySettings(); queueSettings(); };
$('#developerName').oninput = e => { studioSettings.developer = e.target.value; queueSettings(); };
for (const [id,key] of [['wallDim','dim'],['wallBlur','blur'],['wallZoom','zoom'],['wallX','x'],['wallY','y']])
    $('#'+id).oninput = e => { studioSettings[key] = +e.target.value; applySettings(); queueSettings(); };
for (const [id,key] of [['wallDim','dim'],['wallBlur','blur'],['wallZoom','zoom'],['wallX','x'],['wallY','y']]) {
    const range = $('#'+id);
    const wrapper = document.createElement('span');
    wrapper.className = 'wall-value';
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'wall-value-label';
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'wall-number';
    number.min = range.min; number.max = range.max; number.step = '1';
    number.hidden = true;
    const name = range.parentElement.firstChild.textContent.trim();
    number.setAttribute('aria-label', name);
    label.setAttribute('aria-label', name);
    wrapper.append(label, number);
    range.nextElementSibling.replaceWith(wrapper);
    let originalValue;
    function finish(save) {
        if (save && Number.isFinite(number.valueAsNumber)) {
            studioSettings[key] = Math.round(Math.max(+number.min, Math.min(+number.max, number.valueAsNumber)));
            queueSettings();
        } else studioSettings[key] = originalValue;
        number.hidden = true;
        label.hidden = false;
        applySettings();
    }
    label.onclick = () => {
        originalValue = studioSettings[key];
        number.value = originalValue;
        label.hidden = true;
        number.hidden = false;
        number.focus(); number.select();
    };
    number.onblur = () => { if (!number.hidden) finish(true); };
    number.onkeydown = e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            finish(e.key === 'Enter');
            label.focus();
        }
    };
}
$('#resetWallpaper').onclick=()=>{
    for(const key of ['dim','blur','zoom','x','y'])studioSettings[key]=defaultSettings[key];
    applySettings();queueSettings();
};
$('#chooseWallpaper').onclick = () => $('#wallpaperFile').click();
$('#clearWallpaper').onclick = () => { studioSettings.wallpaper = ''; applySettings(); queueSettings(); };
$('#wallpaperFile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1,1920/Math.max(bitmap.width,bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
        const image = canvas.toDataURL('image/webp',.85);
        if (image.length > 4000000) throw Error();
        studioSettings.wallpaper = image; applySettings(); queueSettings();
    } catch { toast('Không mở được ảnh nền này.'); }
    finally { e.target.value = ''; }
};
$('#resetAppearance').onclick = () => {
    studioSettings = {...defaultSettings,language:studioSettings.language,developer:studioSettings.developer};
    applySettings(); syncPicker(); queueSettings();
};
function selectedColor() { return studioSettings[colorTarget] || (studioSettings.theme === 'dark' ? '#111519' : '#f2f4f2'); }
function syncPicker() {
    $('#exactColor').value = selectedColor(); $('#exactColor').style.background = selectedColor(); $('#hexColor').value = selectedColor().toUpperCase();
    document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===colorTarget)));
}
function pickColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    studioSettings[colorTarget] = color; studioSettings.curve = studioSettings.accent; syncPicker(); applySettings(); queueSettings();
}
document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { colorTarget=b.dataset.color; syncPicker(); });
$('#exactColor').oninput = e => pickColor(e.target.value);
$('#hexColor').onchange = e => { pickColor(e.target.value); syncPicker(); };
function hsv(h,s,v) {
    const k = n => (n+h*6)%6;
    return [5,3,1].map(n=>Math.round(255*v*(1-s*Math.max(0,Math.min(k(n),4-k(n),1)))));
}
const wheel = $('#colorWheel'), ctx = wheel.getContext('2d');
function paintWheel() {
    const image = ctx.createImageData(180,180), value = +$('#colorValue').value/100;
    for (let y=0;y<180;y++) for(let x=0;x<180;x++) {
        const dx=x-90,dy=y-90,r=Math.hypot(dx,dy); if(r>89) continue;
        const c=hsv((Math.atan2(dy,dx)/(2*Math.PI)+1)%1,r/89,value), offset=(y*180+x)*4;
        image.data.set([...c,255],offset);
    }
    ctx.putImageData(image,0,0);
}
function wheelPick(e) {
    const box=wheel.getBoundingClientRect(),x=(e.clientX-box.left)*180/box.width,y=(e.clientY-box.top)*180/box.height;
    const c=hsv((Math.atan2(y-90,x-90)/(2*Math.PI)+1)%1,Math.min(1,Math.hypot(x-90,y-90)/89),+$('#colorValue').value/100);
    pickColor('#'+c.map(v=>v.toString(16).padStart(2,'0')).join(''));
}
wheel.onpointerdown=e=>{wheel.setPointerCapture(e.pointerId);wheelPick(e);};
wheel.onpointermove=e=>{if(wheel.hasPointerCapture(e.pointerId))wheelPick(e);};
$('#colorValue').oninput=paintWheel;
applySettings(); paintWheel(); syncPicker();
if(window.chrome?.webview) send('settings-read');
else settingsReady=true;

$('#languageButton').onclick = () => { $('#languageOptions').hidden = !$('#languageOptions').hidden; };
document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
    studioSettings.language = b.dataset.lang; $('#languageOptions').hidden = true; applySettings(); queueSettings();
});
document.addEventListener('click',e=>{if(!e.target.closest('.language-menu'))$('#languageOptions').hidden=true;});
