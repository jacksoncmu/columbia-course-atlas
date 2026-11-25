const cardWidth = 246;
const cardHeight = 114;
const levelGap = 70;
const columnGap = 26;
const rowGap = 20;
const margin = 24;
const labelSpace = 30;
const rowStep = cardHeight + rowGap;

function levelsOf(plan) {
  const nodes = [...plan.nodes.keys()];
  const parents = new Map(nodes.map(code => [code, []]));
  const children = new Map(nodes.map(code => [code, []]));
  const neighbors = new Map(nodes.map(code => [code, new Set()]));
  for (const edge of plan.edges) {
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
    if (edge.kind === 'pre') {
      parents.get(edge.to)?.push(edge.from);
      children.get(edge.from)?.push(edge.to);
    }
  }
  const levels = new Map();
  function depth(code, seen = new Set()) {
    if (levels.has(code)) return levels.get(code);
    if (seen.has(code)) return 0;
    const before = parents.get(code) || [];
    const branch = new Set([...seen, code]);
    const value = before.length ? 1 + Math.max(...before.map(parent => depth(parent, branch))) : 0;
    levels.set(code, value);
    return value;
  }
  for (const code of nodes) depth(code);
  for (const edge of plan.edges.filter(edge => edge.kind === 'co')) {
    if (!parents.get(edge.from).length && !children.get(edge.from).length) {
      levels.set(edge.from, levels.get(edge.to));
    }
  }
  const buckets = [];
  const independent = [];
  for (const code of nodes) {
    if (!neighbors.get(code).size) independent.push(code);
    else (buckets[levels.get(code)] ||= []).push(code);
  }
  const degree = code => neighbors.get(code).size;
  for (const bucket of buckets) bucket.sort((a,b) => degree(b) - degree(a) || a.localeCompare(b));
  for (let i = 1; i < buckets.length; i++) {
    const previous = buckets[i - 1];
    const center = code => {
      const rows = [...neighbors.get(code)].map(neighbor => previous.indexOf(neighbor)).filter(row => row >= 0);
      return rows.length ? rows.reduce((a,b) => a + b, 0) / rows.length : Infinity;
    };
    buckets[i].sort((a,b) => center(a) - center(b) || degree(b) - degree(a) || a.localeCompare(b));
  }
  independent.sort();
  return {buckets, independent};
}
const gridWidth = count => count * cardWidth + Math.max(0,count - 1) * columnGap;
const gridHeight = rows => rows ? rows * rowStep - rowGap : 0;

/* Try different row limits and keep the layout with the largest uniform scale. */
export function layout(plan, width, height, labelsVisible = true) {
  const {buckets, independent} = levelsOf(plan);
  const tallest = Math.max(1, ...buckets.map(bucket => bucket.length));
  const labelsHeight = labelsVisible ? labelSpace : 0;
  let best;
  for (let limit = 1; limit <= tallest; limit++) {
    const columns = buckets.map(bucket => Math.ceil(bucket.length / limit));
    const mainWidth = columns.reduce((sum,count) => sum + gridWidth(count), 0) + Math.max(0,columns.length - 1) * levelGap;
    const mainRows = buckets.length ? Math.min(tallest,limit) : 0;
    const mainHeight = mainRows ? labelsHeight + gridHeight(mainRows) : 0;
    for (let detachedCols = 1; detachedCols <= Math.max(1,independent.length); detachedCols++) {
      const detachedRows = Math.ceil(independent.length / detachedCols);
      const detachedTop = mainHeight + (mainRows && detachedRows ? 29 : 0);
      const w = Math.max(cardWidth, mainWidth, detachedRows ? gridWidth(detachedCols) : 0) + margin * 2;
      const h = detachedTop + (detachedRows ? labelsHeight + gridHeight(detachedRows) : 0) + margin * 2;
      const scale = Math.min(width / w, height / h);
      if (!best || scale > best.scale) best = {limit, columns, detachedCols, detachedRows, detachedTop, width:w, height:h, scale};
    }
  }
  const pos = new Map();
  const labels = [];
  let x = margin;
  buckets.forEach((bucket,level) => {
    const count = best.columns[level];
    const rows = Math.ceil(bucket.length / count);
    labels.push({x,y:margin, text:level === 0 ? 'Starting courses' : 'Level ' + (level + 1)});
    bucket.forEach((code,index) => {
      const column = Math.floor(index / rows);
      const lane = level === 0 ? count - 1 - column : column;
      pos.set(code,{x:x + lane * (cardWidth + columnGap),y:margin + labelsHeight + (index % rows) * rowStep});
    });
    x += gridWidth(count) + levelGap;
  });
  if (best.detachedRows) {
    const y = margin + best.detachedTop;
    labels.push({x:margin,y,text:'Independent courses'});
    independent.forEach((code,i) => pos.set(code,{
      x:margin + (i % best.detachedCols) * (cardWidth + columnGap),
      y:y + labelsHeight + Math.floor(i / best.detachedCols) * rowStep
    }));
  }
  return {...best,pos,labels};
}

