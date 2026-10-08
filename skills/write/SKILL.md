---
name: write
description: Write or rewrite a Markdown document for human readers in Jonathan's style, from a topic or an existing draft.
argument-hint: "[topic, or path to a draft]"
disable-model-invocation: true
metadata:
  opencode/autoinvoke: "false"
---

# Write

Write a Markdown document the way Jonathan writes: **set the stage**, so the reader knows what the document is for and has everything the body depends on, then take them deeper one layer at a time. The input is a topic or a draft to rewrite. The reader is a person, so every rule below serves a person reading top to bottom.

## Steps

1. **Pin the reader.** Decide who reads this and what they already know about the subject. Infer it from the request, and ask the user when it is unclear. Done when you can say in one sentence who the reader is and what they lack. Every later choice follows from it: which background to include, how deep to go, which terms to define.
2. **Gather.** Find the facts yourself, from the conversation, the codebase, and the draft if there is one. Ask the user for the decisions only they can make: positions, tolerances, what is out of scope, questions still open. Done when every claim in the document has a source and every decision in it is the user's. When rewriting, carry over every fact and decision in the draft.
3. **Ask for the path** to write to, unless the request names one.
4. **Write** the file, following Shape and Voice below.
5. **Review.** Reread the whole file as the reader from step 1, checking it against every rule in Shape and Voice, and fix each failure. Done when a full pass finds nothing to fix.
6. **Report** the path, the reader you wrote for, and the sections in a line each. For a rewrite, also list anything you cut or moved, and why. The document's text stays in the file.

## Shape

Every document follows one arc. Only what fills it changes.

1. **Intent.** What this document is for, and what the reader will have once they finish it.
2. **Stage.** The context the body depends on. It can be a problem (what is wrong, who it hurts, how much, with a number when one exists), a situation, a question, or what the thing is and why it exists.
3. **Map.** The whole picture in brief, split into the parts or questions the body answers. Each gets a sentence or two and a link to its section, so a reader can stop here and still understand the whole.
4. **Depth.** One section per part of the map, in map order. Each opens with the background it needs, framed as the step the reader takes before the section makes sense. Background some readers already have goes in its own short subsection marked as skippable. Each section moves from concept to detail and links to related sections rather than repeating them.

A short document compresses the arc: a README can cover intent, stage, and map in two paragraphs. The stage always stays, however short.

### Explaining logic

Explain any logic that is not trivial (an algorithm, a rule, a data flow) abstractly first, in the domain's own terms, before any implementation.

- Start with the simplest case, then add edge cases one at a time.
- Give each case a small worked example: a table of inputs and results, or a Mermaid diagram for a flow.
- When the explanation leans on an idea the reader may lack, such as set intersection, say so up front and link to it.
- Implementation detail follows the abstract explanation, or moves to an appendix. Write models in code blocks and field mappings as `source` → `target`, and state the conventions above a dense block ("mappings are 1:1 unless noted").

### Proposals and decisions

When the document proposes something or records decisions, add the sections its content calls for:

- **Requirements**, split by priority.
- **Out of scope**, with a reason for each item that is not obvious.
- **Tenets**: the principles a solution is judged by.
- **Key decisions**, numbered, each with its reason or a link to the section that argues it.
- **Open questions** as headings phrased as questions, each with its answer and who gave it, or marked as still open.
- **Why X?** for each significant choice: what was chosen, why it fits (including consistency with what already exists), why each alternative lost, and what the choice tolerates.
- **Rollout and rollback** as numbered steps, when the change ships.

## Voice

- **Plain words**, like one person explaining to another. Use a term of art only when the reader needs it, and define it the first time. Use an acronym only for something named repeatedly, and spell it out the first time: "Billing Ledger Service (BLS)".
- **Teach.** Walk the reader through it the way you would at a whiteboard: set up a concrete case, then point at what matters in it. When you simplify, say so, and say what the simplification leaves out.
- **Fresh phrasing.** Quoted phrases in this skill show the register; say each thing in your own words, varied across the document.
- **Take positions, with reasons.** The system is the subject, and proposals are in future tense: "The importer will retry twice, because the upstream API drops about 1% of requests." Opinions are owned in first person: "In my opinion, this service should only orchestrate."
- **Name tolerances**: what the design accepts going wrong, and why that is acceptable.
- **Ground claims** in numbers, links to sources, and who said what.
- **One idea per sentence.** A sentence may chain cause and effect ("X, thus Y") when it follows one line of reasoning; split it where a second idea starts. Cut every word that carries no meaning.
- **Clean mechanics**: correct spelling, its and it's, subject-verb agreement, and one name per thing throughout.
