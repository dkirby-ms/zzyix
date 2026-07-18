module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'client',
        'server',
        'ui',
        'render',
        'interaction',
        'domain-client',
        'domain-server',
        'db',
        'jobs',
        'api',
        'deps',
        'deps-dev',
        'deps-client',
        'deps-server',
        'repo',
        'ci',
        'infra',
        'docs',
        'scripts',
        'release'
      ]
    ],
    'subject-case': [0]
  }
};