function edgePath(from,to,index,positions) {
  const middle = cardHeight / 2;
  const startY = from.y + middle;
  const endY = to.y + middle;
  if (from.x < to.x) {
    const start = from.x + cardWidth;
    const end = to.x - 4;
    if (positions.some(card => card.x > from.x && card.x < to.x)) {
      // The space below each row keeps long links clear of wrapped columns.
      const startLane = start + 7 + index % 4;
      const endLane = end - 4 - index % 4;
      const rowLane = from.y + cardHeight + 4 + 3 * (index % 4);
      return 'M'+start+' '+startY+' H'+startLane+' V'+rowLane+' H'+endLane+' V'+endY+' H'+end;
    }
    const center = (start + end) / 2;
    return 'M'+start+' '+startY+' C'+center+' '+startY+' '+center+' '+endY+' '+end+' '+endY;
  }
  if (from.x === to.x) {
    const right = from.x + cardWidth;
    const lane = right + 13 + 4 * (index % 3);
    return 'M'+right+' '+(startY+9)+' C'+lane+' '+(startY+9)+' '+lane+' '+(endY+9)+' '+(right+3)+' '+(endY+9);
  }
  return 'M'+from.x+' '+startY+' C'+(from.x-20)+' '+(startY-22)+' '+(to.x+cardWidth+24)+' '+(endY-22)+' '+(to.x+cardWidth+3)+' '+endY;
}

