/**
 * "Kalmar i lurarna" — a demo walk for Destination Kalmar that explains AudioWorld as you walk it.
 *
 * From Kalmar Turistcenter through Kvarnholmen to Kalmar slott (~2.3 km, ~40 min). A guide, Lova,
 * explains each concept just before or just after you hear it, and Kalmar figures demonstrate it:
 *
 *   Turistcenter   static point, audible radius, direction · acoustic zone (harbour bed) · circling gulls
 *   Ölandskajen    follow-the-user (a gull orbits you, after your ice cream)
 *   Stortorget     height + loop with a pause (cathedral bells) · directional (the councillor) · flags
 *   Storgatan      a guided path with stops that waits for you, with wayfinding (the town watchman)
 *   Västerport     tunnel reverb + occlusion (zone) · jumpscare trigger · a hidden point
 *   Stadsparken    exclusive group (choose the queen or the cellar master) · several next sounds
 *                  stand still to reveal + flees on movement (the blackbird)
 *   Kalmar slott   triggered path with Doppler + height (a 1611 cannonball) · flag-gated codas
 *                  global timing (Kalmar Nyckel sails a shared loop) · language variants (sv/en)
 *
 * This file is the whole course: manuscripts, sound-effect prompts, mixes, geometry and zones.
 * render.mjs turns it into audio and build.mjs into a .audioworld bundle.
 *
 * Geometry: routed along OpenStreetMap streets and paths (© OpenStreetMap contributors, ODbL).
 * History: sv.wikipedia.org (Kalmar domkyrka, Kvarnholmen, Larmtorget, Jordbroporten, Kalmar slott,
 * Kalmarunionen, Kalmarkriget, Kalmar Nyckel). Lova, the councillor, the watchman, the gate guard and
 * the cellar master are fiction.
 */

// --- Voices (ElevenLabs) ----------------------------------------------------------------------
export const VOICES = {
  lova: 'aSLKtNoVBZlxQEMsnGL2', // Sanna Hartfield (professional Swedish narrator): the guide
  radman: 'KqFA3IGXOKeQeTe3m8g4', // Kalmar – Rådmannen: proud 17th-century councillor
  vakten: 'rrZ0BmPbQ5wegzAwZc1J', // Kalmar – Stadsvakten: the town watchman
  portvakt: 'TADs9mLgrKUts9h3YL14', // Svinö – Beredskapssoldaten: the jumpy gate guard
  drottning: 'hESAVcBqiHOuxG6EHeqj', // Kalmar – Vita frun: Queen Margaret
  kallare: 'roGsi7N5KuoKjAHrpJBt', // Kalmar – Källarmästaren: the castle's cellar master
};
export const TTS_MODEL = 'eleven_v4';

