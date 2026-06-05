"""
Fetch real Pokemon TCG move data from pokemontcg.io for the 151 set (sv3pt5)
for national dex numbers 1-151. Writes pokemon-151-moves.json.

- Uses the regular (non-ex) Basic/Stage card as the canonical entry.
- Picks two moves: lower-damage = basic, higher-damage = gated.
- For Pokemon with only one attack in the set, supplies a canonical Gen 1 move.
- Scales TCG damage and HP into the game's usable bands.
"""

import json
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

# Force stdout to UTF-8 so Nidoran gender symbols don't crash Windows charmap.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

API = "https://api.pokemontcg.io/v2/cards"
SET_ID = "sv3pt5"
# Resolve relative to this script (scripts/ -> ../data) so it works on any machine.
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "pokemon-151-moves.json"

# Game-balanced bands.
HP_MIN, HP_MAX = 40, 150
BASIC_MIN, BASIC_MAX = 15, 35      # first move
STRONG_MIN, STRONG_MAX = 30, 65    # second (gated) move
STRONG_MIN_DELTA = 10              # strong must beat basic by at least this much

# Map TCG energy/type strings to our lowercase game types.
TCG_TYPE_MAP = {
    "Grass": "grass",
    "Fire": "fire",
    "Water": "water",
    "Lightning": "electric",
    "Psychic": "psychic",
    "Fighting": "fighting",
    "Darkness": "dark",
    "Metal": "steel",
    "Fairy": "fairy",
    "Dragon": "dragon",
    "Colorless": "normal",
}

# Canonical Gen 1 fallback moves when a card only has one attack.
# (name, type, weak_power, strong_name, strong_type, strong_power)
GEN1_FALLBACK = {
    # dex: (extra_move_name, extra_type, extra_power)
    # only used when the API card has exactly one attack.
}

# Canonical second move for single-attack cards. Mirrors classic Gen 1 movepools.
SECOND_MOVE = {
    10: ("String Shot", "bug", 10),
    11: ("Harden", "bug", 10),
    13: ("String Shot", "bug", 10),
    14: ("Harden", "bug", 10),
    16: ("Gust", "flying", 15),
    19: ("Quick Attack", "normal", 20),
    21: ("Peck", "flying", 15),
    23: ("Wrap", "poison", 15),
    27: ("Sand Attack", "ground", 15),
    29: ("Scratch", "normal", 15),
    32: ("Horn Attack", "normal", 20),
    35: ("Pound", "normal", 15),
    37: ("Ember", "fire", 20),
    39: ("Sing", "normal", 10),
    41: ("Leech Life", "bug", 15),
    43: ("Absorb", "grass", 15),
    46: ("Spore", "grass", 10),
    48: ("Foresight", "bug", 15),
    50: ("Dig", "ground", 25),
    52: ("Scratch", "normal", 15),
    54: ("Water Gun", "water", 20),
    56: ("Scratch", "normal", 20),
    58: ("Bite", "dark", 20),
    60: ("Bubble", "water", 15),
    63: ("Confusion", "psychic", 20),
    66: ("Karate Chop", "fighting", 25),
    69: ("Vine Whip", "grass", 20),
    72: ("Acid", "poison", 20),
    74: ("Tackle", "normal", 20),
    77: ("Ember", "fire", 25),
    79: ("Water Gun", "water", 20),
    81: ("Tackle", "normal", 15),
    84: ("Peck", "flying", 15),
    86: ("Headbutt", "normal", 20),
    88: ("Pound", "normal", 20),
    90: ("Withdraw", "water", 10),
    92: ("Lick", "ghost", 20),
    96: ("Confusion", "psychic", 20),
    98: ("Vice Grip", "water", 20),
    100: ("Tackle", "electric", 20),
    102: ("Confusion", "psychic", 20),
    104: ("Bone Club", "ground", 25),
    109: ("Smog", "poison", 15),
    111: ("Horn Attack", "rock", 25),
    114: ("Bind", "grass", 20),
    116: ("Smokescreen", "water", 10),
    118: ("Horn Attack", "water", 20),
    120: ("Tackle", "water", 20),
    127: ("Vice Grip", "bug", 25),
    129: ("Tackle", "water", 10),
    132: ("Transform", "normal", 10),
    133: ("Tackle", "normal", 20),
    137: ("Conversion", "normal", 10),
    138: ("Withdraw", "rock", 10),
    140: ("Scratch", "rock", 20),
    147: ("Wrap", "dragon", 15),
    151: ("Pound", "psychic", 20),
}


