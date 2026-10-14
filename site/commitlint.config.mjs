// Conventional Commits, com as regras do AGENTS.md: tipos em português do fluxo e assunto em minúsculas.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "test", "chore", "data", "style", "refactor", "perf", "ci", "build"],
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