// --- Spoken lines (eleven_v4 audio tags in brackets; years written out for pronunciation) ----
export const LINES = {
  // Turistcenter: the welcome (also in English)
  welcome_sv: ['lova', `[warmly] Hej och välkommen! Jag heter Lova, och jag är din guide i dag. [pause] Du står utanför Kalmar Turistcenter, och min röst kommer från en ljudpunkt: ett ljud som är utplacerat på en bestämd plats på kartan. [pause] Prova att vända dig runt med telefonen framför dig. Hör du att jag hela tiden låter från samma ställe? Och tar du några steg bort från mig, blir jag svagare. Varje ljud har en räckvidd. [pause] Det här är ingen vanlig stadsvandring. Rundan visar vad man kan bygga med AudioWorld, och den förklarar sig själv medan du går. [pause] Hör du vågskvalpet? Du står i en akustisk zon, ett område med en egen bakgrund och en egen klang. Och måsarna ovanför dig cirklar runt en punkt ute över gästhamnen. Det är ett cirklande ljud. [pause] Titta på skärmen. Radarn visar ljuden runt omkring dig, och den gula pilen pekar mot nästa ljud på rundan. Följ den längs kajen mot Jordbroporten. [playfully] Och har du en glass i handen … håll hårt i den.`],
  welcome_en: ['lova', `[warmly] Hi, and welcome! My name is Lova, and I'm your guide today. [pause] You're standing outside Kalmar Tourist Centre, and my voice comes from a sound point: a sound placed at one exact spot on the map. [pause] Try turning around with your phone held in front of you. Can you hear that I always sound like I'm in the same place? And if you take a few steps away, I get quieter. Every sound has a range. [pause] This isn't an ordinary city walk. It shows what you can build with AudioWorld, and it explains itself as you go. Most voices along the way speak Swedish, but I'll tell you what's going on at the end. [pause] Hear the water lapping? You're standing in an acoustic zone, an area with its own background and its own acoustics. And the gulls above you are circling around a spot out over the guest harbour. That's a circling sound. [pause] Look at your screen. The radar shows the sounds around you, and the yellow arrow points to the next sound on the walk. Follow it along the quay towards Jordbroporten, the old town gate. [playfully] And if you're holding an ice cream … hold on tight.`],

  // Jordbroporten: what the gull was
  jordbro: ['lova', `[amused] Nå, fick du behålla glassen? [pause] Måsen som flög runt ditt huvud var ett följande ljud. Ett sådant ljud ligger stilla och väntar tills du kommer nära, och sedan hänger det med dig. Det kan sitta på din axel, jaga dig tills du springer ifrån det, cirkla runt dig som måsen gjorde, eller svepa fram och tillbaka från öra till öra. [pause] Du har just gått genom Jordbroporten, en öppning i den gamla stadsmuren. På sextonhundratalet flyttade Kalmar hit ut på Kvarnholmen, med raka gator och vallar runt hela ön. [pause] Gå nu vidare mot Stortorget. Snart hör du domkyrkans klockor. Lyssna på varifrån de kommer.`],

  // Stortorget: height, loop with a pause, directional, flags
  stortorget: ['lova', `Det här är Stortorget, och där borta ligger domkyrkan. [pause] Hörde du klockorna? De kom uppifrån. Ett ljud kan placeras på en viss höjd, så att det låter som om det hänger i ett kyrktorn, eller flyger högt över dig. Klockorna går dessutom i en slinga med en paus emellan, så om en stund ringer de igen. [pause] Framför kyrkan väntar en rådman från sextonhundratalet. Han är ett riktat ljud: han hörs ute på torget, men inte bakom honom, från kyrkans sida. Ungefär som någon som står i en dörröppning och pratar ut mot gatan. [pause] Och lyssna noga på honom. När du har hört rådmannen vaknar nämligen nästa person på rundan. Ett ljud kan vänta tills du har varit på ett annat ställe först. Det kallas en flagga.`],
  radman: ['radman', `[proudly, clearing his throat] Välkommen, välkommen till Kalmar! Den nya staden, ska ni veta. [pause] Den gamla staden låg borta vid slottet. Men efter Kalmarkriget, när danskarna hade härjat och bränt, beslöt riksrådet år sextonhundrafyrtio att hela staden skulle flytta hit ut på holmen. Och efter den stora branden sextonhundrafyrtiosju satte vi igång. Raka gator. Vallar och bastioner runt om, efter holländskt mönster. [pause] Och kyrkan här bakom mig! Ritad av slottsarkitekten Tessin själv. Vi började bygga sextonhundrasextio, [chuckles] och den stod inte färdig förrän sjuttonhundratre. Tre kungar hann regera under bygget, och alla tre hette Karl. Därför kallades den Karls domkyrka. [pause] Men nu ska jag inte uppehålla er. Stadsvakten väntar nere vid Storgatan. Följ honom. Han hittar även i mörker.`],

  // The watchman's stops (a path that waits for you)
  vakt_start: ['vakten', `[gruffly, calling out] Klockan är slagen tio! Klockan är slagen tio! [pause] [normal] Jaså. Rådmannen har skickat dig. Jag är stadsvakten. Om nätterna går jag gatorna och vaktar staden mot eld och fiender. [pause] Följ mig nu. Jag går före, och halkar du efter, så stannar jag och väntar. Ser du mig inte, så visar pilen på skärmen var jag är.`],
  vakt_storgatan: ['vakten', `[lower] Det här är Storgatan. Den går rakt genom hela ön, från Västerport ända bort till andra sidan. [pause] Det värsta jag vet är eld. Sjuttonhundrasextiofem började det brinna i en gård vid Larmtorget, dit vi är på väg nu. Över hundra tomter brann ner. [pause] Kom. Det är inte långt.`],
  vakt_larmtorget: ['vakten', `Larmtorget. Förr i tiden hette det Alarmtorget. [pause] Här vid torget var vi i stadsvakten förlagda. Gick larmet, så samlades vi här. [pause] Nu går vi mot Västerport. Det var stadens enda port mot landsidan.`],
  vakt_porten: ['vakten', `[calling out] Klockan är slagen tio, och allt är väl! [pause] [normal] Här vänder jag. Gå du genom porten. [low, warning] Men var beredd. Vakten i porten är lite nervös i natt.`],

  // Västerport: the jumpscare, then what it all was
  portvakt: ['portvakt', `[shouting] Halt! Vem där?! [pause] [suspicious] Hm. [pause] [relieved] Jaså. Bara en vandrare. Passera!`],
  efter_porten: ['lova', `[laughs] Blev du rädd? Vakten var ett skrämselljud. Han var helt tyst tills du kom riktigt nära, och då smällde det. Och han syntes inte på radarn. Ett ljud kan vara dolt på skärmen men ändå höras. [pause] Hörde du hur det ekade inne i porten? Porten är en akustisk zon med tunnelklang. Och står man utanför en zon, låter ljuden därinne dämpade, som genom en mur. [pause] Stadsvakten var en väg med stopp. Ett ljud som går längs en sträcka, stannar och berättar, och väntar in dig. När han hade gått färdigt försvann han från skärmen. [pause] Nu går vi mot Stadsparken. Följ pilen, och se dig för när du går över vid järnvägen.`],

  // Stadsparken: the crossroads
  parken: ['lova', `[amused] Sprang det en hund efter dig på vägen hit? Det var ett jagande ljud. Det springer efter dig, men går du ifrån det, så ger det upp. [pause] Välkommen till Stadsparken. [pause] Här delar sig vägen. Titta på radarn: nu pekar den mot två ljud på en gång. Längs Slottsvägen väntar en drottning. Nere vid vattnet, mot konstmuseet, väntar slottets källarmästare. [pause] Men du får bara träffa en av dem. Den väg du går in på först, den väljer du, och den andra tystnar för resten av rundan. Det kallas ett vägskäl. [pause] Välj nu. Vi ses i parkens södra ände, nära slottet.`],
  drottningen: ['drottning', `[regal, calm] Du valde drottningens väg. Det var klokt. [pause] Jag är Margareta. Drottning över Danmark, Norge och Sverige. [pause] Sommaren trettonhundranittiosju kallade jag hit stormännen från alla tre rikena, till Kalmar slott. Där kröntes min unge arvinge Erik till kung över dem alla, och vi slöt en union. Kalmarunionen. [pause] Tre riken. En kung. Den höll i mer än hundra år. [softly] Gå nu ner mot slottet. Jag väntar på dig där.`],
  kallarmastaren: ['kallare', `[jovial, laughing] Ha! Du valde källarmästarens väg. Det gör alltid de som är hungriga. [pause] Jag hade hand om slottets källare. Vinet, ölet, saltströmmingen. När Gustav Vasa och hans söner byggde om slottet till ett renässanspalats, blev det fest efter fest. [pause] Men slottet var inte bara fester. Det var en fästning, en av de viktigaste i hela riket, med hundratals kanoner på murarna. [low] Och fästningar blir belägrade. [pause] Gå ner mot slottet nu. Och håll ett öga på vattnet.`],

  // The park's south end: stand still
  faglarna: ['lova', `Stanna här en stund. [pause] Stå alldeles stilla, och var tyst. [long pause] [whispers] Hör du? Koltrasten. Den sjunger bara när du har stått stilla en liten stund, och så fort du rör dig tystnar den igen. Prova! [pause] [normal] Ett ljud kan vänta på att du står still, och fly när du rör dig. Bra för fåglar, viskningar och hemligheter. [pause] Gå nu ut på bron mot slottet.`],

  // Kalmar slott: the cannonball, the codas, the finale (also in English)
  slottet: ['lova', `[amused] Det där var danskarna! År sextonhundraelva belägrade de slottet. [pause] Kanonkulan var en utlöst väg. Den låg och väntade ute över vattnet tills du kom ut på bron, och då flög den, högt över ditt huvud. Hörde du hur tonen sjönk när den susade förbi? Precis som i verkligheten. [pause] Nu står du vid Kalmar slott. Det började byggas för över åttahundra år sedan, och här bildades Kalmarunionen. [pause] Gå runt slottet åt vänster, längs den västra sidan. Den du valde i parken väntar på dig där.`],
  drottningen_slott: ['drottning', `[regal, warm] Där är du. [pause] Här, bakom de här murarna, slöt vi unionen. Tre riken, en kung. Kom ihåg det när du hör namnet Kalmar. [pause] Gå nu vidare. Din guide väntar.`],
  kallare_slott: ['kallare', `[jovial] Där är du ju! [pause] Källaren finns kvar därinne, men vinet är tyvärr slut. [laughs] Kom tillbaka och se slottet inifrån. Gå nu vidare, din guide väntar på dig.`],
  final_sv: ['lova', `Här slutar rundan. [pause] Tänk på vad du har varit med om. Ljud som står still, och måsar som cirklade. En mås som följde dig. Klockor högt uppe i ett torn. En rådman som bara hördes framifrån, och en stadsvakt som gick före och väntade in dig. En port med eko, en dold vakt, ett vägval i parken, och en kanonkula som avfyrades när du kom nära. [pause] Och hör du skeppet ute på fjärden? Det är Kalmar Nyckel, som seglade till Nya Sverige i Amerika sextonhundratrettioåtta. Skeppet seglar på en gemensam klocka: alla som går rundan just nu hör det på samma ställe, samtidigt. [pause] Allt det här är byggt i AudioWorld, direkt på en karta, utan en enda rad kod. Och den här sista hälsningen hör du på telefonens språk. Står den på engelska, pratar jag engelska. [pause] Tack för att du gick med mig. [warmly] Ta av dig lurarna en stund, och titta upp på slottet.`],
  final_en: ['lova', `This is where the walk ends. [pause] Think about what you've heard. Sounds standing still, and gulls circling. A gull that followed you. Bells high up in a tower. A councillor you could only hear from the front, and a town watchman who walked ahead and waited for you. A gate with an echo, a hidden guard, a choice of ways in the park, and a cannonball that fired when you came close. [pause] And can you hear the ship out on the water? That's Kalmar Nyckel, which sailed to New Sweden in America in sixteen thirty-eight. It sails on a shared clock: everyone on the walk right now hears it in the same place, at the same moment. [pause] All of this was built in AudioWorld, straight onto a map, without a single line of code. And you're hearing this last part in your phone's language. Set it to Swedish, and I'll speak Swedish. [pause] Thank you for walking with me. [warmly] Take your headphones off for a moment, and look up at the castle.`],
};

