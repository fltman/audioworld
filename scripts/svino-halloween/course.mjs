/**
 * "Trettio spann" — a Halloween ghost-story walk on Svinö, Kalmar.
 *
 * The thread: Svinöbron has thirty spans, but on All Hallows' Eve it has thirty-one. Whoever crosses
 * the thirty-first reaches the island of the dead, where the dead tell their stories so they won't
 * forget who they were. Berätterskan, an old storyteller who never made it home, hosts the night and
 * sets the rule: every story you hear is a span on your way home. After each tale she counts the
 * spans. Six tales (one of two on the crossroads) are unlocked in order by story flags; the seventh
 * is yours. Coming home you count the spans — and the bridge counts thirty-one again.
 *
 * This file is the whole course: manuscripts, sound-effect prompts, mixes, geometry and zones.
 * render.mjs turns it into audio and build.mjs into a .audioworld bundle.
 *
 * Geometry: paths are routed along OpenStreetMap footpaths (© OpenStreetMap contributors, ODbL).
 * History: Länsstyrelsen Kalmar, kalmarkusten.se, Wikipedia (Svinö naturreservat); Gloson from
 * Swedish folklore (Isof). All characters and their tales are fiction.
 */

// --- Voices (ElevenLabs) ----------------------------------------------------------------------
export const VOICES = {
  beratterskan: '5uzQ0spQ5vDivw0B3Cty', // Svinö – Berätterskan (designed): host and frame narrator
  lararinnan: 'XanPWZY093nNfcNA0IYf', // Någonstans i Sverige — Elins berättare: the 1918 teacher
  grisvaktaren: '7a8HTLN201fIMSaES9fv', // Tokenköping – Redaktören (småländska): the swineherd
  munskanken: 'JxSxIPNtHrR2j8ljyhNv', // 3k kammartjänare: the king's cupbearer
  kungen: 'aCAOgbclUegkDtN5O4NK', // Svinö – Karl XI (designed)
  marta: 'qcR8JdM3FHI86EeAZjs7', // Svinö – Märta (designed): the ferry lantern, 1957
  konstapeln: 'DRh71TqOSzV1UjuYqLjT', // Svinö – Dansk konstapel (designed, speaks Danish)
  vakten: 'TADs9mLgrKUts9h3YL14', // Svinö – Beredskapssoldaten (designed), 1940
  radio: '3YJ5fTuXPP9fcrpRf8KG', // Tokenköping – Journalspeaker (1940s announcer)
};
export const TTS_MODEL = 'eleven_v4';

