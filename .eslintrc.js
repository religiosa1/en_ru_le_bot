module.exports = {
    "env": {
        "commonjs": true,
        "es6": true,
        "node": true,
    },
    "extends": ["eslint:recommended", "plugin:promise/recommended"],
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly",
    },
    "parserOptions": {
        "ecmaVersion": 2018
    },
    "rules": {
        "indent": [
            "error",
            2
        ],
        "quotes": [
            "warn",
            "double"
        ],
        "semi": [
            "error",
            "always"
        ],
        "comma-dangle": ["warn", "always-multiline"],
    }
};
