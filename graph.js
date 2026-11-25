export function layout(plan) {
  const nodes=[...plan.nodes.keys()];
  const parents=new Map(nodes.map(c=>[c,[]]));
  const children=new Map(nodes.map(c=>[c,[]]));
  const neighbors=new Map(nodes.map(c=>[c,new Set()]));
  for(const e of plan.edges){
    neighbors.get(e.from)?.add(e.to); neighbors.get(e.to)?.add(e.from);
    if(e.kind==='pre'){parents.get(e.to)?.push(e.from);children.get(e.from)?.push(e.to);}
  }
  const levels=new Map();
  function depth(c,seen=new Set()){
    if(levels.has(c))return levels.get(c);
    if(seen.has(c))return 0;
    const before=parents.get(c)||[];
    const d=before.length?1+Math.max(...before.map(p=>depth(p,new Set([...seen,c])))):0;
    levels.set(c,d);return d;
  }
  for(const c of nodes)depth(c);
  for(const e of plan.edges.filter(e=>e.kind==='co')){
    if(!parents.get(e.from).length && !children.get(e.from).length)levels.set(e.from,levels.get(e.to));
  }
  const buckets=[];
  for(const c of nodes){const i=levels.get(c);(buckets[i]||=[]).push(c);}
  const degree=c=>neighbors.get(c).size;
  for(const bucket of buckets)bucket.sort((a,b)=>degree(b)-degree(a)||a.localeCompare(b));
  // Put related nodes on similar rows and leave independent subjects lower down.
  for(let i=1;i<buckets.length;i++){
    const prev=buckets[i-1];
    const center=c=>{
      const rel=[...neighbors.get(c)].map(o=>prev.indexOf(o)).filter(x=>x>=0);
      return rel.length?rel.reduce((a,b)=>a+b,0)/rel.length:100;
    };
    buckets[i].sort((a,b)=>center(a)-center(b)||degree(b)-degree(a)||a.localeCompare(b));
  }
  const pos=new Map();
  buckets.forEach((b,col)=>b.forEach((c,i)=>pos.set(c,{x:26+col*254,y:47+i*112})));
  const width=52+(buckets.length-1)*254+196,height=62+Math.max(...buckets.map(b=>b.length))*112;
  return {buckets,pos,width,height};
}
export function drawGraph(host,plan,helpers) {
  const {esc,svg,openCourse,range}=helpers;
  const {buckets,pos,width,height}=layout(plan);
  const enabled=new Set();
  const edges=plan.edges.map((e,i)=>{
    const f=pos.get(e.from),t=pos.get(e.to);
    if(!f||!t)return '';
    const right=t.x>f.x;
    let path;
    if(right){
      const x=f.x+196, y=f.y+44, end=t.x-3;
      const mid=x+(end-x)*.5;
      path='M'+x+' '+y+' C'+mid+' '+y+' '+mid+' '+(t.y+44)+' '+end+' '+(t.y+44);
    }else if(f.x===t.x){
      const lane=f.x+202+8*((i%3)+1);
      path='M'+(f.x+196)+' '+(f.y+54)+' C'+lane+' '+(f.y+54)+' '+lane+' '+(t.y+54)+' '+(t.x+198)+' '+(t.y+54);
    }else{
      path='M'+f.x+' '+(f.y+27)+' C'+(f.x-22)+' '+(f.y+8)+' '+(t.x+217)+' '+(t.y+8)+' '+(t.x+198)+' '+(t.y+27);
    }
    enabled.add(e.kind);
    return '<path data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'" d="'+path+'" fill="none" stroke="'+(e.kind==='pre'?'#8c9fb5':'#6e928f')+'" stroke-width="1.6" '+(e.kind==='co'?'stroke-dasharray="4 4"':'')+' marker-end="url(#end-'+e.kind+')"/>';
  }).join('');
  const mark=(kind,color)=>'<marker id="end-'+kind+'" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="'+color+'"/></marker>';
  const buttons=[...pos].map(([code,p])=>{
    const n=plan.nodes.get(code),value=range(plan.points(code,plan.floors.get(code)||0));
    return '<button class="node '+n.role+'" style="left:'+p.x+'px;top:'+p.y+'px" data-course="'+esc(code)+'" aria-label="'+esc(code+', '+n.course.title+', '+value+' points. Expand course details.')+'" title="'+esc(n.course.title)+'"><span class="node-meta"><span class="code">'+esc(code)+'</span><span class="pt">'+esc(value)+' pt</span></span><span class="node-name">'+esc(n.course.title)+'</span></button>';
  }).join('');
  const cols=buckets.map((_,i)=>'<span class="level" style="left:'+(26+i*254)+'px;top:19px">'+(i===0?'Starting courses':'Level '+(i+1))+'</span>').join('');
  host.innerHTML='<div class="panel"><div class="panel-head"><h2>Prerequisite map</h2><div class="tools"><div class="seg"><button id="out" aria-label="Zoom out">'+svg('minus')+'</button><span class="zoom-label"></span><button id="in" aria-label="Zoom in">'+svg('plus')+'</button></div><button class="flat" id="fit">'+svg('fit')+'Fit</button></div></div><div class="viewport" tabindex="0" aria-label="Scrollable course prerequisite graph"><div class="world"><div class="drawing"><svg class="edges" width="'+width+'" height="'+height+'" aria-hidden="true"><defs>'+mark('pre','#8195aa')+mark('co','#6e928f')+'</defs>'+edges+'</svg>'+cols+buttons+'</div></div></div><div class="panel-foot"><div class="legend"><span><i class="dot"></i>Required</span><span><i class="dot choice"></i>Selected option</span><span><i class="dot prerequisite"></i>Prerequisite only</span>'+(enabled.has('co')?'<span><i class="dash"></i>Corequisite</span>':'')+'</div><span class="help">Arrows point to the course unlocked</span></div></div><p class="help map-help">Select a course for details. Drag or scroll to explore the map.</p>';
  const view=host.querySelector('.viewport'),world=view.querySelector('.world'),drawing=view.querySelector('.drawing');
  let zoom=1;
  function setZoom(value,center=false){
    const ox=(view.scrollLeft+view.clientWidth/2)/zoom,oy=(view.scrollTop+view.clientHeight/2)/zoom;
    zoom=Math.max(.15,Math.min(1.8,value));
    world.style.width=width*zoom+'px';world.style.height=height*zoom+'px';
    drawing.style.width=width+'px';drawing.style.height=height+'px';drawing.style.transform='scale('+zoom+')';
    host.querySelector('.zoom-label').textContent=Math.round(zoom*100)+'%';
    if(center){view.scrollLeft=ox*zoom-view.clientWidth/2;view.scrollTop=oy*zoom-view.clientHeight/2;}
  }
  const initial=Math.min(1,Math.max(.81,(view.clientWidth-12)/Math.min(width,980)));
  setZoom(initial);
  host.querySelector('#out').onclick=()=>setZoom(zoom/1.2,true);
  host.querySelector('#in').onclick=()=>setZoom(zoom*1.2,true);
  host.querySelector('#fit').onclick=()=>{setZoom(Math.min(1,(view.clientWidth-12)/width,(view.clientHeight-12)/height));view.scrollTo(0,0);};
  view.onclick=e=>{const b=e.target.closest('[data-course]');if(b)openCourse(b.dataset.course);};
  let drag=null;
  view.onpointerdown=e=>{
    if(e.pointerType==='touch'||e.target.closest('button')||e.button!==0)return;
    drag=[e.clientX,e.clientY,view.scrollLeft,view.scrollTop];view.setPointerCapture(e.pointerId);view.classList.add('dragging');
  };
  view.onpointermove=e=>{if(drag){view.scrollLeft=drag[2]+drag[0]-e.clientX;view.scrollTop=drag[3]+drag[1]-e.clientY;}};
  view.onpointerup=view.onpointercancel=()=>{drag=null;view.classList.remove('dragging');};
}