// --- Sound effects (ElevenLabs sound generation): [prompt, seconds, loop] --------------------
export const SFX = {
  harbour: ['Calm harbour ambience by a stone quay: water lapping gently, small boats creaking at their moorings, sail rigging clinking against masts, light wind, no voices, no music', 22, true],
  gulls: ['Herring gulls calling and crying overhead in a harbour on a summer day, wings flapping, birds circling, no other sounds', 20, true],
  gull_beg: ['A single cheeky seagull very close to the listener, flapping its wings around their head and squawking greedily, begging for food, then flying away', 14, false],
  bells: ['Large bronze church bells ringing in a tall stone cathedral tower, a slow heavy peal of several bells, rich and resonant, heard from a town square below', 20, false],
  steps: ['Slow heavy boots walking on cobblestones at night, a ring of iron keys jingling at a belt with each step, an old metal lantern creaking as it swings, steady walking pace, no voices, no music', 15, true],
  gate_wind: ['Hollow wind blowing softly through an old stone archway gate, faint echoing water drips, calm, no voices, no music', 20, true],
  halberd: ['A heavy wooden halberd shaft slammed hard once on a stone floor, metal clanking', 2, false],
  fanfare: ['A short regal medieval fanfare played on two brass trumpets in the distance, outdoors', 6, false],
  goblets: ['Pewter goblets clinking in a toast, wine poured from a jug, a wooden barrel rolled on a stone floor, hearty laughter in a cellar', 7, false],
  blackbird: ['A single Eurasian blackbird singing its rich melodious song close by in a tree, clear solo, no other birds, no wind', 20, true],
  boom: ['A single heavy black powder cannon firing far away across open water, deep boom with a long rolling echo', 4, false],
  whistle: ['The steady high-pitched whistle of a heavy cannonball flying through the air, constant pitch, no explosion, no impact', 8, false],
  dog: ['A small excited dog running after someone on a gravel path, panting, paws pattering, yapping happily now and then, outdoors, no music', 12, true],
  ship: ["An old wooden sailing ship gliding slowly on calm water: creaking hull timbers, ropes straining, canvas sails flapping gently, waves lapping against the hull, a ship's bell ringing once, no voices, no music", 22, true],
};

