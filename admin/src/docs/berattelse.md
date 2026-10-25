# Berättarröst, ljudklipp och språk

En punkt får sitt ljud på ett av två sätt:

1. **Med AI** – du skriver fakta, AI formulerar en berättelse i en guides stil, och en syntetisk röst läser in den. Allt inne i punktredigeraren.
2. **Manuellt** – du laddar upp en egen ljudfil eller klistrar in en länk till en.

## Facts / notes {#fakta}

**Facts / notes — what this point is about** (för Static, Circling och Follow) är punktens kunskapsbank: fakta om platsen, årtal, personer, anekdoter. Det är detta AI utgår från när den skriver berättelsen. Besökaren ser aldrig fältet.

Platser som lagts till via [Discover](#help/upptack) har redan fakta här. Står det en hänvisning som `(Wikipedia: sv:Kalmar slott)` i fältet visas knappen **↓ Wikipedia**, som hämtar sammanfattningen från Wikipedia och lägger den i fältet. Under hämtningen står det **↓ Fetching…**.

## ✨ Narrate this point {#beratta}

Den hopfällbara rutan **✨ Narrate this point** (med tillägget "— not voiced yet" om punkten saknar ljud) har två steg: *skriv* och *läs in*.

### Voice / persona {#rost}

Rullistan **Voice / persona** har två grupper:

- **Guides (persona)** – dina [guider](#help/guider), märkta 🎭. En guide har både en röst och en personlighet, så AI skriver i guidens stil och guidens röst läser.
- **Voices** – alla röster på ElevenLabs-kontot. Då skrivs texten neutralt.

Bara guider som har en röst visas.

### Steg 1: skriv {#skriv}

- **✨ Write narration** (eller **✨ Write in *namn*'s voice** när en guide är vald) – AI skriver om fakta till en talad berättelse. Knappen är grå tills det finns fakta. Under tiden står det **✨ Writing…**.
- **↻ Facts verbatim** – använder fakta ordagrant som manus, utan AI.

Texten hamnar i **Narration (what's spoken)**. Läs den, skriv om det du vill, eller skriv hela manuset själv. Rösten förstår *ljudtaggar* inom hakparentes, till exempel `[whispers]`, `[warmly]`, `[laughs]` eller `[pause]`, som styr hur repliken läses.

### Steg 2: läs in {#las-in}

**🔊 Render audio** gör om texten till tal med den valda rösten (modellen eleven_v4). Under tiden står det **🔊 Rendering…**, sedan **Rendered ✓**. Har punkten redan ett klipp heter knappen **🔊 Re-render audio**. Det nya klippet ersätter punktens ljud men behåller fakta och språkversioner. Klippet hamnar också i [ljudbiblioteket](#help/ljud).

Klicka sedan på **Save** längst ner i redigeraren.

> [!NOTE]
> Att skriva använder AI-tjänsten OpenRouter, att läsa in använder ElevenLabs ("Uses ElevenLabs credits."). Båda kostar lite pengar per gång, och bara när du klickar.

## Audio clip {#klipp}

När punkten har ett klipp visas spelaren **Audio clip**. Lyssna här innan du sparar.

## Set the audio manually {#manuellt}

Den hopfällda rutan **Set the audio manually** (för Path och Triggered heter samma val **Travelling audio** och är alltid utfälld):

- **URL** – klistra in en länk till en ljudfil, till exempel `https://…/ljud.mp3`.
- **Upload** – välj en ljudfil på datorn (mp3, wav, m4a, ogg med flera, högst 25 MB). Den laddas upp och läggs i ljudbiblioteket. Under tiden står det "Uploading…", sedan filnamnet.

Vill du använda ett klipp som redan finns i biblioteket: gå till fliken **Sounds**, klicka på **⧉ URL** på klippet och klistra in länken under **URL**.

## Narration languages {#sprak}

Den hopfällda rutan **Narration languages** (antalet språk står inom parentes) lägger till inspelningar på andra språk. Varje besökare hör den inspelning som matchar telefonens språk, och annars huvudklippet.

- **+ Add language** lägger till en rad.
- **Språkkod** (första fältet, t.ex. `en`, `de`, `fi`) – två bokstäver räcker. `en` matchar både brittisk och amerikansk engelska.
- **Länk** (andra fältet) – klistra in en länk, eller klicka på **⭱** och ladda upp en fil.
- **✕** tar bort raden.

Så gör du en engelsk version med AI: gå till fliken **Sounds**, välj **✨ Generate** → **Speech**, skriv den engelska texten, välj röst och klicka på **Generate**. Klicka sedan på **⧉ URL** på det nya klippet och klistra in länken på språkraden.

> [!TIP]
> Skriv huvudklippet på det språk de flesta besökare har. Lägg till engelska för turister.
