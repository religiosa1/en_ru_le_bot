const defaultConf = {
  use_env_variable: "DB_CONNECTION_STRING",
  logging: false,
};

module.exports = {
  development: Object.assign({}, defaultConf),
  test: Object.assign({}, defaultConf),
  production: Object.assign({}, defaultConf),
};