// --- Final clips: a voice line, an sfx, or a mix of layers (dB relative to unity) ------------
// Every clip is loudness-normalised after mixing: speech to -16 LUFS, effects and beds lower.
export const CLIPS = {
  welcome: { voice: 'welcome_sv' },
  welcome_en: { voice: 'welcome_en' },
  jordbro: { voice: 'jordbro' },
  stortorget: { voice: 'stortorget' },
  radman: { voice: 'radman' },
  vakt_start: { voice: 'vakt_start' },
  vakt_storgatan: { voice: 'vakt_storgatan' },
  vakt_larmtorget: { voice: 'vakt_larmtorget' },
  vakt_porten: { voice: 'vakt_porten' },
  portvakt: { mix: [{ sfx: 'halberd', db: -2 }, { voice: 'portvakt', at: 0.3 }], tail: 1 },
  efter_porten: { voice: 'efter_porten' },
  parken: { voice: 'parken' },
  drottningen: { voice: 'drottningen' },
  kallarmastaren: { voice: 'kallarmastaren' },
  faglarna: { voice: 'faglarna' },
  slottet: { voice: 'slottet' },
  drottningen_slott: { voice: 'drottningen_slott' },
  kallare_slott: { voice: 'kallare_slott' },
  final: { voice: 'final_sv' },
  final_en: { voice: 'final_en' },
  gull_beg: { sfx: 'gull_beg' },
  bells: { sfx: 'bells' },
  fanfare: { sfx: 'fanfare' },
  goblets: { sfx: 'goblets' },
  blackbird: { sfx: 'blackbird' },
  cannon: { mix: [{ sfx: 'boom', db: 3 }, { sfx: 'whistle', at: 1, db: -3 }], tail: 0.5, lufs: 'sfx' },
  gulls: { sfx: 'gulls', bed: true },
  steps: { sfx: 'steps', bed: true },
  dog: { sfx: 'dog' },
  ship: { sfx: 'ship' },
  harbour: { sfx: 'harbour', bed: true },
  gate_wind: { sfx: 'gate_wind', bed: true },
};

// --- Geometry ----------------------------------------------------------------------------------
const P = {
  welcome: { lat: 56.65992, lng: 16.36103 }, // Ölandskajen, outside Kalmar Turistcenter
  gulls: { lat: 56.6599, lng: 16.3618 }, // over the guest harbour
  iceCream: { lat: 56.6606, lng: 16.36225 }, // Ölandskajen, on the way to Jordbroporten
  jordbro: { lat: 56.661923, lng: 16.36426 }, // Kaggensgatan, just inside Jordbroporten
  cathedral: { lat: 56.66452, lng: 16.36539 }, // Kalmar domkyrka
  stortorget: { lat: 56.66404, lng: 16.3654 }, // Stortorget, south-west part
  radman: { lat: 56.66428, lng: 16.36608 }, // Stortorget, in front of the cathedral
  guard: { lat: 56.663366, lng: 16.359994 }, // inside the Västerport passage
  afterGate: { lat: 56.6634, lng: 16.35895 }, // the bridge west of Västerport
  dog: { lat: 56.66282, lng: 16.35796 }, // the shore path west of the moat
  park: { lat: 56.66185, lng: 16.3555 }, // Stadsparken, the north entrance where both paths begin
  pickQueen: { lat: 56.66125, lng: 16.35497 }, // west path (along Slottsvägen)
  pickCellar: { lat: 56.6613, lng: 16.3568 }, // east path (by the water)
  queen: { lat: 56.66079, lng: 16.35465 }, // west path
  cellar: { lat: 56.6606, lng: 16.35669 }, // east path, by Kalmar konstmuseum
  birds: { lat: 56.65884, lng: 16.3535 }, // the park's south tip, where both paths meet
  blackbird: { lat: 56.65895, lng: 16.35345 },
  castle: { lat: 56.65832, lng: 16.35462 }, // the castle island, at the end of the bridge
  coda: { lat: 56.65805, lng: 16.35472 }, // west of the castle
  finale: { lat: 56.65754, lng: 16.35535 }, // south of the castle, facing the water
};

