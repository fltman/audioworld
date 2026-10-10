#!/usr/bin/env python3
"""Design and save the bespoke voices for the Svinö Halloween course (ElevenLabs Voice Design).

Each role gets one designed voice (first preview is kept) saved to the account; the voice ids
land in audio/voices.json for the render step. Re-running skips roles already saved.

    ELEVENLABS_API_KEY=... python3 scripts/svino-halloween/design_voices.py
"""
import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "audio"
API = "https://api.elevenlabs.io/v1"

SV_SAMPLE = (
    "Det är allhelgonanatt, och då är gränsen tunn här ute. Framför dig ligger Svinö. "
    "Ingen bor där. Ändå lyser det i skogen ibland, och om du hör steg bakom dig, vänd dig inte om."
)
DA_SAMPLE = (
    "Hvem går der? Vi kom hertil i sekstenhundrede og elleve og gravede skansen ude på pynten. "
    "Jeg slår trommen, så de andre ved, at vi stadig er her. Kom med, konstablen venter ved kanonerne."
)

ROLES = {
    "marta": (
        "Svinö – Märta",
        "Swedish woman in her sixties, ghost of a 1950s islander who kept the ferry lantern on a small "
        "forest island. Low, warm, intimate voice with a soft crackle, slow and calm, kind yet quietly "
        "unsettling, as if whispering beside you in a dark forest. Native Swedish.",
        SV_SAMPLE,
    ),
    "kungen": (
        "Svinö – Karl XI",
        "Swedish king in his thirties from the 1680s, now a ghost presiding over a stone dinner table. "
        "Commanding, resonant baritone, aristocratic and curt, amused arrogance, slow deliberate speech "
        "as if every word were an order. Native Swedish.",
        "Vem där? Stå inte och glo, det här är kungens bord. Sätt er, eller gå. Men välj. "
        "En kung väntar inte på dem som tvekar, och den här middagen har pågått i trehundra år.",
    ),
    "konstapeln": (
        "Svinö – Dansk konstapel",
        "Danish soldier and gunner from 1611, ghost of a man guarding an earthwork fort by the sea. "
        "Hoarse, low, urgent voice, weary but defiant, short breaths between phrases. Speaks native "
        "Danish with a Copenhagen accent.",
        DA_SAMPLE,
    ),
    "beratterskan": (
        "Svinö – Berätterskan",
        "Very old Swedish woman, ghost of an 18th-century wandering storyteller who told tales by the fire "
        "for bread and a bed. Dry, rasping, crackling voice, theatrical and sly, savouring every word with a "
        "wicked smile, sliding between a hoarse whisper and a sharp, amused cadence. Native Swedish.",
        "Nämen. En till. Kom närmare, jag biter inte. Inte än. Ser du bron? Trettio spann, säger de som har "
        "räknat. Men i natt är det allhelgonanatt, och i natt är spannen trettioett.",
    ),
    # The teacher, the swineherd and the cupbearer use existing account voices (the account is at its
    # custom-voice limit) — see VOICES in course.mjs.
    "vakten": (
        "Svinö – Beredskapssoldaten",
        "Young Swedish conscript from 1940, ghost of a soldier on lonely night watch in a small concrete "
        "bunker. Tense, quiet, slightly trembling voice, clipped military phrases, trying hard to sound "
        "brave. Native Swedish.",
        "Halt! Vem där? Lösen! Ingen? Förlåt. Jag har stått här sedan nittonhundrafyrtio. Ingen har "
        "kommit och löst av mig, och radion säger fortfarande att det är lugnt i sundet.",
    ),
}


def call(path, body):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{path}: HTTP {e.code} {e.read().decode()[:400]}")


def main():
    OUT.mkdir(exist_ok=True)
    index_path = OUT / "voices.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    for role, (name, description, sample) in ROLES.items():
        if role in index:
            print(f"have {role}: {index[role]['voice_id']}")
            continue
        design = call(
            "/text-to-voice/design",
            {"voice_description": description, "text": sample, "model_id": "eleven_ttv_v3", "guidance_scale": 5},
        )
        previews = design["previews"]
        for i, p in enumerate(previews, 1):
            (OUT / f"voice_{role}_{i}.mp3").write_bytes(base64.b64decode(p["audio_base_64"]))
        pick = previews[0]
        saved = call(
            "/text-to-voice",
            {"voice_name": name, "voice_description": description, "generated_voice_id": pick["generated_voice_id"]},
        )
        index[role] = {"name": name, "voice_id": saved["voice_id"]}
        index_path.write_text(json.dumps(index, indent=1, ensure_ascii=False))
        print(f"saved {role}: {saved['voice_id']} ({len(previews)} previews)")


if __name__ == "__main__":
    main()
