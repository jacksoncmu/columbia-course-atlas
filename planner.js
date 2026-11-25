/* Course rules are AND groups. Each group accepts one of several course bundles. */
export function makePlanner(catalog, program, settings = {}) {
  const courses = {...catalog, ...settings.customCourses};
  const variant = program.variants?.find(v => v.id === settings.variant) || program.variants?.[0];
  const sections = [...(variant?.sections || []), ...program.sections];
  const groups = sections.flatMap(section => section.groups.map(original => {
    const group = {...original, section: section.name, options: [...original.options]};
    if (group.openRule) {
      for (const code of settings.additions?.[group.id] || []) {
        if (courses[code] && !group.options.some(o => o.courses.includes(code))) group.options.push({courses:[code]});
      }
    }
    return group;
  }));
  const conflicts = [...(program.conflicts || []), ...(program.exclusions || [])];
  const selected = new Map();
  const assigned = new Map();
  const floors = new Map();
  const repeats = new Map();
  const edges = [];
  const warnings = [];
  const paths = new Map();
  const nodes = new Map();
  const routeMemo = new Map();
  const scoreMemo = new Map();
  const number = code => Number(code.match(/\d{4}/)?.[0] || 9999);
  const byNum = (a,b) => number(a)-number(b) || a.localeCompare(b);
  function points(code, floor=0) {
    const r = courses[code]?.credits;
    if (!r) return null;
    const value = settings.points?.[code];
    if (Number.isFinite(value) && value>=Math.max(r[0],floor) && value<=r[1]) return [value,value];
    return [Math.max(r[0],floor),Math.max(r[1],floor)];
  }
  function compare(a,b) {
    return a.missing-b.missing || a.count-b.count || a.points-b.points ||
      a.numbers.localeCompare(b.numbers) || a.id.localeCompare(b.id);
  }
  function rank(bundle, trail = new Set(), floor=0, terms=1) {
    const key = bundle.join('|') + ':' + floor + ':' + terms;
    if (!trail.size && scoreMemo.has(key)) return scoreMemo.get(key);
    const all = new Set();
    for (const code of bundle) for (const c of ancestors(code, trail)) all.add(c);
    bundle.forEach(c => all.delete(c));
    const score = {
      missing: bundle.some(c => !courses[c]?.credits || courses[c].unverified) ? 1 : 0,
      count: all.size,
      points: terms*bundle.reduce((n,c) => n+(points(c,floor)?.[0] ?? 1000),0),
      numbers: bundle.slice().sort(byNum).map(c=>String(number(c))).join('/'),
      id:bundle.join('|')
    };
    if (!trail.size) scoreMemo.set(key,score);
    return score;
  }
  function ancestors(code, trail) {
    if (trail.has(code)) return new Set();
    if (routeMemo.has(code)) return routeMemo.get(code);
    const result=new Set(), branch=new Set([...trail,code]);
    for (const rule of courses[code]?.pre || []) {
      const opts=rule.filter(bundle=>!bundle.some(c=>branch.has(c)));
      const best=opts.map(codes=>({codes,score:rank(codes,branch)})).sort((a,b)=>compare(a.score,b.score))[0];
      for (const c of best?.codes || []) {
        result.add(c);
        for(const other of ancestors(c,branch)) result.add(other);
      }
    }
    routeMemo.set(code,result);
    return result;
  }
  function allowed(group, opt, existing) {
    if (!opt || opt.courses.some(c=>!courses[c])) return false;
    const used=[...assigned.keys(), ...existing.flatMap(o=>o.courses)];
    if(opt.courses.some(c=>used.includes(c)))return false;
    if(conflicts.some(set=>set.some(c=>used.includes(c)) && set.some(c=>opt.courses.includes(c))))return false;
    const floor=group.minCredits || group.openRule?.minCredits || 0;
    if(opt.courses.some(c=>courses[c].credits && courses[c].credits[1]<floor))return false;
    if(group.openRule?.sameDepartment) {
      const dept=settings.departments?.[group.id] || existing[0]?.courses[0]?.split(' ')[0];
      if(dept && opt.courses.some(c=>c.split(' ')[0]!==dept))return false;
      if(!dept && group.options.filter(o=>o.courses[0].startsWith(opt.courses[0].split(' ')[0]+' ')).length<group.pick)return false;
    }
    const combined=[...used,...opt.courses];
    if ((program.courseLimits || []).some(l=>combined.filter(c=>l.courses.includes(c)).length>l.max))return false;
    if ((program.creditCaps || []).some(l=>combined.filter(c=>l.courses.includes(c)).reduce((sum,c)=>sum+(points(c,Math.max(floors.get(c)||0,opt.courses.includes(c)?floor:0))?.[0]||0),0)>l.maxCredits))return false;
    return true;
  }
  const keyFor=o=>o.courses.join('|');
  function allocate(group, options, target) {
    let picked=selected.get(group.id) || [];
    for(const opt of options) {
      if(picked.length>=target)break;
      if(!allowed(group,opt,picked))continue;
      picked=[...picked,opt];
      for(const c of opt.courses) {
        assigned.set(c,group);
        floors.set(c,group.minCredits||group.openRule?.minCredits||0);
        repeats.set(c,opt.repeats||1);
      }
    }
    selected.set(group.id,picked);
  }
  const fixed=g=>g.pick===g.options.length && !g.openRule;
  for(const group of groups.filter(fixed))allocate(group,group.options,group.pick);
  for(const group of groups.filter(g=>!fixed(g))) {
    const saved=settings.choices?.[group.id] || [];
    allocate(group,saved.map(id=>group.options.find(o=>keyFor(o)===id)).filter(Boolean),group.pick);
  }
  const ranking=new Map();
  for(const group of groups){
    const floor=group.minCredits||group.openRule?.minCredits||0;
    const ordered=group.options.map(o=>({o,s:rank(o.courses,new Set(),floor,o.repeats||1)}))
      .sort((a,b)=>Number(Boolean(a.o.approval))-Number(Boolean(b.o.approval))||compare(a.s,b.s)).map(v=>v.o);
    ranking.set(group.id,ordered);
    allocate(group,ordered,group.pick);
    if(selected.get(group.id).length<group.pick)warnings.push(group.label+' needs another eligible course.');
  }
  // The department accepts the completed two-term honors sequence in lieu of standard math preparation.
  const honors=assigned.has('MATH UN1207') && assigned.has('MATH UN1208');
  const standardHonors=new Set(['MATH UN1101','MATH UN1102','MATH UN1201','MATH UN2010']);
  function effective(code,target) {
    if(honors && standardHonors.has(code) && !target.startsWith('MATH UN1207') && !target.startsWith('MATH UN1208'))return 'MATH UN1208';
    return code;
  }
  const fixedNodes=new Set(assigned.keys());
  function visit(code, trail=new Set()) {
    if(trail.has(code) || nodes.has(code))return;
    const course=courses[code] || {title:code,pre:[],co:[],credits:null};
    const group=assigned.get(code);
    nodes.set(code,{code,course,group,role:group?(fixed(group)?'required':'choice'):'prerequisite'});
    const extra=(program.programPrerequisites||[]).filter(p=>p.courses.includes(code)).map(p=>p.oneOf.map(c=>[c]));
    for(const kind of ['pre','co']){
      const requirements = kind==='pre'?[...(course.pre||[]),...extra]:course.co||[];
      requirements.forEach((rule,index)=>{
        const pathKey=code+'~'+kind+index;
        const options=rule.map(bundle=>[...new Set(bundle.map(c=>effective(c,code)))]);
        const saved=settings.paths?.[pathKey];
        const preferred=options.find(o=>o.join('|')===saved);
        const comparable=b=>b.reduce((n,c)=>n+(fixedNodes.has(c)?0:1),0);
        const best=preferred || [...options].sort((a,b)=>comparable(a)-comparable(b)||compare(rank(a),rank(b)))[0];
        if(!best)return;
        paths.set(pathKey,{key:pathKey,code,kind,options,chosen:best});
        for(const from of best) {
          if(from===code)continue;
          if(!edges.some(e=>e.from===from && e.to===code && e.kind===kind))edges.push({from,to:code,kind});
          visit(from,new Set([...trail,code]));
        }
      });
    }
  }
  for(const code of fixedNodes)visit(code);
  function total(codes) {
    let low=0,high=0,unknown=false;
    for(const c of codes) {
      const val=points(c,floors.get(c)||0);
      if(!val){unknown=true;continue;}
      low+=val[0]*(repeats.get(c)||1);high+=val[1]*(repeats.get(c)||1);
    }
    return {low,high,unknown};
  }
  return {program,variant,groups,selected,assigned,ranking,nodes,edges,paths,warnings,points,floors,repeats,fixed,rank,
    programPoints:total(fixedNodes),allPoints:total(nodes.keys()),catalog:courses};
}