// The town watchman: from Stortorget along Storgatan, across Larmtorget, up Västra Vallgatan to
// Västerport. Stops (pause and narrate) on vertices 0, 1, 3 and 6; he ends at the gate.
const WATCHMAN_PATH = [
  { lat: 56.663751, lng: 16.364428 }, // Storgatan, just off Stortorget
  { lat: 56.663314, lng: 16.362919 }, // Storgatan × Kaggensgatan
  { lat: 56.66288, lng: 16.361429 }, // Larmtorget, north-east corner
  { lat: 56.66272, lng: 16.36118 }, // Larmtorget, by Vasabrunnen
  { lat: 56.662883, lng: 16.360466 }, // Larmtorget, north-west corner
  { lat: 56.663107, lng: 16.360249 }, // Västra Vallgatan
  { lat: 56.66329, lng: 16.3602 }, // outside Västerport
];

// A 1611 cannonball: fired from out on the water south-east of the castle, over the castle bridge
// (15 m up) and on over Gamla stan. It triggers within 410 m of its start: on the long bridge
// (360–395 m) but not at the park's south tip (~450 m), and only after you've stopped there.
const CANNONBALL_PATH = [
  { lat: 56.6562, lng: 16.359 },
  { lat: 56.65838, lng: 16.35425 },
  { lat: 56.6596, lng: 16.3505 },
];

// Kalmar Nyckel sails a slow loop on the open water south of the castle (clear of the islets).
const SHIP_PATH = [
  { lat: 56.6567, lng: 16.3572 },
  { lat: 56.6563, lng: 16.359 },
  { lat: 56.6557, lng: 16.3585 },
  { lat: 56.656, lng: 16.3565 },
  { lat: 56.6567, lng: 16.3572 },
];

// The planned route, start to finish (drawn on the listener's map).
export const ROUTE = [
  [56.65992, 16.36103], [56.660057, 16.361031], [56.660156, 16.361069], [56.660394, 16.361606],
  [56.660628, 16.362149], [56.660772, 16.362492], [56.660875, 16.362789], [56.660952, 16.363006],
  [56.66102, 16.363027], [56.661108, 16.363347], [56.661211, 16.363784], [56.661345, 16.364216],
  [56.661483, 16.364688], [56.661747, 16.364433], [56.661923, 16.36426], [56.662181, 16.364017],
  [56.662465, 16.363744], [56.662749, 16.363471], [56.663391, 16.365685], [56.663729, 16.365363],
  [56.663934, 16.365167], [56.6641, 16.36575], [56.66422, 16.36598], [56.663957, 16.365138],
  [56.663314, 16.362919], [56.66288, 16.361429], [56.66272, 16.36118], [56.662883, 16.360466],
  [56.663107, 16.360249], [56.6633, 16.360202], [56.66331, 16.36011], [56.663366, 16.359994],
  [56.663378, 16.359753], [56.663382, 16.359599], [56.663404, 16.358617], [56.663363, 16.358587],
  [56.663016, 16.358159], [56.66282, 16.357963], [56.662603, 16.35754], [56.66271, 16.357353],
  [56.66282, 16.356892], [56.662943, 16.356447], [56.662976, 16.356332], [56.662899, 16.355427],
  [56.662747, 16.355281], [56.662324, 16.35536], [56.662032, 16.355431], [56.661867, 16.355538],
  [56.661737, 16.355506], [56.66152, 16.355675], [56.661208, 16.35565], [56.66094, 16.355585],
  [56.660672, 16.355614], [56.660482, 16.355427], [56.660129, 16.355141], [56.659798, 16.355],
  [56.659422, 16.354719], [56.658985, 16.354336], [56.658898, 16.35393], [56.658831, 16.353452],
  [56.6588, 16.353465], [56.658582, 16.35356], [56.658433, 16.353659], [56.658401, 16.353954],
  [56.658385, 16.354423], [56.658347, 16.354554], [56.65828, 16.354653], [56.658112, 16.354716],
  [56.657999, 16.354761], [56.657874, 16.354721], [56.657787, 16.354773], [56.657679, 16.354922],
  [56.657566, 16.355188], [56.65754, 16.35535],
].map(([lat, lng]) => ({ lat, lng }));

// --- Points (order matters: the first is the course start for start-wayfinding) ------------
const once = { loop: false, stopAfter: true, reload: false };
const looped = { loop: true, stopAfter: false, reload: false };

