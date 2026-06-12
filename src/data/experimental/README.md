# Experimental Curriculum

- `master/` is the editable source of truth for the experimental curriculum.
- `tiered/` contains the full generated curriculum export.
- `cefr/a2/` and `cefr/b1/` contain generated level-specific exports.

Commands:

- `npm run curriculum:bootstrap` — regenerates `master/` from the in-script word banks; aborts if `master/` has uncommitted changes (use `--force` to override)
- `npm run curriculum:build`
- `npm run curriculum:validate`
