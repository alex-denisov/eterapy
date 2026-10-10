# ETerapy web workspace

Resolve paths relative to this file. The normal local contract is ../AGENTS.md
and ../docs/agents/. Use that entry point when present; it routes to the current
board and ticket. Do not clone a second contract when the local one is available.

For a cloud/fresh checkout without private docs, first use any existing configured
eterapy-docs checkout (the private alex-denisov/eterapy-docs repository). If none is
available, retrieve that repository through the available authorized Git mechanism
into a non-existing destination beside the project, then read its root AGENTS.md.
Never overwrite an existing directory or infer an authentication cause from a generic
clone failure. Report the actual missing contract/access if retrieval fails; continue
independent inspection but do not guess deployment/security instructions.

B340 keeps private docs out of the public product repo. Edit tracker state in the
resolved canonical docs location. Push private docs only when that delivery is in
scope or covered by a standing mandate. No contract is copied into this stub.
