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
  tagFormat: 'client-v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { scope: 'client', release: 'patch' },
          { scope: 'ui', release: 'patch' },
          { scope: 'render', release: 'patch' },
          { scope: 'interaction', release: 'patch' },
          { scope: 'domain-client', release: 'patch' },
          { scope: 'deps-client', release: 'patch' },
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
        changelogFile: 'CHANGELOG.client.md'
      }
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.client.md'],
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