// --- Spoken lines (eleven_v4 audio tags in brackets; years written out for pronunciation) ----
export const LINES = {
  // The frame
  intro_sv: ['beratterskan', `[raspy, amused] Nämen. En till. [pause] Kom, kom närmare. Jag biter inte. Inte än. [pause] Ser du bron? Trettio spann, säger de som har räknat. Hundrasextio meter trä ut till Svinö. [whispers] Men i natt är det allhelgonanatt. Och i natt är spannen trettioett. [pause] Den som går över det trettioförsta spannet kommer inte ut till samma ö som du badade vid i somras. Den kommer ut till vår. [slowly] Där ute sitter de döda och berättar. Det är det enda som håller dem kvar. [pause] Och här är regeln, så lyssna noga. Varje berättelse du hör är ett spann på vägen hem. Hör dem alla, så bär bron dig tillbaka. [whispers] Tappar du en … ja. Då får vi se. [pause] Kom nu. Jag går före. [low] Och stegen du snart hör bakom dig på plankorna … de är inte mina.`],
  intro_en: ['beratterskan', `[raspy, amused] Well, well. Another one. [pause] Come closer. I don't bite. Not yet. [pause] See the bridge? Thirty spans, say those who've counted. A hundred and sixty metres of timber out to Svinö. [whispers] But tonight is All Hallows' Eve. And tonight there are thirty-one. [pause] Whoever crosses the thirty-first span doesn't reach the island you swam at last summer. They reach ours. [slowly] Out there the dead sit and tell their stories. It's all that keeps them here. [pause] Now listen to the rule. Every story you hear is one span on your way home. Hear them all, and the bridge will carry you back. [whispers] Lose one … well. We'll see. [pause] Come. I'll walk ahead. [low] And the footsteps you'll soon hear behind you on the planks … they aren't mine. [pause] The dead out there speak Swedish. You'll understand them anyway. Fear needs no translation.`],
  threshold_sv: ['beratterskan', `[whispers, slowly] Tjugoåtta. [pause] Tjugonio. [pause] Trettio. [long pause] Trettioett. [pause] [softly] Välkommen till Svinö.`],
  threshold_en: ['beratterskan', `[whispers, slowly] Twenty-eight. [pause] Twenty-nine. [pause] Thirty. [long pause] Thirty-one. [pause] [softly] Welcome to Svinö.`],

  // 1. The teacher, 1918 (guide stop in the spruce grove)
  bt_intro1: ['beratterskan', `[low, savouring] Här, mellan granarna, sitter fröken. Hon var lärarinna inne i stan. Hon har en berättelse om barn. [whispers] De bästa berättelserna handlar alltid om barn.`],
  teacher: ['lararinnan', `[gently] Varje vår rodde vi ut hit med klassen. Ön var kal då, bara gräs och en. Varje barn fick en liten granplanta och fick sätta den själv, och säga sitt namn högt, så att trädet skulle veta vem det hörde till. [pause] Våren nittonhundraarton kom sjukan. Spanskan. [slowly] Först stod tre bänkar tomma. Sedan elva. [pause] Jag rodde ut ändå. Ensam, med plantorna i en hink. Och för varje bänk som stod tom satte jag ett träd, och sa namnet högt. [whispers] Ester. Gustav. Lilla Signe. [pause] Det är deras granar du går under nu. [very quietly] Och de svarar fortfarande när någon ropar upprop. [pause] Men bara om man står alldeles stilla. Barnen är rädda för den som rör sig i mörkret. [pause] Det blev jag också. Till slut.`],
  bt_count1: ['beratterskan', `[dry] Ett spann.`],
  rollcall: ['lararinnan', `[softly, calling] Ester? [long pause] Gustav? [long pause] Signe? [long pause] [whispers] Lilla Signe … var är du?`],

  // 2. The swineherd, 1600s (guide stop in the glade)
  bt_intro2: ['beratterskan', `[amused] Hör du grymtandet? Då är vi framme hos grisvaktaren. Han var här först av oss alla. Ön heter efter hans djur.`],
  swineherd: ['grisvaktaren', `[gruff, slow] Swyyn öön. Det var vår ö. Om somrarna rodde vi ut svinen hit, och jag låg här med dem ända till slaktmånaden. [pause] Mor sa åt mig: allhelgonanatt ska du hålla dig inne, för då går Gloson. [low] Suggan som ingen äger. Stor som en kalv, med ögon som brinner, och en rygg som en såg. Kommer hon springande ska du ställa fötterna ihop. För hon springer mellan benen på folk, och sågen på ryggen klyver dem. [pause] Jag var femton år. Jag skrattade åt mor. [pause] Den natten tystnade svinen. Alla på en gång. [whispers] Och bland enbuskarna tändes två ögon. Sedan två till. [pause] Jag sprang. Med benen isär, som en dåre. [slowly] Hon hann ifatt mig precis här. [pause] [low] Sedan dess står jag med fötterna ihop varje natt. Det hjälper inte. Men jag gör det ändå. [whispers] Gör du likadant. Hon är inte långt borta. Söderut. Dit du ska.`],
  bt_count2: ['beratterskan', `[pleased] Två spann. [whispers] Och håll ihop fötterna nu.`],
  bt_guide_end: ['beratterskan', `[low] Här släpper jag dig en stund. [pause] Vid den flata stenen där borta i väster står en man som har väntat på att få sätta sig i över trehundra år. Kungens munskänk. [whispers] Ät ingenting han bjuder på.`],

  // 3. The cupbearer, 1680s (Kungabordet)
  munskank_a: ['munskanken', `[nervous, hushed] Tyst, tyst. Kungen äter. [pause] Hans majestät ville äta under bar himmel, på en sten, som en vanlig karl. Så vi bar ut silver och vin och en helstekt gris, hela vägen hit. [pause] Mitt ämbete var att smaka först. Allt som kungen skulle äta, åt jag först. Allt han skulle dricka, drack jag först. [whispers] Fanns det gift, skulle det hamna i mig.`],
  king_smaka: ['kungen', `[commanding, impatient] Smaka!`],
  munskank_b: ['munskanken', `[shaky] Jag smakade. Vinet var sött. Och sedan … bittert. [pause] Jag sa ingenting. Man avbryter inte en kung som äter. [slowly] Jag stod här bakom honom tills middagen var slut. Och den tog aldrig slut. [pause] Kungen märkte ingenting. Han reste hem och dog i sin säng, många år senare. [whispers] Men jag står kvar. Någon måste ju smaka först. [pause] [urgent] Lyssna nu. Härifrån går två stigar. Västerut, längs stranden, lyser en lykta. Österut slår någon på en trumma. Du får bara gå den ena i natt. [whispers] Välj. Kungen tycker inte om folk som dröjer vid hans bord.`],
  bt_count3: ['beratterskan', `[whispers] Tre.`],

  // 4a. West: Märta and the lantern, 1957
  bt_intro4a: ['beratterskan', `[whispers] Lyktan. Klokt val. Märta har väntat länge på någon att lysa åt.`],
  marta_tale: ['marta', `[softly] Linfärjan gick från Kullö, över sundet, till stugorna på södra udden. Min Erik drog färjan för hand, längs en lina, fram och tillbaka. [pause] När det var dimma stod jag här på stranden med lyktan, så att han skulle se vart han skulle. [pause] Allhelgonanatten nittonhundrafemtiosju var dimman så tjock att jag inte såg mina egna händer. Men jag hörde honom. Linan som knarrade. Hans andetag. [slowly] Och så hörde jag linan brista. [pause] Det blev alldeles tyst. [whispers] Sedan hörde jag honom ropa mitt namn. Inte från vattnet. Bakifrån. Från skogen. [pause] Jag vände mig om. [long pause] Man ska aldrig vända sig om på Svinö. [pause] Jag står kvar här med lyktan. Men det är inte Erik jag lyser åt längre. [softly] Det är dig. Gå norrut nu, längs vattnet, och sedan österut mot den stora bron. [whispers] Och om någon ropar ditt namn bakifrån … vänd dig inte om.`],
  bt_count4: ['beratterskan', `[whispers] Fyra.`],

  // 4b. East: the Danish konstapel and the drummer, 1611
  bt_intro4b: ['beratterskan', `[whispers] Trumman. Modigt. Konstapeln talar danska, men du förstår honom ändå. Rädsla är samma språk överallt.`],
  konstapel_tale: ['konstapeln', `[hoarse, low] Vi byggede skansen derude på pynten i sekstenhundrede og elleve, for at lukke sundet for svenskerne. [pause] Men volden ville ikke stå. Hver nat skred jorden ud i vandet. [pause] De gamle soldater sagde, at en skanse skal have en vogter. En, der bliver inde i den. [slowly] Så vi trak lod. [pause] Det blev trommeslageren. Nitten år. [pause] Vi gav ham et lys og hans tromme og sagde, han skulle slå, så vi vidste, han var der. Og så kastede vi jorden på. [long pause] Volden holdt. [whispers] Han slår stadig. Hør. [pause] Hver allehelgensnat graver jeg efter ham. Jeg når aldrig ned. [low] Gå mod nord, mod den store bro. Og hvis du hører trommen under dine fødder … så gå hurtigere.`],

  // 5. The sentry, 1940 (the cupola bunker under Ölandsbron)
  bt_intro5: ['beratterskan', `[low] Här under bron sitter den yngsta av oss. Han har inte förstått att kriget är slut. [whispers] Säg det inte till honom.`],
  sentry_a: ['vakten', `[tense] Halt! Vem där? [pause] Lösen! [pause] Ingen lösen. Det är ingen som har det längre. [quieter] Förlåt. Sätt dig. Jag står på post. Nittonhundrafyrtio, beredskap. [pause] Den natten jag ska berätta om sa radion att det var lugnt i sundet.`],
  radio: ['radio', `[formal] Här är Radiotjänst. Klockan är tjugotre. Läget i Kalmarsund är lugnt. Inga främmande fartyg har iakttagits. [pause] Jag upprepar. Inga främmande fartyg har iakttagits.`],
  sentry_b: ['vakten', `[whispers] Men jag såg det. Ett skepp utan lanternor, med segel som hängde i trasor. Och det seglade mot vinden. [pause] Jag tog båten och rodde ut för att se. [pause] Däcket var fullt av folk. Soldater i gamla rockar, med musköter. De stod alldeles stilla och tittade in mot Kalmar. [pause] En av dem vände sig mot mig. Han hade inget ansikte. Bara mörker där ansiktet skulle ha varit. [slowly] Och han sa: trehundra år, och vi har fortfarande inte gett upp. [long pause] Jag rodde tillbaka. Jag tror att jag rodde tillbaka. [whispers] Men ingen har kommit och löst av mig sedan dess. [pause] Gå ut mot udden nu. Skeppet är där i natt. [low] Det är det alltid.`],
  bt_count5: ['beratterskan', `[whispers] Fem.`],

  // 6. Berätterskan's own tale (the skans), and the finale at the bridge
  bt_tale6: ['beratterskan', `[raspy, close] Så. Nu är det min tur. [pause] Jag var berätterska i Kalmar. Jag gick från gård till gård och berättade om vättar och gastar och om Gloson, och folk gav mig bröd och en sängplats för det. [pause] Men berättelser tar slut. Man måste hämta nya. [low] Så en allhelgonanatt, för länge sedan, gick jag ut över det trettioförsta spannet för att lyssna på de döda. [pause] Jag hörde dem alla. Fröken. Grisvaktaren. Munskänken. Vakten. Alla. [pause] Men när jag kom tillbaka till bron fattades det ett spann. [slowly] För de dödas regel är enkel. Man får inte bara ta. Man måste lämna en berättelse också. Och jag hade inga egna. Bara andras. [long pause] Så jag blev kvar. Och jag har väntat sedan dess, på någon som har en egen berättelse att lämna. [whispers] Sex spann har du nu. Det sjunde är ditt. [pause] Gå tillbaka till bron, längs norra stranden. Hela vägen. Och vänd dig inte om. [very quietly] Vänder du dig om, så är det din berättelse vi berättar nästa allhelgonanatt.`],
  finale_sv: ['beratterskan', `[raspy, close] Där är du. Hela vägen. [pause] Och du vände dig inte om? [pause] Bra. [pause] Då ska du få veta vad din berättelse är. [whispers] Det är den här. Om en som gick över det trettioförsta spannet en allhelgonanatt, och hörde de döda berätta, och gick hem igen. [pause] Jag har hört varje steg du tog. Den berättelsen sparar jag. [pause] Gå nu. Och räkna spannen medan du går. [slowly] Är de trettio … då är du fri. [long pause] [whispers] Räkna noga.`],
  finale_en: ['beratterskan', `[raspy, close] There you are. All the way. [pause] And you didn't turn around? [pause] Good. [pause] Then you should know what your story is. [whispers] It's this one. About someone who crossed the thirty-first span on All Hallows' Eve, heard the dead tell their tales, and walked home again. [pause] I heard every step you took. That story, I'll keep. [pause] Go now. And count the spans as you walk. [slowly] If there are thirty … you're free. [long pause] [whispers] Count carefully.`],
};

