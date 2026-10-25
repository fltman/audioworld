# Kom igång

AudioWorld är ett verktyg för att bygga **ljudvandringar**. Du placerar ljud på en karta – berättelser, röster, musik och ljudeffekter – och besökaren går runt på riktigt med mobilen och hörlurar. Ljuden sitter kvar på sina platser i världen: besökaren hör *var* varje ljud finns och *hur långt bort* det är, i 3D.

Den här guiden tar dig från en tom runda till en publicerad länk med QR-kod. Räkna med en kvart för en enkel runda.

> [!NOTE]
> Vill du hellre se hur det går till? I [instruktionsfilmen](#help/film) bygger guiden Lova en runda och går igenom allt i admin på nio minuter. Och i [demorundan Kalmar i lurarna](#help/demorundan) kan du se hur varje möjlighet är inställd i en färdig runda.

> [!TIP]
> Du når hjälpen var du än är i admin. Klicka på **?** i rubriken på en panel så hamnar du direkt på rätt ställe här, eller på fliken **Help** i toppraden. Webbläsarens bakåtknapp tar dig tillbaka dit du var – ingenting du höll på med försvinner.

En runda heter *course* i admin, och en ljudpunkt heter *point*. I hjälpen säger vi **runda** och **punkt**.

## 1. Skapa en runda {#ny-runda}

1. Kontrollera att du står på fliken **Courses** i toppraden.
2. Klicka på **+ New** bredvid rullistan med rundor.
3. Skriv ett **Name**. Namnet syns för besökarna, så välj något som lockar, till exempel "Kalmar på fem minuter".
4. Skriv gärna en kort **Description (optional)**. Du kan ändra båda senare.
5. Klicka på **Create** (eller tryck [[Enter]] i namnfältet).

Rundan väljs direkt i rullistan, och den får automatiskt en kort webbadress som bygger på namnet. Se [Inställningar](#help/installningar/lyssna-och-dela) om du vill ändra adressen.

## 2. Hitta platsen på kartan {#hitta-platsen}

Kartan startar i Stockholm tills rundan har punkter. Skriv ett ortnamn eller en adress i sökrutan **Go to place…** uppe till vänster på kartan och klicka på **Go**, till exempel "Kalmar slott". Kartan hoppar dit. Zooma med scrollhjulet eller med **+** och **−** och dra kartan med musen.

## 3. Beskriv rundan {#beskriv}

Klicka på **⚙️ Settings** under **Tools** i vänsterspalten. Under **About this walk** fyller du i:

- **Name** och **Description** – det besökaren läser på rundans startsida.
- **Cover image** – en omslagsbild överst på startsidan. Liggande format blir bäst.
- **The idea** och **Background** – dina egna anteckningar om idén och faktaunderlaget. Besökarna ser dem aldrig, men AI-assistenten läser dem.

Klicka på **Save** när du är klar.

## 4. Rita rutten {#rita-rutten}

Rutten är vägen du vill att besökaren ska gå. Den ritas ut på besökarens karta och ger rundans längd och tid på startsidan.

1. Klicka på **〰 Route** under **Tools**.
2. Klicka på **Draw the route**.
3. Klicka på kartan längs vägen, hörn för hörn, från start till mål.
4. Dubbelklicka (eller klicka på **Finish**) när du är framme.

Rutten sparas direkt. Läs mer i [Planerad rutt](#help/rutt).

## 5. Placera en ljudpunkt {#placera}

1. Välj en punkttyp under **Place a point** i vänsterspalten. Börja med **Static** – ett ljud som står still på en plats.
2. Klicka på kartan där ljudet ska finnas. En cirkel visar hur långt bort ljudet hörs.
3. Punktredigeraren öppnas till höger. Ge punkten ett **Name**.
4. Justera **Audible radius (m)** – hur nära besökaren måste gå för att höra ljudet. 20–40 meter passar de flesta berättelser.
5. Klicka på **Save**.

De fem punkttyperna beskrivs i [De fem punkttyperna](#help/punkttyper).

## 6. Ge punkten en röst {#rosta}

Det enklaste sättet att få ljud i en punkt är att låta AI skriva och läsa in en berättelse:

1. Öppna punkten (klicka på den på kartan eller på **Edit** i punktlistan).
2. Skriv fakta om platsen i **Facts / notes — what this point is about**.
3. Fäll ut **✨ Narrate this point**, välj en röst eller en guide under **Voice / persona** och klicka på **✨ Write narration**.
4. Läs texten i **Narration (what's spoken)** och ändra det du vill.
5. Klicka på **🔊 Render audio**. Efter en stund finns ljudklippet i punkten.
6. Klicka på **Save**.

Har du redan en ljudfil? Fäll ut **Set the audio manually** och ladda upp den. Läs mer i [Berättarröst, ljudklipp och språk](#help/berattelse).

> [!NOTE]
> **🔊 Render audio** och andra knappar märkta "Uses ElevenLabs credits" kostar pengar. Ingenting dras förrän du själv klickar.

## 7. Skapa stämning med en zon {#zoner}

En akustisk zon ger ett område en egen klang och en bakgrundsloop, till exempel eko i en valvport eller fågelsång i en park.

1. Klicka på **🔊 Zones** under **Tools** och sedan på **+ Draw a zone**.
2. Klicka ut minst tre hörn på kartan och klicka på **Finish**.
3. Välj klang, mängd efterklang och en bakgrundsloop.
4. Klicka på **Save zone changes** – zoner sparas inte förrän du gör det.

Läs mer i [Akustiska zoner](#help/zoner).

## 8. Provlyssna {#provlyssna}

Sätt på hörlurar och klicka på **▶ Playtest** i toppraden. En virtuell lyssnare dyker upp på kartan. Klicka någonstans på kartan så går den dit i gångtakt, eller gå med tangenterna [[W]] [[A]] [[S]] [[D]] och piltangenterna. Du hör rundan precis som besökaren kommer att höra den. Klicka på **■ Stop** när du är klar. Läs mer i [Provlyssna](#help/provlyssna).

## 9. Publicera {#publicera}

Överst i vänsterspalten finns publiceringsraden. Den kontrollerar rundan hela tiden (*flight check*) och listar det som är fel.

- **Röda rader** stoppar publiceringen – klicka på raden så öppnas punkten som behöver rättas.
- **Gula rader** är varningar. Du kan publicera ändå.

Klicka på **Publish**. Först nu kan besökarna se rundan. När du ändrar något senare visar raden **Unpublished changes** – klicka på **Publish changes** för att skicka ut ändringarna. Läs mer i [Publicera och dela](#help/publicera).

## 10. Dela länk och QR-kod {#dela}

Klicka på **🔗 Share** i publiceringsraden. Där finns länken till rundan (**Copy**) och en QR-kod (**Download QR**) som du kan sätta på en skylt eller i en broschyr. Öppna länken på din egen mobil, sätt på hörlurarna och gå rundan en gång innan du delar den med andra.

## Nästa steg {#nasta-steg}

- [Så fungerar AudioWorld](#help/koncept) – vad besökaren upplever och vilka begrepp som styr ljudet.
- [Vandrande ljud och guidade stopp](#help/stopp) – en guide som går före besökaren och berättar vid stopp.
- [Styra berättelsen](#help/flaggor) – ljud som låses upp i tur och ordning och vägval.
- [AI-assistenten](#help/ai-assistent) – en chatt som känner rundan och kan bygga den åt dig.
- [Tips och goda vanor](#help/tips) – avstånd, ljudnivåer och test i fält.