/** `dur(clip)` = the rendered clip's length in seconds (used for stop dwell times). */
export function points(dur) {
  const dwell = (clip) => Math.ceil(dur(clip)) + 1;
  return [
    {
      id: 'kd-valkommen', name: 'Välkommen', type: 'static', center: P.welcome, radius: 20, playback: once,
      next: ['kd-masen'], audio: { clip: 'welcome', variants: [{ lang: 'en', clip: 'welcome_en' }] },
      facts: 'KONCEPT: ljudpunkt (statisk), hörbar radie, riktning via kompassen, radarn och nästa-pilen, akustisk zon (hamnens bakgrund), cirklande ljud (måsarna). Har telefonen engelska hörs välkomsten på engelska.',
    },
    {
      id: 'kd-masarna', name: 'Måsarna över gästhamnen', type: 'static_circling', center: P.gulls, circleRadius: 14,
      speed: 3.5, radius: 70, height: 12, volume: 0.6, playback: looped, audio: { clip: 'gulls' },
      facts: 'KONCEPT: cirklande ljud. Måsar som cirklar tolv meter upp över gästhamnen.',
    },
    {
      id: 'kd-masen', name: 'Måsen som vill ha din glass', type: 'follow_user', mode: 'orbit', center: P.iceCream,
      initialRadius: 7, followRadius: 2.5, followSpeed: 3, height: 1, volume: 0.9, playback: once,
      next: ['kd-jordbro'], audio: { clip: 'gull_beg' },
      facts: 'KONCEPT: följande ljud (cirklar runt dig). Väntar på kajen tills du kommer nära, flyger sedan runt ditt huvud en stund.',
    },
    {
      id: 'kd-jordbro', name: 'Jordbroporten', type: 'static', center: P.jordbro, radius: 15, playback: once,
      next: ['kd-stortorget'], audio: { clip: 'jordbro' },
      facts: 'KONCEPT: förklarar följande ljud och dess fyra lägen. Jordbroporten är en öppning i Skeppsbrovallen, den tidigare stadsmuren på Kvarnholmen. Staden flyttade till Kvarnholmen från 1650-talet.',
    },
    {
      id: 'kd-klockorna', name: 'Domkyrkans klockor', type: 'static', center: P.cathedral, radius: 140, height: 35,
      volume: 0.55, playback: { ...looped, loopGapSec: 45 }, audio: { clip: 'bells' },
      facts: 'KONCEPT: höjd (35 m upp) och slinga med paus (45 s mellan ringningarna). Hörs redan på väg mot torget.',
    },
    {
      id: 'kd-stortorget', name: 'Stortorget', type: 'static', center: P.stortorget, radius: 14, playback: once,
      next: ['kd-radmannen'], audio: { clip: 'stortorget' },
      facts: 'KONCEPT: förklarar höjd, slinga med paus, riktat ljud och flaggor.',
    },
    {
      id: 'kd-radmannen', name: 'Rådmannen', type: 'static', center: P.radman, radius: 15, facing: 200, spread: 220,
      setsFlags: ['RADMANNEN'], playback: once, next: ['kd-stadsvakten'], audio: { clip: 'radman' },
      facts: 'KONCEPT: riktat ljud (vänd mot torget, hörs inte från kyrkans sida) som sätter flaggan RADMANNEN. Riksrådet beslöt 1640 att flytta staden till Kvarnholmen; efter branden 1647 började flytten. Domkyrkan ritades av Nicodemus Tessin d.ä., byggdes 1660–1703 under tre kungar Karl och kallades Karls domkyrka.',
    },
    {
      id: 'kd-stadsvakten', name: 'Stadsvakten', type: 'path', path: WATCHMAN_PATH, speed: 1.2, radius: 25,
      endBehavior: 'stop', waitForListener: true, waitRadius: 25, showWayfinding: true, requiresFlags: ['RADMANNEN'],
      volume: 0.9, playback: looped, next: ['kd-efter-porten'], audio: { clip: 'steps' },
      stops: [
        { index: 0, clip: 'vakt_start' },
        { index: 1, clip: 'vakt_storgatan' },
        { index: 3, clip: 'vakt_larmtorget' },
        { index: 6, clip: 'vakt_porten' },
      ].map((s) => ({ index: s.index, dwellSec: dwell(s.clip), clip: s.clip })),
      facts: 'KONCEPT: väg med stopp som väntar in lyssnaren (koppel = hörvidd, 25 m), visar riktning och avstånd, kräver flaggan RADMANNEN och försvinner från skärmen när den gått klart. 1765 började den andra stadsbranden i en gård vid Larmtorget; 131 tomter ödelades. Larmtorget hette tidigare Alarmtorget, och där var stadsvakten inkvarterad till början av 1800-talet. Västerport var stadens enda port mot landsidan.',
    },
    {
      id: 'kd-portvakten', name: 'Portvakten', type: 'static', center: P.guard, radius: 18, triggerRadius: 7,
      hidden: true, playback: once, audio: { clip: 'portvakt' },
      facts: 'KONCEPT: skrämselljud (tyst tills du är inom 7 m) och dolt ljud (syns inte på radarn eller kartan). Står i portens tunnelzon, så han ekar.',
    },
    {
      id: 'kd-efter-porten', name: 'Efter porten', type: 'static', center: P.afterGate, radius: 14, playback: once,
      next: ['kd-parken'], audio: { clip: 'efter_porten' },
      facts: 'KONCEPT: förklarar skrämselljud, dolda ljud, akustisk zon med tunnelklang och dämpning genom zonens vägg, och vägen med stopp.',
    },
    {
      id: 'kd-hunden', name: 'Hunden på stranden', type: 'follow_user', mode: 'chase', center: P.dog, initialRadius: 8,
      maxSpeed: 0.7, disengageDistance: 18, volume: 0.8, playback: looped, audio: { clip: 'dog' },
      facts: 'KONCEPT: följande ljud som jagar dig. Springer efter dig i 0,7 m/s och ger upp när du är 18 m bort.',
    },
    {
      id: 'kd-parken', name: 'Stadsparken', type: 'static', center: P.park, radius: 16, playback: once,
      next: ['kd-val-drottningen', 'kd-val-kallaren'], audio: { clip: 'parken' },
      facts: 'KONCEPT: förklarar det jagande ljudet (hunden), flera nästa-ljud (två pilar) och vägskäl (exklusiv grupp).',
    },
    {
      id: 'kd-val-drottningen', name: 'Drottningens väg', type: 'static', center: P.pickQueen, radius: 15,
      flagGroup: 'parkval', setsFlags: ['DROTTNINGEN'], playback: once, next: ['kd-drottningen'], audio: { clip: 'fanfare' },
      facts: 'KONCEPT: exklusiv grupp. Den första av de två vägarna du går in på sätter sin flagga och låser den andra.',
    },
    {
      id: 'kd-val-kallaren', name: 'Källarmästarens väg', type: 'static', center: P.pickCellar, radius: 15,
      flagGroup: 'parkval', setsFlags: ['KALLAREN'], playback: once, next: ['kd-kallarmastaren'], audio: { clip: 'goblets' },
      facts: 'KONCEPT: exklusiv grupp. Den första av de två vägarna du går in på sätter sin flagga och låser den andra.',
    },
    {
      id: 'kd-drottningen', name: 'Drottning Margareta', type: 'static', center: P.queen, radius: 15,
      requiresFlags: ['DROTTNINGEN'], playback: once, next: ['kd-faglarna'], audio: { clip: 'drottningen' },
      facts: 'Kalmarunionen bildades på Kalmar slott 1397 av drottning Margareta; hennes arvinge Erik av Pommern kröntes där. Unionen bestod till 1523.',
    },
    {
      id: 'kd-kallarmastaren', name: 'Källarmästaren', type: 'static', center: P.cellar, radius: 15,
      requiresFlags: ['KALLAREN'], playback: once, next: ['kd-faglarna'], audio: { clip: 'kallarmastaren' },
      facts: 'Gustav Vasa och hans söner byggde om slottet till ett renässansslott; arbetet fullbordades i början av 1600-talet och bestyckningen uppgick till 287 kanoner. Kalmar slott räknades till Sveriges fyra viktigaste fästen. Källarmästaren är fiktion.',
    },
    {
      id: 'kd-faglarna', name: 'Stå still', type: 'static', center: P.birds, radius: 13, setsFlags: ['SLOTTSBRON'],
      playback: once, next: ['kd-slottet'], audio: { clip: 'faglarna' },
      facts: 'KONCEPT: förklarar "visas när du står still" och "flyr när du rör dig". Sätter flaggan SLOTTSBRON, som laddar kanonkulan.',
    },
    {
      id: 'kd-koltrasten', name: 'Koltrasten', type: 'static', center: P.blackbird, radius: 22, height: 4, stillSec: 5,
      fleeOnMove: true, volume: 0.85, playback: looped, audio: { clip: 'blackbird' },
      facts: 'KONCEPT: tyst tills du stått still i 5 sekunder, och tystnar när du rör dig.',
    },
    {
      id: 'kd-kanonkulan', name: 'Kanonkulan', type: 'path_triggered', path: CANNONBALL_PATH, triggerRadius: 410,
      speed: 60, height: 15, endBehavior: 'stop', requiresFlags: ['SLOTTSBRON'], playback: once, audio: { clip: 'cannon' },
      facts: 'KONCEPT: utlöst väg. Avfyras när du kommer ut på bron, flyger 15 m över dig med dopplereffekt och försvinner från skärmen när den landat. Kalmar intogs av danskarna 1611 och slottet belägrades.',
    },
    {
      id: 'kd-slottet', name: 'Kalmar slott', type: 'static', center: P.castle, radius: 12, playback: once,
      next: ['kd-drottningen-slottet', 'kd-kallaren-slottet'], audio: { clip: 'slottet' },
      facts: 'KONCEPT: förklarar den utlösta vägen och dopplereffekten. Slottet började byggas i slutet av 1100-talet.',
    },
    {
      id: 'kd-drottningen-slottet', name: 'Drottningen vid slottet', type: 'static', center: P.coda, radius: 11,
      requiresFlags: ['DROTTNINGEN'], playback: once, next: ['kd-final'], audio: { clip: 'drottningen_slott' },
      facts: 'KONCEPT: kräver flaggan från vägvalet i parken.',
    },
    {
      id: 'kd-kallaren-slottet', name: 'Källarmästaren vid slottet', type: 'static', center: P.coda, radius: 11,
      requiresFlags: ['KALLAREN'], playback: once, next: ['kd-final'], audio: { clip: 'kallare_slott' },
      facts: 'KONCEPT: kräver flaggan från vägvalet i parken.',
    },
    {
      id: 'kd-final', name: 'Slutet', type: 'static', center: P.finale, radius: 15, playback: once,
      audio: { clip: 'final', variants: [{ lang: 'en', clip: 'final_en' }] },
      facts: 'KONCEPT: sammanfattning, gemensam klocka (skeppet) och berättarspråk (engelsk version för telefoner på engelska). Kalmar Nyckel byggdes i Holland omkring 1625 och fraktade 1638 svenska kolonister till Nya Sverige.',
    },
    {
      id: 'kd-skeppet', name: 'Kalmar Nyckel', type: 'path', path: SHIP_PATH, speed: 1.2, radius: 360, endBehavior: 'loop',
      sync: 'global', startAt: Date.parse('2026-11-01T00:00:00Z'), volume: 0.9, playback: looped, audio: { clip: 'ship' },
      facts: 'KONCEPT: väg i slinga med gemensam klocka: alla lyssnare hör skeppet på samma plats samtidigt.',
    },
  ];
}

