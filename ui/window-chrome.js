$('#windowMinimize').onclick=()=>send('window-minimize');
$('#windowMaximize').onclick=()=>send('window-maximize');
$('#windowClose').onclick=()=>send('window-close');
const topBar=document.querySelector('.top');
let dragStartPoint;
topBar.addEventListener('pointerdown',e=>{
    if(e.button!==0 || e.target.closest('button,input,select')) return;
    dragStartPoint={x:e.clientX,y:e.clientY};
    topBar.setPointerCapture(e.pointerId);
});
topBar.addEventListener('pointermove',e=>{
    if(!dragStartPoint || Math.hypot(e.clientX-dragStartPoint.x,e.clientY-dragStartPoint.y)<5)return;
    dragStartPoint=null;
    if(topBar.hasPointerCapture(e.pointerId))topBar.releasePointerCapture(e.pointerId);
    send('window-drag');
});
topBar.addEventListener('pointerup',()=>dragStartPoint=null);
topBar.addEventListener('pointercancel',()=>dragStartPoint=null);
topBar.addEventListener('dblclick',e=>{if(!e.target.closest('button,input,select'))send('window-maximize');});
for(const [side,code] of Object.entries({left:10,right:11,top:12,tl:13,tr:14,bottom:15,bl:16,br:17})){
    const grip=document.createElement('div');
    grip.className='resize-grip '+side;
    grip.onpointerdown=e=>{if(e.button===0){e.preventDefault();send('window-resize',code);}};
    document.body.append(grip);
}

function updateHeaderScroll() {
    topBar.classList.toggle('is-scrolled', window.scrollY > 0);
    const content = document.getElementById('scrollContent');
    const overlap = Math.max(0, topBar.getBoundingClientRect().bottom - content.getBoundingClientRect().top);
    content.style.clipPath = overlap > 0 ? `inset(${overlap}px -100px -100px)` : 'none';
}
window.addEventListener('scroll', updateHeaderScroll, {passive:true});
window.addEventListener('resize', updateHeaderScroll);
new ResizeObserver(updateHeaderScroll).observe(topBar);
new ResizeObserver(updateHeaderScroll).observe(document.getElementById('scrollContent'));
updateHeaderScroll();
