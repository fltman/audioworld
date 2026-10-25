# Sounds – ljudbiblioteket

Fliken **Sounds** samlar alla ljudklipp som laddats upp eller genererats – i punkter, stopp, zoner, guider och av AI-assistenten. Biblioteket är gemensamt för alla som bygger rundor. Rubriken visar antalet klipp: "Sound library (n)".

## ✨ Generate {#generera}

Överst kan du skapa nya klipp med ElevenLabs. Välj läge med knapparna till höger:

### Sound effect {#ljudeffekt}

- Beskriv ljudet i textrutan, gärna på engelska: "distant church bells over wind", "seagulls over a harbour, waves against stone".
- **Length (s, optional)** – längden i sekunder, 0,5–22. Lämna tomt (**auto**) så väljer tjänsten.
- Klicka på **Generate**.

### Speech {#tal}

- Skriv vad rösten ska säga. Ljudtaggar inom hakparentes styr framförandet, till exempel `[whispers]`, `[excited]` eller `[laughs]`.
- Välj röst i rullistan. Modellen är eleven_v4.
- Klicka på **Generate**.

Under tiden står det **Generating…**, sedan **Added ✓**, och klippet läggs först i biblioteket. Varje generering kostar ("Uses ElevenLabs credits."). Saknas tjänsten står det att AI-generering är avstängd.

## Hitta klipp {#hitta}

- **Search clips…** – sök på klippets namn.
- **All**, **🔊 SFX (n)** och **🎙 Voice (n)** – visa alla, bara ljudeffekter eller bara röster.

## Ljudkortet {#kort}

Varje klipp visas som ett kort:

| Del | Gör |
|---|---|
| **Etiketten** överst till vänster | **SFX** (ljudeffekt), **Voice** (röst) eller **Clip** (övrigt). |
| **✨ Name** | AI lyssnar på klippet, ger det ett beskrivande namn och avgör om det är en effekt eller en röst. Under tiden står det **✨ Naming…**. |
| **⧉ URL** | Kopierar klippets länk, så att du kan klistra in den i en punkt, ett stopp eller en språkversion. Det står **Copied ✓**. |
| **🗑** | Tar bort klippet (se nedan). |
| **Namnet** | Klicka och skriv för att döpa om. [[Enter]] sparar, [[Shift]] + [[Enter]] ger ny rad. Det står **saved ✓** när det sparats. |
| **Spelaren** | Lyssna på klippet. |
| **Storlek** | Filens storlek i KB. |
| **Used n×** / **Unused** | Hur många punkter och zonbakgrunder som använder klippet. |

## Ta bort och ersätta {#ta-bort}

**🗑** öppnar en bekräftelse på kortet:

- Är klippet oanvänt står det "Delete this clip permanently?". Klicka på **Delete**.
- Används klippet står det hur många gånger, och att de punkterna blir tysta om du tar bort det. Kryssa då gärna i **Replace it in those points with another clip**, välj ett ersättningsklipp i rullistan och klicka på **Replace & delete** – då byts klippet ut överallt innan det tas bort.

**Cancel** avbryter. Borttagna klipp går inte att få tillbaka, och publicerade rundor som använder dem blir tysta där.