// --- Sound effects (ElevenLabs sound generation): [prompt, seconds, loop] --------------------
export const SFX = {
  planks: ['Slow heavy footsteps walking on old wooden bridge planks at night, boards creaking under each step, close behind the listener, no music, no voices', 12, true],
  water: ['Calm dark sea water gently lapping against wooden bridge pilings at night, soft wind, an occasional distant gull', 22, true],
  stick: ["An old woman's wooden walking stick tapping slowly on a gravel forest path, shuffling footsteps and a faint raspy humming, night, no music", 12, true],
  threshold: ['A deep long groan of old wooden bridge timbers under strain, then a single low distant boom like a huge door closing far away, followed by silence', 8, false],
  gravel: ['Slow footsteps on a gravel shore path close behind the listener, keeping pace, night wind, no voices, no music', 12, true],
  children: ['Ghostly distant children whispering and softly giggling among dark pine trees at night, a faint hummed nursery tune, eerie and echoing', 18, false],
  girl: ['A young girl softly humming a slow sad lullaby alone in a dark forest at night, distant and ghostly, no words', 15, true],
  gloson: ['A huge monstrous wild sow snorting, squealing and grunting aggressively while charging through forest undergrowth, heavy hooves thudding, branches snapping, terrifying', 10, true],
  pigs: ['Several pigs grunting and snuffling as they root around on the forest floor at night, eerie, no music', 12, true],
  banquet: ['Ghostly royal banquet outdoors at night: silver cutlery clinking on plates, goblets touching, a lute playing softly, low murmuring voices, crackling torches', 22, true],
  bell: ["A single ship's bell tolling slowly across foggy water, the creaking rope and pulley of an old cable ferry, gentle lapping water", 12, false],
  drum: ['A lone 17th century military field drum played in a slow steady marching beat outdoors at night, wind', 12, true],
  static: ['Old 1940s valve radio hiss and crackling static with faint distorted morse code beeping', 15, true],
  cannon: ['A single massive black powder cannon firing, an enormous boom echoing across open water', 5, false],
  whistle: ['A heavy cannonball whistling through the air, rising then rushing overhead and away, doppler flyby', 7, false],
  ship: ['An old wooden sailing ship at night: creaking hull timbers, ropes straining, canvas sails flapping in the wind, waves against the hull, distant sailors singing a slow low sea chant', 22, true],
  crows: ['A flock of crows cawing and flapping their wings, circling in the night sky', 12, true],
  traffic: ['Deep rumble of cars and trucks crossing a huge concrete bridge high overhead, rhythmic thuds of expansion joints, low drone', 20, true],
  drone: ['Hollow low droning hum resonating underneath a large concrete bridge at night, distant traffic, dripping water, eerie', 22, true],
  skans: ['Cold wind over an open grassy point by the sea at night, waves breaking on stones, distant gulls', 22, true],
  whispers: ["Many overlapping breathy ghostly whispers swirling close around the listener's head, unintelligible, creepy", 12, false],
  forest: ['Night forest ambience: wind in tall pine trees, an owl hooting in the distance, twigs cracking, eerie', 22, true],
};

