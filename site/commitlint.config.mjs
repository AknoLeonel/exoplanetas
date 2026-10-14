// Conventional Commits, com as regras do AGENTS.md. O assunto não pode começar com maiúscula (regra padrão
// de subject-case), mas siglas no meio, como NASA e CI, são permitidas.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "test", "chore", "data", "style", "refactor", "perf", "ci", "build"],
    ],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