export function drawGraph(host, plan, helpers, previous) {
  const {esc,svg,openCourse,range,toggleSidebar,sidebarOpen,enterFullscreen,exitFullscreen} = helpers;
  const hasCorequisite = plan.edges.some(edge => edge.kind === 'co');
  host.innerHTML =
    '<button class="flat" id="exit-fullscreen">Exit fullscreen</button>' +
    '<div class="viewport" tabindex="0" aria-label="Course prerequisite graph"><div class="world"><div class="drawing"></div></div></div>' +
    '<div class="canvas-tools"><button class="flat" id="toggle-sidebar" aria-controls="sidebar" aria-expanded="' + sidebarOpen +
    '" title="Toggle plan sidebar">' + svg('sidebar') + '<span>Plan</span></button><div class="tools"><div class="seg">' +
    '<button id="out" aria-label="Zoom out">' + svg('minus') + '</button><span class="zoom-label"></span><button id="in" aria-label="Zoom in">' + svg('plus') +
    '</button></div><button class="flat" id="fit" title="Fit the full plan">' + svg('fit') + 'Fit</button>' +
    '<button class="flat" id="fullscreen" aria-label="Fullscreen" title="Fullscreen. Escape or double-click empty space to exit.">' + svg('fullscreen') +
    '<span>Fullscreen</span></button></div></div><div class="legend" aria-label="Map legend"><span><i class="dot"></i>Required</span>' +
    '<span><i class="dot choice"></i>Selected option</span><span><i class="dot prerequisite"></i>Prerequisite only</span>' +
    (hasCorequisite ? '<span><i class="dash"></i>Corequisite</span>' : '') + '</div>';
  const view = host.querySelector('.viewport');
  const world = view.querySelector('.world');
  const drawing = view.querySelector('.drawing');
  const zoomLabel = host.querySelector('.zoom-label');
  const mark = (kind,color) => '<marker id="end-'+kind+'" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="'+color+'"/></marker>';
  let geometry, zoom = 1, inset = 0, fitted = previous?.fitted !== false;

  function pack() {
    const graphOnly = document.body.classList.contains('graph-only');
    inset = graphOnly ? 0 : 53;
    const bottom = graphOnly ? 0 : host.querySelector('.legend').offsetHeight + 19;
    geometry = layout(plan, Math.max(1,view.clientWidth - 4), Math.max(1,view.clientHeight - inset - bottom - 4), !graphOnly);
    const {pos,labels,width,height} = geometry;
    const positions = [...pos.values()];
    const edges = plan.edges.map((edge,i) => {
      const from = pos.get(edge.from), to = pos.get(edge.to);
      if (!from || !to) return '';
      return '<path data-from="'+esc(edge.from)+'" data-to="'+esc(edge.to)+'" d="'+edgePath(from,to,i,positions)+'" fill="none" stroke="'+
        (edge.kind === 'pre' ? '#8c9fb5' : '#6e928f')+'" stroke-width="1.6" '+(edge.kind === 'co' ? 'stroke-dasharray="4 4"' : '')+
        ' marker-end="url(#end-'+edge.kind+')"/>';
    }).join('');
    const levelLabels = graphOnly ? '' : labels.map(label =>
      '<span class="level" style="left:'+label.x+'px;top:'+label.y+'px">'+esc(label.text)+'</span>').join('');
    const cards = [...pos].map(([code,p]) => {
      const node = plan.nodes.get(code);
      const value = range(plan.points(code,plan.floors.get(code) || 0));
      return '<button class="node '+node.role+'" style="left:'+p.x+'px;top:'+p.y+'px;width:'+cardWidth+'px;height:'+cardHeight+
        'px" data-course="'+esc(code)+'" aria-label="'+esc(code+', '+node.course.title+', '+value+' points. Expand course details.')+
        '"><span class="node-meta"><span class="code">'+esc(code)+'</span><span class="pt">'+esc(value)+
        ' pt</span></span><span class="node-name">'+esc(node.course.title)+'</span></button>';
    }).join('');
    drawing.style.width = width + 'px';
    drawing.style.height = height + 'px';
    drawing.innerHTML = '<svg class="edges" width="'+width+'" height="'+height+'" aria-hidden="true"><defs>'+
      mark('pre','#8195aa')+mark('co','#6e928f')+'</defs>'+edges+'</svg>'+levelLabels+cards;
  }

  function setZoom(value, center = false) {
    const left = parseFloat(drawing.style.left) || 0;
    const originX = (view.scrollLeft + view.clientWidth / 2 - left) / zoom;
    const originY = (view.scrollTop + view.clientHeight / 2 - inset) / zoom;
    zoom = Math.max(.025,Math.min(1.8,value));
    const width = geometry.width * zoom;
    const height = geometry.height * zoom + inset;
    const offset = Math.max(0,(view.clientWidth - width) / 2);
    world.style.width = Math.max(view.clientWidth,Math.ceil(width)) + 'px';
    world.style.height = Math.max(view.clientHeight,Math.ceil(height)) + 'px';
    drawing.style.left = offset + 'px';
    drawing.style.top = inset + 'px';
    drawing.style.transform = 'scale('+zoom+')';
    zoomLabel.textContent = Math.round(zoom * 100) + '%';
    if (center) {
      view.scrollLeft = originX * zoom + offset - view.clientWidth / 2;
      view.scrollTop = originY * zoom + inset - view.clientHeight / 2;
    }
  }
  function fit() {
    fitted = true;
    pack();
    setZoom(Math.min(1,geometry.scale));
    view.scrollTo(0,0);
  }
  function adjustZoom(factor) {
    fitted = false;
    setZoom(zoom * factor,true);
  }
  if (fitted) fit();
  else {
    pack();
    setZoom(previous.zoom);
    view.scrollTo(previous.left,previous.top);
  }
  host.querySelector('#out').onclick = () => adjustZoom(1 / 1.2);
  host.querySelector('#in').onclick = () => adjustZoom(1.2);
  host.querySelector('#fit').onclick = fit;
  host.querySelector('#toggle-sidebar').onclick = toggleSidebar;
  host.querySelector('#fullscreen').onclick = enterFullscreen;
  host.querySelector('#exit-fullscreen').onclick = exitFullscreen;
  view.onclick = event => {
    const card = event.target.closest('[data-course]');
    if (card) openCourse(card.dataset.course);
  };
  view.ondblclick = event => {
    if (document.body.classList.contains('graph-only') && !event.target.closest('button')) exitFullscreen();
  };
  let drag = null, lastTap = null;
  view.onpointerdown = event => {
    if (event.pointerType === 'touch' || event.target.closest('button') || event.button !== 0) return;
    drag = {x:event.clientX,y:event.clientY,left:view.scrollLeft,top:view.scrollTop};
    view.setPointerCapture(event.pointerId);
    view.classList.add('dragging');
  };
  view.onpointermove = event => {
    if (!drag) return;
    view.scrollLeft = drag.left + drag.x - event.clientX;
    view.scrollTop = drag.top + drag.y - event.clientY;
  };
  function endDrag() {
    drag = null;
    view.classList.remove('dragging');
  }
  view.onpointercancel = endDrag;
  view.onpointerup = event => {
    endDrag();
    if (event.pointerType !== 'touch' || event.target.closest('button') ||
        !document.body.classList.contains('graph-only')) return;
    if (lastTap && event.timeStamp - lastTap.time < 350 &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 36) {
      lastTap = null;
      exitFullscreen();
    } else {
      lastTap = {time:event.timeStamp,x:event.clientX,y:event.clientY};
    }
  };
  return {
    snapshot:() => ({fitted,zoom,left:view.scrollLeft,top:view.scrollTop}),
    resize:() => { if (fitted) fit(); else setZoom(zoom); },
    fit
  };
}

