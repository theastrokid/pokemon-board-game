# Pokemon Board Game

Local digital companion to the physical card-based Pokemon board game.

## Run

```
cd pokemon-board-game
node server.js
```

Opens at http://localhost:5995

## Areas

- Pallet Town (catch rates 1-4 / 1-5 / 1-6 for Poke / Great / Ultra)
- Seafoam Islands (catch rates 1-3 / 1-4 / 1-5)
- Safari Zone (catch rates 1-2 / 1-3 / 1-4)
- Ancient Temple (catch rates 1-1 / 1-2 / 1-3)

## Gym Leaders

- Brock: Onix, Geodude, Zubat
- Misty: Psyduck, Starmie, Krabby
- Blaine: Raichu, Machamp, Nidoking
- Giovanni: Mewtwo, Persian, Dragonite (final boss)

## Game flow

1. Setup: pick number of trainers, names, starters.
2. Each turn: tap "Roll movement" or use 1-6 dice override for the physical roll.
3. Player token snake-moves along the board.
4. Landing tile triggers an action: encounter, item, pokeball, trade, gym, pokecentre, fainted, masterball, battle, branch.
5. Catch: pick a ball, then tap the dice number you rolled (1-6).
6. Battle: pick a move. Strong moves (gated) require a 1-4 roll.
7. Beat Giovanni to enter the Hall of Fame.

## Pokemon data

The Pokemon HP and moves are placeholders that approximate game balance. Once
physical card photos are processed, swap `data/pokemon.json` for the real card
values. Each Pokemon needs HP and 2 moves (one always-usable, one gated by a
1-4 dice roll).

## Sprites

Front and back animated sprites pull from PokeAPI's GitHub:
`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/{id}.gif`

If offline, the static sprite fallback at `sprites/pokemon/{id}.png` is used.

## Sounds

Music tracks live in `sounds/` keyed by area:
- pallet.mp3
- seafoam.mp3
- safari.mp3
- temple.mp3

Drop your own mp3s in there to enable per-area music. SFX (encounter, catch,
hit, faint, victory) are synthesized in-browser via WebAudio.
