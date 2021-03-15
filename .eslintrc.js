/* eslint-disable */
module.exports = {
  "env": {
    "es6": true,
    "node": true,
    "jest/globals": true,
  },
  "parserOptions": {
    "ecmaVersion": 2018
  },
  "plugins": [
    "@typescript-eslint",
    "jest",
  ],
  overrides: [{
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
      "project": "./tsconfig.json"
    },
    "files": "*.ts",
    "extends": [
      "eslint:recommended",
      // "plugin:promise/recommended",
      // "plugin:jest/recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:@typescript-eslint/recommended-requiring-type-checking",
    ],
    "globals": {
      "Atomics": "readonly",
      "SharedArrayBuffer": "readonly",
    },
    "rules": {
      "indent": [
        "error",
        2
      ],
      "quotes": [
        "warn",
        "double",
      ],
      "semi": [
        "error",
        "always"
      ],
      "comma-dangle": "off",
      "@typescript-eslint/no-explicit-any": [ "warn", { "ignoreRestArgs": true } ],
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-misused-promises": [ "error", { "checksVoidReturn": false } ],
    }
  }]
};
