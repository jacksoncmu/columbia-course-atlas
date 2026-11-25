import { makePlanner } from './planner.js';
import { drawGraph } from './graph.js';

const dataFiles = ['catalog', 'cs-programs', 'econ-programs', 'stats-data-programs'];
const programOrder = [
  'computer-science', 'data-science', 'economics', 'economics-statistics',
  'financial-economics', 'information-science', 'statistics',
  'artificial-intelligence-minor', 'computer-science-minor'
];
const main = document.querySelector('main');
const map = document.querySelector('#map');
const sidebar = document.querySelector('#sidebar');
const controls = document.querySelector('#program-controls');
const dialog = document.querySelector('#detail');
const detail = document.querySelector('#detail-inner');
const storageKey = 'columbia-course-atlas-v1';
const codePattern = /^[A-Z]{3,5} [A-Z]{1,3}\d{4}$/;
const figures = {
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  link: '<path d="M14 5h5v5m0-5-8 8m5-2v8H5V8h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  fullscreen: '<path d="M14 4h6v6m0-6-7 7M10 20H4v-6m0 6 7-7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>'
};
const svg = name => '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + figures[name] + '</svg>';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const lookup = code => 'https://bulletin.columbia.edu/search/?P=' + encodeURIComponent(code);
const range = r => !r ? '?' : r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];
const codeOf = option => option.courses.join('|');
const groupOf = id => plan.groups.find(group => group.id === id);
const titleOf = code => plan.catalog[code]?.title || code;
const courseLine = code => code + ' · ' + titleOf(code);
const optionTitle = option => option.label || option.courses.map(courseLine).join(' + ');
function link(url, label) {
  try { if (new URL(url).protocol !== 'https:') return ''; }
  catch { return ''; }
  return '<a class="external" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + svg('link') + '</a>';
}
function formatPoints(total) {
  return range([total.low, total.high]) + (total.unknown ? ' + ?' : '');
}
function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

let catalog, programs, program, plan, graphView, toastTimer;
let settings = {};
let overlay = null;
const saved = readLocal(storageKey, {});
let sidebarOpen = readLocal(storageKey + '-sidebar', window.innerWidth >= 850);
let fallbackFullscreen = false;