// --- Acoustic zones (later zones win where they overlap) -------------------------------------
export function zones() {
  return [
    {
      name: 'Hamnen', reverb: 'outdoor', wet: 0.12, ambience: 'harbour', ambienceVolume: 0.45,
      polygon: [
        [56.65945, 16.35995], [56.66025, 16.35985], [56.66125, 16.3631], [56.6613, 16.3651],
        [56.66095, 16.36515], [56.66075, 16.3638], [56.65985, 16.363], [56.65945, 16.362],
      ],
    },
    {
      name: 'Västerport', reverb: 'tunnel', wet: 0.65, ambience: 'gate_wind', ambienceVolume: 0.3,
      polygon: [
        [56.66342, 16.3597], [56.66343, 16.36003], [56.66336, 16.36018], [56.66324, 16.36013],
        [56.66331, 16.35996], [56.66332, 16.35968],
      ],
    },
  ];
}

export const COURSE = {
  name: 'Kalmar i lurarna — en demorunda',
  slug: 'kalmar-demo',
  description:
    'En ljudvandring från Kalmar Turistcenter genom Kvarnholmen till Kalmar slott, drygt två kilometer. Med alla berättelser tar den omkring 40 minuter. ' +
    'Rundan visar vad man kan bygga med AudioWorld, och den förklarar sig själv medan du går. Guiden Lova möter ' +
    'dig vid Turistcenter, och på vägen träffar du en rådman, stadsvakten, en drottning eller en källarmästare, ' +
    'måsar, kyrkklockor och en kanonkula. Ta på dig hörlurarna, starta vid Turistcenter och följ pilen.',
  idea:
    'En demorunda för Destination Kalmar som förklarar AudioWorlds möjligheter genom att låta lyssnaren uppleva ' +
    'dem. Guiden Lova förklarar varje koncept precis före eller efter att man hör det, och Kalmarfigurer visar det. ' +
    'Ordning: ljudpunkt, radie och riktning → akustisk zon och cirklande ljud (hamnen) → följande ljud (måsen) → ' +
    'höjd och slinga med paus (klockorna) → riktat ljud och flaggor (rådmannen) → väg med stopp som väntar in dig ' +
    '(stadsvakten) → tunnelzon, skrämselljud och dolt ljud (Västerport) → jagande ljud (hunden) → vägskäl med två nästa-pilar (parken) → ' +
    'stå still / fly vid rörelse (koltrasten) → utlöst väg med dopplereffekt (kanonkulan) → flaggstyrda avslutningar, ' +
    'gemensam klocka (Kalmar Nyckel) och språkversioner (finalen). Varje punkts fakta börjar med KONCEPT: … ' +
    'så att det syns i admin vad den visar.',
  backgroundInfo:
    'Källor: sv.wikipedia.org. Riksrådet beslöt 1640 att flytta Kalmar till Kvarnholmen; efter eldsvådan 1647 började ' +
    'flytten och ön bebyggdes från 1650-talet, med befästningar av nederländsk modell. Storgatan går i öns axel från ' +
    'strax söder om Västerport, stadens enda port mot landsidan. Larmtorget hette tidigare Alarmtorget; där var ' +
    'stadsvakten inkvarterad till början av 1800-talet. 1765 började den andra stadsbranden i en gård vid Larmtorget ' +
    'och 131 tomter ödelades. Jordbroporten är en öppning i Skeppsbrovallen. Kalmar domkyrka ritades av Nicodemus ' +
    'Tessin d.ä., byggdes 1660–1703 under Karl X Gustav, Karl XI och Karl XII och kallades Karls domkyrka. Kalmar slott ' +
    'började byggas i slutet av 1100-talet; Kalmarunionen bildades där 1397 av drottning Margareta och bestod till ' +
    '1523. Gustav Vasa och hans söner byggde om slottet till renässansslott med 287 kanoner. 1611 intogs Kalmar av en ' +
    'dansk här och slottet belägrades. Kalmar Nyckel byggdes i Holland omkring 1625 och fraktade 1638 kolonister ' +
    'till Nya Sverige. Lova, rådmannen, stadsvakten, portvakten och källarmästaren är fiktion.',
  showStartWayfinding: true,
  eyesUp: false,
};
