import {makePlanner} from './planner.js';
import {drawGraph} from './graph.js';

const dataFiles=['catalog','cs-programs','econ-programs','stats-data-programs'];
const programOrder=['computer-science','data-science','economics','economics-statistics','financial-economics','information-science','statistics','artificial-intelligence-minor','computer-science-minor'];
const main=document.querySelector('main');
const library=document.querySelector('#library');
const dialog=document.querySelector('#detail');
const detail=document.querySelector('#detail-inner');
const storageKey='columbia-course-atlas-v1';
const codePattern=/^[A-Z]{3,5} [A-Z]{1,3}\d{4}$/;
const figures={
  book:'<path d="M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3zM12 6v15"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  graph:'<rect x="3" y="8" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/><path d="M8 10.5h4m0 0v-5h4m-4 5v8h4"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
  link:'<path d="M14 5h5v5m0-5-8 8m5-2v8H5V8h8"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  fit:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>'
};
const svg=name=>'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+figures[name]+'</svg>';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const lookup=code=>'https://bulletin.columbia.edu/search/?P='+encodeURIComponent(code);
const link=(url,label)=>{try{if(new URL(url).protocol!=='https:')return '';}catch{return '';}
  return '<a class="external" href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label)+svg('link')+'</a>';
};
const range=r=>!r?'?':r[0]===r[1]?String(r[0]):r[0]+'–'+r[1];
const total=t=>range([t.low,t.high])+(t.unknown?' + ?':'');
const codeOf=o=>o.courses.join('|');
const textOf=o=>o.label||o.courses.join(' + ');
let catalog,programs,program,plan,tab='map',settings={},opened=new Set(),filters={},toastTimer;
let saved={};
try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
function message(text){
  const el=document.querySelector('#toast');
  el.textContent=text;clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.textContent='',3600);
}
function refresh(){
  saved[program.id]=settings;
  try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{}
  plan=makePlanner(catalog,program,settings);
  render();
}
function chooseProgram(id){
  const next=programs.find(p=>p.id===id)||programs[0];
  if(program?.id===next.id)return;
  program=next;settings=saved[program.id]||{};tab='map';opened=new Set();filters={};
  if(location.hash!=='#'+program.id)history.replaceState(null,'','#'+program.id);
  refresh();
}
function render(){
  library.innerHTML=['Major','Minor'].map(type=>{
    const entries=programs.filter(p=>p.type===type);
    return '<div class="nav-head">'+type+'s <small>'+entries.length+'</small></div>'+entries.map(p=>'<button class="nav-item '+(p===program?'active':'')+'" '+(p===program?'aria-current="page"':'')+' data-program="'+p.id+'">'+svg(type==='Major'?'book':'layers')+esc(p.name)+'</button>').join('');
  }).join('');
  const choices=plan.groups.filter(g=>!plan.fixed(g)).length;
  const metric=(label,value)=>'<dl class="metric"><dt>'+label+'</dt><dd>'+esc(value)+'</dd></dl>';
  const variant=plan.variant?'<label class="variant">Mathematics path <select class="select-wrap" id="variant">'+program.variants.map(v=>'<option value="'+esc(v.id)+'" '+(v.id===plan.variant.id?'selected':'')+'>'+esc(v.label)+'</option>').join('')+'</select></label>':'';
  const warnings=plan.warnings.length?'<p class="notice">'+esc(plan.warnings.join(' '))+'</p>':'';
  main.innerHTML='<div class="mobile-select"><select aria-label="Academic program" class="select-wrap" id="mobile-program">'+programs.map(p=>'<option value="'+p.id+'" '+(p===program?'selected':'')+'>'+esc(p.name)+' · '+p.type+'</option>').join('')+'</select></div><div class="eyebrow">Columbia College <span>›</span> '+program.type+'</div><div class="intro"><h1>'+esc(program.name)+'</h1>'+link(program.source,'Program bulletin')+'</div><p class="credit-line">Published requirement · '+esc(program.publishedCredits)+'</p>'+variant+
    '<div class="metrics">'+metric('Program points',total(plan.programPoints))+metric('With prerequisites',total(plan.allPoints))+metric('Courses in plan',plan.nodes.size)+'</div><nav class="tabs" aria-label="Program views"><button class="tab '+(tab==='map'?'on':'')+'" data-tab="map" aria-pressed="'+(tab==='map')+'">'+svg('graph')+'Course map</button><button class="tab '+(tab==='requirements'?'on':'')+'" data-tab="requirements" aria-pressed="'+(tab==='requirements')+'">'+svg('list')+'Requirements <span class="count">'+choices+'</span></button><button class="reset" id="reset">Reset choices</button></nav>'+warnings+'<div id="view"></div>'+notes();
  if(tab==='map')drawGraph(main.querySelector('#view'),plan,{esc,svg,openCourse,range});
  else renderRequirements();
}
function notes(){
  return '<details class="program-notes"><summary>Program rules and sources</summary><ul>'+[...(program.notes||[]),...(plan.variant?.notes||[])].map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul><p>Default options are ranked by distinct prerequisite courses, then points, then course number. The map follows one path through each prerequisite choice. Use course details to choose a different path.</p><div class="sources">'+[...([{url:program.source,label:'Columbia College Bulletin'}]),...(program.sources||[])].map(s=>link(s.url,s.label)).join('')+'</div></details>';
}
function renderRequirements(){
  const sections=new Map();
  for(const g of plan.groups){
    if(!sections.has(g.section))sections.set(g.section,[]);
    sections.get(g.section).push(g);
  }
  const host=main.querySelector('#view');
  host.innerHTML='<div class="requirements">'+[...sections].map(([name,groups])=>'<section class="req-section"><h2 class="section-name">'+esc(name)+'</h2>'+groups.map(groupHtml).join('')+'</section>').join('')+'</div>';
  for(const card of host.querySelectorAll('.group')){
    if(card.open)renderOptions(card);
    card.addEventListener('toggle',()=>{
      if(card.open){opened.add(card.dataset.group);renderOptions(card);}
      else opened.delete(card.dataset.group);
    });
  }
}
function groupHtml(g){
  const chosen=plan.selected.get(g.id);
  const chosenText=chosen.map(textOf).join(', ');
  const departments=[...new Set(g.options.map(o=>o.courses[0].split(' ')[0]))].sort();
  const chosenDept=settings.departments?.[g.id]||chosen[0]?.courses[0].split(' ')[0];
  const departmentMenu=g.openRule?.sameDepartment?'<label>Department <select class="select-wrap" data-department="'+g.id+'">'+departments.map(d=>'<option '+(d===chosenDept?'selected':'')+'>'+esc(d)+'</option>').join('')+'</select></label>':'';
  const filter=g.options.length>10?'<input class="control filter" type="search" aria-label="Filter '+esc(g.label)+'" placeholder="Filter by course code or title" data-filter="'+g.id+'" value="'+esc(filters[g.id]||'')+'">':'';
  return '<details class="group" data-group="'+g.id+'" '+(opened.has(g.id)?'open':'')+'><summary><span class="chev">'+svg('chevron')+'</span><span class="group-summary"><strong>'+esc(g.label)+'</strong><small>'+esc(chosenText)+'</small></span><span class="pill">'+(plan.fixed(g)?'Required':('Choose '+g.pick+' · '+g.options.length+' options'))+'</span></summary><div class="group-body">'+(g.note?'<p>'+esc(g.note)+'</p>':'')+((departmentMenu||g.openRule)?'<div class="group-controls">'+departmentMenu+'<button class="action" data-add="'+g.id+'">'+svg('plus')+'Add a course</button></div>':'')+filter+'<ul class="option-list"></ul></div></details>';
}
function renderOptions(card){
  const g=plan.groups.find(x=>x.id===card.dataset.group);
  const chosen=plan.selected.get(g.id);
  const filter=(filters[g.id]||'').toLowerCase().trim();
  const options=[...chosen,...plan.ranking.get(g.id).filter(o=>!chosen.includes(o))];
  const dept=settings.departments?.[g.id]||chosen[0]?.courses[0].split(' ')[0];
  const shown=options.filter(o=>(!g.openRule?.sameDepartment||!dept||o.courses.every(c=>c.startsWith(dept+' '))) &&
    (!filter||[textOf(o),...o.courses.map(c=>c+' '+(plan.catalog[c]?.title||''))].join(' ').toLowerCase().includes(filter)));
  card.querySelector('.option-list').innerHTML=shown.length?shown.map(o=>{
    const active=chosen.includes(o);
    const courseLinks=o.courses.map(c=>'<button class="option-course" data-course="'+esc(c)+'"><span class="code">'+esc(c)+'</span> · '+esc(plan.catalog[c]?.title||c)+'</button>').join('');
    const opts=g.options.indexOf(o);
    const entryFloor=g.minCredits||g.openRule?.minCredits||0;
    const score=plan.rank(o.courses,new Set(),entryFloor);
    const points=o.courses.map(c=>plan.points(c,entryFloor));
    const pointsText=points.some(p=>!p)?'?':range([0,1].map(i=>points.reduce((sum,p)=>sum+p[i]*(o.repeats||1),0)));
    const assignedElsewhere=o.courses.map(c=>plan.assigned.get(c)).find(x=>x && x.id!==g.id);
    return '<li class="option-row"><div class="opt-title">'+courseLinks+'<span class="opt-meta">'+esc((o.label?o.label+' · ':'')+pointsText+' pt · '+score.count+' linked prerequisite'+(score.count===1?'':'s')+(assignedElsewhere?' · Used in '+assignedElsewhere.label:''))+'</span></div>'+
      (plan.fixed(g)?'':'<button class="action '+(active?'active':'')+'" data-pick="'+g.id+'" data-option="'+opts+'" '+(active||assignedElsewhere?'disabled':'')+'>'+(active?'Selected':'Select')+'</button>')+'</li>';
  }).join(''):'<li class="quiet">No matching courses.</li>';
}
function show(html){
  detail.innerHTML=html;
  if(!dialog.open)dialog.showModal();
}
function showHeader(label){
  return '<div class="info-head"><span class="kicker">'+esc(label)+'</span><button class="close" data-close aria-label="Close">'+svg('close')+'</button></div>';
}
function routeOptions(code,kind,course){
  const current=[...plan.paths.values()].filter(p=>p.code===code&&p.kind===kind);
  const rules=current.length?current:(course[kind]||[]).map(options=>({options}));
  return rules.map(p=>{
    if(p.key && p.options.length>1)return '<label class="route"><span class="quiet">Choose one</span><select class="select-wrap" data-path="'+esc(p.key)+'" data-path-course="'+esc(code)+'" aria-label="Choose a prerequisite pathway">'+p.options.map(o=>'<option value="'+esc(o.join('|'))+'" '+(o.join('|')===p.chosen.join('|')?'selected':'')+'>'+esc(o.join(' + '))+'</option>').join('')+'</select></label>';
    return '<div class="chips route">'+p.options.map(bundle=>bundle.map(c=>'<button class="chip" data-info-course="'+esc(c)+'">'+esc(c)+'</button>').join(' + ')).join(' <span class="quiet">or</span> ')+'</div>';
  }).join('');
}
function openCourse(code){
  const c=plan.catalog[code]||{title:code,source:lookup(code),pre:[],co:[]};
  const node=plan.nodes.get(code);
  const links=[link(c.source||lookup(code),'Bulletin course listing'),link(c.sourceExtra,'Additional source'),c.syllabus?link(c.syllabus.url,c.syllabus.label):''].join('');
  const req=routeOptions(code,'pre',c),co=routeOptions(code,'co',c);
  const min=plan.floors.get(code)||0;
  const points=plan.points(code,min);
  const minimum=Math.max(min,c.credits?.[0]??0),maximum=c.credits?.[1]??0;
  const credits=minimum<maximum?'<label class="route">Points to count <select class="select-wrap" data-points="'+esc(code)+'"><option value="">Use range</option>'+Array.from({length:Math.floor(maximum-minimum)+1},(_,i)=>i+minimum).map(n=>'<option '+(settings.points?.[code]===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label>':'';
  const status=node?.role==='choice'?'Selected option':node?.role==='required'?'Required course':node?'Prerequisite course':'Course details';
  show(showHeader(status)+'<h2 class="detail-title">'+esc(c.title)+'</h2><p class="detail-code"><span class="code">'+esc(code)+'</span><span>'+esc(range(points))+' points'+((plan.repeats.get(code)||1)>1?' each term':'')+'</span></p>'+
    (c.description?'<p class="detail-description">'+esc(c.description)+'</p>':'<p class="detail-description">See the linked listing for additional course information.</p>')+credits+
    '<div class="detail-section"><h3>Prerequisites</h3>'+(req||c.preText?'':'<p class="quiet">No specific prerequisite courses mapped.</p>')+req+(c.preText?'<p class="detail-note">'+esc(c.preText)+'</p>':'')+'</div>'+
    (co||c.coText?'<div class="detail-section"><h3>Corequisites</h3>'+co+(c.coText?'<p class="detail-note">'+esc(c.coText)+'</p>':'')+'</div>':'')+
    (c.note?'<div class="detail-section"><p class="detail-note">'+esc(c.note)+'</p></div>':'')+
    '<div class="sources">'+links+'</div>'+
    (node?.role==='choice'?'<button class="action" data-show-group="'+node.group.id+'">Change this selection</button>':''));
}
function applyChoice(g,option,old){
  const existing=plan.selected.get(g.id);
  const next=existing.map(o=>o===old?option:o);
  if(!old)next.push(option);
  const trial={...settings,choices:{...settings.choices,[g.id]:next.map(codeOf)}};
  const result=makePlanner(catalog,program,trial);
  if(!result.selected.get(g.id).some(o=>codeOf(o)===codeOf(option)) || result.warnings.length>plan.warnings.length) {
    message('That choice conflicts with another requirement. Change the overlapping selection first.');
    return;
  }
  settings=trial;
  if(dialog.open)dialog.close();
  refresh();message('Course selection updated');
}
function pick(g,option){
  const old=plan.selected.get(g.id);
  if(old.length<g.pick)return applyChoice(g,option);
  if(old.length===1)return applyChoice(g,option,old[0]);
  show(showHeader('Edit course selection')+'<h2 class="detail-title">Choose a course to replace</h2><p class="detail-description">'+esc(textOf(option))+' will count toward '+esc(g.label.toLowerCase())+'.</p><div class="swap-list">'+old.map((o,i)=>'<button class="action" data-swap="'+g.id+'" data-new="'+g.options.indexOf(option)+'" data-old="'+i+'">'+esc(textOf(o))+'</button>').join('')+'</div>');
}
function addForm(group){
  const requirement=group.openRule?.sameDepartment?'At least '+group.openRule.minCredits+' points and numbered '+group.openRule.minNumber+' or above. All three selections must share a department.':'Select courses approved for your Statistics elective plan.';
  show(showHeader('Add an elective')+'<h2 class="detail-title">'+esc(group.label)+'</h2><p class="detail-description">'+esc(requirement)+'</p><form class="manual-form" id="custom-course" data-group="'+group.id+'"><label>Columbia course code <input class="control" name="code" required placeholder="e.g. HIST UN3001"></label><p class="quiet">For courses outside the indexed choices, enter the title and points from the <a href="https://bulletin.columbia.edu/" target="_blank" rel="noopener">Columbia Bulletin</a>.</p><label>Course title <input class="control" name="title"></label><label>Credit points <input class="control" name="points" type="number" min="0" max="15" step="0.5"></label><label>Prerequisite courses, if any <input class="control" name="prereqs" placeholder="e.g. MATH UN1101, STAT UN1201"></label><label>Course description <textarea class="control" name="description" rows="2"></textarea></label><label>Public syllabus URL <input class="control" name="syllabus" type="url"></label><button class="action" type="submit">Add to available choices</button><p class="quiet" id="form-status" role="status"></p></form>');
}
function normalize(s){return s.trim().toUpperCase().replace(/\s+/g,' ');}
detail.addEventListener('submit',event=>{
  const form=event.target;if(form.id!=='custom-course')return;
  event.preventDefault();
  const g=plan.groups.find(g=>g.id===form.dataset.group);
  const formData=new FormData(form),code=normalize(formData.get('code'));
  const info=form.querySelector('#form-status');
  if(!codePattern.test(code)){info.textContent='Enter a subject and full course number, such as HIST UN3001.';return;}
  const existing=plan.catalog[code];
  const points=existing?.credits?.[1] ?? Number(formData.get('points'));
  if(g.openRule?.minimumNumber && Number(code.slice(-4))<g.openRule.minimumNumber ||
      g.openRule?.minNumber && Number(code.slice(-4))<g.openRule.minNumber ||
      g.openRule?.minCredits && points<g.openRule.minCredits ||
      g.openRule?.sameDepartment && /^(COMS|CSEE|CSOR|CSBS|CSPH|EECS) /.test(code)){
    info.textContent='That course does not satisfy the published elective criteria.';return;
  }
  if(!existing){
    const title=formData.get('title').trim();
    if(!title || formData.get('points')===''){info.textContent='Enter the published title and points for this course.';return;}
    const pre=formData.get('prereqs').split(',').filter(s=>s.trim()).map(normalize);
    if(pre.some(c=>!codePattern.test(c)||c===code)){info.textContent='Enter distinct prerequisite course codes separated by commas.';return;}
    const syllabus=formData.get('syllabus');
    settings.customCourses={...settings.customCourses,[code]:{title,credits:[points,points],source:lookup(code),pre:pre.map(c=>[[c]]),co:[],description:formData.get('description'),note:'This course was added to your plan. Confirm the entry and prerequisite details in the Bulletin.',...(syllabus?{syllabus:{url:syllabus,label:'Public syllabus'}}:{})}};
  }
  settings.additions={...settings.additions,[g.id]:[...new Set([...(settings.additions?.[g.id]||[]),code])]};
  if(g.openRule?.sameDepartment){
    settings.departments={...settings.departments,[g.id]:code.split(' ')[0]};
    if(settings.choices)delete settings.choices[g.id];
  }
  filters[g.id]=code;
  dialog.close();refresh();message('Course added to available choices');
});
library.onclick=e=>{const b=e.target.closest('[data-program]');if(b)chooseProgram(b.dataset.program);};
main.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b)return;
  if(b.dataset.tab){tab=b.dataset.tab;render();return;}
  if(b.id==='reset'){settings={};filters={};refresh();message('Default choices restored');return;}
  if(b.dataset.course && !b.closest('.viewport')){openCourse(b.dataset.course);return;}
  if(b.dataset.pick){const g=plan.groups.find(g=>g.id===b.dataset.pick);pick(g,g.options[Number(b.dataset.option)]);}
  if(b.dataset.add)addForm(plan.groups.find(g=>g.id===b.dataset.add));
});
main.addEventListener('input',e=>{
  if(e.target.dataset.filter){
    filters[e.target.dataset.filter]=e.target.value;renderOptions(e.target.closest('.group'));
  }
});
main.addEventListener('change',e=>{
  if(e.target.id==='mobile-program')chooseProgram(e.target.value);
  if(e.target.id==='variant'){settings.variant=e.target.value;refresh();}
  const id=e.target.dataset.department;
  if(id){
    settings.departments={...settings.departments,[id]:e.target.value};
    if(settings.choices)delete settings.choices[id];
    delete filters[id];refresh();
  }
});
dialog.addEventListener('click',e=>{
  if(e.target===dialog){dialog.close();return;}
  const b=e.target.closest('button');
  if(!b)return;
  if(b.hasAttribute('data-close'))dialog.close();
  if(b.dataset.infoCourse)openCourse(b.dataset.infoCourse);
  if(b.dataset.showGroup){
    const id=b.dataset.showGroup;
    dialog.close();tab='requirements';opened.add(id);render();
    main.querySelector('[data-group="'+id+'"]')?.scrollIntoView({block:'nearest'});
  }
  if(b.dataset.swap){
    const g=plan.groups.find(x=>x.id===b.dataset.swap);
    applyChoice(g,g.options[Number(b.dataset.new)],plan.selected.get(g.id)[Number(b.dataset.old)]);
  }
});
dialog.addEventListener('change',e=>{
  if(e.target.dataset.path){
    const {path,pathCourse}=e.target.dataset;
    settings.paths={...settings.paths,[path]:e.target.value};refresh();openCourse(pathCourse);
  }
  if(e.target.dataset.points){
    const code=e.target.dataset.points;
    settings.points={...settings.points};
    if(e.target.value==='')delete settings.points[code];
    else settings.points[code]=Number(e.target.value);
    refresh();openCourse(code);
  }
});
window.addEventListener('hashchange',()=>{if(programs)chooseProgram(location.hash.slice(1));});
try{
  const [records,...families]=await Promise.all(dataFiles.map(async file=>{
    const response=await fetch('data/'+file+'.json');
    if(!response.ok)throw new Error('Could not load '+file);
    return response.json();
  }));
  catalog=records;
  const all=families.flat();
  programs=programOrder.map(id=>all.find(p=>p.id===id));
  chooseProgram(location.hash.slice(1));
}catch(error){
  main.innerHTML='<p class="notice" role="alert">The course atlas could not load. Reload the page to try again.</p>';
  console.error(error);
}

