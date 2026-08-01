const releaseNotesPresetConfig = {
  types: [
    { type: 'feat', section: 'Features' },
    { type: 'fix', section: 'Bug Fixes' },
    { type: 'perf', section: 'Performance Improvements' },
    { type: 'revert', section: 'Reverts' },
    { type: 'docs', section: 'Documentation' },
    { type: 'refactor', section: 'Code Refactoring' },
    { type: 'test', section: 'Tests' },
    { type: 'ci', section: 'Continuous Integration' },
    { type: 'build', section: 'Build System' },
    { type: 'chore', section: 'Miscellaneous Chores' }
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
