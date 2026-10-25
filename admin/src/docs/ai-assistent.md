# AI-assistenten

**✨ AI assistant** under **Tools** öppnar en chatt i en bred panel till höger. Assistenten känner den öppna rundan – idén, bakgrunden, rutten, zonerna, punkterna och guiderna – och kan bygga den tillsammans med dig.

## Vad den kan {#kan}

- **Svara och föreslå** – idéer, var punkter ska ligga längs rutten, manus, berättelser i en guides stil, beskrivningar till startsidan.
- **Skapa och ändra punkter** – med typ, plats, radie, stopp och flaggor. Ljudet kan lämnas tomt för dig att läsa in senare.
- **Ändra rundans texter** – namn, beskrivning, idé och bakgrund.
- **Skapa och ändra guider**.
- **Designa en ny röst** – ElevenLabs gör tre förslag att lyssna på (se [Röstförslag](#help/ai-assistent/roster)).
- **Läsa in repliker** med en guides eller en vald röst, och **generera ljudeffekter**. Klippen hamnar i [ljudbiblioteket](#help/ljud) och kan spelas direkt i chatten.
- **Göra en omslagsbild** i liggande 16:9-format till startsidan.
- **Föreslå prompter** för ljudeffekter och för bakgrundsmusik i Suno (en stilbeskrivning på engelska, ungefär 300 tecken).
- **Visa saker på kartan** när den förklarar (se nedan).
- **Söka i ljudbiblioteket**.

## Vad den inte kan {#kan-inte}

- **Ta bort** något. Borttagning gör du själv i redigeraren.
- **Rita rutten eller zoner** – det gör du med **〰 Route** och **🔊 Zones**.
- **Publicera** – det gör du själv i publiceringsraden.

Röster, inläsningar, ljudeffekter och bilder kostar pengar. Assistenten gör dem bara när du ber om det.

## Skriva till assistenten {#chatta}

- Skriv i rutan längst ner ("Ask about the walk, or tell me what to build…") och tryck [[Enter]] eller klicka på **Send**. [[Shift]] + [[Enter]] ger en ny rad.
- Medan assistenten arbetar visas tre prickar, och **Send** byts mot **Stop**, som avbryter svaret.
- Går något fel visas felet i chatten, och **Try again** kör om din senaste fråga.
- En tom chatt visar förslag att börja med, till exempel "Suggest points along the planned route" och "Write a start-page description for the walk". Klicka på ett för att skicka det.

Innan varje svar får assistenten veta vad du ändrat i editorn sedan förra svaret (punkter, texter, rutt, zoner, guider), så den jobbar alltid med det aktuella läget.

Du kan öppna en punkt eller ett annat verktyg medan assistenten arbetar – svaret blir klart i bakgrunden. Stänger du däremot panelen helt (så att högerpanelen försvinner) avbryts svaret.

## Talk as {#talk-as}

Rullistan **Talk as** bredvid skrivrutan låter hela chatten tala som en av dina [guider](#help/guider). Välj **Assistant** för att gå tillbaka till den vanliga assistenten. Bra för att prova en guides röst och personlighet, eller låta guiden själv skriva sina repliker.

## Sparade chattar {#chattar}

Chattarna sparas per runda och per person.

- **Rullistan** överst visar dina chattar om rundan med titel och datum. Välj en för att fortsätta den. Den senaste öppnas automatiskt.
- **New** – börjar en ny chatt (den sparas när du skickat första meddelandet).
- **Delete** – byter mot **Yes, delete** och **Cancel**. Tar bort den öppna chatten.

## Det som händer i chatten {#handelser}

När assistenten gör något visas en rad för varje åtgärd:

- **✓** och en sammanfattning – åtgärden lyckades (till exempel att en punkt skapades). Kartan och listorna uppdateras direkt.
- **⚠** – åtgärden misslyckades. Assistenten berättar oftast varför.
- **📍** – assistenten visade något på kartan. **Show again** visar det igen.
- **Ljudspelare** – för en inläst replik eller en ljudeffekt.
- **Bild** – en omslagsbild, med **Use as cover** som gör den till rundans omslag (står det **✓ The walk's cover** är den redan omslaget) och **Download** som öppnar bilden i full storlek.

### Röstförslag {#roster}

När assistenten designar en röst visas en ruta med **Voice name** och tre förslag med var sin spelare. Lyssna och klicka på **Use** vid det du vill ha. Rösten sparas på ElevenLabs-kontot (och ges till guiden om du bett om det), och det står **✓ Chosen**. Assistenten får veta vilket du valde och fortsätter därifrån.

## Kartan {#kartan}

När assistenten förklarar något rumsligt visar den det på kartan med limegröna, numrerade markeringar: platser, befintliga punkter, föreslagna linjer och områden. Kartan zoomar så att allt syns, och siffrorna motsvarar dem i svaret.

- Remsan **✨ Shown by the assistant (n)** överst på kartan har knappen **Clear**, som tar bort markeringarna.
- Koordinater i svaren (till exempel 📍 56.6634, 16.3567) är klickbara och visar platsen på kartan.

## Bra frågor att börja med {#exempel}

- "Föreslå sex punkter längs rutten och visa dem på kartan."
- "Skapa en guide som är en 1600-talssoldat, och designa en röst åt honom."
- "Skriv ett manus för punkten vid slottsporten i guidens stil, max en minut."
- "Gör en omslagsbild: Kalmar slott i kvällsljus, akvarell."
- "Vilka punkter saknar ljud?"

> [!NOTE]
> Assistenten kräver att servern har en AI-nyckel. Saknas den visas ett felmeddelande – se [Om något inte fungerar](#help/faq/felsokning).
