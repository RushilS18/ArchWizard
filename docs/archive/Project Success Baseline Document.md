# Project Success Baseline
### Standard operating rules for AI-assisted builds

**Version 1.0 · Derived from ArchWiz, June 2026 · Living document — revise after every project**

---

This is not a retrospective. The ArchWiz retrospective recorded what happened on one project. This converts those findings into a standard the *next* project is run against and measured by.

Use it three ways:

1. **At kickoff** — run the gates in §4 before building anything.
2. **During the build** — paste the operating rules in §2 atop every AI-agent session, and watch for the failure signs in §3.
3. **At close** — score the result against the definition of done in §6 and the success criteria in §7.

Every project that follows should add or sharpen at least one rule here. A baseline that never changes is a baseline that stopped learning.

---

## 1. The two principles everything else serves

Two ideas generated nearly every rule below. Hold these and most of the rest follows on its own.

**Source over surface.** Never act on a *picture* of the system — a screenshot, a symptom, a remembered assumption about how a feature works. Make the system report its own truth before you change it. On ArchWiz, almost every wasted hour traced to acting on the rendered surface instead of the source: what looked like six divider lines on screen was about thirty border rules in code, and every fix-by-guess failed until a read-only audit made the code say which selector drew which line. The bottleneck is rarely the task. It is working blind.

**Correctness by construction.** Confine the unreliable component to the one job it is good at and tolerant of error in, and make everything a user could be misled by deterministic and checkable. On ArchWiz the LLM interpreted language and never produced a dimension; deterministic code generated every geometry, so the same sentence always returned the same building. That boundary was the whole engineering idea. Generalize it: isolate the fuzzy part, make the must-be-correct part verifiable, and make the boundary visible to whoever is relying on it.

---

## 2. Operating rules — paste atop every AI-agent session

Copy this block as a standing preamble. Each rule is drawn from a specific failure; the cost of pasting it is seconds, and the cost of not pasting it is documented below.

```
READ FIRST. Before writing any code, read every file you will modify and the
files directly upstream and downstream of it. Report the actual structure you
found before proposing changes.

VALIDATE BEFORE BUILDING. Confirm the thing I'm asking for is actually wanted,
needed, and feasible before constructing it. If the data a feature needs lives
in a different stage or engine and isn't reachable at the layer that will
display it, stop and report instead of building.

ACCEPTANCE TEST FIRST. State the acceptance test as a specific input and the
exact on-screen result expected, before building. Passing unit tests are not
the acceptance criterion; the visible result is.

AUDIT BEFORE TARGETING. If the task means removing or changing specific
elements in code I cannot see, first produce a read-only audit mapping each
visible element to its exact file, selector, and line. Make no edits in this
step.

NAME WHAT TO PROTECT. When removing or changing a category of thing, list
explicitly what must be left untouched. Treat the protected list as part of
the specification.

SPLIT BY BLAST RADIUS. If a change touches more than two distinct concerns or
layers, stop and propose a staged split — each step independently verifiable
and committable — rather than one prompt.

STOP ON MISMATCH. If your explanation and what I'm seeing don't line up, treat
that as a hard stop. Resolve the mismatch before writing or committing
anything. A gap between explanation and reality is never cosmetic.

ONE RECOMMENDATION. Give me a single committed recommendation with its
reasoning, not a menu of options, unless I ask to see alternatives.

COMMIT HYGIENE. End every commit block with the push command. Verify only with
test and build commands; never start a dev server inside the agent.
```

**What each one prevents:**

| Rule | Prevents |
|---|---|
| Read first | Prompting against an imagined architecture — the single largest source of wasted effort on ArchWiz. |
| Validate before building | Spending hours on a feature the pipeline can never support (the "we scaled your request" detector that no clean data existed to drive). |
| Acceptance test first | Green unit tests coexisting with a wrong-looking render. The visible result is the real target. |
| Audit before targeting | The method that turned the impossible divider task trivial in one pass — deployed fifth instead of first. It is the cheap step, not the last resort. |
| Name what to protect | "Remove all borders" taking a needed panel with it. Protection must be stated. |
| Split by blast radius | A five-in-one CSS prompt that was unverifiable and broke the page. |
| Stop on mismatch | Wrong assumptions becoming committed code. This was the single most valuable behavior in the whole collaboration. |
| One recommendation | Decision drag, and an assistant that hedges instead of taking a position. |
| Commit hygiene | An unrecoverable spiral. Every push is an isolated rollback point. |

---

## 3. Failure modes — catch them while they're happening

The corrections in §2 only fire if you notice the pattern in the moment. This is the early-warning table. If a present-tense sign in the middle column is true *right now*, you are in the failure on its left.