function message(text) {
  const target = dialog.open ? detail.querySelector('.dialog-status') : document.querySelector('#toast');
  if (!target) return;
  target.textContent = text;
  clearTimeout(toastTimer);
  if (!dialog.open) toastTimer = setTimeout(() => target.textContent = '', 3500);
}
function refresh(keepPosition = true) {
  const previous = keepPosition ? graphView?.snapshot() : null;
  saved[program.id] = settings;
  writeLocal(storageKey, saved);
  plan = makePlanner(catalog, program, settings);
  render(previous);
}
function chooseProgram(id) {
  const next = programs.find(entry => entry.id === id) || programs[0];
  if (program?.id === next.id) return;
  program = next;
  settings = saved[program.id] || {};
  if (location.hash !== '#' + program.id) history.replaceState(null, '', '#' + program.id);
  if (dialog.open) dialog.close();
  refresh(false);
}
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  writeLocal(storageKey + '-sidebar', sidebarOpen);
  updateSidebarVisibility();
}
function updateSidebarVisibility() {
  main.classList.toggle('sidebar-open', sidebarOpen);
  sidebar.hidden = !sidebarOpen;
  const button = map.querySelector('#toggle-sidebar');
  button?.setAttribute('aria-expanded', String(sidebarOpen));
  if (!sidebarOpen && document.activeElement === document.body) button?.focus();
}
function syncFullscreen() {
  const active = fallbackFullscreen || document.fullscreenElement === map;
  if (document.body.classList.contains('graph-only') === active) return;
  document.body.classList.toggle('graph-only', active);
  graphView?.fit();
  map.querySelector(active ? '.viewport' : '#fullscreen')?.focus({preventScroll:true});
}
async function enterFullscreen() {
  try {
    if (!map.requestFullscreen) throw new Error('Fullscreen unavailable');
    await map.requestFullscreen();
  } catch {
    fallbackFullscreen = true;
  }
  syncFullscreen();
}
async function exitFullscreen() {
  if (document.fullscreenElement === map) await document.exitFullscreen();
  fallbackFullscreen = false;
  syncFullscreen();
}
document.addEventListener('fullscreenchange', syncFullscreen);
new ResizeObserver(() => graphView?.resize()).observe(map);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && fallbackFullscreen && !dialog.open) {
    event.preventDefault();
    exitFullscreen();
  }
});
function render(previous) {
  const groups = ['Major', 'Minor'].map(type => '<optgroup label="' + type + 's">' +
    programs.filter(p => p.type === type).map(p => '<option value="' + p.id + '" ' +
      (p === program ? 'selected' : '') + '>' + esc(p.name) + (type === 'Minor' ? ' minor' : '') + '</option>').join('') + '</optgroup>').join('');
  const variant = plan.variant ? '<label class="sr-only" for="variant">Program path</label><select class="control variant-select" id="variant">' +
    program.variants.map(v => '<option value="' + esc(v.id) + '" ' + (v.id === plan.variant.id ? 'selected' : '') + '>' + esc(v.label) + '</option>').join('') + '</select>' : '';
  controls.innerHTML = '<label class="sr-only" for="program">Academic program</label><select class="control program-select" id="program">' + groups + '</select>' + variant;
  renderSidebar();
  updateSidebarVisibility();
  graphView = drawGraph(map, plan, { esc, svg, range, sidebarOpen, toggleSidebar, openCourse, enterFullscreen, exitFullscreen }, previous);
}
function renderSidebar() {
  const choices = plan.groups.filter(group => !plan.fixed(group));
  const warnings = plan.warnings.length ? '<p class="notice">' + esc(plan.warnings.join(' ')) + '</p>' : '';
  sidebar.innerHTML = '<div class="sidebar-heading"><h2>Plan summary</h2><button class="icon-button" id="close-sidebar" aria-label="Collapse plan sidebar">' + svg('close') + '</button></div>' +
    '<dl class="metrics"><div><dt>Courses</dt><dd>' + plan.nodes.size + '</dd></div><div><dt>Points</dt><dd>' + esc(formatPoints(plan.allPoints)) + '</dd></div></dl>' +
    '<p class="quiet">Includes prerequisites and corequisites</p>' + warnings +
    '<h3 class="sidebar-label">Course choices</h3>' +
    '<ul class="group-list">' + choices.map(group => '<li><button class="group-link" data-open-group="' + group.id + '"><span>' + esc(group.label) + '</span><span class="group-count">' + plan.selected.get(group.id).length + '/' + group.pick + '</span></button></li>').join('') + '</ul>' +
    '<details class="program-notes"><summary>Program rules and sources</summary><p>' + esc(program.publishedCredits) + '</p><ul>' +
    [...(program.notes || []), ...(plan.variant?.notes || [])].map(note => '<li>' + esc(note) + '</li>').join('') +
    '</ul><div class="sources">' + link(program.source, 'General Studies Bulletin') + (program.sources || []).map(source => link(source.url, source.label)).join('') + '</div></details>' +
    '<button class="text-button" id="reset">Reset choices</button>';
}
function header(label, title) {
  return '<div class="info-head"><span class="kicker">' + esc(label) + '</span><button class="icon-button" data-close aria-label="Close details">' + svg('close') + '</button></div>' +
    '<h2 class="detail-title" id="detail-title">' + esc(title) + '</h2>';
}
function show(content, nextOverlay) {
  overlay = nextOverlay;
  detail.innerHTML = content + '<p class="dialog-status" role="status"></p>';
  if (!dialog.open) dialog.showModal();
  detail.scrollTop = 0;
}
function routes(code, kind, course) {
  const current = [...plan.paths.values()].filter(path => path.code === code && path.kind === kind);
  const rules = current.length ? current : (course[kind] || []).map(options => ({options}));
  return rules.map(path => {
    if (path.key && path.options.length > 1) {
      return '<label class="route"><span class="quiet">Choose one</span><select class="control" data-path="' + esc(path.key) + '" data-target="' + esc(code) + '">' +
        path.options.map(bundle => '<option value="' + esc(bundle.join('|')) + '" ' +
          (bundle.join('|') === path.chosen.join('|') ? 'selected' : '') + '>' + esc(bundle.map(courseLine).join(' + ')) + '</option>').join('') + '</select></label>';
    }
    return '<div class="chips route">' + path.options.map(bundle => bundle.map(prerequisite =>
      '<button class="chip" data-info-course="' + esc(prerequisite) + '">' + esc(courseLine(prerequisite)) + '</button>').join(' + ')).join(' <span class="quiet">or</span> ') + '</div>';
  }).join('');
}
function openCourse(code, expandChoices = false) {
  const course = plan.catalog[code] || {title:code, source:lookup(code), pre:[], co:[]};
  const node = plan.nodes.get(code);
  const group = node?.role === 'choice' ? node.group : null;
  const points = plan.points(code, plan.floors.get(code) || 0);
  const minimum = Math.max(plan.floors.get(code) || 0, course.credits?.[0] ?? 0);
  const maximum = course.credits?.[1] ?? 0;
  const creditPicker = minimum < maximum ? '<label class="route">Points to count <select class="control" data-points="' + esc(code) + '"><option value="">Use range</option>' +
    Array.from({length:Math.floor(maximum - minimum) + 1},(_,i)=>i + minimum).map(n => '<option ' +
      (settings.points?.[code] === n ? 'selected' : '') + '>' + n + '</option>').join('') + '</select></label>' : '';
  const pre = routes(code,'pre',course), co = routes(code,'co',course);
  const label = group ? 'Selected option' : node?.role === 'required' ? 'Required course' : node ? 'Prerequisite course' : 'Course details';
  const description = (course.description || 'Columbia’s individual course listing does not supply a description.').split(/\n+/).map(p => '<p>' + esc(p) + '</p>').join('');
  const sources = link(course.source || lookup(code), 'Bulletin course listing') + link(course.sourceExtra, 'Additional source') +
    (course.syllabus ? link(course.syllabus.url, course.syllabus.label) : '');
  show(header(label, course.title) + '<p class="detail-code"><span class="code">' + esc(code) + '</span><span>' + range(points) + ' points' +
    ((plan.repeats.get(code) || 1) > 1 ? ' each term' : '') + '</span></p>' + creditPicker +
    (group ? '<details class="choice-editor" ' + (expandChoices ? 'open' : '') + '><summary>Change selected course <span>' + group.options.length + ' options</span></summary>' +
      editor(group, code) + '</details>' : '') + '<section class="detail-section"><h3>Course description</h3><div class="description">' + description + '</div></section>' +
    '<section class="detail-section"><h3>Prerequisites</h3>' + (pre || course.preText ? '' : '<p class="quiet">No specific prerequisite courses listed.</p>') +
    pre + (course.preText ? '<p class="quiet">' + esc(course.preText) + '</p>' : '') + '</section>' +
    (co || course.coText ? '<section class="detail-section"><h3>Corequisites</h3>' + co +
      (course.coText ? '<p class="quiet">' + esc(course.coText) + '</p>' : '') + '</section>' : '') +
    (course.note ? '<p class="notice">' + esc(course.note) + '</p>' : '') +
    '<div class="sources">' + sources + '</div>', {code, group:group?.id});
  if (group) renderOptions('');
}
function openGroup(id) {
  const group = groupOf(id);
  show(header('Elective selection', group.label) + editor(group), {group:id});
  renderOptions('');
}
function editor(group, code) {
  const selected = plan.selected.get(group.id);
  const chosen = selected.find(option => option.courses.includes(code));
  const department = settings.departments?.[group.id] || selected[0]?.courses[0].split(' ')[0];
  const departments = [...new Set(group.options.map(option => option.courses[0].split(' ')[0]))].sort();
  const departmentMenu = group.openRule?.sameDepartment ? '<label class="route">Department <select class="control" data-department="' + group.id + '">' +
    departments.map(item => '<option ' + (item === department ? 'selected' : '') + '>' + esc(item) + '</option>').join('') + '</select></label>' : '';
  const replaceMenu = !chosen && selected.length === group.pick && selected.length > 1 ?
    '<label class="route">Replace <select class="control" id="replace-option">' +
    selected.map((option,i) => '<option value="' + i + '">' + esc(optionTitle(option)) + '</option>').join('') + '</select></label>' : '';
  return '<div class="editor"><p class="quiet">Choose ' + group.pick + ' · ' + esc(group.label) + '</p>' +
    (group.note ? '<p class="quiet">' + esc(group.note) + '</p>' : '') + departmentMenu + replaceMenu +
    (group.options.length > 8 ? '<input type="search" id="filter-options" class="control" aria-label="Filter course options" placeholder="Filter by course code or name">' : '') +
    '<ul class="option-list"></ul>' +
    (group.openRule ? '<details class="add-course"><summary>Add another eligible course</summary>' + addForm(group) + '</details>' : '') + '</div>';
}
function renderOptions(filter) {
  const group = groupOf(overlay.group);
  const list = detail.querySelector('.option-list');
  if (!group || !list) return;
  const selected = plan.selected.get(group.id);
  const department = settings.departments?.[group.id] || selected[0]?.courses[0].split(' ')[0];
  const options = [...selected, ...plan.ranking.get(group.id).filter(option => !selected.includes(option))];
  const match = filter.trim().toLowerCase();
  list.innerHTML = options.filter(option =>
    (!group.openRule?.sameDepartment || !department || option.courses.every(code => code.startsWith(department + ' '))) &&
    (!match || (optionTitle(option) + ' ' + option.courses.join(' ')).toLowerCase().includes(match))
  ).map(option => {
    const active = selected.includes(option);
    const assignedElsewhere = option.courses.map(code => plan.assigned.get(code)).find(other => other && other.id !== group.id);
    const floor = group.minCredits || group.openRule?.minCredits || 0;
    const values = option.courses.map(code => plan.points(code, floor));
    const points = values.some(value => !value) ? '?' :
      range([0,1].map(i => values.reduce((sum,value) => sum + value[i] * (option.repeats || 1),0)));
    const count = plan.rank(option.courses,new Set(),floor).count;
    const credits = points + ' pt · ' + count + (count === 1 ? ' linked prerequisite' : ' linked prerequisites');
    return '<li class="option-row"><div><div class="option-title">' + esc(optionTitle(option)) + '</div><div class="quiet">' + esc(credits) +
      (assignedElsewhere ? ' · Used in ' + esc(assignedElsewhere.label) : '') + (option.approval ? ' · Requires confirmation' : '') + '</div></div>' +
      '<button class="action ' + (active ? 'active' : '') + '" data-pick="' + group.options.indexOf(option) + '" ' +
      (active || assignedElsewhere ? 'disabled' : '') + '>' + (active ? 'Selected' : 'Choose') + '</button></li>';
  }).join('') || '<li class="quiet">No matching courses.</li>';
}
function applyChoice(index) {
  const group = groupOf(overlay.group);
  const option = group.options[index];
  const selected = plan.selected.get(group.id);
  const old = selected.find(entry => entry.courses.includes(overlay.code)) ||
    selected[Number(detail.querySelector('#replace-option')?.value || 0)];
  const replacing = selected.length >= group.pick;
  const next = replacing ? selected.map(entry => entry === old ? option : entry) : [...selected, option];
  const trial = {...settings, choices:{...settings.choices,[group.id]:next.map(codeOf)}};
  const result = makePlanner(catalog, program, trial);
  if (!result.selected.get(group.id).some(entry => codeOf(entry) === codeOf(option)) || result.warnings.length > plan.warnings.length) {
    message('That choice conflicts with another requirement. Change the overlapping selection first.');
    return;
  }
  settings = trial;
  refresh();
  openCourse(option.courses[0], true);
  message('Selection updated in the graph.');
}
function addForm(group) {
  return '<form class="manual-form" data-add-group="' + group.id + '"><label>Full course code <input class="control" name="code" placeholder="HIST UN3001" required></label>' +
    '<p class="quiet">For an unlisted course, enter its published details. ' + link('https://bulletin.columbia.edu/', 'Search the Bulletin') + '</p>' +
    '<label>Course title <input class="control" name="title"></label><label>Points <input class="control" name="points" type="number" min="0" max="15" step="0.5"></label>' +
    '<label>Prerequisites, separated by commas <input class="control" name="prereqs" placeholder="MATH UN1101, STAT UN1201"></label>' +
    '<label>Description <textarea class="control" name="description" rows="2"></textarea></label>' +
    '<label>Public syllabus URL <input class="control" type="url" name="syllabus"></label><button class="action" type="submit">Add to available choices</button></form>';
}
const normalize = text => text.trim().toUpperCase().replace(/\s+/g,' ');
detail.addEventListener('submit', event => {
  const form = event.target;
  const group = groupOf(form.dataset.addGroup);
  if (!group) return;
  event.preventDefault();
  const input = new FormData(form);
  const code = normalize(input.get('code'));
  if (!codePattern.test(code)) return message('Enter a subject and full course number, such as HIST UN3001.');
  const existing = plan.catalog[code];
  const points = existing?.credits?.[1] ?? Number(input.get('points'));
  const rule = group.openRule;
  const number = Number(code.slice(-4));
  if ((rule.minNumber && number < rule.minNumber) || (rule.minCredits && points < rule.minCredits) ||
      (rule.sameDepartment && /^(COMS|CSEE|CSOR|CSBS|CSPH|EECS) /.test(code))) return message('That course does not satisfy the published elective criteria.');
  if (!existing) {
    const title = input.get('title').trim();
    if (!title || input.get('points') === '') return message('Enter the course’s published title and points.');
    const pre = input.get('prereqs').split(',').filter(value => value.trim()).map(normalize);
    if (pre.some(value => !codePattern.test(value) || value === code)) return message('Enter valid prerequisite codes separated by commas.');
    const syllabus = input.get('syllabus');
    settings.customCourses = {...settings.customCourses, [code]:{
      title, credits:[points,points], source:lookup(code), pre:pre.map(value => [[value]]), co:[],
      description:input.get('description'), note:'Course information entered by you.',
      ...(syllabus ? {syllabus:{url:syllabus,label:'Public syllabus'}} : {})
    }};
  }
  settings.additions = {...settings.additions,[group.id]:[...new Set([...(settings.additions?.[group.id] || []),code])]};
  if (rule.sameDepartment) {
    settings.departments = {...settings.departments,[group.id]:code.split(' ')[0]};
    if (settings.choices) delete settings.choices[group.id];
  }
  refresh();
  openGroup(group.id);
  const filter = detail.querySelector('#filter-options');
  if (filter) filter.value = code;
  renderOptions(code);
  message('Course added to available choices.');
});
sidebar.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'close-sidebar') { toggleSidebar(); map.querySelector('#toggle-sidebar')?.focus(); }
  if (button.id === 'reset') { settings = {}; refresh(); message('Default choices restored.'); }
  if (button.dataset.openGroup) openGroup(button.dataset.openGroup);
});
controls.addEventListener('change', event => {
  if (event.target.id === 'program') chooseProgram(event.target.value);
  if (event.target.id === 'variant') { settings.variant = event.target.value; refresh(false); }
});
dialog.addEventListener('click', event => {
  if (event.target === dialog) { dialog.close(); return; }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-close')) dialog.close();
  if (button.dataset.infoCourse) openCourse(button.dataset.infoCourse);
  if (button.hasAttribute('data-pick')) applyChoice(Number(button.dataset.pick));
});
detail.addEventListener('input', event => {
  if (event.target.id === 'filter-options') renderOptions(event.target.value);
});
detail.addEventListener('change', event => {
  const {path,target,points,department} = event.target.dataset;
  if (path) {
    settings.paths = {...settings.paths,[path]:event.target.value};
    refresh(); openCourse(target);
  }
  if (points) {
    settings.points = {...settings.points};
    if (event.target.value === '') delete settings.points[points];
    else settings.points[points] = Number(event.target.value);
    refresh(); openCourse(points);
  }
  if (department) {
    settings.departments = {...settings.departments,[department]:event.target.value};
    if (settings.choices) delete settings.choices[department];
    refresh(); openGroup(department);
  }
});
window.addEventListener('hashchange', () => { if (programs) chooseProgram(location.hash.slice(1)); });
try {
  const [records,...families] = await Promise.all(dataFiles.map(async file => {
    const response = await fetch('data/' + file + '.json');
    if (!response.ok) throw new Error('Could not load ' + file);
    return response.json();
  }));
  catalog = records;
  const all = families.flat();
  programs = programOrder.map(id => all.find(entry => entry.id === id));
  chooseProgram(location.hash.slice(1));
} catch (error) {
  map.innerHTML = '<p class="notice" role="alert">The course atlas could not load. Reload the page to try again.</p>';
  console.error(error);
}
