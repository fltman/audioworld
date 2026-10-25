/**
 * The admin film, scene by scene: what Lova says (with `{cue}` markers) and what happens on
 * screen when she gets to each cue. Scenes 03–06 build a small new walk ("Min första runda");
 * 07–16 go through the demo walk "Kalmar i lurarna" (scripts/kalmar-demo), which must be
 * imported in the admin first.
 */

export const DEMO = 'Kalmar i lurarna — en demorunda';
export const MINE = 'Min första runda';

// Places on the map (the demo walk's own coordinates, see scripts/kalmar-demo/course.mjs).
const AT = {
  castle: [56.6581, 16.3552],
  park: [56.6603, 16.3556],
  stortorget: [56.6643, 16.3653],
  harbour: [56.6602, 16.3618],
  vasterport: [56.6631, 16.3595],
};

// --- Small helpers on top of the actor ------------------------------------------------------

/** The input/select/textarea of the inspector field whose label reads `label`. */
const field = (page, label, nth = 0) =>
  page
    .locator('.inspector .label', { hasText: label })
    .nth(nth)
    .locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " form-field ")][1]')
    .locator('input, select, textarea')
    .first();
const check = (page, label) => page.locator('.inspector label.check', { hasText: label }).first();
const toolBtn = (page, name) => page.locator('.tool-row button', { hasText: name }).first();
const editPoint = async (a, name) => {
  const row = a.page.locator('.point-row', { hasText: name }).first();
  await row.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await a.sleep(500);
  await a.click(row.getByRole('button', { name: 'Edit' }));
  await a.sleep(500);
};
/** Replace a number field's value by typing. */
const setNumber = async (a, loc, value) => {
  await a.click(loc);
  await a.page.keyboard.press('ControlOrMeta+A');
  await a.page.keyboard.type(String(value), { delay: 60 });
  await a.sleep(200);
};

// --- Title cards ----------------------------------------------------------------------------

