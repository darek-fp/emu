# emu

10xDev - course project

## Copilot post-file-edit hook

This repository includes a GitHub Copilot hook that runs ESLint after file-edit tool calls (`edit`, `create`, `apply_patch`, `str_replace_editor`).

Command:

`npx eslint --fix . --quiet`

- config: `.github/hooks/post-file-edit.json`