def round5(n: int) -> int:
    return int(round(n / 5.0)) * 5


def clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def scale_damage(raw: int, basic: bool) -> int:
    """Map raw TCG damage onto our game band.

    Modern TCG damage scales 10 -> 330+. We compress so basic stays modest and
    strong tops out around 65. We preserve relative ordering between Pokemon
    in the same tier (a 200-damage attack stays stronger than a 90-damage one)
    while keeping the result playable.
    """
    if raw <= 0:
        raw = 10
    if basic:
        lo, hi = BASIC_MIN, BASIC_MAX
        # cards basic attacks are usually 10-40 raw, so a gentle squash works.
        if raw <= 10:
            scaled = 15
        elif raw <= 20:
            scaled = 20
        elif raw <= 30:
            scaled = 25
        elif raw <= 50:
            scaled = 30
        else:
            scaled = 35
    else:
        lo, hi = STRONG_MIN, STRONG_MAX
        # strong attacks span 20 -> 330. Compress logarithmically-ish.
        if raw <= 25:
            scaled = 30
        elif raw <= 40:
            scaled = 35
        elif raw <= 60:
            scaled = 45
        elif raw <= 90:
            scaled = 50
        elif raw <= 130:
            scaled = 55
        elif raw <= 180:
            scaled = 60
        else:
            scaled = 65
    return round5(clamp(scaled, lo, hi))


def scale_hp(raw: int) -> int:
    """Compress TCG HP (30 -> 340) into game range 40-150."""
    if raw <= 50:
        scaled = 50
    elif raw <= 70:
        scaled = 60
    elif raw <= 90:
        scaled = 75
    elif raw <= 110:
        scaled = 90
    elif raw <= 130:
        scaled = 100
    elif raw <= 160:
        scaled = 110
    elif raw <= 200:
        scaled = 125
    elif raw <= 260:
        scaled = 135
    else:
        scaled = 150
    return round5(clamp(scaled, HP_MIN, HP_MAX))


def to_game_type(tcg_type: str) -> str:
    return TCG_TYPE_MAP.get(tcg_type, tcg_type.lower())


def fetch_dex(dex: int):
    """Fetch all sv3pt5 cards for a given dex number."""
    q = f"set.id:{SET_ID} nationalPokedexNumbers:{dex}"
    url = f"{API}?q={urllib.parse.quote(q)}&pageSize=20"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    last_err = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8")).get("data", [])
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            time.sleep(1 + attempt * 2)
    raise RuntimeError(f"failed to fetch dex {dex}: {last_err}")


def pick_base_card(cards: list, dex: int) -> dict | None:
    """Prefer the non-ex, non-Master-Ball, lowest-numbered card."""
    if not cards:
        return None

    def card_score(c):
        subtypes = c.get("subtypes") or []
        is_ex = any("ex" in (s or "").lower() for s in subtypes)
        rarity = (c.get("rarity") or "").lower()
        # Master Ball / Poke Ball / Illustration Rare cards have inflated art treatments
        # but the attacks themselves are usually identical to the regular print.
        # Still, prefer common/uncommon regular cards.
        rare_penalty = 0
        if "master ball" in rarity:
            rare_penalty = 50
        elif "illustration" in rarity or "special" in rarity:
            rare_penalty = 20
        elif "rare" in rarity:
            rare_penalty = 5
        ex_penalty = 100 if is_ex else 0
        try:
            num = int(c.get("number", "9999"))
        except ValueError:
            num = 9999
        return ex_penalty + rare_penalty + num

    return sorted(cards, key=card_score)[0]


def fallback_move(primary_type: str, dex: int, raw_power: int = 25):
    """Return (name, type, raw_damage) for a canonical Gen 1 fallback move."""
    fb = SECOND_MOVE.get(dex)
    if fb:
        return fb[0], fb[1], fb[2]
    type_default = {
        "grass": ("Vine Whip", 30),
        "fire": ("Ember", 30),
        "water": ("Water Gun", 30),
        "electric": ("Thunder Shock", 30),
        "psychic": ("Confusion", 30),
        "ice": ("Ice Beam", 40),
        "fighting": ("Karate Chop", 30),
        "rock": ("Rock Throw", 30),
        "ground": ("Dig", 30),
        "normal": ("Tackle", 25),
        "bug": ("Leech Life", 25),
        "poison": ("Poison Sting", 25),
        "ghost": ("Lick", 25),
        "dragon": ("Dragon Rage", 40),
        "flying": ("Gust", 25),
        "dark": ("Bite", 25),
        "steel": ("Tackle", 25),
        "fairy": ("Pound", 25),
    }.get(primary_type, ("Tackle", 25))
    return type_default[0], primary_type, raw_power