// --- Final clips: a voice line, an sfx, or a mix of layers (dB relative to unity) ------------
// Every clip is loudness-normalised after mixing: speech to -16 LUFS, beds/effects lower.
// In a mix, `after: <line>` starts a voice when that line ends (+ `gap` seconds).

/** A told tale: voices in sequence (1.5 s apart unless overridden) over an optional looping bed. */
function tale(bed, lines, { bedDb = -16, first = 1 } = {}) {
  const layers = lines.map((l) => (Array.isArray(l) ? { voice: l[0], ...l[1] } : { voice: l }));
  return {
    mix: [
      ...(bed ? [{ sfx: bed, db: bedDb, loop: true }] : []),
      ...layers.map((l, i) => (i === 0 ? { at: first, ...l } : { after: layers[i - 1].voice, gap: 1.5, ...l })),
    ],
    tail: 3,
  };
}

export const CLIPS = {
  intro: { voice: 'intro_sv' },
  intro_en: { voice: 'intro_en' },
  threshold: { mix: [{ sfx: 'threshold', db: -3 }, { voice: 'threshold_sv', at: 3 }], tail: 2 },
  threshold_en: { mix: [{ sfx: 'threshold', db: -3 }, { voice: 'threshold_en', at: 3 }], tail: 2 },
  story1: tale('forest', ['bt_intro1', 'teacher', 'bt_count1']),
  rollcall: { mix: [{ voice: 'rollcall', at: 1 }, { sfx: 'children', db: -6, at: 4 }], tail: 8 },
  story2: tale('pigs', ['bt_intro2', 'swineherd', 'bt_count2'], { bedDb: -18 }),
  guide_end: { voice: 'bt_guide_end' },
  story3: tale('banquet', ['munskank_a', ['king_smaka', { gap: 0.6 }], 'munskank_b', 'bt_count3'], { bedDb: -14, first: 2 }),
  bell: { sfx: 'bell' },
  story4a: tale(null, ['bt_intro4a', 'marta_tale', 'bt_count4']),
  drumroll: { sfx: 'drum' },
  story4b: tale('drum', ['bt_intro4b', 'konstapel_tale', 'bt_count4'], { bedDb: -18 }),
  story5: tale('static', ['bt_intro5', 'sentry_a', ['radio', { gap: 0.8, db: -6, radio: true }], 'sentry_b', 'bt_count5'], { bedDb: -22 }),
  story6: { voice: 'bt_tale6' },
  finale: { voice: 'finale_sv' },
  finale_en: { voice: 'finale_en' },
  planks: { sfx: 'planks' },
  stick: { sfx: 'stick' },
  gravel: { sfx: 'gravel' },
  girl: { sfx: 'girl' },
  gloson: { sfx: 'gloson' },
  pigs: { sfx: 'pigs' },
  cannon: { sfx: 'cannon' },
  whistle: { sfx: 'whistle' },
  ship: { sfx: 'ship' },
  crows: { sfx: 'crows' },
  traffic: { sfx: 'traffic' },
  whispers: { sfx: 'whispers' },
  water: { sfx: 'water', bed: true },
  drone: { sfx: 'drone', bed: true },
  skans: { sfx: 'skans', bed: true },
  forest: { sfx: 'forest', bed: true },
  // Suno background music, dropped in by hand as audio/music.mp3 (see suno.md).
  music: { file: 'music.mp3', bed: true },
};

