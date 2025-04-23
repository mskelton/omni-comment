import mskelton from "@mskelton/eslint-config"

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...mskelton.recommended,
  {
    ...mskelton.vitest,
    files: ["**/__tests__/**/*.{spec,test}.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"],
    rules: {
      "vitest/padding-around-all": "off",
      "vitest/padding-around-expect": "off",
    },
  },
  {
    ignores: ["dist/**", "lib/**"],
  },
]
