# openspec — SDD Artifact Store

This directory is the **file-based artifact store** for Spec-Driven Development (SDD) on ClaraPOS.

## Structure

```
openspec/
├── sdd-init.md          # Project context — stack, conventions, rules, modules
├── README.md            # This file
└── changes/             # One subfolder per SDD change
    └── <change-name>/
        ├── proposal.md
        ├── spec.md
        ├── design.md
        ├── tasks.md
        ├── apply-progress.md
        ├── verify-report.md
        └── archive-report.md
```

## How It Works

Before starting any SDD command, Claude reads `openspec/sdd-init.md` for project context.

Each change gets its own subfolder under `openspec/changes/`. The folder name is the **change slug** (kebab-case), e.g. `citas-module`, `ventas-pos-v2`.

## Commands

| Command | What it does |
|---------|-------------|
| `/sdd-new <name>` | Start a new change: exploration → proposal |
| `/sdd-ff <name>` | Fast-forward: proposal → spec → design → tasks |
| `/sdd-continue [name]` | Run the next pending phase |
| `/sdd-apply [name]` | Implement tasks from spec+design |
| `/sdd-verify [name]` | Validate implementation vs spec |
| `/sdd-archive [name]` | Close change, persist final report |

## Important

- Do **not** delete or modify `sdd-init.md` manually unless the project structure changes significantly.
- Do **not** edit artifact files mid-phase — they are owned by the phase that created them.
- The `apply-progress.md` file is cumulative — each apply batch merges, never overwrites.
