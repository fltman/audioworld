# Vandrande ljud och guidade stopp

Punkttyperna **Path** och **Triggered** är ljud som rör sig längs en stig. Med *stopp* längs stigen blir de en guide som går före besökaren, stannar vid sevärdheterna och berättar, och sedan går vidare.

## Rita en stig {#rita}

1. Välj **Path** eller **Triggered** under **Place a point**.
2. Klicka på kartan för varje hörn. Linjen är streckad medan du ritar, och raden överst i redigeraren visar antalet hörn: "3 points · click the map, or a point to fold it in".
3. **Undo** tar bort det senaste hörnet.
4. Avsluta med **Finish path** eller genom att dubbelklicka på kartan. Det krävs minst två hörn.

När stigen är klar står det "… points · drag to adjust". Dra hörnen på kartan för att justera, eller klicka på **+ Add points** för att fortsätta rita från slutet.

Tidsetiketter vid varje hörn (till exempel "2:15") visar när ljudet når dit, räknat från start, med farten och stoppens längd medräknade.

## Vika in befintliga punkter {#vika-in}

Har du redan placerat punkter längs vägen kan du göra om dem till stopp på stigen: klicka på en befintlig punkt medan du ritar. Då händer tre saker:

- punktens plats blir nästa hörn på stigen,
- punktens ljudklipp och fakta blir ett stopp vid det hörnet, och pausens längd sätts till klippets längd,
- punkten försvinner från kartan och listan.

Punkterna tas bort först när du sparar stigen. Klickar du på **Cancel** blir allt som det var. Det fungerar även med **+ Add points** på en befintlig stig.

## Travelling audio {#fardljud}

**Travelling audio** är ljudet som hörs medan punkten rör sig mellan stoppen – fotsteg, en käpp mot gruset, hästhovar. Välj **URL** eller **Upload** (se [Set the audio manually](#help/berattelse/manuellt)). Väljer du en guide med ett vilo-ljud fylls det i automatiskt.

## Guide for the whole path {#guide}

**Guide for the whole path** väljer en [guide](#help/guider) för hela stigen:

- Guidens **idle sound** blir stigens **Travelling audio**.
- Guidens röst och personlighet blir förval för berättelsen vid varje stopp (du kan byta per stopp).

Under listan står vilken röst guiden har och vilket färdljud som gäller. Har guiden inget vilo-ljud står det att du ska välja färdljud själv. Har guiden tagits bort står det "— (removed guide) —"; välj en annan eller **— None —**.

## Stopp {#stopp}

Listan **Stops · pause & narrate (arrival time shown)** har en rad per hörn på stigen: "#1 0:00", "#2 0:45" och så vidare, med tiden då ljudet når hörnet. Till höger står **✓ voiced · 30s** om stoppet har en berättelse (och hur länge guiden stannar), annars **not voiced**.

Varje hörn kan bli ett stopp där guiden stannar och berättar.

### ✨ Narrate this stop {#beratta-stopp}

Samma flöde som för en vanlig punkt (se [✨ Narrate this point](#help/berattelse/beratta)), men per stopp och med ett eget fält:

- **Facts (knowledge base)** – fakta just det här stoppet ska handla om.
- **Voice / persona** – förvald till stigens guide. Byt här om en annan figur ska berätta vid just det här stoppet.
- **✨ Write…**, **↻ Facts verbatim**, **Narration (what's spoken)** och **🔊 Render audio** fungerar som för en punkt.

När ljudet är inläst sätts pausens längd automatiskt till klippets längd, avrundat uppåt. Det första stoppet är utfällt från början.

### ⏱ Pause & manual clip {#paus}

Den hopfällda rutan **⏱ Pause & manual clip** per stopp:

- **Sekunder** (första fältet) – hur länge guiden stannar vid hörnet. 0 = ingen paus.
- **clip URL** – länk till ett eget klipp. Lämnar du fältet och pausen inte är satt, fylls pausen i med klippets längd.
- **↑** – ladda upp ett klipp. Pausen sätts till klippets längd.

Stopp utan paus, klipp och fakta tas bort när du sparar.

## Vänta på besökaren {#vanta}

En guide som går ifrån besökaren är ingen guide. Kryssa i **Wait for the listener (pause when out of leash range)**:

- Guiden stannar när besökaren är längre bort än **Leash / resume radius (m)** och fortsätter när besökaren kommit tillbaka inom det avståndet.
- Tiden blir alltid individuell (**Timing** försvinner), eftersom varje besökare har sin egen guide.

Sätt kopplet ungefär lika långt som den hörbara radien, så går guiden precis så länge besökaren hör den.

Kryssa också i **Show direction & distance to this sound**, så får besökaren en pil och ett avstånd till guiden om den tappar bort den.

## Slutet av stigen {#slut}

**End behavior** avgör vad som händer vid sista hörnet. För en guide är **Stop — then fall silent** oftast rätt: guiden stannar efter sista stoppet, tystnar och försvinner från besökarens radar och karta.

## Exempel: en guide genom stan {#exempel}

1. Rita en **Path** från startplatsen förbi tre sevärdheter.
2. Välj guiden under **Guide for the whole path**.
3. Vid hörnen för sevärdheterna: skriv fakta, **✨ Write…**, **🔊 Render audio**.
4. **Speed (m/s)**: 1,1 (lugn promenad). **Audible radius (m)**: 30.
5. Kryssa i **Wait for the listener** med kopplet 30 m, och **Show direction & distance to this sound**.
6. **End behavior**: **Stop — then fall silent**. Spara och [provlyssna](#help/provlyssna).