export function card({ kicker, title, sub, image }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#0d0f17;color:#eef0f7;font-family:-apple-system,"Segoe UI",Inter,Helvetica,Arial,sans-serif;overflow:hidden}
    .bg{position:absolute;inset:0;background:${image ? `url(${image}) center/cover` : 'none'};opacity:.42;transform:scale(1.04);animation:drift 18s ease-out forwards}
    .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(13,15,23,.96) 0%,rgba(13,15,23,.78) 48%,rgba(13,15,23,.25) 100%)}
    .box{position:absolute;left:96px;top:50%;transform:translateY(-50%);max-width:760px;animation:rise 1s ease-out both}
    .kicker{font-size:18px;letter-spacing:.22em;text-transform:uppercase;color:#a99bff;font-weight:600}
    h1{font-size:68px;line-height:1.04;margin:18px 0 22px;font-weight:750;letter-spacing:-.02em}
    p{font-size:24px;line-height:1.45;color:#c9cde0;margin:0}
    .brand{position:absolute;left:96px;bottom:64px;font-size:20px;font-weight:700;letter-spacing:.02em}
    .brand span{color:#a99bff;font-size:13px;letter-spacing:.2em;margin-left:8px}
    @keyframes rise{from{opacity:0;transform:translateY(-44%)}to{opacity:1;transform:translateY(-50%)}}
    @keyframes drift{to{transform:scale(1.12)}}
  </style></head><body><div class="bg"></div><div class="shade"></div>
  <div class="box"><div class="kicker">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>
  <div class="brand">AudioWorld<span>ADMIN</span></div></body></html>`;
}

// --- The scenes -----------------------------------------------------------------------------

export const SCENES = [
  {
    id: 'intro',
    chapter: 'Inledning',
    card: { kicker: 'Instruktionsfilm', title: 'Så bygger du en ljudvandring i AudioWorld', sub: 'Admin steg för steg, med demorundan Kalmar i lurarna — från Turistcenter till Kalmar slott.', image: 'cover' },
    vo: `Hej! Jag heter Lova. I den här filmen visar jag hur man bygger en ljudvandring i AudioWorld, och vad man kan göra i admin. Först bygger vi grunderna i en ny runda. Sedan går vi igenom demorundan Kalmar i lurarna, där varje punkt visar en ny möjlighet.`,
  },
  {
    id: 'overview',
    chapter: 'Översikt',
    course: DEMO,
    vo: `När du har loggat in hamnar du på fliken Courses. {tabs}Överst finns flikarna: Courses för rundorna, Sounds för ljudbiblioteket, Guides för dina guider, och Help, där hela dokumentationen finns. {course}Här väljer du vilken runda du arbetar med, {new}med plus New skapar du en ny, {play}och Playtest låter dig provlyssna direkt i webbläsaren. {publish}Till vänster finns publiceringen, {types}de fem punkttyperna, {tools}verktygen {list}och listan med alla punkter. {map}I mitten ligger kartan. {legend}Varje färg är en punkttyp.`,
    async run(a, at) {
      const p = a.page;
      await at('tabs');
      await a.spot('.tabs', 2600);
      for (const t of ['Courses', 'Sounds', 'Guides', 'Help']) {
        await a.hover(p.locator('.tabs .tab', { hasText: t }));
        await a.sleep(550);
      }
      await at('course');
      await a.spot('.topbar__select', 1500);
      await at('new');
      await a.hover(p.getByRole('button', { name: '+ New' }));
      await at('play');
      await a.hover(p.getByRole('button', { name: '▶ Playtest' }));
      await at('publish');
      await a.spot('.section.publish', 1400);
      await at('types');
      await a.spot('.type-grid', 1400);
      await at('tools');
      await a.spot('.tool-row', 1400);
      await at('list');
      await a.spot('.point-list', 1400);
      await at('map');
      await a.moveTo(1000, 420);
      await a.fly(56.6612, 16.3592, 15, 1.4);
      await at('legend');
      await a.spot('.legend', 2000);
    },
  },
  {
    id: 'new-course',
    chapter: 'Skapa en runda',
    course: DEMO,
    vo: `Vi börjar med en ny runda. {new}Klicka på plus New, {name}skriv ett namn {create}och klicka på Create. {goto}Leta sedan upp platsen med sökrutan på kartan. {settings}Under Settings fyller du i det besökaren ser på rundans startsida: {desc}namn, beskrivning {cover}och omslagsbild. {idea}Idén och bakgrunden längre ner är dina egna anteckningar. Besökaren ser dem aldrig, men AI-assistenten läser dem. {save}Glöm inte att spara.`,
    async run(a, at, ctx) {
      const p = a.page;
      await at('new');
      await a.click(p.getByRole('button', { name: '+ New' }));
      await at('name');
      await a.type(p.locator('.inspector input.input').first(), MINE);
      await at('create');
      await a.click(p.getByRole('button', { name: 'Create' }));
      await at('goto');
      await a.type('.map-search__input', 'Kalmar slott');
      await a.click('.map-search__btn');
      await a.sleep(1800);
      await a.fly(56.6592, 16.3552, 17, 1.2);
      await at('settings');
      await a.click(toolBtn(p, 'Settings'));
      await at('desc');
      await a.type(field(p, 'Description'), 'En kort ljudvandring genom Stadsparken till Kalmar slott.', { delay: 28 });
      await at('cover');
      await a.hover(p.getByRole('button', { name: 'Upload…' }));
      await p.locator('.inspector input[type=file][accept^="image/"]').setInputFiles(ctx.coverFile);
      await a.sleep(1200);
      await at('idea');
      await a.type(field(p, 'The idea'), 'Slottets historia, berättad av en vakt.', { delay: 30 });
      await at('save');
      await a.click(p.locator('.course-details').getByRole('button', { name: 'Save' }));
    },
  },
  {
    id: 'route',
    chapter: 'Rita rutten',
    course: MINE,
    view: [56.6599, 16.3548, 17],
    vo: `Rita sedan rutten, alltså vägen du vill att besökaren ska gå. {route}Klicka på Route {draw}och Draw the route, {clicks}och klicka ut hörnen längs vägen. {finish}Dubbelklicka eller klicka på Finish när du är framme. {stats}Admin räknar ut längden och ungefär hur lång tid det tar att gå. Rutten ritas ut på besökarens karta, och du kan dra i hörnen för att justera den.`,
    async run(a, at) {
      const p = a.page;
      await at('route');
      await a.click(toolBtn(p, 'Route'));
      await at('draw');
      await a.click(p.getByRole('button', { name: 'Draw the route' }));
      await at('clicks');
      for (const [lat, lng] of [
        [56.661867, 16.355538], [56.66152, 16.355675], [56.66094, 16.355585], [56.660482, 16.355427],
        [56.659798, 16.355], [56.659422, 16.354719], [56.658985, 16.354336], [56.658831, 16.353452],
        [56.658401, 16.353954], [56.658347, 16.354554],
      ]) await a.clickMap(lat, lng, { after: 260 });
      await at('finish');
      await a.click(p.locator('.route-panel').getByRole('button', { name: 'Finish' }));
      await at('stats');
      await a.spot('.route-panel__stats', 2400);
    },
  },
  {
    id: 'point',
    chapter: 'En ljudpunkt med berättelse',
    course: MINE,
    view: [56.6587, 16.3543, 18],
    vo: `Nu placerar vi en ljudpunkt. {static}Välj Static {place}och klicka på kartan där ljudet ska finnas. Cirkeln visar hur långt bort det hörs. {name}Ge punkten ett namn {facts}och skriv vad den handlar om i faktarutan. {narrate}Under Narrate this point {voice}väljer du en röst eller en guide. {write}Write narration låter AI:n skriva en berättelse av faktan, i guidens ton, {text}och texten kan du sedan redigera fritt. {render}Render audio läser in den med ElevenLabs, {player}och klippet hamnar direkt i punkten. {radius}Justera den hörbara radien {save}och spara.`,
    async run(a, at) {
      const p = a.page;
      await at('static');
      await a.click(p.locator('.type-btn', { hasText: 'Static' }));
      await at('place');
      await a.clickMap(56.65843, 16.35395);
      await at('name');
      await a.type(field(p, 'Name'), 'Slottsbron');
      await at('facts');
      await a.type(
        field(p, 'Facts / notes'),
        'Bron över vallgraven till Kalmar slott. Slottet började byggas i slutet av 1100-talet och räknades till Sveriges viktigaste fästen. Här bildades Kalmarunionen 1397.',
        { delay: 14 }
      );
      await at('narrate');
      await a.click(p.locator('.inspector summary', { hasText: 'Narrate this point' }));
      await at('voice');
      const voice = field(p, 'Voice / persona');
      await a.spot(voice, 1400);
      await a.select(voice, 'Sanna Hartfield - Calm and Soothing · professional').catch(() => {});
      await at('write');
      await a.click(p.locator('.inspector button', { hasText: 'Write narration' }));
      await p.waitForFunction(() => {
        const t = [...document.querySelectorAll('.inspector textarea')].find((x) => x.placeholder.startsWith('What the listener hears'));
        return t && t.value.length > 40;
      }, null, { timeout: 120000 });
      await at('text');
      await a.reveal(field(p, 'Narration (what’s spoken)'));
      await a.spot(field(p, 'Narration (what’s spoken)'), 1800);
      await at('render');
      await a.click(p.locator('.inspector button', { hasText: 'Render audio' }));
      await p.locator('.inspector audio.clip-preview').first().waitFor({ timeout: 120000 });
      await at('player');
      await a.reveal(p.locator('.inspector audio.clip-preview').first());
      await a.spot(p.locator('.inspector audio.clip-preview').first(), 1600);
      await at('radius');
      await a.reveal(field(p, 'Audible radius (m)'));
      await setNumber(a, field(p, 'Audible radius (m)'), 20);
      await at('save');
      await a.click(p.locator('.inspector .actions').getByRole('button', { name: 'Save' }));
    },
  },
  {
    id: 'zone',
    chapter: 'Akustiska zoner',
    course: MINE,
    view: [56.6581, 16.3552, 18],
    vo: `En akustisk zon ger ett område en egen klang och en egen bakgrund. {zones}Öppna Zones {draw}och rita zonen, hörn för hörn, {finish}och klicka på Finish. {reverb}Välj karaktär på efterklangen, till exempel hall eller tunnel, {wet}och hur mycket den ska höras. {bg}Lägg gärna till en bakgrundsloop från ljudbiblioteket, {preview}och lyssna med Preview. {save}Spara med Save zone changes.`,
    async run(a, at) {
      const p = a.page;
      await at('zones');
      await a.click(toolBtn(p, 'Zones'));
      await at('draw');
      await a.click(p.getByRole('button', { name: '+ Draw a zone' }));
      for (const [lat, lng] of [[56.65845, 16.3549], [56.65823, 16.35625], [56.6575, 16.35585], [56.6577, 16.35448]]) {
        await a.clickMap(lat, lng, { after: 350 });
      }
      await at('finish');
      await a.click(p.locator('.inspector').getByRole('button', { name: 'Finish' }));
      await at('reverb');
      const row = p.locator('.zone-row').last();
      await a.select(row.locator('select.select').first(), 'hall');
      await at('wet');
      const slider = row.locator('input[type=range]').first();
      const b = await a.hover(slider);
      await a.clickAt(b.x + b.width * 0.7, b.y + b.height / 2);
      await at('bg');
      const lib = row.locator('.zone-row__wet', { hasText: 'background loop' }).locator('select');
      await a.hover(lib);
      const firstClip = await lib.locator('option').nth(1).textContent();
      if (firstClip) await lib.selectOption({ label: firstClip });
      await a.sleep(400);
      await at('preview');
      await a.click(row.getByRole('button', { name: '▶ Preview' }));
      await a.sleep(1800);
      await a.click(row.getByRole('button', { name: '■ Stop preview' }));
      await at('save');
      await a.click(p.getByRole('button', { name: 'Save zone changes' }));
    },
  },
  {
    id: 'demo',
    chapter: 'Demorundan',
    course: MINE,
    vo: `Nu byter vi till demorundan. {pick}Kalmar i lurarna {fit}går från Kalmar Turistcenter genom Kvarnholmen till Kalmar slott, drygt två kilometer. {route}Den streckade linjen är rutten. {points}Varje punkt visar en möjlighet, och guiden förklarar den medan besökaren går. Nu tittar vi på hur punkterna är inställda.`,
    async run(a, at) {
      const p = a.page;
      await at('pick');
      await a.select('.topbar__select', DEMO);
      await a.sleep(1500);
      await at('fit');
      await a.fitTo([[56.6575, 16.3535], [56.6648, 16.3664]], 1.4);
      await at('route');
      await a.moveTo(...Object.values(await a.mapPx(56.6629, 16.3604)));
      await a.moveTo(...Object.values(await a.mapPx(56.6610, 16.3556)), 900);
      await at('points');
      await a.spot('.point-list', 2200);
    },
  },
  {
    id: 'static',
    chapter: 'Statiska ljud: språk, höjd och riktning',
    course: DEMO,
    vo: `Välkomstpunkten är en vanlig statisk punkt. {once}Play once betyder att berättelsen bara spelas en gång. {lang}Under Narration languages finns en engelsk version. Den som har engelska på telefonen hör den i stället. {bells}Domkyrkans klockor ligger {height}trettiofem meter upp, {loop}och går i en slinga med fyrtiofem sekunders paus. {radman}Rådmannen är ett riktat ljud: {dir}han är vänd mot torget och hörs inte bakom sig. {flags}När besökaren har hört honom sätts flaggan RÅDMANNEN, {next}och Next sound pekar ut vart man ska gå sedan.`,
    async run(a, at) {
      const p = a.page;
      await editPoint(a, 'Välkommen');
      await a.fly(...AT.harbour, 17, 1.2);
      await at('once');
      await a.reveal(check(p, 'Play once'));
      await a.spot(check(p, 'Play once'), 1500);
      await at('lang');
      const langs = p.locator('.inspector summary', { hasText: 'Narration languages' });
      await a.click(langs);
      await a.spot(p.locator('.inspector .lang-row').first(), 2200);
      await at('bells');
      await editPoint(a, 'Domkyrkans klockor');
      await a.fly(...AT.stortorget, 18, 1.2);
      await at('height');
      await a.reveal(field(p, 'Height'));
      await a.spot(field(p, 'Height'), 1500);
      await at('loop');
      await a.spot(field(p, 'Pause before looping (s)'), 1600);
      await at('radman');
      await editPoint(a, 'Rådmannen');
      await at('dir');
      await a.reveal(check(p, 'Directional'));
      await a.spot(check(p, 'Directional').locator('xpath=..'), 2200);
      await at('flags');
      await a.reveal(field(p, 'Sets flags when visited'));
      await a.spot(field(p, 'Sets flags when visited'), 1600);
      await at('next');
      await a.spot(p.locator('.inspector .next-sounds').first(), 2200);
    },
  },
  {
    id: 'moving',
    chapter: 'Ljud som rör sig och följer',
    course: DEMO,
    vo: `Ljud kan också röra sig. {gulls}Måsarna över gästhamnen är ett cirklande ljud, {orbit}med radie och fart. {gull}Måsen som vill ha din glass är ett följande ljud. {mode}Den väntar tills du kommer nära, och cirklar sedan runt ditt huvud. {modes}Ett följande ljud kan också sitta på dig, svepa från öra till öra, {dog}eller jaga dig, som hunden på stranden, {giveup}som ger upp när du är arton meter bort.`,
    async run(a, at) {
      const p = a.page;
      await at('gulls');
      await editPoint(a, 'Måsarna över gästhamnen');
      await a.fly(...AT.harbour, 18, 1.2);
      await at('orbit');
      await a.reveal(field(p, 'Orbit radius (m)'));
      await a.spot(p.locator('.inspector .number-grid').first(), 1800);
      await at('gull');
      await editPoint(a, 'Måsen som vill ha din glass');
      await at('mode');
      await a.reveal(field(p, 'Follow behavior'));
      await a.spot(field(p, 'Follow behavior'), 1800);
      await at('modes');
      await a.hover(field(p, 'Follow behavior'));
      await at('dog');
      await editPoint(a, 'Hunden på stranden');
      await a.fly(56.6629, 16.3578, 18, 1.2);
      await a.reveal(field(p, 'Follow behavior'));
      await at('giveup');
      await a.spot(field(p, 'Give-up distance (m)'), 1800);
    },
  },
  {
    id: 'path',
    chapter: 'En guide som går före: väg med stopp',
    course: DEMO,
    vo: `Stadsvakten är en väg med stopp. {path}Han går längs gatorna från Stortorget till Västerport, {times}och kartan visar när han når varje hörn. {stops}Vid fyra av hörnen stannar han och berättar. Varje stopp kan få en egen berättelse, skriven och inläst på samma sätt som en punkt. {wait}Med Wait for the listener väntar han in besökaren, {wayfind}och Show direction and distance visar var han är. {requires}Han kräver flaggan RÅDMANNEN, så han vaknar först när man har hört rådmannen.`,
    async run(a, at) {
      const p = a.page;
      await editPoint(a, 'Stadsvakten');
      await at('path');
      await a.fly(56.6633, 16.3624, 17, 1.4);
      await at('times');
      const lbl = p.locator('.aw-time__label').first();
      await a.hover(lbl).catch(() => {});
      await at('stops');
      await a.reveal(p.locator('.inspector .stops'), 'start');
      await a.spot(p.locator('.inspector .stops'), 2600);
      await a.click(p.locator('.inspector .stop-entry').nth(1).locator('summary').first());
      await a.sleep(800);
      await at('wait');
      await a.reveal(check(p, 'Wait for the listener'));
      await a.spot(check(p, 'Wait for the listener'), 1600);
      await at('wayfind');
      await a.spot(check(p, 'Show direction'), 1500);
      await at('requires');
      await a.reveal(field(p, 'Requires flags to activate'));
      await a.spot(field(p, 'Requires flags to activate'), 1800);
    },
  },
  {
    id: 'triggers',
    chapter: 'Ljud som väntar på rätt ögonblick',
    course: DEMO,
    vo: `Några ljud väntar på rätt ögonblick. {guard}Portvakten i Västerport är ett skrämselljud. {trigger}Han är tyst tills besökaren är sju meter bort, {hidden}och han är dold på skärmen. {bird}Koltrasten sjunger först när man har stått still i fem sekunder, {flee}och tystnar när man rör sig. {cannon}Kanonkulan är en utlöst väg. {tr}Den startar när besökaren kommer inom räckhåll och flyger femton meter upp, {stop}och när den har landat försvinner den. {ship}Skeppet Kalmar Nyckel seglar på en gemensam klocka, {global}Global, så att alla hör det på samma plats samtidigt.`,
    async run(a, at) {
      const p = a.page;
      await at('guard');
      await editPoint(a, 'Portvakten');
      await a.fly(...AT.vasterport, 18, 1.2);
      await at('trigger');
      await a.reveal(field(p, 'Jumpscare trigger radius'));
      await a.spot(field(p, 'Jumpscare trigger radius'), 1600);
      await at('hidden');
      await a.reveal(check(p, 'Hidden on the listener'));
      await a.spot(check(p, 'Hidden on the listener'), 1600);
      await at('bird');
      await editPoint(a, 'Koltrasten');
      await a.fly(56.6589, 16.3537, 18, 1.2);
      await a.reveal(field(p, 'Reveal after standing still'));
      await a.spot(field(p, 'Reveal after standing still'), 1600);
      await at('flee');
      await a.spot(check(p, 'Flees on movement'), 1500);
      await at('cannon');
      await editPoint(a, 'Kanonkulan');
      await a.fly(56.6577, 16.3555, 16, 1.2);
      await at('tr');
      await a.reveal(field(p, 'Trigger radius (m)'));
      await a.spot(p.locator('.inspector .number-grid').first(), 2200);
      await at('stop');
      await a.spot(field(p, 'End behavior'), 1500);
      await at('ship');
      await editPoint(a, 'Kalmar Nyckel');
      await at('global');
      await a.reveal(p.locator('.inspector .seg', { hasText: 'Global' }));
      await a.spot(p.locator('.inspector .seg', { hasText: 'Global' }).locator('xpath=..'), 2200);
    },
  },
  {
    id: 'story',
    chapter: 'Flaggor och vägval',
    course: DEMO,
    vo: `Flaggor styr berättelsen. {park}I Stadsparken pekar Next sound mot två vägar, {arrows}och på kartan syns det som streckade pilar. {group}Drottningens väg och källarmästarens väg ligger i samma exklusiva grupp. {sets}Den väg besökaren går in på först sätter sin flagga, och låser den andra. {req}Drottning Margareta kräver flaggan DROTTNINGEN, så den som valde källarmästaren hör henne aldrig. {check}Innan du publicerar kontrollerar admin att varje flagga går att nå.`,
    async run(a, at) {
      const p = a.page;
      await at('park');
      await editPoint(a, 'Stadsparken');
      await a.fly(...AT.park, 17, 1.2);
      await a.reveal(p.locator('.inspector .next-sounds'));
      await a.spot(p.locator('.inspector .next-sounds'), 1800);
      await at('arrows');
      await a.moveTo(...Object.values(await a.mapPx(56.6614, 16.3553)));
      await a.moveTo(...Object.values(await a.mapPx(56.6614, 16.3566)), 900);
      await at('group');
      await editPoint(a, 'Drottningens väg');
      await a.reveal(field(p, 'Exclusive group'));
      await a.spot(field(p, 'Exclusive group'), 1800);
      await at('sets');
      await a.spot(field(p, 'Sets flags when visited'), 1800);
      await at('req');
      await editPoint(a, 'Drottning Margareta');
      await a.reveal(field(p, 'Requires flags to activate'));
      await a.spot(field(p, 'Requires flags to activate'), 1800);
      await at('check');
      await a.click(p.locator('.inspector .actions').getByRole('button', { name: 'Cancel' }));
      await a.spot('.section.publish', 2000);
    },
  },
  {
    id: 'playtest',
    chapter: 'Provlyssna',
    course: DEMO,
    vo: `Innan du publicerar kan du provlyssna. {play}Klicka på Playtest och ta på dig hörlurarna. {listener}En virtuell lyssnare står vid första punkten. {walk}Klicka på kartan för att gå dit, {keys}eller gå med piltangenterna. {list}Panelen visar vilka ljud som hörs, från vilket håll och hur långt bort. {pace}Du kan gå, jogga eller cykla. {moving}Rörliga ljud syns på kartan medan du lyssnar. {stop}Stop avslutar.`,
    async run(a, at) {
      const p = a.page;
      await at('play');
      await a.click(p.getByRole('button', { name: '▶ Playtest' }));
      await a.page.evaluate(() => window.__awMap.setView([56.6601, 16.3614], 18, { animate: false }));
      await at('listener');
      await a.sleep(400);
      await a.hover('.aw-listener').catch(() => {});
      await at('walk');
      await a.clickMap(56.6606, 16.36225);
      await a.sleep(2500);
      await at('keys');
      await p.keyboard.down('ArrowLeft');
      await a.sleep(500);
      await p.keyboard.up('ArrowLeft');
      await p.keyboard.down('w');
      await a.sleep(2200);
      await p.keyboard.up('w');
      await at('list');
      await a.spot('.preview-list', 2200);
      await at('pace');
      await a.click(p.locator('.preview .seg button', { hasText: 'Jog' }));
      await at('moving');
      await a.clickMap(56.66105, 16.3633);
      await a.sleep(3000);
      await at('stop');
      await a.click(p.getByRole('button', { name: '■ Stop' }));
    },
  },
  {
    id: 'assistant',
    chapter: 'AI-assistenten',
    course: DEMO,
    vo: `AI-assistenten känner hela rundan: idén, bakgrunden, rutten och alla punkter. {open}Öppna AI assistant {ask}och fråga, eller be den bygga något. {send}Den kan skapa och ändra punkter, skriva texter, ta fram guider och röster, ljudeffekter och omslagsbilder. När den förklarar något som har med platser att göra visar den det på kartan. Den kan aldrig radera något.`,
    tailWait: async (page) => {
      // Let the reply finish streaming (the Send button comes back), then hold a moment.
      await page.locator('.ai__composer button[type=submit]').waitFor({ timeout: 150000 });
      await page.waitForTimeout(2500);
    },
    async run(a, at) {
      const p = a.page;
      await at('open');
      await a.click(toolBtn(p, 'AI assistant'));
      const fresh = p.locator('.ai').getByRole('button', { name: 'New' });
      if (await fresh.isVisible().catch(() => false)) await a.click(fresh);
      await at('ask');
      await a.type('.ai__input', 'Visa på kartan var stadsvakten stannar och berättar, och sammanfatta kort vad han säger vid varje stopp.', { delay: 22 });
      await at('send');
      await a.click(p.getByRole('button', { name: 'Send' }));
    },
  },
  {
    id: 'library',
    chapter: 'Ljudbiblioteket och guiderna',
    course: DEMO,
    vo: `Under Sounds finns ljudbiblioteket. {gen}Här genererar du ljudeffekter och tal med AI, {prompt}genom att beskriva ljudet. {cards}Varje klipp får ett kort där du kan lyssna och döpa om det, {used}och se hur många punkter som använder det. {guides}Under Guides skapar du återanvändbara guider. {newguide}En guide har ett namn, {persona}en persona som AI:n skriver i, {voice}en röst, {idle}och ett ljud som spelas när guiden går mellan stoppen.`,
    async run(a, at) {
      const p = a.page;
      await a.click(p.locator('.tabs .tab', { hasText: 'Sounds' }));
      await at('gen');
      await a.spot('.gen-panel', 1800);
      await at('prompt');
      await a.type('.gen-panel textarea', 'Måsar som skriker över en hamn en sommardag', { delay: 30 });
      await a.hover(p.locator('.gen-panel').getByRole('button', { name: 'Generate' }));
      await at('cards');
      await a.spot(p.locator('.sound-card').first(), 1800);
      await at('used');
      await a.spot(p.locator('.sound-card .used-pill').first(), 1600);
      await at('guides');
      await a.click(p.locator('.tabs .tab', { hasText: 'Guides' }));
      await at('newguide');
      await a.click(p.getByRole('button', { name: '+ New guide' }));
      await a.type(p.locator('.gen-panel input.input').first(), 'Stadsvakten');
      await at('persona');
      await a.type(p.locator('.gen-panel textarea').first(), 'Gruff nattvakt i 1700-talets Kalmar', { delay: 28 });
      await a.click(p.getByRole('button', { name: '✨ Enhance' }));
      await p.waitForFunction(() => (document.querySelector('.gen-panel textarea')?.value.length ?? 0) > 60, null, { timeout: 120000 });
      await at('voice');
      const voice = p.locator('.gen-panel .form-field', { hasText: 'Narration voice' }).locator('select');
      await a.hover(voice);
      await voice.selectOption({ label: 'Kalmar – Stadsvakten · generated' }).catch(() => {});
      await at('idle');
      const idle = p.locator('.gen-panel .form-field', { hasText: 'Idle sound' }).locator('select');
      await a.hover(idle);
      const steps = (await idle.locator('option').allTextContents()).find((o) => o.includes('Stadsvakten'));
      if (steps) await idle.selectOption({ label: steps });
      await a.sleep(1200);
      await a.click(p.locator('.gen-panel').getByRole('button', { name: 'Cancel' }));
    },
  },
  {
    id: 'publish',
    chapter: 'Publicera och dela',
    course: MINE,
    view: [56.6592, 16.3548, 17],
    vo: `När allt är klart publicerar du. {check}Flight check visar fel som måste rättas, och varningar. {publish}Klicka på Publish. {share}Under Share får du länken och en QR-kod att skriva ut. {settings}Under Settings kan du ändra rundans korta adress, {options}visa besökaren vägen till start, {export}och exportera eller importera hela rundan som en fil. {analytics}Analytics visar anonymt hur långt besökarna har kommit, {multi}och med Multi-select ändrar du många punkter på en gång.`,
    async run(a, at) {
      const p = a.page;
      await at('check');
      await a.spot('.section.publish', 1600);
      await at('publish');
      await a.click(p.locator('.section.publish').getByRole('button', { name: /^Publish/ }));
      await a.sleep(1200);
      await at('share');
      await a.click(p.getByRole('button', { name: '🔗 Share' }));
      await a.sleep(900);
      await a.spot('.share__qr', 2000);
      await at('settings');
      await a.click(toolBtn(p, 'Settings'));
      await a.reveal(p.locator('.course-settings'), 'start');
      await a.spot(p.locator('.course-settings .form-field').first(), 1800);
      await at('options');
      await a.spot(p.locator('.course-settings .course-check'), 1800);
      await at('export');
      await a.hover(p.getByRole('button', { name: '⭳ Export' }));
      await a.sleep(500);
      await a.hover(p.getByRole('button', { name: '⭱ Import' }));
      await at('analytics');
      await a.click(toolBtn(p, 'Analytics'));
      await at('multi');
      await a.click(toolBtn(p, 'Multi-select'));
      await a.click(p.getByRole('button', { name: /^Select all/ }));
      await a.sleep(800);
      await a.spot('.bulk-bar', 1600);
      await a.click(p.locator('.bulk-bar').getByRole('button', { name: 'Clear' }));
    },
  },
  {
    id: 'help',
    chapter: 'Hjälpen',
    course: DEMO,
    vo: `All dokumentation finns i admin. {help}Under Help förklaras varje knapp och fält, {search}och du kan söka, {q}till exempel på flaggor. {qm}Frågetecknen i panelerna tar dig direkt till rätt avsnitt.`,
    async run(a, at) {
      const p = a.page;
      await at('help');
      await a.click(p.locator('.tabs .tab', { hasText: 'Help' }));
      await a.sleep(800);
      await a.spot('.help__nav', 1600);
      await at('search');
      await a.type('.help__search input', 'flagga', { delay: 70 });
      await at('q');
      await a.click(p.locator('.help__results a, .help__results button').first());
      await a.sleep(800);
      await at('qm');
      await a.click(p.locator('.tabs .tab', { hasText: 'Courses' }));
      await a.sleep(600);
      await a.click(p.locator('.tool-row .help-link'));
      await a.sleep(1200);
    },
  },
  {
    id: 'outro',
    chapter: 'Avslutning',
    card: { kicker: 'Kalmar i lurarna', title: 'Gå demorundan själv', sub: 'Starta vid Kalmar Turistcenter, ta på dig hörlurarna och följ pilen. Drygt två kilometer och omkring fyrtio minuter, till Kalmar slott.', image: 'cover' },
    vo: `Det var allt för den här gången. Gå gärna demorundan själv: starta vid Kalmar Turistcenter, ta på dig hörlurarna och följ pilen. Och har du frågor, så finns svaren under Help. Lycka till med din egen runda!`,
  },
];
