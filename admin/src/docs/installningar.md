# Inställningar

**⚙️ Settings** under **Tools** har två delar: **About this walk** (vad rundan är) och **Listening & sharing** (hur den nås och delas), plus export, import och borttagning.

## About this walk {#om-rundan}

| Fält | Betyder |
|---|---|
| **Name** | Rundans namn. Visas för besökaren. Krävs. |
| **Description** | Texten besökaren läser på rundans startsida. Berätta vad rundan handlar om, hur lång den är, var den börjar och om den passar barn. |
| **Cover image** | Bilden överst på startsidan. **Upload…** väljer en bild (JPEG, PNG, WebP eller GIF), **Replace…** byter den, **Remove** tar bort den. Liggande format blir bäst. Utan bild står det "No cover image". |
| **The idea** | Dina anteckningar om premissen, stämningen, berättelsens båge och vem rundan är för. |
| **Background** | Historia, fakta, personer och källor rundan bygger på. |

**The idea** och **Background** syns aldrig för besökarna, men [AI-assistenten](#help/ai-assistent) läser dem – ju mer du skriver, desto bättre förslag.

Klicka på **Save** (blir aktiv när något ändrats). Det står **Saved ✓** efteråt. Namn, beskrivning och omslag når besökarna när du [publicerar](#help/publicera).

> [!TIP]
> AI-assistenten kan göra en omslagsbild åt dig – be om en, och klicka på **Use as cover** i chatten.

## Listening & sharing {#lyssna-och-dela}

### Short address {#kort-adress}

Den korta adressen är sista delen av länken till rundan, till exempel `…/kalmar-pa-fem-minuter`. Den skapas automatiskt av namnet när rundan skapas.

- Ändra i fältet och klicka på **Save**. Mellanslag blir bindestreck.
- Tillåtet: små bokstäver a–z, siffror och enkla bindestreck, 2–40 tecken. Några ord är reserverade (till exempel `admin`, `api` och `scout`), och två rundor kan inte ha samma adress.

> [!WARNING]
> Ändrar du adressen slutar gamla länkar och QR-koder att fungera. Bestäm adressen innan du trycker något.

### Kryssrutor {#kryssrutor}

Kryssrutorna sparas direkt när du klickar.

- **Show listeners the direction to the start point** – besökarens radar visar en pil och ett avstånd till startpunkten. Bra när startplatsen är svår att hitta.
- **Eyes-up mode (hide the screen, navigate by sonar ping)** – besökaren ser varken radar eller karta utan följer ett ekolodspip mot nästa ljud. Se [Eyes-up](#help/koncept/eyes-up).

### Knapparna {#knappar}

- **🔗 Share link & QR** – fäller ut länken och QR-koden (**Copy**, **Download QR**, **Close**), samma som **🔗 Share** i publiceringsraden. Se [Dela](#help/publicera/dela). Knappen heter **Hide share** när panelen är utfälld.
- **⭳ Export** – laddar ner rundan som en fil (`.audioworld`) med allt i: texter, omslag, rutt, zoner, punkter och alla ljudklipp. Använd den som säkerhetskopia eller för att flytta rundan till en annan AudioWorld. Guiderna följer inte med.
- **⭱ Import** – väljer en `.audioworld`-fil (högst 60 MB) och skapar en **ny** runda av den, som du äger. Den runda du har öppen påverkas inte.

## Delete course {#ta-bort}

**Delete course** längst ner frågar "Delete this course and its points?" med **Delete** och **Cancel**. **Delete** tar bort rundan och alla dess punkter för gott. Exportera först om du vill kunna ångra dig.