// --- Geometry ----------------------------------------------------------------------------------
const P = {
  planks: { lat: 56.683445, lng: 16.368974 }, // ~20 m onto the bridge
  threshold: { lat: 56.682974, lng: 16.3712 }, // the "31st span", 30 m before the Svinö end
  rollcall: { lat: 56.680864, lng: 16.374004 }, // just past the teacher's stop, east of the path
  signe: { lat: 56.68, lng: 16.373398 }, // west of the path
  pigs: { lat: 56.67932, lng: 16.374349 }, // the glade
  king: { lat: 56.676125, lng: 16.371372 }, // Kungabordet, south shore
  ferry: { lat: 56.677313, lng: 16.370674 }, // west branch
  drum: { lat: 56.676834, lng: 16.376806 }, // east branch, past the guide's junction
  crows: { lat: 56.679148, lng: 16.378531 }, // east branch, the meadow
  bunker: { lat: 56.681207, lng: 16.380281 }, // the last WWII cupola, where both branches meet
  overhead: { lat: 56.681338, lng: 16.381575 }, // under the Öland bridge deck
  cannon: { lat: 56.682615, lng: 16.383139 }, // the 1611 skans on the north-east point
  skans: { lat: 56.682633, lng: 16.383204 },
  homeSteps: { lat: 56.683178, lng: 16.37895 }, // north shore, on the way home
  homeWhispers: { lat: 56.68393, lng: 16.373662 }, // north shore, near the bridge
  landing: { lat: 56.682877, lng: 16.371657 }, // Svinö end of the footbridge
};

// Berätterskan walks out onto the bridge as she talks, then steps off it over the water — far
// enough from the bridge (~110 m) that she never comes back into earshot on the way home.
const INTRO_PATH = [
  { lat: 56.683449, lng: 16.368628 },
  { lat: 56.683199, lng: 16.370133 },
  { lat: 56.6822, lng: 16.3702 },
];

