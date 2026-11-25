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

function edgePorts(edges, positions) {
  const sides = new Map();
  const attach = (code, side, other, port) => {
    const key = code + ':' + side;
    if (!sides.has(key)) sides.set(key, []);
    sides.get(key).push({other,port});
  };
  const links = [];
  for (const edge of edges) {
    const from = positions.get(edge.from), to = positions.get(edge.to);
    if (!from || !to) continue;
    const startSide = from.x <= to.x ? 1 : -1;
    const endSide = from.x < to.x ? -1 : 1;
    const start = {x:from.x + (startSide > 0 ? cardWidth : 0),y:from.y};
    const end = {x:to.x + (endSide > 0 ? cardWidth : 0) + endSide * 4,y:to.y};
    attach(edge.from,startSide,to,start);
    attach(edge.to,endSide,from,end);
    links.push({edge,from,to,start,end,startSide});
  }
  for (const ports of sides.values()) {
    ports.sort((a,b) => a.other.y - b.other.y || a.other.x - b.other.x);
    const spacing = Math.min(14, (cardHeight - 36) / Math.max(1,ports.length - 1));
    ports.forEach(({port},index) => {
      port.y += cardHeight / 2 + (index - (ports.length - 1) / 2) * spacing;
    });
  }
  return links;
}

function roundedRoute(points) {
  const coordinate = ([x,y]) => x + ' ' + y;
  const toward = ([x,y],[tx,ty]) => {
    const distance = Math.hypot(tx - x,ty - y);
    if (!distance) return [x,y];
    const fraction = Math.min(18 / distance,.5);
    return [x + (tx - x) * fraction,y + (ty - y) * fraction];
  };
  let path = 'M' + coordinate(points[0]);
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    path += ' L' + coordinate(toward(point,points[i - 1])) +
      ' Q' + coordinate(point) + ' ' + coordinate(toward(point,points[i + 1]));
  }
  return path + ' L' + coordinate(points.at(-1));
}

function edgePath(link,index,positions) {
  const {from,to,start,end,startSide:direction} = link;
  const first = 'M' + start.x + ' ' + start.y;
  const last = end.x + ' ' + end.y;
  if (from.x === to.x) {
    const bend = Math.max(start.x,end.x) + 18 + index % 4;
    return first + ' C' + bend + ' ' + start.y + ' ' + bend + ' ' + end.y + ' ' + last;
  }

  const bend = (end.x - start.x) * .46;
  const controlStart = start.x + bend, controlEnd = end.x - bend;
  const left = Math.min(start.x,end.x), right = Math.max(start.x,end.x);
  const obstacles = positions.filter(card => card !== from && card !== to &&
    card.x + cardWidth > left && card.x < right);
  const steps = Math.ceil((right - left) / 6);
  // Sample the cubic only where another card could cover it.
  for (let i = 1; obstacles.length && i < steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u**3 * start.x + 3 * u**2 * t * controlStart + 3 * u * t**2 * controlEnd + t**3 * end.x;
    const y = start.y + (end.y - start.y) * (3 * t**2 - 2 * t**3);
    if (obstacles.some(card => x > card.x - 3 && x < card.x + cardWidth + 3 &&
        y > card.y - 3 && y < card.y + cardHeight + 3)) {
      const startLane = start.x + direction * (9 + index % 4);
      const endLane = end.x - direction * (5 + index % 4);
      const laneOffset = 5 + (index % 4) * 3;
      const rowLane = to.y < from.y ? from.y - laneOffset : from.y + cardHeight + laneOffset;
      return roundedRoute([[start.x,start.y],[startLane,start.y],[startLane,rowLane],
        [endLane,rowLane],[endLane,end.y],[end.x,end.y]]);
    }
  }
  return first + ' C' + controlStart + ' ' + start.y + ' ' + controlEnd + ' ' + end.y + ' ' + last;
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
    const edges = edgePorts(plan.edges,pos).map((link,i) => {
      const {edge} = link;
      return '<path data-from="'+esc(edge.from)+'" data-to="'+esc(edge.to)+'" d="'+edgePath(link,i,positions)+'" fill="none" stroke="'+
        (edge.kind === 'pre' ? '#758da8' : '#638985')+'" stroke-width="1.9" stroke-linecap="round" '+(edge.kind === 'co' ? 'stroke-dasharray="4 4"' : '')+
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
      mark('pre','#758da8')+mark('co','#638985')+'</defs>'+edges+'</svg>'+levelLabels+cards;
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

