# Experimental Curriculum

- `source_snapshot/` keeps verbatim copies of the live `src/data/*.json` files for reference.
- `master/` is the editable source of truth for the experimental curriculum.
- `tiered/` contains the full generated curriculum export.
- `cefr/a2/` and `cefr/b1/` contain generated level-specific exports.

Commands:

- `npm run curriculum:bootstrap`
- `npm run curriculum:build`
- `npm run curriculum:validate`