// Her walking stick from the bridge landing through the forest to the south shore, ~100 m east of
// Kungabordet. Tales are told at the stops on vertices 4 and 8; she leaves you at 18.
const GUIDE_PATH = [
  { lat: 56.682877, lng: 16.371657 },
  { lat: 56.682657, lng: 16.372686 },
  { lat: 56.682335, lng: 16.373545 },
  { lat: 56.682008, lng: 16.373916 },
  { lat: 56.681356, lng: 16.37377 },
  { lat: 56.680864, lng: 16.373844 },
  { lat: 56.680155, lng: 16.373521 },
  { lat: 56.679819, lng: 16.373631 },
  { lat: 56.679394, lng: 16.37398 },
  { lat: 56.678882, lng: 16.374133 },
  { lat: 56.678685, lng: 16.374414 },
  { lat: 56.678133, lng: 16.374731 },
  { lat: 56.677735, lng: 16.374844 },
  { lat: 56.677473, lng: 16.374701 },
  { lat: 56.676469, lng: 16.375084 },
  { lat: 56.676345, lng: 16.374754 },
  { lat: 56.676414, lng: 16.373599 },
  { lat: 56.676392, lng: 16.373361 },
  { lat: 56.67623, lng: 16.37298 },
];

// Gloson's charge: out of the forest 25 m west of the path, across it, and off north-east into
// the trees — far enough from the south-shore path that she never comes back into earshot.
const GLOSON_PATH = [
  { lat: 56.677098, lng: 16.374436 },
  { lat: 56.677098, lng: 16.374844 },
  { lat: 56.67775, lng: 16.3756 },
];

// The faceless crew's ship, circling in Kalmarsund just off the north-east point (in water).
const SHIP_PATH = [
  { lat: 56.6848, lng: 16.3825 },
  { lat: 56.6852, lng: 16.386 },
  { lat: 56.6842, lng: 16.3888 },
  { lat: 56.683, lng: 16.3872 },
  { lat: 56.684, lng: 16.3855 },
  { lat: 56.6848, lng: 16.3825 },
];

// A cannonball from the ship: in from the water, over the skans, on to the west.
const CANNONBALL_PATH = [
  { lat: 56.6834, lng: 16.387 },
  { lat: 56.6822, lng: 16.379 },
];

// --- Points (order matters: the first is the course start for start-wayfinding) ------------
const once = { loop: false, stopAfter: true, reload: false };
const looped = { loop: true, stopAfter: false, reload: false };