def build_entry(dex: int, card: dict) -> dict:
    name = card["name"]
    # strip " ex" suffix from displayed name for cleaner game UI
    if name.lower().endswith(" ex"):
        name = name[:-3]

    raw_hp = int(card.get("hp", "60"))
    hp = scale_hp(raw_hp)
    types = card.get("types", [])
    primary_type = to_game_type(types[0]) if types else "normal"

    attacks = card.get("attacks", []) or []

    parsed = []
    for atk in attacks:
        dmg_raw = (atk.get("damage") or "").strip()
        num_str = "".join(ch for ch in dmg_raw if ch.isdigit())
        damage = int(num_str) if num_str else 0  # 0 = status-style move
        # type comes from the attack's cost (first non-Colorless) or the card's type.
        atk_type = primary_type
        for c in atk.get("cost", []):
            if c != "Colorless":
                atk_type = to_game_type(c)
                break
        parsed.append({
            "name": atk["name"],
            "type": atk_type,
            "_raw_damage": damage,
        })

    # Always ensure we have two moves.
    if not parsed:
        fb_name, fb_type, fb_raw = fallback_move(primary_type, dex, 15)
        parsed.append({"name": fb_name, "type": fb_type, "_raw_damage": fb_raw})

    if len(parsed) == 1:
        # Add a canonical Gen 1 fallback as the second move, ensuring it's stronger.
        existing_raw = parsed[0]["_raw_damage"]
        fb_name, fb_type, fb_raw = fallback_move(primary_type, dex, max(existing_raw + 15, 30))
        # If our card's only attack is itself huge (Raichu 180, Gyarados 200), the
        # fallback should be the BASIC move and the card attack the STRONG move.
        if existing_raw >= 60:
            parsed.insert(0, {"name": fb_name, "type": fb_type, "_raw_damage": min(fb_raw, 25)})
        else:
            parsed.append({"name": fb_name, "type": fb_type, "_raw_damage": max(fb_raw, existing_raw + 10)})

    # Sort ascending by raw damage so weaker is first.
    parsed.sort(key=lambda m: m["_raw_damage"])
    parsed = parsed[:2]

    # Scale into game bands.
    basic_power = scale_damage(parsed[0]["_raw_damage"], basic=True)
    strong_power = scale_damage(parsed[1]["_raw_damage"], basic=False)

    # Make sure strong > basic by STRONG_MIN_DELTA.
    if strong_power < basic_power + STRONG_MIN_DELTA:
        strong_power = round5(min(STRONG_MAX, basic_power + STRONG_MIN_DELTA))
    # If somehow basic ended up at the band ceiling and strong cannot climb, drop basic.
    if strong_power <= basic_power:
        basic_power = round5(max(BASIC_MIN, strong_power - 10))

    moves = [
        {"name": parsed[0]["name"], "power": basic_power, "type": parsed[0]["type"]},
        {"name": parsed[1]["name"], "power": strong_power, "type": parsed[1]["type"], "gated": True},
    ]

    return {"name": name, "hp": hp, "type": primary_type, "moves": moves}


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    result: dict = {}
    failures: list = []

    for dex in range(1, 152):
        try:
            cards = fetch_dex(dex)
            card = pick_base_card(cards, dex)
            if card is None:
                print(f"[{dex:>3}] no card found, skipping")
                failures.append(dex)
                continue
            entry = build_entry(dex, card)
            result[str(dex)] = entry
            chosen_num = card.get("number")
            print(f"[{dex:>3}] {entry['name']:<14} hp={entry['hp']:<4} "
                  f"moves={[(m['name'], m['power'], m['type']) for m in entry['moves']]} "
                  f"(card sv3pt5-{chosen_num})")
        except Exception as e:
            print(f"[{dex:>3}] ERROR: {e}")
            failures.append(dex)
        time.sleep(0.25)  # be polite to the API

    OUT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {len(result)} entries to {OUT_PATH}")
    if failures:
        print(f"Failures: {failures}")


if __name__ == "__main__":
    main()