| Failure mode | You're doing it right now if… | Correction |
|---|---|---|
| **Diagnosing from the surface** | You're describing the problem by where it appears on screen ("the line above Language") rather than by what produces it in code. | A screenshot tells you *something* is wrong, never *why*. Confirm the cause in source before prescribing a fix. |
| **Prompting before reading** | You're proposing an edit to a file you haven't opened this session. | Read it, plus its immediate upstream and downstream, first. |
| **Remove-all without a protect-list** | Your instruction names what to delete but nothing to keep. | Enumerate what must survive. The protected list is part of the spec. |
| **One prompt doing too much** | A single change spans more than two concerns or files and you can't name one acceptance test that covers it. | Split it. Each piece individually verifiable, individually reversible. |
| **Saving the reliable method for last** | You're writing a more detailed prompt to compensate for working blind. | Stop compensating. The fix is to stop working blind — audit now. |
| **Chasing data that isn't there** | The feature keeps "almost" working and the missing piece is always a value the pipeline doesn't actually keep. | Confirm the data exists and is reachable at the display layer before building. Prefer an honest standing fallback over a fragile detector. |

---

## 4. Phase gates

A gate is a short checklist that must pass before a phase begins. Failing a gate is information, not failure — it means you found the problem before it cost you.

**Kickoff gate — before building anything**
- [ ] The actual current structure has been read and reported, not assumed.
- [ ] The data each planned feature needs is confirmed to exist and be reachable at the layer that will use it.
- [ ] Scope is stated as in / out. What you are deliberately *not* doing at this stage is written down.
- [ ] The fuzzy component and the must-be-correct component are named, and the boundary between them is explicit.

**Build gate — per change**
- [ ] An acceptance test is stated as input → exact expected result, before code moves.
- [ ] If targeting elements in code you can't see, a read-only audit (file, selector, line) exists.
- [ ] What must be protected is listed.
- [ ] The change touches ≤ 2 concerns, or has been split.
- [ ] The step is independently reversible and ends in a push.

**Pre-launch gate — before real users or real traffic**
- [ ] No secrets in the client bundle; all model/API calls route through a server-side proxy. Verified by test.
- [ ] Input is bounded server-side (size cap and prompt limit) with localized, status-aware failures.
- [ ] Rate limiting backed by a durable store is in place before the public URL takes real traffic or auto-reload billing is on.
- [ ] Spend controls: dedicated workspace, hard cap, auto-reload off until launch.
- [ ] Every output that could mislead carries an accuracy disclaimer, and any accuracy claim has been reviewed by someone qualified.
- [ ] Terms of Service and Privacy Policy exist, including a plain statement that input is sent to a third-party model API.
- [ ] All user-facing strings in any non-primary language are reviewed by a native speaker before that language is promoted out of "provisional."

---

## 5. Working with an AI collaborator

Set the division of labor deliberately. The assistant is reliably strong at some things and reliably costly at others, and naming both keeps you from being surprised by either.

**Lean on it for:** holding scope discipline and resisting gold-plating; building the reversibility scaffolding (backup branches, restore points, stop-and-verify checkpoints) so no spiral is ever destructive; making the honest call over the fragile clever one; turning an insight into something visible and shippable (diagrams, explainers); and running a read-only audit on demand.

**Expect it to cost you time on:** writing prompts before reading the code; diagnosing confidently from a screenshot and being wrong; being slow to discover structural splits (two engines where it assumed one); and, under pressure, writing ever-more-detailed prompts to compensate for working blind instead of just stopping to look.

**The one non-negotiable discipline is yours to hold: stop on mismatch.** Every time the explanation didn't match what was on screen and that was treated as a hard stop, it caught a wrong assumption before it became committed code. No single technical decision did more to keep the project on the rails. The assistant will not reliably enforce this for you. You enforce it.

---

## 6. Definition of done

"Done" is not "it runs." Done is being able to state, per area, exactly what shipped and what was deliberately deferred. Close every project with a table in this shape:

| Area | Outcome |
|---|---|
| Core engine / logic | What is actually working, stated concretely. |
| Inputs / pipeline | How input is handled, validated, bounded. |
| Hardening | Caps, limits, error handling, secret handling. |
| Presentation | What the user sees and how the core idea is made visible. |
| Localization / accessibility | What's complete vs. provisional. |
| Tests | Which acceptance criteria are green, and how each was verified. |

Then list the deferrals explicitly, each as a decision rather than a gap: *"Rate limiting deferred — correct for prototype stage, required before public traffic."* A deferral you can name and justify is a finished decision. A deferral you discover later is a bug.

---

## 7. Success criteria — was the project run well?

The shipped thing can be uneven and the project still a success, because the durable deliverable is the method, not the artifact. Score the run against these. All-yes means the method held, regardless of how messy the outcome looked along the way.

- [ ] No edit was made to code or structure that wasn't first read.
- [ ] Every change had a stated acceptance test before it was built.
- [ ] The fuzzy component was isolated from the must-be-correct component, and the boundary was visible.
- [ ] Failures were caught by explanation-reality mismatches *before* commit, not discovered after.
- [ ] Every step was independently reversible; no spiral was ever destructive.
- [ ] Every deferral was an explicit, justified decision.
- [ ] When a feature couldn't be supported by the data, the honest fallback was chosen over a fragile workaround.

The test the whole document comes down to: **did you read before you changed, verify what you saw, target the source instead of the surface, and keep every step reversible?** If yes, the project was run well — and the next one starts from a sharper version of this page.
