const releaseNotesPresetConfig = {
  types: [
    { type: 'feat', section: 'Features', hidden: false },
    { type: 'fix', section: 'Bug Fixes', hidden: false },
    { type: 'perf', section: 'Performance Improvements', hidden: false },
    { type: 'revert', section: 'Reverts', hidden: false },
    { type: 'docs', section: 'Documentation', hidden: false },
    { type: 'refactor', section: 'Code Refactoring', hidden: false },
    { type: 'test', section: 'Tests', hidden: false },
    { type: 'ci', section: 'Continuous Integration', hidden: false },
    { type: 'build', section: 'Build System', hidden: false },
    { type: 'chore', section: 'Miscellaneous Chores', hidden: false }
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
