# Vanliga frågor och felsökning

## Vanliga frågor {#fragor}

### Jag har ändrat, men besökarna hör den gamla versionen. {#gammal-version}

Ändringar når besökarna först när du publicerar. Står det **Unpublished changes** i publiceringsraden: klicka på **Publish changes**. Se [Publicera och dela](#help/publicera).

### Knappen Publish är grå. {#publish-gra}

Antingen finns det inget nytt att publicera (det står **Published**), eller så har flight check hittat fel (röda rader). Klicka på en röd rad för att öppna punkten som behöver rättas. Se [Flight check](#help/publicera/flight-check).

### Jag hör ingenting när jag provlyssnar. {#hor-inget}

- Har punkterna ljud? En punkt utan klipp är tyst (och flight check säger till).
- Står lyssnaren inom den hörbara radien? Listan i provlyssningspanelen visar vad som hörs.
- Är punkten låst bakom en flagga (**Requires flags to activate**)? Gå till punkten som sätter flaggan först.
- Är **Mute** intryckt? Är datorns ljud på?
- Har du sparat punkten? Osparade ändringar hörs inte.

### Två berättelser hörs samtidigt. {#overlapp}

Radierna överlappar. Minska **Audible radius (m)** eller flytta isär punkterna. Se [Avstånd och radier](#help/tips/radier).

### Guiden går ifrån besökaren. {#guiden-gar}

Kryssa i **Wait for the listener** och sätt **Leash / resume radius (m)** ungefär lika stort som den hörbara radien. Sänk **Speed (m/s)** om den ändå går för fort. Se [Vänta på besökaren](#help/stopp/vanta).

### Min zon försvann. {#zon-borta}

Zoner sparas bara när du klickar på **Save zone changes**. Byter du runda eller laddar om sidan innan försvinner osparade zoner.

### Punkten hoppade iväg när jag klickade på kartan. {#punkten-hoppade}

Medan en Static-, Circling- eller Follow-punkt är öppen flyttar varje klick på kartan den dit. Klicka på **Cancel** (eller dra tillbaka den) om det var fel. Se [Klicka och dubbelklicka](#help/kartan/klick).

### Kan jag ändra typ på en punkt? {#byta-typ}

Nej. Skapa en ny punkt av rätt typ och ta bort den gamla. Har du en stig kan du [vika in](#help/stopp/vika-in) befintliga punkter i den.

### Kan jag flytta en runda till en annan AudioWorld? {#flytta}

Ja: **⭳ Export** under **⚙️ Settings** ger en fil med allt i, och **⭱ Import** på den andra sidan skapar en ny runda av den. Guiderna följer inte med. Se [Inställningar](#help/installningar/knappar).

### Hur får jag en engelsk version? {#engelska}

Lägg till språket under **Narration languages** på varje punkt. Se [Narration languages](#help/berattelse/sprak).

### Vad kostar pengar? {#kostnad}

Allt som skriver med AI (✨ Write, ✨ Enhance, ✨ Name, ✨ Interpret, AI-assistenten), läser in tal (🔊 Render audio, Speech), skapar ljudeffekter, designar röster eller gör bilder. Ingenting dras förrän du klickar. Att placera punkter, rita, provlyssna, publicera och använda Discover kostar ingenting.

### Varför ser jag inte alla rundor? {#ser-inte}

Med rollen **superuser** ser du bara dina egna rundor. En **admin** ser alla. Se [Roller](#help/oversikt/roller).

## Om något inte fungerar {#felsokning}

Några funktioner kräver att servern är inställd med nycklar till externa tjänster. Saknas en nyckel säger admin till. Visa meddelandet för din administratör:

| Meddelandet säger | Det som saknas | Be din administratör |
|---|---|---|
| "AI writing is off", "AI enhance is off", "AI naming is off", eller AI-assistenten svarar med ett fel | AI-tjänsten (OpenRouter) | sätta `OPENROUTER_API_KEY` på servern |
| "Set ELEVENLABS_API_KEY on the server…", "AI generation is off", eller inga röster i listorna | Röst- och ljudtjänsten (ElevenLabs) | sätta `ELEVENLABS_API_KEY` på servern |

Andra vanliga problem:

- **Röd banderoll överst** – något gick fel mot servern. Läs meddelandet, klicka på **Dismiss** och försök igen. Kvarstår det: kontrollera internetanslutningen, ladda om sidan, och kontakta din administratör.
- **"Only audio files are allowed"** – filen du laddade upp är inte en ljudfil. För bilder gäller "Only JPEG, PNG, WebP, GIF or HEIC images are allowed".
- **Uppladdningen misslyckas** – ljudfiler får vara högst 25 MB, bilder 15 MB och importfiler 60 MB. Komprimera till mp3 om filen är för stor.
- **Go to place hittar inget** – prova ett annat stavsätt eller lägg till staden: "Stortorget, Kalmar".
- **Besökarens kompass pekar fel** – uppmana besökaren att vifta telefonen i en åtta för att kalibrera den, och att tillåta rörelsesensorer när frågan kommer.
- **No access yet efter inloggning** – ditt konto har ingen roll ännu. Be en admin ge dig en under [Users](#help/anvandare).
