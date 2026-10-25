# Guides – berättarfigurer

En **guide** är en återanvändbar figur: en personlighet, en röst och ett ljud den gör när den rör sig. Använd guider för att ge rundan en eller flera återkommande berättare – en vaktsoldat, en drottning, en fiskare.

En guide används på tre sätt:

- I **✨ Narrate** på en punkt eller ett stopp – AI skriver i guidens stil och guidens röst läser (se [Berättarröst](#help/berattelse/rost)).
- Som **Guide for the whole path** på en stig – guidens vilo-ljud blir stigens färdljud och dess röst berättar vid stoppen (se [Guide](#help/stopp/guide)).
- I AI-assistentens **Talk as** – hela chatten talar som guiden (se [Talk as](#help/ai-assistent/talk-as)).

Fliken **Guides** visar dina guider, med antalet i rubriken. Du ser dina egna guider; en admin ser allas.

## Skapa och ändra {#skapa}

Klicka på **+ New guide** (eller **Edit** på en befintlig). Formuläret har:

- **Name** – till exempel "Vaktsoldaten Nils". Krävs.
- **Persona (your reference when writing its lines)** – vem guiden är och hur den pratar: ålder, bakgrund, tonfall, ordval, vad den kan om platsen. AI använder texten när den skriver guidens repliker.
- **✨ Enhance** – skriv några ord (eller bara ett namn) och låt AI utveckla en levande persona. Under tiden står det **✨ Enhancing…**.
- **Narration voice** – guidens röst bland rösterna på ElevenLabs-kontot. **— None —** = ingen röst (guiden kan då inte läsa in något).
- **Idle sound (travelling audio between stops)** – ljudet guiden gör medan den rör sig mellan stoppen på en stig: fotsteg, en käpp, hästhovar. Välj ett klipp ur [ljudbiblioteket](#help/ljud) (🔊 = effekt, 🎙 = röst, med storlek). En spelare visas när ett ljud är valt.

Klicka på **Save guide**, eller **Cancel** för att avbryta.

> [!TIP]
> Vill du ha en helt ny röst som passar figuren? Be [AI-assistenten](#help/ai-assistent/roster) designa en – du får tre förslag att välja mellan, och den valda kan ges direkt till guiden.

## Guidekortet {#kort}

Varje guide visas som ett kort med 🎭, namnet och personan, och två märken: **🎙 rösten** (eller **No voice**) och **🔊 Idle sound** (eller **🔇 No idle sound**).

- **Edit** – öppnar formuläret.
- **Duplicate** – gör en kopia med "(copy)" efter namnet. Bra för att göra en variant av en figur.
- **Delete** – byter mot **Yes, delete** och **Cancel**. Stigar som använde guiden visar "— (removed guide) —" tills du väljer en annan. Redan inlästa berättelser påverkas inte.
