const releaseNotesPresetConfig = {
  types: [
    { type: 'feat', section: 'Features', effect: 'changelog' },
    { type: 'fix', section: 'Bug Fixes', effect: 'changelog' },
    { type: 'perf', section: 'Performance Improvements', effect: 'changelog' },
    { type: 'revert', section: 'Reverts', effect: 'changelog' },
    { type: 'docs', section: 'Documentation', effect: 'changelog' },
    { type: 'refactor', section: 'Code Refactoring', effect: 'changelog' },
    { type: 'test', section: 'Tests', effect: 'changelog' },
    { type: 'ci', section: 'Continuous Integration', effect: 'changelog' },
    { type: 'build', section: 'Build System', effect: 'changelog' },
    { type: 'chore', section: 'Miscellaneous Chores', effect: 'changelog' }
  ]
};

module.exports = {
  branches: ['main'],
  repositoryUrl: 'https://github.com/dkirby-ms/zzyix.git',
  tagFormat: 'server-v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { scope: 'server', release: 'patch' },
          { scope: 'db', release: 'patch' },
          { scope: 'jobs', release: 'patch' },
          { scope: 'api', release: 'patch' },
          { scope: 'domain-server', release: 'patch' },
          { scope: 'deps-server', release: 'patch' },
          { scope: 'repo', release: false }
        ],
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING']
        }
      }
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: releaseNotesPresetConfig,
        parserOpts: {
          noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING']
        }
      }
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.server.md'
      }
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.server.md'],
        message: 'chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}'
      }
    ],
    [
      '@semantic-release/github',
      {
        successComment: false,
        failComment: false,
        releasedLabels: false
      }
    ]
  ]
};
