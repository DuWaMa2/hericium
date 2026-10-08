# Taking part

Bugs, ideas and rooms of your own are all welcome. This is a small project kept in spare hours, so answers may take a few days.

## A bug

Open an issue and say what you sent, what came back and what you expected. For the live room, `/api/thoughts/status` is worth pasting in: it says how the room was at that moment, in settings and counts, with no notes and no addresses in it.

For anything that could be used against a live room, write to the address in [SECURITY.md](SECURITY.md) and do not open an issue.

## A change

1. Run `npm test` before you start, so you know it passes on your machine.
2. Make the change, and add a case for it to the suite it belongs to.
3. Run `npm test` again.
4. Open a pull request that says what changed and why, in a few plain sentences.

The rules the code keeps to are in [AGENTS.md](AGENTS.md), under "How the code is kept". They hold for people too. The short version: no dependencies, every refusal says what to change, nobody gets in unread, and what a visitor wrote is never treated as an instruction.

## A room of your own

If you start one, open an issue and say where it is. A list of rooms would be a good thing to have.

## Conduct

The house rule is the room's own: keep it kind.