/** `dur(clip)` = the rendered clip's length in seconds (used for stop dwell times). */
export function points(dur) {
  const dwell = (clip) => Math.ceil(dur(clip)) + 2;
  return [
    {
      name: 'Berätterskan vid bron', type: 'path_triggered', path: INTRO_PATH, triggerRadius: 40, speed: 0.6,
      endBehavior: 'stop', setsFlags: ['BRON'], playback: once,
      audio: { clip: 'intro', variants: [{ lang: 'en', clip: 'intro_en' }] },
      facts: 'Ramberättelsen. Svinöbron: gångbro i trä, 30 spann, ca 160 m, byggd i början av 1960-talet mellan Jutnabben och Svinö. På allhelgonanatten har den 31 spann. Berätterskan går ut på bron medan hon pratar och kliver sedan av den, ut över vattnet.',
    },
    {
      name: 'Steg på plankorna', type: 'follow_user', mode: 'chase', center: P.planks, initialRadius: 6,
      maxSpeed: 1.0, disengageDistance: 20, volume: 0.9, audio: { clip: 'planks' }, playback: looped,
      facts: 'Någon följer efter dig över bron, lite långsammare än du går. Gå på, så ger den upp efter en bit.',
    },
    {
      name: 'Det trettioförsta spannet', type: 'static', center: P.threshold, radius: 10, requiresFlags: ['BRON'],
      playback: once, audio: { clip: 'threshold', variants: [{ lang: 'en', clip: 'threshold_en' }] },
      facts: 'Tröskeln till de dödas ö. Hörs igen när du går hem över bron — och räknar fortfarande till trettioett.',
    },
    {
      name: 'Berätterskans käpp', type: 'path', path: GUIDE_PATH, speed: 1.1, radius: 30, endBehavior: 'stop',
      // She moves exactly while you can hear her: leash = earshot. Out of earshot she waits, and the
      // wayfinding arrow leads you back to her.
      waitForListener: true, waitRadius: 30, showWayfinding: true, volume: 0.8,
      audio: { clip: 'stick' }, playback: looped,
      stops: [
        { index: 4, clip: 'story1' },
        { index: 8, clip: 'story2' },
        { index: 18, clip: 'guide_end' },
      ].map((s) => ({ index: s.index, dwellSec: dwell(s.clip), clip: s.clip })),
      facts: 'Berätterskan går före med sin käpp och väntar på dig. Vid stoppen berättar fröken (1918) och grisvaktaren (1600-tal). Ön planterades med barrträd av en skogsförening med hjälp av skolbarn fram till omkring 1918; spanska sjukan och de döda barnen är fiktion.',
    },
    {
      name: 'Uppropet', type: 'static', center: P.rollcall, radius: 14, stillSec: 5,
      audio: { clip: 'rollcall' }, playback: once,
      facts: 'Fröken ropar upprop bland granarna. Hörs bara om du står alldeles stilla i fem sekunder.',
    },
    {
      name: 'Lilla Signe', type: 'static', center: P.signe, radius: 12, fleeOnMove: true,
      volume: 0.8, audio: { clip: 'girl' }, playback: looped,
      facts: 'Hon nynnar bara när du står stilla. Rör du dig tystnar hon.',
    },
    {
      name: 'Svinen', type: 'static_circling', center: P.pigs, circleRadius: 14, speed: 1.6, radius: 35,
      volume: 0.6, audio: { clip: 'pigs' }, playback: looped,
      facts: 'Svinö — "Swyyn öön" på en karta från 1600-talet — fick sitt namn av svinen som betade här.',
    },
    {
      name: 'Gloson', type: 'path_triggered', path: GLOSON_PATH, triggerRadius: 27, speed: 7,
      endBehavior: 'stop', audio: { clip: 'gloson' }, playback: once,
      facts: 'Gloson: spöksugga i sydsvensk folktro, främst Skåne och Småland. Glödande ögon och en rygg vass som en såg; hon springer mellan benen och klyver folk. Här rusar hon ut ur skogen, tvärs över stigen precis framför dig.',
    },
    {
      name: 'Munskänken vid Kungabordet', type: 'static', center: P.king, radius: 20, setsFlags: ['SAGA_KUNG'],
      audio: { clip: 'story3' }, playback: once,
      facts: 'Kungabordet: en stor flat sten på södra Svinö där Karl XI enligt traditionen ska ha ätit. Munskänken (fiktiv) berättar och visar på vägvalet.',
    },
    {
      name: 'Färjeklockan', type: 'static', center: P.ferry, radius: 15, flagGroup: 'vagval',
      setsFlags: ['VAST', 'SAGA_VAG'], audio: { clip: 'bell' }, playback: once,
      facts: 'Västra vägen. Den som går hit väljer lyktan; trummans saga på östra vägen tystnar för resten av natten.',
    },
    {
      name: 'Märta och lyktan', type: 'static', center: P.ferry, radius: 15, requiresFlags: ['VAST'],
      audio: { clip: 'story4a' }, playback: once,
      facts: 'Efter andra världskriget fick man ställa masonitstugor på sydöstra Svinö, med linfärja från Kullö. Märta och Erik är fiktion.',
    },
    {
      name: 'Trumvirveln', type: 'static', center: P.drum, radius: 15, flagGroup: 'vagval',
      setsFlags: ['OST', 'SAGA_VAG'], audio: { clip: 'drumroll' }, playback: once,
      facts: 'Östra vägen. Den som går hit väljer trumman; lyktans saga på västra vägen tystnar för resten av natten.',
    },
    {
      name: 'Konstapeln och trumslagaren', type: 'static', center: P.drum, radius: 15, requiresFlags: ['OST'],
      audio: { clip: 'story4b' }, playback: once,
      facts: 'Under Kalmarkriget 1611 byggdes en skans på Svinös nordöstra udde för att kontrollera seglationen i Kalmarsund. Byggnadsoffer är ett folktromotiv; trumslagaren är fiktion.',
    },
    {
      name: 'Kråkorna', type: 'static_circling', center: P.crows, circleRadius: 16, speed: 3, radius: 40,
      height: 14, volume: 0.7, audio: { clip: 'crows' }, playback: looped,
      facts: 'Kråkor som cirklar högt över ängen på östra vägen.',
    },
    {
      name: 'Vakten i kupolvärnet', type: 'static', center: P.bunker, radius: 18, facing: 90, spread: 240,
      requiresFlags: ['SAGA_VAG'], setsFlags: ['SAGA_VAKT'], audio: { clip: 'story5' }, playback: once,
      facts: 'Under andra världskriget byggdes små kupolvärn på Svinö; alla utom ett, söder om Ölandsbron, är rivna. Vakten (fiktiv) hörs inte bakom värnet.',
    },
    {
      name: 'Bron ovanför', type: 'static', center: P.overhead, radius: 40, height: 22, volume: 0.8,
      audio: { clip: 'traffic' }, playback: looped,
      facts: 'Ölandsbron går rakt över Svinö. Trafiken mullrar högt ovanför dig.',
    },
    {
      name: 'Skeppet utan lanternor', type: 'path', path: SHIP_PATH, speed: 2.5, radius: 400, endBehavior: 'loop',
      sync: 'global', startAt: Date.parse('2026-10-31T17:00:00Z'), volume: 0.9,
      audio: { clip: 'ship' }, playback: looped,
      facts: 'Skeppet ur vaktens berättelse seglar i Kalmarsund. Gemensam klocka: alla som går banan hör det på samma plats samtidigt.',
    },
    {
      name: 'Kanonkulan', type: 'path_triggered', path: CANNONBALL_PATH, triggerRadius: 280, speed: 70,
      endBehavior: 'stop', height: 15, audio: { clip: 'whistle' }, playback: once,
      facts: 'När du närmar dig skansen skjuter skeppet. Kulan viner in från vattnet och rakt över dig.',
    },
    {
      name: 'Kanonen', type: 'static', center: P.cannon, radius: 90, triggerRadius: 22,
      audio: { clip: 'cannon' }, playback: once,
      facts: 'Skansen svarar. Ett kanonskott när du kommer fram.',
    },
    {
      name: 'Berätterskans saga', type: 'static', center: P.skans, radius: 15, requiresFlags: ['SAGA_VAKT'],
      setsFlags: ['SAGA_SKANS'], audio: { clip: 'story6' }, playback: once,
      facts: 'Rester av skansen från Kalmarkriget 1611 syns fortfarande på nordöstra udden. Här berättar Berätterskan sin egen saga: varför hon aldrig kom hem.',
    },
    {
      name: 'Någon går bakom dig', type: 'follow_user', mode: 'chase', center: P.homeSteps, initialRadius: 8,
      maxSpeed: 1.0, disengageDistance: 25, requiresFlags: ['SAGA_SKANS'], volume: 0.9,
      audio: { clip: 'gravel' }, playback: looped,
      facts: 'På hemvägen längs norra stranden följer någon efter dig. Vänd dig inte om.',
    },
    {
      name: 'Viskningarna', type: 'follow_user', mode: 'sideToSide', center: P.homeWhispers, initialRadius: 8,
      followRadius: 3, followSpeed: 2, requiresFlags: ['SAGA_SKANS'], audio: { clip: 'whispers' }, playback: once,
      facts: 'Viskningar som sveper från öra till öra strax innan du är tillbaka vid bron.',
    },
    {
      name: 'Det sjunde spannet', type: 'static', center: P.landing, radius: 15, requiresFlags: ['SAGA_SKANS'],
      setsFlags: ['SLUT'], playback: once,
      audio: { clip: 'finale', variants: [{ lang: 'en', clip: 'finale_en' }] },
      facts: 'Avslutningen vid bron. Räkna spannen när du går hem.',
    },
  ];
}

