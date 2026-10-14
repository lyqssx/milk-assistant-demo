(() => {
'use strict';
const $ = s => document.querySelector(s);
const key = 'milk-assistant-demo-flow-v1';
const steps = [
 {id:'measure',name:'冷藏母乳',short:'冷藏母乳',help:'用硬质刻度瓶或量杯读数；泵杯为估算，奶袋刻度为参考。无需记录每一次转倒。'},
 {id:'cool',name:'降温',short:'降温',help:'尽快将密封的小瓶单独放入冰箱。计划与已有冷藏奶混合时，可在此启动检查提醒；计时不是实际温度测量。'},
 {id:'mix',name:'集中存储',short:'集中存储',help:'温热新奶可能使已有冷藏奶升温，建议先单独冷却。混合后沿用最早来源时间，不因加入新奶刷新保存时间。'},
 {id:'take',name:'取用登记',short:'取用登记',help:'记录取出量并扣减大瓶。升温可选；使用温水浴计时，奶温需自行检查。不要用微波炉加热母乳，以免受热不均和产生烫伤风险。'},
 {id:'feed',name:'喂养登记',short:'喂养登记',help:'实际摄入与准备量分开记录。已经接触喂养的剩余奶不默认倒回大瓶或冷冻，请依据适用指导处理。'},
 {id:'finish',name:'冷冻母乳',short:'冷冻母乳',help:'将尚未分取的大瓶余奶分装冻存；喂养瓶剩余奶不默认进入冻奶库。'}
];
const initial = () => ({small:120,pool:360,portion:0,intake:0,frozen:180,seen:{},used:{},events:[],timer:null,warm:null,pinned:[0,1,2,3,4,5],lastTool:null,oldest:'今天 06:30',drafts:{}});
// Every page load starts a fresh demo; in-page navigation keeps this session's state.
let state = initial();
state.timerNotices ||= [];state.coolingTasks ||= [];state.looseBatches ||= [];state.batchSequence ||= 0;
state.receipts ||= {}; state.drafts ||= {}; state.pinned ||= [0,1,2,3,4,5];
state.pump ||= {left:60,right:60,total:120,source:'吸奶器自动记录'};
state.reminderMinutes ||= 30;
state.preferences ||= {fridgeTemperature:4};state.preferences.miniFridgeTemperature ??= 4;
state.preferences.singleInputMax ||= 500;
state.preferences.accessories ||= {bags:false,fridge:false};
try{const accessories=JSON.parse(localStorage.getItem('milk-assistant-demo-flow-accessories')||'null');if(accessories)state.preferences.accessories={bags:accessories.bags===true,fridge:accessories.fridge===true};}catch{}
let smartEntry=null;state.manualFrozenTaken=0;state.smartAccessorySequence=Math.max(0,...(window.parent.__milkStoragePrototype?.records||[]).map(r=>Number(r.containerId?.match(/^DEMO-MC-BAG-(\d+)$/)?.[1])||0));
try{const stored=Number(localStorage.getItem('milk-assistant-demo-flow-single-input-max'));if(Number.isSafeInteger(stored)&&stored>0)state.preferences.singleInputMax=stored;}catch{}
state.pump.at ||= new Date().setHours(8,40,0,0);
state.bottles ||= [{id:'b1',name:'存储瓶 1',capacity:Math.max(600,state.pool),amount:state.pool,oldest:new Date().setHours(6,30,0,0)}];
state.bottles.forEach(b=>{b.capacity=Math.max(b.capacity,b.amount);});
state.pool=state.bottles.reduce((sum,b)=>sum+b.amount,0);
state.selectedBottleId ||= state.bottles[0]?.id;
if(!state.pumpRecords){
 const registered=!!state.used.measure||state.small===0;
 state.pumpRecords=[];
 if(!registered)state.small=0;
}
state.selectedPendingPumpId ||= null;
const pendingVolume=p=>p?Math.max(0,p.total-(p.allocated||0)):0;
function pendingPump(){const selected=state.pumpRecords.find(p=>p.id===state.selectedPendingPumpId&&!p.stored);if(selected)return selected;const latest=[...state.pumpRecords].sort((a,b)=>b.at-a.at)[0];return latest&&!latest.stored?latest:null;}
const requiredStages=[0,4,5];
const habitQuestions=[
 {title:'吸完奶后，你通常怎样保存？',description:'按平时的习惯选择。冷藏和冷冻入口都会保留，选择会决定你的默认入口。',options:['几乎全部直接冷冻','大多直接冷冻','大多先冷藏待用','几乎全部先冷藏待用']},
 {title:'你会把多次吸出的奶汇总吗？',description:'集中存储可记录每个瓶子的奶量；混合后沿用最早吸奶时间。',stage:2},
 {title:'混合前，你会先将新奶单独降温吗？',description:'准备与已有冷藏奶混合时，建议先单独冷却。降温计时只提醒检查奶温。',options:['全部这样做（推荐）','有时这样做','很少这样做','从不这样做'],stage:1},
 {title:'你需要升温计时提醒吗？',description:'升温时用计时工具提醒你及时查看并取用。你可以每次取用时选择是否开启。',options:['非常需要','比较需要','暂时不需要','不需要']},
 {title:'你正在使用 Momcozy 奶袋吗？',description:'带识别标识的配套型号可开启扫码快速入库。普通奶袋也可以继续手动登记。',options:['正在使用','没有使用'],hardware:'bags',purchase:'https://momcozy.com/products/breastmilk-storage-bags',purchaseLabel:'了解 Momcozy 储奶袋'},
 {title:'你正在使用 Momcozy 小冰箱吗？',description:'支持近场识别的配套型号可开启碰一碰入库。未使用时，手动登记和降温计时仍然可用。',options:['正在使用','没有使用'],hardware:'fridge',purchase:'https://momcozy.com/collections/breast-milk-storing',purchaseLabel:'查看官方储奶配套设备'}
];
let habitSurvey=null;
let balanceRange='week';
function finishHabitSurvey(skipped){
 const answers=[...habitSurvey.answers],returnToSettings=habitSurvey.returnToSettings;
 state.habitAnswers=answers;
 if(!skipped)state.pinned=[...requiredStages,3];
 habitQuestions.forEach((q,i)=>{if(q.stage===undefined||answers[i]===undefined)return;state.pinned=state.pinned.filter(n=>n!==q.stage);if(answers[i]<=1)state.pinned.push(q.stage);});
 state.pinned=[...new Set([...state.pinned,...requiredStages])].sort((a,b)=>a-b);
 if(answers[3]!==undefined)state.preferences.warmReminder=answers[3]<=1;
 habitQuestions.forEach((q,i)=>{if(q.hardware&&answers[i]!==undefined)state.preferences.accessories[q.hardware]=answers[i]===0;});localStorage.setItem('milk-assistant-demo-flow-accessories',JSON.stringify(state.preferences.accessories));
 habitSurvey=null;current=answers[0]!==undefined&&answers[0]<=1?'finish':'measure';tab='首页';view=returnToSettings?'all':'workspace';timerExpanded=false;save();render();$('#page').scrollTop=0;toast('已设置环节，可在齿轮设置中修改');
}
function habitsHTML(){
 const q=habitQuestions[habitSurvey.index],options=q.options||['全部这样做','有时这样做','很少这样做','从不这样做'];
 return `<section class="habit-survey"><div class="habit-kicker">按你的习惯，设置奶仓</div><div class="habit-progress" aria-label="第 ${habitSurvey.index+1} 题，共 ${habitQuestions.length} 题">${habitQuestions.map((_,i)=>`<span class="${i<=habitSurvey.index?'active':''}"></span>`).join('')}</div><span class="habit-count">${habitSurvey.index+1} / ${habitQuestions.length}</span><h1>${q.title}</h1><p class="habit-description">${q.description}</p><div class="habit-options">${options.map((label,i)=>`<button data-habit-option="${i}" aria-pressed="${habitSurvey.answers[habitSurvey.index]===i}" class="${habitSurvey.answers[habitSurvey.index]===i?'selected':''}"><span>${label}</span><i aria-hidden="true"></i></button>`).join('')}</div>${q.hardware&&habitSurvey.answers[habitSurvey.index]===1?`<aside class="accessory-purchase"><p>仍可继续使用手动登记。如需了解配套产品：</p><a href="${q.purchase}" target="_blank" rel="noopener noreferrer">${q.purchaseLabel} <span aria-hidden="true">›</span></a></aside>`:''}<div class="habit-actions">${habitSurvey.index?'<button class="habit-back" data-action="habitBack">上一步</button>':''}<button class="primary" data-action="habitNext" ${habitSurvey.answers[habitSurvey.index]===undefined?'disabled':''}>${habitSurvey.index===habitQuestions.length-1?'开启我的奶仓':'继续'}</button><button class="habit-skip" data-action="habitSkip" aria-label="跳过问卷">跳过</button></div><p class="habit-settings-note">完成后，可通过右上角齿轮随时调整环节。</p></section>`;
}

let editing=false, knowledge=null, knowledgeIndex=0, ringSignature='';
let recordKind=null, editorDraft={}, editorError='', addingBottle=false,showPumpPicker=false;
let timerExpanded=true,dateEditing=false,embeddedAway=false;
let opened=true, tab='首页', view='workspace', current='measure', transitionFrom=null, warmView=false;
const save = () => {localStorage.setItem(key,JSON.stringify(state));window.parent.milkFlowIntegration?.onFlowChange?.(JSON.parse(JSON.stringify(state)));};
const duration = s => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
const time = t => new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
const coolingWait = () => state.timer ? Math.max(0,Math.ceil((state.timer.start-Date.now())/1000)) : 0;
const remaining = () => state.timer ? Math.max(0,Math.ceil((state.timer.end-Math.max(Date.now(),state.timer.start))/1000)) : 0;
const used = id => state.used[id] || 0;
function toast(text){ $('#toast').textContent=text; $('#toast').classList.add('show'); clearTimeout(window.toastT); window.toastT=setTimeout(()=>$('#toast').classList.remove('show'),2200); }
function nextStep(){
 if(state.timer) return remaining() ? 'cool' : 'mix';
 if(!used('measure') && state.small>0) return 'measure';
 if(state.small>0 && !state.chilledAt) return 'cool';
 if(state.small>0) return 'mix';
 if(state.portion>0) return 'feed';
 if(state.pool>0) return 'take';
 return 'finish';
}
function summary(){if(state.warm&&!state.timer)return duration(warmRemaining()); return state.timer ? remaining() ? duration(remaining()) : '提醒已到' : `可继续 · ${steps.find(s=>s.id===nextStep()).name}`; }
function eventHTML(n){ return state.events.length ? state.events.slice(0,n).map(e=>`<div class="event"><i></i><div><b>${e.label}</b><small>${time(e.at)} · 已确认记录</small></div></div>`).join('') : '<p class="empty">选择冷藏母乳或冷冻母乳，按需进入。</p>'; }
function pageHTML(){
 if(habitSurvey)return habitsHTML();
 if(tab==='首页'&&view==='take-form')return window.parent.milkStorageFragments?.takeContent().replaceAll('src="./assets/','src="../assets/')||'';
 if(tab==='首页'&&view==='pump-picker')return pumpPickerHTML();
 if(tab==='首页')return view==='inventory'?inventoryHTML():view==='all'?allHTML():homeHTML();
 if(tab==='记录')return `<h1 class="greeting">记录</h1><p class="muted-text">流转与摄入分开记录，随时回来核对。</p><div class="section-label">今天的用奶</div><div class="card inventory"><div><p class="muted-text">实际摄入</p><div class="quantity">${state.intake}<small> mL</small></div></div><span class="pill">${state.events.length} 条流转</span></div><div class="card">${eventHTML(15)}</div>`;
 return `<h1 class="greeting">我的习惯</h1><p class="muted-text">只把常用环节放在圆环上。</p><div class="section-label">常用路径</div><div class="card"><h3>先冷藏，按需汇总</h3><p class="muted-text" style="margin:12px 0">冷藏母乳 → 降温 → 集中存储<br>取用登记 → 喂养登记 → 冷冻母乳<br>顺序只是参考，每个环节均可直接进入。</p><button class="primary" data-action="all">调整常用环节</button></div><div class="card"><h3>需要时再看指导</h3><p class="muted-text" style="margin-top:10px">器具、转倒和用奶知识收在对应环节内，不再占用流程节点。</p></div><div class="card preference-card"><h3>冰箱温度</h3><label for="pref-fridge">冷藏环境温度 · °C</label><div><input id="pref-fridge" type="number" min="0" max="10" step="0.5" value="${state.preferences.fridgeTemperature}"><button data-action="saveFridge">保存</button></div><p id="preference-status" role="status"></p></div><button class="secondary" data-action="reset">重置演示数据</button>`;
}
function sameDay(at){return new Date(at).toDateString()===new Date().toDateString();}
function homeOverview(){
 const coldCount=state.bottles.filter(b=>b.amount>0).length+state.looseBatches.filter(b=>b.amount>0).length,frozenCount=window.parent.__milkStoragePrototype?.records.filter(r=>r.storage==='Frozen').length??0;
 return `<button class="home-overview stock-overview-link" data-action="browseInventory" aria-label="查看奶仓库存"><span class="home-stock-column home-stock-total"><span>总库存</span><b>${state.pool+state.small+state.frozen}<small> mL</small></b></span><span class="home-stock-column"><span><img src="../assets/ms-fish-legend.svg" alt="">冷藏</span><b>${state.pool+state.small}<small> mL</small></b><small>${coldCount} 个容器</small></span><span class="home-stock-column"><span><img src="../assets/ms-snow-legend.svg" alt="">冷冻</span><b>${state.frozen}<small> mL</small></b><small>${window.parent.__milkStoragePrototype?.manualFrozenTaken?'袋数待核对':frozenCount+' 袋'}</small></span>${state.portion>0?`<span class="home-prepared-milk">已取出 ${state.portion} mL</span>`:''}</button>`;
}

function homeHTML(){return `${homeOverview()}<section class="home-flow"><div id="sheet-content" class="home-ring-content">${workspace()}</div></section>`;}
const balanceTolerance=50;
function isBasicallyBalanced(supply,demand){return supply+demand>0&&Math.abs(supply-demand)<=balanceTolerance;}
function balanceCare(supply,demand){
 if(!supply&&!demand)return {range:'empty',text:'慢慢来，从第一条记录开始，让每一份奶都有迹可循。'};
 if(isBasicallyBalanced(supply,demand))return {range:'balanced',text:'这段时间的供给与使用很接近，辛苦了，也记得给自己一点休息。'};
 if(!demand)return {range:'supply-only',text:'这一份已经记下了。喂养后再记一笔，供需情况会更清楚。'};
 if(!supply)return {range:'demand-only',text:'每一次喂养都值得记录，也可以补充吸奶记录，一起回看这段时间。'};
 const deviation=(supply-demand)/demand;
 if(deviation>.2)return {range:'surplus-large',text:'已经积累了一些余量，可以整理一下库存，让接下来的取用更从容。'};
 if(deviation>0)return {range:'surplus-small',text:'多出了一点余量，可以先看看库存，再安排下一次取用。'};
 if(deviation>=-.2)return {range:'shortage-small',text:'有一点差额也别给自己压力，先看看现有库存，按实际情况安排就好。'};
 return {range:'shortage-large',text:'不同的喂养方式都值得记录。不必追求每次持平，也记得照顾好自己。'};
}
function balanceHTML(){
 const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);
 if(balanceRange==='week')start.setDate(start.getDate()-((start.getDay()+6)%7));
 else if(balanceRange==='month')start.setDate(1);
 const included=at=>Number(at)<=now.getTime()&&(balanceRange==='all'||Number(at)>=start.getTime());
 const supplied=state.pumpRecords.filter(p=>included(p.at)).reduce((n,p)=>n+p.total,0),consumed=state.events.filter(e=>e.label.startsWith('实际摄入')&&included(e.at)).reduce((n,e)=>n+(Number(e.label.match(/[\d.]+/)?.[0])||0),0),difference=supplied-consumed,total=supplied+consumed;
 const care=balanceCare(supplied,consumed),balanced=isBasicallyBalanced(supplied,consumed);
 const position=total?supplied/total*100:50;
 const message=total===0?'--':balanced?'供需基本平衡，差额在 50 mL 以内':difference>0?`吸奶量比喂养量多 ${difference} mL`:`吸奶量比喂养量少 ${Math.abs(difference)} mL`;
 const detail=total?`<div class="balance-visual" role="img" aria-label="${message}，中央为平衡基准线" style="--division:${position}%"><div class="balance-band"><span class="balance-supply"></span><span class="balance-use"></span></div><span class="balance-reference"></span><span class="balance-deviation" style="left:${Math.min(50,position)}%;width:${Math.abs(position-50)}%"></span><span class="balance-divider"></span><span class="balance-baseline-label">平衡基准</span></div><footer><span>${total?`<svg class="balance-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${balanced||difference>=0?'<circle cx="12" cy="12" r="9"/><path d="M8 14a4.5 4.5 0 0 0 8 0M8.5 9h.01M15.5 9h.01"/>':'<path d="M5 17 11 11l4 4 5-9M15 6h5v5"/>'}</svg>`:''}${total===0?'记录差额':balanced?'基本平衡':difference>0?'供给多于使用':'使用多于供给'}</span><b>${difference>0?'+':''}${difference}<small> mL</small></b></footer><p class="balance-insight" data-care-range="${care.range}">${care.text}</p>`:`<div class="balance-empty-guide"><p class="balance-empty-title">从第一条记录开始</p><p>先记录一次吸奶或喂养，慢慢了解自己的供需节奏。</p></div>`;
 return `<section class="balance-card ${total===0?'balance-empty':''}" aria-label="供需关系"><header><h2>供需关系</h2></header><div class="balance-filter" aria-label="供需关系时间范围">${[['week','本周'],['month','本月'],['all','全部']].map(([id,label])=>`<button data-balance-range="${id}" aria-pressed="${balanceRange===id}" class="${balanceRange===id?'active':''}">${label}</button>`).join('')}</div><div class="balance-ends"><div><span>供给 · 吸奶量</span><b>${supplied}<small> mL</small></b></div><div><span>使用 · 喂养量</span><b>${consumed}<small> mL</small></b></div></div>${detail}</section>`;
}
function inventoryHTML(){return `<div class="inventory-page"><button class="back-home" data-action="returnHome">‹ 返回我的奶仓</button><h1>选择取用库存</h1><p class="inventory-caption">选择本次取用的奶，再登记奶量。</p><h2>冷藏母乳</h2><div class="inventory-bottles">${state.bottles.map(b=>`<button data-stock-id="${b.id}" ${b.amount===0?'disabled':''}><span><b>${b.name}</b><small>${b.oldest?'最早 '+new Date(b.oldest).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})+' '+time(b.oldest):'--'}</small></span><strong>${b.amount}<small> mL</small></strong><span aria-hidden="true">›</span></button>`).join('')}</div>${state.looseBatches.filter(b=>b.amount>0).map(b=>`<button class="loose-stock" data-stock-id="loose-${b.id}"><span>${time(b.oldest)} · 未汇总批次</span><b>${b.amount} mL</b></button>`).join('')}<h2>冷冻母乳</h2><button class="frozen-stock" data-stock-id="frozen" ${state.frozen===0?'disabled':''}><span><b>冻奶库</b><small>−20°C～−15°C</small><small>升温前请先安全解冻</small></span><strong>${state.frozen}<small> mL</small></strong><span aria-hidden="true">›</span></button></div>`;}
function pumpPickerHTML(){return `<section class="pump-picker-page"><p>选择一条记录，自动填写入库信息。</p><div class="pump-record-list">${state.pumpRecords.slice().sort((a,b)=>b.at-a.at).map(p=>`<button class="pump-history-row" data-fill-pump="${p.id}" ${p.stored?'disabled':''}><span><b>${new Date(p.at).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})} ${time(p.at)}</b><small>${p.stored?'已入库':'待入库'} · 左 ${p.left??'--'} / 右 ${p.right??'--'} mL</small></span><strong>${p.stored?p.total:pendingVolume(p)}<small> mL</small></strong></button>`).join('')||'<p class="empty">暂无吸奶记录</p>'}</div></section>`;}
let floatingPosition={side:'right',y:null},floatingGesture=null,suppressFloatingClickUntil=0;
function floatingBounds(){const group=$('#resume'),phone=$('.phone'),nav=$('.bottom-nav');return {minX:14,maxX:Math.max(14,phone.clientWidth-group.offsetWidth-14),minY:$('.app-header').offsetTop+$('.app-header').offsetHeight+14,maxY:Math.max($('.app-header').offsetTop+$('.app-header').offsetHeight+14,phone.clientHeight-nav.offsetHeight-24-group.offsetHeight)};}
function positionFloating(){const group=$('#resume');if(!group.children.length||floatingGesture)return;const b=floatingBounds();floatingPosition.y=Math.max(b.minY,Math.min(b.maxY,floatingPosition.y??b.maxY));Object.assign(group.style,{left:(floatingPosition.side==='left'?b.minX:b.maxX)+'px',top:floatingPosition.y+'px',right:'auto',bottom:'auto'});}
function renderPage(){
 $('.brand').textContent=view==='take-form'?'取用母乳':view==='pump-picker'?'选择吸奶记录':view==='all'?'奶仓设置':tab==='记录'?'喂养与流转记录':tab==='我的'?'我的习惯':'用奶助手';
 $('.phone').classList.toggle('onboarding-mode',!!habitSurvey);
 $('.app-header .avatar').disabled=!!habitSurvey||view==='take-form';
 $('#page').innerHTML=pageHTML();
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));
 const away=tab!=='首页'||view!=='workspace';
 $('#resume').innerHTML=away?['cool','take'].filter(id=>nodeTimer(id)).map(id=>`<button class="floating-tool" data-timer-id="${id}" aria-label="返回${id==='cool'?'降温':'升温'}计时器"><span class="floating-clock"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="#b27a7e" stroke-width="4"/><circle data-float-progress="${id}" cx="22" cy="22" r="18" fill="none" stroke="#fce4e2" stroke-width="4" stroke-linecap="round" stroke-dasharray="113.1" transform="rotate(-90 22 22)"/></svg></span><span><b>${id==='cool'?(state.timer?.notified?'降温待查看':coolingWait()?'降温待启动':'降温中')+(state.coolingTasks.length>1?' · '+state.coolingTasks.length:''):(state.warmNotified?'升温待查看':'升温中')}</b><small data-float-time="${id}">${nodeTimer(id).label}</small></span></button>`).join(''):'';
 positionFloating();
 updateCompact();
}
function updateCompact(){document.querySelectorAll('[data-float-time]').forEach(el=>{const info=nodeTimer(el.dataset.floatTime);if(info)el.textContent=info.label;});document.querySelectorAll('[data-float-progress]').forEach(el=>{const info=nodeTimer(el.dataset.floatProgress);if(info)el.style.strokeDashoffset=113.1*(1-info.fraction);});}
function point(a,r=132){const t=(a-90)*Math.PI/180;return [175+r*Math.cos(t),175+r*Math.sin(t)];}
function arc(a,b,r=132){const p=point(a,r),q=point(b,r);return `M ${p[0]} ${p[1]} A ${r} ${r} 0 ${b-a>180?1:0} 1 ${q[0]} ${q[1]}`;}
const circumference=2*Math.PI*145;
const syncPool=()=>{state.pool=state.bottles.reduce((sum,b)=>sum+b.amount,0);};
const bottleById=id=>state.bottles.find(b=>b.id===id);
const dateInput=t=>{const d=new Date(t);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
function newLooseBatch(amount,oldest){const batch={id:'batch-'+Date.now()+'-'+(++state.batchSequence),amount,oldest,admittedAt:Date.now(),timerId:null};state.looseBatches.push(batch);syncLoose();return batch;}
function syncLoose(){state.small=state.looseBatches.reduce((n,b)=>n+b.amount,0);const active=state.looseBatches.filter(b=>b.amount>0);state.activeBatchOldest=active.length?Math.min(...active.map(b=>b.oldest)):null;}
function looseBatch(id){return state.looseBatches.find(b=>b.id===id&&b.amount>0);}
function defaultLooseBatch(){return looseBatch(state.pendingMixBatchId)||state.looseBatches.find(b=>b.amount>0&&!state.coolingTasks.some(t=>t.batchId===b.id&&!t.notified))||state.looseBatches.find(b=>b.amount>0);}
function refreshCoolingSelection(){state.timer=state.coolingTasks.find(t=>t.id===state.activeCoolingId)||state.coolingTasks.slice().sort((a,b)=>a.end-b.end)[0]||null;state.activeCoolingId=state.timer?.id||null;}
function removeCoolingTask(id){const task=state.coolingTasks.find(t=>t.id===id);const batch=task&&looseBatch(task.batchId);if(batch)batch.timerId=null;state.coolingTasks=state.coolingTasks.filter(t=>t.id!==id);state.timerNotices=state.timerNotices.filter(n=>n.timerId!==id);refreshCoolingSelection();}
function beginCooling(batch){const existing=state.coolingTasks.find(t=>t.batchId===batch.id);if(existing){state.activeCoolingId=existing.id;refreshCoolingSelection();return existing;}
 if(batch.storageLocation){const task={id:'cool-'+batch.id,batchId:batch.id,start:Date.now(),end:Date.now(),started:true,estimated:false,device:true,awaitingReport:true,volume:batch.amount};state.coolingTasks.push(task);batch.timerId=task.id;state.activeCoolingId=task.id;refreshCoolingSelection();record('cool',`小冰箱降温 · 等待设备上报`);return task;}
 const minutes=coolingEstimate(batch.amount,state.preferences.fridgeTemperature),start=Date.now()+10000,task={id:'cool-'+batch.id,batchId:batch.id,start,end:start+minutes*60000,started:false,estimated:true,toolOnly:!!batch.toolOnly,volume:batch.amount,fridge:state.preferences.fridgeTemperature};state.coolingTasks.push(task);batch.timerId=task.id;state.activeCoolingId=task.id;refreshCoolingSelection();record('cool',`降温检查提醒 · ${batch.amount} mL · ${minutes} 分钟`);return task;}
function consumeLoose(amount,preferred){const preferredBatch=looseBatch(preferred),list=preferredBatch?[preferredBatch]:state.looseBatches.filter(b=>b.amount>0).sort((a,b)=>a.oldest-b.oldest);for(const batch of list){const taken=Math.min(amount,batch.amount);batch.amount-=taken;amount-=taken;if(batch.amount===0&&batch.timerId)removeCoolingTask(batch.timerId);if(!amount)break;}syncLoose();}
function coolingTaskLabel(task){if(task.device)return task.notified?'冷藏中':task.awaitingReport?'等待设备上报':`设备降温 · ${Math.max(0,Math.ceil((task.end-Date.now())/1000))?duration(Math.max(0,Math.ceil((task.end-Date.now())/1000))):'等待完成事件'}`;const wait=Math.max(0,Math.ceil((task.start-Date.now())/1000)),seconds=Math.max(0,Math.ceil((task.end-Math.max(Date.now(),task.start))/1000));return task.notified?'冷藏中':wait?'降温待启动':'降温中 · '+duration(seconds);}
let coolingRotationAt=Date.now(),coolingGesture=null,suppressCoolingClickUntil=0;
function rotateCooling(delta,manual=false){
 if(state.coolingTasks.length<2)return;
 const index=state.coolingTasks.findIndex(t=>t.id===state.activeCoolingId);
 state.activeCoolingId=state.coolingTasks[(index+delta+state.coolingTasks.length)%state.coolingTasks.length].id;
 refreshCoolingSelection();coolingRotationAt=Date.now()+(manual?6000:0);save();render();
}
function coolingSelector(){return current==='cool'&&state.timer&&state.coolingTasks.length>1?`<div class="cooling-selector" aria-live="off">${state.coolingTasks.length>1?`<div class="cooling-pages" aria-label="降温任务切换">${state.coolingTasks.map((t,i)=>`<button data-cooling-page="${t.id}" class="${t.id===state.activeCoolingId?'active':''}" aria-label="第 ${i+1} 个降温任务" aria-pressed="${t.id===state.activeCoolingId}"><i></i></button>`).join('')}</div>`:''}</div>`:'';}
function openStage(id){
 select(id);
 if(stageNotice(id))return;
 if(id==='measure'){state.admissionZone='fridge';openRecord('measure');}
 else if(id==='cool'){if(!state.timer)openRecord('cool');}
 else if(id==='take'){if(state.warmPending&&!state.warm)openRecord('warm');else if(!state.warm){window.parent.milkFlowIntegration?.openTakeEntry();}}
 else openRecord(id==='finish'?'measure':'transaction');
}

function looseBatchOptions(){return state.bottles.filter(b=>b.amount>0&&b.id!==editorDraft.bottleId).map(b=>`<button class="loose-batch-choice ${editorDraft.sourceBottleId===b.id?'active':''}" data-mix-source="${b.id}"><span>${b.name} · ${b.amount} mL</span><small>冷藏中</small></button>`).join('')+state.looseBatches.filter(b=>b.amount>0).map(b=>`<button class="loose-batch-choice ${editorDraft.batchId===b.id?'active':''}" data-loose-batch="${b.id}"><span>小瓶 ${state.looseBatches.indexOf(b)+1} · ${b.amount} mL</span><small>${state.coolingTasks.find(t=>t.batchId===b.id)?coolingTaskLabel(state.coolingTasks.find(t=>t.batchId===b.id)):'冷藏中'}</small></button>`).join('');}
function stageNotice(id=current){return state.timerNotices.filter(n=>!n.acknowledged&&n.kind===id).sort((a,b)=>b.at-a.at||b.order-a.order)[0];}
function latestNotice(){return state.timerNotices.filter(n=>!n.acknowledged).sort((a,b)=>b.at-a.at||b.order-a.order)[0];}
function clearNotices(kind){state.timerNotices=state.timerNotices.filter(n=>n.kind!==kind);}
function warmRemaining(){return Math.max(0,Math.ceil((state.warmEnd-Date.now())/1000));}
function warmingEstimate(d){
 const volume=Number(d.volume),initial=Number(d.warmCurrent),target=Number(d.warmTarget),bath=Number(d.warmBath);
 if(!(volume>0)||initial<0||target<=initial||bath<=target)return null;
 // Illustrative glass-wall / water-film model; not a measured milk temperature.
 const radius=.025,area=2*Math.PI*radius*(volume/1e6/(Math.PI*radius*radius))+Math.PI*radius*radius;
 const resistance=1/500+.003/1+1/250,ua=area/resistance;
 return Math.max(1,Math.ceil(((volume/1e6*1030*3900+ .12*840)/ua)*Math.log((bath-initial)/(bath-target))/60));
}
function updateWarmEstimate(){const estimate=warmingEstimate(editorDraft),label=$('#warm-estimate-error');editorDraft.warmMinutes=estimate||'';if($('#warm-estimate-value'))$('#warm-estimate-value').textContent=estimate?estimate+' 分钟':'--';if(label)label.textContent=editorDraft.warmCurrent<0?'请先解冻并填写实际奶温':Number(editorDraft.warmBath)>40?'建议使用不超过 40°C 的温水':estimate?'':'请核对温度';const recommendation=$('#bath-recommendation');if(recommendation)recommendation.hidden=Number(editorDraft.warmBath)!==40;}

function startWarmTimer(){state.warmPending=null;clearNotices('take');state.warmConfig={current:Number(editorDraft.warmCurrent),target:Number(editorDraft.warmTarget),bath:Number(editorDraft.warmBath),volume:Number(editorDraft.volume),minutes:Number(editorDraft.warmMinutes)};state.warm=Date.now();state.warmEnd=state.warm+state.warmConfig.minutes*60000;state.warmNotified=false;}
function timerMode(){return !stageNotice()&&timerExpanded&&(current==='cool'&&!!state.timer||current==='take'&&!!state.warm);}
function coolingEstimate(volume,fridge){
 // Illustrative lumped thermal model, not a validated temperature prediction.
 // rho=1030 kg/m3, c=3900 J/(kg K), UA=0.9 W/K; check near fridge+2 C.
 const mass=volume/1e6*1030,cp=3900,ua=.9,initial=37,target=fridge+2;
 if(!(volume>0)||fridge>=initial-2)return 0;
 return Math.max(1,Math.ceil(mass*cp/ua*Math.log((initial-fridge)/(target-fridge))*1.2/60));
}
function nodeTimer(id){
 if(id==='cool'&&state.timer){if(state.timer.device&&!state.timer.notified)return {label:state.timer.awaitingReport?'等待设备':remaining()?duration(remaining()):'等待完成',fraction:state.timer.awaitingReport?0:Math.max(0,Math.min(1,remaining()/Math.max(1,(state.timer.end-state.timer.start)/1000)))};const notice=stageNotice('cool');if(notice)return {label:'计时结束',fraction:0};const seconds=remaining();return {label:coolingWait()?'即将开始':seconds?duration(seconds):'计时结束',fraction:coolingWait()?0:Math.min(1,seconds/((state.timer.end-state.timer.start)/1000))};}
 if(id==='take'&&state.warm){if(state.warmNotified)return {label:'计时结束',fraction:0};const seconds=warmRemaining();return {label:duration(seconds),fraction:Math.max(0,Math.min(1,(state.warmEnd-Date.now())/(state.warmEnd-state.warm)))};}
 return null;
}
function nodeClockLabel(id,status){return id==='take'&&state.warm&&!state.warmNotified?'升温 '+status.label:status.label;}
function updateNodeTimers(){
 document.querySelectorAll('[data-node-clock]').forEach(el=>{const status=nodeTimer(el.dataset.nodeClock);if(status)el.textContent=nodeClockLabel(el.dataset.nodeClock,status);});
 document.querySelectorAll('[data-node-progress]').forEach(el=>{const status=nodeTimer(el.dataset.nodeProgress);if(status){el.style.strokeDashoffset=1-status.fraction;el.style.opacity=status.fraction>0?1:0;}});
}
function displayedStage(){return current;}
function ringLayout(){
 const selectedStage=displayedStage();
 const count=state.pinned.length,base=360/count,index=state.pinned.indexOf(steps.findIndex(s=>s.id===selectedStage)),extra=index<0?0:Math.min(30,base*.4),selectedSpan=base+extra,otherSpan=(360-selectedSpan)/(count-1);
 let cursor=index<0?0:index*base+base/2-selectedSpan/2-index*otherSpan;
 return state.pinned.map((n,i)=>{const span=i===index?selectedSpan:index<0?base:otherSpan,layout={n,span,mid:cursor+span/2,a:cursor+7,b:cursor+span-7};cursor+=span;return layout;});
}
function dial(){
 const selectedStage=displayedStage(),notice=stageNotice();
 const visible=state.pinned,gap=360/visible.length,layout=ringLayout(),timing=timerMode();let markup='';
 visible.forEach((n,i)=>{
  const step=steps[n],{mid,a,b,span}=layout[i],selected=selectedStage===step.id,labelId='ring-label-'+step.id,status=nodeTimer(step.id);
  const reverse=[2,3].includes(n),lp=point(reverse?b:a,145),lq=point(reverse?a:b,145),labelPath=`M ${lp[0]} ${lp[1]} A 145 145 0 0 ${reverse?0:1} ${lq[0]} ${lq[1]}`;
  const color=selected?'#6a2b3a':used(step.id)?'#deaba6':'#f1dace';
  const label=step.id==='take'?step.short:stageNotice(step.id)?(step.id==='cool'?'降温-待查看':'取用登记-待查看'):status?(step.id==='take'?(state.warmNotified?'取用登记-待查看':'取用登记-升温中'):coolingWait()?'降温待启动':remaining()?(state.coolingTasks.length>1?'降温中 ×'+state.coolingTasks.length:'降温中'):'降温-待查看'):step.short;
  const cp=point(reverse?b:a,112),cq=point(reverse?a:b,112),clockPath=`M ${cp[0]} ${cp[1]} A 112 112 0 0 ${reverse?0:1} ${cq[0]} ${cq[1]}`;
  markup+=`<g class="stage-node ${selected?'active-stage':''}" style="opacity:${!selected&&(notice||current&&!status)?.5:1}"><path class="sector" role="button" tabindex="0" aria-label="${step.name}" data-step="${step.id}" data-angle="${span}" d="${arc(a,b,145)}" fill="none" stroke="${color}" stroke-width="${selected?36:23}" stroke-linecap="round"/><defs><path id="${labelId}" d="${labelPath}"/></defs><text class="dial-label ${status&&step.id==='take'?'warm-stage-label ':''}${selected?'selected-label':''}" dominant-baseline="central" text-anchor="middle"><textPath href="#${labelId}" startOffset="50%">${label}</textPath></text>${status?`<path class="node-live-track" d="${arc(a+3,b-3,170)}"/><path class="node-live-progress" style="opacity:${status.fraction>0?1:0}" data-node-progress="${step.id}" d="${arc(a+3,b-3,170)}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${1-status.fraction}"/><defs><path id="${labelId}-clock" d="${clockPath}"/></defs><text class="node-live-time" dominant-baseline="central" text-anchor="middle"><textPath href="#${labelId}-clock" startOffset="50%" data-node-clock="${step.id}">${nodeClockLabel(step.id,status)}</textPath></text>`:''}</g>`;

 });
 let ring='';if(timing){const cooling=current==='cool',frac=cooling?Math.min(1,remaining()/((state.timer.end-state.timer.start)/1000)):Math.max(0,Math.min(1,(state.warmEnd-Date.now())/(state.warmEnd-state.warm)));ring=`<g class="whole-timer"><circle class="whole-track" cx="175" cy="175" r="145" fill="none" stroke="#f1dace" stroke-width="20"/><circle id="timer-progress" class="whole-progress" cx="175" cy="175" r="145" fill="none" stroke="var(--accent)" stroke-width="20" stroke-linecap="round" stroke-dasharray="${circumference} ${circumference}" stroke-dashoffset="${circumference*(1-frac)}" style="transform:rotate(-90deg);transform-origin:175px 175px"/></g>`;}
 return `<div class="workspace-dial single-ring ${timing?'whole-timer-mode':''}" data-current="${selectedStage||'global'}"><div class="ring-surface"><svg class="dial" viewBox="0 0 350 350" aria-label="${timing?'大圆环计时器':'环节圆环'}"><g class="stage-path" style="${timing?'visibility:hidden':''}">${markup}</g>${!timing&&!notice&&current&&!nodeTimer(current)&&visible.includes(steps.findIndex(s=>s.id===current))?`<g class="business-pointer" transform="rotate(${layout[visible.indexOf(steps.findIndex(s=>s.id===current))].mid} 175 175)" aria-hidden="true"><path d="M175 61 L170 72 Q175 70 180 72 Z"/></g>`:''}${ring}</svg><div class="dial-center single-center">${centerHTML()}</div></div>${timing?`<div class="ring-timer-actions">${current==='cool'?'<button class="timer-add-bottom" data-action="addCoolingMilk">＋ 新增降温记录</button>':''}<button data-action="minimizeTimer">最小化计时器</button></div>`:''}</div>`;
}
function advanceNode(){
 const index=steps.findIndex(s=>s.id===current);if(index<0||index>=steps.length-1)return;
 const next=steps[index+1].id;
 if(!state.pinned.includes(index+1)){state.pinned.push(index+1);state.pinned.sort((a,b)=>a-b);}
 select(next);
}
function centerHTML(){
 const notice=stageNotice();if(notice?.device)return `<div class="timer-notice"><p>已达到保鲜温度<br><span>${notice.temperature}°C · ${state.pinned.includes(2)?'可以汇入大瓶了':'随时可以取用'}</span></p><button class="ring-main" data-action="ackTimerNotice" data-notice-id="${notice.id}">我知道了</button></div>`;if(notice)return `<div class="timer-notice"><p>${notice.kind==='cool'?'降温计时结束':'升温计时结束'}<br><span>${notice.kind==='cool'?notice.volume+' mL · ':''}请查看奶温</span></p><button class="ring-main" data-action="ackTimerNotice" data-notice-id="${notice.id}">我知道了</button></div>`;
 if(current==='cool'&&state.timer?.device)return `<div class="device-cooling">${coolingSelector()}<p>${state.timer.awaitingReport?'等待小冰箱上报':'小冰箱降温中'}</p><strong>${state.timer.temperature===undefined?'--':state.timer.temperature+'°C'}</strong><span>${nodeTimer('cool').label}</span><small>设备上报 · Demo 模拟</small><button data-action="demoDeviceProgress">演示设备上报</button><button data-action="demoDeviceReady">演示降温完成</button></div>`;
 if(timerMode()&&current==='cool'&&coolingWait())return `<div class="cooling-pending">${coolingSelector()}<p>降温计时即将开始<span>请将母乳放入冷藏室</span></p><button class="cancel-in-ring" data-action="cancelTimer">取消计时</button></div>`;
 if(timerMode())return `${coolingSelector()}${current==='take'?'<span class="timer-activity">取用登记-升温中</span>':''}<button class="restart-timer" data-action="restartTimer" aria-label="重新计时"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7V3m0 4h-4M20 7a9 9 0 1 0 1 8"/></svg></button><span class="timer-direction">${current==='cool'?'降温中 · 剩余时间':'剩余时间'}</span><strong class="whole-time" id="${current==='cool'?'timer-value':'warm-time'}">${current==='cool'?duration(coolingWait()||remaining()):duration(warmRemaining())}</strong><button class="cancel-in-ring" data-action="${current==='cool'?'cancelTimer':'stopWarm'}">取消计时</button>`;
 const labels={measure:'冷藏入库',cool:nodeTimer('cool')?'查看计时器':'启动降温计时',mix:'汇入大瓶',take:nodeTimer('take')?'取用登记-升温中':state.warmPending?'设置升温计时':'取用母乳',feed:'登记喂养量',finish:'冷冻入库'};
 const actions={measure:'openMeasure',cool:nodeTimer('cool')?'expandTimer':'openCooling',mix:'openTransaction',take:nodeTimer('take')?'expandTimer':state.warmPending?'startWarm':'chooseStock',feed:'openTransaction',finish:'openTransaction'};
 return current?`<button class="ring-main" data-action="${actions[current]}">${labels[current]}</button>`:'';
}
function chooseMixBottle(){
 const volume=Number(editorDraft.volume),currentBottle=bottleById(editorDraft.bottleId);
 if(currentBottle&&currentBottle.id!==editorDraft.sourceBottleId&&currentBottle.capacity-currentBottle.amount>=volume){editorDraft.capacityNotice='';return;}
 const candidates=state.bottles.filter(b=>b.id!==editorDraft.sourceBottleId&&b.capacity-b.amount>=volume).sort((a,b)=>b.amount-a.amount);
 if(candidates.length){editorDraft.bottleId=candidates[0].id;editorDraft.capacityNotice=currentBottle?`${currentBottle.name}容量不足，已选${candidates[0].name}`:'';}
 else editorDraft.capacityNotice='容量不足，请新增存储瓶';
}
function bottleOptions(){return `<div class="bottle-options">${state.bottles.map(b=>`<button class="${editorDraft.bottleId===b.id?'active':''}" data-bottle="${b.id}"><b>${b.name}</b><span>${b.amount} / ${b.capacity} mL</span></button>`).join('')}${current==='mix'?'<button class="add-bottle" data-action="addBottle" aria-label="新增存储瓶">＋</button>':''}</div>`;}
function milkPrecision(value,unit='mL'){return unit==='oz'?Math.round(Number(value)*100)/100:Math.round(Number(value));}
function milkDisplay(value,unit='mL'){return value===''?'':unit==='oz'?milkPrecision(value,unit).toFixed(2):String(milkPrecision(value,unit));}
function capacityInput(id,value,draft=id,placeholder='滑动或单击输入奶量',limit=null,unit='mL',hardLimit=true){
 const reference=(state.preferences.singleInputMax||500)*(recordKind==='measure'&&['left','right'].includes(id)?.5:1);
 if(id==='left'||id==='right')placeholder='拖动或输入';
 return `<div class="capacity-input bounded-capacity" data-capacity-max="${reference}" data-capacity-reference="${reference}" style="--fill:${Math.min(100,Number(value||0)/reference*100)}%"><input id="${id}" ${draft?`data-draft="${draft}"`:''} type="number" data-milk-unit="${unit}" inputmode="${unit==='oz'?'decimal':'numeric'}" step="${unit==='oz'?'0.01':'1'}" min="0" value="${milkDisplay(value,unit)}" placeholder="${placeholder}"><span>${unit}</span></div>`;
}
function milkWarehouseCapacity(){return state.bottles.reduce((total,bottle)=>total+Number(bottle.capacity||0),0);}
function amountField(id,value,label){let limit=null,hardLimit=true;if(id==='volume'&&recordKind==='bottle-adjust')limit=bottleById(editorDraft.bottleId)?.capacity;if(id==='volume'&&recordKind==='transaction'){if(current==='take')limit=editorDraft.stockKind==='frozen'?state.frozen:editorDraft.stockKind==='batch'?looseBatch(editorDraft.batchId)?.amount:bottleById(editorDraft.bottleId)?.amount;if(current==='finish'&&editorDraft.freezeSource==='pool')limit=state.pool;if(current==='feed'&&editorDraft.feedSource==='inventory'){limit=state.portion+state.pool+state.small+state.frozen;hardLimit=false;}}return `<label class="card-label" for="${id}">${label}</label>${capacityInput(id,value,id,'滑动或单击输入奶量',limit,'mL',hardLimit)}`;}
function feedingSourceHint(){return editorDraft.feedSource==='direct'?'亲喂可填写估算奶量。':editorDraft.feedSource==='inventory'?`奶仓可用 ${state.portion+state.pool+state.small+state.frozen} mL · 超出仍可登记`:'&nbsp;';}
function updateFeedingSource(source){
 editorDraft.feedSource=source;editorError='';$('#record-error').textContent='';
 document.querySelectorAll('[data-feed-source]').forEach(button=>{const selected=button.dataset.feedSource===source;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
 $('#feeding-source-hint').innerHTML=feedingSourceHint();
}
function timeColumn(part,value,max,unit,min=0){return `<div class="time-column"><div class="time-wheel" data-time-part="${part}" data-time-max="${max}" data-time-min="${min}" role="listbox" aria-label="${unit}" tabindex="0">${Array.from({length:max-min+1},(_,index)=>{const n=index+min;return `<button type="button" role="option" tabindex="-1" data-time-value="${n}" aria-selected="${n===value}">${String(n).padStart(2,'0')}</button>`;}).join('')}</div><span>${unit}</span></div>`;}
function timePicker(kind,value){const seconds=kind==='duration'?Math.round(Number(value||0)*60):0,d=new Date(value||Date.now());return `<div class="time-picker" data-time-kind="${kind}">${kind==='duration'?timeColumn('minutes',Math.floor(seconds/60),120,'分钟')+timeColumn('seconds',seconds%60,59,'秒'):timeColumn('hours',d.getHours(),23,'时')+timeColumn('minutes',d.getMinutes(),59,'分')}</div>`;}
function syncTimePicker(picker){picker.querySelectorAll('.time-wheel').forEach(w=>{let n;if(picker.dataset.timeKind==='duration'){const seconds=Math.round(Number(editorDraft.warmMinutes||0)*60);n=w.dataset.timePart==='minutes'?Math.floor(seconds/60):seconds%60;}else{const d=new Date(editorDraft.pumpAt||Date.now());n=({year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate(),hours:d.getHours(),minutes:d.getMinutes()})[w.dataset.timePart];}w.scrollTop=(n-Number(w.dataset.timeMin||0))*44;w.dataset.value=n;w.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',Number(b.dataset.timeValue)===n));});}
function setTimeWheel(w,n){if(!w.isConnected)return;n=Math.max(Number(w.dataset.timeMin||0),Math.min(Number(w.dataset.timeMax),n));w.dataset.value=n;const picker=w.closest('.time-picker');if(picker.dataset.timeKind==='duration'){const minutes=Number(picker.querySelector('[data-time-part="minutes"]').dataset.value),seconds=Number(picker.querySelector('[data-time-part="seconds"]').dataset.value);editorDraft.warmMinutes=Math.min(120,minutes+seconds/60);editorDraft.warmMinutesEdited=true;$('#warm-duration-label').textContent='计时时长';if(minutes===120&&seconds){syncTimePicker(picker);}}else{const get=part=>Number(picker.querySelector(`[data-time-part="${part}"]`).dataset.value),year=get('year'),month=get('month'),day=Math.min(get('day'),new Date(year,month,0).getDate());editorDraft.pumpAt=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(get('hours')).padStart(2,'0')}:${String(get('minutes')).padStart(2,'0')}`;$('#pump-at').value=editorDraft.pumpAt;if($('#date-summary'))$('#date-summary').textContent=editorDraft.pumpAt.replace('T',' ');const dayWheel=picker.querySelector('[data-time-part="day"]');if(get('day')!==day){dayWheel.dataset.value=day;dayWheel.scrollTop=(day-1)*44;}dayWheel.querySelectorAll('button').forEach(b=>{b.disabled=Number(b.dataset.timeValue)>new Date(year,month,0).getDate();b.setAttribute('aria-selected',Number(b.dataset.timeValue)===day);});if(w.dataset.timePart==='day')n=day;}w.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',Number(b.dataset.timeValue)===n));}
function dateTimeField(){return `<label class="card-label">吸奶时间</label><input id="pump-at" type="hidden" data-draft="pumpAt" value="${editorDraft.pumpAt}"><button class="datetime-summary" data-action="editDate" aria-label="编辑吸奶时间" aria-expanded="false"><span id="date-summary">${editorDraft.pumpAt.replace('T',' ')}</span><svg class="date-edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>`;}
function dateEditorHTML(){const d=new Date(editorDraft.pumpAt||Date.now());return `<section id="milk-flow-record-dialog" class="inline-record record-popup date-record" role="dialog" aria-modal="true" aria-labelledby="record-title"><header><h2 id="record-title">吸奶时间</h2><button class="popup-back" data-action="doneDate" aria-label="返回入库登记">‹</button><button id="record-dismiss" data-action="dismissAll" aria-label="关闭弹窗">×</button></header><div class="record-fields"><input id="pump-at" type="hidden" data-draft="pumpAt" value="${editorDraft.pumpAt}"><div class="date-edit-area"><div class="time-picker date-wheels" data-time-kind="clock">${timeColumn('year',d.getFullYear(),2100,'年',2000)}${timeColumn('month',d.getMonth()+1,12,'月',1)}${timeColumn('day',d.getDate(),31,'日',1)}${timeColumn('hours',d.getHours(),23,'时')}${timeColumn('minutes',d.getMinutes(),59,'分')}</div></div></div><button class="record-save" data-action="doneDate">完成编辑</button></section>`;}
function syncMilkSides(key){
 const amount=n=>Math.max(0,Math.round(Number(n)||0));
 if(key==='total'){const total=amount(editorDraft.total),left=Number(editorDraft.left)||0,right=Number(editorDraft.right)||0;editorDraft.total=total;if(editorDraft.splitInput||editorDraft.left!==''&&editorDraft.right!==''){const ratio=editorDraft.sideRatio??(left+right>0?left/(left+right):.5);editorDraft.sideRatio=ratio;editorDraft.left=Math.round(total*ratio);editorDraft.right=total-editorDraft.left;}}
 else{editorDraft.left=amount(editorDraft.left);editorDraft.right=amount(editorDraft.right);editorDraft.total=editorDraft.left+editorDraft.right;editorDraft.sideRatio=editorDraft.total?editorDraft.left/editorDraft.total:.5;}
 for(const id of ['left','right','total']){const input=$('#'+id);if(input){input.value=editorDraft[id];const field=input.closest('.capacity-input');field.style.setProperty('--fill',Math.min(100,Number(editorDraft[id]||0)/Number(field.dataset.capacityReference)*100)+'%');}}
}
function wheelMin(id){return id==='warmCurrent'?-20:0;}
function wheel(id,value,label){const min=wheelMin(id);return `<div class="wheel-column"><label id="${id}-label">${label}</label><div class="wheel-frame"><div class="temperature-wheel" id="${id}" data-wheel="${id}" role="listbox" aria-labelledby="${id}-label" tabindex="0">${Array.from({length:61-min},(_,index)=>{const n=index+min;return `<button role="option" tabindex="-1" data-wheel-value="${n}" aria-selected="${n===Math.round(value)}">${n}°C</button>`;}).join('')}</div><div class="wheel-selection" aria-hidden="true"></div></div></div>`;}
function smartEntryButtons(){const frozen=editorDraft.storage==='Frozen';if(!frozen)return '';const enabled=state.preferences.accessories[frozen?'bags':'fridge'];if(!enabled)return '';return `<div class="smart-entry-options"><div><button data-action="${frozen?'smartScan':'smartNfc'}"><img src="../assets/${frozen?'ms-scan.svg':'figma-device-r3/device-icon.svg'}" alt="">${frozen?'扫一扫绑定奶袋':'碰一碰小冰箱'}</button></div></div>${editorDraft.smartAssociation?`<p class="smart-linked">已绑定${frozen?'奶袋 '+editorDraft.smartAssociation.containerId:'小冰箱 · 降温信息由设备上报'}</p>`:''}`;}
function smartAccessoryEditorHTML(){const qr=smartEntry.type==='qr',visual=qr?(window.parent.milkStorageFragments?.qr()||'').replaceAll('src="./assets/','src="../assets/'):'';return `<section id="milk-flow-record-dialog" class="inline-record record-popup smart-accessory-dialog" role="dialog" aria-modal="true" aria-labelledby="record-title"><header><button class="popup-back" data-action="closeSmartEntry" aria-label="返回入库登记">‹</button><h2 id="record-title">${qr?'扫一扫奶袋':'碰一碰小冰箱'}</h2><button id="record-dismiss" data-action="dismissAll" aria-label="关闭弹窗">×</button></header><div class="record-fields">${qr?`<div id="smart-qr-view" class="smart-qr-frame" role="img" aria-label="二维码识别视窗">${visual}<i class="smart-scan-line"></i></div>`:'<div id="smart-nfc-view" class="smart-nfc-target"><img src="../assets/figma-device-r3/device-icon.svg" alt=""><span>将手机靠近设备 NFC 标识</span></div>'}<p class="smart-capture-hint">${qr?'仅绑定奶袋二维码，已填奶量与吸奶时间保持不变。':'关联小冰箱，降温时间与完成提醒由设备上报。'}</p>${smartEntry.failed?'<p class="smart-read-error">未能识别，请调整位置后重试。</p>':''}${smartEntry.result?`<div class="smart-read-result"><small>演示绑定信息</small><b>${smartEntry.result.containerId}</b></div>`:''}<p class="smart-demo-note">Demo 模拟识别；尚未连接真实硬件。</p><p id="record-error" role="alert"></p></div><button class="record-save" data-action="${smartEntry.result?'applySmartEntry':'recognizeSmartEntry'}">${smartEntry.result?'确认绑定':'演示识别'}</button>${smartEntry.result?'':'<button class="popup-next" data-action="failSmartEntry">演示未识别</button>'}</section>`;}
function accessorySettingsHTML(){return `<div class="card accessory-settings"><h3>Momcozy 智能配件</h3><p>识别入口按开关显示，手动填写和吸奶记录始终保留。</p>${[['bags','奶袋扫码','https://momcozy.com/products/breastmilk-storage-bags'],['fridge','小冰箱碰一碰',null]].map(([key,label,url])=>`<div class="stage-setting-row"><b>${label}</b><div class="accessory-row-actions">${url?`<a class="accessory-buy" href="${url}" target="_blank" rel="noopener noreferrer">购买</a>`:'<button class="accessory-buy" data-action="fridgePurchase">购买</button>'}<button class="stage-switch ${state.preferences.accessories[key]?'on':''}" role="switch" aria-label="${label}" aria-checked="${state.preferences.accessories[key]}" data-action="toggleAccessory" data-accessory="${key}"><span></span></button></div></div>`).join('')}</div>`;}
function openQuickTake(kind){recordKind=null;current='take';tab='首页';view='take-form';timerExpanded=false;state.takeSource=kind==='frozen'?'frozen':'cold';state.takeLegacyFrozenId=null;openRecord('transaction');editorDraft={stockKind:state.takeSource,bottleId:null,batchId:null,volume:'',enableWarm:state.preferences.warmReminder!==false,takeFromEntry:true};render();}
function takeFieldsHTML(){const frozen=editorDraft.stockKind==='frozen',selected=editorDraft.bottleId||editorDraft.batchId;let fields='';
 if(!frozen){const containers=[...state.bottles.filter(b=>b.amount>0).map(b=>({id:b.id,name:b.name,amount:b.amount,kind:'cold'})),...state.looseBatches.filter(b=>b.amount>0).map((b,i)=>({id:b.id,name:'单瓶 '+(i+1),amount:b.amount,kind:'batch'}))];fields='<label class="card-label">取用容器（必选）</label><div class="take-container-options">'+containers.map(b=>`<button data-take-container="${b.id}" data-stock-kind="${b.kind}" class="${selected===b.id?'active':''}"><span>${b.name}</span><b>${b.amount} <small>mL</small></b></button>`).join('')+'</div>';if(!containers.length)fields+='<p class="editor-instruction">暂无冷藏库存。</p>';}
 let amount=amountField('volume',editorDraft.volume,'本次取用奶量');if(!frozen&&!selected)amount=amount.replace('id="volume"','id="volume" disabled');

 fields+=amount;if(frozen)fields+=`<p class="take-autofill-hint" aria-live="polite">${editorDraft.frozenRecordId?'已带入奶袋 '+editorDraft.legacyContainerId:editorDraft.takeAutofillEdited?'奶量已修改，按手动取用登记':state.preferences.accessories.bags?'扫码可自动填写登记奶量':''}</p>`;
 if(frozen&&state.preferences.accessories.bags)fields+='<button class="take-scan-fill" data-action="fillFrozenFromScan" aria-label="扫一扫奶袋填入数据" title="Demo 模拟扫码"><img src="../assets/ms-scan.svg" alt="">扫一扫奶袋填入数据</button>';
 fields+=`<label class="warming-toggle"><input type="checkbox" data-draft="enableWarm" ${editorDraft.enableWarm?'checked':''}>取用后打开温奶工具</label>`;return fields;}

function applyScannedTake(code){const r=window.parent.__milkStoragePrototype.records.find(r=>r.storage==='Frozen'&&r.containerId===code);if(!r){fail('没有找到这只奶袋的库存记录');return false;}const ml=r.mlAmount??Math.round(r.volume*29.5735);if(ml>state.frozen){fail('剩余冷冻奶量不足，请先核对手动取用记录');return false;}recordKind='transaction';editorDraft.stockKind='frozen';editorDraft.frozenRecordId=r.id;editorDraft.legacyContainerId=r.containerId;editorDraft.legacyFrozenLimit=ml;editorDraft.volume=ml;state.takeLegacyFrozenId=r.id;state.takeSource='frozen';editorError='';const input=$('#volume');if(input){input.value=ml;input.closest('.capacity-input').style.setProperty('--fill',Math.min(100,ml/(state.preferences.singleInputMax||500)*100)+'%');const hint=$('.take-autofill-hint');if(hint)hint.textContent='已带入奶袋 '+r.containerId;$('#record-error').textContent='';}else render();return true;}
function freezeContainers(){return [...state.bottles.filter(b=>b.amount>0),...state.looseBatches.filter(b=>b.amount>0).map((b,i)=>({...b,name:'单瓶 '+(i+1)}))];}
function freezeContainer(id){return bottleById(id)||looseBatch(id);}
function pumpRecordEntryHTML(){return '<button class="admission-source-button" data-action="pickPump"><span>选择吸奶记录</span><span aria-hidden="true">›</span></button>';}
function editorHTML(){
 if(recordKind==='measure'&&smartEntry)return smartAccessoryEditorHTML();
 if(recordKind==='measure'&&dateEditing)return dateEditorHTML();
 let title='',fields='',button='保存';
 if(recordKind==='fridge-purchase'){title='购买小冰箱';fields='<p class="editor-instruction">配套小冰箱商品详情页待配置。请在确认型号后接入购买链接。</p>';button='关闭';
 }else if(recordKind==='restart-timer'){title='重新计时？';fields=`<p class="editor-instruction">重新开始${editorDraft.timerKind==='cool'?'降温':'升温'}计时后，当前计时进度将清零。</p>`;button='确认重新计时';
 }else if(recordKind==='cooling-tasks'){title='降温任务';fields=state.coolingTasks.map(t=>`<button class="cooling-task-row ${t.id===state.activeCoolingId?'active':''}" data-cooling-task="${t.id}"><span><b>${time(looseBatch(t.batchId)?.oldest||t.start)} · ${t.volume} mL</b><small>独立降温任务</small></span><strong data-task-clock="${t.id}">${coolingTaskLabel(t)}</strong></button>`).join('');button='关闭';
 }else if(recordKind==='pump-history'){
  title='吸奶记录';fields=state.pumpRecords.slice().sort((a,b)=>b.at-a.at).map(p=>`<button class="pump-history-row" data-pump-id="${p.id}" ${p.stored?'disabled':''}><span><b>${new Date(p.at).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})} ${time(p.at)}</b><small>${p.stored?'已入库':'待入库'} · 左 ${p.left??'--'} / 右 ${p.right??'--'} mL</small></span><strong>${p.total}<small> mL</small></strong></button>`).join('');button='关闭';
 }else if(recordKind==='measure'){
  title=editorDraft.storage==='Frozen'?'冷冻入库':editorDraft.storageZone==='mini'?'小冰箱冷藏入库':'冷藏入库';button=editorDraft.storage==='Frozen'?'冷冻并保存':'保存到冰箱冷藏';
  fields=`${editorDraft.storage==='Frozen'?'':pumpRecordEntryHTML()+'<p class="pump-fill-hint">选择记录后，自动填写入库信息。</p>'}${smartEntryButtons()}${dateTimeField()}${amountField('total',editorDraft.total,'奶量')}<button class="split-input-toggle" data-action="toggleMilkSides" aria-expanded="${!!editorDraft.splitInput}" aria-controls="milk-side-fields">${editorDraft.splitInput?'收起左右填写':'按左右分别填写'} <span aria-hidden="true">${editorDraft.splitInput?'−':'＋'}</span></button><div id="milk-side-fields" class="card-sides" ${editorDraft.splitInput?'':'hidden'}><div>${amountField('left',editorDraft.left,'左侧')}</div><div>${amountField('right',editorDraft.right,'右侧')}</div></div><label class="warming-toggle"><input type="checkbox" data-draft="enableCooling" ${editorDraft.enableCooling?'checked':''}>开启降温计时</label>${editorDraft.enableCooling?'<p class="cooling-placement">保存后确认放入冰箱，再开始预估降温计时。</p>':''}`;
 }else if(recordKind==='cool'){
  title='降温计时';const volume=Number(editorDraft.volume),estimate=coolingEstimate(volume,state.preferences.fridgeTemperature);
  fields=`${editorDraft.fromAdmission?'<p class="editor-instruction">本次入库信息已带入，请确认已放入冰箱。</p>':`<label class="card-label">选择刚入库的记录，或直接填写奶量</label><div class="cool-source-options">${state.looseBatches.filter(b=>b.amount>0&&!b.storageLocation&&!state.coolingTasks.some(t=>t.batchId===b.id&&!t.notified)).slice(-4).reverse().map(b=>`<button data-cool-source="${b.id}" class="${editorDraft.batchId===b.id?'active':''}">${time(b.oldest)} · ${b.amount} mL</button>`).join('')}<button data-action="manualCooling" class="${!editorDraft.batchId?'active':''}">自由输入</button></div>`}${editorDraft.needsVolume?amountField('volume',editorDraft.volume,'本次降温奶量'):''}<div class="estimate-data"><span>奶量 <b id="cool-volume">${volume||'--'} mL</b></span><span>初始奶温 <b>37°C</b></span><span>冰箱温度 <b>${state.preferences.fridgeTemperature}°C</b></span></div><div class="estimate-result">预估需要 <b id="cool-estimate">${estimate?estimate+' 分钟':'--'}</b></div>`;
  button='已放入冰箱，开始计时';
 }else if(recordKind==='warm'){
  title='升温小工具';const estimate=warmingEstimate(editorDraft);
  fields=`<div class="estimate-data warm-overview"><span>本次奶量<b>${editorDraft.volume} mL</b></span><span>预估需要<b id="warm-estimate-value">${estimate?estimate+' 分钟':'--'}</b></span></div><div class="temperature-wheels">${wheel('warmCurrent',editorDraft.warmCurrent,'当前奶温')}${wheel('warmTarget',editorDraft.warmTarget,'目标奶温')}</div><label class="card-label" for="warm-bath">水浴环境温度</label><div class="bath-temperature-input"><input id="warm-bath" data-draft="warmBath" type="number" min="1" max="40" value="${editorDraft.warmBath}"><span>°C<span id="bath-recommendation" ${Number(editorDraft.warmBath)===40?'':'hidden'}>（推荐）</span></span></div><p class="temperature-guidance">建议水浴不超过 40°C；喂前检查实际奶温。</p><p id="warm-estimate-error" class="warm-estimate-error">${editorDraft.warmCurrent<0?'请先解冻并填写实际奶温':''}</p><p class="warm-estimate-note">时长自动计算，仅为估算，会受容器等因素影响。</p>`;button='开始升温计时';
 }else if(recordKind==='bottle-adjust'){
  const b=bottleById(editorDraft.bottleId);title=b.name;fields=amountField('volume',editorDraft.volume,'瓶内总奶量')+`<div class="card-target">瓶子容量 ${b.capacity} mL</div>`;
 }else{
  title={mix:'集中存储',take:'确认取用',feed:'登记喂养量',finish:'余奶冷冻'}[current];
  fields=amountField('volume',editorDraft.volume,{mix:'本次汇入',take:'本次取用',feed:'实际喝掉',finish:'冷冻奶量'}[current]);
  if(current==='mix'&&state.lastMixedBottleId&&state.small===0)fields+=`<button class="pick-pump-button" data-action="openBottleAdjust">修改瓶内总量</button>`;
  if(current==='mix')fields=`<label class="card-label">选择来源瓶（必选）</label><div class="loose-batch-options">${looseBatchOptions()}</div>`+fields;
  if(current==='mix')fields+=`<p id="mix-source-hint" class="mix-source-hint">${editorDraft.batchId||editorDraft.sourceBottleId?'按本次汇入量扣减来源瓶，汇入全部奶量后移除该瓶。':'请先选择来源瓶'}</p><p class="editor-instruction">温热新奶请先单独冷却，再与冷藏奶混合。</p><label class="card-label bottle-label">存入哪个瓶子</label>${bottleOptions()}${editorDraft.capacityNotice?`<p class="capacity-notice" role="status">${editorDraft.capacityNotice}</p>`:''}`;
  if(current==='take'&&editorDraft.stockKind==='frozen')fields+='<p class="editor-instruction">升温前请先安全解冻，再按实际奶温调整当前温度。</p>';
  if(current==='take')fields=takeFieldsHTML();
  if(current==='feed')fields=`<label class="card-label">喂养来源</label><div class="feeding-sources">${[['direct','亲喂'],['inventory','库存母乳'],['formula','奶粉']].map(([id,label])=>`<button data-feed-source="${id}" aria-pressed="${editorDraft.feedSource===id}" class="${editorDraft.feedSource===id?'active':''}">${label}</button>`).join('')}</div><div class="feeding-amount">${fields}</div><p id="feeding-source-hint" class="feeding-hint">${feedingSourceHint()}</p>`;
  if(current==='finish')fields=`<div class="freeze-sources"><button data-freeze-source="pool" class="${editorDraft.freezeSource==='pool'?'active':''}">今日冷藏余奶</button><button data-freeze-source="fresh" class="${editorDraft.freezeSource==='fresh'?'active':''}">未入库母乳</button></div>${fields}`;
  if(current==='mix'&&addingBottle)fields+=`<div class="new-bottle-form"><label for="new-capacity">存储瓶容量 · mL</label>${capacityInput('new-capacity',editorDraft.newCapacity||600,'newCapacity')}<button data-action="saveBottle">新增存储瓶</button></div>`;
  button={mix:'已汇总',take:'确认取用',feed:'保存喂养量',finish:'确认已冷冻'}[current];
 }
 if(recordKind==='measure'&&editorDraft.storage==='Frozen'){fields=`<div class="admission-source-options">${pumpRecordEntryHTML()}<button class="admission-source-button" data-admission-source="stock"><span>将冷藏剩余冷冻</span><span aria-hidden="true">›</span></button></div>${editorDraft.freezeBottleId?`<div class="bottle-options">${freezeContainers().map(b=>`<button data-freeze-bottle="${b.id}" class="${editorDraft.freezeBottleId===b.id?'active':''}"><b>${b.name}</b><span>${b.amount} mL</span></button>`).join('')}</div>`:''}`+fields;}
 if(recordKind==='measure'&&editorDraft.storage==='Frozen')fields=fields.replace(/<button class="pick-pump-button"[\s\S]*?<\/button><p class="pump-fill-hint"[\s\S]*?<\/p>/,'');
 if(recordKind==='measure'&&editorDraft.storage==='Frozen')fields=fields.replace(/<label class="warming-toggle"[\s\S]*?<\/label>/g,'').replace(/<p class="cooling-placement"[\s\S]*?<\/p>/g,'');
if(recordKind==='measure'&&editorDraft.storageZone==='mini')fields=fields.replace(/<label class="warming-toggle"[\s\S]*?<\/label>/g,'').replace(/<p class="cooling-placement"[\s\S]*?<\/p>/g,'');
 const tapSave=recordKind==='measure'&&editorDraft.storage!=='Frozen'&&state.preferences.accessories.fridge?'<div class="nfc-storage-hint" role="note" aria-label="近场保存提示"><img src="../assets/figma-device-r3/device-icon.svg" alt=""><div><b>将手机靠近小冰箱的 NFC 标识</b><p>识别后自动保存，并关闭当前页面。</p></div></div>':'';
 const nextButton=recordKind==='warm'?'<button class="popup-next" data-action="skipWarming">暂不升温</button>':recordKind==='restart-timer'?'<button class="popup-next" data-action="closeRecord">取消</button>':recordKind==='transaction'&&current==='finish'?'<button class="popup-next" data-action="closeRecord">完成</button>':'';
 return `<section id="milk-flow-record-dialog" class="inline-record record-popup" role="dialog" aria-modal="true" aria-labelledby="record-title"><header><h2 id="record-title">${title}</h2><button id="record-dismiss" data-action="closeRecord" aria-label="关闭弹窗">×</button></header><div class="record-fields">${fields}<p id="record-error" role="alert">${editorError}</p></div>${tapSave}<button class="record-save" data-action="commitRecord" ${recordKind==='measure'&&editorDraft.storageZone==='mini'?'hidden':''} ${addingBottle?'disabled':''}>${button}</button>${nextButton}</section>`;
}
function controls(){return balanceHTML();}
function openRecord(kind,options={}){
 if(recordKind===kind)return;
 recordKind=kind;smartEntry=null;dateEditing=false;addingBottle=false;showPumpPicker=false;editorError='';
 const bottleId=state.selectedBottleId||state.bottles[0]?.id;
 if(kind==='restart-timer')editorDraft={timerKind:current,timerId:current==='cool'?state.timer?.id:null,warmStart:state.warm};
 else if(kind==='pump-history'||kind==='cooling-tasks')editorDraft={};
 else if(kind==='measure'){const pending=pendingPump();editorDraft={storage:current==='finish'?'Frozen':'Refrigerated',pumpRecordId:pending?.id||null,pumpAt:pending?dateInput(pending.at):dateInput(Date.now()),left:pending?.allocated?'':pending?.left??'',right:pending?.allocated?'':pending?.right??'',total:pending?pendingVolume(pending):'',storageZone:state.admissionZone||'fridge',enableCooling:state.pinned.includes(1)};}
 else if(kind==='cool'){const batch=options.batchId?looseBatch(options.batchId):null;editorDraft={batchId:batch?.id||null,volume:batch?.amount||'',needsVolume:!batch,fromAdmission:!!options.fromAdmission};}
 else if(kind==='warm'){editorDraft={volume:state.lastTakeVolume||state.portion,warmCurrent:state.takeSource==='frozen'?-18:Math.round(state.lastTakeTemperature??state.preferences.fridgeTemperature),warmTarget:37,warmBath:40};editorDraft.warmMinutes=warmingEstimate(editorDraft)||'';}
 else if(kind==='bottle-adjust'){const b=bottleById(state.lastMixedBottleId);editorDraft={bottleId:b.id,volume:b.amount};}
 else {editorDraft={batchId:current==='take'&&state.takeSource==='batch'?state.takeBatchId:defaultLooseBatch()?.id,volume:current==='mix'?(defaultLooseBatch()?.amount||''):current==='finish'?(state.pool||state.small||pendingVolume(pendingPump())||''):current==='feed'?(state.portion?Math.min(80,state.portion):''):Math.min(90,state.takeSource==='frozen'?state.frozen:state.takeSource==='batch'?looseBatch(state.takeBatchId)?.amount||0:bottleById(bottleId)?.amount||0),bottleId,feedSource:state.portion?'inventory':'direct',freezeSource:state.pool?'pool':'fresh',stockKind:state.takeSource||'cold',enableWarm:state.preferences.warmReminder!==false,warmCurrent:state.takeSource==='frozen'?-18:Math.round(state.lastTakeTemperature??state.preferences.fridgeTemperature),warmTarget:37,warmMinutes:5};if(current==='mix')chooseMixBottle();}
 if(kind==='measure')editorDraft.splitInput=false;
 render();
}
function closeRecord(){if(editorDraft.takeFromEntry&&!smartEntry&&!dateEditing){recordKind=null;editorError='';window.parent.milkFlowIntegration?.returnToTakeEntry();return;}if(smartEntry){smartEntry=null;render();return;}if(dateEditing){dateEditing=false;render();return;}recordKind=null;editorError='';addingBottle=false;render();$('.single-center button')?.focus({preventScroll:true});}
function fail(message){editorError=message;$('#record-error').textContent=message;return false;}
function consumeBottles(amount,preferred){
 const list=[...state.bottles].sort((a,b)=>a.id===preferred?-1:b.id===preferred?1:(a.oldest||0)-(b.oldest||0));
 for(const b of list){const taken=Math.min(amount,b.amount);b.amount-=taken;amount-=taken;if(!amount)break;}
 syncPool();
}
function commitRecord(){
 if(recordKind==='fridge-purchase'){closeRecord();return;}
 if(recordKind==='restart-timer'){const now=Date.now();if(editorDraft.timerKind==='cool'){const task=state.coolingTasks.find(t=>t.id===editorDraft.timerId);if(!task){closeRecord();toast('该计时已结束');return;}state.timerNotices=state.timerNotices.filter(n=>n.timerId!==task.id);const duration=task.end-task.start;task.start=now+10000;task.end=task.start+duration;task.started=false;task.notified=false;state.activeCoolingId=task.id;refreshCoolingSelection();current='cool';}else if(state.warm&&state.warm===editorDraft.warmStart){clearNotices('take');state.warm=now;state.warmEnd=now+(state.warmConfig?.minutes||5)*60000;state.warmNotified=false;current='take';}else{closeRecord();toast('该计时已结束');return;}recordKind=null;timerExpanded=true;save();render();return;}

 if(!recordKind)return;let feedNotice='';
 if(recordKind==='pump-history'||recordKind==='cooling-tasks'){closeRecord();return;}
 if(recordKind==='warm'){
  editorDraft.warmMinutes=warmingEstimate(editorDraft)||'';
  if(!Number.isFinite(Number(editorDraft.warmMinutes))||Number(editorDraft.warmMinutes)<=0||Number(editorDraft.warmMinutes)>120){fail('当前条件无法得到有效的预估时间，请核对奶量和温度');return;}
  if(!warmingEstimate(editorDraft)){fail('请填写解冻后的实际奶温，目标奶温须高于当前奶温，水浴温度须高于目标奶温且不超过 40°C');return;}
  if(Number(editorDraft.warmBath)>40){fail('水浴温度不能超过 40°C');return;}
  if(editorDraft.warmTarget<editorDraft.warmCurrent){fail('目标温度不能低于当前温度');return;}
  startWarmTimer();timerExpanded=true;recordKind=null;view='workspace';save();render();return;
 }
 if(current==='take'&&recordKind==='transaction'&&editorDraft.stockKind!=='frozen'&&!editorDraft.bottleId&&!editorDraft.batchId){fail('请先选择取用容器');return;}
 const raw=recordKind==='measure'?editorDraft.total:editorDraft.volume,value=Number(raw);
 if(raw===''||!Number.isFinite(value)||value<0){fail('请填写有效奶量');return;}
 if(recordKind==='measure'){
  const at=new Date(editorDraft.pumpAt).getTime();if(!Number.isFinite(at)){fail('请填写吸奶时间');return;}
  if(value<=0){fail('入库奶量应大于 0');return;}
  const freezeBottle=editorDraft.storage==='Frozen'&&editorDraft.freezeBottleId?freezeContainer(editorDraft.freezeBottleId):null;if(editorDraft.freezeBottleId&&(!freezeBottle||value>freezeBottle.amount)){fail('分装量不能超过所选冷藏瓶');return;}
  let source=state.pumpRecords.find(p=>p.id===editorDraft.pumpRecordId);
  if(source?.stored){fail('这条吸奶记录已入库，请选择待入库记录');return;}
  const left=Number(editorDraft.left),right=Number(editorDraft.right),validSides=editorDraft.left!==''&&editorDraft.right!==''&&left>=0&&right>=0&&Number.isFinite(left)&&Number.isFinite(right)&&Math.abs(left+right-value)<.01;
  const milk={at,total:value,left:validSides?left:null,right:validSides?right:null};
  if(!freezeBottle){
  if(!source){source={id:'pump-'+Date.now(),...milk,stored:false};state.pumpRecords.push(source);}
  if(source.allocated>0){if(value>pendingVolume(source)){fail(`这条吸奶记录还剩 ${pendingVolume(source)} mL 待入库`);return;}source.allocated+=value;source.stored=pendingVolume(source)===0;}else Object.assign(source,milk,{stored:true,allocated:value});source.storedAt=Date.now();state.selectedPendingPumpId=null;}else{if(looseBatch(freezeBottle.id))consumeLoose(value,freezeBottle.id);else{freezeBottle.amount-=value;syncPool();}}
  state.pump={...milk,source:'入库登记'};
  if(editorDraft.storage==='Frozen'){state.frozen+=value;state.lastFrozenAdmission={id:'flow-frozen-'+Date.now(),amount:value,oldest:freezeBottle?.oldest||at,containerId:editorDraft.smartAssociation?.containerId};record('finish',`冷冻入库 ${value} mL`);}
  else{const admittedBatch=newLooseBatch(value,at);state.lastAdmissionBatchId=admittedBatch.id;admittedBatch.storageZone=editorDraft.smartAssociation?.slotId?'mini':'fridge';if(editorDraft.smartAssociation)Object.assign(admittedBatch,{storageLocation:editorDraft.smartAssociation.slotId,deviceId:editorDraft.smartAssociation.deviceId,smartMethod:editorDraft.smartAssociation.method});record('measure',`冷藏入库 ${value} mL`);if(editorDraft.smartAssociation?.slotId){beginCooling(admittedBatch);reportDeviceCooling({batchId:admittedBatch.id,temperature:editorDraft.smartAssociation.temperature??18,remainingSeconds:editorDraft.smartAssociation.remainingSeconds??900,ready:editorDraft.smartAssociation.ready===true});}}

 }else if(recordKind==='cool'){
  if(value<=0){fail('请先填写总奶量');return;}
  let batch=looseBatch(editorDraft.batchId);
  if(editorDraft.needsVolume)batch={id:'manual-cool-'+Date.now(),amount:value,oldest:Date.now(),toolOnly:true};
  if(!batch){fail('这批奶已取用，请重新选择');return;}beginCooling(batch);timerExpanded=true;
 }else if(recordKind==='bottle-adjust'){
  const b=bottleById(editorDraft.bottleId);if(value>b.capacity){fail(`不能超过瓶子容量 ${b.capacity} mL`);return;}b.amount=value;syncPool();record('adjust',`${b.name}总量修正为 ${value} mL`);
 }else if(current==='mix'){
  if(value<=0){fail('请填写大于 0 的汇入量');return;}const selectedBatch=editorDraft.sourceBottleId?bottleById(editorDraft.sourceBottleId):looseBatch(editorDraft.batchId);if((editorDraft.batchId||editorDraft.sourceBottleId)&&(!selectedBatch||value>selectedBatch.amount)){fail(`本批可汇入奶量为 ${selectedBatch?.amount||0} mL`);return;}chooseMixBottle();const b=bottleById(editorDraft.bottleId);
  if(!b||b.capacity-b.amount<value){fail('存储瓶容量不足，请新增瓶子');render();return;}
  if(!selectedBatch){fail('请先选择本次汇入的来源瓶');return;}
  const batch=selectedBatch;if(batch.id===b.id){fail('来源瓶和汇总瓶不能相同');return;}b.oldest=b.amount>0?Math.min(b.oldest||batch.oldest,batch.oldest):batch.oldest;b.amount+=value;if(editorDraft.sourceBottleId){batch.amount-=value;}else consumeLoose(value,batch.id);state.pendingMixBatchId=null;state.lastMixedBottleId=b.id;state.selectedBottleId=b.id;syncPool();record('mix',`汇入${b.name} · ${value} mL`);
 }else if(current==='take'){
  const b=bottleById(editorDraft.bottleId),available=editorDraft.stockKind==='frozen'?Math.min(state.frozen,editorDraft.legacyFrozenLimit??Infinity):editorDraft.stockKind==='batch'?looseBatch(editorDraft.batchId)?.amount||0:b?.amount||0;if(value<=0||value>available){fail('取用量不能超过可用库存');return;}
  if(editorDraft.stockKind==='frozen'&&editorDraft.legacyFrozenLimit!==undefined&&value!==editorDraft.legacyFrozenLimit){fail('冷冻奶袋需要整袋取用');return;}
  if(editorDraft.stockKind==='frozen'){state.frozen-=value;if(!editorDraft.frozenRecordId){state.manualFrozenTaken=(state.manualFrozenTaken||0)+value;state.takeLegacyFrozenId=null;}}else if(editorDraft.stockKind==='batch'){consumeLoose(value,editorDraft.batchId);}else{b.amount-=value;syncPool();}state.portion+=value;if(b)state.selectedBottleId=b.id;
  const miniSource=b?.storageLocation||state.looseBatches.find(x=>x.id===editorDraft.batchId)?.storageLocation;state.lastTakeTemperature=miniSource?(state.preferences.miniFridgeTemperature??4):state.preferences.fridgeTemperature;state.lastTakeVolume=value;state.warmPending=editorDraft.enableWarm?{volume:value,source:editorDraft.stockKind}:null;
  record('take',`取用 ${value} mL`,{volume:value,storage:editorDraft.stockKind==='frozen'?'Frozen':'Refrigerated',containerId:editorDraft.legacyContainerId,unlinkedFrozen:editorDraft.stockKind==='frozen'&&!editorDraft.frozenRecordId,sourceId:editorDraft.stockKind==='frozen'?editorDraft.frozenRecordId:editorDraft.batchId||editorDraft.bottleId,sourceName:editorDraft.stockKind==='batch'?'单瓶':b?.name});
 }else if(current==='feed'){
  if(value<=0){fail('请填写大于 0 的喂养量');return;}
  const source=editorDraft.feedSource||'direct',sourceName={direct:'亲喂',inventory:'库存母乳',formula:'奶粉'}[source];let deducted=0;
  if(source==='inventory'){
   let needed=value;const taken=Math.min(needed,state.portion);state.portion-=taken;needed-=taken;
   const cold=Math.min(needed,state.pool);if(cold)consumeBottles(cold,state.selectedBottleId);needed-=cold;
   const loose=Math.min(needed,state.small);if(loose)consumeLoose(loose);needed-=loose;
   const frozen=Math.min(needed,state.frozen);state.frozen-=frozen;needed-=frozen;deducted=value-needed;
   if(needed>0)feedNotice=`喂养已登记，奶仓不足 ${needed} mL，请核对喂养来源或补充库存记录`;
  }
  state.intake+=value;record('feed',`实际摄入 ${value} mL · ${sourceName}`);Object.assign(state.events[0],{feedSource:source,amount:value,inventoryDeducted:deducted});
 }else if(current==='finish'){
  if(value<=0){fail('请填写大于 0 的冷冻奶量');return;}
  if(editorDraft.freezeSource==='pool'){if(value>state.pool){fail(`冷藏余奶为 ${state.pool} mL`);return;}consumeBottles(value);}
  else {
   if(state.small>0){if(value>state.small){fail(`本次已入库奶量为 ${state.small} mL`);return;}consumeLoose(value);}
   else {const pending=pendingPump();if(pending){if(value>pendingVolume(pending)){fail(`这条吸奶记录还剩 ${pendingVolume(pending)} mL 待入库`);return;}pending.allocated=(pending.allocated||0)+value;pending.stored=pendingVolume(pending)===0;pending.storedAt=Date.now();state.selectedPendingPumpId=null;}else state.pumpRecords.push({id:'pump-'+Date.now(),total:value,left:null,right:null,at:Date.now(),stored:true,allocated:value});}
  }
  state.frozen+=value;record('freeze',`冷冻 ${value} mL`);
 }
 const completedKind=recordKind,completedStage=current,enableCooling=editorDraft.storage!=='Frozen'&&(editorDraft.enableCooling||editorDraft.smartAssociation?.slotId);
 recordKind=null;editorError='';save();
 if(completedKind==='measure'&&enableCooling){select('cool');if(!editorDraft.smartAssociation?.slotId)openRecord('cool',{batchId:state.lastAdmissionBatchId,fromAdmission:true});}
 else if(completedKind==='transaction'&&completedStage==='mix'){timerExpanded=false;select('take');timerExpanded=false;render();}
 else if(completedKind==='transaction'&&completedStage==='feed'){select('measure');}
 else if(completedKind==='transaction'&&completedStage==='take'){const fromEntry=editorDraft.takeFromEntry;current='take';tab='首页';view=fromEntry?'take-form':'workspace';timerExpanded=false;if(editorDraft.enableWarm){openRecord('warm');editorDraft.takeFromEntry=fromEntry;render();}else if(fromEntry)window.parent.milkFlowIntegration?.returnToTakeEntry();else render();}
 else render();
 if(feedNotice)toast(feedNotice);
}
function workspace(){return `${dial()}${controls()}`;}
function singleInputSettingHTML(){return `<div class="card preference-card"><h3>单次最大输入量</h3><label for="pref-single-input">滑动范围 · mL</label><div><input id="pref-single-input" type="number" inputmode="numeric" min="1" step="1" value="${state.preferences.singleInputMax||500}"><button data-action="saveSingleInput">保存</button></div><p>用于滑动调节和填充显示，手动输入不受限制。入库总奶量使用此值，左右分别使用它的 50%。</p><p id="single-input-status" role="status"></p></div>`;}
function allHTML(){return `<div class="tool-top"><button class="text-btn" data-action="global">← 我的奶仓</button></div><h1 class="settings-title">环节设置</h1><p class="settings-description">打开开关，在圆环显示该环节。</p><div class="stage-settings">${steps.map((s,i)=>`<div class="stage-setting-row"><div><b>${s.name}</b>${requiredStages.includes(i)?'<small>必备环节 · 始终显示</small>':''}</div><button class="stage-switch ${state.pinned.includes(i)?'on':''}" role="switch" aria-checked="${state.pinned.includes(i)}" aria-label="显示${s.name}" data-pin="${i}" ${requiredStages.includes(i)?'disabled':''}><span></span></button></div>`).join('')}</div>${singleInputSettingHTML()}${accessorySettingsHTML()}<div class="card preference-card"><h3>冰箱温度</h3><label for="pref-fridge">冷藏环境温度 · °C</label><div><input id="pref-fridge" type="number" min="0" max="10" step="0.5" value="${state.preferences.fridgeTemperature}"><button data-action="saveFridge">保存</button></div><p id="preference-status" role="status"></p></div><div class="card preference-card"><h3>Momcozy 小冰箱设置温度</h3><label for="pref-mini-fridge">设置温度 · °C</label><div><input id="pref-mini-fridge" type="number" min="0" max="10" step="0.5" value="${state.preferences.miniFridgeTemperature??4}"><button data-action="saveMiniFridge">保存</button></div><p id="mini-preference-status" role="status"></p></div><button class="survey-again" data-action="flowRecords">喂养与流转记录 <span>›</span></button><button class="survey-again" data-action="surveyAgain">使用习惯与智能配件问卷 <span>›</span></button><p class="settings-description">关闭入口不会取消正在运行的计时，也不会删除记录。</p>`;}

function warehouse(){return `<button class="text-btn" data-action="global">← 待用奶</button><h2>冻奶库</h2><div class="quantity">${state.frozen}<small> mL</small></div>`;}
function render(){
 const oldRingPaths=new Map([...document.querySelectorAll('.stage-path path')].map((p,i)=>[p.id||p.dataset.step||'path-'+i,{d:p.getAttribute('d'),width:getComputedStyle(p).strokeWidth}]));
 const modalWasOpen=!$('#interaction-layer').classList.contains('hidden'),focusId=document.activeElement?.id,modalScroll=$('.record-fields')?.scrollTop||0,pageScroll=$('#page').scrollTop,focusWasInPopup=!!document.activeElement?.closest('.record-popup'),externalTextFocus=!!document.activeElement?.matches('textarea,[contenteditable="true"]');
 renderPage();$('#page').scrollTop=pageScroll;
 $('#overlay').classList.add('hidden');
 $('#interaction-layer').classList.toggle('hidden',!recordKind);$('#interaction-layer').innerHTML=recordKind?`<div class="popup-scrim" data-action="closeRecord"></div>${editorHTML()}`:'';
 for(const el of [$('#page'),$('.app-header'),$('.bottom-nav'),$('#resume')])el.inert=false;
 if(recordKind){if(document.hasFocus()&&!externalTextFocus&&(!modalWasOpen||focusWasInPopup)){if(modalWasOpen&&focusId&&document.getElementById(focusId))document.getElementById(focusId).focus({preventScroll:true});else $('#record-dismiss').focus({preventScroll:true});}$('.record-fields').scrollTop=modalScroll;}
 const signature=`${view}:${current}:${timerMode()}`;
 if(signature!==ringSignature&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const progress=$('#timer-progress'),gap=360/state.pinned.length,index=state.pinned.indexOf(steps.findIndex(s=>s.id===current));
  if(progress){$('.stage-path')?.animate([{visibility:'visible',opacity:1},{visibility:'hidden',opacity:0}],{duration:650,easing:'ease-out'});progress.animate([{strokeDasharray:`${circumference*(gap-12)/360} ${circumference}`,transform:`rotate(${index*gap+6-90}deg)`,opacity:.5},{strokeDasharray:`${circumference} ${circumference}`,transform:'rotate(-90deg)',opacity:1}],{duration:800,easing:'cubic-bezier(.22,1,.36,1)'});}
  else $('.active-stage')?.animate([{opacity:.3},{opacity:1}],{duration:380,easing:'ease-out'});
 }
 if(signature!==ringSignature&&!timerMode()&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  document.querySelectorAll('.stage-path path').forEach((p,i)=>{const previous=oldRingPaths.get(p.id||p.dataset.step||'path-'+i),d=p.getAttribute('d');if(previous&&d&&previous.d!==d)p.animate([{d:`path("${previous.d}")`,strokeWidth:previous.width},{d:`path("${d}")`,strokeWidth:getComputedStyle(p).strokeWidth}],{duration:600,easing:'cubic-bezier(.22,1,.36,1)'});});
 }
 ringSignature=signature;
 document.querySelectorAll('.time-picker').forEach(picker=>{syncTimePicker(picker);picker.querySelectorAll('.time-wheel').forEach(w=>w.addEventListener('scroll',()=>{clearTimeout(w.settleTimer);w.settleTimer=setTimeout(()=>{const n=Math.round(w.scrollTop/44)+Number(w.dataset.timeMin||0);if(n!==Number(w.dataset.value))setTimeWheel(w,n);},120);}));});
 document.querySelectorAll('.temperature-wheel').forEach(w=>{w.scrollTop=(editorDraft[w.id]-wheelMin(w.id))*44;w.addEventListener('scroll',()=>{if(!w.isConnected||document.getElementById(w.id)!==w)return;clearTimeout(w.settleTimer);w.settleTimer=setTimeout(()=>{if(w.isConnected&&document.getElementById(w.id)===w)setWheel(w.id,Math.round(w.scrollTop/44)+wheelMin(w.id));},100);});});
}
function setWheel(id,value){
 if((recordKind!=='warm'&&current!=='take')||!document.getElementById(id))return;
 value=Math.max(wheelMin(id),Math.min(60,value));editorDraft[id]=value;
 if(editorDraft.warmTarget<editorDraft.warmCurrent){editorDraft.warmTarget=editorDraft.warmCurrent;const target=$('#warmTarget');target.scrollTop=editorDraft.warmTarget*44;$('#record-error').textContent='目标温度不能低于当前温度';}else $('#record-error').textContent='';
 if(recordKind==='warm')updateWarmEstimate();
 document.querySelectorAll('.temperature-wheel').forEach(w=>w.querySelectorAll('[data-wheel-value]').forEach(b=>b.setAttribute('aria-selected',Number(b.dataset.wheelValue)===editorDraft[w.id])));
}
function select(id){recordKind=null;timerExpanded=true;current=id;view='workspace';tab='首页';state.seen[id]=true;state.lastTool=id;save();opened=true;render();}
function global(){for(const n of requiredStages)if(!state.pinned.includes(n))state.pinned.push(n);state.pinned.sort((a,b)=>a-b);select('measure');}
function collapse(){recordKind=null;timerExpanded=false;save();render();}
function record(id,label,details={}){state.used[id]=used(id)+1;state.events.unshift({label,at:Date.now(),...details});save();}
function reset(){if(confirm('重置演示奶量、任务与使用记录？')){balanceRange='week';state=initial();state.timerNotices=[];state.coolingTasks=[];state.looseBatches=[];state.batchSequence=0;state.activeCoolingId=null;state.preferences={fridgeTemperature:4,miniFridgeTemperature:4,singleInputMax:500,accessories:{bags:false,fridge:false}};localStorage.removeItem('milk-assistant-demo-flow-accessories');localStorage.removeItem('milk-assistant-demo-flow-single-input-max');state.bottles=[{id:'b1',name:'存储瓶 1',capacity:600,amount:360,oldest:Date.now()}];state.selectedBottleId='b1';state.receipts={};state.pump={left:60,right:60,total:120,at:Date.now(),source:'吸奶器自动记录'};state.pumpRecords=[{id:'pump-demo',...state.pump,stored:false}];state.small=0;state.selectedPendingPumpId=null;habitSurvey={index:0,answers:[],returnToSettings:false};recordKind=null;save();current='measure';tab='首页';view='workspace';opened=true;render();}}
document.addEventListener('input',e=>{
 if(!recordKind||!e.target.dataset.draft)return;
 editorError='';$('#record-error').textContent='';
 const key=e.target.dataset.draft;if(e.target.matches('[data-milk-unit]')&&e.target.value!==''&&Number.isFinite(Number(e.target.value))){e.target.value=milkDisplay(Math.max(0,Number(e.target.value)),e.target.dataset.milkUnit);}if(e.target.closest('.capacity-input')){const field=e.target.closest('.capacity-input');field.style.setProperty('--fill',Math.min(100,Number(e.target.value||0)/Number(field.dataset.capacityReference)*100)+'%');}editorDraft[key]=e.target.type==='checkbox'?e.target.checked:e.target.value;
 if(recordKind==='warm'&&key==='warmBath')updateWarmEstimate();
 if(key==='enableWarm'||key==='enableCooling'){render();return;}
 if(recordKind==='measure'&&['left','right','total'].includes(key))syncMilkSides(key);
 if(key==='volume'&&recordKind==='transaction'&&current==='take'&&editorDraft.stockKind==='frozen'&&editorDraft.frozenRecordId&&Number(editorDraft.volume)!==editorDraft.legacyFrozenLimit){delete editorDraft.frozenRecordId;delete editorDraft.legacyFrozenLimit;delete editorDraft.legacyContainerId;editorDraft.takeAutofillEdited=true;state.takeLegacyFrozenId=null;const hint=$('.take-autofill-hint');if(hint)hint.textContent='奶量已修改，按手动取用登记';}
 if(key==='volume'&&recordKind==='transaction'&&current==='mix'){chooseMixBottle();const notice=$('.capacity-notice');if(notice)notice.textContent=editorDraft.capacityNotice;}
 if(key==='volume'&&recordKind==='cool'){$('#cool-volume').textContent=(Number(editorDraft.volume)||'--')+' mL';const minutes=coolingEstimate(Number(editorDraft.volume),state.preferences.fridgeTemperature);$('#cool-estimate').textContent=minutes?minutes+' 分钟':'--';}
});
document.addEventListener('click',e=>{
 if(Date.now()<suppressCoolingClickUntil&&e.target.closest('.ring-surface'))return;
 const el=e.target.closest('button,[data-step],.popup-scrim');if(!el)return;
 if(el.dataset.timeValue!==undefined){const w=el.closest('.time-wheel');w.scrollTop=(Number(el.dataset.timeValue)-Number(w.dataset.timeMin||0))*44;setTimeWheel(w,Number(el.dataset.timeValue));return;}
 if(el.dataset.coolingPage){state.activeCoolingId=el.dataset.coolingPage;refreshCoolingSelection();coolingRotationAt=Date.now()+6000;save();render();return;}
 if(el.dataset.coolingTask){state.activeCoolingId=el.dataset.coolingTask;refreshCoolingSelection();recordKind=null;select('cool');return;}
 if(el.dataset.looseBatch){editorDraft.sourceBottleId=null;const batch=looseBatch(el.dataset.looseBatch);if(batch){editorDraft.batchId=batch.id;editorDraft.manualMix=false;editorDraft.volume=batch.amount;chooseMixBottle();editorError='';render();}return;}
 if(el.dataset.habitOption!==undefined){habitSurvey.answers[habitSurvey.index]=Number(el.dataset.habitOption);render();return;}
 if(el.dataset.balanceRange){balanceRange=el.dataset.balanceRange;render();return;}
 if(el.dataset.feedSource){updateFeedingSource(el.dataset.feedSource);return;}
 if(el.dataset.freezeSource){editorDraft.freezeSource=el.dataset.freezeSource;editorDraft.volume=editorDraft.freezeSource==='pool'?state.pool:(state.small||pendingVolume(pendingPump())||'');editorError='';render();return;}
 if(el.dataset.tab){recordKind=null;tab=el.dataset.tab;if(tab==='首页')view='workspace';else timerExpanded=false;render();$('#page').scrollTop=0;return;}
 if(el.dataset.fillPump){const p=state.pumpRecords.find(p=>p.id===el.dataset.fillPump&&!p.stored);if(p){state.selectedPendingPumpId=p.id;editorDraft={storage:editorDraft.storage||'Refrigerated',storageZone:editorDraft.storageZone||'fridge',smartAssociation:editorDraft.smartAssociation,pumpRecordId:p.id,pumpAt:dateInput(p.at),left:p.allocated?'':p.left??'',right:p.allocated?'':p.right??'',total:pendingVolume(p),splitInput:false,enableCooling:editorDraft.enableCooling??true};recordKind='measure';view='workspace';showPumpPicker=false;save();render();}return;}
 if(el.dataset.timerId){select(el.dataset.timerId);$('.ring-surface').scrollIntoView({block:'nearest',behavior:'smooth'});return;}
 if(el.dataset.pumpId){const pump=state.pumpRecords.find(p=>p.id===el.dataset.pumpId);if(pump&&!pump.stored){state.selectedPendingPumpId=pump.id;save();recordKind=null;select('measure');}return;}
 if(el.dataset.stockId){current='take';timerExpanded=false;state.takeSource=el.dataset.stockId==='frozen'?'frozen':el.dataset.stockId.startsWith('loose-')?'batch':'cold';if(state.takeSource==='batch')state.takeBatchId=el.dataset.stockId.slice(6);if(state.takeSource==='cold')state.selectedBottleId=el.dataset.stockId;save();openRecord('transaction');return;}
 if(el.dataset.step){openStage(el.dataset.step);return;}
 if(el.dataset.cardDelta){const input=$('#'+el.dataset.field);input.value=Math.max(0,Math.min(5000,Number(input.value)+Number(el.dataset.cardDelta)));input.dispatchEvent(new Event('input',{bubbles:true}));return;}
 if(el.dataset.admissionSource){if(el.dataset.admissionSource==='stock'){const b=freezeContainers()[0];if(!b){fail('暂无冷藏母乳可转冷冻');return;}editorDraft.freezeBottleId=b.id;editorDraft.total=b.amount;editorDraft.pumpAt=dateInput(b.oldest);editorDraft.pumpRecordId=null;}else{editorDraft.freezeBottleId=null;editorDraft.total='';editorDraft.pumpRecordId=null;}render();return;}
 if(el.dataset.freezeBottle){const b=freezeContainer(el.dataset.freezeBottle);editorDraft.freezeBottleId=b.id;editorDraft.total=b.amount;editorDraft.pumpAt=dateInput(b.oldest);render();return;}
 if(el.dataset.mixSource){editorDraft.sourceBottleId=el.dataset.mixSource;editorDraft.batchId=null;editorDraft.volume=bottleById(el.dataset.mixSource).amount;chooseMixBottle();render();return;}
 if(el.dataset.coolSource){const b=looseBatch(el.dataset.coolSource);editorDraft.batchId=b.id;editorDraft.volume=b.amount;editorDraft.needsVolume=false;render();return;}
 if(el.dataset.takeContainer){const kind=el.dataset.stockKind;editorDraft.stockKind=kind;state.takeSource=kind;editorDraft.bottleId=kind==='cold'?el.dataset.takeContainer:null;editorDraft.batchId=kind==='batch'?el.dataset.takeContainer:null;editorDraft.volume='';editorError='';render();return;}
 if(el.dataset.bottle){editorDraft.bottleId=el.dataset.bottle;state.selectedBottleId=el.dataset.bottle;if(current==='mix')chooseMixBottle();save();render();return;}
 if(el.dataset.wheelValue){const w=el.closest('.temperature-wheel');w.scrollTo({top:(Number(el.dataset.wheelValue)-wheelMin(w.id))*44,behavior:'smooth'});setWheel(w.id,Number(el.dataset.wheelValue));return;}
 if(el.dataset.pin!==undefined){const n=Number(el.dataset.pin);if(requiredStages.includes(n))return;if(state.pinned.includes(n)){if(state.pinned.length===1)return;state.pinned=state.pinned.filter(i=>i!==n);}else state.pinned.push(n);state.pinned.sort((a,b)=>a-b);save();render();return;}
 switch(el.dataset.action){
  case 'editDate':dateEditing=true;render();$('.record-fields').scrollTop=0;break;
  case 'doneDate':dateEditing=false;render();break;
  case 'ackTimerNotice':{const notice=state.timerNotices.find(n=>n.id===el.dataset.noticeId&&!n.acknowledged);if(!notice)break;notice.acknowledged=true;if(notice.kind==='cool'){state.pendingMixBatchId=notice.toolOnly?null:notice.batchId;removeCoolingTask(notice.timerId);select(notice.toolOnly?'cool':state.pinned.includes(2)?'mix':'take');}else{state.warm=null;state.warmEnd=null;current='take';timerExpanded=false;tab='首页';view='workspace';save();render();}const nextNotice=latestNotice();if(nextNotice)select(nextNotice.kind);break;}

  case 'saveMiniFridge':{const value=Number($('#pref-mini-fridge').value);if(Number.isFinite(value)&&value>=0&&value<=10){state.preferences.miniFridgeTemperature=value;save();$('#mini-preference-status').textContent='已保存';}else $('#mini-preference-status').textContent='请填写有效设置温度';break;}
  case 'manualCooling':editorDraft.batchId=null;editorDraft.volume='';editorDraft.needsVolume=true;render();break;
  case 'fillFrozenFromScan':{const record=window.parent.__milkStoragePrototype.records.find(r=>r.storage==='Frozen'&&r.containerId);if(!record){fail('暂无已绑定奶袋，请手动输入取用量');break;}applyScannedTake(record.containerId);break;}
  case 'settings':recordKind=null;view='all';tab='首页';timerExpanded=false;render();$('#page').scrollTop=0;break;
  case 'surveyAgain':habitSurvey={index:0,answers:[...(state.habitAnswers||[])],returnToSettings:true};render();$('#page').scrollTop=0;break;
  case 'habitSkip':finishHabitSurvey(true);break;
  case 'habitBack':habitSurvey.index--;render();$('#page').scrollTop=0;break;
  case 'habitNext':{
   if(habitSurvey.answers[habitSurvey.index]===undefined)break;
   if(habitSurvey.index<habitQuestions.length-1){habitSurvey.index++;render();$('#page').scrollTop=0;break;}
   finishHabitSurvey(false);break;
  }

  case 'demoDeviceProgress':reportDeviceCooling({batchId:state.timer.batchId,temperature:12,remainingSeconds:180});break;
  case 'demoDeviceReady':reportDeviceCooling({batchId:state.timer.batchId,temperature:4,ready:true});break;
  case 'coolingTasks':openRecord('cooling-tasks');break;
  case 'addCoolingMilk':select('cool');openRecord('cool');break;
  case 'openMeasure':openRecord('measure');break;
  case 'openCooling':openRecord('cool');break;
  case 'openTransaction':openRecord(current==='finish'?'measure':'transaction');break;
  case 'openBottleAdjust':openRecord('bottle-adjust');break;
  case 'closeRecord':closeRecord();break;
  case 'commitRecord':commitRecord();break;
  case 'skipWarming':{const fromEntry=editorDraft.takeFromEntry;state.warmPending=null;recordKind=null;save();if(fromEntry)window.parent.milkFlowIntegration?.returnToTakeEntry();else render();break;}
  case 'startWarm':openRecord('warm');break;
  case 'toggleMilkSides':{editorDraft.splitInput=!editorDraft.splitInput;if(editorDraft.splitInput&&editorDraft.left===''&&editorDraft.right===''){const total=Number(editorDraft.total)||0;editorDraft.left=Math.round(total/2);editorDraft.right=total-editorDraft.left;}$('#milk-side-fields').hidden=!editorDraft.splitInput;el.setAttribute('aria-expanded',String(editorDraft.splitInput));el.innerHTML=(editorDraft.splitInput?'收起左右填写':'按左右分别填写')+' <span aria-hidden="true">'+(editorDraft.splitInput?'−':'＋')+'</span>';if(editorDraft.splitInput)syncMilkSides('total');break;}
  case 'addBottle':addingBottle=true;editorError='';render();$('.new-bottle-form').scrollIntoView({block:'nearest',behavior:'instant'});$('#new-capacity').focus({preventScroll:true});break;
  case 'saveBottle':{const raw=$('#new-capacity').value,capacity=Number(raw);if(!raw||!Number.isFinite(capacity)||capacity<=0){fail('请填写有效存储瓶容量');break;}const id='b'+Date.now(),b={id,name:'存储瓶 '+(state.bottles.length+1),capacity,amount:0,oldest:null};state.bottles.push(b);editorDraft.bottleId=id;state.selectedBottleId=id;addingBottle=false;editorError='';chooseMixBottle();save();render();break;}
  case 'saveSingleInput':{const raw=$('#pref-single-input').value,value=Number(raw);if(!raw||!Number.isSafeInteger(value)||value<=0){$('#single-input-status').textContent='请填写大于 0 的整数奶量';break;}state.preferences.singleInputMax=value;localStorage.setItem('milk-assistant-demo-flow-single-input-max',String(value));save();$('#single-input-status').textContent='已保存';break;}
  case 'saveFridge':{const raw=$('#pref-fridge').value,value=Number(raw);if(!raw||!Number.isFinite(value)||value<0||value>10){$('#preference-status').textContent='请填写 0–10°C';break;}state.preferences.fridgeTemperature=value;save();$('#preference-status').textContent='已保存';break;}
  case 'stopWarm':clearNotices('take');state.warm=null;save();render();break;
  case 'skipNode':advanceNode();break;
  case 'completeFlow':collapse();break;
  case 'goTake':recordKind=null;current='take';window.parent.milkFlowIntegration?.openTakeEntry();break;
  case 'browseInventory':recordKind=null;window.parent.milkFlowIntegration?.openInventory();break;
  case 'chooseStock':window.parent.milkFlowIntegration?.openTakeEntry();break;
  case 'returnHome':view='workspace';tab='首页';render();break;
  case 'browsePumps':openRecord('pump-history');break;
  case 'pickPump':recordKind=null;view='pump-picker';timerExpanded=false;render();$('#page').scrollTop=0;break;
  case 'returnAdmission':view='workspace';recordKind='measure';render();break;
  case 'popupNext':recordKind=null;advanceNode();break;
  case 'expandTimer':timerExpanded=true;render();break;
  case 'minimizeTimer':timerExpanded=false;recordKind=null;render();break;
  case 'restartTimer':openRecord('restart-timer');break;
  case 'cancelTimer':if(state.timer)removeCoolingTask(state.timer.id);save();render();break;
  case 'open':global();break;
  case 'resume':select(state.timer?'cool':state.warm?'take':steps.some(s=>s.id===state.lastTool)?state.lastTool:nextStep());break;
  case 'smartScan':if(!state.preferences.accessories.bags)break;smartEntry={type:'qr',failed:false,result:null};render();$('.record-fields').scrollTop=0;break;
  case 'smartNfc':if(!state.preferences.accessories.fridge)break;smartEntry={type:'nfc',failed:false,result:null};render();$('.record-fields').scrollTop=0;break;
  case 'recognizeSmartEntry':if(!smartEntry)break;smartEntry.failed=false;smartEntry.result={containerId:smartEntry.type==='qr'?'DEMO-MC-BAG-'+String(state.smartAccessorySequence=(state.smartAccessorySequence||0)+1).padStart(3,'0'):'DEMO-MC-FRIDGE-SLOT-01',method:smartEntry.type};render();break;
  case 'failSmartEntry':if(smartEntry){smartEntry.failed=true;smartEntry.result=null;render();}break;
  case 'applySmartEntry':if(!smartEntry?.result)break;editorDraft.smartAssociation={...editorDraft.smartAssociation,...(smartEntry.type==='qr'?{containerId:smartEntry.result.containerId}:{slotId:smartEntry.result.containerId}),method:smartEntry.type};smartEntry=null;render();break;
  case 'dismissAll':smartEntry=null;dateEditing=false;closeRecord();break;
  case 'fridgePurchase':openRecord('fridge-purchase');break;
  case 'closeSmartEntry':smartEntry=null;render();break;
  case 'toggleAccessory':{const key=el.dataset.accessory;if(!['bags','fridge'].includes(key))break;state.preferences.accessories[key]=!state.preferences.accessories[key];localStorage.setItem('milk-assistant-demo-flow-accessories',JSON.stringify(state.preferences.accessories));save();el.classList.toggle('on',state.preferences.accessories[key]);el.setAttribute('aria-checked',String(state.preferences.accessories[key]));break;}
  case 'flowRecords':recordKind=null;tab='记录';view='workspace';render();break;
  case 'flowBack':if(view==='take-form'){recordKind=null;window.parent.milkFlowIntegration?.returnToTakeEntry();break;}if(view==='pump-picker'){view='workspace';recordKind='measure';render();break;}if(view!=='workspace'||tab!=='首页'||habitSurvey){habitSurvey=null;recordKind=null;view='workspace';tab='首页';render();$('#page').scrollTop=0;}else window.parent.milkFlowIntegration?.backHome();break;
  case 'global':global();break;
  case 'all':view='all';tab='首页';opened=true;render();$('#page').scrollTop=0;break;
  case 'restore':state.pinned=[0,1,2,3,4,5];save();render();break;
  case 'warehouse':view='inventory';tab='首页';opened=true;render();break;
  case 'collapse':collapse();break;
  case 'reset':reset();break;
 }
});
let fieldGesture=null,ignoreFieldClickUntil=0;
document.addEventListener('click',e=>{if(Date.now()<suppressFloatingClickUntil&&e.target.closest('#resume')){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('pointerdown',e=>{const group=e.target.closest('#resume');if(!group||!group.children.length||group.inert||e.button>0)return;group.classList.remove('floating-snapping');floatingGesture={id:e.pointerId,group,x:e.clientX,y:e.clientY,left:group.offsetLeft,top:group.offsetTop,moved:false};});
document.addEventListener('pointermove',e=>{const g=floatingGesture;if(!g||g.id!==e.pointerId)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.moved&&Math.hypot(dx,dy)<6)return;if(!g.moved){g.moved=true;g.group.setPointerCapture(e.pointerId);}e.preventDefault();const b=floatingBounds();g.group.style.left=Math.max(b.minX,Math.min(b.maxX,g.left+dx))+'px';g.group.style.top=Math.max(b.minY,Math.min(b.maxY,g.top+dy))+'px';},{passive:false});
function finishFloatingDrag(e){const g=floatingGesture;if(!g||g.id!==e.pointerId)return;floatingGesture=null;if(!g.moved)return;suppressFloatingClickUntil=Date.now()+400;const b=floatingBounds();floatingPosition={side:g.group.offsetLeft<=(b.minX+b.maxX)/2?'left':'right',y:g.group.offsetTop};g.group.classList.add('floating-snapping');positionFloating();if(g.group.hasPointerCapture(e.pointerId))g.group.releasePointerCapture(e.pointerId);}
document.addEventListener('pointerup',finishFloatingDrag);document.addEventListener('pointercancel',finishFloatingDrag);window.addEventListener('resize',positionFloating);
document.addEventListener('pointerdown',e=>{const field=e.target.closest('.capacity-input'),w=e.target.closest('.time-wheel');if(!field&&!w)return;if(w&&e.pointerType!=='mouse')return;if(field&&(field.querySelector('input').disabled||field.querySelector('input').readOnly))return;fieldGesture={id:e.pointerId,field,w,input:field?.querySelector('input'),x:e.clientX,y:e.clientY,value:Number(field?.querySelector('input').value||0),scroll:w?.scrollTop||0,moved:false};});
document.addEventListener('pointermove',e=>{const g=fieldGesture;if(!g||g.id!==e.pointerId)return;const delta=g.field?e.clientX-g.x:g.y-e.clientY;if(!g.moved&&Math.abs(delta)<8)return;if(g.field&&Math.abs(e.clientY-g.y)>Math.abs(delta)&&!g.moved){fieldGesture=null;return;}g.moved=true;e.preventDefault();if(g.field){g.input.blur();g.input.value=Math.max(0,Math.min(g.field.dataset.capacityMax!==''?Number(g.field.dataset.capacityMax):Infinity,Math.round(g.value+delta*2)));g.input.dispatchEvent(new Event('input',{bubbles:true}));}else g.w.scrollTop=g.scroll+delta;},{passive:false});
document.addEventListener('pointerup',()=>{if(fieldGesture?.moved){ignoreFieldClickUntil=Date.now()+400;if(fieldGesture.w){const w=fieldGesture.w;w.scrollTop=Math.round(w.scrollTop/44)*44;setTimeWheel(w,Math.round(w.scrollTop/44)+Number(w.dataset.timeMin||0));}}fieldGesture=null;});
document.addEventListener('pointercancel',()=>{fieldGesture=null;});
document.addEventListener('click',e=>{if(Date.now()<ignoreFieldClickUntil&&e.target.closest('.capacity-input,.time-wheel')){e.preventDefault();e.stopImmediatePropagation();}},true);
// Horizontal gestures switch batches; vertical gestures keep native page scrolling.
document.addEventListener('pointerdown',e=>{
 if(!timerMode()||current!=='cool'||state.coolingTasks.length<2||!e.target.closest('.ring-surface'))return;
 coolingGesture={id:e.pointerId,x:e.clientX,y:e.clientY};coolingRotationAt=Date.now()+6000;
});
document.addEventListener('pointerup',e=>{
 if(!coolingGesture||coolingGesture.id!==e.pointerId)return;
 const dx=e.clientX-coolingGesture.x,dy=e.clientY-coolingGesture.y;coolingGesture=null;
 if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.4){suppressCoolingClickUntil=Date.now()+400;rotateCooling(dx<0?1:-1,true);}
});
document.addEventListener('pointercancel',()=>{coolingGesture=null;});
document.addEventListener('keydown',e=>{
 if(timerMode()&&current==='cool'&&!recordKind&&e.target.closest('.ring-surface')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();rotateCooling(e.key==='ArrowRight'?1:-1,true);return;}
 if(recordKind&&e.key==='Tab'&&e.target.closest('.record-popup')&&!e.target.matches('textarea,[contenteditable="true"]')){const items=[...$('.record-popup').querySelectorAll('button,input,[tabindex="0"]')].filter(el=>!el.disabled),first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 if(e.target.matches('.time-wheel')&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const n=Math.max(0,Math.min(Number(e.target.dataset.timeMax),Number(e.target.dataset.value)+(e.key==='ArrowDown'?1:-1)));e.target.scrollTop=(n-Number(e.target.dataset.timeMin||0))*44;setTimeWheel(e.target,n);return;}
 if(e.target.matches('.temperature-wheel')&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const value=Math.max(wheelMin(e.target.id),Math.min(60,editorDraft[e.target.id]+(e.key==='ArrowDown'?1:-1)));e.target.scrollTop=(value-wheelMin(e.target.id))*44;setWheel(e.target.id,value);return;}
 if(e.target.matches('textarea,[contenteditable="true"]'))return;
 if(e.key==='Escape'){if(view==='pump-picker'){view='workspace';recordKind='measure';render();}else recordKind?closeRecord():collapse();return;}
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-step]')&&e.target.tagName!=='BUTTON'){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
});
$('#collapse').onclick=collapse;$('#scrim').onclick=collapse;$('#reset').onclick=reset;
setInterval(()=>{
 let phaseChanged=false;const due=[];
 for(const task of state.coolingTasks){if(!task.started&&Date.now()>=task.start){task.started=true;phaseChanged=true;}if(!task.device&&!task.notified&&Date.now()>=task.end){task.notified=true;due.push({kind:'cool',at:task.end,timerId:task.id,batchId:task.batchId,volume:task.volume,toolOnly:task.toolOnly});}}
 if(state.warm&&!state.warmNotified&&Date.now()>=state.warmEnd){state.warmNotified=true;due.push({kind:'take',at:state.warmEnd});}
 due.sort((a,b)=>a.at-b.at).forEach(n=>state.timerNotices.push({...n,id:n.timerId||n.kind+'-'+n.at,order:state.timerNotices.length,acknowledged:false}));
 if(due.length&&!recordKind&&!habitSurvey){const newest=latestNotice();current=newest.kind;timerExpanded=false;if(newest.kind==='cool'){state.activeCoolingId=newest.timerId;refreshCoolingSelection();}}
 if(due.length||phaseChanged){save();render();}
 if(!embeddedAway&&timerMode()&&current==='cool'&&view==='workspace'&&tab==='首页'&&!recordKind&&!habitSurvey&&!document.hidden&&!coolingGesture&&Date.now()-coolingRotationAt>=6000){rotateCooling(1);}
 document.querySelectorAll('[data-task-clock]').forEach(el=>{const task=state.coolingTasks.find(t=>t.id===el.dataset.taskClock);if(task)el.textContent=coolingTaskLabel(task);});
 updateCompact();
 updateNodeTimers();
 if(state.timer){const left=remaining();if($('#timer-value'))$('#timer-value').textContent=duration(coolingWait()||left);if(current==='cool'&&$('#timer-progress'))$('#timer-progress').style.strokeDashoffset=circumference*(1-Math.min(1,left/((state.timer.end-state.timer.start)/1000)));}
 if(state.warm&&$('#warm-time')){$('#warm-time').textContent=duration(warmRemaining());if(current==='take'&&$('#timer-progress'))$('#timer-progress').style.strokeDashoffset=circumference*(1-Math.max(0,Math.min(1,(state.warmEnd-Date.now())/(state.warmEnd-state.warm))));}
},1000);
function reportDeviceCooling(event){const task=state.coolingTasks.find(t=>t.batchId===event.batchId&&t.device);if(!task||task.notified)return false;if(event.temperature!==undefined&&Number.isFinite(Number(event.temperature)))task.temperature=Number(event.temperature);if(Number.isFinite(event.remainingSeconds)&&event.remainingSeconds>=0){task.awaitingReport=false;task.start=Date.now();task.end=task.start+event.remainingSeconds*1000;}if(event.ready===true){task.notified=true;state.pendingMixBatchId=task.batchId;state.timerNotices.push({id:'device-'+task.id,kind:'cool',at:Date.now(),timerId:task.id,batchId:task.batchId,volume:task.volume,temperature:task.temperature??'--',device:true,order:state.timerNotices.length,acknowledged:false});current='cool';timerExpanded=true;}refreshCoolingSelection();save();render();return true;}
const processedNfcEvents=new Set();let nfcSaving=false;
function receiveNfc(event={}){
 if(nfcSaving||embeddedAway||recordKind!=='measure'||editorDraft.storage==='Frozen'||smartEntry||dateEditing||!state.preferences.accessories.fridge)return {accepted:false,reason:'inactive'};
 if(!event||typeof event!=='object')return {accepted:false,reason:'invalid-device'};
 const deviceId=typeof event.deviceId==='string'?event.deviceId.trim():'',slotId=(typeof event.slotId==='string'?event.slotId.trim():'')||deviceId;
 if(!deviceId)return {accepted:false,reason:'invalid-device'};
 const eventKey=typeof event.eventId==='string'&&event.eventId?deviceId+':'+event.eventId:null;if(eventKey&&processedNfcEvents.has(eventKey))return {accepted:false,reason:'duplicate'};
 const previousAssociation=editorDraft.smartAssociation,before=state.lastAdmissionBatchId;nfcSaving=true;
 try{editorDraft.smartAssociation={deviceId,slotId,method:'nfc',...(Number.isFinite(event.temperature)?{temperature:event.temperature}:{}),...(Number.isFinite(event.remainingSeconds)&&event.remainingSeconds>=0?{remainingSeconds:event.remainingSeconds}:{}),ready:event.ready===true};commitRecord();const accepted=recordKind!=='measure'&&state.lastAdmissionBatchId!==before;if(!accepted){editorDraft.smartAssociation=previousAssociation;return {accepted:false,reason:'validation',message:editorError};}if(eventKey){processedNfcEvents.add(eventKey);if(processedNfcEvents.size>200)processedNfcEvents.delete(processedNfcEvents.values().next().value);}return {accepted:true,batchId:state.lastAdmissionBatchId};}finally{nfcSaving=false;}
}
window.addEventListener('milk-flow:nfc-identified',event=>receiveNfc(event.detail||{}));
window.milkFlowDemo={
 receiveNfc,
 openQuickTake,applyScannedTake,
 reportDeviceCooling,
 setAway(value){embeddedAway=!!value;},
 getState:()=>JSON.parse(JSON.stringify(state)),
 getTimers:()=>['cool','take'].map(id=>{const info=nodeTimer(id);return info?{id,label:info.label,fraction:info.fraction,title:id==='cool'?((state.timer?.notified?'降温待查看':coolingWait()?'降温待启动':'降温中')+(state.coolingTasks.length>1?' · '+state.coolingTasks.length:'')):(state.warmNotified?'升温待查看':'升温中')}:null;}).filter(Boolean),
 admission(storage='Refrigerated',zone='fridge'){state.admissionZone=zone;recordKind=null;current=storage==='Frozen'?'finish':'measure';view='workspace';tab='首页';openRecord('measure');},
 home(){recordKind=null;habitSurvey=null;tab='首页';view='workspace';render();$('#page').scrollTop=0;},
 settings(){recordKind=null;tab='首页';view='all';render();},
 timer(id){select(id);},
 syncStock(records,history=[],unlinkedFrozen=0){state.manualFrozenTaken=unlinkedFrozen;
  const ml=r=>r.mlAmount??Math.round(Number(r.volume||0)*29.5735),oldBottles=state.bottles,oldBatches=state.looseBatches;
  state.bottles=records.filter(r=>r.storage==='Refrigerated'&&!r.flowBatchId).map((r,i)=>{const id=r.flowBottleId||'bag-'+r.id,existing=oldBottles.find(b=>b.id===id);return {...existing,id,name:existing?.name||'冷藏容器 '+(i+1),capacity:existing?.capacity||Math.max(500,ml(r)),deviceId:r.deviceId,storageLocation:r.storageLocation,storageZone:r.storageZone|| (r.storageLocation?'mini':'fridge'),amount:ml(r),oldest:r.oldest||existing?.oldest||Date.now()};});
  state.bottles.push(...oldBottles.filter(b=>b.amount===0&&!state.bottles.some(x=>x.id===b.id)));
  if(!state.bottles.length)state.bottles=[{id:'b1',name:'存储瓶 1',capacity:500,amount:0,oldest:null}];
  state.looseBatches=records.filter(r=>r.flowBatchId).map(r=>({...oldBatches.find(b=>b.id===r.flowBatchId),id:r.flowBatchId,deviceId:r.deviceId,storageLocation:r.storageLocation,storageZone:r.storageZone||(r.storageLocation?'mini':'fridge'),amount:ml(r),oldest:r.oldest||oldBatches.find(b=>b.id===r.flowBatchId)?.oldest||Date.now()}));
  state.frozen=Math.max(0,records.filter(r=>r.storage==='Frozen').reduce((n,r)=>n+ml(r),0)-unlinkedFrozen);syncPool();syncLoose();
  for(const record of records.filter(r=>r.source==='storage-manual')){const id='stock-pump-'+record.id;if(!state.pumpRecords.some(p=>p.id===id))state.pumpRecords.push({id,total:ml(record),left:null,right:null,at:record.pumpedAt||new Date(record.productionDate+'T00:00:00').getTime()||Date.now(),stored:true,allocated:ml(record)});}
  for(const item of history){const id='air2-'+item.id;if(!state.pumpRecords.some(p=>p.id===id)){const total=Math.round(item.total*29.5735),left=Math.round(item.left*29.5735),at=item.at||Number(item.id?.match(/(\d{13})/)?.[1])||Date.now();state.pumpRecords.push({id,total,left,right:total-left,at,stored:records.some(r=>r.pumpSessionId===item.id),allocated:0});}}
  state.coolingTasks=state.coolingTasks.filter(t=>t.toolOnly||state.looseBatches.some(b=>b.id===t.batchId));state.timerNotices=state.timerNotices.filter(n=>n.kind!=='cool'||state.coolingTasks.some(t=>t.id===n.timerId));refreshCoolingSelection();save();render();
 },
 openTake(record){
  recordKind=null;tab='首页';view='workspace';current='take';timerExpanded=false;
  const ml=record.mlAmount??Math.round(record.volume*29.5735);state.takeSource=record.storage==='Frozen'?'frozen':record.flowBatchId?'batch':'cold';
  if(state.takeSource==='cold')state.selectedBottleId=record.flowBottleId||'bag-'+record.id;
  if(state.takeSource==='batch')state.takeBatchId=record.flowBatchId;
  state.takeLegacyFrozenId=record.storage==='Frozen'?record.id:null;
  openRecord('transaction');editorDraft.enableWarm=state.preferences.warmReminder!==false;if(state.takeSource==='frozen'){editorDraft.frozenRecordId=record.id;editorDraft.legacyContainerId=record.containerId;editorDraft.legacyFrozenLimit=ml;editorDraft.volume=ml;}render();
 }
};
save();
render();
})();
