/* Learning games: touch-friendly interaction utilities. */
(function(root){
const KY=root.KY;
function label(scene,x,y,text,color='#343434',size=14){const n=KY.svg.el('text',{x,y,'text-anchor':'middle','font-size':size,'font-weight':800,fill:color}); n.textContent=text;scene.add('top',n);return n;}
function choices(scene,options,callback,delay=0){const panel=document.createElement('div'); panel.className='choices mini-choices'; options.forEach(o=>{const b=document.createElement('button');b.className='choice';b.type='button';b.innerHTML=KY.text.html(o.text||{jp:o.jp,en:o.en||o.jp}); b.addEventListener('click',()=>{if(scene.locked)return;panel.remove();callback(o.id,o);});panel.append(b);});scene.at(delay,()=>{scene.overlay.append(panel);panel.classList.add('in');});return panel;}
function button(scene,jp,en,fn,cls=''){const b=document.createElement('button');b.type='button';b.className='mini-btn '+cls;b.innerHTML=KY.text.html({jp,en});b.addEventListener('pointerdown',e=>{e.stopPropagation(); if(!scene.locked)fn(e);});scene.overlay.append(b);return b;}
function hit(scene,x,y,w,h,fn){const n=KY.svg.el('rect',{x,y,width:w,height:h,fill:'transparent',stroke:'none'});scene.add('top',n);scene.onTap(n,fn,'Tap to interact');return n;}
function folderFlood(scene){const {el}=KY.svg; for(let i=0;i<12;i++)scene.after(60*i,()=>scene.add('top',el('rect',{x:20+(i%4)*79,y:202+Math.floor(i/4)*65,width:64,height:47,rx:3,fill:'#fff0b7',stroke:'#bb8b32','stroke-width':2})));}
KY.mini={label,choices,button,hit,folderFlood};
})(window);