// --- Acoustic zones (later zones win where they overlap) -------------------------------------
export function zones(hasMusic) {
  return [
    {
      name: 'Svinö', reverb: 'outdoor', wet: 0.2, ambience: hasMusic ? 'music' : 'forest', ambienceVolume: hasMusic ? 0.3 : 0.4,
      polygon: [
        [56.6836, 16.3712], [56.6842, 16.3735], [56.6848, 16.376], [56.6843, 16.379], [56.6833, 16.3805],
        [56.6834, 16.383], [56.683, 16.3852], [56.6815, 16.3852], [56.6805, 16.3825], [56.6797, 16.3805],
        [56.6785, 16.38], [56.6772, 16.379], [56.6764, 16.376], [56.676, 16.372], [56.6759, 16.37],
        [56.677, 16.3693], [56.6795, 16.3692], [56.6812, 16.3697], [56.6826, 16.3705],
      ],
    },
    {
      name: 'Svinöbron', reverb: 'outdoor', wet: 0.1, ambience: 'water', ambienceVolume: 0.5,
      polygon: [[56.68356, 16.3685], [56.68298, 16.3717], [56.68278, 16.3716], [56.68334, 16.3685]],
    },
    {
      name: 'Under Ölandsbron', reverb: 'tunnel', wet: 0.45, ambience: 'drone', ambienceVolume: 0.45,
      polygon: [[56.68221, 16.3795], [56.681545, 16.383], [56.681045, 16.383], [56.68171, 16.3795]],
    },
    {
      name: 'Skansen', reverb: 'outdoor', wet: 0.15, ambience: 'skans', ambienceVolume: 0.55,
      polygon: [[56.6837, 16.3818], [56.6837, 16.385], [56.6821, 16.3852], [56.6819, 16.3826], [56.6826, 16.3815]],
    },
  ];
}

export const COURSE = {
  name: 'Trettio spann — allhelgonanatt på Svinö',
  description:
    'En spökvandring på Svinö i Kalmar, ca 4 km och en dryg timme. I natt har Svinöbron trettioett ' +
    'spann, och på andra sidan sitter de döda och berättar. Följ Berätterskans käpp, lyssna på sagorna ' +
    'en efter en — varje saga är ett spann på vägen hem — och välj väg vid Kungabordet. Hörlurar på, ' +
    'och gå när det är mörkt. Start vid Svinöbron på Jutnabben. Fiktion inspirerad av öns historia.',
  showStartWayfinding: true,
  eyesUp: false,
};
